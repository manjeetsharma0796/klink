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

    #[msg("session_signer pubkey does not match session.session_pubkey")]
    SessionSignerMismatch,

    #[msg("session is not bound to the supplied vault")]
    SessionVaultMismatch,

    #[msg("session does not permit this typed instruction (allowed_instructions bit unset)")]
    InstructionNotAllowed,

    #[msg("recipient is not in session.allowed_recipients")]
    RecipientNotAllowed,

    #[msg("recipient token account owner does not match recipient pubkey")]
    RecipientAtaMismatch,

    #[msg("recipient token account mint does not match the vault's mint")]
    WrongMint,

    #[msg("amount exceeds session.max_per_tx")]
    AmountExceedsMaxPerTx,

    #[msg("transfer would exceed session.daily_cap inside the rolling 24h window")]
    DailyCapExceeded,

    #[msg("daily_spent + amount overflowed u64")]
    DailyCapOverflow,

    #[msg("session has expired (now >= session.expiry)")]
    SessionExpired,

    #[msg("amount must be non-zero")]
    AmountZero,

    #[msg("vault does not hold enough liquid balance for this deposit")]
    InsufficientLiquidity,

    #[msg("checked arithmetic overflowed u64")]
    MathOverflow,

    #[msg("deposit would push (deployed + amount) past max_deployed_fraction_bp of total")]
    DeployedFractionExceeded,

    #[msg("supplied kamino_program account does not match the hardcoded Kamino Klend program ID")]
    WrongKaminoProgram,
}
