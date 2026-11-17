// Creates a new app on the Rezote skeleton from templates/app.
// Usage: npm run new-app -- <slug> "<Display name>" [--no-install]
// Example: npm run new-app -- puits "Puits"
// See docs/new-app.md and .kiro/specs/new-app-command.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const templateDir = join(root, "templates", "app");
const appsDir = join(root, "apps");

/** Accent colors for new apps: icon color and the OKLCH hue of the theme. */
const PALETTE = [
  { accent: "#a78bfa", hue: 295 },
  { accent: "#f87171", hue: 25 },
  { accent: "#38bdf8", hue: 230 },
  { accent: "#facc15", hue: 90 },
  { accent: "#f472b6", hue: 350 },
];
const FIRST_PORT = 5175;
const NO_DATABASE = "REPLACE_WITH_YOUR_D1_ID";

function fail(message) {
  console.error(`new-app: ${message}`);
  console.error('Usage: npm run new-app -- <slug> "<Display name>" [--no-install]');
  process.exit(1);
}

const args = process.argv.slice(2);
const install = !args.includes("--no-install");
const [slug, name] = args.filter((a) => !a.startsWith("--"));

if (!slug || !name) fail("a slug and a display name are required.");
if (!/^[a-z][a-z0-9-]{0,30}[a-z0-9]$/.test(slug)) fail(`"${slug}" is not a valid slug: use 2 to 32 lowercase letters, digits, and hyphens, starting with a letter.`);
if (!/^[\p{L}\p{N}][\p{L}\p{N} '’·-]{0,39}$/u.test(name)) fail(`"${name}" is not a valid name: up to 40 letters, digits, spaces, apostrophes, and hyphens.`);

const target = join(appsDir, slug);
if (existsSync(target)) fail(`apps/${slug} already exists. Nothing was changed.`);

const existing = readdirSync(appsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => join(appsDir, d.name));
const readIfExists = (path) => (existsSync(path) ? readFileSync(path, "utf8") : "");

// A dev port no other app uses.
const usedPorts = new Set(existing.flatMap((dir) => [...readIfExists(join(dir, "vite.config.ts")).matchAll(/port:\s*(\d+)/g)].map((m) => Number(m[1]))));
let port = FIRST_PORT;
while (usedPorts.has(port)) port++;

// The D1 database the other apps already use, if any.
const databaseId =
  existing.map((dir) => /"database_id":\s*"([0-9a-f-]{36})"/.exec(readIfExists(join(dir, "wrangler.jsonc")))?.[1]).find(Boolean) ?? NO_DATABASE;

// The first palette color no other app uses.
const usedAccents = new Set(existing.map((dir) => JSON.parse(readIfExists(join(dir, "package.json")) || "{}").rezote?.accent));
const color = PALETTE.find((c) => !usedAccents.has(c.accent)) ?? PALETTE[existing.length % PALETTE.length];

const values = {
  __SLUG__: slug,
  __NAME__: name,
  __PORT__: String(port),
  __DATABASE_ID__: databaseId,
  __ACCENT__: color.accent,
  __HUE__: String(color.hue),
};
const fill = (text) => text.replace(/__(SLUG|NAME|PORT|DATABASE_ID|ACCENT|HUE)__/g, (token) => values[token]);

function copy(from, to) {
  mkdirSync(to, { recursive: true });
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const src = join(from, entry.name);
    const dest = join(to, entry.name);
    if (entry.isDirectory()) copy(src, dest);
    else writeFileSync(dest, fill(readFileSync(src, "utf8")));
  }
}

copy(templateDir, target);
console.log(`Created apps/${slug} (port ${port}, accent ${color.accent}).`);

const run = (command, commandArgs) => {
  const result = spawnSync(command, commandArgs, { cwd: root, stdio: "inherit" });
  if (result.status !== 0) fail(`${command} ${commandArgs.join(" ")} failed.`);
};
run(process.execPath, [join("scripts", "make-icons.mjs")]);
if (install) run("npm", ["install", "--no-audit", "--no-fund"]);

const rel = relative(root, target);
console.log(`
Next steps:
  npm run dev -w @rezote/${slug}       # http://localhost:${port} (run "npm run db:migrate:local -w @rezote/${slug}" once first)
  npx vitest --run ${rel}             # property tests of the starter projection

Then make it yours (docs/new-app.md):
  ${rel}/src/domain/events.ts     the facts your users record (Zod)
  ${rel}/src/domain/project.ts    what the screens show, as a pure function, with a property test per rule
  ${rel}/src/routes/_app/         the screens
${databaseId === NO_DATABASE ? `\nSet "database_id" in ${rel}/wrangler.jsonc before deploying (docs/deploy.md).\n` : ""}${install ? "" : '\nRun "npm install" to add the app to the lockfile.\n'}
Deploy: npm run deploy -w @rezote/${slug}`);
