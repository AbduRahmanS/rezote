# Deploying Rezote

Each app is one Cloudflare Worker that serves both the app (TanStack Start in SPA mode) and its sync API under `/api`. Both Workers share one D1 database. Everything fits in Cloudflare's free plan, with no credit card. Allow about 20 minutes the first time.

You need Node 22 and this repository with dependencies installed (`npm ci`). Run commands from the repository root unless noted.

## 1. Log in to Cloudflare

```bash
npx wrangler login
```

This opens a browser window. Create a free account if you do not have one.

## 2. Create the database (once)

```bash
npx wrangler d1 create rezote
```

Wrangler prints a `database_id`. Put it in **both** `apps/collecte/wrangler.jsonc` and `apps/carnet-de-route/wrangler.jsonc`, replacing `00000000-0000-0000-0000-000000000000`.

Create the tables (from either app folder, since they share the database and the migrations):

```bash
cd apps/collecte
npx wrangler d1 migrations apply rezote --remote
cd ../..
```

## 3. Deploy both apps

```bash
npm run deploy -w @rezote/collecte
npm run deploy -w @rezote/carnet-de-route
```

Each command builds the app (including the offline service worker) and deploys the Worker. Wrangler prints the URLs, for example:

- `https://rezote-collecte.<your-subdomain>.workers.dev`
- `https://rezote-carnet.<your-subdomain>.workers.dev`

Check each one: `https://…/api` should answer `{"name":"rezote-sync","ok":true,…}`.

There is no CORS to configure: each app calls the API on its own origin.

## 4. Create the demo data for judges

```bash
npm run seed:demo -- \
  --collecte https://rezote-collecte.<your-subdomain>.workers.dev \
  --route https://rezote-carnet.<your-subdomain>.workers.dev
```

The command prints JSON with a write link and a read link for each app. Put the **read links** in the README and the **write links** in the private "testing instructions" field of the Devpost form, so judges can try recording data.

Each run creates new demo spaces; old ones stay in the database.

## 5. Test on real phones

1. Open the Collecte write link on phone A and choose a collector name. Open the read link on phone B.
2. Put phone A in airplane mode. Weigh a few bundles and share the receipt. The status bar shows "Hors ligne" and the 👻 count goes up.
3. Turn airplane mode off. Within a few seconds the 👻 count drops to 0. On phone B, tap the status bar: the weighing appears.
4. Repeat with Carnet de route: log fuel and a border stop offline, then reconnect.
5. Close the app, turn airplane mode on, and reopen it: it must load without network.

## Updating

- Code: run the two `npm run deploy` commands again. Phones get the new version on their next visit with network.
- New migration: add `packages/sync-api/migrations/000N_name.sql`, then `npx wrangler d1 migrations apply rezote --remote` from an app folder.

## Custom domain (optional)

In the Cloudflare dashboard, open the Worker → Settings → Domains & Routes → Add a custom domain. Nothing else changes, because the API is on the same origin.
