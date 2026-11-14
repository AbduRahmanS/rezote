// Rezote sync server. It stores encrypted envelopes and returns them by cursor.
// It never sees encryption keys and cannot read event contents.
//
//   POST /spaces                    { id, app, writeKeyHash }        → { space }
//   POST /spaces/:space/events      { events: Envelope[] }  (Bearer W) → { accepted, rejected }
//   GET  /spaces/:space/events?after=<seq>&limit=<n>                 → { events, cursor, more }

import { Hono } from "hono";
import { cors } from "hono/cors";

export interface Env {
  DB: D1Database;
  /** Comma-separated list of app origins allowed to call the API. */
  ALLOWED_ORIGINS?: string;
  /** Optional Cloudflare rate limiting binding for writes. */
  WRITE_LIMITER?: RateLimit;
}

export const LIMITS = {
  maxBodyBytes: 256 * 1024,
  maxEventsPerPush: 500,
  maxPullLimit: 500,
  maxCiphertextChars: 16 * 1024,
} as const;

const APPS = new Set(["collecte", "carnet-de-route"]);
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

export function createApp() {
  const app = new Hono<{ Bindings: Env }>();

  app.use(
    "*",
    cors({
      origin: (origin, c) => {
        const allowed = ((c.env as Env).ALLOWED_ORIGINS ?? "")
          .split(",")
          .map((s: string) => s.trim())
          .filter(Boolean);
        return allowed.includes(origin) ? origin : null;
      },
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ["content-type", "authorization"],
      maxAge: 86400,
    }),
  );

  app.use("*", async (c, next) => {
    await next();
    c.header("x-content-type-options", "nosniff");
    c.header("cache-control", "no-store");
  });

  // Rate limit every write, per client IP.
  app.use("*", async (c, next) => {
    if (c.req.method === "POST" && c.env.WRITE_LIMITER) {
      const ip = c.req.header("cf-connecting-ip") ?? "unknown";
      const { success } = await c.env.WRITE_LIMITER.limit({ key: ip });
      if (!success) return c.json({ error: "Trop de requêtes, réessayez dans une minute" }, 429);
    }
    await next();
  });

  app.get("/", (c) => c.json({ name: "rezote-sync", ok: true }));

  app.post("/spaces", async (c) => {
    const body = await readJson(c.req.raw);
    if (!body.ok) return c.json({ error: "invalid body" }, body.status);
    const { id, app: appName, writeKeyHash } = (body.value ?? {}) as Record<string, unknown>;
    if (!isSpaceId(id) || typeof appName !== "string" || !APPS.has(appName) || !isHash(writeKeyHash)) {
      return c.json({ error: "invalid space" }, 400);
    }
    await c.env.DB.prepare(
      "INSERT INTO spaces (id, app, write_key_hash, created_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(id) DO NOTHING",
    )
      .bind(id, appName, writeKeyHash, Date.now())
      .run();
    const row = await c.env.DB.prepare("SELECT app, write_key_hash FROM spaces WHERE id = ?1")
      .bind(id)
      .first<{ app: string; write_key_hash: string }>();
    // Creating the same space twice with the same key is a harmless retry.
    if (!row || row.app !== appName || !safeEqual(row.write_key_hash, writeKeyHash)) {
      return c.json({ error: "space already exists" }, 409);
    }
    return c.json({ space: id }, 201);
  });

  app.post("/spaces/:space/events", async (c) => {
    const space = c.req.param("space");
    if (!isSpaceId(space)) return c.json({ error: "unknown space" }, 404);
    const auth = c.req.header("authorization") ?? "";
    const writeKey = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (writeKey.length !== 22 || !B64URL.test(writeKey)) return c.json({ error: "write key required" }, 401);

    const row = await c.env.DB.prepare("SELECT write_key_hash FROM spaces WHERE id = ?1")
      .bind(space)
      .first<{ write_key_hash: string }>();
    if (!row) return c.json({ error: "unknown space" }, 404);
    if (!safeEqual(row.write_key_hash, await sha256(writeKey))) return c.json({ error: "invalid write key" }, 403);

    const body = await readJson(c.req.raw);
    if (!body.ok) return c.json({ error: body.status === 413 ? "request too large" : "invalid body" }, body.status);
    const events = (body.value as { events?: unknown } | null)?.events;
    if (!Array.isArray(events)) return c.json({ error: "events must be an array" }, 400);
    if (events.length > LIMITS.maxEventsPerPush) return c.json({ error: "too many events" }, 413);

    const accepted: string[] = [];
    const rejected: { id: string; reason: string }[] = [];
    const statements: D1PreparedStatement[] = [];
    const now = Date.now();
    const insert = c.env.DB.prepare(
      "INSERT INTO events (id, space, received_at, envelope) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(id) DO NOTHING",
    );
    for (const e of events) {
      const reason = checkEnvelope(e, space);
      const id = e && typeof e === "object" && typeof (e as Envelope).id === "string" ? (e as Envelope).id : "";
      if (reason) {
        rejected.push({ id, reason });
        continue;
      }
      const env = e as Envelope;
      const stored: Envelope = { id: env.id, space: env.space, ts: env.ts, device: env.device, iv: env.iv, ct: env.ct };
      statements.push(insert.bind(env.id, space, now, JSON.stringify(stored)));
      accepted.push(env.id);
    }
    if (statements.length > 0) await c.env.DB.batch(statements);
    return c.json({ accepted, rejected });
  });

  app.get("/spaces/:space/events", async (c) => {
    const space = c.req.param("space");
    if (!isSpaceId(space)) return c.json({ error: "unknown space" }, 404);
    const after = Math.max(0, Math.trunc(Number(c.req.query("after") ?? "0")) || 0);
    const limit = Math.min(LIMITS.maxPullLimit, Math.max(1, Math.trunc(Number(c.req.query("limit") ?? "500")) || 500));
    const exists = await c.env.DB.prepare("SELECT 1 AS ok FROM spaces WHERE id = ?1").bind(space).first();
    if (!exists) return c.json({ error: "unknown space" }, 404);
    const { results } = await c.env.DB.prepare(
      "SELECT seq, received_at, envelope FROM events WHERE space = ?1 AND seq > ?2 ORDER BY seq LIMIT ?3",
    )
      .bind(space, after, limit + 1)
      .all<{ seq: number; received_at: number; envelope: string }>();
    const more = results.length > limit;
    const page = results.slice(0, limit);
    const out = page.map((r) => ({ ...(JSON.parse(r.envelope) as Envelope), seq: r.seq, receivedAt: r.received_at }));
    return c.json({ events: out, cursor: page.at(-1)?.seq ?? after, more });
  });

  app.notFound((c) => c.json({ error: "not found" }, 404));
  app.onError((err, c) => {
    console.error(err);
    return c.json({ error: "server error" }, 500);
  });

  return app;
}

export default createApp();
