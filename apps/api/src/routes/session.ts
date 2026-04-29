import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { and, eq } from "drizzle-orm";
import type { Request, Response } from "express";
import { generateApiKey, hashApiKey } from "../auth/api-key";
import { encryptSessionSecret } from "../crypto/session-secret";
import { getDb } from "../db/client";
import { apiKeys, sessions, wallets } from "../db/schema";
import {
  MAX_ALLOWED_RECIPIENTS,
  buildAddSessionIx,
  serializeUnsignedTx,
} from "../program/agent-wallet";

/**
 * `POST /v1/session` — register a new agent session.
 *
 * Mirrors the conventions in `routes/wallet.ts` (T-205): owner is identified
 * via `req.user.pubkey` from `requireDashboardJwt`, body uses snake_case, and
 * the recent blockhash is fetched server-side rather than required from the
 * caller.
 *
 * The flow:
 *   1. Validate the body and load the wallet (must belong to `req.user.id`).
 *   2. Generate a session keypair, encrypt the secret with the master key.
 *   3. Mint an API key (klink_dev_<base64url-32B>), argon2id-hash it.
 *   4. Insert `sessions` + `api_keys` rows in one DB transaction.
 *   5. Build the unsigned `add_session` tx with feePayer = owner.
 *   6. Return `{ txBase64, sessionId, sessionPubkey, apiKey, keyPrefix, expiresAt, vaultPda, usdcAta }`.
 *
 * The API key is returned once and only once; `apiKeys.hashedToken` is all we
 * keep server-side. The session is usable as soon as the owner submits the
 * tx — until then any spend attempt will fail on chain because the session
 * PDA hasn't been created.
 */

interface CreateSessionBody {
  wallet_id: string;
  label: string;
  /** USDC base units (6 decimals). */
  max_per_tx: number;
  daily_cap: number;
  /** Solana base58 pubkeys; max 10 per spec §2.2.2. */
  allowed_recipients: string[];
  /** u32 bitmap from spec §2.4. */
  allowed_instructions: number;
  /** Unix seconds; 0 / undefined = never expires. */
  expiry?: number;
  /** ISO date for `sessions.expires_at`. Defaults to one year from now. */
  expires_at?: string;
}

interface ValidationError {
  ok: false;
  status: number;
  body: { error: string };
}

function fail(status: number, error: string): ValidationError {
  return { ok: false, status, body: { error } };
}

function parseBody(raw: unknown): { ok: true; body: CreateSessionBody } | ValidationError {
  if (!raw || typeof raw !== "object") return fail(400, "request body must be JSON object");
  const b = raw as Record<string, unknown>;
  if (typeof b.wallet_id !== "string") return fail(400, "wallet_id required");
  if (typeof b.label !== "string" || !b.label.trim()) return fail(400, "label required");
  if (typeof b.max_per_tx !== "number" || !Number.isFinite(b.max_per_tx) || b.max_per_tx < 0) {
    return fail(400, "max_per_tx must be a non-negative number (USDC base units)");
  }
  if (typeof b.daily_cap !== "number" || !Number.isFinite(b.daily_cap) || b.daily_cap < 0) {
    return fail(400, "daily_cap must be a non-negative number (USDC base units)");
  }
  if (!Array.isArray(b.allowed_recipients)) return fail(400, "allowed_recipients must be array");
  if (b.allowed_recipients.length > MAX_ALLOWED_RECIPIENTS) {
    return fail(400, `allowed_recipients exceeds max ${MAX_ALLOWED_RECIPIENTS}`);
  }
  for (const r of b.allowed_recipients) {
    if (typeof r !== "string") {
      return fail(400, "allowed_recipients entries must be base58 strings");
    }
  }
  if (
    typeof b.allowed_instructions !== "number" ||
    !Number.isInteger(b.allowed_instructions) ||
    b.allowed_instructions < 0 ||
    b.allowed_instructions > 0xffff_ffff
  ) {
    return fail(400, "allowed_instructions must be a u32 integer bitmap");
  }
  if (b.expiry !== undefined && (typeof b.expiry !== "number" || b.expiry < 0)) {
    return fail(400, "expiry must be a non-negative unix timestamp");
  }
  return {
    ok: true,
    body: {
      wallet_id: b.wallet_id,
      label: b.label,
      max_per_tx: b.max_per_tx,
      daily_cap: b.daily_cap,
      allowed_recipients: b.allowed_recipients as string[],
      allowed_instructions: b.allowed_instructions,
      expiry: b.expiry as number | undefined,
      expires_at: b.expires_at as string | undefined,
    },
  };
}

