// Carnet de route events. Amounts are integer FCFA; fuel volumes are integer centiliters.

import * as v from "valibot";

const MIN_TIME = Date.UTC(2020, 0, 1);
const MAX_TIME = Date.UTC(2100, 0, 1);

const id = v.pipe(v.string(), v.minLength(1), v.maxLength(64));
const text = (max: number) => v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(max));
const at = v.pipe(v.number(), v.integer(), v.minValue(MIN_TIME), v.maxValue(MAX_TIME));
const fcfa = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(1_000_000_000));
const km = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(10_000_000));

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

const kind = v.picklist(Object.keys(KINDS) as [Kind, ...Kind[]]);
const corridor = v.picklist(Object.keys(CORRIDORS) as [keyof typeof CORRIDORS, ...(keyof typeof CORRIDORS)[]]);

export const Position = v.object({
  lat: v.pipe(v.number(), v.minValue(-90), v.maxValue(90)),
  lng: v.pipe(v.number(), v.minValue(-180), v.maxValue(180)),
  accuracyM: v.pipe(v.number(), v.minValue(0), v.maxValue(100_000)),
});

export const events = {
  "route/truck.registered": v.object({
    plate: text(20),
    name: text(60),
  }),
  "route/trip.started": v.object({
    tripId: id,
    from: text(60),
    to: text(60),
    corridor,
    cargo: text(120),
    advance: fcfa,
    odometerKm: v.optional(km),
    at,
  }),
  "route/entry.recorded": v.object({
    entryId: id,
    tripId: id,
    kind,
    place: text(80),
    amount: v.optional(fcfa),
    volumeCl: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(500_000))),
    pricePerLiter: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100_000))),
    odometerKm: v.optional(km),
    note: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(300))),
    /** Writers only: never visible with the read link, never in shared summaries. */
    position: v.optional(Position),
    at,
  }),
  "route/stop.resumed": v.object({
    entryId: id,
    at,
  }),
  "route/advance.added": v.object({
    advanceId: id,
    tripId: id,
    amount: v.pipe(fcfa, v.minValue(1)),
    method: v.picklist(["cash", "mobile_money"]),
    at,
  }),
  "route/trip.ended": v.object({
    tripId: id,
    place: text(60),
    odometerKm: v.optional(km),
    at,
  }),
  "route/item.cancelled": v.object({
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
