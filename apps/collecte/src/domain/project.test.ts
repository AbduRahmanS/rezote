import { canonical, type AppEvent } from "@rezote/core";
import fc from "fast-check";
import type { z } from "zod";
import { describe, expect, it } from "vitest";
import { events as schemas, type CollecteEvents } from "./events.ts";
import { project, type CollecteView } from "./project.ts";
import { receiptText } from "./text.ts";

type E = AppEvent<CollecteEvents>;
const T0 = Date.UTC(2026, 10, 14, 8);

let seq = 0;
function ev<K extends keyof CollecteEvents & string>(type: K, payload: z.input<CollecteEvents[K]>, ts: number): E {
  return { id: `e${String(++seq).padStart(6, "0")}`, space: "S", type, payload: schemas[type].parse(payload), ts, device: "d" } as E;
}

const GRADES = [
  { code: "1", label: "1er choix", pricePerKg: 300 },
  { code: "2", label: "2e choix", pricePerKg: 275 },
];

/** Random but valid campaign: farmers, weighings, bundles, money, loads, and some cancellations. */
const scenarioArb = fc
  .record({
    farmers: fc.integer({ min: 1, max: 4 }),
    weighings: fc.array(
      fc.record({
        farmer: fc.nat(),
        bundles: fc.array(fc.record({ tenths: fc.integer({ min: 1, max: 10_000 }), grade: fc.constantFrom("1", "2"), minutes: fc.integer({ min: 0, max: 30 }) }), {
          maxLength: 6,
        }),
      }),
      { maxLength: 5 },
    ),
    deductions: fc.array(fc.record({ farmer: fc.nat(), amount: fc.integer({ min: 1, max: 200_000 }) }), { maxLength: 4 }),
    payments: fc.array(fc.record({ farmer: fc.nat(), amount: fc.integer({ min: 1, max: 200_000 }) }), { maxLength: 4 }),
    loads: fc.array(fc.record({ tenths: fc.integer({ min: 1, max: 200_000 }), factoryDelta: fc.option(fc.integer({ min: -500, max: 500 }), { nil: null }) }), {
      maxLength: 3,
    }),
    cancelMask: fc.array(fc.boolean(), { minLength: 1, maxLength: 40 }),
  })
  .map((s) => {
    seq = 0;
    let ts = T0;
    const tick = () => (ts += 1000);
    const list: E[] = [];
    const cancellable: string[] = [];
    list.push(ev("collecte/campaign.created", { cooperative: "Coop", name: "Coton", product: "Coton graine", grades: GRADES }, tick()));
    list.push(ev("collecte/collector.added", { collectorId: "c1", name: "Adama", code: "K1" }, tick()));
    for (let i = 0; i < s.farmers; i++) list.push(ev("collecte/farmer.registered", { farmerId: `f${i}`, name: `F${i}`, village: i % 2 ? "Kignan" : "Zanfina" }, tick()));
    s.weighings.forEach((w, wi) => {
      const weighingId = `w${wi}`;
      const at = T0 + wi * 3_600_000;
      list.push(ev("collecte/weighing.started", { weighingId, receipt: `K1-${String(wi + 1).padStart(4, "0")}`, farmerId: `f${w.farmer % s.farmers}`, collectorId: "c1", at }, tick()));
      w.bundles.forEach((b, bi) => {
        const bundleId = `${weighingId}b${bi}`;
        list.push(ev("collecte/bundle.recorded", { bundleId, weighingId, weightG: b.tenths * 100, grade: b.grade, at: at + b.minutes * 60_000 }, tick()));
        cancellable.push(bundleId);
      });
      cancellable.push(weighingId);
    });
    s.deductions.forEach((d, i) => {
      list.push(ev("collecte/deduction.recorded", { deductionId: `d${i}`, farmerId: `f${d.farmer % s.farmers}`, label: "Engrais", amount: d.amount, at: T0 }, tick()));
      cancellable.push(`d${i}`);
    });
    s.payments.forEach((p, i) => {
      list.push(ev("collecte/payment.recorded", { paymentId: `p${i}`, farmerId: `f${p.farmer % s.farmers}`, amount: p.amount, method: "cash", at: T0 }, tick()));
      cancellable.push(`p${i}`);
    });
    s.loads.forEach((l, i) => {
      list.push(ev("collecte/load.dispatched", { loadId: `l${i}`, plate: "AB-1", villageWeightG: l.tenths * 100, at: T0 }, tick()));
      if (l.factoryDelta !== null) {
        const factory = Math.max(1, l.tenths + l.factoryDelta) * 100;
        list.push(ev("collecte/load.received", { loadId: `l${i}`, factoryWeightG: factory, at: T0 + 1 }, tick()));
      }
      cancellable.push(`l${i}`);
    });
    const cancellations: E[] = [];
    cancellable.forEach((id, i) => {
      if (s.cancelMask[i % s.cancelMask.length]) cancellations.push(ev("collecte/item.cancelled", { itemId: id, reason: "erreur" }, tick()));
    });
    return { base: list, cancellations, cancelled: new Set(cancellations.map((c) => (c.payload as { itemId: string }).itemId)) };
  });

