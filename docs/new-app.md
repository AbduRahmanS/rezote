# Building a new app on Rezote

You write Zod event schemas, a pure projection, and TanStack Router screens. The skeleton handles local storage, encryption, the outbox, sync, ghosts, share links, the sync API, and the offline app shell.

This guide builds **Puits** (well repairs in villages) as an example.

## 1. Generate the app

```bash
npm run new-app -- puits "Puits"
```

This copies `templates/app` to `apps/puits` and fills in:

- the package name `@rezote/puits`, the Worker name `rezote-puits`, and the app tag the API accepts;
- a free dev port (5175 for the first new app);
- the D1 database ID from the existing apps;
- an accent color, with matching icons;
- the lockfile (`npm install`).

The result is a working shared register. Anyone with the write link records entries with an optional amount, everyone sees the list and the total, and entries can be cancelled with a reason. It runs offline, shows ghosts, syncs, and has property tests. Try it before changing anything:

```bash
npm run db:migrate:local -w @rezote/puits   # once
npm run dev -w @rezote/puits                # http://localhost:5175
```

The slug (`puits`) is permanent: it names the phone's IndexedDB database and tags the app's spaces on the server.

In Kiro, the `new-rezote-app` skill walks through these steps. The `field-reviewer` agent reviews the screens afterwards.

## 2. Declare the events

Events are facts that happened. They are never changed or deleted; a correction is a new event. Replace `src/domain/events.ts`:

```ts
import { z } from "zod";

const id = z.string().min(1).max(64);
const at = z.number().int();

export const events = {
  // Kept from the starter: the welcome, waiting, and create screens use it.
  "puits/space.named": z.object({ title: z.string().trim().min(1).max(60) }),
  "puits/breakdown.reported": z.object({ breakdownId: id, village: z.string().trim().min(1).max(60), note: z.string().max(300).optional(), at }),
  "puits/repair.done": z.object({ breakdownId: id, technician: z.string().min(1).max(60), cost: z.number().int().min(0), at }),
  "puits/item.cancelled": z.object({ itemId: id, reason: z.string().min(1).max(200) }),
};
export type PuitsEvents = typeof events;
export const writersOnly = {} as const;
```

Rules:

- Name types `<app>/<entity>.<past tense>`.
- Money in integer FCFA, weights in integer grams.
- Every entity carries its own random ID, created on the phone.
- A field only people with the write link may read (such as a GPS position) must be optional and listed in `writersOnly`, for example `{ "puits/breakdown.reported": ["position"] }`.
- After release, add new event types instead of changing old ones: phones keep old events forever.

## 3. Write the projection

The projection is a pure function from the event list to what the screens show. The skeleton passes events sorted by `(ts, id)` without duplicates, so every phone computes the same result from the same events.

```ts
// src/domain/project.ts
import type { AppEvent } from "@rezote/core";
import type { PuitsEvents } from "./events.ts";

export interface Breakdown { id: string; village: string; at: number; repairedAt: number | null; eventId: string }
export interface PuitsView { title: string | null; open: Breakdown[]; repaired: number }

export function project(events: readonly AppEvent<PuitsEvents>[]): PuitsView {
  const cancelled = new Set(events.flatMap((e) => (e.type === "puits/item.cancelled" ? [e.payload.itemId] : [])));
  const breakdowns = new Map<string, Breakdown>();
  let title: string | null = null;
  for (const e of events) {
    if (e.type === "puits/space.named") title = e.payload.title;
    if (e.type === "puits/breakdown.reported" && !cancelled.has(e.payload.breakdownId)) {
      breakdowns.set(e.payload.breakdownId, { id: e.payload.breakdownId, village: e.payload.village, at: e.payload.at, repairedAt: null, eventId: e.id });
    }
  }
  for (const e of events) {
    if (e.type === "puits/repair.done") {
      const b = breakdowns.get(e.payload.breakdownId);
      if (b && b.repairedAt === null) b.repairedAt = e.payload.at;
    }
  }
  const open = [...breakdowns.values()].filter((b) => b.repairedAt === null);
  return { title, open, repaired: breakdowns.size - open.length };
}
```

