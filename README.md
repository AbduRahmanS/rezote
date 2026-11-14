# Rezote 👻

**Rezote** (from Bambara *rezo tɛ*, "no network") is a template for web apps that keep working where the mobile network is weak or absent, as in villages and on the roads of Mali and West Africa. Every action is saved on the phone first. Changes that have not reached the server yet are shown as ghosts 👻 and come back to life on the server when the network returns. Everything is encrypted on the phone, so the server stores data it cannot read.

Built for the Kiroween 2026 hackathon, **Skeleton Crew** category: one skeleton, two very different apps.

| App | Folder | Who uses it | What it replaces |
|---|---|---|---|
| **Collecte** | [`apps/collecte`](apps/collecte) | Cotton cooperatives: collectors in the villages, the treasurer in town | Three paper notebooks per weighing session, and disputes over weights and payments |
| **Carnet de route** | [`apps/carnet-de-route`](apps/carnet-de-route) | Truck drivers on the Dakar–Bamako and Abidjan–Bamako corridors, and truck owners | Phone calls and arguments about fuel, fees, and delays |

Demo links: _added after deployment (see [docs/deploy.md](docs/deploy.md))._

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

## How Rezote works

```
 Phone (offline-first)                                   Sync server (Cloudflare Worker + D1)
 ┌───────────────────────────────────────────┐           ┌─────────────────────────────────┐
 │ screen ─ app.emit(type, payload)          │           │ stores envelopes:               │
 │   │ validate (valibot)                    │  push     │   id, space, ts, device,        │
 │   │ encrypt (AES-GCM, key E from link)    ├──────────►│   iv, ciphertext                │
 │   │ save event + outbox (IndexedDB, 1 tx) │  pull     │ never sees keys or contents     │
 │   ▼                                       │◄──────────┤ idempotent by event id          │
 │ projection = pure function of all events  │  cursor   │ cursor = server sequence number │
 │ 👻 = still in the outbox                  │           └─────────────────────────────────┘
 └───────────────────────────────────────────┘
```

- **Events, not rows.** Every action appends an immutable event. Corrections are cancellation events with a reason, so the history explains every number.
- **Same result on every phone.** Views are pure functions of the event set, replayed in `(ts, id)` order. Merging two phones is a set union, which is commutative, associative, and idempotent. Property-based tests check this for the skeleton and for every app rule.
- **Sync.** Push the outbox in batches of 500, then pull everything after the last cursor. Retries back off at 2, 4, 8 s and so on, capped at 5 minutes. The server ignores duplicates, so a lost response never creates a double entry.
- **Offline app shell.** After the first visit, the service worker serves the app with no network.
- **Small.** Each app's first load is under 40 KB gzip, against a 150 KB budget enforced in CI. No web fonts, map tiles, analytics, or third-party scripts.

### Security model and limits

- A space (one campaign, one truck) has a random ID, a 256-bit encryption key **E**, and a 128-bit write key **W**, all created on the phone.
- **Write link** `#s=…&e=E&w=W`: record and read. **Read link** `#s=…&e=E`: read only. Keys travel in the URL fragment, which browsers never send to servers, and the app removes them from the address bar after joining.
- The server stores only `SHA-256(W)` and checks it on every write. Ciphertexts are bound to their envelope (ID, space, time, device), so they cannot be moved or replayed into another event.
- **Limits:** anyone holding a link has its rights; links cannot be revoked in this version (create a new space instead); losing every link means losing access; data on an unlocked phone is readable by whoever holds the phone; everyone with the write link is trusted to write.

## Run it locally

Requires Node 22.

```bash
npm ci
npm run icons                  # generates the app icons
npm run dev:server             # sync server on http://localhost:8787 (wrangler dev + local D1)
npm run dev:collecte           # http://localhost:5173
npm run dev:route              # http://localhost:5174
```

The first time, create the local database with `cd server && npx wrangler d1 migrations apply rezote --local`.

Checks:

```bash
npm test             # unit and property-based tests
npm run typecheck
npm run lint
npm run build && npm run check:size
npm run seed:demo    # fills a local server with a realistic campaign and two truck trips
```

Deployment to Cloudflare (free plan): [docs/deploy.md](docs/deploy.md). Building another app on the skeleton: [docs/new-app.md](docs/new-app.md).

## How Kiro was used

- **Spec-driven development.** [`.kiro/specs/rezote`](.kiro/specs/rezote) holds the requirements (testable acceptance criteria), the design (event model, sync protocol, encryption, projections, testing plan), and the task list. The spec went through several rounds: the app ideas changed after we judged them against "does missing network really hurt here?", and field research changed the design. For example, Collecte records each bundle with a running subtotal because that is how village weighing works, and Carnet de route got a "convoy wait" stop and writers-only GPS because of attacks on the corridors.
- **Steering.** [`.kiro/steering`](.kiro/steering): `product.md` (users, tone, safety rules), `tech.md` (stack, size budget, integer money and weights, immutable events, server never reads payloads), `structure.md` (where code goes; the skeleton must not import apps).
- **Hooks.** [`.kiro/hooks`](.kiro/hooks): run the unit and property tests when skeleton, domain, or server code is saved; check the money and ordering rules when a projection changes; build and enforce the size budget at the end of each agent turn.
- **Property-based testing** with fast-check: order and duplicate invariance of every projection, merge laws, "no event is ever lost" against a server that fails and loses responses at random, encryption round trip and tamper detection, read keys cannot open writers-only fields, rounding per farmer, store and balance identities, cancellation equals never recorded, stop times never negative, and format round trips.
- **MCP.** Context7 to check current Cloudflare Workers documentation (rate limiting binding).

## Project structure

```
packages/core/   skeleton: events, crypto, storage, sync, runtime, formats, router, UI shell
apps/collecte/   app 1 (domain/ is pure and tested; screens/ is UI)
apps/carnet-de-route/  app 2
server/          sync server (Hono, D1) and its tests
scripts/         size budget, icons, demo seed
docs/            research, deployment, new app guide
.kiro/           specs, steering, hooks
```

## License

[MIT](LICENSE)
