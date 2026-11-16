// The sync API, served by this app's Worker on the same origin (no CORS).
import { createSyncApi, type SyncEnv } from "@rezote/sync-api";
import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";

const api = createSyncApi({ apps: ["carnet-de-route"] });
const handle = ({ request }: { request: Request }) => api.handle(request, env as unknown as SyncEnv);

export const Route = createFileRoute("/api/$")({
  server: {
    handlers: { GET: handle, POST: handle },
  },
});
