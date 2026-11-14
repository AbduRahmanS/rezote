// Collecte events. Weights are integer grams (84,5 kg = 84500). Amounts are integer FCFA.

import * as v from "valibot";

const MIN_TIME = Date.UTC(2020, 0, 1);
const MAX_TIME = Date.UTC(2100, 0, 1);

const id = v.pipe(v.string(), v.minLength(1), v.maxLength(64));
const text = (max: number) => v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(max));
const at = v.pipe(v.number(), v.integer(), v.minValue(MIN_TIME), v.maxValue(MAX_TIME));
const fcfa = v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(1_000_000_000_000));
/** Grams in 100 g steps (one decimal in kg). */
const grams = (max: number) => v.pipe(v.number(), v.integer(), v.minValue(100), v.maxValue(max), v.multipleOf(100));

export const GRADE_CODE = /^[A-Za-z0-9]{1,4}$/;
export const COLLECTOR_CODE = /^[A-Z0-9]{1,4}$/;
export const RECEIPT = /^[A-Z0-9]{1,4}-\d{4,}$/;

/** One bundle (bâche) weighs at most 1 t; a truckload at most 100 t. */
export const MAX_BUNDLE_G = 1_000_000;
export const MAX_LOAD_G = 100_000_000;

export const events = {
  "collecte/campaign.created": v.object({
    cooperative: text(80),
    name: text(80),
    product: text(40),
    grades: v.pipe(
      v.array(
        v.object({
          code: v.pipe(v.string(), v.regex(GRADE_CODE)),
          label: text(30),
          pricePerKg: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100_000)),
        }),
      ),
      v.minLength(1),
      v.maxLength(5),
    ),
  }),
  "collecte/collector.added": v.object({
    collectorId: id,
    name: text(60),
    code: v.pipe(v.string(), v.regex(COLLECTOR_CODE)),
  }),
  "collecte/farmer.registered": v.object({
    farmerId: id,
    name: text(80),
    village: text(60),
  }),
  "collecte/weighing.started": v.object({
    weighingId: id,
    receipt: v.pipe(v.string(), v.regex(RECEIPT)),
    farmerId: id,
    collectorId: id,
    at,
  }),
  "collecte/bundle.recorded": v.object({
    bundleId: id,
    weighingId: id,
    weightG: grams(MAX_BUNDLE_G),
    grade: v.pipe(v.string(), v.regex(GRADE_CODE)),
    at,
  }),
  "collecte/weighing.closed": v.object({
    weighingId: id,
    at,
  }),
  "collecte/deduction.recorded": v.object({
    deductionId: id,
    farmerId: id,
    label: text(120),
    amount: fcfa,
    at,
  }),
  "collecte/payment.recorded": v.object({
    paymentId: id,
    farmerId: id,
    amount: fcfa,
    method: v.picklist(["cash", "mobile_money"]),
    at,
  }),
  "collecte/load.dispatched": v.object({
    loadId: id,
    plate: text(20),
    villageWeightG: grams(MAX_LOAD_G),
    at,
  }),
  "collecte/load.received": v.object({
    loadId: id,
    factoryWeightG: grams(MAX_LOAD_G),
    at,
  }),
  /** Cancels a weighing (with all its bundles), a bundle, a deduction, a payment, or a truckload. */
  "collecte/item.cancelled": v.object({
    itemId: id,
    reason: text(200),
  }),
};

export type CollecteEvents = typeof events;
