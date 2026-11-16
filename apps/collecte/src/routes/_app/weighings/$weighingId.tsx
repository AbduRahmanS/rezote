import { formatFCFA, formatKg, formatTime, parseKg } from "@rezote/core";
import { act, askReason, confirmAction, Empty, GhostMark, NumberPad, PageHeader, useCanWrite } from "@rezote/core/react";
import { Button } from "@rezote/ui/components/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@rezote/ui/components/table";
import { ToggleGroup, ToggleGroupItem } from "@rezote/ui/components/toggle-group";
import { cn } from "@rezote/ui/lib/utils";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Check, Plus, X } from "lucide-react";
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
  if (!w) return <Empty>Pesée introuvable. Elle arrivera peut-être à la prochaine synchronisation.</Empty>;
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
    if (w.bundleCount === 0 && !(await confirmAction({ title: "Aucune bâche pesée", description: "Terminer quand même cette pesée ?", confirmLabel: "Terminer" }))) return;
    if (await act(() => app.emit("collecte/weighing.closed", { weighingId: w.id, at: Date.now() }))) {
      await navigate({ to: "/receipts/$weighingId", params: { weighingId: w.id } });
    }
  };

  return (
    <div>
      <PageHeader
        title={`Reçu ${w.receipt}`}
        badge={<GhostMark app={app} id={w.eventId} />}
        description={farmer ? `${farmer.name} · ${farmer.village}` : undefined}
        back={{ to: "/farmers/$farmerId", params: { farmerId: w.farmerId }, label: farmer?.name ?? "Producteur" }}
      />

      <div className="flex items-end justify-between gap-3 rounded-lg border bg-card px-4 py-3">
        <div>
          <div className="text-xs text-muted-foreground">
            Cumul · {w.bundleCount} bâche{w.bundleCount > 1 ? "s" : ""}
          </div>
          <div className="stat-value text-2xl font-semibold tabular-nums">{formatKg(w.totalG)}</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted-foreground">Montant brut</div>
          <div className="stat-value text-lg font-semibold tabular-nums">{formatFCFA(w.gross)}</div>
        </div>
      </div>

      {writable && (
        <div className="mt-3 grid gap-3 rounded-lg border bg-card p-3">
          <div
            className={cn(
              "flex h-16 items-baseline justify-center gap-2 rounded-md bg-muted text-4xl font-semibold tabular-nums",
              tooHeavy && "text-destructive",
              !weight && "text-muted-foreground",
            )}
            aria-live="polite"
          >
            <span className="self-center">{weight || "0"}</span>
            <span className="self-center text-lg font-medium text-muted-foreground">kg</span>
          </div>
          <ToggleGroup type="single" variant="outline" className="w-full" value={grade} onValueChange={(v) => v && setGrade(v)}>
            {grades.map((g) => (
              <ToggleGroupItem key={g.code} value={g.code} className="h-10 flex-1 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
                {g.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <NumberPad value={weight} onInput={setWeight} maxLength={6} />
          {tooHeavy && <p className="text-sm text-destructive">Une bâche ne peut pas dépasser 1 000 kg.</p>}
          <Button size="lg" className="h-12 text-base" disabled={!grams || tooHeavy || busy} onClick={add}>
            <Plus aria-hidden />
            Ajouter la bâche n° {w.bundleCount + 1}
          </Button>
        </div>
      )}

      <div className="mt-4 overflow-hidden rounded-lg border bg-card">
        {w.bundles.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">Tapez le poids annoncé à la bascule, puis « Ajouter la bâche ».</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">N°</TableHead>
                <TableHead>Qualité</TableHead>
                <TableHead className="text-right">Poids</TableHead>
                <TableHead className="text-right">Cumul</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {w.bundles
                .slice()
                .reverse()
                .map((b) => (
                  <TableRow key={b.id} className={cn(b.cancelled && "text-muted-foreground line-through")}>
                    <TableCell className="tabular-nums">
                      <span className="flex items-center gap-1">
                        {b.number || "–"}
                        <GhostMark app={app} id={b.eventId} compact />
                      </span>
                    </TableCell>
                    <TableCell>
                      <div>{gradeLabel(view, b.grade)}</div>
                      <div className="text-xs text-muted-foreground">{formatTime(b.at)}</div>
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{formatKg(b.weightG)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{b.cancelled ? "" : formatKg(b.subtotalG)}</TableCell>
                    <TableCell className="p-1">
                      {canWrite && !b.cancelled && !w.cancelled && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="text-muted-foreground hover:text-destructive"
                          aria-label="Annuler cette bâche"
                          onClick={async () => {
                            const reason = await askReason("Annuler cette bâche ?");
                            if (reason) await act(() => app.emit("collecte/item.cancelled", { itemId: b.id, reason }));
                          }}
                        >
                          <X aria-hidden />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        )}
      </div>

      <div className="mt-4">
        {writable ? (
          <Button variant="outline" size="lg" className="w-full" onClick={close}>
            <Check aria-hidden />
            Terminer la pesée et voir le reçu
          </Button>
        ) : (
          <Button asChild variant="outline" size="lg" className="w-full">
            <Link to="/receipts/$weighingId" params={{ weighingId: w.id }}>
              Voir le reçu
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}
