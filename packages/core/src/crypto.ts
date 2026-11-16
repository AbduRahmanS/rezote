// End-to-end encryption of events with the Web Crypto API (no library, 0 KB).
//
// Keys of a space:
//   space ID  128 bits  in both links and on the server
//   E         256 bits  in both links; AES-GCM key for every event
//   W         128 bits  in the write link only; proves the right to write.
//                       The server stores SHA-256(W) only.
//   K         256 bits  derived on writers' phones: HKDF-SHA256(W, salt = space ID,
//                       info = "rezote/writers"); encrypts fields marked writers-only.

import { fromBase64Url, isBase64Url, randomBase64Url, toBase64Url } from "./base64.ts";
import type { Envelope, RezoteEvent } from "./event.ts";

export interface SpaceSecrets {
  space: string;
  /** Encryption key E, base64url (43 chars). */
  enc: string;
  /** Write key W, base64url (22 chars). Absent for read-only members. */
  write?: string;
}

export interface SpaceKeys {
  space: string;
  encKey: CryptoKey;
  writersKey?: CryptoKey;
}

/** Writers-only field names per event type. */
export type WritersOnlyFields = Readonly<Record<string, readonly string[]>>;

const enc = new TextEncoder();
const dec = new TextDecoder();
const SEALED = "$w";

export function generateSecrets(): Required<SpaceSecrets> {
  return { space: randomBase64Url(16), enc: randomBase64Url(32), write: randomBase64Url(16) };
}

export function isValidSecrets(s: Partial<SpaceSecrets>): s is SpaceSecrets {
  return (
    isBase64Url(s.space, 22) &&
    isBase64Url(s.enc, 43) &&
    (s.write === undefined || isBase64Url(s.write, 22))
  );
}

export async function sha256Base64Url(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(text));
  return toBase64Url(new Uint8Array(digest));
}

/** Hash of the write key, as sent when a space is created and stored by the server. */
export function writeKeyHash(write: string): Promise<string> {
  return sha256Base64Url(write);
}

export async function importKeys(secrets: SpaceSecrets): Promise<SpaceKeys> {
  const encKey = await crypto.subtle.importKey("raw", bytes(fromBase64Url(secrets.enc)), "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
  if (!secrets.write) return { space: secrets.space, encKey };
  const base = await crypto.subtle.importKey("raw", bytes(fromBase64Url(secrets.write)), "HKDF", false, ["deriveKey"]);
  const writersKey = await crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: enc.encode(secrets.space), info: enc.encode("rezote/writers") },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  return { space: secrets.space, encKey, writersKey };
}

/** Copies into a fresh ArrayBuffer-backed array, as Web Crypto requires. */
function bytes(u: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(u.length)) as Uint8Array<ArrayBuffer>;
  out.set(u);
  return out;
}

function aad(e: Pick<Envelope, "id" | "space" | "ts" | "device">, suffix = ""): Uint8Array<ArrayBuffer> {
  return bytes(enc.encode(`${e.id}|${e.space}|${e.ts}|${e.device}${suffix}`));
}

async function encrypt(key: CryptoKey, plain: string, additionalData: Uint8Array<ArrayBuffer>) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData }, key, enc.encode(plain));
  return { iv: toBase64Url(iv), ct: toBase64Url(new Uint8Array(ct)) };
}

async function decrypt(key: CryptoKey, iv: string, ct: string, additionalData: Uint8Array<ArrayBuffer>): Promise<string> {
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bytes(fromBase64Url(iv)), additionalData },
    key,
    bytes(fromBase64Url(ct)),
  );
  return dec.decode(plain);
}

/** Encrypts an event into the envelope the server stores. */
export async function seal(event: RezoteEvent, keys: SpaceKeys, writersOnly: WritersOnlyFields = {}): Promise<Envelope> {
  if (event.space !== keys.space) throw new Error("Event space does not match the keys");
  let payload = event.payload;
  const fields = writersOnly[event.type];
  if (fields && fields.length > 0 && payload && typeof payload === "object") {
    if (!keys.writersKey) throw new Error("Writers-only fields need the write key");
    const copy: Record<string, unknown> = { ...(payload as Record<string, unknown>) };
    for (const field of fields) {
      if (copy[field] === undefined) continue;
      const sealed = await encrypt(keys.writersKey, JSON.stringify(copy[field]), aad(event, `|${field}`));
      copy[field] = { [SEALED]: `${sealed.iv}.${sealed.ct}` };
    }
    payload = copy;
  }
  const { iv, ct } = await encrypt(keys.encKey, JSON.stringify({ type: event.type, payload }), aad(event));
  return { id: event.id, space: event.space, ts: event.ts, device: event.device, iv, ct };
}

export type OpenResult =
  | { ok: true; event: RezoteEvent; hiddenFields: string[] }
  | { ok: false; reason: "decrypt" | "format" };

/**
 * Decrypts an envelope. Writers-only fields that this member cannot read are
 * removed from the payload and listed in `hiddenFields`.
 */
export async function open(envelope: Envelope, keys: SpaceKeys, writersOnly: WritersOnlyFields = {}): Promise<OpenResult> {
  if (envelope.space !== keys.space) return { ok: false, reason: "format" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(await decrypt(keys.encKey, envelope.iv, envelope.ct, aad(envelope)));
  } catch {
    return { ok: false, reason: "decrypt" };
  }
  if (!parsed || typeof parsed !== "object" || typeof (parsed as { type?: unknown }).type !== "string") {
    return { ok: false, reason: "format" };
  }
  const { type, payload } = parsed as { type: string; payload: unknown };
  const hiddenFields: string[] = [];
  let finalPayload = payload;
  const fields = writersOnly[type];
  if (fields && payload && typeof payload === "object") {
    const copy: Record<string, unknown> = { ...(payload as Record<string, unknown>) };
    for (const field of fields) {
      const value = copy[field] as { [SEALED]?: unknown } | undefined;
      if (value === undefined) continue;
      const sealed = value && typeof value === "object" ? value[SEALED] : undefined;
      if (typeof sealed !== "string") return { ok: false, reason: "format" };
      if (!keys.writersKey) {
        delete copy[field];
        hiddenFields.push(field);
        continue;
      }
      const [iv, ct] = sealed.split(".");
      if (!iv || !ct) return { ok: false, reason: "format" };
      try {
        copy[field] = JSON.parse(await decrypt(keys.writersKey, iv, ct, aad(envelope, `|${field}`)));
      } catch {
        return { ok: false, reason: "decrypt" };
      }
    }
    finalPayload = copy;
  }
  const event: RezoteEvent = {
    id: envelope.id,
    space: envelope.space,
    ts: envelope.ts,
    device: envelope.device,
    type,
    payload: finalPayload,
  };
  if (envelope.seq !== undefined) event.seq = envelope.seq;
  if (envelope.receivedAt !== undefined) event.receivedAt = envelope.receivedAt;
  return { ok: true, event, hiddenFields };
}
