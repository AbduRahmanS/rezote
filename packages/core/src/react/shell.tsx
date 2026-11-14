import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { formatAgo, formatDateTime } from "../format.ts";
import { useRuntime, useStatus, type AnyApp } from "./hooks.ts";
import { registerServiceWorker } from "./pwa.ts";
import { ShareButton } from "./widgets.tsx";

/** Connection state, pending ghosts, and last sync. Tap to sync now. */
export function StatusBar({ app }: { app: AnyApp }) {
  const s = useStatus(app);
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  const state = !s.online ? "offline" : s.syncing ? "syncing" : s.lastError ? "error" : "online";
  const label = { offline: "Hors ligne", syncing: "Synchronisation…", error: "Serveur injoignable", online: "En ligne" }[state];
  return (
    <button type="button" className={`status status-${state}`} onClick={() => app.triggerSync()} title="Synchroniser maintenant">
      <span className="dot" />
      <span>{label}</span>
      {s.pending > 0 && <span className="status-pending">👻 {s.pending} en attente</span>}
      <span className="status-last">{s.lastSyncAt ? `Synchro ${formatAgo(s.lastSyncAt)}` : "Jamais synchronisé"}</span>
    </button>
  );
}

export function LinksPanel({ app, appName }: { app: AnyApp; appName: string }) {
  useRuntime(app, (s) => s.currentId);
  const links = app.links();
  if (!links) return null;
  const label = app.current?.label ?? appName;
  return (
    <div className="links">
      {links.write && (
        <div className="card">
          <h3>Lien d'écriture</h3>
          <p>Pour les personnes qui enregistrent des données. Il donne tous les droits : ne l'envoyez qu'à des personnes de confiance.</p>
          <ShareButton className="btn primary" label="Envoyer le lien d'écriture" title={label} text={`${label} (${appName}) : ${links.write}`} />
        </div>
      )}
      <div className="card">
        <h3>Lien de lecture</h3>
        <p>Pour consulter sans pouvoir modifier.</p>
        <ShareButton label="Envoyer le lien de lecture" title={label} text={`${label} (${appName}), consultation : ${links.read}`} />
      </div>
      <p className="muted small">
        Les données sont chiffrées sur le téléphone : le serveur ne peut pas les lire. Un lien envoyé ne peut pas être retiré. Si un lien
        circule trop, créez un nouvel espace.
      </p>
    </div>
  );
}

function Menu({ app, appName, newPath, onClose }: { app: AnyApp; appName: string; newPath: string; onClose: () => void }) {
  const [tab, setTab] = useState<"spaces" | "share" | "sync">("spaces");
  const navigate = useNavigate();
  const s = useStatus(app);
  const spaces = useRuntime(app, (r) => r.spaces);
  const currentId = useRuntime(app, (r) => r.currentId);
  const rejected = useRuntime(app, (r) => r.rejected);
  return (
    <div className="menu-backdrop" onClick={onClose}>
      <div className="menu" onClick={(e) => e.stopPropagation()}>
        <div className="tabs">
          {(["spaces", "share", "sync"] as const).map((t) => (
            <button type="button" key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>
              {{ spaces: "Espaces", share: "Partager", sync: "Synchro" }[t]}
            </button>
          ))}
        </div>
        {tab === "spaces" && (
          <div>
            <ul className="list">
              {spaces.map((sp) => (
                <li key={sp.id}>
                  <button
                    type="button"
                    className={`row ${sp.id === currentId ? "selected" : ""}`}
                    onClick={async () => {
                      await app.select(sp.id);
                      onClose();
                      void navigate({ to: "/" });
                    }}
                  >
                    <span>{sp.label || "Sans nom"}</span>
                    <span className="muted small">{sp.write ? "écriture" : "lecture"}</span>
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="btn primary block"
              onClick={() => {
                onClose();
                void navigate({ to: newPath });
              }}
            >
              + Nouveau
            </button>
            {currentId && (
              <button
                type="button"
                className="btn danger block"
                onClick={async () => {
                  const pending = s.pending > 0 ? ` ${s.pending} changement(s) pas encore envoyé(s) seront perdus.` : "";
                  if (!confirm(`Retirer « ${app.current?.label ?? ""} » de ce téléphone ?${pending}`)) return;
                  await app.leave(currentId);
                  onClose();
                  void navigate({ to: "/" });
                }}
              >
                Retirer de ce téléphone
              </button>
            )}
          </div>
        )}
        {tab === "share" && <LinksPanel app={app} appName={appName} />}
        {tab === "sync" && (
          <div className="card">
            <p>
              État : <strong>{s.online ? "en ligne" : "hors ligne"}</strong>
            </p>
            <p>Changements en attente : {s.pending}</p>
            <p>Dernière synchro réussie : {s.lastSyncAt ? formatDateTime(s.lastSyncAt) : "jamais"}</p>
            {s.lastError && <p className="bad">Dernière erreur : {s.lastError}</p>}
            {s.ignored > 0 && <p className="warn">Événements ignorés (illisibles ou invalides) : {s.ignored}</p>}
            {rejected.length > 0 && <p className="bad">Refusés par le serveur : {rejected.length}</p>}
            <button type="button" className="btn primary block" onClick={() => app.triggerSync()}>
              Synchroniser maintenant
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Header, status bar, read-only banner, and menu. Renders children only once the
 * runtime has opened local storage, which happens in the browser only.
 */
export function AppShell({ app, appName, newPath = "/new", children }: { app: AnyApp; appName: string; newPath?: string; children: ReactNode }) {
  const [menu, setMenu] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const ready = useRuntime(app, (s) => s.ready);
  const current = useRuntime(app, (s) => s.spaces.find((x) => x.id === s.currentId) ?? null);

  useEffect(() => {
    app.init().catch((e: unknown) => setFailed(String(e)));
    registerServiceWorker();
  }, [app]);

  if (failed) {
    return (
      <main className="main">
        <h1>{appName} ne peut pas démarrer</h1>
        <p>Ce navigateur ne permet pas d'enregistrer des données (navigation privée ?). Ouvrez la page dans Chrome ou Firefox en mode normal.</p>
        <p className="muted small">{failed}</p>
      </main>
    );
  }
  if (!ready) {
    return (
      <main className="main center">
        <p className="muted">Chargement…</p>
      </main>
    );
  }
  return (
    <div className="shell">
      <header className="header">
        <Link to="/" className="brand">
          <span className="brand-app">{appName}</span>
          {current && <span className="brand-space">{current.label}</span>}
        </Link>
        <button type="button" className="icon-btn" aria-label="Menu" onClick={() => setMenu(true)}>
          ☰
        </button>
      </header>
      <StatusBar app={app} />
      {current && !current.write && <div className="banner">Lecture seule : vous pouvez consulter, pas modifier.</div>}
      <main className="main">{children}</main>
      {menu && <Menu app={app} appName={appName} newPath={newPath} onClose={() => setMenu(false)} />}
    </div>
  );
}

export function BackLink({ to = "/", params, label = "← Retour" }: { to?: string; params?: Record<string, string>; label?: string }) {
  return (
    <p>
      <Link to={to} params={params}>
        {label}
      </Link>
    </p>
  );
}
