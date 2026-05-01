---
title: Dev environment setup
purpose: Per-OS install commands for the toolchain every dev needs to run Klink locally
last_updated: 2026-05-02
---

# Dev environment

> **Aim:** in ~15 min from a clean shell, you can `bun --filter '*' test` green and submit a Solana tx to devnet.

## 1. Pinned versions

| Tool | Version | Why pinned |
|---|---|---|
| **Bun** | `latest` | **Mandated runtime + package manager + test runner for all JS/TS work** — replaces Node, pnpm, npm, yarn, vitest, ts-node. One binary. |
| Node | any current LTS (optional) | Not used directly; some tooling (e.g. some Anchor templates) expects `node` on `PATH`. Whatever you already have works. |
| Solana CLI | `3.1.x` (Agave) | matches Anchor 1.0; T-102 verified `anchor build` green on 3.1.13 |
| Anchor | `1.0.0` | T-102 found Anchor 0.30 doesn't build on modern Rust (proc-macro2 ≥ 1.0.80 dropped `Span::source_file`); 1.0 builds clean against Solana 3.x and current stable Rust |
| Rust | `stable` (latest at install time) | Anchor builds against stable |
| Postgres | `16.x` | Drizzle ORM target |
| Redis | `7.x` | nonce / rate-limit cache |

> **JS/TS rule:** all package management, test running, and dev scripts use `bun`. No `pnpm`, `npm`, `yarn`, or `vitest` invocations in committed code or scripts. Anchor `[scripts.test]` configures `bun` as the test runner.

## 2. Install commands (per OS)

### 2.1 Windows (recommended: WSL2 Ubuntu 22.04)

Native Windows works for `solana` and `anchor` builds, but `solana-test-validator` is unreliable on native Windows. **Use WSL2 unless you have a strong reason not to** — see `team-collaboration.md` §4 for why.

```bash
# Inside WSL2 Ubuntu — same toolchain as the Linux section
sudo apt update && sudo apt install -y build-essential pkg-config libssl-dev libudev-dev curl unzip
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
avm install 1.0.0 && avm use 1.0.0
curl -fsSL https://bun.sh/install | bash

# Postgres + Redis (local dev — production uses managed per T-402)
sudo apt install -y postgresql redis-server
sudo systemctl enable --now postgresql redis-server
```

If you really want Bun on native Windows (no WSL2), the PowerShell installer is:

```powershell
powershell -c "irm bun.sh/install.ps1 | iex"
```

Native-Windows dev is not officially supported for Anchor (`solana-test-validator` is unreliable, `cargo build-sbf` segfaults on some boxes). For Postgres on native Windows use the postgresql.org installer or Docker Desktop; for Redis use Docker Desktop (no official Redis Windows build).

### 2.2 macOS

```bash
brew install rustup-init && rustup-init -y
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
avm install 1.0.0 && avm use 1.0.0
brew install oven-sh/bun/bun

# Postgres + Redis (local dev)
brew install postgresql@16 redis
brew services start postgresql@16
brew services start redis
```

### 2.3 Linux (Ubuntu / Debian — apt)

```bash
sudo apt update && sudo apt install -y build-essential pkg-config libssl-dev libudev-dev curl unzip
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
avm install 1.0.0 && avm use 1.0.0
curl -fsSL https://bun.sh/install | bash

# Postgres + Redis (local dev)
sudo apt install -y postgresql redis-server
sudo systemctl enable --now postgresql redis-server
```

### 2.4 Linux (Fedora / RHEL — dnf)

```bash
sudo dnf install -y gcc gcc-c++ make pkgconfig openssl-devel systemd-devel curl git unzip
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
avm install 1.0.0 && avm use 1.0.0
curl -fsSL https://bun.sh/install | bash

# Postgres + Redis (local dev)
sudo dnf install -y postgresql-server postgresql-contrib redis
sudo postgresql-setup --initdb
sudo systemctl enable --now postgresql redis
```

## 3. Verify

```bash
bun --version      # 1.3.11
solana --version   # solana-cli 3.1.x
anchor --version   # anchor-cli 1.0.0
rustc --version    # 1.9x.x stable
psql --version     # psql 14+ (any current major)
redis-cli ping     # PONG
```

If any of these fails, find your row in §6 attestation table and either fix locally or ping the team channel before claiming a task that needs the missing tool.

## 4. Local Postgres bootstrap

Production points at managed Postgres (T-402, Neon). For offline / unit-test work, point at a local instance instead — same schema, same Drizzle migrations, no network.

