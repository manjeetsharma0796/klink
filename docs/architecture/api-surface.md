---
title: API surface review (internal vs exposed)
purpose: Manual review pass over every `/v1/*` route — propose visibility classification, document auth model, capture sign-off before mainnet exposure
last_updated: 2026-04-30
status: draft — awaiting reviewer attestation
related: [T-508]
---

# API surface review

This doc enumerates every HTTP route mounted by `apps/api/src/app.ts`, classifies its proposed external visibility, and pins the auth mechanism. It exists so that before the API gets a public DNS name we have a single place to ask: *"Should the internet be able to talk to this?"*

> **Use as input to T-403 (deploy target) + T-407 (Telegram).** When the production gateway is configured, every row marked **internal** must be unreachable from outside the VPC; rows marked **agent-only** / **dashboard-only** must enforce their respective auth at the gateway in addition to the application-layer middleware.

## Visibility legend

| Tag | Meaning |
|---|---|
| `public` | Reachable without auth from anywhere on the internet. Used only for liveness + the SIWS handshake (which carries its own crypto auth). |
| `dashboard-only` | Caller must hold a valid SIWS JWT (T-203). Intended for the human owner via the Next.js dashboard. |
| `agent-only` | Caller must hold a valid argon2id-hashed API key (T-204). Intended for AI agents. |
| `webhook` | Public endpoint authenticated by a per-provider signature (HMAC). Whitelist provider IPs at the gateway when feasible. |
| `internal` | Should never be exposed to the public internet — only reachable by other backend services (worker, ops scripts). Currently no routes have this classification; reserved for future jobs. |

## Auth model legend

| Tag | Layer |
|---|---|
| `none` | No auth — open. |
| `siws-jwt` | `Authorization: Bearer <jwt>`, verified by `requireDashboardJwt` (`apps/api/src/auth/jwt.ts`). |
| `api-key` | `Authorization: Bearer <api_key>`, verified by `requireApiKey` (`apps/api/src/auth/api-key.ts`). |
| `hmac-sig` | Per-call HMAC-SHA256 over the raw request body, verified at the handler. |
| `signed-message` | Caller submits a Phantom-signed message (SIWS) — verified at the handler, no token needed. |

## Routes

| Method | Path | Task | Visibility (proposed) | Auth | One-liner |
|---|---|---|---|---|---|
| `GET` | `/health` | — | `public` | `none` | Liveness probe. Returns `{ ok: true }`. Safe to expose. |
| `POST` | `/v1/auth/siws/nonce` | T-203 | `public` | `none` | Mint a single-use nonce for the SIWS handshake. Stored in Redis with 60 s TTL. |
| `POST` | `/v1/auth/siws` | T-203 | `public` | `signed-message` | Verify Phantom signature over `Sign in to klink: <nonce>`, mint dashboard JWT. |
| `POST` | `/v1/wallet` | T-205 | `dashboard-only` | `siws-jwt` | Build unsigned `init_vault` tx for the owner's Phantom to sign + submit. |
| `POST` | `/v1/session` | T-206 | `dashboard-only` | `siws-jwt` | Generate a session keypair + build `add_session` tx; mint API key on confirmation. |
| `DELETE` | `/v1/session/:id` | T-207 | `dashboard-only` | `siws-jwt` | Build `revoke_session` tx; soft-delete API key. |
| `PATCH` | `/v1/session/:id/allowlist` | T-207 | `dashboard-only` | `siws-jwt` | Build `update_session_allowlist` tx (recipients/URLs/time window). |
| `POST` | `/v1/spend/transfer` | T-210 | `agent-only` | `api-key` | Direct USDC transfer signed by the session keypair. On-chain caps + recipient allowlist enforced. |
| `POST` | `/v1/spend/sign-payment` | T-212 | `agent-only` | `api-key` | x402 sign-only relay: backend signs, agent retries the original call with `X-Payment-Proof`. |
| `POST` | `/v1/spend/service` | T-211 | `agent-only` | `api-key` | Curated mpp.dev proxy: backend probes 402, signs, retries, forwards response. |
| `POST` | `/v1/yield/deposit` | T-213 | `agent-only` | `api-key` | `kamino_deposit` CPI from the vault. Subject to `max_deployed_fraction_bp`. |
| `POST` | `/v1/yield/withdraw` | T-213 | `agent-only` | `api-key` | `kamino_withdraw` CPI back into the vault USDC ATA. |
| `GET` | `/v1/yield/position` | T-213 | `agent-only` | `api-key` | Read `deployed_amount` from the on-chain vault account. |
| `GET` | `/v1/audit` | T-216 | `dashboard-only` | `siws-jwt` | Cursor-paginated audit log filtered to the caller's wallets. |
| `GET` | `/v1/fund/deposit-address` | T-217 | `dashboard-only` | `siws-jwt` | Vault USDC ATA + QR data-url for off-platform deposits. |
| `POST` | `/v1/fund/dodo-checkout` | T-214 | `dashboard-only` | `siws-jwt` | Create Dodo Payments checkout session, INSERT `dodo_payments(pending)`. |
| `POST` | `/v1/webhooks/dodo` | T-215 | `webhook` | `hmac-sig` | Dodo payment confirmation. Triggers treasury → vault USDC disbursement. Idempotent on `dodo_session_id`. |

## Cross-checks

- **Every `agent-only` row is rate-limit-eligible.** None of these are wired through a rate limiter yet; reviewer should flag that as a follow-up before mainnet.
- **Every `dashboard-only` row trusts `req.user.id`.** Any new route added to this section must verify ownership of the wallet/session it's acting on (cf. `dodo.ts:140` checking `wallet.userId !== userId`).
- **Webhooks must use `req.rawBody`.** `apps/api/src/app.ts` enables `express.json({ verify })` so the raw bytes are preserved; HMAC verifiers must consume that, not the re-stringified `req.body`.
- **No `internal` routes exist today.** Anything that needs to run on a schedule (e.g. a future treasury reconciler) should ship as a separate worker process, not an HTTP endpoint, to keep this surface small.

## Reviewer attestation

| Reviewer | Date | Visibility column accepted? | Auth column accepted? | Notes |
|---|---|---|---|---|
| _(unfilled)_ | — | — | — | _Reviewer signs here once each row is confirmed or flagged for change. Flagged rows must reference a follow-up task ID._ |

## Follow-ups (track separately if accepted)

- Wire a per-API-key rate limiter on every `agent-only` route (creates incident-grade cost protection separately from on-chain caps).
- Add an IP allowlist gateway rule for `/v1/webhooks/dodo` once Dodo publishes its egress IPs.
- Extract the SIWS `Authorization: Bearer` parsing into a shared helper if a third middleware ever needs it (currently only `requireDashboardJwt` and `requireApiKey` do).
