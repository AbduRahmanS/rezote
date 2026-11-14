import type { RouteView, Trip } from "../domain/project.ts";
import { app } from "../runtime.ts";

export function useView(): RouteView {
  return app.view.value as RouteView;
}

export async function act(fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn();
    return true;
  } catch (e) {
    window.alert(e instanceof Error ? e.message : String(e));
    return false;
  }
}

export function BackLink({ to = "#/", label = "← Retour" }: { to?: string; label?: string }) {
  return (
    <p>
      <a href={to}>{label}</a>
    </p>
  );
}

/** Places already typed on this truck, most recent first, to save typing on the road. */
export function recentPlaces(view: RouteView): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const all = view.trips.flatMap((t: Trip) => t.entries).sort((a, b) => b.at - a.at);
  for (const e of all) {
    if (!seen.has(e.place)) {
      seen.add(e.place);
      out.push(e.place);
    }
    if (out.length >= 30) break;
  }
  return out;
}
