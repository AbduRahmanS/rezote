import { formatAgo, formatDuration, formatShortDate, formatTime } from "@rezote/core";
import { act, useCanWrite } from "@rezote/core/react";
import { useEffect, useState } from "react";
import { KINDS } from "../domain/events.ts";
import type { Entry, RouteView, Trip } from "../domain/project.ts";
import { app, useView } from "../runtime.ts";

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

export function OpenStops({ trip, now }: { trip: Trip; now: number }) {
  const writable = useCanWrite(app);
  if (trip.openStops.length === 0) return null;
  return (
    <div>
      {trip.openStops.map((s) => (
        <div className="card flag" key={s.id}>
          <div className="section-head">
            <strong>
              {KINDS[s.kind].emoji} {KINDS[s.kind].label} à {s.place}
            </strong>
            <span className="warn">{formatDuration(now - s.at)}</span>
          </div>
          {writable && (
            <button
              type="button"
              className="btn primary block"
              onClick={() => void act(() => app.emit("route/stop.resumed", { entryId: s.id, at: Date.now() }))}
            >
              ▶ Reprendre la route
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

export function LastReport({ trip, now }: { trip: Trip; now: number }) {
  const view = useView();
  const last = trip.lastReport;
  return (
    <div className="card">
      <h3>Dernière nouvelle</h3>
      {last ? (
        <p>
          {KINDS[last.kind].emoji} <strong>{last.place}</strong>, {formatShortDate(last.at)} à {formatTime(last.at)} ({formatAgo(last.at, now)})
          {last.position && (
            <>
              {" · "}
              <a href={mapLink(last.position)} target="_blank" rel="noreferrer noopener">
                carte (±{last.position.accuracyM} m)
              </a>
            </>
          )}
        </p>
      ) : (
        <p className="muted">Aucune saisie depuis le départ.</p>
      )}
      <p className="muted small">Téléphone du chauffeur synchronisé : {view.driverLastSync ? formatAgo(view.driverLastSync, now) : "pas encore"}</p>
    </div>
  );
}
