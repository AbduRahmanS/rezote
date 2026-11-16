// The skeleton runtime. An app declares its event schemas (Zod) and a pure
// projection; the runtime handles storage, encryption, sync, status, sharing,
// and joining. State lives in a TanStack Store so React screens can subscribe
// to exactly what they read.

import { Store } from "@tanstack/store";
import type { z } from "zod";
import { randomBase64Url } from "./base64.ts";
import {
  generateSecrets,
  importKeys,
  open,
  seal,
  writeKeyHash,
  type SpaceKeys,
  type SpaceSecrets,
  type WritersOnlyFields,
} from "./crypto.ts";
import { canonical, type Envelope, type RezoteEvent } from "./event.ts";
import { buildLinks, parseLink, type ShareLinks } from "./links.ts";
import { Storage, type RejectedItem } from "./storage.ts";
import { httpTransport, SyncEngine, type SpaceRecord, type SyncStatus, type SyncTransport } from "./sync.ts";

export type EventSchemas = Record<string, z.ZodType>;

export type AppEvent<M extends EventSchemas> = {
  [K in keyof M & string]: RezoteEvent<K, z.output<M[K]>>;
}[keyof M & string];

export type PayloadOf<M extends EventSchemas, K extends keyof M> = z.input<M[K]>;

export interface AppDefinition<M extends EventSchemas, V> {
  /** Short name: the IndexedDB name and the server's app tag. */
  name: string;
  events: M;
  /** Fields only members with the write link can read. They must be optional in the schema. */
  writersOnly?: { readonly [K in keyof M]?: readonly string[] };
  /** Pure function: events (sorted by ts then id, without duplicates) → view. */
  project: (events: readonly AppEvent<M>[]) => V;
}

export function defineApp<M extends EventSchemas, V>(def: AppDefinition<M, V>): AppDefinition<M, V> {
  return def;
}

/** Decrypts and validates an envelope against an app definition. Shared by the runtime and Node tools. */
export async function decodeEnvelope<M extends EventSchemas>(
  def: AppDefinition<M, unknown>,
  envelope: Envelope,
  keys: SpaceKeys,
): Promise<AppEvent<M> | null> {
  const opened = await open(envelope, keys, (def.writersOnly ?? {}) as WritersOnlyFields);
  if (!opened.ok) return null;
  const schema = def.events[opened.event.type];
  if (!schema) return null;
  const parsed = schema.safeParse(opened.event.payload);
  if (!parsed.success) return null;
  return { ...opened.event, payload: parsed.data } as AppEvent<M>;
}

export interface RuntimeOptions {
  /** Base URL of the sync API. Defaults to "/api" on the same origin as the app. */
  apiUrl?: string;
  /** Base URL used in share links. Defaults to the current origin. */
  appUrl?: string;
  transport?: SyncTransport;
  autoStart?: boolean;
}

export interface RuntimeState<M extends EventSchemas> {
  ready: boolean;
  spaces: SpaceRecord[];
  currentId: string | null;
  /** Canonical events of the current space. */
  events: readonly AppEvent<M>[];
  rejected: RejectedItem[];
  lastJoin: { space: string; write: boolean } | null;
}

export class RezoteApp<M extends EventSchemas, V> {
  readonly store = new Store<RuntimeState<M>>({
    ready: false,
    spaces: [],
    currentId: null,
    events: [],
    rejected: [],
    lastJoin: null,
  });

  private storage!: Storage;
  private engine!: SyncEngine;
  private device = "";
  private readonly cache = new Map<string, AppEvent<M>[]>();
  private readonly keys = new Map<string, Promise<SpaceKeys>>();
  private viewCache: { events: readonly AppEvent<M>[]; view: V } | null = null;
  private initPromise: Promise<void> | null = null;

  constructor(
    readonly def: AppDefinition<M, V>,
    private readonly options: RuntimeOptions = {},
  ) {}

  /** Sync status store (online, syncing, pending, ignored, last sync, last error). */
  get status(): Store<SyncStatus> {
    return this.engine.status;
  }

  /** Outbox IDs store: events not yet confirmed by the server. */
  get ghosts(): Store<ReadonlySet<string>> {
    return this.engine.ghosts;
  }

  get deviceId(): string {
    return this.device;
  }

  get state(): RuntimeState<M> {
    return this.store.get();
  }

