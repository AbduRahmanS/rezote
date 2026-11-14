# Deploying Rezote

Everything runs on Cloudflare's free plan: the sync server on Workers with a D1 database, and the two apps on Pages. No credit card is needed. Allow about 30 minutes the first time.

You need Node 22 and this repository with dependencies installed (`npm ci`). Run all commands from the repository root unless noted.

## 1. Log in to Cloudflare

```bash
npx wrangler login
```

This opens a browser window. Create a free account if you do not have one.

## 2. Create the database

```bash
cd server
npx wrangler d1 create rezote
```

Wrangler prints a `database_id`. Copy it into `server/wrangler.toml`, replacing `00000000-0000-0000-0000-000000000000`. Then create the tables:

```bash
npx wrangler d1 migrations apply rezote --remote
```

## 3. Deploy the sync server

```bash
npx wrangler deploy
cd ..
```

Wrangler prints the server URL, for example `https://rezote-sync.<your-subdomain>.workers.dev`. Check it in a browser: it should answer `{"name":"rezote-sync","ok":true}`.

## 4. Build and deploy the apps

Create `apps/collecte/.env.production` and `apps/carnet-de-route/.env.production`, each with one line:

```
VITE_SYNC_URL=https://rezote-sync.<your-subdomain>.workers.dev
```

Then build and deploy:

```bash
npm run build
npm run check:size
npx wrangler pages project create rezote-collecte --production-branch main
npx wrangler pages project create rezote-carnet --production-branch main
npx wrangler pages deploy apps/collecte/dist --project-name rezote-collecte
npx wrangler pages deploy apps/carnet-de-route/dist --project-name rezote-carnet
```

The apps are now at `https://rezote-collecte.pages.dev` and `https://rezote-carnet.pages.dev` (Cloudflare may add a suffix if the names are taken; use the URLs it prints).

## 5. Allow the apps to call the server

In `server/wrangler.toml`, set `ALLOWED_ORIGINS` to the two app URLs, without a trailing slash:

```toml
ALLOWED_ORIGINS = "https://rezote-collecte.pages.dev,https://rezote-carnet.pages.dev"
```

Deploy the server again:

```bash
cd server && npx wrangler deploy && cd ..
```

If the server is not on `*.workers.dev` (for example a custom domain), also add its origin to `connect-src` in `apps/*/public/_headers` and redeploy the apps.

## 6. Create the demo data for judges

```bash
npm run seed:demo -- \
  --server https://rezote-sync.<your-subdomain>.workers.dev \
  --collecte https://rezote-collecte.pages.dev/ \
  --route https://rezote-carnet.pages.dev/
```

The command prints JSON with a write link and a read link for each app. Put the **read links** in the README and the **write links** in the private "testing instructions" field of the Devpost form, so judges can try recording data.

Each run creates new demo spaces; old ones stay on the server.

## 7. Test on real phones

1. Open the Collecte write link on phone A and choose a collector name. Open the read link on phone B.
2. Put phone A in airplane mode. Weigh a few bundles and share the receipt. The status bar shows "Hors ligne" and the 👻 count goes up.
3. Turn airplane mode off. Within a few seconds the 👻 count drops to 0. On phone B, tap the status bar: the weighing appears.
4. Repeat with Carnet de route: log fuel and a border stop offline, then reconnect.
5. Close the app, turn airplane mode on, and reopen it: it must load without network.

## Updating

- Server code: `cd server && npx wrangler deploy`.
- New migration: add `server/migrations/000N_name.sql`, then `npx wrangler d1 migrations apply rezote --remote`.
- Apps: `npm run build`, then the two `wrangler pages deploy` commands. Phones get the new version on their next visit with network.
