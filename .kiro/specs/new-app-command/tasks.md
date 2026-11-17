# Implementation tasks: new app command

- [x] 1. Make the root scripts app-agnostic
  - `build` and `typecheck` over all workspaces; `check:size` defaults to every `apps/*/dist/client`
  - Accent colors in each app's `package.json`; `make-icons.mjs` reads them
  - Check that the shipped apps' build output, sizes, and icons are unchanged
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 2. Write the starter app in `templates/app`
  - Events, projection, fast-check properties, screens, API route, Worker entry, Vite and Wrangler config, manifest, styles
  - Exclude `templates/**` from ESLint
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [x] 3. Write `scripts/new-app.mjs` and the `new-app` npm script
  - Validate the slug, refuse an existing folder, pick a free port, reuse the D1 ID, pick an accent, fill placeholders, generate icons, run `npm install` unless `--no-install`, print next steps
  - _Requirements: 1.1 to 1.8_

- [x] 4. Verify a generated app end to end
  - Generate one, then typecheck, lint, test, build, size-check, run it locally, record an entry offline, see the ghost, reconnect, see it sync, open the read link
  - Delete the generated app afterwards
  - _Requirements: 1.1, 2.3_

- [x] 5. CI job `starter`
  - _Requirements: 4.1, 4.2_

- [x] 6. Docs and Kiro
  - Rewrite `docs/new-app.md` around the command
  - Skill `.kiro/skills/new-rezote-app` that drives the command and the follow-up work
  - README: "Start a new app" section
  - Review the starter with the `field-reviewer` agent and fix its findings (submit disabled while saving, French length messages, amount limit checked in the form)
  - _Requirements: 1.8, 2.3, 2.4_
