#!/usr/bin/env bun
/**
 * Live e2e harness for the dashboard-side flows.
 *
 * Drives the same calls the Next.js dashboard would make, against the api
 * running at API_URL (default http://localhost:3000) using a funded devnet
 * keypair from `.devnet-test-keypair.json` at the repo root.
 *
 * What it covers:
 *   1. SIWS sign-in (POST /v1/auth/siws/nonce + POST /v1/auth/siws)
 *   2. GET /v1/wallet (no wallet yet → 404)
 *   3. POST /v1/wallet → either txBase64 (sign + submit) or alreadyExists
 *   4. GET /v1/wallet (now exists)
 *   5. GET /v1/fund/deposit-address (verify Solana Pay QR shape)
 *   6. POST /v1/session → mint API key (sign add_session tx)
 *   7. GET /v1/sessions (list)
 *   8. GET /v1/sessions/:id (single + on-chain projection)
 *   9. GET /v1/audit (camelCase fix verification)
 *  10. POST /v1/spend/transfer with the API key (small USDC amount → throwaway recipient)
 *
 * Reports each step's status + first-line response. On failure prints body.
 *
 * Usage (from apps/api):
 *   bun scripts/e2e-dashboard.ts
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import bs58 from "bs58";
import nacl from "tweetnacl";

const API_URL = process.env.E2E_API_URL ?? "http://localhost:3000";
const RPC_URL = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const USDC_MINT = new PublicKey(
  process.env.USDC_MINT ?? "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
);

const SECRET_PATH = resolve(import.meta.dir, "..", "..", "..", ".devnet-test-keypair.json");
const secret = JSON.parse(readFileSync(SECRET_PATH, "utf8")) as number[];
const owner = Keypair.fromSecretKey(Uint8Array.from(secret));
const conn = new Connection(RPC_URL, "confirmed");

console.log(`api : ${API_URL}`);
console.log(`rpc : ${RPC_URL}`);
console.log(`pk  : ${owner.publicKey.toBase58()}`);
console.log("");

let pass = 0;
let fail = 0;
const failures: { step: string; reason: string; body?: unknown }[] = [];

async function step<T>(
  name: string,
  fn: () => Promise<T>,
  // Optional success-summary projection (one line) to keep output tight.
  summarize?: (r: T) => string,
): Promise<T | null> {
  process.stdout.write(`  ${name} ... `);
  try {
    const result = await fn();
    pass++;
    const tail = summarize ? ` — ${summarize(result)}` : "";
    console.log(`OK${tail}`);
    return result;
  } catch (err) {
    fail++;
    const reason = err instanceof Error ? err.message : String(err);
    failures.push({ step: name, reason });
    console.log(`FAIL — ${reason}`);
    return null;
  }
}

// HTTP helper that throws non-2xx with status + body for visibility.
async function http(
  method: string,
  path: string,
  opts: { jwt?: string; apiKey?: string; body?: unknown } = {},
): Promise<{ status: number; json: unknown }> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.jwt) headers.authorization = `Bearer ${opts.jwt}`;
  if (opts.apiKey) headers.authorization = `Bearer ${opts.apiKey}`;
  const r = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await r.text();
  let json: unknown = text;
  try {
    json = JSON.parse(text);
  } catch {
    // non-JSON response — keep as text
  }
  if (r.status >= 400 && r.status !== 404) {
    throw new Error(`${method} ${path} → ${r.status}: ${text.slice(0, 200)}`);
  }
  return { status: r.status, json };
}

// ---------------------------------------------------------------------------
// 1. SIWS sign-in
// ---------------------------------------------------------------------------
console.log("§1 SIWS sign-in");
const jwt = await step(
  "POST /v1/auth/siws/nonce + sign + POST /v1/auth/siws",
  async (): Promise<string> => {
    const n = await http("POST", "/v1/auth/siws/nonce");
    const nonce = (n.json as { nonce: string }).nonce;
    const message = new TextEncoder().encode(`Sign in to klink: ${nonce}`);
    const sig = nacl.sign.detached(message, owner.secretKey);
    const sigB58 = bs58.encode(sig);
    const r = await http("POST", "/v1/auth/siws", {
      body: { pubkey: owner.publicKey.toBase58(), signature: sigB58, nonce },
    });
    const body = r.json as { token?: string; userId?: string; error?: string };
    if (!body.token) throw new Error(`no token in response: ${JSON.stringify(body)}`);
    return body.token;
  },
  (t) => `jwt len=${t.length}`,
);
if (!jwt) {
  console.log("\nCannot continue without JWT.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 2. GET /v1/wallet (might 404 if first-time)
// ---------------------------------------------------------------------------
console.log("\n§2 Wallet read (pre-create)");
const walletPre = await step(
  "GET /v1/wallet",
  () => http("GET", "/v1/wallet", { jwt }),
  (r) =>
    r.status === 404
      ? "404 (no wallet yet — expected)"
      : `200 ${JSON.stringify(r.json).slice(0, 80)}`,
);

// ---------------------------------------------------------------------------
// 3. POST /v1/wallet — build init_vault, sign, submit
// ---------------------------------------------------------------------------
console.log("\n§3 Wallet create (init_vault)");
const built = await step(
  "POST /v1/wallet → build + sign + submit",
  async () => {
    const r = await http("POST", "/v1/wallet", {
      jwt,
      body: { max_deployed_fraction_bp: 8000 },
    });
    const body = r.json as {
      alreadyExists?: boolean;
      txBase64?: string;
      vaultPda?: string;
      vaultUsdcAta?: string;
      walletId?: string;
      maxDeployedFractionBp?: number;
    };
    if (body.alreadyExists) {
      return { kind: "already" as const, vaultPda: body.vaultPda, vaultUsdcAta: body.vaultUsdcAta };
    }
    if (!body.txBase64) throw new Error(`no txBase64: ${JSON.stringify(body)}`);
    const tx = Transaction.from(Buffer.from(body.txBase64, "base64"));
    tx.partialSign(owner);
    const sig = await conn.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    });
    await conn.confirmTransaction(sig, "confirmed");
    // After the on-chain init_vault confirms, the build-tx branch hasn't
    // inserted a `wallets` DB row — only the alreadyExists branch does.
    // Mimic what the dashboard *should* do: POST again to trigger the
    // self-heal backfill. If the dashboard doesn't do this today, the
    // overview page renders the CreateWalletCta forever (real UX bug).
    const r2 = await http("POST", "/v1/wallet", {
      jwt,
      body: { max_deployed_fraction_bp: 8000 },
    });
    const body2 = r2.json as { alreadyExists?: boolean };
    if (!body2.alreadyExists) {
      throw new Error(
        `second POST should have hit alreadyExists branch but didn't: ${JSON.stringify(body2)}`,
      );
    }
    return {
      kind: "submitted" as const,
      vaultPda: body.vaultPda,
      vaultUsdcAta: body.vaultUsdcAta,
      txSig: sig,
    };
  },
  (r) =>
    r.kind === "already"
      ? `alreadyExists vault=${r.vaultPda?.slice(0, 8)}…`
      : `submitted tx=${r.txSig?.slice(0, 8)}… vault=${r.vaultPda?.slice(0, 8)}…`,
);

// ---------------------------------------------------------------------------
// 4. GET /v1/wallet (now exists)
// ---------------------------------------------------------------------------
console.log("\n§4 Wallet read (post-create)");
const wallet = await step(
  "GET /v1/wallet",
  async () => {
    const r = await http("GET", "/v1/wallet", { jwt });
    if (r.status !== 200)
      throw new Error(`expected 200, got ${r.status}: ${JSON.stringify(r.json)}`);
    return r.json as {
      id: string;
      vaultPda: string;
      usdcAta: string;
      maxDeployedFractionBp: number;
      ownerPubkey: string;
      createdAt: string;
    };
  },
  (w) => `id=${w.id.slice(0, 8)}… bp=${w.maxDeployedFractionBp}`,
);
if (!wallet) {
  console.log("\nCannot continue without wallet.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 5. GET /v1/fund/deposit-address — verify Solana Pay QR
// ---------------------------------------------------------------------------
console.log("\n§5 Fund deposit-address (Solana Pay QR)");
await step(
  "GET /v1/fund/deposit-address",
  async () => {
    const r = await http("GET", `/v1/fund/deposit-address?wallet_id=${wallet.id}`, { jwt });
    const body = r.json as { vault_pda: string; usdc_ata: string; qr_data_url: string };
    if (!body.qr_data_url?.startsWith("data:image")) {
      throw new Error(`qr_data_url not a data URL: ${body.qr_data_url?.slice(0, 50)}`);
    }
    return body;
  },
  (b) => `ata=${b.usdc_ata.slice(0, 8)}… qr=${b.qr_data_url.length}b`,
);

// ---------------------------------------------------------------------------
// 6. POST /v1/session — generate session, mint api key, sign + submit
// ---------------------------------------------------------------------------
console.log("\n§6 Session create + mint API key");
const sessionResult = await step(
  "POST /v1/session → build + sign + submit",
  async () => {
    const r = await http("POST", "/v1/session", {
      jwt,
      body: {
        wallet_id: wallet.id,
        label: "e2e-test-session",
        max_per_tx: 1_000_000, // 1 USDC
        daily_cap: 5_000_000, // 5 USDC
        allowed_recipients: [], // no recipients yet — will be set via update_session_allowlist
        allowed_instructions: 0b001, // transfer_usdc only
        expiry: 0, // never expires
      },
    });
    if (r.status !== 200) throw new Error(`status ${r.status}: ${JSON.stringify(r.json)}`);
    const body = r.json as {
      txBase64: string;
      sessionId: string;
      sessionPubkey: string;
      apiKey: string;
      keyPrefix: string;
    };
    const tx = Transaction.from(Buffer.from(body.txBase64, "base64"));
    tx.partialSign(owner);
    const sig = await conn.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    });
    await conn.confirmTransaction(sig, "confirmed");
    return { ...body, txSig: sig };
  },
  (r) => `session=${r.sessionId.slice(0, 8)}… key=${r.keyPrefix} tx=${r.txSig.slice(0, 8)}…`,
);

// ---------------------------------------------------------------------------
// 7. GET /v1/sessions
// ---------------------------------------------------------------------------
console.log("\n§7 Session list");
await step(
  "GET /v1/sessions",
  async () => {
    const r = await http("GET", "/v1/sessions", { jwt });
    const body = r.json as Array<{ id: string; label: string; keyPrefix: string }>;
    if (!Array.isArray(body)) throw new Error(`expected array, got ${typeof body}`);
    return body;
  },
  (rows) => `count=${rows.length}${rows[0] ? ` [0]=${rows[0].label}` : ""}`,
);

// ---------------------------------------------------------------------------
// 8. GET /v1/sessions/:id
// ---------------------------------------------------------------------------
if (sessionResult) {
  console.log("\n§8 Session detail (with on-chain projection)");
  await step(
    "GET /v1/sessions/:id",
    async () => {
      const r = await http("GET", `/v1/sessions/${sessionResult.sessionId}`, { jwt });
      if (r.status !== 200) throw new Error(`status ${r.status}: ${JSON.stringify(r.json)}`);
      const body = r.json as {
        id: string;
        label: string;
        onChain: { maxPerTx: string; dailyCap: string } | null;
        onChainError: string | null;
        offChainPolicy: unknown;
      };
      return body;
    },
    (b) =>
      b.onChain
        ? `onChain.maxPerTx=${b.onChain.maxPerTx} dailyCap=${b.onChain.dailyCap}`
        : `onChainError=${b.onChainError}`,
  );
}

// ---------------------------------------------------------------------------
// 9. GET /v1/audit (camelCase fix verification)
// ---------------------------------------------------------------------------
console.log("\n§9 Audit log (camelCase fix verification)");
await step(
  "GET /v1/audit",
  async () => {
    const r = await http("GET", "/v1/audit?limit=5", { jwt });
    if (r.status !== 200) throw new Error(`status ${r.status}: ${JSON.stringify(r.json)}`);
    const body = r.json as { entries: Array<Record<string, unknown>>; next_cursor: number | null };
    if (!Array.isArray(body.entries)) throw new Error("entries not an array");
    // Spot-check casing on the first entry, if any.
    if (body.entries.length > 0) {
      const e = body.entries[0];
      if (e && "wallet_id" in e) {
        throw new Error(
          `entry has snake_case 'wallet_id' — camelCase fix didn't land. Keys: ${Object.keys(e).join(",")}`,
        );
      }
      if (e && !("walletId" in e || e.walletId === null)) {
        // tolerate explicit null for walletId
      }
    }
    return body;
  },
  (b) => `entries=${b.entries.length} next=${b.next_cursor ?? "null"}`,
);

// ---------------------------------------------------------------------------
// 10. POST /v1/spend/transfer with the API key
// ---------------------------------------------------------------------------
if (sessionResult) {
  console.log("\n§10 Spend transfer (API-key authenticated)");

  // Need to add a recipient to the session first via PATCH /v1/session/:id/allowlist.
  const recipient = Keypair.generate(); // throwaway recipient
  const recipientAta = getAssociatedTokenAddressSync(USDC_MINT, recipient.publicKey);
  console.log(`  (recipient = ${recipient.publicKey.toBase58().slice(0, 8)}…)`);

  // The on-chain `transfer_usdc` instruction does NOT auto-create the
  // recipient's USDC ATA — it expects it to already exist. In production
  // this is the agent's job (pay rent + createATA for new recipients);
  // for the test we pre-create it from the owner's wallet.
  await step(
    "Pre-create recipient USDC ATA (paid by owner)",
    async () => {
      const { createAssociatedTokenAccountIdempotentInstruction } = await import(
        "@solana/spl-token"
      );
      const ix = createAssociatedTokenAccountIdempotentInstruction(
        owner.publicKey, // payer
        recipientAta,
        recipient.publicKey, // owner of ata
        USDC_MINT,
      );
      const tx = new Transaction({ feePayer: owner.publicKey });
      const { blockhash } = await conn.getLatestBlockhash("finalized");
      tx.recentBlockhash = blockhash;
      tx.add(ix);
      tx.partialSign(owner);
      const sig = await conn.sendRawTransaction(tx.serialize(), {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      });
      await conn.confirmTransaction(sig, "confirmed");
      return sig;
    },
    (sig) => `tx=${sig.slice(0, 8)}…`,
  );

  await step(
    "PATCH /v1/session/:id/allowlist (add recipient) + sign + submit",
    async () => {
      const r = await http("PATCH", `/v1/session/${sessionResult.sessionId}/allowlist`, {
        jwt,
        body: {
          action: "Set",
          recipients: [recipient.publicKey.toBase58()],
        },
      });
      if (r.status !== 200) throw new Error(`status ${r.status}: ${JSON.stringify(r.json)}`);
      const body = r.json as { txBase64: string };
      const tx = Transaction.from(Buffer.from(body.txBase64, "base64"));
      tx.partialSign(owner);
      const sig = await conn.sendRawTransaction(tx.serialize(), {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      });
      await conn.confirmTransaction(sig, "confirmed");
      return sig;
    },
    (sig) => `tx=${sig.slice(0, 8)}…`,
  );

  // Vault USDC ATA needs to have USDC. The owner (the keypair) has USDC at
  // its own ATA, not at the vault's ATA. Move 5 USDC from owner ATA to vault ATA.
  await step(
    "Fund vault USDC ATA from owner (5 USDC SPL transfer)",
    async () => {
      const ownerAta = getAssociatedTokenAddressSync(USDC_MINT, owner.publicKey);
      const vaultAta = new PublicKey(wallet.usdcAta);
      const { createTransferCheckedInstruction } = await import("@solana/spl-token");
      const ix = createTransferCheckedInstruction(
        ownerAta,
        USDC_MINT,
        vaultAta,
        owner.publicKey,
        5_000_000n,
        6,
      );
      const tx = new Transaction({ feePayer: owner.publicKey });
      const { blockhash } = await conn.getLatestBlockhash("finalized");
      tx.recentBlockhash = blockhash;
      tx.add(ix);
      tx.partialSign(owner);
      const sig = await conn.sendRawTransaction(tx.serialize(), {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      });
      await conn.confirmTransaction(sig, "confirmed");
      return sig;
    },
    (sig) => `tx=${sig.slice(0, 8)}…`,
  );

  await step(
    "POST /v1/spend/transfer (api-key auth, 0.5 USDC)",
    async () => {
      const r = await http("POST", "/v1/spend/transfer", {
        apiKey: sessionResult.apiKey,
        body: {
          recipient: recipient.publicKey.toBase58(),
          amount: 500_000, // 0.5 USDC (under max_per_tx of 1 USDC)
        },
      });
      if (r.status !== 200) throw new Error(`status ${r.status}: ${JSON.stringify(r.json)}`);
      const body = r.json as { tx_signature: string; status: string };
      return body;
    },
    (b) => `tx=${b.tx_signature.slice(0, 8)}… status=${b.status}`,
  );

  await step(
    "GET /v1/audit (after spend — should show the new entry)",
    async () => {
      // Brief delay for the audit row to land.
      await new Promise((r) => setTimeout(r, 400));
      const r = await http("GET", "/v1/audit?limit=5", { jwt });
      const body = r.json as { entries: Array<Record<string, unknown>> };
      if (body.entries.length === 0) throw new Error("audit log empty after spend");
      const latest = body.entries[0];
      if (latest && "wallet_id" in latest) {
        throw new Error("audit response still snake_case — fix did not deploy?");
      }
      return latest;
    },
    (e) =>
      `latest action=${(e as { action: string }).action} decision=${(e as { decision: string }).decision}`,
  );
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log("");
console.log("═══════════════════════════════════════════════════════");
console.log(`E2E result: ${pass} pass, ${fail} fail`);
if (failures.length > 0) {
  console.log("");
  console.log("Failures:");
  for (const f of failures) {
    console.log(`  ✗ ${f.step}`);
    console.log(`    ${f.reason}`);
  }
  process.exit(1);
}
process.exit(0);
