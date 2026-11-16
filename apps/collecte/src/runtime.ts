import { createApp } from "@rezote/core";
import { useAppView } from "@rezote/core/react";
import { useSelector } from "@tanstack/react-store";
import { Store } from "@tanstack/store";
import { collecte } from "./domain/app.ts";
import type { CollecteView } from "./domain/project.ts";

/** The sync API is served by this app's own Worker under /api. */
export const app = createApp(collecte);

/** What this phone does in the current campaign. Stored per space, on this phone only. */
export type Role = { kind: "treasurer" } | { kind: "collector"; collectorId: string } | { kind: "viewer" };

/** null while loading or not chosen yet. */
export const roleStore = new Store<{ space: string | null; role: Role | null; loaded: boolean }>({ space: null, role: null, loaded: false });

export async function loadRole(space: string | null): Promise<void> {
  if (!space) {
    roleStore.setState(() => ({ space, role: null, loaded: true }));
    return;
  }
  const saved = await app.getSetting<Role>(`role:${space}`);
  roleStore.setState(() => ({ space, role: saved ?? (app.canWrite(space) ? null : { kind: "viewer" }), loaded: true }));
}

// Keep the role and the space label in step with the selected campaign.
app.store.subscribe((s) => {
  if (!s.ready) return;
  if (roleStore.get().space !== s.currentId || !roleStore.get().loaded) void loadRole(s.currentId);
  const c = app.view?.campaign;
  if (c && s.currentId) void app.setLabel(s.currentId, `${c.cooperative} · ${c.name}`);
});

export async function setRole(r: Role): Promise<void> {
  const space = app.state.currentId;
  if (!space) return;
  await app.setSetting(`role:${space}`, r);
  roleStore.setState(() => ({ space, role: r, loaded: true }));
}

export function useRole(): Role | null {
  return useSelector(roleStore, (s) => s.role);
}

/** The campaign view. Screens under the _app layout only render once the campaign exists. */
export function useView(): CollecteView {
  return useAppView(app) as CollecteView;
}

export const newId = () => crypto.randomUUID();
