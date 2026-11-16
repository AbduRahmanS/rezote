import { formatDate, formatKg, parseKg } from "@rezote/core";
import { act, askReason, Empty, Field, GhostMark, NumberPad, PageHeader, Stat, StatGrid, useCanWrite, useGhosts } from "@rezote/core/react";
import { Badge } from "@rezote/ui/components/badge";
import { Button } from "@rezote/ui/components/button";
import { Input } from "@rezote/ui/components/input";
import { cn } from "@rezote/ui/lib/utils";
import { createFileRoute } from "@tanstack/react-router";
import { Factory, Plus, Truck } from "lucide-react";
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
      ? await act(() => app.emit("collecte/load.received", { loadId: receiving.id, factoryWeightG: grams, at: Date.now() }), "Poids usine enregistré")
      : await act(() => app.emit("collecte/load.dispatched", { loadId: newId(), plate, villageWeightG: grams, at: Date.now() }), "Chargement enregistré");
    if (ok) onDone();
  };
  return (
    <div>
      <PageHeader
        title={receiving ? "Poids à l'usine" : "Nouveau chargement"}
        description={receiving ? `${receiving.plate} · parti avec ${formatKg(receiving.villageWeightG)}` : `Au magasin : ${formatKg(view.totals.inStoreG)}`}
      />
      <div className="grid gap-3">
        {!receiving && (
          <Field label="Immatriculation du camion">
            <Input className="font-mono uppercase" maxLength={20} value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())} placeholder="AB-1234-MD" />
          </Field>
        )}
        <div className={cn("flex h-16 items-center justify-center gap-2 rounded-md bg-muted text-4xl font-semibold tabular-nums", !weight && "text-muted-foreground")}>
          {weight || "0"}
          <span className="text-lg font-medium text-muted-foreground">kg</span>
        </div>
        <NumberPad value={weight} onInput={setWeight} maxLength={7} />
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" size="lg" onClick={onDone}>
            Annuler
          </Button>
          <Button size="lg" disabled={!grams || (!receiving && !plate.trim())} onClick={submit}>
            Enregistrer
          </Button>
        </div>
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

  const { totals } = view;
  return (
    <div>
      <PageHeader
        title="Chargements"
        description="Le poids au départ du village comparé au poids pesé à l'usine d'égrenage."
        actions={
          writable && (
            <Button size="sm" onClick={() => setMode("dispatch")}>
              <Plus aria-hidden />
              Nouveau
            </Button>
          )
        }
      />
      <StatGrid>
        <Stat label="Pesé au village" value={formatKg(totals.weighedG)} />
        <Stat label="Parti du magasin" value={formatKg(totals.dispatchedG)} />
        <Stat label="Reste au magasin" value={formatKg(totals.inStoreG)} tone={totals.inStoreG < 0 ? "bad" : undefined} />
        <Stat label="Écart à l'usine" value={pct(totals.gapPct)} hint={totals.gapPct === null ? undefined : formatKg(totals.gapG)} tone={totals.gapPct !== null && totals.gapPct < -1 ? "bad" : undefined} />
      </StatGrid>

      <div className="mt-4 grid gap-2">
        {view.loads.length === 0 && <Empty icon={Truck}>Aucun chargement.</Empty>}
        {view.loads.map((l) => {
          const bad = l.gapPct !== null && l.gapPct < -1;
          return (
            <div key={l.id} className={cn("rounded-lg border bg-card p-3", l.cancelled && "opacity-60", ghosts.has(l.eventId) && "pending")}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-medium">
                    <Truck className="size-4 text-muted-foreground" aria-hidden />
                    <span className={cn("font-mono", l.cancelled && "line-through")}>{l.plate}</span>
                    <GhostMark app={app} id={[l.eventId, l.received?.eventId]} compact />
                  </div>
                  <div className="mt-0.5 text-sm text-muted-foreground">Parti le {formatDate(l.at)}</div>
                </div>
                <div className="text-right font-semibold tabular-nums">{formatKg(l.villageWeightG)}</div>
              </div>
              {l.received ? (
                <div className="mt-2 flex items-center justify-between gap-2 border-t pt-2 text-sm">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Factory className="size-4" aria-hidden />
                    Usine : <span className="tabular-nums text-foreground">{formatKg(l.received.factoryWeightG)}</span>
                  </span>
                  <Badge variant={bad ? "destructive" : "secondary"} className="tabular-nums">
                    écart {formatKg(l.gapG!)} ({pct(l.gapPct)})
                  </Badge>
                </div>
              ) : (
                !l.cancelled && <p className="mt-2 border-t pt-2 text-sm text-muted-foreground">Pas encore pesé à l'usine.</p>
              )}
              {l.cancelled && <p className="mt-2 text-sm text-destructive">Annulé : {l.cancelled}</p>}
              {writable && !l.cancelled && (
                <div className="mt-2 flex gap-2">
                  {!l.received && (
                    <Button size="sm" variant="outline" onClick={() => setMode(l.id)}>
                      Poids usine
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={async () => {
                      const reason = await askReason("Annuler ce chargement ?");
                      if (reason) await act(() => app.emit("collecte/item.cancelled", { itemId: l.id, reason }));
                    }}
                  >
                    Annuler
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
