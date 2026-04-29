//! Kamino Klend integration helpers — Spec §2.6.
//!
//! The wallet program hardcodes Kamino's program ID at every CPI
//! invocation site. Adding another yield protocol (MarginFi, Drift, …)
//! requires a program upgrade gated by the multisig upgrade authority
//! (T-114). That structural pin is what makes `allowed_instructions` a
//! bitmap of *typed* instructions rather than a list of program IDs —
//! the program is fixed by code, not by transaction data.

use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    instruction::{AccountMeta, Instruction},
    program::invoke_signed,
};

/// Kamino Klend program ID. Identical on mainnet-beta and devnet
/// (verified against the public Kamino-Finance/klend repository).
pub const PROGRAM_ID: Pubkey = pubkey!("KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD");

/// Anchor discriminator for `deposit_reserve_liquidity`. Re-derive with
/// `echo -n "global:deposit_reserve_liquidity" | sha256sum | head -c 16`.
pub const DEPOSIT_RESERVE_LIQUIDITY_DISC: [u8; 8] =
    [0xa9, 0xc9, 0x1e, 0x7e, 0x06, 0xcd, 0x66, 0x44];

/// Anchor discriminator for `redeem_reserve_collateral` (the withdraw
/// path — burn cTokens, receive underlying liquidity). Re-derive with
/// `echo -n "global:redeem_reserve_collateral" | sha256sum | head -c 16`.
pub const REDEEM_RESERVE_COLLATERAL_DISC: [u8; 8] =
    [0xea, 0x75, 0xb5, 0x7d, 0xb9, 0x8e, 0xdc, 0x1d];

/// Borrowed-account collection for the `deposit_reserve_liquidity` CPI.
/// Field order and metadata flags must match Kamino's
/// `DepositReserveLiquidity` Accounts struct exactly.
pub struct DepositReserveLiquidityAccounts<'info> {
    /// Authority that owns `source_liquidity`. The vault PDA in our case;
    /// signed via `invoke_signed` with `["vault", owner]` seeds.
    pub owner: AccountInfo<'info>,
    /// Source token account holding the liquidity (USDC). Writable.
    pub source_liquidity: AccountInfo<'info>,
    /// Destination cToken account for the receipt. Writable.
    pub destination_collateral: AccountInfo<'info>,
    /// Reserve account. Writable — Kamino updates accrued interest here.
    pub reserve: AccountInfo<'info>,
    /// Reserve's underlying liquidity supply ATA. Writable.
    pub reserve_liquidity_supply: AccountInfo<'info>,
    /// Reserve's collateral cToken mint. Writable — Kamino mints new
    /// cTokens to `destination_collateral`.
    pub reserve_collateral_mint: AccountInfo<'info>,
    /// Lending market metadata. Read-only.
    pub lending_market: AccountInfo<'info>,
    /// Lending-market authority PDA (Kamino-derived). Read-only.
    pub lending_market_authority: AccountInfo<'info>,
    /// SPL Token program (legacy v1 — USDC's native program).
    pub token_program: AccountInfo<'info>,
}

/// CPI to Kamino `deposit_reserve_liquidity(liquidity_amount)`. Caller
/// supplies signer seeds for the `owner` account (the vault PDA seeds).
///
/// Account flags / order are inferred from the public Kamino source —
/// any drift surfaces at devnet smoke-test (T-113) before mainnet.
pub fn deposit_reserve_liquidity<'info>(
    program: AccountInfo<'info>,
    accounts: DepositReserveLiquidityAccounts<'info>,
    liquidity_amount: u64,
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    let mut data = Vec::with_capacity(16);
    data.extend_from_slice(&DEPOSIT_RESERVE_LIQUIDITY_DISC);
    data.extend_from_slice(&liquidity_amount.to_le_bytes());

    let metas = vec![
        AccountMeta::new_readonly(accounts.owner.key(), true),
        AccountMeta::new(accounts.source_liquidity.key(), false),
        AccountMeta::new(accounts.destination_collateral.key(), false),
        AccountMeta::new(accounts.reserve.key(), false),
        AccountMeta::new(accounts.reserve_liquidity_supply.key(), false),
        AccountMeta::new(accounts.reserve_collateral_mint.key(), false),
        AccountMeta::new_readonly(accounts.lending_market.key(), false),
        AccountMeta::new_readonly(accounts.lending_market_authority.key(), false),
        AccountMeta::new_readonly(accounts.token_program.key(), false),
    ];

    let ix = Instruction {
        program_id: PROGRAM_ID,
        accounts: metas,
        data,
    };

    let infos = [
        accounts.owner,
        accounts.source_liquidity,
        accounts.destination_collateral,
        accounts.reserve,
        accounts.reserve_liquidity_supply,
        accounts.reserve_collateral_mint,
        accounts.lending_market,
        accounts.lending_market_authority,
        accounts.token_program,
        program,
    ];

    invoke_signed(&ix, &infos, signer_seeds).map_err(Into::into)
}

