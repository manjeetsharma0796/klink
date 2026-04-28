import { createHash } from "node:crypto";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import type { Request, Response } from "express";

/**
 * `POST /v1/wallet` — Build the unsigned `init_vault` transaction so the
 * human's Phantom can sign + submit. Spec §3.2.1 build-tx-then-sign pattern:
 * the backend never holds the owner's key.
 *
 * Self-pay model in MVP: feePayer = owner (Phantom). The backend doesn't
 * sponsor rent yet — once a treasury keypair is wired (T-214 / T-215),
 * the payer slot can switch to backend without changing the on-chain
 * `init_vault` accounts (they're already separate `payer` and `owner`
 * signers per `programs/agent_wallet/src/instructions/init_vault.rs`).
 */

const MAX_BP = 10_000;
const DEFAULT_PROGRAM_ID = "5qCJCEhfLusk59YFqaEG9Yg3Wp64ZaYwvXteFmCmedqv";

/**
 * Anchor instruction discriminator: first 8 bytes of `sha256("global:<name>")`.
 * Pinning this in tests guards against an Anchor version bump silently
 * breaking the encoding.
 */
export function anchorDiscriminator(name: string): Buffer {
  return Buffer.from(createHash("sha256").update(`global:${name}`).digest()).subarray(0, 8);
}

const INIT_VAULT_DISCRIMINATOR = anchorDiscriminator("init_vault");

export interface BuildWalletTxArgs {
  owner: PublicKey;
  maxDeployedFractionBp: number;
  programId: PublicKey;
  usdcMint: PublicKey;
  recentBlockhash: string;
}

export interface BuiltWalletTx {
  tx: Transaction;
  vaultPda: PublicKey;
  vaultUsdcAta: PublicKey;
}

/**
 * Pure tx-builder. Separated from the request handler so tests can drive it
 * without faking an HTTP layer or RPC connection.
 */
export function buildInitVaultTx(args: BuildWalletTxArgs): BuiltWalletTx {
  const [vaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), args.owner.toBuffer()],
    args.programId,
  );
  // `allowOwnerOffCurve = true` because the vault PDA is off-curve.
  const vaultUsdcAta = getAssociatedTokenAddressSync(args.usdcMint, vaultPda, true);

  const data = Buffer.alloc(8 + 2);
  INIT_VAULT_DISCRIMINATOR.copy(data, 0);
  data.writeUInt16LE(args.maxDeployedFractionBp, 8);

  const initVaultIx = new TransactionInstruction({
    programId: args.programId,
    keys: [
      // Order matches `InitVault` in programs/agent_wallet/src/instructions/init_vault.rs
      { pubkey: args.owner, isSigner: true, isWritable: true }, // payer (self-pay)
      { pubkey: args.owner, isSigner: true, isWritable: false }, // owner (master authority)
      { pubkey: vaultPda, isSigner: false, isWritable: true }, // vault (init via PDA)
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });

  // Idempotent variant: ATAs are deterministic, so anyone can front-run by
  // pre-creating the address. The non-idempotent instruction would then
  // revert with `account already exists` and block vault initialization.
  // This variant succeeds even if the ATA is already there.
  const ataIx = createAssociatedTokenAccountIdempotentInstruction(
    args.owner, // payer for the ATA rent
    vaultUsdcAta, // ata to create
    vaultPda, // wallet that owns the ata (the off-curve vault PDA)
    args.usdcMint,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );

  const tx = new Transaction({
    feePayer: args.owner,
    recentBlockhash: args.recentBlockhash,
  });
  tx.add(initVaultIx, ataIx);

  return { tx, vaultPda, vaultUsdcAta };
}

/** Lazy env reads so missing config fails the request, not the module load. */
function envOrThrow(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

export type BlockhashFetcher = () => Promise<string>;
export type ProgramIdResolver = () => PublicKey;
export type UsdcMintResolver = () => PublicKey;

export interface MakePostWalletDeps {
  blockhash?: BlockhashFetcher;
  programId?: ProgramIdResolver;
  usdcMint?: UsdcMintResolver;
}

export function makePostWalletHandler(deps: MakePostWalletDeps = {}) {
  const getBlockhash =
    deps.blockhash ??
    (async () => {
      const conn = new Connection(envOrThrow("SOLANA_RPC_URL"), "confirmed");
      const { blockhash } = await conn.getLatestBlockhash("finalized");
      return blockhash;
    });
  const getProgramId =
    deps.programId ?? (() => new PublicKey(process.env.KLINK_PROGRAM_ID ?? DEFAULT_PROGRAM_ID));
  const getUsdcMint = deps.usdcMint ?? (() => new PublicKey(envOrThrow("USDC_MINT")));

  return async function postWallet(req: Request, res: Response) {
    const userPubkey = req.user?.pubkey;
    if (!userPubkey) {
      res.status(401).json({ error: "auth required" });
      return;
    }

    const raw = req.body?.max_deployed_fraction_bp;
    if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 0 || raw > MAX_BP) {
      res.status(400).json({ error: `max_deployed_fraction_bp must be integer in 0..=${MAX_BP}` });
      return;
    }

    let owner: PublicKey;
    try {
      owner = new PublicKey(userPubkey);
    } catch {
      res.status(400).json({ error: "invalid owner pubkey on jwt" });
      return;
    }

    let recentBlockhash: string;
    try {
      recentBlockhash = await getBlockhash();
    } catch (_err) {
      res.status(503).json({ error: "rpc unavailable" });
      return;
    }

    let built: BuiltWalletTx;
    try {
      built = buildInitVaultTx({
        owner,
        maxDeployedFractionBp: raw,
        programId: getProgramId(),
        usdcMint: getUsdcMint(),
        recentBlockhash,
      });
    } catch (err) {
      // Most likely a missing/invalid env var (USDC_MINT, KLINK_PROGRAM_ID).
      // Log the underlying error so ops can see *which* config is wrong;
      // return a generic 500 to the caller (no internal details leaked).
      console.error("[POST /v1/wallet] build tx failed:", err);
      res.status(500).json({ error: "failed to build tx" });
      return;
    }

    const txBase64 = built.tx
      .serialize({ requireAllSignatures: false, verifySignatures: false })
      .toString("base64");

    res.json({
      txBase64,
      vaultPda: built.vaultPda.toBase58(),
      vaultUsdcAta: built.vaultUsdcAta.toBase58(),
    });
  };
}

export const postWalletHandler = makePostWalletHandler();
