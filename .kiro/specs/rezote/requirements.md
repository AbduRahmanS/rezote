# Requirements: Rezote

## Introduction

Rezote (from Bambara *rezo tɛ*, "no network") is a skeleton template for building web apps that keep working where the mobile network is weak or absent, as on rural roads and in villages across Mali and West Africa. Every change is saved on the phone first. Unsynced changes wait in a queue, shown as "ghosts" in the interface, and reach the server automatically when the connection returns. Event contents are encrypted on the phone, so the server stores data it cannot read.

The repository contains one shared skeleton and two separate applications built from it, as the Kiroween 2026 Skeleton Crew category requires:

- **Collecte**: at the village weighing session, a collector records each bundle of cotton on the phone instead of in three paper notebooks. The cooperative's treasurer sees each farmer's weight, gross amount, deductions, payments, and balance, and compares the village weight with the weight measured at the ginning factory.
- **Carnet de route**: a truck driver records stops, fuel, fees, waiting times, and incidents along the Dakar–Bamako and Abidjan–Bamako corridors, offline. The truck owner follows the trip, its costs, and its delays.

Background facts and sources are in `docs/research.md`.

The interface is in French. Amounts are in FCFA (XOF), which has no subunits. Senegal and Côte d'Ivoire also use FCFA, so one currency covers both corridors.

## Glossary

- **Event**: an immutable record of one change (for example "bundle 3 of receipt K2-0042 weighs 84.5 kg"). Apps store events and never update or delete them.
- **Outbox**: the local queue of events created on this device that the server has not yet confirmed.
- **Ghost**: an event that is still in the outbox. The interface marks it until it syncs.
- **Projection**: the app state computed by replaying events (for example the balance owed to a farmer).
- **Space**: a shared set of events, such as one cooperative campaign or one truck.
- **Sync server**: the small HTTP service that stores encrypted events and returns events created on other devices.

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

1. THE first load of each app SHALL transfer at most 300 KB (gzip), including HTML, CSS, JavaScript, and icons. (Raised from 150 KB with TanStack Start and React, then to 300 KB with shadcn/ui; after the first visit the service worker serves everything from the phone.)
2. THE system SHALL NOT load web fonts, map tiles, analytics, or third-party scripts.
3. THE sync protocol SHALL send only new events in each direction, never the full dataset.
4. THE build SHALL fail if an app exceeds the size budget.

### Requirement 5: Language and formats

**User story:** As a user in Mali, I want the app in French with local formats, so that I can read it easily.

#### Acceptance criteria

1. THE system SHALL provide all interface text in French. (Adding another language later requires extracting the strings from the screens into a messages file.)
2. THE system SHALL display amounts as whole FCFA with a space as thousands separator (for example `10 000 FCFA`).
3. THE system SHALL display weights in kg with at most one decimal and a comma as decimal separator (for example `84,5 kg`), and accept both comma and dot when the user types a weight.
4. THE system SHALL display dates as `14/11/2026` and times in 24-hour format (`17:45`).

### Requirement 6: Reusable skeleton

**User story:** As a developer, I want to build a new offline app on the skeleton by defining only my events and projections, so that I do not rewrite storage, sync, and encryption.

#### Acceptance criteria

1. THE skeleton SHALL live in its own package (`packages/core`) that the apps import.
2. THE skeleton SHALL let an app declare its event types, their schemas, and a projection function, and SHALL handle storage, outbox, sync, encryption, status, and sharing.
3. THE skeleton SHALL contain no Collecte- or Carnet de route-specific code.
4. THE repository SHALL include a guide that explains how to create a third app.

### Requirement 7: Shared spaces, permissions, and encryption

