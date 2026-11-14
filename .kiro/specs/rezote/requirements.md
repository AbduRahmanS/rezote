# Requirements: Rezote

## Introduction

Rezote (from Bambara *rezo tɛ*, "no network") is a skeleton template for building web apps that keep working where the mobile network is weak or absent, as on rural roads and in villages across Mali and West Africa. Every change is saved on the phone first. Unsynced changes wait in a queue, shown as "ghosts" in the interface, and reach the server automatically when the connection returns.

The repository contains one shared skeleton and two separate applications built from it, as the Kiroween 2026 Skeleton Crew category requires:

- **Collecte**: cooperative collectors weigh each farmer's harvest in the villages, offline. The cooperative's treasurer sees the total delivered and the amount owed to each farmer.
- **Carnet de route**: a truck driver records stops, expenses, and incidents along the Dakar–Bamako or Abidjan–Bamako corridors, offline. The truck owner follows the trip and its costs.

Interface languages are French and Bambara. Amounts are in FCFA (XOF), which has no subunits. Senegal and Côte d'Ivoire also use FCFA, so a single currency covers both corridors.

## Glossary

- **Event**: an immutable record of one change (for example "farmer F12 delivered 84.5 kg"). Apps store events and never update or delete them.
- **Outbox**: the local queue of events created on this device that the server has not yet confirmed.
- **Ghost**: an event that is still in the outbox. The interface marks it until it syncs.
- **Projection**: the app state computed by replaying events (for example the amount owed to a farmer).
- **Space**: a shared set of events, such as one cooperative campaign or one truck.
- **Sync server**: the small HTTP service that stores events and returns events created on other devices.

## Requirements

### Requirement 1: Offline-first storage

**User story:** As a user with an unreliable connection, I want every action to work without internet, so that a dropped connection never loses my work.

#### Acceptance criteria

1. WHEN the user creates a record THEN the system SHALL save it to local storage (IndexedDB) before any network request.
2. WHEN the device has no connection THEN the system SHALL let the user create, view, and search records with no error message blocking the action.
3. WHEN the user closes and reopens the app offline THEN the system SHALL show all records saved before closing.
4. WHEN the app has been opened online once THEN the system SHALL load fully offline on later visits.

### Requirement 2: Sync queue

**User story:** As a user, I want my offline changes to reach the server automatically when I am back online, so that I do not have to think about syncing.

#### Acceptance criteria

1. WHEN an event is created THEN the system SHALL add it to the outbox with a globally unique ID.
2. WHEN the connection returns, or every 30 seconds while online, THEN the system SHALL send outbox events to the sync server in batches.
3. WHEN the server confirms an event THEN the system SHALL remove it from the outbox.
4. IF a send fails THEN the system SHALL keep the events in the outbox and retry with exponential backoff, capped at 5 minutes.
5. WHEN the same event is sent more than once THEN the server SHALL store it only once.
6. WHEN the system pulls events from the server THEN it SHALL request only events newer than the last cursor it received.
7. WHEN events from several devices are merged in any order THEN every device SHALL compute the same projection.

### Requirement 3: Sync status ("ghosts")

**User story:** As a user, I want to see which of my changes have not synced yet, so that I know what others can already see.

#### Acceptance criteria

1. WHILE an event is in the outbox THEN the system SHALL display the related record with a ghost marker.
2. THE system SHALL always show the connection state (online, offline, syncing), the number of pending events, and the time of the last successful sync.
3. WHEN an event syncs THEN the system SHALL remove its ghost marker without a page reload.

### Requirement 4: Low bandwidth

**User story:** As a user paying for mobile data, I want the app to be small, so that it loads quickly on a weak connection and costs little.

#### Acceptance criteria

1. THE first load of each app SHALL transfer at most 150 KB (gzip), including HTML, CSS, JavaScript, and icons.
2. THE system SHALL NOT load web fonts, analytics, or third-party scripts.
3. THE sync protocol SHALL send only new events in each direction, never the full dataset.
4. THE build SHALL fail if an app exceeds the size budget.

### Requirement 5: Languages and formats

**User story:** As a user in Mali, I want the app in French or Bambara with local formats, so that I can use it comfortably.

#### Acceptance criteria

1. THE system SHALL provide all interface text in French (`fr`) and Bambara (`bm`).
2. WHEN the user changes language THEN the system SHALL switch immediately and remember the choice.
3. THE system SHALL display amounts as whole FCFA with a space as thousands separator (for example `10 000 FCFA`) and weights in kg with at most one decimal and a comma as decimal separator (for example `84,5 kg`).
4. THE build SHALL fail if a translation key exists in one language and not the other.

### Requirement 6: Reusable skeleton

**User story:** As a developer, I want to build a new offline app on the skeleton by defining only my events and projections, so that I do not rewrite storage and sync.

#### Acceptance criteria

1. THE skeleton SHALL live in its own package (`packages/core`) that the apps import.
2. THE skeleton SHALL let an app declare its event types, their schemas, and a projection function, and SHALL handle storage, outbox, sync, status, sharing, and i18n.
3. THE skeleton SHALL contain no Collecte- or Carnet de route-specific code.
4. THE repository SHALL include a guide that explains how to create a third app.

