---
title: Autoswap (USDC↔SOL) feasibility for mpp.dev integration
purpose: Decide whether klink should ship a real autoswap layer for the spend flow, or stay on the treasury-fee-payer primitive (T-226). Devnet vs mainnet test path included.
last_updated: 2026-05-11
---

# Autoswap (USDC↔SOL) feasibility for mpp.dev integration (T-251)

## TL;DR

**Defer.** Treasury fee-paying (T-226) already solves "agent / vault holds only USDC" for every klink spend path that exists today (`/v1/spend/transfer`, `/v1/spend/sign-payment`, `/v1/spend/service`, `/v1/spend/mpp`). Autoswap adds operational surface (mainnet-only providers, slippage handling, swap-failure rollback semantics) for zero incremental UX value in the current flows. Revisit only if (a) a flow appears where the treasury cannot be the fee payer, or (b) the vault needs to settle in something other than USDC, or (c) the user-funded path (T-249) starts producing wallets where the user wants to top up without ever touching SOL **and** the treasury is not allowed to subsidize them.

The closest near-term match if we ever do build it is **Kora** (Solana Foundation, x402-aware, devnet-supported). Not Jupiter (mainnet only), not Octane (archived 2026-04-20).

## 1. Structural map of "autoswap" on Solana today

For each mechanism, the four properties that matter for klink:

