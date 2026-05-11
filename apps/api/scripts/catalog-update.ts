/**
 * T-234 — Admin script for safe updates to the `service_catalog` table.
 *
 * Why this exists: per the seed (`apps/api/src/db/seed.ts`), every catalog row
 * lands with `enabled=false` and a placeholder `payment_recipient_pubkey`
 * (system program `1111…`). To turn a slug on, an operator needs to (1) drop in
 * the real recipient pubkey from the upstream service team and (2) flip
 * `enabled=true`. Doing this through the Neon SQL console is fine in a pinch
 * but error-prone (typos in base58 pubkeys, accidental UPDATE without WHERE,
 * no dry-run). This script gives a typed, dry-run-by-default path using the
 * existing Drizzle client — same `DATABASE_URL` env var the api uses, no raw
 * SQL.
 *
 * Default behaviour: dry-run. Prints the row before, the row after, exits.
 * Pass `--apply` to actually write.
 *
 * Usage:
 *   # Show what an update WOULD do (safe to run)
 *   bun apps/api/scripts/catalog-update.ts --slug openai-chatgpt \
 *     --recipient 81eM3oPR1fUJSsFhNm6G51W4jwE2HondS2kjBmcxFcJ2 --enable
 *
 *   # Actually persist
 *   bun apps/api/scripts/catalog-update.ts --slug openai-chatgpt \
 *     --recipient 81eM3oPR1fUJSsFhNm6G51W4jwE2HondS2kjBmcxFcJ2 --enable --apply
 *
 *   # Disable a slug (e.g. upstream brownout)
 *   bun apps/api/scripts/catalog-update.ts --slug openai-chatgpt --disable --apply
 *
 *   # Set or update default per-call cap (USDC base units; 0 = no cap)
 *   bun apps/api/scripts/catalog-update.ts --slug exa-search --max-per-call 100000 --apply
 *
 * Flags:
 *   --slug <slug>            (required) the catalog row to update
 *   --recipient <base58>     new payment_recipient_pubkey (validated as Solana pubkey)
 *   --enable                 set enabled=true
 *   --disable                set enabled=false (mutually exclusive with --enable)
 *   --max-per-call <int>     set default_max_per_call (USDC base units, 6 decimals)
 *   --apply                  actually write; without it the script is dry-run
 *
 * Exit codes:
 *   0 — success (dry-run or applied)
 *   1 — validation / arg error
 *   2 — slug not found in catalog
 *   3 — DB or runtime error
 */

import { PublicKey } from "@solana/web3.js";
import { eq } from "drizzle-orm";
import { getDb } from "../src/db/client";
import { serviceCatalog } from "../src/db/schema";

export interface CatalogUpdateArgs {
  slug: string;
  recipient?: string;
  enable?: boolean;
  disable?: boolean;
  maxPerCall?: number;
  apply: boolean;
}

export type ParseResult =
  | { ok: true; args: CatalogUpdateArgs }
  | { ok: false; error: string };

/**
 * Pure CLI arg parser. Pulled out so the unit test can exercise it without
 * needing `process.argv` patching or a DB. Validates pubkey format here too
 * so an operator gets a clear error before we even open a DB connection.
 */
export function parseArgs(argv: readonly string[]): ParseResult {
  const out: Partial<CatalogUpdateArgs> = { apply: false };

  // Pull the value at argv[i+1] for a value-taking flag, asserting it exists
  // and isn't itself a flag. Without this guard, `--slug --enable` would set
  // slug to the literal string "--enable" and silently misbehave.
  // Returns either { ok: true, value } or { ok: false, error } so the caller
  // can early-return the same shape parseArgs uses.
  function takeValue(flag: string, i: number):
    | { ok: true; value: string }
    | { ok: false; error: string } {
    const v = argv[i];
    if (v === undefined || v.startsWith("--")) {
      return { ok: false, error: `${flag} requires a value` };
    }
    return { ok: true, value: v };
  }

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--slug": {
        const v = takeValue("--slug", i + 1);
        if (!v.ok) return v;
        out.slug = v.value;
        i++;
        break;
      }
      case "--recipient": {
        const v = takeValue("--recipient", i + 1);
        if (!v.ok) return v;
        out.recipient = v.value;
        i++;
        break;
      }
      case "--enable":
        out.enable = true;
        break;
      case "--disable":
        out.disable = true;
        break;
      case "--max-per-call": {
        const v = takeValue("--max-per-call", i + 1);
        if (!v.ok) return v;
        const raw = v.value;
        const n = Number(raw);
        if (!Number.isInteger(n) || n < 0) {
          return { ok: false, error: `--max-per-call must be a non-negative integer, got ${raw}` };
        }
        out.maxPerCall = n;
        i++;
        break;
      }
      case "--apply":
        out.apply = true;
        break;
      case "--help":
      case "-h":
        return { ok: false, error: "HELP" };
      default:
        return { ok: false, error: `unknown flag: ${a}` };
    }
  }

  if (!out.slug) return { ok: false, error: "--slug is required" };
  if (out.enable && out.disable) {
    return { ok: false, error: "--enable and --disable are mutually exclusive" };
  }
  if (
    out.recipient === undefined &&
    out.enable === undefined &&
    out.disable === undefined &&
    out.maxPerCall === undefined
  ) {
    return {
      ok: false,
      error:
        "no-op: at least one of --recipient, --enable, --disable, --max-per-call must be supplied",
    };
  }
  if (out.recipient !== undefined) {
    // Validate base58 + 32-byte pubkey shape via @solana/web3.js. This catches
    // most typos before we even open a DB connection.
    try {
      new PublicKey(out.recipient);
    } catch {
      return { ok: false, error: `--recipient is not a valid base58 Solana pubkey: ${out.recipient}` };
    }
  }

  return { ok: true, args: out as CatalogUpdateArgs };
}

