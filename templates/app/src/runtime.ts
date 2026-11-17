import { createApp } from "@rezote/core";
import { useAppView } from "@rezote/core/react";
import { starter } from "./domain/app.ts";
import type { StarterView } from "./domain/project.ts";

/** The sync API is served by this app's own Worker under /api. */
export const app = createApp(starter);

// Keep the space's label in the menu in step with its title, on every phone.
app.store.subscribe((s) => {
  const title = app.view?.title;
  if (s.ready && s.currentId && title && s.spaces.find((x) => x.id === s.currentId)?.label !== title) void app.setLabel(s.currentId, title);
});

export function useView(): StarterView | null {
  return useAppView(app);
}

export const newId = () => crypto.randomUUID();
