//! T-110 test 3/8 — `transfer_usdc` reverts when daily spend exceeds `session.daily_cap`.
//! Spec: `docs/specs/2026-04-28-agent-wallet-design.md` §6.1.1.

mod common;
use common::{assert_anchor_error, usdc_mint, derive_ata, AgentWalletError, Fixture, SessionParams};
use solana_sdk::account::Account;

#[test]
fn transfer_usdc_reverts_when_daily_cap_exceeded() {
    let mut f = Fixture::new();

    f.init_vault(8000).expect("init_vault");

    let recipient = f.recipient;
    f.add_session(SessionParams {
        max_per_tx: 1_000_000,
        daily_cap: 1_500_000,
        expiry: 0,
        allowed_recipients: vec![recipient],
        allowed_instructions: 0b001, // transfer_usdc only
    })
    .expect("add_session");

    f.create_usdc_accounts();

    // Fund the vault's USDC ATA with 2_000_000 tokens (enough for both transfers).
    // SPL TokenAccount layout: mint(32) + owner(32) + amount(8) + delegate(36) + state(1) + ...
    let vault_ata = derive_ata(&f.vault, &usdc_mint());
    let mut vault_ata_data = vec![0u8; 165];
    vault_ata_data[0..32].copy_from_slice(usdc_mint().as_ref());
    vault_ata_data[32..64].copy_from_slice(f.vault.as_ref());
    // Set amount to 2_000_000 at bytes 64-72 (little-endian u64)
    vault_ata_data[64..72].copy_from_slice(&2_000_000u64.to_le_bytes());
    vault_ata_data[108] = 1; // state = Initialized
    f.svm
        .set_account(
            vault_ata,
            Account {
                lamports: 2_039_280,
                data: vault_ata_data,
                owner: common::token_program_id(),
                executable: false,
                rent_epoch: 0,
            },
        )
        .unwrap();

    // First spend: 1_000_000 (within daily_cap of 1_500_000).
    f.transfer_usdc(1_000_000, recipient)
        .expect("first spend should succeed");

    // Second spend: 800_000. This would push daily_spent from 1_000_000 to 1_800_000,
    // which exceeds the daily_cap of 1_500_000.
    let result = f.transfer_usdc(800_000, recipient);
    assert_anchor_error(
        result,
        AgentWalletError::DailyCapExceeded,
        "transfer_usdc with daily_cap exceeded",
    );
}
