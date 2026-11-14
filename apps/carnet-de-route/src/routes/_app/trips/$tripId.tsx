import { formatDateTime, formatDuration, formatFCFA, formatLiters, formatNumber } from "@rezote/core";
import { act, askReason, BackLink, Empty, GhostMark, Section, ShareButton, Stat, useCanWrite } from "@rezote/core/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { KINDS, type Kind } from "../../../domain/events.ts";
import { corridorLabel, tripSummary } from "../../../domain/text.ts";
import { LastReport, mapLink, OpenStops, useNow } from "../../../components/trip.tsx";
import { app, useView } from "../../../runtime.ts";

export const Route = createFileRoute("/_app/trips/$tripId")({ component: TripDetail });

function cancel(itemId: string) {
  const reason = askReason();
  if (reason) void act(() => app.emit("route/item.cancelled", { itemId, reason }));
}

function TripDetail() {
  const { tripId } = Route.useParams();
  const view = useView();
  const now = useNow();
  const writable = useCanWrite(app);
  const trip = view.tripById.get(tripId);
  if (!trip) return <Empty>Trajet introuvable.</Empty>;
  const end = trip.ended?.at ?? now;
  const kinds = (Object.entries(trip.expensesByKind) as [Kind, number][]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const stops = (Object.entries(trip.stoppedByKind) as [Kind, number][]).filter(([, v]) => v > 0);
  return (
    <div>
      <BackLink />
      <h1>
        {trip.from} → {trip.to}
      </h1>
      <p className="muted">
        {corridorLabel(trip.corridor)} · {trip.cargo}
      </p>
      <p className="muted small">
        Départ {formatDateTime(trip.startAt)}
        {trip.ended ? ` · arrivée ${formatDateTime(trip.ended.at)} à ${trip.ended.place}` : " · en cours"} · durée {formatDuration(end - trip.startAt)}
      </p>
      {trip.warnings.map((w) => (
        <p className="warn" key={w}>
          ⚠️ {w}
        </p>
      ))}
      {!trip.ended && <LastReport trip={trip} now={now} />}
      <OpenStops trip={trip} now={now} />

      <div className="stats">
        <Stat label="Avances" value={formatFCFA(trip.totalAdvances)} />
        <Stat label="Dépenses" value={formatFCFA(trip.totalExpenses)} />
        <Stat label={trip.balance >= 0 ? "Reste chez le chauffeur" : "Dû au chauffeur"} value={formatFCFA(Math.abs(trip.balance))} tone={trip.balance < 0 ? "bad" : undefined} />
        <Stat label="Consommation estimée" value={trip.consumption !== null ? `${Math.round(trip.consumption)} L/100 km` : "–"} />
      </div>

      <div className="btn-row">
        <ShareButton className="btn primary" label="Partager le résumé" text={() => tripSummary(view, trip)} />
        {writable && !trip.ended && (
          <Link className="btn" to="/advance/$tripId" params={{ tripId: trip.id }}>
            + Avance
          </Link>
        )}
        {writable && !trip.ended && (
          <Link className="btn" to="/end/$tripId" params={{ tripId: trip.id }}>
            🏁 Arrivée
          </Link>
        )}
      </div>

      <Section title="Dépenses par type">
        {kinds.length === 0 ? (
          <Empty>Aucune dépense.</Empty>
        ) : (
          <table>
            <tbody>
              {kinds.map(([k, v]) => (
                <tr key={k}>
                  <td>
                    {KINDS[k].emoji} {KINDS[k].label}
                  </td>
                  <td className="num">{formatFCFA(v)}</td>
                </tr>
              ))}
              {trip.fuelCl > 0 && (
                <tr>
                  <td className="muted">dont carburant</td>
                  <td className="num muted">{formatLiters(trip.fuelCl)}</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </Section>

      {stops.length > 0 && (
        <Section title="Temps d'arrêt">
          <table>
            <tbody>
              {stops.map(([k, v]) => (
                <tr key={k}>
                  <td>
                    {KINDS[k].emoji} {KINDS[k].label}
                  </td>
                  <td className="num">{formatDuration(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      <Section title="Chronologie">
        <ul className="timeline">
          {trip.timeline.map((item) => {
            if (item.kind === "start")
              return (
                <li key="start">
                  <strong>
                    Départ de {trip.from}
                    <GhostMark app={app} id={item.eventId} />
                  </strong>
                  <div className="muted small">
                    {formatDateTime(item.at)} · avance {formatFCFA(trip.advance)}
                  </div>
                </li>
              );
            if (item.kind === "end")
              return (
                <li key="end">
                  <strong>
                    Arrivée à {item.place}
                    <GhostMark app={app} id={item.eventId} />
                  </strong>
                  <div className="muted small">{formatDateTime(item.at)}</div>
                </li>
              );
            if (item.kind === "advance") {
              const a = item.advance;
              return (
                <li key={a.id} className={a.cancelled ? "muted-item cancelled" : ""}>
                  <strong>
                    Avance {a.method === "cash" ? "en espèces" : "par mobile money"} : {formatFCFA(a.amount)}
                    <GhostMark app={app} id={a.eventId} />
                  </strong>
                  <div className="muted small">
                    {formatDateTime(a.at)}
                    {a.cancelled && ` · annulé : ${a.cancelled}`}
                  </div>
                  {writable && !a.cancelled && (
                    <button type="button" className="btn small danger" onClick={() => cancel(a.id)}>
                      Annuler
                    </button>
                  )}
                </li>
              );
            }
            const e = item.entry;
            return (
              <li key={e.id} className={e.cancelled ? "muted-item" : ""}>
                <div className={e.cancelled ? "cancelled" : ""}>
                  <strong>
                    {KINDS[e.kind].emoji} {KINDS[e.kind].label} · {e.place}
                    {e.amount ? ` · ${formatFCFA(e.amount)}` : ""}
                    <GhostMark app={app} id={[e.eventId, e.resumeEventId]} />
                  </strong>
                  <div className="muted small">
                    {formatDateTime(e.at)}
                    {e.volumeCl ? ` · ${formatLiters(e.volumeCl)} à ${formatNumber(e.pricePerLiter ?? 0)} F/L` : ""}
                    {e.odometerKm !== undefined ? ` · ${formatNumber(e.odometerKm)} km` : ""}
                    {e.stoppedMs !== null ? ` · arrêt ${formatDuration(e.stoppedMs)}` : e.resumable && !e.cancelled ? " · en cours" : ""}
                  </div>
                  {e.note && <div className="small">{e.note}</div>}
                  {e.position && (
                    <a className="small" href={mapLink(e.position)} target="_blank" rel="noreferrer noopener">
                      Position (±{e.position.accuracyM} m)
                    </a>
                  )}
                </div>
                {e.cancelled && <div className="bad small">Annulé : {e.cancelled}</div>}
                {writable && !e.cancelled && (
                  <button type="button" className="btn small danger" onClick={() => cancel(e.id)}>
                    Annuler
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </Section>
    </div>
  );
}
