import { AppShell, type NavItem } from "@rezote/core/react";
import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { NotebookPen } from "lucide-react";
import type { ReactNode } from "react";
import { app } from "../runtime.ts";
import stylesUrl from "../styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "description", content: "__NAME__, même sans réseau." },
      { name: "theme-color", content: "#f9f8f6", media: "(prefers-color-scheme: light)" },
      { name: "theme-color", content: "#1c1a18", media: "(prefers-color-scheme: dark)" },
      { name: "referrer", content: "no-referrer" },
      { title: "__NAME__ · Rezote" },
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

// Bottom navigation. One screen needs none; add items as the app grows, for
// example { to: "/history", label: "Historique", icon: History }.
const nav: NavItem[] = [];

function Root() {
  return (
    <AppShell app={app} appName="__NAME__" icon={NotebookPen} nav={nav}>
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
