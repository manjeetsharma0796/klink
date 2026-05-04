import { describe, expect, it } from "bun:test";
import { createHmac } from "node:crypto";
import { verifyDodoSignature } from "../../src/routes/dodo";

// --- Standard Webhooks fixture helpers ---------------------------------------
//
// Dodo Payments signs webhooks per https://www.standardwebhooks.com/. The
// "whsec_" prefix on a real secret strips, and the remainder is base64-
// decoded to produce the actual HMAC-SHA256 key. The signed payload is the
// literal byte string `${webhook-id}.${webhook-timestamp}.${rawBody}`.
//
// We compute fixtures with the SAME byte semantics here so the unit tests
// exercise the algorithm verifyDodoSignature must implement, not a
// closed-loop replay of its own internals.

/**
 * 24-byte fixture key, base64-encoded. Random ASCII bytes — NOT the live
 * webhook secret. The verification algorithm under test is independent of
 * the secret's actual contents, so a fixture suffices.
 */
const SECRET_B64 = "QUJDREVGR0hJSktMTU5PUFFSU1RVVldY";
const SECRET_PREFIXED = `whsec_${SECRET_B64}`;
const KEY_BYTES = Buffer.from(SECRET_B64, "base64");

const FIXED_NOW_S = 1_714_719_283;
const fixedNow = () => FIXED_NOW_S;

interface SignArgs {
  id: string;
  ts: string;
  body: Buffer;
  key?: Buffer;
}
function signOne({ id, ts, body, key = KEY_BYTES }: SignArgs): string {
  const payload = Buffer.concat([
    Buffer.from(id, "utf8"),
    Buffer.from(".", "utf8"),
    Buffer.from(ts, "utf8"),
    Buffer.from(".", "utf8"),
    body,
  ]);
  return `v1,${createHmac("sha256", key).update(payload).digest("base64")}`;
}

