---
title: Dev environment setup
purpose: Per-OS install commands for the toolchain every dev needs to run Klink locally
last_updated: 2026-04-28
---

# Dev environment

> **Status:** stub. Commands below are seed templates and have **not been verified end-to-end on every OS yet** — claim T-501 to verify each row, then update the attestation table in §3 once your setup is green.

## 1. Pinned versions

| Tool | Version | Why pinned |
|---|---|---|
| Solana CLI | `1.18.x` (latest patch) | Anchor 0.30 compatibility |
| Anchor | `0.30.0` | matches workspace target in `Anchor.toml` (T-102) |
| Rust | `stable` (latest at install time) | Anchor builds against stable |
| Node | `20.x` LTS | spec target for backend / SDK |
| pnpm | `9.x` | workspace + monorepo support |
| Postgres | `16.x` | Drizzle ORM target |
| Redis | `7.x` | nonce / rate-limit cache |

## 2. Install commands (per OS)

### 2.1 Windows (recommended: WSL2 Ubuntu 22.04)

Native Windows works for `solana` and `anchor` builds, but `solana-test-validator` is unreliable on native Windows. **Use WSL2 unless you have a strong reason not to** — runbook §4 of `team-collaboration.md` explains why.

```bash
# Inside WSL2 Ubuntu — same commands as the Linux section
sudo apt update && sudo apt install -y build-essential pkg-config libssl-dev libudev-dev curl
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
avm install 0.30.0 && avm use 0.30.0
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
corepack enable
```

### 2.2 macOS

```bash
brew install rustup-init && rustup-init -y
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
avm install 0.30.0 && avm use 0.30.0
brew install node@20 pnpm
```

### 2.3 Linux (Ubuntu/Debian)

```bash
sudo apt update && sudo apt install -y build-essential pkg-config libssl-dev libudev-dev curl
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
avm install 0.30.0 && avm use 0.30.0
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
corepack enable
```

## 3. Verify

```bash
solana --version    # solana-cli 1.18.x
anchor --version    # anchor-cli 0.30.0
rustc --version     # 1.7x.x or newer
node --version      # v20.x.x
pnpm --version      # 9.x
```

If all five print versions matching §1, your setup is green.

## 4. Setup attestation

Each dev appends a row after their setup verifies. This row is the artifact that closes T-101 for that dev.

| Dev | OS / Shell | Solana | Anchor | Date | Notes |
|---|---|---|---|---|---|
| _(pending — Jishnu)_ | _e.g. WSL2 Ubuntu 22.04_ | `1.18.x` | `0.30.0` | YYYY-MM-DD | _e.g. used WSL2; native Windows had test-validator issues_ |
| _(pending — Manjeet)_ | | | | | |
| _(pending — Pritwish)_ | _macOS_ | | | | |
| _(pending — Mouli)_ | | | | | |

## 5. Common gotchas

> **TODO** (T-501): collect from each dev's setup attempt. Seed entries below are unverified.

- **Windows native + `solana-test-validator`**: known to hang on first run; switch to WSL2.
- **macOS Apple Silicon**: Anchor build occasionally fails on `aarch64` toolchain mismatch; `rustup target add x86_64-apple-darwin` works around.
- **First `cargo install avm`** on a fresh box: takes ~10 min. Don't kill it.
