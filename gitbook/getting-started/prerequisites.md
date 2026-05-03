---
icon: list-checks
title: Prerequisites
description: What you need before integrating Klink — wallet, RPC, devnet funds, toolchain
---

# Prerequisites

To integrate Klink, you'll need three things on your machine and one thing on Solana devnet.

## On your machine

| Tool | Why | Notes |
|---|---|---|
| **[Phantom](https://phantom.app/)** browser extension | Sign in to the dashboard, sign owner-authority operations | Owner key never leaves the extension |
| **Node 20+** or **[Bun](https://bun.sh/)** | Run the SDK once it's released, or run your agent code | Bun is the project's preferred toolchain |
| A Solana **RPC endpoint** | Read on-chain state, submit transactions | Any reliable provider works — [Helius](https://helius.dev), [QuickNode](https://www.quicknode.com), [Triton](https://triton.one), or the public devnet RPC for testing |

## On Solana devnet

| Asset | Why | How to get it |
|---|---|---|
| **Devnet SOL** | Pays transaction fees | `solana airdrop 1` (Solana CLI) or any [public faucet](https://faucet.solana.com/) |
| **Devnet USDC** | Test token your vault will custody | Mint a test USDC SPL token, or use one of the public devnet faucets |

## You do NOT need

- **A custodial provider account.** Klink is non-custodial — there's no Klink account to register for.
- **A backend service.** Point your code at the hosted Klink API (`https://klink-api.onrender.com` during beta), or run your own.
- **A mainnet wallet.** Mainnet support arrives after the program audit completes — see [Roadmap](../resources/roadmap.md).

## Read next

- **[Quickstart](quickstart.md)** — the hands-on devnet walkthrough
- **[Concepts → Overview](../concepts/overview.md)** — the mental model
