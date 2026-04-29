import { describe, expect, it } from "bun:test";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  MAX_ALLOWED_RECIPIENTS,
  PROGRAM_ID,
  buildAddSessionIx,
  deriveSessionPda,
  deriveVaultPda,
  encodeAddSessionArgs,
  instructionDiscriminator,
} from "../../src/program/agent-wallet";

describe("instructionDiscriminator", () => {
  it("returns 8 bytes", () => {
    expect(instructionDiscriminator("add_session").length).toBe(8);
  });

  it("matches sha256('global:add_session')[0..8]", () => {
    // Pinned to catch an Anchor version bump that changes the discriminator
    // scheme. Mirrors the same guard `wallet.test.ts` has on init_vault.
    // Computed independently with: node -e "console.log(require('crypto').createHash('sha256').update('global:add_session').digest('hex').slice(0,16))"
    const d = instructionDiscriminator("add_session");
    expect(d.toString("hex")).toBe("e55e19c1840d37bc");
  });

  it("differs from init_vault discriminator", () => {
    expect(
      instructionDiscriminator("add_session").equals(instructionDiscriminator("init_vault")),
    ).toBe(false);
  });
});

describe("deriveVaultPda", () => {
  it('matches findProgramAddressSync of ["vault", owner]', () => {
    const owner = Keypair.generate().publicKey;
    const [pda] = deriveVaultPda(owner);
    const [expected] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), owner.toBuffer()],
      PROGRAM_ID,
    );
    expect(pda.equals(expected)).toBe(true);
  });

  it("yields different PDAs for different owners", () => {
    const a = Keypair.generate().publicKey;
    const b = Keypair.generate().publicKey;
    const [vaultA] = deriveVaultPda(a);
    const [vaultB] = deriveVaultPda(b);
    expect(vaultA.equals(vaultB)).toBe(false);
  });
});

describe("deriveSessionPda", () => {
  it('matches findProgramAddressSync of ["session", vault, sessionPubkey]', () => {
    const owner = Keypair.generate().publicKey;
    const [vault] = deriveVaultPda(owner);
    const sessionPubkey = Keypair.generate().publicKey;
    const [pda] = deriveSessionPda(vault, sessionPubkey);
    const [expected] = PublicKey.findProgramAddressSync(
      [Buffer.from("session"), vault.toBuffer(), sessionPubkey.toBuffer()],
      PROGRAM_ID,
    );
    expect(pda.equals(expected)).toBe(true);
  });

  it("yields different PDAs for different session keys under the same vault", () => {
    const [vault] = deriveVaultPda(Keypair.generate().publicKey);
    const [sessionA] = deriveSessionPda(vault, Keypair.generate().publicKey);
    const [sessionB] = deriveSessionPda(vault, Keypair.generate().publicKey);
    expect(sessionA.equals(sessionB)).toBe(false);
  });
});

describe("encodeAddSessionArgs", () => {
  function smallArgs(recipients: PublicKey[] = []) {
    return {
      sessionPubkey: Keypair.generate().publicKey,
      maxPerTx: 1_000_000n, // 1 USDC base unit
      dailyCap: 50_000_000n, // 50 USDC
      expiry: 0n,
      allowedRecipients: recipients,
      allowedInstructions: 0b0111, // transfer + deposit + withdraw
    };
  }

  it("encodes layout: sessionPubkey(32) + maxPerTx(8) + dailyCap(8) + expiry(8) + recipientsLen(4) + recipients + allowedInstructions(4)", () => {
    const args = smallArgs([Keypair.generate().publicKey, Keypair.generate().publicKey]);
    const buf = encodeAddSessionArgs(args);
    expect(buf.length).toBe(32 + 8 + 8 + 8 + 4 + 2 * 32 + 4);
  });

  it("encodes maxPerTx as little-endian u64", () => {
    const args = smallArgs();
    const buf = encodeAddSessionArgs(args);
    expect(buf.readBigUInt64LE(32)).toBe(args.maxPerTx);
  });

  it("encodes dailyCap as little-endian u64 right after maxPerTx", () => {
    const args = smallArgs();
    const buf = encodeAddSessionArgs(args);
    expect(buf.readBigUInt64LE(40)).toBe(args.dailyCap);
  });

  it("encodes expiry as little-endian i64 (handles 0 = never)", () => {
    const args = smallArgs();
    const buf = encodeAddSessionArgs(args);
    expect(buf.readBigInt64LE(48)).toBe(0n);
  });

  it("encodes the recipients length prefix as little-endian u32", () => {
    const r0 = Keypair.generate().publicKey;
    const r1 = Keypair.generate().publicKey;
    const args = smallArgs([r0, r1]);
    const buf = encodeAddSessionArgs(args);
    expect(buf.readUInt32LE(56)).toBe(2);
  });

  it("encodes each recipient as 32 raw bytes (no padding)", () => {
    const r0 = Keypair.generate().publicKey;
    const args = smallArgs([r0]);
    const buf = encodeAddSessionArgs(args);
    const slice = buf.subarray(60, 60 + 32);
    expect(Buffer.compare(slice, r0.toBuffer())).toBe(0);
  });

  it("places allowedInstructions u32 immediately after the variable recipients section", () => {
    const args = smallArgs([Keypair.generate().publicKey]);
    const buf = encodeAddSessionArgs(args);
    const offset = 56 + 4 + 1 * 32;
    expect(buf.readUInt32LE(offset)).toBe(args.allowedInstructions);
  });

  it("rejects more than MAX_ALLOWED_RECIPIENTS", () => {
    const tooMany = Array.from(
      { length: MAX_ALLOWED_RECIPIENTS + 1 },
      () => Keypair.generate().publicKey,
    );
    expect(() => encodeAddSessionArgs(smallArgs(tooMany))).toThrow(/exceeds MAX_RECIPIENTS/);
  });

  it("accepts exactly MAX_ALLOWED_RECIPIENTS", () => {
    const exactlyMax = Array.from(
      { length: MAX_ALLOWED_RECIPIENTS },
      () => Keypair.generate().publicKey,
    );
    expect(() => encodeAddSessionArgs(smallArgs(exactlyMax))).not.toThrow();
  });
});