  get current(): SpaceRecord | null {
    const s = this.store.get();
    return s.spaces.find((x) => x.id === s.currentId) ?? null;
  }

  /** Projection of the current space, recomputed only when its events change. */
  get view(): V | null {
    const { currentId, events } = this.store.get();
    if (!currentId) return null;
    if (this.viewCache?.events !== events) this.viewCache = { events, view: this.def.project(events) };
    return this.viewCache.view;
  }

  isGhost(eventId: string): boolean {
    return this.engine.ghosts.get().has(eventId);
  }

  canWrite(space = this.store.get().currentId): boolean {
    return !!this.store.get().spaces.find((s) => s.id === space)?.write;
  }

  /** Opens storage, joins a space from the URL fragment if present, and starts syncing. Safe to call twice. */
  init(): Promise<void> {
    this.initPromise ??= this.doInit();
    return this.initPromise;
  }

  private async doInit(): Promise<void> {
    this.storage = await Storage.open(this.def.name);
    this.device = (await this.storage.getMeta<string>("device")) ?? randomBase64Url(12);
    await this.storage.setMeta("device", this.device);
    this.patch({ spaces: (await this.storage.getMeta<SpaceRecord[]>("spaces")) ?? [] });

    this.engine = new SyncEngine({
      storage: this.storage,
      transport: this.options.transport ?? httpTransport(this.options.apiUrl ?? "/api"),
      spaces: () => this.store.get().spaces,
      markRegistered: async (id) => this.updateSpace(id, { registered: true }),
      decode: async (envelope) => {
        const keys = this.keysFor(envelope.space);
        return keys ? decodeEnvelope(this.def, envelope, await keys) : null;
      },
      onChange: (space) => void this.reload(space),
    });

    let ignored = 0;
    for (const s of this.store.get().spaces) ignored += (await this.storage.getMeta<number>(`ignored:${s.id}`)) ?? 0;
    this.engine.status.setState((prev) => ({ ...prev, ignored }));

    const joined = typeof location !== "undefined" ? parseLink(location.hash) : null;
    if (joined) {
      await this.join(joined);
      // Remove the keys from the address bar and the browser history.
      history.replaceState(history.state, "", `${location.pathname}${location.search}`);
    } else {
      const saved = await this.storage.getMeta<string>("current");
      const spaces = this.store.get().spaces;
      await this.select(saved && spaces.some((s) => s.id === saved) ? saved : (spaces[0]?.id ?? null));
    }

    this.patch({ ready: true });
    if (this.options.autoStart !== false) this.engine.start();
  }

  syncNow(): Promise<boolean> {
    return this.engine.syncNow();
  }

  triggerSync(): void {
    this.engine.trigger();
  }

  async select(space: string | null): Promise<void> {
    if (space) await this.loadEvents(space);
    await this.storage.setMeta("current", space);
    this.patch({
      currentId: space,
      events: space ? (this.cache.get(space) ?? []) : [],
      rejected: space ? await this.storage.listRejected(space) : [],
    });
  }

  /** Creates a new space on this phone. It is registered on the server at the next sync, so this works offline. */
  async createSpace(label: string): Promise<string> {
    const secrets = generateSecrets();
    const record: SpaceRecord = {
      id: secrets.space,
      app: this.def.name,
      enc: secrets.enc,
      write: secrets.write,
      registered: false,
      writeKeyHash: await writeKeyHash(secrets.write),
      label,
      joinedAt: Date.now(),
    };
    await this.saveSpaces([...this.store.get().spaces, record]);
    await this.select(record.id);
    this.engine.trigger();
    return record.id;
  }

  /** Joins a space from a share link. A write link upgrades an existing read-only membership. */
  async join(secrets: SpaceSecrets): Promise<void> {
    const existing = this.store.get().spaces.find((s) => s.id === secrets.space);
    if (existing) {
      if (secrets.write && !existing.write) {
        this.keys.delete(existing.id);
        await this.updateSpace(existing.id, { write: secrets.write, writeKeyHash: await writeKeyHash(secrets.write), registered: true });
      }
    } else {
      const record: SpaceRecord = { id: secrets.space, app: this.def.name, enc: secrets.enc, registered: true, joinedAt: Date.now() };
      if (secrets.write) record.write = secrets.write;
      await this.saveSpaces([...this.store.get().spaces, record]);
    }
    this.patch({ lastJoin: { space: secrets.space, write: !!secrets.write } });
    await this.select(secrets.space);
    this.engine?.trigger();
  }

