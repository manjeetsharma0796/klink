use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod kamino;
pub mod state;

use crate::instructions::*;

declare_id!("5qCJCEhfLusk59YFqaEG9Yg3Wp64ZaYwvXteFmCmedqv");

#[program]
pub mod agent_wallet {
    use super::*;

    pub fn init_vault(ctx: Context<InitVault>, max_deployed_fraction_bp: u16) -> Result<()> {
        instructions::init_vault::init_vault(ctx, max_deployed_fraction_bp)
    }

    pub fn add_session(
        ctx: Context<AddSession>,
        session_pubkey: Pubkey,
        max_per_tx: u64,
        daily_cap: u64,
        expiry: i64,
        allowed_recipients: Vec<Pubkey>,
        allowed_instructions: u32,
    ) -> Result<()> {
        instructions::add_session::add_session(
            ctx,
            session_pubkey,
            max_per_tx,
            daily_cap,
            expiry,
            allowed_recipients,
            allowed_instructions,
        )
    }

    pub fn transfer_usdc(
        ctx: Context<TransferUsdc>,
        amount: u64,
        recipient: Pubkey,
    ) -> Result<()> {
        instructions::transfer_usdc::transfer_usdc(ctx, amount, recipient)
    }

    pub fn revoke_session(ctx: Context<RevokeSession>) -> Result<()> {
        instructions::revoke_session::revoke_session(ctx)
    }

    pub fn set_max_deployed_fraction(
        ctx: Context<SetMaxDeployedFraction>,
        bp: u16,
    ) -> Result<()> {
        instructions::set_max_deployed_fraction::set_max_deployed_fraction(ctx, bp)
    }

    pub fn kamino_deposit(ctx: Context<KaminoDeposit>, amount: u64) -> Result<()> {
        instructions::kamino_deposit::kamino_deposit(ctx, amount)
    }

    pub fn kamino_withdraw(ctx: Context<KaminoWithdraw>, amount: u64) -> Result<()> {
        instructions::kamino_withdraw::kamino_withdraw(ctx, amount)
    }

    pub fn update_session_allowlist(
        ctx: Context<UpdateSessionAllowlist>,
        action: AllowlistAction,
        recipients: Option<Vec<Pubkey>>,
        instructions_bitmap: Option<u32>,
    ) -> Result<()> {
        instructions::update_session_allowlist::update_session_allowlist(
            ctx,
            action,
            recipients,
            instructions_bitmap,
        )
    }
}
