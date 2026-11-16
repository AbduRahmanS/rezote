// Request handling for the Worker of a Rezote app (TanStack Start, SPA mode, Cloudflare).
//
// - Page requests get the prerendered SPA shell, the same document the service
//   worker serves offline, with the security headers. Hashes of the shell's
//   inline bootstrap scripts are allowed in the Content-Security-Policy.
// - /api requests go to the app's sync API server route unchanged.
// - Anything else goes to TanStack Start, and HTML responses get the headers too.
//
// Each app's src/server.ts imports TanStack Start's handler itself (that module
// resolves to the app's own entry) and passes it in.

import { inlineScriptHashes, securityHeaders } from "../security.mjs";

interface AssetsBinding {
  fetch(request: Request): Promise<Response>;
}

const isApi = (path: string) => path === "/api" || path.startsWith("/api/");

export async function secureHtml(html: string, init: ResponseInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  for (const [k, v] of Object.entries(securityHeaders(await inlineScriptHashes(html)))) headers.set(k, v);
  headers.set("content-type", "text/html; charset=utf-8");
  headers.set("cache-control", "no-cache");
  headers.delete("content-length");
  return new Response(html, { status: init.status ?? 200, headers });
}

export async function rezoteFetch(request: Request, env: Record<string, unknown>, start: () => Promise<Response>): Promise<Response> {
  const url = new URL(request.url);
  if (isApi(url.pathname)) return start();

  const wantsPage = request.method === "GET" && (request.headers.get("accept") ?? "").includes("text/html");
  const assets = env.ASSETS as AssetsBinding | undefined;
  if (wantsPage && assets) {
    const shell = await assets.fetch(new Request(new URL("/_shell", url)));
    if (shell.ok) return secureHtml(await shell.text());
  }

  const res = await start();
  if (!(res.headers.get("content-type") ?? "").includes("text/html")) return res;
  return secureHtml(await res.text(), { status: res.status, headers: res.headers });
}
