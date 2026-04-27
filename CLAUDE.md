---
title: Claude Code entry point
purpose: Read-this-first orientation for any Claude Code session opened on this repo
last_updated: 2026-04-28
---

# CLAUDE.md

Auto-loaded by Claude Code when this repo is opened. Read top-to-bottom before any action.

## Read order for any new session

1. [`DOCS_INDEX.md`](DOCS_INDEX.md) — full inventory of docs in this repo
2. [`CONTEXT.md`](CONTEXT.md) — strategic framing, locked architecture decisions, why this niche over a Locus-clone. **Note:** §8 and §10 are historical (brainstorm artifacts); the design spec below is authoritative on resolved questions.
3. [`docs/specs/2026-04-28-agent-wallet-design.md`](docs/specs/2026-04-28-agent-wallet-design.md) — current source of truth for architecture
4. [`TODO.md`](TODO.md) — task board; check active claims (`grep "Status: in-progress" TODO.md`) before doing anything
5. [`docs/runbooks/team-collaboration.md`](docs/runbooks/team-collaboration.md) — async claim protocol; §7 has rules specific to AI agents
6. [`AGENTS.md`](AGENTS.md) — conventions for editing docs in this repo

## Operating rules

- **Never claim a TODO task without explicit user instruction.** "Look at the board" is not a claim. "Claim T-105" is.
- **Always check `Depends-on`** before recommending or starting work on a task. Surface unfinished deps before plowing ahead.
- **One in-progress claim per agent session.** Finish or release before picking the next.
- **Reference `T-XXX`** in every commit and PR title you create on a user's behalf.
- **Update the status line** in the same commit that finishes the work — not as a separate housekeeping commit.
- **Don't migrate the board to GitHub Issues / Linear** without explicit user approval. The file is the protocol, by design.
- **No code yet** — repo is docs-only. Scaffolding is tracked under `T-102`, `T-201`, `T-301`. Don't create `programs/`, `apps/api/`, or `apps/web/` directories outside those tasks.

## Tone

The user prefers brutal honesty over diplomatic hedging. "I don't know, let me check" is the right answer when in doubt — don't speculate from training data about Solana / Anchor / Kamino specifics; verify against the design spec or a current source.

## Per-user context lives elsewhere

This file is shared via git. Per-user memory (preferences, role notes) belongs in your local Claude memory dir at `~/.claude/projects/<encoded-path>/memory/`, not here. CONTEXT.md captures team-wide facts; this file captures team-wide protocol; per-user is per-user.
