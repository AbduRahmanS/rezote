import { formatAgo, fromDateTimeInput, toDateTimeInput, type PayloadOf } from "@rezote/core";
import { act, BackLink, Empty, Field } from "@rezote/core/react";
import { useForm } from "@tanstack/react-form";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import type { RouteEvents } from "../../../domain/events.ts";
import { app, useView } from "../../../runtime.ts";

export const Route = createFileRoute("/_app/end/$tripId")({ component: EndTrip });

function EndTrip() {
  const { tripId } = Route.useParams();
  const view = useView();
  const navigate = useNavigate();
  const trip = view.tripById.get(tripId);
  const form = useForm({
    defaultValues: { place: trip?.to ?? "", odometer: "", when: toDateTimeInput(Date.now()) },
    onSubmit: async ({ value, formApi }) => {
      if (!trip) return;
      // The field has minute precision; keep the exact time unless the driver changed it.
      const at = formApi.getFieldMeta("when")?.isDirty ? fromDateTimeInput(value.when) : Date.now();
      if (!at) return;
      if (trip.openStops.length && !confirm(`${trip.openStops.length} arrêt(s) sans reprise. Terminer quand même ?`)) return;
      const payload: PayloadOf<RouteEvents, "route/trip.ended"> = { tripId, place: value.place, at };
      if (value.odometer) payload.odometerKm = Number(value.odometer);
      if (await act(() => app.emit("route/trip.ended", payload))) await navigate({ to: "/trips/$tripId", params: { tripId } });
    },
  });
  if (!trip) return <Empty>Trajet introuvable.</Empty>;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
    >
      <BackLink />
      <h1>🏁 Arrivée</h1>
      <p className="muted">
        {trip.from} → {trip.to}, parti {formatAgo(trip.startAt)}
      </p>
      <form.Field name="place" validators={{ onSubmit: z.string().trim().min(1, "Le lieu est obligatoire").max(60) }}>
        {(field) => (
          <Field label="Lieu d'arrivée" errors={field.state.meta.errors}>
            <input value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} />
          </Field>
        )}
      </form.Field>
      <form.Field name="odometer">
        {(field) => (
          <Field label="Compteur (km)">
            <input inputMode="numeric" value={field.state.value} onChange={(e) => field.handleChange(e.target.value.replace(/\D/g, ""))} />
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
      <button type="submit" className="btn primary block">
        Terminer le trajet
      </button>
    </form>
  );
}
