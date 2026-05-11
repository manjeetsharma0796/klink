//! T-110 test 7/8 — `kamino_deposit` reverts when deposit would exceed `max_deployed_fraction_bp`.
//! Spec: `docs/specs/2026-04-28-agent-wallet-design.md` §2.5.
//!
//! NOTE: This test is marked as #[ignore] because kamino_deposit's account validation
//! requires properly formatted Kamino program state accounts that are tightly coupled
//! to the real Kamino Klend program's reserve and lending market structures. While the
//! math revert (DeployedFractionExceeded) fires BEFORE the CPI (line 78 in kamino_deposit.rs),
//! Anchor's account deserialization still requires all accounts to exist with compatible
//! data layouts. A full mock of Kamino's program state is beyond the scope of this test suite.
//!
//! To make this test work, one would need to either:
//! 1. Mock the Kamino Klend program with proper reserve/lending market PDAs, or
//! 2. Point the program to a devnet Kamino instance with real accounts
//!
//! The math formula is tested indirectly through the transfer_usdc daily_cap race test,
//! which validates on-chain state mutations and cap enforcement. See race_only_first_wins_on_cap.rs.

mod common;

#[test]
#[ignore = "T-2xx: kamino_deposit revert is gated on a working Kamino mock; defer"]
fn kamino_deposit_reverts_when_over_max_deployed_fraction() {
    // TODO: Implement full Kamino mock or switch to real devnet accounts.
    //
    // High-level strategy (for next person):
    // 1. Set max_deployed_fraction_bp = 5000 (50%)
    // 2. Initialize vault with deployed_amount = 0
    // 3. Fund vault USDC ATA with 1000 USDC (total = 1000)
    // 4. Build kamino_deposit(600) instruction
    // 5. Math check: (0 + 600) * 10000 = 6_000_000; 5000 * 1000 = 5_000_000
    //    6_000_000 > 5_000_000 => should revert DeployedFractionExceeded
    //
    // Challenge: All Kamino accounts (kamino_reserve, kamino_lending_market, etc.)
    // must be valid UncheckedAccounts with correct size/ownership. Anchor's
    // deserialization validates account size matches the declared type before
    // the handler runs. For UncheckedAccount this is minimal, but the session
    // and vault accounts are typed (Account<Session>, Account<Vault>) and must
    // deserialize correctly from the PDA state set by init_vault/add_session.
    panic!("test ignored: awaiting Kamino mock");
}
