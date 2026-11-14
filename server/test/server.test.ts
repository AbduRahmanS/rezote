import { describe, expect, it } from "vitest";
import { generateSecrets, importKeys, open, seal, writeKeyHash } from "../../packages/core/src/crypto.ts";
import type { Envelope } from "../../packages/core/src/event.ts";
import { httpTransport } from "../../packages/core/src/sync.ts";
import { createApp, type Env } from "../src/index.ts";
import { createD1 } from "./d1-shim.ts";

function setup(extra: Partial<Env> = {}) {
  const app = createApp();
  const env: Env = { DB: createD1(), ALLOWED_ORIGINS: "https://collecte.example", ...extra };
  const request = (path: string, init?: RequestInit) => app.request(path, init, env);
  // A fetch that routes to the in-process app, to test the real client transport against the real server.
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input : input.url);
    return app.request(url.pathname + url.search, init, env);
  }) as typeof fetch;
  return { request, env, fetchImpl };
}

async function newSpace(request: ReturnType<typeof setup>["request"], appName = "collecte") {
  const secrets = generateSecrets();
  const res = await request("/spaces", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: secrets.space, app: appName, writeKeyHash: await writeKeyHash(secrets.write) }),
  });
  expect(res.status).toBe(201);
  return secrets;
}

async function envelope(secrets: ReturnType<typeof generateSecrets>, payload: unknown = { n: 1 }): Promise<Envelope> {
  const keys = await importKeys(secrets);
  return seal({ id: crypto.randomUUID(), space: secrets.space, type: "collecte/test", payload, ts: Date.now(), device: "dev1" }, keys);
}

function push(request: ReturnType<typeof setup>["request"], space: string, key: string, events: unknown[]) {
  return request(`/spaces/${space}/events`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({ events }),
  });
}

describe("spaces", () => {
  it("creates a space and accepts the same request again", async () => {
    const { request } = setup();
    const secrets = await newSpace(request);
    const again = await request("/spaces", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: secrets.space, app: "collecte", writeKeyHash: await writeKeyHash(secrets.write) }),
    });
    expect(again.status).toBe(201);
  });

  it("refuses to take over an existing space with another key", async () => {
    const { request } = setup();
    const secrets = await newSpace(request);
    const other = generateSecrets();
    const res = await request("/spaces", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: secrets.space, app: "collecte", writeKeyHash: await writeKeyHash(other.write) }),
    });
    expect(res.status).toBe(409);
  });

  it("rejects unknown apps and malformed IDs", async () => {
    const { request } = setup();
    const s = generateSecrets();
    const hash = await writeKeyHash(s.write);
    for (const body of [
      { id: s.space, app: "other", writeKeyHash: hash },
      { id: "short", app: "collecte", writeKeyHash: hash },
      { id: s.space, app: "collecte", writeKeyHash: "x" },
    ]) {
      const res = await request("/spaces", { method: "POST", body: JSON.stringify(body) });
      expect(res.status).toBe(400);
    }
  });
});

