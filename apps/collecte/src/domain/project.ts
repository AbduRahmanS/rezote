// Collecte projection: from events to farmers' balances, store levels, factory gaps, and flags.
//
// The projection first indexes every event, then computes. Results therefore do
// not depend on arrival order. Where a rule says "the first one wins" (campaign,
// collector codes, factory weight of a load), "first" is the replay order
// (ts, id), which every phone agrees on.

import type { AppEvent } from "@rezote/core";
import type { CollecteEvents } from "./events.ts";

type E = AppEvent<CollecteEvents>;
type Of<T extends E["type"]> = Extract<E, { type: T }>;

export const DOUBLE_ENTRY_WINDOW_MS = 2 * 60_000;

export interface Grade {
  code: string;
  label: string;
  pricePerKg: number;
}

export interface Campaign {
  cooperative: string;
  name: string;
  product: string;
  grades: Grade[];
  eventId: string;
}

export interface Collector {
  id: string;
  name: string;
  code: string;
  eventId: string;
  /** A later collector reused an existing code; this collector must not weigh. */
  duplicateCode: boolean;
}

export interface Bundle {
  id: string;
  eventId: string;
  weighingId: string;
  weightG: number;
  grade: string;
  at: number;
  ts: number;
  cancelled: string | null;
  /** Position among non-cancelled bundles of the weighing (1-based); 0 if cancelled. */
  number: number;
  /** Running subtotal of non-cancelled bundles up to and including this one. */
  subtotalG: number;
}

export interface Weighing {
  id: string;
  eventId: string;
  receipt: string;
  farmerId: string;
  collectorId: string;
  at: number;
  closedAt: number | null;
  cancelled: string | null;
  bundles: Bundle[];
  bundleCount: number;
  totalG: number;
  weightByGrade: Record<string, number>;
  /** Gross amount of this receipt alone, rounded down. */
  gross: number;
}

export interface Money {
  id: string;
  eventId: string;
  farmerId: string;
  amount: number;
  at: number;
  cancelled: string | null;
}

export interface Deduction extends Money {
  label: string;
}

export interface Payment extends Money {
  method: "cash" | "mobile_money";
}

export interface Farmer {
  id: string;
  eventId: string;
  name: string;
  village: string;
  weighings: Weighing[];
  weightByGrade: Record<string, number>;
  totalG: number;
  bundleCount: number;
  /** floor(Σ weight × price / 1000), computed once from the exact totals. */
  gross: number;
  deductions: Deduction[];
  payments: Payment[];
  deductionsTotal: number;
  paidTotal: number;
  balance: number;
}

export interface Load {
  id: string;
  eventId: string;
  plate: string;
  villageWeightG: number;
  at: number;
  cancelled: string | null;
  received: { factoryWeightG: number; at: number; eventId: string } | null;
  /** factory − village, when received. */
  gapG: number | null;
  gapPct: number | null;
}

export type FlagKind = "receipt-collision" | "double-entry" | "negative-balance" | "duplicate-code" | "unknown-grade" | "orphan";

export interface Flag {
  kind: FlagKind;
  message: string;
  farmerId?: string;
  weighingId?: string;
}

export interface Totals {
  weighedG: number;
  weightByGrade: Record<string, number>;
  bundles: number;
  gross: number;
  deductions: number;
  paid: number;
  balance: number;
  dispatchedG: number;
  inStoreG: number;
  receivedVillageG: number;
  receivedFactoryG: number;
  gapG: number;
  gapPct: number | null;
}

export interface CollecteView {
  campaign: Campaign | null;
  grades: Map<string, Grade>;
  collectors: Collector[];
  collectorById: Map<string, Collector>;
  farmers: Farmer[];
  farmerById: Map<string, Farmer>;
  weighingById: Map<string, Weighing>;
  loads: Load[];
  flags: Flag[];
  totals: Totals;
  byVillage: { village: string; farmers: number; totalG: number; gross: number; balance: number }[];
  byCollector: { collector: Collector; weighings: number; bundles: number; totalG: number }[];
}

function addTo(record: Record<string, number>, key: string, value: number) {
  record[key] = (record[key] ?? 0) + value;
}