/**
 * Build the partial set-clause for the Drizzle update. Exported for testability.
 */
export function buildUpdatePatch(args: CatalogUpdateArgs): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (args.recipient !== undefined) patch.paymentRecipientPubkey = args.recipient;
  if (args.enable) patch.enabled = true;
  if (args.disable) patch.enabled = false;
  if (args.maxPerCall !== undefined) patch.defaultMaxPerCall = args.maxPerCall;
  return patch;
}

function usage(): string {
  return [
    "Usage: bun apps/api/scripts/catalog-update.ts --slug <slug> [--recipient <pubkey>]",
    "       [--enable | --disable] [--max-per-call <int>] [--apply]",
    "",
    "Default is dry-run. Pass --apply to write. See file header for details.",
  ].join("\n");
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed.ok) {
    if (parsed.error === "HELP") {
      console.log(usage());
      process.exit(0);
    }
    console.error(`error: ${parsed.error}\n\n${usage()}`);
    process.exit(1);
  }
  const args = parsed.args;

  const db = getDb();

  // Read current row.
  const [before] = await db
    .select()
    .from(serviceCatalog)
    .where(eq(serviceCatalog.slug, args.slug))
    .limit(1);

  if (!before) {
    console.error(`error: no service_catalog row with slug='${args.slug}'`);
    console.error("Hint: run `bun --filter @klink/api run db:seed` first to insert the 4 curated slugs.");
    process.exit(2);
  }

  const patch = buildUpdatePatch(args);
  const after = { ...before, ...patch };

  console.log("=== service_catalog update plan ===");
  console.log(`slug:                  ${before.slug}`);
  console.log(`name:                  ${before.name}`);
  console.log(`base_url:              ${before.baseUrl}`);
  console.log(`recipient   before:    ${before.paymentRecipientPubkey}`);
  console.log(`recipient   after:     ${after.paymentRecipientPubkey}`);
  console.log(`enabled     before:    ${before.enabled}`);
  console.log(`enabled     after:     ${after.enabled}`);
  console.log(`max_per_call before:   ${before.defaultMaxPerCall}`);
  console.log(`max_per_call after:    ${after.defaultMaxPerCall}`);
  console.log("");

  if (!args.apply) {
    console.log("DRY RUN — no changes written. Re-run with --apply to persist.");
    process.exit(0);
  }

  const result = await db
    .update(serviceCatalog)
    .set(patch)
    .where(eq(serviceCatalog.slug, args.slug))
    .returning({ slug: serviceCatalog.slug, enabled: serviceCatalog.enabled });

  if (result.length === 0) {
    // Shouldn't happen — we just SELECTed the row above — but a concurrent
    // delete is theoretically possible. Surface it loudly.
    console.error("error: UPDATE affected 0 rows (row may have been deleted concurrently)");
    process.exit(3);
  }
  console.log(`APPLIED — slug=${result[0]!.slug} enabled=${result[0]!.enabled}`);
  process.exit(0);
}

// Only run main() when invoked directly, not when imported by the test suite.
// `import.meta.main` is Bun's flag for "this is the entrypoint".
if (import.meta.main) {
  main().catch((err) => {
    console.error("catalog-update crashed:", err);
    process.exit(3);
  });
}
