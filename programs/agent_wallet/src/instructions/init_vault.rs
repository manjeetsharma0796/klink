use anchor_lang::prelude::*;

use crate::errors::AgentWalletError;
use crate::state::{Vault, MAX_BP};

/// `init_vault(max_deployed_fraction_bp)` — Spec §2.3.
///
/// Creates the per-owner Vault PDA. `payer` covers rent (sponsored model:
/// the dashboard backend pays for new wallets); `owner` is the master
/// authority and must sign so a third-party payer cannot create a vault
/// in someone else's name.
///
/// Reverts on duplicate init via Anchor's `init` constraint
/// (account-already-exists, error code 0).
pub fn init_vault(ctx: Context<InitVault>, max_deployed_fraction_bp: u16) -> Result<()> {
    require!(
        max_deployed_fraction_bp <= MAX_BP,
        AgentWalletError::FractionOutOfRange,
    );

    let vault = &mut ctx.accounts.vault;
    vault.owner = ctx.accounts.owner.key();
    vault.max_deployed_fraction_bp = max_deployed_fraction_bp;
    vault.deployed_amount = 0;
    vault.bump = ctx.bumps.vault;
    Ok(())
}

#[derive(Accounts)]
pub struct InitVault<'info> {
    /// Sponsor / fee payer. Almost always the dashboard backend in production;
    /// can be the same key as `owner` when a human pays directly.
    #[account(mut)]
    pub payer: Signer<'info>,

    /// Master authority of the vault. Must sign — proves consent to
    /// vault creation under this pubkey.
    pub owner: Signer<'info>,

    #[account(
        init,
        payer = payer,
        space = 8 + Vault::SIZE,
        seeds = [b"vault", owner.key().as_ref()],
        bump,
    )]
    pub vault: Account<'info, Vault>,

    pub system_program: Program<'info, System>,
}
