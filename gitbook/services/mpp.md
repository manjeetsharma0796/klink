---
icon: list
title: MPP services on Solana
description: MPP-protocol services your klink agent can pay, plus how to build your own.
---

# MPP services on Solana

> **Human-readable view:** [app.klinkdotfun.live/services](https://app.klinkdotfun.live/services) renders this same table with the klink brand chrome. Both surfaces read this file as their single source of truth, so they never drift.

[MPP (Machine Payments Protocol)](https://paymentauth.org/draft-httpauth-payment-00.html) is the Payment auth scheme that lets HTTP services charge per call. klink's `POST /v1/spend/mpp` handles the full round trip: probe -> parse 402 challenge -> sign + submit a `TransferChecked` on Solana -> retry the URL with the right `Authorization: Payment` header -> forward the upstream response. One HTTP call from your agent's perspective, one on-chain payment, one receipt.

This page lists MPP services on Solana that klink agents are verified to pay end to end, and how to spin up your own.

## Services your agent can pay

| Service | URL | Network | Price | Recipient | Status | Last verified |
|---|---|---|---|---|---|---|
| **Klink MPP Echo** | [`https://service01-kep9.onrender.com/echo`](https://service01-kep9.onrender.com/echo) | Solana devnet | 0.01 USDC | `81eM3oPR1fUJSsFhNm6G51W4jwE2HondS2kjBmcxFcJ2` | live | 2026-05-12 |

To pay one from your klink agent:

```bash
curl -X POST -H "Authorization: Bearer $KLINK_API_KEY" \
  -H "content-type: application/json" \
  -d '{
    "url": "https://service01-kep9.onrender.com/echo",
    "max_amount": 100000,
    "method": "GET"
  }' \
  https://api.klinkdotfun.live/v1/spend/mpp
```

`max_amount: 100000` is **0.10 USDC** in base units (6 decimals), the cap above which klink refuses to pay even if the merchant quotes higher. The response is the merchant's upstream payload; the response headers include `x-tx-signature` (Solana tx) and `payment-receipt` (merchant-issued receipt). See the [Agent Skill](../skill.md) for the full request and error shape.

### How to list yours

Open a PR to `gitbook/services/mpp.md` adding a row to the table above. Required fields:

* **Service**: short human name + one-line description (in the PR description, not the cell)
* **URL**: the paid endpoint
* **Network**: `Solana devnet` or `Solana mainnet-beta`
* **Price**: in human-readable USDC, e.g. `0.05 USDC`
* **Recipient**: base58 pubkey that receives payments (must match what the 402 challenge advertises)
* **Status**: `live` or `experimental`
* **Last verified**: ISO date you last smoked it end to end

We smoke-test before merging: GET your URL, expect `402 + WWW-Authenticate: Payment method="solana"`, decode the `request` field, confirm `currency` matches the canonical USDC mint for the named network, and run a real `POST /v1/spend/mpp` against it. If the round trip lands `200 + payment-receipt`, the row goes in.

## Build your own MPP service on Solana

The minimum viable MPP-on-Solana merchant is about 100 lines of TypeScript on [Hono](https://hono.dev/) with two npm dependencies: [`mppx`](https://www.npmjs.com/package/mppx) (the server framework) and [`@solana/mpp`](https://www.npmjs.com/package/@solana/mpp) (the Solana method builder). The reference implementation klink itself pays is open source:

* **Reference repo**: [github.com/manjeetsharma0796/service01](https://github.com/manjeetsharma0796/service01)

### Five-step setup

1. **Generate a recipient keypair**. Save the pubkey; you'll advertise it as `SOLANA_RECIPIENT`. Use [Phantom](https://phantom.app) on Testnet or `solana-keygen new`.
2. **Clone the reference repo** and copy `.env.example` to `.env`. Set:
   * `SOLANA_RECIPIENT=<your pubkey>`
   * `ADVERTISE=devnet`
   * `ASSET=usdc`
   * `MPP_SECRET_KEY=<openssl rand -base64 32>` (optional but recommended; stable challenge URLs across restarts)
3. **Run locally**: `bun install && bun run dev`. Visit `http://localhost:3000/echo`. You should see a `402 + WWW-Authenticate: Payment` response.
4. **Deploy**. The repo includes a `render.yaml` Render blueprint and a `Dockerfile`. Render free-tier works; Vercel functions and Fly.io are also fine.
5. **Verify against klink**. Use the curl in the "Services" section above with your URL.

### Caveat for smart-contract wallets (klink, Squads, Phoenix, Drift)

klink moves USDC out of its program-derived vault via a CPI from the agent_wallet program. The `TransferChecked` instruction ends up nested inside an outer Anchor instruction, not at the top level. Stock `@solana/mpp` (<= 0.5.x) only inspects outer instructions when verifying the payment, so klink's payments fail verification by default.

If you want to accept payments from any program-mediated wallet (and you should, that's the future), patch `node_modules/@solana/mpp/dist/server/Charge.js` so its `verifyInstructions` walk flattens `tx.transaction.message.instructions` together with `tx.meta.innerInstructions`. service01 does this via a [`scripts/patch-mpp-inner-ixs.ts`](https://github.com/manjeetsharma0796/service01/blob/main/scripts/patch-mpp-inner-ixs.ts) postinstall hook; the patch is idempotent and ~20 LOC. The upstream issue should be filed on `@solana/mpp` so this stops biting other smart-contract wallets; until it lands, the postinstall patch is the workaround.

### Token mints to use

| Network | USDC mint |
|---|---|
| Solana devnet | `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` (Circle test) |
| Solana mainnet-beta | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` (Circle production) |

## External references

* **MPP / paymentauth.org spec** - [paymentauth.org/draft-httpauth-payment-00.html](https://paymentauth.org/draft-httpauth-payment-00.html). The IETF-style RFC for the Payment auth scheme. Read this first if you're implementing from scratch.
* **`@solana/mpp` SDK** - [npmjs.com/package/@solana/mpp](https://www.npmjs.com/package/@solana/mpp). Solana method builder for `mppx` servers, includes the `server/Charge.ts` your verifier wraps.
* **`mppx` server framework** - [npmjs.com/package/mppx](https://www.npmjs.com/package/mppx). Hono / Express / Fastify integrations for the 402 challenge flow.
* **mpp.dev** - [mpp.dev](https://mpp.dev). Protocol docs, payment-method tables, "MPP vs x402" comparison.
* **mpp.dev/services** - [mpp.dev/services](https://mpp.dev/services). Cross-chain registry of MPP services. Register your Solana service here too so agents that don't yet know about klink can still discover you.
* **mppscan.com** - [mppscan.com](https://mppscan.com). Per-chain indexer; treat as analogous to chain explorers for MPP-enabled APIs.
