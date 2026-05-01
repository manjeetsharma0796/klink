import { describe, expect, it } from "bun:test";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  MAX_ALLOWED_RECIPIENTS,
  buildSetMaxDeployedFractionIx,
  decodeSessionAccount,
  deriveVaultPda,
  instructionDiscriminator,
} from "../../src/program/agent-wallet";

/**
 * The Session account layout is the contract between the Anchor program
 * (programs/agent_wallet/src/state.rs `Session`) and `GET /v1/sessions/:id`
 * (T-219). Tests build a synthetic Session payload by mirroring the rust
 * field order, then assert the decoder produces the expected struct.
 *
 * If a future Anchor refactor reorders fields, these tests will fail before
 * production traffic does — the dashboard would otherwise display garbage.
 */

const SESSION_PAYLOAD_SIZE = 32 + 32 + 8 + 8 + 8 + 8 + 8 + 32 * MAX_ALLOWED_RECIPIENTS + 1 + 4 + 1;
const SESSION_ACCOUNT_SIZE = 8 + SESSION_PAYLOAD_SIZE;

interface SessionFixture {
  vault: PublicKey;
  sessionPubkey: PublicKey;
  maxPerTx: bigint;
  dailyCap: bigint;
  dailySpent: bigint;
  dailyWindowStart: bigint;
  expiry: bigint;
  recipients: PublicKey[];
  allowedInstructions: number;
  bump: number;
}

function buildSessionAccountBytes(f: SessionFixture): Buffer {
  if (f.recipients.length > MAX_ALLOWED_RECIPIENTS) {
    throw new Error("fixture: too many recipients");
  }
  const buf = Buffer.alloc(SESSION_ACCOUNT_SIZE);
  // 8B fake discriminator — decoder must skip it, so any value works.
  buf.writeUInt8(0xab, 0);
  let offset = 8;
  f.vault.toBuffer().copy(buf, offset);
  offset += 32;
  f.sessionPubkey.toBuffer().copy(buf, offset);
  offset += 32;
  buf.writeBigUInt64LE(f.maxPerTx, offset);
  offset += 8;
  buf.writeBigUInt64LE(f.dailyCap, offset);
  offset += 8;
  buf.writeBigUInt64LE(f.dailySpent, offset);
  offset += 8;
  buf.writeBigInt64LE(f.dailyWindowStart, offset);
  offset += 8;
  buf.writeBigInt64LE(f.expiry, offset);
  offset += 8;
  // Populated recipients first
  for (const r of f.recipients) {
    r.toBuffer().copy(buf, offset);
    offset += 32;
  }
  // Trailing slots remain Pubkey::default() = all zeros — Buffer.alloc gives that for free.
  offset += (MAX_ALLOWED_RECIPIENTS - f.recipients.length) * 32;
  buf.writeUInt8(f.recipients.length, offset);
  offset += 1;
  buf.writeUInt32LE(f.allowedInstructions, offset);
  offset += 4;
  buf.writeUInt8(f.bump, offset);
  return buf;
}

