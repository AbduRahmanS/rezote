import { parseFCFA } from "@rezote/core";
import { act, BackLink, Field } from "@rezote/core/react";
import { useForm } from "@tanstack/react-form";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
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
      if (await act(() => app.emit("route/advance.added", { advanceId: newId(), tripId, amount, method: value.method, at: Date.now() }))) {
        await navigate({ to: "/trips/$tripId", params: { tripId } });
      }
    },
  });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
    >
      <BackLink to="/trips/$tripId" params={{ tripId }} />
      <h1>Nouvelle avance</h1>
      <form.Field name="method">
        {(field) => (
          <div className="chips">
            {(["mobile_money", "cash"] as const).map((m) => (
              <button type="button" key={m} className={`chip ${field.state.value === m ? "active" : ""}`} onClick={() => field.handleChange(m)}>
                {m === "cash" ? "Espèces" : "Mobile money"}
              </button>
            ))}
          </div>
        )}
      </form.Field>
      <form.Field name="amount" validators={{ onSubmit: z.string().refine((s) => (parseFCFA(s) ?? 0) > 0, "Montant en FCFA, par exemple 50 000") }}>
        {(field) => (
          <Field label="Montant (FCFA)" errors={field.state.meta.errors}>
            <input inputMode="numeric" value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} />
          </Field>
        )}
      </form.Field>
      <button type="submit" className="btn primary block">
        Enregistrer
      </button>
    </form>
  );
}
