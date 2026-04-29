import { createHash } from "node:crypto";
import {
  PublicKey,
  SystemProgram,
  type Transaction,
  TransactionInstruction,
} from "@solana/web3.js";

/**
 * On-chain `agent_wallet` Anchor program (T-102+ / @Prithwish).
 *
 * No IDL is committed to the repo, so this module hand-builds the one
 * instruction the backend needs (`add_session`) using Anchor's well-known
 * conventions:
 *   - 8-byte discriminator = sha256("global:<instruction_name>")[0..8]
 *   - Args are Borsh-encoded directly after the discriminator
 *   - PDAs use the seed strings declared in the rust source
 *
 * Source of truth: `programs/agent_wallet/src/lib.rs` and `instructions/*.rs`.
 * If Prithwish renames an instruction or changes a seed, this module has to
 * update in lockstep.
 */

export const PROGRAM_ID = new PublicKey("5qCJCEhfLusk59YFqaEG9Yg3Wp64ZaYwvXteFmCmedqv");

export const VAULT_SEED = Buffer.from("vault");
export const SESSION_SEED = Buffer.from("session");

/** Maximum recipient slots in a session — matches Vec<Pubkey> length cap on chain (state.rs MAX_RECIPIENTS = 10). */
export const MAX_ALLOWED_RECIPIENTS = 10;

/** sha256("global:<name>")[0..8] — Anchor's instruction discriminator scheme. */
export function instructionDiscriminator(name: string): Buffer {
  return createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

export function deriveVaultPda(owner: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([VAULT_SEED, owner.toBuffer()], PROGRAM_ID);
}

export function deriveSessionPda(vault: PublicKey, sessionPubkey: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SESSION_SEED, vault.toBuffer(), sessionPubkey.toBuffer()],
    PROGRAM_ID,
  );
}

export interface AddSessionArgs {
  sessionPubkey: PublicKey;
  maxPerTx: bigint;
  dailyCap: bigint;
  /** Unix seconds; 0 = never expires. */
  expiry: bigint;
  allowedRecipients: PublicKey[];
  allowedInstructions: number;
}

/** Borsh-encode the args of `add_session(...)`. Layout matches the rust signature exactly. */
export function encodeAddSessionArgs(args: AddSessionArgs): Buffer {
  if (args.allowedRecipients.length > MAX_ALLOWED_RECIPIENTS) {
    throw new Error(
      `add_session: allowed_recipients length ${args.allowedRecipients.length} exceeds MAX_RECIPIENTS=${MAX_ALLOWED_RECIPIENTS}`,
    );
  }

  const recipientsBytes = args.allowedRecipients.length * 32;
  const buf = Buffer.alloc(32 + 8 + 8 + 8 + 4 + recipientsBytes + 4);
  let offset = 0;
  args.sessionPubkey.toBuffer().copy(buf, offset);
  offset += 32;
  buf.writeBigUInt64LE(args.maxPerTx, offset);
  offset += 8;
  buf.writeBigUInt64LE(args.dailyCap, offset);
  offset += 8;
  buf.writeBigInt64LE(args.expiry, offset);
  offset += 8;
  buf.writeUInt32LE(args.allowedRecipients.length, offset);
  offset += 4;
  for (const r of args.allowedRecipients) {
    r.toBuffer().copy(buf, offset);
    offset += 32;
  }
  buf.writeUInt32LE(args.allowedInstructions, offset);
  return buf;
}

export interface BuildAddSessionIxOpts extends AddSessionArgs {
  /** Pays rent for the new session account. Almost always = `owner` (rent-payer model). */
  payer: PublicKey;
  /** Vault owner — must match `vault.owner` on chain. Signs to authorize. */
  owner: PublicKey;
}

