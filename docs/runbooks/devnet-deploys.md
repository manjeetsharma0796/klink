---
title: Devnet program deployments
purpose: Append-only log of every `agent_wallet` deploy to Solana devnet — program id, slot, authority, deployer, build commit
last_updated: 2026-05-02
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
