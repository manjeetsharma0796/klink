import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import type { Request, Response } from "express";
import { generateApiKey, hashApiKey } from "../auth/api-key";
import { encryptSessionSecret } from "../crypto/session-secret";
import { getDb } from "../db/client";
import { apiKeys, auditLog, offChainPolicies, sessions, wallets } from "../db/schema";
import {
  type AllowlistAction,
  MAX_ALLOWED_RECIPIENTS,
  buildAddSessionIx,
  buildRevokeSessionIx,
  buildUpdateSessionAllowlistIx,
  decodeSessionAccount,
  deriveSessionPda,
  deriveVaultPda,
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

// ---------------------------------------------------------------------------
// T-207 — DELETE /v1/session/:id  (revoke_session)
//         PATCH  /v1/session/:id/allowlist  (update_session_allowlist)
//
// Both build owner-signed unsigned txs; the dashboard hands them to Phantom.
// Backend never holds the owner key. Mirrors the build-then-Phantom pattern
// used by POST /v1/wallet (T-205) and POST /v1/session (T-206).
// ---------------------------------------------------------------------------

export type AccountInfoFetcher = (pk: PublicKey) => Promise<{ data: Buffer } | null>;

export interface MakeSessionMutationDeps {
  blockhash?: BlockhashFetcher;
  /** Test seam for the on-chain Session PDA existence check (T-232). */
  accountInfo?: AccountInfoFetcher;
}

async function loadOwnedSession(
  db: ReturnType<typeof getDb>,
  userId: string,
  sessionId: string,
): Promise<{ sessionPubkey: string; walletId: string } | null> {
  // Join sessions → wallets → users to confirm the caller owns this session.
  // The user-scoping is what makes the route safe to expose by URL id.
  const rows = await db
    .select({
      sessionPubkey: sessions.sessionPubkey,
      walletId: sessions.walletId,
    })
    .from(sessions)
    .innerJoin(wallets, eq(sessions.walletId, wallets.id))
    .where(and(eq(sessions.id, sessionId), eq(wallets.userId, userId)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return { sessionPubkey: row.sessionPubkey, walletId: row.walletId };
}

/**
 * Soft-revoke a session in the DB. Used by the DELETE self-heal (T-232) when
 * the on-chain Session PDA either never existed (DB-only ghost — Phantom
 * never signed the add_session tx) or was already closed by a successful
 * revoke_session tx the dashboard didn't follow up on. Marks `sessions.revokedAt`
 * and every still-active `api_keys.revokedAt` so the dashboard reflects
 * reality and the API key stops authenticating immediately.
 */
async function softRevokeSession(
  db: ReturnType<typeof getDb>,
  sessionId: string,
  walletId: string,
): Promise<void> {
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(sessions)
      .set({ revokedAt: now })
      .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)));
    await tx
      .update(apiKeys)
      .set({ revokedAt: now })
      .where(and(eq(apiKeys.sessionId, sessionId), isNull(apiKeys.revokedAt)));
    await tx.insert(auditLog).values({
      walletId,
      sessionId,
      action: "session_revoke_soft",
      decision: "allow",
    });
  });
}

