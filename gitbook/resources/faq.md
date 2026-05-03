---
icon: circle-help
title: FAQ
description: Frequently asked questions about Klink — custody, fees, audit, scope
---

# FAQ

## Is Klink custodial?

No. The human owner's Phantom keypair is the master authority and never leaves the device. The backend holds session keypairs that have **delegated** authority bounded by on-chain rules — they can't drain the wallet, can't change its policy, and can be revoked by the owner from Phantom in seconds.

## What chain does Klink run on?

Solana. Devnet during the public beta; mainnet support arrives after the program audit completes.

## Why Solana?

Klink's core idea is putting policy directly inside the wallet account so the chain itself enforces it. PDAs make that pattern natural, cheap compute makes per-tx checks practical, sub-cent fees let agents do high-frequency micropayments without cost dominating economics, and fast finality makes session revocation feel instant. See [Introduction](../introduction/what-is-klink.md) for the full positioning.

## What if my session keypair leaks?

The blast radius is bounded by `daily_cap × time-to-revoke` and restricted by the recipient + program allowlists. The owner signs `revoke_session` from Phantom (~5s, ~$0.0001) — works even if the backend is offline.

## What if my owner key leaks?

Total loss, same as any Solana wallet. The owner is the master authority by design; there is no protocol-level recovery in the current release. Treat the Phantom seed phrase the way you'd treat any wallet's seed.

## What if the backend goes down?

Spending, fiat-in, and dashboard reads stop working. **The wallet itself is still functional via direct Phantom interaction** — the human can run `revoke_session` or move funds in an emergency without the backend. The on-chain audit trail also remains queryable from any RPC.

## Has the program been audited?

**Not yet.** External program review is the gating step before mainnet support. See [Risks & Disclosures](risks.md).

## How much does it cost to use?

Account creation is one-time on-chain rent (~$1.20 per active wallet, all refundable on close). Per-transaction fees are sub-cent on Solana. Klink itself is free during the public beta — see [Roadmap](roadmap.md) for the plan beyond beta.

## Does Klink hold my funds?

No. USDC sits in your Vault PDA's ATA on Solana. Only the program can move it, and the program only moves it when called via one of its signed instructions. Klink's backend doesn't have the owner key and can't move funds outside the constraints encoded on the Session account.

## Can I use Klink without yield?

Yes. Set `allowed_instructions` bits 1 and 2 to 0 for any session — that session can `transfer_usdc` but cannot deposit to or withdraw from the yield protocol. Or never call `/v1/yield/*` and the wallet behaves as a pure spend-controlled wallet.

## What's the max number of allowed recipients per session?

Ten. The Session account holds a fixed-size array of 10 `Pubkey` slots. Adding an 11th means picking one to remove (via `update_session_allowlist`). Dynamic-size allowlists are on the [Roadmap](roadmap.md).

## What happens if the yield protocol goes down?

You can't withdraw deployed funds until it recovers. Spending from the **liquid** balance (the part not deposited in yield) is unaffected. Multi-protocol yield is on the [Roadmap](roadmap.md).

## What about KMS for secrets?

Out of scope for the current release. Currently session secrets are AES-256-GCM-encrypted with a master key from environment variables. KMS migration is planned.

## How is this different from a multisig wallet?

Multisig wallets are designed around m-of-n human approvals — great for treasury management. Klink is a **session-delegated wallet for agents**: one human approves a bounded session, the agent operates within it autonomously, the human can revoke at any time. Different shape for a different problem.

## Why isn't auto-yield in the current release?

Three reasons: trust surface (a background cron acting on user funds is a credential the wallet has to hold), liquidity surprises under utilization stress, and atomic-bundle complexity (withdraw + transfer in one Solana tx is tight against the 1232-byte limit). Manual makes liquidity explicit and every yield action attributable. See [Roadmap](roadmap.md).

## Where do I file a bug or feature request?

The public repository link will appear here once the project is open-sourced. Until then, please reach out via the team channel.
