---
title: Handover note — May 2026
purpose: Operational state + non-obvious gotchas not captured in the design specs or task acceptance lines. Read this before bisecting bugs in the dashboard / api / deploy chain.
last_updated: 2026-05-02
---

# Handover note

This is the operational handover, not architecture. For architecture read [`docs/architecture/overview.md`](docs/architecture/overview.md) and [`docs/specs/2026-04-28-agent-wallet-design.md`](docs/specs/2026-04-28-agent-wallet-design.md). For the task board read [`TODO.md`](TODO.md).

This doc covers:
1. Current shipped state of every track
2. Local dev environment — what's running where, secrets that must match across processes, every footgun discovered while bringing the dashboard up against the live backend
3. The `/api/v1` proxy pattern (non-obvious; you will hit it the moment you add a dashboard read)
4. The `alreadyExists` self-heal pattern (recent change, easy to misread)
5. Active blockers + what each one unblocks
6. Common debug commands

---

## 1. Shipped state by track

### Anchor program (T-1xx)
- **All 8 instructions live on Solana devnet.** Program ID `5qCJCEhfLusk59YFqaEG9Yg3Wp64ZaYwvXteFmCmedqv`, deployed `2026-05-02` from build commit `8e9eb05`. Full provenance in [`docs/runbooks/devnet-deploys.md`](docs/runbooks/devnet-deploys.md).
- **Deploy authority is a single keypair** (`6fELFcucWR7CPrBrRmfAs8tNjvt5dUnQDk3cguAtdrjZ`, held by @Pritwish). **Must rotate to a 2-of-N Squads multisig before any mainnet traffic** — that's T-114 (still pending).
- **Kamino devnet reserve env not wired.** `KAMINO_RESERVE` etc. in `apps/api/.env` are still empty, so `kamino_deposit` and `kamino_withdraw` will revert with `WrongKaminoProgram`. The other 6 instructions (init_vault, set_max_deployed_fraction, add_session, update_session_allowlist, revoke_session, transfer_usdc) all work end-to-end from the dashboard.
- **No integration tests run before deploy.** T-112 (anchor-test on local validator) was skipped because of time. The smoke is the dashboard's signed-by-Phantom roundtrip. Add proper coverage as a follow-up.
- T-110 (TDD revert suite) is in-progress on @Manish. T-111 (fuzz) still blocked on T-110.

### Backend api (T-2xx)
Every `/v1/*` endpoint per [`docs/architecture/api-surface.md`](docs/architecture/api-surface.md) is implemented and merged. That includes the six dashboard-gap tasks @Jishnu shipped on `2026-05-02`:

| Endpoint | Task |
|---|---|
| `GET /v1/wallet` | T-224 |
| `GET /v1/sessions` | T-218 |
| `GET /v1/sessions/:id` | T-219 |
| `POST /v1/wallet/policy` | T-221 |
| `POST /v1/wallet/yield/{deposit,withdraw}` (owner-flow) | T-222 |
| `PATCH /v1/wallet/off-chain-policy` | T-223 |

Note the **owner-flow yield endpoints live at `/v1/wallet/yield/*`**, NOT `/v1/yield/*`. The agent-key paths under `/v1/yield/*` are separate (T-213). Different auth surface — keep them distinct.

### Web dashboard (T-3xx)
T-303 → T-308 all done in `574cb80` and earlier. Six pages + nested allowlist editor, all wired against the real api. Pages and their backing tasks documented in [`apps/web/README.md`](apps/web/README.md). 

### SDK (T-309)
Done by @Manjeet — see `packages/sdk/`.

### In-flight
- T-110 (TDD revert suite) — @Manish
- T-407 (Telegram bot) — @Jishnu
- T-114 (multisig authority) — unclaimed; mainnet blocker

---

## 2. Local dev environment

### Two services. Get both running before touching the dashboard.

| Service | Path | Default port | Start with |
|---|---|---|---|
| Backend api | `apps/api` | `:3000` | `cd apps/api && bun run dev` |
| Web dashboard | `apps/web` | `:3030` | `cd apps/web && bun run dev` |

### .env files (gitignored — set them yourself)

