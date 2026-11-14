// Tiny hash router: "#/farmers/F12" → ["farmers", "F12"]. Join links use "#s=…",
// which the runtime consumes and replaces with "#/" before the router reads it.

import { signal } from "@preact/signals";

function parse(): string[] {
  if (typeof location === "undefined") return [];
  const hash = location.hash;
  if (!hash.startsWith("#/")) return [];
  return hash
    .slice(2)
    .split("/")
    .filter(Boolean)
    .map((part) => decodeURIComponent(part));
}

export const route = signal<string[]>(parse());

if (typeof window !== "undefined") {
  window.addEventListener("hashchange", () => {
    route.value = parse();
    window.scrollTo(0, 0);
  });
}

export function href(...parts: (string | number)[]): string {
  return `#/${parts.map((p) => encodeURIComponent(String(p))).join("/")}`;
}

export function navigate(...parts: (string | number)[]): void {
  const target = href(...parts);
  if (location.hash === target) route.value = parse();
  else location.hash = target;
}

export function back(): void {
  if (history.length > 1) history.back();
  else navigate();
}
