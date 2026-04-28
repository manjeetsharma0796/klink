---
title: Team task board
purpose: Shared async task tracker for the 4-person team across Windows/macOS/Linux — humans and their Claude agents
last_updated: 2026-04-28
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

> **Team channel:** _(TBD — paste link here, e.g. Discord/Slack/Telegram. This is the place referenced by `team-collaboration.md` §6 and §8.)_

| Handle | OS | Strengths / preferred area | Timezone |
|---|---|---|---|
| `@Jishnu` | Windows | Server side/integration/maintainance/system/debugging | IST |
| `@Manjeet` | Windows | Server side/integration/maintainance/system/debugging | IST |
| `@Pritwish` | macOS | TBD | IST |
| `@Mouli` | TBD | TBD | IST |

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
- Notes: pin Solana `1.18.x` and Anchor `0.30.x`. Per-OS commands in the runbook. All four devs can claim this concurrently — each commits a row to `dev-environment.md` confirming their setup.

### T-102 — Initialize Anchor workspace
- Status: pending
- Depends-on: T-101
- OS: any
- Scope: scaffold
- Acceptance: `programs/agent_wallet/` exists with stub `lib.rs`; `anchor build` succeeds locally; CI green via T-405.

### T-103 — `Vault` account + `init_vault` instruction
- Status: pending
- Depends-on: T-102
- OS: any
- Scope: anchor-program
- Acceptance: matches design spec §2.2.1 (`owner`, `max_deployed_fraction_bp`, `deployed_amount`, `bump`). PDA seeds `["vault", owner.key()]`. Reverts on duplicate init. Unit-tested in T-110.

### T-104 — `Session` account + `add_session` instruction
- Status: pending
- Depends-on: T-103
- OS: any
- Scope: anchor-program
- Acceptance: matches §2.2.2 (fixed-10 recipients, `allowed_instructions` bitmap, expiry, daily window). PDA seeds `["session", vault, session_pubkey]`. Owner-only.

### T-105 — `transfer_usdc` instruction with all reverts
- Status: pending
- Depends-on: T-104
- OS: any
- Scope: anchor-program
- Acceptance: implements all 5 revert conditions from §2.5 (recipient allowlist, max_per_tx, daily cap with rolling-24h reset, expiry, instruction-bit). Each revert covered by its own test in T-110.

### T-106 — `revoke_session` + `update_session_allowlist`
- Status: pending
- Depends-on: T-104
- OS: any
- Scope: anchor-program
- Acceptance: revoke closes session account and refunds rent to owner. Update supports `Add | Remove | Set` actions. Owner-only.

### T-107 — `set_max_deployed_fraction`
- Status: pending
- Depends-on: T-103
- OS: any
- Scope: anchor-program
- Acceptance: owner-only; bounded 0–10000 bp.

### T-108 — `kamino_deposit` CPI
- Status: pending
- Depends-on: T-103, T-104
- OS: any
- Scope: anchor-program
- Acceptance: hardcodes Kamino program ID. Pre-flight `(deployed + amount) * 10000 / total ≤ max_deployed_fraction_bp`. Updates `vault.deployed_amount`. Signer = session OR owner.

### T-109 — `kamino_withdraw` CPI
- Status: pending
- Depends-on: T-108
- OS: any
- Scope: anchor-program
- Acceptance: pre-flight `amount ≤ vault.deployed_amount`. Decrements `deployed_amount`. Returns Kamino's actual withdrawn amount (may be partial under utilization stress).

### T-110 — TDD revert suite (spec §6.1.1)
- Status: pending
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

### T-113 — Devnet deployment + smoke test
- Status: pending
- Depends-on: T-112
- OS: any
- Scope: deploy
- Acceptance: program deployed to devnet; smoke script runs end-to-end against real Kamino devnet reserve; tx signatures logged in `docs/runbooks/devnet-deploys.md`.

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

---

## 2 — Backend

(All OS-agnostic. Anyone can pick.)

### T-205 — `POST /v1/wallet` build init_vault tx
- Status: pending
- Depends-on: T-103, T-203
- OS: any
- Scope: api
- Acceptance: returns base64 unsigned tx for Phantom to sign + submit; includes vault PDA + USDC ATA creation.

### T-206 — `POST /v1/session` (build add_session + mint API key)
- Status: pending
- Depends-on: T-104, T-204, T-208
- OS: any
- Scope: api
- Acceptance: generates session keypair (AES-256-GCM stored), builds add_session tx for owner Phantom, returns API key once with `klink_dev_` prefix.

### T-207 — `DELETE /v1/session/:id` + `PATCH /v1/session/:id/allowlist`
- Status: pending
- Depends-on: T-206
- OS: any
- Scope: api
- Acceptance: builds revoke_session / update_session_allowlist tx for owner.

### T-210 — `POST /v1/spend/transfer`
- Status: pending
- Depends-on: T-105, T-206, T-208, T-209
- OS: any
- Scope: api
- Acceptance: full preamble; sign + submit with session keypair; returns `tx_signature`; audit log writes both allow and deny.

### T-211 — `POST /v1/spend/service` (mpp.dev curated proxy)
- Status: pending
- Depends-on: T-210, T-220
- OS: any
- Scope: api
- Acceptance: full §4.2.2 flow; pre-flight against `allowed_recipients`; quoted-amount check; X-Payment-Proof retry.

