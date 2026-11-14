import {
  formatAgo,
  formatDateTime,
  formatDuration,
  formatFCFA,
  formatLiters,
  formatNumber,
  formatShortDate,
  formatTime,
  navigate,
  parseFCFA,
  type PayloadOf,
} from "@rezote/core";
import { askReason, Empty, Field, GhostMark, Section, ShareButton, Stat } from "@rezote/core/ui";
import { useEffect, useState } from "preact/hooks";
import { CORRIDORS, KINDS, type Kind, type RouteEvents } from "../domain/events.ts";
import type { Entry, Trip } from "../domain/project.ts";
import { corridorLabel, tripSummary } from "../domain/text.ts";
import { app, newId } from "../runtime.ts";
import { OpenStops } from "./driver.tsx";
import { act, BackLink, useView } from "./common.tsx";

function useNow() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function mapLink(p: NonNullable<Entry["position"]>) {
  return `https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lng}#map=13/${p.lat}/${p.lng}`;
}

function LastReport({ trip, now }: { trip: Trip; now: number }) {
  const view = useView();
  const last = trip.lastReport;
  return (
    <div class="card">
      <h3>Dernière nouvelle</h3>
      {last ? (
        <p>
          {KINDS[last.kind].emoji} <strong>{last.place}</strong>, {formatShortDate(last.at)} à {formatTime(last.at)} ({formatAgo(last.at, now)})
          {last.position && (
            <>
              {" · "}
              <a href={mapLink(last.position)} target="_blank" rel="noreferrer noopener">
                carte (±{last.position.accuracyM} m)
              </a>
            </>
          )}
        </p>
      ) : (
        <p class="muted">Aucune saisie depuis le départ.</p>
      )}
      <p class="muted small">
        Téléphone du chauffeur synchronisé : {view.driverLastSync ? formatAgo(view.driverLastSync, now) : "pas encore"}
      </p>
    </div>
  );
}

export function OwnerHome() {
  const view = useView();
  const now = useNow();
  const current = view.openTrips[0];
  const past = view.trips.filter((t) => t.ended);
  const writable = app.canWrite();
  return (
    <div>
      <h1>
        {view.truck!.plate}
        <GhostMark app={app} id={view.truck!.eventId} />
      </h1>
      <p class="muted">{view.truck!.name}</p>
      {view.warnings.map((w) => (
        <p class="warn" key={w}>
          ⚠️ {w}
        </p>
      ))}

      {current ? (
        <Section title="Trajet en cours">
          <a class="row" href={`#/trip/${current.id}`}>
            <span class="row-main">
              <span class="row-title">
                {current.from} → {current.to}
              </span>
              <span class="row-sub">
                {corridorLabel(current.corridor)} · depuis {formatDuration(now - current.startAt)}
              </span>
            </span>
            <span class="muted">›</span>
          </a>
          <LastReport trip={current} now={now} />
          <OpenStops trip={current} now={now} />
          <div class="stats">
            <Stat label="Avances" value={formatFCFA(current.totalAdvances)} />
            <Stat label="Dépenses" value={formatFCFA(current.totalExpenses)} />
            <Stat label={current.balance >= 0 ? "Reste chez le chauffeur" : "Dû au chauffeur"} value={formatFCFA(Math.abs(current.balance))} tone={current.balance < 0 ? "bad" : undefined} />
            <Stat label="Arrêts" value={formatDuration(Object.values(current.stoppedByKind).reduce((a, b) => a + (b ?? 0), 0))} />
          </div>
          <div class="btn-row">
            {writable && (
              <a class="btn" href={`#/advance/${current.id}`}>
                + Avance
              </a>
            )}
            <ShareButton label="Partager le résumé" text={() => tripSummary(view, current)} />
          </div>
        </Section>
      ) : (
        <div class="card center">
          <p>Pas de trajet en cours.</p>
          {writable && (
            <a class="btn primary block" href="#/start">
              Démarrer un trajet
            </a>
          )}
        </div>
      )}

      <Section title="Trajets terminés">
        {past.length === 0 && <Empty>Aucun trajet terminé.</Empty>}
        <ul class="list">
          {past.map((t) => (
            <li key={t.id}>
              <a class="row" href={`#/trip/${t.id}`}>
                <span class="row-main">
                  <span class="row-title">
                    {t.from} → {t.to}
                  </span>
                  <span class="row-sub">
                    {formatShortDate(t.startAt)} · {formatDuration(t.ended!.at - t.startAt)}
                  </span>
                </span>
                <span class="row-end">{formatFCFA(t.totalExpenses)}</span>
              </a>
            </li>
          ))}
        </ul>
      </Section>
      <p class="center small">
        <a href="#/settings">Réglages de ce téléphone</a>
      </p>
    </div>
  );
}

