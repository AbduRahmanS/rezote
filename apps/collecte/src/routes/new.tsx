import { act, BackLink, Field } from "@rezote/core/react";
import { useForm } from "@tanstack/react-form";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { DEFAULT_GRADES } from "../domain/app.ts";
import { app, setRole } from "../runtime.ts";

export const Route = createFileRoute("/new")({ component: CreateCampaign });

const required = (label: string, max: number) => z.string().trim().min(1, `${label} est obligatoire`).max(max, `${max} caractères au plus`);
const price = z.string().regex(/^\d{1,6}$/, "Nombre entier de FCFA par kg");

function CreateCampaign() {
  const navigate = useNavigate();
  const form = useForm({
    defaultValues: {
      cooperative: "",
      name: "Campagne coton 2026-2027",
      product: "Coton graine",
      grades: DEFAULT_GRADES.map((g) => ({ code: g.code, label: g.label, price: String(g.pricePerKg) })),
    },
    onSubmit: async ({ value }) => {
      const grades = value.grades
        .filter((g) => g.label.trim())
        .map((g) => ({ code: g.code, label: g.label.trim(), pricePerKg: Number(g.price) }));
      if (grades.length === 0) return window.alert("Indiquez au moins une qualité.");
      const ok = await act(async () => {
        const space = await app.createSpace(`${value.cooperative} · ${value.name}`);
        await app.emit("collecte/campaign.created", { cooperative: value.cooperative, name: value.name, product: value.product, grades }, space);
        await setRole({ kind: "treasurer" });
      });
      if (ok) await navigate({ to: "/collectors" });
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
      <h1>Nouvelle campagne</h1>
      <form.Field name="cooperative" validators={{ onChange: required("Le nom de la coopérative", 80) }}>
        {(field) => (
          <Field label="Coopérative" errors={field.state.meta.errors}>
            <input value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} placeholder="Coopérative de Kignan" />
          </Field>
        )}
      </form.Field>
      <form.Field name="name" validators={{ onChange: required("Le nom de la campagne", 80) }}>
        {(field) => (
          <Field label="Campagne" errors={field.state.meta.errors}>
            <input value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} />
          </Field>
        )}
      </form.Field>
      <form.Field name="product" validators={{ onChange: required("Le produit", 40) }}>
        {(field) => (
          <Field label="Produit" errors={field.state.meta.errors}>
            <input value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} list="products" />
            <datalist id="products">
              <option value="Coton graine" />
              <option value="Amandes de karité" />
              <option value="Sésame" />
              <option value="Arachide" />
            </datalist>
          </Field>
        )}
      </form.Field>

      <h2>Qualités et prix d'achat</h2>
      <form.Field name="grades" mode="array">
        {(gradesField) => (
          <>
            {gradesField.state.value.map((g, i) => (
              <div className="inline" key={g.code}>
                <form.Field name={`grades[${i}].label`}>
                  {(field) => (
                    <Field label={`Qualité ${i + 1}`}>
                      <input value={field.state.value} placeholder="(aucune)" maxLength={30} onChange={(e) => field.handleChange(e.target.value)} />
                    </Field>
                  )}
                </form.Field>
                <form.Field name={`grades[${i}].price`} validators={{ onChange: price }}>
                  {(field) => (
                    <Field label="FCFA / kg" errors={field.state.meta.errors}>
                      <input inputMode="numeric" value={field.state.value} onChange={(e) => field.handleChange(e.target.value.replace(/\D/g, ""))} />
                    </Field>
                  )}
                </form.Field>
              </div>
            ))}
            {gradesField.state.value.length < 5 && (
              <button
                type="button"
                className="btn small"
                onClick={() => gradesField.pushValue({ code: String(gradesField.state.value.length + 1), label: "", price: "" })}
              >
                + Ajouter une qualité
              </button>
            )}
          </>
        )}
      </form.Field>
      <p className="muted small">
        Prix 2025-2026 au Mali : 300 FCFA/kg pour le coton graine 1er choix. Vérifiez le prix de la campagne avant de commencer : il ne peut
        pas être modifié ensuite.
      </p>
      <form.Subscribe selector={(s) => [s.canSubmit, s.isSubmitting] as const}>
        {([canSubmit, isSubmitting]) => (
          <button type="submit" className="btn primary block" disabled={!canSubmit || isSubmitting}>
            Créer la campagne
          </button>
        )}
      </form.Subscribe>
    </form>
  );
}
