import { act, BackLink, Empty, Field, GhostMark, useCanWrite, useGhosts } from "@rezote/core/react";
import { useForm } from "@tanstack/react-form";
import { createFileRoute, Link } from "@tanstack/react-router";
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
      const ok = await act(() => app.emit("collecte/collector.added", { collectorId: newId(), name: value.name, code }));
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
      <BackLink />
      <h1>Collecteurs</h1>
      <p className="muted">
        Chaque collecteur a un code. Les numéros de reçu commencent par ce code (par exemple K2-0042), donc ils ne se répètent jamais d'un
        téléphone à l'autre.
      </p>
      <ul className="list">
        {view.collectors.map((c) => (
          <li key={c.id}>
            <div className={`row ${ghosts.has(c.eventId) ? "is-ghost" : ""}`}>
              <span className="row-title">
                {c.name}
                <GhostMark app={app} id={c.eventId} />
              </span>
              <span className={c.duplicateCode ? "bad" : "muted"}>{c.duplicateCode ? `${c.code} (doublon)` : c.code}</span>
            </div>
          </li>
        ))}
      </ul>
      {view.collectors.length === 0 && <Empty>Ajoutez au moins un collecteur, puis envoyez-lui le lien d'écriture (menu ☰ → Partager).</Empty>}
      {writable && (
        <form
          className="card"
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
        >
          <h2>Ajouter un collecteur</h2>
          <div className="inline">
            <form.Field name="name" validators={{ onSubmit: z.string().trim().min(1, "Le nom est obligatoire").max(60) }}>
              {(field) => (
                <Field label="Nom" errors={field.state.meta.errors}>
                  <input value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} placeholder="Adama Koné" />
                </Field>
              )}
            </form.Field>
            <form.Field name="code" validators={{ onChange: codeSchema }}>
              {(field) => (
                <Field label="Code" errors={field.state.meta.errors}>
                  <input maxLength={4} value={field.state.value} placeholder={suggested} onChange={(e) => field.handleChange(e.target.value.toUpperCase())} />
                </Field>
              )}
            </form.Field>
          </div>
          <button type="submit" className="btn primary block">
            Ajouter
          </button>
        </form>
      )}
      <Link className="btn block" to="/">
        Terminé
      </Link>
    </div>
  );
}
