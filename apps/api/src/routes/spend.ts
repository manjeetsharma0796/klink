import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { eq } from "drizzle-orm";
import type { Request, Response } from "express";
import { decryptSessionSecret } from "../crypto/session-secret";
import { loadTreasury as defaultLoadTreasury } from "../crypto/treasury";
import { getDb } from "../db/client";
import { auditLog, sessions } from "../db/schema";
import { type LoadPolicy, defaultLoadPolicy, withinTimeWindow } from "../policy/off-chain";
import { buildTransferUsdcIx } from "../program/agent-wallet";

/**
 * `POST /v1/spend/transfer` — agent-authenticated direct USDC transfer.
 *
 * Flow per spec §4.2.4:
 *   1. Auth (T-204 middleware sets req.session + req.wallet from API key).
 *   2. Validate body (recipient base58 + amount > 0).
 *   3. Time-of-day check via T-209's policy enforcer (URL allowlist not
 *      applicable for direct transfers).
 *   4. Liquidity check: vault USDC ATA balance ≥ amount (RPC).
 *   5. Build transfer_usdc tx, sign with session keypair (decrypted from DB),
 *      submit + await "confirmed".
 *   6. Insert audit_log (allow + tx_signature, OR deny + reason).
 *   7. Return tx_signature.
 *
 * Recipient + per-tx + daily caps are validated on-chain (T-105). Off-chain
 * we fast-fail only what's free to check (auth, liquidity, time window).
 */

