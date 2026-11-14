import { defineApp } from "@rezote/core";
import { events } from "./events.ts";
import { project } from "./project.ts";

export const collecte = defineApp({
  name: "collecte",
  events,
  project,
});

export const DEFAULT_GRADES = [
  { code: "1", label: "1er choix", pricePerKg: 300 },
  { code: "2", label: "2e choix", pricePerKg: 275 },
];
