/// <reference types="vite/client" />

declare module "cloudflare:workers" {
  /** Worker bindings declared in wrangler.jsonc (D1 database, rate limiter). */
  export const env: Record<string, unknown>;
}
