import type { CollecteView } from "../domain/project.ts";
import { app } from "../runtime.ts";

/** The current view. Screens are only rendered once the campaign exists. */
export function useView(): CollecteView {
  return app.view.value as CollecteView;
}

/** Runs an action and shows errors in plain French instead of failing silently. */
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
