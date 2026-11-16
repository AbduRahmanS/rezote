import { formatDate, formatKg, parseKg } from "@rezote/core";
import { act, askReason, BackLink, Empty, Field, GhostMark, NumberPad, Stat, useCanWrite, useGhosts } from "@rezote/core/react";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { pct } from "../../components/format.ts";
import { app, newId, useView } from "../../runtime.ts";

const search = z.object({
  /** "dispatch" to record a truck leaving, or a load ID to record its factory weight. */
  mode: z.string().optional(),
});

export const Route = createFileRoute("/_app/loads")({ validateSearch: search, component: Loads });

function LoadForm({ receivingId, onDone }: { receivingId: string | null; onDone: () => void }) {
  const view = useView();
  const receiving = receivingId ? view.loads.find((l) => l.id === receivingId) : null;
  const [plate, setPlate] = useState("");
  const [weight, setWeight] = useState("");
  const grams = parseKg(weight);
  const submit = async () => {
    if (!grams) return;
    const ok = receiving
      ? await act(() => app.emit("collecte/load.received", { loadId: receiving.id, factoryWeightG: grams, at: Date.now() }))
      : await act(() => app.emit("collecte/load.dispatched", { loadId: newId(), plate, villageWeightG: grams, at: Date.now() }));
    if (ok) onDone();
  };
  return (
    <div>
      <h1>{receiving ? `Poids à l'usine · ${receiving.plate}` : "Nouveau chargement"}</h1>
      {!receiving && (
        <Field label="Immatriculation du camion">
          <input maxLength={20} value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())} placeholder="AB-1234-MD" />
        </Field>
      )}
      <p className="muted">{receiving ? `Poids au départ du village : ${formatKg(receiving.villageWeightG)}` : `Au magasin : ${formatKg(view.totals.inStoreG)}`}</p>
      <div className="display">{weight || "0"} kg</div>
      <NumberPad value={weight} onInput={setWeight} maxLength={7} />
      <div className="btn-row">
        <button type="button" className="btn" onClick={onDone}>
          Annuler
        </button>
        <button type="button" className="btn primary" disabled={!grams || (!receiving && !plate.trim())} onClick={submit}>
          Enregistrer
        </button>
      </div>
    </div>
  );
}

function Loads() {
  const view = useView();
  const ghosts = useGhosts(app);
  const writable = useCanWrite(app);
  const { mode } = Route.useSearch();
  const navigate = Route.useNavigate();
  const setMode = (m: string | undefined) => void navigate({ search: { mode: m } });

  if (mode) return <LoadForm receivingId={mode === "dispatch" ? null : mode} onDone={() => setMode(undefined)} />;

  return (
    <div>
      <BackLink />
      <h1>Chargements</h1>
      <div className="stats">
        <Stat label="Pesé au village" value={formatKg(view.totals.weighedG)} />
        <Stat label="Parti du magasin" value={formatKg(view.totals.dispatchedG)} />
        <Stat label="Reste au magasin" value={formatKg(view.totals.inStoreG)} />
        <Stat label="Écart usine" value={pct(view.totals.gapPct)} tone={view.totals.gapPct !== null && view.totals.gapPct < -1 ? "bad" : undefined} />
      </div>
      {writable && (
        <button type="button" className="btn primary block" onClick={() => setMode("dispatch")}>
          🚚 Nouveau chargement
        </button>
      )}
      <ul className="list" style={{ marginTop: "1rem" }}>
        {view.loads.map((l) => (
          <li key={l.id}>
            <div className={`card ${l.cancelled ? "cancelled" : ""} ${ghosts.has(l.eventId) ? "is-ghost" : ""}`}>
              <div className="section-head">
                <strong>
                  {l.plate} · {formatDate(l.at)}
                  <GhostMark app={app} id={[l.eventId, l.received?.eventId]} />
                </strong>
                <span>{formatKg(l.villageWeightG)}</span>
              </div>
              {l.received ? (
                <p className={l.gapPct !== null && l.gapPct < -1 ? "bad" : "muted"}>
                  Usine : {formatKg(l.received.factoryWeightG)} · écart {formatKg(l.gapG!)} ({pct(l.gapPct)})
                </p>
              ) : (
                <p className="muted">Pas encore pesé à l'usine.</p>
              )}
              {l.cancelled && <p className="bad">Annulé : {l.cancelled}</p>}
              {writable && !l.cancelled && (
                <div className="btn-row">
                  {!l.received && (
                    <button type="button" className="btn small" onClick={() => setMode(l.id)}>
                      Poids usine
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn small danger"
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
