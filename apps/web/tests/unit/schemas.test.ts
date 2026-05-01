import { describe, expect, test } from "bun:test";
import {
  walletSchema,
  sessionsListSchema,
  sessionDetailSchema,
  buildTxResponseSchema,
  postSessionResponseSchema,
  fundDepositAddressSchema,
  auditPageSchema,
} from "../../lib/schemas";

describe("walletSchema", () => {
  test("parses valid wallet", () => {
    const r = walletSchema.parse({
      vaultPda: "5qCJCEhfLusk59YFqaEG9Yg3Wp64ZaYwvXteFmCmedqv",
      usdcAta: "5qCJCEhfLusk59YFqaEG9Yg3Wp64ZaYwvXteFmCmedqv",
      maxDeployedFractionBp: 8000,
      ownerPubkey: "5qCJCEhfLusk59YFqaEG9Yg3Wp64ZaYwvXteFmCmedqv",
      createdAt: "2026-05-02T00:00:00Z",
    });
    expect(r.maxDeployedFractionBp).toBe(8000);
  });
});

describe("buildTxResponseSchema", () => {
  test("requires txBase64", () => {
    expect(() => buildTxResponseSchema.parse({})).toThrow();
    expect(buildTxResponseSchema.parse({ txBase64: "AAA" }).txBase64).toBe("AAA");
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
