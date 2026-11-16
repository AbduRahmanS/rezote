import { parseFCFA } from "@rezote/core";
import { act, Field, PageHeader } from "@rezote/core/react";
import { Button } from "@rezote/ui/components/button";
import { Input } from "@rezote/ui/components/input";
import { ToggleGroup, ToggleGroupItem } from "@rezote/ui/components/toggle-group";
import { useForm } from "@tanstack/react-form";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Banknote, Smartphone } from "lucide-react";
import { z } from "zod";
import { app, newId } from "../../../runtime.ts";

export const Route = createFileRoute("/_app/advance/$tripId")({ component: AdvanceForm });

function AdvanceForm() {
  const { tripId } = Route.useParams();
  const navigate = useNavigate();
  const form = useForm({
    defaultValues: { amount: "", method: "mobile_money" as "cash" | "mobile_money" },
    onSubmit: async ({ value }) => {
      const amount = parseFCFA(value.amount)!;
      if (await act(() => app.emit("route/advance.added", { advanceId: newId(), tripId, amount, method: value.method, at: Date.now() }), "Avance enregistrée")) {
        await navigate({ to: "/trips/$tripId", params: { tripId } });
      }
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
      <PageHeader title="Nouvelle avance" back={{ to: "/trips/$tripId", params: { tripId } }} description="Argent envoyé au chauffeur pendant le trajet." />
      <form.Field name="method">
        {(field) => (
          <ToggleGroup type="single" variant="outline" className="w-full" value={field.state.value} onValueChange={(v) => v && field.handleChange(v as "cash" | "mobile_money")}>
            <ToggleGroupItem value="mobile_money" className="flex-1">
              <Smartphone aria-hidden />
              Mobile money
            </ToggleGroupItem>
            <ToggleGroupItem value="cash" className="flex-1">
              <Banknote aria-hidden />
              Espèces
            </ToggleGroupItem>
          </ToggleGroup>
        )}
      </form.Field>
      <form.Field name="amount" validators={{ onSubmit: z.string().refine((s) => (parseFCFA(s) ?? 0) > 0, "Montant en FCFA, par exemple 50 000") }}>
        {(field) => (
          <Field label="Montant (FCFA)" errors={field.state.meta.errors}>
            <Input inputMode="numeric" className="h-11 text-lg tabular-nums" value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} />
          </Field>
        )}
      </form.Field>
      <Button type="submit" size="lg">
        Enregistrer
      </Button>
    </form>
  );
}
