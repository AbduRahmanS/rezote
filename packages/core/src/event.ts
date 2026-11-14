// Event model and deterministic replay.
//
// Apps never update or delete records. Every action appends an immutable event,
// and app state is computed by replaying the events of a space. Replay order is
// (ts, id), which is total and identical on every device, so the same set of
// events always gives the same state, whatever order the events arrived in.

export interface RezoteEvent<T extends string = string, P = unknown> {
  /** Globally unique ID, crypto.randomUUID(). */
  id: string;
  /** Space ID (22-char base64url). */
  space: string;
  type: T;
  payload: P;
  /** Device clock, ms since epoch, when the event was created. */
  ts: number;
  /** Random ID of the device that created the event. */
  device: string;
  /** Server sequence number, set once the server has stored the event. */
  seq?: number;
  /** Server clock (ms) when the server first stored the event. */
  receivedAt?: number;
}

/** What the server stores and returns: everything except the envelope fields is encrypted. */
export interface Envelope {
  id: string;
  space: string;
  ts: number;
  device: string;
  /** 96-bit AES-GCM nonce, base64url. */
  iv: string;
  /** AES-GCM ciphertext of JSON { type, payload }, base64url. */
  ct: string;
  seq?: number;
  receivedAt?: number;
}

export function compareEvents(a: Pick<RezoteEvent, "ts" | "id">, b: Pick<RezoteEvent, "ts" | "id">): number {
  if (a.ts !== b.ts) return a.ts - b.ts;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Returns the events sorted in replay order with duplicate IDs removed.
 * When the same ID appears twice, the copy carrying server metadata wins, so a
 * synced copy is never replaced by an unsynced one.
 */
export function canonical<E extends RezoteEvent>(events: Iterable<E>): E[] {
  const byId = new Map<string, E>();
  for (const e of events) {
    const existing = byId.get(e.id);
    if (!existing || (existing.seq === undefined && e.seq !== undefined)) byId.set(e.id, e);
  }
  return [...byId.values()].sort(compareEvents);
}

/** Union of two event sets. Commutative, associative, and idempotent on event IDs. */
export function mergeEvents<E extends RezoteEvent>(a: Iterable<E>, b: Iterable<E>): E[] {
  return canonical([...a, ...b]);
}

/** Sorts a list by a business time `at`, then by replay order. Used for timelines. */
export function byAt<T extends { at: number; ts: number; id: string }>(a: T, b: T): number {
  if (a.at !== b.at) return a.at - b.at;
  return compareEvents(a, b);
}
