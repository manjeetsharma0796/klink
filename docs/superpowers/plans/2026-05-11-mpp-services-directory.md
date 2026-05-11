# T-258 — MPP-on-Solana services directory + "build your own" guide on klink docs

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ship a single gitbook page that answers two questions in one place — *(1) which MPP-on-Solana services can my klink agent actually pay?* and *(2) how do I build my own MPP service on Solana devnet so klink agents can pay me?* — and links out to the canonical MPP spec + SDK + registries at the bottom. Agent-readable (via the same fetch pattern as skill.md) and human-readable. New entries land via PR to the markdown file.

**Trigger:** 2026-05-11. T-253 + service01's verifier patch landed the first end-to-end MPP-on-Solana payment in this codebase's history (proof: tx `XDPFH7Z3uZ5djZBoidUr2kaGCnqzucojRyxwAALfb2DhUhdx8CNk4a1VuakEpm6GZfWsqEznYaZg7XFbRan11xc`, HTTP 200 + payment-receipt). Today there's no discovery surface on klink that tells an agent or a developer (a) what MPP services exist they can talk to, (b) how to spin up their own. Locus solves the same problem with `paywithlocus.com/services` + `paywithlocus.com/mpp/index.md`. We're at one service (klink's own `service01`); time to make the list discoverable + ready to grow.

---

## Reading order — before touching docs

| # | File | Why |
|---|---|---|
| 1 | `gitbook/SUMMARY.md` | Where the new page hooks into the navigation. |
| 2 | `gitbook/skill.md` (+ `apps/web/public/skill.md`, byte-equal sync) | Where the new "service discovery" entry needs to be linked so agents can find it. |
| 3 | `gitbook/getting-started/quickstart.md` | Reference the new services page from the "use this MPP echo to test" callout in Step 5. |
| 4 | `https://service01-kep9.onrender.com/` + its github repo at `manjeetsharma0796/service01` | Source of truth for the seed entry; pull the README into reference so first-time service-builders have a real example. |
| 5 | `https://mpp.dev/services` + `https://mppscan.com` | Crawl for any other Solana MPP services to seed the initial list. Per service01's README, klink's echo is "the first MPP-on-Solana service to register at mppscan"; the list may collapse to 1 entry at v1. Honest is better than padded. |

---

## Files touched

| File | Type | Responsibility |
|---|---|---|
| `gitbook/services/README.md` | Create | Section landing page (3 lines: scope, link to mpp.md). |
| `gitbook/services/mpp.md` | Create | The actual directory + build-your-own guide. Two H2 sections: "Services your agent can pay" (table) and "Build your own MPP service" (walkthrough). External-links section at the bottom. |
| `gitbook/SUMMARY.md` | Patch | Insert "Services → MPP services" under a sensible parent. |
| `gitbook/skill.md` | Patch | New "Service discovery" section that points at `/services/mpp.md` so agents fetch the list. |
| `apps/web/public/skill.md` | Patch | Byte-equal mirror of `gitbook/skill.md`. |
| `gitbook/getting-started/quickstart.md` | Optional patch | Step 5's MPP echo callout could cross-link to `/services/mpp.md`. One sentence. |
| `TODO.md` | Patch | T-258 task block. Solo fast-path: in-progress → done in single commit if it lands in a single PR. |

---

## Page shape

```markdown
---
icon: list
title: MPP services on Solana
description: MPP-protocol services your klink agent can pay, plus how to build your own.
---

# MPP services on Solana

[Two-sentence intro: MPP is the Payment auth scheme that lets HTTP services charge per-call in USDC; klink's `/v1/spend/mpp` handles the full round-trip; this page lists what's known to work.]

## Services your agent can pay

| Service | URL | Network | Price | Recipient | Status | Last verified |
|---|---|---|---|---|---|---|
| Klink MPP Echo | `https://service01-kep9.onrender.com/echo` | devnet | 0.01 USDC | `81eM3oPR…FcJ2` | ✅ live | 2026-05-11 |

To pay one from your klink agent:

```bash
curl -X POST -H "Authorization: Bearer $KLINK_API_KEY" \
  -H "content-type: application/json" \
  -d '{"url":"<service URL>","max_amount":<base units>,"method":"GET"}' \
  https://klink-api.onrender.com/v1/spend/mpp
```

### Adding your service to this list

Open a PR to `gitbook/services/mpp.md` adding a row. Required fields: service name, URL, network (devnet or mainnet-beta when ready), price in USDC base units, recipient pubkey, contact (GitHub handle), last-verified date. We smoke-test before merging.

## Build your own MPP service

[Two-paragraph walkthrough pointing at @solana/mpp + mppx + service01 as the reference. Devnet USDC mint, recipient setup, deploy options (Render Docker like service01, Vercel functions, etc.).]

### Quickstart pointer

[Copy-paste git clone for service01 as a template + 4-step setup: SOLANA_RECIPIENT env, ASSET=usdc, ADVERTISE=devnet, deploy.]

## References

- **MPP / paymentauth.org spec** — https://paymentauth.org/draft-httpauth-payment-00.html
- **@solana/mpp** SDK — https://www.npmjs.com/package/@solana/mpp
- **mppx** server framework — https://www.npmjs.com/package/mppx
- **mpp.dev/services** registry — https://mpp.dev/services
- **mppscan.com** indexer — https://mppscan.com
- **klink reference service** (service01) — https://github.com/manjeetsharma0796/service01
```

---

## Working assumptions

- Auto mode active; solo fast-path; single PR; squash-merge.
- No code changes; pure docs. No tests required beyond the `apps/web/tests/unit/skill-sync.test.ts` byte-equal check on skill.md.
- `scripts/strip-em-dashes.ts` run across new files before commit.
- Internal T-IDs scrubbed from the public docs page itself; the TODO entry can reference T-258 since TODO.md is internal.
- No screenshots; descriptive prose only (consistent with rest of gitbook).
- Cross-reference but don't duplicate: skill.md stays authoritative for agent reference; the new page is the services directory only.

---

## Task 0: Research

- [ ] **0.1** Curl `https://mpp.dev/services` and `https://mppscan.com` for any Solana-network MPP service entries. Capture names, URLs, recipients.
- [ ] **0.2** Verify each candidate by GET-ing its URL and looking for `402 + WWW-Authenticate: Payment` with `method="solana"`. Only verified entries seed the list.
- [ ] **0.3** Read service01's `README.md` + `client/pay-echo.ts` so the "build your own" section reflects the actual minimal shape.

## Task 1: Author the docs page

- [ ] **1.1** Create `gitbook/services/README.md` (section landing).
- [ ] **1.2** Create `gitbook/services/mpp.md` per the shape above.
- [ ] **1.3** Reference an actual working tx signature in a quoted example block (use the T-253 smoke result `XDPFH7Z3…11xc` as the canonical proof tx).

## Task 2: Wire navigation

- [ ] **2.1** Add the new page to `gitbook/SUMMARY.md` under a sensible top-level entry (probably right under "Developer Resources" or as a new top-level section).

## Task 3: Cross-link from skill.md

- [ ] **3.1** Add a short "Service discovery" callout to `gitbook/skill.md` near the spend section, pointing agents at `https://klinkdotfun.vercel.app/services/mpp.md` (or whatever path Vercel serves the gitbook page on; default is gitbook's published origin if SUMMARY-linked).
- [ ] **3.2** Mirror to `apps/web/public/skill.md`; verify byte-equal sync test passes.

## Task 4: Cross-link from quickstart (optional)

- [ ] **4.1** Step 5's MPP echo section: add one sentence — "For more MPP services your agent can pay, see [Services → MPP](../services/mpp.md)."

## Task 5: TODO.md entry

- [ ] **5.1** Insert a T-258 block in `## 2 — Backend` (or `## 5 — Docs + design` if that feels more right; this is docs-only).
- [ ] **5.2** Status: `in-progress @Jishnu 2026-05-11` (or `done` if executed in a single commit per solo fast-path).

## Task 6: Sanity

- [ ] **6.1** `bun scripts/strip-em-dashes.ts gitbook apps/web/public` — clean.
- [ ] **6.2** `bun scripts/lint-todo.ts` — clean.
- [ ] **6.3** Web tests pass (`bun test` from `apps/web`).
- [ ] **6.4** All internal links resolve.

## Task 7: PR + merge

- [ ] **7.1** Branch `docs/T-258-mpp-services-page` (already created).
- [ ] **7.2** Push, open PR, squash-merge, delete branch local + remote.

---

## Out of scope

- API endpoint backing the list (`/v1/services/mpp` JSON). v1 is docs-only; api comes later if the list grows past ~10 entries.
- Self-serve listing form. Manual PR is the v1 intake.
- Mainnet entries. Devnet only until klink ships mainnet (gated on T-114 multisig).
- Cross-chain services (Base, etc.). Solana only on this page.
- Service health-check automation. Manual "last verified" date is fine at this size.

---

## Time estimate

| Task | Estimate |
|---|---|
| Plan | (done) |
| Task 0 research | 10 min |
| Task 1 page authoring | 25 min |
| Task 2 SUMMARY.md | 2 min |
| Task 3 skill.md cross-link | 5 min |
| Task 4 quickstart cross-link | 2 min |
| Task 5 TODO entry | 5 min |
| Task 6 sanity | 5 min |
| Task 7 PR + merge | 5 min |
| **Total** | **~60 min** |

---

**Status**: plan written, executing.
