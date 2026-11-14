# Implementation tasks: Rezote

The submission deadline is December 4, 2026, 2:00 pm Pacific Time. Each task lists the requirements it covers.

## Week 1 (Nov 14 to Nov 20): skeleton and server

- [ ] 1. Set up the repository
  - npm workspaces, TypeScript strict, Vite, Vitest, fast-check, ESLint
  - MIT `LICENSE`, `.gitignore` that does not exclude `.kiro`
  - Steering files: `product.md`, `tech.md`, `structure.md`
  - GitHub Actions: typecheck, tests, size check
  - _Requirements: 10.1, 10.2, 4.4_

- [ ] 2. Core event model and replay
  - `Event` type, `defineApp`, schema registry with `valibot`, `writersOnly()` marker
  - Deterministic replay in `(ts, id)` order, duplicate-safe merge
  - Property tests: shuffle invariance, duplicate invariance, merge laws
  - _Requirements: 2.7, 6.2_

- [ ] 3. Core encryption
  - Key generation, links (write and read), HKDF writers key, AES-GCM with envelope as additional data
  - Writers-only field encryption, invalid-event handling
  - Property tests: round trip, tampering fails, read keys cannot open writers-only fields
  - _Requirements: 7.1, 7.2, 7.3, 7.6, 7.7_

- [ ] 4. Core local storage
  - IndexedDB stores `events`, `outbox`, `rejected`, `meta`; atomic emit
  - Tests with `fake-indexeddb`, including reopening after close
  - _Requirements: 1.1, 1.3, 2.1_

- [ ] 5. Sync server
  - Hono routes for spaces and events, D1 schema and migration, idempotent insert
  - Write key hash check (constant time), envelope validation, size and count limits, CORS allow-list, rate limit
  - Route and permission tests with Miniflare
  - `wrangler.toml` and `docs/deploy.md`
  - _Requirements: 2.5, 2.6, 7.5_

- [ ] 6. Core sync engine and status
  - Push and pull cycle, cursor per space, triggers, backoff capped at 5 minutes, rejected events
  - `status` signal, `isGhost`, last sync time, ignored-event count
  - Property test with a fake unreliable server: no event is ever lost
  - _Requirements: 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 7.6_

- [ ] 7. Core UI shell and offline shell
  - `<AppShell>`, `<GhostMark>`, `<ShareButton>`, `<Confirm>`, `<NumberPad>`, formatters and `parseKg`
  - Join flow from links, read-only mode
  - Shared `vite-plugin-pwa` configuration
  - _Requirements: 1.2, 1.4, 3.2, 5.1 to 5.4, 7.4_

## Week 2 (Nov 21 to Nov 27): the two apps

- [ ] 8. Collecte: domain
  - Events, schemas, projection (weighings with running subtotal, farmer gross, deductions, payments, balance, store and factory gap, totals, flags)
  - Property tests: rounding, subtotal, store identity, cancellation, order and duplicate invariance
  - _Requirements: 8.1 to 8.14_

- [ ] 9. Collecte: screens
  - Collector: choose name, farmers, add farmer, weighing with number pad and running subtotal, receipt and share
  - Treasurer: campaign setup, collectors, dashboard, farmer detail, deductions, payments, truckloads, flags, CSV export
  - _Requirements: 8.1 to 8.14, 10.3_

- [ ] 10. Carnet de route: domain
  - Events, schemas, projection (timeline, expenses, fuel amounts, advances, balance, time stopped, consumption, last report, driver last sync)
  - Property tests: balance identity, time stopped never negative, cancellation, order and duplicate invariance
  - _Requirements: 9.1 to 9.13_

- [ ] 11. Carnet de route: screens
  - Driver: current trip, quick buttons, entry form, fuel form, resume, end trip, GPS setting (off by default)
  - Owner: truck overview, timeline, totals, time stopped, consumption, advances, start trip, past trips, share summary
  - _Requirements: 9.1 to 9.13, 10.3_

- [ ] 12. Size budget check and Kiro hooks
  - `scripts/check-size.ts`, fail above 150 KB gzip per app
  - Hooks: related tests on save; size check after build
  - _Requirements: 4.1, 4.2, 4.4_

## Week 3 (Nov 28 to Dec 4): demo data, documentation, submission

- [ ] 13. Demo data
  - `scripts/seed-demo.ts`: cotton campaign and truck with two trips, values from `docs/research.md`
  - _Requirements: 10.4_

- [ ] 14. Documentation
  - `README.md`: problem, setup, architecture diagram, encryption and its limitations, demo links, how Kiro was used
  - `docs/new-app.md`: build a third app on the skeleton
  - `docs/deploy.md`: Cloudflare account, D1 database, Worker, Pages, environment variables
  - _Requirements: 6.4, 7.8, 10.5_

- [ ] 15. Deployment (done by you, following `docs/deploy.md`)
  - Sync server on Cloudflare Workers with D1; both apps on Cloudflare Pages
  - Run the demo seed against the deployed server
  - Manual test on two real phones: airplane mode, record data, reconnect, check the other phone
  - _Requirements: 1.4, 10.4_

- [ ] 16. Submission checklist (done by you)
  - Request Kiro credits before Dec 1, 12:00 pm PT
  - Demo video under 3 minutes on YouTube: a collector in airplane mode weighs bundles and shares a receipt, the treasurer's phone gets the data after reconnecting; a driver logs fuel and a convoy wait offline, the owner sees the trip update
  - Devpost form: category Skeleton Crew, Best Startup Project bonus (founder of Sojago, LinkedIn, sojago.com), app URLs, demo links, repo URL, Kiro write-up
  - Optional bonuses: blog post mentioning Kiroween 2026, social post starting with `#KiroweenHackathon26`
  - Submit before Dec 4, 2:00 pm PT
