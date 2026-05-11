---
icon: rocket
title: Quickstart
description: Give your AI agent a Solana wallet under policy you control, in about five minutes of dashboard clicks.
---

# Quickstart: Give your agent a wallet

In about **five minutes** you'll go from a fresh Phantom wallet to **"my agent just paid for an HTTP service under a policy I configured."** No backend to run, no custodial signup. Just five clicks on the dashboard at [`klinkdotfun.vercel.app`](https://klinkdotfun.vercel.app), then one line you paste to your agent.

> **The whole on-ramp in one paste, once you have an API key:**
> ```
> Read https://klinkdotfun.vercel.app/skill.md and follow the instructions
> to set up the Klink agent wallet. I'll give you the API key when you ask.
> ```
> Paste that to your agent (Claude / Cursor / your own LLM script). It reads the skill, asks for your key, saves it, runs a sanity-check curl, and from there it knows how to spend USDC, pay 402/MPP services, and stay inside the policy you set. Steps 1-4 below get you the key.

> **Beta.** Klink is on Solana **devnet** today. Mainnet ships after the program audit; see [Roadmap](../resources/roadmap.md).

## What you'll need

Three things, all free, ~3 minutes to gather:

1. **[Phantom](https://phantom.app/)** browser extension, switched to **Testnet Mode** (Phantom calls Solana devnet "testnet"). Your owner key never leaves the extension.
2. **A little devnet SOL** for transaction fees (~0.05 SOL is plenty). Grab some from any [Solana faucet](https://faucet.solana.com/).
3. **A little devnet USDC** in the same wallet. The dashboard's Fund page can help if you don't already have some.

You do **not** need a klink account, an API key from us, or to run any code locally.

## Step 1: Open the dashboard and sign in

Visit [**klinkdotfun.vercel.app**](https://klinkdotfun.vercel.app). A sign-in gate appears over the dashboard:

> *"Connect your Solana wallet and approve the sign-in message to access your agent vault."*

Click **Select Wallet** → pick Phantom → approve the connection. Phantom then pops a sign-in message; sign it. This is **Sign-In With Solana**, no email, no password, no account to create. The signature proves you control the wallet; the dashboard binds that proof to a session cookie. The owner key itself never leaves Phantom.

> If sign-in stalls: check Phantom is on **Testnet** (top-right network selector). Klink's beta is devnet-only; signing on mainnet won't reach the right backend.

## Step 2: Create your klink wallet

Land on the Overview page. If you don't already have a vault, you'll see a **Create wallet** button.

Click it. The dashboard asks Phantom to sign one transaction (`init_vault`). The owner stays your Phantom; the backend never sees the owner key. Within a few seconds the Overview page shows three things to remember:

| | What it is |
|---|---|
| **Vault PDA** | The on-chain account that holds your USDC. Program-derived, only movable by klink's program under policy. |
| **USDC address** | Your vault's USDC token account. Send devnet USDC here to fund the vault. |
| **Max Deployed** | Default 80%. Caps how much of your vault can be deployed to yield protocols at once. Configurable from this card. |

The wallet card now exists, on-chain, owned by you alone. The backend cannot move funds without your or your agent's signature.

## Step 3: Fund the wallet

Click **Fund** in the left sidebar. Three ways to fund, pick whichever is easiest:

1. **From your connected wallet**: type a USDC amount, sign in Phantom. USDC moves directly from your Phantom's USDC balance into the vault. Free apart from gas.
2. **Direct deposit (QR code)**: copy the vault's USDC address or scan the QR with another wallet. Useful if your USDC is on a different wallet than the one you signed in with.
3. **Pay with card (Dodo)**: fiat → USDC, settled into your vault. Useful if you don't have devnet USDC handy. (Test cards only on devnet.)

Whichever path you pick, the **liquid** balance on Overview updates within ~10s of the on-chain confirmation.

> **How much to fund?** For a first run, 1–2 USDC is enough. The agent paying our test service costs $0.01 per call.

## Step 4: Create a session and copy the agent's API key

Click **Sessions** in the sidebar → click **New session** in the top-right.

A modal asks for the session's policy. These are the rails your agent runs on; the on-chain program enforces them on every spend.

| Field | What it means | Sane default for first run |
|---|---|---|
| **Label** | Just a name for you | `dev-agent` |
| **Max per tx** | Hard ceiling per single spend, in USDC base units (6 decimals) | `1000000` = 1 USDC |
| **Daily cap** | Rolling 24h cumulative ceiling | `10000000` = 10 USDC |
| **Expiry** | Unix timestamp; `0` = never expires | `0` |
| **Allowed recipients** | Space-separated base58 pubkeys the agent may pay | Include your own pubkey + the test recipient `81eM3oPR1fUJSsFhNm6G51W4jwE2HondS2kjBmcxFcJ2` (the demo service in Step 5) |
| **Allowed instructions** | Tick `transfer_usdc` for the demo; `kamino_deposit` / `kamino_withdraw` for yield | `transfer_usdc` only |

Click **Create**. Phantom signs one transaction (`add_session`) that registers the policy on-chain.

When the tx confirms, the dashboard shows the **API key once**:

```
klink_dev_AbCd1234XyZ_...
```

**Copy it now.** It's hashed at rest; you'll never see it again. (If you lose it, just create a new session, old one stays revocable.)

Save it where your agent can read it:

```bash
export AGENT_API_KEY="klink_dev_AbCd1234XyZ_..."
```

## Step 5: Connect your agent

You now have everything your agent needs: an API key bounded by the policy you set. The fastest way to hand it off is to **tell the agent to read the skill and figure the rest out itself**.

**Paste this to your agent** (Claude, Cursor, ChatGPT with tool use, your own LLM script, anything that can fetch a URL and run shell):

```
Read https://klinkdotfun.vercel.app/skill.md and follow the instructions
to set up the Klink agent wallet. I'll give you the API key when you ask.
```

The agent reads SKILL.md, sees it needs a key, asks you for the `klink_dev_…` token you copied in Step 4, saves it (env var or `~/.config/klink/credentials.json`), and runs the verification curl. From that point on it knows how to spend, how to pay 402/MPP services, the full error taxonomy, and what it can and can't do.

### Or use the API directly

If you'd rather drive the API yourself, here's a working call that pays a real MPP service (`service01-kep9.onrender.com/echo`, charges 0.01 USDC per call):

```bash
export AGENT_API_KEY="klink_dev_..."   # the key from Step 4

curl -X POST -H "Authorization: Bearer $AGENT_API_KEY" \
  -H "content-type: application/json" \
  -d '{
    "url": "https://service01-kep9.onrender.com/echo",
    "max_amount": 100000,
    "method": "GET"
  }' \
  https://klink-api.onrender.com/v1/spend/mpp
```

`max_amount: 100000` is **0.10 USDC**, your agent refuses to pay more than this even if the merchant quotes higher. The actual price (0.01 USDC) is well under, so the call goes through. Expected response:

```json
{
  "message": "Paid! 🎉",
  "timestamp": 1778474176960,
  "requestId": "67c5d65e-03c8-4a68-ac28-ae2ee0393748",
  "info": { "thisIs": "a research mock service", "purpose": "..." }
}
```

Response headers carry the on-chain proof:
- `x-tx-signature: XDPFH7Z3uZ5djZBoidUr2kaGCnqzucojRyxwAAL…`: the Solana tx your agent's session keypair just signed
- `payment-receipt: eyJtZXRob2Q…`: base64 receipt issued by the merchant after they verified the on-chain payment

That's the whole loop: klink probes the service, sees the 402 challenge, signs and submits a TransferChecked tx using the merchant's required blockhash, retries the service with the proof, forwards the merchant's response back. One HTTP call from your agent's perspective. Subject to **every** policy you set in Step 4.

> **What if the recipient's wallet has never received USDC before?** klink auto-creates the recipient's USDC ATA on the fly; the treasury covers the ~0.002 SOL rent. Fresh wallets just work.

> **Want to pay an arbitrary recipient directly (no service)?** Use `POST /v1/spend/transfer` with `{ "recipient": "<base58>", "amount": <base-units> }`. See [Agent Skill](../skill.md) for the full reference.

## What just happened (audit)

Click **Audit log** in the sidebar. Every allow + deny is there with:

- Timestamp + decision (`allow` / `deny`)
- Amount + recipient
- The on-chain transaction signature, linked to a Solana explorer so you can verify byte-for-byte what hit the chain
- For denies: the policy reason (`RECIPIENT_NOT_ALLOWED`, `QUOTED_OVER_MAX`, `INSUFFICIENT_LIQUID`, etc.)

This is the second half of klink's promise: not just policy enforcement, but a clean ledger of every decision the backend made on your agent's behalf. If anything ever looks wrong, the row points at the exact on-chain tx.

## Next steps

- **[Agent Skill](../skill.md)**: the canonical reference for what an agent can do, all spend endpoints, the full HTTP error taxonomy. Hand this to any AI agent and it can integrate without further docs.
- **[Sessions](../concepts/sessions.md)**: how to design caps, allowlists, expiries, and the instruction bitmap for production-grade policy.
- **[Audit trail](../concepts/audit-trail.md)**: what's recorded, why both allow + deny rows matter, exporting for compliance.

You're done. Your agent now has a Solana wallet it can spend from, bounded by rails you set and visible in real time.
