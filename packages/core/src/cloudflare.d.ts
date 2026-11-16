declare module "cloudflare:workers" {
  /** Worker bindings declared in each app's wrangler.jsonc. */
  export const env: Record<string, unknown>;
}
