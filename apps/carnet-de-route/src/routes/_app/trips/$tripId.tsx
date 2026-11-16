import { formatDateTime, formatDuration, formatFCFA, formatLiters, formatNumber } from "@rezote/core";
import { act, askReason, Empty, GhostMark, List, ListItem, PageHeader, Section, ShareButton, Stat, StatGrid, useCanWrite } from "@rezote/core/react";
import { Alert, AlertDescription } from "@rezote/ui/components/alert";
import { Button } from "@rezote/ui/components/button";
import { cn } from "@rezote/ui/lib/utils";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Banknote, Flag, MapPin, Play, Plus, TriangleAlert, X, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { KIND_ICONS } from "../../../components/kinds.ts";
import { LastReport, mapLink, OpenStops, TripTitle, useNow } from "../../../components/trip.tsx";
import { KINDS, type Kind } from "../../../domain/events.ts";
import { corridorVia, deOrD, tripSummary } from "../../../domain/text.ts";
import { app, useView } from "../../../runtime.ts";

export const Route = createFileRoute("/_app/trips/$tripId")({ component: TripDetail });

async function cancel(itemId: string) {
  const reason = await askReason();
  if (reason) await act(() => app.emit("route/item.cancelled", { itemId, reason }), "Annulé");
}

function TimelineItem({
  icon: Icon,
  title,
  meta,
  children,
  muted,
  last,
}: {
  icon: LucideIcon;
  title: ReactNode;
  meta: ReactNode;
  children?: ReactNode;
  muted?: boolean;
  last?: boolean;
}) {
  return (
    <li className={cn("relative flex gap-3 pb-4", muted && "opacity-55")}>
      {!last && <span className="absolute top-8 bottom-0 left-4 w-px bg-border" aria-hidden />}
      <span className="relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border bg-card">
        <Icon className="size-4 text-muted-foreground" aria-hidden />
      </span>
      <div className="min-w-0 flex-1 pt-1">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">{meta}</div>
        {children}
      </div>
    </li>
  );
}

function CancelButton({ itemId }: { itemId: string }) {
  return (
    <Button variant="ghost" size="icon-xs" className="shrink-0 text-muted-foreground hover:text-destructive" aria-label="Annuler" onClick={() => void cancel(itemId)}>
      <X aria-hidden />
    </Button>
  );
}

