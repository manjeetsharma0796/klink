---
title: Welcome to Klink
purpose: Public-facing landing page for the Klink developer documentation
last_updated: 2026-04-28
---

# Welcome to Klink

**Klink is a non-custodial Solana smart-wallet for AI agents.** It pairs an on-chain policy engine (caps, allowlists, expiry, deployed-fraction) with off-chain rich rules (URL allowlist, time-of-day windows) and treats Solana transaction history as the audit trail by default.

If you build agents that spend, this is the wallet between your agent and its money.

## Three actors, three blast radii

| Actor | Holds | Authority | If credential leaks |
|---|---|---|---|
| **Human owner** | Phantom keypair on-device | Master — configures policy, funds wallet, can revoke any session | Total loss (same as any Solana wallet) |
| **Backend** | Session keypair (Postgres, AES-256-GCM) | Delegated — co-signs spend txs subject to on-chain policy | Bounded by `daily_cap` × time-to-revoke; restricted by recipient + program allowlists |
| **Agent** | Bearer API key | None on-chain — talks to the backend over HTTP | Zero direct on-chain risk |

The agent never crosses the trust boundary. The session keypair stays in the backend, never on the agent's machine. The owner key never leaves the human's device.

## Read in this order

1. **[What is Klink?](introduction/what-is-klink.md)** — niche, value proposition, why Solana
2. **[How it works](introduction/how-it-works.md)** — the three-layer model in one page
3. **[Concepts → Overview](concepts/overview.md)** — mental model and vocabulary
4. **[Architecture → System Overview](architecture/overview.md)** — diagrams, what lives where
5. **[Getting Started → Prerequisites](getting-started/prerequisites.md)** — what you need to integrate

## Status

Pre-mainnet. Currently devnet-only. The Anchor program is in active development; the TypeScript SDK is not yet released. See [Roadmap](resources/roadmap.md) for the path to mainnet and [Risks](resources/risks.md) for the honest disclosure of where we are.

## Source of truth

The Anchor program, account layouts, and validator logic described here mirror the [internal design spec](https://github.com/manjeetsharma0796/klink/blob/main/docs/specs/2026-04-28-agent-wallet-design.md). When this site and the spec disagree, the spec wins — file an issue and we will update.
