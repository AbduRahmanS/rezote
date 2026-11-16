import { act, Field, PageHeader } from "@rezote/core/react";
import { Button } from "@rezote/ui/components/button";
import { Input } from "@rezote/ui/components/input";
import { useForm } from "@tanstack/react-form";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { app, newId, useView } from "../../../runtime.ts";

export const Route = createFileRoute("/_app/farmers/new")({
  validateSearch: z.object({ pick: z.boolean().optional() }),
  component: AddFarmer,
});

function AddFarmer() {
  const view = useView();
  const { pick } = Route.useSearch();
  const navigate = useNavigate();
  const villages = [...new Set(view.farmers.map((f) => f.village))].sort();
  const form = useForm({
    defaultValues: { name: "", village: villages.length === 1 ? villages[0]! : "" },
    onSubmit: async ({ value }) => {
      const farmerId = newId();
      const ok = await act(() => app.emit("collecte/farmer.registered", { farmerId, ...value }));
      if (!ok) return;
      if (pick) await navigate({ to: "/weigh/$farmerId", params: { farmerId } });
      else await navigate({ to: "/farmers/$farmerId", params: { farmerId } });
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
      <PageHeader title="Nouveau producteur" back={{ to: "/farmers", search: pick ? { pick: true } : undefined }} />
      <form.Field name="name" validators={{ onChange: z.string().trim().min(1, "Le nom est obligatoire").max(80) }}>
        {(field) => (
          <Field label="Chef d'exploitation" errors={field.state.meta.errors}>
            <Input autoComplete="off" value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} placeholder="Moussa Coulibaly" />
          </Field>
        )}
      </form.Field>
      <form.Field name="village" validators={{ onChange: z.string().trim().min(1, "Le village est obligatoire").max(60) }}>
        {(field) => (
          <Field label="Village" errors={field.state.meta.errors}>
            <Input list="villages" value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} />
            <datalist id="villages">
              {villages.map((v) => (
                <option key={v} value={v} />
              ))}
            </datalist>
          </Field>
        )}
      </form.Field>
      <form.Subscribe selector={(s) => s.isSubmitting}>
        {(busy) => (
          <Button type="submit" size="lg" disabled={busy}>
            {pick ? "Enregistrer et peser" : "Enregistrer"}
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
}
