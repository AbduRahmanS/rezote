# Design: Hors-Ligne

## Overview

Hors-Ligne is an npm-workspaces monorepo with one shared skeleton package, two apps built on it, and one small sync server.

```
hors-ligne/
├── .kiro/                 specs, steering, hooks (required by the rules)
├── packages/core/         the skeleton: events, storage, outbox, sync, status, i18n, UI shell
├── apps/tontine/          app 1: rotating savings group
├── apps/sugu/             app 2: market prices
├── server/                sync server (Hono on Cloudflare Workers + D1)
├── scripts/               size budget and translation checks
├── docs/new-app.md        guide: build a third app on the skeleton
├── LICENSE                MIT
└── README.md
```

The core idea is event sourcing. Apps never update or delete rows. Every user action appends an immutable event. The app state (the "projection") is computed by replaying events. This makes offline sync simple: syncing two devices means taking the union of their events, and the union is the same whatever order the events arrive in.

## Technology choices

| Concern | Choice | Why | Rejected alternative |
|---|---|---|---|
| Language | TypeScript (strict) | Type-checked event schemas shared by client and server | Plain JS |
| UI | Preact + `@preact/signals` | About 5 KB gzip, React-style API | React (about 45 KB), Svelte (different mental model for contributors) |
| Build | Vite | Fast, simple multi-app setup | Webpack |
| Local storage | IndexedDB via `idb` | Works offline, large quota, about 1 KB wrapper | localStorage (5 MB limit, synchronous) |
| Offline shell | `vite-plugin-pwa` (Workbox, precache) | Standard service worker generation | Hand-written service worker |
| Validation | `valibot` | Tree-shakable, about 1 to 2 KB per schema set; same schemas on client and server | `zod` (about 13 KB gzip) |
| Sync server | Hono on Cloudflare Workers, D1 (SQLite) | Free tier with no credit card, global edge, tiny code | Supabase or Firebase (vendor SDK adds weight to the client) |
| Hosting (apps) | Cloudflare Pages | Same account as the server | GitHub Pages (works too; fallback option) |
| Tests | Vitest + `fast-check` + `fake-indexeddb` | Unit and property-based tests in one runner | Jest |

## Data model

### Event

```ts
interface Event<T extends string = string, P = unknown> {
  id: string;        // crypto.randomUUID(), globally unique
  space: string;     // space ID, 22-char base64url (128 random bits)
  type: T;           // e.g. "tontine/payment.recorded"
  payload: P;        // validated by the app's schema for this type
  ts: number;        // device clock, ms since epoch, when created
  device: string;    // random device ID, stored locally
  seq?: number;      // server sequence number, set once synced
}
```

Events are sorted for replay by `(ts, id)`. This order is total and the same on every device, so every device computes the same projection from the same set of events (Requirement 2.7). Device clocks can be wrong. This only affects "latest" ordering in Sugu, where the UI shows the report date so users can judge it, and the 7-day median limits the effect of one bad report.

### Local stores (IndexedDB database `hl-<app>`)

| Store | Key | Content |
|---|---|---|
| `events` | `id` | Every known event, local and remote. Index on `space`. |
| `outbox` | `id` | IDs of local events not yet confirmed by the server |
| `meta` | key | `device`, `lang`, `cursor:<space>`, list of joined spaces |

Writing an event puts it in `events` and `outbox` in one IndexedDB transaction, so an event is never stored without being queued (Requirement 1.1, 2.1).

## Skeleton API (`packages/core`)

An app defines its events and projection, and the skeleton does the rest (Requirement 6.2).

