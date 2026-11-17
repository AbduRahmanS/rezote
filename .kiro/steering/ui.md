---
inclusion: fileMatch
fileMatchPattern: ["apps/*/src/routes/**/*.tsx", "apps/*/src/components/**/*.tsx", "apps/*/src/styles.css", "packages/core/src/react/**/*.tsx", "packages/ui/src/**", "templates/app/src/routes/**/*.tsx"]
---

# Interface rules

Loaded only when a screen, component, or theme file is in context. Product-level rules (French only, never delete, safety) are in `product.md`.

## Look

- Light theme by default (used outdoors in sunlight); dark follows the phone setting. One accent color per app, set in the app's `src/styles.css`.
- No emojis in the interface: use lucide icons. No gradients, glows, or decorative illustrations.
- Numbers that change (weights, amounts, durations) use `tabular-nums`.
- Touch targets at least 40 px high: `size="lg"` buttons for main actions, `icon-lg` for icon buttons in lists.

## Building blocks

- Use the shared blocks from `@rezote/core/react` (`PageHeader`, `List`/`ListItem`, `Stat`/`StatGrid`, `Section`, `Field`, `Empty`, `GhostMark`) and the shadcn/ui components in `@rezote/ui` before writing new markup.
- Never use `window.alert`, `confirm`, or `prompt`: use `confirmAction`, `askReason`, and `act` (toasts).
- Changes still in the outbox: `GhostMark` badge and the `pending` class from `usePendingClass` (amber dashed outline).
- Hide recording, editing, and cancelling controls when `useCanWrite(app)` is false.
- Forms: TanStack Form with Zod validators and `Field` for the label and errors. Parse numbers with `parseFCFA`, `parseKg`, `parseLiters`; display with the `format*` helpers.

## French text

- Short, concrete sentences, for readers of French as a second language. "Envoyé", not "synchronisé"; keep "hors ligne".
- Error messages say what to do next.
- Buttons say the action: "Enregistrer", "Créer le carnet", "Reprendre la route".
