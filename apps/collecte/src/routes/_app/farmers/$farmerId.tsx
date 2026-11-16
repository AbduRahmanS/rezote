import { formatDate, formatDateTime, formatFCFA, formatKg, parseFCFA } from "@rezote/core";
import { act, askReason, Empty, Field, GhostMark, List, ListItem, PageHeader, Section, ShareButton, Stat, StatGrid, useCanWrite, useGhosts } from "@rezote/core/react";
import { Button } from "@rezote/ui/components/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@rezote/ui/components/dialog";
import { Input } from "@rezote/ui/components/input";
import { ToggleGroup, ToggleGroupItem } from "@rezote/ui/components/toggle-group";
import { cn } from "@rezote/ui/lib/utils";
import { useForm } from "@tanstack/react-form";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Banknote, MinusCircle, Plus, ReceiptText, Scale, Smartphone, X } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { plural } from "../../../components/format.ts";
import { farmerStatement, gradeLabel } from "../../../domain/text.ts";
import { app, newId, useRole, useView } from "../../../runtime.ts";

export const Route = createFileRoute("/_app/farmers/$farmerId")({ component: FarmerDetail });

const amount = z.string().refine((s) => (parseFCFA(s) ?? 0) > 0, "Montant en FCFA, par exemple 84 000");

