use anchor_lang::prelude::*;

declare_id!("5qCJCEhfLusk59YFqaEG9Yg3Wp64ZaYwvXteFmCmedqv");

#[program]
pub mod agent_wallet {
    use super::*;

    pub fn initialize(_ctx: Context<Initialize>) -> Result<()> {
        // Stub. Real instructions land in T-103 onward (init_vault, add_session,
        // transfer_usdc, kamino_deposit/withdraw, …). Per the design spec §2.
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
