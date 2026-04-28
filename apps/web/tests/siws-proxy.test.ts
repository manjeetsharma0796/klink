import { describe, expect, test } from "bun:test";
import { siwsMessage } from "../lib/siws-message";
import { type FetchLike, proxyNonce, proxySiws } from "../lib/siws-proxy";

const API_BASE = "http://api.test";

function fakeFetch(handler: (req: Request) => Response | Promise<Response>): FetchLike {
  return ((input: RequestInfo | URL, init?: RequestInit) => {
    const req =
      input instanceof Request
        ? input
        : new Request(typeof input === "string" ? input : input.toString(), init);
    return Promise.resolve(handler(req));
  }) as FetchLike;
}

describe("siwsMessage", () => {
  test("matches the apps/api format exactly", () => {
    expect(siwsMessage("abc123")).toBe("Sign in to klink: abc123");
  });
});

describe("proxyNonce", () => {
  test("POSTs to /v1/auth/siws/nonce and forwards the body", async () => {
    let calledUrl = "";
    let calledMethod = "";
    const fetch = fakeFetch((req) => {
      calledUrl = req.url;
      calledMethod = req.method;
      return new Response(JSON.stringify({ nonce: "deadbeef" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const result = await proxyNonce({ apiBase: API_BASE, fetch });
    expect(calledUrl).toBe(`${API_BASE}/v1/auth/siws/nonce`);
    expect(calledMethod).toBe("POST");
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ nonce: "deadbeef" });
    expect(result.jwt).toBeUndefined();
  });

  test("forwards upstream errors as-is", async () => {
    const fetch = fakeFetch(
      () =>
        new Response(JSON.stringify({ error: "redis down" }), {
          status: 502,
          headers: { "content-type": "application/json" },
        }),
    );
    const result = await proxyNonce({ apiBase: API_BASE, fetch });
    expect(result.status).toBe(502);
    expect(result.body).toEqual({ error: "redis down" });
  });
});

describe("proxySiws", () => {
  test("rejects malformed input with 400", async () => {
    const fetch = fakeFetch(() => {
      throw new Error("upstream should not be called");
    });
    const result = await proxySiws(
      { pubkey: 123, signature: "x", nonce: "y" },
      {
        apiBase: API_BASE,
        fetch,
      },
    );
    expect(result.status).toBe(400);
    expect(result.body).toEqual({ error: "pubkey, signature, nonce required (strings)" });
    expect(result.jwt).toBeUndefined();
  });

  test("strips the JWT from the response body and surfaces it on `jwt`", async () => {
    let upstreamBody: unknown;
    const fetch = fakeFetch(async (req) => {
      upstreamBody = await req.json();
      return new Response(JSON.stringify({ token: "JWT.value", userId: "u-1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const result = await proxySiws(
      { pubkey: "pk", signature: "sig", nonce: "n1" },
      { apiBase: API_BASE, fetch },
    );

    expect(upstreamBody).toEqual({ pubkey: "pk", signature: "sig", nonce: "n1" });
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ userId: "u-1" });
    expect(result.jwt).toBe("JWT.value");
  });

  test("forwards upstream 401 (bad nonce / signature) without a cookie", async () => {
    const fetch = fakeFetch(
      () =>
        new Response(JSON.stringify({ error: "nonce unknown or already used" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        }),
    );
    const result = await proxySiws(
      { pubkey: "pk", signature: "sig", nonce: "n1" },
      { apiBase: API_BASE, fetch },
    );
    expect(result.status).toBe(401);
    expect(result.body).toEqual({ error: "nonce unknown or already used" });
    expect(result.jwt).toBeUndefined();
  });

  test("treats a 200 with a malformed body as upstream-error (no cookie)", async () => {
    const fetch = fakeFetch(
      () =>
        new Response(JSON.stringify({ wrong: "shape" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const result = await proxySiws(
      { pubkey: "pk", signature: "sig", nonce: "n1" },
      { apiBase: API_BASE, fetch },
    );
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ wrong: "shape" });
    expect(result.jwt).toBeUndefined();
  });
});