function summary(view: CollecteView) {
  return {
    farmers: view.farmers.map((f) => [f.id, f.totalG, f.gross, f.deductionsTotal, f.paidTotal, f.balance, f.weightByGrade]),
    totals: view.totals,
    weighings: [...view.weighingById.values()].map((w) => [w.id, w.totalG, w.bundles.map((b) => [b.id, b.number, b.subtotalG])]),
    loads: view.loads.map((l) => [l.id, l.gapG]),
    flags: view.flags.map((f) => f.kind).sort(),
  };
}

const replay = (events: E[]) => project(canonical(events));

describe("Collecte projection", () => {
  it("gives the same result for any arrival order and with duplicates", () => {
    fc.assert(
      fc.property(scenarioArb, fc.integer(), (s, seed) => {
        const all = [...s.base, ...s.cancellations];
        const shuffled = fc.sample(fc.shuffledSubarray(all, { minLength: all.length, maxLength: all.length }), { seed, numRuns: 1 })[0]!;
        const expected = summary(replay(all));
        expect(summary(replay(shuffled))).toEqual(expected);
        expect(summary(replay([...shuffled, ...all.slice(0, 5)]))).toEqual(expected);
      }),
    );
  });

  it("rounds the gross amount down once per farmer", () => {
    fc.assert(
      fc.property(scenarioArb, (s) => {
        const view = replay([...s.base, ...s.cancellations]);
        for (const f of view.farmers) {
          // Exact amount in thousandths of a franc, computed with integers only.
          const milli = Object.entries(f.weightByGrade).reduce((sum, [code, g]) => sum + g * view.grades.get(code)!.pricePerKg, 0);
          const remainder = milli - f.gross * 1000;
          expect(remainder).toBeGreaterThanOrEqual(0);
          expect(remainder).toBeLessThan(1000);
          // Rounding per receipt would lose up to 1 FCFA per receipt; rounding per farmer never loses more than 1.
          const perReceipt = f.weighings.filter((w) => !w.cancelled).reduce((s, w) => s + w.gross, 0);
          expect(f.gross).toBeGreaterThanOrEqual(perReceipt);
          expect(f.balance).toBe(f.gross - f.deductionsTotal - f.paidTotal);
        }
      }),
    );
  });

  it("ends each weighing's running subtotal at its total", () => {
    fc.assert(
      fc.property(scenarioArb, (s) => {
        const view = replay([...s.base, ...s.cancellations]);
        for (const w of view.weighingById.values()) {
          const live = w.bundles.filter((b) => b.number > 0);
          expect(live.map((b) => b.number)).toEqual(live.map((_, i) => i + 1));
          expect(live.at(-1)?.subtotalG ?? 0).toBe(w.totalG);
          if (w.cancelled) expect(w.totalG).toBe(0);
        }
      }),
    );
  });

  it("keeps the store identity and totals consistent", () => {
    fc.assert(
      fc.property(scenarioArb, (s) => {
        const { totals, farmers, loads } = replay([...s.base, ...s.cancellations]);
        expect(totals.weighedG).toBe(farmers.reduce((sum, f) => sum + f.totalG, 0));
        expect(totals.inStoreG).toBe(totals.weighedG - totals.dispatchedG);
        expect(totals.dispatchedG).toBe(loads.filter((l) => !l.cancelled).reduce((sum, l) => sum + l.villageWeightG, 0));
        expect(totals.gapG).toBe(totals.receivedFactoryG - totals.receivedVillageG);
        expect(totals.balance).toBe(totals.gross - totals.deductions - totals.paid);
      }),
    );
  });

  it("treats a cancelled item exactly like an item never recorded", () => {
    fc.assert(
      fc.property(scenarioArb, (s) => {
        const withCancel = replay([...s.base, ...s.cancellations]);
        const without = replay(
          s.base.filter((e) => {
            const p = e.payload as Record<string, string>;
            const ownId = p.bundleId ?? p.deductionId ?? p.paymentId ?? (e.type === "collecte/load.dispatched" ? p.loadId : undefined);
            if (ownId && s.cancelled.has(ownId)) return false;
            if (e.type === "collecte/bundle.recorded" && s.cancelled.has(p.weighingId!)) return false;
            if (e.type === "collecte/load.received" && s.cancelled.has(p.loadId!)) return false;
            return true;
          }),
        );
        expect(withCancel.farmers.map((f) => [f.id, f.totalG, f.gross, f.balance])).toEqual(
          without.farmers.map((f) => [f.id, f.totalG, f.gross, f.balance]),
        );
        expect(withCancel.totals.dispatchedG).toBe(without.totals.dispatchedG);
        expect(withCancel.totals.gapG).toBe(without.totals.gapG);
      }),
    );
  });
});

