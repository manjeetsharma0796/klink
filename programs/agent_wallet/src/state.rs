use anchor_lang::prelude::*;

/// Wallet-level state — one PDA per human owner. Holds USDC via its
/// associated token account at a derived address. Spec §2.2.1.
///
/// PDA seeds: `["vault", owner.key()]`. The `bump` is cached so we can
/// re-derive the signer seeds without `find_program_address` on every CPI.
#[account]
pub struct Vault {
    /// The human's Phantom pubkey — master authority. Every owner-only
    /// instruction checks `signer.key() == vault.owner`.
    pub owner: Pubkey,

    /// Maximum fraction of vault USDC that may be deployed to yield, in
    /// basis points (e.g. 8000 = 80%). Bounded `0..=10_000`.
    pub max_deployed_fraction_bp: u16,

    /// Current Kamino deposit (USDC base units, 1e6 per USDC).
    pub deployed_amount: u64,

    pub bump: u8,
}

impl Vault {
    /// Borsh-serialized field bytes — does NOT include Anchor's 8-byte
    /// discriminator. Use `8 + Vault::SIZE` for `init` space.
    pub const SIZE: usize = 32 + 2 + 8 + 1;
}

/// Hard upper bound on basis-point values. 10_000 bp = 100%.
pub const MAX_BP: u16 = 10_000;
