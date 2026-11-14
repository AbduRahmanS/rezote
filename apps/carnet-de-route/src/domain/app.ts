import { defineApp } from "@rezote/core";
import { events, writersOnly } from "./events.ts";
import { project } from "./project.ts";

export const carnetDeRoute = defineApp({
  name: "carnet-de-route",
  events,
  writersOnly,
  project,
});

/** Regulated diesel prices, FCFA per liter (sources in docs/research.md). */
export const DIESEL_PRICES = [
  { country: "Mali", price: 940 },
  { country: "Côte d'Ivoire", price: 725 },
  { country: "Sénégal", price: 755 },
];
