// The projection: a pure function from the events to what the screens show.
// The skeleton passes the events sorted by (ts, id) without duplicates, so every
// phone with the same events shows the same result.
import type { AppEvent } from "@rezote/core";
import type { StarterEvents } from "./events.ts";

export interface Entry {
  id: string;
  text: string;
  /** Integer FCFA, or null when no amount was given. */
  amount: number | null;
  at: number;
  /** ID of the event that recorded the entry, for GhostMark. */
  eventId: string;
}

export interface StarterView {
  title: string | null;
  /** Entries that are not cancelled, newest first. */
  entries: Entry[];
  /** Sum of the listed amounts, in FCFA. Integers only: nothing is rounded. */
  total: number;
  cancelled: number;
}

export function project(events: readonly AppEvent<StarterEvents>[]): StarterView {
  // First pass: cancellations, so one that arrives before its entry still applies.
  const cancelled = new Set<string>();
  for (const e of events) if (e.type === "__SLUG__/entry.cancelled") cancelled.add(e.payload.entryId);

  let title: string | null = null;
  const entries = new Map<string, Entry & { ts: number }>();
  for (const e of events) {
    if (e.type === "__SLUG__/space.named") title = e.payload.title;
    if (e.type === "__SLUG__/entry.recorded" && !entries.has(e.payload.entryId)) {
      const p = e.payload;
      entries.set(p.entryId, { id: p.entryId, text: p.text, amount: p.amount ?? null, at: p.at, eventId: e.id, ts: e.ts });
    }
  }

  const listed = [...entries.values()]
    .filter((x) => !cancelled.has(x.id))
    .sort((a, b) => b.at - a.at || b.ts - a.ts || (a.eventId < b.eventId ? 1 : -1))
    .map(({ ts: _ts, ...entry }) => entry);
  return {
    title,
    entries: listed,
    total: listed.reduce((sum, x) => sum + (x.amount ?? 0), 0),
    cancelled: [...entries.keys()].filter((id) => cancelled.has(id)).length,
  };
}