  links(space = this.store.get().currentId): ShareLinks | null {
    const s = this.store.get().spaces.find((x) => x.id === space);
    if (!s) return null;
    const appUrl = this.options.appUrl ?? (typeof location !== "undefined" ? `${location.origin}/` : "");
    const secrets: SpaceSecrets = { space: s.id, enc: s.enc };
    if (s.write) secrets.write = s.write;
    return buildLinks(appUrl, secrets);
  }

  async setLabel(space: string, label: string): Promise<void> {
    const s = this.store.get().spaces.find((x) => x.id === space);
    if (s && s.label !== label) await this.updateSpace(space, { label });
  }

  /** Removes a space from this phone only. Data stays on the server and on other phones. */
  async leave(space: string): Promise<void> {
    await this.saveSpaces(this.store.get().spaces.filter((s) => s.id !== space));
    this.cache.delete(space);
    this.keys.delete(space);
    if (this.store.get().currentId === space) await this.select(this.store.get().spaces[0]?.id ?? null);
  }

  /** Validates, encrypts, stores, and queues a new event, then triggers a sync. */
  async emit<K extends keyof M & string>(type: K, payload: PayloadOf<M, K>, space = this.store.get().currentId): Promise<AppEvent<M>> {
    if (!space) throw new Error("Aucun espace sélectionné");
    if (!this.canWrite(space)) throw new Error("Lecture seule : ce lien ne permet pas d'écrire");
    const schema = this.def.events[type];
    if (!schema) throw new Error(`Unknown event type ${type}`);
    const event = {
      id: crypto.randomUUID(),
      space,
      type,
      payload: schema.parse(payload),
      ts: Date.now(),
      device: this.device,
    } as AppEvent<M>;
    const keys = await this.keysFor(space)!;
    const envelope = await seal(event, keys, (this.def.writersOnly ?? {}) as WritersOnlyFields);
    await this.storage.appendLocal(event, envelope);
    this.cache.set(space, canonical([...(this.cache.get(space) ?? []), event]));
    if (space === this.store.get().currentId) this.patch({ events: this.cache.get(space)! });
    await this.engine.refreshGhosts();
    this.engine.trigger();
    return event;
  }

  nextCounter(key: string): Promise<number> {
    return this.storage.nextCounter(`app:${key}`);
  }

  getSetting<T>(key: string): Promise<T | undefined> {
    return this.storage.getMeta<T>(`app:${key}`);
  }

  setSetting(key: string, value: unknown): Promise<void> {
    return this.storage.setMeta(`app:${key}`, value);
  }

  private patch(p: Partial<RuntimeState<M>>): void {
    this.store.setState((prev) => ({ ...prev, ...p }));
  }

  private keysFor(space: string): Promise<SpaceKeys> | undefined {
    let keys = this.keys.get(space);
    if (!keys) {
      const s = this.store.get().spaces.find((x) => x.id === space);
      if (!s) return undefined;
      const secrets: SpaceSecrets = { space: s.id, enc: s.enc };
      if (s.write) secrets.write = s.write;
      keys = importKeys(secrets);
      this.keys.set(space, keys);
    }
    return keys;
  }

  private async loadEvents(space: string): Promise<void> {
    const events = (await this.storage.listEvents(space)) as AppEvent<M>[];
    this.cache.set(space, canonical(events));
  }

  private async reload(space: string): Promise<void> {
    await this.loadEvents(space);
    if (space === this.store.get().currentId) {
      this.patch({ events: this.cache.get(space)!, rejected: await this.storage.listRejected(space) });
    }
  }

  private async updateSpace(id: string, patch: Partial<SpaceRecord>): Promise<void> {
    await this.saveSpaces(this.store.get().spaces.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  private async saveSpaces(spaces: SpaceRecord[]): Promise<void> {
    this.patch({ spaces });
    await this.storage.setMeta("spaces", spaces);
  }
}

export function createApp<M extends EventSchemas, V>(def: AppDefinition<M, V>, options?: RuntimeOptions): RezoteApp<M, V> {
  return new RezoteApp(def, options);
}
