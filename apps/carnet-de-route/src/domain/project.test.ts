import { canonical, type AppEvent } from "@rezote/core";
import fc from "fast-check";
import type { z } from "zod";
import { describe, expect, it } from "vitest";
import { events as schemas, fuelAmount, KINDS, type Kind, type RouteEvents } from "./events.ts";
import { project, type RouteView } from "./project.ts";
import { tripSummary } from "./text.ts";

type E = AppEvent<RouteEvents>;
const T0 = Date.UTC(2026, 10, 6, 5, 40);
const H = 3_600_000;

let seq = 0;
function ev<K extends keyof RouteEvents & string>(type: K, payload: z.input<RouteEvents[K]>, ts: number, extra: Partial<E> = {}): E {
  return { id: `e${String(++seq).padStart(6, "0")}`, space: "S", type, payload: schemas[type].parse(payload), ts, device: "driver", ...extra } as E;
}

const kinds = Object.keys(KINDS) as Kind[];

const scenarioArb = fc
  .record({
    advance: fc.integer({ min: 0, max: 2_000_000 }),
    entries: fc.array(
      fc.record({
        kind: fc.constantFrom(...kinds),
        amount: fc.integer({ min: 0, max: 200_000 }),
        liters: fc.integer({ min: 1, max: 60_000 }),
        price: fc.integer({ min: 600, max: 1200 }),
        hours: fc.integer({ min: 0, max: 120 }),
        resumeAfter: fc.option(fc.integer({ min: -5, max: 20 }), { nil: null }),
      }),
      { maxLength: 12 },
    ),
    advances: fc.array(fc.integer({ min: 1, max: 300_000 }), { maxLength: 3 }),
    cancelMask: fc.array(fc.boolean(), { minLength: 1, maxLength: 20 }),
  })
  .map((s) => {
    seq = 0;
    let ts = T0;
    const tick = () => (ts += 1000);
    const base: E[] = [
      ev("route/truck.registered", { plate: "AB-1234-MD", name: "Renault Kerax" }, tick()),
      ev("route/trip.started", { tripId: "t1", from: "Abidjan", to: "Bamako", corridor: "abidjan-zegoua", cargo: "Ciment", advance: s.advance, at: T0 }, tick()),
    ];
    const cancellable: string[] = [];
    s.entries.forEach((x, i) => {
      const entryId = `x${i}`;
      const at = T0 + x.hours * H;
      base.push(
        ev(
          "route/entry.recorded",
          x.kind === "fuel"
            ? { entryId, tripId: "t1", kind: "fuel", place: "Station", volumeCl: x.liters, pricePerLiter: x.price, at }
            : { entryId, tripId: "t1", kind: x.kind, place: "Lieu", amount: x.amount, at },
          tick(),
        ),
      );
      if (x.resumeAfter !== null) base.push(ev("route/stop.resumed", { entryId, at: at + x.resumeAfter * H }, tick()));
      cancellable.push(entryId);
    });
    s.advances.forEach((amount, i) => {
      base.push(ev("route/advance.added", { advanceId: `a${i}`, tripId: "t1", amount, method: "mobile_money", at: T0 + i * H }, tick()));
      cancellable.push(`a${i}`);
    });
    const cancellations = cancellable
      .filter((_, i) => s.cancelMask[i % s.cancelMask.length])
      .map((itemId) => ev("route/item.cancelled", { itemId, reason: "erreur" }, tick()));
    return { base, cancellations, cancelled: new Set(cancellations.map((c) => (c.payload as { itemId: string }).itemId)) };
  });

const replay = (list: E[]) => project(canonical(list));
const summary = (view: RouteView) =>
  view.trips.map((t) => [t.id, t.totalExpenses, t.totalAdvances, t.balance, t.expensesByKind, t.stoppedByKind, t.timeline.map((x) => x.at), t.openStops.map((s) => s.id)]);

describe("Carnet de route projection", () => {
  it("gives the same result for any arrival order and with duplicates", () => {
    fc.assert(
      fc.property(scenarioArb, fc.integer(), (s, seed) => {
        const all = [...s.base, ...s.cancellations];
        const shuffled = fc.sample(fc.shuffledSubarray(all, { minLength: all.length, maxLength: all.length }), { seed, numRuns: 1 })[0]!;
        const expected = summary(replay(all));
        expect(summary(replay(shuffled))).toEqual(expected);
        expect(summary(replay([...all, ...shuffled.slice(0, 4)]))).toEqual(expected);
      }),
    );
  });

  it("always has balance = advances − expenses", () => {
    fc.assert(
      fc.property(scenarioArb, (s) => {
        const trip = replay([...s.base, ...s.cancellations]).trips[0]!;
        const expenses = trip.entries.filter((e) => !e.cancelled).reduce((sum, e) => sum + e.amount, 0);
        const advances = trip.advance + trip.advances.filter((a) => !a.cancelled).reduce((sum, a) => sum + a.amount, 0);
        expect(trip.totalExpenses).toBe(expenses);
        expect(trip.totalAdvances).toBe(advances);
        expect(trip.balance).toBe(advances - expenses);
        expect(Object.values(trip.expensesByKind).reduce((a, b) => a + (b ?? 0), 0)).toBe(expenses);
      }),
    );
  });

  it("never counts negative stopped time", () => {
    fc.assert(
      fc.property(scenarioArb, (s) => {
        const trip = replay([...s.base, ...s.cancellations]).trips[0]!;
        for (const ms of Object.values(trip.stoppedByKind)) expect(ms).toBeGreaterThanOrEqual(0);
        for (const e of trip.entries) if (e.stoppedMs !== null) expect(e.stoppedMs).toBeGreaterThanOrEqual(0);
      }),
    );
  });

  it("treats a cancelled entry or advance like one never recorded", () => {
    fc.assert(
      fc.property(scenarioArb, (s) => {
        const a = replay([...s.base, ...s.cancellations]).trips[0]!;
        const b = replay(
          s.base.filter((e) => {
            const p = e.payload as Record<string, string>;
            return !s.cancelled.has(p.entryId ?? p.advanceId ?? "");
          }),
        ).trips[0]!;
        expect([a.totalExpenses, a.totalAdvances, a.balance, a.expensesByKind, a.stoppedByKind]).toEqual([
          b.totalExpenses,
          b.totalAdvances,
          b.balance,
          b.expensesByKind,
          b.stoppedByKind,
        ]);
      }),
    );
  });
});

