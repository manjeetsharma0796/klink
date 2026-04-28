import { describe, expect, it } from "bun:test";
import {
  type LoadPolicy,
  type OffChainPolicyRow,
  checkOffChainPolicy,
  matchUrl,
  withinTimeWindow,
} from "../../src/policy/off-chain";

const ALL_DAYS = 0b1111111;

function policy(overrides: Partial<OffChainPolicyRow> = {}): OffChainPolicyRow {
  return {
    allowedUrls: [],
    timeWindowStartMin: 0,
    timeWindowEndMin: 1440,
    timeWindowDowBitmask: ALL_DAYS,
    timezone: "UTC",
    ...overrides,
  };
}

describe("matchUrl", () => {
  it("matches identical URLs", () => {
    expect(matchUrl("https://api.example.com/v1/x", "https://api.example.com/v1/x")).toBe(true);
  });

  it("rejects different hosts", () => {
    expect(matchUrl("https://other.com/v1/x", "https://api.example.com/v1/x")).toBe(false);
  });

  it("rejects different protocols", () => {
    expect(matchUrl("http://api.example.com/v1/x", "https://api.example.com/v1/x")).toBe(false);
  });

  it("matches a single-segment wildcard mid-path", () => {
    expect(matchUrl("https://x.com/v1/users/123", "https://x.com/v1/users/*")).toBe(true);
    expect(matchUrl("https://x.com/v1/users/123/posts", "https://x.com/v1/users/*")).toBe(true);
  });

  it("trailing /* matches one or more remaining segments", () => {
    // Trailing star matches one OR more segments per spec — test both.
    expect(matchUrl("https://x.com/v1/a", "https://x.com/v1/*")).toBe(true);
    expect(matchUrl("https://x.com/v1/a/b/c", "https://x.com/v1/*")).toBe(true);
  });

  it("rejects extra segments when no trailing wildcard", () => {
    expect(matchUrl("https://x.com/v1/a/extra", "https://x.com/v1/a")).toBe(false);
  });

  it("rejects when URL has fewer segments than pattern", () => {
    expect(matchUrl("https://x.com/v1", "https://x.com/v1/users")).toBe(false);
  });

  it("returns false on malformed URL or pattern", () => {
    expect(matchUrl("not-a-url", "https://x.com/")).toBe(false);
    expect(matchUrl("https://x.com/", "not-a-url")).toBe(false);
  });
});

describe("withinTimeWindow", () => {
  // 2026-04-28 is a Tuesday. Use specific timestamps.
  // 2026-04-28T12:00:00Z = noon UTC on a Tuesday
  const tueNoonUtc = new Date("2026-04-28T12:00:00Z").getTime();
  // 2026-04-28T03:00:00Z = 3 AM UTC = 8:30 AM IST (IST is UTC+5:30)
  const tueEarlyMorningUtc = new Date("2026-04-28T03:00:00Z").getTime();

  it("allows during 9-17 UTC window on a permitted day (Tuesday)", () => {
    expect(
      withinTimeWindow(tueNoonUtc, {
        timezone: "UTC",
        timeWindowStartMin: 9 * 60,
        timeWindowEndMin: 17 * 60,
        timeWindowDowBitmask: ALL_DAYS,
      }),
    ).toBe(true);
  });

  it("denies outside the window (before start)", () => {
    expect(
      withinTimeWindow(tueEarlyMorningUtc, {
        timezone: "UTC",
        timeWindowStartMin: 9 * 60,
        timeWindowEndMin: 17 * 60,
        timeWindowDowBitmask: ALL_DAYS,
      }),
    ).toBe(false);
  });

  it("denies when day-of-week is excluded", () => {
    // Tue=bit 1, mask 0b0000001 means only Mon allowed.
    expect(
      withinTimeWindow(tueNoonUtc, {
        timezone: "UTC",
        timeWindowStartMin: 0,
        timeWindowEndMin: 1440,
        timeWindowDowBitmask: 0b0000001,
      }),
    ).toBe(false);
  });

  it("respects the configured timezone (IST shifts +5:30)", () => {
    // 03:00 UTC = 08:30 IST — outside a 9-17 UTC window but inside 9-17 IST? No, 8:30 < 9.
    expect(
      withinTimeWindow(tueEarlyMorningUtc, {
        timezone: "Asia/Kolkata",
        timeWindowStartMin: 8 * 60,
        timeWindowEndMin: 18 * 60,
        timeWindowDowBitmask: ALL_DAYS,
      }),
    ).toBe(true);
  });
});

describe("checkOffChainPolicy", () => {
  const walletId = "55555555-5555-5555-5555-555555555555";
  const noCurated = async () => false;

  it("denies URL_NOT_ALLOWED when no policy row exists", async () => {
    const loadPolicy: LoadPolicy = async () => null;
    const r = await checkOffChainPolicy({
      walletId,
      url: "https://x.com/foo",
      loadPolicy,
      isCurated: noCurated,
    });
    expect(r).toEqual({ allowed: false, reason: "URL_NOT_ALLOWED" });
  });

  it("allows when URL matches an allowlist entry inside the time window", async () => {
    const loadPolicy: LoadPolicy = async () =>
      policy({
        allowedUrls: [{ pattern: "https://api.example.com/v1/*" }],
      });
    const r = await checkOffChainPolicy({
      walletId,
      url: "https://api.example.com/v1/users/123",
      nowMs: new Date("2026-04-28T12:00:00Z").getTime(),
      loadPolicy,
      isCurated: noCurated,
    });
    expect(r).toEqual({ allowed: true });
  });

  it("denies URL_NOT_ALLOWED when URL doesn't match any pattern", async () => {
    const loadPolicy: LoadPolicy = async () =>
      policy({
        allowedUrls: [{ pattern: "https://api.example.com/v1/*" }],
      });
    const r = await checkOffChainPolicy({
      walletId,
      url: "https://other.com/v1/x",
      loadPolicy,
      isCurated: noCurated,
    });
    expect(r).toEqual({ allowed: false, reason: "URL_NOT_ALLOWED" });
  });

  it("allows curated services without consulting the allowlist", async () => {
    const loadPolicy: LoadPolicy = async () => policy({ allowedUrls: [] });
    const r = await checkOffChainPolicy({
      walletId,
      url: "https://anthropic.mpp.paywithlocus.com/v1/messages",
      nowMs: new Date("2026-04-28T12:00:00Z").getTime(),
      loadPolicy,
      isCurated: async () => true,
    });
    expect(r).toEqual({ allowed: true });
  });

  it("denies OUTSIDE_TIME_WINDOW when URL ok but time outside window", async () => {
    const loadPolicy: LoadPolicy = async () =>
      policy({
        allowedUrls: [{ pattern: "https://api.example.com/v1/*" }],
        timeWindowStartMin: 9 * 60,
        timeWindowEndMin: 17 * 60,
      });
    const r = await checkOffChainPolicy({
      walletId,
      url: "https://api.example.com/v1/x",
      nowMs: new Date("2026-04-28T03:00:00Z").getTime(), // 3 AM UTC
      loadPolicy,
      isCurated: noCurated,
    });
    expect(r).toEqual({ allowed: false, reason: "OUTSIDE_TIME_WINDOW" });
  });
});