Collect cancellations first and index in a first pass, as above. Then the result does not depend on whether a repair arrived before or after its breakdown.

Then import `PuitsView` instead of `StarterView` in `src/runtime.ts`.

## 4. Test it with properties

`src/domain/project.test.ts` in the starter shows the pattern. fast-check generates random valid event lists, and the test checks that shuffling them and adding duplicates gives the same projection. Keep that property and add one per business rule, for example "a repaired well is never in the open list". Run `npx vitest --run apps/puits`.

## 5. Write the screens

Screens live under `src/routes/_app/`. They read the view and call `app.emit` inside `act()`, which shows errors as French toasts:

```tsx
// src/routes/_app/index.tsx
import { act, Empty, GhostMark, List, ListItem, PageHeader, useCanWrite, usePendingClass } from "@rezote/core/react";
import { Button } from "@rezote/ui/components/button";
import { createFileRoute } from "@tanstack/react-router";
import { Droplets } from "lucide-react";
import type { Breakdown } from "../../domain/project.ts";
import { app, newId, useView } from "../../runtime.ts";

export const Route = createFileRoute("/_app/")({ component: Open });

function Open() {
  const view = useView();
  const canWrite = useCanWrite(app);
  if (!view) return null;
  const report = () => act(() => app.emit("puits/breakdown.reported", { breakdownId: newId(), village: "Kignan", at: Date.now() }), "Panne signalée");
  return (
    <div>
      <PageHeader title="Pannes en cours" />
      {canWrite && (
        <Button size="lg" className="w-full" onClick={report}>
          Signaler une panne
        </Button>
      )}
      {view.open.length === 0 ? (
        <Empty icon={Droplets}>Aucune panne en cours.</Empty>
      ) : (
        <List className="mt-4">
          {view.open.map((b) => (
            <Row key={b.id} breakdown={b} />
          ))}
        </List>
      )}
    </div>
  );
}

function Row({ breakdown }: { breakdown: Breakdown }) {
  return (
    <li className={usePendingClass(app, breakdown.eventId)}>
      <ListItem title={<>{breakdown.village} <GhostMark app={app} id={breakdown.eventId} compact /></>} />
    </li>
  );
}
```

`app.emit` validates the payload with Zod, encrypts it, saves it on the phone, queues it, and starts a sync. The view updates immediately. The record shows a "non envoyé" badge and a dashed outline until the server confirms it.

- Use TanStack Form with Zod validators and `Field` for anything longer than one button. Disable the submit button while `isSubmitting`, as the starter does.
- Hide recording controls when `useCanWrite(app)` is false (read links).
- Cancel with `askReason()` and a `*.cancelled` event, never by deleting.
- More rules: `.kiro/steering/ui.md`.

## 6. Check and deploy

```bash
npm test && npm run typecheck && npm run lint
npm run build && npm run check:size    # every app, 300 KB budget
npm run deploy -w @rezote/puits        # one Worker: app + /api, on workers.dev
```

For a custom domain, set `"workers_dev": false` and a `routes` entry in `apps/puits/wrangler.jsonc` (see `docs/deploy.md`).

## What you get for free

| Feature | Where |
|---|---|
| Works offline, including the first screen after a reload | `scripts/build-sw.mjs`, `packages/core/src/storage.ts` |
| Outbox with retry and backoff, idempotent server | `packages/core/src/sync.ts`, `packages/sync-api` |
| End-to-end encryption, write and read links | `packages/core/src/crypto.ts`, `links.ts` |
| Status bar, ghosts, space menu, share panel | `packages/core/src/react` |
| Security headers (CSP with script hashes, HSTS) | `packages/core/src/worker.ts`, `security.mjs` |
| French formats for FCFA, kg, liters, dates | `packages/core/src/format.ts` |
| Build, type check, tests, and size budget in CI | `.github/workflows/ci.yml` (the `starter` job also builds a fresh app from the template) |
