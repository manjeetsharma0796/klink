import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function deriveKey(masterKeyHex: string): Buffer {
  const key = Buffer.from(masterKeyHex, "hex");
  if (key.length !== KEY_LENGTH) {
    throw new Error(
      `master key must be ${KEY_LENGTH * 2} hex chars (${KEY_LENGTH} bytes), got ${key.length} bytes`,
    );
  }
  return key;
}

/**
 * AES-256-GCM encrypt. Output is base64 of: iv (12B) || tag (16B) || ciphertext.
 * Random IV per call, so two encryptions of the same plaintext differ.
 */
export function encryptSessionSecret(plaintext: Buffer | string, masterKeyHex: string): string {
  const key = deriveKey(masterKeyHex);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, key, iv);
  const pt = Buffer.isBuffer(plaintext) ? plaintext : Buffer.from(plaintext, "utf8");
  const ct = Buffer.concat([cipher.update(pt), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString("base64");
}

/**
 * AES-256-GCM decrypt. Throws on tampering, wrong key, or short ciphertext.
 */
export function decryptSessionSecret(ciphertextB64: string, masterKeyHex: string): Buffer {
  const key = deriveKey(masterKeyHex);
  const buf = Buffer.from(ciphertextB64, "base64");
  if (buf.length < IV_LENGTH + TAG_LENGTH) {
    throw new Error("ciphertext too short");
  }
  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ct = buf.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

/**
 * Generate a fresh 32-byte master key as 64-char hex. Use for initial setup or rotation.
 * Equivalent to `openssl rand -hex 32`.
 */
export function generateMasterKey(): string {
  return randomBytes(KEY_LENGTH).toString("hex");
}
