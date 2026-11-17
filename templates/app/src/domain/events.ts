// Events are facts that happened. They are never changed or deleted: a
// correction is a new event. Add new event types for new features; never change
// the meaning of an existing one, because old phones still hold old events.
import { z } from "zod";

const id = z.string().min(1).max(64);
const at = z.number().int();

export const events = {
  /** Written once, when the space is created on the first phone. */
  "__SLUG__/space.named": z.object({ title: z.string().trim().min(1).max(60) }),
  /** Amount in integer FCFA (FCFA has no subunits). */
  "__SLUG__/entry.recorded": z.object({
    entryId: id,
    text: z.string().trim().min(1).max(200),
    amount: z.number().int().min(0).max(1_000_000_000).optional(),
    at,
  }),
  "__SLUG__/entry.cancelled": z.object({ entryId: id, reason: z.string().trim().min(1).max(200) }),
};

export type StarterEvents = typeof events;

/**
 * Fields that only people with the write link can read (for example a GPS
 * position). They must be optional in the schema. None in the starter app.
 */
export const writersOnly = {} as const;
