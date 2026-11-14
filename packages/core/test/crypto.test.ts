import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { fromBase64Url, toBase64Url } from "../src/base64.ts";
import { generateSecrets, importKeys, open, seal, writeKeyHash } from "../src/crypto.ts";
import type { RezoteEvent } from "../src/event.ts";
import { buildLinks, parseLink } from "../src/links.ts";

const WRITERS = { "route/entry.recorded": ["position"] } as const;

async function setup() {
  const secrets = generateSecrets();
  const writer = await importKeys(secrets);
  const reader = await importKeys({ space: secrets.space, enc: secrets.enc });
  return { secrets, writer, reader };
}

function event(space: string, payload: unknown, type = "route/entry.recorded"): RezoteEvent {
  return { id: crypto.randomUUID(), space, type, payload, ts: Date.now(), device: "dev1" };
}

const payloadArb = fc.record({
  place: fc.string(),
  amount: fc.option(fc.integer({ min: 0, max: 1e9 }), { nil: undefined }),
  position: fc.option(fc.record({ lat: fc.double({ min: -90, max: 90, noNaN: true }), lng: fc.double({ min: -180, max: 180, noNaN: true }) }), {
    nil: undefined,
  }),
});

describe("base64url", () => {
  it("round-trips any bytes", () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 100 }), (bytes) => {
        expect(fromBase64Url(toBase64Url(bytes))).toEqual(bytes);
      }),
    );
  });
});

describe("seal and open", () => {
  it("round-trips events for writers", async () => {
    const { secrets, writer } = await setup();
    await fc.assert(
      fc.asyncProperty(payloadArb, async (payload) => {
        const clean = JSON.parse(JSON.stringify(payload));
        const e = event(secrets.space, clean);
        const result = await open(await seal(e, writer, WRITERS), writer, WRITERS);
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.event).toEqual(e);
      }),
      { numRuns: 50 },
    );
  });

  it("hides writers-only fields from read-link members", async () => {
    const { secrets, writer, reader } = await setup();
    await fc.assert(
      fc.asyncProperty(payloadArb, async (payload) => {
        const clean = JSON.parse(JSON.stringify(payload));
        const envelope = await seal(event(secrets.space, clean), writer, WRITERS);
        const result = await open(envelope, reader, WRITERS);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const p = result.event.payload as Record<string, unknown>;
        expect(p.position).toBeUndefined();
        expect(p.place).toBe(clean.place);
        expect(result.hiddenFields).toEqual(clean.position ? ["position"] : []);
        // What a read-link member can decrypt contains no trace of the position.
        expect(JSON.stringify(result.event)).not.toMatch(/"lat"|"lng"/);
      }),
      { numRuns: 50 },
    );
  });

  it("fails when any character of the ciphertext or envelope changes", async () => {
    const { secrets, writer } = await setup();
    const envelope = await seal(event(secrets.space, { place: "Zégoua" }), writer, WRITERS);
    await fc.assert(
      fc.asyncProperty(fc.nat({ max: envelope.ct.length - 1 }), async (i) => {
        const c = envelope.ct[i] === "A" ? "B" : "A";
        const tampered = { ...envelope, ct: envelope.ct.slice(0, i) + c + envelope.ct.slice(i + 1) };
        expect((await open(tampered, writer, WRITERS)).ok).toBe(false);
      }),
      { numRuns: 40 },
    );
    expect((await open({ ...envelope, ts: envelope.ts + 1 }, writer, WRITERS)).ok).toBe(false);
    expect((await open({ ...envelope, device: "other" }, writer, WRITERS)).ok).toBe(false);
    expect((await open({ ...envelope, id: crypto.randomUUID() }, writer, WRITERS)).ok).toBe(false);
  });

  it("cannot be opened with another space's key", async () => {
    const a = await setup();
    const b = await setup();
    const envelope = await seal(event(a.secrets.space, { place: "x" }), a.writer, WRITERS);
    expect((await open({ ...envelope, space: b.secrets.space }, b.writer, WRITERS)).ok).toBe(false);
  });

  it("does not put the type or payload in clear text", async () => {
    const { secrets, writer } = await setup();
    const envelope = await seal(event(secrets.space, { place: "Moussala" }), writer, WRITERS);
    expect(JSON.stringify(envelope)).not.toContain("Moussala");
    expect(JSON.stringify(envelope)).not.toContain("route/entry");
  });

  it("refuses to seal writers-only fields without the write key", async () => {
    const { secrets, reader } = await setup();
    await expect(seal(event(secrets.space, { place: "x", position: { lat: 1, lng: 2 } }), reader, WRITERS)).rejects.toThrow();
  });
});

describe("links", () => {
  it("round-trip write and read links", async () => {
    const secrets = generateSecrets();
    const links = buildLinks("https://collecte.example/#/old", secrets);
    expect(links.write).toMatch(/^https:\/\/collecte\.example\/#s=/);
    expect(parseLink(links.write!)).toEqual(secrets);
    expect(parseLink(links.read)).toEqual({ space: secrets.space, enc: secrets.enc });
  });

  it("rejects malformed links", () => {
    expect(parseLink("#/farmers")).toBeNull();
    expect(parseLink("#s=short&e=short")).toBeNull();
  });

  it("hashes the write key deterministically", async () => {
    const { write } = generateSecrets();
    expect(await writeKeyHash(write)).toBe(await writeKeyHash(write));
    expect(await writeKeyHash(write)).toHaveLength(43);
  });
});
