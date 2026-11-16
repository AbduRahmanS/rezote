import { createApp } from "@rezote/core";
import { useAppView } from "@rezote/core/react";
import { useSelector } from "@tanstack/react-store";
import { Store } from "@tanstack/store";
import { carnetDeRoute } from "./domain/app.ts";
import type { RouteView } from "./domain/project.ts";

/** The sync API is served by this app's own Worker under /api. */
export const app = createApp(carnetDeRoute);

export type Role = "owner" | "driver" | "viewer";

interface Settings {
  space: string | null;
  role: Role | null;
  loaded: boolean;
  /** GPS is off by default; the driver turns it on for this phone. */
  gps: boolean;
}

export const settingsStore = new Store<Settings>({ space: null, role: null, loaded: false, gps: false });

async function loadSettings(space: string | null): Promise<void> {
  const gps = (await app.getSetting<boolean>("gps")) ?? false;
  const role = space ? ((await app.getSetting<Role>(`role:${space}`)) ?? (app.canWrite(space) ? null : "viewer")) : null;
  settingsStore.setState(() => ({ space, role, loaded: true, gps }));
}

app.store.subscribe((s) => {
  if (!s.ready) return;
  if (settingsStore.get().space !== s.currentId || !settingsStore.get().loaded) void loadSettings(s.currentId);
  const t = app.view?.truck;
  if (t && s.currentId) void app.setLabel(s.currentId, `${t.plate} · ${t.name}`);
});

export async function setRole(role: Role): Promise<void> {
  const space = app.state.currentId;
  if (!space) return;
  await app.setSetting(`role:${space}`, role);
  settingsStore.setState((s) => ({ ...s, space, role, loaded: true }));
}

export async function setGps(gps: boolean): Promise<void> {
  await app.setSetting("gps", gps);
  settingsStore.setState((s) => ({ ...s, gps }));
}

export const useRole = () => useSelector(settingsStore, (s) => s.role);
export const useGps = () => useSelector(settingsStore, (s) => s.gps);

export function useView(): RouteView {
  return useAppView(app) as RouteView;
}

export const newId = () => crypto.randomUUID();

/** Reads the phone's GPS (works without mobile network). Resolves to undefined after 15 s or on refusal. */
export function readPosition(): Promise<{ lat: number; lng: number; accuracyM: number } | undefined> {
  if (!settingsStore.get().gps || !("geolocation" in navigator)) return Promise.resolve(undefined);
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
