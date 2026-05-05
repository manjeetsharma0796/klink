# @klink/web owner dashboard

Next.js 14 (App Router) dashboard for the human owner. Wallet creation, sessions, allowlist editor, yield, fund, audit, and settings all wired against the v1 API surface.

## Run

```bash
bun install                                 # at repo root
cp apps/web/.env.local.example apps/web/.env.local   # edit if backend isn't on :3000
bun --filter @klink/web dev                 # http://localhost:3030
```

The api dev server runs on `:3000`; web on `:3030`.

## Test

- Unit: `bun test` (32 tests across 7 files formatters, schemas, Vault Borsh decoder, hook schema)
- e2e (puppeteer): `JWT_SECRET=puppeteer-test-secret-not-for-prod-use bun run e2e`
  - Requires `bun run dev` running with the same `JWT_SECRET`
  - Spins up a stub mock API on `:3001` (avoid by setting `NEXT_PUBLIC_API_BASE_URL=http://localhost:3001` when starting the dev server)
  - Generates 7 screenshots in `tests/_screenshots/` (gitignored)

`HEADFUL=1` opens a visible browser for debugging.

## Pages

| Path                       | Owner task                                     | Status |
| -------------------------- | ---------------------------------------------- | ------ |
| `/`                        | T-302 sign-in (Phantom SIWS)                   | done   |
| `/dashboard`               | T-303 overview, create wallet                  | done   |
| `/dashboard/sessions`      | T-304 list, create, revoke                     | done   |
| `/dashboard/sessions/[id]` | T-305 recipients + bitmap + URLs + time window | done   |
| `/dashboard/yield`         | T-307 Kamino deposit/withdraw                  | done   |
| `/dashboard/fund`          | T-308 direct deposit + Dodo                    | done   |
| `/dashboard/audit`         | T-306 paginated table + filter                 | done   |
| `/dashboard/settings`      | max_deployed_fraction_bp + wallet info         | done   |

## Backend dependencies

Pages render `<BackendPending />` when their endpoint is not yet implemented. See the [UI design spec §8](../../docs/superpowers/specs/2026-05-02-klink-web-ui-design.md) for the gap-task table:

| ID    | Endpoint                                                  | Page that needs it                   |
| ----- | --------------------------------------------------------- | ------------------------------------ |
| T-218 | `GET /v1/sessions`                                        | sessions list                        |
| T-219 | `GET /v1/sessions/:id`                                    | allowlist editor                     |
| T-221 | `POST /v1/wallet/policy`                                  | settings                             |
| T-222 | dashboard-JWT path on `POST /v1/yield/{deposit,withdraw}` | yield                                |
| T-223 | `PATCH /v1/wallet/off-chain-policy`                       | allowlist editor (URL + time window) |
| T-224 | `GET /v1/wallet`                                          | overview, settings, fund             |

When each lands, the dashboard activates that screen automatically no UI changes needed.

## Architecture

- **Read** SWR + `swrFetcher` from `lib/api-client.ts`. Client components only.
- **Owner-write** build-tx-then-sign via `_hooks/use-build-and-sign-tx.ts`: backend returns `{ txBase64 }`, Phantom signs, web3.js submits.
- **On-chain reads** (Vault `deployed_amount`, USDC ATA balance) go directly through web3.js Connection no backend round-trip needed for plain reads.

## Layout

```
app/
  layout.tsx                  root: <Providers>
  providers.tsx               ConnectionProvider + WalletProvider + WalletModalProvider + SWRConfig
  page.tsx                    sign-in landing
  sign-in.tsx                 Phantom SIWS flow
  api/auth/...                SIWS proxy + JWT cookie management

  dashboard/
    layout.tsx                server-gated; verifies klink_session cookie; mounts sidebar + topbar + Toaster
    page.tsx                  Overview (3-col: settings, balance+QR, activity rail)
    sign-out-button.tsx
    _components/              sidebar, topbar, backend-pending, stat-card, balance-card, activity-rail, create-wallet-cta
    sessions/                 list + new modal + api-key reveal + revoke
      [id]/                   allowlist editor (recipients + bitmap + URL + time window)
    yield/page.tsx
    fund/page.tsx
    audit/page.tsx
    settings/page.tsx

  _components/ui/             shadcn primitives (button, card, dialog, input, label, slider, tabs, table, skeleton, badge, toast, toaster)

_hooks/
  use-build-and-sign-tx.ts    Phantom roundtrip
  use-wallet.ts               SWR /v1/wallet
  use-sessions.ts             SWR /v1/sessions
  use-session.ts              SWR /v1/sessions/:id
  use-audit.ts                SWR-Infinite /v1/audit
  use-on-chain-vault.ts       direct RPC for liquid + deployed

lib/
  api-client.ts               fetch wrapper + ApiError + swrFetcher
  schemas.ts                  zod schemas for v1 API responses
  formatters.ts               USDC / pubkey / timestamp helpers
  on-chain.ts                 Vault Borsh decoder + RPC helpers
  cn.ts                       clsx + tailwind-merge
  constants.ts                program id, USDC mint, instruction bits
  auth-config.ts              JWT secret + cookie config (server-only)
  jwt.ts                      verifyKlinkJwt
  siws-message.ts             siwsMessage(nonce)  mirrors apps/api/src/auth/siws.ts
  siws-proxy.ts               proxy logic shared by route handlers + tests

tests/
  unit/                       bun:test  formatters, schemas, on-chain, hook schema
  helpers/                    test-wallet, mock-phantom, api-server (mock backend stub)
  e2e.puppeteer.ts            full smoke walkthrough with real JWT + mock API
```

## Environment

| Var                            | Where           | Purpose                                                                                          |
| ------------------------------ | --------------- | ------------------------------------------------------------------------------------------------ |
| `NEXT_PUBLIC_SOLANA_RPC_URL`   | client + server | RPC for `ConnectionProvider`. Defaults to devnet.                                                |
| `NEXT_PUBLIC_KLINK_PROGRAM_ID` | client + server | Anchor program id. Devnet pending T-113.                                                         |
| `NEXT_PUBLIC_USDC_MINT`        | client + server | Devnet USDC mint by default.                                                                     |
| `NEXT_PUBLIC_API_BASE_URL`     | client + server | Backend API root.                                                                                |
| `KLINK_API_URL`                | server only     | Server-side override (preferred over public var when set).                                       |
| `NEXT_PUBLIC_DEVTOOLS`         | client          | `1` to enable `/dashboard/_devtools` for agent-side testing. Default `0`.                        |
| `JWT_SECRET`                   | server only     | Must match `apps/api`. Used to verify the SIWS-issued JWT in the cookie.                         |
| `KLINK_COOKIE_SECURE`          | server only     | `true` / `false` to force the Secure flag on `klink_session`. Defaults to `NODE_ENV=production`. |

`NEXT_PUBLIC_*` is exposed to the browser bundle. Never put a secret behind that prefix.

## Auth flow

```
[browser]                                 [next route handler]                 [api]
 connect Phantom
 POST /api/auth/siws/nonce ───────────────▶ proxyNonce ─────────────────────▶ POST /v1/auth/siws/nonce
                                            ◀────────────────────────────── { nonce }
 ◀── { nonce }
 phantom.signMessage("Sign in to klink: <nonce>")
 POST /api/auth/siws { pubkey, signature, nonce }
                                            proxySiws ────────────────────▶ POST /v1/auth/siws
                                            ◀────────────────────────── { token, userId }
                                            Set-Cookie: klink_session=<token>; HttpOnly; SameSite=Lax
 ◀── { userId }                              (token NEVER returned in body)
 router.push("/dashboard")
```
