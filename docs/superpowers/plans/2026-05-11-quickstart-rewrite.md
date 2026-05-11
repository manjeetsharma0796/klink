# Gitbook quickstart rewrite — end-user-first onboarding for the agent wallet

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite `gitbook/getting-started/quickstart.md` so the primary reader — a person who wants to give their AI agent a wallet — gets from zero to "my agent just spent USDC under a policy I set" in about five minutes of dashboard clicks, with **no curl-and-cookie-jar** required to get started. The dashboard at `klinkdotfun.vercel.app` is now live and is the canonical front door; the current doc still says "public dashboard URL launching soon" and walks readers through a manual SIWS curl flow that's a hard first step for non-developers.

**Trigger:** 2026-05-11. T-252 + T-253 + T-256 just landed. The agent wallet has three new properties end users should feel in the first 60 seconds of the doc: (1) agent can pay an MPP service end-to-end with one POST; (2) fresh recipient wallets just work (auto-ATA via T-256); (3) the program is live at the new id `DPPE8TAuw5qyWbw5MqcXcAtH2d5RYF5XBXTiN2pKzM3L`. The current quickstart predates all three. Audience answer locked in chat: "End user who wants to give their agent a wallet" — dashboard-first, curl out of scope for the primary flow.

---

## Reading order — read these BEFORE touching the rewrite

| # | File | Why |
|---|---|---|
| 1 | `gitbook/getting-started/quickstart.md` (current, 179 lines) | The shape we're replacing. Most prose is salvageable; the SIWS curl + "dashboard launching soon" framing is what needs to die. |
| 2 | `gitbook/README.md` (35 lines) | Doc home; the three-actor table here is the conceptual frame that should carry through. |
| 3 | `gitbook/getting-started/prerequisites.md` (35 lines) | Already lean; will trim two lines for URL refresh. |
| 4 | `gitbook/skill.md` (258 lines) | Authoritative reference for what agents can do; quickstart should link here, not duplicate. |
| 5 | Live dashboard at `https://klinkdotfun.vercel.app/dashboard` | Eyes-on-glass check of the actual button labels, layout, and copy as it ships today. Quickstart must match what the reader will see. |

---

## What the new quickstart is

A **five-step button-click walkthrough** with the live dashboard URL, ending in a small inline "agent pays a real MPP service" curl as the payoff. No SIWS-by-hand. Manual curl examples for power users are moved to the existing skill.md page (already comprehensive). Total visible length target: ~140 lines, with screenshots described inline as `> **Where on the dashboard:** …` notes so the doc still works without images.

### Shape

```
# Quickstart — Give your agent a wallet

> [60-second proof card]
> Once you finish this guide, this is what your agent will be doing:
> ```bash
> curl -H "Authorization: Bearer $AGENT_API_KEY" \
>   https://klink-api.onrender.com/v1/yield/position
> # → {"liquid":"19790000", "deployed":"0", "accrued":null, "total_balance":"19790000"}
> ```
> That's 19.79 USDC under policy your agent can spend. Let's get you there.

## What you'll need (~3 min to set up)
[crisp checklist — Phantom, devnet SOL, devnet USDC]

## Step 1 — Open the dashboard and connect Phantom
[klinkdotfun.vercel.app + button names]

## Step 2 — Create your klink wallet
[Click "Create Wallet"; Phantom signs init_vault]

## Step 3 — Fund the wallet
[Send devnet USDC via dashboard's Fund page — three options: connected wallet / QR / Dodo]

## Step 4 — Create a session and copy the api key
[Click "New session"; configure max_per_tx, daily_cap, allowed_recipients; copy the api key once]

## Step 5 — Let your agent pay something
[The MPP echo demo using /v1/spend/mpp — works end-to-end against the live mock at service01-kep9.onrender.com]

## What just happened (audit)
[Show the audit log entry; link to Solana explorer]

## Next steps
[Link to skill.md, Sessions concept, Audit concept]
```

The MPP echo example at step 5 is the single highest-leverage piece: the reader sees the agent autonomously pay a real HTTP service and get a real response in one curl. That's the headline.

---

## Files touched

