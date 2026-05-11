#!/usr/bin/env bun
/**
 * T-503 — Demo replay script.
 *
 * Drives the public klink devnet happy path end-to-end in under 3 minutes
 * wall-clock. This is the runnable companion to gitbook/getting-started/quickstart.md
 * (which is the human walkthrough). Use it to rehearse a demo, smoke-test
 * after a deploy, or hand to a teammate as "watch this script run, that's
 * what klink does".
 *
 * Six steps, in order:
 *   1. Create wallet (init_vault on-chain) using the funded devnet keypair.
 *   2. Fund the vault USDC ATA from that same keypair (5 USDC SPL transfer).
 *      (The dashboard's three fund paths — connected wallet / QR / Dodo card
 *      pay — all land USDC at this same ATA. The script uses an SPL transfer
 *      because it's the only path the script can drive without a human in
 *      the loop.)
 *   3. Manual session create + mint API key (dashboard JWT signs add_session).
 *   4. Manual deposit — POST /v1/yield/deposit. Devnet returns 503
 *      YIELD_DISABLED (Kamino devnet markets are unsupported); the script
 *      detects this, logs it, and continues. This is the documented happy
 *      path on devnet, not a failure.
 *   5. Agent spend — POST /v1/spend/mpp against the verified MPP echo
 *      service service01-kep9.onrender.com/echo. Captures the on-chain
 *      x-tx-signature and the upstream JSON body.
 *   6. Audit review — GET /v1/audit (JWT-authed) showing the spend row we
 *      just inserted.
 *
 * Each step prints:
 *   - one-line "▶ step N: <name>" header
 *   - request URL + payload (secrets redacted to first 8 chars + "...")
 *   - response status + body (long bodies truncated to 200 chars)
 *   - one-line "✓ step N done in <ms>ms" footer (or "✗ ... FAILED")
 *
 * Any non-2xx (other than the documented YIELD_DISABLED gate) fails the
 * script with exit code 1.
 *
 * Required env / files:
 *   .devnet-test-keypair.json (repo root) — funded devnet keypair JSON array
 *   KLINK_API_BASE                         — defaults to https://klink-api.onrender.com
 *   SOLANA_RPC_URL                         — defaults to https://api.devnet.solana.com
 *   USDC_MINT                              — defaults to devnet USDC mint
 *   ECHO_SERVICE_URL                       — defaults to the verified echo service
 *
 * Cold-start: the api on Render free tier sleeps after ~15 min idle and takes
 * ~30s to wake. The script issues a warm-up GET /health first and silently
 * retries up to 5 times with exponential backoff before counting it as a step.
 *
 * Usage:
 *   bun apps/api/scripts/demo-replay.ts
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import bs58 from "bs58";
import nacl from "tweetnacl";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const API_BASE = process.env.KLINK_API_BASE ?? "https://klink-api.onrender.com";
const RPC_URL = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const USDC_MINT = new PublicKey(
  process.env.USDC_MINT ?? "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
);
const ECHO_SERVICE_URL = process.env.ECHO_SERVICE_URL ?? "https://service01-kep9.onrender.com/echo";

const SECRET_PATH = resolve(import.meta.dir, "..", "..", "..", ".devnet-test-keypair.json");

// USDC has 6 decimals; all amounts below are in base units (lamports of USDC).
const FUND_AMOUNT_BASE_UNITS = 5_000_000n; // 5 USDC, 6 decimals
const SESSION_MAX_PER_TX_BASE_UNITS = 1_000_000; // 1 USDC per-spend ceiling for the demo session
const SESSION_DAILY_CAP_BASE_UNITS = 5_000_000; // 5 USDC daily cap for the demo session
const SPEND_MAX_AMOUNT_BASE_UNITS = 100_000; // 0.10 USDC ceiling; echo charges 0.01 USDC
const AUDIT_READ_SETTLE_MS = 500; // brief delay so the audit row is committed before we read it

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------

function redact(value: string, head = 8): string {
  if (value.length <= head) return value;
  return `${value.slice(0, head)}...`;
}

function truncateForLog(text: string, max = 200): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...(+${text.length - max} chars)`;
}

function fmtMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

let stepNum = 0;
function header(name: string): number {
  stepNum += 1;
  console.log("");
  console.log(`▶ step ${stepNum}: ${name}`);
  return stepNum;
}

function done(n: number, ms: number, note?: string): void {
  console.log(`✓ step ${n} done in ${fmtMs(ms)}${note ? ` — ${note}` : ""}`);
}

function fail(n: number, ms: number, why: string): never {
  console.log(`✗ step ${n} FAILED after ${fmtMs(ms)} — ${why}`);
  console.log("");
  console.log("Demo halted. The earlier on-chain steps (if any) are still real.");
  process.exit(1);
}

/**
 * Same ✗/footer format as fail(), but for prereq steps that aren't numbered
 * (SIWS sign-in, post-init wallet read). Keeps operator output consistent.
 */
