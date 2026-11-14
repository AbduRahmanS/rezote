import { AppShell } from "@rezote/core/react";
import stylesUrl from "@rezote/core/styles.css?url";
import themeUrl from "../theme.css?url";
import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { app } from "../runtime.ts";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "description", content: "Trajet, dépenses et arrêts du camion, même sur les routes sans réseau." },
      { name: "theme-color", content: "#0e0f13" },
      { name: "referrer", content: "no-referrer" },
      { title: "Carnet de route · Rezote" },
    ],
    links: [
      { rel: "stylesheet", href: stylesUrl },
      { rel: "stylesheet", href: themeUrl },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "icon", href: "/icon.svg", type: "image/svg+xml" },
      { rel: "apple-touch-icon", href: "/icon-192.png" },
    ],
  }),
  shellComponent: RootDocument,
  component: () => (
    <AppShell app={app} appName="Carnet de route">
      <Outlet />
    </AppShell>
  ),
});

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
