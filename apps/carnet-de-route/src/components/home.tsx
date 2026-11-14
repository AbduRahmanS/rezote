import { formatDuration, formatFCFA, formatShortDate, formatTime } from "@rezote/core";
import { Empty, GhostMark, Section, ShareButton, Stat, useCanWrite, useGhosts } from "@rezote/core/react";
import { Link } from "@tanstack/react-router";
import { KINDS, type Kind } from "../domain/events.ts";
import { corridorLabel, tripSummary } from "../domain/text.ts";
import { app, useGps, useView } from "../runtime.ts";
import { LastReport, OpenStops, useNow } from "./trip.tsx";

const QUICK: Kind[] = ["fuel", "checkpoint", "weighbridge", "customs", "border", "convoy", "breakdown", "repair", "rest", "meal", "toll", "loading", "unloading", "other"];

export function DriverHome() {
  const view = useView();
  const now = useNow();
  const gps = useGps();
  const ghosts = useGhosts(app);
  const trip = view.openTrips[0];
  if (!trip) {
    return (
      <div>
        <div className="hero">
          <div className="big">🅿️</div>
          <h1>Pas de trajet en cours</h1>
          <p className="muted">Le propriétaire démarre le trajet, ou vous pouvez le faire ici.</p>
        </div>
        <Link className="btn primary block" to="/start">
          Démarrer un trajet
        </Link>
        <Link className="btn block" to="/trips">
          Voir les trajets passés
        </Link>
      </div>
    );
  }
  const recent = trip.entries.slice(-5).reverse();
  return (
    <div>
      <h1>
        {trip.from} → {trip.to}
      </h1>
      <p className="muted">
        En route depuis {formatDuration(now - trip.startAt)} · {trip.cargo}
      </p>
      <div className="stats">
        <Stat label={trip.balance < 0 ? "Avancé par vous" : "Reste de l'avance"} value={formatFCFA(trip.balance)} tone={trip.balance < 0 ? "bad" : undefined} />
        <Stat label="Dépenses" value={formatFCFA(trip.totalExpenses)} />
      </div>

      <OpenStops trip={trip} now={now} />

      <div className="grid-buttons">
        {QUICK.map((k) => (
          <Link key={k} className="btn" to="/entry/$tripId/$kind" params={{ tripId: trip.id, kind: k }}>
            <span className="emoji">{KINDS[k].emoji}</span>
            {KINDS[k].label}
          </Link>
        ))}
      </div>

      <Section title="Dernières saisies">
        {recent.length === 0 && <Empty>Rien pour le moment.</Empty>}
        <ul className="list">
          {recent.map((e) => (
            <li key={e.id}>
              <div className={`row ${e.cancelled ? "cancelled" : ""} ${ghosts.has(e.eventId) ? "is-ghost" : ""}`}>
                <span className="row-main">
                  <span className="row-title">
                    {KINDS[e.kind].emoji} {KINDS[e.kind].label} · {e.place}
                    <GhostMark app={app} id={[e.eventId, e.resumeEventId]} />
                  </span>
                  <span className="row-sub">{formatTime(e.at)}</span>
                </span>
                <span className="row-end">{e.amount ? formatFCFA(e.amount) : ""}</span>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <div className="btn-row">
        <Link className="btn" to="/trips/$tripId" params={{ tripId: trip.id }}>
          Tout le trajet
        </Link>
        <Link className="btn" to="/end/$tripId" params={{ tripId: trip.id }}>
          🏁 Arrivée
        </Link>
      </div>
      <p className="muted small center">
        GPS : {gps ? "activé" : "désactivé"} · <Link to="/settings">réglages</Link>
      </p>
    </div>
  );
}

export function OwnerHome() {
  const view = useView();
  const now = useNow();
  const writable = useCanWrite(app);
  const current = view.openTrips[0];
  const past = view.trips.filter((t) => t.ended);
  return (
    <div>
      <h1>
        {view.truck!.plate}
        <GhostMark app={app} id={view.truck!.eventId} />
      </h1>
      <p className="muted">{view.truck!.name}</p>
      {view.warnings.map((w) => (
        <p className="warn" key={w}>
          ⚠️ {w}
        </p>
      ))}

      {current ? (
        <Section title="Trajet en cours">
          <Link className="row" to="/trips/$tripId" params={{ tripId: current.id }}>
            <span className="row-main">
              <span className="row-title">
                {current.from} → {current.to}
              </span>
              <span className="row-sub">
                {corridorLabel(current.corridor)} · depuis {formatDuration(now - current.startAt)}
              </span>
            </span>
            <span className="muted">›</span>
          </Link>
          <LastReport trip={current} now={now} />
          <OpenStops trip={current} now={now} />
          <div className="stats">
            <Stat label="Avances" value={formatFCFA(current.totalAdvances)} />
            <Stat label="Dépenses" value={formatFCFA(current.totalExpenses)} />
            <Stat
              label={current.balance >= 0 ? "Reste chez le chauffeur" : "Dû au chauffeur"}
              value={formatFCFA(Math.abs(current.balance))}
              tone={current.balance < 0 ? "bad" : undefined}
            />
            <Stat label="Arrêts" value={formatDuration(Object.values(current.stoppedByKind).reduce((a, b) => a + (b ?? 0), 0))} />
          </div>
          <div className="btn-row">
            {writable && (
              <Link className="btn" to="/advance/$tripId" params={{ tripId: current.id }}>
                + Avance
              </Link>
            )}
            <ShareButton label="Partager le résumé" text={() => tripSummary(view, current)} />
          </div>
        </Section>
      ) : (
        <div className="card center">
          <p>Pas de trajet en cours.</p>
          {writable && (
            <Link className="btn primary block" to="/start">
              Démarrer un trajet
            </Link>
          )}
        </div>
      )}

      <Section title="Trajets terminés">
        {past.length === 0 && <Empty>Aucun trajet terminé.</Empty>}
        <ul className="list">
          {past.map((t) => (
            <li key={t.id}>
              <Link className="row" to="/trips/$tripId" params={{ tripId: t.id }}>
                <span className="row-main">
                  <span className="row-title">
                    {t.from} → {t.to}
                  </span>
                  <span className="row-sub">
                    {formatShortDate(t.startAt)} · {formatDuration(t.ended!.at - t.startAt)}
                  </span>
                </span>
                <span className="row-end">{formatFCFA(t.totalExpenses)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>
      <p className="center small">
        <Link to="/settings">Réglages de ce téléphone</Link>
      </p>
    </div>
  );
}
