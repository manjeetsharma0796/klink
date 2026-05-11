//! T-110 test 5/8 — `transfer_usdc` reverts when session has expired.
//! Spec: `docs/specs/2026-04-28-agent-wallet-design.md` §2.3 + §2.5.

mod common;
use common::{assert_anchor_error, AgentWalletError, Fixture, SessionParams};

#[test]
fn transfer_usdc_reverts_when_session_expired() {
    let mut f = Fixture::new();

    f.init_vault(8000).expect("init_vault");

    let recipient = f.recipient;
    // Set expiry to a future-ish timestamp (1_000).
    f.add_session(SessionParams {
        max_per_tx: 1_000_000,
        daily_cap: 10_000_000,
        expiry: 1_000,
        allowed_recipients: vec![recipient],
        allowed_instructions: 0b001, // transfer_usdc only
    })
    .expect("add_session");

    f.create_usdc_accounts();

    // Warp the clock past the expiry time.
    f.warp_clock_to(2_000);

    // Now try to transfer USDC. The session has expired (now >= expiry),
    // so the expiry check (Revert 5 at line ~80 of transfer_usdc.rs) fires.
    let result = f.transfer_usdc(50, recipient);
    assert_anchor_error(
        result,
        AgentWalletError::SessionExpired,
        "transfer_usdc with expired session",
    );
}
