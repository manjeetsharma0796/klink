---
title: GitBook consumer-facing rewrite — design
purpose: Convert the gitbook from internal-flavored docs to consumer-facing docs with icon-decorated sidebar, scrubbed leakage, end-to-end Quickstart, and stubs for unbuilt features.
last_updated: 2026-05-03
---

# GitBook Consumer Rewrite — Design

## Why

The published GitBook (`gitbook/`) currently reads as internal documentation. Symptoms:

- Internal task IDs (`T-XXX`) leak in 9+ places
- Direct links to the private repo, internal spec, runbooks, and `TODO.md`
- Frontmatter on every concepts page reads `Source of truth = docs/specs/2026-04-28-agent-wallet-design.md`
- References to a third-party paid-service protocol (`mpp.dev`) and a peer project (`pay-with-locus`) leak strategy/positioning
- Status disclosures use internal phrasing ("active development", "honest disclosure of where we are")
- Quickstart is a placeholder pointing at unreleased SDK
- No icons on sidebar; the sidebar reads as a flat list of files

The audience for this site is **external developer-consumers** — engineers building agents who will integrate Klink. The site should look polished, hide internal scaffolding, and let a reader go from "what is this?" to "I have a wallet and an agent spending from it" in one sitting.

## Scope (locked)

Approach: **moderate (Approach 1)** — restructure to four sections with icons, scrub all leakage, ship a real end-to-end Quickstart, stub unbuilt surfaces (SDK / CLI), soften the Risks page.

Out of scope:
- Rewriting prose voice for marketing polish (Approach 3)
- New pages beyond the SDK/CLI stubs
- Visual design beyond GitBook's built-in icon support
- Pushing to GitBook.com — that flows automatically from the git repo via existing Git Sync

## Information architecture

```
Welcome (README.md, top of SUMMARY)
│
├── GETTING STARTED                  3 pages
│   ├── Introduction                  (was: introduction/what-is-klink.md, with how-it-works merged in)
│   ├── Quickstart                    (full rewrite)
│   └── Prerequisites                 (heavy scrub)
│
├── CORE CONCEPTS                    8 pages
│   ├── Overview
│   ├── Architecture                  (moved from a top-level section into Concepts)
│   ├── Vault                          (renamed from "Vault PDA" — less jargon)
│   ├── Sessions
│   ├── Policies
│   ├── Budgets
│   ├── Audit Trail
│   └── Yield
│
├── DEVELOPER RESOURCES              3 pages
│   ├── SDK                           (new stub — "Coming soon")
│   ├── CLI                           (new stub — "Coming soon")
│   └── Agent Skill                    (was: gitbook/skill.md, scrubbed)
│
└── REFERENCE                        4 pages
    ├── Glossary
    ├── FAQ
    ├── Risks & Disclosures           (softened from "Risks")
    └── Roadmap                        (T-XXX column removed; quarter-grain milestones)
```

Architecture moves under Core Concepts because that's how a reader thinks about it ("how does Klink work?"), and it matches the section pattern in the reference image (Axicov gitbook).

## Icons

GitBook 5+ supports per-page Lucide icons via frontmatter:

```yaml
---
icon: rocket
---
```

Renders as a sidebar icon next to the page title. Icon names are kebab-case Lucide identifiers from <https://lucide.dev>.

Per-page assignment:

| Page | Lucide name |
|---|---|
| Welcome | `hand-wave` |
| Introduction | `sparkles` |
| Quickstart | `rocket` |
| Prerequisites | `list-checks` |
| Concepts → Overview | `compass` |
| Architecture | `layers` |
| Vault | `vault` |
| Sessions | `key-round` |
| Policies | `shield-check` |
| Budgets | `wallet` |
| Audit Trail | `scroll-text` |
| Yield | `trending-up` |
| SDK | `package` |
| CLI | `terminal` |
| Agent Skill | `bot` |
| Glossary | `book-open` |
| FAQ | `circle-help` |
| Risks & Disclosures | `shield-alert` |
| Roadmap | `map` |

## Scrub list (regex, applied across `gitbook/**/*.md`)

| Pattern | Action |
|---|---|
| `T-\d{3}` | Remove or rephrase the surrounding sentence |
| `mpp\.dev` | Replace with "external paid-service protocol" or "third-party x402 catalog" |
| `pay-with-locus` | Remove |
| `manjeetsharma0796/klink` GitHub URL | Remove (or replace with public repo URL once published) |
| `docs/specs/2026-04-28-agent-wallet-design.md` | Remove |
| `docs/runbooks/...` | Remove |
| `Source of truth = docs/specs/...` (frontmatter line) | Delete that line |
| `TODO.md` link | Remove |
| `internal design spec` | Remove or replace with "the open-source program" |
| `in active development` (status banner) | Replace with "in beta" or remove |
| Team handles `@Manjeet` `@Jishnu` `@Prithwish` `@Mouli` `@Manish` | Remove (none currently in gitbook, but verify at write-time) |

After the bulk scrub, every page gets a manual read-through to catch context-sensitive phrasings the regex misses.

## Per-page action plan

