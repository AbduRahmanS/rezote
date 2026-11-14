# Implementation tasks: Rezote

The submission deadline is December 4, 2026, 2:00 pm Pacific Time. Each task lists the requirements it covers.

## Week 1 (Nov 14 to Nov 20): skeleton and server

- [ ] 1. Set up the repository
  - npm workspaces, TypeScript strict, Vite, Vitest, fast-check, ESLint
  - MIT `LICENSE`, `.gitignore` that does not exclude `.kiro`
  - Steering files: `product.md`, `tech.md`, `structure.md`
  - GitHub Actions: typecheck, tests, i18n check, size check
  - _Requirements: 10.1, 10.2, 4.4, 5.4_

- [ ] 2. Core event model and replay
  - `Event` type, `defineApp`, schema registry with `valibot`
  - Deterministic replay in `(ts, id)` order, duplicate-safe merge
  - Property tests: shuffle invariance, duplicate invariance, merge laws
  - _Requirements: 2.7, 6.2_

- [ ] 3. Core local storage
  - IndexedDB stores `events`, `outbox`, `rejected`, `meta`; atomic emit
  - Tests with `fake-indexeddb`, including reopening after close
  - _Requirements: 1.1, 1.3, 2.1_

- [ ] 4. Sync server
  - Hono routes for spaces and events, D1 schema and migration, idempotent insert
  - Write key (hashed, constant-time compare), schema validation, size and count limits, CORS allow-list, rate limit
  - Route and permission tests with Miniflare
  - _Requirements: 2.5, 2.6, 7.1, 7.4, 7.5_

- [ ] 5. Core sync engine and status
  - Push and pull cycle, cursor per space, triggers, backoff capped at 5 minutes, rejected events
  - `status` signal, `isGhost`, last sync time
  - Property test with a fake unreliable server: no event is ever lost
  - _Requirements: 2.2, 2.3, 2.4, 3.1, 3.2, 3.3_

- [ ] 6. Core UI shell, sharing, i18n, offline shell
  - `<AppShell>`, `<GhostMark>`, `<ShareButton>`, `<Confirm>`, formatters
  - Write and read links, join flow, read-only mode
  - Shared `vite-plugin-pwa` configuration
  - i18n key check script
  - _Requirements: 1.2, 1.4, 3.2, 5.1, 5.2, 5.3, 5.4, 7.2, 7.3_

## Week 2 (Nov 21 to Nov 27): the two apps

- [ ] 7. Collecte: domain
  - Events, schemas, projection (weights per grade, owed, paid, balance, totals, flags)
  - Property tests: rounding, totals, cancellation, order and duplicate invariance
  - _Requirements: 8.1 to 8.12_

- [ ] 8. Collecte: screens
  - Collector: choose name, farmers, add farmer, record delivery, receipt and share
  - Treasurer: campaign setup, collectors, dashboard, farmer detail, payments, flags, CSV export
  - French and Bambara text
  - _Requirements: 8.1 to 8.12, 10.3_

- [ ] 9. Carnet de route: domain
  - Events, schemas, projection (timeline, expenses, advances, balance, time stopped, last position, driver last sync)
  - Property tests: balance identity, time stopped never negative, cancellation, order and duplicate invariance
  - _Requirements: 9.1 to 9.11_

- [ ] 10. Carnet de route: screens
  - Driver: current trip, quick-entry buttons, entry form with optional GPS, resume, end trip
  - Owner: truck overview, timeline, totals, advances, start trip, past trips, share summary
  - French and Bambara text
  - _Requirements: 9.1 to 9.11, 10.3_

- [ ] 11. Size budget check and Kiro hooks
  - `scripts/check-size.ts`, fail above 150 KB gzip per app
  - Hooks: related tests on save, i18n check on locale save, size check after build
  - _Requirements: 4.1, 4.2, 4.4, 5.4_

## Week 3 (Nov 28 to Dec 4): deploy, documentation, submission

- [ ] 12. Deploy and demo data
  - Sync server on Cloudflare Workers with D1; both apps on Cloudflare Pages
  - `scripts/seed-demo.ts` with a cotton campaign and a truck with two trips
  - Manual test on two real phones: airplane mode, record data, reconnect, check the other phone
  - _Requirements: 1.4, 10.4_

- [ ] 13. Documentation
  - `README.md`: problem, setup, architecture diagram, security limitation, demo links, how Kiro was used
  - `docs/new-app.md`: build a third app on the skeleton
  - `docs/translations.md`: Bambara review status
  - _Requirements: 6.4, 7.6, 10.5_

- [ ] 14. Submission checklist (done by you)
  - Request Kiro credits before Dec 1, 12:00 pm PT
  - Bambara text reviewed by a fluent speaker
  - Demo video under 3 minutes on YouTube: a collector in airplane mode records deliveries, the treasurer's phone gets them after reconnecting; a driver logs a checkpoint and a breakdown offline, the owner sees the trip update
  - Devpost form: category Skeleton Crew, Best Startup Project bonus (founder of Sojago, LinkedIn, sojago.com), app URLs, demo links, repo URL, Kiro write-up
  - Optional bonuses: blog post mentioning Kiroween 2026, social post starting with `#KiroweenHackathon26`
  - Submit before Dec 4, 2:00 pm PT
