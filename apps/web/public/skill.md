---
name: klink
description: Pay for services on Solana with policy-bounded session keys. Use when an AI agent needs to spend USDC autonomously without holding the user's master key.
purpose: Self-onboarding reference for AI agents holding a klink API key. Curl examples, exact error codes, recovery patterns. Mirrors the pay-with-locus skill format so existing agent tooling drops in.
last_updated: 2026-05-02
---

# klink agent skill

You are an AI agent. The human owner has handed you an API key prefixed `klink_dev_…` (devnet) or `klink_prod_…` (mainnet, when shipped). You can spend USDC + interact with Solana DeFi within bounds the human pre-set on chain. You **cannot** hold the human's master keypair — you only ever see this bearer token.

## What you can and cannot do

| Can | Cannot |
|---|---|
| Send USDC to recipients pre-approved by the human | Send USDC to anyone outside the on-chain `allowed_recipients` allowlist |
| Pay x402 / Solana Pay services within the per-tx + daily caps | Move funds out of the vault to an arbitrary wallet |
| Deposit / withdraw to Kamino USDC reserve (if your session has the bit) | Change your own caps or allowlist (human-only) |
| Read your spend history via `/v1/audit` | Sign anything other than the txs the backend builds for you |
| Read your on-chain position via `/v1/yield/position` | Bypass the time-of-day window the human configured |

The on-chain Anchor program at `5qCJCEhfLusk59YFqaEG9Yg3Wp64ZaYwvXteFmCmedqv` (devnet) enforces every limit. The HTTP layer fast-fails some checks (auth, liquidity, time window) before signing — a 4xx response means you don't waste an on-chain tx.

## Auth

Every protected request needs:

```
Authorization: Bearer klink_dev_<your-token>
```

**Sanity check** (zero side effects):

```bash
curl -s -H "Authorization: Bearer $KLINK_API_KEY" \
  https://api.klink.dev/v1/yield/position
# → {"deployed":"0","accrued":null,"total_balance":"0"}
```

If this returns 200 you're set. If it returns 401, see "Recovery patterns" below.

## Capabilities

Base URL: `https://api.klink.dev` (or `http://localhost:3000` in dev).

All amounts are **USDC base units** — 6 decimals, so `1_000_000` = 1 USDC. JSON numbers above 2^53 come back as decimal strings; parse with care.

### `GET /v1/yield/position`

Read your on-chain vault state. Free. Use this on every cold start to verify auth + sanity-check balances.

```bash
curl -s -H "Authorization: Bearer $KLINK_API_KEY" \
  https://api.klink.dev/v1/yield/position
```

```json
{ "deployed": "0", "accrued": null, "total_balance": "0" }
```

`deployed` = USDC currently lent to Kamino. `accrued` is `null` until the Kamino exchange-rate read is wired (deferred). `total_balance` ≈ `deployed` for now.

### `POST /v1/spend/transfer` — direct USDC transfer

Use when you have a known recipient and just need to move USDC. Recipient must already be in the session's on-chain `allowed_recipients`; otherwise the on-chain program rejects.

```bash
curl -s -X POST -H "Authorization: Bearer $KLINK_API_KEY" \
  -H "content-type: application/json" \
  -d '{"recipient":"<base58-pubkey>","amount":500000}' \
  https://api.klink.dev/v1/spend/transfer
```

```json
{ "tx_signature": "5K3...", "status": "confirmed" }
```

The recipient's USDC ATA must already exist on chain. If it doesn't, prepend an idempotent ATA-create yourself before calling — klink does not auto-create recipient ATAs.

### `POST /v1/spend/sign-payment` — x402 sign-only

Use when you're paying an arbitrary x402 service whose URL is in the off-chain allowlist. klink signs the spend tx; **you** retry the original service request with the returned signature in `X-Payment-Proof`.

```bash
curl -s -X POST -H "Authorization: Bearer $KLINK_API_KEY" \
  -H "content-type: application/json" \
  -d '{
    "url": "https://service.example/api/inference",
    "recipient": "<base58>",
    "amount": 50000
  }' \
  https://api.klink.dev/v1/spend/sign-payment
```

```json
{ "tx_signature": "5K3...", "payment_proof_header": "5K3..." }
```

Then:
```
POST https://service.example/api/inference
X-Payment-Proof: 5K3...
```

### `POST /v1/spend/service` — curated mpp.dev proxy

Use for services in the curated catalog. klink probes the service, verifies the quoted price is under your `max_amount`, signs + submits, retries with proof, and forwards the service response back to you. **One call, one paid result.**

```bash
curl -s -X POST -H "Authorization: Bearer $KLINK_API_KEY" \
  -H "content-type: application/json" \
  -d '{
    "slug": "openai-gpt4",
    "path": "/v1/chat/completions",
    "body": { "model": "gpt-4", "messages": [...] },
    "max_amount": 100000
  }' \
  https://api.klink.dev/v1/spend/service
```

The HTTP status + body you get back are passthrough from the upstream service. The `x-tx-signature` response header carries the on-chain proof of payment.

### `POST /v1/yield/deposit` and `POST /v1/yield/withdraw` — Kamino lending

Move idle USDC into Kamino USDC reserve to earn supply yield, or pull it back. Your session must have the `kamino_deposit` / `kamino_withdraw` instruction bit set.

