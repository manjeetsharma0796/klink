---
title: T-116 owner_transfer_usdc — revert-suite test cases
purpose: Inputs + expected outcomes for the three rust integration tests called out in T-116's acceptance line, ready for T-110 (Manish) to fold into the broader revert suite.
last_updated: 2026-05-02
---

# T-116 — `owner_transfer_usdc` test cases

The acceptance line on T-116 names exactly three required tests:

> Tests in T-110's revert suite: owner-signs-success, non-owner-signs-fails, vault.owner mismatch fails.

This file pins the inputs + expected outcomes so they're not lost while
T-110 is still being scaffolded. Drop these into whichever harness T-110
ends up using (`solana-program-test`, `litesvm`, anchor-ts on a local
validator — all three work with this matrix).

## Setup (shared across all 3 cases)

```text
USDC mint   = a freshly initialized SPL mint, 6 decimals
owner       = Keypair.generate()
vault       = PDA derived as ["vault", owner.pubkey] under PROGRAM_ID
vault_usdc  = ATA(vault, usdc_mint, allowOwnerOffCurve = true)
recipient   = Keypair.generate()       (regular wallet, not a PDA)
recipient_usdc = ATA(recipient, usdc_mint)

bootstrap:
  init_vault(owner, max_deployed_fraction_bp=0)
  mint 10 USDC (10_000_000 base units) into vault_usdc
```

## Case 1 — `owner_signs_success`

| Field | Value |
|---|---|
| Signer | `owner` |
| `vault` | the bootstrapped vault |
| `vault_usdc_ata` | `vault_usdc` |
| `recipient_usdc_ata` | `recipient_usdc` |
| `amount` (arg) | `1_000_000` (1 USDC) |

**Expected**: tx confirms; `vault_usdc` balance drops by 1 USDC; `recipient_usdc` balance increases by 1 USDC. No state change to the `Vault` PDA itself (this instruction has no on-chain accounting, unlike `transfer_usdc` which mutates `session.daily_spent`).

## Case 2 — `non_owner_signs_fails`

| Field | Value |
|---|---|
| Signer | `attacker = Keypair.generate()` (not the vault's owner) |
| `vault` | the bootstrapped vault (still references the real `owner`) |
| `vault_usdc_ata` | `vault_usdc` |
| `recipient_usdc_ata` | `recipient_usdc` |
| `amount` (arg) | `1_000_000` |

**Expected**: tx **reverts** with Anchor `ConstraintHasOne` (on-chain code 2001 in Anchor 1.0) carrying the custom message *"only the vault owner may sign this instruction"* — that's `AgentWalletError::NotVaultOwner`, mapped via `has_one = owner @ NotVaultOwner` in the Accounts struct. The `attacker` keypair must be in the signers list (otherwise the framework rejects on missing signer before the constraint runs).

## Case 3 — `vault_owner_mismatch_fails`

The PDA seeds bind `vault` to a single owner. To reach this case construct a vault for `owner_a`, then submit the instruction with `signer = owner_a` but pass a *different* `Vault` account whose stored `vault.owner` is `owner_b`. Specifically:

```text
owner_a = Keypair.generate()    → vault_a (PDA from ["vault", owner_a])
owner_b = Keypair.generate()    → vault_b (PDA from ["vault", owner_b])

bootstrap both via init_vault(...)
```

| Field | Value |
|---|---|
| Signer | `owner_a` |
| `vault` | `vault_b` (NOT `vault_a`) |
| `vault_usdc_ata` | `ATA(vault_b, usdc_mint, ...)` |
| `recipient_usdc_ata` | `recipient_usdc` |
| `amount` (arg) | `1_000_000` |

**Expected**: tx **reverts**, but the actual error code depends on which constraint fires first. Two paths in `OwnerTransferUsdc<'info>`:

1. The `seeds = [b"vault", vault.owner.as_ref()], bump = vault.bump` constraint re-derives the PDA from `vault.owner` (= `owner_b`). Since the supplied account *is* `vault_b`, the seeds match and this passes.
2. Then `has_one = owner @ NotVaultOwner` checks `vault.owner == accounts.owner.key()`. `vault_b.owner = owner_b`, but the signer is `owner_a` — this fails with `NotVaultOwner`.

So the error is the same as Case 2 (`ConstraintHasOne` / `NotVaultOwner`), just hit via the cross-vault attack path rather than a stranger trying to sign their own keypair against a vault they don't own. **Both cases proving distinct attack vectors are caught by the single `has_one = owner` gate is the point of this test** — not redundant.

## What's deliberately NOT tested here

- `WrongMint` revert: the `recipient_usdc_ata.mint == vault_usdc_ata.mint` constraint. Worth a fourth case but not in the acceptance line; add as Case 4 if T-110 wants full coverage.
- `AmountZero`: trivially small; can land as a one-liner in T-110 if desired.
- Lamport accounting / rent: `OwnerTransferUsdc` doesn't allocate or close any accounts, so there's no rent path to test.

## Why these tests can't run today

The deployed devnet binary (program id `5qCJCEhfLusk59YFqaEG9Yg3Wp64ZaYwvXteFmCmedqv`) is one revision behind the on-chain code in `programs/agent_wallet/src/instructions/owner_transfer_usdc.rs` — the `anchor deploy` upgrade is logged as Pending in `docs/runbooks/devnet-deploys.md`. Either run the cases against a local `solana-test-validator` with a freshly-built `target/deploy/agent_wallet.so`, or wait until the devnet upgrade lands and target devnet directly.
