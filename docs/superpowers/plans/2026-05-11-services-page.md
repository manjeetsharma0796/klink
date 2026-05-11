# T-259 — Public `/services` page on klink dashboard, rendering gitbook MPP services table

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ship a public, unauthenticated route at `app.klinkdotfun.live/services` that renders the curated list of MPP-on-Solana services from `gitbook/services/mpp.md` as a clean table. Matches the discovery surface paywithlocus.com/endpoints offers. gitbook stays the single source of truth; listings happen via PR to the markdown file; the dashboard page parses that markdown at build time and ships the data as a typed array baked into the Next.js bundle.

**Trigger:** 2026-05-11. T-258 landed the gitbook services directory. The user wants the same data surfaced on the dashboard so non-developers browsing `klinkdotfun.vercel.app` see what their agent can pay without first opening gitbook. Locus does this at `paywithlocus.com/endpoints` (the SPA renders `/mpp/index.md` data); we mirror the pattern with a Next.js server component that pre-parses the markdown at build time.

---

## Reading order — before touching code

| # | File | Why |
|---|---|---|
| 1 | `gitbook/services/mpp.md` | The source markdown. Specifically the H2 "Services your agent can pay" table — its row shape locks the parser's output schema. |
| 2 | `apps/web/app/layout.tsx` + `apps/web/app/globals.css` | Where the public-route chrome (font, theme tokens, page background) is defined. The `/services` page should inherit cleanly. |
| 3 | `apps/web/app/page.tsx` (the landing) + `apps/web/app/dashboard/page.tsx` (auth-gated) | Two existing route shapes to model the new one against. `/services` should look more like the public landing than the dashboard chrome. |
| 4 | `apps/web/tailwind.config.ts` | Confirm the brand tokens (sap-green, cream, olive-deep) are available so the page matches the rest of klink. |
| 5 | `paywithlocus.com/endpoints` (eyes-on-glass) | The reference shape. Three columns plus a search/filter. |

---

## Shape

```
URL: https://app.klinkdotfun.live/services

Hero (~30 lines, klink-brand chrome):
  H1: "Services your agent can pay"
  Sub: "MPP-protocol services on Solana that klink agents are verified to spend against end-to-end."

Table:
  | Service | URL | Network | Price | Recipient | Status | Last verified |
  (one row per parsed entry from gitbook/services/mpp.md)

Below table:
  "How to list yours" — a single paragraph that points at the gitbook page
  (`gitbook/services/mpp.md`) where the canonical instructions + build-your-
  own walkthrough live. Hyperlink to the page on `klinkdotfun.vercel.app/services/mpp.md`.

  "Build your own" — same: link to gitbook.

Footer: link back to the dashboard sign-in.
```

---

## Files touched

| File | Type | Responsibility |
|---|---|---|
| `apps/web/lib/services.ts` | Create | Markdown table parser. Pure function: takes the contents of `gitbook/services/mpp.md`, finds the H2 "Services your agent can pay" + the immediately following table, returns a typed `MppService[]`. |
| `apps/web/app/services/page.tsx` | Create | Server component. Reads `gitbook/services/mpp.md` via `fs.readFileSync` at build time, calls the parser, renders the page. Wrapped in the existing dashboard chrome (or a lighter landing-style layout) per brand tokens. |
| `apps/web/tests/unit/services.test.ts` | Create | Parser unit tests against a fixture markdown sample. Pin shape stability so a sloppy PR to gitbook can't silently break rendering. |
| `apps/web/app/services/layout.tsx` | Optional create | If `/services` needs a different layout from the root (probably not — should inherit root layout). |
| `apps/web/public/skill.md` + `gitbook/skill.md` | Patch (byte-equal sync) | The "Service discovery" callout currently points agents at `.../services/mpp.md`; can also offer `.../services` for human-readable browsing. |
| `gitbook/services/mpp.md` | Patch | Add a callout at the top: "Human-readable view: app.klinkdotfun.live/services". Keep gitbook canonical for the listing-flow + build-your-own sections. |
| `TODO.md` | Patch | T-259 task entry in §2 Backend (or §3 Dashboard since this is web). |

---

## Working assumptions

- Auto mode, solo fast-path, single PR + squash merge.
- The gitbook table is hand-maintained markdown; the parser must tolerate normal markdown table whitespace (leading `|`, trailing `|`, multi-space separators, escaped pipes) without crashing.
- Build-time parse means Vercel auto-deploys on every PR merge to `main`, so a new listing PR + merge → dashboard updates within ~60s. No runtime fetch, no caching layer, no API endpoint.
- Page is publicly cacheable (`Cache-Control: public, max-age=300`). No personalization.
- Render as a Tailwind-styled table, not a third-party data-grid. The list is small (one row today, expected to grow slowly).
- Brand consistency with the rest of the dashboard: sap-green primary, cream surface, olive-deep ink (per `globals.css` tokens already in use).
- Em-dash scrub via `scripts/strip-em-dashes.ts` over changed files before commit.

---

## Task 0: Pre-flight

- [ ] **0.1** Read `gitbook/services/mpp.md` and capture the exact table format (column count, header row, alignment row, data rows). Note any inline markdown within cells (links, code spans) that the parser must preserve.
- [ ] **0.2** Read `apps/web/app/layout.tsx` to understand the root layout. Decide whether `/services` needs its own layout or reuses the root.
- [ ] **0.3** Confirm `fs.readFileSync` works in a Next.js App Router server component (it does — server components run on the build server). Find the right path resolution (`process.cwd()` is `apps/web` during build; `gitbook/services/mpp.md` is two levels up).

