use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount};

use crate::errors::AgentWalletError;
use crate::kamino;
use crate::state::{Session, Vault, KAMINO_DEPOSIT_BIT, MAX_BP};

/// `kamino_deposit(amount)` — Spec §2.3 + §2.5.
///
/// Signer is **either** an active session keypair (with bit 1 of
/// `allowed_instructions` set) **or** the vault owner. The two paths
/// share one accounts struct via `Option<Session>`; passing `None` for
/// the session means the owner is signing.
///
/// Pre-flight per §2.5:
///
/// ```text
/// (vault.deployed_amount + amount) * 10000
///     ≤ vault.max_deployed_fraction_bp * total_balance
/// ```
///
/// where `total_balance = vault_usdc_ata.amount + vault.deployed_amount`.
/// Multiplication form avoids the integer-division precision loss of the
/// spec's `/ total_balance` formulation. `amount` must be ≤ liquid
/// (otherwise the SPL Token transfer inside Kamino's CPI would fail
/// anyway, but failing here saves CU and gives a clearer error).
///
/// On success, the wallet's `deployed_amount` is bumped by `amount` —
/// only after the CPI returns Ok. Kamino mints cTokens into
/// `vault_collateral_ata` representing the deposit + accruing yield.
pub fn kamino_deposit(ctx: Context<KaminoDeposit>, amount: u64) -> Result<()> {
    require!(amount > 0, AgentWalletError::AmountZero);

    // Read-only borrows for auth + pre-flight. Capture the values we need
    // for the CPI's signer seeds before any mutable borrow on `vault`.
    let owner_key = ctx.accounts.vault.owner;
    let bump = ctx.accounts.vault.bump;
    let max_bp = ctx.accounts.vault.max_deployed_fraction_bp;
    let prior_deployed = ctx.accounts.vault.deployed_amount;

    // Auth: session OR owner.
    if let Some(session) = &ctx.accounts.session {
        require_keys_eq!(
            ctx.accounts.auth.key(),
            session.session_pubkey,
            AgentWalletError::SessionSignerMismatch,
        );
        require!(
            (session.allowed_instructions >> KAMINO_DEPOSIT_BIT) & 1 == 1,
            AgentWalletError::InstructionNotAllowed,
        );
    } else {
        require_keys_eq!(
            ctx.accounts.auth.key(),
            owner_key,
            AgentWalletError::NotVaultOwner,
        );
    }

    // Pre-flight liquidity check — `amount > liquid` would make the
    // fraction calc misleading (new_deployed exceeds total).
    let liquid = ctx.accounts.vault_usdc_ata.amount;
    require!(amount <= liquid, AgentWalletError::InsufficientLiquidity);

    let total = liquid
        .checked_add(prior_deployed)
        .ok_or(AgentWalletError::MathOverflow)?;
    let new_deployed = prior_deployed
        .checked_add(amount)
        .ok_or(AgentWalletError::MathOverflow)?;

    let lhs = new_deployed
        .checked_mul(MAX_BP as u64)
        .ok_or(AgentWalletError::MathOverflow)?;
    let rhs = (max_bp as u64)
        .checked_mul(total)
        .ok_or(AgentWalletError::MathOverflow)?;
    require!(lhs <= rhs, AgentWalletError::DeployedFractionExceeded);

    // CPI to Kamino. Vault PDA signs as the source-liquidity owner.
    let vault_seeds: &[&[u8]] = &[b"vault", owner_key.as_ref(), &[bump]];
    let signer_seeds: &[&[&[u8]]] = &[vault_seeds];

    kamino::deposit_reserve_liquidity(
        ctx.accounts.kamino_program.to_account_info(),
        kamino::DepositReserveLiquidityAccounts {
            owner: ctx.accounts.vault.to_account_info(),
            source_liquidity: ctx.accounts.vault_usdc_ata.to_account_info(),
            destination_collateral: ctx.accounts.vault_collateral_ata.to_account_info(),
            reserve: ctx.accounts.kamino_reserve.to_account_info(),
            reserve_liquidity_supply: ctx
                .accounts
                .kamino_reserve_liquidity_supply
                .to_account_info(),
            reserve_collateral_mint: ctx
                .accounts
                .kamino_reserve_collateral_mint
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

    ctx.accounts.vault.deployed_amount = new_deployed;
    Ok(())
}

#[derive(Accounts)]
pub struct KaminoDeposit<'info> {
    /// Session keypair (when `session = Some(_)`) or vault owner (when
    /// `session = None`). The handler picks the auth check at runtime.
    pub auth: Signer<'info>,

    /// Wallet-level state. Writable for the `deployed_amount` bump.
    #[account(
        mut,
        seeds = [b"vault", vault.owner.as_ref()],
        bump = vault.bump,
    )]
    pub vault: Account<'info, Vault>,

    /// Optional session policy. Anchor renders this as an optional
    /// account in the IDL — callers pass either the Session PDA (session
    /// signer path) or `None`/program-id placeholder (owner path).
    #[account(
        seeds = [b"session", vault.key().as_ref(), session.session_pubkey.as_ref()],
        bump = session.bump,
        has_one = vault @ AgentWalletError::SessionVaultMismatch,
    )]
    pub session: Option<Account<'info, Session>>,

    /// Vault USDC ATA — debited.
    #[account(mut, token::authority = vault)]
    pub vault_usdc_ata: Account<'info, TokenAccount>,

    /// Vault cToken (collateral) ATA — credited by Kamino's mint.
    #[account(mut, token::authority = vault)]
    pub vault_collateral_ata: Account<'info, TokenAccount>,

    // ── Kamino accounts ──
    // Layout/flags inferred from the public Kamino source; verified at
    // T-113 devnet smoke against a real reserve. The wallet program does
    // not validate these structurally — Kamino's own program does that
    // on the CPI. The address-check on `kamino_program` is the §2.6
    // typed-instruction safety floor.
    /// CHECK: validated by Kamino on CPI (writable: accrual updates).
    #[account(mut)]
    pub kamino_reserve: UncheckedAccount<'info>,

    /// CHECK: read-only market metadata.
    pub kamino_lending_market: UncheckedAccount<'info>,

    /// CHECK: PDA derived by Kamino.
    pub kamino_lending_market_authority: UncheckedAccount<'info>,

    /// CHECK: reserve's USDC supply ATA (writable: liquidity moves in).
    #[account(mut)]
    pub kamino_reserve_liquidity_supply: UncheckedAccount<'info>,

    /// CHECK: reserve's cToken mint (writable: new cTokens minted).
    #[account(mut)]
    pub kamino_reserve_collateral_mint: UncheckedAccount<'info>,

    /// CHECK: address-pinned to the hardcoded Kamino program. This is
    /// the §2.6 structural guarantee — adding a new yield program means
    /// upgrading this program, not fooling a runtime check.
    #[account(address = kamino::PROGRAM_ID @ AgentWalletError::WrongKaminoProgram)]
    pub kamino_program: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
}
