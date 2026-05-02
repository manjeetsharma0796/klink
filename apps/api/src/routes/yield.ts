import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { and, desc, eq } from "drizzle-orm";
import type { Request, Response } from "express";
import { decryptSessionSecret } from "../crypto/session-secret";
import { loadTreasury as defaultLoadTreasury } from "../crypto/treasury";
import { getDb } from "../db/client";
import { auditLog, sessions, wallets } from "../db/schema";
import {
  type KaminoReserveAddrs,
  buildKaminoDepositIx,
  buildKaminoWithdrawIx,
  decodeVaultDeployedAmount,
  serializeUnsignedTx,
} from "../program/agent-wallet";

/**
 * Yield endpoints — spec §4.3, T-213.
 *
 *   POST /v1/yield/deposit  { amount }
 *   POST /v1/yield/withdraw { amount }
 *   GET  /v1/yield/position
 *
 * All three are agent-authenticated (API key, T-204 middleware). The deposit /
 * withdraw flows are session-signed; on-chain `kamino_deposit` /
 * `kamino_withdraw` (T-108 / T-109) enforce the `max_deployed_fraction_bp`
 * pre-flight and the typed-instruction bitmap check.
 *
 * Position read currently returns `deployed_amount` from the on-chain Vault
 * account. Computing accrued yield needs the Kamino cToken exchange rate
 * (klend-sdk or manual reserve decode); deferred to a follow-up — the value
 * is exposed as `accrued: null` in the response so dashboards can display
 * "—" without crashing.
 */

function envOrThrow(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

function envPubkey(name: string): PublicKey {
  return new PublicKey(envOrThrow(name));
}

function loadKaminoAddrs(): KaminoReserveAddrs {
  // Per-network constants — populated when T-113 deploys to devnet.
  return {
    reserve: envPubkey("KAMINO_RESERVE"),
    lendingMarket: envPubkey("KAMINO_LENDING_MARKET"),
    lendingMarketAuthority: envPubkey("KAMINO_LENDING_MARKET_AUTHORITY"),
    reserveLiquiditySupply: envPubkey("KAMINO_RESERVE_LIQUIDITY_SUPPLY"),
    reserveCollateralMint: envPubkey("KAMINO_RESERVE_COLLATERAL_MINT"),
  };
}

interface AmountBody {
  amount: number;
}

function parseAmount(
  raw: unknown,
): { ok: true; amount: bigint } | { ok: false; status: number; body: { error: string } } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, status: 400, body: { error: "request body must be JSON object" } };
  }
  const b = raw as Record<string, unknown>;
  if (typeof b.amount !== "number" || !Number.isFinite(b.amount) || b.amount <= 0) {
    return {
      ok: false,
      status: 400,
      body: { error: "amount must be a positive number (USDC base units)" },
    };
  }
  return { ok: true, amount: BigInt(Math.trunc(b.amount)) };
}

export type ConnectionFactory = () => Connection;
export type SubmitFn = (conn: Connection, tx: Transaction, signers: Keypair[]) => Promise<string>;

export interface MakeYieldDeps {
  connection?: ConnectionFactory;
  submit?: SubmitFn;
  kamino?: () => KaminoReserveAddrs;
  /** Test seam: override treasury keypair load (T-226 fee payer). */
  loadTreasury?: () => Keypair;
}

async function decryptSessionFromDb(
  db: ReturnType<typeof getDb>,
  sessionId: string,
  masterKey: string,
): Promise<Keypair | null> {
  const [row] = await db
    .select({ secret: sessions.encryptedSessionSecret })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  if (!row) return null;
  const secretBytes = decryptSessionSecret(row.secret, masterKey);
  return Keypair.fromSecretKey(secretBytes);
}

