import { act, Field, PageHeader } from "@rezote/core/react";
import { Button } from "@rezote/ui/components/button";
import { Input } from "@rezote/ui/components/input";
import { useForm } from "@tanstack/react-form";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { app } from "../runtime.ts";

export const Route = createFileRoute("/new")({ component: CreateSpace });

function CreateSpace() {
  const navigate = useNavigate();
  const form = useForm({
    defaultValues: { title: "" },
    onSubmit: async ({ value }) => {
      const ok = await act(async () => {
        const space = await app.createSpace(value.title.trim());
        await app.emit("__SLUG__/space.named", { title: value.title }, space);
      }, "Registre créé");
      if (ok) await navigate({ to: "/" });
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
      <PageHeader title="Nouveau registre" back={{ to: "/" }} description="Ensuite, envoyez le lien d'écriture aux personnes qui notent avec vous." />
      <form.Field name="title" validators={{ onChange: z.string().trim().min(1, "Le nom est obligatoire").max(60, "60 caractères au plus") }}>
        {(field) => (
          <Field label="Nom du registre" errors={field.state.meta.errors}>
            <Input maxLength={60} value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} placeholder="Caisse du groupement" />
          </Field>
        )}
      </form.Field>
      <form.Subscribe selector={(s) => s.isSubmitting}>
        {(busy) => (
          <Button type="submit" size="lg" disabled={busy}>
            Créer le registre
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
}
