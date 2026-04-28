---
title: Risks
purpose: Honest disclosure of where Klink is today — what's audited, what's mitigated, what's deferred. Source = docs/specs/2026-04-28-agent-wallet-design.md §5
last_updated: 2026-04-28
---

# Risks

This page exists because Klink is pre-mainnet and we'd rather you know the failure modes than discover them in production.

## Status disclosures

| Item | State |
|---|---|
| **Network** | Devnet only. Mainnet is gated on T-115 (external program review). |
| **External program review** | Not yet completed. |
| **Multisig upgrade authority** | Not yet in place — single keypair during build, swapped to a 2-of-N Squads multisig as part of T-114 before mainnet. |
| **Treasury float (fiat-in bridge)** | Cap-limited at minimum viable for MVP. |
| **KMS for secrets** | Not in MVP. Session secrets and the treasury keypair use env-var-based AES-256-GCM. |
| **License** | Pending — tracked as a follow-up to T-115. |

## Known failure modes and how they're handled

| Failure | Impact | Mitigation |
|---|---|---|
| Backend down | Spend, fiat-in, dashboard unavailable. Wallet itself still functional via direct Phantom interaction (emergency drain, session revocation). | Stateless backend → horizontal scale. Owner escape hatch is the safety net. |
| Solana RPC down | All chain reads/submits fail. | Paid RPC (Helius / QuickNode / Triton) with multi-region fallback. |
| Kamino down or contract upgrade | Can't withdraw deployed funds. | Disclosed at deploy. Multi-protocol yield is post-MVP. |
| Kamino utilization stress | `kamino_withdraw` returns less than requested. | Backend returns `409 PARTIAL_LIQUIDITY { available }`. Caller retries smaller amount or waits. |
| Session keypair leaked | Attacker spends up to `daily_cap` to allowlisted recipients. | Owner signs `revoke_session` from Phantom (~$0.0001, ~5s). |
| Master encryption key leak | All session secrets decryptable. | Bounded by on-chain rules. Rotation runbook documented. KMS is v2. |
| Treasury keypair leak | Float drain (capped at minimum viable). | Low float, balance monitoring, alerting. KMS + multisig is v2. |
| Webhook spoofing (fiat-in) | Faked payment → treasury drain. | HMAC signature verify + idempotency on the payment-session ID + replay-window timestamp check. |
| Race: two concurrent spends | Both pass pre-flight; second fails on-chain. | On-chain enforcement is source of truth. Backend returns chain error. |
| Race: policy edit mid-spend | Whichever tx lands first wins. | Spend hitting new policy reverts; agent retries. |
| Race: revoke mid-spend | Revoke wins. | Agent treats `SessionRevoked` as terminal. |
| Clock drift (off-chain time check) | Edge cases at window boundaries. | NTP + 60s grace. On-chain uses `Clock` sysvar. |
| URL allowlist wildcard injection | User enters `*.evil.com`; attacker registers `legit.evil.com`. | Wildcards restricted to path segments only — host wildcards rejected at insert time. |
| Daily cap overflow under concurrency | Many concurrent requests pass pre-flight on stale snapshot. | On-chain `daily_spent` update is atomic per tx. Pre-flight is for UX latency only. |
| Phantom signature replay (SIWS) | Attacker reuses captured signed message. | Nonce + 60s expiry, single-use TTL in Redis. |
| Anchor program bug post-deploy | Funds locked or drainable. | Pre-mainnet review (T-115). Capped balances at beta. Multisig upgrade authority. |
| Solana network outage | All txs paused (~6h historical). | Document. Not Klink's failure to fix. |

## What you're trusting

* **Solana** — chain liveness, ed25519 verification, the SPL Token Program, the Clock sysvar
* **Kamino** — its main USDC reserve's solvency and continued operation (only matters if you opt into yield)
* **Phantom** — the human's wallet extension is honest about what it signs
* **The Klink program** — pre-audit; review checkpoint gates mainnet (T-115)
* **The Klink backend** — for off-chain rules, off-chain audit log enrichment, fiat-in plumbing. The on-chain layer bounds the worst case if the backend is compromised.

## Recommendations for early use

1. **Stay on devnet** until T-113 (devnet smoke test) and T-115 (external review) land.
2. **Cap balances small.** The on-chain caps are real, but you're still pre-audit.
3. **Use short `expiry`** on sessions. Even if the keypair leaks, the blast radius is bounded by `daily_cap × time-to-expiry`.
4. **Tight `allowed_recipients`.** Don't add recipients you might never use.
5. **Set `allowed_instructions = 0b0000_0001`** (transfer-only) unless you actively want yield.
6. **Keep your Phantom seed safe.** No protocol-level recovery — same as any Solana wallet.

## Out of scope for MVP

These are explicitly **not** addressed in v1 and may surprise you if you assume they're there:

* Auto-deploy / auto-rebalance to yield protocols
* Auto-withdraw on spend (JIT liquidity) — caller must explicitly withdraw before spending
* Multi-protocol yield (Kamino only)
* Multi-reserve Kamino selection (single hardcoded main USDC reserve)
* Atomic withdraw + spend bundling (uses two sequential txs)
* Anomaly detection, advanced fraud rules
* Multi-sig recovery, social recovery beyond "owner pubkey is master"
* Dynamic-size allowlists (fixed 10 slots in MVP)
* Python / mobile / React Native SDKs

See [Roadmap](roadmap.md) for the post-MVP plan.

## Read next

* [Roadmap](roadmap.md) — what unblocks each item
* [FAQ](faq.md) — common questions about scope and security
