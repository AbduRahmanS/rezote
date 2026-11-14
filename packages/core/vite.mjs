// Shared Vite configuration for Rezote apps: Preact and an offline app shell.
// Plain JavaScript so that Vite can load it without compiling TypeScript.

import preact from "@preact/preset-vite";
import { VitePWA } from "vite-plugin-pwa";

/**
 * @param {{ name: string, shortName: string, description: string, themeColor?: string, port?: number }} app
 * @returns {import("vite").UserConfig}
 */
export function rezoteConfig(app) {
  return {
    plugins: [
      preact(),
      VitePWA({
        registerType: "autoUpdate",
        injectRegister: "auto",
        includeAssets: ["icon.svg"],
        manifest: {
          name: app.name,
          short_name: app.shortName,
          description: app.description,
          lang: "fr",
          start_url: "./",
          scope: "./",
          display: "standalone",
          background_color: "#0e0f13",
          theme_color: app.themeColor ?? "#0e0f13",
          icons: [
            { src: "icon-192.png", sizes: "192x192", type: "image/png" },
            { src: "icon-512.png", sizes: "512x512", type: "image/png" },
            { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          ],
        },
        workbox: {
          // Everything the app needs is precached, so it opens without network after the first visit.
          globPatterns: ["**/*.{js,css,html,svg,png,webmanifest}"],
          navigateFallback: "index.html",
          cleanupOutdatedCaches: true,
        },
      }),
    ],
    build: {
      target: "es2020",
      sourcemap: false,
      reportCompressedSize: true,
    },
    server: { port: app.port, host: true },
    preview: { port: app.port, host: true },
  };
}