function MoneyDialog({ farmerId, kind, onClose }: { farmerId: string; kind: "deduction" | "payment"; onClose: () => void }) {
  const form = useForm({
    defaultValues: { label: "Engrais à crédit", amount: "", method: "cash" as "cash" | "mobile_money" },
    onSubmit: async ({ value }) => {
      const at = Date.now();
      const fcfa = parseFCFA(value.amount)!;
      const ok =
        kind === "deduction"
          ? await act(() => app.emit("collecte/deduction.recorded", { deductionId: newId(), farmerId, label: value.label, amount: fcfa, at }), "Retenue enregistrée")
          : await act(() => app.emit("collecte/payment.recorded", { paymentId: newId(), farmerId, amount: fcfa, method: value.method, at }), "Paiement enregistré");
      if (ok) onClose();
    },
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
        >
          <DialogHeader>
            <DialogTitle>{kind === "deduction" ? "Nouvelle retenue" : "Nouveau paiement"}</DialogTitle>
          </DialogHeader>
          {kind === "deduction" ? (
            <form.Field name="label" validators={{ onChange: z.string().trim().min(1, "Le motif est obligatoire").max(120) }}>
              {(field) => (
                <Field label="Motif" hint="Par exemple : Engrais à crédit, 6 sacs × 14 000 FCFA" errors={field.state.meta.errors}>
                  <Input value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} />
                </Field>
              )}
            </form.Field>
          ) : (
            <form.Field name="method">
              {(field) => (
                <ToggleGroup
                  type="single"
                  variant="outline"
                  className="w-full"
                  value={field.state.value}
                  onValueChange={(v) => v && field.handleChange(v as "cash" | "mobile_money")}
                >
                  <ToggleGroupItem value="cash" className="flex-1">
                    <Banknote aria-hidden />
                    Espèces
                  </ToggleGroupItem>
                  <ToggleGroupItem value="mobile_money" className="flex-1">
                    <Smartphone aria-hidden />
                    Mobile money
                  </ToggleGroupItem>
                </ToggleGroup>
              )}
            </form.Field>
          )}
          <form.Field name="amount" validators={{ onSubmit: amount }}>
            {(field) => (
              <Field label="Montant (FCFA)" errors={field.state.meta.errors}>
                <Input inputMode="numeric" className="h-11 text-lg tabular-nums" value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} />
              </Field>
            )}
          </form.Field>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit">Enregistrer</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

async function cancel(itemId: string) {
  const reason = await askReason();
  if (reason) await act(() => app.emit("collecte/item.cancelled", { itemId, reason }), "Annulé");
}

function CancelButton({ itemId, label }: { itemId: string; label: string }) {
  return (
    <Button type="button" variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" aria-label={label} onClick={() => void cancel(itemId)}>
      <X aria-hidden />
    </Button>
  );
}

function FarmerDetail() {
  const { farmerId } = Route.useParams();
  const view = useView();
  const ghosts = useGhosts(app);
  const writable = useCanWrite(app);
  const role = useRole();
  const [dialog, setDialog] = useState<null | "deduction" | "payment">(null);
  const f = view.farmerById.get(farmerId);
  if (!f) return <Empty>Producteur introuvable.</Empty>;
  const treasurer = writable && role?.kind === "treasurer";
  const collector = writable && role?.kind === "collector";
  const pending = (id: string) => (ghosts.has(id) ? "pending" : "");
  return (
    <div>
      <PageHeader title={f.name} badge={<GhostMark app={app} id={f.eventId} />} description={f.village} back={{ to: "/farmers", label: "Producteurs" }} />

      <StatGrid>
        <Stat
          label="Poids total"
          value={formatKg(f.totalG)}
          hint={Object.entries(f.weightByGrade)
            .map(([code, g]) => `${gradeLabel(view, code)} ${formatKg(g)}`)
            .join(" · ") || "Aucune pesée"}
        />
        <Stat label="Montant brut" value={formatFCFA(f.gross)} />
        <Stat label="Retenues" value={formatFCFA(f.deductionsTotal)} />
        <Stat label="Reste à payer" value={formatFCFA(f.balance)} tone={f.balance < 0 ? "bad" : f.balance > 0 ? "warn" : "ok"} />
      </StatGrid>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {collector && (
          <Button asChild>
            <Link to="/weigh/$farmerId" params={{ farmerId: f.id }}>
              <Scale aria-hidden />
              Nouvelle pesée
            </Link>
          </Button>
        )}
        <ShareButton label="Envoyer le relevé" text={() => farmerStatement(view, f)} className={collector ? "" : "col-span-2"} />
      </div>

      <Section title="Pesées">
        {f.weighings.length === 0 ? (
          <Empty icon={ReceiptText}>Aucune pesée.</Empty>
        ) : (
          <List>
            {f.weighings.map((w) => (
              <li key={w.id}>
                <Link to="/receipts/$weighingId" params={{ weighingId: w.id }} className="block hover:bg-accent">
                  <ListItem
                    className={cn(w.cancelled && "opacity-50 line-through", pending(w.eventId))}
                    title={
                      <>
                        {w.receipt}
                        <GhostMark app={app} id={[w.eventId, ...w.bundles.map((b) => b.eventId)]} compact />
                      </>
                    }
                    subtitle={`${formatDateTime(w.at)} · ${plural(w.bundleCount, "bâche")}`}
                    end={<span className="font-medium">{formatKg(w.totalG)}</span>}
                    chevron
                  />
                </Link>
              </li>
            ))}
          </List>
        )}
      </Section>

      <Section
        title="Retenues"
        action={
          treasurer && (
            <Button variant="ghost" size="sm" onClick={() => setDialog("deduction")}>
              <Plus aria-hidden />
              Ajouter une retenue
            </Button>
          )
        }
      >
        {f.deductions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune retenue.</p>
        ) : (
          <List>
            {f.deductions.map((d) => (
              <li key={d.id}>
                <ListItem
                  icon={MinusCircle}
                  className={cn(d.cancelled && "opacity-50", pending(d.eventId))}
                  title={
                    <>
                      <span className={cn("truncate", d.cancelled && "line-through")}>{d.label}</span>
                      <GhostMark app={app} id={d.eventId} compact />
                    </>
                  }
                  subtitle={d.cancelled ? `Annulé : ${d.cancelled}` : formatDate(d.at)}
                  end={
                    <span className="flex items-center gap-1">
                      <span className="font-medium">{formatFCFA(d.amount)}</span>
                      {treasurer && !d.cancelled && <CancelButton itemId={d.id} label="Annuler la retenue" />}
                    </span>
                  }
                />
              </li>
            ))}
          </List>
        )}
      </Section>

      <Section
        title="Paiements"
        action={
          treasurer && (
            <Button variant="ghost" size="sm" onClick={() => setDialog("payment")}>
              <Plus aria-hidden />
              Ajouter un paiement
            </Button>
          )
        }
      >
        {f.payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun paiement.</p>
        ) : (
          <List>
            {f.payments.map((p) => (
              <li key={p.id}>
                <ListItem
                  icon={p.method === "cash" ? Banknote : Smartphone}
                  className={cn(p.cancelled && "opacity-50", pending(p.eventId))}
                  title={
                    <>
                      <span className={cn(p.cancelled && "line-through")}>{p.method === "cash" ? "Espèces" : "Mobile money"}</span>
                      <GhostMark app={app} id={p.eventId} compact />
                    </>
                  }
                  subtitle={p.cancelled ? `Annulé : ${p.cancelled}` : formatDate(p.at)}
                  end={
                    <span className="flex items-center gap-1">
                      <span className="font-medium">{formatFCFA(p.amount)}</span>
                      {treasurer && !p.cancelled && <CancelButton itemId={p.id} label="Annuler le paiement" />}
                    </span>
                  }
                />
              </li>
            ))}
          </List>
        )}
      </Section>

      {dialog && <MoneyDialog farmerId={f.id} kind={dialog} onClose={() => setDialog(null)} />}
    </div>
  );
}
