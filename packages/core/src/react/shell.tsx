import { Badge } from "@rezote/ui/components/badge";
import { Button } from "@rezote/ui/components/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@rezote/ui/components/sheet";
import { Toaster } from "@rezote/ui/components/sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@rezote/ui/components/tabs";
import { cn } from "@rezote/ui/lib/utils";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { Check, ChevronsUpDown, Cloud, CloudOff, Eye, Ghost, Loader2, Plus, RefreshCw, TriangleAlert, type LucideIcon } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { formatDateTime } from "../format.ts";
import { confirmAction, DialogHost } from "./dialogs.tsx";
import { useRuntime, useStatus, type AnyApp } from "./hooks.ts";
import { registerServiceWorker, useOfflineReady } from "./pwa.ts";
import { ShareButton } from "./widgets.tsx";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  search?: Record<string, unknown>;
  /** Match only this exact path (for "/"). */
  exact?: boolean;
}

type MenuTab = "spaces" | "share" | "sync";

/** Connection state and the number of changes still on this phone. Opens the sync details. */
function SyncPill({ app, onOpen }: { app: AnyApp; onOpen: () => void }) {
  const s = useStatus(app);
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  const state = !s.online ? "offline" : s.syncing ? "syncing" : s.lastError ? "error" : "online";
  const { label, Icon, cls } = {
    offline: { label: "Hors ligne", Icon: CloudOff, cls: "bg-muted text-muted-foreground" },
    syncing: { label: "Envoi…", Icon: RefreshCw, cls: "bg-muted text-foreground" },
    error: { label: "Serveur injoignable", Icon: TriangleAlert, cls: "bg-destructive/10 text-destructive" },
    online: { label: "À jour", Icon: Cloud, cls: "bg-success-soft text-success-foreground" },
  }[state];
  return (
    <button
      type="button"
      onClick={onOpen}
      title="Synchronisation"
      aria-label={`Synchronisation : ${label}${s.pending ? `, ${s.pending} en attente` : ""}`}
      className="status flex items-center gap-1.5 rounded-full text-xs font-medium"
    >
      {s.pending > 0 && (
        <span className="status-pending inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-1 text-warning-foreground">
          <Ghost className="size-3.5" aria-hidden />
          {s.pending} en attente
        </span>
      )}
      <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-1", cls)}>
        <Icon className={cn("size-3.5", state === "syncing" && "animate-spin")} aria-hidden />
        {/* With changes waiting, the icon alone tells the state; keeps the header readable. */}
        <span className={s.pending > 0 ? "sr-only" : undefined}>{label}</span>
      </span>
    </button>
  );
}

function SpacesTab({ app, newPath, onClose }: { app: AnyApp; newPath: string; onClose: () => void }) {
  const navigate = useNavigate();
  const spaces = useRuntime(app, (r) => r.spaces);
  const currentId = useRuntime(app, (r) => r.currentId);
  const pending = useStatus(app).pending;
  return (
    <div className="grid gap-3">
      <ul className="divide-y overflow-hidden rounded-lg border">
        {spaces.map((sp) => (
          <li key={sp.id}>
            <button
              type="button"
              className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-accent"
              onClick={async () => {
                await app.select(sp.id);
                onClose();
                void navigate({ to: "/" });
              }}
            >
              <Check className={cn("size-4 shrink-0", sp.id === currentId ? "text-primary" : "invisible")} aria-hidden />
              <span className="min-w-0 flex-1 truncate font-medium">{sp.label || "Sans nom"}</span>
              <Badge variant="outline" className="shrink-0 font-normal">
                {sp.write ? "écriture" : "lecture"}
              </Badge>
            </button>
          </li>
        ))}
        {spaces.length === 0 && <li className="px-3 py-4 text-sm text-muted-foreground">Aucun espace sur ce téléphone.</li>}
      </ul>
      <Button
        onClick={() => {
          onClose();
          void navigate({ to: newPath });
        }}
      >
        <Plus aria-hidden />
        Nouveau
      </Button>
      {currentId && (
        <Button
          variant="ghost"
          className="text-destructive hover:text-destructive"
          onClick={async () => {
            const lost = pending > 0 ? ` ${pending} changement(s) pas encore envoyé(s) seront perdus.` : "";
            const ok = await confirmAction({
              title: "Retirer de ce téléphone ?",
              description: `« ${app.current?.label ?? ""} » reste sur le serveur et sur les autres téléphones.${lost}`,
              confirmLabel: "Retirer",
              destructive: true,
            });
            if (!ok) return;
            await app.leave(currentId);
            onClose();
            void navigate({ to: "/" });
          }}
        >
          Retirer l'espace actuel de ce téléphone
        </Button>
      )}
    </div>
  );
}

