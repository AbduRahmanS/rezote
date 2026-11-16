import { formatDuration, formatFCFA, formatShortDate, formatTime } from "@rezote/core";
import { Empty, GhostMark, List, ListItem, PageHeader, Section, ShareButton, Stat, StatGrid, useCanWrite, useGhosts } from "@rezote/core/react";
import { Alert, AlertDescription } from "@rezote/ui/components/alert";
import { Button } from "@rezote/ui/components/button";
import { cn } from "@rezote/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import { Flag, History, Plus, Route as RouteIcon, TriangleAlert } from "lucide-react";
import { KINDS } from "../domain/events.ts";
import type { Trip } from "../domain/project.ts";
import { corridorVia, tripSummary } from "../domain/text.ts";
import { app, useGps, useView } from "../runtime.ts";
import { KIND_ICONS, QUICK } from "./kinds.ts";
import { LastReport, OpenStops, TripTitle, useNow } from "./trip.tsx";

function NoTrip({ canStart }: { canStart: boolean }) {
  return (
    <Empty icon={RouteIcon}>
      <p className="font-medium text-foreground">Pas de trajet en cours</p>
      <p>Le propriétaire démarre le trajet, ou vous pouvez le faire ici.</p>
      {canStart && (
        <Button asChild className="mt-2">
          <Link to="/start">
            <Plus aria-hidden />
            Démarrer un trajet
          </Link>
        </Button>
      )}
    </Empty>
  );
}

export function DriverHome() {
  const view = useView();
  const now = useNow();
  const gps = useGps();
  const ghosts = useGhosts(app);
  const writable = useCanWrite(app);
  const trip = view.openTrips[0];
  if (!trip) return <NoTrip canStart={writable} />;
  const recent = trip.entries.slice(-5).reverse();
  return (
    <div>
      <PageHeader title={<TripTitle trip={trip} />} description={`En route depuis ${formatDuration(now - trip.startAt)} · ${trip.cargo}`} />
      <StatGrid>
        <Stat label={trip.balance < 0 ? "Avancé par vous" : "Reste de l'avance"} value={formatFCFA(Math.abs(trip.balance))} tone={trip.balance < 0 ? "bad" : undefined} />
        <Stat label="Dépenses" value={formatFCFA(trip.totalExpenses)} />
      </StatGrid>

      <div className="mt-3">
        <OpenStops trip={trip} now={now} />
      </div>

      <Section title="Nouvelle saisie">
        <div className="grid grid-cols-3 gap-2">
          {QUICK.map((k) => {
            const Icon = KIND_ICONS[k];
            return (
              <Link
                key={k}
                to="/entry/$tripId/$kind"
                params={{ tripId: trip.id, kind: k }}
                className="flex h-20 flex-col items-center justify-center gap-1.5 rounded-lg border bg-card px-1 text-center text-xs font-medium leading-tight hover:bg-accent active:bg-accent"
              >
                <Icon className="size-5 text-primary" aria-hidden />
                {KINDS[k].label}
              </Link>
            );
          })}
        </div>
      </Section>

      <Section title="Dernières saisies">
        {recent.length === 0 ? (
          <Empty>Rien pour le moment.</Empty>
        ) : (
          <List>
            {recent.map((e) => (
              <li key={e.id}>
                <ListItem
                  icon={KIND_ICONS[e.kind]}
                  className={cn(e.cancelled && "opacity-50", ghosts.has(e.eventId) && "pending")}
                  title={
                    <>
                      <span className={cn("truncate", e.cancelled && "line-through")}>
                        {KINDS[e.kind].label} · {e.place}
                      </span>
                      <GhostMark app={app} id={[e.eventId, e.resumeEventId]} compact />
                    </>
                  }
                  subtitle={formatTime(e.at)}
                  end={e.amount ? <span className="font-medium">{formatFCFA(e.amount)}</span> : undefined}
                />
              </li>
            ))}
          </List>
        )}
      </Section>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button asChild variant="outline">
          <Link to="/trips/$tripId" params={{ tripId: trip.id }}>
            <History aria-hidden />
            Tout le trajet
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/end/$tripId" params={{ tripId: trip.id }}>
            <Flag aria-hidden />
            Arrivée
          </Link>
        </Button>
      </div>
      <p className="mt-4 text-center text-xs text-muted-foreground">
        GPS {gps ? "activé" : "désactivé"} sur ce téléphone ·{" "}
        <Link to="/settings" className="underline underline-offset-4">
          changer
        </Link>
      </p>
    </div>
  );
}

