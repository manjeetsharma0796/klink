---
title: Solana Agent Wallet — Design Spec
purpose: Defines the 60-day MVP architecture for a Solana-native non-custodial agent wallet with on-chain policy primitives, manual Kamino yield, mpp.dev service spending, and Dodo Payments fiat-in
last_updated: 2026-04-28
---

# Solana Agent Wallet — Design Spec

## TL;DR

A non-custodial Solana wallet purpose-built for AI agents. The human owner controls a vault PDA via Phantom; a backend-held session keypair signs every agent action subject to on-chain policy enforcement; the agent itself only ever holds an HTTP API key with zero on-chain authority. Policy is enforced in two layers: hard bounds (caps, allowlists, expiry, max-deployed-fraction) on-chain by an Anchor program, and rich rules (URL allowlist, time-of-day) off-chain by the backend. Yield via Kamino main USDC reserve is **manual-only** — no background automation. Funding via direct USDC transfer or Dodo Payments fiat-in. Service spending via curated mpp.dev proxy or user-registered x402 endpoints with sign-only relay.

## Goals (60-day MVP)

1. **Non-custodial vault** on Solana mainnet (devnet during build), owned by human's Phantom pubkey.
2. **Hybrid policy enforcement**: on-chain trustless safety floor + off-chain rich rules.
3. **Three-actor model** matching the Locus reference architecture (human owner / backend signer / agent API key) with explicit trust boundary.
4. **Manual Kamino yield** with on-chain over-deployment protection.
5. **Service spending** via curated mpp.dev catalog (proxied) and user-registered custom x402 endpoints (sign-only).
6. **Two funding paths**: direct USDC transfer and Dodo Payments fiat-in via treasury bridge.
7. **TypeScript SDK** as primary dev surface.
8. **Audit trail** with on-chain Solana history as source-of-truth + off-chain enrichment.

## Non-goals (explicitly out of scope for MVP)

- Auto-deploy / auto-rebalance to yield protocols (no background workers acting on user funds).
- Auto-withdraw on spend ("JIT liquidity") — caller must explicitly withdraw before spending.
- Multi-reserve Kamino selection (single hardcoded main USDC reserve).
- Multi-protocol yield (only Kamino).
- Auto-bundling withdraw + spend into one tx (uses two sequential txs in MVP).
- Anomaly detection, rate limiting, advanced fraud rules.
- Python SDK, mobile SDK, React Native bindings.
- Multi-sig recovery, social recovery beyond the standard "owner pubkey is master."
- KMS for secrets (env var encryption is MVP; KMS is v2).
- Dynamic-size allowlists (fixed 10 slots for recipients in MVP).
- Pricing / billing model (deferred).
- Demo reference integrations (deferred — picked before submission).

## 1. Architecture overview

### 1.1 Three layers

```
┌──────────────────────────────────────────────────────────────────┐
│ ACTORS                                                           │
│                                                                  │
│  Human owner            Backend                  Agent           │
│  Phantom keypair        session keypair          API key         │
│  Master authority       Delegated authority      HTTP only       │
│  Configures policy      Signs every spend        No on-chain     │
│  Funds wallet           Enforces off-chain DSL   power           │
└──────────────────────────────────────────────────────────────────┘
                  │                │                │
                  │ Phantom        │ session sig    │ Bearer token
                  ▼                ▼                ▼
┌──────────────────────────────────────────────────────────────────┐
│ CONTROL PLANE — Node/Express backend                             │
│                                                                  │
│  HTTP API surface, Postgres data, treasury, Dodo webhook,        │
│  mpp.dev curated proxy, Kamino RPC client, audit log writer.     │
│                                                                  │
│  Per-spend flow:                                                 │
│    1. Authenticate API key                                       │
│    2. Resolve wallet + session                                   │
│    3. Off-chain policy eval (URL, time-of-day)                   │
│    4. Build typed instruction                                    │
│    5. Sign with session keypair                                  │
│    6. Submit to Solana RPC                                       │
│    7. Write off-chain audit log                                  │
└──────────────────────────────────────────────────────────────────┘
            ╔══════════════════════════════════════════╗
            ║ TRUST BOUNDARY — agent never crosses     ║
            ║ below. API key has no on-chain power.    ║
            ╚══════════════════════════════════════════╝
                                  │
                                  ▼
┌──────────────────────────────────────────────────────────────────┐
│ ON-CHAIN — Anchor program on Solana                              │
│                                                                  │
│  Program: agent_wallet                                           │
│  Accounts: Vault PDA, Session accounts                           │
│  Typed instructions: init_vault, set_max_deployed_fraction,      │
│   add_session, revoke_session, update_session_allowlist,         │
│   transfer_usdc, kamino_deposit, kamino_withdraw                 │
│                                                                  │
│  Validator: program reverts on any policy violation.             │
└──────────────────────────────────────────────────────────────────┘
```

