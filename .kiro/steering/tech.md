# Tech rules

## Stack

- TypeScript strict, npm workspaces, Node 22.
- UI: Preact 10 + `@preact/signals`. Build: Vite. Offline shell: `vite-plugin-pwa` (Workbox precache).
- Local storage: IndexedDB through `idb`, only via `Storage` in `packages/core`. No `localStorage`.
- Validation: `valibot`. Encryption: Web Crypto API only (AES-GCM, HKDF, SHA-256).
- Server: Hono on Cloudflare Workers with D1. Tests: Vitest + fast-check + fake-indexeddb.
- Use Context7 (MCP) to check current APIs of Hono, Wrangler, D1, Workbox, and Preact before writing code that depends on them.

## Hard rules

- **Size budget:** each app's first load must stay under 150 KB gzip (`npm run check:size`). No web fonts, map tiles, analytics, or third-party scripts. Ask before adding a runtime dependency.
- **Integers only for money and weights:** FCFA as integers, weights as integer grams (multiples of 100), fuel as integer centiliters. Round once, at the latest possible step, and document where.
- **Events are immutable.** New features add event types; they never change the meaning of an existing type. Corrections are `*.cancelled` events.
- **Projections are pure functions** of the canonical event list (sorted by `(ts, id)`, no duplicates). They must give the same result for any arrival order. Add a fast-check property for every new projection rule.
- **The server never reads payloads.** It validates envelopes only; phones validate payloads with the app schemas when they decrypt.
- **Writers-only fields** (for example truck positions) must be optional in the schema and listed in the app's `writersOnly`.
- **Keys stay in URL fragments** (`#s=…&e=…&w=…`) and are removed from the address bar after joining.
- All SQL uses bound parameters.

## Commands

- `npm test` (all unit and property tests), `npm run typecheck`, `npm run lint`
- `npm run build` then `npm run check:size`
- `npm run dev:server`, `npm run dev:collecte`, `npm run dev:route`
