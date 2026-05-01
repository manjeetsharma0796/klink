import { describe, expect, it } from "bun:test";
import { validateAllowedUrlPattern } from "../../src/routes/wallet";

/**
 * Spec §3.3.1: wildcards restricted to path segments only — never the host.
 * This is the write-side guard that keeps bad patterns out of
 * `off_chain_policies.allowed_urls`. The runtime matcher in
 * `policy/off-chain.ts` assumes patterns conform to these rules.
 */

describe("validateAllowedUrlPattern", () => {
  it.each([
    "https://api.example.com/v1/users",
    "https://api.example.com/v1/users/*",
    "https://api.example.com/v1/*/posts",
    "http://localhost:3000/api",
    "https://api.example.com",
    "https://api.example.com/v1/*/comments/*",
  ])("accepts a valid pattern: %s", (pattern) => {
    expect(validateAllowedUrlPattern(pattern)).toBeNull();
  });

  it("rejects host wildcards", () => {
    // The URL parser will accept these as valid hosts, so the explicit
    // `host.includes("*")` check in the validator is the actual guard.
    const reason = validateAllowedUrlPattern("https://*.example.com/v1");
    expect(reason).toMatch(/host wildcards not allowed/);
  });

  it("rejects mid-segment path wildcards", () => {
    expect(validateAllowedUrlPattern("https://api.example.com/v1/u*ers")).toMatch(
      /standalone '\*'/,
    );
    expect(validateAllowedUrlPattern("https://api.example.com/*ser")).toMatch(/standalone '\*'/);
  });

  it("rejects non-http(s) protocols", () => {
    expect(validateAllowedUrlPattern("ftp://api.example.com/v1")).toMatch(
      /http:\/\/ or https:\/\//,
    );
    expect(validateAllowedUrlPattern("ws://api.example.com/v1")).toMatch(/http:\/\/ or https:\/\//);
  });

  it("rejects malformed URLs", () => {
    expect(validateAllowedUrlPattern("not a url")).toMatch(/valid URL/);
    expect(validateAllowedUrlPattern("")).toMatch(/valid URL/);
  });

  it("does NOT confuse a leading-slash trailing wildcard with mid-segment", () => {
    // `/v1/users/*` is valid — trailing standalone `*` segment.
    expect(validateAllowedUrlPattern("https://api.example.com/v1/users/*")).toBeNull();
    // `/v1/users*` is NOT valid — wildcard glued to a non-wildcard segment.
    expect(validateAllowedUrlPattern("https://api.example.com/v1/users*")).toMatch(
      /standalone '\*'/,
    );
  });
});