```bash
# 4.1 Create the local klink role + DB (paste as-is; works on apt, dnf, brew)
sudo -u postgres psql <<'SQL'
CREATE ROLE klink WITH LOGIN PASSWORD 'klink';
CREATE DATABASE klink_dev OWNER klink;
GRANT ALL PRIVILEGES ON DATABASE klink_dev TO klink;
SQL

# 4.2 Verify connection
PGPASSWORD=klink psql -h localhost -U klink -d klink_dev -c '\conninfo'

# 4.3 Run migrations (after the clone-and-install in §5)
cd apps/api && bun run db:migrate
```

Redis local default (`redis://localhost:6379`) needs no setup beyond `redis-cli ping` returning `PONG`.

## 5. Clone + install + run

```bash
git clone https://github.com/manjeetsharma0796/klink.git
cd klink
bun install                              # one install at the workspace root

# Backend env
cp apps/api/.env.example apps/api/.env
# Edit apps/api/.env and fill in:
#   SESSION_SECRET_MASTER_KEY=$(openssl rand -hex 32)
#   JWT_SECRET=$(openssl rand -hex 32)
#   REDIS_URL=redis://localhost:6379
#   SOLANA_RPC_URL=https://api.devnet.solana.com
# DATABASE_URL default already targets the role created in §4.1.

# Sanity (run all three before opening any PR)
bun --filter '*' typecheck
bun --filter '*' test
bun run lint

# Run the API
bun --filter @klink/api dev   # http://localhost:3000
```

## 6. Setup attestation

Each dev appends a row after their setup verifies. This row is the artifact that closes T-101 for that dev.

| Dev | OS / Shell | Solana | Anchor | Bun | Postgres | Redis | Date | Notes |
|---|---|---|---|---|---|---|---|---|
| @Jishnu | Windows native (bash via Git for Windows) | n/a (role-scoped — backend integration only) | n/a (role-scoped) | `1.3.11` | Neon (managed) | Upstash (managed) | 2026-05-02 | Backend-only role per [`CLAUDE.md`](../../CLAUDE.md); Bun + Neon Postgres + Upstash Redis confirmed; T-201..T-224 + T-401/T-402/T-505 done. Will run integration tests after Anchor program is published to devnet by another dev. |
| _(pending — @Manjeet)_ | | | | | | | | |
| @Prithwish | Ubuntu 24.04 / bash | `3.1.13` | `1.0.0` | `1.3.6` | _(not run locally — uses managed)_ | _(not run locally — uses managed)_ | 2026-04-28 | T-102 outcome: Anchor 0.30 didn't build on stable Rust 1.93 (`proc-macro2::Span::source_file()` removed in proc-macro2 ≥ 1.0.80); switched the project pin to Anchor 1.0, which builds clean against Solana 3.1.13. `0.30.0`/`0.30.1` remain installed under `avm` for archaeology. Rust `1.93.0`. |
| _(pending — @Manish)_ | | | | | | | | |
| _(pending — @Mouli)_ | | | | | | | | |

## 7. Common gotchas

Collected from setup attempts. Add new ones as you hit them.

- **Anchor 0.30 ↛ stable Rust 1.93+** (resolved by T-102 — pin moved to Anchor 1.0): `anchor-syn` 0.30.x calls `proc_macro2::Span::source_file()`, which proc-macro2 ≥ 1.0.80 removed (it was a nightly-only polyfill). Modern dependency graphs lock proc-macro2 well past 1.0.80, so `anchor build` errors with `E0599: no method named 'source_file'`. Workarounds tried and rejected: `[patch.crates-io]` with crates.io source (cargo refuses — same source), `cargo update -p proc-macro2 --precise 1.0.79` (cascading conflict via quote → ahash → borsh), `RUSTC_BOOTSTRAP=1` (method genuinely doesn't exist), git-source patch (supply-chain risk). T-102 picked the upstream-aligned fix: bump to Anchor 1.0, which builds clean against Solana 3.x + Rust 1.93.
- **Windows native + `solana-test-validator`**: known to hang on first run; switch to WSL2.
- **macOS Apple Silicon**: Anchor build occasionally fails on `aarch64` toolchain mismatch; `rustup target add x86_64-apple-darwin` works around.
- **First `cargo install avm`** on a fresh box: takes ~10 min. Don't kill it.
- **Bun on native Windows**: works since 2024 but is younger than the macOS/Linux paths; if you hit weird issues, fall back to WSL2.