export function LinksPanel({ app, appName }: { app: AnyApp; appName: string }) {
  useRuntime(app, (s) => s.currentId);
  const links = app.links();
  if (!links) return <p className="text-sm text-muted-foreground">Choisissez d'abord un espace.</p>;
  const label = app.current?.label ?? appName;
  return (
    <div className="grid gap-3">
      {links.write && (
        <div className="rounded-lg border p-3">
          <h3 className="font-medium">Lien d'écriture</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Pour les personnes qui enregistrent des données. Il donne tous les droits : envoyez-le seulement à des personnes de confiance.
          </p>
          <ShareButton variant="default" className="mt-3 w-full" label="Envoyer le lien d'écriture" title={label} text={`${label} (${appName}) : ${links.write}`} />
        </div>
      )}
      <div className="rounded-lg border p-3">
        <h3 className="font-medium">Lien de lecture</h3>
        <p className="mt-1 text-sm text-muted-foreground">Pour consulter sans pouvoir modifier.</p>
        <ShareButton className="mt-3 w-full" label="Envoyer le lien de lecture" title={label} text={`${label} (${appName}), consultation : ${links.read}`} />
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Les données sont chiffrées sur le téléphone : le serveur ne peut pas les lire. Un lien envoyé ne peut pas être retiré. Si un lien circule trop,
        créez un nouvel espace.
      </p>
    </div>
  );
}

function SyncTab({ app }: { app: AnyApp }) {
  const s = useStatus(app);
  const rejected = useRuntime(app, (r) => r.rejected);
  const offline = useOfflineReady();
  const rows: [string, ReactNode][] = [
    ["Réseau", s.online ? "En ligne" : "Hors ligne"],
    ["En attente d'envoi", s.pending],
    ["Dernière synchro", s.lastSyncAt ? formatDateTime(s.lastSyncAt) : "Jamais"],
    ["Ouverture sans réseau", offline === "ready" ? "Prête" : offline === "preparing" ? "En préparation…" : "Non disponible"],
  ];
  return (
    <div className="grid gap-3">
      <dl className="divide-y rounded-lg border text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between gap-3 px-3 py-2.5">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="font-medium tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      {s.lastError && <p className="text-sm text-destructive">Dernière erreur : {s.lastError}</p>}
      {s.ignored > 0 && <p className="text-sm text-warning-foreground">{s.ignored} événement(s) illisible(s) ignoré(s).</p>}
      {rejected.length > 0 && <p className="text-sm text-destructive">{rejected.length} changement(s) refusé(s) par le serveur.</p>}
      <Button onClick={() => app.triggerSync()} disabled={!s.online}>
        <RefreshCw aria-hidden />
        Synchroniser maintenant
      </Button>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Tout est enregistré sur ce téléphone d'abord. Les changements marqués <Ghost className="inline size-3" aria-label="fantôme" /> partent dès
        qu'il y a du réseau.
      </p>
    </div>
  );
}

