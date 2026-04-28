# @klink/web

Next.js 14 (app router) dashboard for the human owner — wallet creation, session management, allowlist editor, audit log, yield UI, Dodo fund flow. See [design spec §4.4](../../docs/specs/2026-04-28-agent-wallet-design.md) for the user journey.

## Status

Scaffold (T-301): Next 14 + Tailwind 3 + Phantom wallet adapter wired.

Real flows land in:

- T-302 — Phantom SIWS sign-in
- T-303 — Wallet creation flow
- T-304 — Session list + create + revoke
- T-305 — Allowlist editor
- T-306 — Audit log viewer
- T-307 — Yield UI
- T-308 — Dodo fund flow

## Develop

```bash
bun install                       # at repo root
cp apps/web/.env.example apps/web/.env.local
bun --filter @klink/web dev       # http://localhost:3030
```

The api dev server runs on `:3000`; web on `:3030`.

## Layout

```
app/
  layout.tsx          root layout, mounts <Providers>
  providers.tsx       client wrapper: ConnectionProvider + WalletProvider + WalletModalProvider
  connect-button.tsx  client wrapper around WalletMultiButton
  page.tsx            placeholder home page
  globals.css         Tailwind directives
```

## Environment

| Var | Purpose |
|---|---|
| `NEXT_PUBLIC_SOLANA_RPC_URL` | RPC endpoint used by `ConnectionProvider`. Defaults to `clusterApiUrl("devnet")` if unset. |
| `NEXT_PUBLIC_API_BASE_URL` | Backend API root — read by T-302+ flows. |

`NEXT_PUBLIC_*` is exposed to the browser bundle. Never put a secret behind that prefix.