```ts
import { defineApp } from "@hors-ligne/core";

export const app = defineApp({
  name: "tontine",
  events: {
    "tontine/group.created": GroupCreatedSchema,
    "tontine/payment.recorded": PaymentRecordedSchema,
    "tontine/payment.cancelled": PaymentCancelledSchema,
  },
  initial: emptyState,
  project: (state, event) => nextState,   // pure function
  messages: { fr, bm },
});

// Provided by the skeleton:
app.emit(space, type, payload)   // validate, store, queue, trigger sync
app.state(space)                 // signal with the current projection
app.status                       // signal: { online, syncing, pending, lastError }
app.isGhost(eventId)             // true while the event is in the outbox
app.createSpace() / app.joinSpace(id) / app.shareLink(space)
```

The skeleton also exports small UI pieces used by both apps: `<AppShell>` (header, language switch, status bar), `<GhostMark>`, `<ShareButton>`, and `formatFCFA()`.

## Sync protocol

| Method | Path | Body / query | Response |
|---|---|---|---|
| `POST` | `/spaces` | `{ app }` | `{ space }` |
| `POST` | `/spaces/:space/events` | `{ events: Event[] }`, max 500 events, max 256 KB | `{ accepted: string[] }` |
| `GET` | `/spaces/:space/events` | `?after=<seq>&limit=500` | `{ events: Event[], cursor: number, more: boolean }` |

Sync cycle on the client:

1. Push: read up to 500 outbox events, `POST` them, remove every ID in `accepted` from the outbox.
2. Pull: `GET` with the stored cursor, insert the events with `put` (an existing ID is simply overwritten with the same content), save the new cursor, repeat while `more` is true.
3. Recompute the projection for the space and update the signals.

Triggers: the `online` browser event, app start, every 30 s while online, and right after `emit`. On failure, the client retries after 2, 4, 8 seconds and so on, capped at 5 minutes (Requirement 2.4).

Server storage (D1):

```sql
CREATE TABLE spaces (id TEXT PRIMARY KEY, app TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  space TEXT NOT NULL REFERENCES spaces(id),
  body TEXT NOT NULL
);
CREATE INDEX events_space_seq ON events(space, seq);
```

The server uses `INSERT ... ON CONFLICT(id) DO NOTHING`, so re-sending an event is harmless (Requirement 2.5). It returns an ID in `accepted` whether the event was new or already stored. All queries are parameterized.

### Security model

- Spaces have no accounts. The 128-bit space ID is the secret. Share links put it in the URL fragment (`#s=...`), which browsers do not send to servers, so it does not appear in server logs.
- Anyone who has the link can read and write the space. The README states this (Requirement 7.4). For a tontine, this matches how groups already share a WhatsApp group link.
- The server validates every event against the app's `valibot` schema, checks that `event.space` matches the URL, and rejects unknown spaces, unknown event types, and oversized requests (Requirement 7.3).
- CORS allows only the two app origins.
- Cloudflare's rate limiting binding limits each IP to 60 write requests per minute.

## Tontine app

Events:

| Type | Payload |
|---|---|
| `tontine/group.created` | `name`, `amount` (FCFA, integer > 0), `members: {id, name}[]` (order = payout order), `startDate` |
| `tontine/payment.recorded` | `paymentId`, `memberId`, `round` (integer ≥ 1), `amount` (integer > 0) |
| `tontine/payment.cancelled` | `paymentId` |

Projection, per round `r`:

- `beneficiary(r) = members[(r - 1) mod members.length]`
- `paid(member, r)` = sum of non-cancelled payments for that member and round
- member status: `paid` if `paid ≥ amount`, `partial` if `0 < paid < amount`, `unpaid` otherwise
- `pot(r)` = sum of `paid(member, r)` over all members (Requirement 8.5)
- `missing(r)` = sum of `max(0, amount - paid(member, r))`
- `possibleDuplicate(member, r)` = `paid > amount` (Requirement 8.7)

If several `group.created` events exist for one space, the one that sorts first wins and the others are ignored. A cancellation that arrives before its payment still works, because the projection collects cancelled IDs as a set.

Share text example (Requirement 8.6):

```
Tontine Benkadi, tour 3 (bénéficiaire : Awa T.)
Payé : 8 / 10, cagnotte 80 000 FCFA, manque 20 000 FCFA
Pas encore payé : Oumar S., Fanta K.
```

