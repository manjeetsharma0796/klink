---
title: Team collaboration runbook
purpose: Async-collaboration protocol for the 4-person team — claim/lock/dependency rules, per-OS notes, and rules for Claude agents
last_updated: 2026-04-28
---

# Team collaboration runbook

Companion to [`/TODO.md`](../../TODO.md). Read once; then `TODO.md` is enough day-to-day.

## 1. Why a file-based board

GitHub Issues / Linear are great but require sync, accounts, and tab-switching. The team is small (4), the project is short (60 days), the board lives in the repo. Edits are durable in git history. Claude agents can read and edit it without leaving the working directory.

## 2. The async claim protocol

The board is concurrent-safe by virtue of git, not magic. We use **two-phase claim** to avoid duplicate work:

```
Phase 1 — claim (cheap, fast)
  branch:    claim/T-XXX-<slug>
  diff:      one line — Status: pending → Status: in-progress @you DATE
  PR:        title `claim: T-XXX`, auto-merge when green
  conflict:  if two claim PRs land at once, the second fails to merge cleanly.
             Loser closes their PR and picks a different task.

Phase 2 — implement
  branch:    feat/T-XXX-<slug> off main
  diff:      the actual work
  PR:        title `T-XXX — <task title>`
  on merge:  same merge also flips the line:
             Status: in-progress → Status: done @you DATE
             move the task block to ## Done
```

Lock cost ≈ one PR. Lock arbiter is GitHub's merge queue rather than humans.

### 2.1 Solo / no-review fast path

If you're working alone with no reviewer, edit `TODO.md` directly on `main`, push, then start the implementation branch. The push is the lock. Don't skip the visible status change — teammates need to see it.

### 2.2 Multiple claims, unclaiming, and override

Hold as many `in-progress` claims as you can usefully work. **No per-person ceiling** — self-discipline plus the override mechanic below replaces a hard limit.

**Self-unclaim** (you decide not to work a task you've claimed):

Flip your own line back: `Status: in-progress @you DATE` → `Status: pending`. Same two-phase mechanic — branch `unclaim/T-XXX-<slug>`, one-line diff, PR title `unclaim: T-XXX`. No paper-trail line needed; you're just freeing it.

**Override** (you take a task someone else has claimed):

When a teammate's claim is blocking you — they're stale, you have stronger context, or your work depends on it landing now — flip their status to `pending` yourself. Identical mechanic, but add a `Reverted: <date> by @you — <one-line reason>` line under the task block. Then claim it (separate PR or same PR with both edits). PR title for the override: `override: T-XXX`.

You do **not** have to wait for the 5-day stale rule. That rule guarantees nothing rots forever — it's not a minimum cool-down. Override anytime you have a concrete reason; the paper-trail line makes it auditable.

**No bypass.**

Every status change — claim, self-unclaim, override, done — goes through the visible TODO.md edit + commit + push. No "I claimed it in Telegram" or "we agreed in DMs." The file is the protocol; the protocol is the file. Silent claims defeat the whole point.

## 3. Dependency check (the rule that prevents redundancy)

Before claiming, confirm every ID in `Depends-on:` shows `Status: done` either inline or in the **Done** section. If even one is not done, **don't claim**:

- Pick a different task with cleared deps, or
- Pick the unfinished dep itself and clear it first.

If you find a dependency that *should* exist but isn't tracked yet, add a new task block for it first, then claim that.

## 4. Per-OS reality

| Concern | Windows | macOS | Linux |
|---|---|---|---|
| Solana CLI install | Native via `solana-install` (PowerShell) **or** WSL2 (recommended). Native works for `solana` and `anchor`; `solana-test-validator` is more reliable on WSL2 | `brew install solana` or `solana-install` | `solana-install` script |
| Anchor install | `cargo install --git https://github.com/coral-xyz/anchor avm --locked --force`, then `avm install 0.30.0 && avm use 0.30.0` | same | same |
| Rust toolchain | `rustup` | `rustup` | `rustup` |
| Node + pnpm | nvm-windows or fnm; `corepack enable` | nvm / fnm | nvm / fnm |
| Postgres locally | Docker Desktop or hosted dev DB (T-402) | Postgres.app or Docker | apt/dnf or Docker |
| Local validator perf | Slow on native Windows; prefer WSL2 | Fast | Fast |

**Recommendation for Windows devs:** do everything inside WSL2 (Ubuntu). Eliminates symlink, file-watcher, and `solana-test-validator` gotchas. The two Windows devs can compare notes on whether to standardize on WSL2 in T-501.

Pinned versions live in `docs/runbooks/dev-environment.md` (T-501).

## 5. Suggested ownership (hint, not enforced)

The board is open-pickup. Nothing here blocks anyone from picking anything — gravitating toward known areas just makes it faster:

| Area | Natural fit | Reasoning |
|---|---|---|
| Anchor program / Rust (Section 1) | macOS / Linux dev | local validator + Anchor toolchain are smoothest there |
| Backend Node (Section 2) | Any | Postgres + Express run identically on all OSes |
| Dashboard + SDK (Section 3) | Any | browser-side; OS-irrelevant |
| Infra / CI (Section 4) | Whoever's paged in that day | one-off bursts |
| Docs (Section 5) | Whoever has context | grab during idle time between PRs |

## 6. Avoiding redundancy

Three rules:

1. **Look at active claims before starting anything.** `grep "Status: in-progress" TODO.md`. If you see something on your radar, ping that person before opening a parallel branch.
2. **One task = one PR.** If you find yourself doing two things in one branch, stop and split. The second thing gets a new T-XXX entry.
3. **No silent re-implementation.** If a task entry exists for the work you want to do, claim it; don't duplicate. If no entry exists, add one before starting.

## 7. Rules for Claude / AI agents working on this repo

These extend the global rules in [`/AGENTS.md`](../../AGENTS.md):

1. **Read `TODO.md` first** before any code change. It's the source of truth for what's in flight.
2. **Never claim a task without explicit user instruction.** "Look at the board" is not a claim. "Claim T-105 and implement it" is.
3. **Always check `Depends-on`** before recommending or starting a task. If a dep is incomplete, surface that to the user before plowing ahead.
4. **Reference the task ID** in every commit and PR title you create on a user's behalf.
5. **Update the status line** in the same commit that finishes the work — not as a separate housekeeping commit.
6. **When adding a new task**, mirror an existing block's shape (Status / Depends-on / OS / Scope / Acceptance). Don't invent fields.
7. **Don't migrate the board to Issues / Linear** without explicit user approval. The file is the protocol, by design.
8. **One in-progress claim per agent session.** Finish or release before picking the next.
9. **Report claim conflicts to the user, don't silently retry.** If a `claim:` PR fails to merge cleanly, surface the conflict and let the user decide.

## 8. Cadence

| Cadence | What |
|---|---|
| Async (anytime) | claim, work, PR, merge |
| Daily | each dev posts a one-line status in team channel; surface blockers early |
| Weekly | 30-min sync — walk the board top-to-bottom, retire stale claims, prune duplicates, reprioritize |
| Per merge | the merger (reviewer or author) is responsible for the `done` move and the block migration to Done |

## 9. When to deviate from this runbook

If the protocol gets in the way of shipping by deadline, change it. Open a PR titled `runbook: <change>` with rationale. Merge after one teammate signs off.
