use anchor_lang::prelude::*;

use crate::errors::AgentWalletError;
use crate::state::{Session, Vault};

/// `revoke_session()` — Spec §2.3.
///
/// Owner-only. Closes the Session account and refunds rent to the owner.
/// The `close = owner` constraint zeros out Anchor's discriminator so the
/// account cannot be re-used after this instruction; a follow-up
/// `add_session` for the same `(vault, session_pubkey)` pair would have
/// to re-init from scratch (and pay rent again).
///
/// Owner can call this without the backend being online — that's the
/// session-key-leak escape hatch in the §1.2 trust table.
pub fn revoke_session(_ctx: Context<RevokeSession>) -> Result<()> {
    Ok(())
}

#[derive(Accounts)]
pub struct RevokeSession<'info> {
    /// Master authority. Must match `vault.owner`. Receives the Session
    /// rent refund via the `close = owner` directive below.
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        seeds = [b"vault", owner.key().as_ref()],
        bump = vault.bump,
        has_one = owner @ AgentWalletError::NotVaultOwner,
    )]
    pub vault: Account<'info, Vault>,

    /// Session to retire. `has_one = vault` proves the session was
    /// registered against this vault — without it a malicious caller
    /// could close any vault's session by signing as their own owner.
    #[account(
        mut,
        close = owner,
        seeds = [b"session", vault.key().as_ref(), session.session_pubkey.as_ref()],
        bump = session.bump,
        has_one = vault @ AgentWalletError::SessionVaultMismatch,
    )]
    pub session: Account<'info, Session>,
}
