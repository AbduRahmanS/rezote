# Design: Rezote

## Overview

Rezote is an npm-workspaces monorepo with the skeleton, a framework-free sync API, and two TanStack Start apps. Each app deploys as one Cloudflare Worker that serves the app and its own sync API under `/api`; both Workers share one D1 database.

```
rezote/
├── .kiro/                    specs, steering, hooks (required by the rules)
├── packages/core/            the skeleton: events, crypto, storage, outbox, sync, runtime, formats; react/ UI shell
├── packages/sync-api/        sync API handlers (Request → Response) and D1 migrations
├── apps/collecte/            app 1: cooperative cotton weighing and payments
├── apps/carnet-de-route/     app 2: truck trip log
├── scripts/                  size budget, offline service worker, icons, demo data
├── docs/                     research, deployment, guide for a third app
├── LICENSE                   MIT
└── README.md
```

The core idea is event sourcing. Apps never update or delete rows. Every user action appends an immutable event, and the app state (the "projection") is computed by replaying events. This makes offline sync simple: syncing two devices means taking the union of their events, and the union is the same whatever order the events arrive in. It also gives a full history, which treasurers and truck owners need when there is a dispute.

## Technology choices

| Concern | Choice | Why | Rejected alternative |
|---|---|---|---|
| Language | TypeScript (strict) | Typed event schemas | Plain JS |
| Framework | TanStack Start (React 19), SPA mode | Type-safe routing and server routes in one framework; deploys to Cloudflare Workers; SPA mode because data lives on the phone | Preact + Vite (first version: smaller, but no framework-level routing, forms, or server routes) |
| Routing | TanStack Router, file-based | Typed params and Zod-validated search params | Hash router (first version) |
| Forms | TanStack Form + Zod | Field-level validation with the same schema library as the events | Hand-written forms |
| Client state | TanStack Store | Fine-grained subscriptions from React (`useSelector`) | Preact signals (first version) |
| Server data | none (no TanStack Query) | Screens read from the phone; the sync engine owns network calls | TanStack Query would only wrap two calls |
| Offline data layer | own event store + sync engine | Immutable, end-to-end-encrypted events with tested guarantees | TanStack DB offline transactions: release candidate, mutable-row model |
| Validation | Zod 4 | Event schemas and form validators | valibot (first version) |
| Local storage | IndexedDB via `idb` | Works offline, large quota | localStorage (5 MB limit, synchronous) |
| Offline shell | Service worker generated after the build (`scripts/build-sw.mjs`) | Must include the prerendered `/_shell.html`, written after the client build; small and explicit | `vite-plugin-pwa` (conflicting Babel peer dependencies with the React plugin, and runs before the shell exists) |
| Encryption | Web Crypto API | Built into browsers and Workers, adds 0 KB | libsodium (about 100 KB) |
| Sync API | `packages/sync-api` mounted in a Start server route | Same origin (no CORS), one deploy per app, framework-free and unit-tested | Separate Hono Worker (first version) |
| Database | Cloudflare D1 | Free tier, SQLite | Supabase or Firebase |
| Tests | Vitest + fast-check + fake-indexeddb + `node:sqlite` | Unit and property-based tests in one runner; real SQL without Cloudflare tooling | Jest |

## Data model

### Event (in memory and in local storage, decrypted)

```ts
interface Event<T extends string = string, P = unknown> {
  id: string;          // crypto.randomUUID()
  space: string;       // space ID, 22-char base64url (128 random bits)
  type: T;             // e.g. "collecte/bundle.recorded"
  payload: P;          // validated by the app's schema for this type
  ts: number;          // device clock, ms since epoch, when created
  device: string;      // random device ID, stored locally
  seq?: number;        // server sequence number, set by the server
  receivedAt?: number; // server clock when first stored, set by the server
}
```

Events are replayed in `(ts, id)` order. This order is total and identical on every device, so the same set of events gives the same projection (Requirement 2.7). When the business meaning depends on when something happened (a bundle weighed, a truck stop), the payload carries its own `at` time.

### Envelope (what the server stores)

```ts
interface Envelope {
  id: string;
  space: string;
  ts: number;
  device: string;
  iv: string;   // base64url, 96-bit random nonce
  ct: string;   // base64url, AES-GCM ciphertext of JSON { type, payload }
}
```

The server sees only IDs, timestamps, device IDs, and ciphertext. The event type is inside the ciphertext.

### Local stores (IndexedDB database `rezote-<app>`)

