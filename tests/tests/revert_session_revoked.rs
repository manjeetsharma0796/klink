//! T-110 test 4/8 — `transfer_usdc` reverts when session has been revoked.
//! Spec: `docs/specs/2026-04-28-agent-wallet-design.md` §2.3.

mod common;
use common::{AgentWalletError, Fixture, SessionParams};
use solana_sdk::instruction::InstructionError;
use solana_sdk::transaction::TransactionError;

#[test]
fn transfer_usdc_reverts_when_session_revoked() {
    let mut f = Fixture::new();

    f.init_vault(8000).expect("init_vault");

    let recipient = f.recipient;
    f.add_session(SessionParams {
        max_per_tx: 1_000_000,
        daily_cap: 10_000_000,
        expiry: 0,
        allowed_recipients: vec![recipient],
        allowed_instructions: 0b001, // transfer_usdc only
    })
    .expect("add_session");

    f.create_usdc_accounts();

    // Revoke the session by closing its account (owner-signed).
    f.revoke_session(None).expect("revoke");

    // Now try to transfer USDC. The session account is closed, so Anchor's
    // account deserialization will fail at the validation step before our
    // handler runs. This results in a framework error (AccountNotInitialized = 3012)
    // rather than a clean user error at 6000+.
    let result = f.transfer_usdc(50, recipient);

    // Accept EITHER the Anchor framework error (3012 = AccountNotInitialized)
    // OR the user error SessionSignerMismatch (6000 + error code).
    // We document the choice: closing an account makes Anchor's discriminator
    // validation fail before our checks, so 3012 is the expected framework error.
    match result {
        Err(TransactionError::InstructionError(
            _,
            InstructionError::Custom(code),
        )) => {
            let session_signer_mismatch_code = 6000 + AgentWalletError::SessionSignerMismatch as u32;
            assert!(
                code == 3012 || code == session_signer_mismatch_code,
                "expected 3012 (AccountNotInitialized) or {} (SessionSignerMismatch), got {}",
                session_signer_mismatch_code,
                code
            );
        }
        other => panic!("expected revert, got {other:?}"),
    }
}
