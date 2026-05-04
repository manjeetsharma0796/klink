---
icon: compass
title: Concepts overview
description: Mental model, three actors, three layers, when to reach for Klink
---

# Concepts overview

Klink is built around one observation: **the credential the agent holds should be the credential with the smallest blast radius.**

To make that work, three actors hold three different credentials, and each is enforced at a different layer.

## Three actors

| Actor | Holds | Lives where | Authority |
|---|---|---|---|
| **Human owner** | Phantom keypair | On the human's device | Master, configures policy, funds the wallet, can revoke any session |
| **Backend** | Session keypair | Encrypted at rest with AES-256-GCM | Delegated, co-signs spend txs, subject to on-chain policy |
| **Agent** | Bearer API key | The agent's environment (`AGENT_API_KEY=…`) | None on-chain, talks to the backend over HTTP |

The agent never gets a Solana keypair. If the agent is compromised, the worst the attacker can do is operate within the session's bounds via the HTTP API, and the human can revoke the session from Phantom in seconds.

## Three layers

| Layer | Tech | What it enforces |
|---|---|---|
| **On-chain** | Anchor program (`agent_wallet`) on Solana | Custody. Hard policy floor, caps, recipient allowlist, expiry, deployed-fraction. Reverts on any violation. |
| **Off-chain control plane** | HTTP API + relational DB + in-memory cache | Rich rules, URL allowlist, time-of-day windows. API surface. Audit-log enrichment. Stateless and horizontally scalable. |
| **Edge** | Phantom (human), session keypair (backend), bearer API key (agent) | Authentication and tx-signing entry points. |

## What lives where

| Concern | Layer |
|---|---|
| USDC custody | On-chain (Vault PDA's USDC ATA) |
| Hard policy (caps, allowlists, expiry, deployed-fraction) | On-chain (Vault + Session accounts) |
| Rich policy (URL allowlist, time-of-day) | Off-chain |
| Session keypair | Off-chain (encrypted) |
| API key → wallet binding | Off-chain (hashed) |
| Audit: on-chain events | On-chain (Solana tx history) |
| Audit: off-chain decisions (allow/deny) | Off-chain |
| Treasury USDC float (fiat-in bridge) | Off-chain (single hot wallet) |

## When to reach for Klink

Klink is a fit when:

- You're running an AI agent that needs to spend USDC on Solana, paid APIs, x402 endpoints, on-chain transfers
- You want **trustless** budget controls, caps and allowlists enforced by an on-chain program, not just by a server you have to trust
- You want an immutable, public audit trail of every spend and every denial
- You want to put idle balance to work without giving up control (manual deposits to a curated USDC reserve)

Klink is **not** a fit when:

- You need automatic yield rebalancing or auto-withdraw before spend ([Roadmap](../resources/roadmap.md))
- You need multi-sig recovery beyond "owner pubkey is master"
- You're building a custodial product (Klink is non-custodial by design)

## Why hybrid (on-chain + off-chain)

| Approach | Problem |
|---|---|
| **Pure on-chain** | Solana programs can't natively express "no spending between 22:00 and 06:00 UTC" without oracles or custom timekeeping. URL allowlists are off-chain by nature. |
| **Pure off-chain** | The whole point of a Solana primitive is trustless safety, if the backend is the only policy authority, the user has to trust the backend. |

Hybrid keeps the safety floor trustless and adds rich rules above it. The on-chain layer is the trustless guarantee; the off-chain layer is enrichment. The worst case if the backend is compromised is bounded by what's already enforced on-chain.

## Read next

- [Vault](vault.md): the on-chain account that holds USDC
- [Sessions](sessions.md): per-agent delegated authority
- [Policies](policies.md): bitmaps and rich rules
- [Architecture](../architecture/overview.md): the same model with diagrams
