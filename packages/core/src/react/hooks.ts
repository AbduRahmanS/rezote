import { useSelector } from "@tanstack/react-store";
import type { EventSchemas, RezoteApp, RuntimeState } from "../app.ts";
import type { SyncStatus } from "../sync.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyApp = RezoteApp<any, any>;

/** Selects part of the runtime state (spaces, current space, ready…) and re-renders when it changes. */
export function useRuntime<M extends EventSchemas, T>(app: RezoteApp<M, unknown>, selector: (s: RuntimeState<M>) => T): T {
  return useSelector(app.store, selector);
}

/** The projection of the current space. Recomputed only when its events change. */
export function useAppView<M extends EventSchemas, V>(app: RezoteApp<M, V>): V | null {
  useSelector(app.store, (s) => s.events);
  useSelector(app.store, (s) => s.currentId);
  return app.view;
}

export function useStatus(app: AnyApp): SyncStatus {
  return useSelector(app.status);
}

export function useGhosts(app: AnyApp): ReadonlySet<string> {
  return useSelector(app.ghosts);
}

/** True when the current space can be written from this phone. */
export function useCanWrite(app: AnyApp): boolean {
  return useSelector(app.store, (s) => !!s.spaces.find((x) => x.id === s.currentId)?.write);
}
