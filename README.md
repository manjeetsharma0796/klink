# Klink

A non-custodial Solana smart-wallet for AI agents, with on-chain policy DSL for budget controls and audit. Targeting the Solana Frontier hackathon (Colosseum), 60-day MVP.

## Status   

Pre-implementation. Design spec is frozen; code scaffolding has not started.

| Layer | Status |
|---|---|
| Design spec | done — [`docs/specs/2026-04-28-agent-wallet-design.md`](docs/specs/2026-04-28-agent-wallet-design.md) |
| Anchor program | pending — task `T-102` and downstream |
| Backend (Node + TS) | pending — task `T-201` and downstream |
| Dashboard + SDK | pending — task `T-301` and downstream |

## Repo layout

```
.
├── README.md                  this file — human entry point
├── CLAUDE.md                  Claude Code entry point — read first if you're an AI agent
├── AGENTS.md                  doc-edit conventions for AI contributors
├── CONTEXT.md                 strategic framing + locked architecture decisions
├── DOCS_INDEX.md              full doc inventory (single source of truth)
├── TODO.md                    async task board — claim a task before starting
└── docs/
    ├── specs/                 design specs (frozen versions)
    └── runbooks/              operational guides (collaboration, dev setup, deploys)
```

## Getting started

1. **Skim the design spec** — [`docs/specs/2026-04-28-agent-wallet-design.md`](docs/specs/2026-04-28-agent-wallet-design.md).
2. **Set up your machine** — [`docs/runbooks/dev-environment.md`](docs/runbooks/dev-environment.md).
3. **Read the collaboration protocol** — [`docs/runbooks/team-collaboration.md`](docs/runbooks/team-collaboration.md).
4. **Pick a task** — open [`TODO.md`](TODO.md), find a `Status: pending` task with no unresolved deps, claim it.

## Working with Claude Code

This repo's task workflow is built around short prompts to Claude Code. You merge on GitHub; almost everything else is one line. Claude auto-loads `CLAUDE.md`, `CONTEXT.md`, `TODO.md`, and the runbooks — you don't re-explain the project each time.

### Prompt cookbook

| Goal | Say |
|---|---|
| See what's unblocked for me | `what's unblocked for me?` |
| Claim a task | `claim T-105` |
| Implement a claimed task | `do T-105` (or `implement T-105`) |
| Continue after you merged a PR | `merged` |
| Drain a batch of unblocked tasks | `complete all without blockers` |
| Drop your own claim | `unclaim T-105` |
| Override a stale claim by someone else | `override T-105 — <reason>` |
| Resolve a GitHub merge conflict | `fix the conflict on PR <#>` |
| Show project + dev tally | `give me the leaderboard` |

Plain English works too. The prompts above are just the shortest forms.

### Lifecycle of a task

1. **Claim** — Claude opens a `claim: T-XXX` PR; you click **Squash and merge** → `[CLAIM]` then `[LOCK]` in Telegram.
2. **Work** — Claude pushes the implementation as `feat/T-XXX-…`. CI runs (lint + typecheck + tests + TODO.md lint).
3. **Review + merge** — open the PR, check CI is green, click **Squash and merge** → `[DONE]` in Telegram.
4. **Continue** — say `merged` to Claude. It pulls main, drops the local feat branch, and is ready for the next task.

### Reviewing a PR (60 seconds)

1. **Skim the diff.** Claude's commit body has the summary — look for surprises, not every line.
2. **Check CI.** "lint-typecheck-test" green = code passes lint, types, tests, TODO lint. Red = tell Claude `CI red, look at the logs and fix`.
3. **Click Squash and merge.** Auto-delete is on, so the branch disappears.
4. **Tell Claude `merged`.** Local cleanup happens automatically.

If GitHub flags a conflict before you can merge: tell Claude `fix the conflict on PR <number>`. Claude pulls the branch, merges main into it, resolves, pushes back. (Most TODO.md conflicts auto-resolve via the `merge=union` driver from `T-409` — but biome.json, bun.lock, or code conflicts still need the rebase.)

### One-shot questions

You don't need to follow the lifecycle for everything:

- `what's the state of the board?` — Claude greps `TODO.md` and summarizes pending vs done.
- `did anything break?` — Claude runs `bun --filter '*' test` and reports.
- `who's been most productive today?` — Claude runs the leaderboard script.

### When to bypass Claude

You should still drive these by hand:

- **Anything that pushes secrets** — Claude can read your `.env` if asked, but rotate any token before pasting it into a chat.
- **Force-push to main** — never. Claude refuses anyway; if you're tempted, ask why.
- **Mainnet deploys** — gated on T-115 external review per the design spec; not Claude's call.

## License

> **TODO**: pick (MIT / Apache-2.0). Tracked as a follow-up to `T-115`.
