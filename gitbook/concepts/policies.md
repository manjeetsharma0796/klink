---
icon: shield-check
title: Policies
description: How Klink composes on-chain hard limits with off-chain rich rules
---

# Policies

Policy in Klink is **two layers, evaluated in order**:

1. **Off-chain rich rules** — URL allowlist, time-of-day window. Evaluated by the backend before any tx is built.
2. **On-chain hard limits** — caps, recipient allowlist, expiry, deployed-fraction. Evaluated by the Anchor program; reverts the entire tx on any violation.

The off-chain layer is enrichment. The on-chain layer is the trustless guarantee.

## On-chain hard limits

These live on the [Vault](vault.md) and the [Session](sessions.md) account. The program checks them in `transfer_usdc`, `kamino_deposit`, and `kamino_withdraw`:

| Check | Source | Enforced in |
|---|---|---|
| Caller signed with the session keypair | `session.session_pubkey` | All session-signed instructions |
| This instruction is allowed for this session | `session.allowed_instructions` bitmap | All session-signed instructions |
| Recipient is in the allowlist | `session.allowed_recipients` (fixed-10) | `transfer_usdc` |
| Amount fits per-tx cap | `session.max_per_tx` | `transfer_usdc` |
| Daily cap with rolling 24h window | `session.daily_cap`, `daily_spent`, `daily_window_start` | `transfer_usdc` |
| Session has not expired | `session.expiry` | `transfer_usdc` |
| Deployed fraction not exceeded | `vault.max_deployed_fraction_bp` | `kamino_deposit` |
| Withdraw amount ≤ deployed | `vault.deployed_amount` | `kamino_withdraw` |

Any failed check **reverts the entire transaction**. There is no partial application.

## Off-chain rich rules

These live in the off-chain policy store, keyed by wallet:

| Rule | Storage |
|---|---|
| URL allowlist | List of `{ "pattern": "https://api.example.com/*", "max_per_call": 0.10 }` entries |
| Time-of-day window | `start_min`, `end_min`, day-of-week bitmask, `timezone` |

### URL allowlist

Wildcards are restricted to **path segments only**. No host wildcards — `*.example.com` is rejected at insertion. This is the mitigation for the `*.evil.com` attack pattern: a user enters a permissive host pattern, an attacker registers a matching subdomain.

Patterns look like `https://api.example.com/v1/*`. Curated services short-circuit the allowlist check (the proxy already constrains what the agent can hit).

### Time-of-day window

* **timezone** — the wallet's preferred timezone (DST-correct conversion).
* **day-of-week bitmask** — bit 0 = Monday, bit 6 = Sunday. Both endpoints inclusive.
* **start / end** — minute-of-day in the wallet's timezone.

A spend at 22:00 IST when the window is 09:00–18:00 IST is denied — even if every on-chain check would pass.

### Order of evaluation

```
POST /v1/spend/* (any spend endpoint)
  1. Auth: validate api_key → resolve session_id, wallet_id
  2. Time check (off-chain) — deny if outside window
  3. URL check (off-chain) — curated-service short-circuit, else allowlist match
  4. Liquidity check — strict; no magic withdraw
  5. Build typed instruction → sign with session keypair → submit to Solana
  6. Solana validator runs all on-chain hard limits
  7. Audit log writes both allow and deny outcomes
```

The off-chain layer fails fast. The on-chain layer is the source of truth. **A spend reaches Solana only if both layers pass.**

## What the model is for

The split is not arbitrary. It maps "what each layer can express well" onto the right enforcer:

| Approach | Problem |
|---|---|
| **Pure on-chain policy** | Solana programs can't natively express "no spending between 22:00 and 06:00 UTC" without oracles or custom timekeeping. URL allowlists are off-chain by nature. |
| **Pure off-chain policy** | If the backend is the only policy authority, the user has to trust the backend. The whole point of a Solana primitive is trustless safety. |

Hybrid keeps the safety floor trustless and adds rich rules above it. **The worst case if the backend is compromised is bounded by what's already enforced on-chain.**

## Read next

* [Budgets](budgets.md) — caps and the deployed-fraction limit, in detail
* [Audit Trail](audit-trail.md) — both `allow` and `deny` decisions are recorded
