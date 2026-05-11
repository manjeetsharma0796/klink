---
title: Service catalog deployment
purpose: Operational steps to seed and update the curated `service_catalog` table backing `/v1/spend/service` (T-211 + T-220 + T-234)
last_updated: 2026-05-11
---

# Service catalog deployment

The `/v1/spend/service` endpoint (T-211 in [`apps/api/src/routes/spend.ts`](../../apps/api/src/routes/spend.ts)) only forwards to upstreams that have a row in the `service_catalog` table with `enabled=true`. This runbook covers seed, per-row update, and end-to-end smoke test.

## 1. Pre-flight

| Need | Where to get it |
|---|---|
| `DATABASE_URL` for prod Neon | Render env vars for the `klink-api` service (or whoever provisioned Neon) |
| Bun installed locally | `curl -fsSL https://bun.sh/install \| bash` (per [`dev-environment.md`](dev-environment.md)) |
| Recipient pubkey for each slug | mpp.dev / pay-with-locus team — these are NOT in the repo (T-234 step 2 blocker) |

Export the URL into the current shell so all subcommands inherit it. Do **not** persist it in `apps/api/.env` (that file is dev-only, prod creds must not land on dev disks).

```bash
export DATABASE_URL='postgres://...neon...'
```

## 2. Seed (one-time)

The seed inserts the four currently curated slugs (`anthropic-claude`, `openai-chatgpt`, `exa-search`, `firecrawl`) with placeholder pubkeys (`11111111111111111111111111111111`) and `enabled=false`. Idempotent: re-running is a no-op via `onConflictDoNothing` on `slug`.

```bash
bun --filter @klink/api run db:seed
```

Expected output:

```
seeded service_catalog: inserted 4 new row(s) of 4 candidates
```

(After the first run, subsequent runs print `inserted 0 new row(s) of 4 candidates`.)

To verify in psql:

```sql
SELECT slug, enabled, payment_recipient_pubkey FROM service_catalog ORDER BY slug;
```

All four rows should have `enabled=false` and the system-program placeholder pubkey at this point. **Do not enable any row yet** — the placeholder pubkey would silently route real USDC to the system program (i.e., burn it).

## 3. Per-slug update (admin script)

`apps/api/scripts/catalog-update.ts` wraps an `UPDATE` against `service_catalog` so operators don't need raw SQL through the Neon console. **Default is dry-run** — you must pass `--apply` to write.

### 3.1 Workflow per slug

For each of the four slugs, once you've received the real recipient pubkey from the upstream team:

```bash
# 1. Dry-run — confirms the row exists and prints before/after.
bun apps/api/scripts/catalog-update.ts \
  --slug openai-chatgpt \
  --recipient 81eM3oPR1fUJSsFhNm6G51W4jwE2HondS2kjBmcxFcJ2 \
  --enable

# 2. Apply.
bun apps/api/scripts/catalog-update.ts \
  --slug openai-chatgpt \
  --recipient 81eM3oPR1fUJSsFhNm6G51W4jwE2HondS2kjBmcxFcJ2 \
  --enable \
  --apply
```

### 3.2 Other ops

```bash
# Disable a slug (e.g. upstream brownout). Does not erase the recipient pubkey.
bun apps/api/scripts/catalog-update.ts --slug exa-search --disable --apply

# Set or update default per-call cap (USDC base units; 0 = no cap).
# 100_000 = 0.1 USDC.
bun apps/api/scripts/catalog-update.ts --slug exa-search --max-per-call 100000 --apply

# Show usage.
bun apps/api/scripts/catalog-update.ts --help
```

### 3.3 Flags

| Flag | Effect |
|---|---|
| `--slug <slug>` | Required. The catalog row to update. |
| `--recipient <base58>` | Set `payment_recipient_pubkey`. Validated as Solana pubkey before any DB call. |
| `--enable` | Set `enabled=true`. |
| `--disable` | Set `enabled=false`. Mutually exclusive with `--enable`. |
| `--max-per-call <int>` | Set `default_max_per_call` (USDC base units, 6 decimals). |
| `--apply` | Actually write. Without it, the script is dry-run. |

Exit codes: `0` success, `1` arg error, `2` slug not found, `3` DB / runtime error.

### 3.4 Equivalent via package script

```bash
bun --filter @klink/api run catalog:update -- --slug openai-chatgpt --enable --apply
```

(The bare-`bun apps/api/scripts/catalog-update.ts` form is shorter and skips the workspace boilerplate.)

## 4. Smoke test (end-to-end)

After enabling a slug, verify the proxy actually completes a payment + retry. Two checks: a direct probe to the upstream confirms the 402 response shape, then a call through the api confirms the proxy.

