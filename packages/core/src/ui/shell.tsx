import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import { formatAgo, formatDateTime } from "../format.ts";
import { ShareButton, type AnyApp } from "./widgets.tsx";

/** Connection state, pending ghosts, and last sync. Tap to sync now. */
export function StatusBar({ app }: { app: AnyApp }) {
  const s = app.status.value;
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  const state = !s.online ? "offline" : s.syncing ? "syncing" : s.lastError ? "error" : "online";
  const label = { offline: "Hors ligne", syncing: "Synchronisation…", error: "Serveur injoignable", online: "En ligne" }[state];
  return (
    <button type="button" class={`status status-${state}`} onClick={() => app.triggerSync()} title="Synchroniser maintenant">
      <span class="dot" />
      <span>{label}</span>
      {s.pending > 0 && (
        <span class="status-pending">
          👻 {s.pending} en attente
        </span>
      )}
      <span class="status-last">{s.lastSyncAt ? `Synchro ${formatAgo(s.lastSyncAt)}` : "Jamais synchronisé"}</span>
    </button>
  );
}

export function LinksPanel({ app, appName }: { app: AnyApp; appName: string }) {
  const links = app.links();
  if (!links) return null;
  const label = app.current.value?.label ?? appName;
  return (
    <div class="links">
      {links.write && (
        <div class="card">
          <h3>Lien d'écriture</h3>
          <p>Pour les personnes qui enregistrent des données. Il donne tous les droits : ne l'envoyez qu'à des personnes de confiance.</p>
          <ShareButton class="btn primary" label="Envoyer le lien d'écriture" title={label} text={`${label} (${appName}) : ${links.write}`} />
        </div>
      )}
      <div class="card">
        <h3>Lien de lecture</h3>
        <p>Pour consulter sans pouvoir modifier.</p>
        <ShareButton class="btn" label="Envoyer le lien de lecture" title={label} text={`${label} (${appName}), consultation : ${links.read}`} />
      </div>
      <p class="muted small">
        Les données sont chiffrées sur le téléphone : le serveur ne peut pas les lire. Un lien envoyé ne peut pas être retiré. Si un lien
        circule trop, créez un nouvel espace.
      </p>
    </div>
  );
}

function Menu({ app, appName, onNew, onClose }: { app: AnyApp; appName: string; onNew: () => void; onClose: () => void }) {
  const [tab, setTab] = useState<"spaces" | "share" | "sync">("spaces");
  const s = app.status.value;
  const rejected = app.rejected.value;
  return (
    <div class="menu-backdrop" onClick={onClose}>
      <div class="menu" onClick={(e) => e.stopPropagation()}>
        <div class="tabs">
          <button type="button" class={tab === "spaces" ? "active" : ""} onClick={() => setTab("spaces")}>
            Espaces
          </button>
          <button type="button" class={tab === "share" ? "active" : ""} onClick={() => setTab("share")}>
            Partager
          </button>
          <button type="button" class={tab === "sync" ? "active" : ""} onClick={() => setTab("sync")}>
            Synchro
          </button>
        </div>
        {tab === "spaces" && (
          <div>
            <ul class="list">
              {app.spaces.value.map((sp) => (
                <li key={sp.id}>
                  <button
                    type="button"
                    class={`row ${sp.id === app.currentId.value ? "selected" : ""}`}
                    onClick={async () => {
                      await app.select(sp.id);
                      location.hash = "#/";
                      onClose();
                    }}
                  >
                    <span>{sp.label || "Sans nom"}</span>
                    <span class="muted small">{sp.write ? "écriture" : "lecture"}</span>
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              class="btn primary block"
              onClick={() => {
                onNew();
                onClose();
              }}
            >
              + Nouveau
            </button>
            {app.currentId.value && (
              <button
                type="button"
                class="btn danger block"
                onClick={async () => {
                  const pending = s.pending > 0 ? ` ${s.pending} changement(s) pas encore synchronisé(s) seront perdus.` : "";
                  if (!confirm(`Retirer « ${app.current.value?.label ?? ""} » de ce téléphone ?${pending}`)) return;
                  await app.leave(app.currentId.value!);
                  location.hash = "#/";
                  onClose();
                }}
              >
                Retirer de ce téléphone
              </button>
            )}
          </div>
        )}
        {tab === "share" && <LinksPanel app={app} appName={appName} />}
        {tab === "sync" && (
          <div class="card">
            <p>
              État : <strong>{s.online ? "en ligne" : "hors ligne"}</strong>
            </p>
            <p>Changements en attente : {s.pending}</p>
            <p>Dernière synchro réussie : {s.lastSyncAt ? formatDateTime(s.lastSyncAt) : "jamais"}</p>
            {s.lastError && <p class="bad">Dernière erreur : {s.lastError}</p>}
            {s.ignored > 0 && <p class="warn">Événements ignorés (illisibles ou invalides) : {s.ignored}</p>}
            {rejected.length > 0 && <p class="bad">Refusés par le serveur : {rejected.length}</p>}
            <button type="button" class="btn primary block" onClick={() => app.triggerSync()}>
              Synchroniser maintenant
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function AppShell({
  app,
  appName,
  title,
  onNew,
  children,
}: {
  app: AnyApp;
  appName: string;
  title?: string;
  onNew: () => void;
  children: ComponentChildren;
}) {
  const [menu, setMenu] = useState(false);
  const current = app.current.value;
  return (
    <div class="shell">
      <header class="header">
        <a href="#/" class="brand">
          <span class="brand-app">{appName}</span>
          {current && <span class="brand-space">{title ?? current.label}</span>}
        </a>
        <button type="button" class="icon-btn" aria-label="Menu" onClick={() => setMenu(true)}>
          ☰
        </button>
      </header>
      <StatusBar app={app} />
      {current && !current.write && <div class="banner">Lecture seule : vous pouvez consulter, pas modifier.</div>}
      <main class="main">{children}</main>
      {menu && <Menu app={app} appName={appName} onNew={onNew} onClose={() => setMenu(false)} />}
    </div>
  );
}
