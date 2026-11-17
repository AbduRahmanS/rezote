// Property-based tests: fast-check generates random event lists and checks the
// rules hold for all of them. Add one property per business rule you add.
import { canonical, type AppEvent } from "@rezote/core";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { events as schemas, type StarterEvents } from "./events.ts";
import { project } from "./project.ts";

type E = AppEvent<StarterEvents>;
const T0 = Date.UTC(2026, 10, 14, 8, 0);

let seq = 0;
function ev<K extends keyof StarterEvents & string>(type: K, payload: z.input<StarterEvents[K]>, ts: number): E {
  return { id: `e${String(++seq).padStart(6, "0")}`, space: "S", type, payload: schemas[type].parse(payload), ts, device: "phone" } as E;
}

const scenarioArb = fc
  .record({
    entries: fc.array(
      fc.record({ amount: fc.option(fc.integer({ min: 0, max: 5_000_000 }), { nil: undefined }), minutes: fc.integer({ min: 0, max: 600 }) }),
      { maxLength: 15 },
    ),
    cancelMask: fc.array(fc.boolean(), { minLength: 1, maxLength: 15 }),
  })
  .map((s) => {
    seq = 0;
    let ts = T0;
    const tick = () => (ts += 1000);
    const base: E[] = [ev("__SLUG__/space.named", { title: "Registre" }, tick())];
    s.entries.forEach((x, i) => {
      base.push(ev("__SLUG__/entry.recorded", { entryId: `n${i}`, text: `Entrée ${i}`, amount: x.amount, at: T0 + x.minutes * 60_000 }, tick()));
    });
    const cancelledIds = s.entries.map((_, i) => `n${i}`).filter((_, i) => s.cancelMask[i % s.cancelMask.length]);
    const cancellations = cancelledIds.map((entryId) => ev("__SLUG__/entry.cancelled", { entryId, reason: "erreur" }, tick()));
    return { all: [...base, ...cancellations], cancelled: new Set(cancelledIds) };
  });

const replay = (list: E[]) => project(canonical(list));

describe("__NAME__ projection", () => {
  it("gives the same result for any arrival order and with duplicates", () => {
    fc.assert(
      fc.property(scenarioArb, fc.integer(), fc.integer({ min: 0, max: 5 }), (s, seed, dupes) => {
        const shuffled = fc.sample(fc.shuffledSubarray(s.all, { minLength: s.all.length, maxLength: s.all.length }), { seed, numRuns: 1 })[0]!;
        const withDuplicates = [...shuffled, ...shuffled.slice(0, dupes)];
        expect(replay(withDuplicates)).toEqual(replay(s.all));
      }),
    );
  });

  it("never lists or counts a cancelled entry", () => {
    fc.assert(
      fc.property(scenarioArb, (s) => {
        const view = replay(s.all);
        expect(view.entries.some((x) => s.cancelled.has(x.id))).toBe(false);
        expect(view.cancelled).toBe(s.cancelled.size);
      }),
    );
  });

  it("totals exactly the listed amounts", () => {
    fc.assert(
      fc.property(scenarioArb, (s) => {
        const view = replay(s.all);
        expect(Number.isInteger(view.total)).toBe(true);
        expect(view.total).toBe(view.entries.reduce((sum, x) => sum + (x.amount ?? 0), 0));
      }),
    );
  });

  it("applies a cancellation that arrives before its entry", () => {
    seq = 0;
    const entry = ev("__SLUG__/entry.recorded", { entryId: "n1", text: "Sacs de ciment", amount: 25_000, at: T0 }, T0 + 2000);
    const cancel = ev("__SLUG__/entry.cancelled", { entryId: "n1", reason: "doublon" }, T0 + 1000);
    expect(replay([entry, cancel]).entries).toEqual([]);
  });
});
