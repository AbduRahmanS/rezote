import { formatDate, formatDateTime, formatFCFA, formatKg, parseFCFA } from "@rezote/core";
import { act, askReason, BackLink, Empty, Field, GhostMark, Section, ShareButton, Stat, useCanWrite, useGhosts } from "@rezote/core/react";
import { useForm } from "@tanstack/react-form";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { farmerStatement, gradeLabel } from "../../../domain/text.ts";
import { app, newId, useRole, useView } from "../../../runtime.ts";

export const Route = createFileRoute("/_app/farmers/$farmerId")({ component: FarmerDetail });

const amount = z
  .string()
  .refine((s) => (parseFCFA(s) ?? 0) > 0, "Montant en FCFA, par exemple 84 000");

function MoneyForm({ farmerId, kind, onDone }: { farmerId: string; kind: "deduction" | "payment"; onDone: () => void }) {
  const form = useForm({
    defaultValues: { label: "Engrais à crédit", amount: "", method: "cash" as "cash" | "mobile_money" },
    onSubmit: async ({ value }) => {
      const at = Date.now();
      const fcfa = parseFCFA(value.amount)!;
      const ok =
        kind === "deduction"
          ? await act(() => app.emit("collecte/deduction.recorded", { deductionId: newId(), farmerId, label: value.label, amount: fcfa, at }))
          : await act(() => app.emit("collecte/payment.recorded", { paymentId: newId(), farmerId, amount: fcfa, method: value.method, at }));
      if (ok) onDone();
    },
  });
  return (
    <form
      className="card"
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
    >
      <h2>{kind === "deduction" ? "Nouvelle retenue" : "Nouveau paiement"}</h2>
      {kind === "deduction" ? (
        <form.Field name="label" validators={{ onChange: z.string().trim().min(1, "Le motif est obligatoire").max(120) }}>
          {(field) => (
            <Field label="Motif" hint="Par exemple : Engrais à crédit, 6 sacs × 14 000 FCFA" errors={field.state.meta.errors}>
              <input value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} />
            </Field>
          )}
        </form.Field>
      ) : (
        <form.Field name="method">
          {(field) => (
            <div className="chips">
              {(["cash", "mobile_money"] as const).map((m) => (
                <button type="button" key={m} className={`chip ${field.state.value === m ? "active" : ""}`} onClick={() => field.handleChange(m)}>
                  {m === "cash" ? "Espèces" : "Mobile money"}
                </button>
              ))}
            </div>
          )}
        </form.Field>
      )}
      <form.Field name="amount" validators={{ onSubmit: amount }}>
        {(field) => (
          <Field label="Montant (FCFA)" errors={field.state.meta.errors}>
            <input inputMode="numeric" value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} />
          </Field>
        )}
      </form.Field>
      <div className="btn-row">
        <button type="button" className="btn" onClick={onDone}>
          Annuler
        </button>
        <button type="submit" className="btn primary">
          Enregistrer
        </button>
      </div>
    </form>
  );
}

function cancel(itemId: string) {
  const reason = askReason();
  if (reason) void act(() => app.emit("collecte/item.cancelled", { itemId, reason }));
}

