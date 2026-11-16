import { formatFCFA, formatKg } from "@rezote/core";
import { Empty, GhostMark, List, ListItem, PageHeader, useCanWrite, usePendingClass } from "@rezote/core/react";
import { Button } from "@rezote/ui/components/button";
import { Input } from "@rezote/ui/components/input";
import { cn } from "@rezote/ui/lib/utils";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Search, UserPlus, Users } from "lucide-react";
import { z } from "zod";
import { plural } from "../../../components/format.ts";
import type { Farmer } from "../../../domain/project.ts";
import { app, useView } from "../../../runtime.ts";

const search = z.object({
  /** Choosing a farmer to weigh, instead of browsing. */
  pick: z.boolean().optional(),
  q: z.string().optional(),
});

export const Route = createFileRoute("/_app/farmers/")({ validateSearch: search, component: FarmerList });

const normalize = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

function FarmerRow({ f, pick }: { f: Farmer; pick: boolean }) {
  const pending = usePendingClass(app, f.eventId);
  const item = (
    <ListItem
      className={pending}
      title={
        <>
          <span className="truncate">{f.name}</span>
          <GhostMark app={app} id={f.eventId} compact />
        </>
      }
      subtitle={`${f.village} · ${formatKg(f.totalG)}`}
      end={pick ? undefined : <span className={cn("font-medium", f.balance < 0 && "text-destructive")}>{formatFCFA(f.balance)}</span>}
      chevron
    />
  );
  return pick ? (
    <Link className="block hover:bg-accent" to="/weigh/$farmerId" params={{ farmerId: f.id }}>
      {item}
    </Link>
  ) : (
    <Link className="block hover:bg-accent" to="/farmers/$farmerId" params={{ farmerId: f.id }}>
      {item}
    </Link>
  );
}

function FarmerList() {
  const view = useView();
  const { pick = false, q = "" } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const canAdd = useCanWrite(app);
  const needle = normalize(q.trim());
  const list = needle ? view.farmers.filter((f) => normalize(`${f.name} ${f.village}`).includes(needle)) : view.farmers;
  return (
    <div>
      <PageHeader
        title={pick ? "Peser pour quel producteur ?" : "Producteurs"}
        description={pick ? "Choisissez le chef d'exploitation, ou ajoutez-le." : `${plural(view.farmers.length, "producteur")} · reste à payer à droite`}
        back={pick ? { to: "/" } : undefined}
      />
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          type="search"
          className="h-11 pl-9"
          placeholder="Rechercher un nom ou un village"
          value={q}
          onChange={(e) => void navigate({ search: (prev) => ({ ...prev, q: e.target.value || undefined }), replace: true })}
        />
      </div>
      {canAdd && (
        <Button asChild variant="outline" className="mt-2 w-full">
          <Link to="/farmers/new" search={{ pick: pick || undefined }}>
            <UserPlus aria-hidden />
            Nouveau producteur
          </Link>
        </Button>
      )}
      <div className="mt-3">
        {list.length === 0 ? (
          <Empty icon={Users}>{q ? "Aucun producteur trouvé." : "Aucun producteur enregistré."}</Empty>
        ) : (
          <List>
            {list.map((f) => (
              <li key={f.id}>
                <FarmerRow f={f} pick={pick} />
              </li>
            ))}
          </List>
        )}
      </div>
    </div>
  );
}
