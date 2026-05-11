import { describe, expect, test } from "bun:test";
import {
  buildAddToSessionQuery,
  hasAnyAddToSessionParam,
  parseAddToSessionParams,
  suggestMaxPerCallFromPrice,
} from "@/lib/add-to-session-params";

describe("parseAddToSessionParams", () => {
  test("returns nulls when nothing set", () => {
    const p = parseAddToSessionParams(new URLSearchParams());
    expect(p).toEqual({
      addUrl: null,
      addRecipient: null,
      suggestMaxPerCall: null,
    });
    expect(hasAnyAddToSessionParam(p)).toBe(false);
  });

  test("parses all three fields", () => {
    const sp = new URLSearchParams(
      "add_url=https%3A%2F%2Fa.example%2Fecho&add_recipient=11111111111111111111111111111111&suggest_max_per_call=50000",
    );
    const p = parseAddToSessionParams(sp);
    expect(p.addUrl).toBe("https://a.example/echo");
    expect(p.addRecipient).toBe("11111111111111111111111111111111");
    expect(p.suggestMaxPerCall).toBe(50000);
    expect(hasAnyAddToSessionParam(p)).toBe(true);
  });

  test("rejects negative or non-finite max_per_call", () => {
    expect(
      parseAddToSessionParams(new URLSearchParams("suggest_max_per_call=-1"))
        .suggestMaxPerCall,
    ).toBe(null);
    expect(
      parseAddToSessionParams(new URLSearchParams("suggest_max_per_call=abc"))
        .suggestMaxPerCall,
    ).toBe(null);
  });

  test("floors fractional max_per_call", () => {
    expect(
      parseAddToSessionParams(new URLSearchParams("suggest_max_per_call=42.7"))
        .suggestMaxPerCall,
    ).toBe(42);
  });

  test("accepts zero (= no cap)", () => {
    expect(
      parseAddToSessionParams(new URLSearchParams("suggest_max_per_call=0"))
        .suggestMaxPerCall,
    ).toBe(0);
  });
});

describe("buildAddToSessionQuery", () => {
  test("emits empty string when nothing set", () => {
    expect(
      buildAddToSessionQuery({
        addUrl: null,
        addRecipient: null,
        suggestMaxPerCall: null,
      }),
    ).toBe("");
  });

  test("round-trips with parseAddToSessionParams", () => {
    const original = {
      addUrl: "https://a.example/echo",
      addRecipient: "11111111111111111111111111111111",
      suggestMaxPerCall: 50000,
    };
    const q = buildAddToSessionQuery(original);
    expect(q.startsWith("?")).toBe(true);
    const reparsed = parseAddToSessionParams(new URLSearchParams(q.slice(1)));
    expect(reparsed).toEqual(original);
  });

  test("omits null fields", () => {
    const q = buildAddToSessionQuery({
      addUrl: "https://x",
      addRecipient: null,
      suggestMaxPerCall: null,
    });
    expect(q).toBe("?add_url=https%3A%2F%2Fx");
  });
});

describe("suggestMaxPerCallFromPrice", () => {
  test("0.01 USDC -> 50_000 (5x headroom)", () => {
    expect(suggestMaxPerCallFromPrice("0.01 USDC")).toBe(50_000);
  });

  test("1 USDC -> 5_000_000", () => {
    expect(suggestMaxPerCallFromPrice("1 USDC")).toBe(5_000_000);
  });

  test("falls back when price unparseable", () => {
    expect(suggestMaxPerCallFromPrice("free")).toBe(100_000);
    expect(suggestMaxPerCallFromPrice("")).toBe(100_000);
  });

  test("falls back on zero or negative price", () => {
    expect(suggestMaxPerCallFromPrice("0 USDC")).toBe(100_000);
  });
});
