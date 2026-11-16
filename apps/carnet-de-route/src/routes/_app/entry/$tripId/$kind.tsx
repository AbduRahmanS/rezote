import { formatFCFA, formatLiters, fromDateTimeInput, parseFCFA, parseLiters, toDateTimeInput, type PayloadOf } from "@rezote/core";
import { act, Empty, Field, PageHeader } from "@rezote/core/react";
import { Button } from "@rezote/ui/components/button";
import { Input } from "@rezote/ui/components/input";
import { ToggleGroup, ToggleGroupItem } from "@rezote/ui/components/toggle-group";
import { useForm } from "@tanstack/react-form";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2, MapPin } from "lucide-react";
import { z } from "zod";
import { KIND_ICONS } from "../../../../components/kinds.ts";
import { recentPlaces } from "../../../../components/trip.tsx";
import { DIESEL_PRICES } from "../../../../domain/app.ts";
import { fuelAmount, KINDS, RESUMABLE, type Kind, type RouteEvents } from "../../../../domain/events.ts";
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
      if (!at || at > Date.now() + 10 * 60_000) return;
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
      if (await act(() => app.emit("route/entry.recorded", payload), `${KINDS[kind].label} enregistré`)) await navigate({ to: "/" });
    },
  });

  const info = KINDS[kind];
  if (!info) return <Empty>Type inconnu.</Empty>;
  const Icon = KIND_ICONS[kind];
  const places = recentPlaces(view);

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
    >
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2">
            <Icon className="size-5 text-primary" aria-hidden />
            {info.label}
          </span>
        }
        back={{ to: "/" }}
        description={RESUMABLE.has(kind) ? "Quand le camion repart, touchez « Reprendre la route » : la durée de l'arrêt sera calculée." : undefined}
      />
      <form.Field name="place" validators={{ onSubmit: z.string().trim().min(1, "Le lieu est obligatoire").max(80) }}>
        {(field) => (
          <Field label="Lieu" errors={field.state.meta.errors}>
            <Input list="places" value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} placeholder="Zégoua" />
            <datalist id="places">
              {places.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </Field>
        )}
      </form.Field>

      {isFuel ? (
        <div className="grid gap-3 rounded-lg border bg-card p-3">
          <div className="grid grid-cols-2 gap-2">
            <form.Field name="liters" validators={{ onSubmit: liters }}>
              {(field) => (
                <Field label="Litres" errors={field.state.meta.errors}>
                  <Input inputMode="decimal" className="tabular-nums" value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} />
                </Field>
              )}
            </form.Field>
            <form.Field name="price" validators={{ onChange: pricePerLiter }}>
              {(field) => (
                <Field label="Prix / litre" errors={field.state.meta.errors}>
                  <Input inputMode="numeric" className="tabular-nums" value={field.state.value} onChange={(e) => field.handleChange(e.target.value.replace(/\D/g, ""))} />
                </Field>
              )}
            </form.Field>
          </div>
          <form.Field name="price">
            {(field) => (
              <ToggleGroup type="single" variant="outline" size="sm" className="w-full" value={field.state.value} onValueChange={(v) => v && field.handleChange(v)}>
                {DIESEL_PRICES.map((d) => (
                  <ToggleGroupItem key={d.country} value={String(d.price)} className="flex-1 text-xs" aria-label={`${d.country} ${d.price}`}>
                    {d.country} {d.price}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            )}
          </form.Field>
          <form.Subscribe selector={(s) => [s.values.liters, s.values.price] as const}>
            {([l, p]) => {
              const cl = parseLiters(l);
              const ppl = Number(p);
              return (
                <div className="flex items-baseline justify-between border-t pt-3">
                  <span className="text-sm text-muted-foreground">{cl ? `Total pour ${formatLiters(cl)}` : "Total"}</span>
                  <span className="text-lg font-semibold tabular-nums">{cl && ppl > 0 ? formatFCFA(fuelAmount(cl, ppl)) : "–"}</span>
                </div>
              );
            }}
          </form.Subscribe>
        </div>
      ) : (
        <form.Field name="amount" validators={{ onChange: optionalAmount }}>
          {(field) => (
            <Field label="Montant payé (FCFA)" hint="Laissez vide s'il n'y a rien à payer." errors={field.state.meta.errors}>
              <Input inputMode="numeric" className="tabular-nums" value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} />
            </Field>
          )}
        </form.Field>
      )}

      <div className="grid grid-cols-2 gap-2">
        <form.Field name="odometer" validators={{ onChange: km }}>
          {(field) => (
            <Field label="Compteur (km)" hint={isFuel ? "Pour la consommation" : "Facultatif"} errors={field.state.meta.errors}>
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
      <form.Field name="note">
        {(field) => (
          <Field label="Note">
            <Input maxLength={300} value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} placeholder="Facultatif" />
          </Field>
        )}
      </form.Field>

      <form.Subscribe selector={(s) => s.isSubmitting}>
        {(busy) => (
          <Button type="submit" size="lg" disabled={busy}>
            {busy && <Loader2 className="animate-spin" aria-hidden />}
            {busy && gps ? "Lecture du GPS…" : "Enregistrer"}
          </Button>
        )}
      </form.Subscribe>
      {gps && (
        <p className="-mt-2 flex items-center justify-center gap-1 text-xs text-muted-foreground">
          <MapPin className="size-3.5" aria-hidden /> La position du téléphone sera ajoutée.
        </p>
      )}
    </form>
  );
}