**User story:** As a user, I want to share a space through a link without creating an account, and I want the data to stay private even from the server operator, because some of it (farmers' incomes, truck positions) is sensitive.

#### Acceptance criteria

1. THE skeleton SHALL identify each space by a random 128-bit ID and SHALL create, on the phone, a random 256-bit encryption key and a random 128-bit write key.
2. THE system SHALL encrypt every event payload on the phone (AES-GCM) before storing it on the server. THE server SHALL never receive the encryption key.
3. THE system SHALL offer two share links: a **write link** (space ID, encryption key, write key) for people who record data, and a **read link** (space ID, encryption key) for people who only view it. Keys SHALL be in the URL fragment, which browsers do not send to servers.
4. WHEN a user opens a share link THEN the system SHALL join that space with the matching permission and sync its events.
5. THE sync server SHALL reject writes without the correct write key, requests for unknown spaces, and payloads over 256 KB. THE server SHALL store only a hash of the write key.
6b. EACH app's Worker SHALL serve only the spaces created by that app, even when several apps share one database.
6. WHEN a phone receives an event that cannot be decrypted or does not match its schema THEN the system SHALL ignore it in the projection and show the number of ignored events.
7. THE skeleton SHALL let an app mark payload fields as **writers only**. These fields SHALL be encrypted with a second key derived from the write key, so that read-link holders cannot read them.
8. THE README SHALL state the known limitations: anyone who has a link has its permission, a link cannot be revoked in this version, and losing all links means losing access to the space.

### Requirement 8: Collecte app

**User story:** As a cooperative treasurer, I want the cotton weighed in the villages to be recorded reliably and to reach me even without network, so that I can pay every farmer the right amount and explain any gap with the factory weight.

#### Acceptance criteria

1. THE treasurer SHALL be able to create a campaign with a name, a product (for example cotton seed, shea kernels, sesame), and a price per kg for each quality grade (at least one grade; for cotton, 1er choix and 2e choix).
2. THE treasurer SHALL be able to add collectors, each with a name and a short unique code (for example `K2`). A collector SHALL select their own name once on their phone.
3. A collector SHALL be able to register a farmer (head of farm) with a name and a village, offline.
4. A collector SHALL be able to start a weighing for a farmer. THE system SHALL give the weighing a receipt number made of the collector code and a counter kept on the phone (for example `K2-0042`), so that numbers are unique without network.
5. DURING a weighing, THE collector SHALL record each bundle (bâche) with its weight in kg (one decimal) and grade, and THE system SHALL show the bundle count and the running subtotal after each bundle, as the paper notebooks do today.
6. WHEN the collector closes a weighing THEN the system SHALL show the receipt (farmer, village, bundles, weight per grade, gross amount, receipt number, date, collector) and let the collector share it as plain text through the phone's share menu, for example to WhatsApp or SMS.
7. THE treasurer SHALL be able to record deductions for a farmer with a label and an amount (for example "Engrais à crédit, 6 sacs × 14 000 FCFA").
8. THE treasurer SHALL be able to record payments to a farmer (amount, cash or mobile money, date). Several partial payments SHALL be allowed.
9. THE system SHALL compute for each farmer: weight per grade, gross amount, total deductions, total paid, and balance (gross − deductions − paid).
10. THE gross amount SHALL be computed from the exact weights and rounded down to the whole FCFA once per farmer, so that rounding never grows with the number of bundles.
11. THE treasurer SHALL be able to record a truckload leaving the village store (truck plate, village weight) and, later, the weight measured at the ginning factory. THE system SHALL show the gap per truckload and for the campaign, and the weight still in the store (weighed minus dispatched).
12. WHEN a collector or treasurer cancels a bundle, deduction, payment, or truckload THEN the system SHALL record a cancellation event with a reason and exclude the item from all totals.
13. THE system SHALL flag for the treasurer: two different weighings with the same receipt number (for example one collector using two phones), two bundles in the same weighing with the same weight and grade recorded less than 2 minutes apart, and farmers with a negative balance.
14. THE treasurer SHALL see totals per village, per collector, and for the campaign, and SHALL be able to export bundles and farmer balances as CSV.

### Requirement 9: Carnet de route app

**User story:** As a truck owner, I want to follow my driver's trip, costs, and delays even when the road has no network, so that I can plan, check expenses, and avoid disputes.

#### Acceptance criteria

1. THE owner SHALL be able to register a truck (plate number and a name) and start a trip with origin, destination, corridor (for example Dakar–Bamako via Moussala, Abidjan–Bamako via Zégoua), cargo description, and the cash advance given to the driver.
2. THE driver SHALL be able to record an entry offline with a kind, a place, an optional amount in FCFA, and an optional note. Kinds: fuel, checkpoint, weighbridge, customs, border, convoy wait, toll, meal, repair, breakdown, rest, loading, unloading, other.
3. FOR fuel entries, THE driver SHALL enter liters and price per liter, THE system SHALL compute the amount, and THE driver MAY enter the odometer reading.
4. WHEN the driver records an entry THEN the system SHALL save the time it happened (default: now, editable).
5. THE driver MAY attach the phone's GPS position to an entry. GPS SHALL be off by default and turned on only by the driver. THE position SHALL be a writers-only field (Requirement 7.7).
6. THE owner SHALL be able to record an additional advance during the trip (for example money sent by mobile money).
7. THE system SHALL show each trip as a timeline ordered by the time each entry happened.
8. THE system SHALL compute for each trip: total expenses by kind, total advances, balance (advances − expenses), and, when at least two odometer readings exist, fuel consumption in liters per 100 km.
9. FOR entries of kind customs, border, convoy wait, breakdown, repair, and rest, THE driver SHALL be able to tap "resume" to record when the stop ended, and THE system SHALL compute the time spent stopped per kind.
10. THE system SHALL show the last place and time reported by the driver, and the time the driver's phone last synced.
11. WHEN the driver ends the trip THEN the system SHALL record the arrival place and time and compute the trip duration.
12. WHEN the driver or owner cancels an entry or advance THEN the system SHALL record a cancellation event with a reason and exclude it from totals, while the timeline keeps showing it as cancelled.
13. THE system SHALL let the owner or driver share a trip summary as plain text. THE summary SHALL NOT include GPS positions.

### Requirement 10: Hackathon deliverables

**User story:** As the entrant, I want the repository to meet every Kiroween 2026 submission rule, so that the project is not disqualified.

#### Acceptance criteria

1. THE repository SHALL be public on GitHub with an open source license detected by GitHub.
2. THE repository SHALL keep the `.kiro` directory at the root and SHALL NOT list it in `.gitignore`.
3. THE repository SHALL contain the two apps in two separate folders (`apps/collecte` and `apps/carnet-de-route`).
4. BOTH apps SHALL be deployable to public URLs that judges can open without an account, each with a demo space filled with realistic sample data.
5. THE README SHALL explain setup, deployment, the architecture, the security limitations, and how Kiro (specs, steering, hooks, property-based tests) was used.
