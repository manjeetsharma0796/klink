// Placeholder. The real revert suite lands in T-110 (spec §6.1.1) against
// `solana-program-test` and the full `solana-test-validator` flow. This file
// exists so `cargo test` has something to compile and run from a green tree
// while the on-chain instruction set (T-103..T-109) is still being filled in.
//
// The original `anchor init --test-template rust` scaffold imported
// `anchor_client::solana_sdk::*`, but Anchor 1.0 dropped that re-export, and
// the scaffold expected a running localnet validator + ANCHOR_WALLET env var
// — neither of which fits CI for pure-Rust unit tests.

#[test]
fn placeholder_compiles() {
    // Intentionally empty.
}