export function makeDeleteSessionHandler(deps: MakeSessionMutationDeps = {}) {
  const getBlockhash =
    deps.blockhash ??
    (async () => {
      const conn = new Connection(envOrThrow("SOLANA_RPC_URL"), "confirmed");
      const { blockhash } = await conn.getLatestBlockhash("finalized");
      return blockhash;
    });
  const fetchAccountInfo: AccountInfoFetcher =
    deps.accountInfo ??
    (async (pk: PublicKey) => {
      const conn = new Connection(envOrThrow("SOLANA_RPC_URL"), "confirmed");
      const info = await conn.getAccountInfo(pk, "confirmed");
      if (!info) return null;
      return { data: Buffer.from(info.data) };
    });

  return async function deleteSession(req: Request, res: Response) {
    const userId = req.user?.id;
    const userPubkey = req.user?.pubkey;
    if (!userId || !userPubkey) {
      res.status(401).json({ error: "auth required" });
      return;
    }
    const sessionId = req.params.id;
    if (typeof sessionId !== "string" || !sessionId) {
      res.status(400).json({ error: "session id required in path" });
      return;
    }

    let owner: PublicKey;
    try {
      owner = new PublicKey(userPubkey);
    } catch {
      res.status(400).json({ error: "invalid owner pubkey on jwt" });
      return;
    }

    const db = getDb();
    const row = await loadOwnedSession(db, userId, sessionId);
    if (!row) {
      res.status(404).json({ error: "session not found" });
      return;
    }

    // T-232: check the on-chain Session PDA before building a revoke tx. Two
    // self-heal cases yield the same null `getAccountInfo` result:
    //   - DB-only ghost: Phantom never signed the add_session tx, so the PDA
    //     was never initialized. Building revoke_session anyway would revert
    //     with AccountNotInitialized (3012) and the user would be stuck.
    //   - Already-closed: a previous revoke_session tx already closed the
    //     PDA and the dashboard never called DELETE again to update the DB.
    // Soft-revoke the DB rows in both cases.
    let sessionPda: PublicKey;
    try {
      const [vault] = deriveVaultPda(owner);
      [sessionPda] = deriveSessionPda(vault, new PublicKey(row.sessionPubkey));
    } catch (err) {
      console.error("[DELETE /v1/session/:id] pda derive failed:", err);
      res.status(500).json({ error: "pda derive failed" });
      return;
    }

    let onChain: { data: Buffer } | null;
    try {
      onChain = await fetchAccountInfo(sessionPda);
    } catch (err) {
      console.error("[DELETE /v1/session/:id] getAccountInfo failed:", err);
      res.status(503).json({ error: "rpc unavailable" });
      return;
    }

    if (!onChain) {
      // DB-only ghost OR already-closed. Either way the on-chain side has
      // nothing to do; soft-revoke and return alreadyExists so the dashboard
      // hook short-circuits without prompting Phantom.
      await softRevokeSession(db, sessionId, row.walletId);
      res.json({
        alreadyExists: true,
        sessionId,
        sessionPubkey: row.sessionPubkey,
      });
      return;
    }

    let recentBlockhash: string;
    try {
      recentBlockhash = await getBlockhash();
    } catch (err) {
      console.error("[DELETE /v1/session/:id] rpc unavailable:", err);
      res.status(503).json({ error: "rpc unavailable" });
      return;
    }

    const ix = buildRevokeSessionIx({
      owner,
      sessionPubkey: new PublicKey(row.sessionPubkey),
    });
    const tx = new Transaction({ feePayer: owner, recentBlockhash });
    tx.add(ix);
    const txBase64 = serializeUnsignedTx(tx);

    res.json({
      txBase64,
      sessionId,
      sessionPubkey: row.sessionPubkey,
    });
  };
}

export const deleteSessionHandler = makeDeleteSessionHandler();

interface PatchSessionAllowlistBody {
  action: AllowlistAction;
  recipients?: string[] | null;
  allowed_instructions?: number | null;
}

function parsePatchBody(
  raw: unknown,
): { ok: true; body: PatchSessionAllowlistBody } | ValidationError {
  if (!raw || typeof raw !== "object") return fail(400, "request body must be JSON object");
  const b = raw as Record<string, unknown>;
  if (b.action !== "Add" && b.action !== "Remove" && b.action !== "Set") {
    return fail(400, "action must be 'Add' | 'Remove' | 'Set'");
  }
  if (b.recipients !== undefined && b.recipients !== null) {
    if (!Array.isArray(b.recipients)) return fail(400, "recipients must be array or null");
    if (b.recipients.length > MAX_ALLOWED_RECIPIENTS) {
      return fail(400, `recipients exceeds max ${MAX_ALLOWED_RECIPIENTS}`);
    }
    for (const r of b.recipients) {
      if (typeof r !== "string") return fail(400, "recipients entries must be base58 strings");
    }
  }
  if (b.allowed_instructions !== undefined && b.allowed_instructions !== null) {
    if (
      typeof b.allowed_instructions !== "number" ||
      !Number.isInteger(b.allowed_instructions) ||
      b.allowed_instructions < 0 ||
      b.allowed_instructions > 0xffff_ffff
    ) {
      return fail(400, "allowed_instructions must be a u32 integer or null");
    }
  }
  return {
    ok: true,
    body: {
      action: b.action,
      recipients: (b.recipients as string[] | null | undefined) ?? null,
      allowed_instructions: (b.allowed_instructions as number | null | undefined) ?? null,
    },
  };
}