export function OwnerHome() {
  const view = useView();
  const now = useNow();
  const writable = useCanWrite(app);
  const current = view.openTrips[0];
  return (
    <div>
      <PageHeader
        title={<span className="font-mono">{view.truck!.plate}</span>}
        badge={<GhostMark app={app} id={view.truck!.eventId} />}
        description={view.truck!.name}
      />
      {view.warnings.map((w) => (
        <Alert key={w} className="mb-3 border-warning/60 bg-warning-soft text-warning-foreground">
          <TriangleAlert aria-hidden />
          <AlertDescription className="text-warning-foreground">{w}</AlertDescription>
        </Alert>
      ))}

      {current ? (
        <div className="grid gap-3">
          <Link to="/trips/$tripId" params={{ tripId: current.id }} className="block rounded-lg border bg-card hover:bg-accent">
            <ListItem
              icon={RouteIcon}
              title={<TripTitle trip={current} />}
              subtitle={`${corridorVia(current.corridor)} · depuis ${formatDuration(now - current.startAt)}`}
              chevron
            />
          </Link>
          <LastReport trip={current} now={now} />
          <OpenStops trip={current} now={now} />
          <StatGrid>
            <Stat label="Avances" value={formatFCFA(current.totalAdvances)} />
            <Stat label="Dépenses" value={formatFCFA(current.totalExpenses)} />
            <Stat
              label={current.balance >= 0 ? "Reste chez le chauffeur" : "Dû au chauffeur"}
              value={formatFCFA(Math.abs(current.balance))}
              tone={current.balance < 0 ? "bad" : undefined}
            />
            <Stat label="Temps d'arrêt" value={formatDuration(Object.values(current.stoppedByKind).reduce((a, b) => a + (b ?? 0), 0))} />
          </StatGrid>
          <div className="grid grid-cols-2 gap-2">
            {writable && (
              <Button asChild variant="outline">
                <Link to="/advance/$tripId" params={{ tripId: current.id }}>
                  <Plus aria-hidden />
                  Avance
                </Link>
              </Button>
            )}
            <ShareButton label="Partager le résumé" text={() => tripSummary(view, current)} className={writable ? "" : "col-span-2"} />
          </div>
        </div>
      ) : (
        <NoTrip canStart={writable} />
      )}

      <Section title="Trajets terminés" action={<Link to="/trips" className="text-sm text-muted-foreground hover:text-foreground">Tout voir</Link>}>
        <TripRows trips={view.trips.filter((t) => t.ended).slice(0, 3)} />
      </Section>
    </div>
  );
}

function TripRows({ trips }: { trips: Trip[] }) {
  if (trips.length === 0) return <p className="text-sm text-muted-foreground">Aucun trajet terminé.</p>;
  return (
    <List>
      {trips.map((t) => (
        <li key={t.id}>
          <Link to="/trips/$tripId" params={{ tripId: t.id }} className="block hover:bg-accent">
            <ListItem
              title={<TripTitle trip={t} />}
              subtitle={`${formatShortDate(t.startAt)} · ${t.ended ? formatDuration(t.ended.at - t.startAt) : "en cours"}`}
              end={<span className="font-medium">{formatFCFA(t.totalExpenses)}</span>}
              chevron
            />
          </Link>
        </li>
      ))}
    </List>
  );
}

export function TripList() {
  const view = useView();
  const writable = useCanWrite(app);
  return (
    <div>
      <PageHeader
        title="Trajets"
        description={`${view.truck!.plate} · ${view.trips.length} trajet(s)`}
        actions={
          writable && (
            <Button asChild size="sm">
              <Link to="/start">
                <Plus aria-hidden />
                Nouveau
              </Link>
            </Button>
          )
        }
      />
      {view.trips.length === 0 ? <Empty icon={RouteIcon}>Aucun trajet.</Empty> : <TripRows trips={view.trips} />}
    </div>
  );
}