### T-212 — `POST /v1/spend/sign-payment` (custom x402 sign-only)
- Status: pending
- Depends-on: T-210
- OS: any
- Scope: api
- Acceptance: §4.2.3 flow; URL allowlist enforced; agent owns transport.

### T-213 — `POST /v1/yield/{deposit,withdraw}` + `GET /v1/yield/position`
- Status: pending
- Depends-on: T-108, T-109, T-204
- OS: any
- Scope: api
- Acceptance: §4.3 flow; on-chain pre-flight; reads accrued via klend-sdk; partial-liquidity → 409.

### T-214 — `POST /v1/fund/dodo-checkout`
- Status: pending
- Depends-on: T-202
- OS: any
- Scope: api
- Acceptance: creates Dodo session; INSERT `dodo_payments(pending)`; returns `checkout_url`.

### T-215 — `POST /v1/webhooks/dodo` + treasury-disburser worker
- Status: pending
- Depends-on: T-214
- OS: any
- Scope: api + worker
- Acceptance: HMAC verify; idempotent on `dodo_session_id`; worker submits treasury → vault USDC transfer; replay-attack test.

### T-216 — `GET /v1/audit` paginated
- Status: pending
- Depends-on: T-209, T-210
- OS: any
- Scope: api
- Acceptance: cursor pagination; filter by decision (allow/deny); ordered by `created_at desc`.

### T-217 — `GET /v1/fund/deposit-address`
- Status: pending
- Depends-on: T-205
- OS: any
- Scope: api
- Acceptance: returns vault USDC ATA + QR data-url.

---

## 3 — Dashboard + SDK

### T-302 — Phantom SIWS sign-in
- Status: pending
- Depends-on: T-203, T-301
- OS: any
- Scope: web
- Acceptance: connect → sign nonce → JWT in httpOnly cookie → redirect to dashboard.

### T-303 — Wallet creation flow
- Status: pending
- Depends-on: T-205, T-302
- OS: any
- Scope: web
- Acceptance: "Create wallet" → fetch build-tx → Phantom signs → submit → dashboard shows zero balance.

### T-304 — Session list + create + revoke
- Status: pending
- Depends-on: T-206, T-207, T-303
- OS: any
- Scope: web

### T-305 — Allowlist editor (recipients + URLs + time window)
- Status: pending
- Depends-on: T-207, T-209, T-304
- OS: any
- Scope: web

### T-306 — Audit log viewer
- Status: pending
- Depends-on: T-216, T-303
- OS: any
- Scope: web
- Acceptance: filter allow/deny; show denial reasons.

### T-307 — Yield UI
- Status: pending
- Depends-on: T-213, T-303
- OS: any
- Scope: web

### T-308 — Dodo fund flow UI
- Status: pending
- Depends-on: T-214, T-303
- OS: any
- Scope: web

### T-309 — TypeScript SDK package (`@klink/sdk`)
- Status: pending
- Depends-on: T-210, T-211, T-212, T-213
- OS: any
- Scope: sdk
- Acceptance: typed client for all `/v1/spend/*` and `/v1/yield/*` endpoints; published to local Bun workspace.

### T-310 — SDK quickstart README
- Status: pending
- Depends-on: T-309
- OS: any
- Scope: docs

---

## 4 — Infrastructure / DevOps

### T-403 — Backend deploy target
- Status: pending
- Depends-on: T-201
- OS: any
- Scope: infra
- Acceptance: pick Fly.io / Railway / Render; staging env deploys on push to `main`.

### T-405 — CI: anchor build + test
- Status: pending
- Depends-on: T-102
- OS: any
- Scope: ci
- Acceptance: `anchor build` + `anchor test` on PR; cached toolchain.

### T-407 — Wire up Telegram bot + verify notifications
- Status: pending
- Depends-on: —
- OS: any
- Scope: infra
- Acceptance: bot created via `@BotFather`; `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` secrets set in GitHub repo; smoke test passes (dummy `claim: T-999` PR triggers `[CLAIM]` message, merge triggers `[LOCK]`); attestation row added to `docs/runbooks/telegram-notifications.md` §3; team channel link in `TODO.md` Team section updated to the Telegram group invite.
- Notes: workflow YAML and runbook are already in the repo — only live bot wiring + secrets remain. This is the "team channel" referenced in `team-collaboration.md` §6 and §8.

---

## 5 — Docs + design

### T-501 — Per-OS dev-environment runbook
- Status: pending
- Depends-on: —
- OS: any (content covers all three)
- Scope: docs
- Acceptance: `docs/runbooks/dev-environment.md` with install commands for Solana CLI, Anchor, Rust, Node, pnpm, Postgres, Redis on Windows (incl. WSL2 note), macOS (Homebrew), Linux (apt/dnf). One row per dev attesting their box is configured.

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

---

## Done

_(newest first)_

### T-301 — Next.js dashboard scaffold
- Status: done @Manjeet 2026-04-28
- Depends-on: —
- OS: any
- Scope: scaffold
- Acceptance: `apps/web/` with Next 14 app router, Tailwind, Phantom adapter wired. App boots on `:3030` (`bun --filter @klink/web dev`); placeholder home page renders `WalletMultiButton` from `@solana/wallet-adapter-react-ui`. Phantom-only adapter via `@solana/wallet-adapter-phantom` to avoid the WalletConnect/pino-pretty transitive tail. Real flows land in T-302+.

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
