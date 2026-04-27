# Project Context — Solana Agent-Wallet with Policy DSL

> **Purpose of this document:** This is a handoff brief for any AI assistant continuing work on this project. It captures everything an AI needs to pick up where the conversation left off — the user's situation, the prior research, the strategic framing, the in-flight design decisions, and the open questions. Read this top-to-bottom before responding.

---

## 1. Quick orientation (TL;DR)

The user is brainstorming a **Solana-native smart-wallet-with-policy-DSL product for AI agents**. The shape is "the part of Locus that's actually a primitive, rebuilt the right way for Solana." The headline value is **best-in-class budget controls + on-chain audit trail**, with **Kamino auto-yield on idle USDC** as a Solana-specific differentiator. We are mid-brainstorming via the `superpowers:brainstorming` skill — design work is gated behind clarifying questions and explicit user approval before any implementation.

**Hard rule:** Do not write production code, scaffold projects, or invoke implementation skills until brainstorming completes with a written design doc that the user has approved.

---

## 2. The user

| | |
|---|---|
| **Email (Anthropic context)** | `mintellectproject@gmail.com` |
| **Email for Locus / external signups** | `manjeetgdg@gmail.com` (use this for third-party signups) |
| **Platform** | Windows 11, Claude Code CLI on bash, working dir `C:\Users\manjeet\Downloads\sdf` |
| **Today's date (for reference)** | 2026-04-27 |
| **Locus account status** | Signed up; API key stored at `~/.config/locus/credentials.json` (key starts with `claw_dev_`); wallet address `0xb9a546c8bacab5275ba275adde621edec8f47e52` on **Base**; balance 0 USDC (not yet funded as of writing) |
| **Memory files** | `~/.claude/projects/C--Users-manjeet-Downloads-sdf/memory/` — `MEMORY.md` indexes `locus.md` and `user_emails.md` |

The user communicates in casual, sometimes broken English. They think strategically and ask direct, well-scoped questions. They prefer **brutal honesty over diplomatic hedging** — when asked "is this a bad idea?" they want the specific reasons it's bad, not a balanced view. They are clearly building toward the **Solana Frontier hackathon** (Colosseum) and have a 60-day MVP target.

---

## 3. What Locus is (the product we're studying, NOT building)

**Locus** (`paywithlocus.com`) is YC-backed AI-agent payment infrastructure on **Base** (Coinbase L2). It's the closest analog to what the user wants to build, but on the wrong chain and with the wrong architecture for the user's goals.

### 3.1 Locus's product surface (full audit)

| Feature | What it does | Endpoint family |
|---|---|---|
| **Hosted smart wallet** | Custodial agent wallet on Base; Locus signs txs server-side via API key | n/a — implicit |
| **Send USDC** | Direct transfers to any Base address | `POST /api/pay/send` |
| **Send USDC via email** | Escrow until recipient claims via emailed link | `POST /api/pay/send-email` |
| **Transaction history** | Paginated list with status enum, failure reasons | `GET /api/pay/transactions` |
| **Wrapped APIs marketplace** | ~40 third-party APIs pre-integrated, paid per-call in USDC; Anthropic, OpenAI, Gemini, Firecrawl, Exa, Apollo, fal.ai, etc. | `POST /api/wrapped/<provider>/<endpoint>` |
| **x402 endpoints** | Coinbase x402 protocol calls (built-in services like Laso, AgentMail; user-registered custom endpoints via dashboard) | `POST /api/x402/<slug>`, `POST /api/x402/call` |
| **MPP services** | Subset of x402 services running on Tempo chain via Stripe+Tempo's Machine Payments Protocol | `https://{provider}.mpp.paywithlocus.com/...` |
| **Checkout SDK** | Pay merchant checkout sessions (preflight → pay → poll) | `POST /api/checkout/agent/pay/:sessionId` |
| **Laso Finance** | Prepaid cards (US only $5–$1000), Venmo/PayPal payouts | `POST /api/x402/laso-*` |
| **AgentMail** | Email inbox per agent (create, send, list, reply) | `POST /api/x402/agentmail-*` |
| **Apps marketplace** | Vertical tools enabled by user from dashboard | `GET /api/apps/md` |
| **Policy guardrails** | Allowance, max-tx-size, approval threshold — server-side enforcement | Configured in dashboard |
| **Approval flow** | Txs above threshold return `202 PENDING_APPROVAL` with `approval_url`; human approves; tx auto-executes | implicit in 202 responses |

