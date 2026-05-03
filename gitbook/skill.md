---
icon: bot
name: klink
description: Pay for services on Solana with policy-bounded session keys. Use when an AI agent needs to spend USDC autonomously without holding the user's master key.
title: Agent Skill
---

# klink agent skill

You are an AI agent. The human owner has handed you an API key prefixed `klink_dev_…` (devnet) or `klink_prod_…` (mainnet, when shipped). You can spend USDC + interact with Solana DeFi within bounds the human pre-set on chain. You **cannot** hold the human's master keypair — you only ever see this bearer token.

## What you can and cannot do

| Can | Cannot |
|---|---|
| Send USDC to recipients pre-approved by the human | Send USDC to anyone outside the on-chain `allowed_recipients` allowlist |
| Pay x402 / Solana Pay services within the per-tx + daily caps | Move funds out of the vault to an arbitrary wallet |
| Deposit / withdraw to the curated USDC reserve (if your session has the bit) | Change your own caps or allowlist (human-only) |
| Read your spend history via `/v1/audit` | Sign anything other than the txs the backend builds for you |
| Read your on-chain position via `/v1/yield/position` | Bypass the time-of-day window the human configured |

The on-chain Anchor program enforces every limit. The HTTP layer fast-fails some checks (auth, liquidity, time window) before signing — a 4xx response means you don't waste an on-chain tx.

## URLs — read this before your first curl

There are **two different origins** in this system:

| Origin | What lives here | Examples |
|---|---|---|
| **Dashboard** | This skill, the human's UI | `https://klink.dev` (when DNS lands) · `http://localhost:3030` (dev) |
| **API** | The endpoints you actually call | `https://klink-api.onrender.com` (current beta) · `http://localhost:3000` (dev) |

> **Hosted-API cold start:** the beta API can return `502` / `503` with no body for ~30s after idle. That's not in the regular error taxonomy — it's a cold-start signal. Backoff + retry once before escalating.

If you fetched this skill from `:3030`, **the API is on a different port (`:3000`)**. The dashboard does not proxy `/v1/*`. Hitting `:3030/v1/*` returns 404 HTML, which is a common first-curl trap. Always send protected calls to the API origin.

## Auth

Every protected request needs:

```
Authorization: Bearer klink_dev_<your-token>
```

**Sanity check** (zero side effects):

```bash
curl -s -H "Authorization: Bearer $KLINK_API_KEY" \
  https://klink-api.onrender.com/v1/yield/position
# → {"deployed":"0","accrued":null,"total_balance":"0"}
```

If this returns 200 you're set. If it returns 401, see "Recovery patterns" below.

## Capabilities

Base URL: `https://klink-api.onrender.com` (or `http://localhost:3000` in dev — see URLs section above; **not** the dashboard origin).

All amounts are **USDC base units** — 6 decimals, so `1_000_000` = 1 USDC. JSON numbers above 2^53 come back as decimal strings; parse with care.

### `GET /v1/yield/position`

Read your on-chain vault state. Free. Use this on every cold start to verify auth + sanity-check balances.

```bash
curl -s -H "Authorization: Bearer $KLINK_API_KEY" \
  https://klink-api.onrender.com/v1/yield/position
```

```json
{ "liquid": "0", "deployed": "0", "accrued": null, "total_balance": "0" }
```

- `liquid` — USDC in the vault ATA, ready to spend right now. **Decimal string** of base units (1 USDC = 1_000_000). Three possible values: `"<n>"` for a real balance, `"0"` if the ATA hasn't been created yet (cold wallet), `null` if the SPL balance read itself failed (RPC down — distinguish from 0 to decide whether to retry).
- `deployed` — USDC currently in the yield protocol.
- `accrued` — `null` until the exchange-rate read is wired (deferred).
- `total_balance` — `liquid + deployed`. If `liquid` is null, falls back to `deployed`.

Use this on every cold start to plan a spend amount.

### `POST /v1/spend/transfer` — direct USDC transfer

Use when you have a known recipient and just need to move USDC. Recipient must already be in the session's on-chain `allowed_recipients`; otherwise the on-chain program rejects.

```bash
curl -s -X POST -H "Authorization: Bearer $KLINK_API_KEY" \
  -H "content-type: application/json" \
  -d '{"recipient":"<base58-pubkey>","amount":500000}' \
  https://klink-api.onrender.com/v1/spend/transfer
```

```json
{ "tx_signature": "5K3...", "status": "confirmed" }
```

