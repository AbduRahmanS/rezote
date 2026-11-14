// The skeleton runtime. An app declares its event schemas and a pure projection;
// the runtime handles storage, encryption, sync, status, sharing, and joining.

import { computed, signal, type ReadonlySignal } from "@preact/signals";
import * as v from "valibot";
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
import { httpTransport, SyncEngine, type SpaceRecord, type SyncTransport } from "./sync.ts";

export type EventSchemas = Record<string, v.GenericSchema>;

export type AppEvent<M extends EventSchemas> = {
  [K in keyof M & string]: RezoteEvent<K, v.InferOutput<M[K]>>;
}[keyof M & string];

export type PayloadOf<M extends EventSchemas, K extends keyof M> = v.InferInput<M[K]>;

export interface AppDefinition<M extends EventSchemas, V> {
  /** Short name, also the IndexedDB name and the server's app tag. */
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

/** Validates and decodes an envelope against an app definition. Shared by the runtime and Node tools. */
export async function decodeEnvelope<M extends EventSchemas>(
  def: AppDefinition<M, unknown>,
  envelope: Envelope,
  keys: SpaceKeys,
): Promise<AppEvent<M> | null> {
  const opened = await open(envelope, keys, (def.writersOnly ?? {}) as WritersOnlyFields);
  if (!opened.ok) return null;
  const schema = def.events[opened.event.type];
  if (!schema) return null;
  const parsed = v.safeParse(schema, opened.event.payload);
  if (!parsed.success) return null;
  return { ...opened.event, payload: parsed.output } as AppEvent<M>;
}

export interface RuntimeOptions {
  serverUrl: string;
  /** Base URL used in share links. Defaults to the current page without its fragment. */
  appUrl?: string;
  transport?: SyncTransport;
  autoStart?: boolean;
}

export class RezoteApp<M extends EventSchemas, V> {
  readonly ready = signal(false);
  readonly spaces = signal<SpaceRecord[]>([]);
  readonly currentId = signal<string | null>(null);
  readonly lastJoin = signal<{ space: string; write: boolean } | null>(null);
  readonly rejected = signal<RejectedItem[]>([]);

  readonly current: ReadonlySignal<SpaceRecord | null>;
  readonly view: ReadonlySignal<V | null>;
  readonly events: ReadonlySignal<readonly AppEvent<M>[]>;

  private storage!: Storage;
  private engine!: SyncEngine;
  private device = "";
  private readonly cache = new Map<string, AppEvent<M>[]>();
  private readonly keys = new Map<string, Promise<SpaceKeys>>();
  private readonly version = signal(0);

  constructor(
    readonly def: AppDefinition<M, V>,
    private readonly options: RuntimeOptions,
  ) {
    this.current = computed(() => this.spaces.value.find((s) => s.id === this.currentId.value) ?? null);
    this.events = computed(() => {
      void this.version.value; // subscribe: bumped whenever the event cache changes
      const id = this.currentId.value;
      return id ? (this.cache.get(id) ?? []) : [];
    });
    this.view = computed(() => (this.currentId.value ? this.def.project(this.events.value) : null));
  }

  get status() {
    return this.engine.status;
  }

  get ghosts() {
    return this.engine.ghosts;
  }

  get deviceId(): string {
    return this.device;
  }

  isGhost(eventId: string): boolean {
    return this.engine.ghosts.value.has(eventId);
  }

  canWrite(space = this.currentId.value): boolean {
    return !!this.spaces.value.find((s) => s.id === space)?.write;
  }

  async init(): Promise<void> {
    this.storage = await Storage.open(this.def.name);
    this.device = (await this.storage.getMeta<string>("device")) ?? randomBase64Url(12);
    await this.storage.setMeta("device", this.device);
    this.spaces.value = (await this.storage.getMeta<SpaceRecord[]>("spaces")) ?? [];

    this.engine = new SyncEngine({
      storage: this.storage,
      transport: this.options.transport ?? httpTransport(this.options.serverUrl),
      spaces: () => this.spaces.value,
      markRegistered: async (id) => this.updateSpace(id, { registered: true }),
      decode: async (envelope) => {
        const keys = this.keysFor(envelope.space);
        return keys ? decodeEnvelope(this.def, envelope, await keys) : null;
      },
      onChange: (space) => void this.reload(space),
    });

    let ignored = 0;
    for (const s of this.spaces.value) ignored += (await this.storage.getMeta<number>(`ignored:${s.id}`)) ?? 0;
    this.engine.status.value = { ...this.engine.status.value, ignored };

    const joined = typeof location !== "undefined" ? parseLink(location.hash) : null;
    if (joined) {
      await this.join(joined);
      history.replaceState(null, "", `${location.pathname}${location.search}#/`);
    } else {
      const saved = await this.storage.getMeta<string>("current");
      const fallback = this.spaces.value[0]?.id ?? null;
      await this.select(saved && this.spaces.value.some((s) => s.id === saved) ? saved : fallback);
    }

    this.ready.value = true;
    if (this.options.autoStart !== false) this.engine.start();
  }