export function makePatchSessionAllowlistHandler(deps: MakeSessionMutationDeps = {}) {
  const getBlockhash =
    deps.blockhash ??
    (async () => {
      const conn = new Connection(envOrThrow("SOLANA_RPC_URL"), "confirmed");
      const { blockhash } = await conn.getLatestBlockhash("finalized");
      return blockhash;
    });

  return async function patchSessionAllowlist(req: Request, res: Response) {
    const userId = req.user?.id;
    const userPubkey = req.user?.pubkey;
    if (!userId || !userPubkey) {
      res.status(401).json({ error: "auth required" });
      return;
    }
    const sessionId = req.params.id;
    if (typeof sessionId !== "string" || !sessionId) {
      res.status(400).json({ error: "session id required in path" });
      return;
    }

    const parsed = parsePatchBody(req.body);
    if (!parsed.ok) {
      res.status(parsed.status).json(parsed.body);
      return;
    }
    const body = parsed.body;

    let owner: PublicKey;
    let recipients: PublicKey[] | null;
    try {
      owner = new PublicKey(userPubkey);
      recipients = body.recipients ? body.recipients.map((r) => new PublicKey(r)) : null;
    } catch {
      res.status(400).json({ error: "invalid base58 in pubkey or recipients" });
      return;
    }

    const db = getDb();
    const row = await loadOwnedSession(db, userId, sessionId);
    if (!row) {
      res.status(404).json({ error: "session not found" });
      return;
    }

    let recentBlockhash: string;
    try {
      recentBlockhash = await getBlockhash();
    } catch (err) {
      console.error("[PATCH /v1/session/:id/allowlist] rpc unavailable:", err);
      res.status(503).json({ error: "rpc unavailable" });
      return;
    }

    const ix = buildUpdateSessionAllowlistIx({
      owner,
      sessionPubkey: new PublicKey(row.sessionPubkey),
      action: body.action,
      recipients,
      instructionsBitmap: body.allowed_instructions,
    });
    const tx = new Transaction({ feePayer: owner, recentBlockhash });
    tx.add(ix);
    const txBase64 = serializeUnsignedTx(tx);

    res.json({
      txBase64,
      sessionId,
      sessionPubkey: row.sessionPubkey,
    });
  };
}

export const patchSessionAllowlistHandler = makePatchSessionAllowlistHandler();

// ---------------------------------------------------------------------------
// T-218 — GET /v1/sessions
//
// Lists every session attached to wallets owned by the caller. Powers the
// dashboard's session list (T-304).
// ---------------------------------------------------------------------------

export async function getSessionsHandler(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: "auth required" });
    return;
  }
  const filterWalletId = typeof req.query.wallet_id === "string" ? req.query.wallet_id : null;

  const db = getDb();

  // Look up the caller's wallet IDs first; this scopes the join cleanly and
  // makes the empty-result case obvious (no wallets ⇒ no sessions, no 404).
  const ownedWallets = await db
    .select({ id: wallets.id })
    .from(wallets)
    .where(
      filterWalletId
        ? and(eq(wallets.userId, userId), eq(wallets.id, filterWalletId))
        : eq(wallets.userId, userId),
    );
  if (ownedWallets.length === 0) {
    res.json([]);
    return;
  }
  const walletIds = ownedWallets.map((w) => w.id);

  const rows = await db
    .select({
      id: sessions.id,
      walletId: sessions.walletId,
      label: sessions.label,
      sessionPubkey: sessions.sessionPubkey,
      expiresAt: sessions.expiresAt,
      revokedAt: sessions.revokedAt,
      createdAt: sessions.createdAt,
      keyPrefix: apiKeys.keyPrefix,
    })
    .from(sessions)
    // LEFT JOIN filtered to un-revoked api_keys: rotations (T-230) keep
    // multiple rows per session — only the active one should surface as
    // `keyPrefix`. LEFT (not INNER) so revoked sessions with zero active
    // api_keys still appear in the list with keyPrefix=null — the dashboard
    // shows the "revoked" badge and a `—` for the key column.
    .leftJoin(
      apiKeys,
      and(eq(apiKeys.sessionId, sessions.id), isNull(apiKeys.revokedAt)),
    )
    .where(inArray(sessions.walletId, walletIds))
    .orderBy(desc(sessions.createdAt));

  res.json(rows);
}