describe("Carnet de route examples", () => {
  function trip() {
    seq = 0;
    return [
      ev("route/truck.registered", { plate: "AB-1234-MD", name: "Kerax" }, T0),
      ev("route/trip.started", { tripId: "t", from: "Abidjan", to: "Bamako", corridor: "abidjan-zegoua", cargo: "Ciment 30 t", advance: 600_000, odometerKm: 100_000, at: T0 }, T0 + 1),
    ];
  }

  it("computes fuel per fill-up, stops, consumption, and the summary", () => {
    const list = trip();
    list.push(ev("route/entry.recorded", { entryId: "f1", tripId: "t", kind: "fuel", place: "Yamoussoukro", volumeCl: 30_000, pricePerLiter: 725, odometerKm: 100_250, at: T0 + 4 * H }, T0 + 2));
    list.push(ev("route/entry.recorded", { entryId: "b1", tripId: "t", kind: "border", place: "Pogo", at: T0 + 20 * H }, T0 + 3));
    list.push(ev("route/stop.resumed", { entryId: "b1", at: T0 + 27.25 * H }, T0 + 4));
    list.push(ev("route/entry.recorded", { entryId: "f2", tripId: "t", kind: "fuel", place: "Sikasso", volumeCl: 22_500, pricePerLiter: 940, odometerKm: 100_850, at: T0 + 40 * H }, T0 + 5));
    list.push(ev("route/entry.recorded", { entryId: "c1", tripId: "t", kind: "checkpoint", place: "Bougouni", amount: 5_000, at: T0 + 50 * H }, T0 + 6));
    list.push(ev("route/entry.recorded", { entryId: "p1", tripId: "t", kind: "breakdown", place: "Ouéléssébougou", at: T0 + 55 * H }, T0 + 7));
    list.push(ev("route/trip.ended", { tripId: "t", place: "Bamako", odometerKm: 101_150, at: T0 + 60 * H }, T0 + 8));
    const view = project(canonical(list));
    const t = view.trips[0]!;
    expect(fuelAmount(30_000, 725)).toBe(217_500);
    expect(t.expensesByKind.fuel).toBe(217_500 + 211_500);
    expect(t.balance).toBe(600_000 - 217_500 - 211_500 - 5_000);
    expect(t.stoppedByKind.border).toBe(7.25 * H);
    expect(t.openStops.map((s) => s.id)).toEqual(["p1"]);
    // Fuel after the first reading (100 000 km) up to the last (101 150 km): 300 L + 225 L over 1 150 km.
    expect(t.consumption).toBeCloseTo(52_500 / 1_150);
    const text = tripSummary(view, t);
    expect(text).toContain("Abidjan → Bamako");
    expect(text).toContain("frontière 7 h 15");
    expect(text).toContain("En cours : panne à Ouéléssébougou");
  });

  it("ignores a resume earlier than the stop and warns", () => {
    const list = trip();
    list.push(ev("route/entry.recorded", { entryId: "x", tripId: "t", kind: "customs", place: "Zégoua", at: T0 + 10 * H }, T0 + 2));
    list.push(ev("route/stop.resumed", { entryId: "x", at: T0 + 9 * H }, T0 + 3));
    const view = project(canonical(list));
    expect(view.trips[0]!.stoppedByKind.customs).toBeUndefined();
    expect(view.warnings.join()).toContain("Reprise avant");
  });

  it("never puts GPS positions in the summary", () => {
    const list = trip();
    list.push(
      ev("route/entry.recorded", { entryId: "g", tripId: "t", kind: "checkpoint", place: "Kadiolo", amount: 2000, position: { lat: 10.55871, lng: -5.76321, accuracyM: 12 }, at: T0 + H }, T0 + 2),
    );
    const view = project(canonical(list));
    const text = tripSummary(view, view.trips[0]!);
    expect(text).not.toContain("10.55");
    expect(text).not.toContain("5.76");
  });

  it("reports when the driver's phone last synced", () => {
    const list = trip();
    list.push(ev("route/entry.recorded", { entryId: "m", tripId: "t", kind: "meal", place: "Bouaké", amount: 2500, at: T0 + H }, T0 + 2, { device: "phoneA", receivedAt: T0 + 2 * H }));
    list.push(ev("route/advance.added", { advanceId: "a", tripId: "t", amount: 50_000, method: "mobile_money", at: T0 + 3 * H }, T0 + 3, { device: "owner", receivedAt: T0 + 9 * H }));
    expect(project(canonical(list)).driverLastSync).toBe(T0 + 2 * H);
  });

  it("warns when two trips are open", () => {
    const list = trip();
    list.push(ev("route/trip.started", { tripId: "t2", from: "Dakar", to: "Bamako", corridor: "dakar-moussala", cargo: "Riz", advance: 0, at: T0 + H }, T0 + 2));
    expect(project(canonical(list)).warnings.join()).toContain("2 trajets");
  });
});