### 3.2 Locus's pricing model

- Most providers: flat **$0.003/call** Locus fee + upstream cost
- AI providers (OpenAI, Gemini, Anthropic): **15% markup on token cost**
- Some endpoints free (status checks, balance queries)
- Charge-on-success model: failed upstream calls don't bill

### 3.3 What Locus is actually selling

Despite the broad surface, Locus's **defensible value above the protocol layer** is:
1. **Curated API marketplace** (BD-heavy, ~40 providers integrated)
2. **Budget/policy guardrails** (the 3 dashboard knobs)
3. **Treasury + billing operations** (regulated, capital-intensive)
4. **Hosted custodial wallet** (commoditized by Privy/Turnkey/Crossmint, but bundled here)

The protocol/transport layer (MPP, x402) is **not Locus's** — those are Stripe+Tempo's MPP and Coinbase's x402. Locus is a **product sitting on top of open protocols** with a curated marketplace and a policy dashboard.

### 3.4 Locus's docs structure (canonical references)

| File | URL |
|------|-----|
| SKILL.md | `https://paywithlocus.com/skill.md` |
| ONBOARDING.md | `https://paywithlocus.com/onboarding.md` |
| CHECKOUT.md | `https://paywithlocus.com/checkout.md` |
| LASO.md | `https://paywithlocus.com/laso.md` |
| AGENTMAIL.md | `https://paywithlocus.com/agentmail.md` |
| Wrapped API index | `https://paywithlocus.com/wapi/index.md` |
| Wrapped API per-provider | `https://paywithlocus.com/wapi/<provider>.md` |
| MPP services index | `https://paywithlocus.com/mpp/index.md` |
| llms.txt site map | `https://paywithlocus.com/llms.txt` |

---

## 4. MPP (Machine Payments Protocol) — important context

`mpp.dev` is an **open standard co-developed by Tempo and Stripe** for HTTP 402 machine-to-machine payments. The protocol itself takes **no commission** — it's free and open like HTTP.

**Multi-chain native.** Solana (SOL + SPL), Monad, Stellar, Tempo, Lightning, Stripe cards. SDKs in TypeScript, Python, Rust, Go, Ruby. Middlewares for Express, Next.js, Hono, Elysia.

**Implication for our project:** the "agents pay APIs" payment-protocol layer on Solana is **already solved by MPP**. Anyone can run a Solana MPP server today. So a "Locus on Solana" facilitator/marketplace play has very low protocol-level moat — it would compete with merchants going direct via MPP. This pushed us toward a **policy/wallet primitive** instead of a marketplace clone.

---

## 5. What we are building

A **Solana-native smart-wallet program for AI agents**, with:

1. **Per-agent dedicated wallet** controlled by a Solana program (PDA-controlled vault or smart-account fork)
2. **Policy DSL** for the human owner to express budget restrictions: max-payment, daily/period caps, recipient allowlists, allowed-program allowlists, etc.
3. **Hybrid policy enforcement** (this decision is locked):
   - **On-chain hard limits** (allowance, max-tx, recipient allowlist, allowed protocols, daily cap, max-deployed-fraction): enforced by the smart-wallet program; tx reverts on violation; Solana tx history *is* the audit log (free, immutable, public)
   - **Off-chain rich rules** layered on top (time-of-day windows, oracle gates, anomaly detection): enforced by a backend service that co-signs or pre-checks
