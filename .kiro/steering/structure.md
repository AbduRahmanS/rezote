# Code structure

```
packages/core/          the skeleton (must stay app-agnostic: no import from apps/)
  src/event.ts          event model, canonical order, merge
  src/crypto.ts         keys, seal/open, writers-only fields
  src/links.ts          write and read share links
  src/storage.ts        IndexedDB: events, outbox, rejected, meta
  src/sync.ts           sync engine and HTTP transport
  src/app.ts            defineApp + runtime (RezoteApp)
  src/node.ts           client without IndexedDB, for scripts
  src/format.ts         FCFA, kg, liters, dates, durations
  src/router.ts         hash router
  src/ui/               AppShell, StatusBar, GhostMark, NumberPad, ShareButton, styles.css
  vite.mjs              shared Vite + PWA config
  test/                 core tests (property-based where possible)
apps/<app>/
  src/domain/           events.ts (schemas), project.ts (pure projection), text.ts (receipts, summaries, CSV), app.ts (defineApp), *.test.ts
  src/screens/          Preact screens; no business rules here, only calls to the domain
  src/runtime.ts        createApp + per-phone settings (role, GPS)
  src/ui.tsx            routes
server/
  src/index.ts          Hono routes
  migrations/           D1 schema
  test/                 route tests over a D1 shim on node:sqlite
scripts/                size check, icons, demo seed
docs/                   research, deployment, guide for a third app
```

## Conventions

- Business rules live in `src/domain` and are tested there. Screens only read the view and call `app.emit`.
- Event type names: `<app>/<entity>.<past-tense verb>`, for example `collecte/bundle.recorded`.
- Entity IDs are `crypto.randomUUID()` generated on the phone.
- Screens use `act()` to show errors to the user in French.
