// Share links. Keys travel in the URL fragment (#...), which browsers never send
// to servers, so they stay out of server and proxy logs.
//
//   write link: https://app.example/#s=<space>&e=<E>&w=<W>
//   read link:  https://app.example/#s=<space>&e=<E>

import { isValidSecrets, type SpaceSecrets } from "./crypto.ts";

export interface ShareLinks {
  write?: string;
  read: string;
}

export function buildLinks(appUrl: string, secrets: SpaceSecrets): ShareLinks {
  const base = appUrl.split("#")[0]!;
  const read = `${base}#s=${secrets.space}&e=${secrets.enc}`;
  return secrets.write ? { read, write: `${read}&w=${secrets.write}` } : { read };
}

/** Parses the fragment of a share link. Returns null if it is not a valid Rezote link. */
export function parseLink(hashOrUrl: string): SpaceSecrets | null {
  const index = hashOrUrl.indexOf("#");
  const fragment = index >= 0 ? hashOrUrl.slice(index + 1) : hashOrUrl;
  if (!fragment.startsWith("s=")) return null;
  const params = new URLSearchParams(fragment);
  const secrets: Partial<SpaceSecrets> = {
    space: params.get("s") ?? undefined,
    enc: params.get("e") ?? undefined,
  };
  const write = params.get("w");
  if (write) secrets.write = write;
  return isValidSecrets(secrets) ? secrets : null;
}
