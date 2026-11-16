// Plain-text trip summary. It never includes GPS positions.

import { formatDuration, formatNumber, formatShortDate, formatTime, NBSP } from "@rezote/core";
import { CORRIDORS, KINDS, type Kind } from "./events.ts";
import type { RouteView, Trip } from "./project.ts";

export function corridorLabel(c: string): string {
  return (CORRIDORS as Record<string, string>)[c] ?? c;
}

/** "via Pogo–Zégoua", or the full label for "other". */
export function corridorVia(c: string): string {
  const via = corridorLabel(c).split(" via ")[1];
  return via ? `via ${via}` : corridorLabel(c);
}

export function tripSummary(view: RouteView, trip: Trip, now = Date.now()): string {
  const lines: string[] = [];
  const truck = view.truck ? `Camion ${view.truck.plate}` : "Camion";
  const route = corridorLabel(trip.corridor).split(" via ")[1];
  const via = trip.corridor !== "other" && route ? ` (via ${route})` : "";
  lines.push(`${truck}, ${trip.from} → ${trip.to}${via}`);
  lines.push(`Chargement : ${trip.cargo}`);
  const start = `Départ ${formatShortDate(trip.startAt)} ${formatTime(trip.startAt)}`;
  if (trip.ended) {
    lines.push(`${start}, arrivée ${formatShortDate(trip.ended.at)} ${formatTime(trip.ended.at)} (${formatDuration(trip.ended.at - trip.startAt)})`);
  } else {
    lines.push(`${start}, en route depuis ${formatDuration(now - trip.startAt)}`);
    if (trip.lastReport) lines.push(`Dernière position signalée : ${trip.lastReport.place}, ${formatShortDate(trip.lastReport.at)} ${formatTime(trip.lastReport.at)}`);
  }
  const money = (n: number) => `${formatNumber(n)}${NBSP}FCFA`;
  lines.push(`Avances ${money(trip.totalAdvances)}, dépenses ${money(trip.totalExpenses)}, ${trip.balance >= 0 ? "reste" : "à rembourser au chauffeur"} ${money(Math.abs(trip.balance))}`);
  const kinds = (Object.entries(trip.expensesByKind) as [Kind, number][]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  if (kinds.length) lines.push(kinds.map(([k, v]) => `${KINDS[k].label} ${formatNumber(v)}`).join(" · "));
  const stops = (Object.entries(trip.stoppedByKind) as [Kind, number][]).filter(([, v]) => v > 0);
  if (stops.length) lines.push(`Arrêts : ${stops.map(([k, v]) => `${KINDS[k].label.toLowerCase()} ${formatDuration(v)}`).join(", ")}`);
  for (const s of trip.openStops) lines.push(`En cours : ${KINDS[s.kind].label.toLowerCase()} à ${s.place} depuis ${formatDuration(now - s.at)}`);
  if (trip.consumption !== null) lines.push(`Consommation estimée : ${Math.round(trip.consumption)} L/100 km`);
  return lines.join("\n");
}
