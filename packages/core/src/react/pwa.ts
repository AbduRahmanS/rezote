import { useEffect, useState } from "react";

/** Registers the offline service worker in production builds. Safe to call more than once. */
export function registerServiceWorker(path = "/sw.js"): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  if (!import.meta.env.PROD) return;
  navigator.serviceWorker.register(path, { scope: "/" }).catch((e: unknown) => console.warn("Service worker:", e));
}

/**
 * "ready" once the service worker has cached the app, so it will open with no
 * network; "preparing" during the first visit; "unsupported" in dev or old browsers.
 */
export function useOfflineReady(): "ready" | "preparing" | "unsupported" {
  const [state, setState] = useState<"ready" | "preparing" | "unsupported">("preparing");
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !import.meta.env.PROD) {
      setState("unsupported");
      return;
    }
    let alive = true;
    navigator.serviceWorker.ready.then(() => alive && setState("ready")).catch(() => alive && setState("unsupported"));
    return () => {
      alive = false;
    };
  }, []);
  return state;
}
