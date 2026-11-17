# Design: new app command

## Overview

```
templates/app/                 starter app source, with placeholders (not a workspace, not linted or type-checked as is)
scripts/new-app.mjs            copies the template into apps/<slug>, fills the placeholders, runs npm install
scripts/make-icons.mjs         reads each app's accent from package.json ("rezote": { "accent": "#…" })
scripts/check-size.mjs         no arguments: every apps/*/dist/client
package.json                   build and typecheck run over all workspaces
.github/workflows/ci.yml       second job: generate a starter app and check it
```

The template is a real app with placeholders, not a code generator. A developer reads it like any other app, and the CI job proves that what it generates passes every check. Placeholders appear where a value differs per app; everything else is copied as is.

## Placeholders

| Placeholder | Value | Example |
|---|---|---|
| `__SLUG__` | slug | `puits` |
| `__NAME__` | display name | `Puits` |
| `__PORT__` | first free port from 5175, after the ports in `apps/*/vite.config.ts` | `5175` |
| `__DATABASE_ID__` | `database_id` from the first existing `apps/*/wrangler.jsonc`, or a `REPLACE_WITH_YOUR_D1_ID` marker | |
| `__ACCENT__` | icon color, from a fixed palette, chosen by the number of existing apps | `#a78bfa` |
| `__HUE__` | the matching OKLCH hue for the theme's `--primary` | `295` |

Placeholders in TypeScript sit in positions that only parse after replacement (for example `port: __PORT__`). That is why `templates/**` is excluded from ESLint and from every `tsconfig`; the CI job checks the generated output instead.

## Starter app

A shared register ("registre"): anyone with the write link records an entry with a short text and an optional amount in FCFA; everyone sees the list and the total. Small enough to read in a few minutes, but it uses every part of the skeleton.

Events:

- `__SLUG__/space.named` `{ title }`: written when the space is created.
- `__SLUG__/entry.recorded` `{ entryId, text, amount?, at }`: amount in integer FCFA.
- `__SLUG__/entry.cancelled` `{ entryId, reason }`.

Projection (pure, input in canonical order):

- `title`: the last `space.named` in canonical order, or `null`.
- `entries`: recorded entries that are not cancelled, newest first by `at`, then `ts` and `id`.
- `total`: sum of amounts of listed entries (integers, no rounding).
- Cancellations are collected in a first pass, so a cancellation that arrives before its entry still applies.

Properties (`project.test.ts`, fast-check):

1. Projecting any shuffle of the events with duplicates added (through `canonical`) gives the same view.
2. A cancelled entry is never listed and never counted in the total.
3. The total equals the sum of the listed amounts.

Screens: `__root.tsx` (AppShell), `_app.tsx` (welcome screen until the phone has a space, waiting screen until the title arrives), `_app/index.tsx` (form for writers, list with `GhostMark`, cancel with `askReason`, total), `new.tsx` (create a space), `api/$.ts` (`createSyncApi({ apps: ["__SLUG__"] })`). `routeTree.gen.ts` is committed in the template so the app type-checks before its first build.

## Root scripts

- `build`: `npm run build --workspaces --if-present`. Packages have no build script, so only apps build, in folder order.
- `typecheck`: `npm run typecheck --workspaces --if-present && tsc -p scripts`.
- `check:size`: `node scripts/check-size.mjs`; with no arguments the script checks every `apps/*/dist/client`.
- `new-app`: `node scripts/new-app.mjs`.

The two shipped apps declare their current icon colors (`#ff8a1f`, `#2dd4bf`) in `package.json`, so `npm run icons` writes the same files as before.

## CI

A second job, `starter`, runs after `npm ci`: `node scripts/new-app.mjs ci-starter "Démo" --no-install`, then `npm install --no-audit --no-fund`, then typecheck, lint, the starter's tests, its build, and its size check. It never deploys.

## Out of scope

- Publishing the template to npm or the TanStack CLI.
- Removing an app.
- Deploy configuration beyond `workers.dev`: custom domains stay a manual step (`docs/deploy.md`).
