# Requirements: Hors-Ligne

## Introduction

Hors-Ligne ("offline" in French) is a skeleton template for building web apps that keep working on slow, expensive, or missing internet connections, as is common in Mali and across West Africa. Every change is saved on the phone first. Unsynced changes wait in a queue (shown as "ghosts" in the UI) and come back to life on the server when the connection returns.

The repository contains one shared skeleton and two separate applications built from it, as the Kiroween 2026 Skeleton Crew category requires:

- **Tontine**: tracks a rotating savings group (members, contributions per round, payout order).
- **Sugu** ("market" in Bambara): traders post the prices of staple goods per market, and everyone sees the latest prices.

Interface languages are French and Bambara. Amounts are in FCFA (XOF), which has no subunits.

## Glossary

- **Event**: an immutable record of one change (for example "Awa paid 10,000 FCFA for round 3"). Apps store events, never mutable rows.
- **Outbox**: the local queue of events created on this device that the server has not yet confirmed.
- **Ghost**: an event that is still in the outbox. The UI marks it visually until it syncs.
- **Projection**: the app state computed by replaying events (for example the tontine balance).
- **Sync server**: the small HTTP service that stores events and returns events from other devices.

## Requirements

### Requirement 1: Offline-first storage

**User story:** As a user with an unreliable connection, I want every action to work without internet, so that a dropped connection never loses my work.

#### Acceptance criteria

1. WHEN the user creates a record THEN the system SHALL save it to local storage (IndexedDB) before any network request.
2. WHEN the device has no connection THEN the system SHALL let the user create, view, and search records with no error message blocking the action.
3. WHEN the user closes and reopens the app offline THEN the system SHALL show all records saved before closing.
4. WHEN the app has been opened online once THEN the system SHALL load fully offline on later visits (service worker caches the app shell).

### Requirement 2: Sync queue

**User story:** As a user, I want my offline changes to reach the server automatically when I am back online, so that I do not have to think about syncing.

#### Acceptance criteria

1. WHEN an event is created THEN the system SHALL add it to the outbox with a globally unique ID.
2. WHEN the connection returns, or every 30 seconds while online, THEN the system SHALL send outbox events to the sync server in batches.
3. WHEN the server confirms an event THEN the system SHALL remove it from the outbox.
4. IF a send fails THEN the system SHALL keep the events in the outbox and retry with exponential backoff, capped at 5 minutes.
5. WHEN the same event is sent more than once THEN the server SHALL store it only once (sync is idempotent).
6. WHEN the system pulls events from the server THEN it SHALL request only events newer than the last cursor it received.
7. WHEN events from several devices are merged in any order THEN every device SHALL compute the same projection.

### Requirement 3: Sync status ("ghosts")

**User story:** As a user, I want to see which of my changes have not synced yet, so that I know what the rest of my group can see.

#### Acceptance criteria

1. WHILE an event is in the outbox THEN the system SHALL display the related record with a ghost marker.
2. THE system SHALL always show the connection state (online, offline, syncing) and the number of pending events.
3. WHEN an event syncs THEN the system SHALL remove its ghost marker without a page reload.

### Requirement 4: Low bandwidth

**User story:** As a user paying for mobile data by the megabyte, I want the app to be small, so that it loads quickly and costs little.

#### Acceptance criteria

1. THE first load of each app SHALL transfer at most 150 KB (gzip), including HTML, CSS, JavaScript, and fonts.
2. THE system SHALL not load web fonts, analytics, or third-party scripts.
3. THE sync protocol SHALL send only new events in each direction, never the full dataset.
4. THE build SHALL fail if an app exceeds the size budget.

### Requirement 5: Languages and formats

**User story:** As a user in Mali, I want the app in French or Bambara with local number formats, so that I can use it comfortably.

#### Acceptance criteria

1. THE system SHALL provide all interface text in French (`fr`) and Bambara (`bm`).
2. WHEN the user changes language THEN the system SHALL switch immediately and remember the choice.
3. THE system SHALL display amounts as whole FCFA with a space as thousands separator (for example `10 000 FCFA`).
4. THE build SHALL fail if a translation key exists in one language and not the other.

### Requirement 6: Reusable skeleton

**User story:** As a developer, I want to build a new offline app on the skeleton by defining only my events and projections, so that I do not rewrite storage and sync.

#### Acceptance criteria

1. THE skeleton SHALL live in its own package (`packages/core`) that the apps import.
2. THE skeleton SHALL let an app declare its event types and a projection function, and SHALL handle storage, outbox, sync, status, and i18n.
3. THE skeleton SHALL contain no Tontine- or Sugu-specific code.
4. THE repository SHALL include a guide that explains how to create a third app.

### Requirement 7: Shared spaces without accounts

**User story:** As a user, I want to share a group with others through a link, so that nobody needs to create an account.

#### Acceptance criteria

1. THE skeleton SHALL store events in a "space" identified by a random 128-bit ID.
2. WHEN a user opens a share link containing the space ID THEN the system SHALL join that space and sync its events.
3. THE sync server SHALL reject requests for unknown spaces, payloads over 256 KB, and events that do not match the declared schema.
4. THE README SHALL state the known limitation: anyone who has the link can read and write the space.

### Requirement 8: Tontine app

**User story:** As the organizer of a tontine, I want to record who paid and who receives the pot each round, so that every member can trust the accounts.

#### Acceptance criteria

1. THE organizer SHALL be able to create a group with a name, a fixed contribution per round, and an ordered list of members.
2. WHEN the organizer records a payment THEN the system SHALL attach it to a member and a round. A member MAY pay a round in several installments.
3. THE system SHALL show for each round who has paid in full, who has paid part, who has not paid, and how much is still missing.
4. THE system SHALL show who receives the pot each round, following the member order.
5. THE pot for a round SHALL equal the sum of the non-cancelled payments recorded for that round.
6. THE system SHALL let the organizer share a round summary as plain text (for example to paste into WhatsApp).
7. IF a member's payments for a round exceed the contribution amount THEN the system SHALL flag the round as a possible duplicate entry.
8. WHEN the organizer cancels a payment THEN the system SHALL record a cancellation event and exclude that payment from all totals. Events are never deleted.

### Requirement 9: Sugu app

**User story:** As a trader or buyer, I want to see the current price of staple goods in nearby markets, so that I can decide where to buy or sell.

#### Acceptance criteria

1. THE user SHALL be able to post a price report: product, market, price in FCFA, and unit (kg, sack, tas).
2. THE system SHALL provide a starting list of products (millet, rice, maize, sorghum, onion, groundnut, shea butter) and markets, and let users add more.
3. THE system SHALL show, for each product and market, the latest price and the date it was reported.
4. THE system SHALL show the median of reports from the last 7 days, so that one wrong report does not mislead users.
5. THE system SHALL mark prices older than 7 days as stale.

### Requirement 10: Hackathon deliverables

**User story:** As the entrant, I want the repository to meet every Kiroween 2026 submission rule, so that the project is not disqualified.

#### Acceptance criteria

1. THE repository SHALL be public on GitHub with an open source license detected by GitHub.
2. THE repository SHALL keep the `.kiro` directory at the root and SHALL NOT list it in `.gitignore`.
3. THE repository SHALL contain the two apps in two separate folders (`apps/tontine` and `apps/sugu`).
4. BOTH apps SHALL be deployed at public URLs that judges can open without an account.
5. THE README SHALL explain setup, the architecture, and how Kiro (specs, steering, hooks, property-based tests) was used.
