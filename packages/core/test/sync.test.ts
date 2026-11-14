import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { generateSecrets, importKeys, open, seal, writeKeyHash } from "../src/crypto.ts";
import type { Envelope, RezoteEvent } from "../src/event.ts";
import { Storage } from "../src/storage.ts";
import { HttpError, SyncEngine, type SpaceRecord, type SyncTransport } from "../src/sync.ts";

let dbCounter = 0;

/** In-memory server with the same semantics as the real one, plus injectable failures. */
class FakeServer implements SyncTransport {
  spaces = new Map<string, string>();
  events: (Envelope & { seq: number })[] = [];
  failures: boolean[] = [];
  /** When true, the server stores the batch but the response is lost (timeout after commit). */
  loseResponses: boolean[] = [];
  private seq = 0;

  private maybeFail() {
    if (this.failures.shift()) throw new HttpError(503, "unavailable");
  }

  async createSpace(req: { id: string; app: string; writeKeyHash: string }) {
    this.maybeFail();
    const existing = this.spaces.get(req.id);
    if (existing && existing !== req.writeKeyHash) throw new HttpError(409, "exists");
    this.spaces.set(req.id, req.writeKeyHash);
  }

  async push(space: string, writeKey: string, envelopes: Envelope[]) {
    this.maybeFail();
    if (this.spaces.get(space) !== (await writeKeyHash(writeKey))) throw new HttpError(403, "bad key");
    for (const e of envelopes) {
      if (!this.events.some((x) => x.id === e.id)) this.events.push({ ...e, seq: ++this.seq });
    }
    if (this.loseResponses.shift()) throw new TypeError("network error");
    return { accepted: envelopes.map((e) => e.id), rejected: [] };
  }

  async pull(space: string, after: number, limit: number) {
    this.maybeFail();
    const rows = this.events.filter((e) => e.space === space && e.seq > after).slice(0, limit);
    const more = this.events.filter((e) => e.space === space && e.seq > after).length > limit;
    return { events: rows, cursor: rows.at(-1)?.seq ?? after, more };
  }
}

async function makeDevice(server: FakeServer, secrets: ReturnType<typeof generateSecrets>, registered: boolean) {
  const storage = await Storage.open(`test-${++dbCounter}`);
  const keys = await importKeys(secrets);
  const space: SpaceRecord = {
    id: secrets.space,
    app: "test",
    enc: secrets.enc,
    write: secrets.write,
    registered,
    writeKeyHash: await writeKeyHash(secrets.write),
    joinedAt: 0,
  };
  const engine = new SyncEngine({
    storage,
    transport: server,
    spaces: () => [space],
    markRegistered: async () => {
      space.registered = true;
    },
    decode: async (env) => {
      const r = await open(env, keys);
      return r.ok ? r.event : null;
    },
    onChange: () => {},
    isOnline: () => true,
  });
  let n = 0;
  const device = `dev${dbCounter}`;
  async function create(): Promise<RezoteEvent> {
    const e: RezoteEvent = { id: crypto.randomUUID(), space: secrets.space, type: "t", payload: n++, ts: Date.now(), device };
    await storage.appendLocal(e, await seal(e, keys));
    return e;
  }
  return { storage, engine, create };
}

describe("storage", () => {
  it("keeps events and the outbox across reopening", async () => {
    const name = `persist-${++dbCounter}`;
    const s1 = await Storage.open(name);
    const e: RezoteEvent = { id: "e1", space: "S", type: "t", payload: 1, ts: 1, device: "d" };
    await s1.appendLocal(e, { id: "e1", space: "S", ts: 1, device: "d", iv: "x", ct: "y" });
    s1.close();
    const s2 = await Storage.open(name);
    expect(await s2.listEvents("S")).toEqual([e]);
    expect([...(await s2.outboxIds())]).toEqual(["e1"]);
  });

  it("never hands out the same counter value twice", async () => {
    const s = await Storage.open(`counter-${++dbCounter}`);
    const values = await Promise.all(Array.from({ length: 20 }, () => s.nextCounter("receipt")));
    expect(new Set(values).size).toBe(20);
  });
});

describe("sync engine", () => {
  it("registers the space, pushes, and lets another device pull", async () => {
    const server = new FakeServer();
    const secrets = generateSecrets();
    const a = await makeDevice(server, secrets, false);
    const b = await makeDevice(server, secrets, true);
    const e1 = await a.create();
    const e2 = await a.create();
    expect(await a.engine.syncNow()).toBe(true);
    expect(server.spaces.has(secrets.space)).toBe(true);
    expect((await a.storage.outboxIds()).size).toBe(0);
    await b.engine.syncNow();
    const received = await b.storage.listEvents(secrets.space);
    expect(received.map((e) => e.id).sort()).toEqual([e1.id, e2.id].sort());
    expect(received.every((e) => e.seq !== undefined)).toBe(true);
  });

  it("moves events refused with a permanent error out of the outbox", async () => {
    const server = new FakeServer();
    const secrets = generateSecrets();
    const a = await makeDevice(server, secrets, true);
    server.spaces.set(secrets.space, "a-different-hash");
    await a.create();
    await a.engine.syncNow();
    expect((await a.storage.outboxIds()).size).toBe(0);
    expect(await a.storage.listRejected(secrets.space)).toHaveLength(1);
  });

  it("never loses an event, whatever fails along the way", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            create: fc.integer({ min: 0, max: 3 }),
            fail: fc.array(fc.boolean(), { maxLength: 4 }),
            lose: fc.array(fc.boolean(), { maxLength: 2 }),
          }),
          { minLength: 1, maxLength: 6 },
        ),
        async (steps) => {
          const server = new FakeServer();
          const secrets = generateSecrets();
          const a = await makeDevice(server, secrets, false);
          const created: string[] = [];
          for (const step of steps) {
            for (let i = 0; i < step.create; i++) created.push((await a.create()).id);
            server.failures = [...step.fail];
            server.loseResponses = [...step.lose];
            await a.engine.syncNow();
            // Invariant: every event is either still queued or stored by the server.
            const queued = await a.storage.outboxIds();
            const stored = new Set(server.events.map((e) => e.id));
            for (const id of created) expect(queued.has(id) || stored.has(id)).toBe(true);
          }
          // Once the network is healthy, everything reaches the server exactly once.
          server.failures = [];
          server.loseResponses = [];
          await a.engine.syncNow();
          expect(server.events.map((e) => e.id).sort()).toEqual([...created].sort());
          expect((await a.storage.outboxIds()).size).toBe(0);
        },
      ),
      { numRuns: 30 },
    );
  });
});
