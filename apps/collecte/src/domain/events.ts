// Collecte events (Zod schemas). Weights are integer grams (84,5 kg = 84500). Amounts are integer FCFA.

import { z } from "zod";

const MIN_TIME = Date.UTC(2020, 0, 1);
const MAX_TIME = Date.UTC(2100, 0, 1);

const id = z.string().min(1).max(64);
const text = (max: number) => z.string().trim().min(1).max(max);
const at = z.number().int().min(MIN_TIME).max(MAX_TIME);
const fcfa = z.number().int().min(1).max(1_000_000_000_000);
/** Grams in 100 g steps (one decimal in kg). */
const grams = (max: number) => z.number().int().min(100).max(max).multipleOf(100);

export const GRADE_CODE = /^[A-Za-z0-9]{1,4}$/;
export const COLLECTOR_CODE = /^[A-Z0-9]{1,4}$/;
export const RECEIPT = /^[A-Z0-9]{1,4}-\d{4,}$/;

/** One bundle (bâche) weighs at most 1 t; a truckload at most 100 t. */
export const MAX_BUNDLE_G = 1_000_000;
export const MAX_LOAD_G = 100_000_000;

export const Grade = z.object({
  code: z.string().regex(GRADE_CODE),
  label: text(30),
  pricePerKg: z.number().int().min(1).max(100_000),
});

export const events = {
  "collecte/campaign.created": z.object({
    cooperative: text(80),
    name: text(80),
    product: text(40),
    grades: z.array(Grade).min(1).max(5),
  }),
  "collecte/collector.added": z.object({
    collectorId: id,
    name: text(60),
    code: z.string().regex(COLLECTOR_CODE),
  }),
  "collecte/farmer.registered": z.object({
    farmerId: id,
    name: text(80),
    village: text(60),
  }),
  "collecte/weighing.started": z.object({
    weighingId: id,
    receipt: z.string().regex(RECEIPT),
    farmerId: id,
    collectorId: id,
    at,
  }),
  "collecte/bundle.recorded": z.object({
    bundleId: id,
    weighingId: id,
    weightG: grams(MAX_BUNDLE_G),
    grade: z.string().regex(GRADE_CODE),
    at,
  }),
  "collecte/weighing.closed": z.object({
    weighingId: id,
    at,
  }),
  "collecte/deduction.recorded": z.object({
    deductionId: id,
    farmerId: id,
    label: text(120),
    amount: fcfa,
    at,
  }),
  "collecte/payment.recorded": z.object({
    paymentId: id,
    farmerId: id,
    amount: fcfa,
    method: z.enum(["cash", "mobile_money"]),
    at,
  }),
  "collecte/load.dispatched": z.object({
    loadId: id,
    plate: text(20),
    villageWeightG: grams(MAX_LOAD_G),
    at,
  }),
  "collecte/load.received": z.object({
    loadId: id,
    factoryWeightG: grams(MAX_LOAD_G),
    at,
  }),
  /** Cancels a weighing (with all its bundles), a bundle, a deduction, a payment, or a truckload. */
  "collecte/item.cancelled": z.object({
    itemId: id,
    reason: text(200),
  }),
};

export type CollecteEvents = typeof events;
