import { describe, expect, test } from "bun:test";
import { decodeVault } from "../../lib/on-chain";

describe("decodeVault", () => {
  test("decodes a synthetic Vault account", () => {
    const buf = Buffer.alloc(51);
    // 8-byte fake discriminator
    buf.fill(0x55, 0, 8);
    // 32-byte owner: all 0x11
    buf.fill(0x11, 8, 40);
    // u16 LE max_deployed_fraction_bp = 8000
    buf.writeUInt16LE(8000, 40);
    // u64 LE deployed_amount = 12345
    buf.writeBigUInt64LE(BigInt(12345), 42);
    // bump = 254
    buf.writeUInt8(254, 50);

    const v = decodeVault(buf);
    expect(v.maxDeployedFractionBp).toBe(8000);
    expect(v.deployedAmount).toBe(BigInt(12345));
    expect(v.bump).toBe(254);
    expect(v.owner.length).toBe(32);
  });

  test("rejects undersized buffer", () => {
    expect(() => decodeVault(Buffer.alloc(10))).toThrow();
  });
});