describe("events", () => {
  it("stores events once, even when pushed twice, and returns them by cursor", async () => {
    const { request } = setup();
    const secrets = await newSpace(request);
    const e1 = await envelope(secrets);
    const e2 = await envelope(secrets);
    type Push = { accepted: string[] };
    expect(((await (await push(request, secrets.space, secrets.write, [e1, e2])).json()) as Push).accepted).toEqual([e1.id, e2.id]);
    expect(((await (await push(request, secrets.space, secrets.write, [e1])).json()) as Push).accepted).toEqual([e1.id]);

    const page = (await (await request(`/spaces/${secrets.space}/events?after=0`)).json()) as {
      events: Envelope[];
      cursor: number;
      more: boolean;
    };
    expect(page.events.map((e) => e.id)).toEqual([e1.id, e2.id]);
    expect(page.more).toBe(false);
    const next = (await (await request(`/spaces/${secrets.space}/events?after=${page.cursor}`)).json()) as { events: Envelope[] };
    expect(next.events).toEqual([]);

    // What comes back still decrypts.
    const opened = await open(page.events[0]!, await importKeys(secrets));
    expect(opened.ok).toBe(true);
  });

  it("pages with `more` when there are more events than the limit", async () => {
    const { request } = setup();
    const secrets = await newSpace(request);
    const batch = await Promise.all(Array.from({ length: 5 }, () => envelope(secrets)));
    await push(request, secrets.space, secrets.write, batch);
    const first = (await (await request(`/spaces/${secrets.space}/events?after=0&limit=3`)).json()) as {
      events: Envelope[];
      cursor: number;
      more: boolean;
    };
    expect(first.events).toHaveLength(3);
    expect(first.more).toBe(true);
    const second = (await (await request(`/spaces/${secrets.space}/events?after=${first.cursor}&limit=3`)).json()) as {
      events: Envelope[];
      more: boolean;
    };
    expect(second.events).toHaveLength(2);
    expect(second.more).toBe(false);
  });

  it("requires the right write key", async () => {
    const { request } = setup();
    const secrets = await newSpace(request);
    const e = await envelope(secrets);
    expect((await push(request, secrets.space, generateSecrets().write, [e])).status).toBe(403);
    expect((await request(`/spaces/${secrets.space}/events`, { method: "POST", body: JSON.stringify({ events: [e] }) })).status).toBe(401);
  });

  it("rejects unknown spaces", async () => {
    const { request } = setup();
    const s = generateSecrets();
    expect((await push(request, s.space, s.write, [])).status).toBe(404);
    expect((await request(`/spaces/${s.space}/events?after=0`)).status).toBe(404);
  });

  it("rejects malformed envelopes one by one and keeps the valid ones", async () => {
    const { request } = setup();
    const secrets = await newSpace(request);
    const good = await envelope(secrets);
    const other = generateSecrets();
    const wrongSpace = { ...(await envelope(other)) };
    const res = (await (
      await push(request, secrets.space, secrets.write, [good, wrongSpace, { ...good, id: "nope" }, { ...good, id: crypto.randomUUID(), iv: "x" }])
    ).json()) as { accepted: string[]; rejected: { reason: string }[] };
    expect(res.accepted).toEqual([good.id]);
    expect(res.rejected.map((r) => r.reason)).toEqual(["space mismatch", "invalid id", "invalid iv"]);
  });

  it("rejects requests over 256 KB and batches over 500 events", async () => {
    const { request } = setup();
    const secrets = await newSpace(request);
    const big = await envelope(secrets);
    const huge = Array.from({ length: 20 }, () => ({ ...big, id: crypto.randomUUID(), ct: "A".repeat(16_000) }));
    expect((await push(request, secrets.space, secrets.write, huge)).status).toBe(413);
    const many = Array.from({ length: 501 }, () => ({ id: crypto.randomUUID() }));
    expect((await push(request, secrets.space, secrets.write, many)).status).toBe(413);
  });

  it("enforces the rate limit on writes", async () => {
    let calls = 0;
    const limiter = { limit: async () => ({ success: ++calls <= 2 }) } as unknown as RateLimit;
    const { request } = setup({ WRITE_LIMITER: limiter });
    const secrets = await newSpace(request);
    expect((await push(request, secrets.space, secrets.write, [])).status).toBe(200);
    expect((await push(request, secrets.space, secrets.write, [])).status).toBe(429);
  });
});

describe("CORS", () => {
  it("allows only the configured origins", async () => {
    const { request } = setup();
    const ok = await request("/", { headers: { origin: "https://collecte.example" } });
    expect(ok.headers.get("access-control-allow-origin")).toBe("https://collecte.example");
    const no = await request("/", { headers: { origin: "https://evil.example" } });
    expect(no.headers.get("access-control-allow-origin")).toBeNull();
  });
});

describe("client transport against the real server", () => {
  it("creates, pushes, and pulls", async () => {
    const { fetchImpl } = setup();
    const original = globalThis.fetch;
    globalThis.fetch = fetchImpl;
    try {
      const t = httpTransport("http://server.test");
      const secrets = generateSecrets();
      await t.createSpace({ id: secrets.space, app: "carnet-de-route", writeKeyHash: await writeKeyHash(secrets.write) });
      const e = await envelope(secrets);
      expect((await t.push(secrets.space, secrets.write, [e])).accepted).toEqual([e.id]);
      const page = await t.pull(secrets.space, 0, 10);
      expect(page.events[0]!.ct).toBe(e.ct);
      expect(page.events[0]!.seq).toBe(1);
    } finally {
      globalThis.fetch = original;
    }
  });
});