4. **Audit/transaction log** as a first-class feature — viewable by the human owner via dashboard, but the source of truth is on-chain
5. **Kamino Finance auto-yield on idle USDC** as the Solana-specific differentiator (scope decision pending — see open questions)

### 5.1 Two parties, two interfaces

- **Human owner** signs in via a web dashboard. Creates an agent. Configures the policy. Funds the wallet. Gets an API key to hand to the agent.
- **Agent** uses the API key (or a session keypair) to sign or submit transactions through the wallet, subject to policy enforcement at both the on-chain and off-chain layers.

### 5.2 Headline pitch (current working version)

> *"MPP solved the payment protocol. Locus solved spend controls in centralized SaaS. We're solving spend controls as an on-chain Solana primitive — the missing piece between payment rails and trustworthy autonomous agents."*

### 5.3 Why Solana specifically

- **On-chain policy enforcement** is structurally cleaner than EVM here because Solana's account model + program-derived addresses (PDAs) make custom-account-with-policy programs the natural pattern; Ethereum needs ERC-4337 + Safe modules to approximate the same thing.
- **Compute is cheap** — running policy checks per tx is feasible.
- **Sub-cent fees** — agents can do high-frequency micropayments without per-tx fees dominating economics.
- **Sponsor alignment** — Phantom, Coinbase CDP, Privy, Swig, Arcium are all Frontier sponsors and all benefit from a standardized agent-wallet primitive.

---

## 6. Strategic framing (why this niche, why not Locus-clone)

We rejected "Locus on Solana" for these specific reasons (this analysis is durable — refer back to it):

| Locus surface | Why cloning it on Solana is bad |
|---|---|
| Custodial wallet | US money-transmitter regulation; inferior to non-custodial Squads vaults already on Solana |
| Wrapped APIs marketplace | BD-bound (60-day MVP can't ship 40 providers); price-taker; providers won't dual-integrate after Locus |
| x402 gateway | x402 is Coinbase's protocol; Coinbase ships first-party x402 on Solana → resale value evaporates |
| MPP service catalog | MPP is already multi-chain incl. Solana, owned by Stripe+Tempo — no novel protocol to ship |
| Checkout SDK | Solana already has Solana Pay, Helio/MoonPay, Sphere, Coinflow, Crossmint — undifferentiated entry |
| Laso (cards/Venmo) | Regulated payment rails, partner-bank required — out of scope for hackathon team |
| AgentMail | Off-thesis, no Solana-specific composition |
| Apps marketplace | Empty-marketplace problem; needs seed capital to bootstrap |
| Server-side policy | **Strictly inferior to on-chain Squads/policy-program on Solana** — would ship the worse version of something the chain natively does better |
| API-key auth + treasury ops | 24/7 SRE cost center before $1 of revenue |

**Salvageable:** dev SDK / pricing UX — but bundled as developer experience around the **wallet primitive**, not as a standalone product.

### 6.1 Competitive landscape

**Direct competitors (agent-payments products):**
- Locus (Base, EVM) — closest conceptual overlap, can ship Solana support themselves
- Skyfire — "agent payment network," multichain
- Crossmint — already on Solana, broad agent commerce
- Coinbase CDP + x402 protocol owner — first-party threat
- Privy / Turnkey — agent-wallet SaaS, expanding scope
- Stripe / PayPal — agent commerce explorations

**Solana-side incumbents:**
- Squads v4 — multisig + spend limits, **closest competitor to our policy primitive**; "human-multisig-shaped, not agent-shaped" is our gap claim
- Swig (Anza) — must verify scope before pitching; may be the most direct overlap and the riskiest unverified claim in the pitch
- Phantom — has session keys + agent features in development
- Sphere, Helio (MoonPay), Solana Pay, Coinflow — merchant-payments adjacent
- SendAI / Solana Agent Kit — agent tooling, not wallets

**Pitch-hardening still required:**
1. Verify exact scope of **Swig** and **Squads v4** (don't say "nobody has done this" without that homework)
2. Acknowledge EVM prior art (ERC-4337, Safe modules, ZeroDev kernel + validators, Pimlico policies) — frame as "SVM-native standardization of these patterns," not "novel from nothing"
3. Pair the **Drift incident** (post-mortem on agent-wallet failure) with one more concrete agent-loss anecdote
4. Add at least one Solana-native voice (Anatoly tweet, Phantom blog) — keep narrative from being EVM-heavy
5. Reference a16z's publicly-written **KYA (Know Your Agent) thesis** as VC alignment

---

## 7. Architecture decisions locked in

| Decision | Choice | Rationale |
|---|---|---|
| Chain | **Solana** | Frontier hackathon target; PDAs make policy-program pattern natural |
| Trust model | **Hybrid** (on-chain hard limits + off-chain rich rules) | Trustless safety floor + flexible upper layer; audit-by-default via chain |
| Audit source-of-truth | **On-chain Solana tx history** | Free, immutable, queryable via any RPC |
| Headline value | **Policy DSL + budget controls + audit** | Kamino yield is differentiator, not headline |
| Primary user | "**Anyone with access to an agent**" — agent gets dedicated wallet, human owner manages policy | Two-party model, two interfaces |

---

## 8. Open / in-flight design questions

We are mid-brainstorming. The session was paused at **Question 5** (yield-on-idle scope). Resume from here.

### 8.1 Currently asked, awaiting user answer

**Q5 — Kamino yield-on-idle scope for MVP:**
- A) Auto-yield in MVP (full feature)
- B) Ship policy/wallet/audit only; yield is v2
- C) **(Recommended)** Manual yield endpoints in MVP (`/wallet/yield/deposit`, `/withdraw`, `/position`, `/markets`); auto-rebalance v2
- D) Skip Kamino entirely from MVP

