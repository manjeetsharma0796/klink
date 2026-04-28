use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;

use crate::instructions::*;

declare_id!("5qCJCEhfLusk59YFqaEG9Yg3Wp64ZaYwvXteFmCmedqv");

#[program]
pub mod agent_wallet {
    use super::*;

    pub fn init_vault(ctx: Context<InitVault>, max_deployed_fraction_bp: u16) -> Result<()> {
        instructions::init_vault::init_vault(ctx, max_deployed_fraction_bp)
    }
}
