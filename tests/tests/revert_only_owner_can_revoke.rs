//! T-110 test 6/8 — `revoke_session` reverts when caller is not the vault owner.
//! Spec: `docs/specs/2026-04-28-agent-wallet-design.md` §2.3.

mod common;
use common::{AgentWalletError, Fixture, SessionParams};
use solana_sdk::instruction::InstructionError;
use solana_sdk::signature::{Keypair, Signer};
use solana_sdk::transaction::TransactionError;

#[test]
fn revoke_session_reverts_when_caller_not_owner() {
    let mut f = Fixture::new();

    f.init_vault(8000).expect("init_vault");

    f.add_session(SessionParams::default()).expect("add_session");

    // Create a separate non-owner keypair (Mallory) and fund it.
    let mallory = Keypair::new();
    f.svm
        .airdrop(&mallory.pubkey(), 1_000_000_000)
        .unwrap();

    // Try to revoke the session signed by Mallory (not the vault owner).
    // The revoke_session instruction derives the vault with seeds [b"vault", owner.key()].
    // Since Mallory's pubkey != f.owner.pubkey(), the derived PDA won't match the
    // vault we created. Anchor's seed constraint validation (error 2006) fires before
    // the `has_one = owner @ NotVaultOwner` check can run, preventing deserialization
    // of the vault account entirely.
    //
    // Error 2006 is Anchor's account constraint error for seed/bump mismatch.
    // This is the expected security behavior: non-owners can't access the vault PDA.
    let result = f.revoke_session(Some(&mallory));
    match result {
        Err(TransactionError::InstructionError(
            _,
            InstructionError::Custom(code),
        )) => {
            // 2006 = Anchor's account constraint error (seeds/bump mismatch or similar).
            // The vault PDA seed [b"vault", mallory] won't match [b"vault", f.owner],
            // so Anchor fails the constraint before our user error can fire.
            assert_eq!(
                code, 2006,
                "expected 2006 (account constraint error), got {code}"
            );
        }
        other => panic!("expected revert, got {other:?}"),
    }
}
