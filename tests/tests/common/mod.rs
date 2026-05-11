//! T-110 — revert-suite test fixtures for the agent_wallet Anchor program.
//!
//! Public helpers used by every integration test under `tests/tests/`. Each
//! test boots a fresh litesvm instance, loads the just-built `.so`, and
//! drives the program through `Fixture` -> assert on the resulting error.
//!
//! Spec: `docs/specs/2026-04-28-agent-wallet-design.md` §6.1.1.

use borsh::BorshSerialize;
use litesvm::LiteSVM;
use sha2::{Digest, Sha256};
use solana_sdk::{
    account::Account,
    clock::Clock,
    hash::Hash,
    instruction::{AccountMeta, Instruction, InstructionError},
    message::Message,
    pubkey::Pubkey,
    signature::{Keypair, Signer},
    sysvar::Sysvar,
    transaction::{Transaction, TransactionError},
};
use std::str::FromStr;

pub use agent_wallet::errors::AgentWalletError;

pub const PROGRAM_ID_STR: &str = "DPPE8TAuw5qyWbw5MqcXcAtH2d5RYF5XBXTiN2pKzM3L";
pub const USDC_MINT_STR: &str = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

pub fn program_id() -> Pubkey {
    Pubkey::from_str(PROGRAM_ID_STR).unwrap()
}

pub fn usdc_mint() -> Pubkey {
    Pubkey::from_str(USDC_MINT_STR).unwrap()
}

pub fn token_program_id() -> Pubkey {
    Pubkey::from_str("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA").unwrap()
}

pub fn ata_program_id() -> Pubkey {
    Pubkey::from_str("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL").unwrap()
}

/// Anchor instruction discriminator: first 8 bytes of `sha256("global:<ix>")`.
pub fn ix_discriminator(name: &str) -> [u8; 8] {
    let mut h = Sha256::new();
    h.update(format!("global:{}", name).as_bytes());
    let r = h.finalize();
    let mut out = [0u8; 8];
    out.copy_from_slice(&r[..8]);
    out
}

pub fn derive_vault(owner: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[b"vault", owner.as_ref()], &program_id())
}

pub fn derive_session(vault: &Pubkey, session_pubkey: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[b"session", vault.as_ref(), session_pubkey.as_ref()],
        &program_id(),
    )
}

pub fn derive_ata(owner: &Pubkey, mint: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(
        &[owner.as_ref(), token_program_id().as_ref(), mint.as_ref()],
        &ata_program_id(),
    )
    .0
}

#[derive(BorshSerialize)]
struct InitVaultArgs {
    max_deployed_fraction_bp: u16,
}

#[derive(BorshSerialize)]
struct AddSessionArgs {
    session_pubkey: [u8; 32],
    max_per_tx: u64,
    daily_cap: u64,
    expiry: i64,
    allowed_recipients: Vec<[u8; 32]>,
    allowed_instructions: u32,
}

#[derive(BorshSerialize)]
struct TransferUsdcArgs {
    amount: u64,
    recipient: [u8; 32],
}

pub struct SessionParams {
    pub max_per_tx: u64,
    pub daily_cap: u64,
    pub expiry: i64,
    pub allowed_recipients: Vec<Pubkey>,
    pub allowed_instructions: u32,
}

impl Default for SessionParams {
    fn default() -> Self {
        Self {
            max_per_tx: 1_000_000,
            daily_cap: 10_000_000,
            expiry: 0,
            allowed_recipients: vec![],
            allowed_instructions: 0b001,
        }
    }
}

pub struct Fixture {
    pub svm: LiteSVM,
    pub payer: Keypair,
    pub owner: Keypair,
    pub session_kp: Keypair,
    pub recipient: Pubkey,
    pub vault: Pubkey,
    pub vault_bump: u8,
    pub session: Pubkey,
    pub session_bump: u8,
}

impl Default for Fixture {
    fn default() -> Self {
        Self::new()
    }
}

