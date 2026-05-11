import { describe, expect, it } from "bun:test";
import {
  buildMppAuthorizationHeader,
  decodeMppRequestPayload,
  parseMppChallenge,
} from "../../src/routes/spend";

// Sample WWW-Authenticate header from a real MPP echo at
// https://service01-kep9.onrender.com/echo (devnet, captured 2026-05-11).
// Kept verbatim so a future MPP spec drift triggers a test failure rather
// than silently breaking the handler.
const SAMPLE_WWW_AUTH = `Payment id="WsJ0FDUJkaGj-gfUuFOLtg-tNBbg6DXZED1a-WOPVbc", realm="service01-kep9.onrender.com", method="solana", intent="charge", request="eyJhbW91bnQiOiIxMDAwMCIsImN1cnJlbmN5IjoiNHpNTUM5c3J0NVJpNVgxNEdBZ1hoYUhpaTNHblBBRUVSWVBKZ1pKRG5jRFUiLCJtZXRob2REZXRhaWxzIjp7ImRlY2ltYWxzIjo2LCJuZXR3b3JrIjoiZGV2bmV0IiwicmVjZW50QmxvY2toYXNoIjoiQVk5Zml4cTh5QlBvTTJBUnF1MW5kTUZYbVp4bjRDRGs0Y2VMNXlxWVBoU0siLCJ0b2tlblByb2dyYW0iOiJUb2tlbmtlZ1FmZVp5aU53QUpiTmJHS1BGWENXdUJ2ZjlTczYyM1ZRNURBIn0sInJlY2lwaWVudCI6IjgxZU0zb1BSMWZVSlNzRmhObTZHNTFXNGp3RTJIb25kUzJrakJtY3hGY0oyIn0", description="Klink MPP echo - paid response with timestamp and request ID", expires="2026-05-11T03:38:04.822Z", opaque="eyJfbXBweF9zY29wZSI6IkdFVCAvZWNobyJ9"`;

describe("parseMppChallenge", () => {
  it("parses a real MPP echo WWW-Authenticate header into all required fields", () => {
    const c = parseMppChallenge(SAMPLE_WWW_AUTH);
    expect(c).not.toBeNull();
    if (!c) return;
    expect(c.id).toBe("WsJ0FDUJkaGj-gfUuFOLtg-tNBbg6DXZED1a-WOPVbc");
    expect(c.realm).toBe("service01-kep9.onrender.com");
    expect(c.method).toBe("solana");
    expect(c.intent).toBe("charge");
    expect(c.expires).toBe("2026-05-11T03:38:04.822Z");
    expect(c.opaque).toBe("eyJfbXBweF9zY29wZSI6IkdFVCAvZWNobyJ9");
    expect(typeof c.request).toBe("string");
    expect(c.request.length).toBeGreaterThan(50);
  });

  it("accepts case-insensitive 'Payment' scheme prefix", () => {
    const lower = SAMPLE_WWW_AUTH.replace(/^Payment /, "payment ");
    expect(parseMppChallenge(lower)).not.toBeNull();
  });

  it("returns null when the scheme isn't Payment", () => {
    expect(parseMppChallenge('Bearer realm="x"')).toBeNull();
  });

  it("returns null when a required field is missing (no expires)", () => {
    const trimmed = SAMPLE_WWW_AUTH.replace(/, expires="[^"]*"/, "");
    expect(parseMppChallenge(trimmed)).toBeNull();
  });

  it("returns null when a required field is missing (no request)", () => {
    const trimmed = SAMPLE_WWW_AUTH.replace(/, request="[^"]*"/, "");
    expect(parseMppChallenge(trimmed)).toBeNull();
  });

  it("unescapes backslash-escaped quotes inside values", () => {
    const c = parseMppChallenge(
      'Payment id="a", realm="r", method="solana", intent="charge", request="r", expires="e", description="say \\"hi\\""',
    );
    expect(c?.description).toBe('say "hi"');
  });
});

describe("decodeMppRequestPayload", () => {
  it("decodes the base64url request payload from the real challenge", () => {
    const c = parseMppChallenge(SAMPLE_WWW_AUTH);
    expect(c).not.toBeNull();
    if (!c) return;
    const payload = decodeMppRequestPayload(c.request);
    expect(payload).not.toBeNull();
    if (!payload) return;
    expect(payload.amount).toBe("10000");
    expect(payload.currency).toBe("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
    expect(payload.recipient).toBe("81eM3oPR1fUJSsFhNm6G51W4jwE2HondS2kjBmcxFcJ2");
    expect(payload.methodDetails.network).toBe("devnet");
    expect(payload.methodDetails.decimals).toBe(6);
    expect(payload.methodDetails.recentBlockhash).toBe(
      "AY9fixq8yBPoM2ARqu1ndMFXmZxn4CDk4ceL5yqYPhSK",
    );
    expect(payload.methodDetails.tokenProgram).toBe(
      "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    );
  });

  it("returns null for non-JSON garbage", () => {
    expect(decodeMppRequestPayload("not-base64url!!")).toBeNull();
  });

  it("returns null when required fields are missing", () => {
    const partial = Buffer.from(JSON.stringify({ amount: "10000" })).toString("base64url");
    expect(decodeMppRequestPayload(partial)).toBeNull();
  });

  it("returns null when methodDetails.recentBlockhash is missing", () => {
    const partial = Buffer.from(
      JSON.stringify({
        amount: "10000",
        currency: "MINT",
        recipient: "REC",
        methodDetails: { network: "devnet", decimals: 6, tokenProgram: "TP" },
      }),
    ).toString("base64url");
    expect(decodeMppRequestPayload(partial)).toBeNull();
  });
});

describe("buildMppAuthorizationHeader", () => {
  it("emits a Payment-scheme header whose token round-trips back to the challenge + signature", () => {
    const c = parseMppChallenge(SAMPLE_WWW_AUTH);
    expect(c).not.toBeNull();
    if (!c) return;

    const SIG =
      "26ALiMrufrqF945L8kwGdquca8Knc7KPwWkGHPBbHvFBYMFHBLjvPdwMfgUTC6QSq875dYE9iyrJ3SWps1aDqidz";
    const header = buildMppAuthorizationHeader(c, SIG);

    expect(header.startsWith("Payment ")).toBe(true);
    const token = header.slice("Payment ".length);
    const decoded = JSON.parse(Buffer.from(token, "base64url").toString("utf8"));

    expect(decoded.payload).toEqual({ type: "signature", signature: SIG });
    expect(decoded.challenge.id).toBe(c.id);
    expect(decoded.challenge.realm).toBe(c.realm);
    expect(decoded.challenge.request).toBe(c.request);
    expect(decoded.challenge.expires).toBe(c.expires);
    expect(decoded.challenge.opaque).toBe(c.opaque);
  });

  it("never produces an Authorization that contains X-Payment-Proof — MPP explicitly forbids it", () => {
    const c = parseMppChallenge(SAMPLE_WWW_AUTH);
    if (!c) throw new Error("setup");
    const header = buildMppAuthorizationHeader(c, "sig");
    expect(header.toLowerCase()).not.toContain("x-payment-proof");
    expect(header.toLowerCase()).not.toContain("x-payment");
  });
});