function envOrThrow(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

export type BlockhashFetcher = () => Promise<string>;
export type SessionKeypairFactory = () => Keypair;

export interface MakePostSessionDeps {
  blockhash?: BlockhashFetcher;
  newKeypair?: SessionKeypairFactory;
}

export function makePostSessionHandler(deps: MakePostSessionDeps = {}) {
  const getBlockhash =
    deps.blockhash ??
    (async () => {
      const conn = new Connection(envOrThrow("SOLANA_RPC_URL"), "confirmed");
      const { blockhash } = await conn.getLatestBlockhash("finalized");
      return blockhash;
    });
  const newKeypair = deps.newKeypair ?? Keypair.generate;

  return async function postSession(req: Request, res: Response) {
    const userId = req.user?.id;
    const userPubkey = req.user?.pubkey;
    if (!userId || !userPubkey) {
      res.status(401).json({ error: "auth required" });
      return;
    }

    const parsed = parseBody(req.body);
    if (!parsed.ok) {
      res.status(parsed.status).json(parsed.body);
      return;
    }
    const body = parsed.body;

    const masterKey = process.env.SESSION_SECRET_MASTER_KEY;
    if (!masterKey) {
      console.error("[POST /v1/session] SESSION_SECRET_MASTER_KEY not set");
      res.status(500).json({ error: "server misconfigured" });
      return;
    }

    let owner: PublicKey;
    let allowedRecipients: PublicKey[];
    try {
      owner = new PublicKey(userPubkey);
      allowedRecipients = body.allowed_recipients.map((r) => new PublicKey(r));
    } catch {
      res.status(400).json({ error: "invalid base58 in pubkey or allowed_recipients" });
      return;
    }

    const db = getDb();

    // Wallet must exist AND belong to the authenticated user.
    const walletRows = await db
      .select({
        id: wallets.id,
        vaultPda: wallets.vaultPda,
        usdcAta: wallets.usdcAta,
      })
      .from(wallets)
      .where(and(eq(wallets.id, body.wallet_id), eq(wallets.userId, userId)))
      .limit(1);
    const wallet = walletRows[0];
    if (!wallet) {
      // 404 — don't leak whether the wallet exists for someone else.
      res.status(404).json({ error: "wallet not found" });
      return;
    }

    // Generate keypair, encrypt secret, mint API key.
    const sessionKp = newKeypair();
    const sessionPubkey = sessionKp.publicKey;
    const encryptedSecret = encryptSessionSecret(Buffer.from(sessionKp.secretKey), masterKey);

    const { token: apiKey, prefix: keyPrefix } = generateApiKey();
    const hashedToken = await hashApiKey(apiKey);

    const expiresAtIso =
      body.expires_at ?? new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();

    // Insert session + api_key together so we never have one without the other.
    const sessionId = await db.transaction(async (tx) => {
      const [sessionRow] = await tx
        .insert(sessions)
        .values({
          walletId: wallet.id,
          sessionPubkey: sessionPubkey.toBase58(),
          encryptedSessionSecret: encryptedSecret,
          label: body.label,
          expiresAt: new Date(expiresAtIso),
        })
        .returning({ id: sessions.id });
      if (!sessionRow) throw new Error("session insert returned no row");
      await tx.insert(apiKeys).values({
        sessionId: sessionRow.id,
        keyPrefix,
        hashedToken,
      });
      return sessionRow.id;
    });

    let recentBlockhash: string;
    try {
      recentBlockhash = await getBlockhash();
    } catch (err) {
      console.error("[POST /v1/session] rpc unavailable:", err);
      res.status(503).json({ error: "rpc unavailable" });
      return;
    }

    const ix = buildAddSessionIx({
      payer: owner,
      owner,
      sessionPubkey,
      maxPerTx: BigInt(body.max_per_tx),
      dailyCap: BigInt(body.daily_cap),
      expiry: BigInt(body.expiry ?? 0),
      allowedRecipients,
      allowedInstructions: body.allowed_instructions,
    });

    const tx = new Transaction({ feePayer: owner, recentBlockhash });
    tx.add(ix);
    const txBase64 = serializeUnsignedTx(tx);

    res.json({
      txBase64,
      sessionId,
      sessionPubkey: sessionPubkey.toBase58(),
      keyPrefix,
      apiKey, // shown ONCE — never returned again
      expiresAt: expiresAtIso,
      vaultPda: wallet.vaultPda,
      usdcAta: wallet.usdcAta,
    });
  };
}

export const postSessionHandler = makePostSessionHandler();
