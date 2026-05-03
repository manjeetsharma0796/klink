---
icon: shield-alert
title: Risks & Disclosures
description: Security model, threat scenarios, and what to know before relying on Klink for non-trivial value
---

# Risks & Disclosures

This page is the security model and responsible-use disclosure for Klink. Read it before relying on the wallet for non-trivial value.

## Beta status

| Item | State |
|---|---|
| **Network** | Devnet only during the public beta. Mainnet support arrives after the program audit completes. |
| **Program audit** | Not yet completed. |
| **Multisig upgrade authority** | Single keypair during beta; swapped to a 2-of-N multisig before mainnet. |
| **Treasury float (fiat-in bridge)** | Cap-limited at minimum viable during beta. |
| **KMS for secrets** | Not in the current release. Session secrets and the treasury keypair use environment-based AES-256-GCM. |

## Threat scenarios and mitigations

| Failure | Impact | Mitigation |
|---|---|---|
| Backend down | Spend, fiat-in, dashboard unavailable. Wallet itself still functional via direct Phantom interaction (emergency drain, session revocation). | Stateless backend → horizontal scale. Owner escape hatch is the safety net. |
| Solana RPC down | All chain reads/submits fail. | Paid RPC providers with multi-region fallback. |
| Yield protocol down or contract upgrade | Can't withdraw deployed funds. | Disclosed at deploy. Multi-protocol yield is on the roadmap. |
| Yield utilization stress | `kamino_withdraw` returns less than requested. | Backend returns `409 PARTIAL_LIQUIDITY { available }`. Caller retries smaller amount or waits. |
| Session keypair leaked | Attacker spends up to `daily_cap` to allowlisted recipients. | Owner signs `revoke_session` from Phantom (~$0.0001, ~5s). |
| Master encryption key leak | All session secrets decryptable. | Bounded by on-chain rules. Rotation runbook documented. KMS migration is planned. |
| Treasury keypair leak | Float drain (capped at minimum viable). | Low float, balance monitoring, alerting. KMS + multisig is planned. |
| Webhook spoofing (fiat-in) | Faked payment → treasury drain. | HMAC signature verify + idempotency on the payment-session ID + replay-window timestamp check. |
| Race: two concurrent spends | Both pass pre-flight; second fails on-chain. | On-chain enforcement is source of truth. Backend returns chain error. |
| Race: policy edit mid-spend | Whichever tx lands first wins. | Spend hitting new policy reverts; agent retries. |
| Race: revoke mid-spend | Revoke wins. | Agent treats `SessionRevoked` as terminal. |
| Clock drift (off-chain time check) | Edge cases at window boundaries. | NTP + 60s grace. On-chain uses `Clock` sysvar. |
| URL allowlist wildcard injection | User enters `*.evil.com`; attacker registers `legit.evil.com`. | Wildcards restricted to path segments only — host wildcards rejected at insert time. |
| Daily cap overflow under concurrency | Many concurrent requests pass pre-flight on stale snapshot. | On-chain `daily_spent` update is atomic per tx. Pre-flight is for UX latency only. |
| Phantom signature replay (SIWS) | Attacker reuses captured signed message. | Nonce + 60s expiry, single-use TTL in cache. |
| Anchor program bug post-deploy | Funds locked or drainable. | Pre-audit at beta. Capped balances at beta. Multisig upgrade authority planned. |
| Solana network outage | All txs paused. | Klink tracks Solana liveness; outage disclosure is upstream. |

## What you're trusting

* **Solana** — chain liveness, ed25519 verification, the SPL Token Program, the Clock sysvar
* **The yield protocol** — its main USDC reserve's solvency and continued operation (only matters if you opt into yield)
* **Phantom** — the human's wallet extension is honest about what it signs
* **The Klink program** — pre-audit during beta; mainnet support gated on external review
* **The Klink backend** — for off-chain rules, audit-log enrichment, fiat-in plumbing. The on-chain layer bounds the worst case if the backend is compromised.

## Recommendations for early use

1. **Stay on devnet** during the public beta.
2. **Cap balances small.** The on-chain caps are real, but you're still pre-audit.
3. **Use short `expiry`** on sessions. Even if the keypair leaks, the blast radius is bounded by `daily_cap × time-to-expiry`.
4. **Tight `allowed_recipients`.** Don't add recipients you might never use.
5. **Set `allowed_instructions = 0b0000_0001`** (transfer-only) unless you actively want yield.
6. **Keep your Phantom seed safe.** No protocol-level recovery — same as any Solana wallet.

## Out of scope for the current release

These are explicitly **not** addressed yet and may surprise you if you assume they're there:

* Auto-deploy / auto-rebalance to yield protocols
* Auto-withdraw on spend (JIT liquidity) — caller must explicitly withdraw before spending
* Multi-protocol yield (single integration in beta)
* Multi-reserve selection (single hardcoded main USDC reserve)
* Atomic withdraw + spend bundling (uses two sequential txs)
* Anomaly detection, advanced fraud rules
* Multi-sig recovery, social recovery beyond "owner pubkey is master"
* Dynamic-size allowlists (fixed 10 slots in beta)
* Python / mobile / React Native SDKs

See [Roadmap](roadmap.md) for the path forward.

## Read next

* [Roadmap](roadmap.md) — what unblocks each item
* [FAQ](faq.md) — common questions about scope and security
