---
title: Roadmap
purpose: What's in MVP, what's next, what unblocks each item. Source = docs/specs/2026-04-28-agent-wallet-design.md §13 + §6.4 + TODO.md
last_updated: 2026-04-28
---

# Roadmap

Klink is targeting a 60-day MVP for the Solana Frontier hackathon (Colosseum). Implementation work is tracked in [TODO.md](https://github.com/manjeetsharma0796/klink/blob/main/TODO.md) as discrete `T-XXX` tasks.

## In MVP (60-day target)

| Capability | Status as of 2026-04-28 | Tracking |
|---|---|---|
| Anchor program with Vault PDA + Session accounts | T-102 done; T-103 in-progress | T-102 → T-115 |
| On-chain policy enforcement (caps, allowlists, expiry, deployed-fraction) | Pending | T-103 → T-110 |
| Backend HTTP API (Express + Postgres + Redis + Bun) | T-201, T-202, T-203, T-204, T-208, T-209, T-220 done | T-201 → T-217 |
| Sign-In With Solana auth | T-203 done | T-203 |
| API-key middleware with argon2 hashing | T-204 done | T-204 |
| Off-chain policy enforcer (URL + time-of-day) | T-209 done | T-209 |
| Dashboard (Next.js, Phantom-only adapter) | T-301, T-302 done | T-301 → T-308 |
| TypeScript SDK | Pending | T-309 |
| Manual Kamino yield (deposit / withdraw / position) | Pending | T-108, T-109, T-213 |
| Curated mpp.dev service spending | Pending | T-211, T-220 |
| Custom x402 sign-only spending | Pending | T-212 |
| Direct USDC funding | Pending | T-217 |
| Fiat-in via Dodo Payments | Pending | T-214, T-215 |
| Audit log (allow + deny) | Pending | T-216 |
| Devnet smoke test | Pending | T-113 |
| External Anchor program review | Pending | T-115 |
| Multisig upgrade authority (Squads 2-of-N) | Pending | T-114 |

## Mainnet gate

Mainnet deploy is gated on:

1. **T-115** — at least one of Neodyme / OtterSec / Sec3 / a known peer reviewer signs off on the program.
2. **Internal threat-model walkthrough** — every row of the [Risks](risks.md) table confirmed implemented, not just documented.
3. **Secrets rotation runbook** — tested end-to-end.
4. **Treasury float at minimum viable** ($500 cap initially).

## Post-MVP (v2)

Explicitly out of MVP scope, listed here so it's clear they're known and intentional:

| Item | Why deferred |
|---|---|
| **Auto-deploy / auto-rebalance** to yield | Background workers acting on user funds is a credential the wallet has to hold somewhere; trust surface we don't want in v1 |
| **Auto-withdraw on spend (JIT liquidity)** | Atomic withdraw + transfer is tight on Solana's 1232-byte tx limit; deferred to v2 |
| **Multi-protocol yield** (MarginFi, Solend, Drift) | Adds CPI surface; one well-tested integration first |
| **Multi-reserve Kamino selection** | Single hardcoded main USDC reserve in MVP |
| **Atomic withdraw + spend bundling** | Byte-budget challenge; sequential txs in MVP |
| **Anomaly detection, rate limiting, fraud rules** | Off-thesis for the policy primitive |
| **Python SDK** | TS-first; Python lands when there's user demand |
| **Mobile / React Native bindings** | TS-first |
| **Multi-sig recovery, social recovery** | "Owner pubkey is master" in MVP |
| **KMS migration for secrets** | Env-var-based encryption in MVP; runbook for rotation already documented |
| **Dynamic-size allowlists** | Fixed 10 slots in MVP — keeps account size predictable |
| **Pricing / billing model** | Free during MVP per the [pricing memo](https://github.com/manjeetsharma0796/klink/blob/main/docs/memos/2026-04-28-pricing-model.md); enterprise tier post-hackathon |
| **Demo reference integrations** | 3 picks, deferred until before submission (T-504) |

## Adding a new yield protocol

This is a structural decision worth calling out: the wallet program **hardcodes the destination program ID** at every CPI site (SPL Token, Kamino). Adding MarginFi or Solend means:

1. New typed instruction (`marginfi_deposit`, etc.)
2. Bit assignment in `allowed_instructions`
3. Hardcoded program ID at the CPI invocation
4. Program upgrade gated by the multisig upgrade authority

The bitmap lists *typed instructions* rather than *program addresses* by design — the program ID is structural, not data. New protocols are a deliberate, audited change, not a runtime knob.

## Read next

* [Risks](risks.md) — what's not yet in place and why
* [FAQ](faq.md) — common questions about scope
