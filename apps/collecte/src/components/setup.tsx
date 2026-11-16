import { Empty, List, ListItem, PageHeader, useStatus } from "@rezote/core/react";
import { Button } from "@rezote/ui/components/button";
import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronRight, CloudOff, Eye, Landmark, Scale, UserRound } from "lucide-react";
import { app, setRole, useView, type Role } from "../runtime.ts";

const steps = [
  ["Le trésorier crée la campagne", "Produit, qualités et prix d'achat, puis il envoie un lien à chaque collecteur par WhatsApp."],
  ["Les collecteurs pèsent au village", "Bâche par bâche, avec le cumul comme dans les cahiers. Le reçu part au producteur par SMS ou WhatsApp."],
  ["Les pesées arrivent chez le trésorier", "Dès qu'un téléphone retrouve du réseau. Rien n'est perdu entre-temps."],
];

export function Welcome() {
  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Scale className="size-5" aria-hidden />
        </span>
        <div>
          <h1 className="text-xl font-semibold">Collecte</h1>
          <p className="text-sm text-muted-foreground">La pesée du coton au village, même sans réseau.</p>
        </div>
      </div>

      <div className="grid gap-3">
        <div className="rounded-lg border bg-card p-4">
          <h2 className="font-semibold">Vous êtes trésorier de la coopérative ?</h2>
          <p className="mt-1 text-sm text-muted-foreground">Créez la campagne de cette saison.</p>
          <Button asChild className="mt-3 w-full" size="lg">
            <Link to="/new">Créer une campagne</Link>
          </Button>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <h2 className="font-semibold">Vous êtes collecteur ?</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Ouvrez le lien que le trésorier vous a envoyé. La campagne s'ajoute à ce téléphone.
          </p>
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
    </div>
  );
}

export function Waiting() {
  const s = useStatus(app);
  return (
    <div className="pt-6">
      <Empty icon={CloudOff}>
        <p className="font-medium text-foreground">En attente des données de la campagne</p>
        <p>Ce téléphone a bien rejoint la campagne. Ses données arrivent dès qu'il y a du réseau.</p>
        <Button className="mt-2" variant="outline" disabled={!s.online} onClick={() => app.triggerSync()}>
          {s.online ? "Réessayer maintenant" : "Pas de réseau pour le moment"}
        </Button>
      </Empty>
    </div>
  );
}

export function RolePicker() {
  const view = useView();
  const navigate = useNavigate();
  const usable = view.collectors.filter((c) => !c.duplicateCode);
  const choose = async (r: Role) => {
    await setRole(r);
    await navigate({ to: "/" });
  };
  if (!app.canWrite()) {
    return (
      <div>
        <PageHeader title="Lecture seule" description="Ce téléphone a reçu le lien de lecture : il peut consulter la campagne, pas peser." />
        <Button size="lg" className="w-full" onClick={() => choose({ kind: "viewer" })}>
          <Eye aria-hidden />
          Consulter la campagne
        </Button>
      </div>
    );
  }
  return (
    <div>
      <PageHeader title="Qui utilise ce téléphone ?" description="Ce choix reste sur ce téléphone. Vous pourrez le changer plus tard." />
      <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Collecteurs</h2>
      {usable.length === 0 ? (
        <Empty>Le trésorier n'a pas encore ajouté de collecteur.</Empty>
      ) : (
        <List>
          {usable.map((c) => (
            <li key={c.id}>
              <button type="button" className="w-full text-left hover:bg-accent" onClick={() => choose({ kind: "collector", collectorId: c.id })}>
                <ListItem icon={UserRound} title={c.name} subtitle={`Code ${c.code}`} end={<ChevronRight className="size-4 text-muted-foreground" />} />
              </button>
            </li>
          ))}
        </List>
      )}
      <h2 className="mt-6 mb-2 text-sm font-semibold text-muted-foreground">Coopérative</h2>
      <List>
        <li>
          <button type="button" className="w-full text-left hover:bg-accent" onClick={() => choose({ kind: "treasurer" })}>
            <ListItem icon={Landmark} title="Je suis le trésorier" subtitle="Paiements, retenues, chargements" end={<ChevronRight className="size-4 text-muted-foreground" />} />
          </button>
        </li>
      </List>
    </div>
  );
}