// ---------------------------------------------------------------------------
// T-219 — GET /v1/sessions/:id
//
// Single-session read with on-chain projection merged in. Powers the session
// detail / allowlist editor in the dashboard (T-305). 404s for both
// "not found" and "wrong owner" so existence isn't leaked across users.
// ---------------------------------------------------------------------------

export type ConnectionFactory = () => Connection;

export interface MakeGetSessionDeps {
  connection?: ConnectionFactory;
}

export function makeGetSessionHandler(deps: MakeGetSessionDeps = {}) {
  const newConn =
    deps.connection ?? (() => new Connection(envOrThrow("SOLANA_RPC_URL"), "confirmed"));

  return async function getSession(req: Request, res: Response): Promise<void> {
    const userId = req.user?.id;
    const userPubkey = req.user?.pubkey;
    if (!userId || !userPubkey) {
      res.status(401).json({ error: "auth required" });
      return;
    }
    const sessionId = req.params.id;
    if (typeof sessionId !== "string" || !sessionId) {
      res.status(400).json({ error: "session id required in path" });
      return;
    }

    const db = getDb();
    const rows = await db
      .select({
        id: sessions.id,
        walletId: sessions.walletId,
        label: sessions.label,
        sessionPubkey: sessions.sessionPubkey,
        expiresAt: sessions.expiresAt,
        revokedAt: sessions.revokedAt,
        createdAt: sessions.createdAt,
        keyPrefix: apiKeys.keyPrefix,
        vaultPda: wallets.vaultPda,
      })
      .from(sessions)
      .innerJoin(wallets, eq(sessions.walletId, wallets.id))
      // LEFT JOIN to active api_keys: rotation (T-230) keeps revoked rows
      // around; revoked sessions have no active api_keys at all but should
      // still be readable for the detail view (status="revoked").
      .leftJoin(
        apiKeys,
        and(eq(apiKeys.sessionId, sessions.id), isNull(apiKeys.revokedAt)),
      )
      .where(and(eq(sessions.id, sessionId), eq(wallets.userId, userId)))
      .limit(1);
    const row = rows[0];
    if (!row) {
      res.status(404).json({ error: "session not found" });
      return;
    }

    // Off-chain policy is wallet-scoped (one row per wallet); attach if present.
    const policyRows = await db
      .select({
        allowedUrls: offChainPolicies.allowedUrls,
        timeWindowStartMin: offChainPolicies.timeWindowStartMin,
        timeWindowEndMin: offChainPolicies.timeWindowEndMin,
        timeWindowDowBitmask: offChainPolicies.timeWindowDowBitmask,
        timezone: offChainPolicies.timezone,
      })
      .from(offChainPolicies)
      .where(eq(offChainPolicies.walletId, row.walletId))
      .limit(1);
    const offChain = policyRows[0] ?? null;

    // On-chain Session account read. PDA = ["session", vault, session_pubkey].
    let owner: PublicKey;
    let vault: PublicKey;
    let sessionPubkey: PublicKey;
    try {
      owner = new PublicKey(userPubkey);
      vault = new PublicKey(row.vaultPda);
      sessionPubkey = new PublicKey(row.sessionPubkey);
    } catch {
      res.status(500).json({ error: "wallet/session pubkey malformed in DB" });
      return;
    }
    // owner is unused for the PDA derivation but kept for parity with other
    // routes that build owner-signed txs; suppress unused-var by referencing.
    void owner;
    const [sessionPda] = deriveSessionPda(vault, sessionPubkey);

    let onChain: ReturnType<typeof decodeSessionAccount> | null = null;
    let onChainError: string | null = null;
    try {
      const conn = newConn();
      const info = await conn.getAccountInfo(sessionPda, "confirmed");
      if (!info) {
        // Session row exists in DB but the on-chain PDA doesn't — happens
        // between POST /v1/session and the owner submitting the tx.
        onChainError = "session pda not yet on chain";
      } else {
        onChain = decodeSessionAccount(Buffer.from(info.data));
      }
    } catch (err) {
      console.error("[GET /v1/sessions/:id] on-chain read failed:", err);
      onChainError = "rpc unavailable";
    }

    res.json({
      id: row.id,
      walletId: row.walletId,
      label: row.label,
      sessionPubkey: row.sessionPubkey,
      expiresAt: row.expiresAt,
      revokedAt: row.revokedAt,
      createdAt: row.createdAt,
      keyPrefix: row.keyPrefix,
      onChain: onChain
        ? {
            // Convert bigints to decimal strings — JSON can't represent u64
            // safely as Number once we cross 2^53.
            maxPerTx: onChain.maxPerTx.toString(),
            dailyCap: onChain.dailyCap.toString(),
            dailySpent: onChain.dailySpent.toString(),
            dailyWindowStart: Number(onChain.dailyWindowStart),
            expiry: Number(onChain.expiry),
            allowedRecipients: onChain.allowedRecipients.map((p) => p.toBase58()),
            allowedRecipientsCount: onChain.allowedRecipientsCount,
            allowedInstructions: onChain.allowedInstructions,
          }
        : null,
      onChainError,
      offChainPolicy: offChain
        ? {
            allowedUrls: offChain.allowedUrls,
            timeWindowStartMin: offChain.timeWindowStartMin,
            timeWindowEndMin: offChain.timeWindowEndMin,
            timeWindowDowBitmask: offChain.timeWindowDowBitmask,
            timezone: offChain.timezone,
          }
        : null,
    });
  };
}