### 8.2 Not yet asked, will need answers next

In rough priority order:

1. **Wallet program architecture** — Squads-fork vs. new PDA-vault program vs. Token-2022 transfer-hook approach
2. **On-chain DSL primitives for MVP** — which specific rules go on-chain (max-tx, daily cap, recipient allowlist, program allowlist, max-deployed-fraction, time-of-day, etc.)
3. **Off-chain DSL extensions** — what types of rules need off-chain enforcement and what triggers them
4. **Agent authentication model** — API key issued by your service vs. session keypair scoped on-chain vs. both
5. **Funding flow for the agent wallet** — direct USDC transfer in, fiat-in via on-ramp, both
6. **DODO Payments role** — the user mentioned this earlier but it was eclipsed by the Kamino discussion. Two interpretations: (a) DODO DEX for swap-before-pay, (b) Dodo Payments (`dodopayments.com`) for fiat-in topup. **Need to disambiguate before architecture is final.**
7. **Dev surface for integrators** — TypeScript SDK first? CLI? React hooks?
8. **Reference integrations** — the original 60-day plan mentioned 3 (SendAI, Jupiter Skills, custom agent). Which 3 still apply?
9. **Pricing/business model** — flat fee per active wallet, % of policy-gated tx, free + enterprise tier?
10. **Compliance posture** — fully non-custodial (program-controlled, user holds keys) or partial-custody hybrid? Affects regulatory exposure.

### 8.3 Open ambiguity — DODO Payments

User mentioned "DODO Payments" alongside Kamino. There are **two products with that name**:
- **DODO** (the DEX, PMM-based) — has Solana support; useful for swaps
- **Dodo Payments** (`dodopayments.com`) — YC-backed merchant-of-record SaaS (like Stripe for SaaS), supports cards + crypto

User did not disambiguate before the conversation pivoted to Kamino. **First thing to clarify when continuing brainstorm:** which DODO, and what's its role.

---

## 9. Hidden complexity surfaced re: Kamino auto-yield

If the user picks A or C on Q5, these problems must be solved:

