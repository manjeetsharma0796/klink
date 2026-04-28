import { describe, expect, it } from "bun:test";
import type { NextFunction, Request, Response } from "express";
import { type KlinkUser, makeRequireDashboardJwt } from "../../src/auth/jwt";

type AugRequest = Request & { user?: KlinkUser };

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

const SAMPLE_USER: KlinkUser = {
  id: "user-uuid-1",
  pubkey: "11111111111111111111111111111112", // System program — valid base58
};

describe("requireDashboardJwt", () => {
  it("rejects missing Authorization header with 401", async () => {
    const middleware = makeRequireDashboardJwt({ verify: async () => SAMPLE_USER });
    const req = makeReq();
    const { res, captured } = makeRes();
    let nextCalled = false;
    await middleware(req, res, (() => {
      nextCalled = true;
    }) as NextFunction);
    expect(captured.status).toBe(401);
    expect(captured.body).toEqual({ error: "missing bearer token" });
    expect(nextCalled).toBe(false);
  });

  it("rejects non-Bearer scheme with 401", async () => {
    const middleware = makeRequireDashboardJwt({ verify: async () => SAMPLE_USER });
    const req = makeReq("Basic Zm9vOmJhcg==");
    const { res, captured } = makeRes();
    await middleware(req, res, (() => undefined) as NextFunction);
    expect(captured.status).toBe(401);
    expect(captured.body).toEqual({ error: "missing bearer token" });
  });

  it("rejects Bearer with empty token with 401", async () => {
    const middleware = makeRequireDashboardJwt({ verify: async () => SAMPLE_USER });
    const req = makeReq("Bearer   ");
    const { res, captured } = makeRes();
    await middleware(req, res, (() => undefined) as NextFunction);
    expect(captured.status).toBe(401);
    expect(captured.body).toEqual({ error: "missing bearer token" });
  });

  it("rejects when verifier throws (invalid token)", async () => {
    const middleware = makeRequireDashboardJwt({
      verify: async () => {
        throw new Error("bad signature");
      },
    });
    const req = makeReq("Bearer not.a.real.jwt");
    const { res, captured } = makeRes();
    let nextCalled = false;
    await middleware(req, res, (() => {
      nextCalled = true;
    }) as NextFunction);
    expect(captured.status).toBe(401);
    expect(captured.body).toEqual({ error: "invalid jwt" });
    expect(nextCalled).toBe(false);
  });

  it("populates req.user and calls next() on valid token", async () => {
    const middleware = makeRequireDashboardJwt({ verify: async () => SAMPLE_USER });
    const req = makeReq("Bearer fake.jwt.token") as AugRequest;
    const { res, captured } = makeRes();
    let nextCalled = false;
    await middleware(req, res, (() => {
      nextCalled = true;
    }) as NextFunction);
    expect(captured.status).toBeNull();
    expect(nextCalled).toBe(true);
    expect(req.user).toEqual(SAMPLE_USER);
  });

  it("forwards the exact token (sans 'Bearer ' prefix) to the verifier", async () => {
    // Wrapper object so TS doesn't narrow the closure-mutated value to its
    // initial null.
    const captured: { value: string | null } = { value: null };
    const middleware = makeRequireDashboardJwt({
      verify: async (token) => {
        captured.value = token;
        return SAMPLE_USER;
      },
    });
    const req = makeReq("Bearer abc.def.ghi");
    const { res } = makeRes();
    await middleware(req, res, (() => undefined) as NextFunction);
    expect(captured.value).toBe("abc.def.ghi");
  });
});
