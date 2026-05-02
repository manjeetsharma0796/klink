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
import { and, desc, eq } from "drizzle-orm";
import type { Request, Response } from "express";
import { getDb } from "../db/client";
import { offChainPolicies, users, wallets } from "../db/schema";
import {
  buildOwnerTransferUsdcIx,
  buildSetMaxDeployedFractionIx,
  serializeUnsignedTx,
} from "../program/agent-wallet";

/**
 * Resolve `users.id` for the authenticated Phantom pubkey. The JWT carries an
 * id from whichever DB minted it — after a DB rotation, that id may not exist
 * in the new DB. Looking up by `phantom_pubkey` (UNIQUE indexed) gives the
 * canonical id for the current DB and survives rotations cleanly.
 *
 * `autoCreate`: when true (self-heal path), upsert a `users` row if missing
 * so a follow-up `wallets` INSERT doesn't fail the user_id FK.
 */
async function resolveUserIdFromPubkey(
  db: ReturnType<typeof getDb>,
  phantomPubkey: string,
  opts: { autoCreate: boolean },
): Promise<string | null> {
  const found = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.phantomPubkey, phantomPubkey))
    .limit(1);
  if (found[0]) return found[0].id;
  if (!opts.autoCreate) return null;
  const inserted = await db
    .insert(users)
    .values({ phantomPubkey })
    .onConflictDoNothing({ target: users.phantomPubkey })
    .returning({ id: users.id });
  if (inserted[0]) return inserted[0].id;
  // Race: another request inserted between SELECT and INSERT. Re-select.
  const reselect = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.phantomPubkey, phantomPubkey))
    .limit(1);
  return reselect[0]?.id ?? null;
}

/**
 * `POST /v1/wallet` — If the owner's Vault PDA already exists on-chain,
 * backfill the `wallets` row (if missing) and return the existing addresses.
 * Otherwise build an unsigned `init_vault` transaction for the human's
 * Phantom to sign + submit. Spec §3.2.1 build-tx-then-sign pattern: the
 * backend never holds the owner's key.
 *
 * Self-pay model in MVP: feePayer = owner (Phantom). The backend doesn't
 * sponsor rent yet — once a treasury keypair is wired (T-214 / T-215),
 * the payer slot can switch to backend without changing the on-chain
 * `init_vault` accounts (they're already separate `payer` and `owner`
 * signers per `programs/agent_wallet/src/instructions/init_vault.rs`).
 *
 * The self-heal branch exists because the source-of-truth for
 * "does this user have a wallet?" used to be Postgres alone; if the DB is
 * rotated between vault creation and the next dashboard load, the row
 * disappears but the on-chain account survives, and a naive build-tx call
 * would produce an `init_vault` tx that fails with `AccountAlreadyInUse`.
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

/**
 * Anchor account discriminator for the `Vault` struct: first 8 bytes of
 * `sha256("account:Vault")`. Used to verify that the on-chain account at
 * the vault PDA address really is a klink Vault before backfilling the DB.
 */
export const VAULT_ACCOUNT_DISCRIMINATOR = Buffer.from(
  createHash("sha256").update("account:Vault").digest(),
).subarray(0, 8);

/**
 * Borsh layout of the on-chain `Vault` struct, from
 * `programs/agent_wallet/src/state.rs`:
 *   8  account discriminator
 *   32 owner pubkey
 *   2  max_deployed_fraction_bp (u16 LE)
 *   8  deployed_amount (u64 LE)
 *   1  bump
 */
const VAULT_DATA_LEN = 8 + 32 + 2 + 8 + 1;

export type VaultDecoded =
  | {
      ok: true;
      owner: PublicKey;
      maxDeployedFractionBp: number;
      deployedAmount: bigint;
      bump: number;
    }
  | { ok: false; reason: string };

/**
 * Decode the raw bytes of a Vault account. Returns a tagged union so callers
 * can distinguish a foreign account at the PDA from a real Vault without
 * throwing.
 */
export function decodeVault(data: Buffer): VaultDecoded {
  if (data.length !== VAULT_DATA_LEN) {
    return { ok: false, reason: `unexpected data length ${data.length}, want ${VAULT_DATA_LEN}` };
  }
  if (!data.subarray(0, 8).equals(VAULT_ACCOUNT_DISCRIMINATOR)) {
    return { ok: false, reason: "discriminator mismatch (not a klink Vault)" };
  }
  return {
    ok: true,
    owner: new PublicKey(data.subarray(8, 40)),
    maxDeployedFractionBp: data.readUInt16LE(40),
    deployedAmount: data.readBigUInt64LE(42),
    bump: data[50] as number,
  };
}

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
export type AccountInfoFetcher = (
  pk: PublicKey,
) => Promise<{ owner: PublicKey; data: Buffer } | null>;

