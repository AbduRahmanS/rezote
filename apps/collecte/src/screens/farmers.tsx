import { formatDate, formatDateTime, formatFCFA, formatKg, navigate, parseFCFA, route } from "@rezote/core";
import { askReason, Empty, Field, GhostMark, Section, ShareButton, Stat } from "@rezote/core/ui";
import { useState } from "preact/hooks";
import { farmerStatement, gradeLabel } from "../domain/text.ts";
import { app, newId, role } from "../runtime.ts";
import { act, BackLink, useView } from "./common.tsx";

const normalize = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export function FarmerList({ pick = false }: { pick?: boolean }) {
  const view = useView();
  const [q, setQ] = useState("");
  const needle = normalize(q.trim());
  const list = needle ? view.farmers.filter((f) => normalize(`${f.name} ${f.village}`).includes(needle)) : view.farmers;
  const canAdd = app.canWrite();
  return (
    <div>
      <BackLink />
      <h1>{pick ? "Peser pour quel producteur ?" : "Producteurs"}</h1>
      <input type="search" placeholder="Rechercher un nom ou un village" value={q} onInput={(e) => setQ(e.currentTarget.value)} />
      {canAdd && (
        <a class="btn block" href={pick ? "#/farmers/new/pick" : "#/farmers/new"}>
          + Nouveau producteur
        </a>
      )}
      <ul class="list" style={{ marginTop: ".8rem" }}>
        {list.map((f) => (
          <li key={f.id}>
            <a class={`row ${app.isGhost(f.eventId) ? "is-ghost" : ""}`} href={pick ? `#/weigh/${f.id}` : `#/farmers/${f.id}`}>
              <span class="row-main">
                <span class="row-title">
                  {f.name}
                  <GhostMark app={app} id={f.eventId} />
                </span>
                <span class="row-sub">
                  {f.village} · {formatKg(f.totalG)}
                </span>
              </span>
              {!pick && <span class={`row-end ${f.balance < 0 ? "bad" : ""}`}>{formatFCFA(f.balance)}</span>}
            </a>
          </li>
        ))}
      </ul>
      {list.length === 0 && <Empty>{q ? "Aucun producteur trouvé." : "Aucun producteur enregistré."}</Empty>}
    </div>
  );
}

