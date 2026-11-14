# Implementation tasks: Hors-Ligne

Target dates assume the submission deadline of December 4, 2026, 2:00 pm Pacific Time. Each task lists the requirements it covers.

## Week 1 (Nov 14 to Nov 20): skeleton and Tontine

- [ ] 1. Set up the repository
  - npm workspaces, TypeScript strict, Vite, Vitest, fast-check, ESLint
  - MIT `LICENSE`, `.gitignore` that does not exclude `.kiro`
  - Steering files: `product.md`, `tech.md`, `structure.md`
  - GitHub Actions: typecheck, tests, i18n check, size check
  - _Requirements: 10.1, 10.2, 4.4, 5.4_

- [ ] 2. Core event model and replay
  - `Event` type, `defineApp`, schema registry with `valibot`
  - Deterministic replay sorted by `(ts, id)`, duplicate-safe merge
  - Property tests: shuffle invariance, duplicate invariance, merge laws
  - _Requirements: 2.7, 6.2_

- [ ] 3. Core local storage
  - IndexedDB stores `events`, `outbox`, `meta`; atomic emit (event + outbox in one transaction)
  - Tests with `fake-indexeddb`, including reopen after close
  - _Requirements: 1.1, 1.3, 2.1_

- [ ] 4. Sync server
  - Hono routes `POST /spaces`, `POST /spaces/:space/events`, `GET /spaces/:space/events`
  - D1 schema and migration, idempotent insert, parameterized queries
  - Validation: schemas, space match, size and count limits, CORS allow-list, rate limit
  - Route tests with Miniflare
  - _Requirements: 2.5, 2.6, 7.1, 7.3_

- [ ] 5. Core sync engine and status
  - Push and pull cycle, cursor per space, triggers, exponential backoff capped at 5 min
  - `status` signal and `isGhost`; rejected-event handling
  - Property test with a fake unreliable server: no event is ever lost
  - _Requirements: 2.2, 2.3, 2.4, 3.1, 3.2, 3.3_

- [ ] 6. Core UI shell, i18n, and offline shell
  - `<AppShell>`, `<GhostMark>`, `<ShareButton>`, language switch, `formatFCFA`
  - `vite-plugin-pwa` precache configuration shared by both apps
  - Share links with the space ID in the URL fragment
  - i18n key check script
  - _Requirements: 1.2, 1.4, 3.2, 5.1, 5.2, 5.3, 5.4, 7.2_

- [ ] 7. Tontine app
  - Events, projection, property tests (pot equals sum, missing amount identity, cancellation order)
  - Screens: create group, round view with paid / partial / unpaid, record payment, cancel payment, share summary
  - French and Bambara text
  - _Requirements: 8.1 to 8.8, 10.3_

## Week 2 (Nov 21 to Nov 27): Sugu, deployment, Kiro hooks

- [ ] 8. Sugu app
  - Events, seed products and markets, projection (latest, 7-day lower median, stale)
  - Property tests: median is a reported price, order invariance
  - Screens: price board by product, report a price, add product or market
  - French and Bambara text
  - _Requirements: 9.1 to 9.5, 10.3_

- [ ] 9. Size budget check
  - `scripts/check-size.ts` over each app's precached files, fail over 150 KB gzip
  - _Requirements: 4.1, 4.2, 4.4_

- [ ] 10. Kiro hooks
  - Run related tests on save in `packages/core` and app `domain` folders
  - Run the i18n check on save of locale files
  - Run the size check after build
  - _Requirements: 4.4, 5.4_

- [ ] 11. Deploy
  - Sync server on Cloudflare Workers with D1
  - Both apps on Cloudflare Pages (or GitHub Pages as fallback)
  - Manual offline test on a real phone: airplane mode, add records, reconnect, check a second device
  - _Requirements: 1.4, 10.4_

## Week 3 (Nov 28 to Dec 4): documentation and submission

- [ ] 12. Documentation
  - `README.md`: problem, setup, architecture diagram, security limitation, how Kiro was used
  - `docs/new-app.md`: build a third app on the skeleton
  - `docs/translations.md`: Bambara review status
  - _Requirements: 6.4, 7.4, 10.5_

- [ ] 13. Submission checklist (done by you)
  - Request Kiro credits before Dec 1, 12:00 pm PT
  - Bambara text reviewed by a fluent speaker
  - Demo video under 3 minutes on YouTube (show airplane mode, ghosts, sync to a second phone)
  - Devpost form: category Skeleton Crew, Best Startup Project bonus (founder of Sojago, LinkedIn, sojago.com), app URLs, repo URL, Kiro write-up
  - Optional bonuses: blog post mentioning Kiroween 2026, social post starting with `#KiroweenHackathon26`
  - Submit before Dec 4, 2:00 pm PT
