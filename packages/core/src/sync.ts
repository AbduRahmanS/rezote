// Sync engine: pushes the outbox and pulls new events for every joined space.
//
// Cycle per space: register the space if needed, push the outbox in batches of
// 500, then pull everything after the stored cursor. Network errors, 429, and
// 5xx responses back off at 2, 4, 8 s and so on, capped at 5 minutes. Events the
// server refuses with another 4xx are moved to "rejected" and not retried.

import { Store } from "@tanstack/store";
import type { Envelope, RezoteEvent } from "./event.ts";
import type { Storage } from "./storage.ts";

export const BATCH_SIZE = 500;
export const MAX_BACKOFF_MS = 5 * 60_000;
export const POLL_INTERVAL_MS = 30_000;

export interface PushResult {
  accepted: string[];
  rejected: { id: string; reason: string }[];
}

export interface PullResult {
  events: Envelope[];
  cursor: number;
  more: boolean;
}

export interface SyncTransport {
  createSpace(req: { id: string; app: string; writeKeyHash: string }): Promise<void>;
  push(space: string, writeKey: string, envelopes: Envelope[]): Promise<PushResult>;
  pull(space: string, after: number, limit: number): Promise<PullResult>;
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
  get retryable(): boolean {
    return this.status === 408 || this.status === 429 || this.status >= 500;
  }
}

export function httpTransport(baseUrl: string, timeoutMs = 20_000): SyncTransport {
  const base = baseUrl.replace(/\/$/, "");
  async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${base}${path}`, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) {
      let message = res.statusText;
      try {
        message = ((await res.json()) as { error?: string }).error ?? message;
      } catch {
        // keep status text
      }
      throw new HttpError(res.status, message);
    }
    return (await res.json()) as T;
  }
  return {
    async createSpace(req) {
      await call("/spaces", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(req) });
    },
    push(space, writeKey, envelopes) {
      return call(`/spaces/${space}/events`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${writeKey}` },
        body: JSON.stringify({ events: envelopes }),
      });
    },
    pull(space, after, limit) {
      return call(`/spaces/${space}/events?after=${after}&limit=${limit}`);
    },
  };
}

export interface SpaceRecord {
  id: string;
  app: string;
  enc: string;
  write?: string;
  /** True once the server has confirmed the space exists. */
  registered: boolean;
  writeKeyHash?: string;
  label?: string;
  joinedAt: number;
}

export interface SyncStatus {
  online: boolean;
  syncing: boolean;
  pending: number;
  ignored: number;
  lastSyncAt?: number;
  lastError?: string;
}

export interface SyncDeps {
  storage: Storage;
  transport: SyncTransport;
  spaces: () => SpaceRecord[];
  markRegistered: (space: string) => Promise<void>;
  /** Decrypts and validates an envelope; null if it must be ignored. */
  decode: (envelope: Envelope) => Promise<RezoteEvent | null>;
  /** Called after new events were stored for a space, or the outbox changed. */
  onChange: (space: string) => void;
  now?: () => number;
  isOnline?: () => boolean;
}

export class SyncEngine {
  /** Connection state and counters, for the status bar. */
  readonly status = new Store<SyncStatus>({ online: true, syncing: false, pending: 0, ignored: 0 });
  /** IDs of local events still in the outbox (shown as 👻). */
  readonly ghosts = new Store<ReadonlySet<string>>(new Set<string>());

