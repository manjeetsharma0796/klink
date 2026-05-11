---
title: Team task board
purpose: Shared async task tracker for the 4-person team across Windows/macOS/Linux — humans and their Claude agents
last_updated: 2026-05-11
---

# TODO

Single source of truth for what's in flight. Anyone — human or Claude agent — can pick pending tasks, add new ones, or release stale ones. **Read [`docs/runbooks/team-collaboration.md`](docs/runbooks/team-collaboration.md) once before your first claim.**

## How to use this file (90-second version)

1. **Find a pickable task** — `Status: pending` AND every entry in `Depends-on` is `done`.
2. **Claim** — change `Status: pending` → `Status: in-progress @your-handle YYYY-MM-DD`. Commit *only that line* on a new branch named `claim/T-XXX-<slug>`, push, open a PR titled `claim: T-XXX`. The merge of the claim PR is the lock — protects against two people picking the same task.
3. **Work** — branch out from `main` into `feat/T-XXX-<slug>` (or `fix/`, `docs/`). Reference `T-XXX` in every commit and the implementation PR title.
4. **Finish** — same PR that merges the work also flips the line to `Status: done @your-handle YYYY-MM-DD` and moves the task block to the **Done** section at the bottom.
5. **Stuck** — change to `Status: blocked — <one-line reason>` and ping the team channel. Keep the entry; do not delete it.
6. **Add a task** — append a new block under the right section using the next free ID. State `Acceptance` clearly so anyone can pick it up cold.
7. **Drop a claim** — flip `Status: in-progress @you DATE` back to `Status: pending`. PR title `unclaim: T-XXX`. No shame in it. To take *someone else's* claim, see [`team-collaboration.md`](docs/runbooks/team-collaboration.md) §2.2.

### Stale-claim rule

If a task is `in-progress` for **more than 5 days with zero commits referencing its ID**, anyone may revert it to `pending` and re-claim. Add a `Reverted: <date> by @you — reason` line for paper trail.

You can also override a teammate's claim **before** the 5-day mark when you have concrete reason (conflict, stronger context, blocking your own work). Same mechanic, same paper-trail line. PR title: `override: T-XXX`. The 5-day rule is a guarantee that nothing rots forever — not a minimum cool-down. See [`docs/runbooks/team-collaboration.md`](docs/runbooks/team-collaboration.md) §2.2.

### Solo / no-review fast path

If you're working alone with no reviewer available, edit `TODO.md` directly on `main`, push (the push is the lock), then start the implementation branch. Don't skip the visible status change — teammates need to see it.

## Conventions

| Thing | Convention |
|---|---|
| Branch | `feat/T-XXX-<short-slug>` / `fix/T-XXX-<slug>` / `docs/T-XXX-<slug>` / `claim/T-XXX-<slug>` |
| Commit | `T-XXX: <verb> <object>` (e.g. `T-105: revert transfer when amount > max_per_tx`) |
| PR title | `T-XXX — <task title>` |
| PR body | Link the TODO line; check off Acceptance criteria |
| Scope per PR | One task = one PR. If the task balloons, stop and split — second thing gets a new T-XXX entry |
| Solana network | All work targets **devnet** until §6.4 mainnet checkpoints are signed off |

## Team

