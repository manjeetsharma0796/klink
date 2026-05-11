---
title: 3 reference integrations to ship for the launch demo
purpose: Pick 3 specific integration shapes that make klink's value (on-chain caps, recipient allowlist, audit trail, no-key-on-agent) load-bearing in a demo. T-504.
last_updated: 2026-05-11
---

# 3 reference integrations to ship for the launch demo (T-504)

## TL;DR

Three picks, ordered by how shippable they are this week without lying about what works:

1. **Self-hosted MPP echo loop** (the canonical `service01` pattern). Devnet, end-to-end real, runs today. Demo uses our own merchant so we control upstream uptime.
2. **Pre-allowlisted, treasury-funded "subscription bot"** that pays a fixed recipient (the merchant's payout wallet) on a schedule. Devnet today, mainnet at T-114 cutover. Recipient allowlist + daily cap make this a one-line demo of "agent can't drain this account even if compromised."
3. **Multi-recipient fan-out paymaster** (one human session, multiple sub-agent payees) where the human pre-allowlists 3 named recipient pubkeys (a search agent, a code agent, an image agent) and the orchestrator routes USDC to whichever sub-agent did the work. Devnet today; demo runs entirely against `/v1/spend/transfer`.

What's deliberately not on this list and why is in §4. Order to ship is in §5.

The honest constraint shaping all three picks: the only end-to-end-verified MPP-on-Solana upstream we can pay today is `service01-kep9.onrender.com/echo` ([gitbook services page](../../gitbook/services/mpp.md)). MPP services on Tempo (Anthropic, OpenAI, Exa, Firecrawl via `*.mpp.tempo.xyz` and `*.mpp.paywithlocus.com`, [mpp.dev/services/llms.txt](https://mpp.dev/services/llms.txt)) settle on **Tempo / Base, not Solana**, so klink's `/v1/spend/mpp` proxy cannot reach them. The x402-on-Solana mainnet services that do exist (QuickNode RPC, ChainAnalyzer AML on Coinbase CDP facilitator, Stakevia validator reports) are **mainnet-only and don't exist on devnet**, so klink (which is devnet-only until T-114 + mainnet program audit) cannot exercise them in the demo at all without a fake. We do not pretend otherwise.

## 1. Pick A: self-hosted MPP echo loop

**One-sentence shape.** A long-running agent calls a paid MPP-on-Solana endpoint we control (`service01-kep9.onrender.com/echo`, 0.01 USDC per call) via `POST /v1/spend/mpp`, and the demo audience watches the on-chain `TransferChecked` land in real time on Solana Explorer.

**Why klink (vs alternatives).**

| Alternative | Why it loses |
|---|---|
| Raw keypair on the agent | Agent holds the master key. Compromise = full drain of vault. klink's session bearer cannot move funds outside the on-chain `allowed_recipients` allowlist; even a leaked `klink_dev_…` token is bounded by `max_per_tx`, `daily_cap`, and the recipient list. |
| Hosted custodian (Locus, Crossmint, Privy) | Custodian operationally controls the funds; the policy enforcement is server-side, not on-chain, so "what was the rule when this tx fired" is a database row, not a Solana account. The audit trail relies on the custodian's good faith; klink's trail is the public ledger. |
| Treasury-only direct top-up | Doesn't demonstrate caps. The audience cannot see the cap protecting the spend, only the raw transfer. |

**What's already shippable today.**

- `POST /v1/spend/mpp` (T-253; tx `XDPFH7Z3uZ5djZBoidUr2kaGCnqzucojRyxwAALfb2DhUhdx8CNk4a1VuakEpm6GZfWsqEznYaZg7XFbRan11xc` proves the round trip).
- Off-chain URL allowlist already supports `service01-kep9.onrender.com`.
- Recipient `81eM3oPR1fUJSsFhNm6G51W4jwE2HondS2kjBmcxFcJ2` is the canonical echo recipient ([gitbook services page](../../gitbook/services/mpp.md), table row 1) and goes in the on-chain `allowed_recipients`.
- Demo session config: `max_per_tx = 100_000` (0.10 USDC), `daily_cap = 1_000_000` (1.00 USDC), `allowed_instructions = 1` (transfer only). Both caps are a multiple of the actual 0.01 USDC quote so the demo can run repeatedly without bumping the cap.
- `GET /v1/session/me` (T-239) lets the agent read its own remaining budget mid-demo, which makes a nice on-stage moment ("I have 0.78 USDC left, I can do 78 more calls").

**What's missing.**

- Nothing load-bearing. The merchant is on Render free tier, so cold start can be ~30s, plan accordingly (warm it before the demo).
- The `@solana/mpp` inner-instruction patch ([gitbook MPP services page](../../gitbook/services/mpp.md), "Caveat for smart-contract wallets" section) must be applied to the merchant. service01 already has this in postinstall; if we spin up a second merchant for the demo, port the patch.

**Why this specific pick over adjacent alternatives.** It is the only end-to-end-real klink + MPP + Solana flow that exists this week. We can demo the policy denial path too (point the agent at a recipient that is **not** in the allowlist, watch the on-chain revert with `RecipientNotAllowed`), which is the actual differentiation moment.

## 2. Pick B: pre-allowlisted, treasury-funded subscription bot

**One-sentence shape.** A monitoring agent (uptime checker, RSS digester, anything that wakes on a cron) tops up its own paid SaaS subscription from a klink session whose `allowed_recipients` contains exactly one entry (the SaaS payout pubkey) and whose `daily_cap` matches the monthly bill divided by 30.

**Why klink (vs alternatives).**

| Alternative | Why it loses |
|---|---|
| Raw keypair | Same drain risk as above, plus the keypair sits on the box running the cron forever. |
| Stripe / card subscription | Card auth requires a human-present 3DS step on most issuers. Cards do not let you cap "this card may pay only this one merchant up to $X/month" at the rail level; that's the literal point of klink's recipient allowlist. |
| Hosted custodian's "spend rules" (Locus allowance/max-tx) | The rule is a database row at the custodian. If the custodian disables your account or goes down, the bot stops paying. klink's caps are on-chain and survive any backend outage; the agent just hits 503 and retries. |

**What's already shippable today.**

- `POST /v1/spend/transfer` (T-210/T-211 long-shipped) is sufficient if we know the SaaS recipient pubkey.
- Recipient allowlist enforced at the on-chain `transfer_usdc` instruction (`RecipientNotAllowed` revert if violated; substring documented in [`apps/web/public/skill.md`](../../apps/web/public/skill.md), "On-chain 402 substrings").
- Daily cap enforced at the on-chain instruction (`DailyCapExceeded`).
- `GET /v1/session/me` (T-239) for budget-remaining checks before the cron fires.

**What's missing.**

- **There is no real Solana-paid SaaS subscription endpoint to point at.** The closest thing in our world is the same `service01-kep9.onrender.com/echo` again, which makes this pick collapse into pick A unless we mock a "DataDog-style" recipient address. The demo can show: agent sends 0.05 USDC/day to a static recipient pubkey (a second wallet we control), the audit log shows the daily cap eating denials past the cap, the human audience sees the recipient allowlist make a "wrong recipient" attempt revert. The "subscription" framing is narrative, not protocol. **Be explicit about this on stage.**
- **Mainnet is the natural home for this pick** (real money, real merchant). Devnet works for the demo, but the pitch ("this protects a real $20/month bill") implies mainnet. T-114 (mainnet program audit + multisig upgrade authority) is the unblocker.
- **Time-of-day window** is documented in skill.md (`OUTSIDE_TIME_WINDOW` 403) and would be a nice demo addition (cron only fires 09:00-17:00), but is off-chain enforced and orthogonal to the load-bearing claim.

**Why this specific pick over adjacent alternatives.** It is the cleanest articulation of "klink replaces a corporate card with on-chain spend rules" in one screen, and it works with `/v1/spend/transfer` alone (no MPP, no service catalog dependency). The subscription framing also lets us tell a "what if this bot is compromised" story with a concrete dollar figure, which the echo loop does not.

## 3. Pick C: multi-recipient fan-out paymaster

**One-sentence shape.** One human session, three pre-allowlisted sub-agent recipient pubkeys (search-agent, code-agent, image-agent); a top-level orchestrator agent receives a task, decides which sub-agent did the work, and pays each one a small USDC slice via `/v1/spend/transfer` to the corresponding pubkey.

**Why klink (vs alternatives).**

| Alternative | Why it loses |
|---|---|
| One shared treasury wallet, sub-agents request reimbursement | No real-time enforcement; the orchestrator has full discretion to pay anyone, including itself. klink's allowlist makes "the orchestrator can pay only these three pubkeys" enforceable on chain. |
| Three separate keys, one per sub-agent | Triples the surface area of credentials to manage; no unified daily cap across the fan-out. klink's `daily_cap` is per session and applies across all three recipients. |
| Hosted custodian | Same on-chain-vs-DB-row argument as picks A and B. |

**What's already shippable today.**

- `POST /v1/spend/transfer` to multiple distinct recipients, all in the same on-chain `allowed_recipients` array (10 slots is plenty for three).
- ATA auto-creation (T-256) means the orchestrator can pay a recipient pubkey that has never held USDC before, without a human handoff. This is documented in [`apps/web/public/skill.md`](../../apps/web/public/skill.md) under the `/v1/spend/transfer` section ("auto-created if missing", treasury pays rent).
- `GET /v1/session/me` for the orchestrator to read its own daily budget before deciding routing.

**What's missing.**

- **The sub-agents are demo props, not real agents.** The recipient pubkeys can be three keypairs we generate on stage. To make this look like a real demo (sub-agents that actually do something), we need three distinct things they pretend to do; the value of klink does not depend on the work being real, only on the routing being real.
- The on-chain `allowed_recipients` array has a fixed 10-slot capacity per the [design spec](../specs/2026-04-28-agent-wallet-design.md) non-goals ("Dynamic-size allowlists (fixed 10 slots for recipients in MVP)"). For a 3-recipient fan-out this is non-binding; for a 50-sub-agent demo it would be. Don't over-promise the scaling story.
- No yield needed for this demo, so `YIELD_DISABLED` on devnet is irrelevant.

**Why this specific pick over adjacent alternatives.** It is the only one of the three that exercises **multiple recipients in one session** in a way the audience can see. Picks A and B are 1:1 (one agent, one recipient); pick C makes the allowlist visibly do work. It is also the most "this is how production agents will actually be wired" of the three, because real agent stacks do fan out across specialized models / tools.

## 4. Considered but rejected

| Idea | Why we rejected it |
|---|---|
| **Coding agent that pays per-call for an LLM via MPP** (Anthropic / OpenAI on `*.mpp.tempo.xyz`) | Those services settle on **Tempo, not Solana**. klink's `/v1/spend/mpp` is Solana-only ([gitbook services page](../../gitbook/services/mpp.md), token-mint table). No way to make this work without lying or building a second-chain bridge that does not exist in scope. |
| **CI bot that pays per-deploy for hosting via Cloudflare x402** | Cloudflare's x402 docs ([developers.cloudflare.com/agents/x402/](https://developers.cloudflare.com/agents/x402/)) describe the protocol and a `paidTool` pattern but **do not list a first-party Cloudflare endpoint** that accepts USDC for a deploy / Worker invocation / R2 write today. The reference template lets *you* monetize *your own* Worker; it is not a Cloudflare-operated paywall. So the demo would be "we built our own Worker that takes USDC", which collapses to pick A with extra steps. |
| **Open-source project that fan-outs USDC donations to maintainers** | Same shape as pick C but with the human-doing-routing inverted (donation comes in, paymaster pays out). The interesting policy claim ("agent can't pay anyone outside the maintainer list") is identical to pick C's claim, so this is just a reframing. Pick C is the cleaner demo because the routing decision is autonomous, not human-triggered. |
| **Coding agent paying QuickNode for Solana RPC via x402** ([QuickNode guide](https://www.quicknode.com/guides/solana-development/ai-agents/how-to-access-solana-rpc-with-x402-solana)) | QuickNode's x402-Solana integration is real and live ($10 USDC mainnet credit-drawdown, $0.01 devnet per their docs), but it uses the older x402 dialect (X-PAYMENT header sign-and-retry, [Coinbase CDP facilitator-style](https://docs.cdp.coinbase.com/x402/welcome)), not the MPP `WWW-Authenticate: Payment` flow our `/v1/spend/mpp` proxy implements. We would need to verify it works against `/v1/spend/sign-payment` end-to-end first, which is a research project, not a demo. Worth a follow-up T-### but not for launch. |
| **Yield-management agent that auto-deposits idle USDC into Kamino** | `YIELD_DISABLED` on devnet ([`apps/web/public/skill.md`](../../apps/web/public/skill.md), "Beta caveats"). Mainnet is T-114. Kamino's exchange-rate decode is not yet wired (`accrued: null`). Three load-bearing gaps; not a launch demo. |
| **ChainAnalyzer AML or Stakevia validator reports as paid services** | Both exist on x402 mainnet ([x402.org/ecosystem](https://www.x402.org/ecosystem)) and are conceptually a great fit (per-call USDC, real merchants), but klink is **devnet-only** until T-114 ships. Demoing against mainnet services from a devnet wallet is impossible by construction. Reconsider for a post-mainnet refresh. |

## 5. Order to ship

1. **Pick A first.** Zero new infrastructure required, runs against the merchant we already operate, cap-tripping path (`RecipientNotAllowed`) is the most visceral piece of the pitch.
2. **Pick C second.** Two demo keypairs to generate, three lines of orchestrator code, no new endpoints, no new on-chain primitives. Sells the "policy as load-bearing infra" story better than picks A or B alone.
3. **Pick B third.** Requires the most "use your imagination" framing on stage (no real Solana-paid SaaS to point at), and the strongest version of the pitch is on mainnet which we don't have. Land it after T-114 if the launch slips, otherwise script around the gap and lead with picks A and C.

A "good" 3-minute demo is pick A → pick C, narrated as "the agent paid for the work it actually wanted to do (A), and then paid the sub-agents who helped it (C)." That is one cap-tripping moment and one fan-out moment in the same session, which is probably the strongest 3-minute story we have on devnet today. Pick B becomes the "and here's what this looks like in production" voiceover at the end, with mainnet as the explicit caveat.

## Sources

- klink agent skill (HTTP surface): [`apps/web/public/skill.md`](../../apps/web/public/skill.md)
- klink MPP services directory: [`gitbook/services/mpp.md`](../../gitbook/services/mpp.md), seeded with `service01-kep9.onrender.com/echo`
- klink TypeScript SDK: [`packages/sdk/README.md`](../../packages/sdk/README.md)
- klink design spec (three-actor model, 10-slot allowlist non-goal): [`docs/specs/2026-04-28-agent-wallet-design.md`](../specs/2026-04-28-agent-wallet-design.md)
- T-253 verification tx: `XDPFH7Z3uZ5djZBoidUr2kaGCnqzucojRyxwAALfb2DhUhdx8CNk4a1VuakEpm6GZfWsqEznYaZg7XFbRan11xc`
- mpp.dev cross-chain service registry (Tempo + Base, no native Solana entries): [mpp.dev/services/llms.txt](https://mpp.dev/services/llms.txt)
- Cloudflare x402 docs (no first-party Cloudflare paid endpoint listed): [developers.cloudflare.com/agents/x402/](https://developers.cloudflare.com/agents/x402/)
- x402 ecosystem page (Stakevia, ChainAnalyzer AML, BlockRun.AI etc., predominantly Base mainnet): [x402.org/ecosystem](https://www.x402.org/ecosystem)
- QuickNode x402-Solana RPC guide: [quicknode.com/guides/...](https://www.quicknode.com/guides/solana-development/ai-agents/how-to-access-solana-rpc-with-x402-solana)
- ChainAnalyzer x402 mainnet flip on Base + Solana via Coinbase CDP facilitator: [dev.to writeup](https://dev.to/rascal3/shipping-x402-usdc-payments-to-base-solana-mainnet-for-an-mcp-server-3a6o)
- x402-solana payment-channel impl (devnet, beta, no audit): [x402-solana.com](https://x402-solana.com/)
- T-260 (catalog rows, blocks `/v1/spend/service`), T-114 (mainnet + multisig upgrade authority), T-412 (custom domain): see `TODO.md`

## Things I could not verify

- Whether QuickNode's x402-Solana endpoint actually round-trips against klink's `/v1/spend/sign-payment` (older X-PAYMENT-Proof dialect) without modification. The QuickNode docs describe the protocol but don't pin the exact header set, and I did not run a probe from this session. If we ever add it as a fourth pick, smoke-test first.
- ChainAnalyzer's exact x402 Solana-side ATA handling; the dev.to writeup says "Base + Solana mainnet via Coinbase CDP Facilitator" but doesn't show the Solana payload format.
- Whether `mpp.tempo.xyz`-hosted Anthropic / OpenAI services have a parallel Solana-settlement path that I missed in [mpp.dev/services/llms.txt](https://mpp.dev/services/llms.txt). The page lists Tempo + Locus subdomains; I did not see a Solana-routed equivalent. If a sponsor at the demo says "actually we run Anthropic on Solana via X", check before refuting.
- Stakevia's actual on-chain receipt format and whether their "$1 USDC per report" is settled on Solana mainnet directly or via a CDP-facilitator hop. Their listing on [x402.org/ecosystem](https://www.x402.org/ecosystem) names Solana but doesn't show the tx.