export function StartTrip() {
  const view = useView();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("Bamako");
  const [corridor, setCorridor] = useState<keyof typeof CORRIDORS>("abidjan-zegoua");
  const [cargo, setCargo] = useState("");
  const [advance, setAdvance] = useState("");
  const [odometer, setOdometer] = useState("");
  const submit = async (e: Event) => {
    e.preventDefault();
    const amount = advance.trim() ? parseFCFA(advance) : 0;
    if (amount === null || amount < 0) return window.alert("Avance invalide.");
    if (view.openTrips.length && !confirm("Un trajet est déjà en cours. En démarrer un autre ?")) return;
    const tripId = newId();
    const payload: PayloadOf<RouteEvents, "route/trip.started"> = { tripId, from, to, corridor, cargo, advance: amount, at: Date.now() };
    if (odometer) payload.odometerKm = Number(odometer);
    if (await act(() => app.emit("route/trip.started", payload))) navigate();
  };
  return (
    <form onSubmit={submit}>
      <BackLink />
      <h1>Nouveau trajet</h1>
      <div class="inline">
        <Field label="Départ">
          <input required maxLength={60} value={from} onInput={(e) => setFrom(e.currentTarget.value)} placeholder="Abidjan" />
        </Field>
        <Field label="Arrivée">
          <input required maxLength={60} value={to} onInput={(e) => setTo(e.currentTarget.value)} />
        </Field>
      </div>
      <Field label="Itinéraire">
        <select value={corridor} onChange={(e) => setCorridor(e.currentTarget.value as keyof typeof CORRIDORS)}>
          {Object.entries(CORRIDORS).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Chargement">
        <input required maxLength={120} value={cargo} onInput={(e) => setCargo(e.currentTarget.value)} placeholder="Ciment, 30 t" />
      </Field>
      <Field label="Avance donnée au chauffeur (FCFA)">
        <input inputMode="numeric" value={advance} onInput={(e) => setAdvance(e.currentTarget.value)} />
      </Field>
      <Field label="Compteur au départ (km)" hint="Facultatif, pour calculer la consommation.">
        <input inputMode="numeric" value={odometer} onInput={(e) => setOdometer(e.currentTarget.value.replace(/\D/g, ""))} />
      </Field>
      <button type="submit" class="btn primary block">
        Démarrer
      </button>
    </form>
  );
}

export function AdvanceForm({ tripId }: { tripId: string }) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"cash" | "mobile_money">("mobile_money");
  const submit = async (e: Event) => {
    e.preventDefault();
    const value = parseFCFA(amount);
    if (!value || value <= 0) return window.alert("Montant invalide.");
    if (await act(() => app.emit("route/advance.added", { advanceId: newId(), tripId, amount: value, method, at: Date.now() }))) navigate("trip", tripId);
  };
  return (
    <form onSubmit={submit}>
      <BackLink to={`#/trip/${tripId}`} />
      <h1>Nouvelle avance</h1>
      <div class="chips">
        <button type="button" class={`chip ${method === "mobile_money" ? "active" : ""}`} onClick={() => setMethod("mobile_money")}>
          Mobile money
        </button>
        <button type="button" class={`chip ${method === "cash" ? "active" : ""}`} onClick={() => setMethod("cash")}>
          Espèces
        </button>
      </div>
      <Field label="Montant (FCFA)">
        <input required inputMode="numeric" value={amount} onInput={(e) => setAmount(e.currentTarget.value)} />
      </Field>
      <button type="submit" class="btn primary block">
        Enregistrer
      </button>
    </form>
  );
}

function cancel(itemId: string) {
  const reason = askReason();
  if (reason) void act(() => app.emit("route/item.cancelled", { itemId, reason }));
}

