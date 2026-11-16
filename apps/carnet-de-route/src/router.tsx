import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

function Pending() {
  return (
    <main className="main center">
      <p className="muted">Chargement…</p>
    </main>
  );
}

export function getRouter() {
  return createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: "intent",
    // In SPA mode this is what the prerendered shell shows until the app starts.
    defaultPendingComponent: Pending,
    defaultNotFoundComponent: () => (
      <main className="main">
        <p className="empty">Page introuvable.</p>
      </main>
    ),
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
