import { formatDate, formatFCFA, formatKg, formatTime, formatTonnes } from "@rezote/core";
import { Empty, GhostMark, Section, Stat, useCanWrite, useGhosts } from "@rezote/core/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { pct } from "../../components/format.ts";
import { app, useRole, useView } from "../../runtime.ts";

export const Route = createFileRoute("/_app/")({ component: Home });

function Home() {
  const role = useRole();
  return role?.kind === "collector" ? <CollectorHome collectorId={role.collectorId} /> : <Dashboard />;
}

function Dashboard() {
  const view = useView();
  const writable = useCanWrite(app);
  const { totals, campaign } = view;
  return (
    <div>
      <h1>{campaign!.name}</h1>
      <p className="muted">
        {campaign!.cooperative} · {campaign!.product} · {campaign!.grades.map((g) => `${g.label} ${g.pricePerKg} F/kg`).join(" · ")}
      </p>

      <div className="stats">
        <Stat label="Pesé au village" value={formatTonnes(totals.weighedG)} />
        <Stat label="Reste au magasin" value={formatTonnes(totals.inStoreG)} tone={totals.inStoreG < 0 ? "bad" : undefined} />
        <Stat label="Montant brut" value={formatFCFA(totals.gross)} />
        <Stat label="Reste à payer" value={formatFCFA(totals.balance)} tone={totals.balance > 0 ? "warn" : "ok"} />
        <Stat
          label="Écart usine"
          value={totals.gapPct === null ? "–" : `${formatKg(totals.gapG)} (${pct(totals.gapPct)})`}
          tone={totals.gapPct !== null && totals.gapPct < -1 ? "bad" : undefined}
        />
        <Stat label="Alertes" value={view.flags.length} tone={view.flags.length ? "warn" : "ok"} />
      </div>

      <div className="grid-buttons">
        <Link className="btn" to="/farmers">
          <span className="emoji">👨🏾‍🌾</span>Producteurs
        </Link>
        <Link className="btn" to="/collectors">
          <span className="emoji">⚖️</span>Collecteurs
        </Link>
        <Link className="btn" to="/loads">
          <span className="emoji">🚚</span>Chargements
        </Link>
        <Link className="btn" to="/flags">
          <span className="emoji">⚠️</span>Alertes
        </Link>
        <Link className="btn" to="/export">
          <span className="emoji">📄</span>Export
        </Link>
        <Link className="btn" to="/role">
          <span className="emoji">👤</span>Rôle
        </Link>
      </div>

      <Section title="Par village">
        {view.byVillage.length === 0 ? (
          <Empty>Aucun producteur pour le moment.</Empty>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Village</th>
                <th className="num">Prod.</th>
                <th className="num">Poids</th>
                <th className="num">Reste à payer</th>
              </tr>
            </thead>
            <tbody>
              {view.byVillage.map((v) => (
                <tr key={v.village}>
                  <td>{v.village}</td>
                  <td className="num">{v.farmers}</td>
                  <td className="num">{formatKg(v.totalG)}</td>
                  <td className="num">{formatFCFA(v.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title="Par collecteur">
        <table>
          <tbody>
            {view.byCollector.map((c) => (
              <tr key={c.collector.id}>
                <td>
                  {c.collector.name} ({c.collector.code})
                </td>
                <td className="num">{c.weighings} reçus</td>
                <td className="num">{c.bundles} bâches</td>
                <td className="num">{formatKg(c.totalG)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
      {!writable && <p className="muted small">Vue de consultation.</p>}
    </div>
  );
}

const startOfDay = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

function CollectorHome({ collectorId }: { collectorId: string }) {
  const view = useView();
  const ghosts = useGhosts(app);
  const me = view.collectorById.get(collectorId);
  const mine = [...view.weighingById.values()].filter((w) => w.collectorId === collectorId).sort((a, b) => b.at - a.at);
  const today = mine.filter((w) => w.at >= startOfDay() && !w.cancelled);
  const open = mine.filter((w) => !w.closedAt && !w.cancelled);
  const pending = mine.filter((w) => [w.eventId, ...w.bundles.map((b) => b.eventId)].some((id) => ghosts.has(id))).length;

  if (!me) return <Empty>Collecteur introuvable. Choisissez votre nom dans « Rôle ».</Empty>;
  return (
    <div>
      <h1>Bonjour {me.name.split(" ")[0]}</h1>
      <p className="muted">
        Code {me.code} · {view.campaign!.name}
      </p>
      <div className="stats">
        <Stat label="Pesé aujourd'hui" value={formatKg(today.reduce((s, w) => s + w.totalG, 0))} />
        <Stat label="Reçus aujourd'hui" value={today.length} />
        <Stat label="Bâches aujourd'hui" value={today.reduce((s, w) => s + w.bundleCount, 0)} />
        <Stat label="Pas encore envoyés" value={pending ? `👻 ${pending}` : "0"} tone={pending ? "warn" : "ok"} />
      </div>

      <Link className="btn primary block" to="/farmers" search={{ pick: true }}>
        ⚖️ Nouvelle pesée
      </Link>

      {open.length > 0 && (
        <Section title="Pesées en cours">
          <ul className="list">
            {open.map((w) => (
              <li key={w.id}>
                <Link className="row" to="/weighings/$weighingId" params={{ weighingId: w.id }}>
                  <span className="row-main">
                    <span className="row-title">{view.farmerById.get(w.farmerId)?.name ?? "?"}</span>
                    <span className="row-sub">
                      {w.receipt} · {w.bundleCount} bâches
                    </span>
                  </span>
                  <span className="row-end">{formatKg(w.totalG)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Mes reçus">
        {mine.length === 0 && <Empty>Aucune pesée pour le moment.</Empty>}
        <ul className="list">
          {mine.slice(0, 30).map((w) => (
            <li key={w.id}>
              <Link className={`row ${w.cancelled ? "cancelled" : ""}`} to="/receipts/$weighingId" params={{ weighingId: w.id }}>
                <span className="row-main">
                  <span className="row-title">
                    {view.farmerById.get(w.farmerId)?.name ?? "?"}
                    <GhostMark app={app} id={[w.eventId, ...w.bundles.map((b) => b.eventId)]} />
                  </span>
                  <span className="row-sub">
                    {w.receipt} · {formatDate(w.at)} {formatTime(w.at)}
                  </span>
                </span>
                <span className="row-end">{formatKg(w.totalG)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      <div className="btn-row">
        <Link className="btn" to="/farmers">
          Producteurs
        </Link>
        <Link className="btn" to="/role">
          Changer de rôle
        </Link>
      </div>
    </div>
  );
}
