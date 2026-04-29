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

/// Length of the rolling daily-cap window. Exactly 24h, no calendar logic
/// (UTC midnight resets are off-spec — see §2.5 "rolling 24h").
pub const SECONDS_PER_DAY: i64 = 86_400;

/// Bit position of `transfer_usdc` in the `Session.allowed_instructions`
/// bitmap. Spec §2.4 — bit 0. Other typed-instruction bits (`kamino_*`)
/// land alongside their handlers in T-108/T-109.
pub const TRANSFER_USDC_BIT: u32 = 0;

/// Fixed allowlist size — chosen to keep `Session` rent under ~$0.50 and
/// give Anchor a stack-sized array (no per-row reallocation). Spec §2.2.2.
pub const MAX_RECIPIENTS: usize = 10;

/// Per-session policy — one PDA per active agent. Owner-mutable via
/// `add_session`, `update_session_allowlist`, `revoke_session`. Spec §2.2.2.
///
/// PDA seeds: `["session", vault.key(), session_pubkey.as_ref()]`. The
/// `session_pubkey` is the off-chain backend-held keypair; this account
/// stores its policy bounds and the rolling-24h spend tally.
#[account]
pub struct Session {
    /// The Vault PDA this session draws from.
    pub vault: Pubkey,

    /// Public key of the backend-held session keypair. Every session-signed
    /// instruction checks `signer.key() == session.session_pubkey`.
    pub session_pubkey: Pubkey,

    /// Hard cap per `transfer_usdc` (USDC base units, 1e6 per USDC).
    pub max_per_tx: u64,

    /// Hard cap per rolling-24h window (USDC base units).
    pub daily_cap: u64,

    /// Running tally of spent in the current 24h window. Reset to `amount`
    /// (not 0) when `now >= daily_window_start + 86400` per §2.5.
    pub daily_spent: u64,

    /// Unix start of the current 24h window. Set to creation time here;
    /// `transfer_usdc` rolls it forward.
    pub daily_window_start: i64,

    /// Unix expiry. `0` means never expires; otherwise `transfer_usdc`
    /// reverts when `Clock::unix_timestamp >= expiry`.
    pub expiry: i64,

    /// Fixed-size recipient allowlist. Slots beyond `allowed_recipients_count`
    /// are `Pubkey::default()` and never match a real address.
    pub allowed_recipients: [Pubkey; MAX_RECIPIENTS],

    /// Number of populated entries in `allowed_recipients` (`0..=10`).
    pub allowed_recipients_count: u8,

    /// Bitmap of permitted typed instructions. Spec §2.4 — bit 0 =
    /// `transfer_usdc`, bit 1 = `kamino_deposit`, bit 2 = `kamino_withdraw`.
    pub allowed_instructions: u32,

    pub bump: u8,
}

impl Session {
    /// Borsh-serialized field bytes — does NOT include Anchor's 8-byte
    /// discriminator. Use `8 + Session::SIZE` for `init` space.
    ///
    /// 32 (vault) + 32 (session_pubkey) + 8 (max_per_tx) + 8 (daily_cap)
    /// + 8 (daily_spent) + 8 (daily_window_start) + 8 (expiry)
    /// + 32*10 (allowed_recipients) + 1 (count) + 4 (allowed_instructions)
    /// + 1 (bump) = 430.
    pub const SIZE: usize = 32 + 32 + 8 + 8 + 8 + 8 + 8 + 32 * MAX_RECIPIENTS + 1 + 4 + 1;
}