| Issue | Implication |
|---|---|
| **Liquidity buffer** | Cannot deploy 100% to Kamino; need % buffer of liquid USDC for instant spend |
| **Auto-deposit trigger** | Off-chain cron vs. on-tx hook — affects latency and cost |
| **Auto-withdraw timing** | Pre-withdraw on agent's "intent to spend" vs. retry-after-fail |
| **Atomic spend bundling** | Withdraw + transfer in one tx is tight on Solana's 1232-byte limit |
| **Yield accounting display** | Wallet balance must show idle + deployed + accrued in unified UX |
| **Kamino smart-contract risk** | Audited but non-zero; user-owner trust must be disclosed |
| **Per-agent deployment cap** | Becomes a new policy DSL primitive: `max-deployed-fraction` |
| **Multi-reserve selection** | Which Kamino USDC market — main, JLP-backed, etc.? |
| **Withdrawal-fail UX** | High utilization → partial withdrawal → "spend pending — waiting for liquidity" |

The relevant Kamino instructions: `depositReserveLiquidity`, `redeemReserveCollateral`. SDK: `@kamino-finance/klend-sdk`. **No fixed lockup or penalty** — only a utilization-conditional risk that withdrawal can be partial during DeFi stress.

---

## 10. Brainstorming process state

We are following the `superpowers:brainstorming` skill (rigid checklist). Tasks created in TaskList:

| # | Task | Status |
|---|---|---|
| 1 | Explore project context | ✅ completed |
| 2 | Ask clarifying questions one at a time | 🟡 in_progress (at Q5) |
| 3 | Propose 2-3 approaches with trade-offs | pending |
| 4 | Present design sections for approval | pending |
| 5 | Write design doc to `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md` | pending |
| 6 | Spec self-review | pending |
| 7 | User reviews written spec | pending |
| 8 | Invoke writing-plans skill | pending |

**Hard gate (do not violate):** No code, no scaffolding, no implementation skill until tasks 1–7 complete and the user approves the written spec. Brainstorming → spec → user approval → then `superpowers:writing-plans`.

---

## 11. Decisions already eliminated (don't re-litigate)

- ❌ Building a "Locus on Solana" full marketplace clone — see §6
- ❌ Custodial wallet model — regulatory + inferior to Squads
- ❌ Pure off-chain policy enforcement — Locus already does this on Base, no Solana primitive innovation
- ❌ Reselling x402 on Solana — Coinbase ships this themselves
- ❌ Cloning MPP service catalog — MPP is multi-chain native already

---

## 12. References

- `https://paywithlocus.com/skill.md` — Locus's own AI-readable skill doc (canonical Locus product reference)
- `https://paywithlocus.com/llms.txt` — full Locus site map
- `https://mpp.dev` — Machine Payments Protocol (Stripe + Tempo)
- `https://mpp.dev/llms.txt` — MPP site map (chains, SDKs, transports)
- `https://mpp.dev/payment-methods/solana/charge` — MPP Solana spec
- Kamino Lend program / `@kamino-finance/klend-sdk`
- Squads v4 — competitor analysis required
- Swig (Anza) — competitor analysis required
- a16z Know-Your-Agent (KYA) thesis — pitch alignment

---

## 13. Tone and collaboration notes for the next AI

- The user prefers **direct, structured answers**. Multiple-choice questions during brainstorming. Tables for comparisons. Brutal honesty over diplomatic framing.
- Confirm verifiable claims (Swig scope, Squads v4 spend-limit details, Kamino utilization mechanics) before writing them into pitch material.
- The user is **time-constrained** (60-day MVP). Every design decision should be filtered through "does this fit a 60-day hackathon scope?"
- Auto mode is typically active in their sessions — execute and decide on low-risk things, ask only for genuine forks. Brainstorming questions are genuine forks.
- The user has a Locus account but **wallet balance is 0 USDC** — any actual API call to Locus that costs money will fail until funded.

---

*End of context document. Resume brainstorming at §8.1 (Q5).*
