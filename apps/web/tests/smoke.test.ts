import { describe, expect, test } from "bun:test";

describe("@klink/web smoke", () => {
  test("scaffold is wired", () => {
    expect(1 + 1).toBe(2);
  });
});
