---
title: Glossary
purpose: Terms used across the Klink documentation
last_updated: 2026-04-28
---

# Glossary

Terms are listed alphabetically. Where a term has a deeper page, the entry links to it.

## Allowlist

A fixed-size on-chain list (10 slots) of recipient public keys a session may pay. Any recipient not in the list is rejected by the program. See [Sessions](../concepts/sessions.md).

## ATA — Associated Token Account

The conventional address at which an SPL token (like USDC) is held for a given owner. The vault's USDC ATA is derived from the vault PDA and the USDC mint. See `spl-associated-token-account` in the Solana SPL repos.

## Anchor

Rust framework for writing Solana programs (`coral-xyz/anchor`). Klink's on-chain program is written in Anchor 1.0.

## Bitmap (allowed_instructions)

A 32-bit field on the Session account where each bit gates a specific spending instruction (`transfer_usdc`, `kamino_deposit`, `kamino_withdraw`, …). See [Sessions](../concepts/sessions.md).

## Bump

A single byte appended to the seeds when deriving a PDA, chosen so the result is off the ed25519 curve. Stored on the account so the program can re-derive without searching.

## CPI — Cross-Program Invocation

A Solana program calling into another program. Klink CPIs into the SPL Token Program (for `transfer_usdc`) and Kamino (for `kamino_deposit` / `kamino_withdraw`), with hardcoded program IDs at every site.

## Daily cap

The total USDC a session may spend in a 24-hour rolling window. Reset the first time a transfer fires after `now ≥ daily_window_start + 86400`. See [Budgets](../concepts/budgets.md).

## Deployed-fraction cap (`max_deployed_fraction_bp`)

Hard cap on the fraction of total USDC the wallet may have deposited in Kamino at any moment. Stored in basis points on the Vault PDA. See [Yield](../concepts/yield.md).

## Devnet

Solana's developer test network. Klink targets devnet during MVP build. Mainnet deploy is gated on T-115 (external program review).

## Kamino

Solana lending protocol. Klink's MVP integrates with Kamino's main USDC reserve via `kamino_deposit` / `kamino_withdraw` instructions.

## MPP — Machine Payments Protocol

`mpp.dev` — open HTTP-402 standard co-developed by Tempo and Stripe. Multi-chain. Klink's curated service catalog uses MPP to route paid agent calls.

## On-chain audit trail

Solana's built-in transaction history, treated by Klink as the source of truth for spend / yield / revocation history. See [Audit Trail](../concepts/audit-trail.md).

## PDA — Program Derived Address

A Solana account address derived from seeds + program ID, with no associated private key. The Anchor program signs for it via `invoke_signed`. Klink's Vault and Session accounts are PDAs.

## Phantom

The browser wallet used by the human owner. Holds the owner keypair on-device. Signs every owner-authority instruction (`init_vault`, `add_session`, `revoke_session`, …).

## Session

A per-agent on-chain account that delegates a bounded slice of the vault's authority (caps, allowlists, expiry, instruction bitmap). See [Sessions](../concepts/sessions.md).

## Session keypair

The Solana keypair the backend holds for each session. Stored encrypted (AES-256-GCM) in Postgres. Signs every spend tx.

## SIWS — Sign-In With Solana

The human auth flow: server issues a nonce, Phantom signs a message containing the nonce, server verifies and issues a JWT. Replaces username/password.

## SPL Token

Solana's fungible-token program. USDC on Solana is an SPL token. `transfer_usdc` is a CPI into the SPL Token Program.

## USDC

The stablecoin Klink custodies. On Solana, it's an SPL token issued by Circle. The vault holds USDC via its ATA.

## Vault PDA

The on-chain account that owns the wallet's USDC ATA and stores wallet-level policy (`max_deployed_fraction_bp`, `deployed_amount`). See [Vault PDA](../concepts/vault-pda.md).

## x402

HTTP status code (402 Payment Required) and an emerging payments protocol around it. Klink supports both curated x402 services (via mpp.dev catalog) and user-registered custom x402 endpoints.
