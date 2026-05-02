import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * `gitbook/skill.md` and `apps/web/public/skill.md` are the canonical
 * agent-onboarding skill (T-311). The gitbook copy ships with the public
 * docs site; the `apps/web/public` copy is what `apps/web/app/skill.md/route.ts`
 * serves at `/skill.md` on the dashboard. Both must stay byte-equal — drift
 * means agents fetching from the dashboard see different docs than the
 * docs site shows. A pre-commit edit to one without the other should fail
 * CI here so the mistake is caught instantly.
 */
describe("skill.md sync", () => {
  it("apps/web/public/skill.md matches gitbook/skill.md byte-for-byte", () => {
    const repoRoot = resolve(import.meta.dir, "..", "..", "..", "..");
    const gitbook = readFileSync(resolve(repoRoot, "gitbook", "skill.md"), "utf8");
    const webPublic = readFileSync(
      resolve(repoRoot, "apps", "web", "public", "skill.md"),
      "utf8",
    );
    expect(webPublic).toBe(gitbook);
  });
});
