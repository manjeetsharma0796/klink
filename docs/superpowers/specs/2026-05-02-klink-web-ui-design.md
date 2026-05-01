---
title: Klink Web Dashboard — UI Design Spec
purpose: End-to-end design for the owner-facing dashboard at apps/web — covering wallet creation, session management, allowlist editing, yield, fund, audit, and settings against the v1 API surface
last_updated: 2026-05-02
related: T-303, T-304, T-305, T-306, T-307, T-308, T-218 (new), T-219 (new), T-221 (new), T-222 (new), T-223 (new), T-224 (new)
status: draft — awaiting reviewer attestation
---

# Klink Web Dashboard — UI Design Spec

## TL;DR

Build the full owner-facing dashboard at `apps/web` end-to-end against the existing v1 API surface (every backend endpoint per `docs/architecture/api-surface.md` is now live). Layout follows the Locus reference (narrow left sidebar with grouped nav, 3-column Overview, white/off-white minimal aesthetic) but adapted to klink's trustless model — no "approval queue" rail, since on-chain hard limits replace human approvals. Six top-level sections (Overview, Audit, Sessions, Yield, Fund, Settings) plus a nested allowlist editor under each session. Owner writes use the existing build-tx-then-sign pattern via Phantom; the backend never holds the owner key. UI surface covers T-303 through T-308; six new backend-gap tasks (T-218 list-sessions, T-219 read-session, T-224 read-wallet, T-221 set-policy, T-222 owner-yield, T-223 set-off-chain-policy) are filed to TODO.md so the dashboard has the read + write endpoints it needs without introducing a mock layer.

## Goals (this spec)

1. **Visual + interaction parity** with the Locus reference layout, adapted to klink's feature set.
2. **Every screen wired to a real backend route** — no permanent mock layer; gaps filed as backend tasks.
3. **Owner-key safety preserved** — Phantom signs every owner-write; the dashboard never sees the secret.
4. **Functional puppeteer coverage** — every page renders, every primary action invokes the right endpoint or builds the right tx.
5. **No collision** with in-progress backend / SDK work (T-110, T-309, T-407).

## Non-goals (explicit)

- Marketing / landing page (per user direction).
- Mainnet wiring — devnet + localhost only during build.
- Real on-chain confirmation in puppeteer until T-113 deploys the program.
- React Native / mobile breakpoints — desktop + tablet only.
- Internationalization.
- Agent-facing console (the dashboard is owner-only; agents talk to the backend directly with their API key).
- A new design system from scratch — `shadcn/ui` provides the primitives.

## 1. Information architecture

```
/                                      Phantom SIWS sign-in (existing app/page.tsx)
/dashboard                             Overview: 3-column grid
/dashboard/audit                       Audit log: cursor-paginated table + decision filter
/dashboard/sessions                    List + "New session" modal
/dashboard/sessions/[id]               Allowlist editor (recipients + URLs + time window)
/dashboard/yield                       Position + deposit/withdraw forms
/dashboard/fund                        Deposit address QR + Dodo "Add $X" form
/dashboard/settings                    max_deployed_fraction_bp + revoke wallet (future)
```

`app/dashboard/layout.tsx` mounts the sidebar + topbar once; sub-routes only re-render the right pane. Active route is the only nav state.

## 2. Visual direction

### 2.1 Reference

Locus dashboard at `app.paywithlocus.com` (screenshot in working session, image.png at repo root during design). Adapt — do not copy verbatim. Key takeaways:

| Element | Locus | Klink (adapted) |
|---|---|---|
| Sidebar | Narrow (~200px), grouped sections (Main / Activity / Config) | Same structure, klink logo, six items mapped to our routes |
| Topbar | User-identity pill on the right | Phantom pubkey (truncated) + sign-out |
| Main canvas | White, off-white cards, soft shadow | Same; one accent color (`emerald-400`) |
| Settings card (Overview) | "Allowance / Max Tx / Approval Threshold" with Configure links | "Max Deployed Fraction / Active Sessions / Vault PDA" with Configure / Manage links |
| Balance card (Overview) | QR + balance + Fund/Send buttons | QR + USDC liquid + USDC deployed + Fund button (Send goes through agent flow, not owner) |
| Right rail (Overview) | "Pending Approvals" + "Recent Transactions" | "Active Sessions" + "Recent Activity" (last 5 audit rows) |

### 2.2 Tokens

