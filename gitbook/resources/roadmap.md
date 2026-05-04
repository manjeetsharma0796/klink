---
icon: map
title: Roadmap
description: What's available today, what's next, and what's deliberately deferred
---

# Roadmap

Klink is in **public beta on Solana devnet**. The on-chain program enforces every policy described in these docs; the dashboard, HTTP API, and agent skill are live; the SDK and CLI are on the way.

## Available today

| Capability | Status |
|---|---|
| Anchor program with Vault PDA + Session accounts | ✅ |
| On-chain policy enforcement (caps, allowlists, expiry, deployed-fraction) | ✅ |
| HTTP API surface | ✅ |
| Sign-In With Solana auth | ✅ |
| Off-chain policy enforcer (URL + time-of-day) | ✅ |
| Dashboard (Next.js, Phantom-only) | ✅ |
| Manual yield (deposit / withdraw / position) | ✅ |
| Curated paid-service spending | ✅ |
| Custom x402 sign-only spending | ✅ |
| Direct USDC funding | ✅ |
| Fiat-in via card payments | ✅ |
| Audit log (allow + deny) | ✅ |

## Coming soon

| Capability | Target |
|---|---|
| TypeScript SDK | Next milestone |
| Command-line tool (`klink`) | Following the SDK |
| External program audit | Gating mainnet |
| Multisig upgrade authority (2-of-N) | Before mainnet |
| Mainnet deploy | After audit + multisig migration |
| Public dashboard URL | Beta hosting in progress |

## Mainnet gate

Mainnet deploy is gated on:

1. **External program audit**: at least one credible reviewer signs off on the program.
2. **Internal threat-model walkthrough**: every row of the [Risks & Disclosures](risks.md) table confirmed implemented, not just documented.
3. **Secrets rotation runbook**: tested end-to-end.
4. **Treasury float at minimum viable** during the staged rollout.

## Deliberately deferred

These are explicitly **not** in the current release, listed here so it's clear they're known and intentional:

| Item | Why deferred |
|---|---|
| **Auto-deploy / auto-rebalance** to yield | Background workers acting on user funds is a credential the wallet has to hold somewhere; trust surface we don't want yet |
| **Auto-withdraw on spend (JIT liquidity)** | Atomic withdraw + transfer is tight on Solana's 1232-byte tx limit; deferred |
| **Multi-protocol yield** | Adds CPI surface; one well-tested integration first |
| **Multi-reserve selection** | Single hardcoded main USDC reserve in the current release |
| **Atomic withdraw + spend bundling** | Byte-budget challenge; sequential txs for now |
| **Anomaly detection, rate limiting, fraud rules** | Off-thesis for the policy primitive |
| **Python SDK** | TypeScript-first; Python lands when there's user demand |
| **Mobile / React Native bindings** | TypeScript-first |
| **Multi-sig recovery, social recovery** | "Owner pubkey is master" in the current release |
| **KMS migration for secrets** | Environment-based encryption today; runbook for rotation already documented |
| **Dynamic-size allowlists** | Fixed 10 slots in the current release, keeps account size predictable |

## Adding a new yield protocol

This is a structural decision worth calling out: the wallet program **hardcodes the destination program ID** at every CPI site (SPL Token, yield protocol). Adding another integration means:

1. New typed instruction
2. Bit assignment in `allowed_instructions`
3. Hardcoded program ID at the CPI invocation
4. Program upgrade gated by the multisig upgrade authority

The bitmap lists *typed instructions* rather than *program addresses* by design, the program ID is structural, not data. New protocols are a deliberate, audited change, not a runtime knob.

## Read next

* [Risks & Disclosures](risks.md): what's not yet in place and why
* [FAQ](faq.md): common questions about scope
