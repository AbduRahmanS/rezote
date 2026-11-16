# Rezote 👻

**Rezote** (from Bambara *rezo tɛ*, "no network") is a template for web apps that keep working where the mobile network is weak or absent, as in villages and on the roads of Mali and West Africa. Every action is saved on the phone first. Changes that have not reached the server yet are shown as ghosts 👻 and come back to life on the server when the network returns. Everything is encrypted on the phone, so the server stores data it cannot read.

Built for the Kiroween 2026 hackathon, **Skeleton Crew** category: one skeleton, two very different apps, built with TanStack Start.

| App | Folder | Who uses it | What it replaces |
|---|---|---|---|
| **Collecte** | [`apps/collecte`](apps/collecte) | Cotton cooperatives: collectors in the villages, the treasurer in town | Three paper notebooks per weighing session, and disputes over weights and payments |
| **Carnet de route** | [`apps/carnet-de-route`](apps/carnet-de-route) | Truck drivers on the Dakar–Bamako and Abidjan–Bamako corridors, and truck owners | Phone calls and arguments about fuel, fees, and delays |

**Live apps:** [collecte.abdrahamane.dev](https://collecte.abdrahamane.dev) · [carnet.abdrahamane.dev](https://carnet.abdrahamane.dev)

**Demo data (read-only links):**

- [Collecte: a cotton campaign with 41 farmers, about 50 t weighed, 3 truckloads, and 3 flags](https://collecte.abdrahamane.dev/#s=oSSQJhlPV5DvqdY7ma6NTQ&e=wot4_-EZQ1AJ4y2xX9PEebeLVsHedbeg-gqHC6IfY7U)
- [Carnet de route: a finished Abidjan → Bamako trip and a Dakar trip waiting at Moussala](https://carnet.abdrahamane.dev/#s=KMgC9oz_yW5FTZzpj_gI2g&e=A2JBdogwhZuGgCkT-4hTBNwAHM0EmZWNYzZTNMDHMHg)

To try recording data, open an app and create your own campaign or truck. Turn on airplane mode to see the ghosts 👻, then turn it off to watch them sync.

## The problem

- At the end of the season, each farm's cotton is weighed bundle by bundle on the village scale. Today three people write every weight in three notebooks with a running subtotal, and the totals decide most of the farm's yearly income. The village total is weighed again at the ginning factory, and the village association answers for any gap.
- Trucks bring most of Mali's imports from the ports of Dakar and Abidjan. In 2026 the northern road through Kidira closed, and trucks wait days at Moussala or for military convoys. Owners cannot see costs or delays until the driver has network again.

In both cases the data is recorded where there is no network, and several people need the same numbers. Sources are listed in [docs/research.md](docs/research.md).

## Collecte

- **Collector, offline:** registers farmers, weighs each bundle (*bâche*) with a large keypad and grade buttons, and sees the running subtotal and gross amount after each bundle, as in the notebooks. Receipt numbers such as `K2-0042` are unique without network because each collector has a code. The receipt goes to the farmer by WhatsApp or SMS through the phone's share menu.
- **Treasurer:** sees, per farmer, weight per grade, gross amount, deductions (fertilizer on credit), payments, and balance. Also totals per village and collector, the weight still in the store, and each truckload's village weight against its factory weight. CSV export for Excel.
- **Flags:** a receipt number used twice (same collector on two phones), two identical bundles less than 2 minutes apart, an overpaid farmer, a collector code used twice.
- **Money rule:** the gross amount is computed from exact gram totals and rounded down once per farmer, so rounding never grows with the number of bundles.

## Carnet de route

- **Driver, offline:** big buttons for fuel, checkpoint, weighbridge, customs, border, convoy wait, breakdown, repair, rest, meal, toll, and more. Fuel takes liters and price per liter (presets for Mali 940, Côte d'Ivoire 725, Sénégal 755 FCFA/L). Long stops have a "Reprendre la route" button that measures the stop.
- **Owner:** last place and time reported, when the driver's phone last synced, advances against expenses (the cash the driver should still have), time stopped by kind, estimated fuel consumption, and a full timeline. A trip summary can be shared as text.
- **Safety:** a truck's position is life-safety data on corridors where convoys are attacked. GPS is **off by default**. Positions are encrypted with a second key that only write-link holders have, so read-link holders (for example a client waiting for goods) never see them, and shared summaries never include them.

## Tech stack

| Layer | Technology |
|---|---|
| Framework | **TanStack Start** (React 19) in SPA mode, deployed as a Cloudflare Worker |
| Routing | **TanStack Router**: file-based routes, typed params, search params validated with Zod |
| Forms | **TanStack Form** with **Zod** field validators |
| State | **TanStack Store** (runtime state, sync status, ghosts, per-phone settings) |
| Schemas | **Zod 4**: every event payload is validated on write and again when another phone decrypts it |
| Local storage | IndexedDB via `idb` |
| Encryption | Web Crypto API (AES-GCM, HKDF, SHA-256), no library |
| Sync API | `packages/sync-api`: framework-free handlers mounted in a TanStack Start server route (`/api/$`), Cloudflare D1 |
| Offline shell | Service worker generated after the build from the prerendered SPA shell (`scripts/build-sw.mjs`) |
| Tests | Vitest, fast-check (property-based), fake-indexeddb, Node's built-in SQLite for the API |
| Lint | ESLint with typescript-eslint, `@tanstack/eslint-plugin-router`, `@tanstack/eslint-plugin-query`, React hooks rules |

TanStack Query is not used: the apps read from the phone, not from server queries, and the sync engine owns all network calls. TanStack DB was considered for its offline transactions and left out: it is a release candidate, and its mutable-row model does not fit immutable, end-to-end-encrypted events.

## How Rezote works

```
 Phone (offline-first)                                Cloudflare Worker (one per app)
 ┌──────────────────────────────────────────┐         ┌────────────────────────────────────┐
 │ TanStack Router screens                  │  first  │ static app + prerendered SPA shell │
 │   │ app.emit(type, payload)              │  visit  │                                    │
 │   │ validate (Zod)                       │◄────────┤ /api/$  (TanStack Start route)     │
 │   │ encrypt (AES-GCM, key E from link)   │         │   → @rezote/sync-api               │
 │   │ save event + outbox (IndexedDB, 1 tx)│  push   │   stores envelopes in D1:          │
 │   ▼                                      ├────────►│   id, space, ts, device, iv, ct    │
 │ view = pure projection of all events     │  pull   │   never sees keys or contents      │
 │ 👻 = still in the outbox                 │◄────────┤   idempotent by event id           │
 │ service worker: opens with no network    │ cursor  │                                    │
 └──────────────────────────────────────────┘         └────────────────────────────────────┘
```

- **Events, not rows.** Every action appends an immutable event. Corrections are cancellation events with a reason, so the history explains every number.
- **Same result on every phone.** Views are pure functions of the event set, replayed in `(ts, id)` order. Merging two phones is a set union, which is commutative, associative, and idempotent. Property-based tests check this for the skeleton and for every app rule.
- **Sync.** Push the outbox in batches of 500, then pull everything after the last cursor. Retries back off at 2, 4, 8 s and so on, capped at 5 minutes. The server ignores duplicates, so a lost response never creates a double entry.
- **Same origin.** Each app's Worker serves its own `/api`, so there is no CORS, and each Worker only serves spaces of its own app even though both share one database.
- **Offline app shell.** TanStack Start prerenders the SPA shell; the service worker precaches it with every asset and serves it for every page, so the app opens with no network after the first visit.
- **Size.** Each app's first load is about 180 KB gzip, checked in CI against a 250 KB budget. No web fonts, map tiles, analytics, or third-party scripts.

### Security model and limits

- A space (one campaign, one truck) has a random ID, a 256-bit encryption key **E**, and a 128-bit write key **W**, all created on the phone.
- **Write link** `#s=…&e=E&w=W`: record and read. **Read link** `#s=…&e=E`: read only. Keys travel in the URL fragment, which browsers never send to servers, and the app removes them from the address bar after joining.
- The server stores only `SHA-256(W)` and checks it on every write. Ciphertexts are bound to their envelope (ID, space, time, device), so they cannot be moved or replayed into another event.
- Content-Security-Policy allows only the app's own scripts, plus the SHA-256 hashes of TanStack Start's inline bootstrap scripts, computed at build time.
- **Limits:** anyone holding a link has its rights; links cannot be revoked in this version (create a new space instead); losing every link means losing access; data on an unlocked phone is readable by whoever holds the phone; everyone with the write link is trusted to write.

## Run it locally

Requires Node 22.

```bash
npm ci
npm run icons
# Create the local database once per app
(cd apps/collecte && npx wrangler d1 migrations apply rezote --local)
(cd apps/carnet-de-route && npx wrangler d1 migrations apply rezote --local)

npm run dev:collecte   # http://localhost:5173 (app + /api, local D1)
npm run dev:route      # http://localhost:5174
```

Checks:

```bash
npm test             # unit and property-based tests
npm run typecheck
npm run lint
npm run build && npm run check:size
npm run seed:demo    # with the two apps running: a realistic cotton campaign and two truck trips
```

Deployment to Cloudflare (free plan): [docs/deploy.md](docs/deploy.md). Building another app on the skeleton: [docs/new-app.md](docs/new-app.md).

## How Kiro was used

- **Spec-driven development.** [`.kiro/specs/rezote`](.kiro/specs/rezote) holds the requirements (testable acceptance criteria), the design (event model, sync protocol, encryption, projections, testing plan), and the task list. The spec went through several rounds: the app ideas changed after we judged them against "does missing network really hurt here?", field research changed the design (bundle-by-bundle weighing, factory gap, convoy waits, writers-only GPS), and the stack moved to TanStack Start with the sync API inside each app's Worker.
- **Steering.** [`.kiro/steering`](.kiro/steering): `product.md` (users, tone, safety rules), `tech.md` (stack, size budget, integer money and weights, immutable events, server never reads payloads), `structure.md` (where code goes; the skeleton must not import apps).
- **Hooks.** [`.kiro/hooks`](.kiro/hooks): run the unit and property tests when skeleton, domain, or API code is saved; check the money and ordering rules when a projection changes; build and enforce the size budget at the end of each agent turn.
- **Property-based testing** with fast-check: order and duplicate invariance of every projection, merge laws, "no event is ever lost" against a server that fails and loses responses at random, encryption round trip and tamper detection, read keys cannot open writers-only fields, rounding per farmer, store and balance identities, cancellation equals never recorded, stop times never negative, and format round trips.
- **MCP.** Context7 for current documentation of TanStack Start (SPA mode, server routes) and Cloudflare Workers (rate limiting, TanStack Start deployment, bindings).
- **End-to-end checks.** A headless browser played four phones against the real Workers and local D1: offline weighing with ghosts, reconnect and sync, read-only links, offline reload through the service worker, and a database that contains no clear text.

## Project structure

```
packages/core/       skeleton: events, crypto, storage, sync, runtime, formats; react/ (shell, widgets, hooks, styles)
packages/sync-api/   sync API handlers (framework-free) and D1 migrations
apps/collecte/       app 1: src/domain (pure, tested), src/routes (TanStack Router), wrangler.jsonc
apps/carnet-de-route/  app 2
scripts/             size budget, service worker, icons, demo seed
docs/                research, deployment, new app guide
.kiro/               specs, steering, hooks
```

## License

[MIT](LICENSE)
