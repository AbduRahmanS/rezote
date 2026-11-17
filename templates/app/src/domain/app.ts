import { defineApp } from "@rezote/core";
import { events, writersOnly } from "./events.ts";
import { project } from "./project.ts";

export const starter = defineApp({
  // The IndexedDB name and the server's app tag. Never change it after release.
  name: "__SLUG__",
  events,
  writersOnly,
  project,
});
