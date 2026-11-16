import { formatFCFA, formatKg, formatTime, parseKg } from "@rezote/core";
import { act, askReason, BackLink, Empty, GhostMark, NumberPad, useCanWrite } from "@rezote/core/react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { MAX_BUNDLE_G } from "../../../domain/events.ts";
import { gradeLabel } from "../../../domain/text.ts";
import { app, newId, useView } from "../../../runtime.ts";

export const Route = createFileRoute("/_app/weighings/$weighingId")({ component: WeighingScreen });

function WeighingScreen() {
  const { weighingId } = Route.useParams();
  const view = useView();
  const navigate = useNavigate();
  const canWrite = useCanWrite(app);
  const grades = [...view.grades.values()];
  const [weight, setWeight] = useState("");
  const [grade, setGrade] = useState(grades[0]?.code ?? "1");
  const [busy, setBusy] = useState(false);
  const w = view.weighingById.get(weighingId);
  if (!w) return <Empty>Pesée introuvable. Elle arrivera peut-être à la prochaine synchro.</Empty>;
  const farmer = view.farmerById.get(w.farmerId);
  const writable = canWrite && !w.closedAt && !w.cancelled;
  const grams = parseKg(weight);
  const tooHeavy = grams !== null && grams > MAX_BUNDLE_G;

  const add = async () => {
    if (!grams || tooHeavy) return;
    setBusy(true);
    const ok = await act(() => app.emit("collecte/bundle.recorded", { bundleId: newId(), weighingId: w.id, weightG: grams, grade, at: Date.now() }));
    setBusy(false);
    if (ok) setWeight("");
  };

  const close = async () => {
    if (w.bundleCount === 0 && !confirm("Aucune bâche pesée. Terminer quand même ?")) return;
    if (await act(() => app.emit("collecte/weighing.closed", { weighingId: w.id, at: Date.now() }))) {
      await navigate({ to: "/receipts/$weighingId", params: { weighingId: w.id } });
    }
  };

  return (
    <div>
      <BackLink to="/farmers/$farmerId" params={{ farmerId: w.farmerId }} label={`← ${farmer?.name ?? "Producteur"}`} />
      <div className="section-head">
        <h1>
          Reçu {w.receipt}
          <GhostMark app={app} id={w.eventId} />
        </h1>
        <span className="muted">{farmer?.village}</span>
      </div>

      <div className="stats">
        <div className="stat">
          <div className="stat-value">{formatKg(w.totalG)}</div>
          <div className="stat-label">
            Sous-total · {w.bundleCount} bâche{w.bundleCount > 1 ? "s" : ""}
          </div>
        </div>
        <div className="stat">
          <div className="stat-value">{formatFCFA(w.gross)}</div>
          <div className="stat-label">Montant brut</div>
        </div>
      </div>

      {writable && (
        <div className="card">
          <div className={`display ${tooHeavy ? "bad" : ""}`}>{weight || "0"} kg</div>
          <div className="chips">
            {grades.map((g) => (
              <button type="button" key={g.code} className={`chip ${grade === g.code ? "active" : ""}`} onClick={() => setGrade(g.code)}>
                {g.label}
              </button>
            ))}
          </div>
          <NumberPad value={weight} onInput={setWeight} maxLength={6} />
          {tooHeavy && <p className="bad">Une bâche ne peut pas dépasser 1 000 kg.</p>}
          <button type="button" className="btn primary block" disabled={!grams || tooHeavy || busy} onClick={add}>
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
            <th className="num">Poids</th>
            <th className="num">Cumul</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {w.bundles
            .slice()
            .reverse()
            .map((b) => (
              <tr key={b.id} className={b.cancelled ? "cancelled" : ""}>
                <td>
                  {b.number || "–"}
                  <GhostMark app={app} id={b.eventId} />
                </td>
                <td>{formatTime(b.at)}</td>
                <td>{gradeLabel(view, b.grade)}</td>
                <td className="num">{formatKg(b.weightG)}</td>
                <td className="num">{b.cancelled ? "" : formatKg(b.subtotalG)}</td>
                <td>
                  {canWrite && !b.cancelled && !w.cancelled && (
                    <button
                      type="button"
                      className="btn small danger"
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
      {w.bundles.length === 0 && <Empty>Tapez le poids annoncé à la bascule, puis « Ajouter la bâche ».</Empty>}

      {writable ? (
        <button type="button" className="btn block" onClick={close}>
          Terminer la pesée et voir le reçu
        </button>
      ) : (
        <Link className="btn block" to="/receipts/$weighingId" params={{ weighingId: w.id }}>
          Voir le reçu
        </Link>
      )}
    </div>
  );
}
