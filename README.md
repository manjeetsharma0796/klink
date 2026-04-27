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

## License

> **TODO**: pick (MIT / Apache-2.0). Tracked as a follow-up to `T-115`.
