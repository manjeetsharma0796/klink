# Dodo checkout → treasury → vault disbursement audit

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to investigate this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Answer a single yes/no with evidence: **when a user completes a Dodo card checkout, does klink automatically disburse the equivalent USDC from the treasury wallet to that user's vault USDC ATA, atomically, idempotently, and with the right audit trail?** If yes, document the proof. If no, pinpoint the gap.

**Trigger:** 2026-05-11. The Dodo fiat-in flow (T-214, T-215, T-243, T-244, T-245) has shipped over the past two weeks. We've never sat down and end-to-end-verified the on-chain leg from a real production-class payment. Webhook signing, schema, return page, and audit linkage are all known-good in isolation, but the leg that actually moves USDC out of the treasury onto a user's vault is the high-value action and is the one most likely to silently fail (treasury empty, RPC error, ATA missing, idempotency check broken, etc.).

---

## Reading order — before any conclusion

| # | File | Why |
|---|---|---|
| 1 | `apps/api/src/routes/dodo.ts` | The webhook handler that fires on `payment.succeeded`. Source of truth for what klink does after Dodo confirms a card payment. |
| 2 | `apps/api/src/db/schema.ts` (the `dodo_payments` + `audit_log` tables) | Schema klink writes to after settlement. Confirms what's tracked. |
| 3 | `apps/api/src/crypto/treasury.ts` (or wherever `loadTreasury()` lives) | Where the treasury keypair is loaded from. Verifies the disbursement signer. |
| 4 | `apps/api/scripts/devnet-setup.sh` + `docs/runbooks/devnet-deploys.md` | Operational context for the treasury wallet. |
| 5 | TODO.md entries T-214, T-215, T-243, T-244, T-245 (all already in Done) | Original acceptance criteria; cross-check against what's actually shipped. |
| 6 | The on-chain treasury address `9muAwR8a4LEgFGLNPfoUHhJrfLmtkXFBvpBQCx2GLVTU` via `solana account` | Eyes-on-glass check of treasury SOL + USDC balance. |
| 7 | Recent rows in `dodo_payments` (`status = 'settled'`) via Neon | Did real payments actually land + disburse? Empty table = the flow has never been exercised end-to-end. |

---

## Investigation tasks (run in parallel)

### Task A — Map the webhook → disbursement code path

- [ ] **A.1** Read `apps/api/src/routes/dodo.ts` end-to-end. Map every step from `POST /v1/webhooks/dodo` arrival to the moment a USDC transfer ix is built.
- [ ] **A.2** Identify the exact line where klink decides "this payment is settled, disburse now." What predicate gates it?
- [ ] **A.3** Identify the exact code that builds the USDC transfer from treasury to the user's vault USDC ATA. Is it a vanilla SPL Token Transfer, a TransferChecked, or a klink-program instruction (which would be wrong — klink's program only moves *out of* vaults, not into them)?
- [ ] **A.4** Idempotency: what stops the same `payment.succeeded` event firing twice from disbursing twice? Look for a unique constraint on `dodo_payments.payment_id` or a status guard.
- [ ] **A.5** Audit linkage: where does the resulting `audit_log` row get inserted, with what `action`, and is the `dodo_payment_id` FK populated (per T-245)?
- [ ] **A.6** Error paths: what happens if (a) treasury has insufficient USDC, (b) the user's vault USDC ATA doesn't exist, (c) the RPC submission throws, (d) the user has no klink wallet yet at the moment the payment lands? Each of these should have a defined behavior, not crash the webhook.

### Task B — Verify the treasury wallet state + setup

- [ ] **B.1** Confirm the treasury address `9muAwR8a4LEgFGLNPfoUHhJrfLmtkXFBvpBQCx2GLVTU` via `solana account 9muA...GLVTU -u devnet`. Capture SOL balance.
- [ ] **B.2** Look up the treasury's USDC ATA (per `TREASURY_USDC_ATA=DBRYhuJUmEzcqpS2WabaHKxwCJBz5QSvuSMoys66vQVB` from earlier Render env paste). Read its on-chain balance with `solana account` or `getTokenAccountBalance`. Confirms how much USDC the treasury has available to disburse.
- [ ] **B.3** Read `apps/api/src/crypto/treasury.ts` (or equivalent) to see where the keypair is loaded from. Confirm it's env-driven (`TREASURY_SECRET_KEY` from earlier env paste) and not committed.
- [ ] **B.4** Sanity-check that the treasury is funded enough to disburse at least one realistic checkout amount (e.g., 5 USDC for $5 of fiat-in).