impl Fixture {
    pub fn new() -> Self {
        let mut svm = LiteSVM::new();

        let so_path = std::env::var("AGENT_WALLET_SO")
            .unwrap_or_else(|_| "../target/deploy/agent_wallet.so".to_string());
        let bytes = std::fs::read(&so_path)
            .unwrap_or_else(|e| panic!("read program .so at {so_path}: {e}"));
        svm.add_program(program_id(), &bytes);

        let payer = Keypair::new();
        let owner = Keypair::new();
        let session_kp = Keypair::new();
        let recipient = Pubkey::new_unique();

        svm.airdrop(&payer.pubkey(), 10_000_000_000).unwrap();
        svm.airdrop(&owner.pubkey(), 10_000_000_000).unwrap();

        let (vault, vault_bump) = derive_vault(&owner.pubkey());
        let (session, session_bump) = derive_session(&vault, &session_kp.pubkey());

        Self {
            svm,
            payer,
            owner,
            session_kp,
            recipient,
            vault,
            vault_bump,
            session,
            session_bump,
        }
    }

    fn latest_blockhash(&self) -> Hash {
        self.svm.latest_blockhash()
    }

    fn send(&mut self, ix: Instruction, signers: &[&Keypair]) -> Result<(), TransactionError> {
        let blockhash = self.latest_blockhash();
        let msg = Message::new(&[ix], Some(&self.payer.pubkey()));
        let mut all_signers: Vec<&Keypair> = vec![&self.payer];
        for s in signers {
            if s.pubkey() != self.payer.pubkey() {
                all_signers.push(s);
            }
        }
        let tx = Transaction::new(&all_signers, msg, blockhash);
        self.svm.send_transaction(tx).map(|_| ()).map_err(|e| e.err)
    }

    pub fn init_vault(&mut self, max_deployed_fraction_bp: u16) -> Result<(), TransactionError> {
        let mut data = ix_discriminator("init_vault").to_vec();
        data.extend(
            borsh::to_vec(&InitVaultArgs {
                max_deployed_fraction_bp,
            })
            .unwrap(),
        );
        let ix = Instruction {
            program_id: program_id(),
            accounts: vec![
                AccountMeta::new(self.payer.pubkey(), true),
                AccountMeta::new_readonly(self.owner.pubkey(), true),
                AccountMeta::new(self.vault, false),
                AccountMeta::new_readonly(Pubkey::from_str("11111111111111111111111111111111").unwrap(), false),
            ],
            data,
        };
        let owner_clone = self.owner.insecure_clone();
        self.send(ix, &[&owner_clone])
    }

    pub fn add_session(&mut self, params: SessionParams) -> Result<(), TransactionError> {
        let mut data = ix_discriminator("add_session").to_vec();
        data.extend(
            borsh::to_vec(&AddSessionArgs {
                session_pubkey: self.session_kp.pubkey().to_bytes(),
                max_per_tx: params.max_per_tx,
                daily_cap: params.daily_cap,
                expiry: params.expiry,
                allowed_recipients: params
                    .allowed_recipients
                    .iter()
                    .map(|p| p.to_bytes())
                    .collect(),
                allowed_instructions: params.allowed_instructions,
            })
            .unwrap(),
        );
        let ix = Instruction {
            program_id: program_id(),
            accounts: vec![
                AccountMeta::new(self.payer.pubkey(), true),
                AccountMeta::new_readonly(self.owner.pubkey(), true),
                AccountMeta::new_readonly(self.vault, false),
                AccountMeta::new(self.session, false),
                AccountMeta::new_readonly(Pubkey::from_str("11111111111111111111111111111111").unwrap(), false),
            ],
            data,
        };
        let owner_clone = self.owner.insecure_clone();
        self.send(ix, &[&owner_clone])
    }

