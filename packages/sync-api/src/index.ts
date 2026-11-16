// Rezote sync API. It stores encrypted envelopes in D1 and returns them by
// cursor. It never sees encryption keys and cannot read event contents.
//
// Framework-free (Web Request → Response), so each TanStack Start app mounts it
// in a server route on the same origin as the app: no CORS needed.
//
//   POST {base}/spaces                    { id, app, writeKeyHash }          → 201 { space }
//   POST {base}/spaces/:space/events      { events: Envelope[] }  (Bearer W) → { accepted, rejected }
//   GET  {base}/spaces/:space/events?after=<seq>&limit=<n>                   → { events, cursor, more }

/** The subset of Cloudflare D1 the API uses, so this package needs no global Worker types. */
export interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  run(): Promise<unknown>;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<{ results: T[] }>;
}
export interface D1Like {
  prepare(sql: string): D1Statement;
  batch(statements: D1Statement[]): Promise<unknown>;
}
/** The subset of the Cloudflare rate limiting binding the API uses. */
export interface RateLimitLike {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface SyncEnv {
  DB: D1Like;
  /** Optional Cloudflare rate limiting binding for writes. */
  WRITE_LIMITER?: RateLimitLike;
}

export interface SyncApiOptions {
  /** App names this deployment accepts, for example ["collecte"]. */
  apps: readonly string[];
  /** Path prefix where the API is mounted. Default "/api". */
  basePath?: string;
}

export const LIMITS = {
  maxBodyBytes: 256 * 1024,
  maxEventsPerPush: 500,
  maxPullLimit: 500,
  maxCiphertextChars: 16 * 1024,
} as const;

const B64URL = /^[A-Za-z0-9_-]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEVICE = /^[A-Za-z0-9_-]{1,64}$/;
const MIN_TS = Date.UTC(2020, 0, 1);
const MAX_TS = Date.UTC(2100, 0, 1);

interface Envelope {
  id: string;
  space: string;
  ts: number;
  device: string;
  iv: string;
  ct: string;
}

const isSpaceId = (s: unknown): s is string => typeof s === "string" && s.length === 22 && B64URL.test(s);
const isHash = (s: unknown): s is string => typeof s === "string" && s.length === 43 && B64URL.test(s);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}

async function sha256(text: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  let bin = "";
  for (const b of digest) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Compares two strings in time independent of where they differ. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Returns a reason if the envelope is invalid, or null. Payloads are encrypted, so only the shape is checked. */
export function checkEnvelope(e: unknown, space: string): string | null {
  if (!e || typeof e !== "object") return "not an object";
  const x = e as Record<string, unknown>;
  if (typeof x.id !== "string" || !UUID.test(x.id)) return "invalid id";
  if (x.space !== space) return "space mismatch";
  if (typeof x.ts !== "number" || !Number.isInteger(x.ts) || x.ts < MIN_TS || x.ts > MAX_TS) return "invalid ts";
  if (typeof x.device !== "string" || !DEVICE.test(x.device)) return "invalid device";
  if (typeof x.iv !== "string" || x.iv.length !== 16 || !B64URL.test(x.iv)) return "invalid iv";
  if (typeof x.ct !== "string" || x.ct.length === 0 || x.ct.length > LIMITS.maxCiphertextChars || !B64URL.test(x.ct)) {
    return "invalid ciphertext";
  }
  return null;
}

async function readJson(req: Request): Promise<{ ok: true; value: unknown } | { ok: false; status: 400 | 413 }> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > LIMITS.maxBodyBytes) return { ok: false, status: 413 };
  const text = await req.text();
  if (new TextEncoder().encode(text).length > LIMITS.maxBodyBytes) return { ok: false, status: 413 };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, status: 400 };
  }
}

