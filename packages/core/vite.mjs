// Shared Vite configuration for Rezote apps: TanStack Start in SPA mode on
// Cloudflare Workers, with React. The offline service worker is generated after
// the build by scripts/build-sw.mjs (it needs the prerendered shell).
// Plain JavaScript so Vite can load it without compiling TypeScript.

import { cloudflare } from "@cloudflare/vite-plugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";

/**
 * @param {{ port?: number }} app
 * @returns {import("vite").UserConfig}
 */
export function rezoteConfig(app = {}) {
  return {
    plugins: [
      cloudflare({ viteEnvironment: { name: "ssr" } }),
      // SPA mode: pages render in the browser only, because all data lives in the
      // phone's IndexedDB. The build prerenders a shell at /_shell.html.
      tanstackStart({ spa: { enabled: true } }),
      viteReact(),
    ],
    server: { port: app.port, host: true },
    preview: { port: app.port, host: true },
  };
}
