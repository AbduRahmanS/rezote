# Deploying Rezote

Each app is one Cloudflare Worker that serves both the app (TanStack Start in SPA mode) and its sync API under `/api`. Both Workers share one D1 database. Everything fits in Cloudflare's free plan, with no credit card. Allow about 20 minutes the first time. Running from a script or CI, set `CLOUDFLARE_API_TOKEN` (permissions: Workers Scripts, Workers Routes, and D1, all Edit) and `CLOUDFLARE_ACCOUNT_ID` instead of `wrangler login`.

You need Node 22 and this repository with dependencies installed (`npm ci`). Run commands from the repository root unless noted.

## 1. Log in to Cloudflare

```bash
npx wrangler login
```

This opens a browser window. Create a free account if you do not have one.

## 2. Create the database (once)

```bash
npx wrangler d1 create rezote --location weur
```

`weur` (Western Europe) is the closest region to West Africa.

Wrangler prints a `database_id`. Put it in **both** `apps/collecte/wrangler.jsonc` and `apps/carnet-de-route/wrangler.jsonc`, replacing `00000000-0000-0000-0000-000000000000`.

Create the tables (from either app folder, since they share the database and the migrations):

```bash
cd apps/collecte
npx wrangler d1 migrations apply rezote --remote
cd ../..
```

## 3. Choose the addresses

Each app is served on one custom domain, set in its `wrangler.jsonc` (`routes` with `custom_domain: true`, and `workers_dev: false`). The production deployment uses `collecte.abdrahamane.dev` and `carnet.abdrahamane.dev`. To deploy on your own domain, change these two lines; the domain must be a zone in the same Cloudflare account. Keep a single address per app: the phone stores data per address, so the same app on two addresses would look like two empty apps.

## 4. Deploy both apps

```bash
npm run deploy -w @rezote/collecte
npm run deploy -w @rezote/carnet-de-route
```

Each command builds the app (including the offline service worker), deploys the Worker, and attaches its custom domain. Check each one: `https://collecte.abdrahamane.dev/api` and `https://carnet.abdrahamane.dev/api` should answer `{"name":"rezote-sync","ok":true,…}`.

There is no CORS to configure: each app calls the API on its own origin.

## 5. Create the demo data for judges

```bash
npm run seed:demo -- \
  --collecte https://collecte.abdrahamane.dev \
  --route https://carnet.abdrahamane.dev
```

The command prints JSON with a write link and a read link for each app. Put the **read links** in the README and the **write links** in the private "testing instructions" field of the Devpost form, so judges can try recording data.

Each run creates new demo spaces; old ones stay in the database.

## 6. Test on real phones

1. Open the Collecte write link on phone A and choose a collector name. Open the read link on phone B.
2. Put phone A in airplane mode. Weigh a few bundles and share the receipt. The status bar shows "Hors ligne" and the 👻 count goes up.
3. Turn airplane mode off. Within a few seconds the 👻 count drops to 0. On phone B, tap the status bar: the weighing appears.
4. Repeat with Carnet de route: log fuel and a border stop offline, then reconnect.
5. Close the app, turn airplane mode on, and reopen it: it must load without network.

## Updating

- Code: run the two `npm run deploy` commands again. Phones get the new version on their next visit with network.
- New migration: add `packages/sync-api/migrations/000N_name.sql`, then `npx wrangler d1 migrations apply rezote --remote` from an app folder.

## Without a domain

To use `*.workers.dev` addresses instead, remove `routes` and set `"workers_dev": true` in both `wrangler.jsonc` files.
