// The main screen: record an entry (write link only), see the list and the total.
// Routes only read the view and call app.emit; rules live in src/domain.
import { formatDateTime, formatFCFA, parseFCFA } from "@rezote/core";
import { act, askReason, Empty, Field, GhostMark, List, ListItem, PageHeader, Section, Stat, StatGrid, useCanWrite, usePendingClass } from "@rezote/core/react";
import { Button } from "@rezote/ui/components/button";
import { Input } from "@rezote/ui/components/input";
import { useForm } from "@tanstack/react-form";
import { createFileRoute } from "@tanstack/react-router";
import { NotebookPen, X } from "lucide-react";
import { z } from "zod";
import type { Entry } from "../../domain/project.ts";
import { app, newId, useView } from "../../runtime.ts";

export const Route = createFileRoute("/_app/")({ component: Home });

function Home() {
  const view = useView();
  const canWrite = useCanWrite(app);
  if (!view) return null;
  return (
    <div>
      <PageHeader title={view.title} description={canWrite ? "Chaque entrée est gardée sur ce téléphone, puis envoyée dès qu'il y a du réseau." : undefined} />
      <StatGrid>
        <Stat label="Entrées" value={view.entries.length} hint={view.cancelled > 0 ? `${view.cancelled} annulée(s)` : undefined} />
        <Stat label="Total" value={formatFCFA(view.total)} />
      </StatGrid>
      {canWrite && <NewEntry />}
      <Section title="Dernières entrées">
        {view.entries.length === 0 ? (
          <Empty icon={NotebookPen}>Aucune entrée pour le moment.</Empty>
        ) : (
          <List>
            {view.entries.map((entry) => (
              <EntryRow key={entry.id} entry={entry} canWrite={canWrite} />
            ))}
          </List>
        )}
      </Section>
    </div>
  );
}

// Same limits as the event schema, so a bad amount is caught on the field, not by emit.
const MAX_AMOUNT = 1_000_000_000;
const amountSchema = z.string().refine((v) => {
  if (v.trim() === "") return true;
  const n = parseFCFA(v);
  return n !== null && n >= 0 && n <= MAX_AMOUNT;
}, "Montant en francs, sans virgule, jusqu'à 1 milliard");

function NewEntry() {
  const form = useForm({
    defaultValues: { text: "", amount: "" },
    onSubmit: async ({ value, formApi }) => {
      const amount = value.amount.trim() === "" ? undefined : (parseFCFA(value.amount) ?? undefined);
      const ok = await act(() => app.emit("__SLUG__/entry.recorded", { entryId: newId(), text: value.text, amount, at: Date.now() }), "Enregistré");
      if (ok) formApi.reset();
    },
  });
  return (
    <form
      className="mt-4 grid gap-3 rounded-lg border bg-card p-3"
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.Field name="text" validators={{ onSubmit: z.string().trim().min(1, "Écrivez quelque chose").max(200, "200 caractères au plus") }}>
        {(field) => (
          <Field label="Entrée" errors={field.state.meta.errors}>
            <Input maxLength={200} value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} placeholder="Achat de 2 sacs de ciment" />
          </Field>
        )}
      </form.Field>
      <form.Field name="amount" validators={{ onChange: amountSchema }}>
        {(field) => (
          <Field label="Montant (FCFA, facultatif)" errors={field.state.meta.errors}>
            <Input inputMode="numeric" className="tabular-nums" value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} placeholder="25 000" />
          </Field>
        )}
      </form.Field>
      {/* Disabled while saving, so a double tap never records the entry twice. */}
      <form.Subscribe selector={(s) => s.isSubmitting}>
        {(busy) => (
          <Button type="submit" size="lg" disabled={busy}>
            Enregistrer
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
}

function EntryRow({ entry, canWrite }: { entry: Entry; canWrite: boolean }) {
  const pending = usePendingClass(app, entry.eventId);
  return (
    <li className={pending}>
      <ListItem
        title={
          <>
            <span className="truncate">{entry.text}</span>
            <GhostMark app={app} id={entry.eventId} compact />
          </>
        }
        subtitle={formatDateTime(entry.at)}
        end={
          <div className="flex items-center gap-1">
            {entry.amount !== null && <span className="font-medium">{formatFCFA(entry.amount)}</span>}
            {canWrite && (
              <Button type="button" variant="ghost" size="icon-lg" className="text-muted-foreground hover:text-destructive" aria-label={`Annuler : ${entry.text}`} onClick={() => void cancel(entry.id)}>
                <X aria-hidden />
              </Button>
            )}
          </div>
        }
      />
    </li>
  );
}

async function cancel(entryId: string) {
  const reason = await askReason();
  if (reason) await act(() => app.emit("__SLUG__/entry.cancelled", { entryId, reason }), "Annulé");
}
