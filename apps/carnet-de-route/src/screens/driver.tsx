import {
  formatAgo,
  formatDuration,
  formatFCFA,
  formatLiters,
  formatTime,
  fromDateTimeInput,
  navigate,
  parseFCFA,
  parseLiters,
  toDateTimeInput,
  type PayloadOf,
} from "@rezote/core";
import { Empty, Field, GhostMark, Section } from "@rezote/core/ui";
import { useEffect, useState } from "preact/hooks";
import { DIESEL_PRICES } from "../domain/app.ts";
import { fuelAmount, KINDS, RESUMABLE, type Kind, type RouteEvents } from "../domain/events.ts";
import type { Trip } from "../domain/project.ts";
import { app, gpsEnabled, newId, readPosition } from "../runtime.ts";
import { act, BackLink, recentPlaces, useView } from "./common.tsx";

const QUICK: Kind[] = ["fuel", "checkpoint", "weighbridge", "customs", "border", "convoy", "breakdown", "repair", "rest", "meal", "toll", "loading", "unloading", "other"];

function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

function resume(entryId: string) {
  void act(() => app.emit("route/stop.resumed", { entryId, at: Date.now() }));
}

export function OpenStops({ trip, now }: { trip: Trip; now: number }) {
  if (trip.openStops.length === 0) return null;
  return (
    <div>
      {trip.openStops.map((s) => (
        <div class="card flag" key={s.id}>
          <div class="section-head">
            <strong>
              {KINDS[s.kind].emoji} {KINDS[s.kind].label} à {s.place}
            </strong>
            <span class="warn">{formatDuration(now - s.at)}</span>
          </div>
          {app.canWrite() && (
            <button type="button" class="btn primary block" onClick={() => resume(s.id)}>
              ▶ Reprendre la route
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

export function DriverHome() {
  const view = useView();
  const now = useNow();
  const trip = view.openTrips[0];
  if (!trip) {
    return (
      <div>
        <div class="hero">
          <div class="big">🅿️</div>
          <h1>Pas de trajet en cours</h1>
          <p class="muted">Le propriétaire démarre le trajet, ou vous pouvez le faire ici.</p>
        </div>
        <a class="btn primary block" href="#/start">
          Démarrer un trajet
        </a>
        <a class="btn block" href="#/trip">
          Voir les trajets passés
        </a>
      </div>
    );
  }
  const recent = trip.entries.slice(-5).reverse();
  return (
    <div>
      <h1>
        {trip.from} → {trip.to}
      </h1>
      <p class="muted">
        En route depuis {formatDuration(now - trip.startAt)} · {trip.cargo}
      </p>
      <div class="stats">
        <div class={`stat ${trip.balance < 0 ? "bad" : ""}`}>
          <div class="stat-value">{formatFCFA(trip.balance)}</div>
          <div class="stat-label">{trip.balance < 0 ? "Avancé par vous" : "Reste de l'avance"}</div>
        </div>
        <div class="stat">
          <div class="stat-value">{formatFCFA(trip.totalExpenses)}</div>
          <div class="stat-label">Dépenses</div>
        </div>
      </div>

      <OpenStops trip={trip} now={now} />

      <div class="grid-buttons">
        {QUICK.map((k) => (
          <a key={k} class="btn" href={`#/entry/${trip.id}/${k}`}>
            <span class="emoji">{KINDS[k].emoji}</span>
            {KINDS[k].label}
          </a>
        ))}
      </div>

      <Section title="Dernières saisies">
        {recent.length === 0 && <Empty>Rien pour le moment.</Empty>}
        <ul class="list">
          {recent.map((e) => (
            <li key={e.id}>
              <div class={`row ${e.cancelled ? "cancelled" : ""} ${app.isGhost(e.eventId) ? "is-ghost" : ""}`}>
                <span class="row-main">
                  <span class="row-title">
                    {KINDS[e.kind].emoji} {KINDS[e.kind].label} · {e.place}
                    <GhostMark app={app} id={[e.eventId, e.resumeEventId ?? ""]} />
                  </span>
                  <span class="row-sub">{formatTime(e.at)}</span>
                </span>
                <span class="row-end">{e.amount ? formatFCFA(e.amount) : ""}</span>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <div class="btn-row">
        <a class="btn" href={`#/trip/${trip.id}`}>
          Tout le trajet
        </a>
        <a class="btn" href={`#/end/${trip.id}`}>
          🏁 Arrivée
        </a>
      </div>
      <p class="muted small center">
        GPS : {gpsEnabled.value ? "activé" : "désactivé"} · <a href="#/settings">réglages</a>
      </p>
    </div>
  );
}

export function EntryForm({ tripId, kind }: { tripId: string; kind: Kind }) {
  const view = useView();
  const places = recentPlaces(view);
  const [place, setPlace] = useState("");
  const [amount, setAmount] = useState("");
  const [liters, setLiters] = useState("");
  const [price, setPrice] = useState(String(DIESEL_PRICES[0]!.price));
  const [odometer, setOdometer] = useState("");
  const [note, setNote] = useState("");
  const [when, setWhen] = useState(toDateTimeInput(Date.now()));
  // The field only has minutes; keep the exact time unless the driver changes it.
  const [whenEdited, setWhenEdited] = useState(false);
  const [busy, setBusy] = useState(false);
  const info = KINDS[kind];
  if (!info) return <Empty>Type inconnu.</Empty>;
  const isFuel = kind === "fuel";
  const cl = parseLiters(liters);
  const ppl = Number(price);
  const fuelTotal = cl && ppl > 0 ? fuelAmount(cl, ppl) : null;

  const submit = async (e: Event) => {
    e.preventDefault();
    const at = whenEdited ? fromDateTimeInput(when) : Date.now();
    if (!at) return window.alert("Date invalide.");
    if (at > Date.now() + 10 * 60_000) return window.alert("La date est dans le futur.");
    const payload: PayloadOf<RouteEvents, "route/entry.recorded"> = { entryId: newId(), tripId, kind, place: place.trim(), at };
    if (isFuel) {
      if (!cl || !(ppl > 0)) return window.alert("Indiquez les litres et le prix au litre.");
      payload.volumeCl = cl;
      payload.pricePerLiter = ppl;
    } else if (amount.trim()) {
      const value = parseFCFA(amount);
      if (value === null || value < 0) return window.alert("Montant invalide.");
      payload.amount = value;
    }
    if (odometer.trim()) {
      const km = Number(odometer.replace(/\s/g, ""));
      if (!Number.isInteger(km) || km < 0) return window.alert("Kilométrage invalide.");
      payload.odometerKm = km;
    }
    if (note.trim()) payload.note = note.trim();
    setBusy(true);
    const position = await readPosition();
    if (position) payload.position = position;
    const ok = await act(() => app.emit("route/entry.recorded", payload));
    setBusy(false);
    if (ok) navigate();
  };

  return (
    <form onSubmit={submit}>
      <BackLink />
      <h1>
        {info.emoji} {info.label}
      </h1>
      <Field label="Lieu">
        <input required maxLength={80} list="places" value={place} onInput={(e) => setPlace(e.currentTarget.value)} placeholder="Zégoua" />
        <datalist id="places">
          {places.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
      </Field>
      {isFuel ? (
        <>
          <div class="inline">
            <Field label="Litres">
              <input required inputMode="decimal" value={liters} onInput={(e) => setLiters(e.currentTarget.value)} />
            </Field>
            <Field label="Prix / litre">
              <input required inputMode="numeric" value={price} onInput={(e) => setPrice(e.currentTarget.value.replace(/\D/g, ""))} />
            </Field>
          </div>
          <div class="chips">
            {DIESEL_PRICES.map((d) => (
              <button type="button" key={d.country} class={`chip ${price === String(d.price) ? "active" : ""}`} onClick={() => setPrice(String(d.price))}>
                {d.country} {d.price}
              </button>
            ))}
          </div>
          <p class="center">
            <strong>{fuelTotal !== null ? formatFCFA(fuelTotal) : "–"}</strong>
            {cl ? <span class="muted"> pour {formatLiters(cl)}</span> : null}
          </p>
        </>
      ) : (
        <Field label="Montant payé (FCFA)" hint="Laissez vide s'il n'y a rien à payer.">
          <input inputMode="numeric" value={amount} onInput={(e) => setAmount(e.currentTarget.value)} />
        </Field>
      )}
      <Field label="Compteur (km)" hint={isFuel ? "Recommandé : permet de calculer la consommation." : "Facultatif."}>
        <input inputMode="numeric" value={odometer} onInput={(e) => setOdometer(e.currentTarget.value.replace(/\D/g, ""))} />
      </Field>
      <Field label="Note">
        <input maxLength={300} value={note} onInput={(e) => setNote(e.currentTarget.value)} />
      </Field>
      <Field label="Quand">
        <input
          type="datetime-local"
          value={when}
          onInput={(e) => {
            setWhen(e.currentTarget.value);
            setWhenEdited(true);
          }}
        />
      </Field>
      {RESUMABLE.has(kind) && <p class="muted small">Quand le camion repart, appuyez sur « Reprendre la route » : la durée de l'arrêt sera calculée.</p>}
      <button type="submit" class="btn primary block" disabled={busy}>
        {busy && gpsEnabled.value ? "Lecture du GPS…" : "Enregistrer"}
      </button>
    </form>
  );
}

export function EndTrip({ tripId }: { tripId: string }) {
  const view = useView();
  const trip = view.tripById.get(tripId);
  const [place, setPlace] = useState(trip?.to ?? "");
  const [odometer, setOdometer] = useState("");
  const [when, setWhen] = useState(toDateTimeInput(Date.now()));
  const [whenEdited, setWhenEdited] = useState(false);
  if (!trip) return <Empty>Trajet introuvable.</Empty>;
  const submit = async (e: Event) => {
    e.preventDefault();
    const at = whenEdited ? fromDateTimeInput(when) : Date.now();
    if (!at) return;
    const payload: PayloadOf<RouteEvents, "route/trip.ended"> = { tripId, place, at };
    if (odometer) payload.odometerKm = Number(odometer);
    if (trip.openStops.length && !confirm(`${trip.openStops.length} arrêt(s) sans reprise. Terminer quand même ?`)) return;
    if (await act(() => app.emit("route/trip.ended", payload))) navigate("trip", tripId);
  };
  return (
    <form onSubmit={submit}>
      <BackLink />
      <h1>🏁 Arrivée</h1>
      <p class="muted">
        {trip.from} → {trip.to}, parti {formatAgo(trip.startAt)}
      </p>
      <Field label="Lieu d'arrivée">
        <input required maxLength={60} value={place} onInput={(e) => setPlace(e.currentTarget.value)} />
      </Field>
      <Field label="Compteur (km)">
        <input inputMode="numeric" value={odometer} onInput={(e) => setOdometer(e.currentTarget.value.replace(/\D/g, ""))} />
      </Field>
      <Field label="Quand">
        <input
          type="datetime-local"
          value={when}
          onInput={(e) => {
            setWhen(e.currentTarget.value);
            setWhenEdited(true);
          }}
        />
      </Field>
      <button type="submit" class="btn primary block">
        Terminer le trajet
      </button>
    </form>
  );
}
