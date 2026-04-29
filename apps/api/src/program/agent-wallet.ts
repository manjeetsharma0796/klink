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
