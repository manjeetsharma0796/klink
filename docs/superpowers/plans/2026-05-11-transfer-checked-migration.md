# `transfer_usdc` → SPL `TransferChecked` migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the session-signed `transfer_usdc` Anchor instruction from SPL **Transfer** (opcode 3) to SPL **TransferChecked** (opcode 12) so on-chain payments are accepted by x402 / MPP verifiers. Plain Transfer is rejected by every off-chain receipt verifier we have evidence for (MPP `@solana/mpp/src/server/Charge.ts:340-343`, x402 PayAI Solana facilitator) because it lacks the on-wire mint + decimals fields those parsers require for trustless settlement.

**Trigger:** 2026-05-11 — direct probe against an MPP devnet echo merchant. 5 transfer txs landed on-chain successfully but the MPP verifier rejected every one with *"No TransferChecked instruction found for recipient ..."* at `Charge.ts:388`. Surface error was a generic 402 verification-failed. Live klink balance after the test: `GET /v1/yield/position` → `liquid: 9964506` (= 9.964506 USDC), consistent with 0.05 USDC burned on retries. The fix is a program-level migration, not an HTTP-envelope tweak.

---

## Reading order — read these BEFORE touching code

Doing the changes without internalizing these four reads will produce a half-correct PR.

| # | File | Lines | What to take away |
|---|---|---|---|
| 1 | `programs/agent_wallet/src/instructions/transfer_usdc.rs` | full file (158 lines) | Especially lines **1-2** (imports: `Transfer`), **87-101** (CPI call site), **110-158** (`TransferUsdc<'info>` accounts struct — note there's NO `mint` account today). This is the file getting surgically edited. |
| 2 | `apps/api/src/program/agent-wallet.ts` | **lines 260-300** | `BuildTransferUsdcIxOpts` interface and `buildTransferUsdcIx()` builder. **6 accounts** in `keys[]` today; will become **7** (mint inserted between vault and vault_usdc_ata to match the new Rust account order). |
| 3 | `apps/api/src/routes/spend.ts` | **lines 442 (transfer), 442+ (sign-payment), 732+ (service)** | Three callsites of `buildTransferUsdcIx`. All must add `mint: getUsdcMint()` to opts. Each handler already loads `getUsdcMint()` via `deps.usdcMint` so the value is in scope — only the call signature changes. |
| 4 | `docs/runbooks/devnet-deploys.md` | full | Program is at `5qCJCEhfLusk59YFqaEG9Yg3Wp64ZaYwvXteFmCmedqv`, upgrade authority `6fELFcucWR7CPrBrRmfAs8tNjvt5dUnQDk3cguAtdrjZ` (single-signer; T-114 multisig rotation still pending). ProgramData data-length ceiling after the T-116 extend is 289 332 bytes; TransferChecked adds a Mint AccountInfo read which is a ~zero-byte delta — no `solana program extend` needed. |

Quick-reference: also look at:
- `programs/agent_wallet/src/instructions/owner_transfer_usdc.rs` line 2 + line 39 — owner escape hatch ALSO uses plain `Transfer`. **Not migrated in this task** (owner path isn't verified by MPP/x402). Filed as follow-up.
- `apps/api/tests/program/agent-wallet.test.ts` — existing test fixture for `buildTransferUsdcIx`. Will need an updated golden expected-keys array.
- The MPP verifier source: `@solana/mpp/src/server/Charge.ts:340-343` (the filter that rejects plain Transfer) and `:388` (the throw site). External package — read in `node_modules/@solana/mpp/` if needed for fixture writing.
- Working reference client: `D:/workspace/mpp-mock-service/client/pay-echo.ts` — uses `@solana/mpp` SDK with a native keypair signing TransferChecked. Use this as the proof-of-correctness fixture during smoke testing.

---

## Diagnosis (one-paragraph version for PR body)

The MPP facilitator's tx-verification parser at `@solana/mpp/src/server/Charge.ts:340-343` filters parsed instructions to only those with `parsed?.type === 'transferChecked'` under `TOKEN_PROGRAM` or `TOKEN_2022_PROGRAM`. Klink's [transfer_usdc.rs:87-101](programs/agent_wallet/src/instructions/transfer_usdc.rs) uses `anchor_spl::token::Transfer` + `token::transfer()`, which emits the plain `Transfer` opcode (no mint/decimals on-wire). The verifier finds zero matching instructions in the tx and throws `No TransferChecked instruction found for recipient ...`, surfacing as a generic `402 verification-failed`. The HMAC, base58 signature, amount, recipient, and mint values were all correct in our probe — the on-chain bytes shape is the only thing wrong.

---

## Why TransferChecked (the actual protocol-level reason)

Two reasons every modern off-chain receipt verifier (MPP, x402, Solana Pay) insists on it:

1. **Mint on-wire.** TransferChecked names the mint as an explicit account, and the SPL Token program **revertss the tx** if either ATA's mint doesn't match. Plain Transfer forces the verifier to do separate RPC lookups for each ATA — racy under concurrent state changes.
2. **Decimals on-wire.** TransferChecked's payload is `{ amount: u64, decimals: u8 }`. The SPL Token program rejects the tx if the mint's actual decimals don't equal the supplied byte. This locks "0.01 USDC at 6 decimals" to that exact mint precision — preventing a "0.01 of a 9-decimal lookalike token" substitution attack.

These are real defense-in-depth properties — TransferChecked is the right primitive regardless of MPP/x402. The migration is overdue.

---

## Files touched

| File | Type | Responsibility |
|---|---|---|
| `programs/agent_wallet/src/instructions/transfer_usdc.rs` | Modify | Swap `Transfer` → `TransferChecked` in imports + CPI; add `mint: Account<'info, Mint>` to `TransferUsdc<'info>`; pass mint + decimals to `transfer_checked()`. |
| `programs/agent_wallet/src/instructions/mod.rs` | No change | Already re-exports the module. |
| `programs/agent_wallet/src/lib.rs` | No change expected | Instruction signature changes but lib.rs just glues; Anchor handles the wiring. Verify there's no explicit signature in lib.rs. |
| `apps/api/src/program/agent-wallet.ts` | Modify | Add `mint: PublicKey` + `decimals: number` to `BuildTransferUsdcIxOpts`; insert mint pubkey into `keys[]` in the correct position; keep `encodeTransferUsdcArgs` as-is (the args don't include decimals — decimals goes on TokenInstruction, not Anchor's serialized args). Wait: this is wrong. See **Implementation note** below. |
| `apps/api/src/routes/spend.ts` | Modify | 3 callsites of `buildTransferUsdcIx` get `mint: getUsdcMint()` + decimals (6 for USDC, source from env or hardcode if confirmed). |
| `apps/api/tests/program/agent-wallet.test.ts` | Modify | Update expected `keys` array to 7 entries; assert mint sits at the right index. |
| `apps/api/tests/routes/spend.test.ts` (or equivalent) | Modify | Pin that all 3 spend handlers propagate the mint into the built ix. |
| `apps/web/lib/...` | No change | Web doesn't call `buildTransferUsdcIx` directly — the api owns this. |
| `packages/sdk/src/client.ts` + `types.ts` | Verify only | SDK calls the api, not the on-chain instruction directly. No SDK-public-surface change. |
| `docs/runbooks/devnet-deploys.md` | Modify | Append a new row for the redeploy after smoke passes. |
| `TODO.md` | Modify | Insert T-252 task block. |

### Implementation note on decimals

There are two routes:

- **Route A (cleaner — mint readable on-chain):** Have the Anchor instruction read `mint.decimals` from the supplied `Mint` account inside `transfer_usdc()` and pass it to the CPI. The TS caller only needs to supply the mint pubkey, not the decimals byte. Trade-off: one extra account-deserialize on every call (negligible CU cost).
- **Route B (caller-supplies):** Add `decimals: u8` as an arg in the Anchor instruction. TS caller passes it explicitly. Slightly faster on-chain but adds a new arg byte (and the agent has to know decimals).

**Pick Route A.** It's the canonical SPL pattern and removes a class of "wrong decimals" bugs by construction — Anchor's `Account<'info, Mint>` deserialize already validates the supplied account is owned by the SPL Token program and has the Mint layout.

---

## Working assumptions

- **Bun** is the only runtime. `bun run build` doesn't apply to the Rust crate — use `anchor build` (which already requires Solana toolchain installed locally).
- **Single-signer upgrade authority on devnet** today per `docs/runbooks/devnet-deploys.md` — the redeploy can be done by Mouli with the dev keypair. **Do NOT attempt mainnet** in this task (T-114 multisig rotation still pending).
- **One in-progress claim per session.** T-252 is that claim once user issues `claim T-252`.
- **Solo fast-path** for TODO.md.
- **No em dashes** in any new prose.
- **The 0.05 USDC already burned** on devnet retries is sunk cost; not relevant to the plan.

---

## Task 0: Pre-flight verification

**Files to read:**
- `programs/agent_wallet/src/lib.rs` — confirm `pub use instructions::*;` is the only mention of transfer_usdc (no explicit signature there)
- `apps/api/scripts/e2e-dashboard.ts` — confirm this end-to-end script doesn't call `buildTransferUsdcIx` (it calls the api, not the on-chain ix directly)
- `node_modules/@solana/mpp/dist/server/Charge.js` (if installed locally in the worktree) or fetch from npm — read lines around 340-388 to confirm the rejection path matches the diagnosis

- [ ] **Step 0.1: Confirm the diagnosis is reproducible against the live MPP echo.** Hit the same endpoint with the same wallet and capture the 402 response body byte-for-byte. Save to `/tmp/mpp-verify-fail.json` for fixture reuse.
- [ ] **Step 0.2: Confirm `anchor build` works on the unmodified tree** (smoke that the toolchain is healthy before introducing changes).
- [ ] **Step 0.3: Confirm `anchor test` passes pre-change** so the failures after the change are signal, not noise.

---

## Task 1: File T-252 + claim

**Files:**
- Modify: `TODO.md`

- [ ] **Step 1.1: Insert T-252 block** (solo fast-path: in `## Done` from the start with `Status: in-progress`):

```markdown
### T-252 — transfer_usdc migration to SPL TransferChecked for MPP/x402 verifier compatibility
- Status: in-progress @<user> 2026-05-11
- Depends-on: T-105, T-211, T-212, T-251
- OS: any
- Scope: program + api + tests + ops
- Acceptance: <fill on final commit>
- Notes: surfaced 2026-05-11 by direct probe against MPP devnet echo. Plain SPL Transfer (opcode 3) is rejected by MPP and x402 verifiers because mint + decimals aren't on-wire; TransferChecked (opcode 12) is the required primitive. This task migrates only the session-signed transfer_usdc instruction. owner_transfer_usdc keeps plain Transfer for now (escape hatch isn't verifier-bound). Devnet redeploy in scope; mainnet gated on T-114 multisig rotation.
```

- [ ] **Step 1.2: Commit `claim: T-252 (TransferChecked migration)`**.

---

## Task 2: Rust changes — `transfer_usdc.rs`

**Files:**
- Modify: `programs/agent_wallet/src/instructions/transfer_usdc.rs`

- [ ] **Step 2.1: Update imports (line 2).**

```rust
// Before:
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

// After:
use anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked};
```

- [ ] **Step 2.2: Add `mint` to `TransferUsdc<'info>` accounts struct** (between `vault` and `vault_usdc_ata`, around line 137-144). Anchor will validate via the standard `Account<'info, Mint>` layout check; we additionally constrain the supplied mint matches the vault ATA's mint so a malicious caller can't substitute a fake mint.

```rust
/// USDC mint. Validated to match `vault_usdc_ata.mint` so the supplied
/// mint cannot be a substitute. `decimals` is read from this account
/// and passed to the SPL TransferChecked CPI so the SPL Token program
/// itself revertss any decimals mismatch.
#[account(
    constraint = mint.key() == vault_usdc_ata.mint @ AgentWalletError::WrongMint,
)]
pub mint: Account<'info, Mint>,
```

- [ ] **Step 2.3: Swap CPI from `Transfer` → `TransferChecked`** (lines 87-101).

```rust
let cpi_accounts = TransferChecked {
    from: ctx.accounts.vault_usdc_ata.to_account_info(),
    mint: ctx.accounts.mint.to_account_info(),
    to: ctx.accounts.recipient_usdc_ata.to_account_info(),
    authority: ctx.accounts.vault.to_account_info(),
};
let cpi_ctx = CpiContext::new_with_signer(
    ctx.accounts.token_program.to_account_info(),
    cpi_accounts,
    signer_seeds,
);
token::transfer_checked(cpi_ctx, amount, ctx.accounts.mint.decimals)?;
```

Note `to_account_info()` on `token_program` (returns AccountInfo, which is what `CpiContext::new_with_signer` wants in Anchor 1.0) — the existing code passed `.key()` (Pubkey) which worked because `token::transfer` internally ignores it. `token::transfer_checked` may differ — use AccountInfo to be safe; verify against the anchor_spl docs version pinned in `Cargo.toml`.

- [ ] **Step 2.4: Update the doc comment** at the top of `transfer_usdc` (lines 7-23) to reflect TransferChecked. Mention that mint + decimals are now validated on-wire.

- [ ] **Step 2.5: Run `anchor build`** — no errors. If the `Cargo.toml` pin of `anchor-spl` is older, may need a feature-gate. Check.

- [ ] **Step 2.6: Commit `T-252: transfer_usdc CPI uses SPL TransferChecked`**.

---

## Task 3: TS changes — `agent-wallet.ts` builder

**Files:**
- Modify: `apps/api/src/program/agent-wallet.ts`

- [ ] **Step 3.1: Extend `BuildTransferUsdcIxOpts`** (around lines 240-265).

```ts
export interface BuildTransferUsdcIxOpts {
  // ...existing fields...
  /** USDC mint pubkey — required by TransferChecked. */
  mint: PublicKey;
}
```

No `decimals` field in opts — the on-chain instruction reads it from the Mint account (Route A from the plan).

- [ ] **Step 3.2: Update `buildTransferUsdcIx` keys array** (lines 281-298) to 7 entries. The account order must match the Rust struct exactly (Anchor positional account convention):

```ts
keys: [
  // Order matches TransferUsdc<'info> after T-252:
  // 1. session_signer (signer, NOT writable)
  // 2. session (writable)
  // 3. vault (read-only)
  // 4. mint (read-only)  ← NEW
  // 5. vault_usdc_ata (writable; CPI source)
  // 6. recipient_usdc_ata (writable; CPI destination)
  // 7. token_program
  { pubkey: opts.sessionSigner, isSigner: true, isWritable: false },
  { pubkey: session, isSigner: false, isWritable: true },
  { pubkey: opts.vault, isSigner: false, isWritable: false },
  { pubkey: opts.mint, isSigner: false, isWritable: false },
  { pubkey: opts.vaultUsdcAta, isSigner: false, isWritable: true },
  { pubkey: opts.recipientUsdcAta, isSigner: false, isWritable: true },
  { pubkey: opts.tokenProgramId, isSigner: false, isWritable: false },
],
```

Verify the position of `mint` matches the order in the Rust struct after Task 2.2. **The position depends on where you inserted the field in Rust** — if you put it between `vault` and `vault_usdc_ata`, the TS keys array must match.

- [ ] **Step 3.3: Commit `T-252: buildTransferUsdcIx supplies mint account`**.

---

## Task 4: Wire the mint through 3 spend handlers

**Files:**
- Modify: `apps/api/src/routes/spend.ts`

- [ ] **Step 4.1: Locate the 3 callsites of `buildTransferUsdcIx`:**
  - `postSpendTransferHandler` (around line 240)
  - `postSpendSignPaymentHandler` (around line 442)
  - `postSpendServiceHandler` (around line 732)

- [ ] **Step 4.2: For each callsite, add `mint: getUsdcMint()` to the opts.**

`getUsdcMint()` is already in scope on all three handlers (via `deps.usdcMint`). One-line change per callsite.

- [ ] **Step 4.3: `bun --filter @klink/api run typecheck` — green.** If not, fix the type errors before moving on.

- [ ] **Step 4.4: Commit `T-252: spend handlers pass mint to transfer ix`**.

---

## Task 5: Tests — update the golden fixtures

**Files:**
- Modify: `apps/api/tests/program/agent-wallet.test.ts`
- Modify: any spend-handler test that asserts on the built ix shape

- [ ] **Step 5.1: Update `agent-wallet.test.ts`** — adjust the expected keys array length 6 → 7, insert `mint` at the correct index, pin its `isSigner: false, isWritable: false`.

- [ ] **Step 5.2: Update spend-handler tests** — same shape change. Anything that captures the built ix and re-encodes it for an assertion needs the new keys order.

- [ ] **Step 5.3: `bun --filter @klink/api test` — all green.** Expect ~190 tests to pass (same count as before; this is a refactor, not new functionality).

- [ ] **Step 5.4: Commit `T-252: tests updated for 7-key TransferUsdc ix shape`**.

---

## Task 6: Devnet redeploy

**Files:**
- Modify: `docs/runbooks/devnet-deploys.md` (append a new row after the deploy lands)

**Pre-flight:**
- Confirm `solana config get` points at `https://api.devnet.solana.com`
- Confirm the upgrade authority keypair (`6fELFcucWR7CPrBrRmfAs8tNjvt5dUnQDk3cguAtdrjZ`) is set as the default signer
- `solana balance` shows enough SOL for the upgrade (~2 SOL safe margin)

- [ ] **Step 6.1: Build.**

```bash
anchor build
```

Note the new `.so` byte size. Compare against current ProgramData length (289 332 bytes after T-116 extend). If the new `.so` is larger, run `solana program extend 5qCJCEhfLusk59YFqaEG9Yg3Wp64ZaYwvXteFmCmedqv <delta> -u devnet`.

- [ ] **Step 6.2: Upgrade.**

```bash
anchor deploy --provider.cluster devnet \
  --program-id 5qCJCEhfLusk59YFqaEG9Yg3Wp64ZaYwvXteFmCmedqv
```

- [ ] **Step 6.3: Smoke per the runbook procedure.**

```bash
solana program show 5qCJCEhfLusk59YFqaEG9Yg3Wp64ZaYwvXteFmCmedqv -u devnet
```

Should show the new build commit hash and a non-zero size delta.

- [ ] **Step 6.4: Append a new row to `docs/runbooks/devnet-deploys.md`** with format from the existing rows. Build commit, slot, upgrade tx, data length, notes about TransferChecked migration.

- [ ] **Step 6.5: Commit `T-252: devnet redeploy with TransferChecked (runbook updated)`**.

---

## Task 7: End-to-end smoke against MPP echo

**Files (read-only):**
- `D:/workspace/mpp-mock-service/client/pay-echo.ts` — the reference client we know works (uses `@solana/mpp` SDK directly)

This is the moment of truth. The whole point of the migration is for klink's tx to be accepted by the MPP verifier.

- [ ] **Step 7.1: Re-deploy `apps/api` to Render** (or restart locally pointed at devnet) so the new TS callsites are live. Confirm via:

```bash
curl -s -H "Authorization: Bearer klink_dev_<token>" \
  https://klink-api.onrender.com/v1/yield/position
```

Returns `liquid > 0`. (Today shows 9.964506 USDC after the 0.05 burn.)

- [ ] **Step 7.2: Drive a spend through klink against the MPP echo.**

The exact request shape depends on which spend endpoint you use (`/v1/spend/transfer`, `/v1/spend/sign-payment`, or `/v1/spend/service`). For sign-payment:

```bash
curl -s -X POST https://klink-api.onrender.com/v1/spend/sign-payment \
  -H "Authorization: Bearer klink_dev_<token>" \
  -H "content-type: application/json" \
  -d '{
    "url": "https://<mpp-echo-url>",
    "recipient": "<recipient base58>",
    "amount": 10000
  }'
```

Expected: `200 {"tx_signature": "...", "payment_proof_header": "..."}`.

- [ ] **Step 7.3: Use that tx_signature in an MPP retry.** Hit the echo URL with the appropriate auth header (whatever the echo expects — `Authorization: Payment <credential>` per MPP spec, or `X-PAYMENT` for x402 v1 mode). Expected: **200 OK + payment-receipt header**, not 402.

If the verifier still rejects, capture the response body and the on-chain tx (via `solana confirm <sig> -u devnet`). Decode the inner instructions and verify the SPL ix is opcode 12 (TransferChecked), not 3 (Transfer). If it's still opcode 3, the deploy didn't take.

- [ ] **Step 7.4: Document the smoke result inline in TODO.md T-252 Acceptance.** Quote the successful 200 response + the on-chain tx signature.

- [ ] **Step 7.5: Confirm balance dropped by the right amount** via `/v1/yield/position`.

---

## Task 8: Close T-252

**Files:**
- Modify: `TODO.md`

- [ ] **Step 8.1: Fill the Acceptance line** with what shipped:
  - Program upgrade tx hash
  - Test counts (api + program)
  - One-line smoke result against MPP echo
  - Devnet program ID + build commit
- [ ] **Step 8.2: Flip `Status: in-progress` → `Status: done @<user> 2026-05-11`.**
- [ ] **Step 8.3: Final commit `T-252: close (TransferChecked migration shipped, MPP smoke green)`**.

---

## Out of scope / explicit non-goals

- **`owner_transfer_usdc` migration.** Owner escape hatch is not verified by MPP/x402. Stays on plain Transfer for now. Filed implicitly as a follow-up (~30 min when revisited).
- **Mainnet deploy.** Gated on T-114 (Squads multisig rotation). Do not attempt under this task.
- **x402 parser work in klink api.** Separate concern ([T-251](TODO.md) memo + the existing x402 devnet probe memo). This task only ensures klink-produced txs ARE verifier-acceptable when the parser eventually lands.
- **Token-2022 support.** The current `transfer_usdc.rs` uses legacy SPL (`Token`/`TokenAccount`). Token-2022 support is a separate, larger refactor — out of scope.
- **Decimals validation client-side.** Anchor's `Account<'info, Mint>` already validates the supplied account is a real Mint. No extra TS-side check needed.

---

## Risks + mitigations

| Risk | Mitigation |
|---|---|
| Account-order mismatch between Rust and TS | Plan calls out positions explicitly in Task 2.2 + 3.2. Test in Task 5 pins the keys array. |
| `anchor build` toolchain version drift | Task 0.2 smokes the unmodified build first. If broken, fix toolchain before code changes. |
| ProgramData overflow during upgrade | Pre-flight in Task 6 checks `.so` size vs ProgramData length. If overflow, run `solana program extend` first per the existing T-116 precedent. |
| Wrong decimals byte for non-USDC tokens | Not a concern — only USDC moves through this instruction today, validated by the mint constraint. Token-2022 support is out of scope (see non-goals). |
| MPP echo URL not stable | Smoke against the URL used in the original 2026-05-11 probe; fall back to PayAI devnet echo at `https://x402.payai.network/api/solana-devnet/paid-content` if the original is down. |
| Deploy succeeds but verifier still rejects | Decode the on-chain tx (`solana confirm`) and inspect the inner SPL ix opcode. If opcode 3, the deploy didn't take (or some callsite still uses an older builder). If opcode 12 and still rejected, capture the verifier error and re-diagnose. |

---

## Time estimate

| Task | Estimate |
|---|---|
| Task 0: Pre-flight verification + reproduce | 30 min |
| Task 1: File T-252 + claim | 10 min |
| Task 2: Rust changes | 30 min |
| Task 3: TS builder change | 20 min |
| Task 4: Wire mint through 3 handlers | 15 min |
| Task 5: Tests | 45 min |
| Task 6: Devnet redeploy + runbook | 45 min |
| Task 7: MPP echo smoke | 45 min |
| Task 8: Close T-252 | 15 min |
| **Total** | **~4 hours** active session time |

---

## What to do RIGHT NOW (before claiming)

1. Read [transfer_usdc.rs](programs/agent_wallet/src/instructions/transfer_usdc.rs) end-to-end (158 lines).
2. Read [agent-wallet.ts:260-300](apps/api/src/program/agent-wallet.ts) (the builder).
3. Read [spend.ts](apps/api/src/routes/spend.ts) lines around 442, 732 (the 3 callsites).
4. Read [devnet-deploys.md](docs/runbooks/devnet-deploys.md) (the redeploy runbook).
5. Decide whether to take Route A or Route B for decimals (plan recommends Route A).
6. Then issue `claim T-252`.

---

**Status**: plan written, awaiting `claim T-252` per CLAUDE.md operating rules.