/// Borrowed-account collection for `redeem_reserve_collateral`. Field
/// order and metadata flags must match Kamino's
/// `RedeemReserveCollateral` Accounts struct exactly. Source/destination
/// roles are swapped vs deposit — collateral is burned, liquidity flows
/// back to the vault.
pub struct RedeemReserveCollateralAccounts<'info> {
    /// Authority that owns `source_collateral`. Vault PDA in our case;
    /// signed via `invoke_signed` with `["vault", owner]` seeds.
    pub owner: AccountInfo<'info>,
    /// Source token account holding cTokens to burn. Writable.
    pub source_collateral: AccountInfo<'info>,
    /// Destination token account receiving the liquidity (USDC). Writable.
    pub destination_liquidity: AccountInfo<'info>,
    /// Reserve account. Writable — Kamino updates accrued interest here.
    pub reserve: AccountInfo<'info>,
    /// Reserve's collateral cToken mint. Writable — supply shrinks.
    pub reserve_collateral_mint: AccountInfo<'info>,
    /// Reserve's underlying liquidity supply ATA. Writable — funds out.
    pub reserve_liquidity_supply: AccountInfo<'info>,
    /// Lending market metadata. Read-only.
    pub lending_market: AccountInfo<'info>,
    /// Lending-market authority PDA (Kamino-derived). Read-only.
    pub lending_market_authority: AccountInfo<'info>,
    /// SPL Token program (legacy v1).
    pub token_program: AccountInfo<'info>,
}

/// CPI to Kamino `redeem_reserve_collateral(collateral_amount)`. Caller
/// supplies signer seeds for the `owner` account (the vault PDA seeds).
///
/// **Returned liquidity may be less than requested** under utilization
/// stress per spec §5 — caller should read the post-CPI balance delta
/// on `destination_liquidity` rather than assume `collateral_amount`
/// equates to the USDC received.
pub fn redeem_reserve_collateral<'info>(
    program: AccountInfo<'info>,
    accounts: RedeemReserveCollateralAccounts<'info>,
    collateral_amount: u64,
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    let mut data = Vec::with_capacity(16);
    data.extend_from_slice(&REDEEM_RESERVE_COLLATERAL_DISC);
    data.extend_from_slice(&collateral_amount.to_le_bytes());

    let metas = vec![
        AccountMeta::new_readonly(accounts.owner.key(), true),
        AccountMeta::new(accounts.source_collateral.key(), false),
        AccountMeta::new(accounts.destination_liquidity.key(), false),
        AccountMeta::new(accounts.reserve.key(), false),
        AccountMeta::new(accounts.reserve_collateral_mint.key(), false),
        AccountMeta::new(accounts.reserve_liquidity_supply.key(), false),
        AccountMeta::new_readonly(accounts.lending_market.key(), false),
        AccountMeta::new_readonly(accounts.lending_market_authority.key(), false),
        AccountMeta::new_readonly(accounts.token_program.key(), false),
    ];

    let ix = Instruction {
        program_id: PROGRAM_ID,
        accounts: metas,
        data,
    };

    let infos = [
        accounts.owner,
        accounts.source_collateral,
        accounts.destination_liquidity,
        accounts.reserve,
        accounts.reserve_collateral_mint,
        accounts.reserve_liquidity_supply,
        accounts.lending_market,
        accounts.lending_market_authority,
        accounts.token_program,
        program,
    ];

    invoke_signed(&ix, &infos, signer_seeds).map_err(Into::into)
}