export function TripDetail({ id }: { id: string }) {
  const view = useView();
  const now = useNow();
  const trip = view.tripById.get(id);
  if (!trip) return <Empty>Trajet introuvable.</Empty>;
  const writable = app.canWrite();
  const end = trip.ended?.at ?? now;
  const kinds = (Object.entries(trip.expensesByKind) as [Kind, number][]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const stops = (Object.entries(trip.stoppedByKind) as [Kind, number][]).filter(([, v]) => v > 0);
  return (
    <div>
      <BackLink />
      <h1>
        {trip.from} → {trip.to}
      </h1>
      <p class="muted">
        {corridorLabel(trip.corridor)} · {trip.cargo}
      </p>
      <p class="muted small">
        Départ {formatDateTime(trip.startAt)}
        {trip.ended ? ` · arrivée ${formatDateTime(trip.ended.at)} à ${trip.ended.place}` : " · en cours"} · durée {formatDuration(end - trip.startAt)}
      </p>
      {trip.warnings.map((w) => (
        <p class="warn" key={w}>
          ⚠️ {w}
        </p>
      ))}
      {!trip.ended && <LastReport trip={trip} now={now} />}
      <OpenStops trip={trip} now={now} />

      <div class="stats">
        <Stat label="Avances" value={formatFCFA(trip.totalAdvances)} />
        <Stat label="Dépenses" value={formatFCFA(trip.totalExpenses)} />
        <Stat label={trip.balance >= 0 ? "Reste chez le chauffeur" : "Dû au chauffeur"} value={formatFCFA(Math.abs(trip.balance))} tone={trip.balance < 0 ? "bad" : undefined} />
        <Stat
          label="Consommation estimée"
          value={trip.consumption !== null ? `${Math.round(trip.consumption)} L/100 km` : "–"}
        />
      </div>

      <div class="btn-row">
        <ShareButton class="btn primary" label="Partager le résumé" text={() => tripSummary(view, trip)} />
        {writable && !trip.ended && (
          <a class="btn" href={`#/advance/${trip.id}`}>
            + Avance
          </a>
        )}
        {writable && !trip.ended && (
          <a class="btn" href={`#/end/${trip.id}`}>
            🏁 Arrivée
          </a>
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
                  <td class="num">{formatFCFA(v)}</td>
                </tr>
              ))}
              {trip.fuelCl > 0 && (
                <tr>
                  <td class="muted">dont carburant</td>
                  <td class="num muted">{formatLiters(trip.fuelCl)}</td>
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
                  <td class="num">{formatDuration(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      <Section title="Chronologie">
        <ul class="timeline">
          {trip.timeline.map((item) => {
            if (item.kind === "start")
              return (
                <li key="start">
                  <strong>
                    Départ de {trip.from}
                    <GhostMark app={app} id={item.eventId} />
                  </strong>
                  <div class="muted small">
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
                  <div class="muted small">{formatDateTime(item.at)}</div>
                </li>
              );
            if (item.kind === "advance") {
              const a = item.advance;
              return (
                <li key={a.id} class={a.cancelled ? "muted-item cancelled" : ""}>
                  <strong>
                    Avance {a.method === "cash" ? "en espèces" : "par mobile money"} : {formatFCFA(a.amount)}
                    <GhostMark app={app} id={a.eventId} />
                  </strong>
                  <div class="muted small">
                    {formatDateTime(a.at)}
                    {a.cancelled && ` · annulé : ${a.cancelled}`}
                  </div>
                  {writable && !a.cancelled && (
                    <button type="button" class="btn small danger" onClick={() => cancel(a.id)}>
                      Annuler
                    </button>
                  )}
                </li>
              );
            }
            const e = item.entry;
            return (
              <li key={e.id} class={e.cancelled ? "muted-item" : ""}>
                <div class={e.cancelled ? "cancelled" : ""}>
                  <strong>
                    {KINDS[e.kind].emoji} {KINDS[e.kind].label} · {e.place}
                    {e.amount ? ` · ${formatFCFA(e.amount)}` : ""}
                    <GhostMark app={app} id={[e.eventId, e.resumeEventId ?? ""]} />
                  </strong>
                  <div class="muted small">
                    {formatDateTime(e.at)}
                    {e.volumeCl ? ` · ${formatLiters(e.volumeCl)} à ${formatNumber(e.pricePerLiter ?? 0)} F/L` : ""}
                    {e.odometerKm !== undefined ? ` · ${formatNumber(e.odometerKm)} km` : ""}
                    {e.stoppedMs !== null ? ` · arrêt ${formatDuration(e.stoppedMs)}` : e.resumable && !e.cancelled ? " · en cours" : ""}
                  </div>
                  {e.note && <div class="small">{e.note}</div>}
                  {e.position && (
                    <a class="small" href={mapLink(e.position)} target="_blank" rel="noreferrer noopener">
                      Position (±{e.position.accuracyM} m)
                    </a>
                  )}
                </div>
                {e.cancelled && <div class="bad small">Annulé : {e.cancelled}</div>}
                {writable && !e.cancelled && (
                  <button type="button" class="btn small danger" onClick={() => cancel(e.id)}>
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
