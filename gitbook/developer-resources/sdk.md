---
icon: package
title: SDK
description: TypeScript SDK for integrating Klink into your agent application
---

# SDK

A TypeScript SDK is in active development. Once released, integrating Klink into your agent will look like this:

```ts
import { KlinkClient } from "@klink/sdk";

const klink = new KlinkClient({ apiKey: process.env.AGENT_API_KEY });

// Direct USDC transfer to a pre-approved recipient
await klink.spend.transfer({
  recipient: "<base58-pubkey>",
  amount: 500_000, // USDC base units (1 USDC = 1_000_000)
});

// Pay an x402 service inline
const result = await klink.spend.service({
  slug: "openai-chatgpt",
  path: "/v1/chat/completions",
  body: { model: "gpt-4", messages: [/* ... */] },
  maxAmount: 100_000,
});

// Read your vault position
const pos = await klink.yield.position();
```

## What you'll get

- Typed bindings for every Klink API endpoint
- Built-in retry + backoff for cold-start `502`s and transient RPC errors
- Pluggable `fetch` for testing (no global mocks needed)
- Helpful error subclasses (`KlinkApiError` with `status` and `KlinkDenyReason`) so your agent code can branch on the cause cleanly

## Status

🛠️ **Coming soon.** Until the SDK ships, you can integrate against the HTTP API directly — see the [Quickstart](../getting-started/quickstart.md) and the [Agent Skill](../skill.md) page for ready-to-paste `curl` examples covering every endpoint.

## Get notified

Watch the public repo (link will appear here once the SDK is open-sourced) or check the [Roadmap](../resources/roadmap.md) page for milestones.