export interface MakePostWalletDeps {
  blockhash?: BlockhashFetcher;
  programId?: ProgramIdResolver;
  usdcMint?: UsdcMintResolver;
  /** Test seam: override how the on-chain vault account is fetched. */
  accountInfo?: AccountInfoFetcher;
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
  const fetchAccountInfo: AccountInfoFetcher =
    deps.accountInfo ??
    (async (pk: PublicKey) => {
      const conn = new Connection(envOrThrow("SOLANA_RPC_URL"), "confirmed");
      const info = await conn.getAccountInfo(pk, "confirmed");
      if (!info) return null;
      return { owner: info.owner, data: Buffer.from(info.data) };
    });

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

    let programId: PublicKey;
    let usdcMint: PublicKey;
    try {
      programId = getProgramId();
      usdcMint = getUsdcMint();
    } catch (err) {
      console.error("[POST /v1/wallet] config error:", err);
      res.status(500).json({ error: "server misconfigured" });
      return;
    }

    const [vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), owner.toBuffer()],
      programId,
    );
    // `allowOwnerOffCurve = true` because the vault PDA is off-curve.
    const vaultUsdcAta = getAssociatedTokenAddressSync(usdcMint, vaultPda, true);

    let onChain: { owner: PublicKey; data: Buffer } | null;
    try {
      onChain = await fetchAccountInfo(vaultPda);
    } catch (err) {
      console.error("[POST /v1/wallet] getAccountInfo failed:", err);
      res.status(503).json({ error: "rpc unavailable" });
      return;
    }

    if (onChain) {
      // Vault PDA is already initialized on-chain. The build-tx path would
      // hand the dashboard a doomed `init_vault` tx (System CPI returns
      // AccountAlreadyInUse). Validate this is really our Vault and backfill
      // the wallets row if it's missing, so the next GET /v1/wallet reads
      // the correct addresses.
      if (!onChain.owner.equals(programId)) {
        console.error(
          "[POST /v1/wallet] vault PDA owned by foreign program:",
          onChain.owner.toBase58(),
        );
        res.status(409).json({ error: "vault PDA exists but is owned by a different program" });
        return;
      }
      const decoded = decodeVault(onChain.data);
      if (!decoded.ok) {
        console.error("[POST /v1/wallet] vault decode failed:", decoded.reason);
        res.status(409).json({ error: "vault PDA exists but is not a klink Vault account" });
        return;
      }
      // PDA seeds bind the address to `owner`, so a mismatch here would
      // imply the program emitted a wrong owner field — treat as corrupt.
      if (!decoded.owner.equals(owner)) {
        console.error(
          "[POST /v1/wallet] vault.owner mismatch:",
          decoded.owner.toBase58(),
          "vs request owner",
          owner.toBase58(),
        );
        res.status(409).json({ error: "vault owner mismatch" });
        return;
      }

      const db = getDb();
      // The JWT's user id may be stale (DB rotation after the JWT was minted).
      // Resolve from pubkey and create the users row if needed so the wallets
      // INSERT below doesn't fail on the user_id FK.
      const resolvedUserId = await resolveUserIdFromPubkey(db, userPubkey, { autoCreate: true });
      if (!resolvedUserId) {
        console.error("[POST /v1/wallet] failed to resolve user id for pubkey", userPubkey);
        res.status(500).json({ error: "failed to resolve user" });
        return;
      }
      // `vault_pda` is UNIQUE, so concurrent self-heal calls for the same
      // owner are safe: the second insert is dropped, and the re-select
      // returns whichever row landed.
      await db
        .insert(wallets)
        .values({
          userId: resolvedUserId,
          vaultPda: vaultPda.toBase58(),
          usdcAta: vaultUsdcAta.toBase58(),
          maxDeployedFractionBp: decoded.maxDeployedFractionBp,
        })
        .onConflictDoNothing({ target: wallets.vaultPda });

      const existing = await db
        .select({
          id: wallets.id,
          vaultPda: wallets.vaultPda,
          usdcAta: wallets.usdcAta,
          maxDeployedFractionBp: wallets.maxDeployedFractionBp,
          createdAt: wallets.createdAt,
        })
        .from(wallets)
        .where(eq(wallets.vaultPda, vaultPda.toBase58()))
        .limit(1);
      const row = existing[0];

      res.json({
        alreadyExists: true,
        walletId: row?.id ?? null,
        vaultPda: vaultPda.toBase58(),
        vaultUsdcAta: vaultUsdcAta.toBase58(),
        maxDeployedFractionBp: decoded.maxDeployedFractionBp,
        createdAt: row?.createdAt ?? null,
      });
      return;
    }

    // No on-chain vault — build the unsigned init_vault tx for Phantom.
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
        programId,
        usdcMint,
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
      alreadyExists: false,
      txBase64,
      vaultPda: built.vaultPda.toBase58(),
      vaultUsdcAta: built.vaultUsdcAta.toBase58(),
    });
  };
}

