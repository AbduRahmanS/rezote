// Creates one demo space per app and prints the share links. Each app's Worker
// serves its own sync API under /api, so the seed talks to the app URLs.
// Data goes through the same schemas and encryption as on a phone.
//
//   npm run seed:demo -- --collecte https://rezote-collecte.example.workers.dev \
//     --route https://rezote-carnet.example.workers.dev
//
// Figures come from docs/research.md. Names and villages are illustrative.

import type { PayloadOf } from "@rezote/core";
import { createRemoteSpace } from "@rezote/core/node";
import type { RouteEvents } from "../apps/carnet-de-route/src/domain/events.ts";
import { collecte } from "../apps/collecte/src/domain/app.ts";
import { carnetDeRoute } from "../apps/carnet-de-route/src/domain/app.ts";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

const COLLECTE_URL = arg("collecte", "http://localhost:5173").replace(/\/$/, "");
const ROUTE_URL = arg("route", "http://localhost:5174").replace(/\/$/, "");

/** Deterministic pseudo-random numbers, so the demo is the same every time. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}
const rand = rng(2026);
const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
const pick = <T>(list: readonly T[]) => list[Math.floor(rand() * list.length)]!;
const id = () => crypto.randomUUID();
const MIN = 60_000;
const H = 60 * MIN;
const DAY = 24 * H;

async function seedCollecte() {
  const space = await createRemoteSpace(collecte, `${COLLECTE_URL}/api`);
  const treasurer = "demo-treasurer";
  const day0 = Date.UTC(2026, 10, 3, 8, 0); // weighing sessions start on Nov 3, 2026, 08:00 GMT (Mali time)
  let ts = day0 - DAY;

  await space.emit(
    "collecte/campaign.created",
    {
      cooperative: "Coopérative Jɛkafo de M'Pessoba",
      name: "Campagne coton 2026-2027",
      product: "Coton graine",
      grades: [
        { code: "1", label: "1er choix", pricePerKg: 300 },
        { code: "2", label: "2e choix", pricePerKg: 275 },
      ],
    },
    { ts: (ts += MIN), device: treasurer },
  );

  const collectors = [
    { collectorId: id(), name: "Adama Koné", code: "K1", device: "demo-phone-k1" },
    { collectorId: id(), name: "Fatoumata Diarra", code: "K2", device: "demo-phone-k2" },
    { collectorId: id(), name: "Siaka Dembélé", code: "K3", device: "demo-phone-k3" },
  ];
  for (const c of collectors) {
    await space.emit("collecte/collector.added", { collectorId: c.collectorId, name: c.name, code: c.code }, { ts: (ts += MIN), device: treasurer });
  }

  const villages = ["M'Pessoba", "Molobala", "Zangasso", "Konséguéla"];
  const given = ["Moussa", "Bakary", "Seydou", "Drissa", "Lassina", "Souleymane", "Mamadou", "Siaka", "Zoumana", "Yacouba", "Fousseyni", "Oumar", "Aminata", "Karim", "Issa"];
  const family = ["Coulibaly", "Diarra", "Traoré", "Dembélé", "Koné", "Sanogo", "Keïta", "Doumbia", "Togola", "Bengaly", "Goïta", "Sidibé"];
  const used = new Set<string>();
  const counters = new Map<string, number>();

  let totalWeighedG = 0;
  let firstFarmerWeighing: { weighingId: string; collector: (typeof collectors)[number]; at: number } | null = null;

  for (let v = 0; v < villages.length; v++) {
    const village = villages[v]!;
    const collector = collectors[v % collectors.length]!;
    const sessionStart = day0 + v * DAY;
    let clock = sessionStart;
    for (let n = 0; n < 10; n++) {
      let name = `${pick(given)} ${pick(family)}`;
      while (used.has(name)) name = `${pick(given)} ${pick(family)}`;
      used.add(name);
      const farmerId = id();
      await space.emit("collecte/farmer.registered", { farmerId, name, village }, { ts: clock, device: collector.device });

      const weighingId = id();
      const counter = (counters.get(collector.code) ?? 0) + 1;
      counters.set(collector.code, counter);
      clock += int(2, 6) * MIN;
      await space.emit(
        "collecte/weighing.started",
        { weighingId, receipt: `${collector.code}-${String(counter).padStart(4, "0")}`, farmerId, collectorId: collector.collectorId, at: clock },
        { ts: clock, device: collector.device },
      );
      if (!firstFarmerWeighing) firstFarmerWeighing = { weighingId, collector, at: clock };

      const bundles = int(5, 24);
      let grossMilli = 0;
      for (let b = 0; b < bundles; b++) {
        clock += int(2, 4) * MIN;
        const weightG = int(400, 1200) * 100; // 40 to 120 kg per bundle (assumption, see docs/research.md)
        const grade = rand() < 0.88 ? "1" : "2";
        totalWeighedG += weightG;
        grossMilli += weightG * (grade === "1" ? 300 : 275);
        await space.emit("collecte/bundle.recorded", { bundleId: id(), weighingId, weightG, grade, at: clock }, { ts: clock, device: collector.device });
      }
      clock += 2 * MIN;
      await space.emit("collecte/weighing.closed", { weighingId, at: clock }, { ts: clock, device: collector.device });

      // Most farms took fertilizer on credit at the subsidized price of 14 000 FCFA per 50 kg bag.
      let deducted = 0;
      if (rand() < 0.8) {
        const bags = int(2, 10);
        deducted = bags * 14_000;
        await space.emit(
          "collecte/deduction.recorded",
          { deductionId: id(), farmerId, label: `Engrais à crédit, ${bags} sacs × 14 000 FCFA`, amount: bags * 14_000, at: day0 + 12 * DAY },
          { ts: day0 + 12 * DAY + n, device: treasurer },
        );
      }
      // Payments arrive late and in parts: about half the farms got a first payment.
      const payable = Math.floor(grossMilli / 1000) - deducted;
      if (rand() < 0.5 && payable > 20_000) {
        // First payment: about half of what is owed, rounded to 5 000 FCFA.
        const amount = Math.max(5_000, Math.floor((payable * (0.3 + rand() * 0.4)) / 5_000) * 5_000);
        await space.emit(
          "collecte/payment.recorded",
          { paymentId: id(), farmerId, amount, method: rand() < 0.6 ? "mobile_money" : "cash", at: day0 + 18 * DAY },
          { ts: day0 + 18 * DAY + n, device: treasurer },
        );
      }
    }
  }

  // Flags the treasurer should see: a receipt number reused on a second phone, and a bundle typed twice.
  const k2 = collectors[1]!;
  const dupFarmer = id();
  const t = day0 + 3 * DAY + 10 * H;
  await space.emit("collecte/farmer.registered", { farmerId: dupFarmer, name: "Mariam Sanogo", village: "Zangasso" }, { ts: t, device: "demo-phone-k2-old" });
  const dupWeighing = id();
  await space.emit(
    "collecte/weighing.started",
    { weighingId: dupWeighing, receipt: `K2-${String(counters.get("K2") ?? 1).padStart(4, "0")}`, farmerId: dupFarmer, collectorId: k2.collectorId, at: t + MIN },
    { ts: t + MIN, device: "demo-phone-k2-old" },
  );
  for (let i = 0; i < 2; i++) {
    totalWeighedG += 87_500;
    await space.emit("collecte/bundle.recorded", { bundleId: id(), weighingId: dupWeighing, weightG: 87_500, grade: "1", at: t + (2 + i) * MIN }, { ts: t + (2 + i) * MIN, device: "demo-phone-k2-old" });
  }

  // Truckloads from the village store to the ginning factory.
  const loads = [
    { plate: "AB-4521-MD", share: 0.35, gap: -0.004 },
    { plate: "AB-7310-MD", share: 0.35, gap: -0.012 },
    { plate: "AB-4521-MD", share: 0.2, gap: null },
  ];
  for (let i = 0; i < loads.length; i++) {
    const l = loads[i]!;
    const loadId = id();
    const villageWeightG = Math.round((totalWeighedG * l.share) / 100) * 100;
    const at = day0 + (5 + i * 3) * DAY;
    await space.emit("collecte/load.dispatched", { loadId, plate: l.plate, villageWeightG, at }, { ts: at, device: treasurer });
    if (l.gap !== null) {
      const factoryWeightG = Math.round((villageWeightG * (1 + l.gap)) / 100) * 100;
      await space.emit("collecte/load.received", { loadId, factoryWeightG, at: at + DAY }, { ts: at + DAY, device: treasurer });
    }
  }

  const sent = await space.flush();
  return { sent, links: space.links(`${COLLECTE_URL}/`) };
}

async function seedRoute() {
  const space = await createRemoteSpace(carnetDeRoute, `${ROUTE_URL}/api`);
  const owner = "demo-owner";
  const driver = "demo-driver";
  await space.emit("route/truck.registered", { plate: "AB-1234-MD", name: "Renault Kerax rouge" }, { ts: Date.UTC(2026, 10, 1, 9), device: owner });

  // Finished trip: Abidjan → Bamako via Pogo–Zégoua, Nov 6–10, 2026.
  const t1 = id();
  const s1 = Date.UTC(2026, 10, 6, 5, 40);
  await space.emit(
    "route/trip.started",
    { tripId: t1, from: "Abidjan", to: "Bamako", corridor: "abidjan-zegoua", cargo: "Ciment, 30 t", advance: 600_000, odometerKm: 284_500, at: s1 },
    { ts: s1, device: owner },
  );
  type Step = { h: number; kind: PayloadOf<RouteEvents, "route/entry.recorded">["kind"]; place: string; amount?: number; liters?: number; price?: number; km?: number; stopH?: number; note?: string };
  // Amounts for checkpoints, weighbridges, and customs are assumptions (see docs/research.md).
  const steps: Step[] = [
    { h: 0.5, kind: "loading", place: "Port d'Abidjan", note: "30 t de ciment, bon de chargement n° 4471" },
    { h: 1, kind: "fuel", place: "Abidjan, Yopougon", liters: 150, price: 725, km: 284_520 },
    { h: 4, kind: "checkpoint", place: "Yamoussoukro", amount: 2_000 },
    { h: 6.5, kind: "weighbridge", place: "Bouaké", amount: 10_000 },
    { h: 7, kind: "meal", place: "Bouaké", amount: 3_000 },
    { h: 10, kind: "fuel", place: "Ferkessédougou", liters: 180, price: 725, km: 285_100 },
    { h: 11, kind: "rest", place: "Ferkessédougou", stopH: 7 },
    { h: 19.5, kind: "checkpoint", place: "Ouangolodougou", amount: 3_000 },
    { h: 21, kind: "border", place: "Pogo (frontière Côte d'Ivoire)", stopH: 7.25 },
    { h: 29, kind: "customs", place: "Zégoua (douane Mali)", amount: 35_000, stopH: 11.5 },
    { h: 42, kind: "checkpoint", place: "Kadiolo", amount: 5_000 },
    { h: 45, kind: "fuel", place: "Sikasso", liters: 90, price: 940, km: 285_330 },
    { h: 46, kind: "meal", place: "Sikasso", amount: 4_000 },
    { h: 52, kind: "breakdown", place: "Entre Sikasso et Bougouni", stopH: 2.1, note: "Crevaison, roue arrière droite" },
    { h: 55, kind: "repair", place: "Bougouni", amount: 10_000, stopH: 1.5, note: "Réparation du pneu" },
    { h: 57, kind: "checkpoint", place: "Bougouni", amount: 5_000 },
    { h: 58, kind: "weighbridge", place: "Bougouni", amount: 10_000 },
    { h: 60, kind: "meal", place: "Ouéléssébougou", amount: 3_000 },
    { h: 62, kind: "fuel", place: "Ouéléssébougou", liters: 40, price: 940, km: 285_610 },
    { h: 70, kind: "checkpoint", place: "Entrée de Bamako", amount: 5_000 },
    { h: 104, kind: "unloading", place: "Bamako, Sotuba", note: "Livré au dépôt" },
  ];
  let ts = s1;
  for (const s of steps) {
    const at = s1 + s.h * H;
    const entryId = id();
    const payload: PayloadOf<RouteEvents, "route/entry.recorded"> = { entryId, tripId: t1, kind: s.kind, place: s.place, at };
    if (s.liters) {
      payload.volumeCl = s.liters * 100;
      payload.pricePerLiter = s.price!;
    } else if (s.amount) payload.amount = s.amount;
    if (s.km) payload.odometerKm = s.km;
    if (s.note) payload.note = s.note;
    await space.emit("route/entry.recorded", payload, { ts: (ts = Math.max(ts + 1, at)), device: driver });
    if (s.stopH) await space.emit("route/stop.resumed", { entryId, at: at + s.stopH * H }, { ts: (ts = at + s.stopH * H), device: driver });
  }
  await space.emit(
    "route/advance.added",
    { advanceId: id(), tripId: t1, amount: 50_000, method: "mobile_money", at: s1 + 30 * H },
    { ts: s1 + 30 * H + 1, device: owner },
  );
  await space.emit("route/trip.ended", { tripId: t1, place: "Bamako, Sotuba", odometerKm: 285_690, at: s1 + 106.67 * H }, { ts: s1 + 107 * H, device: driver });

  // Trip in progress: Dakar → Bamako via Kédougou, now waiting in the queue at Moussala.
  const t2 = id();
  const s2 = Date.UTC(2026, 10, 11, 6, 15);
  await space.emit(
    "route/trip.started",
    { tripId: t2, from: "Dakar", to: "Bamako", corridor: "dakar-moussala", cargo: "Riz, 600 sacs de 50 kg", advance: 750_000, at: s2 },
    { ts: s2, device: owner },
  );
  const steps2: Step[] = [
    { h: 0.5, kind: "loading", place: "Port de Dakar" },
    { h: 1.5, kind: "fuel", place: "Dakar, Rufisque", liters: 400, price: 755, km: 285_720 },
    { h: 6, kind: "checkpoint", place: "Kaolack", amount: 2_000 },
    { h: 7, kind: "meal", place: "Kaolack", amount: 3_000 },
    { h: 14, kind: "weighbridge", place: "Tambacounda", amount: 10_000 },
    { h: 15, kind: "rest", place: "Tambacounda", stopH: 8 },
    { h: 30, kind: "fuel", place: "Kédougou", liters: 270, price: 755, km: 286_420 },
    { h: 33, kind: "checkpoint", place: "Saraya", amount: 2_000 },
    { h: 36, kind: "border", place: "Moussala (file d'attente)", note: "File de camions sur plusieurs kilomètres" },
  ];
  ts = s2;
  for (const s of steps2) {
    const at = s2 + s.h * H;
    const entryId = id();
    const payload: PayloadOf<RouteEvents, "route/entry.recorded"> = { entryId, tripId: t2, kind: s.kind, place: s.place, at };
    if (s.liters) {
      payload.volumeCl = s.liters * 100;
      payload.pricePerLiter = s.price!;
    } else if (s.amount) payload.amount = s.amount;
    if (s.km) payload.odometerKm = s.km;
    if (s.note) payload.note = s.note;
    await space.emit("route/entry.recorded", payload, { ts: (ts = Math.max(ts + 1, at)), device: driver });
    if (s.stopH) await space.emit("route/stop.resumed", { entryId, at: at + s.stopH * H }, { ts: (ts = at + s.stopH * H), device: driver });
  }

  const sent = await space.flush();
  return { sent, links: space.links(`${ROUTE_URL}/`) };
}

const c = await seedCollecte();
const r = await seedRoute();
console.log(JSON.stringify({ collecte: c, carnetDeRoute: r }, null, 2));