### Task C — Database evidence: has it ever worked end-to-end?

- [ ] **C.1** Query `dodo_payments` for rows with `status = 'settled'`. Report count + the most recent 5 rows (id, amount, status, tx_signature, created_at, settled_at).
- [ ] **C.2** For any settled row, follow the `tx_signature` on-chain (`solana confirm <sig> -u devnet`) and verify a TransferChecked of the right USDC amount from `TREASURY_USDC_ATA` to the user's `wallets.usdc_ata` happened.
- [ ] **C.3** Cross-check: for those settled rows, is there a matching `audit_log` entry with `action = 'fund_dodo'`, `decision = 'allow'`, and `dodo_payment_id` populated?
- [ ] **C.4** Look for `dodo_payments` rows stuck in `pending` for > 30 min. Those are the worst signal — the customer paid in fiat, klink got the webhook, klink failed to disburse, customer's USDC never arrived. Capture them all with their failure reason.

---

## Synthesis

After A, B, C complete, write a single section at the bottom of this plan:

- **Verdict** (one of): ✅ Works end-to-end / 🟡 Works but with concerns: <list> / ❌ Does not work: <reason>
- **Evidence**: one block per concrete proof — a tx signature, a DB row excerpt, a code citation with file:line
- **Action items if any** — coded as a new task on TODO.md, not landed in this plan

---

## Out of scope

- Fixing whatever is broken (file a follow-up task instead). This is an audit only.
- Touching `dodo.ts` or any code. Read-only investigation.
- Asking Dodo for support. The webhook + checkout shape is verified via T-243's tests; that's not in question.
- The fiat-payment-flow UX (T-244 return page). Customer experience past `payment.succeeded` is out of scope; we're checking the on-chain leg only.

---

## Time estimate

| Task | Estimate |
|---|---|
| Plan write | 10 min |
| Dispatch A + B + C agents in parallel | 1 min |
| Agent runs | 5-10 min wall-clock |
| Synthesis | 10 min |
| **Total** | **~30 min** |

---

**Status**: agents dispatched 2026-05-11; findings below.

## Findings

### Verdict: ❌ Does NOT work end-to-end. Critical blocker on the on-chain leg.

A Dodo `payment.succeeded` event would land in klink today, but the on-chain disbursement that's supposed to follow **cannot succeed** because the treasury's source USDC token account doesn't exist on-chain. Two related code bugs compound the problem.

### Evidence

| # | Finding | Severity | Proof |
|---|---|---|---|
| 1 | **Treasury USDC ATA does not exist on devnet** | 🔴 Blocker | `solana getAccountInfo DBRYhuJUmEzcqpS2WabaHKxwCJBz5QSvuSMoys66vQVB` returns null. The env var `TREASURY_USDC_ATA=DBRYhuJUm…vQVB` matches the correctly-derived ATA for `9muAwR8a…GLVTU` + USDC mint `4zMMC9…JDncDU`, so the config isn't wrong — the ATA was simply never initialized on-chain. Treasury SOL balance is fine (4.99 SOL); only the USDC ATA is missing. |
| 2 | **No CTAI in the disbursement code path** | 🔴 Blocker | `apps/api/src/routes/dodo.ts:581` builds the transfer with vanilla `createTransferInstruction` from `@solana/spl-token`. No `createAssociatedTokenAccountIdempotentInstruction` for either side. Even after fix #1 (initializing the treasury ATA), every recipient vault whose own USDC ATA doesn't yet exist (common for fresh wallets — `wallets.usdc_ata` is stored at row-creation time but the ATA itself is only created lazily) will crash with `AccountNotInitialized` on the destination. Same gap T-256 fixed in the spend handlers; was never fixed here. |
| 3 | **Missing-wallet-row response is 500, causing infinite Dodo retries** | 🟡 Silent failure | `apps/api/src/routes/dodo.ts:561-564` returns `500 {"error":"wallet missing"}` if the user paid before creating a klink wallet. Dodo retries with exponential backoff for hours. The `dodo_payments` row stays `status='pending'` and no audit row is ever written. Customer paid fiat, USDC never arrives, no klink-side signal anyone could notice. |
| 4 | **Tx submission inside the webhook response window** | 🟡 Race | `dodo.ts:603` does `sendAndConfirmTransaction` inside the request handler before returning 200. If devnet RPC is slow (~10s+), Dodo's webhook timeout fires before the response → spurious retry. Replay finds `status='settled'` (post-success) or `status='failed'` (post-deny audit) and noops, so it's "safe" but inefficient and obscures real failures. |
| 5 | **Disbursement uses plain `Transfer`, not `TransferChecked`** | 🟢 Note (not a bug for this path) | dodo.ts:581. Plain Transfer is fine here because the destination is klink-owned (vault USDC ATA), no merchant verifier sees the tx, so the on-wire mint/decimals binding T-252 needed for spend isn't required. Could still migrate for defense-in-depth, but low priority. |