**`apps/api/.env`** must include:
```
PORT=3000
DATABASE_URL=postgresql://...                  # Postgres (see "DB rotation" below)
REDIS_URL=rediss://... or redis://localhost:6379
SESSION_SECRET_MASTER_KEY=<32 bytes hex>       # openssl rand -hex 32
JWT_SECRET=<32 bytes hex>                      # openssl rand -hex 32 — MUST match web's
KLINK_PROGRAM_ID=5qCJCEhfLusk59YFqaEG9Yg3Wp64ZaYwvXteFmCmedqv
USDC_MINT=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU       # devnet
SOLANA_RPC_URL=https://api.devnet.solana.com
TREASURY_SECRET_KEY=<base58 of 64-byte secret> # for T-215 Dodo disbursement
TREASURY_USDC_ATA=<the treasury wallet's USDC ATA>
```

**`apps/web/.env.local`** must include:
```
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_KLINK_PROGRAM_ID=5qCJCEhfLusk59YFqaEG9Yg3Wp64ZaYwvXteFmCmedqv
NEXT_PUBLIC_USDC_MINT=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000   # actually unused in browser — see "/api/v1 proxy" below
NEXT_PUBLIC_DEVTOOLS=0
JWT_SECRET=<SAME hex as apps/api/.env>           # used by the dashboard layout to verify cookie
KLINK_API_URL=http://localhost:3000              # server-side proxy target
```

### The two `JWT_SECRET`s MUST match

The api mints the JWT at `/v1/auth/siws` with its `JWT_SECRET`. The web's dashboard layout (`app/dashboard/layout.tsx`) verifies the same JWT from the cookie using its own `JWT_SECRET`. If they differ, **every dashboard route silently redirects you to `/`**, which looks identical to "not signed in" in the UI. Always sanity check both files when sign-in seems to work but the dashboard never loads.

### The Neon DB endpoint rotates

We're on free-tier Neon. Endpoints get new hostnames when the project is paused/recreated. If you see:

```
DNSException: getaddrinfo EREFUSED
```

in the api log, the `DATABASE_URL` hostname doesn't resolve. Two paths:

**A. New Neon endpoint.** Get the fresh `postgresql://...@ep-<NEW>...neon.tech/...` from the project owner, paste into `apps/api/.env`, run `bun run db:migrate`. Done.

**B. Local Postgres in Docker** (works offline, no team coordination):
```bash
docker run -d --name klink-pg \
  -e POSTGRES_USER=klink -e POSTGRES_PASSWORD=klink -e POSTGRES_DB=klink_dev \
  -p 5432:5432 postgres:16-alpine
# In apps/api/.env:
#   DATABASE_URL=postgresql://klink:klink@localhost:5432/klink_dev
cd apps/api && bun run db:migrate
```

Either way, **migrations must run** — Drizzle ships them in `apps/api/drizzle/`. Schema is in `apps/api/src/db/schema.ts`.

### Redis can be Upstash or local

Either works. Local: `apt install redis-server && systemctl start redis-server` → `REDIS_URL=redis://localhost:6379`. Upstash: free-tier connection string from console; `rediss://` (TLS) form works.

### Devnet SOL faucet rate limits

The public devnet faucet (`api.devnet.solana.com`) gets aggressively rate-limited per IP. If `solana airdrop ... -u devnet` returns:

```
Error: airdrop request failed. This can happen when the rate limit is reached.
```

Fall back to:
- https://faucet.solana.com/ (GitHub auth, web UI)
- https://solfaucet.com/
- Phantom's built-in devnet faucet (Settings → Developer → Devnet → Get test SOL)

### Treasury keypair

A treasury hot wallet was generated for T-215 (Dodo fiat-in disbursement) on `2026-05-02`:

```
Pubkey:   9muAwR8a4LEgFGLNPfoUHhJrfLmtkXFBvpBQCx2GLVTU
USDC ATA: DBRYhuJUmEzcqpS2WabaHKxwCJBz5QSvuSMoys66vQVB
```

Secret is in `apps/api/.env` (gitignored). **Needs funding** with devnet SOL (for tx fees) and devnet USDC. The ATA is created lazily on first USDC transfer. **Rotate before mainnet** — the secret was generated programmatically; treat as compromised before any production use.

---

## 3. The `/api/v1` proxy pattern (apps/web/app/api/v1/[...path]/route.ts)

**Read this before adding a dashboard fetch.** Otherwise you'll fight CORS for an hour.

The backend api:
1. Doesn't ship CORS headers
2. Reads JWT from `Authorization: Bearer <token>`, NOT from a cookie

