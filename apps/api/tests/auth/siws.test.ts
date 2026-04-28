import { describe, expect, it } from "bun:test";
import bs58 from "bs58";
import type { Request, Response } from "express";
import { jwtVerify } from "jose";
import nacl from "tweetnacl";
import { type NonceStore, makeSiwsHandlers, siwsMessage } from "../../src/auth/siws";

class FakeNonceStore implements NonceStore {
  private map = new Map<string, string>();
  async setex(key: string, _ttlSeconds: number, value: string) {
    this.map.set(key, value);
  }
  async getdel(key: string): Promise<string | null> {
    const v = this.map.get(key);
    if (v === undefined) return null;
    this.map.delete(key);
    return v;
  }
  size(): number {
    return this.map.size;
  }
}

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

function makeReq(body: unknown = undefined): Request {
  return { body } as unknown as Request;
}

const TEST_JWT_SECRET = "0".repeat(64); // 32-byte hex

describe("siwsMessage", () => {
  it("formats message exactly as 'Sign in to klink: <nonce>'", () => {
    expect(siwsMessage("abc123")).toBe("Sign in to klink: abc123");
  });
});

describe("nonce endpoint", () => {
  it("stores a nonce in the store with 60s TTL and returns it", async () => {
    const store = new FakeNonceStore();
    const handlers = makeSiwsHandlers({
      store,
      generateNonce: () => "fixed-nonce",
    });
    const { res, captured } = makeRes();
    await handlers.nonce(makeReq(), res);
    expect(captured.body).toEqual({ nonce: "fixed-nonce" });
    expect(store.size()).toBe(1);
  });

  it("each call produces a new nonce when using the default generator", async () => {
    const store = new FakeNonceStore();
    const handlers = makeSiwsHandlers({ store });
    const a = makeRes();
    const b = makeRes();
    await handlers.nonce(makeReq(), a.res);
    await handlers.nonce(makeReq(), b.res);
    expect(a.captured.body).not.toEqual(b.captured.body);
    expect(store.size()).toBe(2);
  });
});

describe("siws verify endpoint", () => {
  function setup() {
    const store = new FakeNonceStore();
    const handlers = makeSiwsHandlers({
      store,
      upsertUser: async () => "44444444-4444-4444-4444-444444444444",
      signJwt: async (userId, pubkey) => {
        const { SignJWT } = await import("jose");
        return new SignJWT({ pubkey })
          .setProtectedHeader({ alg: "HS256" })
          .setSubject(userId)
          .setIssuedAt()
          .setExpirationTime("24h")
          .sign(new TextEncoder().encode(TEST_JWT_SECRET));
      },
    });
    return { store, handlers };
  }

  function signedPayload(nonce: string) {
    const keypair = nacl.sign.keyPair();
    const message = new TextEncoder().encode(siwsMessage(nonce));
    const signature = nacl.sign.detached(message, keypair.secretKey);
    return {
      pubkey: bs58.encode(keypair.publicKey),
      signature: bs58.encode(signature),
      nonce,
    };
  }

  it("issues a JWT for a valid signature with a known nonce", async () => {
    const { store, handlers } = setup();
    await store.setex("siws_nonce:n1", 60, "1");
    const body = signedPayload("n1");
    const { res, captured } = makeRes();
    await handlers.siws(makeReq(body), res);

    expect(captured.status).toBe(null);
    expect(captured.body).toMatchObject({
      userId: "44444444-4444-4444-4444-444444444444",
    });
    const token = (captured.body as { token: string }).token;
    const verified = await jwtVerify(token, new TextEncoder().encode(TEST_JWT_SECRET));
    expect(verified.payload.sub).toBe("44444444-4444-4444-4444-444444444444");
    expect(verified.payload.pubkey).toBe(body.pubkey);
  });

  it("rejects when nonce was never issued", async () => {
    const { handlers } = setup(); // no setex
    const body = signedPayload("never-stored");
    const { res, captured } = makeRes();
    await handlers.siws(makeReq(body), res);
    expect(captured.status).toBe(401);
    expect(captured.body).toEqual({ error: "nonce unknown or already used" });
  });

  it("rejects replay — same signature + same nonce twice (single-use)", async () => {
    const { store, handlers } = setup();
    await store.setex("siws_nonce:replay", 60, "1");
    const body = signedPayload("replay");

    // First call: succeeds
    const first = makeRes();
    await handlers.siws(makeReq(body), first.res);
    expect(first.captured.status).toBe(null);

    // Second call: same body — nonce was consumed by getdel
    const second = makeRes();
    await handlers.siws(makeReq(body), second.res);
    expect(second.captured.status).toBe(401);
    expect(second.captured.body).toEqual({ error: "nonce unknown or already used" });
  });

  it("rejects when signature is for a different message", async () => {
    const { store, handlers } = setup();
    await store.setex("siws_nonce:legit", 60, "1");
    // Sign the wrong message but submit with the legit nonce
    const keypair = nacl.sign.keyPair();
    const wrongMessage = new TextEncoder().encode("Sign in to klink: different");
    const sig = nacl.sign.detached(wrongMessage, keypair.secretKey);
    const body = {
      pubkey: bs58.encode(keypair.publicKey),
      signature: bs58.encode(sig),
      nonce: "legit",
    };
    const { res, captured } = makeRes();
    await handlers.siws(makeReq(body), res);
    expect(captured.status).toBe(401);
    expect(captured.body).toEqual({ error: "invalid signature" });
  });

  it("rejects when pubkey doesn't match the signing key", async () => {
    const { store, handlers } = setup();
    await store.setex("siws_nonce:swapped", 60, "1");
    const a = nacl.sign.keyPair();
    const b = nacl.sign.keyPair();
    const message = new TextEncoder().encode(siwsMessage("swapped"));
    const sig = nacl.sign.detached(message, a.secretKey);
    const body = {
      // Submit B's pubkey with A's signature.
      pubkey: bs58.encode(b.publicKey),
      signature: bs58.encode(sig),
      nonce: "swapped",
    };
    const { res, captured } = makeRes();
    await handlers.siws(makeReq(body), res);
    expect(captured.status).toBe(401);
  });

  it("returns 400 when fields are missing", async () => {
    const { handlers } = setup();
    const { res, captured } = makeRes();
    await handlers.siws(makeReq({ pubkey: "abc" }), res); // missing signature/nonce
    expect(captured.status).toBe(400);
  });

  it("returns 400 when pubkey is not valid base58", async () => {
    const { store, handlers } = setup();
    await store.setex("siws_nonce:badbase58", 60, "1");
    const { res, captured } = makeRes();
    await handlers.siws(
      makeReq({
        pubkey: "0NotBase58!",
        signature: bs58.encode(new Uint8Array(64)),
        nonce: "badbase58",
      }),
      res,
    );
    // bs58.decode throws on invalid input → 400 base58 error
    expect(captured.status).toBe(400);
  });

  it("returns 400 when pubkey is wrong length", async () => {
    const { store, handlers } = setup();
    await store.setex("siws_nonce:shortpubkey", 60, "1");
    const { res, captured } = makeRes();
    await handlers.siws(
      makeReq({
        pubkey: bs58.encode(new Uint8Array(16)), // wrong length
        signature: bs58.encode(new Uint8Array(64)),
        nonce: "shortpubkey",
      }),
      res,
    );
    expect(captured.status).toBe(400);
    expect(captured.body).toEqual({ error: "pubkey must be 32 bytes" });
  });
});
