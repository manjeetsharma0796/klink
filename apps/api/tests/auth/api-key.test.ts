import { describe, expect, it } from "bun:test";
import type { NextFunction, Request, Response } from "express";
import {
  type ApiKeyLookup,
  type ApiKeyRow,
  type KlinkSession,
  type KlinkWallet,
  generateApiKey,
  hashApiKey,
  makeRequireApiKey,
} from "../../src/auth/api-key";

// Local-cast type for tests — the global augmentation in api-key.ts is picked
// up by the source file but not always by test files under isolatedModules.
type AugRequest = Request & { session?: KlinkSession; wallet?: KlinkWallet };

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

function makeReq(authHeader?: string): Request {
  return {
    header: (name: string) => {
      if (name.toLowerCase() === "authorization") return authHeader;
      return undefined;
    },
  } as unknown as Request;
}

async function makeRow(token: string, overrides: Partial<ApiKeyRow> = {}): Promise<ApiKeyRow> {
  return {
    apiKeyId: "11111111-1111-1111-1111-111111111111",
    hashedToken: await hashApiKey(token),
    apiKeyRevokedAt: null,
    sessionId: "22222222-2222-2222-2222-222222222222",
    sessionRevokedAt: null,
    walletId: "33333333-3333-3333-3333-333333333333",
    sessionPubkey: "FakeSessionPubkey44444444444444444444444444",
    vaultPda: "FakeVaultPda88888888888888888888888888888888",
    usdcAta: "FakeUsdcAta99999999999999999999999999999999",
    ...overrides,
  };
}

const noopUpdate = async () => undefined;

describe("generateApiKey", () => {
  it("produces a token starting with the static prefix", () => {
    const { token } = generateApiKey();
    expect(token.startsWith("klink_dev_")).toBe(true);
  });

  it("produces an 8-char prefix matching the body's first 8 chars", () => {
    const { token, prefix } = generateApiKey();
    expect(prefix).toHaveLength(8);
    const STATIC = "klink_dev_";
    expect(token.slice(STATIC.length, STATIC.length + 8)).toBe(prefix);
  });

  it("produces unique tokens across calls", () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a.token).not.toBe(b.token);
    expect(a.prefix).not.toBe(b.prefix);
  });
});

describe("hashApiKey + Bun.password.verify", () => {
  it("round-trips a token (correct token verifies true)", async () => {
    const { token } = generateApiKey();
    const hash = await hashApiKey(token);
    expect(await Bun.password.verify(token, hash)).toBe(true);
  });

  it("rejects a wrong token (verify returns false)", async () => {
    const { token } = generateApiKey();
    const hash = await hashApiKey(token);
    expect(await Bun.password.verify("klink_dev_wrong", hash)).toBe(false);
  });
});

