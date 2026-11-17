# Requirements: new app command

## Introduction

Rezote is a template. Today, building a third app means copying `apps/carnet-de-route`, renaming files by hand, and deleting most of it (`docs/new-app.md`). That is slow and easy to get wrong, and nothing checks that the skeleton still works for an app other than the two shipped ones.

This feature adds one command that creates a small, working app on the skeleton, and a CI check that builds such an app on every push. The generated app records entries offline, shows ghosts, syncs, shares write and read links, and can be cancelled with a reason. It is the starting point a developer replaces with their own events, projection, and screens.

## Glossary

- **Starter app**: the app the command generates from `templates/app`.
- **Slug**: the app's short name (for example `puits`). It is the folder name, the event type prefix, the IndexedDB name, and the server's app tag.

## Requirements

### Requirement 1: One command creates a working app

**User story:** As a developer using the template, I want one command to create a new app, so that I start from working code instead of a copy to clean up.

#### Acceptance criteria

1. WHEN the developer runs `npm run new-app -- <slug> "<Display name>"` THEN the system SHALL create `apps/<slug>` from `templates/app`, with the slug and name filled in.
2. WHEN the slug is not lowercase letters, digits, and hyphens (2 to 32 characters, starting with a letter) THEN the system SHALL stop with an error and create nothing.
3. WHEN `apps/<slug>` already exists THEN the system SHALL stop with an error and change nothing.
4. The generated app SHALL get a dev server port that no other app uses.
5. The generated app SHALL reuse the D1 database ID of an existing app when there is one, and SHALL be served on `workers.dev` until the developer sets a custom domain.
6. The generated app SHALL have its own accent color and icons.
7. WHEN the files are written THEN the system SHALL run `npm install` so the lockfile includes the new workspace, unless `--no-install` is given.
8. WHEN it finishes THEN the system SHALL print the next steps (dev, test, deploy) and where to write events, projection, and screens.

### Requirement 2: The starter app follows the skeleton's rules

**User story:** As a developer, I want the starter app to show the right patterns, so that my app keeps the guarantees of the two shipped apps.

#### Acceptance criteria

1. The starter app SHALL declare its events with Zod, named `<slug>/<entity>.<past tense>`.
2. Its projection SHALL be a pure function, and SHALL ship with fast-check properties: same result for any order and duplication of events, and a cancelled entry is never listed.
3. Its screens SHALL work offline, mark unsent entries with `GhostMark`, hide recording controls for read-only links, and ask for a reason before a cancellation (`askReason`).
4. Its interface text SHALL be in French, and SHALL use the shared building blocks from `@rezote/core/react` and `@rezote/ui`.
5. Its API route SHALL serve only spaces of its own app.

### Requirement 3: The whole toolchain picks up new apps

**User story:** As a developer, I want a new app to be built, type-checked, tested, and size-checked like the others without editing root scripts.

#### Acceptance criteria

1. `npm run build` and `npm run typecheck` SHALL include every workspace that defines those scripts.
2. `npm run check:size` with no arguments SHALL check every `apps/*/dist/client` folder.
3. `npm run icons` SHALL generate icons for every app that declares an accent color in its `package.json`.
4. The size of the two shipped apps and their icons SHALL not change.

### Requirement 4: CI proves the skeleton stays generic

**User story:** As the maintainer, I want CI to build a fresh starter app, so that a change to the skeleton that only works for the two shipped apps fails.

#### Acceptance criteria

1. WHEN CI runs THEN it SHALL generate a starter app, then type-check, lint, test, build, and size-check it.
2. IF any of these steps fails THEN CI SHALL fail.
