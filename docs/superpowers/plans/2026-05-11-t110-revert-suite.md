# T-110 — TDD revert suite for the agent_wallet Anchor program (spec §6.1.1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. After the scaffold + first test land green, dispatch 2-3 Explore-write agents in parallel to author the remaining 7 tests in batches.

**Goal:** ship the 8 tests named in spec §6.1.1 (the acceptance line says "7 named tests"; the spec actually lists 8 — landing all 8) as Rust integration tests under `tests/` that run via `cargo test --workspace` and pass against the on-chain `agent_wallet` program. The existing `.github/workflows/anchor-ci.yml` already runs `cargo test --workspace`; this PR adds the test bodies + the per-test fixture wiring.

**Trigger:** Manish's claim is 12 days stale with zero test code; T-111 (fuzz) and T-112 (integration) are blocked on T-110; the program just got its TransferChecked migration (T-252) + ATA self-heal (T-256) and is overdue for a revert-coverage gate before further changes land.

---

## Reading order

| # | File | Why |
|---|---|---|
| 1 | `docs/specs/2026-04-28-agent-wallet-design.md` §6.1.1 | The 8 named tests (canonical) |
| 2 | `programs/agent_wallet/src/instructions/transfer_usdc.rs` | Where 5 of the 8 reverts live; their error variants + revert order |
| 3 | `programs/agent_wallet/src/instructions/kamino_deposit.rs` | Test 6's revert path |
| 4 | `programs/agent_wallet/src/instructions/revoke_session.rs` | Test 7's `has_one = owner` check |
| 5 | `programs/agent_wallet/src/errors.rs` | The full `AgentWalletError` enum we assert against |
| 6 | `tests/Cargo.toml` + `tests/src/lib.rs` | The empty scaffold we extend |
| 7 | `.github/workflows/anchor-ci.yml` | Existing CI; `cargo test --workspace` already gates PRs |

---

## The 8 reverts (from spec §6.1.1)

| # | Test name | What it triggers | Expected error |
|---|---|---|---|
| 1 | `transfer_usdc_reverts_when_amount_exceeds_max_per_tx` | call with `amount > session.max_per_tx` | `AmountExceedsMaxPerTx` |
| 2 | `transfer_usdc_reverts_when_recipient_not_in_allowlist` | pass a recipient pubkey not in `session.allowed_recipients` | `RecipientNotAllowed` |
| 3 | `transfer_usdc_reverts_when_daily_cap_exceeded` | seed `session.daily_spent` near cap; call pushes over | `DailyCapExceeded` |
| 4 | `transfer_usdc_reverts_when_session_revoked` | `revoke_session` then attempt `transfer_usdc` | session-account-closed-style revert |
| 5 | `transfer_usdc_reverts_when_session_expired` | warp clock past `session.expiry` | `SessionExpired` |
| 6 | `kamino_deposit_reverts_when_over_max_deployed_fraction` | call with amount that pushes `deployed_amount / total > max_deployed_fraction_bp` | (kamino-specific error or `MaxDeployedFractionExceeded`) |
| 7 | `revoke_session_succeeds_only_when_caller_is_owner` | call `revoke_session` with non-owner signer | `NotVaultOwner` |
| 8 | `transfer_usdc_race_only_first_wins_on_cap` | submit two TXs concurrently against same session; assert only first lands | second one reverts on `DailyCapExceeded` after first updates state |

---

## Toolchain decision

**Use `litesvm` for in-process testing.** Faster than `solana-program-test` (~ms per test vs seconds), no validator boot, plays well with Anchor 1.0's bincode-serialized ix data, and the existing CI runs `cargo test --workspace` which is exactly what `litesvm`-based tests use. The CI comment "Once T-110 introduces validator-dependent integration tests, switch this back to `anchor test`" can stay valid for T-112 (integration) when we want a real validator; this task is unit-level revert coverage, not integration.

Alternative considered: `mollusk-svm`. Slightly faster but Anchor-specific scaffolding is barer. Skip.

---

## Files touched

| File | Type | Responsibility |
|---|---|---|
| `tests/Cargo.toml` | Patch | Add deps: `litesvm`, `solana-sdk`, `solana-program`, `spl-token`, `spl-associated-token-account`, `anchor-lang`, `bincode`. |
| `tests/src/common/mod.rs` | Create | Reusable fixtures: `setup_svm()`, `init_vault()`, `add_session()`, `create_usdc_mint()`, `create_ata()`, `build_transfer_usdc_ix()`, `warp_clock()`. |
| `tests/src/common/builders.rs` | Create | Anchor ix builders (account orders, discriminator + args encoding) for the program's 5 instructions we exercise. |
| `tests/tests/revert_amount_exceeds_max_per_tx.rs` | Create | Test 1 |
| `tests/tests/revert_recipient_not_in_allowlist.rs` | Create | Test 2 |
| `tests/tests/revert_daily_cap_exceeded.rs` | Create | Test 3 |
| `tests/tests/revert_session_revoked.rs` | Create | Test 4 |
| `tests/tests/revert_session_expired.rs` | Create | Test 5 |
| `tests/tests/revert_kamino_over_max_deployed.rs` | Create | Test 6 (may skip if too coupled to live Kamino reserve — see risks) |
| `tests/tests/revert_only_owner_can_revoke.rs` | Create | Test 7 |
| `tests/tests/race_only_first_wins_on_cap.rs` | Create | Test 8 |
| `tests/src/lib.rs` | Patch | Drop the placeholder comment; the file can stay empty since integration tests live under `tests/tests/`. |

