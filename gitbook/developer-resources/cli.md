---
icon: terminal
title: CLI
description: Command-line tools for managing Klink wallets and sessions from your terminal
---

# CLI

A `klink` command-line tool is on the roadmap.

The intended shape:

```bash
# Authenticate (delegates to your browser wallet)
klink login

# Inspect a wallet
klink wallet show

# Create a session for an agent
klink session create --cap 5 --daily-cap 50 --recipient <pubkey>

# Watch the audit log live
klink audit tail
```

## Status

🛠️ **Coming soon.** No published binary yet.

For now, every operation the CLI will offer is available via the HTTP API and the dashboard:

- **Wallet inspection / management** → dashboard + `GET /v1/wallet`
- **Session creation / revocation** → dashboard (Phantom signs)
- **Audit review** → dashboard or `GET /v1/audit`
- **Spend / yield** → SDK (coming soon) or direct `curl` against the HTTP API

See the [Quickstart](../getting-started/quickstart.md) for the current path.