export function buildAddSessionIx(opts: BuildAddSessionIxOpts): TransactionInstruction {
  const [vault] = deriveVaultPda(opts.owner);
  const [session] = deriveSessionPda(vault, opts.sessionPubkey);

  const data = Buffer.concat([
    instructionDiscriminator("add_session"),
    encodeAddSessionArgs({
      sessionPubkey: opts.sessionPubkey,
      maxPerTx: opts.maxPerTx,
      dailyCap: opts.dailyCap,
      expiry: opts.expiry,
      allowedRecipients: opts.allowedRecipients,
      allowedInstructions: opts.allowedInstructions,
    }),
  ]);

  // Account meta order matches the rust `AddSession<'info>` struct exactly.
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: opts.payer, isSigner: true, isWritable: true },
      { pubkey: opts.owner, isSigner: true, isWritable: false },
      { pubkey: vault, isSigner: false, isWritable: false },
      { pubkey: session, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

/**
 * Serialize an unsigned tx for the dashboard / Phantom to sign + submit.
 * Phantom needs all required signers populated (even if their signature is
 * still empty) so it can identify which key it should sign with.
 */
export function serializeUnsignedTx(tx: Transaction): string {
  return tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64");
}

// ---------------------------------------------------------------------------
// revoke_session — T-207
// ---------------------------------------------------------------------------

export interface BuildRevokeSessionIxOpts {
  owner: PublicKey;
  /** The session keypair's pubkey (not the DB UUID). Used to derive the session PDA. */
  sessionPubkey: PublicKey;
}

export function buildRevokeSessionIx(opts: BuildRevokeSessionIxOpts): TransactionInstruction {
  const [vault] = deriveVaultPda(opts.owner);
  const [session] = deriveSessionPda(vault, opts.sessionPubkey);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      // Order matches RevokeSession<'info>:
      // 1. owner (signer + writable — receives rent refund via close = owner)
      // 2. vault (read-only)
      // 3. session (writable + closed by `close = owner`)
      { pubkey: opts.owner, isSigner: true, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: false },
      { pubkey: session, isSigner: false, isWritable: true },
    ],
    data: instructionDiscriminator("revoke_session"),
  });
}

// ---------------------------------------------------------------------------
// update_session_allowlist — T-207
// ---------------------------------------------------------------------------

/** Matches the rust `AllowlistAction` enum. Variant indices follow declaration order. */
export const ALLOWLIST_ACTION = { Add: 0, Remove: 1, Set: 2 } as const;
export type AllowlistAction = keyof typeof ALLOWLIST_ACTION;

export interface UpdateSessionAllowlistArgs {
  action: AllowlistAction;
  /** `null` / undefined = leave recipients alone. */
  recipients?: PublicKey[] | null;
  /** `null` / undefined = leave bitmap alone. */
  instructionsBitmap?: number | null;
}

/** Borsh-encode `Option<T>` as 0x00 (None) or 0x01 + value bytes (Some). */
function encodeOption(present: boolean, valueWriter: (out: Buffer[]) => void): Buffer {
  if (!present) return Buffer.from([0]);
  const out: Buffer[] = [Buffer.from([1])];
  valueWriter(out);
  return Buffer.concat(out);
}

export function encodeUpdateSessionAllowlistArgs(args: UpdateSessionAllowlistArgs): Buffer {
  if (args.recipients && args.recipients.length > MAX_ALLOWED_RECIPIENTS) {
    throw new Error(
      `update_session_allowlist: recipients length ${args.recipients.length} exceeds MAX_RECIPIENTS=${MAX_ALLOWED_RECIPIENTS}`,
    );
  }
  const actionByte = Buffer.from([ALLOWLIST_ACTION[args.action]]);

  const recipientsBuf = encodeOption(args.recipients != null, (out) => {
    const list = args.recipients ?? [];
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32LE(list.length, 0);
    out.push(lenBuf);
    for (const r of list) out.push(Buffer.from(r.toBuffer()));
  });

  const bitmapBuf = encodeOption(args.instructionsBitmap != null, (out) => {
    const v = args.instructionsBitmap ?? 0;
    if (v < 0 || v > 0xffff_ffff) {
      throw new Error("instructionsBitmap out of u32 range");
    }
    const b = Buffer.alloc(4);
    b.writeUInt32LE(v, 0);
    out.push(b);
  });

  return Buffer.concat([actionByte, recipientsBuf, bitmapBuf]);
}

