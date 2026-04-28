import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { SignJWT } from "jose";
import { verifyKlinkJwt } from "../lib/jwt";

const TEST_SECRET = "0".repeat(64);

let originalSecret: string | undefined;

beforeAll(() => {
  originalSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = TEST_SECRET;
});

afterAll(() => {
  if (originalSecret === undefined) process.env.JWT_SECRET = undefined;
  else process.env.JWT_SECRET = originalSecret;
});

async function sign(payload: Record<string, unknown>, opts: { sub?: string; expiresIn?: string }) {
  const builder = new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(opts.expiresIn ?? "1h");
  if (opts.sub) builder.setSubject(opts.sub);
  return builder.sign(new TextEncoder().encode(TEST_SECRET));
}

describe("verifyKlinkJwt", () => {
  test("returns userId + pubkey for a valid token", async () => {
    const token = await sign({ pubkey: "PK1" }, { sub: "u-1" });
    const session = await verifyKlinkJwt(token);
    expect(session).toEqual({ userId: "u-1", pubkey: "PK1" });
  });

  test("returns null when the secret is wrong", async () => {
    const token = await new SignJWT({ pubkey: "PK1" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("u-1")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode("1".repeat(64)));
    expect(await verifyKlinkJwt(token)).toBeNull();
  });

  test("returns null when sub is missing", async () => {
    const token = await sign({ pubkey: "PK1" }, {});
    expect(await verifyKlinkJwt(token)).toBeNull();
  });

  test("returns null when pubkey claim is missing", async () => {
    const token = await sign({}, { sub: "u-1" });
    expect(await verifyKlinkJwt(token)).toBeNull();
  });

  test("returns null for an expired token", async () => {
    const token = await sign({ pubkey: "PK1" }, { sub: "u-1", expiresIn: "0s" });
    // Tokens with exp in the past are immediately invalid.
    expect(await verifyKlinkJwt(token)).toBeNull();
  });

  test("returns null for garbage input", async () => {
    expect(await verifyKlinkJwt("not.a.jwt")).toBeNull();
  });
});