| Store | Key | Content |
|---|---|---|
| `events` | `id` | Decrypted events, local and remote. Index on `space`. |
| `outbox` | `id` | IDs of local events not yet confirmed |
| `rejected` | `id` | Local events the server refused, with the reason |
| `meta` | key | `device`, joined spaces with their keys and permission, `cursor:<space>`, app settings (for example the chosen collector and receipt counter) |

Emitting an event writes to `events` and `outbox` in one IndexedDB transaction (Requirements 1.1, 2.1).

Keys are stored in IndexedDB on the phone, in the same way the data is. Anyone with access to the unlocked phone can read the data. This is stated in the README.

## Encryption and permissions

| Key | Size | Where it lives | Purpose |
|---|---|---|---|
| Space ID | 128 bits | Both links, server | Identifies the space |
| Encryption key `E` | 256 bits | Both links, phones | AES-GCM encryption of every event |
| Write key `W` | 128 bits | Write link, phones of writers; server stores `SHA-256(W)` | Proves the right to write |
| Writers key `K` | 256 bits | Derived on writers' phones: `HKDF-SHA256(W, salt = space ID, info = "rezote/writers")` | Encrypts fields marked writers only |

- **Write link:** `https://<app>/#s=<space>&e=<E>&w=<W>`. **Read link:** `https://<app>/#s=<space>&e=<E>`. Browsers do not send the fragment to servers (Requirement 7.3).
- **Encrypting an event:** first, each writers-only field is replaced by `{ "$w": "<iv>.<ct>" }`, encrypted with `K`. Then `{ type, payload }` is encrypted with `E`, with the envelope fields (`id|space|ts|device`) as additional authenticated data, so that a ciphertext cannot be moved to another event or space.
- **Decrypting:** a reader without `W` sees writers-only fields as "hidden". An event that fails decryption or schema validation is ignored and counted (Requirement 7.6).
- **Writes:** `Authorization: Bearer <W>`. The server compares `SHA-256(W)` with the stored hash in constant time. `W` has 128 random bits, so a fast hash is enough.
- **Trust model:** everyone with the write link is trusted to write. A writer could create misleading events; the history and cancellation reasons make that visible but do not prevent it.
- **Limitations stated in the README** (Requirement 7.8): links cannot be revoked, and losing every link means losing access to the space. The workaround for a leaked link is to create a new space.

## Skeleton API (`packages/core`)

```ts
import { defineApp } from "@rezote/core";

export const carnetDeRoute = defineApp({
  name: "carnet-de-route",
  events: {
    "route/entry.recorded": v.object({ entryId: v.string(), /* … */ position: v.optional(Position) }),
    // …
  },
  writersOnly: { "route/entry.recorded": ["position"] },   // must be optional fields
  project: (events) => view,   // pure function of the canonical event list
});

// Provided by the runtime (createApp(def, { serverUrl })):
app.emit(type, payload, space?)   // validate, encrypt, store + queue in one transaction, trigger sync
app.view / app.events             // signals for the current space
app.status / app.ghosts           // { online, syncing, pending, ignored, lastSyncAt, lastError }, outbox IDs
app.isGhost(eventId)
app.createSpace(label)            // keys generated on the phone; registered on the server at the next sync, so it works offline
app.join(secrets) / app.links()   // { write, read }
app.canWrite() / app.select() / app.leave()
app.nextCounter(key)              // atomic per-phone counter (receipt numbers)
app.getSetting() / app.setSetting()   // per-phone settings (role, GPS)
```

The projection receives the whole event list instead of folding one event at a time. Apps index events in a first pass and compute in a second, which makes order independence easy to get right.

Receipt counters are incremented atomically in their own IndexedDB transaction just before the weighing event is written. A crash in between can skip a number but never reuse one.

Shared UI pieces: `<AppShell>` (header, status bar, menu with spaces, share links, and sync details), `<GhostMark>`, `<ShareButton>` (Web Share API, with copy fallback), `<NumberPad>`, `<Stat>`, `<Field>`, `askReason()` (native prompt for cancellation reasons), and the formatters `formatFCFA()`, `formatKg()`, `parseKg()`, `formatDuration()`, `formatDate()`, `formatTime()`.

## Sync protocol

| Method | Path | Body / query | Response |
|---|---|---|---|
| `POST` | `/spaces` | `{ id, app, writeKeyHash }` | `{ space }` (201; the same request again is accepted, another key gets 409) |
| `POST` | `/spaces/:space/events` | `{ events: Envelope[] }`, max 500 events, max 256 KB, write key required | `{ accepted: string[], rejected: {id, reason}[] }` |
| `GET` | `/spaces/:space/events` | `?after=<seq>&limit=500` | `{ events: Envelope[], cursor: number, more: boolean }` |

