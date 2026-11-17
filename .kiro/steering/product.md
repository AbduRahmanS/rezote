# Product: Rezote

Rezote (from Bambara *rezo tɛ*, "no network") is a template for web apps that keep working where the mobile network is weak or absent, in Mali and across West Africa. Two apps are built on it:

- **Collecte**: cotton weighing at village sessions, one bundle (*bâche*) at a time, replacing the three paper notebooks. The cooperative treasurer sees weights, gross amounts, deductions (fertilizer on credit), payments, balances, and the gap between village and factory weights.
- **Carnet de route**: a truck driver logs fuel, fees, stops, and incidents on the Dakar–Bamako and Abidjan–Bamako corridors; the owner follows the trip and its costs.

Background facts and sources: `docs/research.md` (loaded through `field-facts.md` when figures are needed). Never invent figures.

## Users and context

- Collectors, treasurers, drivers, and truck owners using cheap Android phones, often outdoors, often offline, paying for data by the megabyte.
- Many users read French as a second language. Write short, concrete French sentences. Avoid jargon such as "synchronisation" when "envoyé" works; keep "hors ligne".
- Money is FCFA and matters a lot: a cotton payment is most of a farm's yearly cash income. Never round money in a way that can lose a franc without saying so.

## Safety

- Truck positions are life-safety data on corridors where convoys are attacked. GPS stays off by default, positions are writers-only, and shared texts never contain positions.
- Farmers' names and incomes are personal data. Everything is encrypted on the phone; the server must never be able to read it.

## Interface rules

- All interface text is in French.
- Every action must work offline and show a ghost mark ("non envoyé") until it reaches the server.
- Never delete data: corrections are cancellation events with a reason.
- Large touch targets (at least 40 px), high contrast, no web fonts. Details in `ui.md`.
