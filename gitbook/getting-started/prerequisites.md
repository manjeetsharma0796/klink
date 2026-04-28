---
title: Prerequisites
purpose: What you need before integrating Klink — wallet, RPC, devnet funds, Node toolchain. Source = docs/specs/2026-04-28-agent-wallet-design.md §3.1 + docs/runbooks/dev-environment.md
last_updated: 2026-04-28
---

# Prerequisites

To integrate Klink, you'll need three things on your machine and one thing on Solana devnet.

## On your machine

| Tool | Why | Notes |
|---|---|---|
| **[Phantom](https://phantom.app/)** browser extension | Sign in to the dashboard, sign owner-authority ops | Owner key never leaves the extension |
| **Node 20+** or **[Bun](https://bun.sh/)** | Run the SDK once it's released | Bun is the project's preferred toolchain |
| A Solana **RPC endpoint** | The SDK will need this to read on-chain state | [Helius](https://helius.dev) is the project's recommended provider for dev/staging — see [memo](https://github.com/manjeetsharma0796/klink/blob/main/docs/memos/2026-04-28-rpc-provider.md) |

## On Solana devnet

| Asset | Why | How to get it |
|---|---|---|
| **Devnet SOL** | Pays transaction fees | `solana airdrop 1` (Solana CLI) or any public faucet |
| **Devnet USDC** | Test token your vault will custody | Mint a test USDC SPL token, or use one of the public devnet faucets |

> **TODO**: Pin the canonical devnet USDC mint address once T-113 (devnet deploy) lands. Until then, use any devnet SPL-token mint of your choice for testing.

## You do NOT need

* **A custodial provider account.** Klink is non-custodial; there's no Klink account to register for.
* **A backend service.** When the SDK ships, you'll point it at a hosted Klink backend (or run your own).
* **A mainnet wallet.** Mainnet is gated on T-115 (external program review) — see [Roadmap](../resources/roadmap.md).

## What ships when

Klink's developer surface lands across several tasks tracked in [TODO.md](https://github.com/manjeetsharma0796/klink/blob/main/TODO.md):

| Surface | Task | Status as of 2026-04-28 |
|---|---|---|
| Anchor program (devnet) | T-102 → T-113 | T-102 done; downstream in progress |
| Backend HTTP API | T-201 → T-217 | T-201 done; T-2xx mid-build |
| Dashboard | T-301 → T-308 | T-301, T-302 done |
| TypeScript SDK | T-309 | Pending |

## Read next

* **[Quickstart](quickstart.md)** — the hands-on devnet walkthrough (gated on T-309 SDK release)
* **[Concepts → Overview](../concepts/overview.md)** — read this while you wait
