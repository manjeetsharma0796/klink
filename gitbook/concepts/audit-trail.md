---
icon: scroll-text
title: Audit trail
description: Why Solana transaction history is the source of truth and what off-chain enrichment adds
---

# Audit trail

Klink treats the audit trail as a first-class feature. The source of truth is **on-chain Solana transaction history**, every spend, every yield deposit, every revocation is a transaction signed by the program. The off-chain `audit_log` table enriches that with human-readable context.

## What lives where

| Audit content | Layer | Notes |
|---|---|---|
| Every state-changing instruction (`transfer_usdc`, `kamino_deposit`, `kamino_withdraw`, `init_vault`, `add_session`, `revoke_session`, `set_max_deployed_fraction`, `update_session_allowlist`) | On-chain | Free, immutable, queryable from any RPC |
| Off-chain decisions (allow / deny + reason) | Off-chain | Audit log |
| Service slug, URL pattern hit, time-of-day decision context | Off-chain | Backend has visibility the chain doesn't |
| Funding events (fiat-in → treasury → vault) | Both | Payment session off-chain, on-chain transfer in Solana history |

## Why on-chain is the source of truth

* **Immutable.** Once a tx confirms, it's settled. The program cannot rewrite history.
* **Free.** Solana's transaction archive is queryable via any RPC node: no per-record storage cost.
* **Public.** The wallet's owner, anyone they share the vault address with, and any auditor can verify the same record.
* **Survives the backend.** If Klink's backend disappears tomorrow, the on-chain record remains. Spend, yield, and revocation history is recoverable from the chain alone.

Off-chain logs are convenient but lossy, they're a derived view of what the chain already knows.

## What the off-chain `audit_log` adds

The chain knows *what* happened. The off-chain log knows *why* a particular HTTP request resolved the way it did. Each row carries:

```
id, wallet_id, session_id,
action,                     -- pay_service | transfer | kamino_deposit | ...
amount, recipient_or_url,
decision   ENUM(allow, deny),
reason,                     -- "URL_NOT_ALLOWED", "OUTSIDE_TIME_WINDOW", ...
tx_signature NULL,          -- present iff allowed (then submitted)
created_at
```

Critically, the off-chain log records **both `allow` and `deny`** decisions. This makes "the policy blocked X attempts" a queryable, presentable signal, you can see what your agent *tried* to do, not just what it succeeded at. Pure on-chain history would only show successes.

## Audit deny reasons

Common `audit_log.reason` values when `decision = 'deny'`:

| Reason | Layer that denied | Meaning |
|---|---|---|
| `URL_NOT_ALLOWED` | Off-chain | URL didn't match the allowlist and wasn't in the curated catalog |
| `OUTSIDE_TIME_WINDOW` | Off-chain | Spend attempted outside the wallet's time-of-day window |
| `INSUFFICIENT_LIQUID` | Off-chain pre-flight | Liquid balance < requested amount; caller must withdraw from yield first |
| `SessionRevoked` | On-chain | Session account was closed before the tx confirmed |
| (on-chain revert errors) | On-chain | Anchor program rejected for one of the §2.5 checks |

## Reading the audit trail

* **Dashboard view**: `GET /v1/audit` returns paginated, cursor-ordered entries (filterable by `decision = allow|deny`).
* **On-chain view**: Use any Solana explorer (Solscan, Solana Beach, Solana Explorer) on the vault address or its USDC ATA. Klink's program emits typed events you can decode against the published IDL.

Both views should agree on the on-chain set. The off-chain view is a **superset**, it includes the denials.

## What the trail does NOT show

* **Read-only API calls.** A `GET /v1/wallet` doesn't write to `audit_log`. The audit covers state-changing actions.
* **Off-chain context for on-chain ops not initiated by Klink.** If someone sends USDC directly to the vault's ATA (a fund), it's on-chain visible but doesn't have an off-chain audit row: there's no Klink HTTP request behind it.
* **Off-chain decisions on read endpoints.** The audit log is for spend/yield decisions, not for dashboard JWT auth or session-list reads.

## Implications for the human owner

You can prove to a stakeholder, an investor, or a future you exactly what an agent has done with funds. **The vault address plus a Solana RPC is enough.** No reliance on Klink's backend, no chance of selective deletion, no race with whoever runs the API.

## Read next

* [Policies](policies.md): the rules that produce `allow` and `deny` decisions
* [System Overview](../architecture/overview.md): where the audit log fits in the spend hot path
