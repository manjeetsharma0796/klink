import { describe, expect, it } from "bun:test";
import { Keypair } from "@solana/web3.js";
import { parseWalletTransferBody } from "../../src/routes/wallet";

/**
 * T-235: input validation for `POST /v1/wallet/transfer`.
 *
 * The handler hits Postgres for ownership verification, so the full request
 * round-trip is covered by integration tests (T-112 owns those). Here we pin
 * the parser so a malformed body can't sneak past validation and reach the
 * tx-builder with bad inputs (e.g. negative amount → unsigned wraparound on
 * the rust side).
 */

const VALID_PUBKEY = Keypair.generate().publicKey.toBase58();

describe("parseWalletTransferBody", () => {
  it("rejects non-object bodies", () => {
    for (const v of [null, undefined, 42, "hello", []]) {
      const r = parseWalletTransferBody(v);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.body.error).toContain("JSON object");
    }
  });

  it("requires amount > 0", () => {
    for (const v of [-1, 0, Number.NaN, Number.POSITIVE_INFINITY, "100"]) {
      const r = parseWalletTransferBody({ amount: v, recipient: VALID_PUBKEY });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.body.error).toContain("amount");
    }
  });

  it("requires recipient as a non-empty string", () => {
    for (const v of [undefined, "", 123, null]) {
      const r = parseWalletTransferBody({ amount: 1, recipient: v });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.body.error).toContain("recipient");
    }
  });

  it("rejects a recipient that is not valid base58 pubkey", () => {
    const r = parseWalletTransferBody({ amount: 1, recipient: "definitely-not-a-pubkey!!!" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.body.error).toContain("base58 pubkey");
  });

  it("rejects a non-string wallet_id when provided", () => {
    const r = parseWalletTransferBody({ amount: 1, recipient: VALID_PUBKEY, wallet_id: 42 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.body.error).toContain("wallet_id");
  });

  it("happy path: returns BigInt(amount), PublicKey(recipient), walletId passthrough", () => {
    const r = parseWalletTransferBody({
      amount: 1_000_000,
      recipient: VALID_PUBKEY,
      wallet_id: "abc-123",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.amount).toBe(1_000_000n);
      expect(r.recipient.toBase58()).toBe(VALID_PUBKEY);
      expect(r.walletId).toBe("abc-123");
    }
  });

  it("truncates fractional amounts (caller is expected to send base units, not USDC units)", () => {
    // Defensive: dashboard converts USDC * 1e6 with Math.round before POSTing.
    // If a caller forgot, we still don't crash — Math.trunc kicks in.
    const r = parseWalletTransferBody({
      amount: 1.7,
      recipient: VALID_PUBKEY,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.amount).toBe(1n);
  });

  it("walletId is undefined when omitted (handler then defaults to most-recent wallet)", () => {
    const r = parseWalletTransferBody({ amount: 1, recipient: VALID_PUBKEY });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.walletId).toBeUndefined();
  });
});
