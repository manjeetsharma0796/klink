use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::errors::AgentWalletError;
use crate::state::Vault;

/// `owner_transfer_usdc(amount)` — Spec §5 escape hatch.
///
/// Owner-signed direct USDC move out of the vault. Bypasses every
/// session-policy gate (no allowlist, no per-tx cap, no daily cap, no
/// instruction-bitmap, no expiry) because this is the path the human uses
/// when the backend has disappeared and they want their funds back via
/// Phantom + a generic Solana CLI. The only check is `has_one = owner` on
/// the Vault PDA — i.e. the signer must be the registered owner.
///
/// `transfer_usdc` (T-105) is hard-bound to `session_signer: Signer<'info>`,
/// so without this instruction the owner has no on-chain path to extract
/// USDC from `vault_usdc_ata`. With it, the wallet stays usable as a plain
/// Solana account even if klink shuts down — that's the non-custodial
/// promise.
pub fn owner_transfer_usdc(ctx: Context<OwnerTransferUsdc>, amount: u64) -> Result<()> {
    require!(amount > 0, AgentWalletError::AmountZero);

    let owner_key = ctx.accounts.vault.owner;
    let bump = ctx.accounts.vault.bump;
    let vault_seeds: &[&[u8]] = &[b"vault", owner_key.as_ref(), &[bump]];
    let signer_seeds: &[&[&[u8]]] = &[vault_seeds];

    let cpi_accounts = Transfer {
        from: ctx.accounts.vault_usdc_ata.to_account_info(),
        to: ctx.accounts.recipient_usdc_ata.to_account_info(),
        authority: ctx.accounts.vault.to_account_info(),
    };
    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.key(),
        cpi_accounts,
        signer_seeds,
    );
    token::transfer(cpi_ctx, amount)?;

    Ok(())
}

#[derive(Accounts)]
pub struct OwnerTransferUsdc<'info> {
    /// The human's Phantom keypair. `has_one = owner` on `vault` proves
    /// this signer is the vault's registered owner — that's the only
    /// authorization gate (deliberately).
    pub owner: Signer<'info>,

    /// Wallet-level state. PDA seeds re-derived to harden against an
    /// account swap; `vault.bump` cached. `has_one = owner` is the
    /// access-control check that makes this safe without a session.
    #[account(
        seeds = [b"vault", vault.owner.as_ref()],
        bump = vault.bump,
        has_one = owner @ AgentWalletError::NotVaultOwner,
    )]
    pub vault: Account<'info, Vault>,

    /// Vault's USDC ATA. Owned by the vault PDA; CPI authority.
    #[account(
        mut,
        token::authority = vault,
    )]
    pub vault_usdc_ata: Account<'info, TokenAccount>,

    /// Destination ATA. Mint must match the vault's ATA so funds can't
    /// be redirected to a different SPL token by mistake. The owner is
    /// trusted to pick the destination — no on-chain allowlist by design.
    #[account(
        mut,
        constraint = recipient_usdc_ata.mint == vault_usdc_ata.mint @ AgentWalletError::WrongMint,
    )]
    pub recipient_usdc_ata: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}
