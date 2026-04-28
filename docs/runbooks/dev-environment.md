---
title: Dev environment setup
purpose: Per-OS install commands for the toolchain every dev needs to run Klink locally
last_updated: 2026-04-28
---

# Dev environment

> **Status:** stub. Commands below are seed templates — claim T-501 to verify each row on your OS, then update the attestation table in §4 once your setup is green.

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
# Inside WSL2 Ubuntu — same commands as the Linux section
sudo apt update && sudo apt install -y build-essential pkg-config libssl-dev libudev-dev curl unzip
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
avm install 1.0.0 && avm use 1.0.0
curl -fsSL https://bun.sh/install | bash
```

If you really want Bun on native Windows (no WSL2), the PowerShell installer is:

```powershell
powershell -c "irm bun.sh/install.ps1 | iex"
```

### 2.2 macOS

```bash
brew install rustup-init && rustup-init -y
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
avm install 1.0.0 && avm use 1.0.0
brew install oven-sh/bun/bun
```

### 2.3 Linux (Ubuntu/Debian)

```bash
sudo apt update && sudo apt install -y build-essential pkg-config libssl-dev libudev-dev curl unzip
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
avm install 1.0.0 && avm use 1.0.0
curl -fsSL https://bun.sh/install | bash
```

## 3. Verify

```bash
bun --version      # 1.3.x or newer
solana --version   # solana-cli 3.1.x
anchor --version   # anchor-cli 1.0.0
rustc --version    # 1.9x.x stable
```

If all four print versions matching §1, your setup is green for Anchor + JS/TS work. (Postgres + Redis are typically remote dev DBs — see T-402 for hosting.)

## 4. Setup attestation

Each dev appends a row after their setup verifies. This row is the artifact that closes T-101 for that dev.

| Dev | OS / Shell | Solana | Anchor | Bun | Date | Notes |
|---|---|---|---|---|---|---|
| @Jishnu | Windows native | n/a (role-scoped) | n/a (role-scoped) | `1.3.11` | 2026-04-28 | backend-only; Bun + Neon Postgres + Upstash Redis confirmed; T-201..T-220 + T-401/T-402/T-505 done. Will do integration after Anchor program is published by another dev. |
| _(pending — Manjeet)_ | | | | | | |
| @Pritwish | Ubuntu 24.04 / bash | `3.1.13` | `1.0.0` | `1.3.6` | 2026-04-28 | T-102 outcome: Anchor 0.30 didn't build on stable Rust 1.93 (`proc-macro2::Span::source_file()` removed in proc-macro2 ≥ 1.0.80); switched the project pin to Anchor 1.0, which builds clean against Solana 3.1.13. `0.30.0`/`0.30.1` remain installed under `avm` for archaeology. Rust `1.93.0`. |
| _(pending — Mouli)_ | | | | | | |

## 5. Common gotchas

> **TODO** (T-501): collect from each dev's setup attempt. Seed entries below are unverified.

- **Anchor 0.30 ↛ stable Rust 1.93+** (resolved by T-102 — pin moved to Anchor 1.0): `anchor-syn` 0.30.x calls `proc_macro2::Span::source_file()`, which proc-macro2 ≥ 1.0.80 removed (it was a nightly-only polyfill). Modern dependency graphs lock proc-macro2 well past 1.0.80, so `anchor build` errors with `E0599: no method named 'source_file'`. Workarounds tried and rejected: `[patch.crates-io]` with crates.io source (cargo refuses — same source), `cargo update -p proc-macro2 --precise 1.0.79` (cascading conflict via quote → ahash → borsh), `RUSTC_BOOTSTRAP=1` (method genuinely doesn't exist), git-source patch (supply-chain risk). T-102 picked the upstream-aligned fix: bump to Anchor 1.0, which builds clean against Solana 3.x + Rust 1.93.
- **Windows native + `solana-test-validator`**: known to hang on first run; switch to WSL2.
- **macOS Apple Silicon**: Anchor build occasionally fails on `aarch64` toolchain mismatch; `rustup target add x86_64-apple-darwin` works around.
- **First `cargo install avm`** on a fresh box: takes ~10 min. Don't kill it.
- **Bun on native Windows**: works since 2024 but is younger than the macOS/Linux paths; if you hit weird issues, fall back to WSL2.
