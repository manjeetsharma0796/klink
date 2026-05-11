import { describe, expect, it } from "bun:test";
import { Keypair, PublicKey } from "@solana/web3.js";
import type { Request, Response } from "express";
import { MAX_ALLOWED_RECIPIENTS } from "../../src/program/agent-wallet";
import { makeGetSessionMeHandler } from "../../src/routes/session";

/**
 * T-239 — GET /v1/session/me. Agent-readable session-introspection that
 * mirrors the dashboard's GET /v1/sessions/:id but is scoped to the
 * caller's own session via the api-key middleware (req.session.id).
 *
 * These tests pin:
 *   - 200 happy path: snake_case keys, USDC fields as decimal strings,
 *     allowed_recipients as base58, all 7 spec fields present.
 *   - 401 when the api-key middleware hasn't populated req.session/wallet
 *     (defensive — the middleware would normally short-circuit before this
 *     handler runs).
 *   - 503 on RPC failure (matches the rest of the api's error taxonomy).
 *   - 404 when the session row exists in DB but the on-chain PDA hasn't
 *     been initialized (POST /v1/session was made but owner hasn't signed
 *     the add_session tx via Phantom yet).
 */

const VAULT_PUBKEY = Keypair.generate().publicKey.toBase58();
const SESSION_PUBKEY = Keypair.generate().publicKey;

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
      usdcAta: Keypair.generate().publicKey.toBase58(),
    },
    session: {
      id: "session-id",
      walletId: "wallet-id",
      sessionPubkey: SESSION_PUBKEY.toBase58(),
    },
  } as unknown as Request;
}

interface BuildSessionDataOpts {
  maxPerTx: bigint;
  dailyCap: bigint;
  dailySpent: bigint;
  dailyWindowStart: bigint;
  expiry: bigint;
  allowedRecipients: PublicKey[];
  allowedInstructions: number;
}

/**
 * Build the on-chain Session account binary that decodeSessionAccount
 * expects. Layout (after Anchor's 8B discriminator):
 *   32 vault + 32 session_pubkey + 8 max_per_tx + 8 daily_cap +
 *   8 daily_spent + 8 daily_window_start + 8 expiry +
 *   32 * 10 allowed_recipients + 1 allowed_recipients_count +
 *   4 allowed_instructions + 1 bump = 430 bytes payload (438 total).
 *
 * decodeSessionAccount does NOT validate the discriminator (only length),
 * so we leave it as zeroes.
 */
function buildSessionAccountData(opts: BuildSessionDataOpts): Buffer {
  const PAYLOAD = 32 + 32 + 8 + 8 + 8 + 8 + 8 + 32 * MAX_ALLOWED_RECIPIENTS + 1 + 4 + 1;
  const buf = Buffer.alloc(8 + PAYLOAD);
  let offset = 8; // skip discriminator (zeroes — decoder doesn't check)
  // vault — re-use VAULT_PUBKEY for fidelity but the decoder doesn't
  // assert it matches the PDA derivation.
  new PublicKey(VAULT_PUBKEY).toBuffer().copy(buf, offset);
  offset += 32;
  SESSION_PUBKEY.toBuffer().copy(buf, offset);
  offset += 32;
  buf.writeBigUInt64LE(opts.maxPerTx, offset);
  offset += 8;
  buf.writeBigUInt64LE(opts.dailyCap, offset);
  offset += 8;
  buf.writeBigUInt64LE(opts.dailySpent, offset);
  offset += 8;
  buf.writeBigInt64LE(opts.dailyWindowStart, offset);
  offset += 8;
  buf.writeBigInt64LE(opts.expiry, offset);
  offset += 8;
  // Pack the recipients into the first N slots; the rest stay zeroed and
  // get sliced off by `allowedRecipientsCount` in the decoder.
  for (let i = 0; i < MAX_ALLOWED_RECIPIENTS; i++) {
    if (i < opts.allowedRecipients.length) {
      const r = opts.allowedRecipients[i];
      if (!r) throw new Error("recipient slot undefined");
      r.toBuffer().copy(buf, offset);
    }
    offset += 32;
  }
  buf.writeUInt8(opts.allowedRecipients.length, offset);
  offset += 1;
  buf.writeUInt32LE(opts.allowedInstructions, offset);
  offset += 4;
  buf.writeUInt8(254, offset); // bump
  return buf;
}

function makeFakeConnection(data: Buffer | null) {
  return {
    getAccountInfo: async () =>
      data === null
        ? null
        : {
            owner: new PublicKey("11111111111111111111111111111111"),
            data,
          },
  } as never;
}

function makeThrowingConnection(message: string) {
  return {
    getAccountInfo: async () => {
      throw new Error(message);
    },
  } as never;
}