describe("decodeSessionAccount", () => {
  it("round-trips a typical session", () => {
    const vault = Keypair.generate().publicKey;
    const sessionPubkey = Keypair.generate().publicKey;
    const r1 = Keypair.generate().publicKey;
    const r2 = Keypair.generate().publicKey;
    const data = buildSessionAccountBytes({
      vault,
      sessionPubkey,
      maxPerTx: 1_000_000n, // 1 USDC
      dailyCap: 100_000_000n, // 100 USDC
      dailySpent: 42n,
      dailyWindowStart: 1_700_000_000n,
      expiry: 1_900_000_000n,
      recipients: [r1, r2],
      allowedInstructions: 0b101, // transfer_usdc + kamino_withdraw
      bump: 254,
    });
    const decoded = decodeSessionAccount(data);
    expect(decoded.vault.equals(vault)).toBe(true);
    expect(decoded.sessionPubkey.equals(sessionPubkey)).toBe(true);
    expect(decoded.maxPerTx).toBe(1_000_000n);
    expect(decoded.dailyCap).toBe(100_000_000n);
    expect(decoded.dailySpent).toBe(42n);
    expect(decoded.dailyWindowStart).toBe(1_700_000_000n);
    expect(decoded.expiry).toBe(1_900_000_000n);
    expect(decoded.allowedRecipientsCount).toBe(2);
    expect(decoded.allowedRecipients).toHaveLength(2);
    expect(decoded.allowedRecipients[0]?.equals(r1)).toBe(true);
    expect(decoded.allowedRecipients[1]?.equals(r2)).toBe(true);
    expect(decoded.allowedInstructions).toBe(0b101);
    expect(decoded.bump).toBe(254);
  });

  it("strips trailing default-pubkey slots from allowedRecipients", () => {
    // The on-chain account always has 10 slots; the decoder must NOT return
    // the all-zeros placeholders. Spec §2.2.2: trailing slots are
    // Pubkey::default() and never match a real address.
    const data = buildSessionAccountBytes({
      vault: Keypair.generate().publicKey,
      sessionPubkey: Keypair.generate().publicKey,
      maxPerTx: 0n,
      dailyCap: 0n,
      dailySpent: 0n,
      dailyWindowStart: 0n,
      expiry: 0n,
      recipients: [Keypair.generate().publicKey], // just 1
      allowedInstructions: 1,
      bump: 255,
    });
    const decoded = decodeSessionAccount(data);
    expect(decoded.allowedRecipientsCount).toBe(1);
    expect(decoded.allowedRecipients).toHaveLength(1);
  });

  it("supports empty recipient list (Set [] = pause spending)", () => {
    const data = buildSessionAccountBytes({
      vault: Keypair.generate().publicKey,
      sessionPubkey: Keypair.generate().publicKey,
      maxPerTx: 0n,
      dailyCap: 0n,
      dailySpent: 0n,
      dailyWindowStart: 0n,
      expiry: 0n,
      recipients: [],
      allowedInstructions: 0,
      bump: 1,
    });
    const decoded = decodeSessionAccount(data);
    expect(decoded.allowedRecipientsCount).toBe(0);
    expect(decoded.allowedRecipients).toEqual([]);
  });

  it("throws on a too-short buffer instead of returning garbage", () => {
    const tiny = Buffer.alloc(40);
    expect(() => decodeSessionAccount(tiny)).toThrow(/too short/);
  });

  it("throws when allowed_recipients_count exceeds MAX (account corruption)", () => {
    const data = buildSessionAccountBytes({
      vault: Keypair.generate().publicKey,
      sessionPubkey: Keypair.generate().publicKey,
      maxPerTx: 0n,
      dailyCap: 0n,
      dailySpent: 0n,
      dailyWindowStart: 0n,
      expiry: 0n,
      recipients: [],
      allowedInstructions: 0,
      bump: 1,
    });
    // Hand-corrupt the count byte. allowed_recipients_count sits at the start
    // of the post-recipients suffix: 8 disc + 32 + 32 + 8*5 + 32*10.
    const COUNT_OFFSET = 8 + 32 + 32 + 8 * 5 + 32 * MAX_ALLOWED_RECIPIENTS;
    data.writeUInt8(99, COUNT_OFFSET);
    expect(() => decodeSessionAccount(data)).toThrow(/allowed_recipients_count/);
  });
});

describe("buildSetMaxDeployedFractionIx", () => {
  const owner = Keypair.generate().publicKey;

  it("uses the discriminator sha256('global:set_max_deployed_fraction')[0..8]", () => {
    const ix = buildSetMaxDeployedFractionIx({ owner, bp: 0 });
    const expected = instructionDiscriminator("set_max_deployed_fraction");
    expect(ix.data.subarray(0, 8).equals(expected)).toBe(true);
  });

  it("encodes bp as u16 LE after the discriminator", () => {
    for (const bp of [0, 1, 8000, 10_000]) {
      const ix = buildSetMaxDeployedFractionIx({ owner, bp });
      expect(ix.data.length).toBe(10);
      expect(ix.data.readUInt16LE(8)).toBe(bp);
    }
  });

  it("derives vault from [vault, owner] and uses owner as signer (not writable)", () => {
    const ix = buildSetMaxDeployedFractionIx({ owner, bp: 5000 });
    const [expectedVault] = deriveVaultPda(owner);
    expect(ix.keys.length).toBe(2);
    expect(ix.keys[0]?.pubkey.equals(owner)).toBe(true);
    expect(ix.keys[0]?.isSigner).toBe(true);
    expect(ix.keys[0]?.isWritable).toBe(false);
    expect(ix.keys[1]?.pubkey.equals(expectedVault)).toBe(true);
    expect(ix.keys[1]?.isSigner).toBe(false);
    expect(ix.keys[1]?.isWritable).toBe(true);
  });

  it.each([
    [-1, "negative"],
    [10_001, "above MAX_BP"],
    [3.5, "non-integer"],
  ])("rejects bp = %p (%s)", (bp) => {
    expect(() => buildSetMaxDeployedFractionIx({ owner, bp })).toThrow();
  });
});