export const postWalletHandler = makePostWalletHandler();

// ---------------------------------------------------------------------------
// T-224 — GET /v1/wallet
//
// Reads the wallet row owned by the authenticated user. 404 when no wallet
// exists yet (signals overview to show the "Create wallet" CTA). Single
// wallet per user in MVP; if multiple, returns the most recent.
// ---------------------------------------------------------------------------

export async function getWalletHandler(req: Request, res: Response): Promise<void> {
  const userPubkey = req.user?.pubkey;
  if (!userPubkey) {
    res.status(401).json({ error: "auth required" });
    return;
  }
  const db = getDb();
  // Resolve users.id from pubkey rather than trusting the JWT's `sub` —
  // survives DB rotations where the JWT carries an id that no longer exists.
  const resolvedUserId = await resolveUserIdFromPubkey(db, userPubkey, { autoCreate: false });
  if (!resolvedUserId) {
    console.log(`[GET /v1/wallet] no users row for pubkey=${userPubkey} → 404`);
    res.status(404).json({ error: "wallet not found" });
    return;
  }
  const rows = await db
    .select({
      id: wallets.id,
      vaultPda: wallets.vaultPda,
      usdcAta: wallets.usdcAta,
      maxDeployedFractionBp: wallets.maxDeployedFractionBp,
      createdAt: wallets.createdAt,
    })
    .from(wallets)
    .where(eq(wallets.userId, resolvedUserId))
    .orderBy(desc(wallets.createdAt))
    .limit(1);
  const row = rows[0];
  if (!row) {
    console.log(`[GET /v1/wallet] no wallet row for resolvedUserId=${resolvedUserId}`);
    res.status(404).json({ error: "wallet not found" });
    return;
  }
  // Snapshot the field shapes so we can spot a Date-vs-string mismatch or a
  // null where the dashboard schema expects a string.
  console.log("[GET /v1/wallet] row types:", {
    id: typeof row.id,
    vaultPda: typeof row.vaultPda,
    usdcAta: typeof row.usdcAta,
    maxDeployedFractionBp: typeof row.maxDeployedFractionBp,
    createdAt: row.createdAt instanceof Date ? "Date" : typeof row.createdAt,
    createdAtPreview: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
  });
  res.json({
    id: row.id,
    vaultPda: row.vaultPda,
    usdcAta: row.usdcAta,
    maxDeployedFractionBp: row.maxDeployedFractionBp,
    ownerPubkey: userPubkey,
    createdAt: row.createdAt,
  });
}

// ---------------------------------------------------------------------------
// T-221 — POST /v1/wallet/policy
//
// Builds the unsigned `set_max_deployed_fraction` tx for the owner's Phantom
// to sign + submit. The on-chain instruction is owner-only; we only mint the
// tx, never sign for the owner.
// ---------------------------------------------------------------------------

interface WalletPolicyBody {
  max_deployed_fraction_bp: number;
  /** Optional — defaults to the caller's most-recent wallet (single-wallet MVP). */
  wallet_id?: string;
}

interface PolicyValidationError {
  ok: false;
  status: number;
  body: { error: string };
}