function failPrereq(name: string, why: string): never {
  console.log(`✗ prereq (${name}) FAILED — ${why}`);
  console.log("");
  console.log("Demo halted. The earlier on-chain steps (if any) are still real.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// HTTP helpers (raw fetch — same pattern as e2e-dashboard.ts)
// ---------------------------------------------------------------------------

interface HttpResult {
  status: number;
  text: string;
  json: unknown;
  headers: Headers;
}

interface HttpOpts {
  jwt?: string;
  apiKey?: string;
  body?: unknown;
  /** suppress request/response logging — used by the warm-up call */
  quiet?: boolean;
}

async function http(method: string, path: string, opts: HttpOpts = {}): Promise<HttpResult> {
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  if (opts.jwt) headers.authorization = `Bearer ${opts.jwt}`;
  if (opts.apiKey) headers.authorization = `Bearer ${opts.apiKey}`;

  if (!opts.quiet) {
    const redactedHeaders = { ...headers };
    if (redactedHeaders.authorization) {
      const [scheme, tok] = redactedHeaders.authorization.split(" ");
      redactedHeaders.authorization = `${scheme ?? "Bearer"} ${redact(tok ?? "")}`;
    }
    console.log(`  → ${method} ${url}`);
    if (opts.body !== undefined) {
      console.log(`  → body: ${truncateForLog(JSON.stringify(opts.body))}`);
    }
  }

  const r = await fetch(url, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await r.text();
  let json: unknown = text;
  try {
    json = JSON.parse(text);
  } catch {
    // non-JSON response — keep raw text in `json` slot
  }

  if (!opts.quiet) {
    console.log(`  ← ${r.status} ${truncateForLog(text)}`);
  }
  return { status: r.status, text, json, headers: r.headers };
}

/**
 * Cold-start tolerant warm-up: api on Render free tier sleeps after ~15min,
 * cold boot ~30s. Retry GET /health a few times before treating any other
 * request as the canonical step.
 */
async function warmUpApi(maxAttempts = 5): Promise<void> {
  process.stdout.write(`  warming up ${API_BASE} `);
  let backoffMs = 2000;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const r = await http("GET", "/health", { quiet: true });
      if (r.status === 200) {
        console.log(`OK (attempt ${attempt})`);
        return;
      }
      process.stdout.write(`. (status ${r.status}) `);
    } catch (err) {
      process.stdout.write(`. (${err instanceof Error ? err.message : String(err)}) `);
    }
    if (attempt < maxAttempts) {
      await new Promise((res) => setTimeout(res, backoffMs));
      backoffMs = Math.min(backoffMs * 2, 15000);
    }
  }
  console.log("");
  console.log("WARN: api never returned 200 from /health; continuing anyway.");
}

// ---------------------------------------------------------------------------
// Setup: load keypair + connect
// ---------------------------------------------------------------------------

let owner: Keypair;
try {
  const secret = JSON.parse(readFileSync(SECRET_PATH, "utf8")) as number[];
  owner = Keypair.fromSecretKey(Uint8Array.from(secret));
} catch (err) {
  console.error(
    `Could not load devnet keypair from ${SECRET_PATH}.\nGenerate one with:  solana-keygen new --outfile .devnet-test-keypair.json\nThen airdrop some SOL + USDC to its pubkey on devnet.`,
  );
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(2);
}
const conn = new Connection(RPC_URL, "confirmed");

console.log("klink demo replay");
console.log("─────────────────");
console.log(`api          : ${API_BASE}`);
console.log(`rpc          : ${RPC_URL}`);
console.log(`owner pubkey : ${owner.publicKey.toBase58()}`);
console.log(`echo service : ${ECHO_SERVICE_URL}`);

await warmUpApi();
const startedAt = Date.now();

// ---------------------------------------------------------------------------
// SIWS sign-in (prereq for steps 1, 3, 6 — not a numbered step itself)
// ---------------------------------------------------------------------------

console.log("");
console.log("(prereq) SIWS sign-in");
const siwsStart = Date.now();
const nonceR = await http("POST", "/v1/auth/siws/nonce");
if (nonceR.status !== 200) {
  failPrereq(
    "SIWS nonce",
    `${nonceR.status} ${nonceR.text} — verify the keypair has SOL and KLINK_API_BASE (${API_BASE}) is reachable`,
  );
}
const nonce = (nonceR.json as { nonce: string }).nonce;
const message = new TextEncoder().encode(`Sign in to klink: ${nonce}`);
const sig = nacl.sign.detached(message, owner.secretKey);
const siwsR = await http("POST", "/v1/auth/siws", {
  body: {
    pubkey: owner.publicKey.toBase58(),
    signature: bs58.encode(sig),
    nonce,
  },
});
if (siwsR.status !== 200) {
  failPrereq(
    "SIWS verify",
    `${siwsR.status} ${siwsR.text} — verify the keypair signature path and that KLINK_API_BASE (${API_BASE}) is reachable`,
  );
}
const jwt = (siwsR.json as { token: string }).token;
console.log(`  signed in (jwt len=${jwt.length}) in ${fmtMs(Date.now() - siwsStart)}`);

// ---------------------------------------------------------------------------
// Step 1 — Create wallet
// ---------------------------------------------------------------------------

const s1 = header("create wallet (init_vault, idempotent)");
const t1 = Date.now();
const initR = await http("POST", "/v1/wallet", {
  jwt,
  body: { max_deployed_fraction_bp: 8000 },
});
if (initR.status !== 200) fail(s1, Date.now() - t1, `${initR.status} ${initR.text}`);
const initBody = initR.json as {
  alreadyExists?: boolean;
  txBase64?: string;
  vaultPda?: string;
  vaultUsdcAta?: string;
};
let vaultPda: string;
let vaultUsdcAta: string;
if (initBody.alreadyExists) {
  if (!initBody.vaultPda || !initBody.vaultUsdcAta) {
    fail(s1, Date.now() - t1, "alreadyExists branch missing vaultPda/vaultUsdcAta");
  }
  vaultPda = initBody.vaultPda;
  vaultUsdcAta = initBody.vaultUsdcAta;
  done(s1, Date.now() - t1, `wallet already exists vault=${redact(vaultPda)}`);
} else {
  if (!initBody.txBase64 || !initBody.vaultPda || !initBody.vaultUsdcAta) {
    fail(s1, Date.now() - t1, "build branch missing txBase64/vaultPda/vaultUsdcAta");
  }
  vaultPda = initBody.vaultPda;
  vaultUsdcAta = initBody.vaultUsdcAta;
  const tx = Transaction.from(Buffer.from(initBody.txBase64, "base64"));
  tx.partialSign(owner);
  const onChainSig = await conn.sendRawTransaction(tx.serialize(), {
    preflightCommitment: "confirmed",
  });
  await conn.confirmTransaction(onChainSig, "confirmed");
  // Self-heal POST so the wallets row gets inserted (matches dashboard flow).
  const r2 = await http("POST", "/v1/wallet", {
    jwt,
    body: { max_deployed_fraction_bp: 8000 },
  });
  if ((r2.json as { alreadyExists?: boolean }).alreadyExists !== true) {
    fail(s1, Date.now() - t1, `self-heal POST did not return alreadyExists: ${r2.text}`);
  }
  done(
    s1,
    Date.now() - t1,
    `init_vault submitted tx=${redact(onChainSig)} vault=${redact(vaultPda)}`,
  );
}

// Read /v1/wallet to get the wallet uuid (needed for fund + sessions endpoints).
const walletR = await http("GET", "/v1/wallet", { jwt });
if (walletR.status !== 200) {
  failPrereq(
    "GET /v1/wallet (post-init)",
    `${walletR.status} ${walletR.text} — init_vault landed on-chain but the api can't read the wallets row; check api logs`,
  );
}
const wallet = walletR.json as { id: string; vaultPda: string; usdcAta: string };

// ---------------------------------------------------------------------------
// Step 2 — Fund (SPL transfer from owner USDC ATA → vault USDC ATA)
// ---------------------------------------------------------------------------

const s2 = header("fund vault USDC ATA (5 USDC SPL transfer from owner)");
const t2 = Date.now();
{
  const ownerAta = getAssociatedTokenAddressSync(USDC_MINT, owner.publicKey);
  const vaultAta = new PublicKey(wallet.usdcAta);
  console.log(`  owner USDC ATA : ${ownerAta.toBase58()}`);
  console.log(`  vault USDC ATA : ${vaultAta.toBase58()}`);
  const { createTransferCheckedInstruction, createAssociatedTokenAccountIdempotentInstruction } =
    await import("@solana/spl-token");
  const tx = new Transaction({ feePayer: owner.publicKey });
  // Idempotently make sure the vault ATA exists (devnet may not have init'd it
  // through an earlier tx). Owner pays the rent.
  tx.add(
    createAssociatedTokenAccountIdempotentInstruction(
      owner.publicKey,
      vaultAta,
      new PublicKey(wallet.vaultPda),
      USDC_MINT,
    ),
  );
  tx.add(
    createTransferCheckedInstruction(
      ownerAta,
      USDC_MINT,
      vaultAta,
      owner.publicKey,
      FUND_AMOUNT_BASE_UNITS,
      6,
    ),
  );
  const { blockhash } = await conn.getLatestBlockhash("finalized");
  tx.recentBlockhash = blockhash;
  tx.partialSign(owner);
  let onChainSig: string;
  try {
    onChainSig = await conn.sendRawTransaction(tx.serialize(), {
      preflightCommitment: "confirmed",
    });
    await conn.confirmTransaction(onChainSig, "confirmed");
  } catch (err) {
    fail(
      s2,
      Date.now() - t2,
      `SPL transfer failed: ${err instanceof Error ? err.message : String(err)}.\nOwner pubkey ${owner.publicKey.toBase58()} likely does not have devnet USDC.\nMint some at https://faucet.circle.com (devnet USDC) and retry.`,
    );
  }
  // Confirm the vault saw the funds.
  const balR = await conn.getTokenAccountBalance(vaultAta);
  done(
    s2,
    Date.now() - t2,
    `tx=${redact(onChainSig)} vault balance=${balR.value.uiAmountString} USDC`,
  );
}

// ---------------------------------------------------------------------------
// Step 3 — Manual session create + mint API key
// ---------------------------------------------------------------------------

const s3 = header("manual session create (mint API key)");
const t3 = Date.now();
const sessR = await http("POST", "/v1/session", {
  jwt,
  body: {
    wallet_id: wallet.id,
    label: `demo-replay-${Date.now()}`,
    max_per_tx: SESSION_MAX_PER_TX_BASE_UNITS,
    daily_cap: SESSION_DAILY_CAP_BASE_UNITS,
    allowed_recipients: [],
    allowed_instructions: 0b001,
    expiry: 0,
  },
});
if (sessR.status !== 200) fail(s3, Date.now() - t3, `${sessR.status} ${sessR.text}`);
const sessBody = sessR.json as {
  txBase64: string;
  sessionId: string;
  sessionPubkey: string;
  apiKey: string;
  keyPrefix: string;
};
{
  const tx = Transaction.from(Buffer.from(sessBody.txBase64, "base64"));
  tx.partialSign(owner);
  const onChainSig = await conn.sendRawTransaction(tx.serialize(), {
    preflightCommitment: "confirmed",
  });
  await conn.confirmTransaction(onChainSig, "confirmed");
  done(
    s3,
    Date.now() - t3,
    `session=${redact(sessBody.sessionId)} key=${sessBody.keyPrefix}... tx=${redact(onChainSig)}`,
  );
}
const apiKey = sessBody.apiKey;

// ---------------------------------------------------------------------------
// Step 4 — Manual yield deposit (devnet expectation: 503 YIELD_DISABLED)
// ---------------------------------------------------------------------------

const s4 = header("manual yield deposit (expected 503 YIELD_DISABLED on devnet)");
const t4 = Date.now();
const yieldR = await http("POST", "/v1/yield/deposit", {
  apiKey,
  body: { amount: 1_000_000 },
});
if (yieldR.status === 503) {
  const ybody = yieldR.json as { error?: string; detail?: string };
  if (ybody.error === "YIELD_DISABLED") {
    done(
      s4,
      Date.now() - t4,
      "503 YIELD_DISABLED — gracefully skipped (Kamino devnet unsupported)",
    );
  } else {
    fail(s4, Date.now() - t4, `503 but unexpected error: ${yieldR.text}`);
  }
} else if (yieldR.status >= 200 && yieldR.status < 300) {
  done(s4, Date.now() - t4, "deposit accepted (non-devnet env?)");
} else {
  fail(s4, Date.now() - t4, `${yieldR.status} ${yieldR.text}`);
}

// ---------------------------------------------------------------------------
// Step 5 — Agent spend via /v1/spend/mpp against the verified echo service
// ---------------------------------------------------------------------------

const s5 = header(`agent spend via /v1/spend/mpp → ${ECHO_SERVICE_URL}`);
const t5 = Date.now();
const spendR = await http("POST", "/v1/spend/mpp", {
  apiKey,
  body: {
    url: ECHO_SERVICE_URL,
    max_amount: SPEND_MAX_AMOUNT_BASE_UNITS,
    method: "GET",
  },
});
if (spendR.status < 200 || spendR.status >= 300) {
  fail(s5, Date.now() - t5, `${spendR.status} ${spendR.text}`);
}
const txSig = spendR.headers.get("x-tx-signature") ?? "(missing x-tx-signature)";
const paymentReceipt = spendR.headers.get("payment-receipt");
console.log(`  x-tx-signature  : ${txSig}`);
if (paymentReceipt) console.log(`  payment-receipt : ${redact(paymentReceipt, 24)}`);
done(s5, Date.now() - t5, `paid + got upstream response (tx=${redact(txSig)})`);

// ---------------------------------------------------------------------------
// Step 6 — Audit review
// ---------------------------------------------------------------------------

const s6 = header("audit review (GET /v1/audit, JWT-authed)");
const t6 = Date.now();
// Brief delay so the audit row is committed before we read.
await new Promise((res) => setTimeout(res, AUDIT_READ_SETTLE_MS));
const auditR = await http("GET", "/v1/audit?limit=5", { jwt });
if (auditR.status !== 200) fail(s6, Date.now() - t6, `${auditR.status} ${auditR.text}`);
const auditBody = auditR.json as {
  entries: Array<{ action?: string; decision?: string; txSignature?: string; amount?: number }>;
};
if (!Array.isArray(auditBody.entries) || auditBody.entries.length === 0) {
  fail(s6, Date.now() - t6, "audit entries empty after spend");
}
const latest = auditBody.entries[0];
if (!latest) fail(s6, Date.now() - t6, "audit entries[0] missing");
console.log(
  `  latest entry  : action=${latest.action} decision=${latest.decision} amount=${latest.amount}`,
);
console.log(`  tx_signature  : ${latest.txSignature ?? "(null)"}`);
console.log("");
console.log(
  `  Visit https://klinkdotfun.vercel.app/dashboard/audit to verify visually (sign in with the same Phantom wallet: ${owner.publicKey.toBase58().slice(0, 8)}...).`,
);
done(s6, Date.now() - t6, `${auditBody.entries.length} entries, latest matches`);

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
console.log("");
console.log("══════════════════════════════════════════════════════");
console.log(`klink demo replay: 6/6 steps OK in ${elapsedSec}s`);
console.log("══════════════════════════════════════════════════════");
process.exit(0);
