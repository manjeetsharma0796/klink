---
icon: rocket
title: Quickstart
description: Stand up a Klink wallet for an AI agent in about ten minutes, sign in, create a vault, mint an agent key, watch a spend land
---

# Quickstart

Goal: in one sitting, take a fresh Phantom wallet from zero to "an agent is spending USDC under policy I configured, and every action is auditable."

## What you'll need

1. **[Phantom](https://phantom.app/)** browser extension
2. **~0.05 devnet SOL** on the address Phantom shows you (any [Solana faucet](https://faucet.solana.com/) works)
3. **A few cents of devnet USDC** at the same address (faucets exist; or paste any devnet SPL-token mint)
4. A terminal with `curl` and `node` ≥ 20 (or `bun`)

> **Beta note.** Klink is currently devnet-only. The HTTP API is live at `https://klink-api.onrender.com` and is the endpoint every example below uses.

## Step 1: Sign in (Sign-In With Solana)

The dashboard handles this two-step flow for you behind a single "Connect Phantom" button. The same flow works directly against the API for tooling:

```bash
# Get a one-time nonce
curl -s -X POST -H "content-type: application/json" \
  -d '{}' \
  https://klink-api.onrender.com/v1/auth/siws/nonce
```

Response:
```json
{ "nonce": "593d04e5aefe01ed…" }
```

You sign a message containing the nonce with Phantom (Phantom prompts the human; the SDK and dashboard handle the message construction), then exchange the signature for a session JWT:

```bash
curl -s -X POST -H "content-type: application/json" \
  -d '{
    "pubkey": "<your-phantom-base58-pubkey>",
    "signature": "<base64-signature>",
    "nonce": "593d04e5aefe01ed…"
  }' \
  https://klink-api.onrender.com/v1/auth/siws \
  -c klink-cookies.txt
```

Success returns a `Set-Cookie: klink_session=…` cookie scoped to subsequent dashboard calls.

> **Tip.** For a guided flow with a UI button instead of constructing the signature yourself, use the dashboard. **A public dashboard URL is launching soon**, until then, run the dashboard locally (`bun run dev` in `apps/web`) and visit `http://localhost:3030`.

## Step 2: Create the vault

The dashboard's "Create Wallet" button calls `POST /v1/wallet` and walks Phantom through signing the returned transaction. Manual equivalent:

```bash
curl -s -X POST -H "content-type: application/json" \
  -b klink-cookies.txt \
  -d '{ "max_deployed_fraction_bp": 8000 }' \
  https://klink-api.onrender.com/v1/wallet
```

Response:
```json
{
  "txBase64": "AQAA…<unsigned-transaction>…",
  "vaultPda": "<base58>",
  "vaultUsdcAta": "<base58>"
}
```

The transaction is unsigned. Phantom signs it client-side, the backend never sees the owner key. After Phantom submits, you have:

- A **vault PDA** that the program owns
- A **USDC ATA** at that PDA, fund this address to put USDC under policy

Send some USDC to `vaultUsdcAta` to fund the vault.

## Step 3: Create an agent session

The session is the on-chain delegation: it sets caps, recipient allowlist, expiry, and a bitmap of which spending instructions the agent may invoke.

```bash
curl -s -X POST -H "content-type: application/json" \
  -b klink-cookies.txt \
  -d '{
    "wallet_id": "<vault-id-from-step-2>",
    "max_per_tx": 1000000,
    "daily_cap": 50000000,
    "expiry": 1735689600,
    "allowed_recipients": ["<base58-recipient>"],
    "allowed_instructions": 1
  }' \
  https://klink-api.onrender.com/v1/session
```

The dashboard returns this same payload via a form. The response includes the **plaintext API key, shown once**:

```json
{
  "session_id": "<uuid>",
  "session_pda": "<base58>",
  "api_key": "klink_dev_xxxxxxxx…",
  "txBase64": "<sign-and-submit-via-Phantom>"
}
```

Save the `api_key` somewhere your agent can read it (env var). **You will never see it again, it's hashed at rest.** You can rotate it later via the dashboard.

After Phantom signs and submits the returned transaction, the session is live on-chain and the API key works.

## Step 4: Have your agent spend

This is the part your agent code does at runtime. Direct USDC transfer to a pre-approved recipient:

```bash
export AGENT_API_KEY="klink_dev_xxxxxxxx…"

curl -s -X POST -H "Authorization: Bearer $AGENT_API_KEY" \
  -H "content-type: application/json" \
  -d '{
    "recipient": "<base58-recipient>",
    "amount": 500000
  }' \
  https://klink-api.onrender.com/v1/spend/transfer
```

Response:
```json
{
  "tx_signature": "5K3…",
  "status": "confirmed"
}
```

`amount` is in USDC base units (6 decimals, `1_000_000` = 1 USDC). The backend co-signs with the session keypair and submits; the on-chain program reverts if you exceed `max_per_tx`, the daily cap, the recipient allowlist, or the time-of-day window.

For paid HTTP services that speak the 402-Payment-Required pattern, use `POST /v1/spend/sign-payment` (sign-only) or `POST /v1/spend/service` (full proxy). See the [Agent Skill](../skill.md) page for ready-to-paste examples.

## Step 5: Audit

Every allow and deny is recorded with the on-chain transaction signature for cross-reference:

```bash
curl -s -b klink-cookies.txt \
  https://klink-api.onrender.com/v1/audit
```

Response:
```json
{
  "items": [
    {
      "id": "<uuid>",
      "wallet_id": "<uuid>",
      "session_id": "<uuid>",
      "decision": "allow",
      "amount": "500000",
      "recipient": "<base58>",
      "tx_signature": "5K3…",
      "created_at": "2026-05-03T14:30:12Z"
    }
  ],
  "next_cursor": null
}
```

The same view is available in the dashboard with the on-chain signatures linked to a Solana explorer.

## Next steps

- **[Concepts → Overview](../concepts/overview.md)**: the mental model in 5 minutes
- **[Sessions](../concepts/sessions.md)**: how to design caps, allowlists, and the instruction bitmap
- **[Agent Skill](../skill.md)**: the canonical reference for what an agent can and cannot do, plus the full HTTP error taxonomy

<!--
The TypeScript SDK and CLI are coming soon. When they ship this Quickstart will gain a 5-line install + equivalent path. Until then, the curl examples above are the canonical integration surface.
-->
