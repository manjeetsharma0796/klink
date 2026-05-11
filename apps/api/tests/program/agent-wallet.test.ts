import { describe, expect, it } from "bun:test";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  ALLOWLIST_ACTION,
  MAX_ALLOWED_RECIPIENTS,
  PROGRAM_ID,
  buildAddSessionIx,
  buildRevokeSessionIx,
  buildTransferUsdcIx,
  buildUpdateSessionAllowlistIx,
  deriveSessionPda,
  deriveVaultPda,
  encodeAddSessionArgs,
  encodeTransferUsdcArgs,
  encodeUpdateSessionAllowlistArgs,
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

  it("data length matches discriminator + encoded args (T-206)", () => {
    const a = args();
    const ix = buildAddSessionIx(a);
    const expected = 8 + 32 + 8 + 8 + 8 + 4 + 1 * 32 + 4;
    expect(ix.data.length).toBe(expected);
  });
});

// ===========================================================================
// T-207 — buildRevokeSessionIx
// ===========================================================================

describe("buildRevokeSessionIx", () => {
  function args() {
    return {
      owner: Keypair.generate().publicKey,
      sessionPubkey: Keypair.generate().publicKey,
    };
  }

  it("uses the revoke_session discriminator", () => {
    expect(instructionDiscriminator("revoke_session").toString("hex")).toBe("565cc678900207c2");
    const ix = buildRevokeSessionIx(args());
    expect(ix.data.toString("hex")).toBe("565cc678900207c2");
  });

  it("emits 3 keys: [owner (signer+writable), vault (read-only), session (writable)]", () => {
    const a = args();
    const ix = buildRevokeSessionIx(a);
    expect(ix.keys.length).toBe(3);

    expect(ix.keys[0]?.pubkey.equals(a.owner)).toBe(true);
    expect(ix.keys[0]?.isSigner).toBe(true);
    expect(ix.keys[0]?.isWritable).toBe(true);

    const [expectedVault] = deriveVaultPda(a.owner);
    expect(ix.keys[1]?.pubkey.equals(expectedVault)).toBe(true);
    expect(ix.keys[1]?.isWritable).toBe(false);

    const [expectedSession] = deriveSessionPda(expectedVault, a.sessionPubkey);
    expect(ix.keys[2]?.pubkey.equals(expectedSession)).toBe(true);
    expect(ix.keys[2]?.isWritable).toBe(true); // close = owner needs writable
  });

  it("data has no args after the 8-byte discriminator", () => {
    const ix = buildRevokeSessionIx(args());
    expect(ix.data.length).toBe(8);
  });
});

// ===========================================================================
// T-207 — encodeUpdateSessionAllowlistArgs / buildUpdateSessionAllowlistIx
// ===========================================================================

describe("encodeUpdateSessionAllowlistArgs", () => {
  it("encodes action enum as a single u8 (Add=0, Remove=1, Set=2)", () => {
    expect(encodeUpdateSessionAllowlistArgs({ action: "Add" })[0]).toBe(0);
    expect(encodeUpdateSessionAllowlistArgs({ action: "Remove" })[0]).toBe(1);
    expect(encodeUpdateSessionAllowlistArgs({ action: "Set" })[0]).toBe(2);
  });

  it("encodes Option::None as 0x00 byte for both recipients and bitmap", () => {
    const buf = encodeUpdateSessionAllowlistArgs({ action: "Add" });
    // [action(1)][none(1)][none(1)] = 3 bytes
    expect(buf.length).toBe(3);
    expect(buf[1]).toBe(0); // recipients = None
    expect(buf[2]).toBe(0); // bitmap = None
  });

  it("encodes Option::Some(recipients) as 0x01 + u32 len + N*32 bytes", () => {
    const r0 = Keypair.generate().publicKey;
    const r1 = Keypair.generate().publicKey;
    const buf = encodeUpdateSessionAllowlistArgs({ action: "Set", recipients: [r0, r1] });
    expect(buf[0]).toBe(2); // action = Set
    expect(buf[1]).toBe(1); // recipients = Some
    expect(buf.readUInt32LE(2)).toBe(2);
    const slice0 = buf.subarray(6, 6 + 32);
    const slice1 = buf.subarray(6 + 32, 6 + 64);
    expect(Buffer.compare(slice0, r0.toBuffer())).toBe(0);
    expect(Buffer.compare(slice1, r1.toBuffer())).toBe(0);
    expect(buf[6 + 64]).toBe(0); // bitmap = None
  });

  it("encodes Option::Some(bitmap) as 0x01 + u32", () => {
    const buf = encodeUpdateSessionAllowlistArgs({
      action: "Add",
      instructionsBitmap: 0b0111,
    });
    // [action(1)][none(1)][some(1)][u32(4)] = 7 bytes
    expect(buf.length).toBe(7);
    expect(buf[1]).toBe(0); // recipients = None
    expect(buf[2]).toBe(1); // bitmap = Some
    expect(buf.readUInt32LE(3)).toBe(0b0111);
  });

  it("rejects more than MAX_ALLOWED_RECIPIENTS", () => {
    const tooMany = Array.from(
      { length: MAX_ALLOWED_RECIPIENTS + 1 },
      () => Keypair.generate().publicKey,
    );
    expect(() => encodeUpdateSessionAllowlistArgs({ action: "Set", recipients: tooMany })).toThrow(
      /exceeds MAX_RECIPIENTS/,
    );
  });

  it("rejects bitmap out of u32 range", () => {
    expect(() =>
      encodeUpdateSessionAllowlistArgs({ action: "Add", instructionsBitmap: 0x1_0000_0000 }),
    ).toThrow(/u32/);
  });
});

