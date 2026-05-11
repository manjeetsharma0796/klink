//! T-110 test 2/8 — `transfer_usdc` reverts when `recipient` is not in `session.allowed_recipients`.
//! Spec: `docs/specs/2026-04-28-agent-wallet-design.md` §6.1.1.

mod common;
use common::{assert_anchor_error, AgentWalletError, Fixture, SessionParams};
use solana_sdk::pubkey::Pubkey;

#[test]
fn transfer_usdc_reverts_when_recipient_not_in_allowlist() {
    let mut f = Fixture::new();

    f.init_vault(8000).expect("init_vault");

    // Create a different pubkey (not f.recipient) for the allowlist.
    let other_recipient = Pubkey::new_unique();
    f.add_session(SessionParams {
        max_per_tx: 1_000_000,
        daily_cap: 10_000_000,
        expiry: 0,
        allowed_recipients: vec![other_recipient], // allowlist has other_recipient, not f.recipient
        allowed_instructions: 0b001, // transfer_usdc only
    })
    .expect("add_session");

    f.create_usdc_accounts();

    // Try to transfer to f.recipient, which is NOT in the allowlist.
    // The recipient account constraint verifies recipient_usdc_ata.owner == recipient,
    // and create_usdc_accounts() sets up f.recipient's ATA, so the account constraint passes.
    // But f.recipient is not in allowed_recipients, so RecipientNotAllowed fires.
    let result = f.transfer_usdc(50, f.recipient);
    assert_anchor_error(
        result,
        AgentWalletError::RecipientNotAllowed,
        "transfer_usdc with recipient not in allowlist",
    );
}