- Colors: zinc neutrals, single emerald accent for primary CTAs and active nav. Red only for destructive (revoke session). Amber for warnings (e.g., session expiring soon).
- Typography: Inter for body, JetBrains Mono for pubkeys/signatures/amounts.
- Radius: `rounded-xl` for cards, `rounded-lg` for buttons.
- Shadow: `shadow-sm` baseline; `shadow-md` on hover for action cards.
- Spacing: 24px gutter between cards; 16px internal padding.
- Loading: skeleton blocks (matched to final layout), never spinners.

## 3. Page-by-page contracts

### 3.1 Overview (`/dashboard`)

**Reads:**
- `GET /v1/wallet` (T-224, NEW) → `{ vaultPda, usdcAta, maxDeployedFractionBp, createdAt }`
- on-chain via web3.js: liquid USDC balance from `usdcAta` (`getTokenAccountBalance`) **and** `deployed_amount` from the Vault PDA (`getAccountInfo` + Borsh decode at the spec offset). Reading on-chain directly avoids the dashboard depending on the agent-only `/v1/yield/position` endpoint for plain reads.
- `GET /v1/sessions?limit=5` (T-218, NEW) → recent sessions count
- `GET /v1/audit?limit=5` → recent audit rows

**Writes:**
- "Create wallet" CTA (only when `GET /v1/wallet` returns 404): `POST /v1/wallet` → Phantom signs → submit
- "Configure max deployed fraction" → routes to `/dashboard/settings`
- "Manage sessions" → routes to `/dashboard/sessions`
- "Fund" → routes to `/dashboard/fund`

**Layout (3-column on ≥lg, stacked on md/sm):**

```
+--------------+  +-----------------+  +-------------------+
| Wallet       |  | USDC balance    |  | Active Sessions   |
| Settings     |  | $ liquid        |  | (n active)        |
|              |  | $ deployed      |  | [Manage]          |
| Max BP       |  | [QR code]       |  +-------------------+
| Sessions n   |  | vaultPda short  |  | Recent Activity   |
| Vault PDA    |  | [Fund] [Yield]  |  | (last 5 audit)    |
| [Settings →] |  +-----------------+  +-------------------+
+--------------+
```

**Empty states:**
- No wallet: full-card "Create your klink wallet" CTA, single button.
- No sessions: "You haven't issued any session API keys yet." + Create button.
- No audit: "No activity yet."

### 3.2 Audit (`/dashboard/audit`)

**Reads:** `GET /v1/audit?cursor=&decision=&limit=50`

**UI:**
- Filter pills above the table: All / Allow / Deny.
- Table columns: Timestamp · Action · Amount (USDC base units → display) · Recipient/URL (truncated, mono) · Decision (badge) · Reason (deny only) · Tx (link to Solana Explorer when present).
- Cursor pagination (load more on scroll bottom or button at bottom).
- Click row to expand denial reason / full payload.

**Empty state:** "No audit entries match this filter."

### 3.3 Sessions (`/dashboard/sessions`)

**Reads:** `GET /v1/sessions` (T-218, NEW) → `[{ id, label, sessionPubkey, expiresAt, revokedAt, keyPrefix, createdAt }]`

**Writes:**
- "New session" → modal form (label, max_per_tx, daily_cap, expiry, allowed_recipients[≤10], allowed_instructions bitmap)
- → `POST /v1/session` (returns `{ txBase64, sessionId, sessionPubkey, apiKey, keyPrefix, expiresAt }`)
- → Phantom signs `add_session` tx → submit
- → On confirmed: show **API key once** in a "copy this — we won't show it again" toast/modal
- "Revoke" on row → confirmation dialog → `DELETE /v1/session/:id` → Phantom signs revoke tx → submit

**UI:**
- Table: Label · Pubkey (mono, truncated) · Status (active / expired / revoked) · API key prefix · Created · Actions (Allowlist / Revoke)
- "Allowlist" navigates to `/dashboard/sessions/[id]`.

### 3.4 Allowlist editor (`/dashboard/sessions/[id]`)

**Reads:** `GET /v1/sessions/:id` (T-219, NEW) → on-chain session state + off-chain policy

**Writes:** `PATCH /v1/sessions/:id/allowlist` with `{ action: 'Add'|'Remove'|'Set', recipients?: Pubkey[], allowed_instructions?: u32 }` → Phantom signs → submit