export const getSessionHandler = makeGetSessionHandler();

// ---------------------------------------------------------------------------
// T-230 — POST /v1/session/:id/rotate-key
//
// Mint a fresh bearer for an existing session. The on-chain `Session` PDA is
// untouched (no on-chain tx needed) — only the http-layer api_keys row
// rotates. All previously-active api_keys for this session are marked
// revokedAt=now() so any leaked old token returns 401 immediately. Owner
// must be authenticated via dashboard JWT and own the session via the
// sessions → wallets → users.id triple-join.
//
// Returns the plaintext apiKey ONCE — same contract as POST /v1/session.
// The dashboard pipes the response into the same ApiKeyRevealModal so the
// user copies it before the modal closes.
// ---------------------------------------------------------------------------

export async function postRotateSessionKeyHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: "auth required" });
    return;
  }
  const sessionId = req.params.id;
  if (typeof sessionId !== "string" || !sessionId) {
    res.status(400).json({ error: "session id required in path" });
    return;
  }

  const db = getDb();

  // Ownership + revocation check via the same triple-join used by
  // DELETE/PATCH on /v1/session/:id.
  const rows = await db
    .select({
      id: sessions.id,
      walletId: sessions.walletId,
      revokedAt: sessions.revokedAt,
    })
    .from(sessions)
    .innerJoin(wallets, eq(sessions.walletId, wallets.id))
    .where(and(eq(sessions.id, sessionId), eq(wallets.userId, userId)))
    .limit(1);
  const row = rows[0];
  if (!row) {
    res.status(404).json({ error: "session not found" });
    return;
  }
  if (row.revokedAt) {
    // Rotating a revoked session would mint a working key for an on-chain
    // session that's been closed — confusing failure mode. Force the user
    // to create a new session instead.
    res.status(409).json({ error: "session is revoked — create a new session" });
    return;
  }

  const { token: apiKey, prefix: keyPrefix } = generateApiKey();
  const hashedToken = await hashApiKey(apiKey);

  // Single transaction: revoke any active keys for this session, then
  // insert the new one. If a second rotation lands concurrently both
  // wrappers run their own revoke+insert pair — final state has two new
  // active keys (race) but no lingering old ones; both new keys keep
  // working until the next rotation.
  await db.transaction(async (tx) => {
    await tx
      .update(apiKeys)
      .set({ revokedAt: new Date() })
      .where(and(eq(apiKeys.sessionId, sessionId), isNull(apiKeys.revokedAt)));
    await tx.insert(apiKeys).values({
      sessionId,
      keyPrefix,
      hashedToken,
    });
    await tx.insert(auditLog).values({
      walletId: row.walletId,
      sessionId,
      action: "session_rotate_key",
      decision: "allow",
    });
  });

  res.json({ apiKey, keyPrefix });
}