function parseWalletPolicyBody(
  raw: unknown,
): { ok: true; body: WalletPolicyBody } | PolicyValidationError {
  if (!raw || typeof raw !== "object") {
    return { ok: false, status: 400, body: { error: "request body must be JSON object" } };
  }
  const b = raw as Record<string, unknown>;
  const bp = b.max_deployed_fraction_bp;
  if (typeof bp !== "number" || !Number.isInteger(bp) || bp < 0 || bp > MAX_BP) {
    return {
      ok: false,
      status: 400,
      body: { error: `max_deployed_fraction_bp must be integer in 0..=${MAX_BP}` },
    };
  }
  if (b.wallet_id !== undefined && typeof b.wallet_id !== "string") {
    return { ok: false, status: 400, body: { error: "wallet_id must be string if provided" } };
  }
  return {
    ok: true,
    body: {
      max_deployed_fraction_bp: bp,
      wallet_id: b.wallet_id as string | undefined,
    },
  };
}

export interface MakePostWalletPolicyDeps {
  blockhash?: BlockhashFetcher;
}

export function makePostWalletPolicyHandler(deps: MakePostWalletPolicyDeps = {}) {
  const getBlockhash =
    deps.blockhash ??
    (async () => {
      const conn = new Connection(envOrThrow("SOLANA_RPC_URL"), "confirmed");
      const { blockhash } = await conn.getLatestBlockhash("finalized");
      return blockhash;
    });

  return async function postWalletPolicy(req: Request, res: Response): Promise<void> {
    const userId = req.user?.id;
    const userPubkey = req.user?.pubkey;
    if (!userId || !userPubkey) {
      res.status(401).json({ error: "auth required" });
      return;
    }

    const parsed = parseWalletPolicyBody(req.body);
    if (!parsed.ok) {
      res.status(parsed.status).json(parsed.body);
      return;
    }
    const body = parsed.body;

    let owner: PublicKey;
    try {
      owner = new PublicKey(userPubkey);
    } catch {
      res.status(400).json({ error: "invalid owner pubkey on jwt" });
      return;
    }

    const db = getDb();
    const where = body.wallet_id
      ? and(eq(wallets.userId, userId), eq(wallets.id, body.wallet_id))
      : eq(wallets.userId, userId);
    const rows = await db
      .select({ id: wallets.id, vaultPda: wallets.vaultPda })
      .from(wallets)
      .where(where)
      .orderBy(desc(wallets.createdAt))
      .limit(1);
    const row = rows[0];
    if (!row) {
      res.status(404).json({ error: "wallet not found" });
      return;
    }

    let recentBlockhash: string;
    try {
      recentBlockhash = await getBlockhash();
    } catch (err) {
      console.error("[POST /v1/wallet/policy] rpc unavailable:", err);
      res.status(503).json({ error: "rpc unavailable" });
      return;
    }

    const ix = buildSetMaxDeployedFractionIx({ owner, bp: body.max_deployed_fraction_bp });
    const tx = new Transaction({ feePayer: owner, recentBlockhash });
    tx.add(ix);
    const txBase64 = serializeUnsignedTx(tx);

    res.json({
      txBase64,
      walletId: row.id,
      vaultPda: row.vaultPda,
      maxDeployedFractionBp: body.max_deployed_fraction_bp,
    });
  };
}

export const postWalletPolicyHandler = makePostWalletPolicyHandler();

// ---------------------------------------------------------------------------
// T-223 — PATCH /v1/wallet/off-chain-policy
//
// UPSERT into off_chain_policies (PK = wallet_id). Validates wildcard rules
// from spec §3.3.1: host wildcards rejected, only path-segment wildcards
// allowed. Time window has start_min ≤ end_min and bounded 0..=1440.
// ---------------------------------------------------------------------------

interface AllowedUrlEntry {
  pattern: string;
  max_per_call?: number;
}

interface OffChainPolicyBody {
  wallet_id?: string;
  allowed_urls?: AllowedUrlEntry[];
  time_window_start_min?: number;
  time_window_end_min?: number;
  time_window_dow_bitmask?: number;
  timezone?: string;
}

/**
 * Spec §3.3.1: wildcards restricted to path segments only — no host
 * wildcards. The pattern's host must equal the URL's host exactly. We
 * enforce that here as a write-side guard so bad patterns can't reach the
 * runtime matcher in `policy/off-chain.ts`.
 */
