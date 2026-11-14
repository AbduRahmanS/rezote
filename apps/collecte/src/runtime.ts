import { createApp } from "@rezote/core";
import { signal } from "@preact/signals";
import { collecte } from "./domain/app.ts";

export const app = createApp(collecte, {
  serverUrl: import.meta.env.VITE_SYNC_URL ?? "http://localhost:8787",
});

/** What this phone does in the current campaign. Stored per space, on this phone only. */
export type Role = { kind: "treasurer" } | { kind: "collector"; collectorId: string } | { kind: "viewer" };

export const role = signal<Role | null>(null);

export async function loadRole(space: string | null): Promise<void> {
  if (!space) {
    role.value = null;
    return;
  }
  const saved = await app.getSetting<Role>(`role:${space}`);
  role.value = saved ?? (app.canWrite(space) ? null : { kind: "viewer" });
}

export async function setRole(r: Role): Promise<void> {
  const space = app.currentId.value;
  if (!space) return;
  await app.setSetting(`role:${space}`, r);
  role.value = r;
}

export const newId = () => crypto.randomUUID();