function BottomNav({ items }: { items: NavItem[] }) {
  return (
    <nav aria-label="Navigation principale" className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85">
      <ul className="mx-auto grid max-w-xl" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map(({ to, label, icon: Icon, search, exact }) => (
          <li key={`${to}-${label}`}>
            <Link
              to={to}
              search={search}
              activeOptions={{ exact: exact ?? false, includeSearch: !!search }}
              className="flex flex-col items-center gap-1 px-1 pt-2 pb-1 text-[11px] font-medium text-muted-foreground data-[status=active]:text-primary"
            >
              <Icon className="size-5" aria-hidden />
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * Full-page spinner. Used both while the app opens and as the router's pending
 * component, so the prerendered shell and the first client render are identical
 * (no hydration mismatch, whatever page is opened first).
 */
export function FullPageLoader() {
  return (
    <main className="flex min-h-dvh items-center justify-center text-muted-foreground">
      <Loader2 className="size-5 animate-spin" aria-label="Chargement" />
    </main>
  );
}

/**
 * Header with the space switcher and sync state, read-only banner, bottom
 * navigation, dialogs, and toasts. Renders children only once the runtime has
 * opened local storage, which happens in the browser only.
 */
export function AppShell({
  app,
  appName,
  icon: AppIcon,
  newPath = "/new",
  nav = [],
  children,
}: {
  app: AnyApp;
  appName: string;
  icon: LucideIcon;
  newPath?: string;
  nav?: NavItem[];
  children: ReactNode;
}) {
  const [menu, setMenu] = useState<MenuTab | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const ready = useRuntime(app, (s) => s.ready);
  const current = useRuntime(app, (s) => s.spaces.find((x) => x.id === s.currentId) ?? null);
  const offline = useOfflineReady();
  const router = useRouter();

  useEffect(() => {
    app.init().catch((e: unknown) => setFailed(String(e)));
    registerServiceWorker();
  }, [app]);

  // Load the code of every screen right away, so they all open offline even
  // if the network drops before the service worker has finished caching.
  useEffect(() => {
    if (!ready) return;
    for (const route of Object.values(router.routesById)) void router.loadRouteChunk(route)?.catch(() => undefined);
  }, [ready, router]);

  if (failed) {
    return (
      <main className="mx-auto max-w-xl px-4 py-10">
        <h1 className="text-xl font-semibold">{appName} ne peut pas démarrer</h1>
        <p className="mt-2 text-muted-foreground">
          Ce navigateur ne permet pas d'enregistrer des données (navigation privée ?). Ouvrez la page dans Chrome ou Firefox en mode normal.
        </p>
        <p className="mt-4 font-mono text-xs text-muted-foreground">{failed}</p>
      </main>
    );
  }
  if (!ready) return <FullPageLoader />;
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85">
        <div className="mx-auto flex h-14 max-w-xl items-center gap-2 px-3">
          <Link to="/" className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground" aria-label={`${appName}, accueil`}>
            <AppIcon className="size-4" aria-hidden />
          </Link>
          <button
            type="button"
            onClick={() => setMenu("spaces")}
            className="brand flex min-w-0 flex-1 flex-col items-start rounded-md px-1.5 py-1 text-left hover:bg-accent"
            aria-label="Changer d'espace"
          >
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{appName}</span>
            <span className="flex w-full items-center gap-1 text-sm font-semibold">
              <span className="truncate">{current?.label || "Aucun espace"}</span>
              <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            </span>
          </button>
          <SyncPill app={app} onOpen={() => setMenu("sync")} />
        </div>
        {current && !current.write && (
          <div className="banner border-t bg-muted/60">
            <p className="mx-auto flex max-w-xl items-center gap-2 px-4 py-1.5 text-xs text-muted-foreground">
              <Eye className="size-3.5" aria-hidden />
              Lecture seule : vous pouvez consulter, pas modifier.
            </p>
          </div>
        )}
        {current && offline === "preparing" && (
          <div className="border-t">
            <p className="mx-auto flex max-w-xl items-center gap-2 px-4 py-1.5 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              Préparation du mode hors ligne. Gardez le réseau quelques secondes.
            </p>
          </div>
        )}
      </header>

      <main className={cn("mx-auto max-w-xl px-4 pt-4", nav.length ? "pb-28" : "pb-10")}>{children}</main>

      {nav.length > 0 && <BottomNav items={nav} />}

      <Sheet open={menu !== null} onOpenChange={(o) => !o && setMenu(null)}>
        <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-xl px-4 pb-6">
          <SheetHeader className="px-0">
            <SheetTitle>{appName}</SheetTitle>
            <SheetDescription className="sr-only">Espaces, liens de partage et synchronisation</SheetDescription>
          </SheetHeader>
          <Tabs value={menu ?? "spaces"} onValueChange={(v) => setMenu(v as MenuTab)}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="spaces">Espaces</TabsTrigger>
              <TabsTrigger value="share">Partager</TabsTrigger>
              <TabsTrigger value="sync">Synchro</TabsTrigger>
            </TabsList>
            <TabsContent value="spaces" className="mt-3">
              <SpacesTab app={app} newPath={newPath} onClose={() => setMenu(null)} />
            </TabsContent>
            <TabsContent value="share" className="mt-3">
              <LinksPanel app={app} appName={appName} />
            </TabsContent>
            <TabsContent value="sync" className="mt-3">
              <SyncTab app={app} />
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>

      <DialogHost />
      <Toaster position="top-center" richColors closeButton offset={{ top: 64 }} mobileOffset={{ top: 64 }} />
    </div>
  );
}