function TripDetail() {
  const { tripId } = Route.useParams();
  const view = useView();
  const now = useNow();
  const writable = useCanWrite(app);
  const trip = view.tripById.get(tripId);
  if (!trip) return <Empty>Trajet introuvable.</Empty>;
  const end = trip.ended?.at ?? now;
  const kinds = (Object.entries(trip.expensesByKind) as [Kind, number][]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const stops = (Object.entries(trip.stoppedByKind) as [Kind, number][]).filter(([, v]) => v > 0);
  const timeline = trip.timeline;
  return (
    <div>
      <PageHeader
        title={<TripTitle trip={trip} />}
        back={{ to: "/trips", label: "Trajets" }}
        description={
          <>
            {corridorVia(trip.corridor)} · {trip.cargo}
            <br />
            {trip.ended ? `Arrivé à ${trip.ended.place} le ${formatDateTime(trip.ended.at)}` : "En cours"} · {formatDuration(end - trip.startAt)}
          </>
        }
      />
      {trip.warnings.map((w) => (
        <Alert key={w} className="mb-3 border-warning/60 bg-warning-soft text-warning-foreground">
          <TriangleAlert aria-hidden />
          <AlertDescription className="text-warning-foreground">{w}</AlertDescription>
        </Alert>
      ))}
      <div className="grid gap-3">
        {!trip.ended && <LastReport trip={trip} now={now} />}
        <OpenStops trip={trip} now={now} />
        <StatGrid>
          <Stat label="Avances" value={formatFCFA(trip.totalAdvances)} />
          <Stat label="Dépenses" value={formatFCFA(trip.totalExpenses)} />
          <Stat label={trip.balance >= 0 ? "Reste chez le chauffeur" : "Dû au chauffeur"} value={formatFCFA(Math.abs(trip.balance))} tone={trip.balance < 0 ? "bad" : undefined} />
          <Stat label="Consommation" value={trip.consumption !== null ? `${Math.round(trip.consumption)} L/100 km` : "–"} hint={trip.distanceKm ? `sur ${formatNumber(trip.distanceKm)} km` : "Estimation"} />
        </StatGrid>
        <div className="grid grid-cols-2 gap-2">
          <ShareButton variant="default" label="Partager le résumé" text={() => tripSummary(view, trip)} className="col-span-2" />
          {writable && !trip.ended && (
            <>
              <Button asChild variant="outline">
                <Link to="/advance/$tripId" params={{ tripId: trip.id }}>
                  <Plus aria-hidden />
                  Avance
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/end/$tripId" params={{ tripId: trip.id }}>
                  <Flag aria-hidden />
                  Arrivée
                </Link>
              </Button>
            </>
          )}
        </div>
      </div>

      <Section title="Dépenses par type">
        {kinds.length === 0 ? (
          <Empty>Aucune dépense.</Empty>
        ) : (
          <List>
            {kinds.map(([k, v]) => (
              <li key={k}>
                <ListItem
                  icon={KIND_ICONS[k]}
                  title={KINDS[k].label}
                  subtitle={k === "fuel" && trip.fuelCl > 0 ? formatLiters(trip.fuelCl) : undefined}
                  end={<span className="font-medium">{formatFCFA(v)}</span>}
                />
              </li>
            ))}
          </List>
        )}
      </Section>

      {stops.length > 0 && (
        <Section title="Temps d'arrêt">
          <List>
            {stops.map(([k, v]) => (
              <li key={k}>
                <ListItem icon={KIND_ICONS[k]} title={KINDS[k].label} end={<span className="font-medium">{formatDuration(v)}</span>} />
              </li>
            ))}
          </List>
        </Section>
      )}

      <Section title="Chronologie">
        <ol className="timeline rounded-lg border bg-card px-3 pt-3">
          {timeline.map((item, i) => {
            const last = i === timeline.length - 1;
            if (item.kind === "start")
              return (
                <TimelineItem key="start" icon={Play} last={last} title={<>Départ {deOrD(trip.from)} <GhostMark app={app} id={item.eventId} compact /></>} meta={`${formatDateTime(item.at)} · avance ${formatFCFA(trip.advance)}`} />
              );
            if (item.kind === "end")
              return <TimelineItem key="end" icon={Flag} last={last} title={<>Arrivée à {item.place} <GhostMark app={app} id={item.eventId} compact /></>} meta={formatDateTime(item.at)} />;
            if (item.kind === "advance") {
              const a = item.advance;
              return (
                <TimelineItem
                  key={a.id}
                  icon={Banknote}
                  last={last}
                  muted={!!a.cancelled}
                  title={
                    <div className="flex items-start justify-between gap-2">
                      <span className={cn(a.cancelled && "line-through")}>
                        Avance {a.method === "cash" ? "en espèces" : "par mobile money"} · {formatFCFA(a.amount)} <GhostMark app={app} id={a.eventId} compact />
                      </span>
                      {writable && !a.cancelled && <CancelButton itemId={a.id} />}
                    </div>
                  }
                  meta={a.cancelled ? `Annulé : ${a.cancelled}` : formatDateTime(a.at)}
                />
              );
            }
            const e = item.entry;
            const meta = [
              formatDateTime(e.at),
              e.volumeCl ? `${formatLiters(e.volumeCl)} à ${formatNumber(e.pricePerLiter ?? 0)} F/L` : null,
              e.odometerKm !== undefined ? `${formatNumber(e.odometerKm)} km` : null,
              e.stoppedMs !== null ? `arrêt ${formatDuration(e.stoppedMs)}` : e.resumable && !e.cancelled ? "en cours" : null,
            ].filter(Boolean);
            return (
              <TimelineItem
                key={e.id}
                icon={KIND_ICONS[e.kind]}
                last={last}
                muted={!!e.cancelled}
                title={
                  <div className="flex items-start justify-between gap-2">
                    <span className={cn(e.cancelled && "line-through")}>
                      {KINDS[e.kind].label} · {e.place}
                      {e.amount ? <span className="tabular-nums"> · {formatFCFA(e.amount)}</span> : null} <GhostMark app={app} id={[e.eventId, e.resumeEventId]} compact />
                    </span>
                    {writable && !e.cancelled && <CancelButton itemId={e.id} />}
                  </div>
                }
                meta={e.cancelled ? `Annulé : ${e.cancelled}` : meta.join(" · ")}
              >
                {e.note && <p className="mt-1 text-sm">{e.note}</p>}
                {e.position && (
                  <a className="mt-1 inline-flex items-center gap-1 text-xs text-primary underline underline-offset-4" href={mapLink(e.position)} target="_blank" rel="noreferrer noopener">
                    <MapPin className="size-3" aria-hidden />
                    Position (±{e.position.accuracyM} m)
                  </a>
                )}
              </TimelineItem>
            );
          })}
        </ol>
      </Section>
    </div>
  );
}