```bash
curl -s -X POST -H "Authorization: Bearer $KLINK_API_KEY" \
  -H "content-type: application/json" \
  -d '{"amount":2000000}' \
  https://api.klink.dev/v1/yield/deposit
```

`max_deployed_fraction_bp` (set by the human) caps how much of the vault may be deployed at once. A 2-USDC deposit when the cap is hit will revert with `0xbc4` style on-chain error mapped to a 402.

## Error taxonomy

The HTTP status + the response `error` field are the contract.

| Status | Body | Meaning | What to do |
|---|---|---|---|
| `401` | `"missing bearer token"`, `"invalid token format"` | Auth header malformed | Fix the header. Token must start with `klink_dev_` / `klink_prod_`. |
| `401` | `"invalid api key"` | Token doesn't match any session, OR hash mismatch | Tell the human to mint a new session. Don't retry — keys don't recover. |
| `401` | `"api key revoked"` | The human rotated the key | Tell the human; they need to send you the new one. |
| `401` | `"session revoked"` | The whole session was revoked on chain | Stop. Create-session is human-only. |
| `402` | `"INSUFFICIENT_LIQUID"` + `liquid` / `amount` / `deficit` (USDC base units) | Vault USDC ATA balance < amount | Either reduce amount, or call `POST /v1/yield/withdraw` first to free deployed funds. The response tells you exactly how much you're short. |
| `402` | `"on-chain submission failed"` + `detail` | Solana revert. Common: recipient not in allowlist, daily cap hit, session expired, `0xbc4 AccountNotInitialized` | Inspect `detail`. If recipient not allowlisted: tell the human to add it. If daily cap: wait for the rolling-24h reset. If expired: human creates a new session. |
| `402` | `"QUOTED_OVER_MAX"` + `quoted` / `max_amount` | Service wants more than you authorised | Don't retry with the same `max_amount`. Either ask the human to raise it, or pick a cheaper service. |
| `403` | `"OUTSIDE_TIME_WINDOW"` | Current time is outside the human's allowed hours-of-day window | Wait until the window opens; don't retry tightly. Window is in the wallet's configured timezone. |
| `403` | `"URL_NOT_ALLOWED"` | URL isn't in the off-chain allowlist | Tell the human to add the URL pattern. Wildcards are path-segment-only — host is always literal. |
| `502` | `"service probe failed"` | The upstream x402 service didn't respond | Standard upstream-down behaviour. Backoff and retry. |
| `503` | `"rpc unavailable"` | Solana RPC is having a moment | Backoff and retry — usually transient (~30s). |

## Recovery patterns

```
auth fails                  → tell the human; you can't self-recover
INSUFFICIENT_LIQUID         → check /v1/yield/position; if deployed > 0, withdraw first
OUTSIDE_TIME_WINDOW         → wait until window opens; don't tight-loop
URL_NOT_ALLOWED             → tell the human; they edit the off-chain policy
QUOTED_OVER_MAX             → either negotiate cheaper service or escalate to human
on-chain "AccountNotInitialized" → session was created in DB but never confirmed on-chain. Tell the human; they recreate the session.
RPC unavailable             → exponential backoff (1s, 2s, 4s, 8s, cap 30s)
```

Don't retry 401, 402-INSUFFICIENT_LIQUID, 403, or 402-QUOTED_OVER_MAX in a tight loop. Surface to the human.

## Funding (you don't, the human does)

You can read the deposit address but not move funds INTO the vault. The human does that:

- Direct USDC transfer to the vault's USDC ATA (returned by `GET /v1/fund/deposit-address` — dashboard-JWT auth, you don't have access)
- Card / fiat via Dodo Payments (dashboard flow)

If you're hitting `INSUFFICIENT_LIQUID` repeatedly, that's a signal to the human to top up. Don't try to "discover" funding endpoints — the agent surface intentionally doesn't expose them.

## Threat model — what to assume

- **Your API key is hot-revocable.** The human can `POST /v1/session/:id/rotate-key` from the dashboard at any time. Old keys 401 immediately.
- **Spend caps are on-chain.** Even if you knew the session keypair (you don't), `transfer_usdc` enforces `max_per_tx`, `daily_cap`, recipient allowlist, and instruction bitmap atomically. Off-chain checks are just fast-fails.
- **Audit log is append-only and human-readable.** Every allow + deny lands in `audit_log` keyed to your session. The human reviews via the dashboard. Anything sketchy you do is visible.
- **No escape hatch through you.** There is no instruction or HTTP path that lets your API key drain the vault to an external recipient that wasn't pre-approved. If the human revokes you, you're done.

## Beta caveats

- klink is currently devnet only (program `5qCJC…edqv`); mainnet deploy is gated on a multisig migration (`T-114`).
- Kamino reserve env vars aren't fully wired — `kamino_deposit` / `kamino_withdraw` may revert with `WrongKaminoProgram` until the human has populated `KAMINO_RESERVE` etc. (see operational handover).
- Accrued yield (`/v1/yield/position` `accrued` field) is `null` until the cToken exchange-rate decode lands.

## Where to look next

- API surface + auth model: `docs/architecture/api-surface.md`
- Full design spec (program, account layouts, validator logic): `docs/specs/2026-04-28-agent-wallet-design.md`
- Concepts (Vault PDA, sessions, policies): `gitbook/concepts/`
- Status of in-flight work: `TODO.md`

When in doubt, surface to the human and let them decide. That's the whole point.
