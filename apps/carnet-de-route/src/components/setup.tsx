import { Empty, List, ListItem, PageHeader } from "@rezote/core/react";
import { Button } from "@rezote/ui/components/button";
import { Link, useNavigate } from "@tanstack/react-router";
import { BriefcaseBusiness, ChevronRight, CloudOff, Eye, Truck } from "lucide-react";
import { app, setRole, type Role } from "../runtime.ts";

const steps = [
  ["Le propriétaire crée le carnet du camion", "Puis il démarre un trajet et envoie le lien au chauffeur par WhatsApp."],
  ["Le chauffeur note tout en route", "Carburant, contrôles, douane, attentes, pannes. Même sans réseau."],
  ["Le propriétaire suit le trajet", "Dépenses, arrêts et dernière position signalée, dès que le téléphone du chauffeur capte."],
];

export function Welcome() {
  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Truck className="size-5" aria-hidden />
        </span>
        <div>
          <h1 className="text-xl font-semibold">Carnet de route</h1>
          <p className="text-sm text-muted-foreground">Le trajet, les dépenses et les arrêts du camion, même sans réseau.</p>
        </div>
      </div>
      <div className="grid gap-3">
        <div className="rounded-lg border bg-card p-4">
          <h2 className="font-semibold">Vous êtes propriétaire du camion ?</h2>
          <p className="mt-1 text-sm text-muted-foreground">Créez le carnet de ce camion.</p>
          <Button asChild size="lg" className="mt-3 w-full">
            <Link to="/new">Créer le carnet d'un camion</Link>
          </Button>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <h2 className="font-semibold">Vous êtes chauffeur ?</h2>
          <p className="mt-1 text-sm text-muted-foreground">Ouvrez le lien que le propriétaire vous a envoyé.</p>
        </div>
      </div>
      <ol className="mt-8 grid gap-4">
        {steps.map(([title, text], i) => (
          <li key={title} className="flex gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums">{i + 1}</span>
            <div>
              <p className="text-sm font-medium">{title}</p>
              <p className="text-sm text-muted-foreground">{text}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-8 text-xs text-muted-foreground">Tout est chiffré sur le téléphone. La position GPS est désactivée par défaut.</p>
    </div>
  );
}

export function Waiting() {
  return (
    <div className="pt-6">
      <Empty icon={CloudOff}>
        <p className="font-medium text-foreground">En attente des données du camion</p>
        <p>Ce téléphone a bien rejoint le carnet. Ses données arrivent dès qu'il y a du réseau.</p>
        <Button className="mt-2" variant="outline" onClick={() => app.triggerSync()}>
          Réessayer maintenant
        </Button>
      </Empty>
    </div>
  );
}

export function RolePicker() {
  const navigate = useNavigate();
  const choose = async (r: Role) => {
    await setRole(r);
    await navigate({ to: "/" });
  };
  if (!app.canWrite()) {
    return (
      <div>
        <PageHeader title="Lecture seule" description="Vous suivez le trajet sans pouvoir le modifier. Les positions GPS ne sont pas visibles." />
        <Button size="lg" className="w-full" onClick={() => choose("viewer")}>
          <Eye aria-hidden />
          Suivre le trajet
        </Button>
      </div>
    );
  }
  return (
    <div>
      <PageHeader title="Qui utilise ce téléphone ?" description="Ce choix reste sur ce téléphone. Il change seulement l'écran d'accueil." />
      <List>
        <li>
          <button type="button" className="w-full text-left hover:bg-accent" onClick={() => choose("driver")}>
            <ListItem icon={Truck} title="Je suis le chauffeur" subtitle="Noter le carburant, les frais et les arrêts" end={<ChevronRight className="size-4 text-muted-foreground" />} />
          </button>
        </li>
        <li>
          <button type="button" className="w-full text-left hover:bg-accent" onClick={() => choose("owner")}>
            <ListItem icon={BriefcaseBusiness} title="Je suis le propriétaire" subtitle="Suivre le trajet, envoyer des avances" end={<ChevronRight className="size-4 text-muted-foreground" />} />
          </button>
        </li>
      </List>
    </div>
  );
}