### 4.1 Probe upstream directly

```bash
# Replace <slug> + <path> with the enabled slug's base_url + a real paid endpoint.
curl -sS -i -X POST https://openai.mpp.paywithlocus.com/v1/chat/completions \
  -H 'content-type: application/json' \
  -d '{"messages":[{"role":"user","content":"hi"}]}'
```

The handler expects exactly this shape on the 402 body (matches the `PaymentRequirements` interface in `spend.ts:570-576`):

```json
{ "amount": 50000, "recipient": "<base58 pubkey>" }
```

> **Drift warning:** if the upstream returns the MPP-protocol shape instead (string `amount`, top-level `currency`, `methodDetails`, freshness `expires` carried in `WWW-Authenticate: Payment …`), the handler will reject with HTTP 502 `service requirements missing amount or recipient`. In that case use `/v1/spend/mpp` instead — that's the dedicated MPP-protocol proxy (T-253) and lives alongside the curated `/v1/spend/service`. See "Spec drift" below.

### 4.2 Call through the proxy

You need an api key for a wallet that holds enough USDC to cover the upstream's `amount`. The wallet's session must have `<recipient>` in `allowed_recipients` (T-105 on-chain check) — note `/v1/spend/service` does not auto-add the catalog recipient.

```bash
KLINK_API_KEY='kl_...'
curl -sS -X POST https://api.klinkdotfun.live/v1/spend/service \
  -H "authorization: Bearer ${KLINK_API_KEY}" \
  -H 'content-type: application/json' \
  -d '{
        "slug": "openai-chatgpt",
        "path": "/v1/chat/completions",
        "max_amount": 100000,
        "method": "POST",
        "body": { "messages": [{"role":"user","content":"hi"}] }
      }'
```

Success: 200 with the upstream response body and an `x-tx-signature` response header.

Failure modes worth recognizing:

| Response | Meaning |
|---|---|
| `404 service '<slug>' not in catalog or disabled` | row missing or `enabled=false`; back to §3 |
| `502 service requirements missing amount or recipient` | upstream isn't returning the curated x402 shape; see Spec drift below |
| `402 QUOTED_OVER_MAX` | the upstream wants more than the caller's `max_amount` |
| `402 INSUFFICIENT_LIQUID` | wallet vault doesn't have enough USDC |
| `402 on-chain submission failed: …` | typically `RECIPIENT_NOT_ALLOWED`, `OVER_PER_TX_CAP`, or `OVER_DAILY_CAP` from the on-chain validator (T-105). Add the recipient to the session's allowed_recipients via the dashboard. |

## 5. Rollback

To take a slug out of rotation without losing the row (so the next operator doesn't lose the recipient pubkey):

```bash
bun apps/api/scripts/catalog-update.ts --slug <slug> --disable --apply
```

To wipe a row entirely, use `psql` directly — the admin script does not delete (deliberately; keeps the audit footprint of who/when via DB logs).

## 6. Spec drift to be aware of

The curated `/v1/spend/service` proxy assumes upstream returns plain x402 JSON `{ amount: number, recipient: string }`. The newer MPP protocol returns a `WWW-Authenticate: Payment …` challenge with a base64url-encoded `request` payload that carries `amount` as a **string**, plus `currency`, `recipient`, `methodDetails.recentBlockhash`, etc. Two endpoints exist for this reason:

| Endpoint | Upstream shape expected | Handler |
|---|---|---|
| `/v1/spend/service` | x402 JSON `{ amount: number, recipient: string }` | `postSpendServiceHandler` |
| `/v1/spend/mpp` | MPP `WWW-Authenticate: Payment …` challenge | `postSpendMppHandler` |

If the four seeded `*.mpp.paywithlocus.com` upstreams turn out to speak MPP rather than plain x402, the catalog rows still serve their lookup purpose, but agents should hit `/v1/spend/mpp` with the full URL rather than `/v1/spend/service` with a slug. T-234 step 3 (smoke test, currently blocked) will resolve which dialect each upstream actually speaks.

## 7. Related

- Handler: [`apps/api/src/routes/spend.ts`](../../apps/api/src/routes/spend.ts) — `postSpendServiceHandler` ≈ line 593
- Schema: [`apps/api/src/db/schema.ts`](../../apps/api/src/db/schema.ts) — `serviceCatalog`
- Seed: [`apps/api/src/db/seed.ts`](../../apps/api/src/db/seed.ts)
- Admin script: [`apps/api/scripts/catalog-update.ts`](../../apps/api/scripts/catalog-update.ts)
- Task: T-234 in [`/TODO.md`](../../TODO.md)