**UI sections:**
- **Recipients (on-chain)**: 10 fixed slots, mono-styled inputs. Dropdown action (Add / Remove / Set) at the top. "Replace all" toggle = Set; otherwise patch.
- **Instruction bitmap (on-chain)**: three checkboxes mapped to the spec §2.4 bitmap — `transfer_usdc` (bit 0), `kamino_deposit` (bit 1), `kamino_withdraw` (bit 2). Read-only display of the resulting `u32` value below.
- **URL allowlist (off-chain)**: list of `{ pattern, max_per_call }` rows. Pattern validation per spec §3.3.1 (path-segment wildcards only, no host wildcards). Saved via `PATCH /v1/wallet/off-chain-policy` (T-223, NEW) — current backend has the read/eval side from T-209 but no write endpoint.
- **Time window (off-chain)**: day-of-week 7-checkbox bitmask + start-min / end-min sliders + tz select. Saved via the same T-223 endpoint.

Each section has its own Save button — they save to different layers (on-chain via T-207, off-chain via T-223).

### 3.5 Yield (`/dashboard/yield`)

**Reads:** on-chain RPC: liquid USDC ATA balance + Vault `deployed_amount` (decoded client-side); `GET /v1/wallet` for `max_deployed_fraction_bp`. Yield read via the agent-only `GET /v1/yield/position` is **not** used here — the dashboard would need an API key, which it shouldn't hold.

