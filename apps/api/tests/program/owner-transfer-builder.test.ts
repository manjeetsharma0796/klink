import { describe, expect, it } from "bun:test";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  buildOwnerTransferUsdcIx,
  instructionDiscriminator,
} from "../../src/program/agent-wallet";

/**
 * T-116 / T-235: tests for the `owner_transfer_usdc` tx builder.
 * Pin the wire format so a future refactor can't silently break the
 * dashboard's "Danger zone — emergency drain" flow.
 *
 * Source of truth on chain: `programs/agent_wallet/src/instructions/owner_transfer_usdc.rs`.
 */

const PROGRAM_ID = new PublicKey("5qCJCEhfLusk59YFqaEG9Yg3Wp64ZaYwvXteFmCmedqv");

function fixtures() {
  const owner = Keypair.generate().publicKey;
  const vault = Keypair.generate().publicKey;
  const vaultUsdcAta = Keypair.generate().publicKey;
  const recipientUsdcAta = Keypair.generate().publicKey;
  return { owner, vault, vaultUsdcAta, recipientUsdcAta };
}

describe("buildOwnerTransferUsdcIx", () => {
  it("emits a 16-byte data buffer (8 disc + 8 amount)", () => {
    const f = fixtures();
    const ix = buildOwnerTransferUsdcIx({
      ...f,
      amount: 0n,
      tokenProgramId: TOKEN_PROGRAM_ID,
    });
    expect(ix.data.length).toBe(16);
  });

  it("encodes amount as u64 LE in bytes 8..16", () => {
    const f = fixtures();
    const amount = 1_234_567_890n;
    const ix = buildOwnerTransferUsdcIx({
      ...f,
      amount,
      tokenProgramId: TOKEN_PROGRAM_ID,
    });
    expect(ix.data.readBigUInt64LE(8)).toBe(amount);
  });

  it("uses sha256('global:owner_transfer_usdc')[0..8] as the discriminator", () => {
    const f = fixtures();
    const ix = buildOwnerTransferUsdcIx({
      ...f,
      amount: 1n,
      tokenProgramId: TOKEN_PROGRAM_ID,
    });
    expect(ix.data.subarray(0, 8).equals(instructionDiscriminator("owner_transfer_usdc"))).toBe(
      true,
    );
  });

  it("targets the agent_wallet program id", () => {
    const f = fixtures();
    const ix = buildOwnerTransferUsdcIx({
      ...f,
      amount: 1n,
      tokenProgramId: TOKEN_PROGRAM_ID,
    });
    expect(ix.programId.equals(PROGRAM_ID)).toBe(true);
  });

  it("emits exactly 5 account metas in [owner, vault, vault_usdc_ata, recipient_usdc_ata, token_program] order", () => {
    const f = fixtures();
    const ix = buildOwnerTransferUsdcIx({
      ...f,
      amount: 1n,
      tokenProgramId: TOKEN_PROGRAM_ID,
    });
    expect(ix.keys.length).toBe(5);

    expect(ix.keys[0]?.pubkey.equals(f.owner)).toBe(true);
    expect(ix.keys[1]?.pubkey.equals(f.vault)).toBe(true);
    expect(ix.keys[2]?.pubkey.equals(f.vaultUsdcAta)).toBe(true);
    expect(ix.keys[3]?.pubkey.equals(f.recipientUsdcAta)).toBe(true);
    expect(ix.keys[4]?.pubkey.equals(TOKEN_PROGRAM_ID)).toBe(true);
  });

  it("owner is signer + NOT writable (matches has_one = owner gate, no SOL movement on owner)", () => {
    // The on-chain instruction takes no rent payment from the owner — the
    // vault PDA pays for the SPL CPI, and the owner is just the auth signer.
    // Setting isWritable=true here would force the owner's SOL balance into
    // the writable accounts set unnecessarily.
    const f = fixtures();
    const ix = buildOwnerTransferUsdcIx({
      ...f,
      amount: 1n,
      tokenProgramId: TOKEN_PROGRAM_ID,
    });
    expect(ix.keys[0]?.isSigner).toBe(true);
    expect(ix.keys[0]?.isWritable).toBe(false);
  });

  it("vault is read-only (not a signer; PDA + has_one check is the gate)", () => {
    const f = fixtures();
    const ix = buildOwnerTransferUsdcIx({
      ...f,
      amount: 1n,
      tokenProgramId: TOKEN_PROGRAM_ID,
    });
    expect(ix.keys[1]?.isSigner).toBe(false);
    expect(ix.keys[1]?.isWritable).toBe(false);
  });

  it("vault_usdc_ata is writable (CPI source — token::transfer mutates balance)", () => {
    const f = fixtures();
    const ix = buildOwnerTransferUsdcIx({
      ...f,
      amount: 1n,
      tokenProgramId: TOKEN_PROGRAM_ID,
    });
    expect(ix.keys[2]?.isSigner).toBe(false);
    expect(ix.keys[2]?.isWritable).toBe(true);
  });

  it("recipient_usdc_ata is writable (CPI destination — token::transfer mutates balance)", () => {
    const f = fixtures();
    const ix = buildOwnerTransferUsdcIx({
      ...f,
      amount: 1n,
      tokenProgramId: TOKEN_PROGRAM_ID,
    });
    expect(ix.keys[3]?.isSigner).toBe(false);
    expect(ix.keys[3]?.isWritable).toBe(true);
  });

  it("token_program is read-only and not a signer", () => {
    const f = fixtures();
    const ix = buildOwnerTransferUsdcIx({
      ...f,
      amount: 1n,
      tokenProgramId: TOKEN_PROGRAM_ID,
    });
    expect(ix.keys[4]?.isSigner).toBe(false);
    expect(ix.keys[4]?.isWritable).toBe(false);
  });

  it("supports max u64 amount without overflow", () => {
    const f = fixtures();
    const max = (1n << 64n) - 1n;
    const ix = buildOwnerTransferUsdcIx({
      ...f,
      amount: max,
      tokenProgramId: TOKEN_PROGRAM_ID,
    });
    expect(ix.data.readBigUInt64LE(8)).toBe(max);
  });
});
