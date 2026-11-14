# Building a third app on Rezote

This guide builds a small app, **Puits** (well repairs), to show what you write and what the skeleton does for you. You write the event schemas, a pure projection, and the screens. The skeleton handles local storage, encryption, the outbox, sync, ghosts, share links, and the offline app shell.

## 1. Create the package

```
apps/puits/
├── index.html            copy from apps/collecte and change the title
├── package.json          copy from apps/collecte, rename to @rezote/puits
├── tsconfig.json         copy from apps/collecte
├── vite.config.ts
└── src/
    ├── domain/events.ts
    ├── domain/project.ts
    ├── domain/project.test.ts
    ├── domain/app.ts
    ├── runtime.ts
    ├── ui.tsx
    └── main.tsx
```

`vite.config.ts`:

```ts
import { rezoteConfig } from "@rezote/core/vite";
import { defineConfig } from "vite";

export default defineConfig(rezoteConfig({ name: "Puits · Rezote", shortName: "Puits", description: "Pannes de forages", port: 5175 }));
```

Add `"puits"` to the `APPS` set in `server/src/index.ts`, add the app to `scripts/make-icons.mjs`, and run `npm install` and `npm run icons`.

## 2. Declare the events

Events are facts that happened. They are never changed or deleted; a correction is a new event.

```ts
// src/domain/events.ts
import * as v from "valibot";

const id = v.pipe(v.string(), v.minLength(1), v.maxLength(64));
const at = v.pipe(v.number(), v.integer());

export const events = {
  "puits/breakdown.reported": v.object({ breakdownId: id, village: v.pipe(v.string(), v.maxLength(60)), note: v.optional(v.string()), at }),
  "puits/repair.done": v.object({ breakdownId: id, technician: v.string(), cost: v.pipe(v.number(), v.integer(), v.minValue(0)), at }),
  "puits/item.cancelled": v.object({ itemId: id, reason: v.string() }),
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
import { puits } from "./domain/app.ts";
export const app = createApp(puits, { serverUrl: import.meta.env.VITE_SYNC_URL ?? "http://localhost:8787" });
```

## 6. Write the screens

```tsx
// src/ui.tsx
import { navigate } from "@rezote/core";
import { AppShell, GhostMark } from "@rezote/core/ui";
import { app } from "./runtime.ts";

export function App() {
  if (!app.ready.value) return null;
  const view = app.view.value;
  return (
    <AppShell app={app} appName="Puits" onNew={() => navigate("new")}>
      {!app.currentId.value ? (
        <button class="btn primary" onClick={() => app.createSpace("Forages de Kignan")}>Créer</button>
      ) : (
        <ul class="list">
          {view?.open.map((b) => (
            <li key={b.id} class="row">
              {b.village}
              <GhostMark app={app} id={b.eventId} />
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
```

To record something, call `app.emit("puits/breakdown.reported", { … })`. It validates the payload, encrypts it, saves it on the phone, queues it, and starts a sync. The view updates immediately, and the record shows a 👻 until the server confirms it.

`main.tsx` is the same as in the other apps: import `@rezote/core/styles.css`, call `app.init()`, then render `<App />`.

## What you get for free

| Feature | Where |
|---|---|
| Works offline, including the first screen after a reload | `vite.mjs` (Workbox precache), `storage.ts` |
| Outbox with retry and backoff, idempotent server | `sync.ts`, `server/src/index.ts` |
| End-to-end encryption, write and read links | `crypto.ts`, `links.ts` |
| Status bar, ghosts, space menu, share panel | `ui/shell.tsx`, `ui/widgets.tsx` |
| French formats for FCFA, kg, liters, dates | `format.ts` |
| Size budget in CI | `scripts/check-size.mjs` |
