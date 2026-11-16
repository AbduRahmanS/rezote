// Carnet de route events. Amounts are integer FCFA; fuel volumes are integer centiliters.

import { z } from "zod";

const MIN_TIME = Date.UTC(2020, 0, 1);
const MAX_TIME = Date.UTC(2100, 0, 1);

const id = z.string().min(1).max(64);
const text = (max: number) => z.string().trim().min(1).max(max);
const at = z.number().int().min(MIN_TIME).max(MAX_TIME);
const fcfa = z.number().int().min(0).max(1_000_000_000);
const km = z.number().int().min(0).max(10_000_000);

export const CORRIDORS = {
  "dakar-moussala": "Dakar → Bamako via Kédougou–Moussala",
  "dakar-kidira": "Dakar → Bamako via Kidira–Kayes",
  "abidjan-zegoua": "Abidjan → Bamako via Pogo–Zégoua",
  other: "Autre itinéraire",
} as const;

export const KINDS = {
  fuel: { label: "Carburant", emoji: "⛽" },
  checkpoint: { label: "Contrôle", emoji: "🛑" },
  weighbridge: { label: "Pesage", emoji: "⚖️" },
  customs: { label: "Douane", emoji: "🛃" },
  border: { label: "Frontière", emoji: "🚧" },
  convoy: { label: "Attente d'escorte", emoji: "🪖" },
  toll: { label: "Péage", emoji: "🎫" },
  meal: { label: "Repas", emoji: "🍲" },
  repair: { label: "Réparation", emoji: "🔧" },
  breakdown: { label: "Panne", emoji: "⚠️" },
  rest: { label: "Repos", emoji: "😴" },
  loading: { label: "Chargement", emoji: "📦" },
  unloading: { label: "Déchargement", emoji: "📤" },
  other: { label: "Autre", emoji: "📝" },
} as const;

export type Kind = keyof typeof KINDS;

/** Stops that last a while: the driver taps "resume" when the truck leaves. */
export const RESUMABLE: ReadonlySet<Kind> = new Set<Kind>(["customs", "border", "convoy", "breakdown", "repair", "rest"]);

const kind = z.enum(Object.keys(KINDS) as [Kind, ...Kind[]]);
const corridor = z.enum(Object.keys(CORRIDORS) as [keyof typeof CORRIDORS, ...(keyof typeof CORRIDORS)[]]);

export const Position = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracyM: z.number().min(0).max(100_000),
});

export const events = {
  "route/truck.registered": z.object({
    plate: text(20),
    name: text(60),
  }),
  "route/trip.started": z.object({
    tripId: id,
    from: text(60),
    to: text(60),
    corridor,
    cargo: text(120),
    advance: fcfa,
    odometerKm: km.optional(),
    at,
  }),
  "route/entry.recorded": z.object({
    entryId: id,
    tripId: id,
    kind,
    place: text(80),
    amount: fcfa.optional(),
    volumeCl: z.number().int().min(1).max(500_000).optional(),
    pricePerLiter: z.number().int().min(1).max(100_000).optional(),
    odometerKm: km.optional(),
    note: z.string().trim().max(300).optional(),
    /** Writers only: never visible with the read link, never in shared summaries. */
    position: Position.optional(),
    at,
  }),
  "route/stop.resumed": z.object({
    entryId: id,
    at,
  }),
  "route/advance.added": z.object({
    advanceId: id,
    tripId: id,
    amount: fcfa.min(1),
    method: z.enum(["cash", "mobile_money"]),
    at,
  }),
  "route/trip.ended": z.object({
    tripId: id,
    place: text(60),
    odometerKm: km.optional(),
    at,
  }),
  "route/item.cancelled": z.object({
    itemId: id,
    reason: text(200),
  }),
};

export const writersOnly = { "route/entry.recorded": ["position"] } as const;

export type RouteEvents = typeof events;

/** Fuel amount as on a pump receipt: rounded per fill-up. */
export function fuelAmount(volumeCl: number, pricePerLiter: number): number {
  return Math.round((volumeCl * pricePerLiter) / 100);
}
