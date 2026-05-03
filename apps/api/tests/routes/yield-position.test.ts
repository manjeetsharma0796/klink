import { describe, expect, it } from "bun:test";
import { Keypair, PublicKey } from "@solana/web3.js";
import type { Request, Response } from "express";
import { VAULT_ACCOUNT_DISCRIMINATOR } from "../../src/routes/wallet";
import { decodeVaultDeployedAmount } from "../../src/program/agent-wallet";
import {
  type LiquidReader,
  makeGetYieldPositionHandler,
} from "../../src/routes/yield";

/**
 * T-238 added a `liquid` field to GET /v1/yield/position so agents can plan
 * spends without fail-and-parse-INSUFFICIENT_LIQUID. These tests pin the
 * three states the field can be in (positive integer string / "0" / null on
 * RPC failure) and the `total_balance = liquid + deployed` invariant.
 */

// Real base58-decodable pubkeys — `new PublicKey(...)` in the handler
// validates length + alphabet, so synthetic strings like "FakeVaultPda…"
// are rejected with a 500 before our test ever reaches the liquid logic.
const VAULT_PUBKEY = Keypair.generate().publicKey.toBase58();
const USDC_ATA_PUBKEY = Keypair.generate().publicKey.toBase58();

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

function makeReq(): Request {
  return {
    wallet: {
      id: "wallet-id",
      vaultPda: VAULT_PUBKEY,
      usdcAta: USDC_ATA_PUBKEY,
    },
    session: {
      id: "session-id",
      walletId: "wallet-id",
      sessionPubkey: Keypair.generate().publicKey.toBase58(),
    },
  } as unknown as Request;
}

/**
 * Build a Vault account binary with `deployed_amount` set to the given value.
 * Layout: 8B disc + 32B owner + 2B max_bp + 8B deployed + 1B bump = 51B.
 */
function buildVaultAccountData(deployed: bigint): Buffer {
  const buf = Buffer.alloc(51);
  VAULT_ACCOUNT_DISCRIMINATOR.copy(buf, 0);
  Keypair.generate().publicKey.toBuffer().copy(buf, 8); // owner
  buf.writeUInt16LE(8000, 40); // max_deployed_fraction_bp
  buf.writeBigUInt64LE(deployed, 42);
  buf.writeUInt8(254, 50); // bump
  return buf;
}

function makeFakeConnection(deployed: bigint) {
  return {
    getAccountInfo: async () => ({
      owner: new PublicKey("11111111111111111111111111111111"),
      data: buildVaultAccountData(deployed),
    }),
  } as never;
}

const stubLiquid =
  (value: bigint | "throw" | "ata-not-found"): LiquidReader =>
  async () => {
    if (value === "throw") throw new Error("rpc 503 from stub");
    if (value === "ata-not-found") {
      throw new Error("could not find account: TokenAccountNotFoundError");
    }
    return value;
  };

describe("GET /v1/yield/position liquid field (T-238)", () => {
  it("includes liquid as decimal string + total_balance = liquid + deployed", async () => {
    const handler = makeGetYieldPositionHandler({
      connection: () => makeFakeConnection(3_000_000n),
      liquid: stubLiquid(2_500_000n),
    });
    const { res, captured } = makeRes();
    await handler(makeReq(), res);
    const body = captured.body as Record<string, unknown>;
    expect(body.liquid).toBe("2500000");
    expect(body.deployed).toBe("3000000");
    expect(body.total_balance).toBe("5500000");
    expect(body.accrued).toBeNull();
  });

  it("returns liquid: '0' when the vault ATA exists but is empty", async () => {
    const handler = makeGetYieldPositionHandler({
      connection: () => makeFakeConnection(0n),
      liquid: stubLiquid(0n),
    });
    const { res, captured } = makeRes();
    await handler(makeReq(), res);
    const body = captured.body as Record<string, unknown>;
    expect(body.liquid).toBe("0");
    expect(body.deployed).toBe("0");
    expect(body.total_balance).toBe("0");
  });

  it("returns liquid: null when the SPL balance fetch throws (so agents can distinguish RPC fail from empty ATA)", async () => {
    const handler = makeGetYieldPositionHandler({
      connection: () => makeFakeConnection(1_000_000n),
      liquid: stubLiquid("throw"),
    });
    const { res, captured } = makeRes();
    await handler(makeReq(), res);
    expect(captured.status).toBeNull(); // 200 — handler degrades, doesn't fail the whole read
    const body = captured.body as Record<string, unknown>;
    expect(body.liquid).toBeNull();
    expect(body.deployed).toBe("1000000");
    // total_balance falls back to deployed when liquid couldn't be read
    expect(body.total_balance).toBe("1000000");
  });

  it("treats TokenAccountNotFound as '0 liquid' rather than a hard failure", async () => {
    // A vault with no USDC ATA yet is a real cold-wallet state — not an
    // error condition. The handler should surface 0, not null.
    const handler = makeGetYieldPositionHandler({
      connection: () => makeFakeConnection(0n),
      liquid: stubLiquid("ata-not-found"),
    });
    const { res, captured } = makeRes();
    await handler(makeReq(), res);
    const body = captured.body as Record<string, unknown>;
    expect(body.liquid).toBe("0");
  });

  it("uses the wallet's usdcAta from the api-key middleware (not the vault PDA)", async () => {
    // Regression guard: liquid balance is read from the USDC ATA, never
    // from the vault PDA. Misreading the PDA would always return 0 since
    // the PDA isn't itself a token account.
    let observedAta: PublicKey | null = null;
    const handler = makeGetYieldPositionHandler({
      connection: () => makeFakeConnection(0n),
      liquid: async (_conn, ata) => {
        observedAta = ata;
        return 0n;
      },
    });
    const { res } = makeRes();
    await handler(makeReq(), res);
    expect(observedAta).not.toBeNull();
    const ata = observedAta as unknown as PublicKey;
    expect(ata.toBase58()).toBe(USDC_ATA_PUBKEY);
  });
});

describe("decodeVaultDeployedAmount (regression — sanity that test fixture is valid)", () => {
  it("round-trips through buildVaultAccountData", () => {
    const data = buildVaultAccountData(7_777_777n);
    expect(decodeVaultDeployedAmount(data)).toBe(7_777_777n);
  });
});
