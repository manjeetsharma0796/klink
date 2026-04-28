import { describe, expect, it } from "bun:test";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import type { Request, Response } from "express";
import {
  anchorDiscriminator,
  buildInitVaultTx,
  makePostWalletHandler,
} from "../../src/routes/wallet";

const PROGRAM_ID = new PublicKey("5qCJCEhfLusk59YFqaEG9Yg3Wp64ZaYwvXteFmCmedqv");
// Devnet USDC mint commonly used by Circle / Kamino devnet integrations.
const USDC_MINT = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
const FAKE_BLOCKHASH = "11111111111111111111111111111111";

interface CapturedResponse {
  status: number | null;
  body: unknown;
}

function makeRes(): { res: Response; captured: CapturedResponse } {
  const captured: CapturedResponse = { status: null, body: null };
  const res: Partial<Response> = {};
  res.status = ((code: number) => {
    captured.status = code;
    return res as Response;
  }) as Response["status"];
  res.json = ((body: unknown) => {
    captured.body = body;
    return res as Response;
  }) as Response["json"];
  return { res: res as Response, captured };
}

function makeReq(opts: {
  pubkey?: string;
  body?: unknown;
}): Request {
  const r = {
    user: opts.pubkey ? { id: "u1", pubkey: opts.pubkey } : undefined,
    body: opts.body,
  } as unknown as Request;
  return r;
}

describe("anchorDiscriminator", () => {
  it("matches the well-known sha256('global:init_vault')[0..8] value", () => {
    // Pin the discriminator so an Anchor framework version bump that changes
    // it (e.g. switching to a different naming scheme) breaks this test
    // before it breaks production.
    const d = anchorDiscriminator("init_vault");
    expect(d.length).toBe(8);
    // Computed independently: sha256("global:init_vault")[0..8].
    // Locking this catches Anchor naming-scheme drift before it breaks prod.
    expect(d.toString("hex")).toBe("4d4f559621d9346a");
  });
});

describe("buildInitVaultTx", () => {
  it('derives the vault PDA from seeds=["vault", owner]', () => {
    const owner = Keypair.generate().publicKey;
    const built = buildInitVaultTx({
      owner,
      maxDeployedFractionBp: 8000,
      programId: PROGRAM_ID,
      usdcMint: USDC_MINT,
      recentBlockhash: FAKE_BLOCKHASH,
    });
    const [expected] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), owner.toBuffer()],
      PROGRAM_ID,
    );
    expect(built.vaultPda.equals(expected)).toBe(true);
  });

  it("derives the vault USDC ATA off-curve from the vault PDA", () => {
    const owner = Keypair.generate().publicKey;
    const built = buildInitVaultTx({
      owner,
      maxDeployedFractionBp: 0,
      programId: PROGRAM_ID,
      usdcMint: USDC_MINT,
      recentBlockhash: FAKE_BLOCKHASH,
    });
    const expected = getAssociatedTokenAddressSync(USDC_MINT, built.vaultPda, true);
    expect(built.vaultUsdcAta.equals(expected)).toBe(true);
  });

  it("emits a tx with feePayer=owner, two instructions, correct blockhash", () => {
    const owner = Keypair.generate().publicKey;
    const built = buildInitVaultTx({
      owner,
      maxDeployedFractionBp: 5000,
      programId: PROGRAM_ID,
      usdcMint: USDC_MINT,
      recentBlockhash: FAKE_BLOCKHASH,
    });
    expect(built.tx.feePayer?.equals(owner)).toBe(true);
    expect(built.tx.recentBlockhash).toBe(FAKE_BLOCKHASH);
    expect(built.tx.instructions.length).toBe(2);
  });

  it("encodes init_vault as discriminator(8) + u16 LE bp", () => {
    const owner = Keypair.generate().publicKey;
    const bp = 1234;
    const built = buildInitVaultTx({
      owner,
      maxDeployedFractionBp: bp,
      programId: PROGRAM_ID,
      usdcMint: USDC_MINT,
      recentBlockhash: FAKE_BLOCKHASH,
    });
    const initIx = built.tx.instructions[0];
    if (!initIx) throw new Error("expected init_vault instruction at index 0");
    expect(initIx.programId.equals(PROGRAM_ID)).toBe(true);
    expect(initIx.data.length).toBe(10);
    expect(initIx.data.subarray(0, 8).toString("hex")).toBe("4d4f559621d9346a");
    expect(initIx.data.readUInt16LE(8)).toBe(bp);
  });

  it("emits init_vault account meta in [payer, owner, vault, system_program] order", () => {
    const owner = Keypair.generate().publicKey;
    const built = buildInitVaultTx({
      owner,
      maxDeployedFractionBp: 100,
      programId: PROGRAM_ID,
      usdcMint: USDC_MINT,
      recentBlockhash: FAKE_BLOCKHASH,
    });
    const initIx = built.tx.instructions[0];
    if (!initIx) throw new Error("expected init_vault instruction at index 0");
    expect(initIx.keys.length).toBe(4);

    // payer: signer + writable, equals owner (self-pay model)
    expect(initIx.keys[0]?.pubkey.equals(owner)).toBe(true);
    expect(initIx.keys[0]?.isSigner).toBe(true);
    expect(initIx.keys[0]?.isWritable).toBe(true);

    // owner: signer, NOT writable
    expect(initIx.keys[1]?.pubkey.equals(owner)).toBe(true);
    expect(initIx.keys[1]?.isSigner).toBe(true);
    expect(initIx.keys[1]?.isWritable).toBe(false);

    // vault: PDA, writable, NOT signer
    expect(initIx.keys[2]?.pubkey.equals(built.vaultPda)).toBe(true);
    expect(initIx.keys[2]?.isSigner).toBe(false);
    expect(initIx.keys[2]?.isWritable).toBe(true);

    // system_program
    expect(initIx.keys[3]?.pubkey.equals(SystemProgram.programId)).toBe(true);
  });

  it("emits createATA instruction targeting the vault PDA + USDC mint", () => {
    const owner = Keypair.generate().publicKey;
    const built = buildInitVaultTx({
      owner,
      maxDeployedFractionBp: 0,
      programId: PROGRAM_ID,
      usdcMint: USDC_MINT,
      recentBlockhash: FAKE_BLOCKHASH,
    });
    const ataIx = built.tx.instructions[1];
    if (!ataIx) throw new Error("expected createATA instruction at index 1");
    expect(ataIx.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID)).toBe(true);
    // Account-meta pattern from @solana/spl-token's createAssociatedTokenAccountInstruction:
    // [payer, ata, wallet, mint, system, token_program]
    expect(ataIx.keys.some((k) => k.pubkey.equals(built.vaultUsdcAta))).toBe(true);
    expect(ataIx.keys.some((k) => k.pubkey.equals(built.vaultPda))).toBe(true);
    expect(ataIx.keys.some((k) => k.pubkey.equals(USDC_MINT))).toBe(true);
    expect(ataIx.keys.some((k) => k.pubkey.equals(TOKEN_PROGRAM_ID))).toBe(true);
  });
});