export function validateAllowedUrlPattern(pattern: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(pattern);
  } catch {
    return "pattern must be a valid URL";
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return "pattern must use http:// or https://";
  }
  // Wildcards in host part — disallowed. URL parser accepts `*.example.com`
  // as a hostname, so explicit substring check is needed.
  if (parsed.host.includes("*")) {
    return "host wildcards not allowed (pattern host must be a literal domain)";
  }
  // Path wildcards: only standalone `*` segments allowed (e.g. /v1/*/users).
  // Mid-segment patterns like /v1/u*ers or /v1/*ser are rejected.
  for (const seg of parsed.pathname.split("/").filter(Boolean)) {
    if (seg.includes("*") && seg !== "*") {
      return `path wildcards must be standalone '*' segments (got '${seg}')`;
    }
  }
  return null;
}

function parseOffChainPolicyBody(
  raw: unknown,
): { ok: true; body: OffChainPolicyBody } | PolicyValidationError {
  if (!raw || typeof raw !== "object") {
    return { ok: false, status: 400, body: { error: "request body must be JSON object" } };
  }
  const b = raw as Record<string, unknown>;
  const out: OffChainPolicyBody = {};

  if (b.wallet_id !== undefined) {
    if (typeof b.wallet_id !== "string" || !b.wallet_id) {
      return { ok: false, status: 400, body: { error: "wallet_id must be non-empty string" } };
    }
    out.wallet_id = b.wallet_id;
  }

  if (b.allowed_urls !== undefined) {
    if (!Array.isArray(b.allowed_urls)) {
      return { ok: false, status: 400, body: { error: "allowed_urls must be array" } };
    }
    const entries: AllowedUrlEntry[] = [];
    for (const e of b.allowed_urls) {
      if (!e || typeof e !== "object") {
        return {
          ok: false,
          status: 400,
          body: { error: "allowed_urls entries must be objects" },
        };
      }
      const eo = e as Record<string, unknown>;
      if (typeof eo.pattern !== "string" || !eo.pattern) {
        return {
          ok: false,
          status: 400,
          body: { error: "allowed_urls entry missing 'pattern' string" },
        };
      }
      const reason = validateAllowedUrlPattern(eo.pattern);
      if (reason) {
        return {
          ok: false,
          status: 400,
          body: { error: `invalid pattern '${eo.pattern}': ${reason}` },
        };
      }
      const entry: AllowedUrlEntry = { pattern: eo.pattern };
      if (eo.max_per_call !== undefined) {
        if (
          typeof eo.max_per_call !== "number" ||
          !Number.isInteger(eo.max_per_call) ||
          eo.max_per_call < 0
        ) {
          return {
            ok: false,
            status: 400,
            body: { error: "max_per_call must be non-negative integer" },
          };
        }
        entry.max_per_call = eo.max_per_call;
      }
      entries.push(entry);
    }
    out.allowed_urls = entries;
  }

  for (const f of ["time_window_start_min", "time_window_end_min"] as const) {
    if (b[f] === undefined) continue;
    const v = b[f];
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > 1440) {
      return { ok: false, status: 400, body: { error: `${f} must be integer 0..=1440` } };
    }
    out[f] = v;
  }
  if (
    out.time_window_start_min !== undefined &&
    out.time_window_end_min !== undefined &&
    out.time_window_start_min > out.time_window_end_min
  ) {
    return {
      ok: false,
      status: 400,
      body: { error: "time_window_start_min must be ≤ time_window_end_min" },
    };
  }

  if (b.time_window_dow_bitmask !== undefined) {
    const v = b.time_window_dow_bitmask;
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > 127) {
      return {
        ok: false,
        status: 400,
        body: { error: "time_window_dow_bitmask must be integer 0..=127" },
      };
    }
    out.time_window_dow_bitmask = v;
  }

  if (b.timezone !== undefined) {
    if (typeof b.timezone !== "string" || !b.timezone) {
      return { ok: false, status: 400, body: { error: "timezone must be non-empty string" } };
    }
    // Cheap sanity check: Intl.DateTimeFormat throws on bad zones.
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: b.timezone });
    } catch {
      return { ok: false, status: 400, body: { error: `unknown timezone '${b.timezone}'` } };
    }
    out.timezone = b.timezone;
  }

  return { ok: true, body: out };
}

