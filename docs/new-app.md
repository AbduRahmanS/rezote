# Building a third app on Rezote

This guide builds a small app, **Puits** (well repairs), to show what you write and what the skeleton does for you. You write Zod event schemas, a pure projection, and TanStack Router screens. The skeleton handles local storage, encryption, the outbox, sync, ghosts, share links, the sync API, and the offline app shell.

## 1. Copy an app folder

Copy `apps/carnet-de-route` to `apps/puits`, then:

- `package.json`: rename to `@rezote/puits`.
- `wrangler.jsonc`: set `"name": "rezote-puits"` (keep the same D1 database and migrations).
- `vite.config.ts`: pick a free port, for example `rezoteConfig({ port: 5175 })`.
- `src/routes/api/$.ts`: `createSyncApi({ apps: ["puits"] })`. The API only serves spaces created by this app.
- `public/manifest.webmanifest` and `src/routes/__root.tsx`: change the name, description, and title.
- Delete `src/domain`, `src/components`, and the screens under `src/routes/_app`; you will write your own.
- Add `puits` to `scripts/make-icons.mjs`, then run `npm install` and `npm run icons`.

## 2. Declare the events

Events are facts that happened. They are never changed or deleted; a correction is a new event.

```ts
// src/domain/events.ts
import { z } from "zod";

const id = z.string().min(1).max(64);
const at = z.number().int();

export const events = {
  "puits/breakdown.reported": z.object({ breakdownId: id, village: z.string().trim().min(1).max(60), note: z.string().max(300).optional(), at }),
  "puits/repair.done": z.object({ breakdownId: id, technician: z.string().min(1), cost: z.number().int().min(0), at }),
  "puits/item.cancelled": z.object({ itemId: id, reason: z.string().min(1) }),
};
export type PuitsEvents = typeof events;
```

Rules:

- Name types `<app>/<entity>.<past tense>`.
- Money in integer FCFA, weights in integer grams.
- Every entity carries its own random ID, created on the phone.
- A field only people with the write link may read (such as a GPS position) must be optional and listed in `writersOnly`.

## 3. Write the projection

The projection is a pure function from the event list to what the screens show. The skeleton passes events sorted by `(ts, id)` without duplicates, so every phone computes the same result from the same events.

```ts
// src/domain/project.ts
import type { AppEvent } from "@rezote/core";
import type { PuitsEvents } from "./events.ts";

export function project(events: readonly AppEvent<PuitsEvents>[]) {
  const cancelled = new Set(events.flatMap((e) => (e.type === "puits/item.cancelled" ? [e.payload.itemId] : [])));
  const breakdowns = new Map<string, { id: string; village: string; at: number; repairedAt: number | null; eventId: string }>();
  for (const e of events) {
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
  return { open: [...breakdowns.values()].filter((b) => b.repairedAt === null) };
}
```

Collect cancellations first and index in a first pass, as above. Then the result does not depend on whether a repair arrived before or after its breakdown.

## 4. Test it with properties

Copy the pattern from `apps/collecte/src/domain/project.test.ts`: generate random valid event lists with fast-check, then check that shuffling them and adding duplicates gives the same projection. Add one property per business rule ("a repaired well is never in the open list").

## 5. Define the app and the runtime

```ts
// src/domain/app.ts
import { defineApp } from "@rezote/core";
import { events } from "./events.ts";
import { project } from "./project.ts";
export const puits = defineApp({ name: "puits", events, project });

// src/runtime.ts
import { createApp } from "@rezote/core";
import { useAppView } from "@rezote/core/react";
import { puits } from "./domain/app.ts";
export const app = createApp(puits); // talks to /api on the same origin
export const useView = () => useAppView(app)!;
```

The root route (`src/routes/__root.tsx`) wraps every page in `<AppShell app={app} appName="Puits">`, which opens storage, joins a space from a share link, starts sync, and shows the status bar and menu.

## 6. Write the screens

```tsx
// src/routes/_app/index.tsx
import { act, GhostMark } from "@rezote/core/react";
import { createFileRoute } from "@tanstack/react-router";
import { app, useView } from "../../runtime.ts";

export const Route = createFileRoute("/_app/")({ component: Open });

function Open() {
  const view = useView();
  const report = () =>
    act(() => app.emit("puits/breakdown.reported", { breakdownId: crypto.randomUUID(), village: "Kignan", at: Date.now() }));
  return (
    <div>
      <button className="btn primary" onClick={report}>Signaler une panne</button>
      <ul className="list">
        {view.open.map((b) => (
          <li key={b.id} className="row">
            {b.village}
            <GhostMark app={app} id={b.eventId} />
          </li>
        ))}
      </ul>
    </div>
  );
}
```

`app.emit` validates the payload with Zod, encrypts it, saves it on the phone, queues it, and starts a sync. The view updates immediately, and the record shows a 👻 until the server confirms it. Use TanStack Form with Zod validators for anything longer than one field, as in `apps/carnet-de-route/src/routes/_app/start.tsx`.

## 7. Build and deploy

```bash
npm run build -w @rezote/puits     # vite build + offline service worker
npm run deploy -w @rezote/puits    # one Worker: app + /api
```

## What you get for free

| Feature | Where |
|---|---|
| Works offline, including the first screen after a reload | `scripts/build-sw.mjs`, `packages/core/src/storage.ts` |
| Outbox with retry and backoff, idempotent server | `packages/core/src/sync.ts`, `packages/sync-api` |
| End-to-end encryption, write and read links | `packages/core/src/crypto.ts`, `links.ts` |
| Status bar, ghosts, space menu, share panel | `packages/core/src/react` |
| French formats for FCFA, kg, liters, dates | `packages/core/src/format.ts` |
| Size budget in CI | `scripts/check-size.mjs` |
