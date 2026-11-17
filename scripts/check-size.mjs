// Fails if an app's first load is over budget. It gzips every file the browser
// downloads on the first visit (HTML, JS, CSS, icons, manifest, service worker)
// and adds up the sizes. Usage: node scripts/check-size.mjs [apps/<app>/dist/client ...]
// With no arguments it checks every app in apps/.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { gzipSync } from "node:zlib";

const BUDGET = 300 * 1024;
const COUNTED = /\.(html|js|mjs|css|svg|png|webmanifest|json)$/;

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

const dirs = process.argv.length > 2 ? process.argv.slice(2) : readdirSync("apps").map((app) => join("apps", app, "dist", "client"));
const missing = dirs.filter((dir) => !existsSync(dir));
if (missing.length > 0) {
  console.error(`Not built: ${missing.join(", ")}. Run npm run build first.`);
  process.exit(2);
}

let failed = false;
for (const dir of dirs) {
  let total = 0;
  const rows = [];
  for (const file of files(dir).filter((f) => COUNTED.test(f) && !f.endsWith(".map"))) {
    const size = gzipSync(readFileSync(file), { level: 9 }).length;
    total += size;
    rows.push([relative(dir, file), size]);
  }
  rows.sort((a, b) => b[1] - a[1]);
  const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
  const ok = total <= BUDGET;
  failed ||= !ok;
  console.log(`\n${dir}: ${kb(total)} gzip (budget ${kb(BUDGET)}) ${ok ? "OK" : "OVER BUDGET"}`);
  for (const [name, size] of rows) console.log(`  ${kb(size).padStart(9)}  ${name}`);
}
process.exit(failed ? 1 : 0);
