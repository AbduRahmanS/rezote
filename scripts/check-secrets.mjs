// Fails if a secret is about to enter the repository: a Rezote write link (it
// gives full write access to a space), a Cloudflare API token, or a GitHub or
// AWS key.
//
//   node scripts/check-secrets.mjs           scan every tracked file (CI)
//   node scripts/check-secrets.mjs --staged  scan the lines staged for commit
//   node scripts/check-secrets.mjs --hook    Kiro PreToolUse hook: reads the tool call as JSON on stdin and, for
//                                            git commit or git push, scans the staged lines, the tracked files,
//                                            and the command itself. Exit code 2 blocks the tool call.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const PATTERNS = [
  ["Rezote write link", /#s=[A-Za-z0-9_-]{22}&e=[A-Za-z0-9_-]{43}&w=[A-Za-z0-9_-]{22}/],
  ["Cloudflare API token", /\bcfut_[A-Za-z0-9]{30,}/],
  ["Cloudflare API token", /CLOUDFLARE_API_TOKEN\s*[=:]\s*["']?[A-Za-z0-9_-]{30,}/],
  ["GitHub token", /\b(?:ghp|gho|ghs|ghu)_[A-Za-z0-9]{36}\b|\bgithub_pat_[A-Za-z0-9_]{60,}/],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/],
];

const mask = (s) => (s.length > 12 ? `${s.slice(0, 8)}…` : "…");

function scan(text, where) {
  const found = [];
  text.split("\n").forEach((line, i) => {
    for (const [name, re] of PATTERNS) {
      const m = re.exec(line);
      if (m) found.push(`${where}${where.includes(":") ? "" : `:${i + 1}`}  ${name} (${mask(m[0])})`);
    }
  });
  return found;
}

const git = (args, cwd) => execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

function scanTracked(cwd) {
  const files = git(["ls-files", "-z"], cwd).split("\0").filter(Boolean);
  return files.flatMap((file) => {
    let text;
    try {
      text = readFileSync(join(cwd, file), "utf8");
    } catch {
      return [];
    }
    return text.includes("\0") ? [] : scan(text, file);
  });
}

function scanStaged(cwd) {
  const found = [];
  let file = "";
  let line = 0;
  for (const row of git(["diff", "--cached", "-U0", "--no-color"], cwd).split("\n")) {
    if (row.startsWith("+++ ")) file = row.slice(6);
    else if (row.startsWith("@@")) line = Number(/\+(\d+)/.exec(row)?.[1] ?? 0);
    else if (row.startsWith("+")) found.push(...scan(row.slice(1), `${file}:${line++}`));
  }
  return found;
}

function report(found, exitCode) {
  if (found.length === 0) return;
  console.error("Secrets found. Remove them before committing (share write links privately, keep tokens in environment variables):");
  for (const f of new Set(found)) console.error(`  ${f}`);
  process.exit(exitCode);
}

const mode = process.argv[2] ?? "--all";
if (mode === "--hook") {
  let input = {};
  try {
    input = JSON.parse(readFileSync(0, "utf8") || "{}");
  } catch {
    process.exit(0);
  }
  const call = JSON.stringify(input.tool_input ?? {});
  if (!/\bgit\b[^"]*\b(commit|push)\b/.test(call)) process.exit(0);
  const cwd = typeof input.cwd === "string" ? input.cwd : process.cwd();
  let found = scan(call, "command:");
  try {
    found = found.concat(scanStaged(cwd), scanTracked(cwd));
  } catch {
    // Not a git repository: only the command itself is checked.
  }
  report(found, 2);
} else {
  const cwd = process.cwd();
  report(mode === "--staged" ? scanStaged(cwd) : scanTracked(cwd), 1);
  console.log("No secrets found.");
}
