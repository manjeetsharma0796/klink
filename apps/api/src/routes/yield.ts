import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
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
import { buildKaminoDepositIx, buildKaminoWithdrawIx } from "../program/agent-wallet";

/**
 * Yield routes — T-213, spec §4.3.
 *
 *   POST /v1/yield/deposit   { amount }   — kamino_deposit (USDC base units)
 *   POST /v1/yield/withdraw  { amount }   — kamino_withdraw (cToken base units)
 *   GET  /v1/yield/position              — read on-chain deployed + cToken balance
 *
 * All three are API-key-authenticated for v1 (the agent triggers yield).
 * The owner-signing path (dashboard JWT, Phantom signs the tx) is deferred
 * to a follow-up — it requires returning an unsigned base64 tx instead of a
 * tx_signature, which is a different response shape.
 *
 * Partial-liquidity detection on withdraw: we snapshot the on-chain
 * `vault.deployed_amount` before and after the tx. If the actual decrement
 * is less than the requested amount (Kamino's utilization-stress path
 * documented in spec §5), we return 409 PARTIAL_LIQUIDITY with the actual
 * amount that was withdrawn so the agent can retry smaller or wait.
 *
 * Accrued reading via klend-sdk is deferred — for v1 the position endpoint
 * returns `deployed_amount` (the principal recorded on-chain) and the raw
 * cToken balance (which monotonically reflects accrual but isn't denominated
 * in USDC without the reserve's exchange rate). A follow-up adds klend-sdk
 * for accurate accrued USDC.
 */

