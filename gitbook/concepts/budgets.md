---
title: Budgets
purpose: The four numeric caps that bound a session's spending power and the vault's yield exposure. Source of truth = docs/specs/2026-04-28-agent-wallet-design.md §2.5
last_updated: 2026-04-28
---

# Budgets

Klink has four numeric caps. The first three live on the [Session](sessions.md) account and bound an agent's spending. The fourth lives on the [Vault PDA](vault-pda.md) and bounds yield exposure.

| Cap | Account | Unit | Enforced in |
|---|---|---|---|
| `max_per_tx` | Session | USDC base units | `transfer_usdc` |
| `daily_cap` | Session | USDC base units | `transfer_usdc` |
| `expiry` | Session | Unix seconds (`0` = never) | `transfer_usdc` |
| `max_deployed_fraction_bp` | Vault | Basis points (0–10000) | `kamino_deposit` |

USDC base units: 1 USDC = 1_000_000.

## `max_per_tx` — single-transaction ceiling

Highest amount this session may spend in a single `transfer_usdc` call. Set it to the largest plausible per-call value the agent will hit; tighter is better.

```
assert amount <= session.max_per_tx
```

## `daily_cap` — rolling 24-hour budget

Total amount this session may spend in a 24-hour rolling window. **Not** a calendar day — the window is per-session and resets the first time a transfer fires after `now ≥ daily_window_start + 86400`:

```
if now >= daily_window_start + 86400:
    daily_spent = 0
    daily_window_start = now
assert daily_spent + amount <= daily_cap
daily_spent += amount
```

The rolling window is the mitigation for the "midnight burst" pattern — a calendar-day reset would let a compromised session wait for the date to flip and drain another full day's worth.

### Concurrency

Two concurrent spends from the same session can both pass the backend's pre-flight check on a stale snapshot. **The on-chain `daily_spent` update is atomic per transaction**, so the second tx fails on-chain even if the first hadn't yet been confirmed. The backend's pre-flight is for UX latency only — Solana is the source of truth.

## `expiry` — session lifetime

Unix-seconds at which the session can no longer spend. `0` means never expires. Setting expiry to a near-future timestamp gives you a trustless dead-man switch — even if the session keypair is leaked, the blast radius is bounded by `daily_cap × hours-to-expiry`.

```
if session.expiry != 0:
    assert now < session.expiry
```

## `max_deployed_fraction_bp` — yield exposure ceiling

Hard cap on the fraction of total USDC the wallet may have deposited in [Kamino](yield.md) at any given moment. Stored in basis points: `8000` = 80%.

```
let total = vault.deployed_amount + ata_balance + amount;
assert (vault.deployed_amount + amount) * 10_000 / total
       <= vault.max_deployed_fraction_bp;
```

Why an explicit cap?

* Protects against any caller (human, agent, attacker with a leaked session) over-deploying funds you wanted available for spending.
* The 80/20 split is the **hard floor**; the dashboard can suggest tighter ratios as UI hints, but the on-chain check is the only thing that matters under attack.

`max_deployed_fraction_bp` is mutable post-creation by `set_max_deployed_fraction(bp)`, owner-only, bounded `0–10000`.

## What budgets do NOT cover

* **No cumulative-lifetime cap.** Sessions cap per-tx and per-day; a long-lived session can spend an unbounded total over time. Use `expiry` as the lifetime backstop.
* **No per-recipient cap.** A recipient is either in `allowed_recipients` or it isn't; spend volume per recipient is not bounded separately.
* **No off-chain `max_per_call` for non-curated URLs in v1.** The `allowed_urls` JSONB schema reserves a `max_per_call` field, but it is not used in MVP.

## Choosing values

Practical starting points (tighten or loosen based on agent risk profile):

| Use case | `max_per_tx` | `daily_cap` | `expiry` | `max_deployed_fraction_bp` |
|---|---|---|---|---|
| Read-mostly research agent | $0.10 | $5 | 7 days | 0 (no yield) |
| Production support bot | $1 | $50 | 30 days | 5000 (50%) |
| Power-user agent | $10 | $500 | 90 days | 8000 (80%) |
| One-shot debugging session | $0.05 | $1 | 1 hour | 0 |

Values are illustrative — pick what fits the agent's worst-case, not its median.

## Read next

* [Sessions](sessions.md) — the account these caps live on
* [Yield (Kamino)](yield.md) — how `max_deployed_fraction_bp` interacts with deposits