describe("requireApiKey middleware", () => {
  it("returns 401 when Authorization header is missing", async () => {
    const middleware = makeRequireApiKey({
      lookup: async () => null,
      updateLastUsed: noopUpdate,
    });
    const { res, captured } = makeRes();
    let nextCalled = false;
    const next: NextFunction = () => {
      nextCalled = true;
    };
    await middleware(makeReq(), res, next);
    expect(captured.status).toBe(401);
    expect(nextCalled).toBe(false);
  });

  it("returns 401 when Authorization is not Bearer", async () => {
    const middleware = makeRequireApiKey({
      lookup: async () => null,
      updateLastUsed: noopUpdate,
    });
    const { res, captured } = makeRes();
    await middleware(makeReq("Basic abc"), res, () => undefined);
    expect(captured.status).toBe(401);
  });

  it("returns 401 when token does not start with klink_dev_", async () => {
    const middleware = makeRequireApiKey({
      lookup: async () => null,
      updateLastUsed: noopUpdate,
    });
    const { res, captured } = makeRes();
    await middleware(makeReq("Bearer foo_bar_baz"), res, () => undefined);
    expect(captured.status).toBe(401);
    expect(captured.body).toEqual({ error: "invalid token format" });
  });

  it("returns 401 when token body is too short", async () => {
    const middleware = makeRequireApiKey({
      lookup: async () => null,
      updateLastUsed: noopUpdate,
    });
    const { res, captured } = makeRes();
    await middleware(makeReq("Bearer klink_dev_short"), res, () => undefined);
    expect(captured.status).toBe(401);
  });

  it("returns 401 when the prefix is not found in the DB", async () => {
    const middleware = makeRequireApiKey({
      lookup: async () => null,
      updateLastUsed: noopUpdate,
    });
    const { token } = generateApiKey();
    const { res, captured } = makeRes();
    await middleware(makeReq(`Bearer ${token}`), res, () => undefined);
    expect(captured.status).toBe(401);
    expect(captured.body).toEqual({ error: "invalid api key" });
  });

  it("returns 401 when api_key is revoked", async () => {
    const { token } = generateApiKey();
    const row = await makeRow(token, { apiKeyRevokedAt: new Date("2025-01-01") });
    const lookup: ApiKeyLookup = async () => row;
    const middleware = makeRequireApiKey({ lookup, updateLastUsed: noopUpdate });
    const { res, captured } = makeRes();
    await middleware(makeReq(`Bearer ${token}`), res, () => undefined);
    expect(captured.status).toBe(401);
    expect(captured.body).toEqual({ error: "api key revoked" });
  });

  it("returns 401 when the session is revoked", async () => {
    const { token } = generateApiKey();
    const row = await makeRow(token, { sessionRevokedAt: new Date("2025-01-01") });
    const lookup: ApiKeyLookup = async () => row;
    const middleware = makeRequireApiKey({ lookup, updateLastUsed: noopUpdate });
    const { res, captured } = makeRes();
    await middleware(makeReq(`Bearer ${token}`), res, () => undefined);
    expect(captured.status).toBe(401);
    expect(captured.body).toEqual({ error: "session revoked" });
  });

  it("returns 401 when the token does not match the hash", async () => {
    const { token } = generateApiKey();
    const row = await makeRow(token);
    const lookup: ApiKeyLookup = async () => row;
    const middleware = makeRequireApiKey({ lookup, updateLastUsed: noopUpdate });
    const { res, captured } = makeRes();
    // Use a different token that happens to share the same prefix shape but
    // doesn't match the stored hash.
    const wrong = generateApiKey().token;
    await middleware(makeReq(`Bearer ${wrong}`), res, () => undefined);
    expect(captured.status).toBe(401);
    expect(captured.body).toEqual({ error: "invalid api key" });
  });

  it("calls next() and populates req.session + req.wallet on success", async () => {
    const { token } = generateApiKey();
    const row = await makeRow(token);
    const lookup: ApiKeyLookup = async () => row;
    const middleware = makeRequireApiKey({ lookup, updateLastUsed: noopUpdate });
    const req = makeReq(`Bearer ${token}`) as AugRequest;
    const { res, captured } = makeRes();
    let nextCalled = false;
    await middleware(req, res, () => {
      nextCalled = true;
    });
    expect(nextCalled).toBe(true);
    expect(captured.status).toBe(null);
    expect(req.session).toEqual({
      id: row.sessionId,
      walletId: row.walletId,
      sessionPubkey: row.sessionPubkey,
    });
    expect(req.wallet).toEqual({
      id: row.walletId,
      vaultPda: row.vaultPda,
      usdcAta: row.usdcAta,
    });
  });

  it("invokes updateLastUsed on success", async () => {
    const { token } = generateApiKey();
    const row = await makeRow(token);
    // Wrapper-object so TS doesn't narrow `updatedFor` to null after the
    // closure assignment (flow analysis can't track let mutations through
    // a captured closure).
    const tracker: { updatedFor: string | null } = { updatedFor: null };
    const middleware = makeRequireApiKey({
      lookup: async () => row,
      updateLastUsed: async (id) => {
        tracker.updatedFor = id;
      },
    });
    await middleware(makeReq(`Bearer ${token}`), makeRes().res, () => undefined);
    // updateLastUsed is fire-and-forget — give it one microtask to resolve.
    await new Promise((r) => setTimeout(r, 0));
    expect(tracker.updatedFor).toBe(row.apiKeyId);
  });
});
