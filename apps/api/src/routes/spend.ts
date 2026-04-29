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
}

export function makePostSpendTransferHandler(deps: MakePostSpendTransferDeps = {}) {
  const newConn =
    deps.connection ?? (() => new Connection(envOrThrow("SOLANA_RPC_URL"), "confirmed"));
  const readLiquidity = deps.liquidity ?? defaultLiquidity;
  const loadPolicy = deps.loadPolicy ?? defaultLoadPolicy;
  const doSubmit = deps.submit ?? sendAndConfirmTransaction;
  const getUsdcMint = deps.usdcMint ?? (() => new PublicKey(envOrThrow("USDC_MINT")));

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

    // 4. Build instruction.
    const recipientUsdcAta = getAssociatedTokenAddressSync(getUsdcMint(), recipient);
    const ix = buildTransferUsdcIx({
      sessionSigner: signer.publicKey,
      vault,
      vaultUsdcAta,
      recipient,
      recipientUsdcAta,
      amount,
      tokenProgramId: TOKEN_PROGRAM_ID,
      sessionPubkey,
    });
    const tx = new Transaction({ feePayer: signer.publicKey });
    tx.add(ix);
    const { blockhash } = await conn.getLatestBlockhash("finalized");
    tx.recentBlockhash = blockhash;

    // 5. Sign + submit. The on-chain validator (T-105) catches recipient,
    //    cap, expiry, and revoked-session conditions. We surface those as
    //    deny-audit on submit failure.
    let signature: string;
    try {
      signature = await doSubmit(conn, tx, [signer]);
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
