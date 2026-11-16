// Worker entry: serves the SPA shell with security headers, and /api to the sync API.
// See @rezote/core/worker.
import { rezoteFetch } from "@rezote/core/worker";
import handler, { createServerEntry } from "@tanstack/react-start/server-entry";
import { env } from "cloudflare:workers";

export default createServerEntry({
  fetch(request, opts) {
    return rezoteFetch(request, env, () => Promise.resolve(handler.fetch(request, opts)));
  },
});
