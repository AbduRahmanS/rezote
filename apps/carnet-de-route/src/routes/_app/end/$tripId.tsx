import { formatAgo, fromDateTimeInput, toDateTimeInput, type PayloadOf } from "@rezote/core";
import { act, confirmAction, Empty, Field, PageHeader } from "@rezote/core/react";
import { Button } from "@rezote/ui/components/button";
import { Input } from "@rezote/ui/components/input";
import { useForm } from "@tanstack/react-form";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Flag } from "lucide-react";
import { z } from "zod";
import type { RouteEvents } from "../../../domain/events.ts";
import { TripTitle } from "../../../components/trip.tsx";
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
      if (
        trip.openStops.length &&
        !(await confirmAction({ title: `${trip.openStops.length} arrêt(s) sans reprise`, description: "Terminer le trajet quand même ?", confirmLabel: "Terminer" }))
      )
        return;
      const payload: PayloadOf<RouteEvents, "route/trip.ended"> = { tripId, place: value.place, at };
      if (value.odometer) payload.odometerKm = Number(value.odometer);
      if (await act(() => app.emit("route/trip.ended", payload), "Trajet terminé")) await navigate({ to: "/trips/$tripId", params: { tripId } });
    },
  });
  if (!trip) return <Empty>Trajet introuvable.</Empty>;
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
    >
      <PageHeader title="Arrivée" back={{ to: "/" }} description={<><TripTitle trip={trip} /> · parti {formatAgo(trip.startAt)}</>} />
      <form.Field name="place" validators={{ onSubmit: z.string().trim().min(1, "Le lieu est obligatoire").max(60) }}>
        {(field) => (
          <Field label="Lieu d'arrivée" errors={field.state.meta.errors}>
            <Input value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} />
          </Field>
        )}
      </form.Field>
      <div className="grid grid-cols-2 gap-2">
        <form.Field name="odometer">
          {(field) => (
            <Field label="Compteur (km)">
              <Input inputMode="numeric" className="tabular-nums" value={field.state.value} onChange={(e) => field.handleChange(e.target.value.replace(/\D/g, ""))} />
            </Field>
          )}
        </form.Field>
        <form.Field name="when">
          {(field) => (
            <Field label="Quand">
              <Input type="datetime-local" value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} />
            </Field>
          )}
        </form.Field>
      </div>
      <Button type="submit" size="lg">
        <Flag aria-hidden />
        Terminer le trajet
      </Button>
    </form>
  );
}
