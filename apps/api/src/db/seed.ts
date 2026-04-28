/**
 * Service-catalog seed (T-220). Idempotent: re-running is a no-op via
 * onConflictDoNothing on the unique slug.
 *
 * Run with: bun --filter @klink/api run db:seed
 *
 * NOTE: paymentRecipientPubkey values are placeholders (the system program
 * address — 32 bytes of zero). They're flagged enabled=false; T-211 will
 * replace them with real mpp.dev recipient pubkeys before turning each row
 * on. Do not enable a row until its pubkey is verified.
 */

import { getDb } from "./client";
import { serviceCatalog } from "./schema";

const PLACEHOLDER_PUBKEY = "11111111111111111111111111111111"; // System program — placeholder

const SEEDS = [
  {
    slug: "anthropic-claude",
    name: "Anthropic Claude",
    baseUrl: "https://anthropic.mpp.paywithlocus.com",
    paymentRecipientPubkey: PLACEHOLDER_PUBKEY,
    defaultMaxPerCall: 0,
    enabled: false,
  },
  {
    slug: "openai-chatgpt",
    name: "OpenAI ChatGPT",
    baseUrl: "https://openai.mpp.paywithlocus.com",
    paymentRecipientPubkey: PLACEHOLDER_PUBKEY,
    defaultMaxPerCall: 0,
    enabled: false,
  },
  {
    slug: "exa-search",
    name: "Exa Search",
    baseUrl: "https://exa.mpp.paywithlocus.com",
    paymentRecipientPubkey: PLACEHOLDER_PUBKEY,
    defaultMaxPerCall: 0,
    enabled: false,
  },
  {
    slug: "firecrawl",
    name: "Firecrawl",
    baseUrl: "https://firecrawl.mpp.paywithlocus.com",
    paymentRecipientPubkey: PLACEHOLDER_PUBKEY,
    defaultMaxPerCall: 0,
    enabled: false,
  },
];

async function main() {
  const db = getDb();
  const result = await db
    .insert(serviceCatalog)
    .values(SEEDS)
    .onConflictDoNothing({ target: serviceCatalog.slug })
    .returning({ slug: serviceCatalog.slug });
  console.log(
    `seeded service_catalog: inserted ${result.length} new row(s) of ${SEEDS.length} candidates`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("seed failed:", err);
  process.exit(1);
});
