# Design: Rezote

## Overview

Rezote is an npm-workspaces monorepo with one shared skeleton package, two apps built on it, and one small sync server.

```
rezote/
├── .kiro/                    specs, steering, hooks (required by the rules)
├── packages/core/            the skeleton: events, storage, outbox, sync, status, sharing, i18n, UI shell
├── apps/collecte/            app 1: cooperative harvest collection
├── apps/carnet-de-route/     app 2: truck trip log
├── server/                   sync server (Hono on Cloudflare Workers + D1)
├── scripts/                  size budget, translation check, demo data
├── docs/new-app.md           guide: build a third app on the skeleton
├── LICENSE                   MIT
└── README.md
```

The core idea is event sourcing. Apps never update or delete rows. Every user action appends an immutable event, and the app state (the "projection") is computed by replaying events. This makes offline sync simple: syncing two devices means taking the union of their events, and the union is the same whatever order the events arrive in. It also gives both apps a full history, which is what treasurers and truck owners need when there is a dispute.

## Technology choices

| Concern | Choice | Why | Rejected alternative |
|---|---|---|---|
| Language | TypeScript (strict) | Event schemas shared by client and server | Plain JS |
| UI | Preact + `@preact/signals` | About 5 KB gzip, React-style API | React (about 45 KB) |
| Build | Vite | Simple multi-app setup | Webpack |
| Local storage | IndexedDB via `idb` | Works offline, large quota, about 1 KB wrapper | localStorage (5 MB limit, synchronous) |
| Offline shell | `vite-plugin-pwa` (Workbox precache) | Standard service worker generation | Hand-written service worker |
| Validation | `valibot` | Tree-shakable, same schemas on client and server | `zod` (about 13 KB gzip) |
| Sync server | Hono on Cloudflare Workers, D1 (SQLite) | Free tier without a credit card, tiny code | Supabase or Firebase (client SDK adds weight) |
| Hosting (apps) | Cloudflare Pages | Same account as the server | GitHub Pages (fallback) |
| Tests | Vitest + `fast-check` + `fake-indexeddb` | Unit and property-based tests in one runner | Jest |

No map library is used. Maps tiles are heavy and need network, so positions are shown as place names and coordinates, with a link that opens the phone's map app.

## Data model

### Event

```ts
interface Event<T extends string = string, P = unknown> {
  id: string;          // crypto.randomUUID()
  space: string;       // space ID, 22-char base64url (128 random bits)
  type: T;             // e.g. "collecte/delivery.recorded"
  payload: P;          // validated by the app's schema for this type
  ts: number;          // device clock, ms since epoch, when created
  device: string;      // random device ID, stored locally
  seq?: number;        // server sequence number, set by the server
  receivedAt?: number; // server clock when first stored, set by the server
}
```

Events are replayed in `(ts, id)` order. This order is total and identical on every device, so the same set of events always gives the same projection (Requirement 2.7). Where the business meaning depends on when something happened (a truck stop), the payload carries its own `at` time, which the user can edit.

### Local stores (IndexedDB database `rezote-<app>`)

| Store | Key | Content |
|---|---|---|
| `events` | `id` | Every known event, local and remote. Index on `space`. |
| `outbox` | `id` | IDs of local events not yet confirmed |
| `rejected` | `id` | Local events the server refused, with the reason |
| `meta` | key | `device`, `lang`, joined spaces with their keys, `cursor:<space>`, app-specific settings (for example the chosen collector) |

Emitting an event writes to `events` and `outbox` in one IndexedDB transaction, so an event is never stored without being queued (Requirements 1.1, 2.1).

## Skeleton API (`packages/core`)

An app declares its events and projection, and the skeleton handles the rest (Requirement 6.2).

```ts
import { defineApp } from "@rezote/core";

export const app = defineApp({
  name: "collecte",
  events: {
    "collecte/campaign.created": CampaignCreated,   // valibot schemas
    "collecte/delivery.recorded": DeliveryRecorded,
    // ...
  },
  initial: emptyState,
  project: (state, event) => nextState,             // pure function
  messages: { fr, bm },
});

// Provided by the skeleton:
app.emit(space, type, payload)      // validate, store, queue, trigger sync
app.state(space)                    // signal with the current projection
app.status                          // signal: { online, syncing, pending, lastSyncAt, lastError }
app.isGhost(eventId)                // true while the event is in the outbox
app.createSpace() / app.join(link) / app.links(space)   // { write, read }
app.canWrite(space)
```