The web app:
1. Stores the JWT in an httpOnly `klink_session` cookie (so client JS can't touch it — XSS protection)
2. Runs on a different origin (`:3030`) from the api (`:3000`)

If the dashboard fetched the api directly from the browser, it would fail twice: cross-origin (no CORS) and missing auth header (cookie isn't reachable). Both are fixed by a same-origin Next.js catch-all proxy:

```
apps/web/app/api/v1/[...path]/route.ts
```

It receives `/api/v1/<anything>` (same-origin from the dashboard), reads the cookie server-side, and forwards to `${KLINK_API_URL}/v1/<anything>` with the cookie's JWT as a Bearer header. Streams the response back.

### Implications
- **Every dashboard SWR/fetch must use a path starting with `/v1/...`**, never an absolute URL. `lib/api-client.ts` rewrites these to `/api/v1/...`. If you add a hook that fetches direct, it will hit CORS.
- **Adding a new backend endpoint requires no proxy change** — the catch-all forwards every method/path.
- **Don't add CORS to the api.** It's intentionally not there. The proxy is the only way the dashboard talks to it from the browser.

### SIWS auth flow uses a different proxy

`/api/auth/siws/{nonce,siws,me,logout}` are dedicated route handlers in `apps/web/app/api/auth/`. They proxy via `lib/siws-proxy.ts`. The catch-all `/api/v1/*` doesn't touch the SIWS handshake.

---

## 4. The `alreadyExists` self-heal pattern (commit 574cb80)

`POST /v1/wallet` used to always build a fresh `init_vault` tx and hand it to Phantom. If the vault PDA was already on-chain (e.g., DB row got dropped after a local Postgres reset), the tx would revert with `account already in use` and the dashboard wedged.

**New behavior:** the handler reads `Connection.getAccountInfo(vaultPda)` first.
- **Hit**: backfill the `wallets` row keyed by `vaultPda`, return `{ alreadyExists: true, vaultPda, vaultUsdcAta }` with **no `txBase64`**. The dashboard treats it as a no-op success and revalidates the wallet query.
- **Miss**: build the init_vault tx as before, return `{ txBase64, vaultPda, vaultUsdcAta }`.

### Schema implication
`buildTxResponseSchema` (`apps/web/lib/schemas.ts`) gained an optional `alreadyExists: boolean` and a `refine()` requiring either `txBase64` or `alreadyExists === true`. If you add a new build-tx-then-sign endpoint that ALWAYS returns `txBase64` (no self-heal branch), it still passes — `alreadyExists` is optional.

### Hook implication
`useBuildAndSignTx` short-circuits Phantom + RPC submit when `alreadyExists` is true and returns the synthetic signature `"already_existed"` so callers can distinguish recovery from fresh confirms in their toast UX. See `apps/web/_hooks/use-build-and-sign-tx.ts`.

---

## 5. Active blockers (read before claiming)

| Block | Blocker | Owner | Notes |
|---|---|---|---|
| Mainnet deploy | **T-114** — multisig upgrade authority | unclaimed | Currently single-keypair authority. Use Squads v4 2-of-N. |
| Devnet Kamino flows | **T-213 env wiring** — populate `KAMINO_RESERVE`, `KAMINO_LENDING_MARKET`, etc. | unclaimed | Pick a Kamino devnet USDC reserve, paste the addresses. Without these, kamino_deposit/withdraw revert. |
| End-to-end demo | T-113 done ✓; T-112 integration tests skipped | unclaimed | Add anchor-test coverage before mainnet — was skipped for the devnet deploy. |
| External review | **T-115** | unclaimed | Depends on T-114, T-110, T-111, T-112. |
| Reference integrations for demo | **T-504** | unclaimed | Pick 3 — see `docs/memos/`. |

---

## 6. Common debug commands

```bash
# What's listening on the dev ports?
ss -tlnp | grep -E ":3000|:3030"

# Kill stale Next dev servers (very common — Next doesn't always exit cleanly)
pkill -9 -f "next-server"
pkill -9 -f "next dev"

# Restart the api
cd apps/api && bun run dev > /tmp/klink-api.log 2>&1 &
tail -f /tmp/klink-api.log

# Restart the web (must be detached or it dies with the shell)
cd apps/web && (bun run dev > /tmp/klink-web.log 2>&1 < /dev/null &)

# Smoke the SIWS chain end-to-end without Phantom (uses a generated keypair)
# See the smoke test pattern in apps/web/tests/e2e.puppeteer.ts.

# Check program is on devnet
solana program show 5qCJCEhfLusk59YFqaEG9Yg3Wp64ZaYwvXteFmCmedqv -u devnet

# Check a wallet's devnet SOL balance
solana balance <PUBKEY> -u devnet

# Run the dashboard puppeteer e2e (mocks the api on :3001 — does NOT need a real backend)
cd apps/web
JWT_SECRET=puppeteer-test-secret-not-for-prod-use bun run e2e
# Screenshots land in apps/web/tests/_screenshots/ (gitignored)

# TODO.md lint (run before any commit that touches TODO)
bun scripts/lint-todo.ts
```

### Two recurring footguns
1. **Cargo.lock drift on every `anchor build`.** Build mutates `Cargo.lock` even when no source changed. Run `git restore Cargo.lock` before staging anything.
2. **Next.js inlines `NEXT_PUBLIC_*` only via literal `process.env.NAME` access.** `process.env[k]` (dynamic key) silently returns undefined on the client. If you add a new public env var, write the literal access form. See `apps/web/lib/constants.ts` for the canonical pattern.

---

## 7. Where to find what

| Need | Source |
|---|---|
| Architecture overview | [`docs/architecture/overview.md`](docs/architecture/overview.md) |
| Full design spec (account layouts, validator logic, endpoint shapes) | [`docs/specs/2026-04-28-agent-wallet-design.md`](docs/specs/2026-04-28-agent-wallet-design.md) |
| Web UI design + decisions | [`docs/superpowers/specs/2026-05-02-klink-web-ui-design.md`](docs/superpowers/specs/2026-05-02-klink-web-ui-design.md) |
| Web UI implementation plan (24 atomic tasks, useful as a reference for similar features) | [`docs/superpowers/plans/2026-05-02-klink-web-ui.md`](docs/superpowers/plans/2026-05-02-klink-web-ui.md) |
| API surface + auth model | [`docs/architecture/api-surface.md`](docs/architecture/api-surface.md) |
| Devnet deploy log | [`docs/runbooks/devnet-deploys.md`](docs/runbooks/devnet-deploys.md) |
| Per-OS dev environment setup | [`docs/runbooks/dev-environment.md`](docs/runbooks/dev-environment.md) |
| Team collaboration protocol (claims, PR flow, conflict handling) | [`docs/runbooks/team-collaboration.md`](docs/runbooks/team-collaboration.md) |
| Pricing memo | [`docs/memos/2026-04-28-pricing-model.md`](docs/memos/2026-04-28-pricing-model.md) |
| Task board | [`TODO.md`](TODO.md) |
| Web app developer guide | [`apps/web/README.md`](apps/web/README.md) |

---

## 8. Recent significant commits (latest first)

```
574cb80  feat(wallet): self-heal init_vault + http debug logging
60a1152  T-309 + T-403: SDK package + Render deploy setup
e6fe169  fix(web): stop SWR retry storm on 4xx
eb29d0e  T-113: deploy agent_wallet to devnet
8e9eb05  feat(web): same-origin /api/v1 proxy for dashboard fetches
bb6ee73  feat(web): integrate dashboard with shipped backend (T-218..T-224)
94f7dc8  T-303 + T-304 + T-305 + T-306 + T-307 + T-308: web ui — full dashboard
```

All on `origin/main`. Branch is currently linear (no long-lived feature branches as of this writing).

---

## 9. Notes for whoever takes this next

- **The dashboard is fully clickable end-to-end** with a freshly funded Phantom on devnet. Sign in → Create wallet → Sessions create → Allowlist edit → Yield → Fund → Audit → Settings. All of it submits real txs to the deployed program.
- **The treasury wallet has zero funds.** First Dodo webhook will succeed in DB upsert but fail at the SPL transfer step. Fund with devnet USDC before testing T-215 end-to-end.
- **Single-deploy-authority risk.** The Anchor program upgrade authority is one keypair held by one person. T-114 must land before mainnet — there's no recovery if that key is lost or compromised.
- **Off-chain time-window enforcement** uses the api server's clock — there's a 60s grace per the design spec. If you see denied spends near time-window boundaries, that's expected.
- **`NEXT_PUBLIC_DEVTOOLS=1`** unlocks `/dashboard/_devtools` for paste-an-API-key agent-side testing. Off by default. Keep it off in any deployed env.
