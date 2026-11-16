import { act, BackLink, Field } from "@rezote/core/react";
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
      });
      if (ok) await navigate({ to: "/" });
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
      <h1>Nouveau camion</h1>
      <form.Field name="plate" validators={{ onChange: z.string().trim().min(1, "L'immatriculation est obligatoire").max(20) }}>
        {(field) => (
          <Field label="Immatriculation" errors={field.state.meta.errors}>
            <input value={field.state.value} onChange={(e) => field.handleChange(e.target.value.toUpperCase())} onBlur={field.handleBlur} placeholder="AB-1234-MD" />
          </Field>
        )}
      </form.Field>
      <form.Field name="name" validators={{ onChange: z.string().trim().min(1, "Le nom est obligatoire").max(60) }}>
        {(field) => (
          <Field label="Nom ou modèle" errors={field.state.meta.errors}>
            <input value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} placeholder="Renault Kerax rouge" />
          </Field>
        )}
      </form.Field>
      <button type="submit" className="btn primary block">
        Créer le carnet
      </button>
      <p className="muted small">Ensuite, menu ☰ → Partager → « Envoyer le lien d'écriture » au chauffeur.</p>
    </form>
  );
}