/** floor(Σ_g grams[g] × price[g] / 1000). Unknown grades count for 0 FCFA (and are flagged). */
export function grossAmount(weightByGrade: Record<string, number>, grades: Map<string, Grade>): number {
  let milliFcfa = 0;
  for (const [code, g] of Object.entries(weightByGrade)) milliFcfa += g * (grades.get(code)?.pricePerKg ?? 0);
  return Math.floor(milliFcfa / 1000);
}

const sortByAt = <T extends { at: number; ts?: number; id: string }>(a: T, b: T) =>
  a.at - b.at || (a.ts ?? 0) - (b.ts ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function project(events: readonly E[]): CollecteView {
  const cancelled = new Map<string, string>();
  for (const e of events) {
    if (e.type === "collecte/item.cancelled" && !cancelled.has(e.payload.itemId)) cancelled.set(e.payload.itemId, e.payload.reason);
  }
  const reasonFor = (id: string) => cancelled.get(id) ?? null;

  let campaign: Campaign | null = null;
  const collectors: Collector[] = [];
  const codes = new Set<string>();
  const farmers = new Map<string, Farmer>();
  const weighings = new Map<string, Weighing>();
  const rawBundles: Of<"collecte/bundle.recorded">[] = [];
  const closes = new Map<string, number>();
  const rawDeductions: Of<"collecte/deduction.recorded">[] = [];
  const rawPayments: Of<"collecte/payment.recorded">[] = [];
  const loads = new Map<string, Load>();
  const receptions: Of<"collecte/load.received">[] = [];
  const flags: Flag[] = [];

  // Pass 1: index. Events are in replay order, so "first wins" is deterministic.
  for (const e of events) {
    switch (e.type) {
      case "collecte/campaign.created":
        if (!campaign) campaign = { ...e.payload, eventId: e.id };
        break;
      case "collecte/collector.added": {
        if (collectors.some((c) => c.id === e.payload.collectorId)) break;
        const duplicateCode = codes.has(e.payload.code);
        codes.add(e.payload.code);
        collectors.push({ id: e.payload.collectorId, name: e.payload.name, code: e.payload.code, eventId: e.id, duplicateCode });
        if (duplicateCode) {
          flags.push({ kind: "duplicate-code", message: `Le code ${e.payload.code} est déjà utilisé : ${e.payload.name} ne doit pas peser.` });
        }
        break;
      }
      case "collecte/farmer.registered":
        if (!farmers.has(e.payload.farmerId)) {
          farmers.set(e.payload.farmerId, {
            id: e.payload.farmerId,
            eventId: e.id,
            name: e.payload.name,
            village: e.payload.village,
            weighings: [],
            weightByGrade: {},
            totalG: 0,
            bundleCount: 0,
            gross: 0,
            deductions: [],
            payments: [],
            deductionsTotal: 0,
            paidTotal: 0,
            balance: 0,
          });
        }
        break;
      case "collecte/weighing.started":
        if (!weighings.has(e.payload.weighingId)) {
          weighings.set(e.payload.weighingId, {
            id: e.payload.weighingId,
            eventId: e.id,
            receipt: e.payload.receipt,
            farmerId: e.payload.farmerId,
            collectorId: e.payload.collectorId,
            at: e.payload.at,
            closedAt: null,
            cancelled: reasonFor(e.payload.weighingId),
            bundles: [],
            bundleCount: 0,
            totalG: 0,
            weightByGrade: {},
            gross: 0,
          });
        }
        break;
      case "collecte/bundle.recorded":
        rawBundles.push(e);
        break;
      case "collecte/weighing.closed":
        if (!closes.has(e.payload.weighingId)) closes.set(e.payload.weighingId, e.payload.at);
        break;
      case "collecte/deduction.recorded":
        rawDeductions.push(e);
        break;
      case "collecte/payment.recorded":
        rawPayments.push(e);
        break;
      case "collecte/load.dispatched":
        if (!loads.has(e.payload.loadId)) {
          loads.set(e.payload.loadId, {
            id: e.payload.loadId,
            eventId: e.id,
            plate: e.payload.plate,
            villageWeightG: e.payload.villageWeightG,
            at: e.payload.at,
            cancelled: reasonFor(e.payload.loadId),
            received: null,
            gapG: null,
            gapPct: null,
          });
        }
        break;
      case "collecte/load.received":
        receptions.push(e);
        break;
      case "collecte/item.cancelled":
        break;
    }
  }

  const grades = new Map((campaign?.grades ?? []).map((g) => [g.code, g]));

  // Pass 2: bundles into weighings, with running subtotals.
  const seenBundles = new Set<string>();
  for (const e of rawBundles) {
    if (seenBundles.has(e.payload.bundleId)) continue;
    seenBundles.add(e.payload.bundleId);
    const w = weighings.get(e.payload.weighingId);
    if (!w) {
      flags.push({ kind: "orphan", message: `Une bâche de ${e.payload.weightG / 1000} kg appartient à une pesée inconnue.` });
      continue;
    }
    w.bundles.push({
      id: e.payload.bundleId,
      eventId: e.id,
      weighingId: w.id,
      weightG: e.payload.weightG,
      grade: e.payload.grade,
      at: e.payload.at,
      ts: e.ts,
      cancelled: reasonFor(e.payload.bundleId),
      number: 0,
      subtotalG: 0,
    });
  }

  const unknownGrades = new Set<string>();
  for (const w of weighings.values()) {
    w.closedAt = closes.get(w.id) ?? null;
    w.bundles.sort(sortByAt);
    let n = 0;
    let subtotal = 0;
    const live: Bundle[] = [];
    for (const b of w.bundles) {
      if (b.cancelled || w.cancelled) continue;
      n++;
      subtotal += b.weightG;
      b.number = n;
      b.subtotalG = subtotal;
      addTo(w.weightByGrade, b.grade, b.weightG);
      if (!grades.has(b.grade)) unknownGrades.add(b.grade);
      live.push(b);
    }
    w.bundleCount = n;
    w.totalG = subtotal;
    w.gross = grossAmount(w.weightByGrade, grades);
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        const a = live[i]!;
        const b = live[j]!;
        if (b.at - a.at >= DOUBLE_ENTRY_WINDOW_MS) break;
        if (a.weightG === b.weightG && a.grade === b.grade) {
          flags.push({
            kind: "double-entry",
            message: `Reçu ${w.receipt} : bâches n° ${a.number} et ${b.number} ont le même poids à moins de 2 minutes d'écart.`,
            weighingId: w.id,
            farmerId: w.farmerId,
          });
        }
      }
    }
  }
  if (campaign) {
    for (const code of unknownGrades) flags.push({ kind: "unknown-grade", message: `Qualité « ${code} » inconnue : comptée à 0 FCFA.` });
  }

  // Receipt numbers must be unique across phones.
  const byReceipt = new Map<string, Weighing[]>();
  for (const w of weighings.values()) {
    if (w.cancelled) continue;
    const list = byReceipt.get(w.receipt) ?? [];
    list.push(w);
    byReceipt.set(w.receipt, list);
  }
  for (const [receipt, list] of byReceipt) {
    if (list.length > 1) {
      for (const w of list) {
        flags.push({
          kind: "receipt-collision",
          message: `Le reçu ${receipt} existe ${list.length} fois (même collecteur sur deux téléphones ?).`,
          weighingId: w.id,
          farmerId: w.farmerId,
        });
      }
    }
  }

  // Pass 3: farmers.
  for (const w of weighings.values()) {
    const f = farmers.get(w.farmerId);
    if (!f) {
      flags.push({ kind: "orphan", message: `Le reçu ${w.receipt} concerne un producteur inconnu.`, weighingId: w.id });
      continue;
    }
    f.weighings.push(w);
    if (w.cancelled) continue;
    for (const [code, g] of Object.entries(w.weightByGrade)) addTo(f.weightByGrade, code, g);
    f.totalG += w.totalG;
    f.bundleCount += w.bundleCount;
  }

  const seenMoney = new Set<string>();
  for (const e of rawDeductions) {
    const f = farmers.get(e.payload.farmerId);
    if (!f || seenMoney.has(e.payload.deductionId)) continue;
    seenMoney.add(e.payload.deductionId);
    f.deductions.push({
      id: e.payload.deductionId,
      eventId: e.id,
      farmerId: f.id,
      label: e.payload.label,
      amount: e.payload.amount,
      at: e.payload.at,
      cancelled: reasonFor(e.payload.deductionId),
    });
  }
  for (const e of rawPayments) {
    const f = farmers.get(e.payload.farmerId);
    if (!f || seenMoney.has(e.payload.paymentId)) continue;
    seenMoney.add(e.payload.paymentId);
    f.payments.push({
      id: e.payload.paymentId,
      eventId: e.id,
      farmerId: f.id,
      amount: e.payload.amount,
      method: e.payload.method,
      at: e.payload.at,
      cancelled: reasonFor(e.payload.paymentId),
    });
  }

  const totals: Totals = {
    weighedG: 0,
    weightByGrade: {},
    bundles: 0,
    gross: 0,
    deductions: 0,
    paid: 0,
    balance: 0,
    dispatchedG: 0,
    inStoreG: 0,
    receivedVillageG: 0,
    receivedFactoryG: 0,
    gapG: 0,
    gapPct: null,
  };

  for (const f of farmers.values()) {
    f.weighings.sort(sortByAt);
    f.deductions.sort(sortByAt);
    f.payments.sort(sortByAt);
    f.gross = grossAmount(f.weightByGrade, grades);
    f.deductionsTotal = f.deductions.reduce((s, d) => s + (d.cancelled ? 0 : d.amount), 0);
    f.paidTotal = f.payments.reduce((s, p) => s + (p.cancelled ? 0 : p.amount), 0);
    f.balance = f.gross - f.deductionsTotal - f.paidTotal;
    if (f.balance < 0) {
      flags.push({ kind: "negative-balance", message: `${f.name} a reçu plus que son dû.`, farmerId: f.id });
    }
    totals.weighedG += f.totalG;
    totals.bundles += f.bundleCount;
    for (const [code, g] of Object.entries(f.weightByGrade)) addTo(totals.weightByGrade, code, g);
    totals.gross += f.gross;
    totals.deductions += f.deductionsTotal;
    totals.paid += f.paidTotal;
    totals.balance += f.balance;
  }

  // Truckloads: village weight against factory weight.
  for (const e of receptions) {
    const load = loads.get(e.payload.loadId);
    if (load && !load.received) load.received = { factoryWeightG: e.payload.factoryWeightG, at: e.payload.at, eventId: e.id };
  }
  for (const load of loads.values()) {
    if (load.cancelled) continue;
    totals.dispatchedG += load.villageWeightG;
    if (load.received) {
      load.gapG = load.received.factoryWeightG - load.villageWeightG;
      load.gapPct = (load.gapG / load.villageWeightG) * 100;
      totals.receivedVillageG += load.villageWeightG;
      totals.receivedFactoryG += load.received.factoryWeightG;
    }
  }
  totals.inStoreG = totals.weighedG - totals.dispatchedG;
  totals.gapG = totals.receivedFactoryG - totals.receivedVillageG;
  totals.gapPct = totals.receivedVillageG > 0 ? (totals.gapG / totals.receivedVillageG) * 100 : null;

  const farmerList = [...farmers.values()].sort((a, b) => a.name.localeCompare(b.name, "fr"));
  const villages = new Map<string, CollecteView["byVillage"][number]>();
  for (const f of farmerList) {
    const v = villages.get(f.village) ?? { village: f.village, farmers: 0, totalG: 0, gross: 0, balance: 0 };
    v.farmers++;
    v.totalG += f.totalG;
    v.gross += f.gross;
    v.balance += f.balance;
    villages.set(f.village, v);
  }
  const collectorById = new Map(collectors.map((c) => [c.id, c]));
  const byCollector = collectors.map((collector) => {
    const mine = [...weighings.values()].filter((w) => w.collectorId === collector.id && !w.cancelled);
    return {
      collector,
      weighings: mine.length,
      bundles: mine.reduce((s, w) => s + w.bundleCount, 0),
      totalG: mine.reduce((s, w) => s + w.totalG, 0),
    };
  });

  return {
    campaign,
    grades,
    collectors,
    collectorById,
    farmers: farmerList,
    farmerById: farmers,
    weighingById: weighings,
    loads: [...loads.values()].sort(sortByAt),
    flags,
    totals,
    byVillage: [...villages.values()].sort((a, b) => a.village.localeCompare(b.village, "fr")),
    byCollector,
  };
}
