import { rezoteConfig } from "@rezote/core/vite";
import { defineConfig } from "vite";

export default defineConfig(
  rezoteConfig({
    name: "Collecte · Rezote",
    shortName: "Collecte",
    description: "Pesée du coton au village et paiement des producteurs, même sans réseau.",
    port: 5173,
  }),
);