    pub fn create_usdc_accounts(&mut self) {
        let mint = usdc_mint();
        let token_program = token_program_id();

        // SPL Mint layout (82 bytes): mint_authority(36) + supply(8) +
        // decimals(1) + is_initialized(1) + freeze_authority(36).
        let mut mint_data = vec![0u8; 82];
        mint_data[44] = 6; // decimals
        mint_data[45] = 1; // is_initialized
        self.svm
            .set_account(
                mint,
                Account {
                    lamports: 1_000_000_000,
                    data: mint_data,
                    owner: token_program,
                    executable: false,
                    rent_epoch: 0,
                },
            )
            .unwrap();

        // SPL TokenAccount layout (165 bytes): mint(32) + owner(32) + amount(8) +
        // delegate(36) + state(1) + ...
        for (ata_owner, ata) in [
            (self.vault, derive_ata(&self.vault, &mint)),
            (self.recipient, derive_ata(&self.recipient, &mint)),
        ] {
            let mut td = vec![0u8; 165];
            td[0..32].copy_from_slice(mint.as_ref());
            td[32..64].copy_from_slice(ata_owner.as_ref());
            td[108] = 1; // state = Initialized
            self.svm
                .set_account(
                    ata,
                    Account {
                        lamports: 2_039_280,
                        data: td,
                        owner: token_program,
                        executable: false,
                        rent_epoch: 0,
                    },
                )
                .unwrap();
        }
    }

    pub fn transfer_usdc(
        &mut self,
        amount: u64,
        recipient_arg: Pubkey,
    ) -> Result<(), TransactionError> {
        let mint = usdc_mint();
        let vault_ata = derive_ata(&self.vault, &mint);
        let recipient_ata = derive_ata(&recipient_arg, &mint);

        let mut data = ix_discriminator("transfer_usdc").to_vec();
        data.extend(
            borsh::to_vec(&TransferUsdcArgs {
                amount,
                recipient: recipient_arg.to_bytes(),
            })
            .unwrap(),
        );
        let ix = Instruction {
            program_id: program_id(),
            accounts: vec![
                AccountMeta::new_readonly(self.session_kp.pubkey(), true),
                AccountMeta::new(self.session, false),
                AccountMeta::new_readonly(self.vault, false),
                AccountMeta::new_readonly(mint, false),
                AccountMeta::new(vault_ata, false),
                AccountMeta::new(recipient_ata, false),
                AccountMeta::new_readonly(token_program_id(), false),
            ],
            data,
        };
        let session_clone = self.session_kp.insecure_clone();
        self.send(ix, &[&session_clone])
    }

    pub fn revoke_session(&mut self, signer: Option<&Keypair>) -> Result<(), TransactionError> {
        let data = ix_discriminator("revoke_session").to_vec();
        let signer_kp = signer.unwrap_or(&self.owner).insecure_clone();
        let ix = Instruction {
            program_id: program_id(),
            accounts: vec![
                AccountMeta::new(signer_kp.pubkey(), true),
                AccountMeta::new_readonly(self.vault, false),
                AccountMeta::new(self.session, false),
            ],
            data,
        };
        self.send(ix, &[&signer_kp])
    }

    pub fn warp_clock_to(&mut self, to: i64) {
        let mut clock: Clock = self.svm.get_sysvar();
        clock.unix_timestamp = to;
        self.svm.set_sysvar(&clock);
    }
}

/// Assert the result is `Custom(code)` whose code matches the given Anchor
/// error variant (offset 6000+).
pub fn assert_anchor_error(
    result: Result<(), TransactionError>,
    expected: AgentWalletError,
    label: &str,
) {
    match result {
        Ok(_) => panic!("{label}: expected revert, got Ok"),
        Err(TransactionError::InstructionError(_, InstructionError::Custom(code))) => {
            let expected_code = 6000 + expected as u32;
            assert_eq!(
                code, expected_code,
                "{label}: expected {expected:?} (={expected_code}), got Custom({code})"
            );
        }
        Err(other) => panic!("{label}: unexpected error shape: {other:?}"),
    }
}

#[cfg(test)]
mod sanity {
    use super::*;

    #[test]
    fn discriminator_is_deterministic_and_non_zero() {
        let d = ix_discriminator("init_vault");
        assert_eq!(d.len(), 8);
        assert_ne!(d, [0u8; 8]);
    }

    #[test]
    fn pdas_derive_under_program_id() {
        let owner = Pubkey::new_unique();
        let (vault, bump) = derive_vault(&owner);
        assert!(bump > 0);
        assert_ne!(vault, owner);
    }
}
