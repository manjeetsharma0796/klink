import { describe, expect, test } from "bun:test";
import { formatUsdc, parseUsdcInput, truncatePubkey, formatTimestamp } from "../../lib/formatters";

describe("formatUsdc", () => {
  test("converts 1_000_000 base units to $1.00", () => {
    expect(formatUsdc(1_000_000)).toBe("$1.00");
  });
  test("handles zero", () => {
    expect(formatUsdc(0)).toBe("$0.00");
  });
  test("handles fractional cents", () => {
    expect(formatUsdc(123_456)).toBe("$0.12");
  });
  test("handles bigint", () => {
    expect(formatUsdc(BigInt(2_500_000))).toBe("$2.50");
  });
});

describe("parseUsdcInput", () => {
  test("converts dollar string to base units", () => {
    expect(parseUsdcInput("1.00")).toBe(1_000_000);
  });
  test("rejects non-numeric", () => {
    expect(parseUsdcInput("abc")).toBeNull();
  });
  test("rejects negative", () => {
    expect(parseUsdcInput("-1")).toBeNull();
  });
});

describe("truncatePubkey", () => {
  test("shows first 4 + last 4", () => {
    expect(truncatePubkey("5qCJCEhfLusk59YFqaEG9Yg3Wp64ZaYwvXteFmCmedqv")).toBe("5qCJ…edqv");
  });
  test("returns short keys verbatim", () => {
    expect(truncatePubkey("abc")).toBe("abc");
  });
});

describe("formatTimestamp", () => {
  test("formats unix seconds as ISO-like", () => {
    expect(formatTimestamp(1714579200)).toMatch(/2024-05-01/); // sanity
  });
});
