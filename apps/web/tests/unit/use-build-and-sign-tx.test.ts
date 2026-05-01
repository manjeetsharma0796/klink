// apps/web/tests/unit/use-build-and-sign-tx.test.ts
import { describe, expect, test } from "bun:test";
import { buildTxResponseSchema } from "../../lib/schemas";

describe("useBuildAndSignTx schema usage", () => {
  test("buildTxResponseSchema accepts passthrough fields", () => {
    const r = buildTxResponseSchema.parse({
      txBase64: "AAA",
      sessionId: "00000000-0000-0000-0000-000000000000",
      sessionPubkey: "5qCJCEhfLusk59YFqaEG9Yg3Wp64ZaYwvXteFmCmedqv",
      apiKey: "klink_dev_xxx",
      keyPrefix: "klink_de",
    });
    expect(r.txBase64).toBe("AAA");
    expect((r as Record<string, unknown>).apiKey).toBe("klink_dev_xxx");
  });
});