export async function patchOffChainPolicyHandler(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: "auth required" });
    return;
  }

  const parsed = parseOffChainPolicyBody(req.body);
  if (!parsed.ok) {
    res.status(parsed.status).json(parsed.body);
    return;
  }
  const body = parsed.body;

  const db = getDb();
  const where = body.wallet_id
    ? and(eq(wallets.userId, userId), eq(wallets.id, body.wallet_id))
    : eq(wallets.userId, userId);
  const wRows = await db
    .select({ id: wallets.id })
    .from(wallets)
    .where(where)
    .orderBy(desc(wallets.createdAt))
    .limit(1);
  const wallet = wRows[0];
  if (!wallet) {
    res.status(404).json({ error: "wallet not found" });
    return;
  }

  // Read current row so partial updates merge cleanly. Using read-then-upsert
  // here is fine — there's at most one writer per wallet (the owner).
  const existing = await db
    .select({
      allowedUrls: offChainPolicies.allowedUrls,
      timeWindowStartMin: offChainPolicies.timeWindowStartMin,
      timeWindowEndMin: offChainPolicies.timeWindowEndMin,
      timeWindowDowBitmask: offChainPolicies.timeWindowDowBitmask,
      timezone: offChainPolicies.timezone,
    })
    .from(offChainPolicies)
    .where(eq(offChainPolicies.walletId, wallet.id))
    .limit(1);
  const current = existing[0];

  const merged = {
    walletId: wallet.id,
    allowedUrls: body.allowed_urls ?? current?.allowedUrls ?? [],
    timeWindowStartMin: body.time_window_start_min ?? current?.timeWindowStartMin ?? 0,
    timeWindowEndMin: body.time_window_end_min ?? current?.timeWindowEndMin ?? 1440,
    timeWindowDowBitmask: body.time_window_dow_bitmask ?? current?.timeWindowDowBitmask ?? 127,
    timezone: body.timezone ?? current?.timezone ?? "UTC",
  };

  // Cross-field validation post-merge — start ≤ end must hold even when only
  // one side was provided in this request.
  if (merged.timeWindowStartMin > merged.timeWindowEndMin) {
    res.status(400).json({
      error: "time_window_start_min must be ≤ time_window_end_min after merge",
    });
    return;
  }

  await db
    .insert(offChainPolicies)
    .values(merged)
    .onConflictDoUpdate({
      target: offChainPolicies.walletId,
      set: {
        allowedUrls: merged.allowedUrls,
        timeWindowStartMin: merged.timeWindowStartMin,
        timeWindowEndMin: merged.timeWindowEndMin,
        timeWindowDowBitmask: merged.timeWindowDowBitmask,
        timezone: merged.timezone,
      },
    });

  res.json({
    walletId: merged.walletId,
    allowedUrls: merged.allowedUrls,
    timeWindowStartMin: merged.timeWindowStartMin,
    timeWindowEndMin: merged.timeWindowEndMin,
    timeWindowDowBitmask: merged.timeWindowDowBitmask,
    timezone: merged.timezone,
  });
}

// ---------------------------------------------------------------------------
// T-235 — POST /v1/wallet/transfer (owner escape-hatch)
//
// Builds an unsigned `owner_transfer_usdc` tx for the dashboard's emergency
// drain flow. The on-chain instruction (T-116) is owner-only and bypasses
// every session policy gate — the only authorization is `has_one = owner`
// on the Vault PDA. This route mirrors that posture: dashboard JWT only,
// validates wallet ownership, builds the tx with `feePayer = owner`,
// returns `{ txBase64 }` for Phantom to sign + submit.
//
// Recipient ATA: created idempotently inside the tx so the owner can drain
// to any pubkey (even one without a USDC ATA) in a single Phantom prompt.
// The `createAssociatedTokenAccountIdempotentInstruction` is a no-op when
// the ATA already exists, so we don't need a pre-flight existence check.
//
// Until the devnet binary is redeployed (T-116 runbook in
// docs/runbooks/devnet-deploys.md), calls will revert with the
// `instruction not found` error from the program loader. That's expected
// and documented; backend code merges first, redeploy second.
// ---------------------------------------------------------------------------

interface WalletTransferBody {
  amount: number;
  recipient: string;
  /** Optional — defaults to caller's most-recent wallet (single-wallet MVP). */
  wallet_id?: string;
}

function parseWalletTransferBody(
  raw: unknown,
):
  | { ok: true; amount: bigint; recipient: PublicKey; walletId: string | undefined }
  | PolicyValidationError {
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
  if (typeof b.recipient !== "string" || !b.recipient) {
    return { ok: false, status: 400, body: { error: "recipient must be non-empty string" } };
  }
  let recipient: PublicKey;
  try {
    recipient = new PublicKey(b.recipient);
  } catch {
    return { ok: false, status: 400, body: { error: "recipient is not a valid base58 pubkey" } };
  }
  if (b.wallet_id !== undefined && typeof b.wallet_id !== "string") {
    return { ok: false, status: 400, body: { error: "wallet_id must be string if provided" } };
  }
  return {
    ok: true,
    amount: BigInt(Math.trunc(b.amount)),
    recipient,
    walletId: b.wallet_id as string | undefined,
  };
}

