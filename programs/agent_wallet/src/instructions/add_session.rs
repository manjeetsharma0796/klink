use anchor_lang::prelude::*;

use crate::errors::AgentWalletError;
use crate::state::{Session, Vault, MAX_RECIPIENTS};

/// `add_session(session_pubkey, max_per_tx, daily_cap, expiry,
///              allowed_recipients, allowed_instructions)` — Spec §2.3.
///
/// Owner-only. Creates a per-agent `Session` PDA bound to the caller's
/// `Vault`. The `session_pubkey` is the off-chain backend-held keypair —
/// a plain `Pubkey` argument, not a signer (the backend is never present
/// on chain at session-creation time; only the owner is).
///
/// Reverts on duplicate creation via Anchor's `init` constraint
/// (PDA already exists for `(vault, session_pubkey)`).
pub fn add_session(
    ctx: Context<AddSession>,
    session_pubkey: Pubkey,
    max_per_tx: u64,
    daily_cap: u64,
    expiry: i64,
    allowed_recipients: Vec<Pubkey>,
    allowed_instructions: u32,
) -> Result<()> {
    require!(
        allowed_recipients.len() <= MAX_RECIPIENTS,
        AgentWalletError::TooManyRecipients,
    );

    let now = Clock::get()?.unix_timestamp;
    require!(
        expiry == 0 || expiry > now,
        AgentWalletError::ExpiryInPast,
    );

    let session = &mut ctx.accounts.session;
    session.vault = ctx.accounts.vault.key();
    session.session_pubkey = session_pubkey;
    session.max_per_tx = max_per_tx;
    session.daily_cap = daily_cap;
    session.daily_spent = 0;
    session.daily_window_start = now;
    session.expiry = expiry;

    // Pack the variable-length input into the fixed-size on-chain array;
    // unused slots stay `Pubkey::default()` so they can never match a real
    // recipient via a comparison loop in `transfer_usdc` (T-105).
    let mut packed = [Pubkey::default(); MAX_RECIPIENTS];
    for (slot, addr) in packed.iter_mut().zip(allowed_recipients.iter()) {
        *slot = *addr;
    }
    session.allowed_recipients = packed;
    session.allowed_recipients_count = allowed_recipients.len() as u8;

    session.allowed_instructions = allowed_instructions;
    session.bump = ctx.bumps.session;
    Ok(())
}

#[derive(Accounts)]
#[instruction(session_pubkey: Pubkey)]
pub struct AddSession<'info> {
    /// Sponsor / fee payer. Almost always the dashboard backend in
    /// production; can be the same key as `owner` when a human pays
    /// directly. Pays rent for the new `Session` account.
    #[account(mut)]
    pub payer: Signer<'info>,

    /// Master authority — must match `vault.owner` (enforced by `has_one`)
    /// and must sign so a sponsor cannot register sessions in someone
    /// else's vault.
    pub owner: Signer<'info>,

    #[account(
        seeds = [b"vault", owner.key().as_ref()],
        bump = vault.bump,
        has_one = owner @ AgentWalletError::NotVaultOwner,
    )]
    pub vault: Account<'info, Vault>,

    #[account(
        init,
        payer = payer,
        space = 8 + Session::SIZE,
        seeds = [b"session", vault.key().as_ref(), session_pubkey.as_ref()],
        bump,
    )]
    pub session: Account<'info, Session>,

    pub system_program: Program<'info, System>,
}
