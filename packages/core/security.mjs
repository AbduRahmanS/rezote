// Security headers for Rezote apps, shared by the Worker (HTML pages) and the
// build script that writes _headers (static files). Plain JavaScript so both
// Node scripts and the Worker bundle can import it.

/** SHA-256 hashes (CSP format) of the inline <script> blocks of an HTML page. */
export async function inlineScriptHashes(html) {
  const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).filter((code) => code.length > 0);
  const hashes = [];
  for (const code of blocks) {
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code)));
    let bin = "";
    for (const b of digest) bin += String.fromCharCode(b);
    hashes.push(`'sha256-${btoa(bin)}'`);
  }
  return [...new Set(hashes)];
}

/**
 * @param {string[]} scriptHashes CSP hashes of allowed inline scripts
 * @returns {Record<string, string>}
 */
export function securityHeaders(scriptHashes = []) {
  const csp = [
    "default-src 'self'",
    `script-src ${["'self'", ...scriptHashes].join(" ")}`,
    // Inline style attributes are used by React and the toast library.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    // The sync API is on the same origin.
    "connect-src 'self'",
    "manifest-src 'self'",
    "worker-src 'self'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
  ].join("; ");
  return {
    "Content-Security-Policy": csp,
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(self)",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Strict-Transport-Security": "max-age=31536000",
  };
}
