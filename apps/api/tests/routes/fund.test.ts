import { describe, expect, it } from "bun:test";
import { buildSolanaPayUrl } from "../../src/routes/fund";

/**
 * Solana Pay URL format is the contract between the dashboard's QR and
 * every wallet that scans it. If we drift from `solana:<recipient>?spl-token=<mint>`
 * (e.g. swap to `solana://`, drop the param, encode an ATA in the recipient
 * slot) the QR breaks silently in mobile wallets — desktop scanning still
 * works because Phantom-on-desktop falls back to "treat as raw address".
 *
 * Pinning here so a refactor doesn't accidentally regress mobile UX.
 */

const VAULT_PDA = "FakeVaultPda88888888888888888888888888888888";
const USDC_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"; // devnet circle USDC

describe("buildSolanaPayUrl", () => {
  it("emits the canonical solana:<recipient>?spl-token=<mint> form", () => {
    const url = buildSolanaPayUrl(VAULT_PDA, USDC_MINT);
    expect(url).toBe(`solana:${VAULT_PDA}?spl-token=${USDC_MINT}`);
  });

  it("uses 'solana:' scheme (single colon, not solana://)", () => {
    // Solana Pay spec uses `solana:` like a mailto:, NOT `solana://`.
    // Wallets that use a strict URL parser reject the // form.
    const url = buildSolanaPayUrl(VAULT_PDA, USDC_MINT);
    expect(url.startsWith("solana:")).toBe(true);
    expect(url.startsWith("solana://")).toBe(false);
  });

  it("recipient is the vault PDA, not the ATA", () => {
    // Solana Pay-aware wallets derive the ATA from `recipient + spl-token`.
    // Encoding the ATA itself in the recipient slot makes Phantom mis-derive
    // and silently drop to raw-address mode (no auto-USDC selection).
    const url = buildSolanaPayUrl(VAULT_PDA, USDC_MINT);
    const match = url.match(/^solana:([^?]+)\?/);
    expect(match?.[1]).toBe(VAULT_PDA);
  });

  it("spl-token param is the configured mint", () => {
    const url = buildSolanaPayUrl(VAULT_PDA, USDC_MINT);
    expect(url).toContain(`spl-token=${USDC_MINT}`);
  });
});
