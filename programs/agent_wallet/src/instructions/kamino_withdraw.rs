use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount};

use crate::errors::AgentWalletError;
use crate::kamino;
use crate::state::{Session, Vault, KAMINO_WITHDRAW_BIT};

/// `kamino_withdraw(amount)` — Spec §2.3 + §2.5 + §5 (partial-liquidity).
///
/// Mirror of `kamino_deposit` — same auth split (session bit 2 OR
/// owner), same hardcoded Kamino program ID, opposite asset flow:
/// burn cTokens out of `vault_collateral_ata`, receive USDC into
/// `vault_usdc_ata`. The arg is the **collateral amount** Kamino burns;
/// the off-chain backend converts USDC target → cToken amount via
/// klend-sdk before signing (T-213).
///
/// Pre-flight per §2.5: `amount ≤ vault.deployed_amount`. Note this
/// pre-flight is loose — `amount` is in cTokens here while
/// `deployed_amount` is in USDC base units; for fresh positions the
/// two are ~1:1, but as the reserve accrues interest cTokens worth
/// slightly more than face value. The check still bounds withdrawal
/// to "no more than what was deposited", which is what matters for
/// the §5 utilization-stress story — the caller cannot ask Kamino to
/// release more than the wallet contributed.
///
/// Per spec §5 "Kamino utilization stress: `kamino_withdraw` returns
/// partial", we read the post-CPI USDC balance delta on the vault's
/// USDC ATA and decrement `deployed_amount` by that **actual** amount
/// (saturating against `deployed_amount` so we never go negative if
/// Kamino somehow returns more than recorded — defensive only).
pub fn kamino_withdraw(ctx: Context<KaminoWithdraw>, amount: u64) -> Result<()> {
    require!(amount > 0, AgentWalletError::AmountZero);

    let owner_key = ctx.accounts.vault.owner;
    let bump = ctx.accounts.vault.bump;
    let prior_deployed = ctx.accounts.vault.deployed_amount;

    // Auth: session OR owner.
    if let Some(session) = &ctx.accounts.session {
        require_keys_eq!(
            ctx.accounts.auth.key(),
            session.session_pubkey,
            AgentWalletError::SessionSignerMismatch,
        );
        require!(
            (session.allowed_instructions >> KAMINO_WITHDRAW_BIT) & 1 == 1,
            AgentWalletError::InstructionNotAllowed,
        );
    } else {
        require_keys_eq!(
            ctx.accounts.auth.key(),
            owner_key,
            AgentWalletError::NotVaultOwner,
        );
    }

    require!(
        amount <= prior_deployed,
        AgentWalletError::AmountExceedsDeployed,
    );

    // Snapshot the vault's USDC balance before the CPI so we can compute
    // how much liquidity Kamino actually returned (may be < requested
    // under utilization stress — spec §5).
    let pre_liquid = ctx.accounts.vault_usdc_ata.amount;

    let vault_seeds: &[&[u8]] = &[b"vault", owner_key.as_ref(), &[bump]];
    let signer_seeds: &[&[&[u8]]] = &[vault_seeds];

    kamino::redeem_reserve_collateral(
        ctx.accounts.kamino_program.to_account_info(),
        kamino::RedeemReserveCollateralAccounts {
            owner: ctx.accounts.vault.to_account_info(),
            source_collateral: ctx.accounts.vault_collateral_ata.to_account_info(),
            destination_liquidity: ctx.accounts.vault_usdc_ata.to_account_info(),
            reserve: ctx.accounts.kamino_reserve.to_account_info(),
            reserve_collateral_mint: ctx
                .accounts
                .kamino_reserve_collateral_mint
                .to_account_info(),
            reserve_liquidity_supply: ctx
                .accounts
                .kamino_reserve_liquidity_supply
                .to_account_info(),
            lending_market: ctx.accounts.kamino_lending_market.to_account_info(),
            lending_market_authority: ctx
                .accounts
                .kamino_lending_market_authority
                .to_account_info(),
            token_program: ctx.accounts.token_program.to_account_info(),
        },
        amount,
        signer_seeds,
    )?;

    // Reload to see Kamino's mutation. `Account<TokenAccount>` doesn't
    // auto-refresh after CPI so without this `vault_usdc_ata.amount`
    // would still be `pre_liquid`.
    ctx.accounts.vault_usdc_ata.reload()?;
    let post_liquid = ctx.accounts.vault_usdc_ata.amount;
    let actual = post_liquid.saturating_sub(pre_liquid);

    // Decrement using the actual delta. `saturating_sub` against the
    // prior value means a refund larger than recorded (shouldn't happen,
    // but defensive) clamps to zero rather than wrapping.
    ctx.accounts.vault.deployed_amount = prior_deployed.saturating_sub(actual);

    Ok(())
}

#[derive(Accounts)]
pub struct KaminoWithdraw<'info> {
    /// Session keypair (when `session = Some(_)`) or vault owner.
    pub auth: Signer<'info>,

    /// Wallet-level state. Writable for the `deployed_amount` decrement.
    #[account(
        mut,
        seeds = [b"vault", vault.owner.as_ref()],
        bump = vault.bump,
    )]
    pub vault: Account<'info, Vault>,

    /// Optional session policy — same shape as `kamino_deposit`.
    #[account(
        seeds = [b"session", vault.key().as_ref(), session.session_pubkey.as_ref()],
        bump = session.bump,
        has_one = vault @ AgentWalletError::SessionVaultMismatch,
    )]
    pub session: Option<Account<'info, Session>>,

    /// Vault USDC ATA — credited by Kamino's transfer.
    #[account(mut, token::authority = vault)]
    pub vault_usdc_ata: Account<'info, TokenAccount>,

    /// Vault cToken (collateral) ATA — debited (burned by Kamino).
    #[account(mut, token::authority = vault)]
    pub vault_collateral_ata: Account<'info, TokenAccount>,

    // ── Kamino accounts ──
    /// CHECK: validated by Kamino on CPI (writable: accrual updates).
    #[account(mut)]
    pub kamino_reserve: UncheckedAccount<'info>,

    /// CHECK: read-only market metadata.
    pub kamino_lending_market: UncheckedAccount<'info>,

    /// CHECK: PDA derived by Kamino.
    pub kamino_lending_market_authority: UncheckedAccount<'info>,

    /// CHECK: reserve's USDC supply ATA (writable: liquidity moves out).
    #[account(mut)]
    pub kamino_reserve_liquidity_supply: UncheckedAccount<'info>,

    /// CHECK: reserve's cToken mint (writable: supply shrinks).
    #[account(mut)]
    pub kamino_reserve_collateral_mint: UncheckedAccount<'info>,

    /// CHECK: address-pinned to the hardcoded Kamino program — §2.6
    /// typed-instruction safety.
    #[account(address = kamino::PROGRAM_ID @ AgentWalletError::WrongKaminoProgram)]
    pub kamino_program: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
}