> **Team channel:** Telegram group `klink-dev` — bot [`@klinkdotfun_bot`](https://t.me/klinkdotfun_bot). Invite link is shared off-repo (DM @Jishnu / @Manjeet for access — public invite intentionally not committed). Notification workflow: [`.github/workflows/telegram-notify.yml`](.github/workflows/telegram-notify.yml). This is the place referenced by `team-collaboration.md` §6 and §8.

| Handle | OS | Strengths / preferred area | Timezone |
|---|---|---|---|
| `@Jishnu` | Windows | Server side/integration/maintainance/system/debugging | IST |
| `@Manjeet` | Windows | Server side/integration/maintainance/system/debugging | IST |
| `@Prithwish` | Linux | TBD | IST |
| `@Mouli` | TBD | TBD | IST |
| `@Manish` | macOS | TBD | IST |

> **Action:** Each person fills in their row before claiming a first task.

## Active claims

To see who's working on what right now: `grep "Status: in-progress" TODO.md`. Claims live inline with each task — no separate roster.

## Sections

1. [Solana CLI / on-chain (Anchor)](#1--solana-cli--on-chain) — `T-1xx` — OS-sensitive install, Anchor program, tests, devnet
2. [Backend (Node + TS)](#2--backend) — `T-2xx` — Express, Postgres, Solana client, off-chain policy
3. [Dashboard + SDK](#3--dashboard--sdk) — `T-3xx` — Next.js dashboard, TypeScript SDK
4. [Infrastructure / DevOps](#4--infrastructure--devops) — `T-4xx` — RPC, hosting, CI
5. [Docs + design](#5--docs--design) — `T-5xx` — runbooks, demo script, decision memos
6. [Done](#done)
7. [Blocked](#blocked)

> **Seed scope:** task list reflects the design spec at [`docs/specs/2026-04-28-agent-wallet-design.md`](docs/specs/2026-04-28-agent-wallet-design.md). If the spec changes, edit/add tasks here in the same PR.

---

## 1 — Solana CLI / on-chain

> **OS-sensitive setup, OS-agnostic development.** Solana CLI + Anchor have per-OS installers (T-101). Once installed, Anchor program work runs the same on every OS. `solana-test-validator` is smoothest on macOS/Linux; Windows devs should use **WSL2** — see runbook §4.

### Status legend
- `pending` — anyone with deps cleared can pick
- `in-progress @handle YYYY-MM-DD` — locked
- `review` — implementation PR open, awaiting review
- `blocked — <reason>` — stuck
- `done @handle YYYY-MM-DD` — completed; move block to Done

### T-101 — Install Solana CLI + Anchor on every dev machine
- Status: pending
- Depends-on: —
- OS: per-dev (each person does their own; this task is N parallel claims)
- Scope: setup
- Acceptance: `solana --version` and `anchor --version` print on every dev box; pinned versions logged in `docs/runbooks/dev-environment.md` (T-501).
- Notes: pin Solana `3.1.x` and Anchor `1.0.x` (revised by T-102 — see `docs/runbooks/dev-environment.md` §1 + §5). Per-OS commands in the runbook. All four devs can claim this concurrently — each commits a row to `dev-environment.md` confirming their setup.

### T-110 — TDD revert suite (spec §6.1.1)
- Status: in-progress @Manish 2026-04-29
- Depends-on: T-105, T-106, T-107
- OS: any
- Scope: tests
- Acceptance: 7 named tests in §6.1.1 pass; each revert has its own test; runs in CI via T-405.

### T-111 — Fuzz / property tests
- Status: pending
- Depends-on: T-110
- OS: any (faster on Linux/macOS)
- Scope: tests
- Acceptance: random input over `max_per_tx`, `daily_cap`, allowlist size; 10k iterations; CI-gated.

### T-112 — Integration test on local validator
- Status: pending
- Depends-on: T-105, T-106, T-108, T-109
- OS: macOS/Linux native; Windows via WSL2
- Scope: tests
- Acceptance: full flow init → add_session → spend in-bounds → spend over-bounds (revert) → kamino_deposit → kamino_withdraw → revoke. Passes via `anchor test`.

### T-114 — Multisig upgrade authority
- Status: pending
- Depends-on: T-113
- OS: any
- Scope: governance
- Acceptance: upgrade authority transferred from a single keypair to a 2-of-N Squads multisig; all four devs are members; transfer tx signature logged.

### T-115 — External program review
- Status: pending
- Depends-on: T-114, T-110, T-111, T-112
- OS: any
- Scope: security
- Acceptance: at least one of Neodyme / OtterSec / Sec3 / known peer reviewer signs off; findings tracked as T-1xx follow-ups; mainnet deploy gated on this.

### T-116 — `owner_transfer_usdc` instruction (escape hatch)
- Status: done @Prithwish 2026-05-02
- Depends-on: T-103, T-105
- OS: any
- Scope: anchor-program
- Acceptance: new instruction at `programs/agent_wallet/src/instructions/owner_transfer_usdc.rs` that lets the vault owner move USDC from `vault_usdc_ata` to any `recipient_usdc_ata` they specify, signed by Phantom (no session, no recipient allowlist, no cap). Account layout: `owner` (signer), `vault` (PDA, `has_one = owner @ NotVaultOwner`), `vault_usdc_ata`, `recipient_usdc_ata`, `token_program`. CPI to SPL Token transfer using vault PDA seeds `["vault", owner]` for the signer. The current `transfer_usdc` instruction is hard-bound to `session_signer: Signer<'info>` (programs/agent_wallet/src/instructions/transfer_usdc.rs:24-28), so without this new instruction the owner CANNOT move USDC out of the vault even if the backend disappears — breaks the spec §5 "emergency drain" / "wallet itself still functional via direct Phantom interaction" promise (design spec §5:534). Today the only escape paths that work standalone are `revoke_session` (T-106), `set_max_deployed_fraction` (T-107), and `kamino_withdraw` (T-109) — those move funds from Kamino back to the vault but cannot extract them off the vault. With this instruction shipped, the owner can recover everything via Phantom + a generic Solana CLI even if klink shuts down. Tests in T-110's revert suite: owner-signs-success, non-owner-signs-fails, vault.owner mismatch fails. Backend / dashboard wiring (POST `/v1/wallet/transfer` build-tx + UI) tracked separately as a T-2xx follow-up once this lands.
- Notes: surfaced 2026-05-02 by an audit of the non-custodial claim. **Fixes a real gap, not just a polish task.** Touch surface is small (~50 LOC of rust), but on-chain so it needs `anchor build` + redeploy via the current single-keypair authority (still T-114 territory for the multisig migration).

---

## 2 — Backend

(All OS-agnostic. Anyone can pick.)

### T-260 — Live deploy of curated `service_catalog` rows on prod Neon (T-234 follow-up)
- Status: pending
- Depends-on: T-234
- OS: any
- Scope: ops
- Acceptance: the three live-deploy steps that T-234 deferred. (1) Run `bun --filter @klink/api run db:seed` against prod Neon — needs `DATABASE_URL` exported in the operator's shell from Render env vars; idempotent through `onConflictDoNothing` on `slug`. After this, `SELECT slug, enabled FROM service_catalog ORDER BY slug` returns the four seeded rows (`anthropic-claude`, `openai-chatgpt`, `exa-search`, `firecrawl`) with `enabled=false` and the system-program placeholder pubkey. (2) Coordinate with mpp.dev / pay-with-locus to publish real recipient pubkeys for each of the four slugs, then run `bun apps/api/scripts/catalog-update.ts --slug <slug> --recipient <pubkey> --enable --apply` per row. Dry-run first (without `--apply`) for each. (3) Smoke-test each enabled slug end-to-end per the curl recipe in `docs/runbooks/service-catalog-deployment.md` §4 — direct upstream probe to confirm 402 shape, then a call through `POST /v1/spend/service` to confirm the proxy returns the upstream payload + `x-tx-signature`. Document the smoke-test results inline in this task block before flipping `enabled=true` on subsequent rows. **If upstreams turn out to speak the MPP `WWW-Authenticate: Payment …` dialect rather than plain x402 JSON, callers should hit `/v1/spend/mpp` (T-253) rather than `/v1/spend/service`** — see runbook §6 "Spec drift". The catalog rows still serve their lookup purpose either way; reroute the agent calls, don't rebuild the proxy.
- Notes: split out of T-234 on 2026-05-11. The in-repo portion of T-234 (admin script `apps/api/scripts/catalog-update.ts`, dry-run-by-default with `--apply`, plus runbook + tests) shipped under T-234 itself. This follow-up is the steps that need prod creds (`DATABASE_URL` for prod Neon) and external coordination (the mpp.dev / pay-with-locus team for real recipient pubkeys). Step (1) is a 5-second op once you have the URL; step (2) is the external blocker; step (3) is one curl per slug.

### T-259 — Public `/services` page on dashboard, rendering gitbook MPP services table
- Status: in-progress @Jishnu 2026-05-11
- Depends-on: T-258
- OS: any
- Scope: web + tests + docs
- Acceptance: new unauthenticated route at `app.klinkdotfun.live/services` (Next.js App Router server component at `apps/web/app/services/page.tsx`) renders the curated MPP-on-Solana services table sourced from `gitbook/services/mpp.md`. gitbook stays the single source of truth; new listings happen via PR to the markdown file; the page parses that markdown AT BUILD TIME (Node `fs.readFileSync` from the server component, resolved via `process.cwd()` two levels up to the monorepo root) and ships the rows as static data in the Vercel bundle. No runtime fetch, no API endpoint, no second JSON file to maintain. New parser at `apps/web/lib/services.ts` exposes `parseMppServices(markdown: string): MppService[]` with strict schema validation: missing section heading throws, malformed alignment row throws, column count drift throws, zero data rows throws. 10 new unit tests at `apps/web/tests/unit/services.test.ts` pin the schema + round-trip against the real gitbook file. Page chrome is a custom minimal public header (klink wordmark + "Open dashboard" CTA, no auth required); table reuses the existing shadcn `Table` primitives at `apps/web/app/_components/ui/table.tsx`; recipient column uses the existing `truncatePubkey` helper at `apps/web/lib/formatters.ts:16`; status column gets a pill (sap-green/20 wash for "live", muted for everything else) matching the rest of the dashboard. Two cards below the table point at gitbook for "List your service" (PR flow) and "Build your own" (5-step setup) — no duplication of those sections inside the dashboard page. `gitbook/skill.md` + `apps/web/public/skill.md` (byte-equal sync test passes) updated to offer both the agent-readable `/services/mpp.md` and the human-readable `/services` URLs. `gitbook/services/mpp.md` gains a top callout pointing humans at the rendered page. 47/47 web tests pass (37 baseline + 10 new); `tsc --noEmit` clean; TODO.md lint OK. Plan + traceability at `docs/superpowers/plans/2026-05-11-services-page.md`.
- Notes: triggered 2026-05-11 by user request after T-258 landed the gitbook directory. Matches the paywithlocus.com/endpoints discovery surface. First true public unauthenticated page in apps/web (the existing `apps/web/app/page.tsx` redirects to /dashboard; klink's marketing landing lives at `klinkdotfun.live` in a separate repo). Build-time parse chosen over runtime fetch so Vercel rebuilds deterministically on every PR merge to main — no CDN cache to invalidate, no runtime error class to handle. Out of scope: per-service detail pages (Locus has `paywithlocus.com/mpp/<service>.md` per service; revisit when klink has >3 entries), filtering, "try this with my agent" interactive buttons, mainnet entries.

### T-258 — MPP-on-Solana services directory + "build your own" guide on klink docs
- Status: in-progress @Jishnu 2026-05-11
- Depends-on: T-253
- OS: any
- Scope: docs
- Acceptance: new gitbook page at `gitbook/services/mpp.md` answering two questions in one place: (1) which MPP-on-Solana services klink agents can pay (table with name, URL, network, price, recipient, status, last-verified date; seeded with `service01-kep9.onrender.com/echo` as the only verified entry today, with a clear "open a PR to add yours" mechanic), and (2) how to build your own MPP merchant on Solana (5-step setup pointing at `manjeetsharma0796/service01` as the canonical reference, the inner-instruction-walk caveat for smart-contract wallets, and the devnet vs mainnet USDC mint reference). External-links section at the bottom: paymentauth.org spec, `@solana/mpp` + `mppx` npm packages, `mpp.dev/services`, `mppscan.com`, the service01 repo. New section landing page `gitbook/services/README.md` routes between protocols. `gitbook/SUMMARY.md` gets a new "Services" group with both pages. `gitbook/skill.md` + `apps/web/public/skill.md` (byte-equal sync) gain a "Service discovery" callout pointing agents at `https://klinkdotfun.vercel.app/services/mpp.md` so a paste-this-skill-to-your-agent flow can fetch the list. `gitbook/getting-started/quickstart.md` Step 5 cross-links forward to the new page. Plan + traceability at `docs/superpowers/plans/2026-05-11-mpp-services-directory.md`. Em-dashes scrubbed; web tests (skill.md byte-equal sync) green; TODO.md lint green.
- Notes: triggered 2026-05-11 by user request after T-253 landed the first end-to-end MPP-on-Solana payment (tx `XDPFH7Z3uZ5djZBoidUr2kaGCnqzucojRyxwAALfb2DhUhdx8CNk4a1VuakEpm6GZfWsqEznYaZg7XFbRan11xc`). Locus solves the same discovery problem with `paywithlocus.com/mpp/index.md`; this is klink's equivalent. Initial list is intentionally minimal, honest beats padded. Out of scope: JSON registry served at `/v1/services/mpp` (revisit if the list grows past ~10 entries), self-serve listing endpoint, cross-chain services, automated health checks.

### T-257 — Dodo disbursement handler self-heals on missing ATAs + handles missing-wallet-row gracefully
- Status: in-progress @Jishnu 2026-05-11
- Depends-on: T-215, T-245, T-256
- OS: any
- Scope: api + tests
- Acceptance: surfaced 2026-05-11 by a real $50 Dodo card payment that landed in production and failed disbursement with `TREASURY_SUBMIT_FAILED: invalid account data for instruction` from the SPL Token Program (audit row visible at `app.klinkdotfun.live/dashboard/audit`, timestamp 2026-05-11 08:32:25, `action=fund_dodo decision=deny amount=$50.00`). Root cause: the treasury's USDC ATA `DBRYhuJUmEzcqpS2WabaHKxwCJBz5QSvuSMoys66vQVB` (the env-configured `TREASURY_USDC_ATA`, deterministically derived from treasury pubkey `9muAwR8a4LEgFGLNPfoUHhJrfLmtkXFBvpBQCx2GLVTU` + USDC mint `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`) was never initialized on-chain on devnet; SPL Token rejected the transfer ix because the source account doesn't exist. Three-part patch in `apps/api/src/routes/dodo.ts`: (1) prepend `createAssociatedTokenAccountIdempotentInstruction` for the **source** ATA (treasury → USDC) so a fresh deployment never traps a payment in this failure mode; (2) prepend the same for the **destination** ATA (vault → USDC) mirroring T-256's fix for spend handlers, so fresh user wallets whose USDC ATA hasn't been physically created don't crash the disbursement; (3) change the missing-wallet-row branch (currently returns `500 {"error":"wallet missing"}` causing infinite Dodo retries and no audit row) to `200 + deny audit row` with reason `WALLET_MISSING_AT_DISBURSEMENT_TIME` so Dodo stops retrying and operators get a deny row to alert on. Switch the SPL ix from plain `Transfer` to `TransferChecked` for defense-in-depth (parity with T-252's spend handler migration, mint+decimals on-wire so SPL Token reverts on decimals mismatch). Tests: update any dodo handler tests that snapshot the tx shape; add a deny-path test for the WALLET_MISSING case. Out of scope: moving tx submission off the webhook response window (the race window where slow RPC causes Dodo retries); that's a separate `T-2xx` follow-up. Full audit at `docs/superpowers/plans/2026-05-11-dodo-treasury-audit.md`.
- Notes: this only fixes the CODE side. Initializing the treasury USDC ATA on devnet + funding it with test USDC is a separate one-time ops step that has to happen via the treasury keypair; documented in the audit plan file. The stuck $50 payment from 2026-05-11 08:32:25 can be recovered manually via a one-shot replay script after the treasury ATA is funded; tracked implicitly as a 30-min ops task.

### T-312 — Serve `skill.md` from the api at `GET /skill.md`
- Status: in-progress @Jishnu 2026-05-11
- Depends-on: T-311
- OS: any
- Scope: api
- Acceptance: `apps/api/src/app.ts` mounts a static handler at `GET /skill.md` (and likely `GET /.well-known/skill.md` for forward compat) returning the canonical agent skill with `Content-Type: text/markdown; charset=utf-8`. Mirrors the pay-with-locus pattern: an agent given **only** the api URL + a bearer token can fetch the skill from the same origin without out-of-band coordination. Today the only place skill.md is served is `apps/web/public/skill.md` on the dashboard origin (`:3030` dev, eventually `klink.dev`). The 2026-05-02 cold-start UX test confirmed an agent given only the api URL has zero discovery path: `GET /skill.md`, `GET /.well-known/agent.json`, and `klink-docs.gitbook.io/skill.md` all 404. Source: read the file via `readFileSync` from disk at module-load (the `gitbook/skill.md` and `apps/web/public/skill.md` copies are kept byte-equal by `apps/web/tests/unit/skill-sync.test.ts`; reuse one of those paths or copy a third time and extend the sync test). Add a `cache-control: public, max-age=300, s-maxage=300` header. Add `Access-Control-Allow-Origin: *` so cross-origin agent fetchers don't get blocked.

### T-239 — Agent-readable session metadata endpoint (`GET /v1/session/me`)
- Status: in-progress @Jishnu 2026-05-11
- Depends-on: T-204, T-206
- OS: any
- Scope: api
- Acceptance: new `GET /v1/session/me` returning the calling api-key's session config — `max_per_tx`, `daily_cap`, `daily_spent`, `daily_window_start`, `expiry`, `allowed_recipients`, `allowed_instructions` (decoded from the on-chain Session PDA via existing `decodeSessionAccount`). Mirrors what the dashboard sees at `GET /v1/sessions/:id` but scoped to the caller's own session via `req.session.id` from the api-key middleware. Today an agent hit `403`/on-chain-revert errors with no way to introspect its own bounds; T-237 validation flagged this as a real friction point ("agent can only react to failures, can't plan"). Update skill.md to document. Test against the live endpoint via `apps/api/scripts/e2e-dashboard.ts` extension.
### T-246 — Auto-run Drizzle migrations on API startup
- Status: in-progress @Manjeet 2026-05-05
- Depends-on: T-245
- OS: any
- Scope: api
- Acceptance: surfaced minutes after T-245 deployed: every checkout-create on the live Render API 500'd with `failed to record pending payment`, backed by `PostgresError: column "payment_id" of relation "dodo_payments" does not exist` and `column audit_log.dodo_payment_id does not exist` in the logs. T-245's Drizzle migration `0001_right_bug.sql` shipped in the repo but never ran on the deployed Neon DB — Render's auto-deploy applies code, not schema migrations, and the start command (`cd apps/api && bun src/index.ts`) didn't chain a migrate step. New `apps/api/src/db/migrate.ts` exposes `runMigrations()` which uses drizzle's `migrate(drizzle(postgres(DATABASE_URL, {max:1})), { migrationsFolder: "./drizzle" })` to apply any pending migrations idempotently (drizzle's `__drizzle_migrations` table tracks applied entries; second-and-later cold-starts are one-round-trip no-ops). `apps/api/src/index.ts` calls `runMigrations()` BEFORE `app.listen` and `process.exit(1)`s on failure so Render keeps the previous deploy live rather than promoting a broken instance. No Render config change required (avoids the Render-MCP `update_web_service` not supporting `startCommand` updates). 193/193 tests still pass; tsc clean.

### T-245 — Dodo invoice persistence + audit-log linkage + webhook-matching bug fix
- Status: done @Manjeet 2026-05-05
- Depends-on: T-214, T-215, T-243, T-244
- OS: any
- Scope: api + web + db
- Acceptance: three coupled fixes shipped together because they all live in the same dodo.ts handler. (1) **Webhook matching bug:** the original T-215 handler queried `dodo_payments WHERE dodo_session_id = event.data.id` but Dodo's `payment.succeeded` events carry `data.checkout_session_id` (the cks_…), not a generic `data.id` — so every real payment 0-rowed and stayed `pending` forever. Fixed: handler now uses `event.data.checkout_session_id`. Non-matching events (subscription.*, dispute.*, license.*, payment.processing) now ack with `200 ignored` instead of `400`. (2) **Invoice persistence:** added `paymentId` (varchar 100), `invoiceId` (varchar 100), `invoiceUrl` (text) to the `dodo_payments` schema; webhook handler captures all three from `event.data` on settlement (and on the `failed` branch too). New Drizzle migration `0001_right_bug.sql`. (3) **Audit-log linkage:** added `dodoPaymentId` (uuid, nullable, FK → dodo_payments.id, on-delete set-null) to `audit_log`; webhook handler populates it on every `fund_dodo` insert (allow + deny). `getAuditHandler` now LEFT JOINs `dodo_payments` so the audit page receives `dodoSessionId`, `dodoInvoiceUrl`, `dodoPaymentIdExternal` for fund_dodo rows. (4) **Status endpoint flexible lookup:** `GET /v1/fund/dodo-payment/:id` now accepts either a session id (cks_…) or a payment id (pay_…) and dispatches by prefix. Response includes `payment_id`, `invoice_id`, `invoice_url`. (5) **Return page:** reads `?payment_id` from URL (Dodo's redirect-URL convention) in addition to `?session_id`/`?session`/sessionStorage; uses `?status=succeeded` to render an optimistic "Payment received — settling on-chain" state immediately while still polling for the on-chain settlement; renders a Download Invoice CTA in settled + timeout states when invoice_url is present. (6) **Audit page:** Tx column renamed to "Tx / Invoice"; fund_dodo rows render an "invoice" link below the tx signature when `dodoInvoiceUrl` is populated. Customer can revisit `/dashboard/audit` any time and download invoices for past top-ups. 193/193 API tests pass; web typecheck clean.

### T-244 — Dodo post-checkout return page + status endpoint
- Status: done @Manjeet 2026-05-05
- Depends-on: T-214, T-215, T-243
- OS: any
- Scope: api + web
- Acceptance: customer no longer stranded on Dodo's hosted "Successful" page after paying. Three pieces. (1) `apps/web/app/dashboard/fund/page.tsx` now passes `success_url: ${origin}/dashboard/fund/return` and `cancel_url: ${origin}/dashboard/fund?cancelled=1` on every `POST /v1/fund/dodo-checkout`, and stashes the returned `dodo_session_id` in `sessionStorage` so the return page has the lookup key without depending on whatever Dodo appends to the URL. (2) New `GET /v1/fund/dodo-payment/:sessionId` endpoint (dashboard-JWT, owner-scoped via `dodo_payments.userId`; same 404 for not-found and wrong-owner so existence isn't leaked) returns `{ status, amount_usd, amount_usdc, tx_signature, settled_at }` for the return page to poll. (3) New page `apps/web/app/dashboard/fund/return/page.tsx` reads the session id from URL or sessionStorage, polls the status endpoint every 2s for up to 30s, and renders four states: pending (animated dot + skeletons), settled (amount summary + tx signature + Solana explorer link + 5s auto-redirect to `/dashboard`), failed (retry CTA), and timeout (links to audit log). Falls back to a "no session" view if neither URL nor storage has it (e.g., direct nav). Replay-tested: Dodo redirects after `/checkouts` flow now lands the customer on the new page; webhook → on-chain settlement closes within ~10s and the page flips pending → settled with the on-chain signature visible.

### T-243 — Dodo fiat-in E2E + Standard Webhooks signature + checkout shape fix
- Status: done @Manjeet 2026-05-05
- Depends-on: T-214, T-215, T-403
- OS: any
- Scope: api + tests
- Acceptance: two production bugs found and fixed against the live Dodo test-mode integration. (1) `verifyDodoSignature` in `apps/api/src/routes/dodo.ts` rewritten to the [Standard Webhooks](https://www.standardwebhooks.com/) scheme Dodo actually uses (confirmed against [Dodo's docs](https://docs.dodopayments.com/developer-resources/webhooks) + the `whsec_` prefix on the live secret + 8 production retry failures observed on the Render deploy). New shape reads three headers (`webhook-id`, `webhook-timestamp`, `webhook-signature`), verifies HMAC-SHA256 base64 over `${id}.${timestamp}.${rawBody}`, with `whsec_`-stripped + base64-decoded secret. Multi-sig parsing for `v1,<b64> v1,<b64>`. Timestamp tolerance ±300s rejects replays. Webhook handler in the same file updated; route mounted with `express.raw({ type: () => true })` in `apps/api/src/app.ts` so rawBody is captured regardless of forwarded `Content-Type`. (2) `defaultCreateDodoSession` rewritten to call Dodo's actual `POST /checkouts` endpoint with the correct `product_cart` + `customer` body shape (was calling non-existent `/checkout/sessions` with a flat `{amount, currency}` body, returning 502 on every dashboard checkout attempt). Uses `DODO_PRODUCT_ID` env (one canonical pay-what-you-want product); customer email/name synthesized from the SIWS user record. T-215's 6 unit tests rewritten against the Standard Webhooks scheme; 3 new tests added (timestamp drift, multi-sig, `whsec_` prefix). New checkout-shape tests for the corrected request body. E2E pass via deployed Render API + real test purchase: `pay_0Ne2lXAWMkP06YQhQJz9A` settled and the previously-failing 8 webhook retries now return `200 unknown_session` (signature verifies; no matching dodo_payments row because that session was created via MCP not via the API).
- Notes: surfaced 2026-05-03 from observing 8 consecutive webhook attempt failures on the Dodo dashboard against `https://klink-api.onrender.com/v1/webhooks/dodo`. T-215's signature tests passed in isolation because they signed-and-verified with the same custom (wrong) HMAC algorithm; T-214's checkout-create code used a guessed Dodo endpoint shape that never matched the live API. Both bugs latent since their respective tasks shipped — neither was exercised end-to-end against real Dodo until now. The Dodo MCP server (`dodopayments_api`, `npx -y dodopayments-mcp@latest`) was wired up as part of the same effort to give the agent direct API access during testing — config lives in `.mcp.json` (committed, env-var-referenced) and `~/.claude.json` (user-local, literal keys); each teammate sets `DODO_PAYMENTS_API_KEY` + `DODO_PAYMENTS_WEBHOOK_KEY` in their own shell env. Originally claimed under T-236 before that id was taken by an unrelated cleanup task; renumbered to T-243 to resolve the collision.

---

## 3 — Dashboard + SDK

### T-310 — SDK quickstart README
- Status: done @Manjeet 2026-05-02
- Depends-on: T-309
- OS: any
- Scope: docs
- Acceptance: `packages/sdk/README.md` — install (workspace-internal + vendor option), 5-line quickstart against the live Render endpoint, per-method usage block for all 6 endpoints (`spendTransfer`, `spendSignPayment`, `spendService`, `yieldDeposit`, `yieldWithdraw`, `yieldPosition`) with realistic args + sample responses, error-handling section keyed off `KlinkApiError.status` + `KlinkDenyReason`, testing section showing the injectable `FetchLike` pattern (no global fetch mocking needed), and references back to the design spec, api-surface doc, `gitbook/skill.md`, and `HANDOVER.md`. Type shapes in examples cross-checked against `packages/sdk/src/types.ts`. T-234 caveat about empty `service_catalog` called out inline so agents reading the doc don't hit a silent 404.

---

## 4 — Infrastructure / DevOps

### T-412 — Wire `klinkdotfun.live` domain to dashboard + api
- Status: pending
- Depends-on: T-301, T-403
- OS: any
- Scope: infra
- Acceptance: domain `klinkdotfun.live` (already purchased — registrar handover with the team member taking this) configured to point at the prod dashboard and api. Two subdomains expected: (a) **apex / `www`** → Vercel/Render dashboard hosting (currently the dashboard prod URL is unset; skill.md placeholder is `klink.dev` which the team doesn't own). (b) **`api.klinkdotfun.live`** → Render service `klink-api.onrender.com`. Update DNS A/ALIAS/CNAME records, add domain in Render dashboard, get TLS issued (Render auto-provisions Let's Encrypt). After cutover: bulk-update skill.md prod URLs (`klink-api.onrender.com` → `api.klinkdotfun.live`, `klink.dev` → `klinkdotfun.live` or `www.klinkdotfun.live`) — the byte-equal sync test in `apps/web/tests/unit/skill-sync.test.ts` will keep gitbook + dashboard copies aligned. Update `gitbook/SUMMARY.md` references, `HANDOVER.md` §2 references, and `apps/api/.env.example` `SOLANA_RPC_URL` comments if any reference the placeholder URLs. Smoke: SIWS sign-in works on the new domain (cookie domain config, `JWT_SECRET` unchanged), `/skill.md` serves at `klinkdotfun.live/skill.md` (or `api.klinkdotfun.live/skill.md` once T-312 lands), live e2e harness still passes against the new api URL.
- Notes: filed 2026-05-04 by user — domain purchase already done. Whoever takes this just needs registrar credentials + Render dashboard access. `JWT_SECRET` cookie domain may need a `Domain=klinkdotfun.live` setting on the auth cookie; otherwise SIWS may not stick when dashboard moves origin.

### T-403 — Backend deploy target
- Status: done @Manjeet 2026-05-02
- Depends-on: T-201
- OS: any
- Scope: infra
- Acceptance: pick Fly.io / Railway / Render; staging env deploys on push to `main`.
- Notes: Render selected. Service live at https://klink-api.onrender.com. Verified 2026-05-02: full structural sweep of all 26 routes returns expected codes — `/health` 200, public SIWS routes 200, every JWT-gated and API-key-gated route returns proper 401 (no 5xx anywhere). GitHub auto-deploy on push to `main` confirmed. Render service env (Redis/Upstash, Dodo, treasury, Kamino, Solana RPC, DB) configured via Render API; no `render.yaml` checked in (dashboard-only config — flag for follow-up if reproducibility matters). `apps/api/.env.example` carries the canonical env-var list. Free-tier cold start ~40s on first hit; warm requests ~400ms.

---

## 5 — Docs + design

### T-503 — Demo replay script
- Status: pending
- Depends-on: T-309
- OS: any
- Scope: docs
- Acceptance: 3-min devnet happy-path script: create wallet → fund → manual deposit → agent spend → audit review. Runnable end-to-end.

### T-504 — Pick 3 reference integrations for demo
- Status: pending
- Depends-on: T-309
- OS: any
- Scope: design
- Acceptance: memo `docs/memos/2026-XX-XX-reference-integrations.md`; 3 picks justified.

### T-251 — Autoswap (USDC↔SOL) feasibility study for mpp.dev integration — devnet vs mainnet test path
- Status: in-progress @Jishnu 2026-05-11
- Depends-on: T-211, T-226, T-234
- OS: any
- Scope: design + research
- Acceptance: memo `docs/memos/2026-XX-XX-autoswap-mpp-feasibility.md` answering five questions. (1) **Structural map of "autoswap" on Solana today** — for each mechanism, document who pays gas, who holds funds mid-flow, atomicity guarantees, and failure modes: Jupiter Swap API (Quote + Swap REST), program-level CPI swaps inside a single tx via Raydium/Orca/Jupiter, Octane / fee-relayer services that accept SPL-token tips for SOL fees, wallet-level autoswap (Phantom / Backpack — cite what they actually do, not hand-waved guesses), and the sponsor-PDA pattern observed on 2026-05-10 in a user wallet (`87oKKnY1X3VYPkLzxvtXPRCtmSTwf7wBRJcjVMBFs19N` is a PDA controlled by program `DeJBGdMFa1uynnnKiwrVioatTuHmNLpyFKnmB5kaFdzQ`, topped up by sponsor `G5GFpTfMFPU31nmXzu5C7198RqXiVC49ToUA1h5pGyph` — that pattern is one design point worth comparing against). (2) **mpp.dev integration angle** — `/v1/spend/service` (T-211) currently has the treasury keypair fee-paying (T-226); does an autoswap layer add value above that, or is treasury fee-paying the right primitive? Concrete scenarios: (a) end-user-wallet path with USDC-only — would autoswap remove the "user must hold SOL" UX wart? (b) agent-key path — agents already don't pay gas (treasury covers); is the win marginal? (c) ATA-creation cost (~0.00204 SOL rent) for first-time recipients on a curated proxy call — does autoswap solve this differently than treasury? (3) **Devnet feasibility** — concrete probe with curl/SDK snippets that show what works and what doesn't out of the box: Jupiter Quote API on devnet (does it return routes for USDC↔SOL?), Raydium/Orca pool presence on devnet (cite actual pool addresses if any), Octane devnet endpoint (if any). (4) **Mainnet trial protocol if devnet is too thin** — minimum-blast-radius mainnet test plan: separate test keypair (not treasury), $1–$5 caps, quote-then-tiny-swap pattern, slippage cap, observe-only audit log entry, abort if quoted price drifts > X%. Include kill switch (revoke test wallet's session, withdraw remaining USDC). (5) **Recommendation** — pick one: (a) defer (treasury fee-paying covers the use case, autoswap not worth integration cost), (b) integrate via specific provider X with precautions Y, or (c) build native USDC-pull-from-vault → swap-via-Jupiter inside the spend handler. Cost each option: LOC, dep additions, mainnet-only test surface, ongoing ops burden.
- Notes: triggered 2026-05-10 by Jishnu after observing a SOL balance appearing in an audit-pasted wallet (`75Uy4iq2M97LJFYCnFhwJ9Ym7M2JQ4KjB31WEhHScqku`) where only USDC was expected. On-chain investigation traced it to a program-controlled PDA sponsor pattern (above), NOT autoswap, but the question of "could klink ship a real autoswap layer for mpp.dev so end-users / agents only need USDC" is open and worth a written answer before T-234 catalog deployment locks the spend-flow assumptions. Out of scope here: actually wiring Jupiter / Octane / a swap CPI — that's a follow-up T-2xx if the memo recommends it.

---

## Done

_(newest first)_

### T-234 — mpp.dev proxy review + service catalog deployment
- Status: done @Jishnu 2026-05-11
- Depends-on: T-211, T-220
- OS: any
- Scope: api + ops
- Acceptance: in-repo portion shipped — the actual prod-Neon catalog deployment (steps 1–3 of the original spec) is still outstanding and now tracked as **T-260 (follow-up)**. What landed here: (A) new admin script `apps/api/scripts/catalog-update.ts` — Bun-runnable, dry-run by default, requires `--apply` to write, uses the existing Drizzle client (no raw SQL), validates `--recipient` as a Solana pubkey via `@solana/web3.js` before opening any DB connection, prints the row before/after the update, supports `--enable`/`--disable` (mutually exclusive), `--max-per-call`, and `--help`. Mounted as `bun --filter @klink/api run catalog:update` in `apps/api/package.json` for parity with `db:seed`. (B) reviewed `postSpendServiceHandler` + `PaymentRequirements` interface (`apps/api/src/routes/spend.ts:570-576`) against the shape mpp.dev curated upstreams are likely to return — flagged a real spec-drift concern: `/v1/spend/service` expects plain x402 JSON `{ amount: number, recipient: string }`, but the only real upstream we've observed (the MPP echo at `service01-kep9.onrender.com`, T-253) returns the MPP `WWW-Authenticate: Payment …` challenge with `amount` as a **string** inside a base64url-encoded `request` payload alongside `currency`, `methodDetails.recentBlockhash`, etc. If the four seeded `*.mpp.paywithlocus.com` upstreams speak MPP, callers should hit `/v1/spend/mpp` (T-253) rather than `/v1/spend/service`. The catalog rows still serve their lookup purpose either way; this is documented in the runbook §6 "Spec drift". (C) new ops runbook `docs/runbooks/service-catalog-deployment.md` covering `db:seed` against Neon (env vars + idempotency note), per-slug `catalog-update.ts` invocation (dry-run → apply), end-to-end curl smoke test against the api, failure-mode taxonomy, and rollback. Indexed in `DOCS_INDEX.md`. New unit-test file `apps/api/tests/scripts/catalog-update.test.ts` exercises the CLI parser + patch builder (18 cases, all green); 223/223 api tests pass overall. **Out of scope and now tracked as T-260:** running `db:seed` against prod Neon (needs `DATABASE_URL` not in this worktree), obtaining real recipient pubkeys from mpp.dev / pay-with-locus, and the live curl smoke test per enabled slug. Until T-260 lands, every call to `/v1/spend/service` still returns `404 service '<slug>' not in catalog or disabled`.
- Notes: T-260 carries the original spec's three live-deploy steps. The agent admin script + runbook delivered here mean future operators don't need raw SQL through the Neon console to update a row, which was the larger ergonomic concern in the original task. The spec-drift finding (curated x402 vs MPP `WWW-Authenticate`) is the biggest open question for the catalog deployment — it determines whether the seeded slugs go through `/v1/spend/service` (current handler) or `/v1/spend/mpp` (T-253), and step 3's smoke test is what answers it.

### T-256 — Spend handlers auto-create recipient USDC ATA (`createAssociatedTokenAccountIdempotent`)
- Status: done @Jishnu 2026-05-11
- Depends-on: T-226, T-252
- OS: any
- Scope: api + tests + docs
- Acceptance: shipped via PR #72 (merge commit `b2d1e44`). All four spend handlers in `apps/api/src/routes/spend.ts` (`postSpendTransfer:237`, `postSpendSignPayment:459`, `postSpendService:750`, `postSpendMpp:1210`) now prepend `createAssociatedTokenAccountIdempotentInstruction` from `@solana/spl-token` before `buildTransferUsdcIx` in the same Transaction. Treasury keypair (T-226 fee payer) covers the ~0.002 SOL ATA rent. Idempotent → no-op if the ATA already exists, no extra RPC roundtrip, no branch. skill.md "recipient USDC ATA must already exist" warning dropped from both `apps/web/public/skill.md` and `gitbook/skill.md` (byte-equal sync test green); `0xbc4 / AccountNotInitialized` error-table row rewritten to point at session-PDA-uninitialized as the now-typical cause. **End-to-end smoke verified 2026-05-11:** tx `4F2B7tLoEErMujwkKZ6i1ed1F1hbgA5ZZSGtjs3XqMZmu1x8WipD8LFMSsQP6V47GsPVTuwervkdmNCWmxHT4VYw` — sent 0.01 USDC from agent to `Dxq75kmCnimazkEHhCgu5TMUptsA1khS4Du6fHg9UpYf` whose direct USDC ATA `ALJ82DhBUztRoEBjCjpYxx7dj5Ehr5jDhrkukBs8Jicy` did NOT exist on devnet before the call; after the tx confirmed, `solana account` confirmed the ATA exists, owner = Token Program, balance 0.01 USDC. ATA creation + USDC transfer landed atomically in a single tx. 205/205 api tests pass; `tsc --noEmit` clean; 37/37 web tests pass.
- Notes: triggered by hackathon-judge concern 2026-05-11 — fresh Phantom wallets that haven't held an SPL token are exactly the demo target and exactly the case that failed before this patch. Cost: ~0.002 SOL per first-time recipient out of treasury. Recipients can later close their ATA to reclaim rent; until then it's a small honeypot a malicious recipient could grief by close-and-recreate — treasury SOL monitoring is a separate concern.

### T-253 — `POST /v1/spend/mpp` — full MPP-protocol proxy handler
- Status: done @Jishnu 2026-05-11
- Depends-on: T-252
- OS: any
- Scope: api + tests + docs
- Acceptance: shipped via PR #71 (merge commit `7eaa8d9`). New `postSpendMppHandler` in `apps/api/src/routes/spend.ts` (alongside `parseMppChallenge`, `decodeMppRequestPayload`, `buildMppAuthorizationHeader` exported helpers) mirrors `postSpendServiceHandler`'s probe→sign→retry→forward proxy pattern but speaks MPP's paymentauth.org dialect. Behavior: probe URL → expect 402 + `WWW-Authenticate: Payment id="…", request="<base64url>"` → RFC 7235-style quoted-string parser into a structured `MppChallenge` (id, realm, method, intent, request, expires, optional opaque/digest) → base64url-decode `request` payload (amount, currency, recipient, methodDetails.recentBlockhash) → policy gate (URL allowlist via T-209's `checkOffChainPolicy`, recipient + max_per_tx + daily cap on-chain, plus `Date.now() < challenge.expires` for freshness) → liquidity check → decrypt session → build TransferChecked tx using **the challenge's recentBlockhash** (not `getLatestBlockhash` — anti-replay binding required by MPP, the core behavioral diff vs sign-payment) → sign + submit → construct `Authorization: Payment <base64url(JSON.stringify({challenge, payload:{type:"signature", signature}}))>` header → retry the URL → forward upstream status + content-type + body + `payment-receipt` header back to the agent with klink's `x-tx-signature`. Audit rows tagged `spend_mpp`. Deny taxonomy: `URL_NOT_ALLOWED`, `BAD_CHALLENGE`, `EXPIRED_CHALLENGE`, `WRONG_CURRENCY`, `QUOTED_OVER_MAX`, `INSUFFICIENT_LIQUID`, `ON_CHAIN_REVERT`. `VERIFICATION_FAILED` and `RETRY_FAILED` logged as `allow` with reason since on-chain tx already moved funds (mirrors T-211 semantics). 12 new pure-function tests in `apps/api/tests/routes/spend-mpp.test.ts` against a real captured WWW-Authenticate sample from `service01-kep9.onrender.com` (parser, decoder, header builder, scheme case-sensitivity, missing required fields, X-Payment-Proof-forbidden assertion). skill.md updated in both `apps/web/public/skill.md` and `gitbook/skill.md` (byte-equal sync test green) with a new section between sign-payment and service explaining when to pick `/v1/spend/mpp` vs `/v1/spend/sign-payment`. **End-to-end smoke proven 2026-05-11:** POST `/v1/spend/mpp` against `https://service01-kep9.onrender.com/echo` returned `HTTP 200 + payment-receipt: eyJtZXRob2Q…` (base64 success receipt) + `x-tx-signature: XDPFH7Z3uZ5djZBoidUr2kaGCnqzucojRyxwAALfb2DhUhdx8CNk4a1VuakEpm6GZfWsqEznYaZg7XFbRan11xc` + upstream JSON payload `{"message":"Paid! 🎉", …}`. Required two coordinated fixes: (a) klink-side this PR; (b) service-side patch to `@solana/mpp/dist/server/Charge.js` so `verifyInstructions` walks `meta.innerInstructions` in addition to outer `tx.transaction.message.instructions` (klink's TransferChecked is a CPI'd inner ix — vault USDC is owned by a program-derived account that can only be moved via the agent_wallet program, so the verifier needed to see inner ixs to find it). Service patch landed at `manjeetsharma0796/service01` commits `dcdd7c8` + `5fb41bb` (postinstall script + Dockerfile that copies `scripts/` before `bun install`).
- Notes: out of scope — exposing `recentBlockhash` as a passthrough param on `/v1/spend/sign-payment`. Considered but rejected: the agent can't realistically build a klink-compatible MPP Authorization header on its own (it doesn't see the session pubkey, doesn't have the tx the api signed-and-submitted at the moment it constructs the header — race window), and exposing this as two endpoints would push the MPP-vs-x402 dialect choice onto every agent. Server-side full proxy is the cleaner contract: agent says "spend at this MPP URL, max X", klink does the rest. T-251 (autoswap memo) and T-234 (catalog deployment) stay separate concerns.

### T-255 — Dashboard motion + animation pass (loading shimmer, staggered card reveal, micro-interactions, reduce-motion)
- Status: done @Prithwish 2026-05-11
- Depends-on: T-254
- Acceptance: comprehensive motion layer added on top of T-254's static polish. **globals.css** gains six new keyframes (`klink-fade-up`, `klink-fade-in`, `klink-shimmer`, `klink-pulse-soft`, `klink-spin-slow`, `klink-blob-drift`) and ten new utility classes (`klink-reveal`, `klink-reveal-soft`, `klink-stagger`, `klink-skeleton-root`, `klink-arrow-link` + `klink-arrow-icon`, `klink-pulse`, `klink-lens`, `klink-underline`, `klink-spinner`, `klink-tab`) plus four motion tokens (`--ease-klink: cubic-bezier(0.22, 1, 0.36, 1)` mirroring the landing's signature curve, plus `--dur-fast/base/slow` at 180/280/520ms). A `@media (prefers-reduced-motion: reduce)` block at the bottom kills every animation and clamps opacity/transform to identity, so OS-level motion preferences are respected. **Skeleton primitive** swaps `animate-pulse bg-muted` for the new shimmering sweep gradient (translucent cream band traversing the muted base every 1.6s). **Slider primitive** track gets a sap-green→soft-green gradient range with eased width transition + thumb hover-scale 1.10, focus-ring at primary/30, active-scale 0.95. **Input primitive** gains a smoother focus state (primary border + primary/30 ring with 0 offset, hover olive-deep/25 border) on the cubic-bezier curve. **PageHeader** wraps its title in a `klink-lens` span (subtle horizontal gradient sweep that animates on group:hover) and the whole header animates in via `klink-reveal`. **StatCard** Copy button shows "Copied ✓" with a soft fade swap (React `key` change → klink-reveal-soft) and Configure links use `klink-arrow-link` with a 3px translateX on the trailing → arrow on hover. **BalanceCard / yield Liquid+Deployed / settings policy %** primary numeric values use `key={formatted}` + klink-reveal-soft to fade-swap when the underlying value changes, giving live-updating figures a smooth feel without count-up library overhead. QR chip lifts subtly on hover (scale 1.02). **ActivityRail** Manage link mirrors the arrow pattern. **Audit page** filter chips ported to a single segmented-control surface (rounded-pill bg-card ring + 3 inner buttons with sage-active state on the cubic-bezier curve); skeleton state shows 5 row-height shimmers instead of one big block; tx + invoice links use `klink-underline` (background-image gradient grow on hover/focus). **Sessions page** main card uses `klink-reveal` for entry, Allowlist link gets arrow + underline-grow, loading skeleton is 4 row-shimmers. **Yield / Fund / Settings** page card grids/stacks wrapped in `klink-stagger` so children cascade in at 60ms increments capped at 12 children (deeper rows share the tail delay so a 100-row table doesn't introduce a runaway). **Sidebar** brand wordmark wrapped in klink-lens for the group-hover sweep, logo gains rotate(-6deg) on hover, nav items get `group` + icon scale-110 on hover, the active item shows a small pulsing sage dot on the right (`klink-pulse` 2.4s). **Topbar + Sidebar pulse dots** unified on the same `klink-pulse` keyframe (replaces the prior `animate-ping`) and the topbar connected-pill itself now lifts on hover with a tightened shadow. **Glow blobs** drift slowly (14s + 18s reverse) so the cream canvas feels alive. Verification: `bun run typecheck` clean, 37/37 web tests pass. No backend changes; no test changes.
- Notes: triggered 2026-05-11 by user — "no bs proper animations in loading or toggle colour tone ui elements cards buttons texts etc." Aesthetic direction: calm, deliberate motion — one orchestrated entrance per route (PageHeader reveal + klink-stagger card cascade) is more delightful than scattered micro-jitter. Pure CSS / Tailwind utility work; no Motion library, no JS animation deps. Direct borrowings from `klinkdotfun.live` (`Klink-frontend/src/app/globals.css`): the cubic-bezier(.22,1,.36,1) easing constant, the .reveal-up motion (renamed klink-reveal/klink-stagger), the .lens-text radial mask motif (lowered intensity into klink-lens), and the tracking-[0.18em] uppercase rhythm (already had via klink-eyebrow in T-251). One footgun avoided: the `klink-stagger > *` selector caps at nth-child(11) explicitly so a 100-row table doesn't get runaway delays — children 12+ all share a single 700ms tail delay.

### T-252 — `transfer_usdc` migration to SPL `TransferChecked` for MPP / x402 verifier compatibility + new program id after upgrade-authority loss
- Status: done @Jishnu 2026-05-11
- Depends-on: T-105, T-211, T-212
- OS: any
- Scope: anchor-program + api + tests + ops
- Acceptance: shipped two coupled changes in one PR (`feat/T-252-transferchecked`, branch commits `b9ad336` → `b4aa1bb` → `b3faeff`). (1) **TransferChecked migration:** `programs/agent_wallet/src/instructions/transfer_usdc.rs` swaps SPL `Transfer` (opcode 3) → `TransferChecked` (opcode 12). `TransferUsdc<'info>` gains `mint: Account<'info, Mint>` between `vault` and `vault_usdc_ata`, constrained `mint.key() == vault_usdc_ata.mint` via existing `AgentWalletError::WrongMint`. CPI passes `ctx.accounts.mint.decimals` so SPL Token itself reverts on any decimals mismatch. `apps/api/src/program/agent-wallet.ts:273 buildTransferUsdcIx` grows 6 → 7 keys with `mint` at index 3. Three spend handlers (`postSpendTransfer:222`, `postSpendSignPayment:443`, `postSpendService:734`) pass `mint: getUsdcMint()` (already in scope on all three via `deps.usdcMint`). Tests in `apps/api/tests/program/agent-wallet.test.ts:383-440` updated for 7-key shape; 193/193 api tests pass; `tsc --noEmit` clean. `owner_transfer_usdc` keeps plain `Transfer` (escape hatch is not verifier-bound; filed implicitly as a future follow-up). (2) **Redeploy under new program id `DPPE8TAuw5qyWbw5MqcXcAtH2d5RYF5XBXTiN2pKzM3L`:** the original program `5qCJCEhfLusk59YFqaEG9Yg3Wp64ZaYwvXteFmCmedqv` cannot be upgraded — its single-signer upgrade authority `6fELFcucWR7CPrBrRmfAs8tNjvt5dUnQDk3cguAtdrjZ` was on @Prithwish's laptop, which is lost with no key backup. Solana's BPF upgrade loader requires that signature for every upgrade; no recovery path. Generated a fresh program keypair, updated `declare_id!`, `Anchor.toml` (programs.devnet + programs.localnet), `apps/api` PROGRAM_ID, `apps/web` KLINK_PROGRAM_ID fallback, `.env.local.example`, and the two api test fixtures that asserted on the program id. Deployed devnet 2026-05-11 slot 461518660; new ProgramData `8rDdv1ee9PwTTnaFNrLZKNq42WZyDhCj5gHkyUfNpYpP`, new upgrade authority `3kk1MijUXnxt9YDrNTWe2QLF8rsidvNsr7Nkba8Qb4ik` (single signer for now). `.so` size 296 064 bytes; ProgramData balance 2.06 SOL. IDL on-chain upload failed (`@solana/kit` v6 needs Node ≥ 20.18; local box has 18.19) — non-blocking since klink reads accounts via raw discriminators, not IDL fetch. Runbook row appended to `docs/runbooks/devnet-deploys.md`; HANDOVER.md §1 Anchor program block rewritten. Old program id is abandoned: ~1.93 SOL of ProgramData rent locked there forever, every devnet vault/session/Kamino position derived from the old id is functionally orphaned (still on-chain but only reachable through the frozen pre-TransferChecked program). **MPP echo end-to-end smoke is gated on Render auto-deploying the new PROGRAM_ID + skill on PR merge to main — verify after merge that a spend tx through `/v1/spend/sign-payment` lands as 200 OK + `Payment-Receipt` header (vs the prior 402 at `@solana/mpp/src/server/Charge.ts:340-343`); filed implicitly as the close-out smoke for this task.** Mainnet still gated on T-114 (Squads 2-of-N rotation), which is now **blocker-level urgent rather than backlog** because the very failure mode (laptop loss with single keypair) is what just happened.
- Notes: triggered 2026-05-11 by direct probe against MPP devnet echo — 5 spend-transfer attempts at 10 000 base units each landed on-chain but were rejected every time by the MPP verifier with *"No TransferChecked instruction found for recipient ..."* (only the SPL ix opcode was wrong; HMAC, base58 signature, amount, recipient, mint all correct). Live balance after probes via `GET /v1/yield/position`: 9.964506 USDC (0.05 USDC burned across the 5 retries). Reference working client that already uses `@solana/mpp` SDK with TransferChecked: `D:/workspace/mpp-mock-service/client/pay-echo.ts`. Mid-task discovery: Prithwish's laptop loss converted T-252 from a single-instruction migration into a full program-id rotation. The two changes ship together because rolling out TransferChecked without the program-id swap was impossible. Plan at `docs/superpowers/plans/2026-05-11-transfer-checked-migration.md` reflected only the original migration scope; the program-id rotation was an unplanned addition.

### T-254 — Dashboard visual polish to match klinkdotfun.live landing
- Status: done @Prithwish 2026-05-11
- Depends-on: T-242, T-248
- Acceptance: dashboard re-skinned for closer fidelity to the landing's design language at https://klinkdotfun.live. Page background swapped from mint `#DCEAC9` to cream `#FFFDF8` (landing's main canvas; mint is now reserved for secondary chips). Card surface flipped to pure white for crisper soft shadows on cream. Shared `klink-card` / `klink-card-interactive` / `klink-eyebrow` / `klink-num` / `klink-glow-bg` component classes added to `apps/web/app/globals.css` with three new shadow tokens (`--shadow-card`, `--shadow-card-hover`, `--shadow-pill`) tinted in olive `rgba(61,79,42,...)` rather than neutral black. Card primitive (`apps/web/app/_components/ui/card.tsx`) drops the hard 1px border for a soft 60%-opacity olive-tinted edge + the new shadow token, gains an `interactive` prop for hover-lift opt-in, and `CardTitle` defaults to `text-base font-semibold tracking-tight text-olive-deep`. Button primitive (`apps/web/app/_components/ui/button.tsx`) gains a 1px resting shadow + cubic-bezier hover lift + active scale-[0.98] across default / destructive / secondary / outline; ghost + link suppress the lift to stay calm. Dashboard layout wraps `<main>` in `klink-glow-bg` for the two corner sage blurs (`#9CC36B@18%` and `#B6D497@22%`, 120px blur) that mirror the landing's hero blobs. Topbar is now sticky (`z-30`) with a `bg-card/80 backdrop-blur-md`, faint olive bottom-border, and a pinging connection dot. Sidebar tightens to a sticky column with a 1px olive-tinted right-border, `tracking-[0.18em]` uppercase section labels, refined active-pill with an inset ring, and a footer pill that mirrors the topbar's connection dot. StatCard / BalanceCard / ActivityRail / yield Liquid+Deployed cards all use the `klink-eyebrow` + `CardTitle` pattern; numeric values render at `text-[40px] font-bold` with `klink-num` (tabular-nums + `tnum`/`ss01` feature flags) so columns of figures don't jitter. Wallet-info card on Settings switches from inline `<div>`s to a divided rows pattern that matches StatCard. Danger-zone card on Settings renamed to "Danger zone — emergency drain" with the action button text now "Drain to recipient" — both strings now literal in the rendered HTML, satisfying the strict regex checks in `apps/web/tests/_drain-card-smoke.ts` (previously satisfied only via OR fallback in `apps/web/tests/e2e.puppeteer.ts`). New shared `PageHeader` component in `apps/web/app/dashboard/_components/page-header.tsx` standardises the 40px-bold-tight title + uppercase eyebrow + muted subtitle pattern across Overview / Sessions / Yield / Fund / Audit / Settings. Direct-deposit QR on Fund + Overview wrapped in a cream-padded ring-1 / shadow-pill chrome that matches the landing's media chips. Verification: `bun run typecheck` clean, 37/37 web tests pass. No backend changes; no test changes.
- Notes: triggered 2026-05-11 by side-by-side review against the live landing site — T-242 had ported the palette but the dashboard's cards still read as bare shadcn (hard borders, no shadow, smaller type), and the topbar / sidebar / page headers carried none of the landing's tracking-[0.18em] eyebrow + tabular-num + soft-shadow chrome. Pure CSS / Tailwind class work, no new dependencies. One small refactor footgun caught: `@apply ease-[cubic-bezier(...)]` inside a `@layer components` rule throws a Tailwind syntax error because arbitrary-value classes can't be `@apply`'d from there — fixed by writing the transition as raw CSS in the `.klink-card-interactive` block. Renumbered T-251 → T-252 → T-254 across two rebases as upstream took those ids during the in-flight work.

### T-250 — Re-enable wallet autoConnect (post T-247) so dashboard pages don't show disconnected wallet on reload
- Status: done @Jishnu 2026-05-05
- Depends-on: T-247
- OS: any
- Scope: web
- Acceptance: surfaced 2026-05-05 by user. The Fund page (T-249) showed "Connect a wallet to fund directly" even though the topbar showed `CONNECTED H55H...MCUF`. The mismatch is by design but bad UX: the topbar reads the JWT cookie server-side (`verifyKlinkJwt(session.pubkey)`), the Fund card reads `useWallet().connected` from the wallet adapter. T-247 removed `autoConnect` from `WalletProvider` to fix a post-sign-out reconnect loop, with the side effect that on every fresh page load with a valid JWT but no live adapter connection (browser restart, second tab, hard refresh), `connected === false` and tx-dependent UI flips to its disconnected branch. Two-part fix: (a) `apps/web/app/providers.tsx` re-enables `autoConnect` on `WalletProvider`. (b) `apps/web/app/dashboard/sign-out-button.tsx` calls `select(null)` after `disconnect()` to clear the cached wallet name from the adapter (not just the active connection), so the next mount has nothing to autoConnect to and the user gets a clean wallet picker if they want to switch wallets. Combined: dashboard pages stay connected after reload (autoConnect rehydrates from cache), and the original T-247 reconnect-loop bug stays fixed because sign-out properly clears the cache. bun run typecheck clean, 37 web tests pass.

### T-249 — Fund: send USDC from connected Phantom wallet (third option alongside QR + Dodo)
- Status: done @Jishnu 2026-05-05
- Depends-on: T-217, T-225, T-248
- OS: any
- Scope: web
- Acceptance: Fund page (`apps/web/app/dashboard/fund/page.tsx`) gains a third option: "Fund from connected wallet". Input takes a USDC amount; clicking the button triggers a client-side SPL token transfer from the connected Phantom owner's USDC ATA into the vault's USDC ATA. No backend round-trip (the api is uninvolved; the tx is built in-browser, signed by Phantom, submitted directly to the configured Solana RPC). Pre-flight check on the owner's USDC balance via `connection.getTokenAccountBalance(ownerAta)` so we don't send a doomed tx, with a clear toast for "no devnet USDC ATA" vs "insufficient balance" vs "user rejected" vs "rpc failure". Wires to T-248's `useProgress()` so the topbar bar shows for the entire build/sign/submit/confirm flow. On success, calls `useOnChainVault.mutate()` so the Overview balance card refreshes immediately. Layout: switched from 2-col to 3-col grid so the three options (connected wallet, direct deposit QR, card/fiat) sit side by side; on small screens the grid stacks. bun run typecheck clean, 37 web tests pass. No backend changes.
- Notes: triggered 2026-05-05 by user. Most natural funding path for a user who already has Phantom connected, faster than copying the vault USDC ATA address and sending manually, and free vs the Dodo card processing fee. Implementation uses `createTransferCheckedInstruction` from `@solana/spl-token` (with explicit `USDC_DECIMALS` so the SPL token program rejects mismatched mint metadata, defense in depth against mint-confusion bugs).

### T-248 — Dashboard: graceful loading bar + themed confirm dialogs (replace native window.confirm)
- Status: done @Jishnu 2026-05-05
- Depends-on: T-242, T-247
- OS: any
- Scope: web
- Acceptance: thin sap-green progress bar fixed at the bottom of the topbar, driven by a `ProgressProvider` context that tracks active operations as a refcount. `useBuildAndSignTx` auto-registers with the provider whenever its phase is non-idle/non-done/non-error, so every mutation in the app (wallet create, session create, allowlist patch, recipient add/remove, instruction-bit toggle, yield deposit/withdraw, drain) gets a progress indicator without per-callsite wiring. Route transitions also drive the bar via a `usePathname` listener that flashes 0→100% on path change. New `<ConfirmDialog>` component wraps the existing shadcn `<Dialog>` primitive with a promise-based `useConfirm()` hook, themed to match the brand (cream surface, olive title, destructive variant for irreversible actions). Replaces 2 native `window.confirm` calls: `apps/web/app/dashboard/settings/page.tsx:156` (drain confirmation) and `apps/web/app/dashboard/sessions/rotate-key-button.tsx:38` (key rotation). The dialog uses the same destructive accent (orange-bright) as the surrounding card so visual hierarchy stays consistent. Bun typecheck clean, 37 web tests pass. No backend changes.
- Notes: triggered 2026-05-05 by user. The native browser confirm dialogs felt out-of-place under the new cream + sap-green palette, and the lack of any progress indication during the multi-step `useBuildAndSignTx` phases (build → sign → submit → confirm, can take 5-10s on devnet) made successful actions feel like they had silently hung. This task is pure UX polish on top of T-242's theme port.

### T-247 — Sign-in: hydration error + stuck wallet screen after sign-out + reconnect with different wallet
- Status: done @Jishnu 2026-05-05
- Depends-on: T-203, T-302
- OS: any
- Scope: web
- Acceptance: surfaced 2026-05-05 by user. After signing out and trying to reconnect with a different wallet, the app throws a React hydration error (`Expected server HTML to contain a matching <i> in <button>` from `WalletMultiButton`), the `WalletProvider` autoConnect re-prompts Phantom for the previous wallet, the user rejects, `WalletConnectionError: User rejected the request` is thrown, and the SignIn component is stuck at the wallet-select button with no recovery path. Four root causes stacked: (1) `apps/web/app/providers.tsx:12` registers `new PhantomWalletAdapter()` even though Phantom now auto-registers via Wallet Standard, producing a duplicate-adapter warning and double render path that contributes to hydration mismatch, (2) `apps/web/app/providers.tsx:16` passes `autoConnect` to `WalletProvider`, triggering an automatic reconnect on every mount including after sign-out, (3) `WalletMultiButton` renders different HTML on server vs client (server: empty button, client: button with wallet icon `<i>` once the adapter detects Phantom), (4) `apps/web/app/sign-in.tsx:61` only fires the SIWS flow when `connected === true && phase === "idle"`, so a failed autoConnect leaves the page in a stuck state with no fallback UI. Three coordinated fixes: (a) `providers.tsx` switches to `wallets={[]}` (Wallet Standard handles Phantom; legacy adapter removed per anza-xyz/wallet-adapter APP.md guidance) and drops `autoConnect` so the connect step is always a deliberate user action, fixes the warning and the stuck-loop. (b) `sign-in.tsx` adds a `mounted` state guard via `useEffect`; the wallet UI renders nothing on the server (returns a placeholder skeleton) and only mounts after hydration, eliminating the `<i>` mismatch. Also reset local error / phase state when the wallet disconnects so a rejected connect doesn't leave a stuck toast. (c) `sign-out-button.tsx` calls `useWallet().disconnect()` before hitting the logout endpoint so the cached wallet state is cleared and a fresh wallet-select flow starts on next mount. Web typecheck clean, 37 web tests pass. Manually verifiable: sign in, sign out, click WalletMultiButton again, pick a different wallet OR cancel, no hydration error in console, no stuck state, sign-in flow restarts cleanly.
- Notes: docs cross-checked against current anza-xyz/wallet-adapter cookbook (`solana.com/developers/cookbook/wallets/connect-wallet-react`) and APP.md guidance on Wallet Standard. The "wrap providers in dynamic import with ssr:false" pattern is an alternative; the mounted-guard pattern is lower-blast-radius and only defers the actual hydration-mismatch surface (the WalletMultiButton's icon) instead of skipping SSR for the whole dashboard chrome.

### T-242 — Port klink landing palette to apps/web dashboard
- Status: done @Jishnu 2026-05-05
- Depends-on: T-241, T-301
- OS: any
- Scope: web
- Acceptance: dashboard re-skinned to match the landing-page (Klink-frontend) visual identity. **Single-source-of-truth token swap in `apps/web/app/globals.css` and `apps/web/tailwind.config.ts`**, all shadcn semantic class names (`bg-card`, `text-foreground`, `bg-primary` etc.) keep working but render in klink's sap-green / cream / olive palette. New palette: page bg mint `#DCEAC9`, card bg cream `#FFFDF8`, primary sap green `#9CC36B`, primary-foreground olive deep `#3D4F2A`, destructive orange-bright `#E54D2E`, border paper-2 `#D2D0CC`. Brand-named tokens (cream, paper, ink, sap-green, sap-green-soft, olive-deep, orange-bright, yellow) added to tailwind config for spots where shadcn semantic tokens did not map cleanly. Manrope wired via `next/font/google` in `apps/web/app/layout.tsx`; old Inter @import removed from globals.css. Three UI primitive radii adjusted: Button to pill (100px), Card to 20px (`var(--radius)`), Input to 12px (matches landing's `--radius-tile`); Input bg flipped from `bg-background` (which would now render mint) to `bg-card` (cream) so inputs nested in cards stay coherent. **Cross-cutting accessibility fix:** swapped 6 inline-link call sites from `text-primary` to `text-olive-deep` because sap-green-on-cream gives ~1.86:1 contrast (WCAG AA fail), olive-deep-on-cream gives ~10:1 (AAA pass) — affects StatCard Copy/Configure links, ActivityRail Manage link, audit page tx-signature link, sessions list Allowlist link, RotateKeyButton; buttons and badges keep `text-primary` since they sit on darker chrome where contrast is fine. **Sidebar polish:** active row uses `bg-primary/15` sap-green wash instead of `bg-secondary` for stronger selection contrast under cream; hover at `/10` reads as a hint not a competitor; wordmark bumped to `font-bold text-olive-deep`; right border softened to `border/50`. **Sessions detail amber warning callout** ported from shadcn amber-300/amber-50/amber-900 to brand yellow border + yellow-pale `#FFFFC4` bg + olive-deep text. **Fund page em-dash scrub** on two empty-state strings. Settings page drain card auto-inherits orange-bright destructive from the palette swap (no code change needed beyond what T-241 already shipped). Yield, Topbar, Overview cards (StatCard, BalanceCard, ActivityRail), and Audit-table chrome all rendered cleanly under the new palette via semantic-token inheritance, no per-file edits required. Verification: `bun run typecheck` clean, 37/37 web tests pass, `apps/web/tests/unit/skill-sync.test.ts` green, `bun scripts/lint-todo.ts` OK (91 tasks). No backend changes; no test changes.
- Notes: triggered 2026-05-05 by side-by-side review of the landing page and dashboard. Hackathon submission framing benefits from the two surfaces reading as one product. Plan at `docs/superpowers/plans/2026-05-05-dashboard-theme-port.md` (originally 13 tasks; collapsed to 9 commits during execution because Yield/Audit/Settings/Topbar/Overview required no per-file edits beyond what the global token swap and the cross-cutting `text-olive-deep` fix already delivered, per the no-redundancy guidance). Followed solo fast-path: claim push (`481f880`) then 8 implementation commits (`9263994`, `579bd5d`, `bc97fff`, `bd05ca8`, `9799c27`, `fe218fd`, `802b739`, `0a012fb`), close commit follows. Two future follow-ups noted but not in scope here: (a) audit Badge `bg-destructive/10 text-destructive` deny-row pattern has marginal contrast (~3:1) — fine for AA Large but tight; consider switching to `text-olive-deep` if reviewers flag, (b) dark mode is wired in tailwind config (`darkMode: ["class"]`) but no `.dark` rules in globals.css; klink dark variant is a separate plan.

### T-241 — Settings: Take-back-custody card UX polish (helpers, copy refresh, em-dash scrub)
- Status: done @Jishnu 2026-05-05
- Depends-on: T-235, T-238
- OS: any
- Scope: web
- Acceptance: drain card on the Settings page (`apps/web/app/dashboard/settings/page.tsx`) polished after T-235 shipped the basic flow. Three changes, all under existing shadcn styling (no theme port; landing-page palette is a separate scope, deliberately not started here). (1) Reframed the card. Title flipped from the previous "Danger zone, emergency drain" framing to "Take back custody". The action is a positive owner capability that proves the non-custodial promise, not a defensive panic button, and "custody" is the user-facing term we already use elsewhere. Body rewritten in plain prose, leading with what the action does instead of what it bypasses. Recipient placeholder changed from a real devnet deployer pubkey (it was the upgrade authority pubkey from `docs/runbooks/devnet-deploys.md`, which users could mistakenly paste back into the recipient field thinking it was a real example) to a neutral "paste a Solana address". Confirm-dialog copy and toast strings tightened to "Send X USDC to Y? This cannot be undone." / "Withdrawal submitted" / "Withdrawal failed". (2) Added a "Use my wallet" inline button next to the recipient input that pre-fills `wallet.ownerPubkey`. The most common recovery path is back to the owner's own wallet, and before this that path required copy-pasting from the Wallet info card above. (3) Added a "Max (X liquid)" inline button next to the amount input that pre-fills the current vault liquid balance from `useOnChainVault(wallet.ownerPubkey)`'s `liquid` bigint, formatted as USDC (divided by 1_000_000, trailing zeros stripped). Disabled when liquid is zero. Removes manual-math step plus typo risk during a recovery moment. Action button label flipped from "Drain to recipient" to "Withdraw" (default state) for cleaner financial-action voice; in-flight phase labels kept as-is. Also scrubbed em dashes from the empty-state line and confirm-dialog copy in this file (the empty-state was "No wallet yet, create one first" with an em dash; now two sentences). Web typecheck clean (`bun run typecheck`); 37 web tests pass. No new tests added (the request shape and the build-and-sign flow are unchanged; helpers are pure UI sugar, not new code paths).
- Notes: filed and shipped 2026-05-05 same commit (solo fast-path). Triggered by manual UX review of the existing card. Path A out of three considered (copy + helpers, no styling changes); the other two paths (mixed brand cues / full landing-page theme port to apps/web) were explicitly skipped because (a) one card restyled to landing palette would clash with all other dashboard cards, and (b) full dashboard re-skin is a multi-day project that the hackathon timeline cannot absorb without explicit team commit. Theme port is filed implicitly as a future task; not enumerated here pending decision. Side-effect bystander fix: PR #63 (`docs(gitbook): strip em dashes from prose`) ran `scripts/strip-em-dashes.ts` against `gitbook/skill.md` but missed `apps/web/public/skill.md`, leaving 72 lines of drift between the two copies and breaking `apps/web/tests/unit/skill-sync.test.ts` on `origin/main`. Since the test would have failed against this commit too, mirrored gitbook to apps/web/public to restore byte-equal sync. The strip script in PR #63 walks `.md` recursively given a directory; running it against the repo root (or extending its CI invocation to include `apps/web/public/`) would prevent this drift on future runs.

### T-240 — Yield endpoints — 503 YIELD_DISABLED guard for unconfigured envs (devnet today; mainnet at T-114 cutover)
- Status: done @Jishnu 2026-05-04
- Depends-on: T-403, T-213
- OS: any
- Scope: api + docs
- Acceptance: filed (and originally framed) as "populate the 5 Kamino env vars on Render so yield endpoints stop 500ing." Sprint phases 1–2 surfaced that the 5 values **were never picked for any environment**, not just lost on Render — `apps/api/.env.example:40-44` are empty placeholders and grep across the repo turns up zero committed values. Re-investigating Kamino's actual surface: `Klend` IS deployed on devnet (program-addresses doc lists `KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD` for both mainnet and devnet — same program), but Kamino's public docs and API only publish canonical mainnet markets (`7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF` etc. — `https://api.kamino.finance/v2/kamino-market` ignores `?env=devnet` and returns mainnet rows). Raw RPC against devnet shows 131 lending-market accounts under the program, but no published signal which (if any) is Kamino's own "canonical" devnet market vs unrelated test deployments by other developers. Picking one blind risks the demo on a market a third party may wipe. Their SDK (`@kamino-finance/klend-sdk@7.3.22`) is workable but requires `farms-sdk@3.2.24` exactly pinned (3.2.25 is broken) and uses `@solana/kit` v2 RPC client (`createSolanaRpc`), not v1 `Connection` — non-trivial integration work for a demo-only feature on devnet. Path B+ shipped: a config-presence guard in `apps/api/src/routes/yield.ts` that returns `503 {"error":"YIELD_DISABLED", "detail":"…"}` from `postKaminoMutation` when any of the 5 reserve env vars are unset, replacing the previous `500 "server misconfigured"` leak that happened deep in the handler via `envOrThrow()`. New `KAMINO_ENV_VARS` const + `isKaminoEnabled()` helper at the top of yield.ts; the mutation handler short-circuits before any auth-success-path work. Position reads (`/v1/yield/position`) are intentionally untouched — they don't need Kamino config and continue to return `liquid` / `deployed: "0"` / `accrued: null`. New `apps/api/tests/routes/yield-disabled.test.ts` (5 tests, all green): pin the 503 shape on deposit + withdraw, partial-config-still-blocks behaviour, guard fires before downstream errors mask it, and the **off** case (all 5 vars set → guard inert, auth check runs as before). 185 api tests pass (1 unrelated session flake — `tests/health.test.ts:19` tries to bind port 3001 but my Klink-frontend dev server holds it; not my issue). skill.md updated in both copies (byte-equal sync test passes): "Beta caveats" Kamino bullet rewritten to describe yield as feature-flagged off pending integrator pick-a-reserve, with the program-is-deployed-but-no-canonical-market nuance preserved; new `503 YIELD_DISABLED` row added to the error taxonomy with explicit "do not retry" guidance. **The integration code (`buildKaminoDepositIx` / `buildKaminoWithdrawIx`, `loadKaminoAddrs`, on-chain `kamino_deposit` / `kamino_withdraw`) is untouched** — populating the 5 vars in any env (mainnet at T-114, or a chosen devnet market) lights everything up; no code changes needed there. Out-of-scope follow-ups: (a) T-114 owners need the canonical mainnet Kamino USDC reserve PDAs (e.g. from market `7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF`) populated in prod Render env; (b) optional T-241-style task — pick one of the 131 devnet lending-market candidates with an SDK-driven probe (using `createSolanaRpc` per Kamino's docs example) and wire klink against it for demo-only devnet yield; (c) `render.yaml` reproducibility (T-403 follow-up) still open.
- Notes: filed 2026-05-04 from agent validation; flipped to in-progress + done same day. The earlier T-313 skill.md caveat that referenced "T-240" / 500 server-misconfigured was rewritten to match the new 503 behaviour in this same commit. Sprint retro: phase 1 (probe Kamino's HTTP API) confirmed devnet markets aren't published in their API; phase 2 (Kamino docs + program-addresses) confirmed Klend devnet IS deployed but no canonical USDC market is published; phases 3–4 (SDK probe with `@solana/kit`) skipped on cost/value — even a "working" devnet pick would be operationally fragile given Kamino doesn't endorse a specific devnet market. Time spent ~80 min including SDK probe artifacts (cleaned up pre-commit). User-tip mid-sprint corrected an earlier framing of mine that read as "Kamino doesn't support devnet"; the truth is "Kamino supports devnet program-side but doesn't publish a canonical devnet market for integrators."

### T-313 — skill.md follow-up fixes from second validation run
- Status: done @Jishnu 2026-05-04
- Depends-on: T-237, T-311
- OS: any
- Scope: docs
- Acceptance: second validation pass on 2026-05-04 (5 fresh-context subagents + a separate independent agent run vs `klink-api.onrender.com`) surfaced doc bugs T-237's first pass missed. Fixes shipped to both `apps/web/public/skill.md` and `gitbook/skill.md` (byte-equal sync verified by `apps/web/tests/unit/skill-sync.test.ts`, 257/257 lines after edits): (1) the "Can | Cannot" table claimed agents can `Read your spend history via /v1/audit` — verified false; T-216's `/v1/audit` is dashboard-JWT-only (matches design) and rejects bearer tokens with `{"error":"invalid jwt"}`. The audit row was removed from the table and replaced with a callout below clarifying that the human reviews audit through the dashboard, not the agent. (2) Auth section gained an explicit `export KLINK_API_KEY=…` setup line plus a "Step 0 — your very first request" framing on the sanity-check curl, with explicit branching for 200 / 401 / 502-503 cold-start. Every test agent assumed the env var was set without being told to. (3) `GET /v1/yield/position` now shows BOTH a funded-wallet 200 example (`{"liquid":"17500000","deployed":"0","accrued":null,"total_balance":"17500000"}` — pulled from the live test wallet) and the all-zero cold-wallet shape, so agents see what success actually looks like, not just the empty case. (4) Inline 6-decimal annotations next to each spend example (transfer 500_000 = 0.5 USDC, sign-payment 50_000 = 0.05 USDC, yield deposit 2_000_000 = 2 USDC) since the conversion rule was buried in the Capabilities preamble. (5) New "Beta caveats" bullets calling out: no agent-readable session introspection (T-239), live api `500 "server misconfigured"` on yield endpoints (T-240), curated catalog empty in prod (T-234) — written in scrub-style without the T-XXX references, since the consumer-facing PR #62 (squash-merged just before this commit) explicitly drained internal task IDs from the public skill copy; the task IDs live in TODO.md, not in agent-facing docs. **Side-effect drift fix:** PR #62 only updated `gitbook/skill.md`, leaving `apps/web/public/skill.md` (still serving the agent skill from the dashboard origin via `apps/web/app/skill.md/route.ts`) on the pre-scrub copy with `Kamino` branding, the on-chain program ID, "Render free-tier" phrasing, etc. The skill-sync test on origin/main was failing as a result. While merging this work I propagated PR #62's scrubs to `apps/web/public/skill.md` and re-established byte-equal — the diff between the two on origin/main was 32 lines; both copies are now identical and the sync test passes locally. Items deliberately NOT included: a top-level `LIMIT_EXCEEDED` taxonomy entry (came from a fictional scenario in my own test prompt — not verified against real api behaviour today), live ops fixes (`KAMINO_RESERVE` env → T-240, catalog → T-234), backend introspection endpoint (→ T-239).

### T-238 — Add `liquid` field to `GET /v1/yield/position`
- Status: done @Jishnu 2026-05-04
- Depends-on: T-213
- OS: any
- Scope: api
- Acceptance: `apps/api/src/routes/yield.ts` `getYieldPositionHandler` now fetches the vault USDC ATA balance via `Connection.getTokenAccountBalance(vaultUsdcAta)` and returns it as `liquid` alongside `deployed`, `accrued`, `total_balance`. Three states the field can be in: `"<n>"` decimal-string of base units (real balance), `"0"` (ATA exists but empty OR ATA hasn't been created yet — both treated identically; cold wallet is not an error), `null` (RPC down or unknown failure — agents distinguish to decide whether to retry). `total_balance` is now `liquid + deployed` (or just `deployed` when liquid is null). Liquid read failure is best-effort: it does not 5xx the whole position read — the handler still returns deployed + accrued so agents see what's available. New `LiquidReader` test seam + module-level `isAtaNotFoundError(err)` helper that pattern-matches "could not find account" and "TokenAccountNotFound". 6 unit tests pin: positive-liquid + total_balance arithmetic, ATA empty (0n), generic throw → null, TokenAccountNotFound → 0n (not null), correct ATA pubkey routed (regression guard against accidentally querying the vault PDA), and a fixture round-trip via `decodeVaultDeployedAmount`. skill.md updated: position section response shape now lists `liquid` first with all three state semantics; INSUFFICIENT_LIQUID row in error taxonomy noted as race-window backstop now that planning is done from `liquid` directly; recovery-patterns line for INSUFFICIENT_LIQUID rewritten to point at the new field. Live verified against the api with the funded test wallet: returned `{"liquid":"17500000","deployed":"0","accrued":null,"total_balance":"17500000"}` — matches the wallet's actual 17.5 USDC sitting in the vault ATA. **Closes the most-likely root cause of Manjeet's agent failure** (no plan path → fail-then-recover loop). 181 api tests pass; web typecheck clean; skill-sync test passes.

### T-237 — Validate skill.md against fresh agent contexts
- Status: done @Jishnu 2026-05-04
- Depends-on: T-311
- OS: any
- Scope: docs + design
- Acceptance: 5 isolated subagents (zero project context, only the api key + dashboard URL) ran through different scenarios — cold-start auth, read-only state query, simple spend (non-allowlisted recipient), error diagnosis, complex yield workflow. All 5 fetched skill.md cleanly. Scores 5/4/3/4/3 (avg 3.8/5). Common friction items 3+ agents flagged: (a) **dashboard URL `:3030` ≠ API URL `:3000`** — multiple agents wasted a curl on the wrong port despite the parenthetical mention; (b) `/v1/yield/position` doesn't expose **liquid** balance, agents can only learn it by failing a spend (filed as T-238); (c) on-chain 402 lumps allowlist / cap / expiry / AccountNotInitialized into one free-text bucket with no machine-readable subcode; (d) "prepend an idempotent ATA-create yourself" is dead-end advice — agents don't hold a Solana keypair; (e) missing taxonomy entries for 400 validation, 404 unknown-slug, 500 server-misconfigured; (f) no agent-readable view of `max_per_tx` / `daily_cap` / instruction bitmap / allowed_recipients (filed as T-239). Skill-only fixes shipped in this PR: prominent two-origin URL block at top, expanded error taxonomy with 400/404/500 rows, new "On-chain 402 substrings" subtable with anchor-error names + remediation, ATA-create paragraph rewritten to acknowledge agents can't do it. Backend follow-ups filed: T-238 (add liquid to position) + T-239 (`GET /v1/session/me`). Likely root cause of @Manjeet's failed agent: liquid-balance gap — without that field an agent cannot plan a spend, only react. T-238 closes that gap.

### T-236 — Remove stale BackendPending placeholders
- Status: done @Jishnu 2026-05-03
- Depends-on: T-218, T-219, T-221, T-222, T-223, T-224, T-235
- OS: any
- Scope: web
- Acceptance: 8 `<BackendPending taskId="…" />` callsites across the dashboard pointed at tasks that have all shipped (T-218/219/221/222/223/224/235). They fired on a 404/405 response and rendered "Backend endpoint pending — T-XXX … will activate when the endpoint lands" copy that's now misleading: the endpoints are live, so a 404/405 is a real failure (backend down, wrong path, RPC dead) rather than pending work. Removed every callsite + the `BackendPending` component itself (`apps/web/app/dashboard/_components/backend-pending.tsx` deleted). `useSessions` + `useSession` dropped their `notImplemented` field. GET pages (overview, sessions list, single-session) now render a small "Couldn't load X. Check the api logs and retry." message on error instead. Mutation flows (settings policy / drain, time-window, url-allowlist, yield deposit/withdraw) dropped their local `pending` state — the existing toast on error path is the right error UX. Web typecheck + 37 web tests green; biome clean on changed files. Filed 2026-05-03 after the user reported the placeholder copy was still rendering on the live dashboard despite the backend tasks being done.

### T-311 — Agent-onboarding SKILL.md for klink ecosystem
- Status: done @Jishnu 2026-05-02
- Depends-on: —
- OS: any
- Scope: docs
- Acceptance: `gitbook/skill.md` written in the Anthropic skill format with frontmatter (`name: klink`, `description`, `purpose`, `last_updated`). Mirrors the pay-with-locus pattern (their skill is referenced via `skillFileUrl` in the registration response — see `https://beta-api.paywithlocus.com/api/skills/skill.md`). Covers everything an AI agent needs to self-onboard given just an API key: the can/cannot bounds (on-chain enforced), `Authorization: Bearer` header + a zero-side-effect sanity-check curl against `/v1/yield/position`, every agent-callable endpoint with curl examples + sample responses (`/v1/yield/position`, `/v1/spend/transfer`, `/v1/spend/sign-payment`, `/v1/spend/service`, `/v1/yield/{deposit,withdraw}`), the full HTTP error taxonomy (401/402/403/502/503 with the exact `error` strings the backend returns + what to do for each), recovery patterns (don't tight-loop on auth/policy errors — surface to human), funding boundary (humans deposit, agents can't), threat-model summary (key is hot-revocable, audit is append-only, no escape hatch through the agent surface), and beta caveats (Kamino reserve env not fully wired, mainnet gated on T-114). Wired into `gitbook/SUMMARY.md` under "Getting Started" so it ships with the public docs site at `klink-docs.gitbook.io/skill.md` (or wherever the gitbook deploys). Filed 2026-05-02 by user request after manual UI testing — humans had to hand-roll instructions for every new agent; this gives agents a single fetchable resource to bootstrap from. Follow-up nice-to-have: serve the same content from the api at `GET /skill.md` so an agent given only the api URL can self-discover it (Locus pattern). Not in scope here.

### T-235 — Owner escape-hatch backend + dashboard wiring (T-116 follow-up)
- Status: done @Prithwish 2026-05-02
- Depends-on: T-116
- OS: any
- Scope: api + web
- Acceptance: `POST /v1/wallet/transfer` builds the unsigned `owner_transfer_usdc` tx for the dashboard to hand off to Phantom — owner-authenticated (dashboard JWT, NOT api key — agents must not be able to call this), validates wallet ownership, derives the recipient USDC ATA, prepends a `createAssociatedTokenAccountIdempotentInstruction` so the drain works even when the recipient has never held USDC, returns `{ txBase64, walletId, vaultPda, vaultUsdcAta, recipient, recipientUsdcAta, amount }`. New tx-builder `buildOwnerTransferUsdcIx` in `apps/api/src/program/agent-wallet.ts` mirrors the rust account order from `programs/agent_wallet/src/instructions/owner_transfer_usdc.rs` exactly (owner signer not-writable → vault → vault_usdc_ata writable → recipient_usdc_ata writable → token_program). Dashboard "Danger zone — emergency drain" card on the Settings page (`apps/web/app/dashboard/settings/page.tsx`) takes recipient pubkey + USDC amount, converts to base units (×1e6), shows a `window.confirm` before signing, uses a separate `useBuildAndSignTx` instance so its phase doesn't conflict with the policy slider above. Until the devnet binary is redeployed (T-116 runbook), the build-tx call succeeds but the on-chain tx itself reverts with `InstructionFallbackNotFound`; the BackendPending banner (taskId T-235) covers the 404 case if the backend version is also old.
- Notes: filed 2026-05-02 immediately after T-116 landed. Backend code can merge before redeploy because the build-tx layer doesn't talk to the program — only the eventual Phantom-signed submit does. Agent-key auth is deliberately NOT wired (no `requireApiKey` overload) — escape hatch is the human's path; agents must not be able to call this even with a fully scoped session, since the on-chain instruction has no policy gate.

### T-232 — Revoke-session self-heal for DB-only / already-closed sessions
- Status: done @Jishnu 2026-05-02
- Depends-on: T-207, T-225
- OS: any
- Scope: api + web
- Acceptance: `apps/api/src/routes/session.ts` `deleteSessionHandler` now checks the on-chain Session PDA before building a `revoke_session` tx. Two self-heal cases yield the same null `getAccountInfo` result: (a) DB-only ghost — Phantom never signed the original `add_session` tx so the PDA was never initialized, (b) already-closed — a previous revoke succeeded but the dashboard didn't follow up to update the DB. In both cases the handler now soft-revokes the DB rows in a transaction (`sessions.revokedAt`, every active `api_keys.revokedAt`, `audit_log.session_revoke_soft`) and returns `{ alreadyExists: true, ... }` so the existing `useBuildAndSignTx` short-circuit fires without prompting Phantom. On the happy path, after Phantom signs + submits the on-chain `revoke_session` tx, `apps/web RevokeConfirm` now calls DELETE a second time to trigger the soft-revoke (mirrors the wallet self-heal pattern from T-225). Side-effect cleanup: `getSessionsHandler` + `getSessionHandler` joins to `apiKeys` flipped from INNER to LEFT — INNER hid revoked sessions entirely (no active api_keys → no row → vanished from dashboard); LEFT keeps them visible with `keyPrefix=null`, schema relaxed to `keyPrefix: z.string().nullable()`, sessions table renders "—". Verified live on the user's "gg" session (DB-only ghost): DELETE returned `alreadyExists=true`, soft-revoke landed, GET /v1/sessions now shows `{ revokedAt: <iso>, keyPrefix: null }` with the "revoked" badge. Surfaced 2026-05-02 during manual UI testing — without this fix the user couldn't revoke a session that hit the on-chain race during creation.

### T-231 — Wallet Settings vault PDA overflow + copy
- Status: done @Jishnu 2026-05-02
- Depends-on: T-224
- OS: any
- Scope: web
- Acceptance: `apps/web/app/dashboard/_components/stat-card.tsx` `StatCard` gained an optional `copy` prop. When set, the row's value is auto-truncated via `truncatePubkey` (`Xrtv…cf41`) and a Copy button appears next to it that copies the FULL value to the clipboard, with a 1.5s "Copied" feedback state. Used on the Vault PDA row + a new "USDC address" row in the Wallet Settings card on the Overview page (`apps/web/app/dashboard/page.tsx`). Before this fix the 44-char base58 vault PDA was overflowing the card width with no truncation and no way to copy. Surfaced 2026-05-02 via screenshot.

### T-230 — Rotate API key endpoint + UI
- Status: done @Jishnu 2026-05-02
- Depends-on: T-204, T-206
- OS: any
- Scope: api + web
- Acceptance: new `POST /v1/session/:id/rotate-key` (`apps/api/src/routes/session.ts` `postRotateSessionKeyHandler`) — owner-auth via dashboard JWT, ownership via the sessions → wallets → users.id triple-join, 409 if session already revoked. Single DB transaction: revoke all active `api_keys` for this session (`UPDATE WHERE session_id=? AND revoked_at IS NULL`), insert a fresh row with new `keyPrefix` + argon2id-hashed token, append `session_rotate_key` audit row. Concurrent rotations stay correct (final state may have two new active keys but no leftover old ones). On-chain Session PDA is untouched — no Phantom signature, no SOL fees, no on-chain audit footprint. Returns plaintext `apiKey` ONCE — same contract as `POST /v1/session`. UI: new `RotateKeyButton` (`apps/web/app/dashboard/sessions/rotate-key-button.tsx`) calls the endpoint behind a `window.confirm` and pipes the response into the same `<ApiKeyRevealModal>` the create flow uses. Wired into the sessions table next to the existing Revoke button on active rows. Side-effect bug fix: `getSessionsHandler` + `getSessionHandler` now filter the `api_keys` join to `revoked_at IS NULL` — without it the join would multiply rows after rotation and the dashboard would surface a stale prefix. Verified end-to-end against the live api: pre-rotate prefix → POST /v1/session/:id/rotate-key response prefix → GET /v1/sessions prefix → GET /v1/sessions/:id prefix all match. Closes the "regenerate / copy key" UX request from 2026-05-02 — copy of an existing key after first reveal remains by-design impossible (only argon2id hash stored), but the user can rotate to mint a fresh key any time.

### T-229 — Strip dev console.log render-storm noise
- Status: done @Jishnu 2026-05-02
- Depends-on: —
- OS: any
- Scope: web
- Acceptance: `useWalletData`, `DashboardPage`, and `api-client.ts` were each calling `console.log` on every render / fetch. Combined with SWR revalidate-on-focus + React StrictMode double-invoke + multiple consumers of the same hook, dev sessions accumulated 300+ identical `[klink:useWalletData]` log lines per click — pure noise that masked real signal. Removed all three. `api-client.ts` retains the `console.warn` on error responses so failed mutations aren't swallowed; success responses now stay silent. Surfaced 2026-05-02 by the user's pasted devtools log.

### T-228 — NewSessionModal missing `wallet_id` in POST body
- Status: done @Jishnu 2026-05-02
- Depends-on: T-206
- OS: any
- Scope: web
- Acceptance: `apps/web/app/dashboard/sessions/new-session-modal.tsx` was POSTing to `/v1/session` without `wallet_id` → backend returned 400 `wallet_id required` (apps/api/src/routes/session.ts:65) before building the tx. Surfaced as "unable to create sessions" in manual UI testing on 2026-05-02. Pulls wallet from `useWalletData()` (cached SWR — no extra fetch), bails with a toast if no wallet exists yet, and now passes `wallet_id: wallet.id` in the POST body. The schema check has been strict from day one; the modal just never wired the value.

### T-227 — Dashboard wallet_id query param + live sessions count + fund-page error message
- Status: done @Jishnu 2026-05-02
- Depends-on: T-217, T-218, T-224
- OS: any
- Scope: web
- Acceptance: three small UI bugs found during manual test on 2026-05-02. (1) `GET /v1/fund/deposit-address` was called without `wallet_id` from both `apps/web/app/dashboard/page.tsx` and `apps/web/app/dashboard/fund/page.tsx` → backend returned 400 → no QR rendered on the Overview balance card or the Fund page. The handler at `apps/api/src/routes/fund.ts:22` requires it. Now both pages pass `?wallet_id=${w.wallet.id}` to the SWR key. (2) Fund page rendered "No wallet yet — create one from Overview" when the fund call failed for an existing wallet (because of bug 1). Now three branches: no wallet → create CTA, wallet+loading → skeleton, wallet+success → QR, wallet+failure → "Couldn't load deposit address — check api logs." (3) Wallet Settings card hardcoded "Active Sessions" as the em-dash placeholder. Now reads live count from `useSessions()` filtered to un-revoked rows (matches the right-side ActivityRail card which was already correct).

### T-226 — Treasury keypair as fee payer for agent spend/yield
- Status: done @Jishnu 2026-05-02
- Depends-on: T-210, T-211, T-212, T-213, T-215
- OS: any
- Scope: api
- Acceptance: `apps/api/src/routes/spend.ts` (all 3 handlers — transfer / sign-payment / service) and `apps/api/src/routes/yield.ts` (agent-flow `kamino_deposit` / `kamino_withdraw`) switched `tx.feePayer` from `signer.publicKey` (= session keypair, `Keypair.generate()`d server-side with 0 SOL) to the treasury keypair from `TREASURY_SECRET_KEY`. Both keypairs sign — treasury for the network fee, session for the on-chain `transfer_usdc` / `kamino_*` instruction's `session_signer` authority check. New shared loader `apps/api/src/crypto/treasury.ts` (`loadTreasury()` + `loadTreasuryAta()` accepting either base58 or solana-keygen JSON form), reused by `dodo.ts` to remove the duplicate inline definition. Owner-flow yield variants at `/v1/wallet/yield/*` (T-222) keep `feePayer = owner` since Phantom signs + pays. Live e2e harness at `apps/api/scripts/e2e-dashboard.ts` (new in this task) drives the full dashboard flow against the real api + Neon DB + devnet program and verifies the fix end-to-end — final spend transfer confirms with `decision=allow`. 156 unit tests stay green; biome clean on changed files. Bug found via the e2e session of 2026-05-02: every agent spend was failing simulation with `Attempt to debit an account but found no record of a prior credit` because the empty session keypair couldn't cover the 5000-lamport fee. Latent in the codebase since T-210 — never caught because no integration tests run against a real validator (T-112 was skipped).

### T-225 — Dashboard double-POST for `/v1/wallet` create flow
- Status: done @Jishnu 2026-05-02
- Depends-on: T-205, T-224
- OS: any
- Scope: web
- Acceptance: `apps/web/app/dashboard/_components/create-wallet-cta.tsx` now POSTs `/v1/wallet` a second time after the on-chain `init_vault` tx confirms (before `mutate("/v1/wallet")`). The `POST /v1/wallet` build-tx branch only returns the unsigned tx — it does NOT insert a `wallets` DB row. Only the `alreadyExists` self-heal branch (HANDOVER §4) inserts the row, and it triggers when the on-chain vault is already initialized. So: first POST builds the tx, owner submits via Phantom, on-chain init confirms; second POST hits the alreadyExists branch and backfills the DB. Without the second POST, `mutate` re-fetches GET `/v1/wallet`, the row still doesn't exist, the CTA stays visible, and the user has to click "Create wallet" twice. Verified via the e2e harness from T-226: §3 returns `alreadyExists` on the second call, §4 GET returns 200. Symptom matches the "UI is broken" report from 2026-05-02. The hooks layer (`useBuildAndSignTx`) stays generic — the second POST is in the CTA only, since other build-tx endpoints (session create, allowlist patch, etc.) insert their DB rows in the build-tx step and don't need a second call.



### T-113 — Devnet deployment + smoke test
- Status: done @Prithwish 2026-05-02
- Depends-on: T-112
- OS: any
- Scope: deploy
- Acceptance: agent_wallet program deployed to Solana devnet at `5qCJCEhfLusk59YFqaEG9Yg3Wp64ZaYwvXteFmCmedqv`. ProgramData `4MjoSCZnixSe167V5yMXtbLTKFEcVJPwQyyNHtDkSmTY`, authority `6fELFcucWR7CPrBrRmfAs8tNjvt5dUnQDk3cguAtdrjZ`, slot 459 431 877, data length 276 832 bytes, deployed from build at `origin/main` commit `8e9eb05` via `anchor build && anchor deploy --provider.cluster devnet --provider.wallet <deployer>`. Cost ≈ 1.93 SOL rent. Deploy log appended to `docs/runbooks/devnet-deploys.md` with full provenance + smoke procedure. Kamino devnet reserve env (`KAMINO_RESERVE`, etc.) still empty — `kamino_deposit` / `kamino_withdraw` will revert until those are populated, but the other 6 instructions are live and signable from the dashboard. T-112 dep was waived (no integration tests yet) — flagged for follow-up. Smoke against real Kamino devnet reserve is gated on T-114's authority rotation and T-213's env wiring.
- Notes: T-114 (multisig authority rotation) is the next blocker before mainnet. The deploy authority is currently a single keypair held by @Prithwish.

### T-308 — Dodo fund flow UI
- Status: done @Prithwish 2026-05-02
- Depends-on: T-214, T-303
- OS: any
- Scope: web
- Acceptance: `apps/web/app/dashboard/fund/page.tsx` — two-card layout. Left: server-rendered QR + USDC ATA + copy button from `GET /v1/fund/deposit-address` (T-217). Right: Dodo card-fiat with $10 / $50 / $100 / $250 preset chips + custom amount; submit calls `POST /v1/fund/dodo-checkout` (T-214) and redirects to the returned `checkout_url`. Toast on error. Filed by UI design spec §3.6.

### T-307 — Yield UI
- Status: done @Prithwish 2026-05-02
- Depends-on: T-213, T-303
- OS: any
- Scope: web
- Acceptance: `apps/web/app/dashboard/yield/page.tsx` — Liquid + Deployed cards (read on-chain via `useOnChainVault` — direct RPC, no backend round-trip), Deposit-to-Kamino + Withdraw-from-Kamino forms. Both writes go through `useBuildAndSignTx` to the dashboard-JWT yield endpoints (T-222, NEW — pending); on 404/405 the page surfaces `<BackendPending taskId="T-222" />` until that backend gap lands. The agent-key path on T-213 stays untouched.

### T-306 — Audit log viewer
- Status: done @Prithwish 2026-05-02
- Depends-on: T-216, T-303
- OS: any
- Scope: web
- Acceptance: `apps/web/app/dashboard/audit/page.tsx` + `apps/web/_hooks/use-audit.ts`. `useSWRInfinite` cursor pagination against `GET /v1/audit?limit=50&cursor=&decision=` (T-216). All / Allow / Deny filter pills; rows show timestamp, action, USDC amount, recipient/URL (truncated), decision badge, denial reason, tx signature link to Solana Explorer (devnet). "Load more" button when `next_cursor != null`. Filter switch resets pagination via SWRInfinite's key function.

### T-305 — Allowlist editor (recipients + URLs + time window)
- Status: done @Prithwish 2026-05-02
- Depends-on: T-207, T-209, T-304
- OS: any
- Scope: web
- Acceptance: `apps/web/app/dashboard/sessions/[id]/page.tsx` plus `recipient-list.tsx`, `instruction-bitmap.tsx`, `url-allowlist.tsx`, `time-window.tsx` + `apps/web/_hooks/use-session.ts`. Four independent save-units, each with its own button: (1) recipients (10-slot fixed array, action: Set/Add/Remove) and (2) instruction bitmap (3 checkboxes mapped to spec §2.4 bits) both go through `useBuildAndSignTx` to `PATCH /v1/session/:id/allowlist` (T-207). (3) URL allowlist and (4) time window save via plain `api.patch` to `PATCH /v1/wallet/off-chain-policy` (T-223, NEW — pending). 404/405 → `<BackendPending />`. Single-session read uses `GET /v1/sessions/:id` (T-219, NEW — pending) — page surfaces `<BackendPending taskId="T-219" />` until that lands.

### T-304 — Session list + create + revoke
- Status: done @Prithwish 2026-05-02
- Depends-on: T-206, T-207, T-303
- OS: any
- Scope: web
- Acceptance: `apps/web/app/dashboard/sessions/page.tsx` + `new-session-modal.tsx` + `api-key-reveal-modal.tsx` + `revoke-confirm.tsx` + `apps/web/_hooks/use-sessions.ts`. List rendered from `GET /v1/sessions` (T-218, NEW — pending; surfaces `<BackendPending taskId="T-218" />` until that lands). `New session` modal: react-hook-form + zod (label, max_per_tx, daily_cap, expiry, ≤10 recipients, 3-bit instruction bitmap), submit → `POST /v1/session` (T-206) via `useBuildAndSignTx`, server response includes `apiKey` shown ONCE in `<ApiKeyRevealModal />` with copy-to-clipboard. Revoke: confirmation dialog → `DELETE /v1/session/:id` (T-207) via Phantom build-tx-then-sign.

### T-303 — Wallet creation flow
- Status: done @Prithwish 2026-05-02
- Depends-on: T-205, T-302
- OS: any
- Scope: web
- Acceptance: Overview page at `apps/web/app/dashboard/page.tsx` renders the 3-column grid (Wallet Settings card / USDC balance + QR + Fund-Yield CTAs / Active-Sessions + Recent-Activity rail). When `GET /v1/wallet` (T-224, NEW — pending) returns 404, shows `<CreateWalletCta />` which calls `useBuildAndSignTx("/v1/wallet", "POST", { max_deployed_fraction_bp: 8000 })` — Phantom signs the `init_vault` tx, web3.js submits, SWR revalidates, overview re-renders with the wallet stats. Toast on error. Implementation: `app/dashboard/_components/{stat-card,balance-card,activity-rail,create-wallet-cta}.tsx` + `_hooks/{use-wallet,use-on-chain-vault,use-build-and-sign-tx}.ts`. Until T-224 lands, surfaces `<BackendPending taskId="T-224" />`. The full UI surface (T-303 → T-308 + the nested allowlist editor + settings + sign-in restyle) ships in this batch under the design at `docs/superpowers/specs/2026-05-02-klink-web-ui-design.md` and the plan at `docs/superpowers/plans/2026-05-02-klink-web-ui.md`. Verified via puppeteer e2e harness — 7 distinct screenshots in `apps/web/tests/_screenshots/`.
### T-501 — Per-OS dev-environment runbook
- Status: done @Jishnu 2026-05-02
- Depends-on: —
- OS: any (content covers all three)
- Scope: docs
- Acceptance: `docs/runbooks/dev-environment.md` extended from a stub into a full per-OS install runbook. New §2.4 adds Fedora/RHEL `dnf` commands (closes the apt/dnf coverage gap in the original acceptance). Postgres + Redis install commands added to every per-OS section. New §4 adds local Postgres bootstrap (`CREATE ROLE klink … CREATE DATABASE klink_dev …` + `db:migrate`) so devs can work offline. New §5 walks through clone → `bun install` → env-file fill → typecheck/test/lint → `bun --filter @klink/api dev`. §3 verify list expanded to include `psql` and `redis-cli ping`. §6 attestation table widened with Postgres + Redis columns; rows pre-seeded for @Manjeet/@Manish/@Mouli; @Jishnu's row updated with managed (Neon/Upstash) values + 2026-05-02 date. Note re Bun mandate: T-501 was originally written calling for Node/pnpm install commands — superseded by the team's Bun-only decision (per `team-collaboration.md`); the runbook now mandates `bun` for runtime + package manager + test runner with no Node/pnpm steps.

### T-224 — `GET /v1/wallet` (read wallet)
- Status: done @Jishnu 2026-05-02
- Depends-on: T-205
- OS: any
- Scope: api
- Acceptance: `apps/api/src/routes/wallet.ts` `getWalletHandler` — dashboard-JWT-authenticated. Returns `{ id, vaultPda, usdcAta, maxDeployedFractionBp, ownerPubkey, createdAt }` for the most-recent wallet owned by `req.user.id`. 404 when none exists (signals the overview to show "Create wallet"). On-chain `deployed_amount` stays in `GET /v1/yield/position` (T-213). Mounted at `GET /v1/wallet`.

### T-223 — `PATCH /v1/wallet/off-chain-policy` (set URL allowlist + time window)
- Status: done @Jishnu 2026-05-02
- Depends-on: T-209
- OS: any
- Scope: api
- Acceptance: `apps/api/src/routes/wallet.ts` `patchOffChainPolicyHandler` — UPSERT into `off_chain_policies` keyed on `wallet_id`. Body is a strict partial: `{ wallet_id?, allowed_urls?: [{ pattern, max_per_call? }], time_window_start_min?: 0..=1440, time_window_end_min?: 0..=1440, time_window_dow_bitmask?: 0..=127, timezone? }`. New `validateAllowedUrlPattern` enforces spec §3.3.1: rejects host wildcards (`https://*.example.com`), rejects mid-segment path wildcards (`/v1/u*ers`), rejects non-http(s) protocols, rejects malformed URLs — only standalone `*` path segments are allowed. Cross-field check: `start_min ≤ end_min` enforced both pre-merge and post-merge so partial updates that drift the bound get caught. Read-then-upsert merges with current row so callers can change one field without resending the whole policy. Drizzle `onConflictDoUpdate` for the UPSERT. Idempotent. Mounted at `PATCH /v1/wallet/off-chain-policy`. 6 unit tests over the validator (positive: trailing/midpath wildcards/no-wildcard; negative: host wildcards, mid-segment, non-http, malformed, glued-trailing).

### T-222 — Owner-flow build-tx variants for `/v1/yield/{deposit,withdraw}`
- Status: done @Jishnu 2026-05-02
- Depends-on: T-108, T-109, T-205, T-213
- OS: any
- Scope: api
- Acceptance: `apps/api/src/routes/yield.ts` extended with `postOwnerYieldDepositHandler` + `postOwnerYieldWithdrawHandler`. Dashboard-JWT-authenticated. Validates wallet ownership (`wallets.user_id = req.user.id`), builds the unsigned `kamino_deposit` / `kamino_withdraw` tx with `sessionPubkey: null` (Anchor's `Option<Account<Session>>` = None — `buildKaminoIx` substitutes `PROGRAM_ID` as the placeholder per the existing convention), feePayer = owner Phantom, returns `{ txBase64, vaultPda, vaultUsdcAta }`. Mounted at `POST /v1/wallet/yield/deposit` and `POST /v1/wallet/yield/withdraw` so the auth surface stays clean — agent-key paths from T-213 keep `/v1/yield/*` untouched. Body `{ amount: number, wallet_id?: string }`. Per spec §4.3 owners can drive yield via dashboard JWT; T-213 shipped only the agent-key half.

### T-221 — `POST /v1/wallet/policy` (build set_max_deployed_fraction tx)
- Status: done @Jishnu 2026-05-02
- Depends-on: T-107, T-205
- OS: any
- Scope: api
- Acceptance: `apps/api/src/routes/wallet.ts` `postWalletPolicyHandler` — dashboard-JWT-authenticated. Body `{ max_deployed_fraction_bp: int 0..=10_000, wallet_id? }`. New `buildSetMaxDeployedFractionIx` in `program/agent-wallet.ts` encodes Anchor discriminator + u16 LE bp (10 data bytes total), 2 accounts `[owner signer-not-writable, vault writable]` matching the rust `SetMaxDeployedFraction<'info>` struct. Wallet ownership check via `wallets.user_id = req.user.id`. Returns `{ txBase64, walletId, vaultPda, maxDeployedFractionBp }` for Phantom to sign + submit. Mounted at `POST /v1/wallet/policy`. 5 unit tests pin the discriminator, u16 LE encoding across 0/1/8000/10_000, account-meta order, and reject negative/over-MAX/non-integer bp.

### T-219 — `GET /v1/sessions/:id` (read one session + off-chain policy)
- Status: done @Jishnu 2026-05-02
- Depends-on: T-206, T-209
- OS: any
- Scope: api
- Acceptance: `apps/api/src/routes/session.ts` `getSessionHandler` — single-session read. Ownership via `sessions → wallets → users.id` triple-join (same 404 for not-found and wrong-owner — existence not leaked across users). Reads on-chain `Session` PDA via `Connection.getAccountInfo(deriveSessionPda(vault, sessionPubkey))` + new `decodeSessionAccount` Borsh decoder in `program/agent-wallet.ts`. Layout pinned to the rust `Session` struct: 8B disc + 32B vault + 32B session_pubkey + 8B max_per_tx + 8B daily_cap + 8B daily_spent + 8B daily_window_start + 8B expiry + 320B `[Pubkey;10]` recipients + 1B count + 4B allowed_instructions + 1B bump = 438 bytes. Decoder strips trailing default-pubkey slots so the dashboard never sees `Pubkey::default()` placeholders. On-chain RPC failures or pre-init sessions surface as `onChain: null + onChainError` so the dashboard can render "session pending on-chain confirmation" without crashing. Off-chain policy attached when present. Mounted at `GET /v1/sessions/:id`. 5 unit tests over `decodeSessionAccount` cover happy path, trailing-slot stripping, empty recipients, too-short buffer, count-overflow corruption.

### T-218 — `GET /v1/sessions` (list sessions for caller's wallets)
- Status: done @Jishnu 2026-05-02
- Depends-on: T-206
- OS: any
- Scope: api
- Acceptance: `apps/api/src/routes/session.ts` `getSessionsHandler` — dashboard-JWT-authenticated. Two-step query: fetch caller's wallet IDs first (so empty wallets → empty array, not 404), then `inArray` filter on sessions joined to `api_keys` for the prefix. Optional `?wallet_id=` filter to scope to one vault. `INNER JOIN api_keys` because T-206 inserts both rows in one transaction — a session without an API key would be a corrupt state, not a UI rendering case. Result `[{ id, walletId, label, sessionPubkey, expiresAt, revokedAt, keyPrefix, createdAt }]` ordered `createdAt desc`. Mounted at `GET /v1/sessions`.
### T-309 — TypeScript SDK package (`@klink/sdk`)
- Status: done @Manjeet 2026-05-02
- Depends-on: T-210, T-211, T-212, T-213
- OS: any
- Scope: sdk
- Acceptance: typed client for all `/v1/spend/*` and `/v1/yield/*` endpoints; published to local Bun workspace. Implementation: `packages/sdk/` with `KlinkClient` class, typed request/response shapes, `KlinkApiError` with status + body, injectable `FetchLike` for testing. 18 tests covering all 6 endpoints (spend/transfer, spend/sign-payment, spend/service pass-through, yield/deposit, yield/withdraw, yield/position), error taxonomy, base-url normalization, and non-JSON error resilience. Root `package.json` workspaces extended to `packages/*`; `.gitignore` and `biome.json` updated. Lint + typecheck + 155 total tests green.

### T-407 — Wire up Telegram bot + verify notifications
- Status: done @Jishnu 2026-05-02
- Depends-on: —
- OS: any
- Scope: infra
- Acceptance: bot created via `@BotFather`; `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` secrets set in GitHub repo; smoke test passes (dummy `claim: T-999` PR triggers `[CLAIM]` message, merge triggers `[LOCK]`); attestation row added to `docs/runbooks/telegram-notifications.md` §3; team channel link in `TODO.md` Team section updated to the Telegram group invite.

### T-508 — API surface review (internal vs exposed)
- Status: done @Jishnu 2026-04-30
- Depends-on: —
- OS: any
- Scope: docs + design
- Acceptance: `docs/architecture/api-surface.md` lists every `/v1/*` route with proposed visibility (`public` / `dashboard-only` / `agent-only` / `webhook` / `internal`), the auth model, and a one-line description. Manual review pass marks each row as confirmed or flagged for change. Reviewer signs off in the doc's attestation row before mainnet exposure.

### T-215 — `POST /v1/webhooks/dodo` + treasury-disburser worker
- Status: done @Jishnu 2026-04-30
- Depends-on: T-214
- OS: any
- Scope: api + worker
- Acceptance: `apps/api/src/routes/dodo.ts` — HMAC-SHA256 verify (timing-safe, length-checked) over `req.rawBody` (captured by `express.json({ verify })` in `app.ts` so the bytes Dodo signed survive parsing). Idempotency key = `dodo_session_id`: replays return 200 `{ status: "already_settled" }` after the first success; orphan webhooks return 200 `{ status: "unknown_session" }` so Dodo stops retrying while ops can investigate via the loud server log. Disburser is inline: SPL transfer treasury USDC ATA → vault USDC ATA, signed by `TREASURY_SECRET_KEY` keypair (accepts base58 OR `solana-keygen` JSON array). On success: UPDATE `dodo_payments(status=settled, settled_at, treasury_tx_signature)`, INSERT `treasury_disbursements`, INSERT `audit_log(action=fund_dodo, decision=allow)`. On RPC submit failure: UPDATE `dodo_payments.status=failed`, audit `decision=deny` with truncated error, return 503 so Dodo retries (failed status blocks the next replay from disbursing). 6 unit tests over `verifyDodoSignature` — happy path, body tamper, wrong secret, missing/empty header, wrong-length header (would crash `timingSafeEqual` if length-check were missing), non-hex character (parsed-buffer length check catches it).

### T-214 — `POST /v1/fund/dodo-checkout`
- Status: done @Jishnu 2026-04-30
- Depends-on: T-202
- OS: any
- Scope: api
- Acceptance: `apps/api/src/routes/dodo.ts` — dashboard-JWT-authenticated. Body `{ amount_usd: int 1..10000, wallet_id: uuid, success_url?, cancel_url? }`. Wallet ownership check via `wallets.user_id = req.user.id`; same 404 for not-found and wrong-owner so existence isn't leaked. Calls injectable `createSession` (default = `fetch DODO_API_BASE_URL/checkout/sessions` with bearer `DODO_API_KEY`); on Dodo failure returns 502. INSERTs `dodo_payments(status=pending, dodo_session_id, amount_usd in cents, amount_usdc = $usd × 1_000_000)` — the unique `dodo_session_id` constraint is the idempotency key for T-215. Response `{ checkout_url, dodo_session_id }`.

### T-213 — `POST /v1/yield/{deposit,withdraw}` + `GET /v1/yield/position`
- Status: done @Jishnu 2026-04-30
- Depends-on: T-108, T-109, T-204
- OS: any
- Scope: api
- Acceptance: `apps/api/src/routes/yield.ts`. Deposit + withdraw are session-signed; reuse the decrypt-keypair pattern from T-210. Build via new `buildKaminoDepositIx` / `buildKaminoWithdrawIx` (same 12-account shape, distinguished by discriminator). Kamino-specific addresses (reserve, lending market, lending-market authority, reserve liquidity supply, reserve collateral mint) loaded from env (`KAMINO_RESERVE`, etc.) — populated when T-113 lands. Withdraw revert → 409 (per §4.3 partial-liquidity), deposit revert → 402. `GET /v1/yield/position` reads on-chain Vault account, decodes `deployed_amount` at offset 42 via `decodeVaultDeployedAmount`. Accrued yield deferred (klend-sdk follow-up); `accrued: null` in response.

### T-212 — `POST /v1/spend/sign-payment` (custom x402 sign-only)
- Status: done @Jishnu 2026-04-30
- Depends-on: T-210
- OS: any
- Scope: api
- Acceptance: `apps/api/src/routes/spend.ts` extended. Off-chain policy via T-209's `checkOffChainPolicy({ url, walletId })` — full URL-allowlist + time-of-day path. Decrypt + build + sign + submit, then audit. Returns `{ tx_signature, payment_proof_header }` where `payment_proof_header` is the base58 signature for the agent's `X-Payment-Proof:` retry. Same deny taxonomy as T-210 (URL_NOT_ALLOWED / OUTSIDE_TIME_WINDOW / INSUFFICIENT_LIQUID / ON_CHAIN_REVERT).

### T-211 — `POST /v1/spend/service` (mpp.dev curated proxy)
- Status: done @Jishnu 2026-04-30
- Depends-on: T-210, T-220
- OS: any
- Scope: api
- Acceptance: `apps/api/src/routes/spend.ts` extended. Catalog lookup by slug (T-220's seed); rejects disabled / unknown rows. Probe service via injectable `fetch`; expects 402 + JSON `{ amount, recipient }` requirements. Quoted amount ≤ `max_amount` enforced (else QUOTED_OVER_MAX deny + audit). Liquidity check, decrypt session, build/sign/submit `transfer_usdc`. Retry service with `X-Payment-Proof: <signature>`; forwards service response (status, content-type, body) to agent with `x-tx-signature` header. Retry-after-pay failure logged as `RETRY_FAILED: ...` allow row (money already moved) + 502 to agent.

### T-217 — `GET /v1/fund/deposit-address`
- Status: done @Jishnu 2026-04-29
- Depends-on: T-205
- OS: any
- Scope: api
- Acceptance: `apps/api/src/routes/fund.ts` — owner-authenticated GET. Validates wallet ownership via `wallets.id` + `users.id` join, returns `{ vault_pda, usdc_ata, qr_data_url }`. QR rendered server-side via `qrcode` lib (256px, error-correction M). 404 for unknown / cross-user wallets.

### T-216 — `GET /v1/audit` paginated
- Status: done @Jishnu 2026-04-29
- Depends-on: T-209, T-210
- OS: any
- Scope: api
- Acceptance: `apps/api/src/routes/audit.ts` — cursor-paginated read scoped to caller's wallets via `wallets.user_id = req.user.id`. `cursor` param is the last-seen `id` (bigserial); results in `id desc` so paging is monotonic. `decision` filter (`allow|deny|all`); `limit` capped at 200, default 50. Returns `{ entries, next_cursor }`.

### T-210 — `POST /v1/spend/transfer`
- Status: done @Jishnu 2026-04-29
- Depends-on: T-105, T-206, T-208, T-209
- OS: any
- Scope: api
- Acceptance: `apps/api/src/routes/spend.ts` — API-key-authenticated direct USDC transfer. Pre-flight: time-of-day via T-209 policy, liquidity via `getTokenAccountBalance`. Decrypts session secret with T-208, reconstructs Keypair, builds new `buildTransferUsdcIx` (T-105 instruction), signs + `sendAndConfirmTransaction`. Audit log written for both `allow` (with tx_signature) and `deny` (`OUTSIDE_TIME_WINDOW`, `INSUFFICIENT_LIQUID`, `ON_CHAIN_REVERT: <message>`). Recipient + cap + expiry remain enforced on-chain (T-105). Discriminator pinned `a49e78b74062f40b`. Connection / liquidity / submit / loadPolicy all dep-injectable for tests.

### T-207 — `DELETE /v1/session/:id` + `PATCH /v1/session/:id/allowlist`
- Status: done @Jishnu 2026-04-29
- Depends-on: T-206
- OS: any
- Scope: api
- Acceptance: `apps/api/src/routes/session.ts` extended with `deleteSessionHandler` + `patchSessionAllowlistHandler`. Both build owner-signed unsigned txs (Phantom signs client-side; backend never holds owner key). Ownership check via `sessions → wallets → users.id` join. PATCH body accepts `{ action: 'Add'|'Remove'|'Set', recipients?, allowed_instructions? }` with `Option<Vec<Pubkey>>` + `Option<u32>` Borsh layout. New `agent-wallet.ts` builders: `buildRevokeSessionIx` (discriminator `565cc678900207c2`), `buildUpdateSessionAllowlistIx` (`80e84d7d0846a9e1`), `ALLOWLIST_ACTION` constant matching rust enum order.

### T-206 — `POST /v1/session` (build add_session + mint API key)
- Status: done @Jishnu 2026-04-29
- Depends-on: T-104, T-204, T-208
- OS: any
- Scope: api
- Acceptance: `apps/api/src/routes/session.ts` posts, owner-authenticated via `requireDashboardJwt` (T-205's middleware). Generates Solana session keypair, encrypts secretKey with AES-256-GCM (T-208), mints `klink_dev_<base64url-32B>` API key with argon2id hash (T-204), inserts `sessions` + `api_keys` rows in one DB transaction. Builds unsigned `add_session` tx via new `apps/api/src/program/agent-wallet.ts` (Anchor discriminator + Borsh args + PDA derivation, no IDL needed). Server-side blockhash fetch via `SOLANA_RPC_URL`. Response: `{ txBase64, sessionId, sessionPubkey, apiKey, keyPrefix, expiresAt, vaultPda, usdcAta }`. 27 unit tests covering discriminator pin (`e55e19c1840d37bc`), PDA derivation, Borsh layout per byte, and account-meta order; all 101 api tests pass.
### T-109 — `kamino_withdraw` CPI
- Status: done @Prithwish 2026-04-29
- Depends-on: T-108
- OS: any
- Scope: anchor-program
- Acceptance: pre-flight `amount ≤ vault.deployed_amount`. Decrements `deployed_amount`. Returns Kamino's actual withdrawn amount (may be partial under utilization stress). Implementation: `instructions/kamino_withdraw.rs` mirrors T-108 — same `Option<Account<Session>>` auth split (session bit 2 OR owner), same hardcoded Kamino program ID, opposite asset flow (burn cTokens out of `vault_collateral_ata`, receive USDC into `vault_usdc_ata`). Extends `kamino.rs` with `redeem_reserve_collateral` discriminator `[0xea, 0x75, 0xb5, 0x7d, 0xb9, 0x8e, 0xdc, 0x1d]` (= `sha256("global:redeem_reserve_collateral")[..8]`) and a typed CPI helper. The arg is the **collateral amount** Kamino burns; off-chain backend (T-213) converts USDC target → cToken amount via klend-sdk before signing. The §2.5 pre-flight `amount ≤ vault.deployed_amount` is loose — `amount` is in cTokens, `deployed_amount` is in USDC base units, so the bound is "no more than what was deposited" which suffices for the §5 utilization-stress story (caller cannot ask Kamino to release more than the wallet contributed). To handle Kamino's "may be partial under utilization stress" semantics from §5, the handler snapshots `vault_usdc_ata.amount` before the CPI, calls `reload()` after (Anchor's `Account<TokenAccount>` doesn't auto-refresh post-CPI), computes `actual = post_liquid - pre_liquid`, and **decrements `deployed_amount` by the actual amount**, not the requested. `saturating_sub` against `prior_deployed` is defensive against the (impossible-but) case where Kamino returns more than recorded. New error `AmountExceedsDeployed`. `anchor build` green; IDL exposes all 8 instructions including `kamino_withdraw(amount: u64)` with the 12 accounts. With T-108 + T-109 merged, **T-112 (integration test)** is now unblocked — its dep set was T-105/T-106/T-108/T-109. Tests in T-110 (deposit revert, owned by @Manish) + T-112.

### T-108 — `kamino_deposit` CPI
- Status: done @Prithwish 2026-04-29
- Depends-on: T-103, T-104
- OS: any
- Scope: anchor-program
- Acceptance: hardcodes Kamino program ID. Pre-flight `(deployed + amount) * 10000 / total ≤ max_deployed_fraction_bp`. Updates `vault.deployed_amount`. Signer = session OR owner. Implementation: new `programs/agent_wallet/src/kamino.rs` module pins the program ID `KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD` (same on mainnet + devnet, verified against the public Kamino-Finance/klend repo) and exposes a typed `deposit_reserve_liquidity` CPI helper. The Anchor instruction discriminator `[0xa9, 0xc9, 0x1e, 0x7e, 0x06, 0xcd, 0x66, 0x44]` is `sha256("global:deposit_reserve_liquidity")[..8]` — re-derivable via `echo -n "global:deposit_reserve_liquidity" | sha256sum | head -c 16`. New `state.rs` constants `KAMINO_DEPOSIT_BIT = 1` and `KAMINO_WITHDRAW_BIT = 2` (T-109) match §2.4. The `KaminoDeposit` accounts struct uses `Option<Account<Session>>` so the **same instruction supports both auth paths**: session signer (with bit 1 set) OR owner — picked at runtime by checking whether `session` was supplied. The Kamino accounts (`reserve`, `lending_market`, `lending_market_authority`, `reserve_liquidity_supply`, `reserve_collateral_mint`) are `UncheckedAccount` because the wallet program doesn't validate them structurally — Kamino's own program does that on the CPI; the §2.6 typed-instruction safety floor is the `address = kamino::PROGRAM_ID` constraint on `kamino_program`, which makes adding a new yield protocol require a wallet-program upgrade gated by the multisig (T-114). Pre-flight uses checked arithmetic in multiplication form `new_deployed * 10000 ≤ max_bp * total` to avoid the integer-division precision loss of the spec's `/ total` formulation; `total = vault_usdc_ata.amount + vault.deployed_amount`. The `amount > liquid` early-fail saves CU and gives a clearer error than letting the SPL Token transfer inside Kamino's CPI bounce. New error variants: `AmountZero`, `InsufficientLiquidity`, `MathOverflow`, `DeployedFractionExceeded`, `WrongKaminoProgram`. State update happens **after** CPI returns Ok — the `vault.deployed_amount` bump is the last write. `vault` is loaded by-value early (owner pubkey, bump, max_bp, prior_deployed) so the Anchor borrow checker is happy across the CPI boundary. `anchor build` green; IDL exposes `kamino_deposit(amount: u64)` with 12 accounts (auth signer, vault writable, session optional, both vault token ATAs writable, 5 Kamino accounts, kamino_program address-pinned, token_program). Devnet reserve address verification (which specific Kamino USDC reserve to point at) is deferred to T-113 smoke test. Tests in T-110 + T-112.

### T-107 — `set_max_deployed_fraction`
- Status: done @Prithwish 2026-04-29
- Depends-on: T-103
- OS: any
- Scope: anchor-program
- Acceptance: owner-only; bounded 0–10000 bp. Implementation: `instructions/set_max_deployed_fraction.rs` — owner-signed setter that re-uses `MAX_BP` from T-103's `state.rs` and `FractionOutOfRange` + `NotVaultOwner` from `errors.rs` (no new errors needed). `bp = 0` is allowed and effectively disables further `kamino_deposit`s — useful as an emergency unwind switch without rewriting any session policy. The cap itself is enforced at `kamino_deposit` time (T-108) per §2.5; this instruction only mutates the stored `bp`. `anchor build` green; IDL exposes `set_max_deployed_fraction(bp: u16)` with two accounts (owner signer + vault PDA). With T-105/T-106/T-107 all done, **T-110 (TDD revert suite) is now unblocked**.

### T-106 — `revoke_session` + `update_session_allowlist`
- Status: done @Prithwish 2026-04-29
- Depends-on: T-104
- OS: any
- Scope: anchor-program
- Acceptance: revoke closes session account and refunds rent to owner. Update supports `Add | Remove | Set` actions. Owner-only. Implementation: `revoke_session()` is a no-op handler whose work is done by Anchor's `close = owner` constraint on the Session account — lamports flow back to the owner and the discriminator is zeroed so the PDA can't be re-used (a new `add_session` for the same `(vault, session_pubkey)` would re-init from scratch). Owner can call without the backend being online — that's the §1.2 session-key-leak escape hatch. `update_session_allowlist(action, recipients?, instructions_bitmap?)` exposes the spec §2.3 mutation: `recipients` and `instructions_bitmap` are independently optional (passing only the bitmap is a no-op on the allowlist; passing only recipients leaves the bitmap untouched). The `AllowlistAction` enum is `Anchor{Serialize,Deserialize}` and applies to the recipient list only — `Add` appends + skips duplicates already present (errors `TooManyRecipients` when the count would push past `MAX_RECIPIENTS`); `Remove` filters and compacts survivors into a fresh `[Pubkey; 10]` so the unused trailing slots stay `Pubkey::default()` (preserves the invariant that `transfer_usdc`'s allowlist slice can never accidentally match a real address); `Set` replaces wholesale, length checked against `MAX_RECIPIENTS`, empty Vec is allowed and effectively pauses spending. Both instructions are owner-signed with `has_one = owner @ NotVaultOwner` on Vault and `has_one = vault @ SessionVaultMismatch` on Session — without the latter a malicious caller could close another vault's session by signing as their own owner. No new error variants (re-uses `NotVaultOwner`, `SessionVaultMismatch`, `TooManyRecipients`). `anchor build` green; IDL exposes `revoke_session()` (3 accounts) and `update_session_allowlist(action, recipients, instructions_bitmap)` (3 accounts) with the `AllowlistAction` enum. Tests in T-110.

### T-105 — `transfer_usdc` instruction with all reverts
- Status: done @Prithwish 2026-04-29
- Depends-on: T-104
- OS: any
- Scope: anchor-program
- Acceptance: implements all 5 §2.5 reverts (recipient allowlist, max_per_tx, rolling-24h daily_cap, expiry, instruction-bit) + the implicit session-signer match. Implementation: `instructions/transfer_usdc.rs` — handler walks the reverts in spec §2.5 order, then CPIs to SPL Token with the Vault PDA as transfer authority (`["vault", owner]` + cached `vault.bump` re-seeded into `CpiContext::new_with_signer`). New `state.rs` constants: `SECONDS_PER_DAY = 86_400` (rolling-24h, not calendar) and `TRANSFER_USDC_BIT = 0` (matches §2.4). The rolling-24h logic resets `daily_window_start` and `daily_spent` in-place when `now ≥ window + 86_400`; `checked_add` guards `daily_spent + amount` against u64 overflow (`DailyCapOverflow` error). `recipient` is a runtime arg checked against the populated slice of `session.allowed_recipients` (so the trailing `Pubkey::default()` slots can never match). The `recipient_usdc_ata` account is constrained `owner == recipient` AND `mint == vault_usdc_ata.mint` so an attacker can't pass an allowlisted recipient pubkey while pointing the funds ATA at their own account. `session` carries `has_one = vault @ SessionVaultMismatch` to block pairing a high-cap session with a different vault's ATA. New `AgentWalletError` variants: SessionSignerMismatch, SessionVaultMismatch, InstructionNotAllowed, RecipientNotAllowed, RecipientAtaMismatch, WrongMint, AmountExceedsMaxPerTx, DailyCapExceeded, DailyCapOverflow, SessionExpired. Memo / payment-id is **not** an arg here — backends should add an SPL Memo instruction adjacent to `transfer_usdc` in the same tx (keeps the on-chain handler focused on enforcement). New dep: `anchor-spl = 1.0.0` in `programs/agent_wallet/Cargo.toml` with `idl-build` feature wired up. Anchor 1.0 changed `CpiContext::new_with_signer` to take `program_id: Pubkey` instead of `AccountInfo` — handler passes `token_program.key()`. `anchor build` green; IDL exposes `transfer_usdc(amount: u64, recipient: pubkey)` with the 6 expected accounts. Full revert tests land in T-110.

### T-104 — `Session` account + `add_session` instruction
- Status: done @Prithwish 2026-04-29
- Depends-on: T-103
- OS: any
- Scope: anchor-program
- Acceptance: matches §2.2.2 (fixed-10 recipients, `allowed_instructions` bitmap, expiry, daily window). PDA seeds `["session", vault, session_pubkey]`. Owner-only. Implementation: `Session` struct lives in `state.rs` next to `Vault` (430 byte payload + 8 disc, ~$0.50 rent as specced). `MAX_RECIPIENTS = 10` exported as a const so `transfer_usdc` (T-105) can iterate the same fixed slot count. New `AgentWalletError` variants `TooManyRecipients`, `ExpiryInPast`, `NotVaultOwner`. `instructions/add_session.rs` is a separate file mirroring the `init_vault` shape — sponsored payer + owner signer; Vault is loaded via `seeds = ["vault", owner.key()]` with `has_one = owner @ NotVaultOwner` so trying to register a session against someone else's vault reverts. Session PDA seeds are `["session", vault.key(), session_pubkey.as_ref()]` — `session_pubkey` is a plain `Pubkey` arg (not a Signer; the off-chain backend keypair never appears at session-creation time). On-chain init sets `daily_spent = 0`, `daily_window_start = now`, packs the variable-length `Vec<Pubkey>` into the fixed `[Pubkey; 10]` array (extra slots stay `Pubkey::default()` and can never match a real recipient). `expiry == 0` means never; non-zero must be in the future. Duplicate creation reverts via Anchor's `init` constraint. `anchor build` green; IDL at `target/idl/agent_wallet.json` shows `add_session` with all six args, the `Session` account, and the new error variants. Tests in T-110.
### T-507 — Public docs: drop competitor framing, problem-first hook
- Status: done @Manjeet 2026-04-29
- Depends-on: T-506
- OS: any
- Scope: docs
- Acceptance: zero mentions of `Locus`, `ERC-4337`, `EVM`, `Ethereum`, `Privy`, `Turnkey`, or any "Klink-vs-X" comparative framing across `gitbook/**` (verified by `grep -ri` returning zero matches). `gitbook/introduction/what-is-klink.md` rewritten with a problem-first hook (the three-true-things invariant) and standalone first-mover positioning — no "we deliberately rejected" framing, no internal-strategy framing, no `CONTEXT.md` link. Three smaller surgical edits: dropped EVM bullet from `concepts/overview.md`, dropped "(like Locus on Base)" parenthetical from `architecture/overview.md`, reframed "Why Solana and not Ethereum?" → "Why Solana?" in `resources/faq.md` with Solana-strengths-only answer. All four touched files have `last_updated: 2026-04-29`.
- Notes: Public docs only. `CONTEXT.md`, the design spec, and other internal team docs keep their full strategic framing — the comparative analysis still lives in CONTEXT.md §6 for team reference. Public docs now sell what Klink IS, not what it isn't.

### T-205 — `POST /v1/wallet` build init_vault tx
- Status: done @Manjeet 2026-04-29
- Depends-on: T-103, T-203
- OS: any
- Scope: api
- Acceptance: `apps/api/src/routes/wallet.ts` exports `POST /v1/wallet` (wired in `app.ts` behind `requireDashboardJwt`). Body `{ max_deployed_fraction_bp: integer 0..=10000 }` → `{ txBase64, vaultPda, vaultUsdcAta }`. Unsigned tx contains the `init_vault` instruction (manually encoded as the 8-byte Anchor discriminator `4d4f559621d9346a` + u16 LE arg, no `@coral-xyz/anchor` dep) plus `createAssociatedTokenAccountInstruction` for the off-curve vault USDC ATA, both with `feePayer = owner` (self-pay MVP — payer slot can swap to a treasury keypair when T-214 lands without changing on-chain accounts). Phantom signs + submits client-side; backend never holds the owner key (spec §3.2.1). Companion `apps/api/src/auth/jwt.ts` adds `requireDashboardJwt` (HS256 verify against `JWT_SECRET`, populates `req.user`) — reusable for every dashboard-JWT route to come (T-206/207/213/214/216/217). 23 new tests, 75 total green: middleware (missing/non-Bearer/empty/thrown verifier/happy/exact-token-forwarding) + pure tx-builder (PDA seeds, off-curve ATA, feePayer, blockhash, instruction count, discriminator pin, account-meta order) + handler (auth, validation matrix, RPC failure, base64 round-trip via `Transaction.from()`, unsigned signature slot).
- Notes: New env vars on apps/api — `SOLANA_RPC_URL` (already implied by T-401's Helius pick), `USDC_MINT` (devnet mint, configurable), `KLINK_PROGRAM_ID` (defaults to the `Anchor.toml`-pinned id). Adds `@solana/web3.js@1.98.4` + `@solana/spl-token@0.4.14`. `biome.json` gains `.claude/**` to its ignore list so local Claude Code permission files don't trip lint.

### T-103 — `Vault` account + `init_vault` instruction
- Status: done @Prithwish 2026-04-28
- Depends-on: T-102
- OS: any
- Scope: anchor-program
- Acceptance: matches design spec §2.2.1 (`owner`, `max_deployed_fraction_bp`, `deployed_amount`, `bump`); PDA seeds `["vault", owner.key()]`; reverts on duplicate init via Anchor's `init` constraint (account-already-exists). Unit-tested in T-110. Implementation split the program into modules — `state.rs` (Vault account + `MAX_BP` const), `errors.rs` (`AgentWalletError::FractionOutOfRange`), `instructions/init_vault.rs` (context + handler), `instructions/mod.rs` re-exports — so T-104+ can land each instruction as a separate file. `init_vault` takes a separate `payer` and `owner` signer (sponsored model: backend pays rent, owner signs to consent to a vault under their pubkey); enforces `max_deployed_fraction_bp ≤ 10_000`. The stub `initialize` from `anchor init` is gone; `tests/src/test_initialize.rs` removed (T-110 replaces with the §6.1.1 revert suite). `anchor build` green; IDL at `target/idl/agent_wallet.json` shows `init_vault` instruction + `Vault` account exactly as specced.
### T-405 — CI: anchor build + test
- Status: done @Manjeet 2026-04-29
- Depends-on: T-102
- OS: any
- Scope: ci
- Acceptance: `.github/workflows/anchor-ci.yml` runs `anchor build` + `cargo test --workspace` on every PR + push touching `programs/`, `tests/`, `Anchor.toml`, `Cargo.toml`, `Cargo.lock`, or the workflow itself. Solana 3.1.13 pinned via `release.anza.xyz/v3.1.13/install`; Anchor 1.0.0 pinned via avm; both cached separately so warm runs hit the cache. Three-tier caching (cargo registry/git/target via `Swatinem/rust-cache@v2`, Solana install dir + avm via `actions/cache@v4`). Cold first run ~7m23s on PR #29; subsequent runs are faster.
- Notes: CI uses `cargo test --workspace` rather than `anchor test` for now — the only existing test was the `anchor init` scaffold's integration test which (a) imports `anchor_client::solana_sdk::*` (dropped in 1.0) and (b) needs a running validator + ANCHOR_WALLET. Replaced it with a placeholder unit test (`tests/src/test_initialize.rs::placeholder_compiles`) so the suite has something to compile and exit 0 on. Switch back to `anchor test` once T-110 introduces validator-dependent tests against `solana-program-test`. Path filter keeps the ~7-min toolchain install off backend/docs/web PRs.

### T-411 — Telegram-notify workflow `permissions:` block
- Status: done @Manjeet 2026-04-28
- Depends-on: —
- OS: any (CI runs on Linux)
- Scope: infra
- Acceptance: `.github/workflows/telegram-notify.yml` declares `permissions: contents: read, pull-requests: read` at the workflow level so `actions/github-script@v7` no longer 403s on `pulls.get()`. Repro: run history on PR #26 shows the `notify` job failing every push with `Resource not accessible by integration` and `x-accepted-github-permissions: pull_requests=read; contents=read` — exactly the perms now granted. Read-only is sufficient (workflow only reads `mergeable_state` and posts to Telegram; it never writes back to GitHub).
- Notes: Repo's default token permissions are restricted (a sensible default GitHub now applies to new repos); this workflow needs to opt in. Doesn't affect T-407, which tracks live bot wiring + secret setup.
### T-506 — Public GitBook v1
- Status: done @Manjeet 2026-04-28
- Depends-on: T-502
- OS: any
- Scope: docs
- Acceptance: `gitbook/` populated with `.gitbook.yaml` + `SUMMARY.md` + 22 content pages across `introduction/` (3), `getting-started/` (3), `concepts/` (8), `architecture/` (2), `resources/` (5), plus the root `README.md`. Every page has frontmatter (`title`/`purpose`/`last_updated`). Concept pages cite the design-spec section in their `purpose` for spec-drift auditing. `.gitignore` punched a hole for `gitbook/**` (the repo uses deny-by-default allowlisting). `DOCS_INDEX.md` gains a "Public documentation (GitBook)" section. All 23 markdown files have frontmatter; all intra-gitbook relative links resolve. GitBook.com Git Sync to be configured by user in the GitBook UI against branch `main`, subdirectory `gitbook/`. Section structure modeled loosely on `docs.kimia.live` (intro → getting-started → concepts → architecture → resources); Kimia-specific surfaces (perp DEX, PT/YT, codama) dropped.
- Notes: Lean v1 — agent-developer audience. SDK / API / per-program reference deferred until T-309 / T-2xx land. Two intentional `> **TODO**:` markers per AGENTS.md convention: pin canonical devnet USDC mint after T-113, full quickstart walkthrough lands with T-309.

### T-102 — Initialize Anchor workspace
- Status: done @Prithwish 2026-04-28
- Depends-on: T-101
- OS: any
- Scope: scaffold
- Acceptance: `programs/agent_wallet/` exists with stub `lib.rs` (`initialize` no-op + `Initialize` empty `#[derive(Accounts)]`); `anchor build` succeeds locally; CI green via T-405. Implementation: scaffold produced via `anchor init agent_wallet --no-git --test-template rust`, pruned to repo conventions (Bun is the only JS/TS runner — dropped the scaffold `package.json` / `tsconfig.json` / `yarn.lock`; kept `migrations/deploy.ts` as the placeholder Anchor expects, and the Rust `tests/` workspace member). Anchor 0.30 was abandoned: it doesn't compile against modern stable Rust because `anchor-syn` 0.30 calls `proc_macro2::Span::source_file()`, which proc-macro2 ≥ 1.0.80 dropped. Pivoted the project pin to **Anchor 1.0** + Solana 3.1.13 + Rust 1.93 stable; build is clean. `target/deploy/agent_wallet-keypair.json` is committed (gitignore exception) so the dev/devnet program ID stays stable across the team — T-114 swaps it for a Squads multisig before mainnet. Pin updates rolled into `docs/runbooks/dev-environment.md` (§1, §2, §3, §4 attestation, §5 gotcha), `docs/runbooks/team-collaboration.md` §4, `docs/architecture/overview.md`, and the T-101 task notes.

### T-302 — Phantom SIWS sign-in
- Status: done @Prithwish 2026-04-28
- Depends-on: T-203, T-301
- OS: any
- Scope: web
- Acceptance: connect → sign nonce → JWT in httpOnly cookie → redirect to dashboard. Implemented at `apps/web/`: `app/sign-in.tsx` orchestrates `useWallet().signMessage` against the SIWS message format mirrored at `lib/siws-message.ts`. Server-only proxy routes at `app/api/auth/siws/{nonce,}/route.ts` forward to backend `/v1/auth/siws/*`; the verify route strips the JWT from the JSON body and sets it as `klink_session` (httpOnly, sameSite=lax, secure in prod, 24h max-age) via `NextResponse.cookies.set`. `app/page.tsx` redirects to `/dashboard` when the cookie verifies; `/dashboard/page.tsx` is server-gated through `lib/jwt.ts → verifyKlinkJwt` and shows the signed-in pubkey + sign-out (clears cookie + `disconnect()`). Web `JWT_SECRET` must match `apps/api`. 14 tests at `apps/web/tests/{siws-proxy,jwt}.test.ts` cover proxy choreography (nonce forwarding, JWT stripping, 401 passthrough, malformed-body fallthrough) and JWT verify (good token, wrong-secret, missing claims, expiry, garbage). `bun --filter @klink/web build` clean.

### T-410 — Auto-merge claim PRs + conflict alerts
- Status: done @copilot 2026-04-28
- Depends-on: T-404
- OS: any
- Scope: infra
- Acceptance: auto-merge workflow enables auto-merge for claim/unclaim/override PRs once checks pass; Telegram notify posts `[CONFLICT]` when a PR is mergeable_state `dirty`.
### T-510 — README — Claude Code prompt cookbook + PR-review walkthrough
- Status: done @Jishnu 2026-04-28
- Depends-on: —
- OS: any
- Scope: docs
- Acceptance: `README.md` gains a "Working with Claude Code" section: 9-row prompt cookbook (claim / do / merged / complete-all / unclaim / override / fix-the-conflict / leaderboard / what's-unblocked), 4-step lifecycle, 4-step PR-review checklist, 3 one-shot question patterns, and a "when to bypass Claude" warning list (secrets, force-push, mainnet deploy).

### T-301 — Next.js dashboard scaffold
- Status: done @Manjeet 2026-04-28
- Depends-on: —
- OS: any
- Scope: scaffold
- Acceptance: `apps/web/` with Next 14 app router, Tailwind, Phantom adapter wired. App boots on `:3030` (`bun --filter @klink/web dev`); placeholder home page renders `WalletMultiButton` from `@solana/wallet-adapter-react-ui`. Phantom-only adapter via `@solana/wallet-adapter-phantom` to avoid the WalletConnect/pino-pretty transitive tail. Real flows land in T-302+.

### T-409 — Auto-resolve TODO.md merge conflicts
- Status: done @Manjeet 2026-04-28
- Depends-on: —
- OS: any
- Scope: infra
- Acceptance: `.gitattributes` declares `TODO.md merge=union` so concurrent edits to different sections auto-concatenate instead of producing conflict markers. `scripts/lint-todo.ts` (Bun) asserts (1) no duplicate `### T-XXX` headings and (2) every task block has exactly one `- Status:` line; runs in CI right after `bun install`. The CI failure on a same-task race becomes the new lock arbiter (replacing git-refuses). `docs/runbooks/team-collaboration.md` §2.3 documents the new merge mechanics. Smoke-tested: lint passes on current main (56 tasks); negative case (duplicate id + duplicate Status line) exits 1 with both errors enumerated.

### T-408 — Telegram leaderboard (per-push + daily cron)
- Status: done @Jishnu 2026-04-28
- Depends-on: T-407
- OS: any
- Scope: infra
- Acceptance: `scripts/leaderboard.ts` reads `git log` (commits/author, --since 24h, --no-merges) and `TODO.md` Done entries dated today/yesterday (UTC), normalizes author names by leading-letter run (so `@Jishnu`, `Jishnu Baruah`, `jishnu-baruah` collapse into one row), prints `[BOARD] <title>` ... `Keep working team`. `.github/workflows/telegram-notify.yml` gains a `leaderboard` job that runs on every push to main. `.github/workflows/leaderboard-daily.yml` is a cron at 03:30 UTC = 09:00 IST. Smoke-tested locally: 24 commits + 13 tasks done for @Jishnu, 2 commits for @Manjeet.

### T-505 — Pricing model decision memo
- Status: done @Jishnu 2026-04-28
- Depends-on: —
- OS: any
- Scope: design
- Acceptance: memo at [`docs/memos/2026-04-28-pricing-model.md`](docs/memos/2026-04-28-pricing-model.md). Compares flat fee / % volume / free+enterprise; recommends staged free→enterprise rollout (free during 60-day MVP, enterprise tier post-hackathon).

### T-402 — Postgres + Redis dev hosting
- Status: done @Jishnu 2026-04-28
- Depends-on: T-201
- OS: any
- Scope: infra
- Acceptance: **Neon Postgres** (region `ap-southeast-1`) wired during T-202; **Upstash Redis** (TLS) wired during T-203. Connection strings live in `apps/api/.env`. Shared between devs via `.env` file passing per @Jishnu's call (KMS migration deferred to v2 per [`secrets.md`](docs/runbooks/secrets.md) §7).

### T-401 — Choose RPC provider
- Status: done @Jishnu 2026-04-28
- Depends-on: —
- OS: any
- Scope: infra
- Acceptance: memo at [`docs/memos/2026-04-28-rpc-provider.md`](docs/memos/2026-04-28-rpc-provider.md). Compares Helius / QuickNode / Triton; recommends **Helius** for dev/staging (free tier covers MVP, Solana-focused, IST-friendly edge). Live credential will be added to shared `.env` as `SOLANA_RPC_URL` before T-205 needs it.

### T-220 — Service catalog seed
- Status: done @Jishnu 2026-04-28
- Depends-on: T-202
- OS: any
- Scope: data
- Acceptance: 4 rows (anthropic-claude / openai-chatgpt / exa-search / firecrawl) seeded via `bun run db:seed` (idempotent through `onConflictDoNothing` on `slug`). All rows enabled=false with placeholder `paymentRecipientPubkey` (system program 32×`1`); T-211 must replace pubkeys with real mpp.dev recipients before flipping `enabled=true`.

### T-209 — Off-chain policy enforcer (URL + time-of-day)
- Status: done @Jishnu 2026-04-28
- Depends-on: T-202, T-204
- OS: any
- Scope: api
- Acceptance: `apps/api/src/policy/off-chain.ts` exports `checkOffChainPolicy({ walletId, url, nowMs? })` returning `{allowed:true} | {allowed:false, reason}`. `matchUrl` enforces path-segment-only wildcards (no host wildcards). `withinTimeWindow` uses Intl.DateTimeFormat for proper timezone handling. 14 unit tests cover URL match cases + timezone edge cases (IST shift) + DOW bitmask + curated-service short-circuit.

### T-203 — SIWS auth (`/v1/auth/siws/nonce` + `/v1/auth/siws`)
- Status: done @Jishnu 2026-04-28
- Depends-on: T-201, T-202
- OS: any
- Scope: api
- Acceptance: `apps/api/src/auth/siws.ts` issues nonce via Redis `setex` (60s TTL), atomically consumes via `getdel` (single-use), verifies Ed25519 signature with `tweetnacl.sign.detached.verify`, mints HS256 JWT (24h) via `jose.SignJWT`. Replay attack test green: same payload twice → second call returns 401 "nonce unknown or already used". Wired into `apps/api/src/app.ts`. 11 tests.

### T-204 — API-key middleware + bcrypt/argon2 hashing
- Status: done @Jishnu 2026-04-28
- Depends-on: T-202
- OS: any
- Scope: api
- Acceptance: `apps/api/src/auth/api-key.ts` exposes `requireApiKey` Express middleware + `generateApiKey` + `hashApiKey`. Tokens are `klink_dev_<base64url-32B>`; first 8 chars of body are `key_prefix` for the index lookup; full token verified against argon2id hash via `Bun.password.verify` (constant-time). Augments `Express.Request` with `session` + `wallet`. 12 tests at `apps/api/tests/auth/api-key.test.ts` cover: missing/non-Bearer/wrong-prefix/short-body inputs, prefix-not-found, api-key revoked, session revoked, hash mismatch, success path populates req.session+req.wallet, updateLastUsed fires async.

### T-202 — Postgres schema migrations
- Status: done @Jishnu 2026-04-28
- Depends-on: T-201
- OS: any
- Scope: db
- Acceptance: 9 tables (users, wallets, sessions, api_keys, off_chain_policies, service_catalog, audit_log, dodo_payments, treasury_disbursements) + 2 enums (audit_decision, dodo_payment_status) created via Drizzle migration in `apps/api/drizzle/0000_*.sql`. `bun run db:migrate` applied successfully against Neon dev DB; re-run is idempotent (drizzle's `__drizzle_migrations` table tracks state).

### T-406 — Secrets-management posture (env-vars MVP)
- Status: done @Jishnu 2026-04-28
- Depends-on: —
- OS: any
- Scope: docs + infra
- Acceptance: documented plan in `docs/runbooks/secrets.md`; all dev machines using `.env.local` from the same template. (Per-dev attestation continues in `dev-environment.md`; runbook itself is committed.)

### T-404 — CI: lint + typecheck + test (Bun)
- Status: done @Jishnu 2026-04-28
- Depends-on: T-201
- OS: any (CI runs on Linux)
- Scope: ci
- Acceptance: GitHub Actions workflow `.github/workflows/ci.yml` runs `bun install --frozen-lockfile`, `bun run lint` (Biome), `bun --filter '*' typecheck`, `bun --filter '*' test` on every PR + push to main. Branch protection (PR-blocking) is a one-time repo-settings step — see PR description.

### T-208 — Session-secret encryption helper (AES-256-GCM)
- Status: done @Jishnu 2026-04-28
- Depends-on: T-201
- OS: any
- Scope: crypto
- Acceptance: encrypt/decrypt round-trips; master key from env; test for wrong-key failure; documented rotation procedure (`docs/runbooks/secrets.md` §4). Implementation at `apps/api/src/crypto/session-secret.ts`, 8 tests at `apps/api/tests/crypto/session-secret.test.ts` (all passing).

### T-201 — Scaffold Express + TS + Drizzle (Bun)
- Status: done @Jishnu 2026-04-28
- Depends-on: —
- OS: any
- Scope: scaffold
- Acceptance: `apps/api/` with TS strict, Express, Drizzle, dotenv, `bun test` configured. `bun run dev` boots `:3000/health` returns 200. Bun workspace at repo root (`bunfig.toml` + `package.json` workspaces field).

### T-502 — Architecture overview doc
- Status: done @Jishnu 2026-04-28
- Depends-on: —
- OS: any
- Scope: docs
- Acceptance: `docs/architecture/overview.md` with the §1 diagram extracted from the design spec; updated on every architectural change.

---

## Blocked

_(empty)_
