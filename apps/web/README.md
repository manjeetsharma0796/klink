# @klink/web

Next.js 14 (app router) dashboard for the human owner — wallet creation, session management, allowlist editor, audit log, yield UI, Dodo fund flow. See [design spec §4.4](../../docs/specs/2026-04-28-agent-wallet-design.md) for the user journey.

## Status

Phantom SIWS sign-in lives (T-302). Real flows land in:

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
  layout.tsx                  root layout, mounts <Providers>
  providers.tsx               client: ConnectionProvider + WalletProvider + WalletModalProvider
  page.tsx                    home — redirects to /dashboard if signed in, else <SignIn>
  sign-in.tsx                 client: connect → fetch nonce → Phantom signMessage → exchange → cookie
  dashboard/page.tsx          server-gated; reads klink_session cookie, verifies JWT
  dashboard/sign-out-button.tsx
  api/auth/siws/nonce/route.ts  POST — proxies backend nonce
  api/auth/siws/route.ts        POST — proxies backend verify, sets httpOnly klink_session cookie
  api/auth/me/route.ts          GET  — returns the current session if cookie verifies
  api/auth/logout/route.ts      POST — clears the cookie
lib/
  auth-config.ts              cookie + api base + JWT secret config
  jwt.ts                      verifyKlinkJwt(token)
  siws-message.ts             siwsMessage(nonce) — must mirror apps/api/src/auth/siws.ts
  siws-proxy.ts               pure proxy logic shared by route handlers + tests
```

## Environment

| Var | Where | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SOLANA_RPC_URL` | client + server | RPC for `ConnectionProvider`. Defaults to devnet. |
| `NEXT_PUBLIC_API_BASE_URL` | client + server | Backend API root. Public fallback for `KLINK_API_URL`. |
| `KLINK_API_URL` | server only | Server-side override for the backend URL (preferred over the public var when set). |
| `JWT_SECRET` | server only | Must match `apps/api`. Used to verify the SIWS-issued JWT in the cookie. |
| `KLINK_COOKIE_SECURE` | server only | `true` / `false` to force the Secure flag on `klink_session`. Defaults to `NODE_ENV=production`. |

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
