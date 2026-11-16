import { AppShell, useRuntime, type NavItem } from "@rezote/core/react";
import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { History, Route as RouteIcon, Settings, Truck } from "lucide-react";
import type { ReactNode } from "react";
import { app, useRole } from "../runtime.ts";
import stylesUrl from "../styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "description", content: "Trajet, dépenses et arrêts du camion, même sur les routes sans réseau." },
      { name: "theme-color", content: "#f9f8f6", media: "(prefers-color-scheme: light)" },
      { name: "theme-color", content: "#1c1a18", media: "(prefers-color-scheme: dark)" },
      { name: "referrer", content: "no-referrer" },
      { title: "Carnet de route · Rezote" },
    ],
    links: [
      { rel: "stylesheet", href: stylesUrl },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "icon", href: "/icon.svg", type: "image/svg+xml" },
      { rel: "apple-touch-icon", href: "/icon-192.png" },
    ],
  }),
  shellComponent: RootDocument,
  component: Root,
});

function Root() {
  const role = useRole();
  const currentId = useRuntime(app, (s) => s.currentId);
  const nav: NavItem[] =
    !currentId || !role
      ? []
      : [
          role === "driver" ? { to: "/", label: "Trajet", icon: RouteIcon, exact: true } : { to: "/", label: "Camion", icon: Truck, exact: true },
          { to: "/trips", label: role === "driver" ? "Historique" : "Trajets", icon: History },
          { to: "/settings", label: "Réglages", icon: Settings },
        ];
  return (
    <AppShell app={app} appName="Carnet de route" icon={Truck} nav={nav}>
      <Outlet />
    </AppShell>
  );
}

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