The phone generates the space ID and keys and sends only `SHA-256(W)` when creating a space, so `W` never reaches the server except as a bearer token on writes. A 128-bit random ID makes collisions practically impossible; the server refuses to re-register an existing ID with another key.

Client sync cycle:

1. **Push:** read up to 500 outbox events, `POST` their envelopes, remove accepted IDs from the outbox, move rejected ones to `rejected` (shown with an error marker, not retried).
2. **Pull:** `GET` with the stored cursor, decrypt, validate, `put` locally, save the cursor, repeat while `more` is true.
3. **Project:** recompute the projection and update the signals.

Triggers: the browser `online` event, app start, every 30 s while online, and right after `emit`. Network errors and 5xx responses back off at 2, 4, 8 seconds and so on, capped at 5 minutes (Requirement 2.4).

Server storage (D1, `packages/sync-api/migrations`):

```sql
CREATE TABLE spaces (
  id TEXT PRIMARY KEY,
  app TEXT NOT NULL,
  write_key_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  space TEXT NOT NULL REFERENCES spaces(id),
  received_at INTEGER NOT NULL,
  envelope TEXT NOT NULL
);
CREATE INDEX events_space_seq ON events(space, seq);
```

Inserts use `ON CONFLICT(id) DO NOTHING`, so re-sending is harmless (Requirement 2.5). All queries are parameterized.

Server checks (Requirement 7.5): space exists and belongs to this Worker's app (Requirement 7.6b); write key matches; envelope shape (UUID `id`, `space` equal to the URL, numeric `ts`, `device` up to 64 chars, `iv` 16 chars, `ct` up to 16 KB); request size and count limits. The API is on the same origin as the app, so no CORS is configured. Cloudflare's rate limiting binding limits each IP to 60 write requests per minute. The server cannot validate payloads because it cannot read them; phones validate on receipt.

## App 1: Collecte

**Who:** one campaign of one cooperative is one space. The treasurer creates it and sends the write link to each collector. The cooperative board can get the read link.

**Process modeled** (see `docs/research.md`): at the village weighing session, each bundle is weighed on the platform scale and its weight is called out; today three people write it in three notebooks with a running subtotal. The cotton goes to the village store, then by truck to the ginning factory, where it is weighed again.

### Events

| Type | Payload |
|---|---|
| `collecte/campaign.created` | `name`, `product`, `grades: {code, label, pricePerKg}[]` |
| `collecte/collector.added` | `collectorId`, `name`, `code` |
| `collecte/farmer.registered` | `farmerId`, `name`, `village` |
| `collecte/weighing.started` | `weighingId`, `receipt` (`K2-0042`), `farmerId`, `collectorId`, `at` |
| `collecte/bundle.recorded` | `bundleId`, `weighingId`, `weightG`, `grade`, `at` |
| `collecte/weighing.closed` | `weighingId`, `at` |
| `collecte/deduction.recorded` | `deductionId`, `farmerId`, `label`, `amount`, `at` |
| `collecte/payment.recorded` | `paymentId`, `farmerId`, `amount`, `method` (`cash`, `mobile_money`), `at` |
| `collecte/load.dispatched` | `loadId`, `plate`, `villageWeightG`, `at` |
| `collecte/load.received` | `loadId`, `factoryWeightG`, `at` |
| `collecte/item.cancelled` | `itemId`, `reason` |

Weights are integer grams, so 84,5 kg is `84500`. Amounts are integer FCFA. The receipt counter for a collector is kept in `meta` on the phone and incremented in the same transaction as `weighing.started`.

### Projection

Per weighing: bundles ordered by `(at, ts, id)`, with bundle number and running subtotal (Requirement 8.5).

Per farmer:

- `weightG[g]` = sum of non-cancelled bundles with grade `g`, over all the farmer's weighings
- `gross` = `floor( Σ_g weightG[g] × pricePerKg[g] / 1000 )`, computed once per farmer (Requirement 8.10)
- `deductions` = sum of non-cancelled deductions
- `paid` = sum of non-cancelled payments
- `balance` = `gross − deductions − paid`

Per campaign:

- `weighedG` = sum of all non-cancelled bundles
- `dispatchedG` = sum of `villageWeightG` of non-cancelled loads
- `inStoreG` = `weighedG − dispatchedG`
- per load: `gapG = factoryWeightG − villageWeightG` and gap in percent; campaign gap over received loads
- totals per village and per collector

Flags (Requirement 8.13):

- **Receipt collision:** two weighings with the same `receipt`.
- **Possible double entry:** two bundles in the same weighing with the same weight and grade and `at` less than 2 minutes apart.
- **Negative balance:** `balance < 0`.
- **Duplicate collector code:** a later `collector.added` with an existing code is shown as an error, and that collector cannot start weighings.

