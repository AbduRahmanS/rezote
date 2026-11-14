import { formatDate, formatFCFA, formatKg, formatTonnes, navigate, parseKg } from "@rezote/core";
import { askReason, downloadFile, Empty, Field, GhostMark, NumberPad, Section, Stat, toCsv } from "@rezote/core/ui";
import { useState } from "preact/hooks";
import { COLLECTOR_CODE } from "../domain/events.ts";
import { balancesCsv, bundlesCsv, gradeLabel } from "../domain/text.ts";
import { app, newId, role } from "../runtime.ts";
import { act, BackLink, useView } from "./common.tsx";

const pct = (n: number | null) => (n === null ? "–" : `${n > 0 ? "+" : ""}${n.toFixed(1).replace(".", ",")} %`);

export function Dashboard() {
  const view = useView();
  const { totals, campaign } = view;
  const writable = app.canWrite() && role.value?.kind === "treasurer";
  return (
    <div>
      <h1>{campaign!.name}</h1>
      <p class="muted">
        {campaign!.cooperative} · {campaign!.product} ·{" "}
        {campaign!.grades.map((g) => `${g.label} ${g.pricePerKg} F/kg`).join(" · ")}
      </p>

      <div class="stats">
        <Stat label="Pesé au village" value={formatTonnes(totals.weighedG)} />
        <Stat label="Reste au magasin" value={formatTonnes(totals.inStoreG)} tone={totals.inStoreG < 0 ? "bad" : undefined} />
        <Stat label="Montant brut" value={formatFCFA(totals.gross)} />
        <Stat label="Reste à payer" value={formatFCFA(totals.balance)} tone={totals.balance > 0 ? "warn" : "ok"} />
        <Stat label="Écart usine" value={totals.gapPct === null ? "–" : `${formatKg(totals.gapG)} (${pct(totals.gapPct)})`} tone={totals.gapPct !== null && totals.gapPct < -1 ? "bad" : undefined} />
        <Stat label="Alertes" value={view.flags.length} tone={view.flags.length ? "warn" : "ok"} />
      </div>

      <div class="grid-buttons">
        <a class="btn" href="#/farmers">
          <span class="emoji">👨🏾‍🌾</span>Producteurs
        </a>
        <a class="btn" href="#/collectors">
          <span class="emoji">⚖️</span>Collecteurs
        </a>
        <a class="btn" href="#/loads">
          <span class="emoji">🚚</span>Chargements
        </a>
        <a class="btn" href="#/flags">
          <span class="emoji">⚠️</span>Alertes
        </a>
        <a class="btn" href="#/export">
          <span class="emoji">📄</span>Export
        </a>
        <a class="btn" href="#/role">
          <span class="emoji">👤</span>Rôle
        </a>
      </div>

      <Section title="Par village">
        {view.byVillage.length === 0 ? (
          <Empty>Aucun producteur pour le moment.</Empty>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Village</th>
                <th class="num">Prod.</th>
                <th class="num">Poids</th>
                <th class="num">Reste à payer</th>
              </tr>
            </thead>
            <tbody>
              {view.byVillage.map((v) => (
                <tr key={v.village}>
                  <td>{v.village}</td>
                  <td class="num">{v.farmers}</td>
                  <td class="num">{formatKg(v.totalG)}</td>
                  <td class="num">{formatFCFA(v.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title="Par collecteur">
        <table>
          <tbody>
            {view.byCollector.map((c) => (
              <tr key={c.collector.id}>
                <td>
                  {c.collector.name} ({c.collector.code})
                </td>
                <td class="num">{c.weighings} reçus</td>
                <td class="num">{c.bundles} bâches</td>
                <td class="num">{formatKg(c.totalG)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
      {!writable && <p class="muted small">Vue de consultation.</p>}
    </div>
  );
}

export function Collectors() {
  const view = useView();
  const [name, setName] = useState("");
  const used = new Set(view.collectors.map((c) => c.code));
  let next = 1;
  while (used.has(`K${next}`)) next++;
  const [code, setCode] = useState("");
  const effectiveCode = (code || `K${next}`).toUpperCase();

  const add = async (e: Event) => {
    e.preventDefault();
    if (!COLLECTOR_CODE.test(effectiveCode)) return window.alert("Le code doit avoir 1 à 4 lettres ou chiffres, par exemple K3.");
    if (used.has(effectiveCode)) return window.alert(`Le code ${effectiveCode} est déjà pris.`);
    const ok = await act(() => app.emit("collecte/collector.added", { collectorId: newId(), name, code: effectiveCode }));
    if (ok) {
      setName("");
      setCode("");
    }
  };

  return (
    <div>
      <BackLink />
      <h1>Collecteurs</h1>
      <p class="muted">Chaque collecteur a un code. Les numéros de reçu commencent par ce code (par exemple K2-0042), donc ils ne se répètent jamais d'un téléphone à l'autre.</p>
      <ul class="list">
        {view.collectors.map((c) => (
          <li key={c.id}>
            <div class={`row ${app.isGhost(c.eventId) ? "is-ghost" : ""}`}>
              <span class="row-title">
                {c.name}
                <GhostMark app={app} id={c.eventId} />
              </span>
              <span class={c.duplicateCode ? "bad" : "muted"}>{c.duplicateCode ? `${c.code} (doublon)` : c.code}</span>
            </div>
          </li>
        ))}
      </ul>
      {view.collectors.length === 0 && <Empty>Ajoutez au moins un collecteur, puis envoyez-lui le lien d'écriture (menu ☰ → Partager).</Empty>}
      {app.canWrite() && (
        <form class="card" onSubmit={add}>
          <h2>Ajouter un collecteur</h2>
          <div class="inline">
            <Field label="Nom">
              <input required maxLength={60} value={name} onInput={(e) => setName(e.currentTarget.value)} placeholder="Adama Koné" />
            </Field>
            <Field label="Code">
              <input maxLength={4} value={code} placeholder={`K${next}`} onInput={(e) => setCode(e.currentTarget.value.toUpperCase())} />
            </Field>
          </div>
          <button type="submit" class="btn primary block">
            Ajouter
          </button>
        </form>
      )}
      <button type="button" class="btn block" onClick={() => navigate()}>
        Terminé
      </button>
    </div>
  );
}

export function Loads() {
  const view = useView();
  const [mode, setMode] = useState<null | "dispatch" | { receive: string }>(null);
  const [plate, setPlate] = useState("");
  const [weight, setWeight] = useState("");
  const writable = app.canWrite();

  const submit = async () => {
    const grams = parseKg(weight);
    if (!grams) return window.alert("Poids invalide.");
    const ok =
      mode === "dispatch"
        ? await act(() => app.emit("collecte/load.dispatched", { loadId: newId(), plate, villageWeightG: grams, at: Date.now() }))
        : mode && typeof mode === "object"
          ? await act(() => app.emit("collecte/load.received", { loadId: mode.receive, factoryWeightG: grams, at: Date.now() }))
          : false;
    if (ok) {
      setMode(null);
      setWeight("");
      setPlate("");
    }
  };

  if (mode) {
    const receiving = typeof mode === "object" ? view.loads.find((l) => l.id === mode.receive) : null;
    return (
      <div>
        <h1>{receiving ? `Poids à l'usine · ${receiving.plate}` : "Nouveau chargement"}</h1>
        {!receiving && (
          <Field label="Immatriculation du camion">
            <input required maxLength={20} value={plate} onInput={(e) => setPlate(e.currentTarget.value.toUpperCase())} placeholder="AB-1234-MD" />
          </Field>
        )}
        <p class="muted">
          {receiving
            ? `Poids au départ du village : ${formatKg(receiving.villageWeightG)}`
            : `Au magasin : ${formatKg(view.totals.inStoreG)}`}
        </p>
        <div class="display">{weight || "0"} kg</div>
        <NumberPad value={weight} onInput={setWeight} maxLength={7} />
        <div class="btn-row">
          <button type="button" class="btn" onClick={() => setMode(null)}>
            Annuler
          </button>
          <button type="button" class="btn primary" disabled={!parseKg(weight) || (!receiving && !plate.trim())} onClick={submit}>
            Enregistrer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <BackLink />
      <h1>Chargements</h1>
      <div class="stats">
        <Stat label="Pesé au village" value={formatKg(view.totals.weighedG)} />
        <Stat label="Parti du magasin" value={formatKg(view.totals.dispatchedG)} />
        <Stat label="Reste au magasin" value={formatKg(view.totals.inStoreG)} />
        <Stat label="Écart usine" value={pct(view.totals.gapPct)} tone={view.totals.gapPct !== null && view.totals.gapPct < -1 ? "bad" : undefined} />
      </div>
      {writable && (
        <button type="button" class="btn primary block" onClick={() => setMode("dispatch")}>
          🚚 Nouveau chargement
        </button>
      )}
      <ul class="list" style={{ marginTop: "1rem" }}>
        {view.loads.map((l) => (
          <li key={l.id}>
            <div class={`card ${l.cancelled ? "cancelled" : ""} ${app.isGhost(l.eventId) ? "is-ghost" : ""}`}>
              <div class="section-head">
                <strong>
                  {l.plate} · {formatDate(l.at)}
                  <GhostMark app={app} id={[l.eventId, l.received?.eventId ?? ""]} />
                </strong>
                <span>{formatKg(l.villageWeightG)}</span>
              </div>
              {l.received ? (
                <p class={l.gapPct !== null && l.gapPct < -1 ? "bad" : "muted"}>
                  Usine : {formatKg(l.received.factoryWeightG)} · écart {formatKg(l.gapG!)} ({pct(l.gapPct)})
                </p>
              ) : (
                <p class="muted">Pas encore pesé à l'usine.</p>
              )}
              {l.cancelled && <p class="bad">Annulé : {l.cancelled}</p>}
              {writable && !l.cancelled && (
                <div class="btn-row">
                  {!l.received && (
                    <button type="button" class="btn small" onClick={() => setMode({ receive: l.id })}>
                      Poids usine
                    </button>
                  )}
                  <button
                    type="button"
                    class="btn small danger"
                    onClick={() => {
                      const reason = askReason();
                      if (reason) void act(() => app.emit("collecte/item.cancelled", { itemId: l.id, reason }));
                    }}
                  >
                    Annuler
                  </button>
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
      {view.loads.length === 0 && <Empty>Aucun chargement.</Empty>}
    </div>
  );
}

export function Flags() {
  const view = useView();
  return (
    <div>
      <BackLink />
      <h1>Alertes</h1>
      {view.flags.length === 0 && <Empty>Aucune alerte. ✓</Empty>}
      <ul class="list">
        {view.flags.map((f, i) => (
          <li key={i}>
            <a
              class={`row flag ${f.kind === "receipt-collision" || f.kind === "negative-balance" ? "bad" : ""}`}
              href={f.weighingId ? `#/receipt/${f.weighingId}` : f.farmerId ? `#/farmers/${f.farmerId}` : "#/flags"}
            >
              <span>{f.message}</span>
              <span class="muted">›</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Export() {
  const view = useView();
  const slug = (view.campaign?.name ?? "campagne").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return (
    <div>
      <BackLink />
      <h1>Export</h1>
      <p class="muted">Fichiers CSV (séparateur point-virgule) pour Excel ou LibreOffice.</p>
      <button type="button" class="btn block" onClick={() => downloadFile(`${slug}-pesees.csv`, toCsv(bundlesCsv(view)))}>
        Toutes les pesées (bâche par bâche)
      </button>
      <button type="button" class="btn block" onClick={() => downloadFile(`${slug}-soldes.csv`, toCsv(balancesCsv(view)))}>
        Soldes des producteurs
      </button>
      <Section title="Qualités">
        <ul>
          {[...view.grades.values()].map((g) => (
            <li key={g.code}>
              {gradeLabel(view, g.code)} : {formatKg(view.totals.weightByGrade[g.code] ?? 0)}
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
