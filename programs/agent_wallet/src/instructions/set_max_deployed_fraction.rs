use anchor_lang::prelude::*;

use crate::errors::AgentWalletError;
use crate::state::{Vault, MAX_BP};

/// `set_max_deployed_fraction(bp)` — Spec §2.3.
///
/// Owner-only setter for `vault.max_deployed_fraction_bp`. Bounded
/// `0..=10_000` (`MAX_BP`); the cap itself is enforced on-chain at
/// `kamino_deposit` time per §2.5, this instruction only mutates it.
/// Setting `bp = 0` effectively disables further deposits — useful as
/// an emergency unwind switch without rewriting any session policy.
pub fn set_max_deployed_fraction(
    ctx: Context<SetMaxDeployedFraction>,
    bp: u16,
) -> Result<()> {
    require!(bp <= MAX_BP, AgentWalletError::FractionOutOfRange);
    ctx.accounts.vault.max_deployed_fraction_bp = bp;
    Ok(())
}

#[derive(Accounts)]
pub struct SetMaxDeployedFraction<'info> {
    /// Master authority. Must match `vault.owner`.
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [b"vault", owner.key().as_ref()],
        bump = vault.bump,
        has_one = owner @ AgentWalletError::NotVaultOwner,
    )]
    pub vault: Account<'info, Vault>,
}
