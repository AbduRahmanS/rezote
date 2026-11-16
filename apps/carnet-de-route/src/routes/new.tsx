import { act, Field, PageHeader } from "@rezote/core/react";
import { Button } from "@rezote/ui/components/button";
import { Input } from "@rezote/ui/components/input";
import { useForm } from "@tanstack/react-form";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { app, setRole } from "../runtime.ts";

export const Route = createFileRoute("/new")({ component: CreateTruck });

function CreateTruck() {
  const navigate = useNavigate();
  const form = useForm({
    defaultValues: { plate: "", name: "" },
    onSubmit: async ({ value }) => {
      const ok = await act(async () => {
        const space = await app.createSpace(value.plate);
        await app.emit("route/truck.registered", value, space);
        await setRole("owner");
      }, "Carnet créé");
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
      <PageHeader title="Nouveau camion" back={{ to: "/" }} description="Ensuite, partagez le lien d'écriture avec le chauffeur." />
      <form.Field name="plate" validators={{ onChange: z.string().trim().min(1, "L'immatriculation est obligatoire").max(20) }}>
        {(field) => (
          <Field label="Immatriculation" errors={field.state.meta.errors}>
            <Input className="font-mono uppercase" value={field.state.value} onChange={(e) => field.handleChange(e.target.value.toUpperCase())} onBlur={field.handleBlur} placeholder="AB-1234-MD" />
          </Field>
        )}
      </form.Field>
      <form.Field name="name" validators={{ onChange: z.string().trim().min(1, "Le nom est obligatoire").max(60) }}>
        {(field) => (
          <Field label="Nom ou modèle" errors={field.state.meta.errors}>
            <Input value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} placeholder="Renault Kerax rouge" />
          </Field>
        )}
      </form.Field>
      <Button type="submit" size="lg">
        Créer le carnet
      </Button>
    </form>
  );
}
