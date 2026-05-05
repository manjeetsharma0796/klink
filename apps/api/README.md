# `@klink/api`

Backend HTTP API for klink. Bun + TypeScript + Express + Drizzle + Postgres + Redis. Implements the `/v1/*` surface from [design spec §3.2](../../docs/specs/2026-04-28-agent-wallet-design.md).

## Run

From the repo root:

```bash
bun install
cp apps/api/.env.example apps/api/.env
# edit DATABASE_URL to point at your dev Postgres (T-402)
bun --filter @klink/api dev
```

`/health` returns `{"ok":true}` at <http://localhost:3000/health>.

## Test

```bash
bun --filter @klink/api test
```

## Structure

```
apps/api/
├── src/
│   ├── app.ts            Express app factory (importable for tests)
│   ├── index.ts          boot entry  calls createApp() and listens
│   └── db/
│       ├── client.ts     Drizzle client (postgres-js driver, lazy)
│       └── schema.ts     placeholder; real schema lands in T-202
├── tests/
│   └── health.test.ts    smoke test for GET /health
├── drizzle.config.ts     drizzle-kit config
├── .env.example          env-var template (copy to .env)
├── package.json
└── tsconfig.json
```

## Status by task

- [x] **T-201** scaffold (this commit)
- [ ] T-202 Postgres schema (replaces `src/db/schema.ts`)
- [ ] T-203 SIWS auth (`/v1/auth/siws/nonce` + `/v1/auth/siws`)
- [ ] T-204 API-key middleware + bcrypt/argon2 hashing
- [ ] T-205..T-220 endpoint surface, off-chain policy, Dodo bridge, audit log
- [ ] (full list in [`TODO.md`](../../TODO.md) §2)