// ---------------------------------------------------------------------------
// T-239 — GET /v1/session/me
//
// Agent-readable session-introspection endpoint. The dashboard reads
// `GET /v1/sessions/:id` (dashboard-JWT, T-219); agents previously had no
// way to learn their own bounds and could only react to on-chain reverts
// after a failed spend ("AmountExceedsMaxPerTx" / "RecipientNotAllowed" /
// etc — see skill.md "On-chain 402 substrings"). T-237 validation flagged
// this as a real friction point: agents can react but can't plan.
//
// Auth: api-key bearer middleware (the same `requireApiKey` middleware that
// fronts every /v1/spend/* and /v1/yield/* route). The session is implicit
// in the bearer — `req.session` + `req.wallet` are populated by the
// middleware. There is no `:id` param: agents can only read THEIR OWN
// session, never another caller's.
//
// Response shape mirrors the on-chain Session PDA (decoded by the existing
// `decodeSessionAccount` helper) and follows the agent-surface conventions
// from `/v1/yield/position`: snake_case JSON keys, USDC fields as decimal
// strings of base units (1 USDC = 1_000_000), recipient pubkeys as base58.
// `daily_window_start` and `expiry` are Unix seconds (numbers — fit in
// 2^53; the underlying i64 is in seconds, not microseconds, so no precision
// loss).
//
// Error taxonomy:
//   401 — handled by middleware (missing/invalid/revoked bearer)
//   404 — session PDA not yet on chain (POST /v1/session was made but the
//         owner hasn't submitted the add_session tx via Phantom yet)
//   503 — RPC unavailable (matches the rest of the api's error taxonomy)
// ---------------------------------------------------------------------------

export interface MakeGetSessionMeDeps {
  connection?: ConnectionFactory;
}

export function makeGetSessionMeHandler(deps: MakeGetSessionMeDeps = {}) {
  const newConn =
    deps.connection ?? (() => new Connection(envOrThrow("SOLANA_RPC_URL"), "confirmed"));

  return async function getSessionMe(req: Request, res: Response): Promise<void> {
    const session = req.session;
    const wallet = req.wallet;
    if (!session || !wallet) {
      // Defensive — `requireApiKey` middleware should have already returned
      // 401 before we get here. Mirrors the guard in /v1/yield/position.
      res.status(401).json({ error: "api key required" });
      return;
    }

    let vault: PublicKey;
    let sessionPubkey: PublicKey;
    try {
      vault = new PublicKey(wallet.vaultPda);
      sessionPubkey = new PublicKey(session.sessionPubkey);
    } catch {
      // Both come from the DB row the middleware loaded — if they're not
      // valid base58 the row is corrupt, which is a server bug, not a
      // caller bug.
      res.status(500).json({ error: "session pubkey malformed in DB" });
      return;
    }
    const [sessionPda] = deriveSessionPda(vault, sessionPubkey);

    const conn = newConn();
    let info: Awaited<ReturnType<Connection["getAccountInfo"]>>;
    try {
      info = await conn.getAccountInfo(sessionPda, "confirmed");
    } catch (err) {
      console.error("[GET /v1/session/me] on-chain read failed:", err);
      res.status(503).json({ error: "rpc unavailable" });
      return;
    }
    if (!info) {
      // Session row exists in DB (otherwise the api-key middleware wouldn't
      // have validated the bearer), but the on-chain PDA hasn't been
      // initialized — owner hasn't submitted the add_session tx via Phantom
      // yet. Agent should surface to the human and stop retrying.
      res.status(404).json({ error: "session pda not yet on chain" });
      return;
    }

    let decoded: ReturnType<typeof decodeSessionAccount>;
    try {
      decoded = decodeSessionAccount(Buffer.from(info.data));
    } catch (err) {
      console.error("[GET /v1/session/me] session decode failed:", err);
      res.status(500).json({ error: "session decode failed" });
      return;
    }

    res.json({
      // u64 fields — JSON can't safely represent past 2^53 so serialize as
      // decimal strings, matching `/v1/yield/position`.
      max_per_tx: decoded.maxPerTx.toString(),
      daily_cap: decoded.dailyCap.toString(),
      daily_spent: decoded.dailySpent.toString(),
      // i64 unix seconds; safe in number range for any realistic timestamp.
      daily_window_start: Number(decoded.dailyWindowStart),
      expiry: Number(decoded.expiry),
      allowed_recipients: decoded.allowedRecipients.map((p) => p.toBase58()),
      allowed_instructions: decoded.allowedInstructions,
    });
  };
}

export const getSessionMeHandler = makeGetSessionMeHandler();