Shared UI pieces: `<AppShell>` (header, language switch, status bar), `<GhostMark>`, `<ShareButton>` (Web Share API, with copy-to-clipboard fallback), `<Confirm>`, and the formatters `formatFCFA()`, `formatKg()`, `formatDuration()`, `formatDate()`.

## Spaces and permissions

- `POST /spaces` creates a space and returns `{ space, writeKey }`. Both are 128 random bits, base64url.
- The server stores `sha256(writeKey)` only (Requirement 7.5) and compares hashes in constant time.
- Write link: `https://<app>/#s=<space>&k=<writeKey>`. Read link: `https://<app>/#s=<space>`. The keys are in the URL fragment, which browsers do not send to servers, so they stay out of server logs.
- Writes send `Authorization: Bearer <writeKey>`. Reads need only the space ID.
- A device that joined with a read link hides all editing controls.
- Limitation stated in the README: links cannot be revoked in this version. The workaround is to create a new space.

## Sync protocol

| Method | Path | Body / query | Response |
|---|---|---|---|
| `POST` | `/spaces` | `{ app }` | `{ space, writeKey }` |
| `POST` | `/spaces/:space/events` | `{ events: Event[] }`, max 500 events, max 256 KB, write key required | `{ accepted: string[], rejected: {id, reason}[] }` |
| `GET` | `/spaces/:space/events` | `?after=<seq>&limit=500` | `{ events: Event[], cursor: number, more: boolean }` |

Client sync cycle:

1. **Push:** read up to 500 outbox events and `POST` them. Remove accepted IDs from the outbox. Move rejected ones to `rejected` and show them with an error marker. They are not retried.
2. **Pull:** `GET` with the stored cursor, `put` the events locally (an existing ID is overwritten with identical content), save the cursor, repeat while `more` is true.
3. **Project:** recompute the projection for the space and update the signals.

Triggers: the browser `online` event, app start, every 30 s while online, and right after `emit`. Network errors and 5xx responses back off at 2, 4, 8 seconds and so on, capped at 5 minutes (Requirement 2.4).

