import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { canonical, compareEvents, mergeEvents, type RezoteEvent } from "../src/event.ts";

const eventArb: fc.Arbitrary<RezoteEvent> = fc.record({
  id: fc.uuid(),
  space: fc.constant("S"),
  type: fc.constantFrom("a", "b"),
  payload: fc.integer(),
  ts: fc.integer({ min: 0, max: 50 }), // small range to force equal timestamps
  device: fc.constantFrom("d1", "d2"),
});

// Different IDs must carry different content for these laws to be meaningful;
// the same ID always means the same immutable event.
const setArb = fc.uniqueArray(eventArb, { selector: (e) => e.id, maxLength: 30 });

const ids = (events: RezoteEvent[]) => events.map((e) => e.id);

describe("canonical order", () => {
  it("is the same for any arrival order", () => {
    fc.assert(
      fc.property(setArb, fc.integer(), (events, seed) => {
        const shuffled = fc.sample(fc.shuffledSubarray(events, { minLength: events.length, maxLength: events.length }), {
          seed,
          numRuns: 1,
        })[0]!;
        expect(ids(canonical(shuffled))).toEqual(ids(canonical(events)));
      }),
    );
  });

  it("ignores duplicate copies", () => {
    fc.assert(
      fc.property(setArb, fc.array(fc.nat()), (events, picks) => {
        const dupes = events.length ? picks.map((i) => events[i % events.length]!) : [];
        expect(ids(canonical([...events, ...dupes]))).toEqual(ids(canonical(events)));
      }),
    );
  });

  it("is sorted by ts then id", () => {
    fc.assert(
      fc.property(setArb, (events) => {
        const sorted = canonical(events);
        for (let i = 1; i < sorted.length; i++) expect(compareEvents(sorted[i - 1]!, sorted[i]!)).toBeLessThan(0);
      }),
    );
  });

  it("prefers the synced copy of an event", () => {
    const local: RezoteEvent = { id: "x", space: "S", type: "a", payload: 1, ts: 1, device: "d" };
    const synced = { ...local, seq: 7, receivedAt: 99 };
    expect(canonical([local, synced])[0]!.seq).toBe(7);
    expect(canonical([synced, local])[0]!.seq).toBe(7);
  });
});

describe("merge", () => {
  const split = (all: RezoteEvent[], mask: boolean[]) => all.filter((_, i) => mask[i % mask.length]);

  it("is commutative, associative, and idempotent", () => {
    fc.assert(
      fc.property(setArb, fc.array(fc.boolean(), { minLength: 1 }), fc.array(fc.boolean(), { minLength: 1 }), (all, m1, m2) => {
        const a = split(all, m1);
        const b = split(all, m2);
        const c = all.filter((_, i) => i % 3 === 0);
        expect(ids(mergeEvents(a, b))).toEqual(ids(mergeEvents(b, a)));
        expect(ids(mergeEvents(mergeEvents(a, b), c))).toEqual(ids(mergeEvents(a, mergeEvents(b, c))));
        expect(ids(mergeEvents(a, a))).toEqual(ids(canonical(a)));
      }),
    );
  });
});