### Requirement 7: Shared spaces without accounts

**User story:** As a user, I want to share a space with others through a link, so that nobody needs to create an account.

#### Acceptance criteria

1. THE skeleton SHALL identify each space by a random 128-bit ID and protect writes with a separate random 128-bit write key.
2. THE system SHALL offer two share links: a **write link** (space ID and write key) for people who record data, and a **read link** (space ID only) for people who only view it.
3. WHEN a user opens a share link THEN the system SHALL join that space with the matching permission and sync its events.
4. THE sync server SHALL reject writes without the correct write key, requests for unknown spaces, payloads over 256 KB, and events that do not match the declared schema.
5. THE server SHALL store only a hash of the write key.
6. THE README SHALL state the known limitation: anyone who has a link has its permission, and a link cannot be revoked in this version.

### Requirement 8: Collecte app

**User story:** As a cooperative treasurer, I want the deliveries weighed by collectors in the villages to reach me reliably, so that I can pay every farmer the right amount and avoid disputes.

#### Acceptance criteria

1. THE treasurer SHALL be able to create a campaign with a name, a product (for example cotton, shea nuts, sesame), and a price per kg for each quality grade (at least one grade).
2. THE treasurer SHALL be able to add collectors, each with a name and a short unique code (for example `K2`). A collector SHALL select their own name once on their phone.
3. A collector SHALL be able to register a farmer with a name and a village, offline.
4. A collector SHALL be able to record a delivery offline: farmer, weight in kg (one decimal), and grade.
5. WHEN a delivery is recorded THEN the system SHALL give it a receipt number that is unique across all collectors without a network connection (collector code plus a local counter, for example `K2-0042`). IF the same receipt number appears twice (for example because one collector used two phones) THEN the system SHALL flag both deliveries for the treasurer.
6. THE system SHALL let the collector share a receipt as plain text (farmer, weight, grade, amount, receipt number, date) through the phone's share menu, for example to WhatsApp or SMS.
7. THE system SHALL compute for each farmer: total weight per grade, amount owed, amount paid, and balance.
8. THE amount owed SHALL be computed from the exact weights and rounded down to the whole FCFA once per farmer, so that rounding never grows with the number of deliveries.
9. THE treasurer SHALL be able to record a payment to a farmer, and the balance SHALL update.
10. WHEN a collector or treasurer cancels a delivery or payment THEN the system SHALL record a cancellation event with a reason and exclude the item from all totals.
11. IF two deliveries for the same farmer have the same weight and grade and were recorded less than 10 minutes apart THEN the system SHALL flag them as a possible duplicate for the treasurer.
12. THE treasurer SHALL see totals per village, per collector, and for the whole campaign, and SHALL be able to export the deliveries and balances as CSV.

### Requirement 9: Carnet de route app

**User story:** As a truck owner, I want to follow my driver's trip and expenses even when the road has no network, so that I can plan, check costs, and avoid disputes.

#### Acceptance criteria

1. THE owner SHALL be able to register a truck (plate number and a name) and start a trip with origin, destination, cargo description, and the cash advance given to the driver.
2. THE driver SHALL be able to record an entry offline with a kind, a place, an optional amount in FCFA, and an optional note. Kinds: fuel, checkpoint, weighbridge, customs, border, toll, meal, repair, breakdown, rest, loading, unloading, other.
3. WHEN the driver records an entry THEN the system SHALL save the time it happened (default: now, editable) and, if the driver allows it, the GPS position from the phone, which works without network.
4. THE owner SHALL be able to record an additional advance during the trip (for example money sent by mobile money).
5. THE system SHALL show each trip as a timeline ordered by the time each entry happened.
6. THE system SHALL compute for each trip: total expenses by kind, total advances, and the balance (advances minus expenses).
7. THE system SHALL show the last known position and time of the truck and the time the driver's phone last synced.
8. FOR entries of kind breakdown, repair, rest, customs, and border, THE driver SHALL be able to tap "resume" to record when the stop ended, and THE system SHALL compute the time spent stopped per kind.
9. WHEN the driver ends the trip THEN the system SHALL record the arrival place and time and compute the trip duration.
10. WHEN the driver or owner cancels an entry THEN the system SHALL record a cancellation event with a reason and exclude the entry from totals, while the timeline keeps showing it as cancelled.
11. THE system SHALL let the owner or driver share a trip summary as plain text.

### Requirement 10: Hackathon deliverables

**User story:** As the entrant, I want the repository to meet every Kiroween 2026 submission rule, so that the project is not disqualified.

#### Acceptance criteria

1. THE repository SHALL be public on GitHub with an open source license detected by GitHub.
2. THE repository SHALL keep the `.kiro` directory at the root and SHALL NOT list it in `.gitignore`.
3. THE repository SHALL contain the two apps in two separate folders (`apps/collecte` and `apps/carnet-de-route`).
4. BOTH apps SHALL be deployed at public URLs that judges can open without an account, each with a demo space filled with sample data.
5. THE README SHALL explain setup, the architecture, the security limitation, and how Kiro (specs, steering, hooks, property-based tests) was used.
