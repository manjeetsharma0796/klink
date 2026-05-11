# DOCS_INDEX.md

Single source of truth for every doc in this project. Update on every doc add, rename, or delete.

**Format**: `- [<title>](<path>) — <one-line summary> [updated YYYY-MM-DD]`
Group entries by section. Keep alphabetical within sections.

---

## Project context

- [README](README.md) — human entry point; what Klink is and how to start [updated 2026-04-28]
- [Claude Code entry point](CLAUDE.md) — read order + operating rules for AI agents on this repo [updated 2026-04-28]
- [Project Context](CONTEXT.md) — strategic framing + locked architecture decisions (note: §8 and §10 are historical brainstorm state) [updated 2026-04-28]
- [AI contributor guide](AGENTS.md) — how to edit, create, and commit docs on this project [updated 2026-04-28]

## Operations

- [Team task board](TODO.md) — async, file-based task board for the 4-person team; claim/lock/dependency rules and seed task list [updated 2026-05-11]

## Architecture & Design

- [Architecture overview](docs/architecture/overview.md) — three-layer summary with Mermaid diagrams (component view + spend-flow sequence); pointer doc to the design spec [updated 2026-04-28]

## Specs

- [Solana Agent Wallet — Design Spec](docs/specs/2026-04-28-agent-wallet-design.md) — 60-day MVP architecture: Anchor PDA-vault, hybrid policy enforcement, manual Kamino yield, mpp.dev + custom x402 spending, Dodo Payments fiat-in [updated 2026-04-28]

## Runbooks

- [Dev environment](docs/runbooks/dev-environment.md) — pinned versions + per-OS install commands + setup attestation table [updated 2026-04-28]
- [Secrets management](docs/runbooks/secrets.md) — five MVP secrets, generation, rotation, leak response; KMS is v2 [updated 2026-04-28]
- [Service catalog deployment](docs/runbooks/service-catalog-deployment.md) — seed, per-row update via admin script, smoke test for the curated `/v1/spend/service` proxy [updated 2026-05-11]
- [Team collaboration](docs/runbooks/team-collaboration.md) — async claim protocol, per-OS notes, and rules for Claude agents working on the board [updated 2026-04-28]
- [Telegram notifications](docs/runbooks/telegram-notifications.md) — one-time bot setup + secrets + smoke test for the GitHub-Actions PR/push notifier [updated 2026-04-28]

## Memos

- [Pricing model](docs/memos/2026-04-28-pricing-model.md) — flat fee vs % volume vs free+enterprise; recommend free+enterprise staged rollout [updated 2026-04-28]
- [RPC provider](docs/memos/2026-04-28-rpc-provider.md) — Helius vs QuickNode vs Triton; recommend Helius for dev/staging [updated 2026-04-28]
- [Autoswap (USDC↔SOL) feasibility for mpp.dev](docs/memos/2026-05-11-autoswap-mpp-feasibility.md) — Jupiter vs Kora vs Phantom vs sponsor-PDA; recommend defer (treasury fee-paying covers it) [updated 2026-05-11]

## Public documentation (GitBook)

- [GitBook home](gitbook/README.md) — public-facing developer docs synced to GitBook.com via Git Sync; full section index in [`gitbook/SUMMARY.md`](gitbook/SUMMARY.md) [updated 2026-04-28]

## Reference material

- [apps/api scripts index](apps/api/scripts/README.md) — index of operational scripts under `apps/api/scripts/`; documents the T-503 demo replay (`demo-replay.ts`), the dashboard e2e harness, the dodo webhook smoke, and the catalog updater [updated 2026-05-11]