The recipient's USDC ATA must already exist on chain. If it doesn't, the on-chain program rejects with `0xbc4 / AccountNotInitialized` (mapped to a 402 here). **You as an agent cannot create the ATA yourself** — you don't hold a Solana keypair to sign + pay rent. When you hit this, surface to the human; they (or the recipient) need to create the ATA before you retry.

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
  https://klink-api.onrender.com/v1/spend/sign-payment
```

```json
{ "tx_signature": "5K3...", "payment_proof_header": "5K3..." }
```

Then:
```
POST https://service.example/api/inference
X-Payment-Proof: 5K3...
```

### `POST /v1/spend/service` — curated proxy

Use for services in the curated catalog. klink probes the service, verifies the quoted price is under your `max_amount`, signs + submits, retries with proof, and forwards the service response back to you. **One call, one paid result.**

```bash
curl -s -X POST -H "Authorization: Bearer $KLINK_API_KEY" \
  -H "content-type: application/json" \
  -d '{
    "slug": "openai-chatgpt",
    "path": "/v1/chat/completions",
    "body": { "model": "gpt-4", "messages": [...] },
    "max_amount": 100000
  }' \
  https://klink-api.onrender.com/v1/spend/service
```

The HTTP status + body you get back are passthrough from the upstream service. The `x-tx-signature` response header carries the on-chain proof of payment.

The curated catalog is curated — slugs are added explicitly. A `404 "service '<slug>' not in catalog or disabled"` means the slug is unknown OR has not been turned on yet — not a transient.

### `POST /v1/yield/deposit` and `POST /v1/yield/withdraw` — yield

Move idle USDC into the curated USDC reserve to earn supply yield, or pull it back. Your session must have the `kamino_deposit` / `kamino_withdraw` instruction bit set.

```bash
curl -s -X POST -H "Authorization: Bearer $KLINK_API_KEY" \
  -H "content-type: application/json" \
  -d '{"amount":2000000}' \
  https://klink-api.onrender.com/v1/yield/deposit