If several `campaign.created` events exist in a space, the one that sorts first wins. Prices are fixed per campaign in this version.

### Screens

- **Collector:** choose my name (once); farmers with search by name or village; add farmer; weighing screen with a large number pad, grade buttons, bundle list, and running subtotal; close weighing; receipt with Share button; my weighings today.
- **Treasurer:** campaign setup (product, grades, prices); collectors; dashboard (weighed, in store, dispatched, factory gap, per village, per collector); farmer detail with weighings, deductions, payments, and balance; record deduction; record payment; truckloads; flags; CSV export.

Receipt text:

```
Coopérative Jɛkafo, campagne coton 2026-2027
Reçu K2-0042, 14/11/2026 10:32
Moussa Coulibaly (Kignan)
5 bâches : 1er choix 412,0 kg, 2e choix 58,5 kg
Montant brut : 139 687 FCFA
Collecteur : Adama Koné
```

(412 kg × 300 + 58,5 kg × 275 = 123 600 + 16 087,5, rounded down to 139 687 FCFA.)

## App 2: Carnet de route

**Who:** one truck is one space. The owner creates it and sends the write link to the driver. The owner can give the read link to a client waiting for the goods; that person sees places and times entered by the driver, but not GPS positions.

### Events

| Type | Payload |
|---|---|
| `route/truck.registered` | `plate`, `name` |
| `route/trip.started` | `tripId`, `from`, `to`, `corridor`, `cargo`, `advance`, `odometerKm?`, `at` |
| `route/entry.recorded` | `entryId`, `tripId`, `kind`, `place`, `amount?`, `volumeCl?`, `pricePerLiter?`, `odometerKm?`, `note?`, `position?` (writers only), `at` |
| `route/stop.resumed` | `entryId`, `at` |
| `route/advance.added` | `advanceId`, `tripId`, `amount`, `method`, `at` |
| `route/trip.ended` | `tripId`, `place`, `odometerKm?`, `at` |
| `route/item.cancelled` | `itemId`, `reason` |

- Entry kinds: `fuel`, `checkpoint`, `weighbridge`, `customs`, `border`, `convoy`, `toll`, `meal`, `repair`, `breakdown`, `rest`, `loading`, `unloading`, `other`. Resumable kinds: `customs`, `border`, `convoy`, `breakdown`, `repair`, `rest` (Requirement 9.9).
- Corridors offered: Dakar–Bamako via Kédougou–Moussala, Dakar–Bamako via Kidira–Kayes, Abidjan–Bamako via Pogo–Zégoua, other.
- Fuel: the driver enters liters (one decimal) and price per liter. `volumeCl` is stored in centiliters; `amount = round(volumeCl × pricePerLiter / 100)`, rounded per fill-up, as on a pump receipt.
- GPS: `navigator.geolocation` uses the phone's GPS and works without mobile network. It is off by default; the driver turns it on in settings (Requirement 9.5). Positions are writers-only fields, and the share text never includes them (Requirement 9.13).

### Projection

Per trip:

- `timeline` = start, entries, advances, resumes, end, ordered by `(at, ts, id)`, cancelled items included but marked
- `expensesByKind[k]` = sum of `amount` of non-cancelled entries of kind `k`
- `advances` = initial advance + non-cancelled added advances
- `balance` = `advances − Σ expensesByKind`. Positive means the driver should still hold cash; negative means the owner owes the driver.
- `stoppedByKind[k]` = sum of `resumed.at − entry.at` for resumed entries of kind `k`. A resume earlier than its entry is ignored and flagged. A stop without a resume shows as "in progress" with the time so far.
- `consumption` = liters of fuel recorded after the first odometer reading and up to the last one, divided by the distance between them, × 100. It is an estimate, and the interface says so.
- `duration` = `ended.at − started.at`, or time so far
- `lastReport` = the most recent entry (place and time); the position too for writers
- `driverLastSync` = greatest `receivedAt` among events from the driver's devices (Requirement 9.10)

If a second trip is started while one is open (possible offline), both are shown with a warning.

### Screens

- **Driver:** current trip; large quick buttons (fuel, checkpoint, convoy, breakdown, rest); entry form with number pad and recent places; fuel form (liters, price per liter, odometer); "resume" button on open stops; end trip; GPS setting.
- **Owner:** truck overview (current trip, last report, driver last sync); trip timeline; expenses by kind; time stopped by kind; consumption; add advance; start trip; past trips; share summary.

Summary text:

```
Camion AB-1234-MD, Abidjan → Bamako (via Pogo–Zégoua)
Départ 06/11 05:40, arrivée 10/11 16:20 (4 j 10 h 40)
Avances 600 000 FCFA, dépenses 548 750 FCFA, reste 51 250 FCFA
Carburant 427 750 · Contrôles 38 000 · Pesage 20 000 · Douane 35 000 · Repas 18 000 · Autres 10 000
Arrêts : frontière 7 h 15, douane 11 h 30, pannes 2 h 05
Consommation estimée : 39 L/100 km
```

## Demo data

`scripts/seed-demo.ts` creates one demo space per app and fills it through the normal client code, so the data is encrypted like real data. Values come from `docs/research.md`:

- **Collecte:** campaign "coton 2026-2027", 1er choix 300 FCFA/kg and 2e choix 275 FCFA/kg; 3 collectors; 40 farmers in 4 villages of the Koutiala area; about 600 bundles of 40 to 120 kg; fertilizer deductions at 14 000 FCFA per bag; partial payments; 3 truckloads, 2 received at the factory with small gaps; one receipt collision and one possible double entry to show the flags.
- **Carnet de route:** one finished Abidjan → Bamako trip via Pogo–Zégoua, with fuel at 725 FCFA/L in Côte d'Ivoire and 940 FCFA/L in Mali; one trip in progress from Dakar via Kédougou, currently waiting in the queue at Moussala.

The write links for the demo spaces go in the Devpost testing instructions. The read links go in the README.

## Error handling

| Situation | Behavior |
|---|---|
| No network | Status bar shows "hors ligne" and the time of the last sync; all actions keep working |
| Server rejects an event (4xx) | Event moves to `rejected`, shown with an error marker and the reason |
| Server error or timeout | Event stays in the outbox; backoff and retry |
| Event cannot be decrypted or is invalid | Ignored; count shown in the status details |
| Read link | Editing controls hidden; server would reject writes anyway |
| IndexedDB unavailable | Blocking message: this browser cannot store data |
| Storage nearly full | Warning; unsynced events are never deleted |
| GPS refused or unavailable | Entry saved without position |

## Size budget

`scripts/check-size.mjs` gzips every file of each app's client build and fails above 250 KB (Requirements 4.1, 4.4). Measured: about 180 KB per app (React, TanStack Router, Form, Store, and Zod).

## Testing strategy

Property-based tests with `fast-check` cover the logic where a bug would corrupt money, weights, or shared records:

| Property | Module |
|---|---|
| Replaying a shuffled event list gives the same projection | core, collecte, carnet-de-route |
| Adding duplicate copies of events does not change the projection | core, collecte, carnet-de-route |
| Merging event sets is commutative, associative, and idempotent | core |
| After any mix of failed and successful pushes, every event is in the outbox or on the server, never lost | core (fake unreliable server) |
| `decrypt(encrypt(event)) = event`; changing any byte of the ciphertext or envelope makes decryption fail | core |
| Writers-only fields cannot be read with the read link keys | core |
| `gross` per farmer equals `floor(Σ weight × price / 1000)` and is less than 1 FCFA below the exact value | collecte |
| Running subtotal after the last bundle equals the weighing total | collecte |
| `inStoreG = weighedG − dispatchedG` and campaign weight equals the sum of farmers' weights | collecte |
| Cancelling an item gives the same totals as never recording it | collecte, carnet-de-route |
| `balance = advances − Σ expenses` for any sequence of entries, advances, and cancellations | carnet-de-route |
| Time stopped is never negative | carnet-de-route |
| `parseKg(formatKg(g)) = g` and `formatFCFA` output parses back to the original integer | core |

Example-based tests cover receipts and summaries, the sync API (real SQL on `node:sqlite` through a small D1 shim), permissions (read link cannot write), app isolation, and the share links.

## How Kiro is used

- **Specs:** this spec (requirements, design, tasks) drives the build.
- **Steering:** `product.md` (users, context, tone, French text), `tech.md` (stack, size budget, no third-party scripts, integer money and weights, encryption rules), `structure.md` (where code goes; core stays app-agnostic).
- **Hooks:** run related tests when a file in `packages/core` or an app's `domain` folder is saved; run the size check after a build.
- **Property-based tests:** the properties listed above.
- **MCP:** Context7 for current documentation of TanStack Start, Router, Form, Store, Zod, and Cloudflare Workers.

## Open questions

1. **Field details** listed at the end of `docs/research.md`: bundle weights, current receipts, typical fees per corridor, and towns between Moussala and Bamako.
2. **Cooperative name in the demo:** the examples use "Coopérative Jɛkafo" and villages around Koutiala. Tell me if you prefer real place names from a region you know.