export interface MakePostWalletTransferDeps {
  blockhash?: BlockhashFetcher;
  usdcMint?: UsdcMintResolver;
}

export function makePostWalletTransferHandler(deps: MakePostWalletTransferDeps = {}) {
  const getBlockhash =
    deps.blockhash ??
    (async () => {
      const conn = new Connection(envOrThrow("SOLANA_RPC_URL"), "confirmed");
      const { blockhash } = await conn.getLatestBlockhash("finalized");
      return blockhash;
    });
  const getUsdcMint = deps.usdcMint ?? (() => new PublicKey(envOrThrow("USDC_MINT")));

  return async function postWalletTransfer(req: Request, res: Response): Promise<void> {
    const userId = req.user?.id;
    const userPubkey = req.user?.pubkey;
    if (!userId || !userPubkey) {
      res.status(401).json({ error: "auth required" });
      return;
    }

    const parsed = parseWalletTransferBody(req.body);
    if (!parsed.ok) {
      res.status(parsed.status).json(parsed.body);
      return;
    }

    let owner: PublicKey;
    let usdcMint: PublicKey;
    try {
      owner = new PublicKey(userPubkey);
      usdcMint = getUsdcMint();
    } catch (err) {
      console.error("[POST /v1/wallet/transfer] config error:", err);
      res.status(500).json({ error: "server misconfigured" });
      return;
    }

    const db = getDb();
    const where = parsed.walletId
      ? and(eq(wallets.userId, userId), eq(wallets.id, parsed.walletId))
      : eq(wallets.userId, userId);
    const rows = await db
      .select({ id: wallets.id, vaultPda: wallets.vaultPda, usdcAta: wallets.usdcAta })
      .from(wallets)
      .where(where)
      .orderBy(desc(wallets.createdAt))
      .limit(1);
    const wallet = rows[0];
    if (!wallet) {
      res.status(404).json({ error: "wallet not found" });
      return;
    }

    let vault: PublicKey;
    let vaultUsdcAta: PublicKey;
    try {
      vault = new PublicKey(wallet.vaultPda);
      vaultUsdcAta = new PublicKey(wallet.usdcAta);
    } catch (err) {
      console.error("[POST /v1/wallet/transfer] address parse failed:", err);
      res.status(500).json({ error: "stored wallet addresses invalid" });
      return;
    }

    // Recipient ATA — receiver is a regular wallet (not a PDA), so
    // allowOwnerOffCurve = false. If the owner ever passes a PDA as the
    // recipient that's a self-foot-shoot worth surfacing as an error.
    const recipientUsdcAta = getAssociatedTokenAddressSync(usdcMint, parsed.recipient);

    let recentBlockhash: string;
    try {
      recentBlockhash = await getBlockhash();
    } catch (err) {
      console.error("[POST /v1/wallet/transfer] rpc unavailable:", err);
      res.status(503).json({ error: "rpc unavailable" });
      return;
    }

    // Idempotent ATA creation — no-op when the ATA already exists, but
    // keeps the drain working even when the recipient has never held USDC.
    const createAtaIx = createAssociatedTokenAccountIdempotentInstruction(
      owner, // payer
      recipientUsdcAta,
      parsed.recipient,
      usdcMint,
    );

    const transferIx = buildOwnerTransferUsdcIx({
      owner,
      vault,
      vaultUsdcAta,
      recipientUsdcAta,
      amount: parsed.amount,
      tokenProgramId: TOKEN_PROGRAM_ID,
    });

    const tx = new Transaction({ feePayer: owner, recentBlockhash });
    tx.add(createAtaIx, transferIx);
    const txBase64 = serializeUnsignedTx(tx);

    res.json({
      txBase64,
      walletId: wallet.id,
      vaultPda: wallet.vaultPda,
      vaultUsdcAta: wallet.usdcAta,
      recipient: parsed.recipient.toBase58(),
      recipientUsdcAta: recipientUsdcAta.toBase58(),
      amount: parsed.amount.toString(),
    });
  };
}

export const postWalletTransferHandler = makePostWalletTransferHandler();