function FarmerDetail() {
  const { farmerId } = Route.useParams();
  const view = useView();
  const ghosts = useGhosts(app);
  const writable = useCanWrite(app);
  const role = useRole();
  const [form, setForm] = useState<null | "deduction" | "payment">(null);
  const f = view.farmerById.get(farmerId);
  if (!f) return <Empty>Producteur introuvable.</Empty>;
  const treasurer = writable && role?.kind === "treasurer";
  const collector = writable && role?.kind === "collector";
  const ghost = (id: string) => (ghosts.has(id) ? "is-ghost" : "");
  return (
    <div>
      <BackLink to="/farmers" />
      <h1>
        {f.name}
        <GhostMark app={app} id={f.eventId} />
      </h1>
      <p className="muted">{f.village}</p>
      <div className="stats">
        <Stat label="Poids total" value={formatKg(f.totalG)} />
        <Stat label="Montant brut" value={formatFCFA(f.gross)} />
        <Stat label="Retenues" value={formatFCFA(f.deductionsTotal)} />
        <Stat label="Reste à payer" value={formatFCFA(f.balance)} tone={f.balance < 0 ? "bad" : f.balance > 0 ? "warn" : "ok"} />
      </div>
      <p className="muted small">
        {Object.entries(f.weightByGrade)
          .map(([code, g]) => `${gradeLabel(view, code)} : ${formatKg(g)}`)
          .join(" · ")}
      </p>
      <div className="btn-row">
        {collector && (
          <Link className="btn primary" to="/weigh/$farmerId" params={{ farmerId: f.id }}>
            ⚖️ Nouvelle pesée
          </Link>
        )}
        <ShareButton label="Envoyer le relevé" text={() => farmerStatement(view, f)} />
      </div>

      <Section title="Pesées">
        {f.weighings.length === 0 && <Empty>Aucune pesée.</Empty>}
        <ul className="list">
          {f.weighings.map((w) => (
            <li key={w.id}>
              <Link className={`row ${w.cancelled ? "cancelled" : ""} ${ghost(w.eventId)}`} to="/receipts/$weighingId" params={{ weighingId: w.id }}>
                <span className="row-main">
                  <span className="row-title">
                    {w.receipt}
                    <GhostMark app={app} id={[w.eventId, ...w.bundles.map((b) => b.eventId)]} />
                  </span>
                  <span className="row-sub">
                    {formatDateTime(w.at)} · {w.bundleCount} bâches
                  </span>
                </span>
                <span className="row-end">{formatKg(w.totalG)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        title="Retenues"
        action={
          treasurer && (
            <button type="button" className="btn small" onClick={() => setForm("deduction")}>
              + Retenue
            </button>
          )
        }
      >
        {form === "deduction" && <MoneyForm farmerId={f.id} kind="deduction" onDone={() => setForm(null)} />}
        {f.deductions.length === 0 && <p className="muted small">Aucune retenue.</p>}
        <ul className="list">
          {f.deductions.map((d) => (
            <li key={d.id}>
              <div className={`row ${d.cancelled ? "cancelled" : ""} ${ghost(d.eventId)}`}>
                <span className="row-main">
                  <span className="row-title">
                    {d.label}
                    <GhostMark app={app} id={d.eventId} />
                  </span>
                  <span className="row-sub">{d.cancelled ? `Annulé : ${d.cancelled}` : formatDate(d.at)}</span>
                </span>
                <span className="row-end">
                  {formatFCFA(d.amount)}
                  {treasurer && !d.cancelled && (
                    <button type="button" className="btn small danger" onClick={() => cancel(d.id)} aria-label="Annuler la retenue">
                      ✕
                    </button>
                  )}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        title="Paiements"
        action={
          treasurer && (
            <button type="button" className="btn small" onClick={() => setForm("payment")}>
              + Paiement
            </button>
          )
        }
      >
        {form === "payment" && <MoneyForm farmerId={f.id} kind="payment" onDone={() => setForm(null)} />}
        {f.payments.length === 0 && <p className="muted small">Aucun paiement.</p>}
        <ul className="list">
          {f.payments.map((p) => (
            <li key={p.id}>
              <div className={`row ${p.cancelled ? "cancelled" : ""} ${ghost(p.eventId)}`}>
                <span className="row-main">
                  <span className="row-title">
                    {p.method === "cash" ? "Espèces" : "Mobile money"}
                    <GhostMark app={app} id={p.eventId} />
                  </span>
                  <span className="row-sub">{p.cancelled ? `Annulé : ${p.cancelled}` : formatDate(p.at)}</span>
                </span>
                <span className="row-end">
                  {formatFCFA(p.amount)}
                  {treasurer && !p.cancelled && (
                    <button type="button" className="btn small danger" onClick={() => cancel(p.id)} aria-label="Annuler le paiement">
                      ✕
                    </button>
                  )}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
