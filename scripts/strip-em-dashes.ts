/**
 * Replace em dashes (—) in markdown without touching code blocks.
 *
 * Pipeline:
 *   1. Split the file on fenced code blocks (``` ... ```). Odd parts are
 *      code, left untouched.
 *   2. In prose parts, walk line-by-line so heading / list-label detection
 *      sees the full line text (including any inline code spans).
 *   3. Inside each prose line, split on inline code spans (`...`) so we only
 *      transform the surrounding text, not the code.
 *
 * Replacement rules per line:
 *   - Heading lines (start with #): first " — " → ": " (label → description),
 *     remaining → ", ".
 *   - List items with a formatted-label prefix ("* **X** — ...", "- [Y] — ...",
 *     "1. `Z` — ..."): first " — " → ": ", remaining → ", ".
 *   - Other prose lines: " — " → ", ".
 *   - Naked "—" without surrounding spaces: → ", ".
 *
 * Usage:
 *   bun scripts/strip-em-dashes.ts <dir>
 *
 * Walks <dir> recursively, transforms every *.md, prints per-file delta.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...walk(p));
    else if (entry.endsWith(".md")) out.push(p);
  }
  return out;
}

function transformProseSegment(seg: string, firstSpacedDashIsLabel: boolean): {
  out: string;
  consumedLabelSlot: boolean;
} {
  let consumed = false;
  let out = seg;
  if (firstSpacedDashIsLabel) {
    const idx = out.indexOf(" — ");
    if (idx !== -1) {
      out = `${out.slice(0, idx)}: ${out.slice(idx + 3)}`;
      consumed = true;
    }
  }
  out = out.split(" — ").join(", ");
  out = out.split("—").join(", ");
  return { out, consumedLabelSlot: consumed };
}

function transformLine(line: string): string {
  const stripped = line.replace(/^\s+/, "");
  const isHeading = stripped.startsWith("#");
  const isListLabel = /^([*-]|\d+\.)\s+(\*\*|`|\[|_)/.test(stripped);
  let labelSlotAvailable = isHeading || isListLabel;

  // Split this line on inline code spans so we only touch prose halves.
  const parts = line.split(/(`[^`\n]+`)/g);
  const out: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (i % 2 === 1) {
      out.push(part); // inline code: untouched
      continue;
    }
    const { out: replaced, consumedLabelSlot } = transformProseSegment(part, labelSlotAvailable);
    if (consumedLabelSlot) labelSlotAvailable = false;
    out.push(replaced);
  }
  return out.join("");
}

function transformFile(text: string): string {
  // Split on fenced code blocks. Odd-index parts are code, untouched.
  const parts = text.split(/(```[\s\S]*?```)/g);
  return parts
    .map((part, i) => (i % 2 === 1 ? part : part.split("\n").map(transformLine).join("\n")))
    .join("");
}

const root = process.argv[2] ?? "gitbook";
const files = walk(root);
let totalBefore = 0;
let totalAfter = 0;
let changedFiles = 0;

for (const f of files) {
  const before = readFileSync(f, "utf8");
  const after = transformFile(before);
  const beforeCount = (before.match(/—/g) ?? []).length;
  const afterCount = (after.match(/—/g) ?? []).length;
  totalBefore += beforeCount;
  totalAfter += afterCount;
  if (after !== before) {
    writeFileSync(f, after, "utf8");
    changedFiles++;
    console.log(`${f}: ${beforeCount} → ${afterCount}`);
  }
}

console.log(
  `\nTotal: ${totalBefore} em-dashes before, ${totalAfter} after across ${files.length} files (${changedFiles} modified).`,
);
