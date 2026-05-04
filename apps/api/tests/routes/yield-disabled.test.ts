import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Keypair } from "@solana/web3.js";
import type { Request, Response } from "express";
import {
  makePostYieldDepositHandler,
  makePostYieldWithdrawHandler,
} from "../../src/routes/yield";

/**
 * T-240 — yield deposit/withdraw must short-circuit with a 503 YIELD_DISABLED
 * when the 5 Kamino reserve env vars aren't all populated. This is the
 * agent-facing surface for "yield is config-gated off on this environment"
 * (devnet today; mainnet wiring is part of the T-114 cutover). The previous
 * behaviour was a 500 "server misconfigured" leak from `envOrThrow` deep in
 * the handler — agents couldn't distinguish a config gap from a real bug,
 * and the skill.md error taxonomy explicitly told them not to retry 500s,
 * which collapsed yield to "permanently broken" UX.
 */

const KAMINO_VARS = [
  "KAMINO_RESERVE",
  "KAMINO_LENDING_MARKET",
  "KAMINO_LENDING_MARKET_AUTHORITY",
  "KAMINO_RESERVE_LIQUIDITY_SUPPLY",
  "KAMINO_RESERVE_COLLATERAL_MINT",
] as const;

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
      vaultPda: Keypair.generate().publicKey.toBase58(),
      usdcAta: Keypair.generate().publicKey.toBase58(),
    },
    session: {
      id: "session-id",
      walletId: "wallet-id",
      sessionPubkey: Keypair.generate().publicKey.toBase58(),
    },
    body: { amount: 1_000_000 },
  } as unknown as Request;
}

const KAMINO_PUBKEY = Keypair.generate().publicKey.toBase58();

describe("yield deposit/withdraw — YIELD_DISABLED guard (T-240)", () => {
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    savedEnv = {};
    for (const k of KAMINO_VARS) {
      savedEnv[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of KAMINO_VARS) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
  });

  it("returns 503 YIELD_DISABLED when no Kamino env vars are set (deposit)", async () => {
    const handler = makePostYieldDepositHandler();
    const { res, captured } = makeRes();
    await handler(makeReq(), res);
    expect(captured.status).toBe(503);
    expect(captured.body).toMatchObject({
      error: "YIELD_DISABLED",
      detail: expect.stringContaining("config-gated"),
    });
  });

  it("returns 503 YIELD_DISABLED when no Kamino env vars are set (withdraw)", async () => {
    const handler = makePostYieldWithdrawHandler();
    const { res, captured } = makeRes();
    await handler(makeReq(), res);
    expect(captured.status).toBe(503);
    expect(captured.body).toMatchObject({ error: "YIELD_DISABLED" });
  });

  it("returns 503 YIELD_DISABLED when only some Kamino env vars are set", async () => {
    // Partial config is just as broken as no config — guard must catch it.
    process.env.KAMINO_RESERVE = KAMINO_PUBKEY;
    process.env.KAMINO_LENDING_MARKET = KAMINO_PUBKEY;
    // Other 3 left unset.

    const handler = makePostYieldDepositHandler();
    const { res, captured } = makeRes();
    await handler(makeReq(), res);
    expect(captured.status).toBe(503);
    expect(captured.body).toMatchObject({ error: "YIELD_DISABLED" });
  });

  it("guard fires before auth-shape checks would crash (no req.body, no session)", async () => {
    // Even if the request is malformed in other ways, the guard short-circuits
    // first when env is unset — agents get the actionable signal, not a 401/400.
    const handler = makePostYieldDepositHandler();
    const { res, captured } = makeRes();
    // Degenerate req with valid auth shim but no body — guard still fires
    // because session/wallet are present (auth check passes), and YIELD_DISABLED
    // is the next check.
    const req = makeReq();
    (req as unknown as { body: unknown }).body = undefined;
    await handler(req, res);
    expect(captured.status).toBe(503);
    expect(captured.body).toMatchObject({ error: "YIELD_DISABLED" });
  });

  it("does NOT fire when all 5 Kamino env vars are set (auth-shape check runs next)", async () => {
    for (const k of KAMINO_VARS) process.env[k] = KAMINO_PUBKEY;

    const handler = makePostYieldDepositHandler();
    const { res, captured } = makeRes();
    // No session/wallet on req → guard passes, auth check runs, returns 401.
    // (We can't easily run a full successful path here without mocking the
    // submit + decrypt seams; this test only asserts the guard short-circuit
    // is OFF when env is fully populated.)
    const req = { body: { amount: 1_000_000 } } as unknown as Request;
    await handler(req, res);
    expect(captured.status).toBe(401);
    expect(captured.body).toMatchObject({ error: "api key required" });
  });
});
