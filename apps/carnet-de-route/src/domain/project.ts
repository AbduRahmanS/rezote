// Carnet de route projection: trips, timelines, expenses, cash balance, stops, and consumption.

import type { AppEvent } from "@rezote/core";
import { fuelAmount, RESUMABLE, type Kind, type RouteEvents } from "./events.ts";

type E = AppEvent<RouteEvents>;
type Of<T extends E["type"]> = Extract<E, { type: T }>;

export interface Entry {
  id: string;
  eventId: string;
  tripId: string;
  kind: Kind;
  place: string;
  /** For fuel: liters × price, rounded per fill-up. Otherwise the amount typed, or 0. */
  amount: number;
  volumeCl?: number;
  pricePerLiter?: number;
  odometerKm?: number;
  note?: string;
  position?: { lat: number; lng: number; accuracyM: number };
  at: number;
  ts: number;
  device: string;
  cancelled: string | null;
  resumable: boolean;
  resumedAt: number | null;
  resumeEventId: string | null;
  /** resumedAt − at, when resumed. */
  stoppedMs: number | null;
}

export interface Advance {
  id: string;
  eventId: string;
  tripId: string;
  amount: number;
  method: "cash" | "mobile_money";
  at: number;
  ts: number;
  cancelled: string | null;
}

export type TimelineItem =
  | { kind: "start"; at: number; eventId: string }
  | { kind: "entry"; at: number; entry: Entry }
  | { kind: "advance"; at: number; advance: Advance }
  | { kind: "end"; at: number; eventId: string; place: string };

export interface Trip {
  id: string;
  eventId: string;
  from: string;
  to: string;
  corridor: string;
  cargo: string;
  advance: number;
  startAt: number;
  startOdometerKm?: number;
  ended: { place: string; at: number; odometerKm?: number; eventId: string } | null;
  entries: Entry[];
  advances: Advance[];
  timeline: TimelineItem[];
  expensesByKind: Partial<Record<Kind, number>>;
  totalExpenses: number;
  totalAdvances: number;
  /** advances − expenses. Positive: the driver still holds cash. Negative: the owner owes the driver. */
  balance: number;
  stoppedByKind: Partial<Record<Kind, number>>;
  openStops: Entry[];
  fuelCl: number;
  distanceKm: number | null;
  /** Liters per 100 km between the first and the last odometer reading. */
  consumption: number | null;
  lastReport: Entry | null;
  warnings: string[];
}

export interface RouteView {
  truck: { plate: string; name: string; eventId: string } | null;
  trips: Trip[];
  tripById: Map<string, Trip>;
  openTrips: Trip[];
  /** Greatest server reception time among events from the phones that record trip entries. */
  driverLastSync: number | null;
  warnings: string[];
}

