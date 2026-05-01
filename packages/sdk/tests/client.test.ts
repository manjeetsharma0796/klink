import { describe, expect, test } from "bun:test";
import { KlinkApiError, KlinkClient } from "../src/client";
import type { FetchLike } from "../src/types";

function jsonResponse(status: number, body: unknown, headers?: Record<string, string>): Response {
  const h = new Headers({ "content-type": "application/json", ...headers });
  return new Response(JSON.stringify(body), { status, headers: h });
}

function textResponse(status: number, body: string, headers?: Record<string, string>): Response {
  const h = new Headers({ "content-type": "text/plain", ...headers });
  return new Response(body, { status, headers: h });
}

function makeClient(fetchFn: FetchLike): KlinkClient {
  return new KlinkClient({
    baseUrl: "https://api.klink.test",
    apiKey: "klink_dev_test123",
    fetch: fetchFn,
  });
}

// ---------------------------------------------------------------------------
// spend/transfer
// ---------------------------------------------------------------------------
describe("spendTransfer", () => {
  test("sends correct request and returns tx_signature", async () => {
    let captured: { url: string; init: RequestInit } | null = null;
    const client = makeClient(async (url, init) => {
      captured = { url: url as string, init: init! };
      return jsonResponse(200, { tx_signature: "abc123", status: "confirmed" });
    });

    const res = await client.spendTransfer({ recipient: "So1...", amount: 1000 });

    expect(res.tx_signature).toBe("abc123");
    expect(res.status).toBe("confirmed");
    expect(captured!.url).toBe("https://api.klink.test/v1/spend/transfer");
    expect(captured!.init.method).toBe("POST");
    expect((captured!.init.headers as Record<string, string>).authorization).toBe(
      "Bearer klink_dev_test123",
    );
    const body = JSON.parse(captured!.init.body as string);
    expect(body.recipient).toBe("So1...");
    expect(body.amount).toBe(1000);
  });

  test("sends optional memo", async () => {
    let body: Record<string, unknown> = {};
    const client = makeClient(async (_url, init) => {
      body = JSON.parse(init!.body as string);
      return jsonResponse(200, { tx_signature: "x", status: "confirmed" });
    });
    await client.spendTransfer({ recipient: "A", amount: 1, memo: "invoice-42" });
    expect(body.memo).toBe("invoice-42");
  });

  test("throws KlinkApiError on 403", async () => {
    const client = makeClient(async () => jsonResponse(403, { error: "OUTSIDE_TIME_WINDOW" }));
    try {
      await client.spendTransfer({ recipient: "A", amount: 1 });
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(KlinkApiError);
      const err = e as KlinkApiError;
      expect(err.status).toBe(403);
      expect(err.body.error).toBe("OUTSIDE_TIME_WINDOW");
    }
  });

  test("throws KlinkApiError on 402 with detail fields", async () => {
    const client = makeClient(async () =>
      jsonResponse(402, {
        error: "INSUFFICIENT_LIQUID",
        liquid: "500",
        amount: "1000",
        deficit: "500",
      }),
    );
    try {
      await client.spendTransfer({ recipient: "A", amount: 1000 });
      throw new Error("should have thrown");
    } catch (e) {
      const err = e as KlinkApiError;
      expect(err.status).toBe(402);
      expect(err.body.liquid).toBe("500");
      expect(err.body.deficit).toBe("500");
    }
  });
});

// ---------------------------------------------------------------------------
// spend/sign-payment
// ---------------------------------------------------------------------------
describe("spendSignPayment", () => {
  test("returns tx_signature and payment_proof_header", async () => {
    const client = makeClient(async () =>
      jsonResponse(200, { tx_signature: "sig1", payment_proof_header: "sig1" }),
    );
    const res = await client.spendSignPayment({
      url: "https://api.example.com/v1/chat",
      recipient: "R",
      amount: 500,
    });
    expect(res.tx_signature).toBe("sig1");
    expect(res.payment_proof_header).toBe("sig1");
  });

  test("sends optional payment_id", async () => {
    let body: Record<string, unknown> = {};
    const client = makeClient(async (_url, init) => {
      body = JSON.parse(init!.body as string);
      return jsonResponse(200, { tx_signature: "x", payment_proof_header: "x" });
    });
    await client.spendSignPayment({
      url: "https://a.com",
      recipient: "R",
      amount: 1,
      payment_id: "pid-1",
    });
    expect(body.payment_id).toBe("pid-1");
  });

  test("throws on URL_NOT_ALLOWED", async () => {
    const client = makeClient(async () => jsonResponse(403, { error: "URL_NOT_ALLOWED" }));
    try {
      await client.spendSignPayment({ url: "https://bad.com", recipient: "R", amount: 1 });
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as KlinkApiError).body.error).toBe("URL_NOT_ALLOWED");
    }
  });
});