export interface BuildUpdateSessionAllowlistIxOpts extends UpdateSessionAllowlistArgs {
  owner: PublicKey;
  sessionPubkey: PublicKey;
}

export function buildUpdateSessionAllowlistIx(
  opts: BuildUpdateSessionAllowlistIxOpts,
): TransactionInstruction {
  const [vault] = deriveVaultPda(opts.owner);
  const [session] = deriveSessionPda(vault, opts.sessionPubkey);
  const data = Buffer.concat([
    instructionDiscriminator("update_session_allowlist"),
    encodeUpdateSessionAllowlistArgs(opts),
  ]);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      // Order matches UpdateSessionAllowlist<'info>:
      // 1. owner (signer, NOT writable)
      // 2. vault (read-only)
      // 3. session (writable, has_one vault)
      { pubkey: opts.owner, isSigner: true, isWritable: false },
      { pubkey: vault, isSigner: false, isWritable: false },
      { pubkey: session, isSigner: false, isWritable: true },
    ],
    data,
  });
}

// ---------------------------------------------------------------------------
// transfer_usdc — T-210
// ---------------------------------------------------------------------------

export interface BuildTransferUsdcIxOpts {
  /** Backend-held session keypair pubkey — signs the tx. */
  sessionSigner: PublicKey;
  /** Vault PDA. From DB `wallets.vault_pda`. */
  vault: PublicKey;
  /** Vault's USDC ATA. From DB `wallets.usdc_ata`. */
  vaultUsdcAta: PublicKey;
  /** Recipient pubkey (allowlist-checked off-chain + on-chain). */
  recipient: PublicKey;
  /** Recipient's USDC ATA. Computed via getAssociatedTokenAddressSync. */
  recipientUsdcAta: PublicKey;
  /** USDC base units. */
  amount: bigint;
  /** SPL Token program id. From @solana/spl-token. */
  tokenProgramId: PublicKey;
  /** Session keypair pubkey — used to derive the session PDA. */
  sessionPubkey: PublicKey;
}

export function encodeTransferUsdcArgs(amount: bigint, recipient: PublicKey): Buffer {
  const buf = Buffer.alloc(8 + 32);
  buf.writeBigUInt64LE(amount, 0);
  recipient.toBuffer().copy(buf, 8);
  return buf;
}

export function buildTransferUsdcIx(opts: BuildTransferUsdcIxOpts): TransactionInstruction {
  const [session] = deriveSessionPda(opts.vault, opts.sessionPubkey);

  const data = Buffer.concat([
    instructionDiscriminator("transfer_usdc"),
    encodeTransferUsdcArgs(opts.amount, opts.recipient),
  ]);

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      // Order matches TransferUsdc<'info>:
      // 1. session_signer (signer, NOT writable)
      // 2. session (writable; daily_spent + window updated)
      // 3. vault (read-only)
      // 4. vault_usdc_ata (writable; CPI source)
      // 5. recipient_usdc_ata (writable; CPI destination)
      // 6. token_program
      { pubkey: opts.sessionSigner, isSigner: true, isWritable: false },
      { pubkey: session, isSigner: false, isWritable: true },
      { pubkey: opts.vault, isSigner: false, isWritable: false },
      { pubkey: opts.vaultUsdcAta, isSigner: false, isWritable: true },
      { pubkey: opts.recipientUsdcAta, isSigner: false, isWritable: true },
      { pubkey: opts.tokenProgramId, isSigner: false, isWritable: false },
    ],
    data,
  });
}