| File | Type | Responsibility |
|---|---|---|
| `gitbook/getting-started/quickstart.md` | Rewrite (preserve frontmatter `icon`, `title`, `description`) | The main change. New shape per above. |
| `gitbook/README.md` | Patch | Status block: drop "dashboard URL launching soon" if present, replace with the live `klinkdotfun.vercel.app` link. Keep the three-actor table verbatim. |
| `gitbook/getting-started/prerequisites.md` | Patch | URL refresh in the "You do NOT need" section if any URL references are stale. Two-line max diff. |
| `gitbook/getting-started/README.md` | Read only | Verify it still routes readers to the rewritten page; no edit expected. |
| `gitbook/skill.md` | No edit | Already authoritative for agent-side reference. |

---

## Working assumptions

- Auto mode active, single-author solo fast-path: branch `docs/quickstart-rewrite-2026-05-11` (no T-id since this is just docs polish), one commit, PR + merge.
- No code changes, no test changes. Web/api tests irrelevant.
- The byte-equal sync test (`apps/web/tests/unit/skill-sync.test.ts`) only checks skill.md; quickstart.md isn't synced. No web test impact.
- The TODO.md lint runs on push; this doesn't touch TODO.md so it's not a concern.
- No screenshots ship as binary assets in this PR (matches the rest of gitbook today, which is prose-only).
- The dashboard's actual button labels as of 2026-05-11 will be verified by reading `apps/web/app/dashboard/**` before writing prose.

---

## Task 0: Pre-flight verification

- [ ] **0.1** Read `apps/web/app/dashboard/page.tsx`, `apps/web/app/dashboard/fund/page.tsx`, `apps/web/app/dashboard/sessions/page.tsx`, `apps/web/app/sign-in.tsx`. Capture the exact button labels users will click in each step ("Connect Phantom" vs "Sign in with Solana" vs other). The doc's copy must match what's on the screen.
- [ ] **0.2** Hit `https://klinkdotfun.vercel.app` from curl to verify it's serving 200. If the deployment is broken, defer the rewrite.
- [ ] **0.3** Verify the MPP echo mock at `https://service01-kep9.onrender.com/echo` still returns the 402 challenge (it has been stable through T-253 + T-256; double-check before using it as the canonical demo).
- [ ] **0.4** Read the current quickstart end-to-end so the rewrite preserves any subtle warnings (the "amount is in base units, 6 decimals" line should survive, etc.).

---

## Task 1: Rewrite `gitbook/getting-started/quickstart.md`

- [ ] **1.1** Preserve the frontmatter block (`---\nicon: rocket\ntitle: Quickstart\ndescription: …\n---`).
- [ ] **1.2** Insert the "60-second proof card" blockquote at the top.
- [ ] **1.3** Replace the "What you'll need" section with a streamlined 3-item checklist (Phantom, devnet SOL, devnet USDC). Drop "Node 20+ or Bun" from the primary list — that's only needed if the reader wants to script later, and we're putting curl out of the primary path.
- [ ] **1.4** Replace Step 1 (SIWS by curl) with **Step 1: Open the dashboard and connect Phantom**. URL: `https://klinkdotfun.vercel.app`. Three sentences max. Link to `concepts/sessions.md` for the "why Solana signing not OAuth" reader.
- [ ] **1.5** Replace Step 2 (POST /v1/wallet) with **Step 2: Create your klink wallet** — click "Create Wallet", Phantom signs `init_vault`, dashboard shows Vault PDA + Vault USDC ATA. One screenshot-description blockquote.
- [ ] **1.6** Replace Step 3 (no equivalent today) with **Step 3: Fund the wallet** — point at the Fund page; mention the three funding paths in one sentence each (connected wallet / QR / Dodo card). Link to `concepts/budgets.md` for the "how much to fund?" question.
- [ ] **1.7** Rewrite Step 3 (POST /v1/session) as **Step 4: Create a session and copy the api key**. Walk through the New Session form: max_per_tx, daily_cap, expiry, allowed_recipients, allowed_instructions bitmap. Stress that the api key is shown once.
- [ ] **1.8** Replace Step 4 (POST /v1/spend/transfer) with **Step 5: Let your agent pay something**. Use the MPP echo demo: `curl -X POST -H "Authorization: Bearer $AGENT_API_KEY" -H "content-type: application/json" -d '{"url":"https://service01-kep9.onrender.com/echo","max_amount":100000,"method":"GET"}' https://klink-api.onrender.com/v1/spend/mpp` → expect 200 + `payment-receipt` header + `{"message":"Paid! 🎉",…}`. Explain in two lines what just happened.
- [ ] **1.9** Rewrite Step 5 (audit) as **What just happened?** — point at the dashboard's Audit Log page (`/dashboard/audit`); mention that every allow + deny has the on-chain tx signature linked to a Solana explorer.
- [ ] **1.10** Replace "Next steps" with three links: skill.md (canonical agent reference), `concepts/sessions.md`, `concepts/audit-trail.md`. Drop the SDK/CLI placeholder comment — those still aren't shipped but the deletion is fine.
- [ ] **1.11** Drop the historical "Beta note. Klink is currently devnet-only" callout from inline; move to a single sentence at the top of the page so it isn't intrusive.