function envOrThrow(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

interface KaminoConfig {
  programId: PublicKey;
  reserve: PublicKey;
  lendingMarket: PublicKey;
  lendingMarketAuthority: PublicKey;
  reserveLiquiditySupply: PublicKey;
  reserveCollateralMint: PublicKey;
}

const DEFAULT_KAMINO_PROGRAM_ID = "KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD";

export type KaminoConfigLoader = () => KaminoConfig;

const defaultKaminoConfig: KaminoConfigLoader = () => ({
  programId: new PublicKey(process.env.KAMINO_PROGRAM_ID ?? DEFAULT_KAMINO_PROGRAM_ID),
  reserve: new PublicKey(envOrThrow("KAMINO_USDC_RESERVE")),
  lendingMarket: new PublicKey(envOrThrow("KAMINO_LENDING_MARKET")),
  lendingMarketAuthority: new PublicKey(envOrThrow("KAMINO_LENDING_MARKET_AUTHORITY")),
  reserveLiquiditySupply: new PublicKey(envOrThrow("KAMINO_RESERVE_LIQUIDITY_SUPPLY")),
  reserveCollateralMint: new PublicKey(envOrThrow("KAMINO_RESERVE_COLLATERAL_MINT")),
});

// ---------------------------------------------------------------------------
// Validation helpers (pattern from spend.ts)
// ---------------------------------------------------------------------------

interface ValidationError {
  ok: false;
  status: number;
  body: { error: string };
}

function fail(status: number, error: string): ValidationError {
  return { ok: false, status, body: { error } };
}

function parseAmountBody(raw: unknown): { ok: true; amount: bigint } | ValidationError {
  if (!raw || typeof raw !== "object") return fail(400, "request body must be JSON object");
  const b = raw as Record<string, unknown>;
  if (typeof b.amount !== "number" || !Number.isFinite(b.amount) || b.amount <= 0) {
    return fail(400, "amount must be a positive number (base units)");
  }
  // Truncate to integer — base units are integral on chain.
  return { ok: true, amount: BigInt(Math.trunc(b.amount)) };
}

// ---------------------------------------------------------------------------
// Shared session-keypair loader
// ---------------------------------------------------------------------------

async function loadSessionKeypair(sessionId: string, masterKey: string): Promise<Keypair | null> {
  const db = getDb();
  const [row] = await db
    .select({ secret: sessions.encryptedSessionSecret })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  if (!row) return null;
  const secretBytes = decryptSessionSecret(row.secret, masterKey);
  return Keypair.fromSecretKey(secretBytes);
}

// ---------------------------------------------------------------------------
// On-chain Vault account read — minimal Borsh-compatible parser.
//
// Layout (Anchor): 8-byte discriminator + Vault::SIZE. Per
// `programs/agent_wallet/src/state.rs`:
//   pub struct Vault { owner: Pubkey, max_deployed_fraction_bp: u16,
//                       deployed_amount: u64, bump: u8 }
//   SIZE = 32 + 2 + 8 + 1 = 43
// ---------------------------------------------------------------------------

// Layout offsets within Vault account data:
//   [0..8)   Anchor discriminator
//   [8..40)  owner: Pubkey
//   [40..42) max_deployed_fraction_bp: u16
//   [42..50) deployed_amount: u64
//   [50..51) bump: u8
const VAULT_DEPLOYED_AMOUNT_OFFSET = 8 + 32 + 2;

export function readDeployedAmountFromVault(data: Buffer): bigint {
  if (data.length < VAULT_DEPLOYED_AMOUNT_OFFSET + 8) {
    throw new Error("vault account too short to contain deployed_amount");
  }
  return data.readBigUInt64LE(VAULT_DEPLOYED_AMOUNT_OFFSET);
}

export type VaultReader = (conn: Connection, vault: PublicKey) => Promise<bigint>;

const defaultReadDeployed: VaultReader = async (conn, vault) => {
  const info = await conn.getAccountInfo(vault, "confirmed");
  if (!info) throw new Error("vault account not found on-chain");
  return readDeployedAmountFromVault(Buffer.from(info.data));
};

export type CollateralBalanceReader = (
  conn: Connection,
  collateralAta: PublicKey,
) => Promise<bigint>;

const defaultReadCollateral: CollateralBalanceReader = async (conn, ata) => {
  try {
    const bal = await conn.getTokenAccountBalance(ata);
    return BigInt(bal.value.amount);
  } catch {
    // ATA doesn't exist yet (no deposits made) → balance is 0.
    return 0n;
  }
};

// ---------------------------------------------------------------------------
// Common deps for all three handlers
// ---------------------------------------------------------------------------

export type ConnectionFactory = () => Connection;
export type SubmitFn = (conn: Connection, tx: Transaction, signers: Keypair[]) => Promise<string>;

export interface MakeYieldDeps {
  connection?: ConnectionFactory;
  kamino?: KaminoConfigLoader;
  submit?: SubmitFn;
  readDeployedAmount?: VaultReader;
  readCollateralBalance?: CollateralBalanceReader;
}

function defaultDeps(deps: MakeYieldDeps): Required<MakeYieldDeps> {
  return {
    connection:
      deps.connection ?? (() => new Connection(envOrThrow("SOLANA_RPC_URL"), "confirmed")),
    kamino: deps.kamino ?? defaultKaminoConfig,
    submit: deps.submit ?? sendAndConfirmTransaction,
    readDeployedAmount: deps.readDeployedAmount ?? defaultReadDeployed,
    readCollateralBalance: deps.readCollateralBalance ?? defaultReadCollateral,
  };
}

// ---------------------------------------------------------------------------
// POST /v1/yield/deposit
// ---------------------------------------------------------------------------

export function makePostYieldDepositHandler(deps: MakeYieldDeps = {}) {
  const d = defaultDeps(deps);

  return async function postYieldDeposit(req: Request, res: Response) {
    const session = req.session;
    const wallet = req.wallet;
    if (!session || !wallet) {
      res.status(401).json({ error: "api key required" });
      return;
    }

    const parsed = parseAmountBody(req.body);
    if (!parsed.ok) {
      res.status(parsed.status).json(parsed.body);
      return;
    }
    const amount = parsed.amount;

    const masterKey = process.env.SESSION_SECRET_MASTER_KEY;
    if (!masterKey) {
      console.error("[POST /v1/yield/deposit] SESSION_SECRET_MASTER_KEY not set");
      res.status(500).json({ error: "server misconfigured" });
      return;
    }

    let vault: PublicKey;
    let vaultUsdcAta: PublicKey;
    let sessionPubkey: PublicKey;
    let kamino: KaminoConfig;
    try {
      vault = new PublicKey(wallet.vaultPda);
      vaultUsdcAta = new PublicKey(wallet.usdcAta);
      sessionPubkey = new PublicKey(session.sessionPubkey);
      kamino = d.kamino();
    } catch (err) {
      console.error("[POST /v1/yield/deposit] config/pubkey parse failed:", err);
      res.status(500).json({ error: "server misconfigured" });
      return;
    }

    const vaultCollateralAta = getAssociatedTokenAddressSync(
      kamino.reserveCollateralMint,
      vault,
      true, // allowOwnerOffCurve — vault is a PDA
    );

    const signer = await loadSessionKeypair(session.id, masterKey);
    if (!signer) {
      res.status(500).json({ error: "session row missing" });
      return;
    }

    const conn = d.connection();
    const { blockhash } = await conn.getLatestBlockhash("finalized");

    const tx = new Transaction({ feePayer: signer.publicKey, recentBlockhash: blockhash });

    // Idempotent ATA create — first deposit needs to create the cToken ATA;
    // subsequent deposits no-op the create instruction. Same pattern as
    // T-205's wallet route for the USDC ATA.
    tx.add(
      createAssociatedTokenAccountIdempotentInstruction(
        signer.publicKey, // payer = session keypair (sponsorable; small rent)
        vaultCollateralAta,
        vault,
        kamino.reserveCollateralMint,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      ),
    );

    tx.add(
      buildKaminoDepositIx({
        auth: signer.publicKey,
        vault,
        sessionPubkey,
        vaultUsdcAta,
        vaultCollateralAta,
        amount,
        kaminoProgramId: kamino.programId,
        kaminoReserve: kamino.reserve,
        kaminoLendingMarket: kamino.lendingMarket,
        kaminoLendingMarketAuthority: kamino.lendingMarketAuthority,
        kaminoReserveLiquiditySupply: kamino.reserveLiquiditySupply,
        kaminoReserveCollateralMint: kamino.reserveCollateralMint,
        tokenProgramId: TOKEN_PROGRAM_ID,
      }),
    );

    const db = getDb();
    let signature: string;
    try {
      signature = await d.submit(conn, tx, [signer]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown";
      console.error("[POST /v1/yield/deposit] submit failed:", msg);
      await db.insert(auditLog).values({
        walletId: wallet.id,
        sessionId: session.id,
        action: "kamino_deposit",
        amount: Number(amount),
        recipientOrUrl: kamino.reserve.toBase58(),
        decision: "deny",
        reason: `ON_CHAIN_REVERT: ${msg.slice(0, 200)}`,
      });
      res.status(402).json({ error: "on-chain submission failed", detail: msg });
      return;
    }

    await db.insert(auditLog).values({
      walletId: wallet.id,
      sessionId: session.id,
      action: "kamino_deposit",
      amount: Number(amount),
      recipientOrUrl: kamino.reserve.toBase58(),
      decision: "allow",
      txSignature: signature,
    });

    res.json({ tx_signature: signature, status: "confirmed" });
  };
}

// ---------------------------------------------------------------------------
// POST /v1/yield/withdraw — with partial-liquidity detection
// ---------------------------------------------------------------------------

export function makePostYieldWithdrawHandler(deps: MakeYieldDeps = {}) {
  const d = defaultDeps(deps);

  return async function postYieldWithdraw(req: Request, res: Response) {
    const session = req.session;
    const wallet = req.wallet;
    if (!session || !wallet) {
      res.status(401).json({ error: "api key required" });
      return;
    }

    const parsed = parseAmountBody(req.body);
    if (!parsed.ok) {
      res.status(parsed.status).json(parsed.body);
      return;
    }
    const amount = parsed.amount;

    const masterKey = process.env.SESSION_SECRET_MASTER_KEY;
    if (!masterKey) {
      console.error("[POST /v1/yield/withdraw] SESSION_SECRET_MASTER_KEY not set");
      res.status(500).json({ error: "server misconfigured" });
      return;
    }

    let vault: PublicKey;
    let vaultUsdcAta: PublicKey;
    let sessionPubkey: PublicKey;
    let kamino: KaminoConfig;
    try {
      vault = new PublicKey(wallet.vaultPda);
      vaultUsdcAta = new PublicKey(wallet.usdcAta);
      sessionPubkey = new PublicKey(session.sessionPubkey);
      kamino = d.kamino();
    } catch (err) {
      console.error("[POST /v1/yield/withdraw] config/pubkey parse failed:", err);
      res.status(500).json({ error: "server misconfigured" });
      return;
    }

    const vaultCollateralAta = getAssociatedTokenAddressSync(
      kamino.reserveCollateralMint,
      vault,
      true,
    );

    const signer = await loadSessionKeypair(session.id, masterKey);
    if (!signer) {
      res.status(500).json({ error: "session row missing" });
      return;
    }

    const conn = d.connection();

    // Pre-tx snapshot of on-chain deployed_amount. The on-chain handler
    // updates this with the *actual* USDC delta returned by Kamino — so
    // comparing pre vs post lets us detect partial liquidity (spec §5).
    let preDeployed: bigint;
    try {
      preDeployed = await d.readDeployedAmount(conn, vault);
    } catch (err) {
      console.error("[POST /v1/yield/withdraw] pre-deployed read failed:", err);
      res.status(503).json({ error: "rpc unavailable" });
      return;
    }

    const { blockhash } = await conn.getLatestBlockhash("finalized");
    const tx = new Transaction({ feePayer: signer.publicKey, recentBlockhash: blockhash });
    tx.add(
      buildKaminoWithdrawIx({
        auth: signer.publicKey,
        vault,
        sessionPubkey,
        vaultUsdcAta,
        vaultCollateralAta,
        amount,
        kaminoProgramId: kamino.programId,
        kaminoReserve: kamino.reserve,
        kaminoLendingMarket: kamino.lendingMarket,
        kaminoLendingMarketAuthority: kamino.lendingMarketAuthority,
        kaminoReserveLiquiditySupply: kamino.reserveLiquiditySupply,
        kaminoReserveCollateralMint: kamino.reserveCollateralMint,
        tokenProgramId: TOKEN_PROGRAM_ID,
      }),
    );

    const db = getDb();
    let signature: string;
    try {
      signature = await d.submit(conn, tx, [signer]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown";
      console.error("[POST /v1/yield/withdraw] submit failed:", msg);
      await db.insert(auditLog).values({
        walletId: wallet.id,
        sessionId: session.id,
        action: "kamino_withdraw",
        amount: Number(amount),
        recipientOrUrl: kamino.reserve.toBase58(),
        decision: "deny",
        reason: `ON_CHAIN_REVERT: ${msg.slice(0, 200)}`,
      });
      res.status(402).json({ error: "on-chain submission failed", detail: msg });
      return;
    }

    // Post-tx snapshot: actual USDC released = preDeployed - postDeployed.
    let postDeployed: bigint;
    try {
      postDeployed = await d.readDeployedAmount(conn, vault);
    } catch (err) {
      // Tx submitted successfully but post-read failed — return success
      // with a warning rather than misreporting partial.
      console.error("[POST /v1/yield/withdraw] post-deployed read failed:", err);
      await db.insert(auditLog).values({
        walletId: wallet.id,
        sessionId: session.id,
        action: "kamino_withdraw",
        amount: Number(amount),
        recipientOrUrl: kamino.reserve.toBase58(),
        decision: "allow",
        txSignature: signature,
      });
      res.json({ tx_signature: signature, status: "confirmed", actual_usdc: null });
      return;
    }

    const actualUsdc = preDeployed > postDeployed ? preDeployed - postDeployed : 0n;

    // Partial-liquidity detection. The on-chain instruction caps `amount`
    // at `deployed_amount` (in cTokens, ~ USDC for fresh positions), so a
    // delta < amount means Kamino utilization-stress released less than
    // requested. Matches spec §5.
    if (actualUsdc < amount) {
      await db.insert(auditLog).values({
        walletId: wallet.id,
        sessionId: session.id,
        action: "kamino_withdraw",
        amount: Number(actualUsdc),
        recipientOrUrl: kamino.reserve.toBase58(),
        decision: "allow",
        txSignature: signature,
        reason: "PARTIAL_LIQUIDITY",
      });
      res.status(409).json({
        error: "PARTIAL_LIQUIDITY",
        tx_signature: signature,
        requested: amount.toString(),
        available: actualUsdc.toString(),
      });
      return;
    }

    await db.insert(auditLog).values({
      walletId: wallet.id,
      sessionId: session.id,
      action: "kamino_withdraw",
      amount: Number(actualUsdc),
      recipientOrUrl: kamino.reserve.toBase58(),
      decision: "allow",
      txSignature: signature,
    });

    res.json({ tx_signature: signature, status: "confirmed", actual_usdc: actualUsdc.toString() });
  };
}

// ---------------------------------------------------------------------------
// GET /v1/yield/position
// ---------------------------------------------------------------------------

export function makeGetYieldPositionHandler(deps: MakeYieldDeps = {}) {
  const d = defaultDeps(deps);

  return async function getYieldPosition(req: Request, res: Response) {
    const wallet = req.wallet;
    if (!wallet) {
      res.status(401).json({ error: "api key required" });
      return;
    }

    let vault: PublicKey;
    let kamino: KaminoConfig;
    try {
      vault = new PublicKey(wallet.vaultPda);
      kamino = d.kamino();
    } catch (err) {
      console.error("[GET /v1/yield/position] config/pubkey parse failed:", err);
      res.status(500).json({ error: "server misconfigured" });
      return;
    }

    const vaultCollateralAta = getAssociatedTokenAddressSync(
      kamino.reserveCollateralMint,
      vault,
      true,
    );

    const conn = d.connection();
    let deployed: bigint;
    let collateral: bigint;
    try {
      [deployed, collateral] = await Promise.all([
        d.readDeployedAmount(conn, vault),
        d.readCollateralBalance(conn, vaultCollateralAta),
      ]);
    } catch (err) {
      console.error("[GET /v1/yield/position] on-chain read failed:", err);
      res.status(503).json({ error: "rpc unavailable" });
      return;
    }

    res.json({
      // Principal recorded on-chain — incremented on deposit, decremented
      // by the actual USDC delta on withdraw. In USDC base units.
      deployed_amount: deployed.toString(),
      // Raw cToken balance held by the vault. Reflects accrual over time
      // (cToken/USDC exchange rate increases as the reserve earns interest)
      // but isn't denominated in USDC without the reserve's exchange rate.
      // klend-sdk integration for accurate accrued USDC = follow-up task.
      ctoken_balance: collateral.toString(),
      accrued: null, // pending klend-sdk integration
    });
  };
}

// Default-deps singletons for app.ts wiring.
export const postYieldDepositHandler = makePostYieldDepositHandler();
export const postYieldWithdrawHandler = makePostYieldWithdrawHandler();
export const getYieldPositionHandler = makeGetYieldPositionHandler();