  private running: Promise<void> | null = null;
  private again = false;
  private backoffMs = 0;
  private retryAt = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private interval: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly deps: SyncDeps) {}

  private now(): number {
    return this.deps.now?.() ?? Date.now();
  }

  private online(): boolean {
    if (this.deps.isOnline) return this.deps.isOnline();
    const nav = (globalThis as { navigator?: { onLine?: boolean } }).navigator;
    return nav?.onLine ?? true;
  }

  /** Starts automatic sync: on the browser "online" event and every 30 s. */
  start(): void {
    this.patch({ online: this.online() });
    const win = globalThis as { addEventListener?: (type: string, fn: () => void) => void };
    if (win.addEventListener) {
      win.addEventListener("online", () => {
        this.patch({ online: true });
        this.retryAt = 0;
        this.trigger();
      });
      win.addEventListener("offline", () => this.patch({ online: false }));
    }
    this.interval = setInterval(() => this.trigger(), POLL_INTERVAL_MS);
    void this.refreshGhosts();
    this.trigger();
  }

  stop(): void {
    clearInterval(this.interval);
    clearTimeout(this.timer);
  }

  /** Requests a sync as soon as possible. Safe to call often. */
  trigger(): void {
    if (this.running) {
      this.again = true;
      return;
    }
    const wait = this.retryAt - this.now();
    if (wait > 0) {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.trigger(), wait);
      return;
    }
    this.running = this.runCycle().finally(() => {
      this.running = null;
      if (this.again) {
        this.again = false;
        this.trigger();
      }
    });
  }

  /** Runs one full cycle and resolves when it is done. Used by tests and the demo seed. */
  async syncNow(): Promise<boolean> {
    if (this.running) await this.running;
    return this.cycle();
  }

  async refreshGhosts(): Promise<void> {
    const ids = await this.deps.storage.outboxIds();
    this.ghosts.setState(() => ids);
    this.patch({ pending: ids.size });
  }

  private patch(p: Partial<SyncStatus>): void {
    this.status.setState((prev) => ({ ...prev, ...p }));
  }

  private async runCycle(): Promise<void> {
    const ok = await this.cycle();
    if (ok) {
      this.backoffMs = 0;
      this.retryAt = 0;
    } else {
      this.backoffMs = this.backoffMs === 0 ? 2000 : Math.min(this.backoffMs * 2, MAX_BACKOFF_MS);
      this.retryAt = this.now() + this.backoffMs;
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.trigger(), this.backoffMs);
    }
  }

  /** One pass over all spaces. Returns false if a retryable error happened. */
  private async cycle(): Promise<boolean> {
    if (!this.online()) {
      this.patch({ online: false });
      await this.refreshGhosts();
      return true; // the "online" event will trigger the next attempt
    }
    this.patch({ syncing: true, online: true });
    let ok = true;
    let error: string | undefined;
    for (const space of this.deps.spaces()) {
      try {
        await this.syncSpace(space);
      } catch (e) {
        ok = false;
        error = e instanceof Error ? e.message : String(e);
        if (e instanceof HttpError && !e.retryable) ok = true; // permanent problem; do not hammer the server
      }
    }
    await this.refreshGhosts();
    this.patch(ok && !error ? { syncing: false, lastSyncAt: this.now(), lastError: undefined } : { syncing: false, lastError: error });
    return ok;
  }

  private async syncSpace(space: SpaceRecord): Promise<void> {
    const { storage, transport } = this.deps;
    if (space.write && !space.registered && space.writeKeyHash) {
      await transport.createSpace({ id: space.id, app: space.app, writeKeyHash: space.writeKeyHash });
      await this.deps.markRegistered(space.id);
      space.registered = true;
    }

    // Push
    if (space.write && space.registered) {
      for (;;) {
        const batch = await storage.outbox(space.id, BATCH_SIZE);
        if (batch.length === 0) break;
        let result: PushResult;
        try {
          result = await transport.push(space.id, space.write, batch.map((b) => b.envelope));
        } catch (e) {
          if (e instanceof HttpError && !e.retryable) {
            await storage.reject(batch.map((b) => ({ id: b.id, space: space.id, reason: e.message, type: "" })));
            this.deps.onChange(space.id);
          }
          throw e;
        }
        await storage.removeFromOutbox(result.accepted);
        await storage.reject(result.rejected.map((r) => ({ id: r.id, space: space.id, reason: r.reason, type: "" })));
        this.deps.onChange(space.id);
        if (result.accepted.length + result.rejected.length === 0) break; // server made no progress; avoid a loop
      }
    }

    // Pull
    const cursorKey = `cursor:${space.id}`;
    let cursor = (await storage.getMeta<number>(cursorKey)) ?? 0;
    for (;;) {
      const page = await transport.pull(space.id, cursor, BATCH_SIZE);
      const events: RezoteEvent[] = [];
      let ignored = 0;
      for (const envelope of page.events) {
        const event = await this.deps.decode(envelope);
        if (event) events.push(event);
        else ignored++;
      }
      await storage.putRemote(events);
      if (ignored > 0) {
        const key = `ignored:${space.id}`;
        const total = ((await storage.getMeta<number>(key)) ?? 0) + ignored;
        await storage.setMeta(key, total);
        this.patch({ ignored: this.status.get().ignored + ignored });
      }
      cursor = page.cursor;
      await storage.setMeta(cursorKey, cursor);
      if (events.length > 0 || ignored > 0) this.deps.onChange(space.id);
      if (!page.more) break;
    }
  }
}
