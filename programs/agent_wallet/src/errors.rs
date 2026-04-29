use anchor_lang::prelude::*;

#[error_code]
pub enum AgentWalletError {
    #[msg("max_deployed_fraction_bp must be in 0..=10000 (100%)")]
    FractionOutOfRange,

    #[msg("recipient count exceeds the fixed allowlist size (10)")]
    TooManyRecipients,

    #[msg("expiry must be 0 (never) or a future unix timestamp")]
    ExpiryInPast,

    #[msg("only the vault owner may sign this instruction")]
    NotVaultOwner,
}