describe("Collecte examples", () => {
  function campaign() {
    seq = 0;
    return [
      ev("collecte/campaign.created", { cooperative: "Coopérative Jɛkafo", name: "Campagne coton 2026-2027", product: "Coton graine", grades: GRADES }, T0),
      ev("collecte/collector.added", { collectorId: "c1", name: "Adama Koné", code: "K2" }, T0 + 1),
      ev("collecte/farmer.registered", { farmerId: "f1", name: "Moussa Coulibaly", village: "Kignan" }, T0 + 2),
      ev("collecte/weighing.started", { weighingId: "w1", receipt: "K2-0042", farmerId: "f1", collectorId: "c1", at: T0 + 3 }, T0 + 3),
    ];
  }

  it("computes the receipt from the design example", () => {
    const list = campaign();
    const weights = [95_000, 102_500, 88_000, 126_500];
    weights.forEach((g, i) => list.push(ev("collecte/bundle.recorded", { bundleId: `b${i}`, weighingId: "w1", weightG: g, grade: "1", at: T0 + 10 + i * 300_000 }, T0 + 10 + i)));
    list.push(ev("collecte/bundle.recorded", { bundleId: "b9", weighingId: "w1", weightG: 58_500, grade: "2", at: T0 + 2_000_000 }, T0 + 20));
    const view = project(canonical(list));
    const w = view.weighingById.get("w1")!;
    expect(w.totalG).toBe(470_500);
    expect(w.weightByGrade).toEqual({ "1": 412_000, "2": 58_500 });
    // 412 kg × 300 + 58,5 kg × 275 = 123 600 + 16 087,5 → 139 687 FCFA
    expect(w.gross).toBe(139_687);
    expect(w.bundles.map((b) => b.subtotalG)).toEqual([95_000, 197_500, 285_500, 412_000, 470_500]);
    const text = receiptText(view, w);
    expect(text).toContain("Reçu K2-0042");
    expect(text).toContain("5 bâches");
    expect(text).toContain("139\u00a0687\u00a0FCFA");
  });

  it("flags receipt collisions, double entries, negative balances, and duplicate codes", () => {
    const list = campaign();
    list.push(ev("collecte/weighing.started", { weighingId: "w2", receipt: "K2-0042", farmerId: "f1", collectorId: "c1", at: T0 + 5 }, T0 + 5));
    list.push(ev("collecte/bundle.recorded", { bundleId: "a", weighingId: "w1", weightG: 80_000, grade: "1", at: T0 + 10 }, T0 + 10));
    list.push(ev("collecte/bundle.recorded", { bundleId: "b", weighingId: "w1", weightG: 80_000, grade: "1", at: T0 + 60_000 }, T0 + 11));
    list.push(ev("collecte/payment.recorded", { paymentId: "p", farmerId: "f1", amount: 1_000_000, method: "cash", at: T0 }, T0 + 12));
    list.push(ev("collecte/collector.added", { collectorId: "c2", name: "Awa", code: "K2" }, T0 + 13));
    const kinds = project(canonical(list)).flags.map((f) => f.kind);
    expect(kinds.filter((k) => k === "receipt-collision")).toHaveLength(2);
    expect(kinds).toContain("double-entry");
    expect(kinds).toContain("negative-balance");
    expect(kinds).toContain("duplicate-code");
  });

  it("does not flag identical bundles weighed more than 2 minutes apart", () => {
    const list = campaign();
    list.push(ev("collecte/bundle.recorded", { bundleId: "a", weighingId: "w1", weightG: 80_000, grade: "1", at: T0 + 10 }, T0 + 10));
    list.push(ev("collecte/bundle.recorded", { bundleId: "b", weighingId: "w1", weightG: 80_000, grade: "1", at: T0 + 200_000 }, T0 + 11));
    expect(project(canonical(list)).flags.map((f) => f.kind)).not.toContain("double-entry");
  });

  it("computes the factory gap and the weight still in store", () => {
    const list = campaign();
    list.push(ev("collecte/bundle.recorded", { bundleId: "a", weighingId: "w1", weightG: 1_000_000, grade: "1", at: T0 + 10 }, T0 + 10));
    list.push(ev("collecte/load.dispatched", { loadId: "l1", plate: "AB-1234-MD", villageWeightG: 800_000, at: T0 + 20 }, T0 + 20));
    list.push(ev("collecte/load.received", { loadId: "l1", factoryWeightG: 792_000, at: T0 + 30 }, T0 + 30));
    const { totals, loads } = project(canonical(list));
    expect(totals.inStoreG).toBe(200_000);
    expect(loads[0]!.gapG).toBe(-8_000);
    expect(loads[0]!.gapPct).toBeCloseTo(-1);
  });
});