### 1.2 Three trust levels (blast radii)

| Credential | Holder | If leaked | Recovery |
|---|---|---|---|
| Owner key (Phantom) | Human, on their device | Total loss — attacker drains wallet | None at protocol level (it's the master); same as any Solana wallet |
| Session keypair | Backend (encrypted in Postgres) | Bounded loss — capped by `daily_cap` × time-to-revoke, restricted by recipient + program allowlists | Owner signs `revoke_session` from Phantom; works without backend |
| API key | Agent | Zero direct on-chain risk. Worst case: attacker authenticates to backend and operates within session bounds. | Backend disables API key (immediate) |

### 1.3 What lives where

| Concern | Layer |
|---|---|
| USDC custody | On-chain (vault PDA's USDC ATA) |
| Hard policy floor (caps, allowlists, expiry, deployed-fraction) | On-chain (Vault + Session accounts) |
| Rich policy (URL allowlist, time-of-day windows) | Off-chain (Postgres) |
| Session keypair | Off-chain (backend, AES-256-GCM at rest) |
| API key → wallet binding | Off-chain (Postgres, hashed token) |
| Audit log: on-chain events | On-chain (Solana tx history) |
| Audit log: off-chain decisions (allow/deny + reason) | Off-chain (Postgres) |
| Treasury USDC float (Dodo bridge) | Off-chain (single hot wallet) |
| mpp.dev curated service routing | Off-chain (proxy) |

## 2. On-chain layer

### 2.1 Anchor program

Single Anchor program named `agent_wallet`, deployed to Solana. Upgrade authority held by a multisig (not permissionless; not a single keypair).

### 2.2 Account types

#### 2.2.1 Vault PDA — `seeds = ["vault", owner.key()]`

Wallet-level state. One per user. Holds USDC via its associated token account at a derived address.

```rust
struct Vault {
    owner: Pubkey,                   // human's Phantom pubkey — master authority
    max_deployed_fraction_bp: u16,   // basis points; e.g. 8000 = 80%
    deployed_amount: u64,            // current Kamino deposit (USDC base units)
    bump: u8,
}
// Approximate size: 80 bytes  →  rent ~$0.20 at $200/SOL
```

#### 2.2.2 Session account — `seeds = ["session", vault.key(), session_pubkey.as_ref()]`

Per-session policy. Owner-mutable. One per active agent.

```rust
struct Session {
    vault: Pubkey,
    session_pubkey: Pubkey,                       // backend-held keypair's public key
    max_per_tx: u64,                              // USDC base units
    daily_cap: u64,
    daily_spent: u64,                             // running tally; resets on rolling 24h window
    daily_window_start: i64,                      // unix; rolls every 86400s
    expiry: i64,                                  // 0 = never expires
    allowed_recipients: [Pubkey; 10],             // fixed-size; unused = Pubkey::default()
    allowed_recipients_count: u8,
    allowed_instructions: u32,                    // bitmap; see §2.4
    bump: u8,
}
// Approximate size: 440 bytes  →  rent ~$0.50
```

### 2.3 Instructions (full set)

| Instruction | Signer | Purpose |
|---|---|---|
| `init_vault(max_deployed_fraction_bp)` | owner (sponsored) | Create vault PDA |
| `set_max_deployed_fraction(bp)` | owner | Adjust yield deployment cap |
| `add_session(session_pubkey, max_per_tx, daily_cap, expiry, allowed_recipients, allowed_instructions)` | owner | Register a new session |
| `update_session_allowlist(action: Add\|Remove\|Set, recipients?, instructions_bitmap?)` | owner | Mutate session bounds post-creation |
| `revoke_session()` | owner | Disable session and refund rent |
| `transfer_usdc(amount, recipient, memo?)` | session | Pay an address; covers mpp.dev / x402 settlement via memo |
| `kamino_deposit(amount)` | session OR owner | Deposit USDC to Kamino main reserve |
| `kamino_withdraw(amount)` | session OR owner | Pull from Kamino back to vault |

### 2.4 Typed-instruction bitmap (`allowed_instructions`)

Per-session control of which spending instructions a session may invoke. Fixed assignment:

| Bit | Instruction |
|---|---|
| 0 | `transfer_usdc` |
| 1 | `kamino_deposit` |
| 2 | `kamino_withdraw` |
| 3 | reserved (`jupiter_swap`, post-MVP) |
| 4–31 | reserved |

`allowed_instructions = 0b0000_0111` enables transfer + deposit + withdraw. Read-only sessions = `0`.

### 2.5 Validator logic

Every session-signed instruction performs these checks before any state change:

```
1. Check session.session_pubkey == ctx.accounts.session_signer.key()
2. Check (session.allowed_instructions >> bit_for_this_instruction) & 1 == 1
3. Instruction-specific checks:
   transfer_usdc:
     • recipient ∈ session.allowed_recipients
     • amount ≤ session.max_per_tx
     • daily window: if now ≥ daily_window_start + 86400, reset spent and window
     • daily_spent + amount ≤ session.daily_cap
     • now < session.expiry (if expiry != 0)
   kamino_deposit:
     • (vault.deployed_amount + amount) * 10000 / total_balance
       ≤ vault.max_deployed_fraction_bp
   kamino_withdraw:
     • amount ≤ vault.deployed_amount
4. CPI to underlying program (SPL Token / Kamino) with hardcoded program ID
5. Update on-chain state (daily_spent, deployed_amount)
```

Any failed check reverts the entire transaction.

### 2.6 Typed-instruction safety guarantee

Every Kamino-touching instruction (`kamino_deposit`, `kamino_withdraw`) hardcodes Kamino's program ID at the CPI invocation site. The wallet program will not dispatch to any other program for these operations. The same applies to SPL Token Program for `transfer_usdc`. Adding a new protocol (e.g., MarginFi, Jupiter) requires a program upgrade, gated by the multisig upgrade authority.

This is what makes `program_allowlist` a bitmap of *typed instructions* rather than a list of program IDs — the program ID is structural, not data.

### 2.7 Account-creation costs

| Account | One-time rent | Refundable on close |
|---|---|---|
| Vault PDA | ~$0.20 | Yes |
| Vault USDC ATA | ~$0.50 | Yes |
| Session account (each) | ~$0.50 | Yes |
| **Total per active wallet** | ~$1.20 (one session) | All recoverable |

All sponsorable by backend at creation time.

## 3. Off-chain layer

### 3.1 Stack

- Runtime: Node.js + TypeScript
- HTTP framework: Express
- Database: Postgres + Drizzle ORM
- Cache / rate limit: Redis
- Solana client: `@solana/web3.js` + `@coral-xyz/anchor` (typed client from program IDL)
- Token operations: `@solana/spl-token`
- Yield: `@kamino-finance/klend-sdk`
- mpp.dev: `@mpp-dev/sdk`
- Phantom Sign-In With Solana: `tweetnacl` + `bs58`
- JWT: `jose`
- Webhook signature: built-in `crypto`

### 3.2 HTTP API surface

| Method + path | Auth | Purpose |
|---|---|---|
| `POST /v1/auth/siws/nonce` | none | Issue nonce for Sign-In With Solana |
| `POST /v1/auth/siws` | none | Verify Phantom signature; issue dashboard JWT (24h) |
| `POST /v1/wallet` | dashboard JWT | Build sponsored `init_vault` tx for human to sign |
| `GET /v1/wallet` | dashboard JWT | Read wallet state (balance, deployed, sessions) |
| `POST /v1/wallet/policy` | dashboard JWT | Build `set_max_deployed_fraction` tx |
| `POST /v1/session` | dashboard JWT | Generate session keypair, build `add_session` tx, return API key once |
| `DELETE /v1/session/:id` | dashboard JWT | Build `revoke_session` tx |
| `PATCH /v1/session/:id/allowlist` | dashboard JWT | Build `update_session_allowlist` tx |
| `POST /v1/spend/transfer` | API key | Backend signs and submits `transfer_usdc` |
| `POST /v1/spend/service` | API key | Curated mpp.dev proxy: handles 402 dance + transfer |
| `POST /v1/spend/sign-payment` | API key | Custom x402: returns signed payment proof for agent retry |
| `POST /v1/yield/deposit` | API key OR dashboard JWT | `kamino_deposit` (manual) |
| `POST /v1/yield/withdraw` | API key OR dashboard JWT | `kamino_withdraw` (manual) |
| `GET /v1/yield/position` | API key OR dashboard JWT | Read deployed amount + accrued yield |
| `POST /v1/fund/dodo-checkout` | dashboard JWT | Create Dodo Payments checkout session |
| `GET /v1/fund/deposit-address` | dashboard JWT | Return wallet's USDC ATA for direct deposits |
| `GET /v1/audit` | dashboard JWT | Paginated audit log |
| `POST /v1/webhooks/dodo` | Dodo signature | Receives payment confirmation, triggers treasury disbursement |

#### 3.2.1 Build-tx-then-sign pattern for owner ops

For every owner-authority operation (`init_vault`, `set_max_deployed_fraction`, `add_session`, `revoke_session`, `update_session_allowlist`), the backend builds the transaction but the human's Phantom signs it. The backend never holds the owner's key.

### 3.3 Postgres data model

```
users                  (id, phantom_pubkey UNIQUE, email, created_at)
wallets                (id, user_id, vault_pda UNIQUE, usdc_ata, max_deployed_fraction_bp, created_at)
sessions               (id, wallet_id, session_pubkey UNIQUE, encrypted_session_secret,
                        label, expires_at, created_at, revoked_at NULL)
api_keys               (id, session_id, key_prefix, hashed_token, last_used_at, revoked_at NULL)
off_chain_policies     (wallet_id PRIMARY, allowed_urls JSONB, time_window_start_min INT,
                        time_window_end_min INT, time_window_dow_bitmask INT, timezone)
service_catalog        (id, slug UNIQUE, name, base_url, payment_recipient_pubkey,
                        default_max_per_call, enabled)
audit_log              (id, wallet_id, session_id, action, amount, recipient_or_url,
                        decision ENUM(allow,deny), reason, tx_signature NULL, created_at)
dodo_payments          (id, dodo_session_id UNIQUE, user_id, wallet_id, amount_usd,
                        amount_usdc, status ENUM(pending,settled,failed),
                        treasury_tx_signature NULL, created_at, settled_at NULL)
treasury_disbursements (id, dodo_payment_id, amount_usdc, tx_signature, created_at)
```

#### 3.3.1 Schema notes

- `encrypted_session_secret`: AES-256-GCM with master key from env var. Rotation = re-encrypt all rows + roll the env. Out of MVP scope for KMS migration.
- `hashed_token`: bcrypt or argon2. Only `key_prefix` (first 8 chars) shown in dashboard for identification.
- `audit_log` records both `allow` and `deny` decisions for "policy blocked X attempts" UI.
- `time_window_dow_bitmask`: bit 0 = Mon, bit 6 = Sun.
- `allowed_urls` JSONB structure: `[{ "pattern": "https://api.example.com/*", "max_per_call": 0.10 }]`. Wildcards restricted to path segments only; no host wildcards (see §5 URL allowlist bypass mitigation).

### 3.4 Background workers

| Worker | Schedule | Purpose |
|---|---|---|
| `treasury-disburser` | Event-driven on Dodo webhook | Build + submit treasury → vault USDC ATA transfer; idempotent on `dodo_session_id` |
| `api-key-gc` | Nightly | Hard-delete revoked api_keys older than 30 days; audit_log retains historical references |

**No `kamino-auto-cron`.** All yield movement is explicitly initiated by the agent or human.

### 3.5 Off-chain enforcement

URL allowlist + time-of-day are checked in `/v1/spend/service` and `/v1/spend/sign-payment` before any on-chain action:

```
1. Auth: validate api_key → resolve session_id, wallet_id
2. Load off_chain_policies for wallet
3. URL check:
     If url ∈ service_catalog (curated): pass — proxy handles
     Else: match url against off_chain_policies.allowed_urls (path-segment wildcards only)
     No match → deny, audit, 403 URL_NOT_ALLOWED
4. Time check:
     Convert now to wallet's timezone
     If today's day-of-week ∉ time_window_dow_bitmask: deny
     If now's minute-of-day ∉ [start, end]: deny
     Either fail → audit, 403 OUTSIDE_TIME_WINDOW
5. Pass → continue to liquidity check + on-chain submission
```

### 3.6 Auth flows

#### 3.6.1 Human (dashboard) — Sign-In With Solana

```
1. GET /v1/auth/siws/nonce              → server returns nonce (Redis, 60s TTL, single-use)
2. Phantom signs message "Sign in to <yourapp>: <nonce>"
3. POST /v1/auth/siws { pubkey, signature }
4. Server verifies signature, upserts user, issues JWT (24h)
5. All dashboard API calls: Authorization: Bearer <jwt>
```

#### 3.6.2 Agent — API key

```
1. Human creates session in dashboard → server generates API key once, shown once
2. Human pastes into agent env: AGENT_API_KEY=caw_dev_xxx...
3. Agent calls: Authorization: Bearer caw_dev_xxx...
4. Server hashes incoming token, looks up api_keys.hashed_token, resolves session/wallet
```

### 3.7 Secrets

| Secret | Storage (MVP) | Risk if leaked | v2 plan |
|---|---|---|---|
| Session keypairs | Postgres column, AES-256-GCM with env master key | Bounded per wallet by on-chain rules | KMS |
| Treasury keypair | Env var | Dodo float drained (~$1k cap) | KMS + multisig |
| Master encryption key | Env var | All session secrets decryptable; still bounded by on-chain rules | KMS |
| Dodo webhook secret | Env var | Faked payments → treasury drain. Mitigated by signature + idempotency + low float. | KMS |
| API keys (issued to agents) | Postgres, hashed (bcrypt/argon2) | Hash-only leak — not directly usable | unchanged |

## 4. End-to-end flows

### 4.1 Fund

#### 4.1.1 Direct USDC transfer (free, day-1)

```
Human clicks "Get deposit address" in dashboard
  → GET /v1/fund/deposit-address (JWT)
  ← { address: <vault_usdc_ata>, qr: <data-url> }

[Off-platform] Anyone sends USDC to that address
  (Phantom / Coinbase / Backpack / exchange withdrawal)

Solana confirms (~400ms)
Dashboard balance refresh shows new balance.
```

No backend involvement after step 1. Zero cost.

#### 4.1.2 Dodo Payments fiat-in (treasury bridge)

```
Human clicks "Add $100" in dashboard
  → POST /v1/fund/dodo-checkout { amount_usd: 100 }
  • Backend creates Dodo session, INSERT dodo_payments (status=pending)
  ← { checkout_url }
  → Dashboard redirects to Dodo

Human enters card, completes payment

[Async, ~2-10s] Dodo POSTs /v1/webhooks/dodo
  • Verify signature
  • Idempotency check (dodo_session_id already settled?)
  • UPDATE dodo_payments SET status='settled'
  → treasury-disburser worker:
      • Build SPL transfer: treasury_keypair → vault_usdc_ata, 100 USDC
      • Sign with treasury keypair
      • Submit to RPC, await confirmation
      • INSERT treasury_disbursements
      • INSERT audit_log (action="fund_dodo")

Dashboard balance refresh shows new balance.
```

Idempotency key: `dodo_session_id`. Webhook retries are safe.

### 4.2 Spend

#### 4.2.1 Common preamble (every spend call)

```
1. Auth: Bearer api_key → hashed lookup → resolve session_id, wallet_id
2. Time check: now ∈ off_chain_policies.time_window? (deny if no)
3. Liquidity check: on-chain liquid USDC ATA balance ≥ amount?
   If no: return 402 INSUFFICIENT_LIQUID { liquid, deployed, deficit }
4. Sub-flow checks (see below)
5. Build typed instruction → sign with session keypair → submit to RPC
6. INSERT audit_log
7. Return result
```

Liquidity is **strictly checked**. No magic withdraw. Caller (agent or human) must explicitly call `/v1/yield/withdraw` if deployed funds are needed.

#### 4.2.2 Curated mpp.dev service proxy

```
Agent: POST /v1/spend/service {
  slug: "anthropic-claude",
  path: "/v1/messages",
  body: { ... },
  max_amount: 0.05
}

Backend:
  preamble (auth, time check)
  lookup service_catalog WHERE slug='anthropic-claude'
    → base_url, payment_recipient_pubkey
  pre-flight on-chain checks:
    • payment_recipient ∈ session.allowed_recipients
    • max_amount ≤ session.max_per_tx
    • session.daily_spent + max_amount ≤ session.daily_cap
  HTTPS GET base_url + path
    → service responds 402 + payment_requirements
  check: actual amount ≤ max_amount (deny if quoted higher)
  liquidity check (strict; no magic)
  build + sign transfer_usdc(amount, recipient, memo=payment_id)
  submit, await confirmation
  HTTPS POST base_url + path with body + X-Payment-Proof: tx_sig
    → service responds 200 with content
  INSERT audit_log (action="pay_service", slug, amount, tx_sig)
  return service response to agent
```

#### 4.2.3 Custom x402 sign-only

```
Agent talks directly to user-registered URL:
  GET https://user-x402.example.com/api
  ← 402 + requirements

Agent: POST /v1/spend/sign-payment {
  url: "https://user-x402.example.com/api",
  requirements: { amount, recipient, payment_id }
}

Backend:
  preamble + time check
  url ∈ off_chain_policies.allowed_urls?
  recipient ∈ session.allowed_recipients?
  amount + cap checks
  liquidity check (strict)
  build + sign transfer_usdc → submit → confirm
  audit_log
  ← { tx_signature, payment_proof_header }

Agent retries call:
  GET https://user-x402.example.com/api  X-Payment-Proof: <tx_signature>
  ← 200 + content
```

Agent owns the HTTP transport; backend is sign-only.

#### 4.2.4 Direct transfer

```
Agent: POST /v1/spend/transfer { recipient, amount, memo? }

Backend:
  preamble → recipient + amount checks → liquidity check (strict)
  build + sign transfer_usdc → submit → audit_log
  ← { tx_signature }
```

### 4.3 Yield (manual only)

Triggered by agent (if `allowed_instructions` bit 1/2 set) or human (dashboard JWT). No background automation.

```
POST /v1/yield/deposit  { amount }
  preamble (auth)
  on-chain pre-flight: (deployed + amount) / total ≤ max_deployed_fraction_bp / 10000
  build kamino_deposit(amount) → sign session keypair → submit
  audit_log (action="kamino_deposit")

POST /v1/yield/withdraw { amount }
  preamble (auth)
  pre-flight: amount ≤ vault.deployed_amount
  build kamino_withdraw(amount) → sign → submit
  audit_log (action="kamino_withdraw")

GET /v1/yield/position
  read on-chain vault.deployed_amount
  query Kamino reserve for accrued amount
  return { deployed, accrued, total_balance }
```

`max_deployed_fraction` is enforced on-chain at deposit time. Protects against any caller (human, agent, attacker with leaked session) over-deploying. The 80/20 buffer is a UI hint only — not enforced.

### 4.4 Typical user journey

```
Day 0  Human creates wallet (sponsored)
         Dashboard: $0 liquid, $0 deployed
Day 0  Human funds via Dodo: $1000 (or direct USDC transfer)
         Dashboard: $1000 liquid, $0 deployed
Day 0  Human creates session, mints API key, hands to agent
Day 1  Agent or human chooses to deploy yield:
         POST /v1/yield/deposit { amount: 800 }
         Dashboard: $200 liquid, $800 deployed, +0 accrued
Day 1  Agent makes 50 mpp.dev paid API calls @ avg $0.04
         Each spend strictly liquid-checked; agent monitors balance
         When liquid drops too low, agent calls /v1/yield/withdraw
Day 7  Human reviews audit log: 320 allowed, 4 denied (URL not allowlisted)
```

## 5. Failure modes + mitigations

| Failure | Impact | Mitigation |
|---|---|---|
| Backend down | Spend, fund-via-Dodo, dashboard unavailable. Wallet itself still functional via direct Phantom interaction (emergency drain, session revocation). | Stateless backend → horizontal scale. Owner escape hatch is the safety net. |
| Solana RPC down | All chain reads/submits fail. | Paid RPC (Helius / QuickNode / Triton) with multi-region fallback. |
| Kamino down or contract upgrade | Can't withdraw deployed funds. | Disclose at deploy. v2: multi-protocol yield. |
| Kamino utilization stress | `kamino_withdraw` returns partial. | Backend returns `409 PARTIAL_LIQUIDITY { available }`. Agent retries smaller or waits. |
| Session keypair leaked | Attacker spends up to `daily_cap` to allowlisted recipients. | Owner signs `revoke_session` from Phantom (~$0.0001, ~5s). |
| Master encryption key leak | All session secrets decryptable. | Bounded by on-chain rules. Rotation runbook. v2: KMS. |
| Treasury keypair leak | Float drain (~$1k cap). | Low float, balance monitoring, alerting. v2: KMS + multisig. |
| Dodo webhook spoofing | Faked payment → treasury drain. | HMAC signature verify + idempotency on `dodo_session_id` + replay-window timestamp check. |
| Race: two concurrent spends | Both pass pre-flight; second fails on-chain. | On-chain enforcement is source of truth. Backend returns chain error. |
| Race: policy edit mid-spend | Whichever tx lands first wins. | Spend hitting new policy reverts; agent retries. |
| Race: revoke mid-spend | Revoke wins. | Agent treats `SessionRevoked` as terminal. |
| Clock drift (off-chain time check) | Edge cases at window boundaries. | NTP + 60s grace. On-chain uses `Clock` sysvar. |
| URL allowlist wildcard injection | User enters `*.evil.com`; attacker registers `legit.evil.com`. | Restrict wildcards to path segments only (`https://<host>/*`). Validate on insert. |
| Daily cap overflow under concurrency | 1000 concurrent requests pass pre-flight on stale snapshot. | On-chain `daily_spent` update is atomic per tx. Pre-flight is for UX only. |
| Partial: withdraw OK, spend fails | Funds in vault, agent retries. | Documented behavior; not a real failure. |
| Phantom signature replay (SIWS) | Attacker reuses captured signed message. | Nonce + 60s expiry, single-use TTL in Redis. |
| Anchor program bug post-deploy | Funds locked or drainable. | Pre-mainnet review. Capped balances at beta. Multisig upgrade authority. |
| Solana network outage | All txs paused (~6h historical). | Document. Not your problem to fix. |

## 6. Testing strategy

### 6.1 On-chain (Anchor program)

| Layer | What | Tool |
|---|---|---|
| Unit | Each instruction's happy path + every revert branch | `mocha` + `solana-program-test` |
| Property | Fuzz over `max_per_tx`, `daily_cap`, allowlist size with random inputs | Custom fuzz harness |
| Integration | Flow-level: init → add_session → spend (in-bounds) → spend (over-bounds) → revoke | Anchor on local validator |
| Devnet | Full deploy + flows against real Kamino devnet reserve | Manual + scripted |

#### 6.1.1 First tests to write (TDD)

- `transfer_usdc` reverts when `amount > max_per_tx`
- `transfer_usdc` reverts when recipient not in allowlist
- `transfer_usdc` reverts when `daily_spent + amount > daily_cap`
- `transfer_usdc` reverts when session is revoked
- `transfer_usdc` reverts when `now > expiry`
- `kamino_deposit` reverts when `(deployed + amount) / total > max_deployed_fraction`
- `revoke_session` succeeds only when caller is owner
- Race: two `transfer_usdc` against same session; only first wins on cap

### 6.2 Off-chain (backend)

| Layer | What | Tool |
|---|---|---|
| Unit | Each handler in isolation, mocked deps | Vitest |
| Integration | Real Postgres (test DB), mocked Solana RPC | Vitest + testcontainers |
| Contract | Anchor IDL → TS client schema match | Auto-generated, type-checked at build |
| End-to-end | Local validator + local backend + simulated Phantom + simulated agent | Playwright (dashboard) + supertest (HTTP) |

### 6.3 Demo replay test

A scripted happy-path: create wallet → fund → manual deposit → agent spend → human reviews audit. Runs on devnet, ~3 min. Failure blocks the demo build.

### 6.4 Security review checkpoints (before mainnet)

1. External Anchor program review (Neodyme / OtterSec / Sec3 / known peer)
2. Internal threat model walkthrough — every row of §5 confirmed implemented, not just documented
3. Secrets rotation runbook tested end-to-end
4. Treasury float starts at minimum viable ($500)

## 7. Open items

| Item | Status |
|---|---|
| Reference integrations for demo (3 slates) | Deferred — pick before submission |
| Pricing / business model | Deferred — non-architectural |
| Atomic withdraw + spend bundling (single tx, byte-budget) | v2 — MVP uses two sequential txs |
| Multi-reserve Kamino selection | v2 |
| Multi-protocol yield | v2 |
| KMS migration for secrets | v2 |
| Python SDK | v2 |
| Mobile / React Native bindings | v2 |
| Auto-rebalance / scheduled yield | v2 — explicitly out of MVP |

## 8. References

- [Project Context](../../CONTEXT.md) — strategic framing, competitive landscape, locked architecture decisions
- [AGENTS.md](../../AGENTS.md) — doc conventions
- Locus reference architecture (Base, ERC-4337) — see `paywithlocus.com/skill.md`
- mpp.dev — Machine Payments Protocol; Solana payment method spec at `mpp.dev/payment-methods/solana/charge`
- Kamino Lend program; SDK: `@kamino-finance/klend-sdk`
- Solana docs: PDAs, CPI, `Clock` sysvar, `Instructions` sysvar
- Anchor framework: `coral-xyz/anchor`
- a16z Know-Your-Agent (KYA) thesis — pitch alignment