---

## Task 2: Tighten `gitbook/README.md`

- [ ] **2.1** "Status" block: replace "the dashboard, HTTP API, and agent skill are live" with a sentence that names the dashboard URL explicitly (`klinkdotfun.vercel.app`) and the API origin (`klink-api.onrender.com`). Keep the link to `resources/roadmap.md` for SDK/CLI status.
- [ ] **2.2** Verify the "Three actors, three blast radii" table is still accurate. Should not need edits — it predates T-252/253/256 and the model hasn't changed.
- [ ] **2.3** Verify the "What you'll find here" list links all resolve to existing files.

---

## Task 3: Tighten `gitbook/getting-started/prerequisites.md`

- [ ] **3.1** Drop the "Or run your own [backend]" line if it confuses end users; the backend isn't a per-user concern.
- [ ] **3.2** Verify devnet USDC mint reference matches what we now use (`4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` — not actually cited in this file today, no change expected).
- [ ] **3.3** No structural changes; this page is already lean.

---

## Task 4: Sanity passes

- [ ] **4.1** Skim for em-dashes — Klink convention is no em-dashes in prose per `scripts/strip-em-dashes.ts`. Run it against the changed files to be sure.
- [ ] **4.2** Skim for any internal-only T-IDs (`T-252`, `T-253`, `T-256`). Public docs should not name internal task IDs per the PR #62 convention. Replace any with feature descriptions.
- [ ] **4.3** Verify all links in changed files resolve (other docs exist, external URLs are reachable).
- [ ] **4.4** Read the whole rewritten quickstart top to bottom from a cold-start perspective: does a non-developer who's never seen klink before know what to do at every step? If a sentence requires a glossary lookup, simplify.

---

## Task 5: Branch, commit, PR, merge

- [ ] **5.1** Branch `docs/quickstart-rewrite-2026-05-11` off `main`.
- [ ] **5.2** Single commit covering all changes. Commit message body explains: audience shift to end-user, URL updates, MPP-demo replaces transfer-demo, retain skill.md as the developer-facing reference.
- [ ] **5.3** Push, open PR, squash-merge, delete branch.
- [ ] **5.4** Verify final state on `main` matches expected shape.

---

## Out of scope

- **SDK quickstart.** The TypeScript SDK is referenced as "coming soon" in the existing comment block — that's still true; not in scope here.
- **CLI quickstart.** Same.
- **Screenshots.** Gitbook stays prose-only; descriptive blockquotes (`> **Where on the dashboard:** Click the green "New Session" button in the top-right of /dashboard/sessions`) substitute.
- **Localization / non-English.** English only.
- **Concept page rewrites.** This task only touches the on-ramp; concept pages stay as-is.
- **skill.md changes.** Already authoritative + updated in T-256.

---

## Risks + mitigations

| Risk | Mitigation |
|---|---|
| Dashboard UI changes between rewrite and reader landing | Use descriptive copy ("the wallet card on the Overview page") that survives minor button-text drift. |
| MPP echo mock at `service01-kep9.onrender.com` goes down | Add a fallback line: "If the echo is down, the same flow works against any 402-returning MPP-protocol URL." |
| Reader has no devnet USDC and Dodo fiat-in confuses them | Pre-empt: explicitly state in Step 3 that for devnet you can also airdrop fake USDC via `spl-token create-account` or use the connected-wallet flow. Link to prerequisites. |
| Internal T-IDs leak into public doc | Task 4.2 explicitly scrubs. |

---

## Time estimate

| Task | Estimate |
|---|---|
| Task 0: Pre-flight | 15 min |
| Task 1: Quickstart rewrite | 30 min |
| Task 2: README polish | 5 min |
| Task 3: Prerequisites polish | 5 min |
| Task 4: Sanity passes | 10 min |
| Task 5: Branch + PR + merge | 10 min |
| **Total** | **~75 min** active session time |

---

**Status**: plan written, awaiting execution.
