import { rezoteConfig } from "@rezote/core/vite";
import { defineConfig } from "vite";

export default defineConfig(
  rezoteConfig({
    name: "Carnet de route · Rezote",
    shortName: "Carnet",
    description: "Trajet, dépenses et arrêts du camion, même sur les routes sans réseau.",
    port: 5174,
  }),
);
