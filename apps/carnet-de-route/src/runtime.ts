import { createApp } from "@rezote/core";
import { signal } from "@preact/signals";
import { carnetDeRoute } from "./domain/app.ts";

export const app = createApp(carnetDeRoute, {
  serverUrl: import.meta.env.VITE_SYNC_URL ?? "http://localhost:8787",
});

export type Role = "owner" | "driver" | "viewer";

export const role = signal<Role | null>(null);
/** GPS is off by default; the driver turns it on for this phone. */
export const gpsEnabled = signal(false);

export async function loadSettings(space: string | null): Promise<void> {
  gpsEnabled.value = (await app.getSetting<boolean>("gps")) ?? false;
  if (!space) {
    role.value = null;
    return;
  }
  role.value = (await app.getSetting<Role>(`role:${space}`)) ?? (app.canWrite(space) ? null : "viewer");
}

export async function setRole(r: Role): Promise<void> {
  const space = app.currentId.value;
  if (!space) return;
  await app.setSetting(`role:${space}`, r);
  role.value = r;
}

export async function setGps(on: boolean): Promise<void> {
  await app.setSetting("gps", on);
  gpsEnabled.value = on;
}

export const newId = () => crypto.randomUUID();

/** Reads the phone's GPS (works without mobile network). Resolves to undefined after 15 s or on refusal. */
export function readPosition(): Promise<{ lat: number; lng: number; accuracyM: number } | undefined> {
  if (!gpsEnabled.value || !("geolocation" in navigator)) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({
          lat: Math.round(p.coords.latitude * 1e5) / 1e5,
          lng: Math.round(p.coords.longitude * 1e5) / 1e5,
          accuracyM: Math.round(p.coords.accuracy),
        }),
      () => resolve(undefined),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 120_000 },
    );
  });
}
