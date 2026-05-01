import { describe, expect, it } from "bun:test";
import { createHmac } from "node:crypto";
import { verifyDodoSignature } from "../../src/routes/dodo";

const SECRET = "wh_secret_test";

function sign(rawBody: Buffer, secret: string): string {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}

describe("verifyDodoSignature", () => {
  it("accepts the canonical hex digest of the raw body", () => {
    const body = Buffer.from('{"type":"payment.succeeded"}', "utf8");
    const sig = sign(body, SECRET);
    expect(verifyDodoSignature(body, sig, SECRET)).toBe(true);
  });

  it("rejects when the body is tampered with after signing", () => {
    const original = Buffer.from('{"amount":100}', "utf8");
    const sig = sign(original, SECRET);
    const tampered = Buffer.from('{"amount":9999}', "utf8");
    expect(verifyDodoSignature(tampered, sig, SECRET)).toBe(false);
  });

  it("rejects when the signing secret differs", () => {
    const body = Buffer.from('{"type":"x"}', "utf8");
    const sig = sign(body, "wrong");
    expect(verifyDodoSignature(body, sig, SECRET)).toBe(false);
  });

  it("rejects a missing or undefined header without throwing", () => {
    const body = Buffer.from("{}", "utf8");
    expect(verifyDodoSignature(body, undefined, SECRET)).toBe(false);
    expect(verifyDodoSignature(body, "", SECRET)).toBe(false);
  });

  it("rejects a wrong-length header without invoking timingSafeEqual", () => {
    // timingSafeEqual throws on different-length buffers — the verifier must
    // length-check first so a malformed header doesn't crash the route.
    const body = Buffer.from("{}", "utf8");
    expect(verifyDodoSignature(body, "deadbeef", SECRET)).toBe(false);
  });

  it("rejects non-hex characters in the header", () => {
    // Buffer.from(<non-hex>, 'hex') silently truncates — the length check on
    // the parsed buffer is what catches this case.
    const body = Buffer.from('{"a":1}', "utf8");
    const sig = sign(body, SECRET);
    // Replace last char with a non-hex char of same string length; parsed
    // buffer becomes shorter, length check fails.
    const malformed = `${sig.slice(0, -1)}Z`;
    expect(verifyDodoSignature(body, malformed, SECRET)).toBe(false);
  });
});
