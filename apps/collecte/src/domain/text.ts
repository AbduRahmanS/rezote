// Plain-text receipts and CSV exports.

import { formatDate, formatDateTime, formatFCFA, formatKg, formatNumber, NBSP } from "@rezote/core";
import type { CollecteView, Farmer, Weighing } from "./project.ts";

export function gradeLabel(view: CollecteView, code: string): string {
  return view.grades.get(code)?.label ?? code;
}

/** Receipt for one weighing, to send to the farmer by WhatsApp or SMS. */
export function receiptText(view: CollecteView, w: Weighing): string {
  const farmer = view.farmerById.get(w.farmerId);
  const collector = view.collectorById.get(w.collectorId);
  const c = view.campaign;
  const lines: string[] = [];
  if (c) lines.push(`${c.cooperative}, ${c.name}`);
  lines.push(`Reçu ${w.receipt}, ${formatDateTime(w.at)}`);
  if (farmer) lines.push(`${farmer.name} (${farmer.village})`);
  const parts = Object.entries(w.weightByGrade).map(([code, g]) => {
    const price = view.grades.get(code)?.pricePerKg;
    return `${gradeLabel(view, code)} ${formatKg(g)}${price ? ` à ${formatNumber(price)}${NBSP}F/kg` : ""}`;
  });
  lines.push(`${w.bundleCount} bâche${w.bundleCount > 1 ? "s" : ""} : ${parts.join(", ") || "aucune"}`);
  lines.push(`Total : ${formatKg(w.totalG)}`);
  lines.push(`Montant brut : ${formatFCFA(w.gross)}`);
  if (collector) lines.push(`Collecteur : ${collector.name} (${collector.code})`);
  if (w.cancelled) lines.push(`ANNULÉ : ${w.cancelled}`);
  return lines.join("\n");
}

/** Statement of a farmer's account: weight, gross, deductions, payments, balance. */
export function farmerStatement(view: CollecteView, f: Farmer): string {
  const c = view.campaign;
  const lines: string[] = [];
  if (c) lines.push(`${c.cooperative}, ${c.name}`);
  lines.push(`Relevé de ${f.name} (${f.village}) au ${formatDate(Date.now())}`);
  for (const [code, g] of Object.entries(f.weightByGrade)) lines.push(`${gradeLabel(view, code)} : ${formatKg(g)}`);
  lines.push(`Montant brut : ${formatFCFA(f.gross)}`);
  for (const d of f.deductions.filter((x) => !x.cancelled)) lines.push(`− ${d.label} : ${formatFCFA(d.amount)}`);
  for (const p of f.payments.filter((x) => !x.cancelled)) {
    lines.push(`− Payé le ${formatDate(p.at)} (${p.method === "cash" ? "espèces" : "mobile money"}) : ${formatFCFA(p.amount)}`);
  }
  lines.push(`Reste à payer : ${formatFCFA(f.balance)}`);
  return lines.join("\n");
}

const kg = (g: number) => (g / 1000).toFixed(1).replace(".", ",");

export function bundlesCsv(view: CollecteView): (string | number)[][] {
  const rows: (string | number)[][] = [
    ["Reçu", "Date", "Producteur", "Village", "Collecteur", "Bâche n°", "Qualité", "Poids (kg)", "Annulé"],
  ];
  for (const w of [...view.weighingById.values()].sort((a, b) => a.at - b.at)) {
    const f = view.farmerById.get(w.farmerId);
    const c = view.collectorById.get(w.collectorId);
    for (const b of w.bundles) {
      rows.push([
        w.receipt,
        formatDateTime(b.at),
        f?.name ?? "?",
        f?.village ?? "?",
        c?.name ?? "?",
        b.number || "",
        gradeLabel(view, b.grade),
        kg(b.weightG),
        w.cancelled ?? b.cancelled ?? "",
      ]);
    }
  }
  return rows;
}

export function balancesCsv(view: CollecteView): (string | number)[][] {
  const codes = [...view.grades.keys()];
  const rows: (string | number)[][] = [
    ["Producteur", "Village", ...codes.map((c) => `${gradeLabel(view, c)} (kg)`), "Total (kg)", "Brut (FCFA)", "Retenues (FCFA)", "Payé (FCFA)", "Solde (FCFA)"],
  ];
  for (const f of view.farmers) {
    rows.push([
      f.name,
      f.village,
      ...codes.map((c) => kg(f.weightByGrade[c] ?? 0)),
      kg(f.totalG),
      f.gross,
      f.deductionsTotal,
      f.paidTotal,
      f.balance,
    ]);
  }
  return rows;
}
