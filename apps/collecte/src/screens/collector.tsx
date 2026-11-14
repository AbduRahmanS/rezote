import { formatDate, formatKg, formatTime } from "@rezote/core";
import { Empty, GhostMark, Section, Stat } from "@rezote/core/ui";
import { app } from "../runtime.ts";
import { useView } from "./common.tsx";

const startOfDay = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

export function CollectorHome({ collectorId }: { collectorId: string }) {
  const view = useView();
  const me = view.collectorById.get(collectorId);
  const mine = [...view.weighingById.values()].filter((w) => w.collectorId === collectorId).sort((a, b) => b.at - a.at);
  const today = mine.filter((w) => w.at >= startOfDay() && !w.cancelled);
  const open = mine.filter((w) => !w.closedAt && !w.cancelled);
  const pending = mine.filter((w) => [w.eventId, ...w.bundles.map((b) => b.eventId)].some((id) => app.isGhost(id))).length;

  if (!me) return <Empty>Collecteur introuvable. Choisissez votre nom dans « Rôle ».</Empty>;
  return (
    <div>
      <h1>Bonjour {me.name.split(" ")[0]}</h1>
      <p class="muted">
        Code {me.code} · {view.campaign!.name}
      </p>
      <div class="stats">
        <Stat label="Pesé aujourd'hui" value={formatKg(today.reduce((s, w) => s + w.totalG, 0))} />
        <Stat label="Reçus aujourd'hui" value={today.length} />
        <Stat label="Bâches aujourd'hui" value={today.reduce((s, w) => s + w.bundleCount, 0)} />
        <Stat label="Pas encore envoyés" value={pending ? `👻 ${pending}` : "0"} tone={pending ? "warn" : "ok"} />
      </div>

      <a class="btn primary block" href="#/pick">
        ⚖️ Nouvelle pesée
      </a>

      {open.length > 0 && (
        <Section title="Pesées en cours">
          <ul class="list">
            {open.map((w) => (
              <li key={w.id}>
                <a class="row" href={`#/weighing/${w.id}`}>
                  <span class="row-main">
                    <span class="row-title">{view.farmerById.get(w.farmerId)?.name ?? "?"}</span>
                    <span class="row-sub">
                      {w.receipt} · {w.bundleCount} bâches
                    </span>
                  </span>
                  <span class="row-end">{formatKg(w.totalG)}</span>
                </a>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Mes reçus">
        {mine.length === 0 && <Empty>Aucune pesée pour le moment.</Empty>}
        <ul class="list">
          {mine.slice(0, 30).map((w) => (
            <li key={w.id}>
              <a class={`row ${w.cancelled ? "cancelled" : ""}`} href={`#/receipt/${w.id}`}>
                <span class="row-main">
                  <span class="row-title">
                    {view.farmerById.get(w.farmerId)?.name ?? "?"}
                    <GhostMark app={app} id={[w.eventId, ...w.bundles.map((b) => b.eventId)]} />
                  </span>
                  <span class="row-sub">
                    {w.receipt} · {formatDate(w.at)} {formatTime(w.at)}
                  </span>
                </span>
                <span class="row-end">{formatKg(w.totalG)}</span>
              </a>
            </li>
          ))}
        </ul>
      </Section>

      <div class="btn-row">
        <a class="btn" href="#/farmers">
          Producteurs
        </a>
        <a class="btn" href="#/role">
          Changer de rôle
        </a>
      </div>
    </div>
  );
}