describe("GET /v1/session/me (T-239)", () => {
  it("returns 200 with all 7 spec fields, snake_case, USDC as decimal strings, recipients as base58", async () => {
    const r1 = Keypair.generate().publicKey;
    const r2 = Keypair.generate().publicKey;
    const data = buildSessionAccountData({
      maxPerTx: 1_000_000n,
      dailyCap: 5_000_000n,
      dailySpent: 250_000n,
      dailyWindowStart: 1_700_000_000n,
      expiry: 0n,
      allowedRecipients: [r1, r2],
      allowedInstructions: 0b101, // transfer_usdc + kamino_withdraw
    });
    const handler = makeGetSessionMeHandler({
      connection: () => makeFakeConnection(data),
    });
    const { res, captured } = makeRes();
    await handler(makeReq(), res);

    expect(captured.status).toBeNull(); // 200 (no explicit status call)
    const body = captured.body as Record<string, unknown>;
    // All 7 spec fields present.
    expect(body.max_per_tx).toBe("1000000");
    expect(body.daily_cap).toBe("5000000");
    expect(body.daily_spent).toBe("250000");
    expect(body.daily_window_start).toBe(1_700_000_000);
    expect(body.expiry).toBe(0);
    expect(body.allowed_recipients).toEqual([r1.toBase58(), r2.toBase58()]);
    expect(body.allowed_instructions).toBe(0b101);
    // No camelCase leakage from the decoded struct.
    expect(body).not.toHaveProperty("maxPerTx");
    expect(body).not.toHaveProperty("dailyCap");
    expect(body).not.toHaveProperty("allowedRecipients");
  });

  it("serializes USDC fields as decimal strings even at u64 max (regression — JSON Number tops out at 2^53)", async () => {
    const data = buildSessionAccountData({
      maxPerTx: 18_446_744_073_709_551_615n, // u64::MAX
      dailyCap: 9_999_999_999_999_999_999n,
      dailySpent: 1n,
      dailyWindowStart: 1_700_000_000n,
      expiry: 1_800_000_000n,
      allowedRecipients: [],
      allowedInstructions: 0,
    });
    const handler = makeGetSessionMeHandler({
      connection: () => makeFakeConnection(data),
    });
    const { res, captured } = makeRes();
    await handler(makeReq(), res);
    const body = captured.body as Record<string, unknown>;
    expect(body.max_per_tx).toBe("18446744073709551615");
    expect(body.daily_cap).toBe("9999999999999999999");
    expect(typeof body.max_per_tx).toBe("string");
    expect(typeof body.daily_cap).toBe("string");
  });

  it("returns 401 when api-key middleware hasn't populated req.session/wallet", async () => {
    // Defensive — `requireApiKey` middleware should short-circuit before
    // we reach the handler. Mirrors the guard in /v1/yield/position.
    const handler = makeGetSessionMeHandler({
      connection: () => makeFakeConnection(Buffer.alloc(438)),
    });
    const { res, captured } = makeRes();
    const req = {} as unknown as Request;
    await handler(req, res);
    expect(captured.status).toBe(401);
    expect(captured.body).toMatchObject({ error: "api key required" });
  });

  it("returns 503 when the on-chain account fetch throws (rpc unavailable)", async () => {
    const handler = makeGetSessionMeHandler({
      connection: () => makeThrowingConnection("rpc 503 from stub"),
    });
    const { res, captured } = makeRes();
    await handler(makeReq(), res);
    expect(captured.status).toBe(503);
    expect(captured.body).toMatchObject({ error: "rpc unavailable" });
  });

  it("returns 404 when the session PDA hasn't been initialized on chain yet", async () => {
    // Real scenario: agent's session row + api-key were inserted by POST
    // /v1/session but the owner hasn't submitted the add_session tx via
    // Phantom yet, so the on-chain PDA doesn't exist.
    const handler = makeGetSessionMeHandler({
      connection: () => makeFakeConnection(null),
    });
    const { res, captured } = makeRes();
    await handler(makeReq(), res);
    expect(captured.status).toBe(404);
    expect(captured.body).toMatchObject({ error: "session pda not yet on chain" });
  });

  it("returns 500 when the on-chain account is malformed (decode failure)", async () => {
    // Account at the PDA address is shorter than the expected Session
    // payload — would be a serious chain-state bug worth logging loudly.
    const handler = makeGetSessionMeHandler({
      connection: () => makeFakeConnection(Buffer.alloc(50)),
    });
    const { res, captured } = makeRes();
    await handler(makeReq(), res);
    expect(captured.status).toBe(500);
    expect(captured.body).toMatchObject({ error: "session decode failed" });
  });
});