function makeKaminoMutationHandler(variant: "deposit" | "withdraw", deps: MakeYieldDeps) {
  const newConn =
    deps.connection ?? (() => new Connection(envOrThrow("SOLANA_RPC_URL"), "confirmed"));
  const doSubmit = deps.submit ?? sendAndConfirmTransaction;
  const getKamino = deps.kamino ?? loadKaminoAddrs;
  const getTreasury = deps.loadTreasury ?? defaultLoadTreasury;
  const action = variant === "deposit" ? "kamino_deposit" : "kamino_withdraw";

  return async function postKaminoMutation(req: Request, res: Response) {
    const session = req.session;
    const wallet = req.wallet;
    if (!session || !wallet) {
      res.status(401).json({ error: "api key required" });
      return;
    }

    const parsed = parseAmount(req.body);
    if (!parsed.ok) {
      res.status(parsed.status).json(parsed.body);
      return;
    }
    const amount = parsed.amount;

    const masterKey = process.env.SESSION_SECRET_MASTER_KEY;
    if (!masterKey) {
      console.error(`[POST /v1/yield/${variant}] SESSION_SECRET_MASTER_KEY not set`);
      res.status(500).json({ error: "server misconfigured" });
      return;
    }

    let vault: PublicKey;
    let vaultUsdcAta: PublicKey;
    let sessionPubkey: PublicKey;
    let kamino: KaminoReserveAddrs;
    try {
      vault = new PublicKey(wallet.vaultPda);
      vaultUsdcAta = new PublicKey(wallet.usdcAta);
      sessionPubkey = new PublicKey(session.sessionPubkey);
      kamino = getKamino();
    } catch (err) {
      console.error(`[POST /v1/yield/${variant}] address parse failed:`, err);
      res.status(500).json({ error: "server misconfigured" });
      return;
    }

    const db = getDb();
    const signer = await decryptSessionFromDb(db, session.id, masterKey);
    if (!signer) {
      res.status(500).json({ error: "session row missing" });
      return;
    }

    const conn = newConn();
    // Vault collateral ATA: the cToken mint comes from Kamino reserve config.
    const vaultCollateralAta = getAssociatedTokenAddressSync(
      kamino.reserveCollateralMint,
      vault,
      true, // allowOwnerOffCurve — vault is a PDA
    );

    const ixBuilder = variant === "deposit" ? buildKaminoDepositIx : buildKaminoWithdrawIx;
    const ix = ixBuilder({
      auth: signer.publicKey,
      vault,
      sessionPubkey,
      vaultUsdcAta,
      vaultCollateralAta,
      kamino,
      tokenProgramId: TOKEN_PROGRAM_ID,
      amount,
    });

    let treasury: Keypair;
    try {
      treasury = getTreasury();
    } catch (err) {
      console.error(`[POST /v1/yield/${variant}] treasury load failed:`, err);
      res.status(500).json({ error: "server misconfigured" });
      return;
    }

    // T-226: treasury pays the network fee, session signs the on-chain
    // `kamino_*` instruction's auth check. Session keypairs have 0 SOL.
    const tx = new Transaction({ feePayer: treasury.publicKey });
    tx.add(ix);
    try {
      const { blockhash } = await conn.getLatestBlockhash("finalized");
      tx.recentBlockhash = blockhash;
    } catch (err) {
      console.error(`[POST /v1/yield/${variant}] blockhash fetch failed:`, err);
      res.status(503).json({ error: "rpc unavailable" });
      return;
    }

    let signature: string;
    try {
      signature = await doSubmit(conn, tx, [treasury, signer]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown";
      // For withdraw, partial-liquidity from Kamino surfaces here as a
      // revert; spec §4.3 calls for 409 on partial. We can't distinguish
      // partial vs full failure from the error message alone, so we 409
      // on withdraw and 402 on deposit.
      const status = variant === "withdraw" ? 409 : 402;
      await db.insert(auditLog).values({
        walletId: wallet.id,
        sessionId: session.id,
        action,
        amount: Number(amount),
        decision: "deny",
        reason: `ON_CHAIN_REVERT: ${msg.slice(0, 200)}`,
      });
      res.status(status).json({ error: "on-chain submission failed", detail: msg });
      return;
    }

    await db.insert(auditLog).values({
      walletId: wallet.id,
      sessionId: session.id,
      action,
      amount: Number(amount),
      decision: "allow",
      txSignature: signature,
    });
    res.json({ tx_signature: signature, status: "confirmed" });
  };
}

export const makePostYieldDepositHandler = (deps: MakeYieldDeps = {}) =>
  makeKaminoMutationHandler("deposit", deps);
export const makePostYieldWithdrawHandler = (deps: MakeYieldDeps = {}) =>
  makeKaminoMutationHandler("withdraw", deps);

export const postYieldDepositHandler = makePostYieldDepositHandler();
export const postYieldWithdrawHandler = makePostYieldWithdrawHandler();

// ---------------------------------------------------------------------------
// GET /v1/yield/position — agent or owner reads deployed_amount + accrued
// ---------------------------------------------------------------------------

export interface MakeGetYieldPositionDeps {
  connection?: ConnectionFactory;
}

export function makeGetYieldPositionHandler(deps: MakeGetYieldPositionDeps = {}) {
  const newConn =
    deps.connection ?? (() => new Connection(envOrThrow("SOLANA_RPC_URL"), "confirmed"));

  return async function getYieldPosition(req: Request, res: Response) {
    const wallet = req.wallet;
    if (!wallet) {
      res.status(401).json({ error: "api key required" });
      return;
    }
    let vault: PublicKey;
    try {
      vault = new PublicKey(wallet.vaultPda);
    } catch {
      res.status(500).json({ error: "vault pubkey invalid" });
      return;
    }

    const conn = newConn();
    let info: Awaited<ReturnType<Connection["getAccountInfo"]>>;
    try {
      info = await conn.getAccountInfo(vault, "confirmed");
    } catch (err) {
      console.error("[GET /v1/yield/position] account fetch failed:", err);
      res.status(503).json({ error: "rpc unavailable" });
      return;
    }
    if (!info) {
      res.status(404).json({ error: "vault not found on chain" });
      return;
    }

    let deployed: bigint;
    try {
      deployed = decodeVaultDeployedAmount(Buffer.from(info.data));
    } catch (err) {
      console.error("[GET /v1/yield/position] vault decode failed:", err);
      res.status(500).json({ error: "vault decode failed" });
      return;
    }

    res.json({
      deployed: deployed.toString(),
      // accrued yield computation deferred — needs Kamino cToken exchange-rate
      // via klend-sdk or manual reserve decode. Track in TODO §2 follow-up.
      accrued: null,
      total_balance: deployed.toString(),
    });
  };
}

export const getYieldPositionHandler = makeGetYieldPositionHandler();

// ---------------------------------------------------------------------------
// T-222 — Owner-flow build-tx variants
//
// Mirrors the build-then-Phantom pattern in T-205 / T-207: dashboard JWT,
// validate ownership, build the unsigned `kamino_deposit` / `kamino_withdraw`
// tx with `session = None` (the rust instruction's Option<Account<Session>>
// is None when owner signs), return `{ txBase64 }` for the dashboard to hand
// off to Phantom. Mounted at /v1/wallet/yield/{deposit,withdraw} so the auth
// surface stays clean: agent-key paths from T-213 stay on /v1/yield/*.
// ---------------------------------------------------------------------------

interface OwnerYieldBody {
  amount: number;
  /** Optional — defaults to caller's most-recent wallet (single-wallet MVP). */
  wallet_id?: string;
}

function parseOwnerYieldBody(
  raw: unknown,
):
  | { ok: true; amount: bigint; walletId: string | undefined }
  | { ok: false; status: number; body: { error: string } } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, status: 400, body: { error: "request body must be JSON object" } };
  }
  const b = raw as Record<string, unknown>;
  if (typeof b.amount !== "number" || !Number.isFinite(b.amount) || b.amount <= 0) {
    return {
      ok: false,
      status: 400,
      body: { error: "amount must be a positive number (USDC base units)" },
    };
  }
  if (b.wallet_id !== undefined && typeof b.wallet_id !== "string") {
    return { ok: false, status: 400, body: { error: "wallet_id must be string if provided" } };
  }
  return {
    ok: true,
    amount: BigInt(Math.trunc(b.amount)),
    walletId: b.wallet_id as string | undefined,
  };
}

