import { describe, expect, test } from "bun:test";
import {
  auditPageSchema,
  buildTxResponseSchema,
  fundDepositAddressSchema,
  postSessionResponseSchema,
  sessionDetailSchema,
  sessionsListSchema,
  walletSchema,
} from "../../lib/schemas";

describe("walletSchema", () => {
  test("parses valid wallet", () => {
    const r = walletSchema.parse({
      id: "00000000-0000-0000-0000-000000000000",
      vaultPda: "5qCJCEhfLusk59YFqaEG9Yg3Wp64ZaYwvXteFmCmedqv",
      usdcAta: "5qCJCEhfLusk59YFqaEG9Yg3Wp64ZaYwvXteFmCmedqv",
      maxDeployedFractionBp: 8000,
      ownerPubkey: "5qCJCEhfLusk59YFqaEG9Yg3Wp64ZaYwvXteFmCmedqv",
      createdAt: "2026-05-02T00:00:00Z",
    });
    expect(r.maxDeployedFractionBp).toBe(8000);
    expect(r.id).toBe("00000000-0000-0000-0000-000000000000");
  });
});

describe("sessionDetailSchema", () => {
  test("parses with on-chain block populated (bigints as strings)", () => {
    const r = sessionDetailSchema.parse({
      id: "00000000-0000-0000-0000-000000000000",
      walletId: "00000000-0000-0000-0000-000000000001",
      label: "agent-1",
      sessionPubkey: "5qCJCEhfLusk59YFqaEG9Yg3Wp64ZaYwvXteFmCmedqv",
      expiresAt: null,
      revokedAt: null,
      createdAt: "2026-05-02T00:00:00Z",
      keyPrefix: "klink_de",
      onChain: {
        maxPerTx: "100000",
        dailyCap: "1000000",
        dailySpent: "0",
        dailyWindowStart: 1714579200,
        expiry: 0,
        allowedRecipients: ["5qCJCEhfLusk59YFqaEG9Yg3Wp64ZaYwvXteFmCmedqv"],
        allowedRecipientsCount: 1,
        allowedInstructions: 7,
      },
      onChainError: null,
      offChainPolicy: null,
    });
    expect(r.onChain?.allowedInstructions).toBe(7);
    expect(r.onChain?.maxPerTx).toBe("100000");
  });

  test("parses with onChain null (PDA not yet on-chain)", () => {
    const r = sessionDetailSchema.parse({
      id: "00000000-0000-0000-0000-000000000000",
      walletId: "00000000-0000-0000-0000-000000000001",
      label: "agent-1",
      sessionPubkey: "5qCJCEhfLusk59YFqaEG9Yg3Wp64ZaYwvXteFmCmedqv",
      expiresAt: null,
      revokedAt: null,
      createdAt: "2026-05-02T00:00:00Z",
      keyPrefix: "klink_de",
      onChain: null,
      onChainError: "session pda not yet on chain",
      offChainPolicy: null,
    });
    expect(r.onChain).toBeNull();
    expect(r.onChainError).toBe("session pda not yet on chain");
  });
});

describe("buildTxResponseSchema", () => {
  test("requires txBase64 when alreadyExists is not true", () => {
    expect(() => buildTxResponseSchema.parse({})).toThrow();
    expect(buildTxResponseSchema.parse({ txBase64: "AAA" }).txBase64).toBe("AAA");
  });
  test("permits the self-heal shape (alreadyExists=true, no txBase64)", () => {
    const r = buildTxResponseSchema.parse({
      alreadyExists: true,
      vaultPda: "5qCJCEhfLusk59YFqaEG9Yg3Wp64ZaYwvXteFmCmedqv",
    });
    expect(r.alreadyExists).toBe(true);
    expect(r.txBase64).toBeUndefined();
  });
  test("rejects alreadyExists=false without txBase64", () => {
    expect(() => buildTxResponseSchema.parse({ alreadyExists: false })).toThrow();
  });
});

describe("postSessionResponseSchema", () => {
  test("includes one-time apiKey", () => {
    const r = postSessionResponseSchema.parse({
      txBase64: "AAA",
      sessionId: "00000000-0000-0000-0000-000000000000",
      sessionPubkey: "5qCJCEhfLusk59YFqaEG9Yg3Wp64ZaYwvXteFmCmedqv",
      apiKey: "klink_dev_xxx",
      keyPrefix: "klink_de",
      expiresAt: null,
      vaultPda: "5qCJCEhfLusk59YFqaEG9Yg3Wp64ZaYwvXteFmCmedqv",
      usdcAta: "5qCJCEhfLusk59YFqaEG9Yg3Wp64ZaYwvXteFmCmedqv",
    });
    expect(r.apiKey).toBe("klink_dev_xxx");
  });
});

describe("auditPageSchema", () => {
  test("parses paginated rows", () => {
    const r = auditPageSchema.parse({
      entries: [
        {
          id: 1,
          walletId: "00000000-0000-0000-0000-000000000000",
          sessionId: null,
          action: "spend_transfer",
          amount: 100,
          recipientOrUrl: "abc",
          decision: "allow",
          reason: null,
          txSignature: null,
          createdAt: "2026-05-02T00:00:00Z",
        },
      ],
      next_cursor: null,
    });
    expect(r.entries).toHaveLength(1);
  });
});

describe("fundDepositAddressSchema", () => {
  test("parses qr data url", () => {
    const r = fundDepositAddressSchema.parse({
      vault_pda: "5qCJCEhfLusk59YFqaEG9Yg3Wp64ZaYwvXteFmCmedqv",
      usdc_ata: "5qCJCEhfLusk59YFqaEG9Yg3Wp64ZaYwvXteFmCmedqv",
      qr_data_url: "data:image/png;base64,AAA",
    });
    expect(r.qr_data_url).toMatch(/^data:image/);
  });
});
