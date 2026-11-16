/** Registers the offline service worker in production builds. Safe to call more than once. */
export function registerServiceWorker(path = "/sw.js"): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  if (!import.meta.env.PROD) return;
  navigator.serviceWorker.register(path, { scope: "/" }).catch((e: unknown) => console.warn("Service worker:", e));
}