```

`max_deployed_fraction_bp` (set by the human) caps how much of the vault may be deployed at once. A deposit when the cap is hit will revert with an on-chain error mapped to a 402.

## Error taxonomy

The HTTP status + the response `error` field are the contract.

| Status | Body | Meaning | What to do |
|---|---|---|---|
| `400` | `"<field> ..."` (e.g. `"amount must be a positive number (USDC base units)"`) | Request validation failed before any backend logic ran | Fix the body shape. `error` is human-readable but not a stable code — read it as English. |
| `401` | `"missing bearer token"`, `"invalid token format"` | Auth header malformed | Fix the header. Token must start with `klink_dev_` / `klink_prod_`. |
| `401` | `"invalid api key"` | Token doesn't match any session, OR hash mismatch | Tell the human to mint a new session. Don't retry — keys don't recover. |
| `401` | `"api key revoked"` | The human rotated the key | Tell the human; they need to send you the new one. |
| `401` | `"session revoked"` | The whole session was revoked on chain | Stop. Create-session is human-only. |
| `402` | `"INSUFFICIENT_LIQUID"` + `liquid` / `amount` / `deficit` (USDC base units) | Vault USDC ATA balance < amount | Either reduce amount, or call `POST /v1/yield/withdraw` first to free deployed funds. The response tells you exactly how much you're short. |
| `402` | `"on-chain submission failed"` + `detail` (free text from the program) | Solana revert. The `detail` string carries the actual error; today there is no machine-readable subcode. Substring-match these patterns: | See "On-chain 402 substrings" below. |
| `402` | `"QUOTED_OVER_MAX"` + `quoted` / `max_amount` | Service wants more than you authorised | Don't retry with the same `max_amount`. Either ask the human to raise it, or pick a cheaper service. |
| `403` | `"OUTSIDE_TIME_WINDOW"` | Current time is outside the human's allowed hours-of-day window | Wait until the window opens; don't retry tightly. Window is in the wallet's configured timezone. |
| `403` | `"URL_NOT_ALLOWED"` | URL isn't in the off-chain allowlist | Tell the human to add the URL pattern. Wildcards are path-segment-only — host is always literal. |
| `404` | `"service '<slug>' not in catalog or disabled"` | `/v1/spend/service` slug doesn't exist or is gated off | Don't retry that slug. Ask the human which slugs are enabled, or pick a different one. |
| `404` | `"<resource> not found"` (other endpoints) | The thing you referenced doesn't exist for this caller | Surface to human. |
| `500` | `"server misconfigured"` | Backend env is missing something required | **Do not retry.** This is an ops issue, not a transient. Surface to human with the endpoint you tried — the api log will show which env var is missing. |
| `502` | `"service probe failed"` | The upstream x402 service didn't respond | Standard upstream-down behaviour. Backoff and retry. |
| `503` | `"rpc unavailable"` | Solana RPC is having a moment | Backoff and retry — usually transient (~30s). |

### On-chain 402 substrings

The `detail` field on a 402 `"on-chain submission failed"` is a free-text Solana error log. Substring patterns you'll see in practice:

| Substring in `detail` | Anchor error | Meaning | What to do |
|---|---|---|---|
| `0xbc4` or `AccountNotInitialized` | 3012 | A required on-chain account (usually `recipient_usdc_ata` or `session`) doesn't exist. For recipient ATA: it's never been used to receive this token. For session: the `add_session` tx was never confirmed on-chain. | Surface to human. Recipient ATA needs creation; or session needs re-creation if the PDA isn't initialized. |
| `RecipientNotAllowed` | (custom) | Recipient not in the on-chain allowlist | Tell the human to add this recipient via the dashboard. |
| `AmountExceedsMaxPerTx` | (custom) | Single tx exceeds `max_per_tx` cap | Reduce the amount, or human raises the cap. |
| `DailyCapExceeded` | (custom) | Rolling-24h cap hit | Wait until the window resets (the response doesn't tell you when — surface to human). |
| `SessionExpired` | (custom) | `expiry` timestamp passed | Human creates a new session. |
| `InstructionNotAllowed` | (custom) | The session bitmap doesn't grant this instruction | Human updates the session's allowed instructions. |

Substring-match defensively. The exact error name format is Anchor-rendered and can drift across program redeploys — when in doubt, surface the raw `detail` to the human and stop retrying.

## Recovery patterns

```
auth fails                  → tell the human; you can't self-recover
INSUFFICIENT_LIQUID         → /v1/yield/position now exposes `liquid` directly; use it to plan, then if deployed > 0 + still short, withdraw first
OUTSIDE_TIME_WINDOW         → wait until window opens; don't tight-loop
URL_NOT_ALLOWED             → tell the human; they edit the off-chain policy
QUOTED_OVER_MAX             → either negotiate cheaper service or escalate to human
on-chain "AccountNotInitialized" → see "On-chain 402 substrings" — could be recipient_usdc_ata missing (most common) OR session PDA uninitialized. Inspect the `detail` for which account name is named. Both surface to human; the remediation differs (ATA-create vs session re-create).
RPC unavailable             → exponential backoff (1s, 2s, 4s, 8s, cap 30s)
```

Don't retry 401, 402-INSUFFICIENT_LIQUID, 403, or 402-QUOTED_OVER_MAX in a tight loop. Surface to the human.

## Funding (you don't, the human does)

You can read the deposit address but not move funds INTO the vault. The human does that:

- Direct USDC transfer to the vault's USDC ATA (returned by `GET /v1/fund/deposit-address` — dashboard-JWT auth, you don't have access)
- Card / fiat via the dashboard funding flow

If you're hitting `INSUFFICIENT_LIQUID` repeatedly, that's a signal to the human to top up. Don't try to "discover" funding endpoints — the agent surface intentionally doesn't expose them.

## Threat model — what to assume

- **Your API key is hot-revocable.** The human can `POST /v1/session/:id/rotate-key` from the dashboard at any time. Old keys 401 immediately.
- **Spend caps are on-chain.** Even if you knew the session keypair (you don't), `transfer_usdc` enforces `max_per_tx`, `daily_cap`, recipient allowlist, and instruction bitmap atomically. Off-chain checks are just fast-fails.
- **Audit log is append-only and human-readable.** Every allow + deny lands in the audit log keyed to your session. The human reviews via the dashboard. Anything sketchy you do is visible.
- **No escape hatch through you.** There is no instruction or HTTP path that lets your API key drain the vault to an external recipient that wasn't pre-approved. If the human revokes you, you're done.

## Beta caveats

- Klink is currently devnet only; mainnet support arrives after the program audit completes.
- Yield reserve env vars aren't fully wired in every environment — `kamino_deposit` / `kamino_withdraw` may revert until configured. Check with the human first.
- Accrued yield (`/v1/yield/position` `accrued` field) is `null` until the exchange-rate decode lands.

## Where to look next

- **[Quickstart](getting-started/quickstart.md)** — end-to-end walkthrough for the human side
- **[Concepts → Overview](concepts/overview.md)** — the mental model
- **[Architecture](architecture/overview.md)** — the three-layer system

When in doubt, surface to the human and let them decide. That's the whole point.
