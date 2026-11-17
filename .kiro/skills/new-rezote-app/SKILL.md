---
name: new-rezote-app
description: Create a new offline-first app on the Rezote skeleton, from the field problem to a deployed Worker. Use when the user wants to add an app, build a third app, or turn an idea into a Rezote app.
---

# New Rezote app

Rezote apps are for work recorded where there is no network, shared by several people who must agree on the numbers. Follow these steps in order. Guide with full examples: `docs/new-app.md`. Rules: `.kiro/steering/tech.md` and `product.md`.

## 1. Check the idea fits

Ask the user, and write the answers down before any code:

- Who records data, where, and how long are they offline? If the answer is "a few minutes", Rezote is probably not needed: say so.
- Who reads the data, and which numbers must be the same on every phone (totals, balances, durations)?
- What would be dangerous to share with a read link (positions, phone numbers)? Those fields become `writersOnly`.
- Which facts and figures does the app need (prices, places)? Take them from `docs/research.md` or from a cited source, never invent them.

## 2. Generate the app

```bash
npm run new-app -- <slug> "<Nom affiché>"
```

The slug is permanent: it is the IndexedDB name and the server's app tag. The command picks a free port, reuses the D1 database, generates icons, and updates the lockfile. The result already builds, syncs, and passes its tests.

## 3. Replace the starter domain

In `apps/<slug>/src/domain`:

1. `events.ts`: one Zod schema per fact, named `<slug>/<entity>.<past tense>`. Money in integer FCFA, weights in integer grams. Every entity has its own ID made on the phone. Corrections are `*.cancelled` events with a reason.
2. `project.ts`: a pure function of the events. Collect cancellations in a first pass. Round once, as late as possible, and say where in a comment.
3. `project.test.ts`: keep the order-and-duplicates property, then add one fast-check property per business rule. Run `npx vitest --run apps/<slug>`.

## 4. Write the screens

In `apps/<slug>/src/routes/_app/`. Routes read the view and call `app.emit` inside `act()`. Use the blocks from `@rezote/core/react` and `@rezote/ui`. French text, short sentences. Mark unsent records with `GhostMark` and `usePendingClass`. Hide recording controls when `useCanWrite(app)` is false. Ask a reason with `askReason()` before a cancellation.

## 5. Check

```bash
npm test && npm run typecheck && npm run lint
npm run build && npm run check:size
```

Then run the app (`npm run db:migrate:local -w @rezote/<slug>` once, then `npm run dev -w @rezote/<slug>`) and test on two browser profiles: record offline, see the ghost, reload offline, reconnect, open the read link. Ask the `field-reviewer` agent to review the screens.

## 6. Deploy

Set a custom domain in `wrangler.jsonc` if needed (`docs/deploy.md`), then `npm run deploy -w @rezote/<slug>`. Ask the user before deploying.