describe("verifyDodoSignature (Standard Webhooks)", () => {
  it("accepts a correctly-signed webhook with the whsec_-prefixed secret", () => {
    const id = "msg_abc123";
    const ts = String(FIXED_NOW_S);
    const body = Buffer.from('{"type":"payment.succeeded","data":{"id":"sess_1"}}', "utf8");
    const sig = signOne({ id, ts, body });
    expect(
      verifyDodoSignature({
        rawBody: body,
        webhookId: id,
        webhookTimestamp: ts,
        webhookSignature: sig,
        secret: SECRET_PREFIXED,
        now: fixedNow,
      }),
    ).toBe(true);
  });

  it("accepts the same signature when the secret is passed without whsec_ prefix", () => {
    // Some integrations strip the prefix before storing — both forms must work.
    const id = "msg_x";
    const ts = String(FIXED_NOW_S);
    const body = Buffer.from('{"a":1}', "utf8");
    const sig = signOne({ id, ts, body });
    expect(
      verifyDodoSignature({
        rawBody: body,
        webhookId: id,
        webhookTimestamp: ts,
        webhookSignature: sig,
        secret: SECRET_B64,
        now: fixedNow,
      }),
    ).toBe(true);
  });

  it("rejects when the body is tampered with after signing", () => {
    const id = "msg_t";
    const ts = String(FIXED_NOW_S);
    const original = Buffer.from('{"amount":100}', "utf8");
    const sig = signOne({ id, ts, body: original });
    const tampered = Buffer.from('{"amount":9999}', "utf8");
    expect(
      verifyDodoSignature({
        rawBody: tampered,
        webhookId: id,
        webhookTimestamp: ts,
        webhookSignature: sig,
        secret: SECRET_PREFIXED,
        now: fixedNow,
      }),
    ).toBe(false);
  });

  it("rejects when the signing secret differs", () => {
    const id = "msg_s";
    const ts = String(FIXED_NOW_S);
    const body = Buffer.from('{"x":1}', "utf8");
    // Sign with a different key — a different 24 random bytes.
    const wrongKey = Buffer.alloc(24, 7);
    const sig = signOne({ id, ts, body, key: wrongKey });
    expect(
      verifyDodoSignature({
        rawBody: body,
        webhookId: id,
        webhookTimestamp: ts,
        webhookSignature: sig,
        secret: SECRET_PREFIXED,
        now: fixedNow,
      }),
    ).toBe(false);
  });

  it("rejects when any of the three webhook-* headers are missing", () => {
    const id = "msg_m";
    const ts = String(FIXED_NOW_S);
    const body = Buffer.from("{}", "utf8");
    const sig = signOne({ id, ts, body });
    const baseOpts = {
      rawBody: body,
      webhookId: id,
      webhookTimestamp: ts,
      webhookSignature: sig,
      secret: SECRET_PREFIXED,
      now: fixedNow,
    };
    expect(verifyDodoSignature({ ...baseOpts, webhookId: undefined })).toBe(false);
    expect(verifyDodoSignature({ ...baseOpts, webhookTimestamp: undefined })).toBe(false);
    expect(verifyDodoSignature({ ...baseOpts, webhookSignature: undefined })).toBe(false);
    expect(verifyDodoSignature({ ...baseOpts, webhookSignature: "" })).toBe(false);
  });

  it("rejects when the timestamp is more than 300s in the past", () => {
    const id = "msg_old";
    const tsNum = FIXED_NOW_S - 301;
    const ts = String(tsNum);
    const body = Buffer.from("{}", "utf8");
    const sig = signOne({ id, ts, body });
    expect(
      verifyDodoSignature({
        rawBody: body,
        webhookId: id,
        webhookTimestamp: ts,
        webhookSignature: sig,
        secret: SECRET_PREFIXED,
        now: fixedNow,
      }),
    ).toBe(false);
  });

  it("rejects when the timestamp is more than 300s in the future", () => {
    const id = "msg_future";
    const tsNum = FIXED_NOW_S + 301;
    const ts = String(tsNum);
    const body = Buffer.from("{}", "utf8");
    const sig = signOne({ id, ts, body });
    expect(
      verifyDodoSignature({
        rawBody: body,
        webhookId: id,
        webhookTimestamp: ts,
        webhookSignature: sig,
        secret: SECRET_PREFIXED,
        now: fixedNow,
      }),
    ).toBe(false);
  });

  it("accepts a timestamp at the boundary (exactly 300s drift)", () => {
    const id = "msg_edge";
    const ts = String(FIXED_NOW_S - 300);
    const body = Buffer.from("{}", "utf8");
    const sig = signOne({ id, ts, body });
    expect(
      verifyDodoSignature({
        rawBody: body,
        webhookId: id,
        webhookTimestamp: ts,
        webhookSignature: sig,
        secret: SECRET_PREFIXED,
        now: fixedNow,
      }),
    ).toBe(true);
  });

  it("accepts a multi-sig header where any v1 signature matches", () => {
    // Dodo can rotate keys and emit multiple signatures during the cutover. Any
    // v1 token that matches the current secret should validate the message.
    const id = "msg_multi";
    const ts = String(FIXED_NOW_S);
    const body = Buffer.from('{"y":2}', "utf8");
    const goodSig = signOne({ id, ts, body });
    const badSig = "v1,YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXowMTIzNDU="; // 32-byte base64 noise
    // Ordering shouldn't matter — both orderings should accept.
    expect(
      verifyDodoSignature({
        rawBody: body,
        webhookId: id,
        webhookTimestamp: ts,
        webhookSignature: `${badSig} ${goodSig}`,
        secret: SECRET_PREFIXED,
        now: fixedNow,
      }),
    ).toBe(true);
    expect(
      verifyDodoSignature({
        rawBody: body,
        webhookId: id,
        webhookTimestamp: ts,
        webhookSignature: `${goodSig} ${badSig}`,
        secret: SECRET_PREFIXED,
        now: fixedNow,
      }),
    ).toBe(true);
  });

  it("rejects a multi-sig header where every signature is wrong", () => {
    const id = "msg_allbad";
    const ts = String(FIXED_NOW_S);
    const body = Buffer.from("{}", "utf8");
    const bad1 = "v1,YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXowMTIzNDU=";
    const bad2 = "v1,MDEyMzQ1Njc4OUFCQ0RFRkdISUpLTE1OT1BRUlNUVVZX";
    expect(
      verifyDodoSignature({
        rawBody: body,
        webhookId: id,
        webhookTimestamp: ts,
        webhookSignature: `${bad1} ${bad2}`,
        secret: SECRET_PREFIXED,
        now: fixedNow,
      }),
    ).toBe(false);
  });

  it("ignores unknown signature versions (v0, v2, …) and only accepts v1", () => {
    const id = "msg_ver";
    const ts = String(FIXED_NOW_S);
    const body = Buffer.from('{"v":1}', "utf8");
    const v1 = signOne({ id, ts, body });
    // Replace v1 with v2 — current spec is v1-only; this should reject.
    const v2 = v1.replace(/^v1,/, "v2,");
    expect(
      verifyDodoSignature({
        rawBody: body,
        webhookId: id,
        webhookTimestamp: ts,
        webhookSignature: v2,
        secret: SECRET_PREFIXED,
        now: fixedNow,
      }),
    ).toBe(false);
  });

  it("doesn't crash on malformed signature header content (non-base64, missing comma, garbage)", () => {
    const id = "msg_bad";
    const ts = String(FIXED_NOW_S);
    const body = Buffer.from("{}", "utf8");
    const opts = {
      rawBody: body,
      webhookId: id,
      webhookTimestamp: ts,
      secret: SECRET_PREFIXED,
      now: fixedNow,
    } as const;
    expect(verifyDodoSignature({ ...opts, webhookSignature: "totally-garbage" })).toBe(false);
    expect(verifyDodoSignature({ ...opts, webhookSignature: "v1," })).toBe(false);
    expect(verifyDodoSignature({ ...opts, webhookSignature: "v1,!!!notbase64!!!" })).toBe(false);
    expect(verifyDodoSignature({ ...opts, webhookSignature: ",,," })).toBe(false);
  });

  it("doesn't crash on a non-numeric timestamp", () => {
    const id = "msg_ts";
    const body = Buffer.from("{}", "utf8");
    const sig = signOne({ id, ts: "not-a-number", body });
    expect(
      verifyDodoSignature({
        rawBody: body,
        webhookId: id,
        webhookTimestamp: "not-a-number",
        webhookSignature: sig,
        secret: SECRET_PREFIXED,
        now: fixedNow,
      }),
    ).toBe(false);
  });
});
