import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createApp } from "../../src/app";

/**
 * T-312 — `GET /skill.md` (and `GET /.well-known/skill.md`).
 *
 * Public, unauthenticated. Pin the response shape so an agent fetcher always
 * gets text/markdown + caching headers + permissive CORS, and the body stays
 * byte-equal to the canonical on-disk copy at apps/web/public/skill.md.
 */

const PORT = 3007;
let server: ReturnType<ReturnType<typeof createApp>["listen"]>;

const SKILL_MD_PATH = resolve(
  import.meta.dir,
  "..",
  "..",
  "..",
  "..",
  "apps",
  "web",
  "public",
  "skill.md",
);
const SKILL_MD_CONTENT = readFileSync(SKILL_MD_PATH, "utf8");

beforeAll(() => {
  const app = createApp();
  server = app.listen(PORT);
});

afterAll(() => {
  server.close();
});

function assertSkillResponse(
  res: Response,
  body: string,
  { allowQuotedCharset }: { allowQuotedCharset?: boolean } = {},
) {
  expect(res.status).toBe(200);
  // Express may emit either `text/markdown; charset=utf-8` (unquoted) — pin
  // the canonical form. allowQuotedCharset stays as a hook in case express's
  // setHeader normaliser ever shifts.
  const ct = res.headers.get("content-type");
  if (allowQuotedCharset) {
    expect(ct).toMatch(/^text\/markdown;\s*charset=("?)utf-8\1$/i);
  } else {
    expect(ct).toBe("text/markdown; charset=utf-8");
  }
  expect(res.headers.get("cache-control")).toBe("public, max-age=300, s-maxage=300");
  expect(res.headers.get("access-control-allow-origin")).toBe("*");
  expect(body).toBe(SKILL_MD_CONTENT);
}

describe("GET /skill.md", () => {
  it("returns the canonical skill.md with text/markdown + cache + CORS headers", async () => {
    const res = await fetch(`http://localhost:${PORT}/skill.md`);
    const body = await res.text();
    assertSkillResponse(res, body);
  });
});

describe("GET /.well-known/skill.md", () => {
  it("returns the same bytes + headers as /skill.md", async () => {
    const res = await fetch(`http://localhost:${PORT}/.well-known/skill.md`);
    const body = await res.text();
    assertSkillResponse(res, body);
  });
});
