---
title: Pricing model
purpose: Compare flat fee / % of policy-gated volume / free-then-enterprise; recommend a default for the 60-day MVP.
last_updated: 2026-04-28
---

# Pricing model (T-505)

## TL;DR

**Free during the 60-day MVP. Charge later.** Specifically: free + open-source for individuals; introduce an enterprise tier post-MVP for teams that need shared dashboards, SSO, multi-sig owner keys, and prod-grade SLAs. Don't charge for the wallet primitive itself.

For the 60-day window: focus on adoption. The Solana Frontier hackathon is a distribution event, not a revenue event. Charging early adds friction for zero benefit.

## What we're pricing

The product surface that could be priced:

| Surface | Who uses it | Price-able? |
|---|---|---|
| Anchor program | direct devs | no — open-source MIT/Apache (see T-115 follow-up) |
| Backend HTTP API | hosted as a service for teams that don't self-host | yes |
| Dashboard | hosted UI | yes (paired with backend) |
| TS SDK | dapp developers | no — open-source |
| Telemetry / audit log retention | observability surface | yes (paid tier feature) |

Anchor program + SDK are non-pricable: they're the primitive. Open-sourcing aligns with the Solana ecosystem and makes the program upgrade-authority multisig (T-114) actually meaningful.

What we *can* price: the hosted backend + dashboard (the convenience layer for teams that don't want to run their own infra).

## Three options

### Option A — Flat fee per active wallet

Example: $5/wallet/month, regardless of usage.

| Pros | Cons |
|---|---|
| Predictable for buyer | Punishes light use; rewards spam-creators (~$0 marginal cost to us per wallet) |
| Easy to forecast revenue | Mismatched with value — heavy users pay the same as dormant ones |
| Simplest implementation | Encourages "consolidate to one wallet per team" anti-pattern |

### Option B — Percentage of policy-gated volume

Example: 1% of every USDC transfer routed through the policy enforcer.

| Pros | Cons |
|---|---|
| Aligns incentives — we win when users win | Volatile revenue; hackathon = ~$0 volume ⇒ ~$0 revenue |
| Scales with usage automatically | Eats into agent margins; competes with mpp.dev's per-call fees on top |
| Industry-familiar (resembles Stripe / payment-rail pricing) | Crypto-treasury accounting is annoying for buyers — they pay in USDC but report in USD |

### Option C — Free + enterprise tier

Free: open-source backend self-host + free hosted backend with rate limits + community-tier dashboard.

Enterprise (post-MVP): $499–$2999/month for:
- Multi-tenant dashboard with team accounts + SSO (Google Workspace, Okta)
- Multi-sig owner key support (Squads integration on the human side)
- 99.9% SLA on hosted backend
- Audit log retained 1 year+ (free tier: 30 days)
- Priority support / dedicated Slack channel
- Optional: bring-your-own-RPC + KMS (T-208 v2)

| Pros | Cons |
|---|---|
| Friction-free adoption — gets us to "10 demos at hackathon" without billing | Revenue starts at $0; first paid customer probably 3-6 months out |
| Enterprise tier targets actual willingness-to-pay (compliance, multi-team, SLA) | Requires building enterprise-only features (SSO, multi-sig) — not in 60-day scope |
| Dovetails with open-source program licensing | Risks "free forever" expectation if not careful with positioning |

## Comparison

| Dimension | Flat | % volume | Free + enterprise |
|---|---|---|---|
| Time-to-first-revenue | week 1 | depends on volume | months |
| Hackathon-friendly | mid (charging deters trial) | mid (low volume = low revenue) | **high** |
| Aligns with usage | no | yes | half — enterprise aligns, free is binary |
| Building cost | low | medium (analytics, billing) | medium (enterprise features later) |
| Defensibility | low | low (competitor undercuts on %) | high (enterprise integrations are sticky) |
| Compatible with open-source program | yes | yes | **best fit** |

## Recommendation

**Option C — Free + enterprise tier.** Stage the rollout:

| Phase | What | When |
|---|---|---|
| **MVP (60 days)** | Free hosted backend with rate limits (10 req/min/wallet); free dashboard; open-source SDK + program | now |
| **Phase 2 (post-hackathon)** | Add enterprise tier behind a "Contact sales" link; build SSO + multi-sig + SLA tooling | weeks 9–16 |
| **Phase 3 (real revenue)** | First 1-3 paying enterprise customers; refine pricing based on what they actually pay | weeks 16+ |

What this commits us to **right now**:

- [ ] Don't put a paywall on anything during the hackathon
- [ ] Don't add billing infra (no Stripe integration in MVP; T-214 Dodo is for *user* funding, not for our pricing)
- [ ] Open-source the Anchor program with the multisig upgrade authority (already in T-114)
- [ ] Keep the hosted backend single-tenant per dev — the multi-tenant work is the enterprise wedge

What this **doesn't** commit us to:

- The exact enterprise price point — figure that out when there's a buyer in front of us
- Any specific competitor positioning — Locus / Skyfire / Crossmint / Privy / Coinbase CDP all have different pricing; we don't need to mirror any of them yet

## What kills this recommendation

- **A clear paying customer signals during the hackathon** — if a real team says "I'd pay $X for this today," reconsider Option B (% volume) for that customer specifically. Don't ignore signal for ideology.
- **Hosting costs balloon** — if free hosted backend ends up costing >$500/month before any revenue, switch to "free open-source self-host, paid hosted." The backend code is simple enough to self-host.

## Decision hook

Revisit at the end of week 8. If hackathon goes well and we're on a fundraising path, the pricing model becomes part of the pitch. If we're shipping into a quieter market, free-forever might be the right call indefinitely (with enterprise as the only revenue line).
