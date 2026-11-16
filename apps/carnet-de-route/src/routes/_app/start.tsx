import { parseFCFA, type PayloadOf } from "@rezote/core";
import { act, confirmAction, Field, PageHeader } from "@rezote/core/react";
import { Button } from "@rezote/ui/components/button";
import { Input } from "@rezote/ui/components/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@rezote/ui/components/select";
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
      if (view.openTrips.length && !(await confirmAction({ title: "Un trajet est déjà en cours", description: "En démarrer un autre quand même ?", confirmLabel: "Démarrer" }))) return;
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
      if (await act(() => app.emit("route/trip.started", payload), "Trajet démarré")) await navigate({ to: "/" });
    },
  });
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
    >
      <PageHeader title="Nouveau trajet" back={{ to: "/" }} />
      <div className="grid grid-cols-2 gap-2">
        <form.Field name="from" validators={{ onSubmit: place("Le départ") }}>
          {(field) => (
            <Field label="Départ" errors={field.state.meta.errors}>
              <Input value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} placeholder="Abidjan" />
            </Field>
          )}
        </form.Field>
        <form.Field name="to" validators={{ onSubmit: place("L'arrivée") }}>
          {(field) => (
            <Field label="Arrivée" errors={field.state.meta.errors}>
              <Input value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} />
            </Field>
          )}
        </form.Field>
      </div>
      <form.Field name="corridor">
        {(field) => (
          <div className="grid gap-1.5">
            <span className="text-sm font-medium">Itinéraire</span>
            <Select value={field.state.value} onValueChange={(v) => field.handleChange(v as keyof typeof CORRIDORS)}>
              <SelectTrigger className="w-full" aria-label="Itinéraire">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CORRIDORS).map(([k, label]) => (
                  <SelectItem key={k} value={k}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </form.Field>
      <form.Field name="cargo" validators={{ onSubmit: z.string().trim().min(1, "Le chargement est obligatoire").max(120) }}>
        {(field) => (
          <Field label="Chargement" errors={field.state.meta.errors}>
            <Input value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} placeholder="Ciment, 30 t" />
          </Field>
        )}
      </form.Field>
      <div className="grid grid-cols-2 gap-2">
        <form.Field name="advance" validators={{ onChange: optionalFcfa }}>
          {(field) => (
            <Field label="Avance (FCFA)" hint="Donnée au chauffeur" errors={field.state.meta.errors}>
              <Input inputMode="numeric" className="tabular-nums" value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} />
            </Field>
          )}
        </form.Field>
        <form.Field name="odometer">
          {(field) => (
            <Field label="Compteur (km)" hint="Pour la consommation">
              <Input inputMode="numeric" className="tabular-nums" value={field.state.value} onChange={(e) => field.handleChange(e.target.value.replace(/\D/g, ""))} />
            </Field>
          )}
        </form.Field>
      </div>
      <Button type="submit" size="lg">
        Démarrer
      </Button>
    </form>
  );
}