Server storage (D1):

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
  body TEXT NOT NULL
);
CREATE INDEX events_space_seq ON events(space, seq);
```

Inserts use `ON CONFLICT(id) DO NOTHING`, so re-sending an event is harmless (Requirement 2.5). An already-stored ID is reported as accepted. All queries are parameterized.

Server checks (Requirement 7.4): space exists, write key matches, `event.space` equals the URL space, event type belongs to the space's app, payload matches the schema, request size and count limits. CORS allows only the two app origins. Cloudflare's rate limiting binding limits each IP to 60 write requests per minute.

## App 1: Collecte

**Who:** one cooperative campaign is one space. The treasurer creates it and sends the write link to each collector. Farmers or the cooperative board can get the read link.

### Events

| Type | Payload |
|---|---|
| `collecte/campaign.created` | `name`, `product`, `grades: {code, label, pricePerKg}[]` (FCFA, integers > 0) |
| `collecte/collector.added` | `collectorId`, `name`, `code` (for example `K2`) |
| `collecte/farmer.registered` | `farmerId`, `name`, `village`, `collectorId` |
| `collecte/delivery.recorded` | `deliveryId`, `farmerId`, `collectorId`, `receipt` (`K2-0042`), `weightG` (integer grams, multiple of 100), `grade`, `at` |
| `collecte/payment.recorded` | `paymentId`, `farmerId`, `amount` (FCFA), `method` (cash, mobile money), `at` |
| `collecte/item.cancelled` | `itemId` (delivery or payment ID), `reason` |

Weights are stored as integer grams to avoid floating-point errors. The interface accepts kg with one decimal (`84,5`) and converts.

### Projection

Per farmer:

- `weightByGrade[g]` = sum of `weightG` of non-cancelled deliveries with grade `g`
- `owed` = `floor( Σ_g weightByGrade[g] × pricePerKg[g] / 1000 )`, computed once from the exact totals (Requirement 8.8)
- `paid` = sum of non-cancelled payments
- `balance` = `owed − paid`

Per village, per collector, and for the campaign: the same sums over the relevant farmers or deliveries.

Flags for the treasurer:

- **Possible duplicate:** same farmer, same `weightG`, same grade, `at` less than 10 minutes apart (Requirement 8.11).
- **Receipt collision:** two different `deliveryId` values with the same `receipt` (Requirement 8.5).
- **Overpaid:** `balance < 0`.

If several `campaign.created` events exist in a space, the one that sorts first wins. Collector codes must be unique: a later `collector.added` that reuses a code is shown as an error to the treasurer and its collector cannot record deliveries.

Each phone keeps a receipt counter per collector in `meta`, incremented in the same transaction as the delivery event.

### Screens

- **Collector:** choose my name (once), farmer list with search by name or village, add farmer, record delivery (large number pad for the weight, grade buttons), receipt with Share button, my deliveries today.
- **Treasurer:** campaign setup (product, grades, prices), collectors, dashboard (campaign total kg and FCFA, per village, per collector), farmer detail with history and balance, record payment, flags list, CSV export.

Receipt text example:

```
Coopérative Jɛkafo, campagne coton 2026
Reçu K2-0042, 14/11/2026 10:32
Moussa Coulibaly (Kignan)
84,5 kg, 1er choix à 300 FCFA/kg = 25 350 FCFA
Collecteur : Adama K.
```

## App 2: Carnet de route

**Who:** one truck is one space. The owner creates it and sends the write link to the driver. The owner can send the read link to a client waiting for the goods.

### Events

| Type | Payload |
|---|---|
| `route/truck.registered` | `plate`, `name` |
| `route/trip.started` | `tripId`, `from`, `to`, `cargo`, `advance` (FCFA), `at` |
| `route/entry.recorded` | `entryId`, `tripId`, `kind`, `place`, `amount?` (FCFA), `note?`, `at`, `position?: {lat, lng, accuracyM}` |
| `route/stop.resumed` | `entryId`, `at` |
| `route/advance.added` | `advanceId`, `tripId`, `amount`, `method`, `at` |
| `route/trip.ended` | `tripId`, `place`, `at` |
| `route/item.cancelled` | `itemId` (entry or advance ID), `reason` |

Entry kinds: `fuel`, `checkpoint`, `weighbridge`, `customs`, `border`, `toll`, `meal`, `repair`, `breakdown`, `rest`, `loading`, `unloading`, `other`. Kinds that can be resumed: `breakdown`, `repair`, `rest`, `customs`, `border`.

The GPS position comes from `navigator.geolocation`, which uses the phone's GPS and works without mobile network. It is asked once and is optional (Requirement 9.3).

### Projection

Per trip:

- `timeline` = entries, advances, start and end, ordered by `(at, ts, id)`, cancelled items included but marked
- `expensesByKind[k]` = sum of `amount` of non-cancelled entries of kind `k`
- `advances` = initial advance + non-cancelled added advances
- `balance` = `advances − Σ expensesByKind`. Positive means the driver should still hold cash; negative means the owner owes the driver.
- `stoppedByKind[k]` = sum of `resumed.at − entry.at` for resumable entries of kind `k` that have a `stop.resumed`. A resume earlier than its entry is ignored and flagged. A stop with no resume is shown as "in progress".
- `duration` = `ended.at − started.at`, or time elapsed so far
- `lastPosition` = the entry with a position and the greatest `at`
- `driverLastSync` = greatest `receivedAt` among events created by the driver's devices (Requirement 9.7)

Only one trip per truck can be open. Starting a trip while another is open is allowed offline (the owner might not know), and the projection shows both with a warning.

### Screens

- **Driver:** current trip, big buttons for the frequent kinds (fuel, checkpoint, breakdown, rest), entry form (amount pad, place with recent places suggested, note), "resume" button on an open stop, end trip.
- **Owner:** truck overview (current trip, last position and time, driver last sync), trip timeline, totals by kind, time stopped by kind, add advance, start trip, past trips, share summary.

Trip summary example:

```
Camion AB-1234-MD, Dakar → Bamako
Départ 08/11 06:10, arrivée 13/11 17:45 (5 j 11 h)
Avances 450 000 FCFA, dépenses 412 500 FCFA, reste 37 500 FCFA
Carburant 285 000, contrôles 42 500, pesage 25 000, douane 35 000, repas 15 000, autres 10 000
Arrêts : douane 9 h 20, frontière 6 h 05, pannes 3 h 40
```

## Languages

- Each package has `locales/fr.json` and `locales/bm.json`. App messages are merged over core messages.
- `scripts/check-i18n.ts` fails if a key is missing in one language (Requirement 5.4).
- The Bambara text must be reviewed by a fluent speaker. `docs/translations.md` tracks which keys are reviewed.
- Formatters do not rely on `Intl` data for `bm`, which browsers do not reliably ship. `formatFCFA(25350)` returns `25 350 FCFA` and `formatKg(84500)` returns `84,5 kg`.

## Size budget

`scripts/check-size.ts` runs after each app build. It gzips every file the service worker precaches and fails above 150 KB (Requirements 4.1, 4.4). The expected size is 35 to 50 KB per app.

## Error handling

| Situation | Behavior |
|---|---|
| No network | Status bar shows "offline" and the time of the last sync; all actions keep working |
| Server rejects an event (4xx) | Event moves to `rejected`, shown with an error marker and the reason |
| Server error or timeout | Event stays in the outbox; backoff and retry |
| Read-only link | Editing controls hidden; server would reject writes anyway |
| IndexedDB unavailable | Blocking message: this browser cannot store data |
| Storage nearly full | Warning; unsynced events are never deleted |
| GPS refused or unavailable | Entry saved without position |

## Demo data

`scripts/seed-demo.ts` creates one demo space per app through the API and fills it with realistic data: a cotton campaign with 3 collectors, 40 farmers in 4 villages, and about 150 deliveries; and a truck with one finished Dakar–Bamako trip and one trip in progress from Abidjan. The links go in the README and the Devpost testing instructions (Requirement 10.4).

## Testing strategy

Property-based tests with `fast-check` cover the logic where a bug would corrupt money or shared records:

| Property | Module |
|---|---|
| Replaying a shuffled event list gives the same projection | core, collecte, carnet-de-route |
| Adding duplicate copies of events does not change the projection | core, collecte, carnet-de-route |
| Merging event sets is commutative, associative, and idempotent | core |
| After any mix of failed and successful pushes, every event is in the outbox or on the server, never lost | core (fake unreliable server) |
| `owed` per farmer equals `floor(Σ weight × price / 1000)` and is never more than 1 FCFA below the unrounded value | collecte |
| Campaign total kg equals the sum of all farmers' non-cancelled weights | collecte |
| Cancelling an item and replaying gives the same totals as never recording it | collecte, carnet-de-route |
| `balance = advances − Σ expenses` for any sequence of entries, advances, and cancellations | carnet-de-route |
| Time stopped is never negative | carnet-de-route |
| `formatKg` and `formatFCFA` output parses back to the original integer | core |

Example-based tests cover receipts and summaries, server routes (Hono test client with a local D1 through Miniflare), permissions (read link cannot write), and the language switch.

## How Kiro is used

Planned so the hackathon write-up describes real usage:

- **Specs:** this spec (requirements, design, tasks) drives the build.
- **Steering:** `product.md` (users, context, tone), `tech.md` (stack, size budget, no third-party scripts, integer money), `structure.md` (where code goes, core stays app-agnostic).
- **Hooks:** run related tests when a file in `packages/core` or an app's `domain` folder is saved; run the i18n check when a locale file is saved; run the size check after a build.
- **Property-based tests:** the properties listed above.
- **MCP:** Context7 for current documentation of Hono, D1, Workbox, and Preact.

## Open questions

1. **Hosting:** the design assumes a free Cloudflare account. You would create it and give me an API token in week 2.
2. **Bambara review:** someone fluent must review the Bambara text before the demo video.
3. **Real-world details:** please check the cooperative example (products, grades, prices per kg) and the truck example (corridors, expense kinds, typical amounts), or tell me who could.