// ---------------------------------------------------------------------------
// spend/service
// ---------------------------------------------------------------------------
describe("spendService", () => {
  test("returns status, headers, body, and tx_signature", async () => {
    const client = makeClient(async () =>
      textResponse(200, '{"result":"ok"}', { "x-tx-signature": "txSig99" }),
    );
    const res = await client.spendService({
      slug: "anthropic-claude",
      path: "/v1/messages",
      max_amount: 5000,
    });
    expect(res.status).toBe(200);
    expect(res.body).toBe('{"result":"ok"}');
    expect(res.tx_signature).toBe("txSig99");
  });

  test("returns undefined tx_signature when header absent", async () => {
    const client = makeClient(async () => textResponse(200, "ok"));
    const res = await client.spendService({ slug: "s", path: "/p", max_amount: 1 });
    expect(res.tx_signature).toBeUndefined();
  });

  test("does not throw on non-ok status (pass-through)", async () => {
    const client = makeClient(async () => textResponse(502, "upstream error"));
    const res = await client.spendService({ slug: "s", path: "/p", max_amount: 1 });
    expect(res.status).toBe(502);
    expect(res.body).toBe("upstream error");
  });
});

// ---------------------------------------------------------------------------
// yield/deposit + yield/withdraw
// ---------------------------------------------------------------------------
describe("yieldDeposit", () => {
  test("sends amount and returns tx_signature", async () => {
    let body: Record<string, unknown> = {};
    const client = makeClient(async (_url, init) => {
      body = JSON.parse(init!.body as string);
      return jsonResponse(200, { tx_signature: "depSig", status: "confirmed" });
    });
    const res = await client.yieldDeposit({ amount: 2000 });
    expect(body.amount).toBe(2000);
    expect(res.tx_signature).toBe("depSig");
  });

  test("throws on 402 (deposit revert)", async () => {
    const client = makeClient(async () =>
      jsonResponse(402, {
        error: "on-chain submission failed",
        detail: "DeployedFractionExceeded",
      }),
    );
    try {
      await client.yieldDeposit({ amount: 99999 });
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as KlinkApiError).status).toBe(402);
    }
  });
});

describe("yieldWithdraw", () => {
  test("sends amount and returns tx_signature", async () => {
    const client = makeClient(async () =>
      jsonResponse(200, { tx_signature: "wdSig", status: "confirmed" }),
    );
    const res = await client.yieldWithdraw({ amount: 500 });
    expect(res.tx_signature).toBe("wdSig");
  });

  test("throws on 409 (partial liquidity)", async () => {
    const client = makeClient(async () =>
      jsonResponse(409, { error: "on-chain submission failed", detail: "partial" }),
    );
    try {
      await client.yieldWithdraw({ amount: 1 });
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as KlinkApiError).status).toBe(409);
    }
  });
});

// ---------------------------------------------------------------------------
// yield/position
// ---------------------------------------------------------------------------
describe("yieldPosition", () => {
  test("GET with no body, returns deployed + accrued", async () => {
    let captured: { method: string; body: string | null } | null = null;
    const client = makeClient(async (_url, init) => {
      captured = { method: init!.method!, body: (init!.body as string) ?? null };
      return jsonResponse(200, { deployed: "5000", accrued: null, total_balance: "5000" });
    });
    const res = await client.yieldPosition();
    expect(captured!.method).toBe("GET");
    expect(captured!.body).toBeNull();
    expect(res.deployed).toBe("5000");
    expect(res.accrued).toBeNull();
    expect(res.total_balance).toBe("5000");
  });
});

// ---------------------------------------------------------------------------
// baseUrl trailing slash normalization
// ---------------------------------------------------------------------------
describe("baseUrl normalization", () => {
  test("strips trailing slash from baseUrl", async () => {
    let url = "";
    const client = new KlinkClient({
      baseUrl: "https://api.klink.test/",
      apiKey: "k",
      fetch: async (u) => {
        url = u as string;
        return jsonResponse(200, { deployed: "0", accrued: null, total_balance: "0" });
      },
    });
    await client.yieldPosition();
    expect(url).toBe("https://api.klink.test/v1/yield/position");
  });
});

// ---------------------------------------------------------------------------
// KlinkApiError
// ---------------------------------------------------------------------------
describe("KlinkApiError", () => {
  test("has correct name and message", () => {
    const err = new KlinkApiError(402, { error: "INSUFFICIENT_LIQUID" });
    expect(err.name).toBe("KlinkApiError");
    expect(err.message).toBe("INSUFFICIENT_LIQUID");
    expect(err.status).toBe(402);
  });

  test("handles non-JSON error responses gracefully", async () => {
    const client = makeClient(async () => new Response("not json", { status: 500 }));
    try {
      await client.spendTransfer({ recipient: "A", amount: 1 });
      throw new Error("should have thrown");
    } catch (e) {
      const err = e as KlinkApiError;
      expect(err.status).toBe(500);
      expect(err.body.error).toBe("Internal Server Error");
    }
  });
});