export function createSyncApi(options: SyncApiOptions) {
  const apps = new Set(options.apps);
  const base = (options.basePath ?? "/api").replace(/\/$/, "");

  async function createSpace(req: Request, env: SyncEnv): Promise<Response> {
    const body = await readJson(req);
    if (!body.ok) return json({ error: "invalid body" }, body.status);
    const { id, app, writeKeyHash } = (body.value ?? {}) as Record<string, unknown>;
    if (!isSpaceId(id) || typeof app !== "string" || !apps.has(app) || !isHash(writeKeyHash)) {
      return json({ error: "invalid space" }, 400);
    }
    await env.DB.prepare("INSERT INTO spaces (id, app, write_key_hash, created_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(id) DO NOTHING")
      .bind(id, app, writeKeyHash, Date.now())
      .run();
    const row = await env.DB.prepare("SELECT app, write_key_hash FROM spaces WHERE id = ?1").bind(id).first<{ app: string; write_key_hash: string }>();
    // Creating the same space twice with the same key is a harmless retry.
    if (!row || row.app !== app || !safeEqual(row.write_key_hash, writeKeyHash)) return json({ error: "space already exists" }, 409);
    return json({ space: id }, 201);
  }

  async function spaceRow(env: SyncEnv, space: string) {
    return env.DB.prepare("SELECT app, write_key_hash FROM spaces WHERE id = ?1").bind(space).first<{ app: string; write_key_hash: string }>();
  }

  async function push(req: Request, env: SyncEnv, space: string): Promise<Response> {
    const auth = req.headers.get("authorization") ?? "";
    const writeKey = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (writeKey.length !== 22 || !B64URL.test(writeKey)) return json({ error: "write key required" }, 401);
    const row = await spaceRow(env, space);
    if (!row || !apps.has(row.app)) return json({ error: "unknown space" }, 404);
    if (!safeEqual(row.write_key_hash, await sha256(writeKey))) return json({ error: "invalid write key" }, 403);

    const body = await readJson(req);
    if (!body.ok) return json({ error: body.status === 413 ? "request too large" : "invalid body" }, body.status);
    const events = (body.value as { events?: unknown } | null)?.events;
    if (!Array.isArray(events)) return json({ error: "events must be an array" }, 400);
    if (events.length > LIMITS.maxEventsPerPush) return json({ error: "too many events" }, 413);

    const accepted: string[] = [];
    const rejected: { id: string; reason: string }[] = [];
    const statements: D1Statement[] = [];
    const now = Date.now();
    const insert = env.DB.prepare("INSERT INTO events (id, space, received_at, envelope) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(id) DO NOTHING");
    for (const e of events) {
      const reason = checkEnvelope(e, space);
      const id = e && typeof e === "object" && typeof (e as Envelope).id === "string" ? (e as Envelope).id : "";
      if (reason) {
        rejected.push({ id, reason });
        continue;
      }
      const env_ = e as Envelope;
      const stored: Envelope = { id: env_.id, space: env_.space, ts: env_.ts, device: env_.device, iv: env_.iv, ct: env_.ct };
      statements.push(insert.bind(env_.id, space, now, JSON.stringify(stored)));
      accepted.push(env_.id);
    }
    if (statements.length > 0) await env.DB.batch(statements);
    return json({ accepted, rejected });
  }

  async function pull(url: URL, env: SyncEnv, space: string): Promise<Response> {
    const after = Math.max(0, Math.trunc(Number(url.searchParams.get("after") ?? "0")) || 0);
    const limit = Math.min(LIMITS.maxPullLimit, Math.max(1, Math.trunc(Number(url.searchParams.get("limit") ?? "500")) || 500));
    const row = await spaceRow(env, space);
    if (!row || !apps.has(row.app)) return json({ error: "unknown space" }, 404);
    const { results } = await env.DB.prepare("SELECT seq, received_at, envelope FROM events WHERE space = ?1 AND seq > ?2 ORDER BY seq LIMIT ?3")
      .bind(space, after, limit + 1)
      .all<{ seq: number; received_at: number; envelope: string }>();
    const more = results.length > limit;
    const page = results.slice(0, limit);
    const out = page.map((r) => ({ ...(JSON.parse(r.envelope) as Envelope), seq: r.seq, receivedAt: r.received_at }));
    return json({ events: out, cursor: page.at(-1)?.seq ?? after, more });
  }

  /** Handles a request under the base path. Returns 404 JSON for unknown API paths. */
  async function handle(req: Request, env: SyncEnv): Promise<Response> {
    try {
      const url = new URL(req.url);
      const path = url.pathname.startsWith(base) ? url.pathname.slice(base.length) : url.pathname;
      if (req.method === "POST" && env.WRITE_LIMITER) {
        const ip = req.headers.get("cf-connecting-ip") ?? "unknown";
        const { success } = await env.WRITE_LIMITER.limit({ key: ip });
        if (!success) return json({ error: "Trop de requêtes, réessayez dans une minute" }, 429);
      }
      if (path === "" || path === "/") return json({ name: "rezote-sync", ok: true, apps: [...apps] });
      if (path === "/spaces" && req.method === "POST") return await createSpace(req, env);
      const m = /^\/spaces\/([^/]+)\/events$/.exec(path);
      if (m) {
        const space = m[1]!;
        if (!isSpaceId(space)) return json({ error: "unknown space" }, 404);
        if (req.method === "POST") return await push(req, env, space);
        if (req.method === "GET") return await pull(url, env, space);
        return json({ error: "method not allowed" }, 405);
      }
      return json({ error: "not found" }, 404);
    } catch (err) {
      console.error(err);
      return json({ error: "server error" }, 500);
    }
  }

  return { handle };
}
