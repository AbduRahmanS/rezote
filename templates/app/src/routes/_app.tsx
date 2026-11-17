// Layout for every screen that needs a space: shows the welcome screen until the
// phone has one, and the waiting screen until its first data has arrived.
import { Empty, useRuntime } from "@rezote/core/react";
import { Button } from "@rezote/ui/components/button";
import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { CloudOff, NotebookPen } from "lucide-react";
import { app, useView } from "../runtime.ts";

export const Route = createFileRoute("/_app")({ component: Gate });

function Gate() {
  const currentId = useRuntime(app, (s) => s.currentId);
  const view = useView();
  if (!currentId) return <Welcome />;
  if (!view?.title) return <Waiting />;
  return <Outlet />;
}

function Welcome() {
  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <NotebookPen className="size-5" aria-hidden />
        </span>
        <div>
          <h1 className="text-xl font-semibold">__NAME__</h1>
          <p className="text-sm text-muted-foreground">Un registre partagé, même sans réseau.</p>
        </div>
      </div>
      <div className="grid gap-3">
        <div className="rounded-lg border bg-card p-4">
          <h2 className="font-semibold">Nouveau registre</h2>
          <p className="mt-1 text-sm text-muted-foreground">Créez-le, puis envoyez le lien aux personnes qui notent avec vous.</p>
          <Button asChild size="lg" className="mt-3 w-full">
            <Link to="/new">Créer un registre</Link>
          </Button>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <h2 className="font-semibold">On vous a envoyé un lien ?</h2>
          <p className="mt-1 text-sm text-muted-foreground">Ouvrez-le sur ce téléphone pour rejoindre le registre.</p>
        </div>
      </div>
      <p className="mt-8 text-xs text-muted-foreground">Tout est enregistré sur le téléphone et chiffré avant d'être envoyé.</p>
    </div>
  );
}

function Waiting() {
  return (
    <div className="pt-6">
      <Empty icon={CloudOff}>
        <p className="font-medium text-foreground">En attente des données</p>
        <p>Ce téléphone a bien rejoint le registre. Les données arrivent dès qu'il y a du réseau.</p>
        <Button className="mt-2" variant="outline" size="lg" onClick={() => app.triggerSync()}>
          Réessayer maintenant
        </Button>
      </Empty>
    </div>
  );
}
