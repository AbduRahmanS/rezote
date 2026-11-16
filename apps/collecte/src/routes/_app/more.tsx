import { List, ListItem, PageHeader } from "@rezote/core/react";
import { Badge } from "@rezote/ui/components/badge";
import { createFileRoute, Link } from "@tanstack/react-router";
import { FileSpreadsheet, Repeat, TriangleAlert, Truck, UserRound } from "lucide-react";
import { plural } from "../../components/format.ts";
import { useRole, useView } from "../../runtime.ts";

export const Route = createFileRoute("/_app/more")({ component: More });

function More() {
  const view = useView();
  const role = useRole();
  const collector = role?.kind === "collector";
  return (
    <div>
      <PageHeader title="Plus" description={view.campaign?.name} />
      <List>
        {!collector && (
          <li>
            <Link to="/collectors" className="block hover:bg-accent">
              <ListItem icon={UserRound} title="Collecteurs" subtitle={plural(view.collectors.length, "collecteur")} chevron />
            </Link>
          </li>
        )}
        <li>
          <Link to="/flags" className="block hover:bg-accent">
            <ListItem
              icon={TriangleAlert}
              title="Alertes"
              subtitle="Reçus en double, saisies répétées, trop-payés"
              end={view.flags.length > 0 ? <Badge className="bg-warning-soft text-warning-foreground">{view.flags.length}</Badge> : undefined}
              chevron
            />
          </Link>
        </li>
        {collector && (
          <li>
            <Link to="/loads" className="block hover:bg-accent">
              <ListItem icon={Truck} title="Chargements" chevron />
            </Link>
          </li>
        )}
        <li>
          <Link to="/export" className="block hover:bg-accent">
            <ListItem icon={FileSpreadsheet} title="Export pour Excel" chevron />
          </Link>
        </li>
        <li>
          <Link to="/role" className="block hover:bg-accent">
            <ListItem icon={Repeat} title="Changer de rôle" subtitle="Trésorier ou collecteur, sur ce téléphone" chevron />
          </Link>
        </li>
      </List>
      <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
        Pour inviter un collecteur ou partager la campagne en lecture, touchez le nom de la campagne en haut de l'écran, puis « Partager ».
      </p>
    </div>
  );
}
