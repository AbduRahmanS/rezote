import { act, Field, PageHeader } from "@rezote/core/react";
import { Button } from "@rezote/ui/components/button";
import { Input } from "@rezote/ui/components/input";
import { useForm } from "@tanstack/react-form";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
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
      const grades = value.grades.filter((g) => g.label.trim()).map((g) => ({ code: g.code, label: g.label.trim(), pricePerKg: Number(g.price) }));
      if (grades.length === 0) return;
      const ok = await act(async () => {
        const space = await app.createSpace(`${value.cooperative} · ${value.name}`);
        await app.emit("collecte/campaign.created", { cooperative: value.cooperative, name: value.name, product: value.product, grades }, space);
        await setRole({ kind: "treasurer" });
      }, "Campagne créée");
      if (ok) await navigate({ to: "/collectors" });
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
      <PageHeader title="Nouvelle campagne" back={{ to: "/" }} description="Les prix ne peuvent plus être modifiés une fois la campagne créée." />
      <form.Field name="cooperative" validators={{ onChange: required("Le nom de la coopérative", 80) }}>
        {(field) => (
          <Field label="Coopérative" errors={field.state.meta.errors}>
            <Input value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} placeholder="Coopérative de Kignan" />
          </Field>
        )}
      </form.Field>
      <form.Field name="name" validators={{ onChange: required("Le nom de la campagne", 80) }}>
        {(field) => (
          <Field label="Campagne" errors={field.state.meta.errors}>
            <Input value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} />
          </Field>
        )}
      </form.Field>
      <form.Field name="product" validators={{ onChange: required("Le produit", 40) }}>
        {(field) => (
          <Field label="Produit" errors={field.state.meta.errors}>
            <Input value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} list="products" />
            <datalist id="products">
              <option value="Coton graine" />
              <option value="Amandes de karité" />
              <option value="Sésame" />
              <option value="Arachide" />
            </datalist>
          </Field>
        )}
      </form.Field>

      <fieldset className="grid gap-3 rounded-lg border bg-card p-3">
        <legend className="px-1 text-sm font-semibold">Qualités et prix d'achat</legend>
        <form.Field name="grades" mode="array">
          {(gradesField) => (
            <>
              {gradesField.state.value.map((g, i) => (
                <div className="grid grid-cols-[1fr_7.5rem] gap-2" key={g.code}>
                  <form.Field name={`grades[${i}].label`}>
                    {(field) => (
                      <Field label={`Qualité ${i + 1}`}>
                        <Input value={field.state.value} placeholder="(aucune)" maxLength={30} onChange={(e) => field.handleChange(e.target.value)} />
                      </Field>
                    )}
                  </form.Field>
                  <form.Field name={`grades[${i}].price`} validators={{ onChange: price }}>
                    {(field) => (
                      <Field label="FCFA / kg" errors={field.state.meta.errors}>
                        <Input inputMode="numeric" className="tabular-nums" value={field.state.value} onChange={(e) => field.handleChange(e.target.value.replace(/\D/g, ""))} />
                      </Field>
                    )}
                  </form.Field>
                </div>
              ))}
              {gradesField.state.value.length < 5 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="justify-self-start"
                  onClick={() => gradesField.pushValue({ code: String(gradesField.state.value.length + 1), label: "", price: "" })}
                >
                  <Plus aria-hidden />
                  Ajouter une qualité
                </Button>
              )}
            </>
          )}
        </form.Field>
        <p className="text-xs text-muted-foreground">Prix 2025-2026 au Mali : 300 FCFA/kg pour le coton graine 1er choix.</p>
      </fieldset>

      <form.Subscribe selector={(s) => [s.canSubmit, s.isSubmitting] as const}>
        {([canSubmit, isSubmitting]) => (
          <Button type="submit" size="lg" disabled={!canSubmit || isSubmitting}>
            Créer la campagne
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
}