describe("buildUpdateSessionAllowlistIx", () => {
  function args() {
    return {
      owner: Keypair.generate().publicKey,
      sessionPubkey: Keypair.generate().publicKey,
      action: "Set" as const,
      recipients: [Keypair.generate().publicKey],
      instructionsBitmap: 1,
    };
  }

  it("uses the update_session_allowlist discriminator", () => {
    expect(instructionDiscriminator("update_session_allowlist").toString("hex")).toBe(
      "80e84d7d0846a9e1",
    );
    const ix = buildUpdateSessionAllowlistIx(args());
    expect(ix.data.subarray(0, 8).toString("hex")).toBe("80e84d7d0846a9e1");
  });

  it("emits 3 keys: [owner (signer, RO), vault (RO), session (writable)]", () => {
    const a = args();
    const ix = buildUpdateSessionAllowlistIx(a);
    expect(ix.keys.length).toBe(3);
    expect(ix.keys[0]?.isSigner).toBe(true);
    expect(ix.keys[0]?.isWritable).toBe(false);
    expect(ix.keys[1]?.isWritable).toBe(false);
    expect(ix.keys[2]?.isWritable).toBe(true);
  });

  it("ALLOWLIST_ACTION constant matches rust enum order (Add=0, Remove=1, Set=2)", () => {
    expect(ALLOWLIST_ACTION.Add).toBe(0);
    expect(ALLOWLIST_ACTION.Remove).toBe(1);
    expect(ALLOWLIST_ACTION.Set).toBe(2);
  });
});

// ===========================================================================
// T-210 — encodeTransferUsdcArgs / buildTransferUsdcIx
// ===========================================================================

describe("encodeTransferUsdcArgs", () => {
  it("encodes amount(u64 LE) + recipient(32 raw bytes)", () => {
    const recipient = Keypair.generate().publicKey;
    const buf = encodeTransferUsdcArgs(1_234_567n, recipient);
    expect(buf.length).toBe(40);
    expect(buf.readBigUInt64LE(0)).toBe(1_234_567n);
    expect(Buffer.compare(buf.subarray(8), recipient.toBuffer())).toBe(0);
  });
});

describe("buildTransferUsdcIx", () => {
  // Devnet USDC mint, also used in wallet.test.ts.
  const TOKEN_PROGRAM_FAKE = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

  function args() {
    const owner = Keypair.generate().publicKey;
    const sessionKp = Keypair.generate();
    const recipient = Keypair.generate().publicKey;
    const [vault] = deriveVaultPda(owner);
    return {
      sessionSigner: sessionKp.publicKey,
      sessionPubkey: sessionKp.publicKey,
      vault,
      mint: Keypair.generate().publicKey, // simulating the USDC mint pubkey
      vaultUsdcAta: Keypair.generate().publicKey, // simulating an ATA pubkey
      recipient,
      recipientUsdcAta: Keypair.generate().publicKey,
      amount: 1_000_000n,
      tokenProgramId: TOKEN_PROGRAM_FAKE,
    };
  }

  it("uses the transfer_usdc discriminator", () => {
    expect(instructionDiscriminator("transfer_usdc").toString("hex")).toBe("a49e78b74062f40b");
    const ix = buildTransferUsdcIx(args());
    expect(ix.data.subarray(0, 8).toString("hex")).toBe("a49e78b74062f40b");
  });

  it("emits 7 keys in the order matching TransferUsdc<'info> (T-252 TransferChecked)", () => {
    const a = args();
    const ix = buildTransferUsdcIx(a);
    expect(ix.keys.length).toBe(7);

    expect(ix.keys[0]?.pubkey.equals(a.sessionSigner)).toBe(true);
    expect(ix.keys[0]?.isSigner).toBe(true);
    expect(ix.keys[0]?.isWritable).toBe(false);

    const [expectedSession] = deriveSessionPda(a.vault, a.sessionPubkey);
    expect(ix.keys[1]?.pubkey.equals(expectedSession)).toBe(true);
    expect(ix.keys[1]?.isWritable).toBe(true);

    expect(ix.keys[2]?.pubkey.equals(a.vault)).toBe(true);
    expect(ix.keys[2]?.isWritable).toBe(false);

    expect(ix.keys[3]?.pubkey.equals(a.mint)).toBe(true);
    expect(ix.keys[3]?.isSigner).toBe(false);
    expect(ix.keys[3]?.isWritable).toBe(false);

    expect(ix.keys[4]?.pubkey.equals(a.vaultUsdcAta)).toBe(true);
    expect(ix.keys[4]?.isWritable).toBe(true);

    expect(ix.keys[5]?.pubkey.equals(a.recipientUsdcAta)).toBe(true);
    expect(ix.keys[5]?.isWritable).toBe(true);

    expect(ix.keys[6]?.pubkey.equals(TOKEN_PROGRAM_FAKE)).toBe(true);
    expect(ix.keys[6]?.isWritable).toBe(false);
  });

  it("data length is discriminator + 8-byte amount + 32-byte recipient = 48 bytes", () => {
    const ix = buildTransferUsdcIx(args());
    expect(ix.data.length).toBe(48);
  });
});