export function AddFarmer() {
  const view = useView();
  const pick = route.value[2] === "pick";
  const villages = [...new Set(view.farmers.map((f) => f.village))].sort();
  const [name, setName] = useState("");
  const [village, setVillage] = useState(villages.length === 1 ? villages[0]! : "");
  const submit = async (e: Event) => {
    e.preventDefault();
    const farmerId = newId();
    const ok = await act(() => app.emit("collecte/farmer.registered", { farmerId, name, village }));
    if (ok) navigate(pick ? "weigh" : "farmers", farmerId);
  };
  return (
    <form onSubmit={submit}>
      <BackLink to={pick ? "#/pick" : "#/farmers"} />
      <h1>Nouveau producteur</h1>
      <Field label="Nom du chef d'exploitation">
        <input required maxLength={80} value={name} onInput={(e) => setName(e.currentTarget.value)} placeholder="Moussa Coulibaly" />
      </Field>
      <Field label="Village">
        <input required maxLength={60} list="villages" value={village} onInput={(e) => setVillage(e.currentTarget.value)} />
        <datalist id="villages">
          {villages.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
      </Field>
      <button type="submit" class="btn primary block">
        {pick ? "Enregistrer et peser" : "Enregistrer"}
      </button>
    </form>
  );
}

function MoneyForm({ farmerId, kind, onDone }: { farmerId: string; kind: "deduction" | "payment"; onDone: () => void }) {
  const [label, setLabel] = useState("Engrais à crédit");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"cash" | "mobile_money">("cash");
  const submit = async (e: Event) => {
    e.preventDefault();
    const value = parseFCFA(amount);
    if (!value || value <= 0) return window.alert("Montant invalide.");
    const at = Date.now();
    const ok =
      kind === "deduction"
        ? await act(() => app.emit("collecte/deduction.recorded", { deductionId: newId(), farmerId, label, amount: value, at }))
        : await act(() => app.emit("collecte/payment.recorded", { paymentId: newId(), farmerId, amount: value, method, at }));
    if (ok) onDone();
  };
  return (
    <form class="card" onSubmit={submit}>
      <h2>{kind === "deduction" ? "Nouvelle retenue" : "Nouveau paiement"}</h2>
      {kind === "deduction" ? (
        <Field label="Motif" hint="Par exemple : Engrais à crédit, 6 sacs × 14 000 FCFA">
          <input required maxLength={120} value={label} onInput={(e) => setLabel(e.currentTarget.value)} />
        </Field>
      ) : (
        <div class="chips">
          <button type="button" class={`chip ${method === "cash" ? "active" : ""}`} onClick={() => setMethod("cash")}>
            Espèces
          </button>
          <button type="button" class={`chip ${method === "mobile_money" ? "active" : ""}`} onClick={() => setMethod("mobile_money")}>
            Mobile money
          </button>
        </div>
      )}
      <Field label="Montant (FCFA)">
        <input required inputMode="numeric" value={amount} onInput={(e) => setAmount(e.currentTarget.value)} />
      </Field>
      <div class="btn-row">
        <button type="button" class="btn" onClick={onDone}>
          Annuler
        </button>
        <button type="submit" class="btn primary">
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

export function FarmerDetail({ id }: { id: string }) {
  const view = useView();
  const f = view.farmerById.get(id);
  const [form, setForm] = useState<null | "deduction" | "payment">(null);
  if (!f) return <Empty>Producteur introuvable.</Empty>;
  const r = role.value;
  const treasurer = app.canWrite() && r?.kind === "treasurer";
  const collector = app.canWrite() && r?.kind === "collector";
  return (
    <div>
      <BackLink to="#/farmers" />
      <h1>
        {f.name}
        <GhostMark app={app} id={f.eventId} />
      </h1>
      <p class="muted">{f.village}</p>
      <div class="stats">
        <Stat label="Poids total" value={formatKg(f.totalG)} />
        <Stat label="Montant brut" value={formatFCFA(f.gross)} />
        <Stat label="Retenues" value={formatFCFA(f.deductionsTotal)} />
        <Stat label="Reste à payer" value={formatFCFA(f.balance)} tone={f.balance < 0 ? "bad" : f.balance > 0 ? "warn" : "ok"} />
      </div>
      <p class="muted small">
        {Object.entries(f.weightByGrade)
          .map(([code, g]) => `${gradeLabel(view, code)} : ${formatKg(g)}`)
          .join(" · ")}
      </p>
      <div class="btn-row">
        {collector && (
          <a class="btn primary" href={`#/weigh/${f.id}`}>
            ⚖️ Nouvelle pesée
          </a>
        )}
        <ShareButton label="Envoyer le relevé" text={() => farmerStatement(view, f)} />
      </div>

      <Section title="Pesées">
        {f.weighings.length === 0 && <Empty>Aucune pesée.</Empty>}
        <ul class="list">
          {f.weighings.map((w) => (
            <li key={w.id}>
              <a class={`row ${w.cancelled ? "cancelled" : ""} ${app.isGhost(w.eventId) ? "is-ghost" : ""}`} href={`#/receipt/${w.id}`}>
                <span class="row-main">
                  <span class="row-title">
                    {w.receipt}
                    <GhostMark app={app} id={[w.eventId, ...w.bundles.map((b) => b.eventId)]} />
                  </span>
                  <span class="row-sub">
                    {formatDateTime(w.at)} · {w.bundleCount} bâches
                  </span>
                </span>
                <span class="row-end">{formatKg(w.totalG)}</span>
              </a>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        title="Retenues"
        action={
          treasurer && (
            <button type="button" class="btn small" onClick={() => setForm("deduction")}>
              + Retenue
            </button>
          )
        }
      >
        {form === "deduction" && <MoneyForm farmerId={f.id} kind="deduction" onDone={() => setForm(null)} />}
        {f.deductions.length === 0 && <p class="muted small">Aucune retenue.</p>}
        <ul class="list">
          {f.deductions.map((d) => (
            <li key={d.id}>
              <div class={`row ${d.cancelled ? "cancelled" : ""} ${app.isGhost(d.eventId) ? "is-ghost" : ""}`}>
                <span class="row-main">
                  <span class="row-title">
                    {d.label}
                    <GhostMark app={app} id={d.eventId} />
                  </span>
                  <span class="row-sub">{d.cancelled ? `Annulé : ${d.cancelled}` : formatDate(d.at)}</span>
                </span>
                <span class="row-end">
                  {formatFCFA(d.amount)}
                  {treasurer && !d.cancelled && (
                    <button type="button" class="btn small danger" onClick={() => cancel(d.id)} aria-label="Annuler la retenue">
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
            <button type="button" class="btn small" onClick={() => setForm("payment")}>
              + Paiement
            </button>
          )
        }
      >
        {form === "payment" && <MoneyForm farmerId={f.id} kind="payment" onDone={() => setForm(null)} />}
        {f.payments.length === 0 && <p class="muted small">Aucun paiement.</p>}
        <ul class="list">
          {f.payments.map((p) => (
            <li key={p.id}>
              <div class={`row ${p.cancelled ? "cancelled" : ""} ${app.isGhost(p.eventId) ? "is-ghost" : ""}`}>
                <span class="row-main">
                  <span class="row-title">
                    {p.method === "cash" ? "Espèces" : "Mobile money"}
                    <GhostMark app={app} id={p.eventId} />
                  </span>
                  <span class="row-sub">{p.cancelled ? `Annulé : ${p.cancelled}` : formatDate(p.at)}</span>
                </span>
                <span class="row-end">
                  {formatFCFA(p.amount)}
                  {treasurer && !p.cancelled && (
                    <button type="button" class="btn small danger" onClick={() => cancel(p.id)} aria-label="Annuler le paiement">
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
