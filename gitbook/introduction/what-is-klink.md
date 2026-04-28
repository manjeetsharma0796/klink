---
title: What is Klink?
purpose: Positioning, niche, headline value, why Solana. Source = CONTEXT.md §5–§7
last_updated: 2026-04-28
---

# What is Klink?

**Klink is a non-custodial Solana smart-wallet for AI agents** with on-chain policy controls and an audit trail by default.

The headline is best-in-class budget controls + on-chain audit, with **manual deposits to Kamino's main USDC reserve** as a Solana-specific yield differentiator.

If you build agents that spend, this is the wallet between your agent and its money.

## The niche

Three observations shape what Klink is:

1. **The payment protocol is solved.** [Machine Payments Protocol (mpp.dev)](https://mpp.dev) — co-developed by Tempo and Stripe — is multi-chain native, free, open. Anyone can run a Solana MPP server today. So a "facilitator on Solana" play has very low protocol-level moat.
2. **Centralized spend controls already exist.** [Locus](https://paywithlocus.com) on Base offers a custodial wallet with three policy knobs (allowance, max-tx, approval threshold). It works — but it's server-side, custodial, and requires you to trust the provider.
3. **The Solana-native primitive is missing.** Putting policy on-chain (caps, allowlists, expiry, deployed-fraction) is structurally cleaner on Solana than on EVM, because PDAs make custom-account-with-policy programs the natural pattern. EVM needs ERC-4337 + Safe modules to approximate the same thing.

Klink fills that gap: **a Solana program that enforces budget controls trustlessly, with rich rules layered above it off-chain.**

## What we are NOT building

We deliberately rejected "Locus on Solana" — see [CONTEXT.md §6](https://github.com/manjeetsharma0796/klink/blob/main/CONTEXT.md) for the full rationale. Short version:

| Locus surface | Why we don't clone it |
|---|---|
| Custodial wallet | US money-transmitter regulation; inferior to non-custodial Squads vaults already on Solana |
| Wrapped APIs marketplace | BD-bound; can't ship 40 providers in 60 days; price-taker once Locus integrates Solana |
| x402 gateway | x402 is Coinbase's protocol; Coinbase ships first-party x402 on Solana |
| MPP service catalog | Already multi-chain native; owned by Stripe + Tempo |
| Server-side policy engine | Strictly inferior to on-chain Solana enforcement |

What's salvageable from that surface — developer experience, pricing UX, audit dashboards — is bundled around the **wallet primitive**, not as a standalone product.

## Why Solana specifically

* **On-chain policy is structurally cleaner.** Solana's account model + PDAs make custom-account-with-policy programs the natural pattern.
* **Compute is cheap.** Running policy checks per tx is feasible without per-tx fee blow-up.
* **Sub-cent fees.** Agents can do high-frequency micropayments without per-tx cost dominating economics.
* **Sponsor alignment.** Phantom, Coinbase CDP, Privy, Swig, Arcium all benefit from a standardized agent-wallet primitive on SVM.

## What you get

| You're building | Klink gives you |
|---|---|
| An agent that pays for APIs | Per-tx + per-day caps, recipient allowlist, time-of-day windows, signed by a session keypair the agent never holds |
| An agent that needs to be auditable | Solana tx history as the source of truth — no log tampering, no selective deletion |
| An agent with idle USDC | Manual deposits to Kamino's main USDC reserve, with an on-chain over-deployment cap |
| A team that needs revoke-on-incident | Owner-signed `revoke_session` from Phantom, ~5s, ~$0.0001 — works without the backend |

## Status today

Pre-mainnet. Devnet-only. The Anchor program is in active development; the TypeScript SDK is not yet released.

Read on:

* **[How it works](how-it-works.md)** — the three-layer model in one page
* **[Concepts](../concepts/overview.md)** — the vocabulary
* **[Roadmap](../resources/roadmap.md)** — what's in MVP, what's next
* **[Risks](../resources/risks.md)** — what to know before relying on this for non-trivial value