export type BlockhashFetcher = () => Promise<string>;

export interface MakeOwnerYieldDeps {
  blockhash?: BlockhashFetcher;
  kamino?: () => KaminoReserveAddrs;
}

function makeOwnerKaminoHandler(variant: "deposit" | "withdraw", deps: MakeOwnerYieldDeps) {
  const getBlockhash =
    deps.blockhash ??
    (async () => {
      const conn = new Connection(envOrThrow("SOLANA_RPC_URL"), "confirmed");
      const { blockhash } = await conn.getLatestBlockhash("finalized");
      return blockhash;
    });
  const getKamino = deps.kamino ?? loadKaminoAddrs;

  return async function ownerKaminoHandler(req: Request, res: Response): Promise<void> {
    const userId = req.user?.id;
    const userPubkey = req.user?.pubkey;
    if (!userId || !userPubkey) {
      res.status(401).json({ error: "auth required" });
      return;
    }

    const parsed = parseOwnerYieldBody(req.body);
    if (!parsed.ok) {
      res.status(parsed.status).json(parsed.body);
      return;
    }

    const db = getDb();
    const where = parsed.walletId
      ? and(eq(wallets.userId, userId), eq(wallets.id, parsed.walletId))
      : eq(wallets.userId, userId);
    const rows = await db
      .select({
        id: wallets.id,
        vaultPda: wallets.vaultPda,
        usdcAta: wallets.usdcAta,
      })
      .from(wallets)
      .where(where)
      .orderBy(desc(wallets.createdAt))
      .limit(1);
    const wallet = rows[0];
    if (!wallet) {
      res.status(404).json({ error: "wallet not found" });
      return;
    }

    let owner: PublicKey;
    let vault: PublicKey;
    let vaultUsdcAta: PublicKey;
    let kamino: KaminoReserveAddrs;
    try {
      owner = new PublicKey(userPubkey);
      vault = new PublicKey(wallet.vaultPda);
      vaultUsdcAta = new PublicKey(wallet.usdcAta);
      kamino = getKamino();
    } catch (err) {
      console.error(`[POST /v1/wallet/yield/${variant}] address parse failed:`, err);
      res.status(500).json({ error: "server misconfigured" });
      return;
    }

    const vaultCollateralAta = getAssociatedTokenAddressSync(
      kamino.reserveCollateralMint,
      vault,
      true, // allowOwnerOffCurve — vault is a PDA
    );

    const ixBuilder = variant === "deposit" ? buildKaminoDepositIx : buildKaminoWithdrawIx;
    const ix = ixBuilder({
      auth: owner,
      vault,
      sessionPubkey: null, // owner-signed path — Option<Session> = None
      vaultUsdcAta,
      vaultCollateralAta,
      kamino,
      tokenProgramId: TOKEN_PROGRAM_ID,
      amount: parsed.amount,
    });

    let recentBlockhash: string;
    try {
      recentBlockhash = await getBlockhash();
    } catch (err) {
      console.error(`[POST /v1/wallet/yield/${variant}] rpc unavailable:`, err);
      res.status(503).json({ error: "rpc unavailable" });
      return;
    }

    const tx = new Transaction({ feePayer: owner, recentBlockhash });
    tx.add(ix);
    const txBase64 = serializeUnsignedTx(tx);

    res.json({
      txBase64,
      vaultPda: wallet.vaultPda,
      vaultUsdcAta: wallet.usdcAta,
    });
  };
}

export const makePostOwnerYieldDepositHandler = (deps: MakeOwnerYieldDeps = {}) =>
  makeOwnerKaminoHandler("deposit", deps);
export const makePostOwnerYieldWithdrawHandler = (deps: MakeOwnerYieldDeps = {}) =>
  makeOwnerKaminoHandler("withdraw", deps);

export const postOwnerYieldDepositHandler = makePostOwnerYieldDepositHandler();
export const postOwnerYieldWithdrawHandler = makePostOwnerYieldWithdrawHandler();
