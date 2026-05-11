---
title: apps/api scripts
purpose: One-line index of the operational scripts under apps/api/scripts and how to run them
last_updated: 2026-05-11
---

# apps/api scripts

| Script | What it does |
|---|---|
| `demo-replay.ts` | T-503. Drives the full devnet happy path (create wallet → fund → session → yield deposit → MPP spend → audit) end-to-end in under 3 minutes. See [Demo replay](#demo-replay) below. |
| `e2e-dashboard.ts` | Live e2e of the dashboard-side flows against a running api. Same env shape as `demo-replay.ts`. Used to gate dashboard releases. |
| `dodo-webhook-smoke.ts` | T-236. Crafts a Standard Webhooks-signed POST against a local `/v1/webhooks/dodo` to verify the signature path. Requires `DODO_WEBHOOK_SECRET`. |
| `catalog-update.ts` | Per-row update for the curated MPP service catalog. See [`docs/runbooks/service-catalog-deployment.md`](../../../docs/runbooks/service-catalog-deployment.md). |

---

## Demo replay

`bun apps/api/scripts/demo-replay.ts`

The runnable companion to [`gitbook/getting-started/quickstart.md`](../../../gitbook/getting-started/quickstart.md). Use it to rehearse a demo, smoke-test a deploy, or hand to a teammate as "watch this script run, that's what klink does".

### Six steps, in order

1. **create wallet** — POST `/v1/wallet`, sign `init_vault`, self-heal POST so the DB row exists.
2. **fund** — SPL TransferChecked of 5 USDC from the funded test keypair to the vault USDC ATA. Idempotently creates the vault ATA first if it doesn't exist on-chain yet.
3. **manual session create** — POST `/v1/session`, sign `add_session`, capture the API key (only shown once, like the dashboard).
4. **manual yield deposit** — POST `/v1/yield/deposit`. On devnet this returns `503 YIELD_DISABLED` because Kamino has no devnet markets; the script detects this and gracefully continues. On a yield-enabled environment the call succeeds and the script moves on.
5. **agent spend** — POST `/v1/spend/mpp` against the verified MPP echo service `service01-kep9.onrender.com/echo`. Captures the on-chain `x-tx-signature` and the upstream JSON body.
6. **audit review** — GET `/v1/audit?limit=5` (JWT-authed) showing the spend row we just inserted. Also prints the dashboard URL `https://klinkdotfun.vercel.app/dashboard/audit` so the operator can verify visually.

### Configuration

Required:

| Source | Var / file | Default | Notes |
|---|---|---|---|
| file | `.devnet-test-keypair.json` (repo root) | (none) | Funded devnet keypair JSON array. Generate with `solana-keygen new --outfile .devnet-test-keypair.json`. Needs ~0.05 SOL for tx fees and ≥5 devnet USDC at its associated USDC ATA. SOL faucet: https://faucet.solana.com. USDC faucet: https://faucet.circle.com. |
| env | `KLINK_API_BASE` | `https://klink-api.onrender.com` | Override to `http://localhost:3000` to drive a local api instead. |
| env | `SOLANA_RPC_URL` | `https://api.devnet.solana.com` | Bring your own (Helius, QuickNode) if you're hitting devnet rate limits. |
| env | `USDC_MINT` | devnet USDC `4zMMC...ncDU` | Override only if running against a non-default cluster. |
| env | `ECHO_SERVICE_URL` | `https://service01-kep9.onrender.com/echo` | The verified MPP echo service. Override to point at a different MPP merchant. |

### Expected output (truncated example)

```
klink demo replay
─────────────────
api          : https://klink-api.onrender.com
rpc          : https://api.devnet.solana.com
owner pubkey : 5KsR...
echo service : https://service01-kep9.onrender.com/echo
  warming up https://klink-api.onrender.com OK (attempt 1)

(prereq) SIWS sign-in
  → POST https://klink-api.onrender.com/v1/auth/siws/nonce
  ← 200 {"nonce":"..."}
  → POST https://klink-api.onrender.com/v1/auth/siws
  ← 200 {"token":"...","userId":"..."}
  signed in (jwt len=412) in 2.10s

▶ step 1: create wallet (init_vault, idempotent)
  → POST https://klink-api.onrender.com/v1/wallet
  → body: {"max_deployed_fraction_bp":8000}
  ← 200 {"alreadyExists":true,"vaultPda":"...","vaultUsdcAta":"...","walletId":"..."}
  → GET https://klink-api.onrender.com/v1/wallet
  ← 200 {"id":"...","vaultPda":"..."}
✓ step 1 done in 0.95s — wallet already exists vault=GHAr2v1r...

▶ step 2: fund vault USDC ATA (5 USDC SPL transfer from owner)
  owner USDC ATA : DBRYhuJUmEzcqpS2WabaHKxwCJBz5QSvuSMoys66vQVB
  vault USDC ATA : ...
✓ step 2 done in 4.32s — tx=5q7Hm... vault balance=14.5 USDC

▶ step 3: manual session create (mint API key)
  → POST https://klink-api.onrender.com/v1/session
  → body: {"wallet_id":"...","label":"demo-replay-...","max_per_tx":1000000,...}
  ← 200 {"txBase64":"...","sessionId":"...","apiKey":"klink_dev_...","keyPrefix":"klink_dev"}
✓ step 3 done in 5.88s — session=abcd1234... key=klink_dev... tx=4xK2p...

▶ step 4: manual yield deposit (expected 503 YIELD_DISABLED on devnet)
  → POST https://klink-api.onrender.com/v1/yield/deposit
  → body: {"amount":1000000}
  ← 503 {"error":"YIELD_DISABLED","detail":"Yield endpoints are config-gated..."}
✓ step 4 done in 0.42s — 503 YIELD_DISABLED — gracefully skipped (Kamino devnet unsupported)

▶ step 5: agent spend via /v1/spend/mpp → https://service01-kep9.onrender.com/echo
  → POST https://klink-api.onrender.com/v1/spend/mpp
  → body: {"url":"https://service01-kep9.onrender.com/echo","max_amount":100000,"method":"GET"}
  ← 200 {"message":"Paid! ...","timestamp":1778474176960,"requestId":"..."}
  x-tx-signature  : XDPFH7Z3uZ5djZBoidUr2kaGCnqzucojRyxwAALfb2DhUhdx8CNk4a1VuakEpm6GZfWsqEznYaZg7XFbRan11xc
  payment-receipt : eyJtZXRob2QiOiJtcHAi...
✓ step 5 done in 12.40s — paid + got upstream response (tx=XDPFH7Z3...)

▶ step 6: audit review (GET /v1/audit, JWT-authed)
  → GET https://klink-api.onrender.com/v1/audit?limit=5
  ← 200 {"entries":[{...}],"next_cursor":null}
  latest entry  : action=spend_mpp decision=allow amount=10000
  tx_signature  : XDPFH7Z3uZ5djZBoidUr2kaGCnqzucojRyxwAALfb2DhUhdx8CNk4a1VuakEpm6GZfWsqEznYaZg7XFbRan11xc

  Visit https://klinkdotfun.vercel.app/dashboard/audit to verify visually (sign in with the same Phantom wallet: 5KsR...).
✓ step 6 done in 1.02s — 5 entries, latest matches

══════════════════════════════════════════════════════
klink demo replay: 6/6 steps OK in 27.1s
══════════════════════════════════════════════════════
```

### Known caveats

- **Cold-start.** The api on Render free tier sleeps after ~15 min idle and takes ~30s to wake. The script issues a warm-up `GET /health` first and silently retries up to 5 times with exponential backoff before counting it as a step. Subsequent steps then run on a warm api in <500ms each. If you're scripting around CI, budget ~60s for the worst-case cold-start.
- **YIELD_DISABLED is the happy path on devnet.** Kamino's public API explicitly does not surface devnet lending markets, so the api returns `503 YIELD_DISABLED` for any `/v1/yield/*` mutation. The script treats this as a successful step and continues. On a yield-enabled environment (mainnet after T-114) the call will succeed and the script will report "deposit accepted".
- **Manual wallet + session steps still need a Phantom signature in the dashboard flow.** The script bypasses Phantom by signing locally with `.devnet-test-keypair.json`. That keypair is the "user" for the entire run; it must be the same one between runs or step 1 will see a different vault each time.
- **The script needs devnet USDC at the keypair's ATA.** First run on a fresh keypair: airdrop devnet SOL (https://faucet.solana.com), then mint devnet USDC (https://faucet.circle.com, paste the keypair pubkey). Step 2 will fail loud with the recovery instructions if the ATA is empty.
- **Steps 1 and 2 are no-ops after the first run.** Step 1's create-wallet branch flips to `alreadyExists`; step 2 keeps adding 5 USDC to the vault each run, so the vault accumulates over time. Drain via `/v1/spend/transfer` if it gets too full to keep the dashboard's number tidy.

### Why this exists alongside `e2e-dashboard.ts`

`e2e-dashboard.ts` is the regression test for the dashboard surface (11 steps including allowlist patches, sessions list/detail, camelCase fix verification, session introspection). It exercises everything the dashboard touches.

`demo-replay.ts` is the demo script — six steps, three minutes, told as a single happy-path narrative an operator can show a customer. The two share a keypair file and an env layout but optimize for different things; keep them separate.

### Why raw `fetch` instead of `@klink/sdk`

The SDK lives at `packages/sdk/` and wraps every agent-authenticated endpoint cleanly. This script needs three things the SDK does not currently expose: SIWS sign-in (`POST /v1/auth/siws/*`), wallet creation (`POST /v1/wallet`), and audit listing (`GET /v1/audit`). All three are dashboard-JWT-authed, intentionally outside the SDK's agent-API-key contract. Adding the SDK as a dep just to hit `/v1/spend/mpp` (one of six steps) wouldn't be worth the extra moving piece. If you're writing agent-side code rather than a demo script, use the SDK — see [`packages/sdk/README.md`](../../../packages/sdk/README.md).