## Task 1: Markdown parser

- [ ] **1.1** Create `apps/web/lib/services.ts`. Export `MppService` type (name, url, network, price, recipient, status, lastVerified). Export `parseMppServices(markdown: string): MppService[]`.
- [ ] **1.2** Parser logic: find the section heading `## Services your agent can pay`, then walk forward to the next table block (header row + separator + data rows). Stop at the next heading. For each data row, split on `|`, trim each cell, parse the markdown link syntax `[name](url)` for cells that have it.
- [ ] **1.3** Guard against malformed tables: if header is missing or row count is 0, throw with a clear error so the build fails loudly rather than rendering an empty page silently.

## Task 2: Page

- [ ] **2.1** Create `apps/web/app/services/page.tsx` as a server component (no `"use client"`).
- [ ] **2.2** Read `gitbook/services/mpp.md` via `fs.readFileSync(path.join(process.cwd(), '..', '..', 'gitbook', 'services', 'mpp.md'), 'utf8')`. Parse with the helper. Pass to the rendered component.
- [ ] **2.3** Render an H1 + subtitle + table styled with Tailwind matching the rest of the dashboard. Each row's "URL" cell links to the service; "Recipient" cell shows the pubkey truncated to first-4-last-4 with a copy button (Tailwind only, no JS unless needed).
- [ ] **2.4** Below the table: a two-line callout linking to `https://klinkdotfun.vercel.app/services/mpp.md` for the listing-flow and build-your-own instructions.
- [ ] **2.5** Hero copy + subtitle matches the brand voice; no em-dashes; no internal T-IDs.
- [ ] **2.6** Set page metadata: `<title>Services · klink</title>`, og description, og image stays default.

## Task 3: Parser tests

- [ ] **3.1** Create `apps/web/tests/unit/services.test.ts`. Use a fixture string that mirrors the current gitbook table shape. Pin parsed output to expected `MppService[]`.
- [ ] **3.2** Negative tests: malformed table → throws; missing heading → throws; empty row → skips.
- [ ] **3.3** Round-trip test: parse the real `gitbook/services/mpp.md` and assert at least one entry exists, the seed entry matches expectations.

## Task 4: Cross-link from skill.md + the gitbook page

- [ ] **4.1** Update the "Service discovery" callout in `gitbook/skill.md` to offer two URLs: the human-readable `app.klinkdotfun.live/services` and the agent-readable `klinkdotfun.vercel.app/services/mpp.md`. Mirror to `apps/web/public/skill.md` (byte-equal sync).
- [ ] **4.2** Add a callout at the top of `gitbook/services/mpp.md` directing humans to the rendered page.

## Task 5: TODO entry

- [ ] **5.1** Insert a T-259 block in TODO.md `## 2 — Backend` (or `## 3 — Dashboard + SDK` if that's a better fit).

## Task 6: Sanity passes

- [ ] **6.1** `bun run typecheck` in `apps/web` — clean.
- [ ] **6.2** `bun test` in `apps/web` — all green including new parser tests + the byte-equal skill.md sync test.
- [ ] **6.3** `bun scripts/strip-em-dashes.ts` over the changed files — clean.
- [ ] **6.4** `bun scripts/lint-todo.ts` — clean.
- [ ] **6.5** Spin up `bun run dev` locally and curl `http://localhost:3030/services`. Verify the page renders with the seed entry.

## Task 7: PR + merge

- [ ] **7.1** Branch `feat/T-259-services-page` (already created).
- [ ] **7.2** Push, open PR, squash-merge, delete branch.
- [ ] **7.3** Verify post-merge: Vercel rebuilds, `app.klinkdotfun.live/services` returns 200 with the seed entry.

---

## Out of scope

- Per-service detail pages (Locus has `paywithlocus.com/mpp/<service>.md` per service). v1 = table only; detail pages can come later when the list has >3 entries.
- Filtering / categorization. v1 is one entry; no filter needed.
- "Try this with my agent" interactive button. Auth-gated; out of scope.
- API endpoint `/v1/services/mpp` returning JSON. The gitbook markdown is the canonical agent-readable surface today.
- Mainnet services. Devnet only on the page until klink ships mainnet.

---

## Risks + mitigations

| Risk | Mitigation |
|---|---|
| Sloppy PR to gitbook breaks the parser (wrong column count, missing alignment row) | Parser throws loudly; tests pin the schema; Vercel build fails red. |
| `process.cwd()` is the monorepo root, not `apps/web`, in some Next.js build modes | Test the path resolution locally before merging. Fall back to `import.meta.url` if needed. |
| Future build-time markdown imports (skill.md, llms.txt) hit the same path-resolution pattern | Centralize the path-to-root helper in `apps/web/lib/fs.ts` if a second consumer shows up; YAGNI for now. |
| Gitbook publishes the markdown at a different URL than expected (`klink-docs.gitbook.io` vs `klinkdotfun.vercel.app`) | The `/services` page reads the markdown at BUILD time, not via fetch — so the gitbook publishing URL doesn't matter for the dashboard render. Only matters for agents that follow the `/services/mpp.md` cross-link from skill.md. |

---

## Time estimate

| Task | Estimate |
|---|---|
| Plan | (done) |
| Task 0 pre-flight | 10 min |
| Task 1 parser | 20 min |
| Task 2 page | 25 min |
| Task 3 tests | 15 min |
| Task 4 skill.md + gitbook cross-links | 5 min |
| Task 5 TODO entry | 3 min |
| Task 6 sanity | 5 min |
| Task 7 PR + merge | 5 min |
| **Total** | **~90 min** |

---

**Status**: plan written, executing.
