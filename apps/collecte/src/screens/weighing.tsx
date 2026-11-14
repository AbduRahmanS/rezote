import { formatDateTime, formatFCFA, formatKg, formatTime, navigate, parseKg } from "@rezote/core";
import { askReason, Empty, GhostMark, NumberPad, ShareButton } from "@rezote/core/ui";
import { useEffect, useRef, useState } from "preact/hooks";
import { MAX_BUNDLE_G } from "../domain/events.ts";
import { gradeLabel, receiptText } from "../domain/text.ts";
import { app, newId, role } from "../runtime.ts";
import { act, BackLink, useView } from "./common.tsx";

/** Allocates the next receipt number on this phone and opens the weighing screen. */
export function StartWeighing({ farmerId }: { farmerId: string }) {
  const view = useView();
  const started = useRef(false);
  const [error, setError] = useState("");
  const r = role.value;
  const collector = r?.kind === "collector" ? view.collectorById.get(r.collectorId) : undefined;
  const farmer = view.farmerById.get(farmerId);

  useEffect(() => {
    if (started.current || !collector || collector.duplicateCode || !farmer) return;
    started.current = true;
    (async () => {
      const space = app.currentId.value!;
      const n = await app.nextCounter(`receipt:${space}:${collector.id}`);
      const weighingId = newId();
      await app.emit("collecte/weighing.started", {
        weighingId,
        receipt: `${collector.code}-${String(n).padStart(4, "0")}`,
        farmerId,
        collectorId: collector.id,
        at: Date.now(),
      });
      location.replace(`#/weighing/${weighingId}`);
    })().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [collector, farmer, farmerId]);

  if (!farmer) return <Empty>Producteur introuvable.</Empty>;
  if (!collector)
    return (
      <div>
        <BackLink />
        <p>Seul un collecteur peut peser. Choisissez votre nom dans « Rôle ».</p>
        <a class="btn" href="#/role">
          Choisir mon rôle
        </a>
      </div>
    );
  if (collector.duplicateCode) return <p class="bad">Votre code {collector.code} est en double. Demandez au trésorier de vous en donner un autre.</p>;
  return <p class="muted">{error || "Ouverture de la pesée…"}</p>;
}

export function WeighingScreen({ id }: { id: string }) {
  const view = useView();
  const w = view.weighingById.get(id);
  const grades = [...view.grades.values()];
  const [weight, setWeight] = useState("");
  const [grade, setGrade] = useState(grades[0]?.code ?? "1");
  const [busy, setBusy] = useState(false);
  if (!w) return <Empty>Pesée introuvable. Elle arrivera peut-être à la prochaine synchro.</Empty>;
  const farmer = view.farmerById.get(w.farmerId);
  const writable = app.canWrite() && !w.closedAt && !w.cancelled;
  const grams = parseKg(weight);
  const tooHeavy = grams !== null && grams > MAX_BUNDLE_G;

  const add = async () => {
    if (!grams || tooHeavy) return;
    setBusy(true);
    const ok = await act(() =>
      app.emit("collecte/bundle.recorded", { bundleId: newId(), weighingId: w.id, weightG: grams, grade, at: Date.now() }),
    );
    setBusy(false);
    if (ok) setWeight("");
  };

  const close = async () => {
    if (w.bundleCount === 0 && !confirm("Aucune bâche pesée. Terminer quand même ?")) return;
    if (await act(() => app.emit("collecte/weighing.closed", { weighingId: w.id, at: Date.now() }))) navigate("receipt", w.id);
  };

  const live = w.bundles.slice().reverse();
  return (
    <div>
      <BackLink to={`#/farmers/${w.farmerId}`} label={`← ${farmer?.name ?? "Producteur"}`} />
      <div class="section-head">
        <h1>
          Reçu {w.receipt}
          <GhostMark app={app} id={w.eventId} />
        </h1>
        <span class="muted">{farmer?.village}</span>
      </div>

      <div class="stats">
        <div class="stat">
          <div class="stat-value">{formatKg(w.totalG)}</div>
          <div class="stat-label">
            Sous-total · {w.bundleCount} bâche{w.bundleCount > 1 ? "s" : ""}
          </div>
        </div>
        <div class="stat">
          <div class="stat-value">{formatFCFA(w.gross)}</div>
          <div class="stat-label">Montant brut</div>
        </div>
      </div>

      {writable && (
        <div class="card">
          <div class={`display ${tooHeavy ? "bad" : ""}`}>{weight || "0"} kg</div>
          <div class="chips">
            {grades.map((g) => (
              <button type="button" key={g.code} class={`chip ${grade === g.code ? "active" : ""}`} onClick={() => setGrade(g.code)}>
                {g.label}
              </button>
            ))}
          </div>
          <NumberPad value={weight} onInput={setWeight} maxLength={6} />
          {tooHeavy && <p class="bad">Une bâche ne peut pas dépasser 1 000 kg.</p>}
          <button type="button" class="btn primary block" disabled={!grams || tooHeavy || busy} onClick={add}>
            Ajouter la bâche n° {w.bundleCount + 1}
          </button>
        </div>
      )}

      <table>
        <thead>
          <tr>
            <th>N°</th>
            <th>Heure</th>
            <th>Qualité</th>
            <th class="num">Poids</th>
            <th class="num">Cumul</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {live.map((b) => (
            <tr key={b.id} class={b.cancelled ? "cancelled" : ""}>
              <td>
                {b.number || "–"}
                <GhostMark app={app} id={b.eventId} />
              </td>
              <td>{formatTime(b.at)}</td>
              <td>{gradeLabel(view, b.grade)}</td>
              <td class="num">{formatKg(b.weightG)}</td>
              <td class="num">{b.cancelled ? "" : formatKg(b.subtotalG)}</td>
              <td>
                {app.canWrite() && !b.cancelled && !w.cancelled && (
                  <button
                    type="button"
                    class="btn small danger"
                    aria-label="Annuler cette bâche"
                    onClick={() => {
                      const reason = askReason("Pourquoi annuler cette bâche ?");
                      if (reason) void act(() => app.emit("collecte/item.cancelled", { itemId: b.id, reason }));
                    }}
                  >
                    ✕
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {live.length === 0 && <Empty>Tapez le poids annoncé à la bascule, puis « Ajouter la bâche ».</Empty>}

      {writable ? (
        <button type="button" class="btn block" onClick={close}>
          Terminer la pesée et voir le reçu
        </button>
      ) : (
        <a class="btn block" href={`#/receipt/${w.id}`}>
          Voir le reçu
        </a>
      )}
    </div>
  );
}

export function ReceiptScreen({ id }: { id: string }) {
  const view = useView();
  const w = view.weighingById.get(id);
  if (!w) return <Empty>Reçu introuvable.</Empty>;
  const text = receiptText(view, w);
  const pending = [w.eventId, ...w.bundles.map((b) => b.eventId)].some((x) => app.isGhost(x));
  const r = role.value;
  const canCancel = app.canWrite() && !w.cancelled && (r?.kind === "treasurer" || (r?.kind === "collector" && r.collectorId === w.collectorId));
  return (
    <div>
      <BackLink to={`#/farmers/${w.farmerId}`} />
      <h1>Reçu {w.receipt}</h1>
      {pending && <p class="ghost-note">👻 Ce reçu n'est pas encore arrivé chez le trésorier. Il partira dès qu'il y aura du réseau.</p>}
      <div class="receipt">{text}</div>
      <div class="btn-row">
        <ShareButton class="btn primary" label="Envoyer au producteur" text={text} title={`Reçu ${w.receipt}`} />
        {!w.closedAt && !w.cancelled && app.canWrite() && (
          <a class="btn" href={`#/weighing/${w.id}`}>
            Continuer la pesée
          </a>
        )}
      </div>
      <p class="muted small">Pesée commencée le {formatDateTime(w.at)}{w.closedAt ? `, terminée à ${formatTime(w.closedAt)}` : ""}.</p>
      {canCancel && (
        <button
          type="button"
          class="btn danger block"
          onClick={() => {
            const reason = askReason("Pourquoi annuler toute cette pesée ?");
            if (reason) void act(() => app.emit("collecte/item.cancelled", { itemId: w.id, reason }));
          }}
        >
          Annuler toute la pesée
        </button>
      )}
      <p>
        <a href="#/">Accueil</a>
      </p>
    </div>
  );
}