describe("POST /v1/wallet handler", () => {
  function makeHandler() {
    return makePostWalletHandler({
      blockhash: async () => FAKE_BLOCKHASH,
      programId: () => PROGRAM_ID,
      usdcMint: () => USDC_MINT,
    });
  }

  const VALID_OWNER = Keypair.generate().publicKey.toBase58();

  it("returns 401 when req.user is missing", async () => {
    const handler = makeHandler();
    const { res, captured } = makeRes();
    await handler(makeReq({ body: { max_deployed_fraction_bp: 100 } }), res);
    expect(captured.status).toBe(401);
  });

  it.each([
    [undefined, "undefined"],
    ["100", "string"],
    [-1, "negative"],
    [10001, "above MAX_BP"],
    [50.5, "non-integer"],
  ])("rejects max_deployed_fraction_bp = %p (%s) with 400", async (val) => {
    const handler = makeHandler();
    const { res, captured } = makeRes();
    await handler(makeReq({ pubkey: VALID_OWNER, body: { max_deployed_fraction_bp: val } }), res);
    expect(captured.status).toBe(400);
  });

  it("rejects an invalid base58 pubkey on the JWT with 400", async () => {
    const handler = makeHandler();
    const { res, captured } = makeRes();
    await handler(
      makeReq({ pubkey: "not-a-real-pubkey!!!", body: { max_deployed_fraction_bp: 0 } }),
      res,
    );
    expect(captured.status).toBe(400);
    expect(captured.body).toEqual({ error: "invalid owner pubkey on jwt" });
  });

  it("returns 503 when the blockhash fetch throws", async () => {
    const handler = makePostWalletHandler({
      blockhash: async () => {
        throw new Error("rpc 502");
      },
      programId: () => PROGRAM_ID,
      usdcMint: () => USDC_MINT,
    });
    const { res, captured } = makeRes();
    await handler(makeReq({ pubkey: VALID_OWNER, body: { max_deployed_fraction_bp: 8000 } }), res);
    expect(captured.status).toBe(503);
    expect(captured.body).toEqual({ error: "rpc unavailable" });
  });

  it("happy path: returns base64 tx + vaultPda + vaultUsdcAta", async () => {
    const handler = makeHandler();
    const { res, captured } = makeRes();
    await handler(makeReq({ pubkey: VALID_OWNER, body: { max_deployed_fraction_bp: 8000 } }), res);
    expect(captured.status).toBeNull(); // res.json was called, no explicit status
    const body = captured.body as {
      txBase64: string;
      vaultPda: string;
      vaultUsdcAta: string;
    };
    expect(typeof body.txBase64).toBe("string");
    expect(body.txBase64.length).toBeGreaterThan(0);

    // Round-trip: deserialize, verify shape
    const decoded = Buffer.from(body.txBase64, "base64");
    const tx = Transaction.from(decoded);
    expect(tx.feePayer?.toBase58()).toBe(VALID_OWNER);
    expect(tx.recentBlockhash).toBe(FAKE_BLOCKHASH);
    expect(tx.instructions.length).toBe(2);

    const ownerKey = new PublicKey(VALID_OWNER);
    const [expectedVault] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), ownerKey.toBuffer()],
      PROGRAM_ID,
    );
    expect(body.vaultPda).toBe(expectedVault.toBase58());

    const expectedAta = getAssociatedTokenAddressSync(USDC_MINT, expectedVault, true);
    expect(body.vaultUsdcAta).toBe(expectedAta.toBase58());
  });

  it("happy path tx is unsigned (Phantom signs client-side)", async () => {
    const handler = makeHandler();
    const { res, captured } = makeRes();
    await handler(makeReq({ pubkey: VALID_OWNER, body: { max_deployed_fraction_bp: 0 } }), res);
    const body = captured.body as { txBase64: string };
    const tx = Transaction.from(Buffer.from(body.txBase64, "base64"));
    // No signatures filled in yet — owner's slot is the empty 64-byte placeholder.
    const ownerSig = tx.signatures.find((s) => s.publicKey.toBase58() === VALID_OWNER);
    expect(ownerSig).toBeDefined();
    expect(ownerSig?.signature).toBeNull();
  });
});