describe("buildAddSessionIx", () => {
  function args() {
    const owner = Keypair.generate().publicKey;
    const sessionPubkey = Keypair.generate().publicKey;
    return {
      payer: owner,
      owner,
      sessionPubkey,
      maxPerTx: 100n,
      dailyCap: 500n,
      expiry: 0n,
      allowedRecipients: [Keypair.generate().publicKey],
      allowedInstructions: 1,
    };
  }

  it("uses PROGRAM_ID and emits 5 keys (payer, owner, vault, session, system)", () => {
    const ix = buildAddSessionIx(args());
    expect(ix.programId.equals(PROGRAM_ID)).toBe(true);
    expect(ix.keys.length).toBe(5);
  });

  it("data starts with the add_session discriminator", () => {
    const ix = buildAddSessionIx(args());
    expect(ix.data.subarray(0, 8).toString("hex")).toBe("e55e19c1840d37bc");
  });

  it("payer is signer + writable", () => {
    const ix = buildAddSessionIx(args());
    expect(ix.keys[0]?.isSigner).toBe(true);
    expect(ix.keys[0]?.isWritable).toBe(true);
  });

  it("owner is signer but NOT writable", () => {
    const ix = buildAddSessionIx(args());
    expect(ix.keys[1]?.isSigner).toBe(true);
    expect(ix.keys[1]?.isWritable).toBe(false);
  });

  it("vault PDA is derived from owner and is read-only", () => {
    const a = args();
    const ix = buildAddSessionIx(a);
    const [expectedVault] = deriveVaultPda(a.owner);
    expect(ix.keys[2]?.pubkey.equals(expectedVault)).toBe(true);
    expect(ix.keys[2]?.isSigner).toBe(false);
    expect(ix.keys[2]?.isWritable).toBe(false);
  });

  it("session PDA is derived from vault + sessionPubkey and is writable (init)", () => {
    const a = args();
    const ix = buildAddSessionIx(a);
    const [vault] = deriveVaultPda(a.owner);
    const [expectedSession] = deriveSessionPda(vault, a.sessionPubkey);
    expect(ix.keys[3]?.pubkey.equals(expectedSession)).toBe(true);
    expect(ix.keys[3]?.isSigner).toBe(false);
    expect(ix.keys[3]?.isWritable).toBe(true);
  });

  it("system program is the last account meta", () => {
    const ix = buildAddSessionIx(args());
    expect(ix.keys[4]?.pubkey.equals(SystemProgram.programId)).toBe(true);
    expect(ix.keys[4]?.isSigner).toBe(false);
    expect(ix.keys[4]?.isWritable).toBe(false);
  });

  it("data length matches discriminator + encoded args", () => {
    const a = args();
    const ix = buildAddSessionIx(a);
    const expected = 8 + 32 + 8 + 8 + 8 + 4 + 1 * 32 + 4;
    expect(ix.data.length).toBe(expected);
  });
});
