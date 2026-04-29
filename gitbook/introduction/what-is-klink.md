---
title: What is Klink?
purpose: Klink positioning, headline value, what you get, why Solana
last_updated: 2026-04-29
---

# What is Klink?

When an AI agent spends your money, three things should be true:

1. **You can't be drained beyond a cap.** Even if the agent is compromised,
   the loss is bounded by limits you set in advance.
2. **You can audit every action.** Every spend and every blocked attempt,
   with the same permanence as a bank statement.
3. **The agent's credentials can't break the rules.** "The agent leaked its
   key, then ran wild" should not be a category of failure.

Klink makes those true on Solana.

## How

A non-custodial smart-wallet for AI agents:

- The **human owner** holds a Phantom keypair. They configure policy,
  fund the wallet, and can revoke any session in seconds.
- The **backend** holds a session keypair (encrypted at rest) that co-signs
  every spend, subject to on-chain rules.
- The **agent** holds nothing but an HTTP API key — zero on-chain authority.
  Even if the agent is fully compromised, the worst it can do is operate
  within the session's bounds.

The rules — caps, allowlists, expiry, deployed-fraction — are enforced by
an Anchor program on Solana. The chain reverts any spend that violates
them. Off-chain, richer rules (URL allowlists, time-of-day windows) layer
above.

Solana transaction history is the audit trail by default. Free to query,
immutable, no log files to tamper with.

## What you get

| You're building | Klink gives you |
|---|---|
| An agent that pays for APIs | Per-tx + per-day caps, recipient allowlist, time-of-day windows. Signed by a session keypair the agent never holds. |
| An agent that needs to be auditable | Solana tx history as source of truth — no log tampering, no selective deletion, queryable from any RPC. |
| An agent with idle USDC | Manual deposits to Kamino's main USDC reserve, with an on-chain over-deployment cap. |
| A team that needs revoke-on-incident | Owner-signed `revoke_session` from Phantom. ~5s, ~$0.0001. Works without the backend. |

## Why Solana

Klink's core idea — policy living *inside* the account — works because of
how Solana is built:

- **Account model + PDAs.** A wallet that owns its policy is the natural
  pattern, not a workaround.
- **Cheap compute.** Running policy checks on every spend is feasible
  without per-tx fees blowing up.
- **Sub-cent fees.** Agents can do high-frequency micropayments and the
  cost still rounds to noise.
- **Fast finality.** Owner-revoked sessions take effect in seconds.

## Status

Pre-mainnet. Devnet-only. The Anchor program is in active development;
the TypeScript SDK is not yet released.

Read on:

- **[How it works](how-it-works.md)** — the three-layer model in one page
- **[Concepts](../concepts/overview.md)** — vocabulary you'll see across these docs
- **[Roadmap](../resources/roadmap.md)** — what's in MVP, what's next
- **[Risks](../resources/risks.md)** — what to know before relying on this for non-trivial value
