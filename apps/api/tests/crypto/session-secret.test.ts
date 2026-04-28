import { describe, expect, it } from "bun:test";
import {
  decryptSessionSecret,
  encryptSessionSecret,
  generateMasterKey,
} from "../../src/crypto/session-secret";

describe("AES-256-GCM session-secret crypto", () => {
  const key = generateMasterKey();

  it("round-trips plaintext (string input)", () => {
    const plaintext = "this is a session keypair seed";
    const ct = encryptSessionSecret(plaintext, key);
    const pt = decryptSessionSecret(ct, key);
    expect(pt.toString("utf8")).toBe(plaintext);
  });

  it("round-trips plaintext (Buffer input)", () => {
    const plaintext = Buffer.from([0x01, 0x02, 0x03, 0xff, 0x00, 0xab]);
    const ct = encryptSessionSecret(plaintext, key);
    const pt = decryptSessionSecret(ct, key);
    expect(pt.equals(plaintext)).toBe(true);
  });

  it("two encryptions of the same plaintext produce different ciphertexts (random IV)", () => {
    const plaintext = "same input";
    const ct1 = encryptSessionSecret(plaintext, key);
    const ct2 = encryptSessionSecret(plaintext, key);
    expect(ct1).not.toBe(ct2);
  });

  it("rejects decryption with wrong key", () => {
    const plaintext = "secret";
    const ct = encryptSessionSecret(plaintext, key);
    const wrongKey = generateMasterKey();
    expect(() => decryptSessionSecret(ct, wrongKey)).toThrow();
  });

  it("rejects tampered ciphertext", () => {
    const plaintext = "secret";
    const ct = encryptSessionSecret(plaintext, key);
    const buf = Buffer.from(ct, "base64");
    const lastByte = buf[buf.length - 1];
    if (lastByte === undefined) throw new Error("ciphertext unexpectedly empty");
    buf[buf.length - 1] = lastByte ^ 0x01;
    const tampered = buf.toString("base64");
    expect(() => decryptSessionSecret(tampered, key)).toThrow();
  });

  it("rejects ciphertext that is too short", () => {
    expect(() => decryptSessionSecret("dGlueQ==", key)).toThrow(/too short/);
  });

  it("rejects an invalid master key length", () => {
    expect(() => encryptSessionSecret("x", "deadbeef")).toThrow(/master key/);
  });

  it("generateMasterKey produces 64-char lowercase hex (32 bytes)", () => {
    const k = generateMasterKey();
    expect(k).toHaveLength(64);
    expect(k).toMatch(/^[0-9a-f]+$/);
  });
});
