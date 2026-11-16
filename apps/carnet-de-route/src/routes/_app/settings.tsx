import { List, ListItem, PageHeader, Section } from "@rezote/core/react";
import { Alert, AlertDescription } from "@rezote/ui/components/alert";
import { Button } from "@rezote/ui/components/button";
import { createFileRoute, Link } from "@tanstack/react-router";
import { MapPin, MapPinOff, Repeat, ShieldAlert } from "lucide-react";
import { setGps, useGps, useRole } from "../../runtime.ts";

export const Route = createFileRoute("/_app/settings")({ component: Settings });

function Settings() {
  const gps = useGps();
  const role = useRole();
  return (
    <div>
      <PageHeader title="Réglages de ce téléphone" description="Ces réglages ne changent rien sur les autres téléphones." />
      <div className="rounded-lg border bg-card p-3">
        <div className="flex items-center gap-2 font-medium">
          {gps ? <MapPin className="size-4 text-primary" aria-hidden /> : <MapPinOff className="size-4 text-muted-foreground" aria-hidden />}
          Position GPS {gps ? "activée" : "désactivée"}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Si elle est activée, chaque saisie enregistre la position du téléphone (le GPS marche sans réseau). La position est chiffrée, visible
          seulement avec le lien d'écriture, et n'apparaît jamais dans les résumés partagés.
        </p>
        <Alert className="mt-3 border-warning/60 bg-warning-soft text-warning-foreground">
          <ShieldAlert aria-hidden />
          <AlertDescription className="text-warning-foreground">
            Sur les routes dangereuses, réfléchissez avant d'activer : un lien qui circule montre où est le camion.
          </AlertDescription>
        </Alert>
        <Button className="mt-3 w-full" variant={gps ? "outline" : "default"} onClick={() => void setGps(!gps)}>
          {gps ? "Désactiver le GPS" : "Activer le GPS"}
        </Button>
      </div>
      <Section title="Rôle">
        <List>
          <li>
            <Link to="/role" className="block hover:bg-accent">
              <ListItem icon={Repeat} title={role === "driver" ? "Chauffeur" : role === "owner" ? "Propriétaire" : "Lecture"} subtitle="Changer de rôle" chevron />
            </Link>
          </li>
        </List>
      </Section>
    </div>
  );
}
