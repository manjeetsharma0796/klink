---
title: RPC provider choice
purpose: Compare Helius / QuickNode / Triton for klink's Solana RPC needs and pick a default for dev + staging.
last_updated: 2026-04-28
---

# RPC provider choice (T-401)

## TL;DR

**Pick Helius for dev and staging.** Free tier covers our needs, Solana-native feature set fits the spec, and switching to a paid tier later is a config-only change. QuickNode and Triton are both viable but cost more or are over-spec'd for an MVP.

## What we need from the RPC

| Requirement | Source | Why |
|---|---|---|
| `getAccountInfo`, `sendTransaction`, `simulateTransaction` | every spend / yield endpoint | basic chain reads + writes |
| `getTokenAccountBalance` | T-218 wallet read, T-210 spend pre-flight | liquid USDC ATA balance |
| WebSocket subscriptions | dashboard live balance | reactive UI without polling |
| Solana 1.18.x compatibility | spec / T-101 | matches our Anchor version |
| Devnet + mainnet endpoints | T-113 deploy + future mainnet | one provider, two networks |
| Multi-region or low-latency from IST | team is Indian-timezone-based | <300ms RTT for dev workflow |
| **No required SLA / uptime guarantees for MVP** | hackathon scope | free / cheap tier is fine |

## Comparison

| Feature | Helius | QuickNode | Triton |
|---|---|---|---|
| **Free tier** | 1M credits/month, all endpoints | 10M API calls/month, basic methods only | none — paid only |
| **Cheapest paid tier** | $49/mo (5M credits) | $49/mo (10M calls) | $250/mo (validator-grade) |
| **Solana focus** | yes — only Solana | multi-chain (40+) | yes — only Solana |
| **Specialty methods** | enhanced RPC (DAS API, Priority Fee API, parsed transactions) | generic; specialty methods on enterprise | validator-grade reliability + transaction landing |
| **WebSocket support** | yes, free tier | yes, free tier | yes, paid tier |
| **Geographic regions** | global edge (incl. Mumbai/Singapore) | global edge | US + Europe primary |
| **Webhooks for tx confirmation** | yes (free tier) | yes (paid tier) | no |
| **Best fit for** | Solana dapps with rich-data needs | multi-chain teams | high-volume prod / market-makers |

Sources: vendor pricing pages and public docs as of 2026-04-28. Verify before signup.

## Recommendation

**Helius** for dev and staging. Reasons:

1. **Free tier covers MVP entirely** — 1M credits/month is roughly 200k transactions or 5M reads at typical klink workloads. We're nowhere near that during the 60-day MVP.
2. **DAS API + Priority Fee API** are useful for the dashboard balance view and for setting compute-unit prices on `transfer_usdc` during congested periods.
3. **Mumbai/Singapore edge** keeps RTT low for the IST-based team during dev.
4. **Webhooks free** lets us bolt on real-time tx-confirmation alerts later (replaces polling in T-211 mpp.dev settlement path).
5. **One-click upgrade path** — when we hit the free-tier ceiling, swap the env-var, no code change.

## Setup steps

1. Sign up at [helius.dev](https://helius.dev) — Google login.
2. Create project: name `klink`. Cluster: **devnet** for dev DB; create a separate `klink-mainnet` later if needed.
3. Copy the RPC URL (format: `https://devnet.helius-rpc.com/?api-key=<KEY>`).
4. Paste into shared `.env` as:
   ```
   SOLANA_RPC_URL=https://devnet.helius-rpc.com/?api-key=<KEY>
   ```
5. (Optional) WebSocket URL is the same host with `wss://` scheme; expose as `SOLANA_WS_URL` if/when the dashboard subscribes.

## Fallback plan

If Helius free tier proves insufficient or rate-limits during demo:

1. **First**: bump to Helius $49/mo developer tier. Same code, same env-var.
2. **Second**: add a fallback chain — primary Helius, secondary QuickNode free tier. Adds 5 lines to a tiny `getRpcClient()` helper that round-robins.
3. **Last resort for prod**: Triton, when transaction-landing reliability matters more than cost.

## Open follow-ups

- [ ] Update `apps/api/.env.example` to include `SOLANA_RPC_URL` (do in T-205 when first endpoint actually uses it)
- [ ] Add the live URL to the team's shared `.env` (per `@Jishnu`'s "we'll just share .env" call — same flow as Neon / Upstash)
- [ ] Decide on prod RPC at T-115 / mainnet checkpoint