function envOrThrow(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

interface SpendTransferBody {
  recipient: string;
  amount: number;
  memo?: string;
}

interface ValidationError {
  ok: false;
  status: number;
  body: { error: string };
}

function fail(status: number, error: string): ValidationError {
  return { ok: false, status, body: { error } };
}

function parseBody(raw: unknown): { ok: true; body: SpendTransferBody } | ValidationError {
  if (!raw || typeof raw !== "object") return fail(400, "request body must be JSON object");
  const b = raw as Record<string, unknown>;
  if (typeof b.recipient !== "string" || !b.recipient) {
    return fail(400, "recipient required (base58 pubkey)");
  }
  if (typeof b.amount !== "number" || !Number.isFinite(b.amount) || b.amount <= 0) {
    return fail(400, "amount must be a positive number (USDC base units)");
  }
  if (b.memo !== undefined && typeof b.memo !== "string") {
    return fail(400, "memo must be string if provided");
  }
  return {
    ok: true,
    body: { recipient: b.recipient, amount: b.amount, memo: b.memo as string | undefined },
  };
}

export type ConnectionFactory = () => Connection;
export type LiquidityReader = (conn: Connection, vaultUsdcAta: PublicKey) => Promise<bigint>;

const defaultLiquidity: LiquidityReader = async (conn, vaultUsdcAta) => {
  const bal = await conn.getTokenAccountBalance(vaultUsdcAta);
  // amount is a string; parse as bigint to avoid float precision loss
  return BigInt(bal.value.amount);
};

export interface MakePostSpendTransferDeps {
  connection?: ConnectionFactory;
  liquidity?: LiquidityReader;
  loadPolicy?: LoadPolicy;
  /** Test seam: replace the network-bound submit with a fake. */
  submit?: (conn: Connection, tx: Transaction, signers: Keypair[]) => Promise<string>;
  usdcMint?: () => PublicKey;
  /** Test seam: override treasury keypair load (T-226 fee payer). */
  loadTreasury?: () => Keypair;
}

export function makePostSpendTransferHandler(deps: MakePostSpendTransferDeps = {}) {
  const newConn =
    deps.connection ?? (() => new Connection(envOrThrow("SOLANA_RPC_URL"), "confirmed"));
  const readLiquidity = deps.liquidity ?? defaultLiquidity;
  const loadPolicy = deps.loadPolicy ?? defaultLoadPolicy;
  const doSubmit = deps.submit ?? sendAndConfirmTransaction;
  const getUsdcMint = deps.usdcMint ?? (() => new PublicKey(envOrThrow("USDC_MINT")));
  const getTreasury = deps.loadTreasury ?? defaultLoadTreasury;

  return async function postSpendTransfer(req: Request, res: Response) {
    const session = req.session;
    const wallet = req.wallet;
    if (!session || !wallet) {
      res.status(401).json({ error: "api key required" });
      return;
    }

    const parsed = parseBody(req.body);
    if (!parsed.ok) {
      res.status(parsed.status).json(parsed.body);
      return;
    }
    const body = parsed.body;

    let recipient: PublicKey;
    let vault: PublicKey;
    let vaultUsdcAta: PublicKey;
    let sessionPubkey: PublicKey;
    try {
      recipient = new PublicKey(body.recipient);
      vault = new PublicKey(wallet.vaultPda);
      vaultUsdcAta = new PublicKey(wallet.usdcAta);
      sessionPubkey = new PublicKey(session.sessionPubkey);
    } catch {
      res.status(400).json({ error: "invalid base58 pubkey on session/wallet/recipient" });
      return;
    }

    const masterKey = process.env.SESSION_SECRET_MASTER_KEY;
    if (!masterKey) {
      console.error("[POST /v1/spend/transfer] SESSION_SECRET_MASTER_KEY not set");
      res.status(500).json({ error: "server misconfigured" });
      return;
    }

    const db = getDb();
    const amount = BigInt(Math.trunc(body.amount));

    // 1. Time-of-day check (URL allowlist N/A for direct transfers).
    const policy = await loadPolicy(wallet.id);
    if (policy && !withinTimeWindow(Date.now(), policy)) {
      await db.insert(auditLog).values({
        walletId: wallet.id,
        sessionId: session.id,
        action: "spend_transfer",
        amount: Number(amount),
        recipientOrUrl: body.recipient,
        decision: "deny",
        reason: "OUTSIDE_TIME_WINDOW",
      });
      res.status(403).json({ error: "OUTSIDE_TIME_WINDOW" });
      return;
    }

    // 2. Liquidity check.
    const conn = newConn();
    let liquid: bigint;
    try {
      liquid = await readLiquidity(conn, vaultUsdcAta);
    } catch (err) {
      console.error("[POST /v1/spend/transfer] liquidity read failed:", err);
      res.status(503).json({ error: "rpc unavailable" });
      return;
    }
    if (liquid < amount) {
      await db.insert(auditLog).values({
        walletId: wallet.id,
        sessionId: session.id,
        action: "spend_transfer",
        amount: Number(amount),
        recipientOrUrl: body.recipient,
        decision: "deny",
        reason: "INSUFFICIENT_LIQUID",
      });
      res.status(402).json({
        error: "INSUFFICIENT_LIQUID",
        liquid: liquid.toString(),
        amount: amount.toString(),
        deficit: (amount - liquid).toString(),
      });
      return;
    }

    // 3. Decrypt session secret → reconstruct keypair.
    const [encryptedSecretRow] = await db
      .select({ secret: sessions.encryptedSessionSecret })
      .from(sessions)
      .where(eq(sessions.id, session.id))
      .limit(1);
    if (!encryptedSecretRow) {
      res.status(500).json({ error: "session row missing" });
      return;
    }
    let signer: Keypair;
    try {
      const secretBytes = decryptSessionSecret(encryptedSecretRow.secret, masterKey);
      signer = Keypair.fromSecretKey(secretBytes);
    } catch (err) {
      console.error("[POST /v1/spend/transfer] session secret decrypt failed:", err);
      res.status(500).json({ error: "session secret decrypt failed" });
      return;
    }

    // 4. Build instruction. Treasury keypair pays the network fee (T-226);
    //    session keypair signs only the on-chain `transfer_usdc` authority
    //    check. Session keypairs are minted with 0 SOL by Keypair.generate()
    //    in postSessionHandler, so they cannot pay fees themselves.
    let treasury: Keypair;
    try {
      treasury = getTreasury();
    } catch (err) {
      console.error("[POST /v1/spend/transfer] treasury load failed:", err);
      res.status(500).json({ error: "server misconfigured" });
      return;
    }
    const recipientUsdcAta = getAssociatedTokenAddressSync(getUsdcMint(), recipient);
    const ix = buildTransferUsdcIx({
      sessionSigner: signer.publicKey,
      vault,
      mint: getUsdcMint(),
      vaultUsdcAta,
      recipient,
      recipientUsdcAta,
      amount,
      tokenProgramId: TOKEN_PROGRAM_ID,
      sessionPubkey,
    });
    const tx = new Transaction({ feePayer: treasury.publicKey });
    tx.add(ix);
    const { blockhash } = await conn.getLatestBlockhash("finalized");
    tx.recentBlockhash = blockhash;

    // 5. Sign + submit. Both keypairs sign — treasury for the Solana fee,
    //    session for the program-level authority. The on-chain validator
    //    (T-105) catches recipient, cap, expiry, and revoked-session
    //    conditions. We surface those as deny-audit on submit failure.
    let signature: string;
    try {
      signature = await doSubmit(conn, tx, [treasury, signer]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown";
      await db.insert(auditLog).values({
        walletId: wallet.id,
        sessionId: session.id,
        action: "spend_transfer",
        amount: Number(amount),
        recipientOrUrl: body.recipient,
        decision: "deny",
        reason: `ON_CHAIN_REVERT: ${msg.slice(0, 200)}`,
      });
      res.status(402).json({ error: "on-chain submission failed", detail: msg });
      return;
    }

    // 6. Audit allow + return.
    await db.insert(auditLog).values({
      walletId: wallet.id,
      sessionId: session.id,
      action: "spend_transfer",
      amount: Number(amount),
      recipientOrUrl: body.recipient,
      decision: "allow",
      txSignature: signature,
    });

    res.json({ tx_signature: signature, status: "confirmed" });
  };
}

export const postSpendTransferHandler = makePostSpendTransferHandler();

// ===========================================================================
// T-212 — POST /v1/spend/sign-payment (custom x402 sign-only)
//
// Spec §4.2.3: agent owns the HTTP transport; backend just signs and submits.
// Off-chain policy is the URL allowlist (T-209 with the agent-supplied URL)
// + time-of-day. The agent retries the original call with X-Payment-Proof.
// ===========================================================================

interface SignPaymentBody {
  url: string;
  recipient: string;
  amount: number;
  /** Opaque to the backend; surfaced in audit_log.recipient_or_url for cross-ref. */
  payment_id?: string;
}

function parseSignPaymentBody(raw: unknown): { ok: true; body: SignPaymentBody } | ValidationError {
  if (!raw || typeof raw !== "object") return fail(400, "request body must be JSON object");
  const b = raw as Record<string, unknown>;
  if (typeof b.url !== "string" || !b.url) return fail(400, "url required");
  try {
    new URL(b.url);
  } catch {
    return fail(400, "url must be a valid URL");
  }
  if (typeof b.recipient !== "string" || !b.recipient) return fail(400, "recipient required");
  if (typeof b.amount !== "number" || !Number.isFinite(b.amount) || b.amount <= 0) {
    return fail(400, "amount must be a positive number (USDC base units)");
  }
  if (b.payment_id !== undefined && typeof b.payment_id !== "string") {
    return fail(400, "payment_id must be string if provided");
  }
  return {
    ok: true,
    body: {
      url: b.url,
      recipient: b.recipient,
      amount: b.amount,
      payment_id: b.payment_id as string | undefined,
    },
  };
}

export interface MakePostSpendSignPaymentDeps extends MakePostSpendTransferDeps {
  isCurated?: import("../policy/off-chain").IsCuratedSlug;
}

import { checkOffChainPolicy } from "../policy/off-chain";

export function makePostSpendSignPaymentHandler(deps: MakePostSpendSignPaymentDeps = {}) {
  const newConn =
    deps.connection ?? (() => new Connection(envOrThrow("SOLANA_RPC_URL"), "confirmed"));
  const readLiquidity = deps.liquidity ?? defaultLiquidity;
  const loadPolicy = deps.loadPolicy ?? defaultLoadPolicy;
  const doSubmit = deps.submit ?? sendAndConfirmTransaction;
  const getUsdcMint = deps.usdcMint ?? (() => new PublicKey(envOrThrow("USDC_MINT")));
  const getTreasury = deps.loadTreasury ?? defaultLoadTreasury;

  return async function postSpendSignPayment(req: Request, res: Response) {
    const session = req.session;
    const wallet = req.wallet;
    if (!session || !wallet) {
      res.status(401).json({ error: "api key required" });
      return;
    }

    const parsed = parseSignPaymentBody(req.body);
    if (!parsed.ok) {
      res.status(parsed.status).json(parsed.body);
      return;
    }
    const body = parsed.body;

    const masterKey = process.env.SESSION_SECRET_MASTER_KEY;
    if (!masterKey) {
      console.error("[POST /v1/spend/sign-payment] SESSION_SECRET_MASTER_KEY not set");
      res.status(500).json({ error: "server misconfigured" });
      return;
    }

    let recipient: PublicKey;
    let vault: PublicKey;
    let vaultUsdcAta: PublicKey;
    let sessionPubkey: PublicKey;
    try {
      recipient = new PublicKey(body.recipient);
      vault = new PublicKey(wallet.vaultPda);
      vaultUsdcAta = new PublicKey(wallet.usdcAta);
      sessionPubkey = new PublicKey(session.sessionPubkey);
    } catch {
      res.status(400).json({ error: "invalid base58 pubkey" });
      return;
    }

    const db = getDb();
    const amount = BigInt(Math.trunc(body.amount));

    // Off-chain policy: URL allowlist (T-209's full check including curated lookup) + time.
    const decision = await checkOffChainPolicy({
      walletId: wallet.id,
      url: body.url,
      loadPolicy,
      isCurated: deps.isCurated,
    });
    if (!decision.allowed) {
      await db.insert(auditLog).values({
        walletId: wallet.id,
        sessionId: session.id,
        action: "spend_sign_payment",
        amount: Number(amount),
        recipientOrUrl: body.url,
        decision: "deny",
        reason: decision.reason,
      });
      res.status(403).json({ error: decision.reason });
      return;
    }

    // Liquidity check.
    const conn = newConn();
    let liquid: bigint;
    try {
      liquid = await readLiquidity(conn, vaultUsdcAta);
    } catch (err) {
      console.error("[POST /v1/spend/sign-payment] liquidity read failed:", err);
      res.status(503).json({ error: "rpc unavailable" });
      return;
    }
    if (liquid < amount) {
      await db.insert(auditLog).values({
        walletId: wallet.id,
        sessionId: session.id,
        action: "spend_sign_payment",
        amount: Number(amount),
        recipientOrUrl: body.url,
        decision: "deny",
        reason: "INSUFFICIENT_LIQUID",
      });
      res.status(402).json({
        error: "INSUFFICIENT_LIQUID",
        liquid: liquid.toString(),
        amount: amount.toString(),
      });
      return;
    }

    // Decrypt session, build, sign, submit.
    const [encryptedRow] = await db
      .select({ secret: sessions.encryptedSessionSecret })
      .from(sessions)
      .where(eq(sessions.id, session.id))
      .limit(1);
    if (!encryptedRow) {
      res.status(500).json({ error: "session row missing" });
      return;
    }
    const signer = Keypair.fromSecretKey(decryptSessionSecret(encryptedRow.secret, masterKey));
    let treasury: Keypair;
    try {
      treasury = getTreasury();
    } catch (err) {
      console.error("[POST /v1/spend/sign-payment] treasury load failed:", err);
      res.status(500).json({ error: "server misconfigured" });
      return;
    }
    const recipientUsdcAta = getAssociatedTokenAddressSync(getUsdcMint(), recipient);
    const ix = buildTransferUsdcIx({
      sessionSigner: signer.publicKey,
      vault,
      mint: getUsdcMint(),
      vaultUsdcAta,
      recipient,
      recipientUsdcAta,
      amount,
      tokenProgramId: TOKEN_PROGRAM_ID,
      sessionPubkey,
    });
    // T-226: treasury pays the fee, session signs the instruction.
    const tx = new Transaction({ feePayer: treasury.publicKey });
    tx.add(ix);
    const { blockhash } = await conn.getLatestBlockhash("finalized");
    tx.recentBlockhash = blockhash;

    let signature: string;
    try {
      signature = await doSubmit(conn, tx, [treasury, signer]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown";
      await db.insert(auditLog).values({
        walletId: wallet.id,
        sessionId: session.id,
        action: "spend_sign_payment",
        amount: Number(amount),
        recipientOrUrl: body.url,
        decision: "deny",
        reason: `ON_CHAIN_REVERT: ${msg.slice(0, 200)}`,
      });
      res.status(402).json({ error: "on-chain submission failed", detail: msg });
      return;
    }

    await db.insert(auditLog).values({
      walletId: wallet.id,
      sessionId: session.id,
      action: "spend_sign_payment",
      amount: Number(amount),
      recipientOrUrl: body.url,
      decision: "allow",
      txSignature: signature,
    });

    // payment_proof_header is what the agent sends as `X-Payment-Proof:` on
    // the retry to its service. The base58 signature is the canonical proof.
    res.json({ tx_signature: signature, payment_proof_header: signature });
  };
}

export const postSpendSignPaymentHandler = makePostSpendSignPaymentHandler();

// ===========================================================================
// T-211 — POST /v1/spend/service (mpp.dev curated proxy)
//
// Spec §4.2.2: backend probes the service URL, verifies the quoted amount
// against `max_amount`, signs + submits the spend tx, then retries the
// service with X-Payment-Proof. Returns the service response to the agent.
// ===========================================================================

interface SpendServiceBody {
  slug: string;
  path: string;
  body?: unknown;
  /** USDC base units; cap on what the backend will sign for. */
  max_amount: number;
  /** "GET" | "POST" — defaults to POST for x402 paid endpoints. */
  method?: string;
}

function parseSpendServiceBody(
  raw: unknown,
): { ok: true; body: SpendServiceBody } | ValidationError {
  if (!raw || typeof raw !== "object") return fail(400, "request body must be JSON object");
  const b = raw as Record<string, unknown>;
  if (typeof b.slug !== "string" || !b.slug) return fail(400, "slug required");
  if (typeof b.path !== "string" || !b.path.startsWith("/")) {
    return fail(400, "path required (must start with /)");
  }
  if (typeof b.max_amount !== "number" || !Number.isFinite(b.max_amount) || b.max_amount <= 0) {
    return fail(400, "max_amount must be a positive number (USDC base units)");
  }
  if (b.method !== undefined && b.method !== "GET" && b.method !== "POST") {
    return fail(400, "method must be 'GET' | 'POST' if provided");
  }
  return {
    ok: true,
    body: {
      slug: b.slug,
      path: b.path,
      body: b.body,
      max_amount: b.max_amount,
      method: b.method as "GET" | "POST" | undefined,
    },
  };
}

import { serviceCatalog } from "../db/schema";

/** Shape returned by an x402 service in the 402 challenge. */
interface PaymentRequirements {
  amount: number; // USDC base units
  recipient: string; // base58
  payment_id?: string;
  /** Currency identifier ("USDC", etc.). Validated to be USDC. */
  currency?: string;
}

export type FetchFn = typeof fetch;

export interface MakePostSpendServiceDeps extends MakePostSpendTransferDeps {
  fetchFn?: FetchFn;
}

export function makePostSpendServiceHandler(deps: MakePostSpendServiceDeps = {}) {
  const newConn =
    deps.connection ?? (() => new Connection(envOrThrow("SOLANA_RPC_URL"), "confirmed"));
  const readLiquidity = deps.liquidity ?? defaultLiquidity;
  const doSubmit = deps.submit ?? sendAndConfirmTransaction;
  const getUsdcMint = deps.usdcMint ?? (() => new PublicKey(envOrThrow("USDC_MINT")));
  const doFetch = deps.fetchFn ?? fetch;
  const getTreasury = deps.loadTreasury ?? defaultLoadTreasury;

  return async function postSpendService(req: Request, res: Response) {
    const session = req.session;
    const wallet = req.wallet;
    if (!session || !wallet) {
      res.status(401).json({ error: "api key required" });
      return;
    }

    const parsed = parseSpendServiceBody(req.body);
    if (!parsed.ok) {
      res.status(parsed.status).json(parsed.body);
      return;
    }
    const body = parsed.body;

    const masterKey = process.env.SESSION_SECRET_MASTER_KEY;
    if (!masterKey) {
      console.error("[POST /v1/spend/service] SESSION_SECRET_MASTER_KEY not set");
      res.status(500).json({ error: "server misconfigured" });
      return;
    }

    const db = getDb();

    // Look up the service in the curated catalog (T-220).
    const [svc] = await db
      .select({
        baseUrl: serviceCatalog.baseUrl,
        paymentRecipientPubkey: serviceCatalog.paymentRecipientPubkey,
        enabled: serviceCatalog.enabled,
      })
      .from(serviceCatalog)
      .where(eq(serviceCatalog.slug, body.slug))
      .limit(1);
    if (!svc || !svc.enabled) {
      res.status(404).json({ error: `service '${body.slug}' not in catalog or disabled` });
      return;
    }

    const targetUrl = svc.baseUrl.replace(/\/$/, "") + body.path;

    // Probe the service: expect 402 + JSON requirements.
    let probeResp: globalThis.Response;
    try {
      probeResp = (await doFetch(targetUrl, {
        method: body.method ?? "POST",
        headers: { "content-type": "application/json" },
        body: body.body !== undefined ? JSON.stringify(body.body) : undefined,
      })) as globalThis.Response;
    } catch (err) {
      console.error("[POST /v1/spend/service] probe failed:", err);
      res.status(502).json({ error: "service probe failed", detail: String(err) });
      return;
    }

    if (probeResp.status !== 402) {
      // Service didn't ask for payment — surface the response unchanged.
      const passthroughBody = await probeResp.text();
      res
        .status(probeResp.status)
        .type(probeResp.headers.get("content-type") ?? "text/plain")
        .send(passthroughBody);
      return;
    }

    let reqs: PaymentRequirements;
    try {
      reqs = (await probeResp.json()) as PaymentRequirements;
    } catch (err) {
      res.status(502).json({
        error: "service returned 402 with invalid JSON requirements",
        detail: String(err),
      });
      return;
    }
    if (typeof reqs.amount !== "number" || typeof reqs.recipient !== "string") {
      res.status(502).json({ error: "service requirements missing amount or recipient" });
      return;
    }
    if (reqs.amount > body.max_amount) {
      await db.insert(auditLog).values({
        walletId: wallet.id,
        sessionId: session.id,
        action: "spend_service",
        amount: reqs.amount,
        recipientOrUrl: targetUrl,
        decision: "deny",
        reason: `QUOTED_OVER_MAX: ${reqs.amount} > ${body.max_amount}`,
      });
      res.status(402).json({
        error: "QUOTED_OVER_MAX",
        quoted: reqs.amount,
        max_amount: body.max_amount,
      });
      return;
    }

    // Sanity: recipient should match the catalog row (curated services).
    if (reqs.recipient !== svc.paymentRecipientPubkey) {
      console.warn(
        `[POST /v1/spend/service] recipient mismatch for ${body.slug}: ` +
          `service said ${reqs.recipient}, catalog says ${svc.paymentRecipientPubkey}`,
      );
      // Trust the service's quoted recipient — the catalog can drift.
      // The on-chain validator + session.allowed_recipients is the real check.
    }

    let recipient: PublicKey;
    let vault: PublicKey;
    let vaultUsdcAta: PublicKey;
    let sessionPubkey: PublicKey;
    try {
      recipient = new PublicKey(reqs.recipient);
      vault = new PublicKey(wallet.vaultPda);
      vaultUsdcAta = new PublicKey(wallet.usdcAta);
      sessionPubkey = new PublicKey(session.sessionPubkey);
    } catch {
      res.status(400).json({ error: "invalid base58 in service recipient or wallet" });
      return;
    }

    const amount = BigInt(reqs.amount);

    // Liquidity.
    const conn = newConn();
    let liquid: bigint;
    try {
      liquid = await readLiquidity(conn, vaultUsdcAta);
    } catch (err) {
      console.error("[POST /v1/spend/service] liquidity read failed:", err);
      res.status(503).json({ error: "rpc unavailable" });
      return;
    }
    if (liquid < amount) {
      await db.insert(auditLog).values({
        walletId: wallet.id,
        sessionId: session.id,
        action: "spend_service",
        amount: Number(amount),
        recipientOrUrl: targetUrl,
        decision: "deny",
        reason: "INSUFFICIENT_LIQUID",
      });
      res.status(402).json({ error: "INSUFFICIENT_LIQUID", liquid: liquid.toString() });
      return;
    }

    // Sign + submit transfer_usdc.
    const [encryptedRow] = await db
      .select({ secret: sessions.encryptedSessionSecret })
      .from(sessions)
      .where(eq(sessions.id, session.id))
      .limit(1);
    if (!encryptedRow) {
      res.status(500).json({ error: "session row missing" });
      return;
    }
    const signer = Keypair.fromSecretKey(decryptSessionSecret(encryptedRow.secret, masterKey));
    let treasury: Keypair;
    try {
      treasury = getTreasury();
    } catch (err) {
      console.error("[POST /v1/spend/service] treasury load failed:", err);
      res.status(500).json({ error: "server misconfigured" });
      return;
    }
    const recipientUsdcAta = getAssociatedTokenAddressSync(getUsdcMint(), recipient);
    const ix = buildTransferUsdcIx({
      sessionSigner: signer.publicKey,
      vault,
      mint: getUsdcMint(),
      vaultUsdcAta,
      recipient,
      recipientUsdcAta,
      amount,
      tokenProgramId: TOKEN_PROGRAM_ID,
      sessionPubkey,
    });
    // T-226: treasury pays the fee, session signs the instruction.
    const tx = new Transaction({ feePayer: treasury.publicKey });
    tx.add(ix);
    const { blockhash } = await conn.getLatestBlockhash("finalized");
    tx.recentBlockhash = blockhash;

    let signature: string;
    try {
      signature = await doSubmit(conn, tx, [treasury, signer]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown";
      await db.insert(auditLog).values({
        walletId: wallet.id,
        sessionId: session.id,
        action: "spend_service",
        amount: Number(amount),
        recipientOrUrl: targetUrl,
        decision: "deny",
        reason: `ON_CHAIN_REVERT: ${msg.slice(0, 200)}`,
      });
      res.status(402).json({ error: "on-chain submission failed", detail: msg });
      return;
    }

    // Retry the service call with the payment proof.
    let serviceResp: globalThis.Response;
    try {
      serviceResp = (await doFetch(targetUrl, {
        method: body.method ?? "POST",
        headers: {
          "content-type": "application/json",
          "x-payment-proof": signature,
        },
        body: body.body !== undefined ? JSON.stringify(body.body) : undefined,
      })) as globalThis.Response;
    } catch (err) {
      console.error("[POST /v1/spend/service] retry-with-proof failed:", err);
      // Money already moved — log allow with a note about the failed retry.
      await db.insert(auditLog).values({
        walletId: wallet.id,
        sessionId: session.id,
        action: "spend_service",
        amount: Number(amount),
        recipientOrUrl: targetUrl,
        decision: "allow",
        reason: `RETRY_FAILED: ${String(err).slice(0, 200)}`,
        txSignature: signature,
      });
      res.status(502).json({
        error: "service retry failed after payment",
        tx_signature: signature,
        detail: String(err),
      });
      return;
    }

    await db.insert(auditLog).values({
      walletId: wallet.id,
      sessionId: session.id,
      action: "spend_service",
      amount: Number(amount),
      recipientOrUrl: targetUrl,
      decision: "allow",
      txSignature: signature,
    });

    // Forward the service response. We can't always know the content-type
    // ahead of time, so treat as text and echo headers.
    const passthroughBody = await serviceResp.text();
    const contentType = serviceResp.headers.get("content-type") ?? "application/json";
    res
      .status(serviceResp.status)
      .type(contentType)
      .setHeader("x-tx-signature", signature)
      .send(passthroughBody);
  };
}

export const postSpendServiceHandler = makePostSpendServiceHandler();

// ---------------------------------------------------------------------------
// /v1/spend/mpp — T-253 full MPP-protocol proxy
//
// Differs from /v1/spend/service (catalog x402) and /v1/spend/sign-payment
// (agent-retries-with-X-Payment-Proof) in two ways MPP demands:
//   1. The on-chain tx must use the challenge-supplied `recentBlockhash`
//      so the merchant can prove the payment is fresh for *this* challenge.
//      We honor that here instead of calling `getLatestBlockhash`.
//   2. The retry header is `Authorization: Payment <base64url(...)>` per
//      paymentauth.org spec; merchants explicitly ignore X-Payment-Proof.
//      We build that header server-side and retry within the same handler.
// ---------------------------------------------------------------------------

interface SpendMppBody {
  url: string;
  max_amount: number;
  method?: "GET" | "POST";
  body?: unknown;
}

function parseSpendMppBody(raw: unknown): { ok: true; body: SpendMppBody } | ValidationError {
  if (!raw || typeof raw !== "object") return fail(400, "request body must be JSON object");
  const b = raw as Record<string, unknown>;
  if (typeof b.url !== "string" || !b.url) return fail(400, "url required");
  try {
    new URL(b.url);
  } catch {
    return fail(400, "url must be a valid URL");
  }
  if (typeof b.max_amount !== "number" || !Number.isFinite(b.max_amount) || b.max_amount <= 0) {
    return fail(400, "max_amount must be a positive number (USDC base units)");
  }
  if (b.method !== undefined && b.method !== "GET" && b.method !== "POST") {
    return fail(400, "method must be 'GET' | 'POST' if provided");
  }
  return {
    ok: true,
    body: {
      url: b.url,
      max_amount: b.max_amount,
      method: b.method as "GET" | "POST" | undefined,
      body: b.body,
    },
  };
}

/** WWW-Authenticate `Payment …` challenge fields after parse. */
interface MppChallenge {
  id: string;
  realm: string;
  method: string;
  intent: string;
  request: string;
  expires: string;
  opaque?: string;
  digest?: string;
  description?: string;
  [k: string]: string | undefined;
}

/** Decoded `request` payload from inside the challenge. */
interface MppRequestPayload {
  amount: string;
  currency: string;
  recipient: string;
  methodDetails: {
    network: string;
    decimals: number;
    tokenProgram: string;
    recentBlockhash: string;
  };
}

export function parseMppChallenge(wwwAuthenticate: string): MppChallenge | null {
  const trimmed = wwwAuthenticate.trim();
  if (!trimmed.toLowerCase().startsWith("payment")) return null;
  const after = trimmed.slice("payment".length).trim();
  const out: Record<string, string> = {};
  // Matches `key="value"` pairs (RFC 7235-style with quoted-string values).
  const re = /([a-zA-Z][a-zA-Z0-9_-]*)\s*=\s*"((?:[^"\\]|\\.)*)"/g;
  for (const m of after.matchAll(re)) {
    const k = m[1];
    const v = m[2];
    if (k && v !== undefined) out[k] = v.replace(/\\(.)/g, "$1");
  }
  for (const req of ["id", "realm", "method", "intent", "request", "expires"]) {
    if (!out[req]) return null;
  }
  return out as unknown as MppChallenge;
}

export function decodeMppRequestPayload(requestB64url: string): MppRequestPayload | null {
  try {
    const json = Buffer.from(requestB64url, "base64url").toString("utf8");
    const obj = JSON.parse(json) as MppRequestPayload;
    if (
      typeof obj?.amount !== "string" ||
      typeof obj?.currency !== "string" ||
      typeof obj?.recipient !== "string" ||
      typeof obj?.methodDetails?.recentBlockhash !== "string"
    ) {
      return null;
    }
    return obj;
  } catch {
    return null;
  }
}

export function buildMppAuthorizationHeader(challenge: MppChallenge, signature: string): string {
  const token = Buffer.from(
    JSON.stringify({
      challenge,
      payload: { type: "signature", signature },
    }),
  ).toString("base64url");
  return `Payment ${token}`;
}

export type MakePostSpendMppDeps = MakePostSpendSignPaymentDeps & {
  fetchFn?: FetchFn;
};

export function makePostSpendMppHandler(deps: MakePostSpendMppDeps = {}) {
  const newConn =
    deps.connection ?? (() => new Connection(envOrThrow("SOLANA_RPC_URL"), "confirmed"));
  const readLiquidity = deps.liquidity ?? defaultLiquidity;
  const loadPolicy = deps.loadPolicy ?? defaultLoadPolicy;
  const doSubmit = deps.submit ?? sendAndConfirmTransaction;
  const getUsdcMint = deps.usdcMint ?? (() => new PublicKey(envOrThrow("USDC_MINT")));
  const getTreasury = deps.loadTreasury ?? defaultLoadTreasury;
  const doFetch = deps.fetchFn ?? fetch;

  return async function postSpendMpp(req: Request, res: Response) {
    const session = req.session;
    const wallet = req.wallet;
    if (!session || !wallet) {
      res.status(401).json({ error: "api key required" });
      return;
    }

    const parsed = parseSpendMppBody(req.body);
    if (!parsed.ok) {
      res.status(parsed.status).json(parsed.body);
      return;
    }
    const body = parsed.body;

    const masterKey = process.env.SESSION_SECRET_MASTER_KEY;
    if (!masterKey) {
      console.error("[POST /v1/spend/mpp] SESSION_SECRET_MASTER_KEY not set");
      res.status(500).json({ error: "server misconfigured" });
      return;
    }

    const db = getDb();

    // Off-chain URL allowlist (T-209) — same gate as sign-payment.
    const policyDecision = await checkOffChainPolicy({
      walletId: wallet.id,
      url: body.url,
      loadPolicy,
      isCurated: deps.isCurated,
    });
    if (!policyDecision.allowed) {
      await db.insert(auditLog).values({
        walletId: wallet.id,
        sessionId: session.id,
        action: "spend_mpp",
        amount: 0,
        recipientOrUrl: body.url,
        decision: "deny",
        reason: policyDecision.reason,
      });
      res.status(403).json({ error: policyDecision.reason });
      return;
    }

    // 1. Probe — expect 402 + WWW-Authenticate: Payment.
    let probeResp: globalThis.Response;
    try {
      probeResp = (await doFetch(body.url, {
        method: body.method ?? "GET",
        headers:
          body.body !== undefined ? { "content-type": "application/json" } : undefined,
        body: body.body !== undefined ? JSON.stringify(body.body) : undefined,
      })) as globalThis.Response;
    } catch (err) {
      console.error("[POST /v1/spend/mpp] probe failed:", err);
      res.status(502).json({ error: "service probe failed", detail: String(err) });
      return;
    }

    if (probeResp.status !== 402) {
      // Service didn't ask for payment — passthrough.
      const passthroughBody = await probeResp.text();
      res
        .status(probeResp.status)
        .type(probeResp.headers.get("content-type") ?? "text/plain")
        .send(passthroughBody);
      return;
    }

    const wwwAuth = probeResp.headers.get("www-authenticate");
    if (!wwwAuth) {
      await db.insert(auditLog).values({
        walletId: wallet.id,
        sessionId: session.id,
        action: "spend_mpp",
        amount: 0,
        recipientOrUrl: body.url,
        decision: "deny",
        reason: "BAD_CHALLENGE: 402 missing WWW-Authenticate",
      });
      res.status(502).json({ error: "BAD_CHALLENGE", detail: "402 missing WWW-Authenticate" });
      return;
    }

    const challenge = parseMppChallenge(wwwAuth);
    if (!challenge) {
      await db.insert(auditLog).values({
        walletId: wallet.id,
        sessionId: session.id,
        action: "spend_mpp",
        amount: 0,
        recipientOrUrl: body.url,
        decision: "deny",
        reason: "BAD_CHALLENGE: unparseable WWW-Authenticate",
      });
      res.status(502).json({ error: "BAD_CHALLENGE", detail: "unparseable WWW-Authenticate" });
      return;
    }

    const payment = decodeMppRequestPayload(challenge.request);
    if (!payment) {
      await db.insert(auditLog).values({
        walletId: wallet.id,
        sessionId: session.id,
        action: "spend_mpp",
        amount: 0,
        recipientOrUrl: body.url,
        decision: "deny",
        reason: "BAD_CHALLENGE: undecodable request payload",
      });
      res.status(502).json({ error: "BAD_CHALLENGE", detail: "undecodable request payload" });
      return;
    }

    // Freshness — server time vs challenge.expires.
    const expiresMs = Date.parse(challenge.expires);
    if (!Number.isFinite(expiresMs) || Date.now() >= expiresMs) {
      await db.insert(auditLog).values({
        walletId: wallet.id,
        sessionId: session.id,
        action: "spend_mpp",
        amount: 0,
        recipientOrUrl: body.url,
        decision: "deny",
        reason: "EXPIRED_CHALLENGE",
      });
      res.status(402).json({ error: "EXPIRED_CHALLENGE", expires: challenge.expires });
      return;
    }

    // Currency match — only USDC supported.
    const usdcMint = getUsdcMint();
    if (payment.currency !== usdcMint.toBase58()) {
      await db.insert(auditLog).values({
        walletId: wallet.id,
        sessionId: session.id,
        action: "spend_mpp",
        amount: 0,
        recipientOrUrl: body.url,
        decision: "deny",
        reason: `WRONG_CURRENCY: ${payment.currency}`,
      });
      res.status(402).json({
        error: "WRONG_CURRENCY",
        expected: usdcMint.toBase58(),
        got: payment.currency,
      });
      return;
    }

    const amountNum = Number(payment.amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      res.status(502).json({ error: "BAD_CHALLENGE", detail: "amount not numeric" });
      return;
    }
    if (amountNum > body.max_amount) {
      await db.insert(auditLog).values({
        walletId: wallet.id,
        sessionId: session.id,
        action: "spend_mpp",
        amount: amountNum,
        recipientOrUrl: body.url,
        decision: "deny",
        reason: `QUOTED_OVER_MAX: ${amountNum} > ${body.max_amount}`,
      });
      res
        .status(402)
        .json({ error: "QUOTED_OVER_MAX", quoted: amountNum, max_amount: body.max_amount });
      return;
    }

    let recipient: PublicKey;
    let vault: PublicKey;
    let vaultUsdcAta: PublicKey;
    let sessionPubkey: PublicKey;
    try {
      recipient = new PublicKey(payment.recipient);
      vault = new PublicKey(wallet.vaultPda);
      vaultUsdcAta = new PublicKey(wallet.usdcAta);
      sessionPubkey = new PublicKey(session.sessionPubkey);
    } catch {
      res.status(502).json({ error: "BAD_CHALLENGE", detail: "invalid base58 in challenge" });
      return;
    }

    const amount = BigInt(amountNum);
    const conn = newConn();

    // Liquidity check.
    let liquid: bigint;
    try {
      liquid = await readLiquidity(conn, vaultUsdcAta);
    } catch (err) {
      console.error("[POST /v1/spend/mpp] liquidity read failed:", err);
      res.status(503).json({ error: "rpc unavailable" });
      return;
    }
    if (liquid < amount) {
      await db.insert(auditLog).values({
        walletId: wallet.id,
        sessionId: session.id,
        action: "spend_mpp",
        amount: Number(amount),
        recipientOrUrl: body.url,
        decision: "deny",
        reason: "INSUFFICIENT_LIQUID",
      });
      res
        .status(402)
        .json({ error: "INSUFFICIENT_LIQUID", liquid: liquid.toString(), amount: amount.toString() });
      return;
    }

    // Decrypt session keypair.
    const [encryptedRow] = await db
      .select({ secret: sessions.encryptedSessionSecret })
      .from(sessions)
      .where(eq(sessions.id, session.id))
      .limit(1);
    if (!encryptedRow) {
      res.status(500).json({ error: "session row missing" });
      return;
    }
    const signer = Keypair.fromSecretKey(decryptSessionSecret(encryptedRow.secret, masterKey));

    let treasury: Keypair;
    try {
      treasury = getTreasury();
    } catch (err) {
      console.error("[POST /v1/spend/mpp] treasury load failed:", err);
      res.status(500).json({ error: "server misconfigured" });
      return;
    }

    const recipientUsdcAta = getAssociatedTokenAddressSync(usdcMint, recipient);
    const ix = buildTransferUsdcIx({
      sessionSigner: signer.publicKey,
      vault,
      mint: usdcMint,
      vaultUsdcAta,
      recipient,
      recipientUsdcAta,
      amount,
      tokenProgramId: TOKEN_PROGRAM_ID,
      sessionPubkey,
    });

    const tx = new Transaction({ feePayer: treasury.publicKey });
    tx.add(ix);
    // The whole point of this handler: use the merchant's blockhash so the
    // on-chain tx binds to *this* challenge, not a fresh blockhash of our own.
    tx.recentBlockhash = payment.methodDetails.recentBlockhash;

    let signature: string;
    try {
      signature = await doSubmit(conn, tx, [treasury, signer]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown";
      await db.insert(auditLog).values({
        walletId: wallet.id,
        sessionId: session.id,
        action: "spend_mpp",
        amount: Number(amount),
        recipientOrUrl: body.url,
        decision: "deny",
        reason: `ON_CHAIN_REVERT: ${msg.slice(0, 200)}`,
      });
      res.status(402).json({ error: "on-chain submission failed", detail: msg });
      return;
    }

    // Retry the URL with the MPP-shaped Authorization header.
    const authHeader = buildMppAuthorizationHeader(challenge, signature);
    let serviceResp: globalThis.Response;
    try {
      serviceResp = (await doFetch(body.url, {
        method: body.method ?? "GET",
        headers: {
          Authorization: authHeader,
          ...(body.body !== undefined ? { "content-type": "application/json" } : {}),
        },
        body: body.body !== undefined ? JSON.stringify(body.body) : undefined,
      })) as globalThis.Response;
    } catch (err) {
      console.error("[POST /v1/spend/mpp] retry-with-proof failed:", err);
      await db.insert(auditLog).values({
        walletId: wallet.id,
        sessionId: session.id,
        action: "spend_mpp",
        amount: Number(amount),
        recipientOrUrl: body.url,
        decision: "allow",
        reason: `RETRY_FAILED: ${String(err).slice(0, 200)}`,
        txSignature: signature,
      });
      res.status(502).json({
        error: "service retry failed after payment",
        tx_signature: signature,
        detail: String(err),
      });
      return;
    }

    // Audit allow; pin VERIFICATION_FAILED if the merchant still rejects.
    if (serviceResp.status >= 400) {
      const upstreamBody = await serviceResp.text();
      await db.insert(auditLog).values({
        walletId: wallet.id,
        sessionId: session.id,
        action: "spend_mpp",
        amount: Number(amount),
        recipientOrUrl: body.url,
        decision: "allow",
        reason: `VERIFICATION_FAILED: status=${serviceResp.status} body=${upstreamBody.slice(0, 200)}`,
        txSignature: signature,
      });
      res
        .status(serviceResp.status)
        .type(serviceResp.headers.get("content-type") ?? "application/json")
        .setHeader("x-tx-signature", signature)
        .send(upstreamBody);
      return;
    }

    await db.insert(auditLog).values({
      walletId: wallet.id,
      sessionId: session.id,
      action: "spend_mpp",
      amount: Number(amount),
      recipientOrUrl: body.url,
      decision: "allow",
      txSignature: signature,
    });

    const passthroughBody = await serviceResp.text();
    const contentType = serviceResp.headers.get("content-type") ?? "application/json";
    const paymentReceipt = serviceResp.headers.get("payment-receipt");
    res.status(serviceResp.status).type(contentType).setHeader("x-tx-signature", signature);
    if (paymentReceipt) res.setHeader("payment-receipt", paymentReceipt);
    res.send(passthroughBody);
  };
}

export const postSpendMppHandler = makePostSpendMppHandler();
