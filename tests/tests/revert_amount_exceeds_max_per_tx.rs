//! T-110 test 1/8 — `transfer_usdc` reverts when `amount > session.max_per_tx`.
//! Spec: `docs/specs/2026-04-28-agent-wallet-design.md` §6.1.1.

mod common;
use common::{assert_anchor_error, AgentWalletError, Fixture, SessionParams};

#[test]
fn transfer_usdc_reverts_when_amount_exceeds_max_per_tx() {
    let mut f = Fixture::new();

    f.init_vault(8000).expect("init_vault");

    let recipient = f.recipient;
    f.add_session(SessionParams {
        max_per_tx: 100,
        daily_cap: 10_000,
        expiry: 0,
        allowed_recipients: vec![recipient],
        allowed_instructions: 0b001, // transfer_usdc only
    })
    .expect("add_session");

    f.create_usdc_accounts();

    // 200 > max_per_tx=100, must revert with AmountExceedsMaxPerTx.
    let result = f.transfer_usdc(200, recipient);
    assert_anchor_error(
        result,
        AgentWalletError::AmountExceedsMaxPerTx,
        "transfer_usdc with amount>max_per_tx",
    );
}