| Mechanism | Who pays SOL fee | Who holds funds mid-flow | Atomicity | Primary failure modes |
|---|---|---|---|---|
| Jupiter Swap API (Quote + Swap REST) | The user (signs the returned tx; needs SOL for fee) | Funds stay in user's wallet. Jupiter returns an unsigned tx that routes through DEX program(s); user signs and submits. | One Solana tx, atomic on-chain. Off-chain race: quote can stale between Quote and Swap. | Slippage exceeded, route stale, RPC rejects, fee insufficient. Hosted endpoint does **not** support devnet (see §3). |
| Program-level CPI swap (Raydium / Orca / Jupiter Aggregator routed inside one tx) | Whoever signs the tx pays SOL fee. Klink's case: treasury (T-226). | Funds flow through the DEX pool accounts inside CPI; no third party custodies. | Atomic with the rest of the tx. The swap and the downstream payment land or revert together. | Compute-budget overflow (Jupiter routes can be heavy), slippage check inside the CPI, accounts-list bloat (>64 keys), pool not present on the cluster. |
| Octane (SPL-tip into SOL fee relayer) | Octane operator pays SOL; user reimburses with an SPL-token transfer ix in the same tx. | Octane keypair holds the tip momentarily; operator guidance was 0.2 to 1 SOL float. | Atomic: tip + payload land in one tx Octane signs. | **Project archived 2026-04-20** ([repo](https://github.com/anza-xyz/octane)). Do not build on it. |
| **Kora** (Octane's successor; Solana Foundation) | Kora operator pays SOL fee; user pays in SPL token (USDC, BONK, app-native). | Kora operator's signer holds the SPL tip; validator gets paid in SOL. | Atomic single tx. Kora validates against operator-defined rules before signing. | Operator allowlist mismatch (program / token / spend cap), signer SOL drained, RPC failure on broadcast. Has documented x402 integration on devnet ([Kora x402 guide](https://launch.solana.com/docs/kora/guides/x402)). |
| Wallet-level: **Phantom gasless swaps** | Phantom's relayer (deducts the fee in the from-token) | Phantom holds the swap mid-flow via its router | Atomic from the user's POV; under the hood it's a Jupiter quote + Phantom-paid tx. | Conditions narrow: swap ≥ $15, from-token verified + market cap ≥ $50K, slippage Auto or ≥ 0.5%, total fee ≤ 10% of trade. App version ≥ 26.9.0. ([Phantom help](https://help.phantom.com/hc/en-us/articles/41191481594643-Use-gasless-swaps-on-Solana-in-Phantom)) |
| Wallet-level: **Backpack** | The user. Backpack charges 0% wallet markup but does **not** absorb network fees. | n/a | n/a | Backpack docs explicitly state "you always need SOL to pay fees, even when transacting with other tokens" ([Backpack docs](https://learn.backpack.exchange/articles/solana-wallet-fees)). No autoswap product. |
| **Sponsor-PDA pattern** observed 2026-05-10 in `87oKKnY1X3VYPkLzxvtXPRCtmSTwf7wBRJcjVMBFs19N` | The PDA itself, topped up by a sponsor wallet (`G5GFpTfMFPU31nmXzu5C7198RqXiVC49ToUA1h5pGyph`). PDA is controlled by program `DeJBGdMFa1uynnnKiwrVioatTuHmNLpyFKnmB5kaFdzQ`. | The PDA is the fund custodian; sponsor only refills, never holds session funds. | Per-instruction atomic via the program's CPI rules. Whatever the program says happens, happens or reverts. | Sponsor wallet drained, program upgraded badly (single signer risk like our own T-114), PDA seed collision. Architecturally **identical** to klink's `vault_pda + treasury` pair: the program (`DeJBGdMFa1uynn…`) is the agent-wallet equivalent, the sponsor is the treasury. Not autoswap, just "someone pre-funds SOL on behalf of a program-owned account." That observation triggered this memo but does not vindicate building autoswap. |

A note on terminology: "autoswap" gets used for two distinct things. (a) the user **wants** to swap A→B and a relayer abstracts the fee, and (b) the user **only wants to do X** but X needs SOL, so a hidden swap converts A→SOL just to pay the fee. Phantom gasless and Kora both do (b). Jupiter Quote+Swap is just (a). Conflating them is what makes the spec question fuzzy; klink's interesting case is (b).

## 2. mpp.dev integration angle

Today's flow (from `apps/api/src/routes/spend.ts`, `postSpendServiceHandler`, `postSpendMppHandler`):

```
agent → klink api with api-key
  → policy gate (URL allowlist, recipient cap, max_per_tx, daily cap)
  → liquidity check (vault USDC ATA balance ≥ amount)
  → build TransferChecked ix (vault USDC → recipient USDC)
  → tx.feePayer = treasury.publicKey                 ← T-226
  → createAssociatedTokenAccountIdempotent(...)      ← T-256, treasury pays rent
  → sign with [treasury, session]
  → submit
  → retry merchant URL with x-payment-proof / Authorization: Payment header
```

The vault holds **only USDC**. The session keypair has zero SOL. The agent has zero SOL. The treasury holds the SOL float for fees and ATA rent.

Three scenarios from the spec, evaluated against this concrete flow:

### (a) End-user-wallet path with USDC-only: does autoswap remove the "user must hold SOL" UX wart?

**For klink as it exists: no UX wart exists.** The vault is the user's wallet from the agent's POV, and the vault is gas-free by design (treasury covers it). The only "user holds SOL" surface is the human owner topping up the vault, and a USDC transfer **into** an existing ATA does not require the recipient to have SOL.

The remaining wart: a brand-new dashboard signup where the connected Phantom wallet holds USDC but no SOL and wants to fund the vault. The user signs an SPL transfer; **the user's wallet** pays the fee, not klink. Phantom's gasless feature (§1) handles this for them today, *if* the swap is ≥ $15 and the conditions align. Below $15 the user still needs SOL. Building klink-side autoswap to fix sub-$15 deposits is bad ROI; tell users to fund $15+ at a time, or rely on Phantom's gasless behavior.

### (b) Agent-key path: agents already don't pay gas (treasury covers); win is marginal.

Confirmed marginal. The only conceivable win is if the treasury runs out of SOL and the system needs a fallback that swaps a slice of the vault's USDC into SOL automatically. That is an ops-monitoring problem, not a swap-architecture problem. Solution: alert when treasury drops below N SOL; refill manually from the same Dodo bridge that funds the vault. This is already the implicit intent of the §4 of `2026-04-28-agent-wallet-design.md` ("balance monitoring, alerting").

### (c) ATA-creation cost (~0.00204 SOL rent) for first-time recipients.

**Already solved by T-256 (shipped today).** The treasury pays the rent in the same tx via `createAssociatedTokenAccountIdempotent`. No autoswap involvement required. If the recipient closes the ATA later to reclaim rent and reopens it, treasury eats the rent again. That's a treasury-monitoring concern, not an autoswap one.

**Net conclusion for §2:** Treasury fee-paying is the right primitive for every spend path klink ships. Autoswap as a layer above the spend handler adds zero value on (b) and (c), and trace value on (a) (sub-$15 first-time deposits, where Phantom's own gasless feature is closer to a complete answer than anything we'd build).

## 3. Devnet feasibility

The acceptance asked for runnable probes. Several of these I could not run from this session and have marked accordingly.

### Jupiter Quote API on devnet

Hosted Jupiter Swap API base URL is `https://api.jup.ag/swap/v1/quote` (free tier on `https://lite-api.jup.ag`). Per Jupiter's docs ([dev.jup.ag swap quote](https://dev.jup.ag/docs/swap/get-quote)), `lite-api.jup.ag` is the no-sign-up free tier intended for prototyping (no analytics, no usage tracking); `api.jup.ag` is the production tier requiring an `x-api-key` from `developers.jup.ag/portal` for higher rate limits. Same endpoints, same routes; only the base URL and rate-limit posture differ. Documentation does **not** advertise a devnet endpoint on either host ([Jupiter Ultra Swap docs](https://dev.jup.ag/docs/ultra)). Jupiter Ultra is documented as mainnet-only.

A `https://devnet.jup.ag/` UI exists ([devnet.jup.ag](https://devnet.jup.ag/)) but I could not confirm whether the underlying REST API serves devnet quotes. The API reference pages I fetched (`developers.jup.ag/docs/swap/get-quote`, `developers.jup.ag/docs/swap-api/get-quote`) document only mainnet URLs. **Untested:**

```bash
# Untested: devnet endpoint not documented; expected to 404 or return mainnet routes
curl -s 'https://devnet.jup.ag/swap/v1/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU&amount=1000000&slippageBps=50'

# Mainnet (known to work)
curl -s 'https://lite-api.jup.ag/swap/v1/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&amount=1000000&slippageBps=50'
```

The mints used: SOL `So11111111111111111111111111111111111111112` (wrapped SOL, same on every cluster), mainnet USDC `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`, devnet USDC most commonly `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` (Circle-issued; widely cited but **I have not independently verified ownership** against Circle's current docs).

The self-hosted Jupiter binary (`jup-ag/jupiter-swap-api`) accepts a network flag and can in principle run against devnet, but its **market cache is built from mainnet snapshots** ([self-hosted docs](https://station.jup.ag/docs/apis/self-hosted)). To use it on devnet you have to deploy the pools on devnet first and feed them via `--enable-add-market`. Not viable for klink without owning the pool population problem too.

### Raydium / Orca pool presence on devnet

Both protocols document devnet availability for SDK testing ([Raydium SDK v2 demo, devnet](https://github.com/raydium-io/raydium-sdk-V2-demo/issues/140); note an open issue about devnet pool-creation cost ~1 SOL). Orca's hosted API (`https://api.orca.so/v1/whirlpool/list`, probed 2026-05-11, HTTP 200) returns whirlpools whose `tokenB.mint` for SOL-USDC is `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`, i.e. mainnet USDC; no devnet variant on the same host (`api.devnet.orca.so` returned 403 in this session).

There **are** community-deployed USDC-SOL devnet pools on both Raydium and Orca, but the addresses I found in older SDK examples are stale and not reliable to cite from training data. Users who actually need to swap USDC↔SOL on devnet typically:

1. Deploy their own dummy mints + a CPMM/Whirlpool pool via the Raydium/Orca SDKs, then use those addresses.
2. Or just airdrop devnet SOL (`solana airdrop 1`) and the Circle devnet USDC faucet, sidestepping the swap entirely.

Bottom line: devnet pool **infrastructure exists** but discoverability is poor. There is no one canonical USDC-SOL pool on devnet you can point at the way you can on mainnet. Any klink test that swaps USDC↔SOL on devnet would need to first set up its own pool, which is itself an integration project.

### Octane / Kora devnet endpoint

- **Octane:** archived 2026-04-20 ([repo](https://github.com/anza-xyz/octane)). No public hosted endpoint; was always self-hosted. Skip.
- **Kora:** no public hosted endpoint either; Kora is software the operator runs ([Solana Foundation repo](https://github.com/solana-foundation/kora), MIT license). Devnet is the **default development target** in the docs and the x402 integration guide is written against devnet ([Kora x402 guide](https://launch.solana.com/docs/kora/guides/x402)). Operationally: Kora is one process you run on a server, you fund its signer with devnet SOL via `solana airdrop`, you configure an allowlist of programs/tokens/spend caps, and clients reach it over JSON-RPC at `:8080`.

The Kora x402 flow ends up looking suspiciously similar to klink's existing flow except with Kora-as-fee-payer instead of treasury-as-fee-payer. The **architectural difference is who you trust to validate the spend**. Klink trusts its own policy engine + on-chain caps. Kora trusts an operator-defined allowlist enforced inside the relayer process. For klink's threat model the on-chain caps are stronger because they survive even if the relayer is compromised.

## 4. Mainnet trial protocol if devnet is too thin

Devnet is too thin for any real swap test (no canonical pool, no hosted Jupiter endpoint, self-hosted requires pool ops). If we ever decide to validate autoswap in practice, the minimum-blast-radius mainnet protocol:

1. **Separate test keypair, not the treasury.** Generate a fresh keypair `klink-autoswap-probe`. Fund manually with $5 worth of USDC and 0.05 SOL from a personal Phantom; never share fee-payer with treasury.
2. **Cap exposure at $1–$5 per probe, $20 total across the experiment.** Hard-coded constant in the probe script; no env-var override.
3. **Quote-then-tiny-swap pattern:** call Jupiter `/quote` first; reject the route if `inAmount * slippageBps / 10000 > 500_000` base units (i.e., max $0.50 slippage on a $5 trade). Compare quoted out-amount to a reference price from a second source (Coingecko or Birdeye) and abort if drift > 1%.
4. **Slippage cap:** `slippageBps=50` (0.5%) max. No "auto" slippage; explicit only.
5. **Observe-only audit log entry:** new `audit_log.action = "probe_swap"`, never reachable from production endpoints, only from a dedicated `apps/api/src/scripts/probe-swap.ts` script.
6. **Kill switch:**
   - `bun run scripts/probe-swap-revoke.ts` revokes the test wallet's session key (calls our existing `closeSessionPda` ix) and `solana transfer --from klink-autoswap-probe.json $TREASURY_USDC_ATA --all`. Single command, < 5 s.
   - Hard limit: probe script self-terminates if cumulative spend across runs exceeds $20 (tracked in a JSON ledger file in repo, not in Postgres).
7. **Network conditions to verify per probe:**
   - Quote returns a route (not always true at very small sizes).
   - Tx lands within 30 s of submission (mainnet congestion).
   - Realised price matches quoted price within slippage cap.
   - Audit-log row written before the swap, updated after.

A full probe run is ~10 LOC of script + ~30 LOC of audit/ledger plumbing. The right time to run it is **only** if §5 picks option (b) or (c). It is not justified by §2's findings.

## 5. Recommendation

**Pick (a): defer.** Cost-versus-value for the three options:

| Option | LOC | Dep additions | Mainnet-only test surface | Ongoing ops burden | Verdict |
|---|---|---|---|---|---|
| (a) Defer; treasury fee-paying covers it | 0 | none | none | already-known treasury SOL monitoring (separate concern) | **Recommended.** |
| (b) Integrate Kora as fee-payer alongside treasury | ~250 LOC api wiring + Kora node deploy + allowlist config | `@solana/kora` v0.2.1 ([npm](https://www.npmjs.com/package/@solana/kora), verified 2026-05-11) + ops runbook for the Kora process | Yes (Jupiter routing only matters if Kora's own swap path needs it; Kora itself works on devnet but production Kora is mainnet) | New process to babysit, signer key to rotate, allowlist drift versus on-chain caps | Not worth it for current spend flows. Reconsider if klink ever needs to settle in non-USDC. |
| (c) Native USDC-pull-from-vault → swap-via-Jupiter inside spend handler | ~400 LOC handler + Jupiter SDK plumbing + slippage / route-staleness logic + `program/swap_via_jupiter` Anchor instruction (or pre-build tx server-side) + new audit fields (`swap_in`, `swap_out`, `slippage_realised`) | `@jup-ag/api` + new on-chain logic if CPI'd | Yes (Jupiter hosted is mainnet-only; devnet test path is build-your-own-pool) | Slippage misses become support tickets; Jupiter route changes are silent failures; new revert paths in the program | **Reject.** Massive blast radius for a feature no current user has asked for. Also requires a program upgrade, which now means a multisig (T-114 not yet shipped), multiplying cost again. |

### What changes the answer

Recommendation flips to (b) Kora if **either** of these become true:

- A roadmap item lands where klink must settle in a non-USDC token (e.g., paying out in BONK, or accepting USDT-only merchants). Then "autoswap as part of the spend handler" stops being optional.
- Treasury cost becomes a real expense (e.g., > $50/month in SOL fees + ATA rent). Today projected at < $5/month for the 60-day MVP volume; not a real number yet.

Recommendation never flips to (c). Custom Jupiter-CPI inside our own program adds a swap-failure-while-payment-already-moved class of bug we do not need.

### What this commits us to right now

- **Do not** add `@jup-ag/api`, Kora SDK, or any swap dependency to `apps/api/package.json`.
- **Do** add a treasury SOL-balance alert to the ops runbook (filed implicitly as a follow-up; not blocking T-234 catalog deployment).
- **Do** keep `2026-04-28-agent-wallet-design.md` §3.6's `jupiter_swap` reserved instruction slot (`reserved (jupiter_swap, post-MVP)`) reserved. It costs nothing to leave it.
- **Do not** rebuild the spend handler around the sponsor-PDA pattern observed on `87oKKnY1X3VYPkLzxvtXPRCtmSTwf7wBRJcjVMBFs19N`. We already have the equivalent (vault PDA + treasury sponsor); the observation is confirmation that the pattern is in production use elsewhere, not a signal to refactor.

### What kills this recommendation

- A judge / customer at the hackathon demo asks "can the agent pay the merchant in BONK if the user only holds BONK?" That is a **settlement-currency** question that defer does not answer. If it gets asked twice, jump to option (b).
- mpp.dev's protocol evolves to mandate a swap path (e.g., merchants quote in EUR-pegged stable, klink vaults are USDC). Currently no such requirement; verify against `T-258` MPP gitbook page periodically.

## Sources

- Jupiter Swap API quote docs: https://dev.jup.ag/docs/swap/get-quote
- Jupiter self-hosted API: https://station.jup.ag/docs/apis/self-hosted
- Jupiter Ultra (mainnet only): https://dev.jup.ag/docs/ultra
- devnet.jup.ag UI: https://devnet.jup.ag/ (UI confirmed; underlying API devnet support unverified)
- Octane (archived 2026-04-20): https://github.com/anza-xyz/octane
- Kora (Solana Foundation): https://github.com/solana-foundation/kora
- Kora x402 guide: https://launch.solana.com/docs/kora/guides/x402
- Phantom gasless swaps: https://help.phantom.com/hc/en-us/articles/41191481594643-Use-gasless-swaps-on-Solana-in-Phantom
- Backpack wallet fees doc: https://learn.backpack.exchange/articles/solana-wallet-fees
- Raydium devnet SDK v2 demo (with open devnet-pool-cost issue): https://github.com/raydium-io/raydium-sdk-V2-demo/issues/140
- klink spend flow: `apps/api/src/routes/spend.ts` (`postSpendServiceHandler`, `postSpendMppHandler`)
- klink design spec: `docs/specs/2026-04-28-agent-wallet-design.md` (treasury §3.5, reserved jupiter_swap §3.6)
- T-226 (treasury fee payer), T-256 (idempotent ATA create), T-211 (`/v1/spend/service`), T-253 (`/v1/spend/mpp`)
- On-chain references from spec notes (not independently re-verified at memo write time): PDA `87oKKnY1X3VYPkLzxvtXPRCtmSTwf7wBRJcjVMBFs19N`, controlling program `DeJBGdMFa1uynnnKiwrVioatTuHmNLpyFKnmB5kaFdzQ`, sponsor `G5GFpTfMFPU31nmXzu5C7198RqXiVC49ToUA1h5pGyph`, observed wallet `75Uy4iq2M97LJFYCnFhwJ9Ym7M2JQ4KjB31WEhHScqku`. Solscan/explorer fetches returned 403 in this session; addresses copied verbatim from the T-251 spec.

## Things I genuinely could not verify

- Whether `https://devnet.jup.ag/swap/v1/quote` returns devnet routes or 404s (no documented endpoint; UI may proxy to a non-public API).
- Whether `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` is the canonical Circle-issued devnet USDC mint vs. a community-deployed alternate. Multiple devnet "USDC" mints exist; pick whichever Circle's current docs name and confirm before using.
- Live SOL balance / program type of `DeJBGdMFa1uynnnKiwrVioatTuHmNLpyFKnmB5kaFdzQ` and `87oKKnY1X3VYPkLzxvtXPRCtmSTwf7wBRJcjVMBFs19N`. Explorer fetches blocked in this session. Original observation by @Jishnu on 2026-05-10 stands as the source of record.
- Whether any community-deployed USDC-SOL devnet pool on Raydium or Orca currently has non-trivial liquidity. Stale references exist; nothing canonical.
- Exact LOC estimate for a Kora integration (option b). The 250 LOC figure is engineering judgement, not measured.
