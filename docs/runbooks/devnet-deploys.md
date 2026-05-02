---
title: Devnet program deployments
purpose: Append-only log of every `agent_wallet` deploy to Solana devnet — program id, slot, authority, deployer, build commit
last_updated: 2026-05-02 (T-116 pending redeploy)
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

### Pending — `owner_transfer_usdc` (T-116) — code merged, redeploy outstanding

- **Build commit**: head of `main` at the time you redeploy (run `anchor build` against a clean checkout — the Cargo.lock that anchor build always re-touches must be ignored, see HANDOVER §6)
- **What this adds**: 1 new instruction `owner_transfer_usdc(amount)` — owner-signed escape hatch that moves USDC out of `vault_usdc_ata` to any recipient ATA. Bypasses session policy entirely; only authorization is `has_one = owner` on the Vault PDA.
- **Why it matters**: makes the non-custodial promise real. Without this, the only on-chain path to extract USDC is `transfer_usdc`, which requires a session signer — i.e. only via klink's backend. With it, the owner can drain via Phantom + raw Solana CLI even if klink is offline.
- **Procedure**:
  ```bash
  # The current single-keypair authority is 6fELFcuc…drjZ — needs that keypair on disk at ~/.config/solana/id.json (or pass --provider.wallet <path>).
  # Devnet upgrade authority must hold ≥ 2 SOL for the upgrade tx (no extra rent — same ProgramData account is realloc'd).
  anchor build
  anchor deploy --provider.cluster devnet
  # On success: append a new "### YYYY-MM-DD-N" row below this one with the resulting slot + tx sig.
  ```
- **Until redeployed**: backend / dashboard wiring for POST `/v1/wallet/transfer` (the T-2xx follow-up) will revert at the on-chain layer with `Error: 0x65` (instruction not found) because the deployed binary is one revision behind. Do that backend wiring AFTER this redeploy, not before.

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
