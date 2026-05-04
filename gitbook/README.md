---
icon: hand-wave
title: Welcome to Klink
description: A non-custodial Solana smart-wallet for AI agents, spend caps, allowlists, audit trails by default
---

# Welcome to Klink

**Klink is a non-custodial Solana smart-wallet for AI agents.** It pairs an on-chain policy engine (caps, allowlists, expiry, deployed-fraction) with off-chain rich rules (URL allowlist, time-of-day windows) and treats Solana transaction history as the audit trail by default.

If you build agents that spend, this is the wallet between your agent and its money.

## Three actors, three blast radii

| Actor | Holds | Authority | If credential leaks |
|---|---|---|---|
| **Human owner** | Phantom keypair on-device | Master, configures policy, funds wallet, can revoke any session | Total loss (same as any Solana wallet) |
| **Backend** | Session keypair (encrypted at rest) | Delegated, co-signs spend txs subject to on-chain policy | Bounded by `daily_cap` × time-to-revoke; restricted by recipient + program allowlists |
| **Agent** | Bearer API key | None on-chain, talks to the backend over HTTP | Zero direct on-chain risk |

The agent never crosses the trust boundary. The session keypair stays in the backend, never on the agent's machine. The owner key never leaves the human's device.

## What you'll find here

- **[Introduction](introduction/what-is-klink.md)**: what Klink is, who it's for, why Solana
- **[Quickstart](getting-started/quickstart.md)**: sign in, create a vault, hand an agent a key, audit a spend
- **[Core Concepts](concepts/overview.md)**: Vault, Sessions, Policies, Budgets, Audit Trail, Yield
- **[Architecture](architecture/overview.md)**: the three-layer model with diagrams
- **[Developer Resources](developer-resources/sdk.md)**: SDK, CLI, and the agent skill
- **[Reference](resources/glossary.md)**: glossary, FAQ, security disclosures, roadmap

## Status

Klink is in **beta on Solana devnet**. The on-chain program enforces every policy described in these docs; the dashboard, HTTP API, and agent skill are live. The SDK and CLI are on the way, see [Roadmap](resources/roadmap.md). For mainnet readiness, see [Risks & Disclosures](resources/risks.md).
