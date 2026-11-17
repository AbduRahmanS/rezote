# Tech rules

## Stack

- TypeScript strict, npm workspaces, Node 22.
- **TanStack Start** (React 19) in SPA mode, one Cloudflare Worker per app. Pages render in the browser only; the Worker serves the static app and the sync API under `/api` (server route `src/routes/api/$.ts`).
- **TanStack Router** file-based routes. Validate search params with Zod (`validateSearch`). Use `<Link>` and `useNavigate`, never `location.hash` or plain `<a>` for in-app navigation.
- **TanStack Form** with Zod field validators for forms. **TanStack Store** for shared client state (runtime, sync status, per-phone settings).
- **shadcn/ui** components in `packages/ui` (add more with `npx shadcn@latest add <name>` from that folder, then fix the `cn` import to `../lib/utils.ts`), Tailwind CSS v4, lucide icons, sonner toasts.
- **Zod 4** for event schemas. Do not add TanStack Query or TanStack DB without discussing it first: data is local-first and the sync engine owns all network calls.
- Local storage: IndexedDB through `idb`, only via `Storage` in `packages/core`. No `localStorage`.
- Encryption: Web Crypto API only (AES-GCM, HKDF, SHA-256).
- Sync API: `packages/sync-api` (framework-free Request → Response) with Cloudflare D1. Tests: Vitest + fast-check + fake-indexeddb + `node:sqlite`.
- Use Context7 (MCP) to check current APIs of TanStack Start, Router, Form, Store, Zod, and Cloudflare Workers before writing code that depends on them.

## Hard rules

- **Size budget:** each app's first load must stay under 300 KB gzip (raised to 300 KB; currently about 245 to 255 KB). No web fonts, map tiles, analytics, or third-party scripts. Ask before adding a runtime dependency.
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
- `npm run dev:collecte`, `npm run dev:route` (app + /api with a local D1; apply migrations first, see README)
- Browser APIs (IndexedDB, `window`, `navigator`) only inside effects or event handlers: the shell is prerendered on the server at build time.

## Interface rules

In `ui.md`, which Kiro loads only when a screen, component, or theme file is in context.

## New apps

`npm run new-app -- <slug> "<Name>"` creates a working app from `templates/app` (spec: `.kiro/specs/new-app-command`, skill: `new-rezote-app`). Change the template, not a generated copy, when the starter itself must change; CI builds a fresh one on every push.
