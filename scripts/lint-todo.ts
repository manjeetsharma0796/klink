#!/usr/bin/env bun
/**
 * Validate TODO.md invariants. Runs in CI; exits non-zero on violations.
 *
 * Context (T-409): the board uses `.gitattributes` `TODO.md merge=union` so
 * concurrent edits to different sections auto-resolve. Union merge concatenates
 * rather than conflicts — so if two branches edit the same `### T-XXX` block,
 * the result has duplicate lines that this lint catches. The CI failure on a PR
 * is what now arbitrates same-task races; the runbook's "second PR fails to
 * merge cleanly" contract is preserved by lint-red rather than git-refuses.
 *
 * Invariants:
 *   1. No duplicate `### T-XXX` headings anywhere in the file.
 *   2. Every `### T-XXX` block has exactly one `- Status:` line.
 *   3. No occurrences of the misspelled `@Pritwish` (the canonical handle is
 *      `@Prithwish` — the `h` after `t` is load-bearing). The typo has been
 *      reintroduced twice via merges; failing CI is the only way to make
 *      "use the right spelling" stick.
 *
 * Usage:
 *   bun scripts/lint-todo.ts [path]    # default: TODO.md
 */

import { readFileSync } from "node:fs";

const TASK_HEADING = /^### (T-\d+)/gm;
const STATUS_LINE = /^- Status:/gm;
const BLOCK_SPLIT = /(?=^### T-\d+)/m;

function lint(text: string): string[] {
  const errors: string[] = [];

  const ids = [...text.matchAll(TASK_HEADING)].map((m) => m[1] ?? "");
  const counts = new Map<string, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  const dupes = [...counts.entries()]
    .filter(([, n]) => n > 1)
    .map(([id]) => id)
    .sort();
  if (dupes.length > 0) {
    errors.push(`duplicate task IDs: ${dupes.join(", ")}`);
  }

  for (const block of text.split(BLOCK_SPLIT)) {
    const headingMatch = block.match(/^### (T-\d+)/);
    if (!headingMatch) continue;
    const tid = headingMatch[1];
    const n = (block.match(STATUS_LINE) ?? []).length;
    if (n !== 1) {
      errors.push(`${tid}: ${n} \`- Status:\` lines (expected 1)`);
    }
  }

  // Forbidden-handle check. `@Pritwish` is a recurring misspelling — the
  // canonical handle is `@Prithwish` (note the `th`). Negative lookahead
  // makes sure `@Prithwish` itself doesn't trip this.
  const typoRe = /@Pritwish(?!h)/g;
  const typoLines: number[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (typoRe.test(lines[i] ?? "")) typoLines.push(i + 1);
    typoRe.lastIndex = 0;
  }
  if (typoLines.length > 0) {
    errors.push(
      `misspelled handle '@Pritwish' on line(s) ${typoLines.join(", ")} — use '@Prithwish'`,
    );
  }

  return errors;
}

const path = process.argv[2] ?? "TODO.md";
const text = readFileSync(path, "utf8");
const errors = lint(text);

if (errors.length > 0) {
  const s = errors.length === 1 ? "" : "s";
  console.error(`TODO.md lint failed (${errors.length} issue${s}):`);
  for (const e of errors) console.error(`  - ${e}`);
  console.error(
    "\nLikely cause: two branches edited the same task block and `merge=union` " +
      "silently concatenated them. Rebase on main and manually resolve.",
  );
  process.exit(1);
}

const nTasks = [...text.matchAll(TASK_HEADING)].length;
console.log(`TODO.md lint: OK (${nTasks} tasks)`);
