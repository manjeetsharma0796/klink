use anchor_lang::prelude::*;

#[error_code]
pub enum AgentWalletError {
    #[msg("max_deployed_fraction_bp must be in 0..=10000 (100%)")]
    FractionOutOfRange,
}
