//! T-110 test 8/8 — Demonstrate that on-chain state is mutated BEFORE the daily_cap check,
//! proving that in a real race between two simultaneous transfers, only the first
//! one (in SVM ordering) would win on the cap.
//!
//! Spec: `docs/specs/2026-04-28-agent-wallet-design.md` §2.5.
//!
//! This is a single-threaded simulation: we execute two transfers sequentially.
//! On-chain, the second transfer sees the mutated daily_spent from the first.
//! In the real world, two simultaneous transactions would be ordered by the SVM;
//! this test proves the outcome is deterministic — only one lands on-chain.

mod common;
use common::{assert_anchor_error, derive_ata, usdc_mint, AgentWalletError, Fixture, SessionParams};
use solana_sdk::{account::Account, pubkey::Pubkey};

#[test]
fn race_two_transfers_only_first_wins_on_cap() {
    let mut f = Fixture::new();

    f.init_vault(8000).expect("init_vault");

    // Use two different recipients to allow both transfers (with different recipients,
    // both are authorized). This makes them distinct transactions for LiteSVM's
    // duplicate detection, while the daily_cap check is per-session (same session for both).
    let recipient1 = f.recipient;
    let recipient2 = Pubkey::new_unique();

    f.add_session(SessionParams {
        max_per_tx: 1_000_000,
        daily_cap: 1_500_000,
        expiry: 0,
        allowed_recipients: vec![recipient1, recipient2],
        allowed_instructions: 0b001, // transfer_usdc only
    })
    .expect("add_session");

    f.create_usdc_accounts();

    // Also create an ATA for the second recipient.
    let mint = usdc_mint();
    let token_program = common::token_program_id();
    let recipient2_ata = derive_ata(&recipient2, &mint);
    let mut recipient2_ata_data = vec![0u8; 165];
    recipient2_ata_data[0..32].copy_from_slice(mint.as_ref());
    recipient2_ata_data[32..64].copy_from_slice(recipient2.as_ref());
    recipient2_ata_data[108] = 1; // state = Initialized
    f.svm
        .set_account(
            recipient2_ata,
            Account {
                lamports: 2_039_280,
                data: recipient2_ata_data,
                owner: token_program,
                executable: false,
                rent_epoch: 0,
            },
        )
        .unwrap();

    // Fund the vault's USDC ATA with 2_000_000 USDC (enough for both transfers if cap allowed).
    let vault_ata = derive_ata(&f.vault, &usdc_mint());
    let mut vault_ata_data = vec![0u8; 165];
    vault_ata_data[0..32].copy_from_slice(usdc_mint().as_ref());
    vault_ata_data[32..64].copy_from_slice(f.vault.as_ref());
    vault_ata_data[64..72].copy_from_slice(&2_000_000u64.to_le_bytes());
    vault_ata_data[108] = 1; // state = Initialized
    f.svm
        .set_account(
            vault_ata,
            Account {
                lamports: 2_039_280,
                data: vault_ata_data,
                owner: token_program,
                executable: false,
                rent_epoch: 0,
            },
        )
        .unwrap();

    // First transfer: 1_000_000 USDC to recipient1. This should succeed, and on-chain
    // session.daily_spent becomes 1_000_000.
    f.transfer_usdc(1_000_000, recipient1)
        .expect("first transfer (1M to recipient1) should succeed");

    // Second transfer: 1_000_000 USDC to recipient2. This would push daily_spent from
    // 1_000_000 to 2_000_000, which exceeds the daily_cap of 1_500_000.
    // The second transfer sees the mutated daily_spent = 1_000_000 from the first,
    // so it correctly reverts with DailyCapExceeded.
    //
    // By using a different recipient, this is a distinct transaction for LiteSVM's
    // duplicate detection, but the daily_cap check is per-session, so it sees the
    // accumulated daily_spent from the first transfer.
    //
    // In a real race:
    // - SVM deterministically orders the two tx (say, first wins by slot ordering)
    // - First tx lands: session.daily_spent = 1_000_000
    // - Second tx arrives at the same slot; SVM checks state after first commitment
    // - Second tx sees daily_spent = 1_000_000 and reverts on cap check
    // This test simulates that outcome by running them sequentially.
    let result = f.transfer_usdc(1_000_000, recipient2);
    assert_anchor_error(
        result,
        AgentWalletError::DailyCapExceeded,
        "second transfer (1M + 1M) exceeds daily_cap of 1.5M",
    );
}