const byAt = (a: { at: number; ts: number; eventId?: string; id: string }, b: { at: number; ts: number; id: string }) =>
  a.at - b.at || a.ts - b.ts || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function project(events: readonly E[]): RouteView {
  const cancelled = new Map<string, string>();
  for (const e of events) {
    if (e.type === "route/item.cancelled" && !cancelled.has(e.payload.itemId)) cancelled.set(e.payload.itemId, e.payload.reason);
  }

  let truck: RouteView["truck"] = null;
  const trips = new Map<string, Trip>();
  const tripTs = new Map<string, number>();
  const entries = new Map<string, Entry>();
  const resumes: Of<"route/stop.resumed">[] = [];
  const advances = new Map<string, Advance>();
  const ends: Of<"route/trip.ended">[] = [];
  const driverDevices = new Set<string>();

  for (const e of events) {
    switch (e.type) {
      case "route/truck.registered":
        if (!truck) truck = { plate: e.payload.plate, name: e.payload.name, eventId: e.id };
        break;
      case "route/trip.started": {
        const p = e.payload;
        if (trips.has(p.tripId)) break;
        tripTs.set(p.tripId, e.ts);
        const trip: Trip = {
          id: p.tripId,
          eventId: e.id,
          from: p.from,
          to: p.to,
          corridor: p.corridor,
          cargo: p.cargo,
          advance: p.advance,
          startAt: p.at,
          ended: null,
          entries: [],
          advances: [],
          timeline: [],
          expensesByKind: {},
          totalExpenses: 0,
          totalAdvances: 0,
          balance: 0,
          stoppedByKind: {},
          openStops: [],
          fuelCl: 0,
          distanceKm: null,
          consumption: null,
          lastReport: null,
          warnings: [],
        };
        if (p.odometerKm !== undefined) trip.startOdometerKm = p.odometerKm;
        trips.set(p.tripId, trip);
        break;
      }
      case "route/entry.recorded": {
        const p = e.payload;
        if (entries.has(p.entryId)) break;
        driverDevices.add(e.device);
        const amount = p.kind === "fuel" && p.volumeCl && p.pricePerLiter ? fuelAmount(p.volumeCl, p.pricePerLiter) : (p.amount ?? 0);
        const entry: Entry = {
          id: p.entryId,
          eventId: e.id,
          tripId: p.tripId,
          kind: p.kind,
          place: p.place,
          amount,
          at: p.at,
          ts: e.ts,
          device: e.device,
          cancelled: cancelled.get(p.entryId) ?? null,
          resumable: RESUMABLE.has(p.kind),
          resumedAt: null,
          resumeEventId: null,
          stoppedMs: null,
        };
        if (p.volumeCl !== undefined) entry.volumeCl = p.volumeCl;
        if (p.pricePerLiter !== undefined) entry.pricePerLiter = p.pricePerLiter;
        if (p.odometerKm !== undefined) entry.odometerKm = p.odometerKm;
        if (p.note) entry.note = p.note;
        if (p.position) entry.position = p.position;
        entries.set(p.entryId, entry);
        break;
      }
      case "route/stop.resumed":
        driverDevices.add(e.device);
        resumes.push(e);
        break;
      case "route/advance.added": {
        const p = e.payload;
        if (advances.has(p.advanceId)) break;
        advances.set(p.advanceId, {
          id: p.advanceId,
          eventId: e.id,
          tripId: p.tripId,
          amount: p.amount,
          method: p.method,
          at: p.at,
          ts: e.ts,
          cancelled: cancelled.get(p.advanceId) ?? null,
        });
        break;
      }
      case "route/trip.ended":
        driverDevices.add(e.device);
        ends.push(e);
        break;
      case "route/item.cancelled":
        break;
    }
  }

  const warnings: string[] = [];

  // First valid resume per stop wins (replay order).
  for (const r of resumes) {
    const entry = entries.get(r.payload.entryId);
    if (!entry || !entry.resumable || entry.resumedAt !== null) continue;
    if (r.payload.at < entry.at) {
      warnings.push(`Reprise avant le début de l'arrêt « ${entry.place} » : ignorée.`);
      continue;
    }
    entry.resumedAt = r.payload.at;
    entry.resumeEventId = r.id;
    entry.stoppedMs = r.payload.at - entry.at;
  }

  for (const e of ends) {
    const trip = trips.get(e.payload.tripId);
    if (!trip || trip.ended) continue;
    trip.ended = { place: e.payload.place, at: e.payload.at, eventId: e.id };
    if (e.payload.odometerKm !== undefined) trip.ended.odometerKm = e.payload.odometerKm;
    if (e.payload.at < trip.startAt) trip.warnings.push("L'arrivée est enregistrée avant le départ.");
  }

  for (const entry of entries.values()) {
    const trip = trips.get(entry.tripId);
    if (trip) trip.entries.push(entry);
  }
  for (const a of advances.values()) {
    const trip = trips.get(a.tripId);
    if (trip) trip.advances.push(a);
  }

  for (const trip of trips.values()) {
    trip.entries.sort(byAt);
    trip.advances.sort(byAt);
    const startTs = tripTs.get(trip.id) ?? 0;
    for (const entry of trip.entries) {
      if (entry.cancelled) continue;
      trip.expensesByKind[entry.kind] = (trip.expensesByKind[entry.kind] ?? 0) + entry.amount;
      trip.totalExpenses += entry.amount;
      if (entry.stoppedMs !== null) trip.stoppedByKind[entry.kind] = (trip.stoppedByKind[entry.kind] ?? 0) + entry.stoppedMs;
      else if (entry.resumable) trip.openStops.push(entry);
      if (!trip.lastReport || byAt(trip.lastReport, entry) < 0) trip.lastReport = entry;
    }
    trip.totalAdvances = trip.advance + trip.advances.reduce((s, a) => s + (a.cancelled ? 0 : a.amount), 0);
    trip.balance = trip.totalAdvances - trip.totalExpenses;

    // Consumption: fuel bought after the first odometer reading, up to the last one.
    const readings: { at: number; km: number }[] = [];
    if (trip.startOdometerKm !== undefined) readings.push({ at: trip.startAt, km: trip.startOdometerKm });
    for (const entry of trip.entries) if (!entry.cancelled && entry.odometerKm !== undefined) readings.push({ at: entry.at, km: entry.odometerKm });
    if (trip.ended?.odometerKm !== undefined) readings.push({ at: trip.ended.at, km: trip.ended.odometerKm });
    readings.sort((a, b) => a.at - b.at || a.km - b.km);
    for (const entry of trip.entries) if (!entry.cancelled && entry.kind === "fuel") trip.fuelCl += entry.volumeCl ?? 0;
    if (readings.length >= 2) {
      const first = readings[0]!;
      const last = readings.at(-1)!;
      const distance = last.km - first.km;
      if (distance > 0) {
        const fuelCl = trip.entries
          .filter((x) => !x.cancelled && x.kind === "fuel" && x.at > first.at && x.at <= last.at)
          .reduce((s, x) => s + (x.volumeCl ?? 0), 0);
        trip.distanceKm = distance;
        // (cl / 100) L per km × 100 km = cl per km.
        trip.consumption = fuelCl > 0 ? fuelCl / distance : null;
      } else if (distance < 0) {
        trip.warnings.push("Le compteur kilométrique recule : vérifiez les relevés.");
      }
    }

    const timeline: TimelineItem[] = [{ kind: "start", at: trip.startAt, eventId: trip.eventId }];
    for (const entry of trip.entries) timeline.push({ kind: "entry", at: entry.at, entry });
    for (const a of trip.advances) timeline.push({ kind: "advance", at: a.at, advance: a });
    if (trip.ended) timeline.push({ kind: "end", at: trip.ended.at, eventId: trip.ended.eventId, place: trip.ended.place });
    const rank = (t: TimelineItem) => (t.kind === "start" ? 0 : t.kind === "end" ? 2 : 1);
    const tsOf = (t: TimelineItem) => (t.kind === "entry" ? t.entry.ts : t.kind === "advance" ? t.advance.ts : startTs);
    timeline.sort((a, b) => a.at - b.at || rank(a) - rank(b) || tsOf(a) - tsOf(b));
    trip.timeline = timeline;
  }

  const tripList = [...trips.values()].sort((a, b) => b.startAt - a.startAt || (a.id < b.id ? -1 : 1));
  const openTrips = tripList.filter((t) => !t.ended && !cancelled.has(t.id));
  if (openTrips.length > 1) warnings.push(`${openTrips.length} trajets sont ouverts en même temps : terminez ceux qui sont finis.`);

  let driverLastSync: number | null = null;
  for (const e of events) {
    if (driverDevices.has(e.device) && e.receivedAt !== undefined && (driverLastSync === null || e.receivedAt > driverLastSync)) {
      driverLastSync = e.receivedAt;
    }
  }

  return {
    truck,
    trips: tripList.filter((t) => !cancelled.has(t.id)),
    tripById: trips,
    openTrips,
    driverLastSync,
    warnings,
  };
}
