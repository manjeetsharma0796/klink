use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked};

use crate::errors::AgentWalletError;
use crate::state::{Session, Vault, SECONDS_PER_DAY, TRANSFER_USDC_BIT};

/// `transfer_usdc(amount, recipient)` — Spec §2.3 + §2.5.
///
/// Session-signed. The session keypair (held off-chain by the backend)
/// must match `session.session_pubkey`. Five reverts are enforced before
/// any CPI:
///
/// 1. `allowed_instructions` bit 0 (`transfer_usdc`) is set.
/// 2. `recipient` ∈ `session.allowed_recipients`.
/// 3. `amount ≤ session.max_per_tx`.
/// 4. Rolling-24h cap: if `now ≥ daily_window_start + 86400`, reset the
///    window first; then `daily_spent + amount ≤ daily_cap`.
/// 5. `session.expiry == 0 || now < session.expiry`.
///
/// CPI to SPL Token Program via `TransferChecked` (opcode 12) with the
/// vault PDA as transfer authority (signed via `["vault", owner]` seeds).
/// The mint + decimals travel on-wire so off-chain receipt verifiers
/// (MPP, x402, Solana Pay) can validate without racy ATA lookups, and
/// the SPL Token program reverts if `mint.decimals` mismatches the
/// supplied mint — defense in depth against lookalike-token swaps.
/// Memo / payment-id is added off-chain via a separate SPL Memo
/// instruction in the same tx, keeping this handler focused on the
/// on-chain policy floor.
pub fn transfer_usdc(
    ctx: Context<TransferUsdc>,
    amount: u64,
    recipient: Pubkey,
) -> Result<()> {
    // Pre-flight: session signer matches the policy account's bound pubkey.
    require_keys_eq!(
        ctx.accounts.session_signer.key(),
        ctx.accounts.session.session_pubkey,
        AgentWalletError::SessionSignerMismatch,
    );

    let session = &mut ctx.accounts.session;

    // Revert 1 — typed-instruction bit (§2.4).
    require!(
        (session.allowed_instructions >> TRANSFER_USDC_BIT) & 1 == 1,
        AgentWalletError::InstructionNotAllowed,
    );

    // Revert 2 — recipient ∈ allowlist. Slice over the populated range so
    // the unused `Pubkey::default()` slots can never match a real address.
    let count = session.allowed_recipients_count as usize;
    require!(
        session.allowed_recipients[..count].contains(&recipient),
        AgentWalletError::RecipientNotAllowed,
    );

    // Revert 3 — per-tx cap.
    require!(
        amount <= session.max_per_tx,
        AgentWalletError::AmountExceedsMaxPerTx,
    );

    // Revert 4 — rolling-24h cap. Reset the window in-place if expired.
    let now = Clock::get()?.unix_timestamp;
    if now >= session.daily_window_start.saturating_add(SECONDS_PER_DAY) {
        session.daily_window_start = now;
        session.daily_spent = 0;
    }
    let new_spent = session
        .daily_spent
        .checked_add(amount)
        .ok_or(AgentWalletError::DailyCapOverflow)?;
    require!(
        new_spent <= session.daily_cap,
        AgentWalletError::DailyCapExceeded,
    );

    // Revert 5 — expiry. `0` means never expires (matches `add_session`).
    require!(
        session.expiry == 0 || now < session.expiry,
        AgentWalletError::SessionExpired,
    );

    // CPI — SPL Token transfer signed by the Vault PDA. Authority seeds
    // are reconstructed from `vault.owner` + cached `vault.bump` so we
    // skip another `find_program_address` call.
    let owner_key = ctx.accounts.vault.owner;
    let bump = ctx.accounts.vault.bump;
    let vault_seeds: &[&[u8]] = &[b"vault", owner_key.as_ref(), &[bump]];
    let signer_seeds: &[&[&[u8]]] = &[vault_seeds];

    let cpi_accounts = TransferChecked {
        from: ctx.accounts.vault_usdc_ata.to_account_info(),
        mint: ctx.accounts.mint.to_account_info(),
        to: ctx.accounts.recipient_usdc_ata.to_account_info(),
        authority: ctx.accounts.vault.to_account_info(),
    };
    // Anchor 1.0 took `CpiContext::new_with_signer`'s first arg from
    // `AccountInfo` to `Pubkey` (program id). `anchor_spl::token::transfer_checked`
    // ignores the program id internally — it hardcodes `spl_token::ID` —
    // but we pass the bound program key for correctness/IDL consistency.
    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.key(),
        cpi_accounts,
        signer_seeds,
    );
    token::transfer_checked(cpi_ctx, amount, ctx.accounts.mint.decimals)?;

    // State update — only after the CPI succeeds. `daily_spent` is the
    // source-of-truth tally; off-chain pre-flight reads this.
    session.daily_spent = new_spent;

    Ok(())
}

#[derive(Accounts)]
#[instruction(amount: u64, recipient: Pubkey)]
pub struct TransferUsdc<'info> {
    /// Backend-held session keypair. Verified against `session.session_pubkey`
    /// in the handler — Anchor's `has_one`/`address` constraints don't
    /// fit cleanly when the comparison field isn't named after the account.
    pub session_signer: Signer<'info>,

    /// Per-agent policy. Mutable because `daily_spent` and
    /// `daily_window_start` are updated on success. `has_one = vault`
    /// proves the supplied Vault is the one this session was registered
    /// against — without it a malicious caller could pair a high-cap
    /// session with a different vault's USDC ATA.
    #[account(
        mut,
        seeds = [b"session", vault.key().as_ref(), session.session_pubkey.as_ref()],
        bump = session.bump,
        has_one = vault @ AgentWalletError::SessionVaultMismatch,
    )]
    pub session: Account<'info, Session>,

    /// Wallet-level state. PDA seeds re-derived to harden against an
    /// account swap; `vault.bump` cached.
    #[account(
        seeds = [b"vault", vault.owner.as_ref()],
        bump = vault.bump,
    )]
    pub vault: Account<'info, Vault>,

    /// USDC mint. Validated to match `vault_usdc_ata.mint` so the supplied
    /// mint cannot be a substitute. `decimals` is read from this account
    /// and passed to the SPL `TransferChecked` CPI so the SPL Token
    /// program itself reverts on any decimals mismatch.
    #[account(
        constraint = mint.key() == vault_usdc_ata.mint @ AgentWalletError::WrongMint,
    )]
    pub mint: Account<'info, Mint>,

    /// Vault's USDC ATA. Owned by the vault PDA; CPI authority.
    #[account(
        mut,
        token::authority = vault,
    )]
    pub vault_usdc_ata: Account<'info, TokenAccount>,

    /// Destination ATA. Owner must equal the runtime `recipient` arg, and
    /// mint must match the vault's ATA — together they prove funds land
    /// at an allowlisted recipient's USDC account, not just any token
    /// account that happens to share the mint.
    #[account(
        mut,
        constraint = recipient_usdc_ata.owner == recipient @ AgentWalletError::RecipientAtaMismatch,
        constraint = recipient_usdc_ata.mint == vault_usdc_ata.mint @ AgentWalletError::WrongMint,
    )]
    pub recipient_usdc_ata: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}
