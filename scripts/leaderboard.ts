#!/usr/bin/env bun
/**
 * Compute a "today's activity" leaderboard from git + TODO.md, output text
 * suitable for posting to Telegram.
 *
 * Usage:
 *   bun scripts/leaderboard.ts [since] [title]
 *
 * Args:
 *   since — git log --since value (default: "24 hours ago")
 *   title — title shown in the message (default: "Today's tally")
 *
 * Counts:
 *   - commits in the window per author (git log %an, --no-merges)
 *   - tasks moved to Done in TODO.md per @handle today or yesterday (UTC)
 *
 * Author / handle normalization:
 *   `@Jishnu` and `Jishnu Baruah` both normalize to "jishnu" (lowercased
 *   first whitespace-delimited token, with a leading @ stripped). Devs
 *   should configure `git config user.name <handle>` to match the @handle
 *   in TODO.md — otherwise the row will show whichever form was seen first.
 */

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const SINCE = process.argv[2] ?? "24 hours ago";
const TITLE = process.argv[3] ?? "Today's tally";

interface Counts {
  display: string;
  commits: number;
  tasks: number;
}

const byKey = new Map<string, Counts>();

/**
 * Map any author identifier to a canonical key. Strips leading @,
 * lowercases, then keeps only the leading run of letters. So
 * "@Jishnu", "Jishnu Baruah", "jishnu-baruah", "Jishnu_b", and
 * "JISHNU" all map to "jishnu". This relies on each dev having a
 * unique leading-letter prefix (which our 4-person team does:
 * jishnu, manjeet, pritwish, mouli).
 */
function normalize(name: string): string {
  const stripped = name.replace(/^@/, "").trim().toLowerCase();
  return stripped.match(/^[a-z]+/)?.[0] ?? "";
}

function displayFor(key: string): string {
  return `@${(key[0] ?? "").toUpperCase()}${key.slice(1)}`;
}

function bump(name: string, field: "commits" | "tasks"): void {
  const key = normalize(name);
  if (!key) return;
  const existing = byKey.get(key) ?? {
    display: displayFor(key),
    commits: 0,
    tasks: 0,
  };
  existing[field] += 1;
  byKey.set(key, existing);
}

// 1. Commits per author in window
let commitLog = "";
try {
  commitLog = execSync(`git log --since="${SINCE}" --no-merges --pretty=format:"%an"`, {
    encoding: "utf8",
  }).trim();
} catch {
  // git not available or empty repo — leave commitLog empty.
}
if (commitLog) {
  for (const line of commitLog.split("\n")) {
    if (line.trim()) bump(line, "commits");
  }
}

// 2. Tasks marked done in TODO.md today or yesterday (IST).
// Team is IST per TODO.md, and `done @<handle> <date>` rows are written
// with the author's local-day date — usually IST. UTC drifts 5.5h behind,
// so a row dated 2026-04-30 by an IST author is "future" in UTC for half
// the day and gets skipped from the rolling window. Pin to IST so the
// per-handle tally matches what people see in TODO.md.
const istDate = (ms: number): string =>
  new Date(ms).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const today = istDate(Date.now());
const yesterday = istDate(Date.now() - 86_400_000);
let todoSrc = "";
try {
  todoSrc = readFileSync("TODO.md", "utf8");
} catch {
  // TODO.md missing — leave empty.
}
const doneRe = /^- Status: done @([A-Za-z0-9_-]+) (\d{4}-\d{2}-\d{2})/gm;
for (const m of todoSrc.matchAll(doneRe)) {
  const handle = m[1];
  const date = m[2];
  if (!handle) continue;
  if (date === today || date === yesterday) bump(`@${handle}`, "tasks");
}

// 3. Project totals — count current TODO.md state (not just window).
//   pending: `- Status: pending` — anyone could pick
//   done:    `- Status: done @<handle> <date>` — historical, all time
const totalPending = (todoSrc.match(/^- Status: pending$/gm) ?? []).length;
const totalDone = (todoSrc.match(/^- Status: done @[A-Za-z0-9_-]+ \d{4}-\d{2}-\d{2}/gm) ?? [])
  .length;

// 4. Format output
const rows = [...byKey.values()].sort((a, b) => b.commits + b.tasks - (a.commits + a.tasks));

const lines: string[] = [`[BOARD] ${TITLE}`, ""];
if (rows.length === 0) {
  lines.push("(no activity in window)");
} else {
  for (const row of rows) {
    const cw = row.commits === 1 ? "commit" : "commits";
    const tw = row.tasks === 1 ? "task" : "tasks";
    lines.push(`${row.display} — ${row.commits} ${cw}, ${row.tasks} ${tw} done`);
  }
}
lines.push("");
lines.push(`Project: ${totalPending} tasks pending, ${totalDone} done`);
lines.push("");
lines.push("Keep working team");

console.log(lines.join("\n"));
