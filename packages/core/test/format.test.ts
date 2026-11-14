import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  formatDuration,
  formatFCFA,
  formatKg,
  formatLiters,
  NBSP,
  parseFCFA,
  parseKg,
  parseLiters,
} from "../src/format.ts";

describe("FCFA", () => {
  it("groups thousands with a non-breaking space", () => {
    expect(formatFCFA(25350)).toBe(`25${NBSP}350${NBSP}FCFA`);
    expect(formatFCFA(0)).toBe(`0${NBSP}FCFA`);
    expect(formatFCFA(-1500)).toBe(`-1${NBSP}500${NBSP}FCFA`);
    expect(formatFCFA(1234567)).toBe(`1${NBSP}234${NBSP}567${NBSP}FCFA`);
  });

  it("parses back to the original integer", () => {
    fc.assert(
      fc.property(fc.integer({ min: -1e12, max: 1e12 }), (n) => {
        expect(parseFCFA(formatFCFA(n))).toBe(n);
      }),
    );
  });

  it("accepts what people type", () => {
    expect(parseFCFA("25 350")).toBe(25350);
    expect(parseFCFA("25.350")).toBe(25350);
    expect(parseFCFA("14000 F")).toBe(14000);
    expect(parseFCFA("12,5")).toBeNull();
    expect(parseFCFA("")).toBeNull();
  });
});

describe("kg", () => {
  it("shows at most one decimal with a comma", () => {
    expect(formatKg(84500)).toBe(`84,5${NBSP}kg`);
    expect(formatKg(84000)).toBe(`84${NBSP}kg`);
    expect(formatKg(1250000)).toBe(`1${NBSP}250${NBSP}kg`);
  });

  it("parses back any weight in 100 g steps", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1e8 }), (tenths) => {
        const grams = tenths * 100;
        expect(parseKg(formatKg(grams))).toBe(grams);
      }),
    );
  });

  it("accepts a comma or a dot", () => {
    expect(parseKg("84,5")).toBe(84500);
    expect(parseKg("84.5")).toBe(84500);
    expect(parseKg(" 84 ")).toBe(84000);
    expect(parseKg("84,55")).toBeNull();
    expect(parseKg("0")).toBeNull();
    expect(parseKg("-3")).toBeNull();
    expect(parseKg("abc")).toBeNull();
  });
});

describe("liters", () => {
  it("parses and formats centiliters", () => {
    expect(parseLiters("250")).toBe(25000);
    expect(parseLiters("250,5")).toBe(25050);
    expect(parseLiters("12.25")).toBe(1225);
    expect(formatLiters(25050)).toBe(`250,5${NBSP}L`);
    expect(formatLiters(1225)).toBe(`12,25${NBSP}L`);
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1e7 }), (cl) => {
        expect(parseLiters(formatLiters(cl))).toBe(cl);
      }),
    );
  });
});

describe("durations", () => {
  it("formats days, hours, and minutes", () => {
    expect(formatDuration(50_000)).toBe("0 min");
    expect(formatDuration(135 * 60_000)).toBe("2 h 15");
    expect(formatDuration(((4 * 24 + 10) * 60 + 40) * 60_000)).toBe("4 j 10 h 40");
    expect(formatDuration(-5)).toBe("0 min");
  });
});