**Writes:** `POST /v1/yield/deposit` / `POST /v1/yield/withdraw` via owner build-tx-then-sign through Phantom (T-222, NEW — adds dashboard-JWT path to T-213 endpoints, mirroring how T-207's session ops work). The on-chain instruction natively supports `session OR owner` per design spec §2.3, so no program change is needed; only the backend gains the owner-auth handler that returns `txBase64` for Phantom.

**UI:**
- Left pane: liquid balance (read-only, large).
- Right pane: deployed amount + accrued (if available).
- Below: dual-form — Deposit amount input + slider capped at `max_bp - currently_deployed_fraction`; Withdraw amount input capped at `deployed`.
- Session selector (single-line) to attribute the action.
- Status: pre-flight check shown inline ("This deposit would push you to 78% deployed; cap is 80%.").

### 3.6 Fund (`/dashboard/fund`)

**Reads:** `GET /v1/fund/deposit-address` → `{ vault_pda, usdc_ata, qr_data_url }`

**Writes:** `POST /v1/fund/dodo-checkout` with `{ amount_usd, wallet_id }` → redirect to `checkout_url`

**UI:**
- Two cards side by side:
  - **Direct deposit**: QR (server-rendered data-url, sized 256px), the USDC ATA, copy button. Note: "Send USDC on Solana to this address. Confirms in ~400ms."
  - **Card / fiat (Dodo)**: amount input ($1–$10000), preset chips ($10 / $50 / $100 / $250), submit → redirect.
- Below: notes panel — "Direct = free. Dodo = card processing fee applies."

### 3.7 Settings (`/dashboard/settings`)

**Reads:** `GET /v1/wallet`

**Writes:** `POST /v1/wallet/policy` (T-221, NEW) with `{ max_deployed_fraction_bp }` → builds `set_max_deployed_fraction` tx → Phantom signs → submit

**UI:**
- Slider 0–10000 bp, % display, validates against current deployed (cannot drop below current ratio without withdrawing first).
- Read-only fields below: vault PDA, USDC ATA, owner pubkey, created date.

### 3.8 Sign-in (existing — `/`)

Not modified. Existing `app/page.tsx` + `app/sign-in.tsx` handle Phantom SIWS → JWT cookie → redirect to `/dashboard`. Visual cleanup only (apply the same design tokens — currently inline gray-50, will move to the same neutral baseline).

## 4. Data flow patterns

### 4.1 Read

Every read uses **SWR** with the `Authorization: Bearer <jwt>` header read from a cookie-bound helper. Default revalidate-on-focus + 30s dedupe. Cache key = endpoint + query params.

### 4.2 Owner-write (build-tx-then-sign)

A shared client hook `useBuildAndSignTx()`:

```ts
async function buildAndSign(
  endpoint: string,        // e.g. "/v1/wallet"
  method: "POST" | "DELETE" | "PATCH",
  body?: unknown,
): Promise<{ signature: string; vaultPda?: string; ... }>
```

Steps inside:
1. `fetch(endpoint, ...)` → `{ txBase64, ...other }`
2. `Transaction.from(Buffer.from(txBase64, "base64"))`
3. Phantom adapter `signTransaction(tx)`
4. `connection.sendRawTransaction(tx.serialize())`
5. `connection.confirmTransaction(...)` with timeout (30s)
6. Return `{ signature, ...passthrough }`

Errors are normalized to `{ kind: "BUILD" | "PHANTOM" | "SUBMIT" | "TIMEOUT", message, cause? }` for uniform UI.

### 4.3 Agent-write (testing only)

Hidden behind `NEXT_PUBLIC_DEVTOOLS=1`. A `/dashboard/_devtools` route lets the human paste an API key and exercise `/v1/spend/transfer`, `/v1/yield/deposit`, etc. Used only for puppeteer coverage. Not shipped behind the flag-off path.

## 5. Auth + safety

- **Owner key**: never leaves Phantom. Validated by the existing SIWS flow; no change here.
- **JWT cookie**: existing httpOnly cookie set by `/api/auth/siws` — UI relies on it for `Authorization: Bearer <jwt>` on every dashboard request via a small `apiFetch()` helper that reads it server-side.
- **API keys**: never displayed except in the one-time post-create modal in `/dashboard/sessions`. No persistence in the UI; user must copy.
- **CSRF**: dashboard JWT is a cookie, but the API requires `Authorization: Bearer` — same-origin POSTs from the dashboard do the right thing. We will not call the API directly from cross-origin contexts.
- **Devnet test wallet**: puppeteer flows generate a fresh keypair per run + airdrop devnet SOL — no real wallets touched. Helper at `apps/web/tests/helpers/test-wallet.ts`.
- **No private-key handling in the web app**: confirmed by code review checklist before merge.

## 6. Dependency stack

Adding to `apps/web/package.json`:

| Dep | Version | Purpose |
|---|---|---|
| `swr` | `^2.2.5` | Read-side cache + revalidate-on-focus |
| `react-hook-form` | `^7.53.0` | Allowlist editor (10 recipients × pubkey validation), session create |
| `zod` | `^3.23.8` | Form schemas + API response parsing |
| `class-variance-authority` | `^0.7.0` | Tailwind primitive variants for the design system |
| `clsx` | `^2.1.1` | Class composition |
| `lucide-react` | `^0.460.0` | Icon set (sidebar + table actions) |

`shadcn/ui` is **copy-paste, not a runtime dep** — the components live in `apps/web/app/_components/ui/` and use only Radix primitives + Tailwind + cva. We pull only the components we use (Button, Card, Dialog, Tabs, Table, Input, Label, Slider, Toast).

Bundle delta budget: ≤ 50 KB gzipped on top of current.

## 7. Environment variables

`apps/web/.env.local` (developer copies from `apps/web/.env.local.example`, which we will create):

```
# Solana RPC — devnet for local dev, swap to mainnet in prod
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com

# Anchor program ID (devnet pending T-113)
NEXT_PUBLIC_KLINK_PROGRAM_ID=5qCJCEhfLusk59YFqaEG9Yg3Wp64ZaYwvXteFmCmedqv

# Devnet USDC mint (mainnet uses EPjFWdd5...)
NEXT_PUBLIC_USDC_MINT=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU

# Backend Express base URL
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000

# Local-only: enable /dashboard/_devtools (hidden agent-write console)
NEXT_PUBLIC_DEVTOOLS=1
```

Backend host (`NEXT_PUBLIC_API_BASE_URL`) defaults to localhost:3000 — the apps/api port. Confirm during impl that's right.

## 8. Backend gap tasks (filed to TODO.md)

Six read/write endpoints the dashboard needs that don't yet exist. Each is a new T-2xx row, all dashboard-JWT, all small (< 100 LOC each). Filed during this spec's commit.

| ID | Method + path | Purpose | Auth |
|---|---|---|---|
| **T-218** | `GET /v1/sessions` | List sessions for the calling user's wallet (paginated). | siws-jwt |
| **T-219** | `GET /v1/sessions/:id` | Read one session (on-chain state + off-chain policy joined). | siws-jwt |
| **T-224** | `GET /v1/wallet` | Read wallet (vault PDA, USDC ATA, max_bp, created). | siws-jwt |
| **T-221** | `POST /v1/wallet/policy` | Build `set_max_deployed_fraction` tx for owner Phantom to sign. | siws-jwt |
| **T-222** | `POST /v1/yield/deposit`, `POST /v1/yield/withdraw` (dashboard-JWT path) | Owner build-tx-then-sign for Kamino deposit/withdraw — design spec §4.3 says owner can drive yield via dashboard JWT, but T-213 only shipped the agent-key path. | siws-jwt |
| **T-223** | `PATCH /v1/wallet/off-chain-policy` | Set `allowed_urls`, `time_window_*`, `timezone` rows in `off_chain_policies`. T-209 has the read/eval; this is the missing write half. | siws-jwt |

Dependencies: T-218/T-219 → T-206 (done); T-224 → T-205 (done); T-221 → T-107 + T-205 (done); T-222 → T-108, T-109, T-205 (all done); T-223 → T-209 (done).

Numbering note: T-220 in the existing TODO is "Service catalog seed" — the wallet-read task here uses **T-224** to avoid collision.

Until each lands, the dashboard pages that depend on them render a "Backend endpoint pending" empty state with a link to the task. UI code is written against the planned response shape (typed with Zod) so the swap-in is one-line per call.

## 9. Testing strategy

### 9.1 Unit (Bun test)

- Pubkey + amount validators (zod schemas).
- `useBuildAndSignTx` hook — mocked Phantom + RPC.
- API client functions — mocked fetch.

### 9.2 End-to-end (puppeteer)

`apps/web/tests/e2e.puppeteer.ts`:

1. **Setup**: spin up Next dev server on a random port; spin up apps/api against a test Postgres + Redis; generate a test owner keypair; airdrop 1 SOL devnet; inject as `window.solana` adapter.
2. **Sign-in flow**: visit `/`, trigger SIWS, assert redirect to `/dashboard`.
3. **Wallet creation**: click Create → assert backend `POST /v1/wallet` called → fake Phantom signs → fake RPC confirms → assert overview balance shows.
4. **Session create + list**: open New session modal, fill, submit → assert API key shown once, copy works, post-close it disappears.
5. **Allowlist edit**: navigate to session detail, add a recipient, save → assert PATCH called.
6. **Yield deposit**: navigate to /yield, fill amount, submit → assert deposit endpoint hit.
7. **Fund flow**: navigate to /fund, assert QR renders + Dodo button redirects (mock external redirect).
8. **Audit**: navigate to /audit, assert table renders, filter pills work.
9. **Settings**: change max_bp slider, submit → assert policy endpoint hit.

All run headless by default; `HEADFUL=1` for visual debug. Screenshots saved to `apps/web/tests/_screenshots/<page>.png`. Console errors fail the test.

### 9.3 Visual regression (manual via puppeteer screenshots)

Each PR run posts the screenshot diff in CI (later — not a hard requirement for v1 of the UI).

### 9.4 What we do NOT test in CI yet

- Real on-chain confirmation against devnet (waits for T-113).
- Phantom extension's actual UI prompt (we stub the adapter).
- Dodo redirect against real Dodo endpoints (we stub at the network layer).

## 10. Out of scope

| Item | Why out |
|---|---|
| Marketing / landing page | User explicitly excluded |
| Mobile breakpoints | Desktop + tablet only for MVP |
| Real on-chain confirmation in puppeteer | Blocked on T-113 deploy |
| Mainnet config | Devnet during build |
| Per-session yield analytics | Future — accrued amount surfaces, not analytics |
| Multi-wallet UX | One wallet per user in MVP per spec |
| Dark mode | Single light theme matches the reference |
| i18n | English-only |

## 11. Risks + open items

| Risk | Mitigation |
|---|---|
| T-113 not landing during UI build → can't smoke-test on-chain | Puppeteer flow stubs the RPC; screenshot harness still proves UI correctness |
| Phantom adapter mocking quirks (Phantom's actual extension behavior diverges from the wallet-adapter abstraction) | Test against the adapter interface only; manual smoke-test on real Phantom before merge |
| Backend gap tasks (T-218 to T-221) not picked up | UI ships a "backend endpoint pending" empty state per page so demo doesn't break |
| Bundle bloat from shadcn copy-paste components | Audit per page; no full kitchen sink; only used primitives committed |
| `NEXT_PUBLIC_DEVTOOLS` accidentally on in prod | Build-time check fails the prod build if `NEXT_PUBLIC_DEVTOOLS != "0"` and `NODE_ENV === "production"` |

## 12. References

- [API surface](../../architecture/api-surface.md) — every backend route the dashboard calls
- [Design spec](../../specs/2026-04-28-agent-wallet-design.md) — overall architecture; §3.2 + §3.6 are most relevant for the dashboard
- [Architecture overview](../../architecture/overview.md)
- [Locus reference](https://app.paywithlocus.com) — visual reference layout (image.png at session start)
- [Phantom wallet adapter](https://github.com/anza-xyz/wallet-adapter)

## 13. Reviewer attestation

| Reviewer | Date | Approved | Notes |
|---|---|---|---|
| _(unfilled)_ | — | — | Sign here once each section is confirmed |
