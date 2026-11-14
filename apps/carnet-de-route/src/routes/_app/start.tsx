import { parseFCFA, type PayloadOf } from "@rezote/core";
import { act, BackLink, Field } from "@rezote/core/react";
import { useForm } from "@tanstack/react-form";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { CORRIDORS, type RouteEvents } from "../../domain/events.ts";
import { app, newId, useView } from "../../runtime.ts";

export const Route = createFileRoute("/_app/start")({ component: StartTrip });

const place = (label: string) => z.string().trim().min(1, `${label} est obligatoire`).max(60);
const optionalFcfa = z.string().refine((s) => s.trim() === "" || (parseFCFA(s) ?? -1) >= 0, "Montant en FCFA, par exemple 600 000");

function StartTrip() {
  const view = useView();
  const navigate = useNavigate();
  const form = useForm({
    defaultValues: { from: "", to: "Bamako", corridor: "abidjan-zegoua" as keyof typeof CORRIDORS, cargo: "", advance: "", odometer: "" },
    onSubmit: async ({ value }) => {
      if (view.openTrips.length && !confirm("Un trajet est déjà en cours. En démarrer un autre ?")) return;
      const payload: PayloadOf<RouteEvents, "route/trip.started"> = {
        tripId: newId(),
        from: value.from,
        to: value.to,
        corridor: value.corridor,
        cargo: value.cargo,
        advance: value.advance.trim() ? parseFCFA(value.advance)! : 0,
        at: Date.now(),
      };
      if (value.odometer) payload.odometerKm = Number(value.odometer);
      if (await act(() => app.emit("route/trip.started", payload))) await navigate({ to: "/" });
    },
  });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
    >
      <BackLink />
      <h1>Nouveau trajet</h1>
      <div className="inline">
        <form.Field name="from" validators={{ onSubmit: place("Le départ") }}>
          {(field) => (
            <Field label="Départ" errors={field.state.meta.errors}>
              <input value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} placeholder="Abidjan" />
            </Field>
          )}
        </form.Field>
        <form.Field name="to" validators={{ onSubmit: place("L'arrivée") }}>
          {(field) => (
            <Field label="Arrivée" errors={field.state.meta.errors}>
              <input value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} />
            </Field>
          )}
        </form.Field>
      </div>
      <form.Field name="corridor">
        {(field) => (
          <Field label="Itinéraire">
            <select value={field.state.value} onChange={(e) => field.handleChange(e.target.value as keyof typeof CORRIDORS)}>
              {Object.entries(CORRIDORS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
        )}
      </form.Field>
      <form.Field name="cargo" validators={{ onSubmit: z.string().trim().min(1, "Le chargement est obligatoire").max(120) }}>
        {(field) => (
          <Field label="Chargement" errors={field.state.meta.errors}>
            <input value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} placeholder="Ciment, 30 t" />
          </Field>
        )}
      </form.Field>
      <form.Field name="advance" validators={{ onChange: optionalFcfa }}>
        {(field) => (
          <Field label="Avance donnée au chauffeur (FCFA)" errors={field.state.meta.errors}>
            <input inputMode="numeric" value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} />
          </Field>
        )}
      </form.Field>
      <form.Field name="odometer">
        {(field) => (
          <Field label="Compteur au départ (km)" hint="Facultatif, pour calculer la consommation.">
            <input inputMode="numeric" value={field.state.value} onChange={(e) => field.handleChange(e.target.value.replace(/\D/g, ""))} />
          </Field>
        )}
      </form.Field>
      <button type="submit" className="btn primary block">
        Démarrer
      </button>
    </form>
  );
}
