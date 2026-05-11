import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseMppServices } from "../../lib/services";

const FIXTURE = `# MPP services on Solana

intro prose…

## Services your agent can pay

| Service | URL | Network | Price | Recipient | Status | Last verified |
|---|---|---|---|---|---|---|
| **Klink MPP Echo** | [\`https://service01-kep9.onrender.com/echo\`](https://service01-kep9.onrender.com/echo) | Solana devnet | 0.01 USDC | \`81eM3oPR1fUJSsFhNm6G51W4jwE2HondS2kjBmcxFcJ2\` | live | 2026-05-11 |
| Plain Row | https://other.example/echo | Solana mainnet-beta | 0.10 USDC | XYZ123 | experimental | 2026-06-01 |

trailing prose…

## How to list yours

another section
`;

describe("parseMppServices", () => {
  it("parses the seed fixture into typed rows", () => {
    const rows = parseMppServices(FIXTURE);
    expect(rows.length).toBe(2);
    expect(rows[0]).toEqual({
      name: "Klink MPP Echo",
      url: "https://service01-kep9.onrender.com/echo",
      network: "Solana devnet",
      price: "0.01 USDC",
      recipient: "81eM3oPR1fUJSsFhNm6G51W4jwE2HondS2kjBmcxFcJ2",
      status: "live",
      lastVerified: "2026-05-11",
    });
    expect(rows[1]).toEqual({
      name: "Plain Row",
      url: "https://other.example/echo",
      network: "Solana mainnet-beta",
      price: "0.10 USDC",
      recipient: "XYZ123",
      status: "experimental",
      lastVerified: "2026-06-01",
    });
  });

  it("strips markdown emphasis and code spans from cells", () => {
    const rows = parseMppServices(FIXTURE);
    expect(rows[0]?.name).not.toContain("**");
    expect(rows[0]?.recipient).not.toContain("`");
  });

  it("extracts URL from markdown link syntax in the URL cell", () => {
    const rows = parseMppServices(FIXTURE);
    expect(rows[0]?.url).toBe("https://service01-kep9.onrender.com/echo");
    expect(rows[1]?.url).toBe("https://other.example/echo");
  });

  it("stops at the next heading after the table", () => {
    const rows = parseMppServices(FIXTURE);
    // Only the 2 rows under "Services your agent can pay", not any later table.
    expect(rows.length).toBe(2);
  });

  it("throws when the section heading is missing", () => {
    expect(() => parseMppServices("# no table here")).toThrow(/section heading/);
  });

  it("throws when no table follows the heading", () => {
    const bad = "## Services your agent can pay\n\nprose only, no table\n\n## Next";
    expect(() => parseMppServices(bad)).toThrow(/no table found/);
  });

  it("throws when the alignment row is malformed", () => {
    const bad = `## Services your agent can pay

| a | b | c | d | e | f | g |
| 1 | 2 | 3 | 4 | 5 | 6 | 7 |
`;
    expect(() => parseMppServices(bad)).toThrow(/alignment row/);
  });

  it("throws when column count drifts", () => {
    const bad = `## Services your agent can pay

| a | b | c |
|---|---|---|
| 1 | 2 | 3 |
`;
    expect(() => parseMppServices(bad)).toThrow(/expected 7 columns/);
  });

  it("throws when there are zero data rows", () => {
    const bad = `## Services your agent can pay

| a | b | c | d | e | f | g |
|---|---|---|---|---|---|---|

prose
`;
    expect(() => parseMppServices(bad)).toThrow(/no data rows/);
  });

  it("round-trips against the real gitbook/services/mpp.md", () => {
    // Resolve from the test file's directory: apps/web/tests/unit/ → ../../../../gitbook
    const path = join(import.meta.dir, "..", "..", "..", "..", "gitbook", "services", "mpp.md");
    const md = readFileSync(path, "utf8");
    const rows = parseMppServices(md);
    expect(rows.length).toBeGreaterThan(0);
    // Seed entry pinned: service01.
    const seed = rows.find((r) => r.name.toLowerCase().includes("klink mpp"));
    expect(seed).toBeDefined();
    expect(seed?.url).toContain("service01-kep9.onrender.com");
    expect(seed?.network.toLowerCase()).toContain("devnet");
  });
});
