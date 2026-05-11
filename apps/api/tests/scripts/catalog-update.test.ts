import { describe, expect, it } from "bun:test";
import { buildUpdatePatch, parseArgs } from "../../scripts/catalog-update";

// Real devnet pubkey from spend-mpp.test.ts fixture — guaranteed valid base58.
const VALID_PUBKEY = "81eM3oPR1fUJSsFhNm6G51W4jwE2HondS2kjBmcxFcJ2";

describe("parseArgs", () => {
  it("requires --slug", () => {
    const r = parseArgs(["--enable"]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/--slug/);
  });

  it("rejects unknown flags", () => {
    const r = parseArgs(["--slug", "x", "--bogus"]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/unknown flag/);
  });

  it("rejects --enable + --disable together", () => {
    const r = parseArgs(["--slug", "x", "--enable", "--disable"]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/mutually exclusive/);
  });

  it("rejects no-op (only --slug, no mutation flags)", () => {
    const r = parseArgs(["--slug", "x"]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/no-op/);
  });

  it("rejects invalid base58 recipient", () => {
    const r = parseArgs(["--slug", "x", "--recipient", "not-a-real-pubkey-0OIl"]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/not a valid base58/);
  });

  it("rejects negative max-per-call", () => {
    const r = parseArgs(["--slug", "x", "--max-per-call", "-1"]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/non-negative integer/);
  });

  it("rejects non-integer max-per-call", () => {
    const r = parseArgs(["--slug", "x", "--max-per-call", "1.5"]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/non-negative integer/);
  });

  it("defaults apply=false (dry-run)", () => {
    const r = parseArgs(["--slug", "x", "--enable"]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.args.apply).toBe(false);
  });

  it("parses --apply", () => {
    const r = parseArgs(["--slug", "x", "--enable", "--apply"]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.args.apply).toBe(true);
  });

  it("parses a full enable + recipient + max-per-call combo", () => {
    const r = parseArgs([
      "--slug",
      "openai-chatgpt",
      "--recipient",
      VALID_PUBKEY,
      "--enable",
      "--max-per-call",
      "100000",
      "--apply",
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.args.slug).toBe("openai-chatgpt");
    expect(r.args.recipient).toBe(VALID_PUBKEY);
    expect(r.args.enable).toBe(true);
    expect(r.args.maxPerCall).toBe(100000);
    expect(r.args.apply).toBe(true);
  });

  it("parses --disable alone", () => {
    const r = parseArgs(["--slug", "exa-search", "--disable", "--apply"]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.args.disable).toBe(true);
    expect(r.args.enable).toBeUndefined();
  });

  it("returns HELP sentinel for --help / -h", () => {
    for (const flag of ["--help", "-h"]) {
      const r = parseArgs([flag]);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toBe("HELP");
    }
  });

  it("accepts max-per-call=0 (no cap)", () => {
    const r = parseArgs(["--slug", "x", "--max-per-call", "0"]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.args.maxPerCall).toBe(0);
  });

  // Regression: previously `argv[++i]` would happily consume the next flag as
  // the value, so `--slug --enable` set slug to the literal "--enable" and
  // then a misleading no-op / invalid-pubkey error fired.
  it("rejects --slug with no following value (end of argv)", () => {
    const r = parseArgs(["--slug"]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("--slug requires a value");
  });

  it("rejects --slug when the next token is itself a flag", () => {
    const r = parseArgs(["--slug", "--enable"]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("--slug requires a value");
  });

  it("rejects --recipient when the next token is itself a flag", () => {
    const r = parseArgs(["--slug", "x", "--recipient", "--enable"]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("--recipient requires a value");
  });

  it("rejects --max-per-call when the next token is itself a flag", () => {
    const r = parseArgs(["--slug", "x", "--max-per-call", "--apply"]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("--max-per-call requires a value");
  });
});

describe("buildUpdatePatch", () => {
  it("emits only the fields supplied", () => {
    const p = buildUpdatePatch({ slug: "x", enable: true, apply: false });
    expect(p).toEqual({ enabled: true });
  });

  it("emits paymentRecipientPubkey for --recipient", () => {
    const p = buildUpdatePatch({ slug: "x", recipient: VALID_PUBKEY, apply: false });
    expect(p).toEqual({ paymentRecipientPubkey: VALID_PUBKEY });
  });

  it("emits enabled=false for --disable", () => {
    const p = buildUpdatePatch({ slug: "x", disable: true, apply: false });
    expect(p).toEqual({ enabled: false });
  });

  it("emits defaultMaxPerCall for --max-per-call", () => {
    const p = buildUpdatePatch({ slug: "x", maxPerCall: 250000, apply: false });
    expect(p).toEqual({ defaultMaxPerCall: 250000 });
  });

  it("merges all three when all are supplied", () => {
    const p = buildUpdatePatch({
      slug: "x",
      recipient: VALID_PUBKEY,
      enable: true,
      maxPerCall: 100000,
      apply: true,
    });
    expect(p).toEqual({
      paymentRecipientPubkey: VALID_PUBKEY,
      enabled: true,
      defaultMaxPerCall: 100000,
    });
  });
});