## Sugu app

Events:

| Type | Payload |
|---|---|
| `sugu/price.reported` | `product`, `market`, `price` (FCFA, integer > 0), `unit` (`kg`, `sac`, `tas`) |
| `sugu/product.added` | `id`, `names: {fr, bm}` |
| `sugu/market.added` | `id`, `name`, `town` |

A Sugu space is one region, for example "Bamako". The app ships a seed list of products and Bamako markets in code, so it works on first launch offline.

Projection, per `(product, market, unit)`:

- `latest` = the report with the greatest `(ts, id)`
- `median7d` = median price of reports with `ts` in the last 7 days (lower median for an even count, so the value is always a real report)
- `stale` = `latest.ts` older than 7 days

Prices for different units are never mixed.

## Languages

- Each package has `locales/fr.json` and `locales/bm.json`. The app's messages are merged over the core messages.
- `scripts/check-i18n.ts` fails if any key is missing from one language (Requirement 5.4).
- The Bambara text needs review by a fluent speaker. Machine-drafted Bambara will be marked with a `// TODO(bm-review)` list in `docs/translations.md` until reviewed.
- `formatFCFA(10000)` returns `10 000 FCFA` using a regular space; the code does not depend on `Intl` locale data for `bm`, which browsers do not reliably ship.

## Size budget

`scripts/check-size.ts` runs after each app build. It gzips every file the app shell precaches and fails if the total is over 150 KB (Requirement 4.1, 4.4). Expected size is about 30 to 40 KB per app, so the budget leaves room.

## Error handling

| Situation | Behavior |
|---|---|
| No network | Status bar shows "offline"; all actions keep working |
| Server returns 4xx for an event | Move the event to a `rejected` list, show it with an error marker, stop retrying it |
| Server returns 5xx or times out | Keep in outbox, back off, retry |
| IndexedDB unavailable (private mode on some browsers) | Show a blocking message explaining that the browser cannot store data |
| Storage quota close to full | Show a warning; synced events can be re-fetched, so the app never deletes unsynced ones |

## Testing strategy

Property-based tests with `fast-check` cover the logic where a bug would corrupt shared money or price data:

| Property | Module |
|---|---|
| Replaying a shuffled event list gives the same projection | core, tontine, sugu |
| Adding duplicate copies of events does not change the projection | core, tontine, sugu |
| Merging event sets is commutative, associative, and idempotent | core |
| Pot equals the sum of non-cancelled payments for the round | tontine |
| `missing(r) + collected-without-overpayment = amount × members` | tontine |
| Median is always one of the reported prices in the window | sugu |
| `formatFCFA` output parses back to the original integer | core |
| After any sequence of failed and successful pushes, every event is either in the outbox or accepted by the server, never lost | core (with a fake server) |

Example-based unit tests cover the share text, the HTTP routes (with Hono's test client and a local D1 via Miniflare), and the i18n switch.

## How Kiro is used

These are planned so the hackathon write-up describes real usage:

- **Specs**: this spec (requirements, design, tasks) drives the build.
- **Steering**: `product.md` (users, context, tone), `tech.md` (stack, size budget, no third-party scripts), `structure.md` (where code goes, core must stay app-agnostic).
- **Hooks**: run the related tests when a file in `packages/core` or an app's `domain` folder is saved; run the i18n check when a locale file is saved; run the size check after a build.
- **Property-based tests**: the properties listed above.
- **MCP**: Context7 for current docs of Hono, D1, Workbox, and Preact.

## Open questions

1. **Hosting account.** The design assumes a free Cloudflare account for the server and apps. The fallback is GitHub Pages for the apps, but the sync server still needs a host.
2. **Bambara review.** Someone fluent needs to review the Bambara text before the demo video.
3. **Seed data.** The list of Bamako markets and typical units should be checked by you (for example Grand Marché, Médine, Niaréla, Dibida).