  /** Runs a sync cycle now and waits for it. */
  syncNow(): Promise<boolean> {
    return this.engine.syncNow();
  }

  triggerSync(): void {
    this.engine.trigger();
  }

  async select(space: string | null): Promise<void> {
    if (space) await this.reload(space);
    this.currentId.value = space;
    await this.storage.setMeta("current", space);
    this.rejected.value = space ? await this.storage.listRejected(space) : [];
  }

  /** Creates a new space on this phone. It is registered on the server at the next sync. */
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
    await this.saveSpaces([...this.spaces.value, record]);
    await this.select(record.id);
    this.engine.trigger();
    return record.id;
  }

  /** Joins a space from a share link. A write link upgrades an existing read-only membership. */
  async join(secrets: SpaceSecrets): Promise<void> {
    const existing = this.spaces.value.find((s) => s.id === secrets.space);
    if (existing) {
      if (secrets.write && !existing.write) {
        this.keys.delete(existing.id);
        await this.updateSpace(existing.id, { write: secrets.write, writeKeyHash: await writeKeyHash(secrets.write), registered: true });
      }
    } else {
      const record: SpaceRecord = {
        id: secrets.space,
        app: this.def.name,
        enc: secrets.enc,
        registered: true,
        joinedAt: Date.now(),
      };
      if (secrets.write) record.write = secrets.write;
      await this.saveSpaces([...this.spaces.value, record]);
    }
    this.lastJoin.value = { space: secrets.space, write: !!secrets.write };
    await this.select(secrets.space);
    this.engine?.trigger();
  }

  links(space = this.currentId.value): ShareLinks | null {
    const s = this.spaces.value.find((x) => x.id === space);
    if (!s) return null;
    const appUrl = this.options.appUrl ?? (typeof location !== "undefined" ? `${location.origin}${location.pathname}` : "");
    const secrets: SpaceSecrets = { space: s.id, enc: s.enc };
    if (s.write) secrets.write = s.write;
    return buildLinks(appUrl, secrets);
  }

  async setLabel(space: string, label: string): Promise<void> {
    const s = this.spaces.value.find((x) => x.id === space);
    if (s && s.label !== label) await this.updateSpace(space, { label });
  }

  /** Removes a space from this phone only. Data stays on the server and on other phones. */
  async leave(space: string): Promise<void> {
    await this.saveSpaces(this.spaces.value.filter((s) => s.id !== space));
    this.cache.delete(space);
    this.keys.delete(space);
    if (this.currentId.value === space) await this.select(this.spaces.value[0]?.id ?? null);
  }

  /** Validates, encrypts, stores, and queues a new event, then triggers a sync. */
  async emit<K extends keyof M & string>(type: K, payload: PayloadOf<M, K>, space = this.currentId.value): Promise<AppEvent<M>> {
    if (!space) throw new Error("No space selected");
    if (!this.canWrite(space)) throw new Error("Lecture seule : ce lien ne permet pas d'écrire");
    const schema = this.def.events[type];
    if (!schema) throw new Error(`Unknown event type ${type}`);
    const parsed = v.parse(schema, payload);
    const event = {
      id: crypto.randomUUID(),
      space,
      type,
      payload: parsed,
      ts: Date.now(),
      device: this.device,
    } as AppEvent<M>;
    const keys = await this.keysFor(space)!;
    const envelope = await seal(event, keys, (this.def.writersOnly ?? {}) as WritersOnlyFields);
    await this.storage.appendLocal(event, envelope);
    const list = this.cache.get(space) ?? [];
    list.push(event);
    this.cache.set(space, canonical(list));
    this.version.value++;
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

  private keysFor(space: string): Promise<SpaceKeys> | undefined {
    let keys = this.keys.get(space);
    if (!keys) {
      const s = this.spaces.value.find((x) => x.id === space);
      if (!s) return undefined;
      const secrets: SpaceSecrets = { space: s.id, enc: s.enc };
      if (s.write) secrets.write = s.write;
      keys = importKeys(secrets);
      this.keys.set(space, keys);
    }
    return keys;
  }

  private async reload(space: string): Promise<void> {
    const events = (await this.storage.listEvents(space)) as AppEvent<M>[];
    this.cache.set(space, canonical(events));
    if (space === this.currentId.value) this.rejected.value = await this.storage.listRejected(space);
    this.version.value++;
  }

  private async updateSpace(id: string, patch: Partial<SpaceRecord>): Promise<void> {
    await this.saveSpaces(this.spaces.value.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  private async saveSpaces(spaces: SpaceRecord[]): Promise<void> {
    this.spaces.value = spaces;
    await this.storage.setMeta("spaces", spaces);
  }
}

export function createApp<M extends EventSchemas, V>(def: AppDefinition<M, V>, options: RuntimeOptions): RezoteApp<M, V> {
  return new RezoteApp(def, options);
}