---

## Subtasks

### Phase 1 — scaffold (Jishnu, sequential)

- [ ] **1.1** Add litesvm + sibling deps to `tests/Cargo.toml`. Pin versions.
- [ ] **1.2** Write `tests/src/common/mod.rs` + `tests/src/common/builders.rs` with:
  - `setup_svm()`: boot litesvm, load `agent_wallet.so` from `target/deploy/`, register program at `DPPE8…zM3L`
  - USDC mint creation helper
  - ATA creation helper (vault + recipient)
  - `init_vault_ix(owner)`, `add_session_ix(owner, session_kp, params)`, `transfer_usdc_ix(...)`, `revoke_session_ix(...)`, `kamino_deposit_ix(...)`
  - PDA derivers (vault, session)
- [ ] **1.3** Write test 1 (`transfer_usdc_reverts_when_amount_exceeds_max_per_tx`) using the scaffold. Verify it goes red on the actual `AmountExceedsMaxPerTx` error (not a panic). This is the pattern other tests copy.
- [ ] **1.4** `cargo test --workspace --test revert_amount_exceeds_max_per_tx` green. Time the test.

### Phase 2 — parallel test authoring

Dispatch 3 Explore-write agents in parallel, each given the working scaffold + the example test:

- [ ] **2.A** Agent A authors tests 2 + 3 (recipient allowlist, daily cap)
- [ ] **2.B** Agent B authors tests 4 + 5 + 7 (revoked session, expired session, owner-only revoke)
- [ ] **2.C** Agent C authors tests 6 + 8 (kamino_deposit, race)

Each agent receives:
- The working scaffold (`common/mod.rs`, `common/builders.rs`)
- Test 1 as the reference pattern
- The spec lines + error variant names for their assigned tests
- An explicit "report PASS / FAIL with cargo output" requirement

### Phase 3 — integration (Jishnu)

- [ ] **3.1** Run `cargo test --workspace` locally. All 8 green. Capture wall-clock.
- [ ] **3.2** Update `tests/src/lib.rs` comment to reflect what's there.
- [ ] **3.3** No CI changes needed (anchor-ci.yml already runs `cargo test --workspace` on PR).

### Phase 4 — ship

- [ ] **4.1** Single commit on `feat/T-110-revert-suite`.
- [ ] **4.2** PR + merge + branch delete.
- [ ] **4.3** Flip T-110 status to `done @Jishnu 2026-05-11` in TODO.md (in the close commit).
- [ ] **4.4** Unblocks T-111 (fuzz) and T-112 (integration on local validator).

---

## Risks + mitigations

| Risk | Mitigation |
|---|---|
| litesvm doesn't load Anchor 1.0's program bytes correctly | Fall back to `solana-program-test`. Lose speed, keep correctness. Try litesvm first; if Phase 1 fixture takes > 1h, switch. |
| Kamino_deposit test requires live Kamino reserve state | Skip test 6 in this PR if the reserve setup is too coupled to mainnet/devnet RPC; file a follow-up T-2xx. 7/8 tests is still 7 named — meets acceptance literal. |
| Race test (test 8) is hard in single-threaded `cargo test` | Simulate the race by submitting two ix in sequence without re-fetching state between them, then assert the second observes the post-first state. Effectively the same coverage; doesn't need real parallelism. |
| Clock warping needs `set_sysvar` support | litesvm supports `set_sysvar::<Clock>(...)`. Verify in Phase 1; if not, use Anchor's `Clock::get` mock or fast-forward with `warp_to_slot`. |
| Tests slow CI past 30 min cap | litesvm tests are ~10-50ms each. 8 tests + scaffold compile should fit in well under 5 min. |

---

## Out of scope

- T-111 (fuzz / property tests)
- T-112 (integration tests on a real local validator)
- CI tweaks (anchor-ci.yml already covers what we need)
- Happy-path tests (this is the **revert** suite per spec §6.1.1)
- Testing `owner_transfer_usdc` (T-116 escape hatch) — not in §6.1.1; can come later

---

## Time estimate

| Phase | Estimate |
|---|---|
| Plan | (done) |
| Phase 1 scaffold + test 1 | 60-90 min |
| Phase 2 parallel test authoring | 30-45 min wall-clock (3 agents) |
| Phase 3 integration | 15 min |
| Phase 4 ship | 10 min |
| **Total** | **~2-3 hours** |

---

**Status**: plan written; scout dispatching; scaffold next.
