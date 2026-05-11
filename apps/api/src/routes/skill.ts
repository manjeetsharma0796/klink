import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Request, Response } from "express";

/**
 * `GET /skill.md` (and `GET /.well-known/skill.md` for forward compat) — T-312.
 *
 * Public, unauthenticated. Serves the canonical agent-onboarding skill from the
 * api origin so an agent given **only** the api URL + a bearer token can fetch
 * the skill without out-of-band coordination. Mirrors the pay-with-locus
 * pattern; without it, the 2026-05-02 cold-start UX test confirmed an agent
 * has zero discovery path (the only existing copy lives on the dashboard
 * origin at `apps/web/public/skill.md`).
 *
 * Source-of-truth: we re-read the byte-equal `apps/web/public/skill.md` copy
 * at module load (paid once on cold-start, not per request). The two existing
 * copies (`gitbook/skill.md` + `apps/web/public/skill.md`) are kept in sync by
 * `apps/web/tests/unit/skill-sync.test.ts`; reading one of them avoids
 * introducing a third copy that could drift.
 */

// Resolve at module load: this file is at apps/api/src/routes/skill.ts,
// so the repo root is four levels up.
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

// Read once at module load — agent fetchers may hit this often, so we don't
// want a syscall per request. Cold-start cost is paid once.
const SKILL_MD_CONTENT = readFileSync(SKILL_MD_PATH, "utf8");

export function getSkillMdHandler(_req: Request, res: Response): void {
  res.setHeader("Content-Type", "text/markdown; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=300");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.status(200).send(SKILL_MD_CONTENT);
}
