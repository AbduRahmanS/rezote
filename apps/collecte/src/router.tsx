import { FullPageLoader } from "@rezote/core/react";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  return createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: "intent",
    // In SPA mode this is what the prerendered shell shows until the app starts.
    defaultPendingComponent: FullPageLoader,
    defaultNotFoundComponent: () => <p className="py-10 text-center text-sm text-muted-foreground">Page introuvable.</p>,
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