### What works correctly (so this isn't all bad news)

- **Webhook auth**: HMAC-SHA256 Standard Webhooks scheme, raw body preserved via `express.raw()` before `express.json()` mounts. Confirmed at `app.ts:51-55`.
- **Event filter**: Only `payment.succeeded` events with a `checkout_session_id` trigger disbursement. `subscription.*`, `dispute.*`, `payment.failed`, etc. all `200 ignored`. Confirmed at `dodo.ts:500-522`.
- **Idempotency**: Two layers — `dodo_payments.dodo_session_id` UNIQUE constraint (`schema.ts:101`) + status guards at `dodo.ts:546-554` (`if (status === 'settled') return 200`). A replay of the same `payment.succeeded` event noops cleanly.
- **Lookup logic**: Uses `event.data.checkout_session_id` (the `cks_…`), not the broken `event.data.id` that T-245 fixed. Confirmed.
- **DB settlement fields populated post-disbursement**: status / tx_signature / settled_at / payment_id / invoice_id / invoice_url all set per T-245. Confirmed at `dodo.ts:634-643`.
- **Audit linkage**: Insert into `audit_log` with `action='fund_dodo'`, decision allow/deny, `dodoPaymentId` FK populated, `txSignature` set. Confirmed at `dodo.ts:618-625` (deny) and `dodo.ts:650-657` (allow).

### Action items

To be filed as a new TODO.md backend task. Treating this as a single coherent fix:

1. **Initialize the treasury USDC ATA on devnet** (one-time ops step). Run, e.g.:
   ```bash
   spl-token create-account 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU \
     --owner 9muAwR8a4LEgFGLNPfoUHhJrfLmtkXFBvpBQCx2GLVTU \
     --fee-payer <funder> -u devnet
   ```
   Then transfer some devnet USDC into it (5-20 USDC is fine for demo). Document in `docs/runbooks/devnet-deploys.md` or a new `dodo-treasury.md` runbook so it doesn't drift again.
2. **Patch dodo.ts to prepend CTAI for the recipient vault ATA** (mirrors T-256's approach for spend handlers). One-line addition.
3. **Change the missing-wallet-row response to 200 + deny audit row** with reason `WALLET_MISSING`. Stops Dodo from retrying forever and gives the operator a deny row to alert on.
4. **(Optional, lower priority)** Move tx submission to a background worker; respond 200 immediately after marking `status='processing'`. Avoids the webhook-timeout race entirely. Treat as separate task if scoped.

All four together = ~50 LOC + one ops step + one runbook entry.

### Out-of-scope but worth flagging

- The treasury's USDC ATA on mainnet (when shipped) needs the same one-time-init treatment. Don't let this bug repeat at mainnet cutover.
- The `TREASURY_SECRET_KEY` is in chat history (env paste leak earlier today). Rotation task already noted; this finding doesn't add to that.

