import { formatFCFA, formatLiters, fromDateTimeInput, parseFCFA, parseLiters, toDateTimeInput, type PayloadOf } from "@rezote/core";
import { act, BackLink, Empty, Field } from "@rezote/core/react";
import { useForm } from "@tanstack/react-form";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { DIESEL_PRICES } from "../../../../domain/app.ts";
import { fuelAmount, KINDS, RESUMABLE, type Kind, type RouteEvents } from "../../../../domain/events.ts";
import { recentPlaces } from "../../../../components/trip.tsx";
import { app, newId, readPosition, useGps, useView } from "../../../../runtime.ts";

export const Route = createFileRoute("/_app/entry/$tripId/$kind")({ component: EntryForm });

const liters = z.string().refine((s) => parseLiters(s) !== null, "Litres, par exemple 250 ou 250,5");
const pricePerLiter = z.string().regex(/^\d{1,6}$/, "Prix en FCFA par litre");
const optionalAmount = z.string().refine((s) => s.trim() === "" || (parseFCFA(s) ?? -1) >= 0, "Montant en FCFA");
const km = z.string().regex(/^\d{0,7}$/, "Kilométrage en chiffres");

function EntryForm() {
  const { tripId, kind: kindParam } = Route.useParams();
  const view = useView();
  const gps = useGps();
  const navigate = useNavigate();
  const kind = kindParam as Kind;
  const isFuel = kind === "fuel";

  const form = useForm({
    defaultValues: { place: "", amount: "", liters: "", price: String(DIESEL_PRICES[0]!.price), odometer: "", note: "", when: toDateTimeInput(Date.now()) },
    onSubmit: async ({ value, formApi }) => {
      // The field has minute precision; keep the exact time unless the driver changed it.
      const at = formApi.getFieldMeta("when")?.isDirty ? fromDateTimeInput(value.when) : Date.now();
      if (!at) return window.alert("Date invalide.");
      if (at > Date.now() + 10 * 60_000) return window.alert("La date est dans le futur.");
      const payload: PayloadOf<RouteEvents, "route/entry.recorded"> = { entryId: newId(), tripId, kind, place: value.place.trim(), at };
      if (isFuel) {
        payload.volumeCl = parseLiters(value.liters)!;
        payload.pricePerLiter = Number(value.price);
      } else if (value.amount.trim()) {
        payload.amount = parseFCFA(value.amount)!;
      }
      if (value.odometer) payload.odometerKm = Number(value.odometer);
      if (value.note.trim()) payload.note = value.note.trim();
      const position = await readPosition();
      if (position) payload.position = position;
      if (await act(() => app.emit("route/entry.recorded", payload))) await navigate({ to: "/" });
    },
  });

  const info = KINDS[kind];
  if (!info) return <Empty>Type inconnu.</Empty>;
  const places = recentPlaces(view);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
    >
      <BackLink />
      <h1>
        {info.emoji} {info.label}
      </h1>
      <form.Field name="place" validators={{ onSubmit: z.string().trim().min(1, "Le lieu est obligatoire").max(80) }}>
        {(field) => (
          <Field label="Lieu" errors={field.state.meta.errors}>
            <input list="places" value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} placeholder="Zégoua" />
            <datalist id="places">
              {places.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </Field>
        )}
      </form.Field>

      {isFuel ? (
        <>
          <div className="inline">
            <form.Field name="liters" validators={{ onSubmit: liters }}>
              {(field) => (
                <Field label="Litres" errors={field.state.meta.errors}>
                  <input inputMode="decimal" value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} />
                </Field>
              )}
            </form.Field>
            <form.Field name="price" validators={{ onChange: pricePerLiter }}>
              {(field) => (
                <Field label="Prix / litre" errors={field.state.meta.errors}>
                  <input inputMode="numeric" value={field.state.value} onChange={(e) => field.handleChange(e.target.value.replace(/\D/g, ""))} />
                </Field>
              )}
            </form.Field>
          </div>
          <form.Field name="price">
            {(field) => (
              <div className="chips">
                {DIESEL_PRICES.map((d) => (
                  <button
                    type="button"
                    key={d.country}
                    className={`chip ${field.state.value === String(d.price) ? "active" : ""}`}
                    onClick={() => field.handleChange(String(d.price))}
                  >
                    {d.country} {d.price}
                  </button>
                ))}
              </div>
            )}
          </form.Field>
          <form.Subscribe selector={(s) => [s.values.liters, s.values.price] as const}>
            {([l, p]) => {
              const cl = parseLiters(l);
              const ppl = Number(p);
              return (
                <p className="center">
                  <strong>{cl && ppl > 0 ? formatFCFA(fuelAmount(cl, ppl)) : "–"}</strong>
                  {cl ? <span className="muted"> pour {formatLiters(cl)}</span> : null}
                </p>
              );
            }}
          </form.Subscribe>
        </>
      ) : (
        <form.Field name="amount" validators={{ onChange: optionalAmount }}>
          {(field) => (
            <Field label="Montant payé (FCFA)" hint="Laissez vide s'il n'y a rien à payer." errors={field.state.meta.errors}>
              <input inputMode="numeric" value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} />
            </Field>
          )}
        </form.Field>
      )}

      <form.Field name="odometer" validators={{ onChange: km }}>
        {(field) => (
          <Field label="Compteur (km)" hint={isFuel ? "Recommandé : permet de calculer la consommation." : "Facultatif."} errors={field.state.meta.errors}>
            <input inputMode="numeric" value={field.state.value} onChange={(e) => field.handleChange(e.target.value.replace(/\D/g, ""))} />
          </Field>
        )}
      </form.Field>
      <form.Field name="note">
        {(field) => (
          <Field label="Note">
            <input maxLength={300} value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} />
          </Field>
        )}
      </form.Field>
      <form.Field name="when">
        {(field) => (
          <Field label="Quand">
            <input type="datetime-local" value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} />
          </Field>
        )}
      </form.Field>
      {RESUMABLE.has(kind) && <p className="muted small">Quand le camion repart, appuyez sur « Reprendre la route » : la durée de l'arrêt sera calculée.</p>}
      <form.Subscribe selector={(s) => s.isSubmitting}>
        {(busy) => (
          <button type="submit" className="btn primary block" disabled={busy}>
            {busy && gps ? "Lecture du GPS…" : "Enregistrer"}
          </button>
        )}
      </form.Subscribe>
    </form>
  );
}
