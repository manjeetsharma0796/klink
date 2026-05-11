---
title: Devnet program deployments
purpose: Append-only log of every `agent_wallet` deploy to Solana devnet — program id, slot, authority, deployer, build commit
last_updated: 2026-05-11 (T-252 redeploy under new program id after upgrade authority loss)
---

# Devnet deploys

Append-only. Newest at top. Each row records the exact deploy-time state so
upgrades + audits can be traced back to a specific build.

## Format

```
### YYYY-MM-DD-N — <one-line summary>
- Program ID: <pubkey>
- ProgramData: <pubkey>
- Authority: <pubkey>
- Deployer: <pubkey>
- Slot: <n>
- Data length: <bytes>
- Build commit: <git sha>
- IDL commit: same as build (Anchor 1.0 ships idl alongside)
- Notes: <anything notable — incidents, why this deploy was needed>
```

## Log

### 2026-05-11-1 — TransferChecked migration **+ new program id** (T-252)

- **Program ID**: `DPPE8TAuw5qyWbw5MqcXcAtH2d5RYF5XBXTiN2pKzM3L` ← **NEW** (old `5qCJCEhfLusk59YFqaEG9Yg3Wp64ZaYwvXteFmCmedqv` is abandoned and unreachable forever; see note below)
- **ProgramData**: `8rDdv1ee9PwTTnaFNrLZKNq42WZyDhCj5gHkyUfNpYpP` (new — fresh deploy, not an upgrade)
- **Authority**: `3kk1MijUXnxt9YDrNTWe2QLF8rsidvNsr7Nkba8Qb4ik` (single-signer; **T-114 Squads multisig rotation is now urgent** — previous authority was lost with Prithwish's laptop, which is exactly the failure mode T-114 was filed to prevent)
- **Deployer**: `3kk1MijUXnxt9YDrNTWe2QLF8rsidvNsr7Nkba8Qb4ik` (same as authority for this fresh deploy)
- **Slot**: 461518660
- **Data length**: 296 064 bytes (no `solana program extend` needed since this is a fresh deploy, not an upgrade)
- **Build commit**: `b4aa1bb` (`T-252: transfer_usdc migrates to SPL TransferChecked`) — TS PROGRAM_ID + Anchor.toml + `declare_id!` swap to the new id lands in a follow-up commit on the same branch
- **All 8 instructions** carried over: `init_vault`, `set_max_deployed_fraction`, `add_session`, `update_session_allowlist`, `revoke_session`, `transfer_usdc` (now SPL `TransferChecked`), `kamino_deposit`, `kamino_withdraw`, `owner_transfer_usdc` (still plain `Transfer` — escape hatch is not verifier-bound; separate follow-up)
- **Cluster**: `https://api.devnet.solana.com`
- **Cost**: ≈ 2.06 SOL of rent on the new ProgramData account + ~0.01 SOL in deploy fees; new authority balance 2.94 SOL after the deploy. Devnet airdrop covered the upfront funding.
- **IDL upload**: failed at deploy time with `[Error] No random values implementation could be found.` — Anchor 1.0's IDL uploader uses `@solana/kit` v6 which requires Node ≥ 20.18 and this box has Node 18.19. The program itself is fully live; klink reads accounts via raw discriminators in `apps/api/src/program/agent-wallet.ts`, not via IDL fetch, so this is non-blocking. If anyone needs on-chain IDL later: bump local Node to ≥ 20, then `anchor idl init -f target/idl/agent_wallet.json DPPE8TAuw5qyWbw5MqcXcAtH2d5RYF5XBXTiN2pKzM3L --provider.cluster devnet`.

**Why a new program id (the part you actually need to know)**: the upgrade authority for the original program `5qCJCEhfLusk59YFqaEG9Yg3Wp64ZaYwvXteFmCmedqv` was a single keypair held by @Prithwish (per `HANDOVER.md:25` until this PR). Prithwish's laptop is gone with the keypair on it. No backup. The Solana BPF upgrade loader requires the authority signature for every upgrade — there is no recovery path, and `solana program set-upgrade-authority --new-upgrade-authority none` cannot be invoked without that same signature. The ~1.93 SOL of rent locked on the old ProgramData account is unrecoverable. Every existing devnet vault/session/Kamino position derived from the old program id is reachable only through the old program (which is frozen at the pre-TransferChecked build); functionally those are abandoned too. For devnet this is acceptable — no mainnet traffic yet (gated on T-114). For mainnet this would have been catastrophic, which is exactly why T-114 (Squads 2-of-N rotation) is now blocker-level urgent rather than backlog. **Do not promote to mainnet** until T-114 lands.

### 2026-05-02-2 — `owner_transfer_usdc` upgrade (T-116)

- **Program ID**: `5qCJCEhfLusk59YFqaEG9Yg3Wp64ZaYwvXteFmCmedqv` (unchanged; in-place upgrade)
- **ProgramData**: `4MjoSCZnixSe167V5yMXtbLTKFEcVJPwQyyNHtDkSmTY` (unchanged; reused after extend)
- **Authority**: `6fELFcucWR7CPrBrRmfAs8tNjvt5dUnQDk3cguAtdrjZ` (unchanged; T-114 multisig rotation still pending)
- **Deployer**: `6fELFcucWR7CPrBrRmfAs8tNjvt5dUnQDk3cguAtdrjZ`
- **Slot**: 459602714
- **Data length**: 289 332 bytes (grew from 276 832 — `solana program extend` by 12 500 bytes was required because the new `.so` is 288 208 bytes vs. 276 832 bytes original)
- **Build commit**: `131ddb0` (`T-116/T-235: tests for the owner escape-hatch path`)
- **Upgrade tx**: `33xsTF1VBScDajnikASKPKjYC3GdoT2PiA7KkNkytw2SM49GUY3YzHaaFoHzdDGLpVigGKbkttYa7GdQqV7famMF`
- **All 9 instructions** now: `init_vault`, `set_max_deployed_fraction`, `add_session`, `update_session_allowlist`, `revoke_session`, `transfer_usdc`, `kamino_deposit`, `kamino_withdraw`, **`owner_transfer_usdc`** ← new
- **Cluster**: `https://api.devnet.solana.com`
- **Cost**: ≈ 0.087 SOL of extra rent (ProgramData balance: 1.928 → 2.015 SOL after extend), ≈ 2.0 SOL spent total from upgrade authority over extend + upgrade
- **Notes**: First time we hit the "ProgramData account not large enough" error on this program. The fix is `solana program extend <PID> <bytes> -u devnet --keypair <auth>` — that prepends rent to ProgramData and lets the upgrade tx succeed. New ceiling for the data slot is 289 332 bytes; future upgrades adding < ~5 KiB will fit without another extend. T-116 escape hatch is live, but T-114 (Squads multisig rotation) still hasn't run, so this binary still trusts a single-keypair authority — do not promote to mainnet.

### 2026-05-02-1 — Initial devnet deploy (T-113)

- **Program ID**: `5qCJCEhfLusk59YFqaEG9Yg3Wp64ZaYwvXteFmCmedqv`
- **ProgramData**: `4MjoSCZnixSe167V5yMXtbLTKFEcVJPwQyyNHtDkSmTY`
- **Authority**: `6fELFcucWR7CPrBrRmfAs8tNjvt5dUnQDk3cguAtdrjZ` (single-signer; multisig rotation tracked in T-114)
- **Deployer**: `6fELFcucWR7CPrBrRmfAs8tNjvt5dUnQDk3cguAtdrjZ` (same as authority for the initial deploy)
- **Slot**: 459431877
- **Data length**: 276 832 bytes
- **Build commit**: `8e9eb05` (`origin/main` at deploy time)
- **All 8 instructions**: `init_vault`, `set_max_deployed_fraction`, `add_session`, `update_session_allowlist`, `revoke_session`, `transfer_usdc`, `kamino_deposit`, `kamino_withdraw`
- **Cluster**: `https://api.devnet.solana.com`
- **Cost**: ≈ 1.93 SOL of rent on the ProgramData account; ≈ 0.04 SOL in tx fees
- **Notes**: First mainnet-ready deploy. Authority is currently a single keypair and must be rotated to a 2-of-N Squads multisig before any production traffic — see T-114. The devnet Kamino reserve is not yet wired into env (T-213's `KAMINO_RESERVE` etc. still empty), so `kamino_deposit` / `kamino_withdraw` will revert with `WrongKaminoProgram` until those are populated against a real Kamino devnet reserve.

## Smoke procedure (run after every deploy)

```bash
# 1. Confirm the program exists at the expected ID
solana program show 5qCJCEhfLusk59YFqaEG9Yg3Wp64ZaYwvXteFmCmedqv -u devnet

# 2. Verify the IDL is accessible
solana account 4MjoSCZnixSe167V5yMXtbLTKFEcVJPwQyyNHtDkSmTY -u devnet

# 3. (Optional, manual) drive a happy-path init_vault → add_session → transfer
#    via the dashboard at apps/web with a Phantom on devnet.
```

## Upgrade procedure (post-multisig rotation, T-114)

After T-114 transfers authority to a Squads 2-of-N:

```bash
# 1. Build
anchor build

# 2. Use squads CLI (or UI) to propose:
anchor deploy --provider.cluster devnet --provider.upgrade-authority <squads-vault>
# This requires off-line signing by N-of-M members.

# 3. After approval lands, append a new row above with the new commit sha + slot.
```
