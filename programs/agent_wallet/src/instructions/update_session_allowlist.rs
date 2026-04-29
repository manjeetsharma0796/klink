use anchor_lang::prelude::*;

use crate::errors::AgentWalletError;
use crate::state::{Session, Vault, MAX_RECIPIENTS};

/// Mutation kind for `update_session_allowlist`. Spec §2.3 — owner can
/// `Add` recipients to the existing allowlist, `Remove` specific ones,
/// or wholesale `Set` the list (matches dashboard editor flows in T-305).
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum AllowlistAction {
    Add,
    Remove,
    Set,
}

/// `update_session_allowlist(action, recipients?, instructions_bitmap?)` —
/// Spec §2.3. Owner-only mutation of session policy bounds post-creation.
///
/// `recipients` and `instructions_bitmap` are independently optional —
/// passing only the bitmap (recipients = None) is a no-op on the
/// allowlist; passing only recipients leaves the bitmap alone. The
/// `action` enum applies to the recipient list only:
///
/// - `Add`    — append each recipient (skipping duplicates already
///              present); errors with `TooManyRecipients` if it would
///              push the populated count past `MAX_RECIPIENTS`.
/// - `Remove` — drop each listed recipient from the allowlist; missing
///              entries are silently ignored (idempotent).
/// - `Set`    — replace the allowlist wholesale; `recipients.len()`
///              must be ≤ `MAX_RECIPIENTS`. An empty Vec clears the
///              list (valid — effectively pauses spending).
pub fn update_session_allowlist(
    ctx: Context<UpdateSessionAllowlist>,
    action: AllowlistAction,
    recipients: Option<Vec<Pubkey>>,
    instructions_bitmap: Option<u32>,
) -> Result<()> {
    let session = &mut ctx.accounts.session;

    if let Some(recipients) = recipients {
        match action {
            AllowlistAction::Set => {
                require!(
                    recipients.len() <= MAX_RECIPIENTS,
                    AgentWalletError::TooManyRecipients,
                );
                let mut packed = [Pubkey::default(); MAX_RECIPIENTS];
                for (slot, addr) in packed.iter_mut().zip(recipients.iter()) {
                    *slot = *addr;
                }
                session.allowed_recipients = packed;
                session.allowed_recipients_count = recipients.len() as u8;
            }
            AllowlistAction::Add => {
                let mut count = session.allowed_recipients_count as usize;
                for addr in recipients.iter() {
                    if session.allowed_recipients[..count].contains(addr) {
                        // Already present — no-op for this entry.
                        continue;
                    }
                    require!(
                        count < MAX_RECIPIENTS,
                        AgentWalletError::TooManyRecipients,
                    );
                    session.allowed_recipients[count] = *addr;
                    count += 1;
                }
                session.allowed_recipients_count = count as u8;
            }
            AllowlistAction::Remove => {
                // Compact survivors into a fresh array to keep the
                // unused slots as `Pubkey::default()` — `transfer_usdc`'s
                // slice walk relies on that invariant.
                let mut compacted = [Pubkey::default(); MAX_RECIPIENTS];
                let mut new_count = 0usize;
                let old_count = session.allowed_recipients_count as usize;
                for i in 0..old_count {
                    let addr = session.allowed_recipients[i];
                    if !recipients.contains(&addr) {
                        compacted[new_count] = addr;
                        new_count += 1;
                    }
                }
                session.allowed_recipients = compacted;
                session.allowed_recipients_count = new_count as u8;
            }
        }
    }

    if let Some(bitmap) = instructions_bitmap {
        session.allowed_instructions = bitmap;
    }

    Ok(())
}

#[derive(Accounts)]
pub struct UpdateSessionAllowlist<'info> {
    /// Master authority. Must match `vault.owner`.
    pub owner: Signer<'info>,

    #[account(
        seeds = [b"vault", owner.key().as_ref()],
        bump = vault.bump,
        has_one = owner @ AgentWalletError::NotVaultOwner,
    )]
    pub vault: Account<'info, Vault>,

    #[account(
        mut,
        seeds = [b"session", vault.key().as_ref(), session.session_pubkey.as_ref()],
        bump = session.bump,
        has_one = vault @ AgentWalletError::SessionVaultMismatch,
    )]
    pub session: Account<'info, Session>,
}
