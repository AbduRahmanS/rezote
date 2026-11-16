import { formatAgo, formatDuration, formatShortDate, formatTime } from "@rezote/core";
import { act, useCanWrite } from "@rezote/core/react";
import { Button } from "@rezote/ui/components/button";
import { ArrowRight, MapPin, Play, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { KINDS } from "../domain/events.ts";
import type { Entry, RouteView, Trip } from "../domain/project.ts";
import { app, useView } from "../runtime.ts";
import { KIND_ICONS } from "./kinds.ts";

/** Current time, refreshed every minute, for "en route depuis…" counters. */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function mapLink(p: NonNullable<Entry["position"]>): string {
  return `https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lng}#map=13/${p.lat}/${p.lng}`;
}

export function TripTitle({ trip }: { trip: Trip }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {trip.from}
      <ArrowRight className="size-4 text-muted-foreground" aria-label="vers" />
      {trip.to}
    </span>
  );
}

/** Places already typed on this truck, most recent first, to save typing on the road. */
export function recentPlaces(view: RouteView): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of view.trips.flatMap((t) => t.entries).sort((a, b) => b.at - a.at)) {
    if (!seen.has(e.place)) {
      seen.add(e.place);
      out.push(e.place);
    }
    if (out.length >= 30) break;
  }
  return out;
}

/** Stops still in progress (customs, border, convoy, breakdown…), with "resume". */
export function OpenStops({ trip, now }: { trip: Trip; now: number }) {
  const writable = useCanWrite(app);
  if (trip.openStops.length === 0) return null;
  return (
    <div className="grid gap-2">
      {trip.openStops.map((s) => {
        const Icon = KIND_ICONS[s.kind];
        return (
          <div key={s.id} className="flag rounded-lg border border-warning/60 bg-warning-soft p-3 text-warning-foreground">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2 font-medium">
                <Icon className="size-4 shrink-0" aria-hidden />
                <span className="truncate">
                  {KINDS[s.kind].label} à {s.place}
                </span>
              </div>
              <span className="shrink-0 text-sm font-semibold tabular-nums">{formatDuration(now - s.at)}</span>
            </div>
            {writable && (
              <Button className="mt-3 w-full" onClick={() => void act(() => app.emit("route/stop.resumed", { entryId: s.id, at: Date.now() }), "Arrêt terminé")}>
                <Play aria-hidden />
                Reprendre la route
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function LastReport({ trip, now }: { trip: Trip; now: number }) {
  const view = useView();
  const last = trip.lastReport;
  const Icon = last ? KIND_ICONS[last.kind] : MapPin;
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-xs text-muted-foreground">Dernière nouvelle du chauffeur</div>
      {last ? (
        <div className="mt-1 flex items-start gap-2">
          <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0">
            <div className="font-medium">
              {KINDS[last.kind].label} · {last.place}
            </div>
            <div className="text-sm text-muted-foreground">
              {formatShortDate(last.at)} à {formatTime(last.at)} ({formatAgo(last.at, now)})
              {last.position && (
                <>
                  {" · "}
                  <a className="text-primary underline underline-offset-4" href={mapLink(last.position)} target="_blank" rel="noreferrer noopener">
                    carte (±{last.position.accuracyM} m)
                  </a>
                </>
              )}
            </div>
          </div>
        </div>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">Aucune saisie depuis le départ.</p>
      )}
      <div className="mt-2 flex items-center gap-1.5 border-t pt-2 text-xs text-muted-foreground">
        <Smartphone className="size-3.5" aria-hidden />
        Téléphone du chauffeur synchronisé : {view.driverLastSync ? formatAgo(view.driverLastSync, now) : "pas encore"}
      </div>
    </div>
  );
}
