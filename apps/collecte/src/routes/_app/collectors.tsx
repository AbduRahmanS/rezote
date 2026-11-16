import { act, Empty, Field, GhostMark, List, ListItem, PageHeader, useCanWrite, useGhosts } from "@rezote/core/react";
import { Badge } from "@rezote/ui/components/badge";
import { Button } from "@rezote/ui/components/button";
import { Input } from "@rezote/ui/components/input";
import { useForm } from "@tanstack/react-form";
import { createFileRoute, Link } from "@tanstack/react-router";
import { UserRound } from "lucide-react";
import { z } from "zod";
import { COLLECTOR_CODE } from "../../domain/events.ts";
import { app, newId, useView } from "../../runtime.ts";

export const Route = createFileRoute("/_app/collectors")({ component: Collectors });

function Collectors() {
  const view = useView();
  const ghosts = useGhosts(app);
  const writable = useCanWrite(app);
  const used = new Set(view.collectors.map((c) => c.code));
  let next = 1;
  while (used.has(`K${next}`)) next++;
  const suggested = `K${next}`;

  const form = useForm({
    defaultValues: { name: "", code: "" },
    onSubmit: async ({ value, formApi }) => {
      const code = (value.code || suggested).toUpperCase();
      const ok = await act(() => app.emit("collecte/collector.added", { collectorId: newId(), name: value.name, code }), `${value.name} ajouté (${code})`);
      if (ok) formApi.reset();
    },
  });

  const codeSchema = z
    .string()
    .transform((s) => s.toUpperCase())
    .refine((s) => s === "" || COLLECTOR_CODE.test(s), "1 à 4 lettres ou chiffres, par exemple K3")
    .refine((s) => !used.has(s), "Ce code est déjà pris");

  return (
    <div>
      <PageHeader
        title="Collecteurs"
        back={{ to: "/" }}
        description="Chaque reçu commence par le code du collecteur (K2-0042) : les numéros ne se répètent jamais d'un téléphone à l'autre."
      />
      {view.collectors.length === 0 ? (
        <Empty icon={UserRound}>Ajoutez au moins un collecteur, puis envoyez-lui le lien d'écriture (en haut, nom de la campagne → Partager).</Empty>
      ) : (
        <List>
          {view.collectors.map((c) => (
            <li key={c.id}>
              <ListItem
                icon={UserRound}
                className={ghosts.has(c.eventId) ? "pending" : ""}
                title={
                  <>
                    {c.name}
                    <GhostMark app={app} id={c.eventId} compact />
                  </>
                }
                end={
                  c.duplicateCode ? (
                    <Badge variant="destructive">{c.code} en double</Badge>
                  ) : (
                    <Badge variant="secondary" className="font-mono">
                      {c.code}
                    </Badge>
                  )
                }
              />
            </li>
          ))}
        </List>
      )}

      {writable && (
        <form
          className="mt-4 grid gap-3 rounded-lg border bg-card p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
        >
          <h2 className="text-sm font-semibold">Ajouter un collecteur</h2>
          <div className="grid grid-cols-[1fr_5.5rem] gap-2">
            <form.Field name="name" validators={{ onSubmit: z.string().trim().min(1, "Le nom est obligatoire").max(60) }}>
              {(field) => (
                <Field label="Nom" errors={field.state.meta.errors}>
                  <Input value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} placeholder="Adama Koné" />
                </Field>
              )}
            </form.Field>
            <form.Field name="code" validators={{ onChange: codeSchema }}>
              {(field) => (
                <Field label="Code" errors={field.state.meta.errors}>
                  <Input className="font-mono uppercase" maxLength={4} value={field.state.value} placeholder={suggested} onChange={(e) => field.handleChange(e.target.value.toUpperCase())} />
                </Field>
              )}
            </form.Field>
          </div>
          <Button type="submit">Ajouter</Button>
        </form>
      )}
      <Button asChild variant="ghost" className="mt-3 w-full">
        <Link to="/">Terminé</Link>
      </Button>
    </div>
  );
}
