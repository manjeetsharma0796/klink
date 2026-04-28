---
title: Quickstart
purpose: Hands-on devnet walkthrough — placeholder until T-309 SDK release
last_updated: 2026-04-28
---

# Quickstart

> **TODO**: Full devnet walkthrough lands when the TypeScript SDK ships (task `T-309`). This page will cover the full create-wallet → fund → spend → audit loop end-to-end.

The shape of the eventual quickstart, so you can plan ahead:

## Day 0 — Set up

1. Connect Phantom to a devnet RPC endpoint
2. Sign in to the Klink dashboard (Sign-In With Solana)
3. Create your vault — Phantom signs the sponsored `init_vault` tx
4. Fund the vault — direct USDC transfer to the vault's ATA, or fiat-in via the dashboard

## Day 0 — Hand the agent a key

1. From the dashboard, create a session — pick caps, allowlist, expiry
2. Phantom signs `add_session`
3. Copy the API key (shown once, prefixed `klink_dev_…`) into your agent's environment

## Day 1 — Agent spends

```ts
// Illustrative shape — final API may differ.
// Real surface lands with T-309.
import { KlinkClient } from "@klink/sdk";

const klink = new KlinkClient({ apiKey: process.env.AGENT_API_KEY });

const result = await klink.spend.service({
  slug: "anthropic-claude",
  path: "/v1/messages",
  body: { model: "claude-...", messages: [...] },
  maxAmount: 0.05,
});
```

## Day 1 — Audit

The human reviews `GET /v1/audit` in the dashboard — every allow and every deny, ordered newest-first, with on-chain `tx_signature` for each allowed spend.

## In the meantime

* Read the [Concepts](../concepts/overview.md) and [Architecture](../architecture/overview.md) sections
* Track [T-309](https://github.com/manjeetsharma0796/klink/blob/main/TODO.md) for the SDK release
* See the [Roadmap](../resources/roadmap.md) for what else is in flight
