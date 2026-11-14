// Local storage in IndexedDB. Every event is written here before any network
// request, so a dropped connection never loses work.

import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Envelope, RezoteEvent } from "./event.ts";

export interface OutboxItem {
  id: string;
  space: string;
  envelope: Envelope;
}

export interface RejectedItem {
  id: string;
  space: string;
  reason: string;
  type: string;
}

interface RezoteDB extends DBSchema {
  events: { key: string; value: RezoteEvent; indexes: { space: string } };
  outbox: { key: string; value: OutboxItem; indexes: { space: string } };
  rejected: { key: string; value: RejectedItem; indexes: { space: string } };
  meta: { key: string; value: unknown };
}

export class Storage {
  private constructor(private readonly db: IDBPDatabase<RezoteDB>) {}

  static async open(appName: string): Promise<Storage> {
    const db = await openDB<RezoteDB>(`rezote-${appName}`, 1, {
      upgrade(db) {
        db.createObjectStore("events", { keyPath: "id" }).createIndex("space", "space");
        db.createObjectStore("outbox", { keyPath: "id" }).createIndex("space", "space");
        db.createObjectStore("rejected", { keyPath: "id" }).createIndex("space", "space");
        db.createObjectStore("meta");
      },
    });
    return new Storage(db);
  }

  close(): void {
    this.db.close();
  }

  /** Stores a new local event and queues its envelope in one transaction. */
  async appendLocal(event: RezoteEvent, envelope: Envelope): Promise<void> {
    const tx = this.db.transaction(["events", "outbox"], "readwrite");
    await Promise.all([
      tx.objectStore("events").put(event),
      tx.objectStore("outbox").put({ id: event.id, space: event.space, envelope }),
      tx.done,
    ]);
  }

  /** Stores events received from the server. */
  async putRemote(events: RezoteEvent[]): Promise<void> {
    if (events.length === 0) return;
    const tx = this.db.transaction("events", "readwrite");
    await Promise.all([...events.map((e) => tx.store.put(e)), tx.done]);
  }

  listEvents(space: string): Promise<RezoteEvent[]> {
    return this.db.getAllFromIndex("events", "space", space);
  }

  async outbox(space: string, limit: number): Promise<OutboxItem[]> {
    return this.db.getAllFromIndex("outbox", "space", space, limit);
  }

  async outboxIds(): Promise<Set<string>> {
    return new Set(await this.db.getAllKeys("outbox"));
  }

  async removeFromOutbox(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const tx = this.db.transaction("outbox", "readwrite");
    await Promise.all([...ids.map((id) => tx.store.delete(id)), tx.done]);
  }

  /** Moves events refused by the server out of the outbox so they are not retried. */
  async reject(items: RejectedItem[]): Promise<void> {
    if (items.length === 0) return;
    const tx = this.db.transaction(["outbox", "rejected"], "readwrite");
    await Promise.all([
      ...items.map((r) => tx.objectStore("outbox").delete(r.id)),
      ...items.map((r) => tx.objectStore("rejected").put(r)),
      tx.done,
    ]);
  }

  listRejected(space: string): Promise<RejectedItem[]> {
    return this.db.getAllFromIndex("rejected", "space", space);
  }

  async getMeta<T>(key: string): Promise<T | undefined> {
    return (await this.db.get("meta", key)) as T | undefined;
  }

  async setMeta(key: string, value: unknown): Promise<void> {
    await this.db.put("meta", value, key);
  }

  /**
   * Atomically increments a counter and returns the new value. A crash after this
   * call can skip a number, but a number is never handed out twice on one device.
   */
  async nextCounter(key: string): Promise<number> {
    const tx = this.db.transaction("meta", "readwrite");
    const current = ((await tx.store.get(key)) as number | undefined) ?? 0;
    const next = current + 1;
    await tx.store.put(next, key);
    await tx.done;
    return next;
  }
}