| Page | Action | Notes |
|---|---|---|
| `README.md` (Welcome) | Light rewrite | Drop "Pre-mainnet" and "internal design spec" lines; keep the three-actor table; add "What you'll find here" bulleted nav |
| `introduction/what-is-klink.md` | Promote + scrub | Becomes the canonical "Introduction" page; merge the value prop with the "How it works" content from the next file |
| `introduction/how-it-works.md` | **Delete after merge** | Content folds into `what-is-klink.md` |
| `getting-started/quickstart.md` | **Full rewrite** | New end-to-end curl flow (see §6) |
| `getting-started/prerequisites.md` | Heavy scrub | Remove `T-XXX` dep table, `TODO.md` link, "TODO" banners |
| `concepts/overview.md` | Light scrub | Frontmatter only |
| `concepts/vault-pda.md` → `concepts/vault.md` | Rename + light scrub | "Vault" reads cleaner |
| `concepts/sessions.md` | Light scrub | Frontmatter only |
| `concepts/policies.md` | Light scrub | Frontmatter only |
| `concepts/budgets.md` | Light scrub | Frontmatter only |
| `concepts/audit-trail.md` | Light scrub | Frontmatter only |
| `concepts/yield.md` | Light scrub | Reword the Kamino reference if specific protocol naming is too internal |
| `architecture/overview.md` | Heavy scrub | Replace `mpp.dev` in two diagrams with generic "External paid service"; remove internal spec link; soften status wording |
| `architecture/README.md` | **Delete** | Redundant with `overview.md` |
| `developer-resources/sdk.md` | **New stub** | "Klink SDK · Coming soon" + 1-paragraph teaser of the API shape |
| `developer-resources/cli.md` | **New stub** | "Klink CLI · Coming soon" + 1-line note |
| `skill.md` | Heavy scrub | Remove `pay-with-locus` and `mpp.dev` references; remove repo-internal references; keep curl examples |
| `resources/glossary.md` | Heavy scrub | Replace `mpp.dev` "co-developed by Tempo and Stripe" line with neutral protocol description |
| `resources/faq.md` | Light scrub | Read-through |
| `resources/risks.md` | **Soften** | Drop "honest disclosure"; reframe as security model + responsible-use disclaimer; keep mainnet-not-yet warning in neutral tone |
| `resources/roadmap.md` | Heavy scrub | Remove the T-XXX column; restate as quarter-grain milestones (e.g., "Q3 2026 — Public SDK", "Q4 2026 — Mainnet") |

## Quickstart shape (new)

The new `getting-started/quickstart.md` walks through the full create-vault → fund → spend → audit loop using `curl` against the live API plus Phantom for the owner-key-required steps. Five steps:

1. **Sign in (SIWS)** — `POST /v1/auth/siws/nonce` → sign nonce in Phantom → `POST /v1/auth/siws` → returns dashboard JWT cookie
2. **Create the vault** — `POST /v1/wallet` returns an unsigned base64 transaction → owner signs and submits via Phantom → returns the vault PDA
3. **Create an agent session** — `POST /v1/session` with caps and allowlists → returns the session PDA + an agent bearer token (one-time-shown plaintext)
4. **Have your agent spend** — `POST /v1/spend/transfer` with the agent bearer → backend co-signs and submits the SPL-token transfer
5. **Audit** — `GET /v1/audit` returns the spend's row with the on-chain tx signature for cross-reference

Each step: short paragraph + curl block + expected response shape.

The page ends with a "Next steps" section pointing at the SDK / CLI stubs (Coming soon) and the Concepts → Overview page.

For the URL: prefer `https://api.klink.dev` if a public host exists; otherwise use `https://klink-api.onrender.com` as an explicit "public devnet endpoint". (Decision deferred to write-time after a quick check; if no public-friendly host, document the staging URL plainly.)

## Implementation order

1. Create `gitbook/developer-resources/` directory and the two stubs (SDK, CLI)
2. Add `icon:` frontmatter to all 18 pages (one editing pass)
3. Run scrub regex across `gitbook/**/*.md` (sed or batched edits)
4. Rewrite `SUMMARY.md` to the new IA
5. Rewrite Quickstart from scratch
6. Soften Risks and rewrite Roadmap
7. Heavy scrub on Architecture, Glossary, skill.md
8. Merge `introduction/how-it-works.md` into `what-is-klink.md` and delete the source
9. Delete `architecture/README.md`
10. Rename `concepts/vault-pda.md` → `concepts/vault.md` and update SUMMARY link
11. Final grep pass to verify zero matches for the scrub patterns
12. Commit as one squashable feature: `docs(gitbook): consumer-facing rewrite — restructure, scrub leakage, add icons, end-to-end Quickstart`

## Acceptance

- `grep -rE 'T-\d{3}|mpp\.dev|pay-with-locus|manjeetsharma0796|docs/specs|docs/runbooks' gitbook/` returns zero matches
- `SUMMARY.md` matches the IA in §3
- Every page in SUMMARY has an `icon:` frontmatter field with a valid Lucide name
- Quickstart contains five working `curl` examples with expected responses
- SDK and CLI stubs each render at least one paragraph and a "Coming soon" badge
- Risks page uses neutral language; Roadmap has no task IDs
- A reader can navigate Welcome → Introduction → Quickstart → Concepts → Architecture without encountering broken links

## Out of scope (explicit)

- Updating gitbook.com configuration — Git Sync handles this automatically on push
- Adding new diagrams or images
- Marketing-style copy or hero pages
- Internationalization
- Changes to internal docs (`docs/`, `CLAUDE.md`, `TODO.md`, etc.) — those stay as-is
