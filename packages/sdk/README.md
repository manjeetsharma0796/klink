# `@klink/sdk`

Typed TypeScript client for the Klink Agent Wallet API. Wraps every agent-authenticated endpoint under `/v1/spend/*` and `/v1/yield/*`. Zero runtime deps.

> **Audience:** AI-agent developers shipping code that spends from a Klink-managed vault. For the dashboard / SIWS owner flows, hit the API directly — those are session-authenticated, not API-key-authenticated, and intentionally out of scope here.

For background on the on-chain wallet model and why agents only see a slice of it, read [`docs/specs/2026-04-28-agent-wallet-design.md`](../../docs/specs/2026-04-28-agent-wallet-design.md). For the full HTTP surface read [`docs/architecture/api-surface.md`](../../docs/architecture/api-surface.md).

---

## Install

This package is a Bun workspace member, not yet published to npm. From inside the monorepo:

```ts
import { KlinkClient } from "@klink/sdk";
```

External consumers can vendor the three source files (`src/client.ts`, `src/types.ts`, `src/index.ts`) — no transitive deps to satisfy.

## Quickstart

```ts
import { KlinkClient } from "@klink/sdk";

const klink = new KlinkClient({
  baseUrl: "https://klink-api.onrender.com",   // or http://localhost:3000 in dev
  apiKey: process.env.KLINK_API_KEY!,           // generate one in the dashboard
});

// Sanity check — read-only, never costs anything.
const position = await klink.yieldPosition();
console.log(`vault balance: ${position.total_balance} USDC base units`);
```

Every method returns the parsed JSON body on 2xx and throws [`KlinkApiError`](#error-handling) on non-2xx.

## Authentication

The constructor takes a single API key as a bearer token. Generate one from the dashboard's Settings page — it scopes to one wallet and one session, with whatever spend caps and time windows the owner attached when creating the session.

The SDK sends it as `Authorization: Bearer <key>` on every request. Don't log it. Don't commit it. If a key leaks, the wallet owner can revoke it from the dashboard — agent-side code only needs to handle the resulting `401`.

## API

### `spendTransfer({ recipient, amount, memo? })`

Direct USDC transfer from the agent-vault to an arbitrary Solana address. `amount` is in USDC base units (1 USDC = 1_000_000).

```ts
const res = await klink.spendTransfer({
  recipient: "9muAwR8a4LEgFGLNPfoUHhJrfLmtkXFBvpBQCx2GLVTU",
  amount: 5_000_000, // 5 USDC
  memo: "ref-2026-05-02-001",
});
// → { tx_signature: "5q...", status: "confirmed" }
```

Reverts at the on-chain `transfer_usdc` instruction get surfaced as `403` with `error: "spend_denied"` and `detail: ON_CHAIN_REVERT: <code>`.

### `spendSignPayment({ url, recipient, amount, payment_id? })`

Pay a service that returns an HTTP 402 with `{ amount, recipient }`. The handler signs and submits the on-chain transfer, then returns a header you can forward to retry the original request.

```ts
const r = await klink.spendSignPayment({
  url: "https://api.example.com/expensive-thing",
  recipient: "9muAwR8...",
  amount: 1_000_000,
});

const final = await fetch("https://api.example.com/expensive-thing", {
  headers: { "x-payment-proof": r.payment_proof_header },
});
```

### `spendService({ slug, path, method?, body?, max_amount })`

Curated mpp.dev pass-through. The proxy handles the 402 dance for you against a pre-vetted upstream — you just hand it a slug and a quote ceiling.

```ts
const r = await klink.spendService({
  slug: "anthropic-claude",
  path: "/v1/messages",
  method: "POST",
  body: { model: "claude-haiku-4.5", messages: [/* ... */] },
  max_amount: 10_000, // 0.01 USDC ceiling
});

if (r.status === 200) {
  const upstream = JSON.parse(r.body);
  console.log("paid", r.tx_signature, "got", upstream);
}
```

If the upstream's quoted amount exceeds `max_amount`, the call returns `403` with `error: "quote_exceeds_max"`.

> Beta caveat: as of 2026-05-02 the `service_catalog` table on prod has zero `enabled=true` rows (T-234 in flight). Every slug currently 404s. Dev parity: run the seed locally and flip `enabled=true` on rows you've smoke-tested.

### `yieldDeposit({ amount })` / `yieldWithdraw({ amount })`

Move USDC into / out of the configured Kamino reserve, up to the owner-set `max_deployed_fraction`.

```ts
await klink.yieldDeposit({ amount: 100_000_000 });   // 100 USDC
await klink.yieldWithdraw({ amount:  50_000_000 });  //  50 USDC
```

Withdraw under utilization stress can return less than requested — the response is the actual amount that landed. Deposit revert (max-fraction breach) → `402`. Withdraw revert (insufficient reserve liquidity) → `409`.

### `yieldPosition()`

Read the on-chain Vault account. `accrued` is currently `null` pending the klend-sdk follow-up.

```ts
const p = await klink.yieldPosition();
// → { deployed: "150000000", accrued: null, total_balance: "230000000" }
```

## Error handling

Every non-2xx response throws `KlinkApiError`. Inspect `.status` and `.body`:

```ts
import { KlinkApiError } from "@klink/sdk";

try {
  await klink.spendTransfer({ recipient, amount, memo });
} catch (err) {
  if (err instanceof KlinkApiError) {
    switch (err.status) {
      case 401: /* key revoked or wrong — surface to the human, don't retry */ break;
      case 402: /* policy: insufficient liquid funds */ break;
      case 403: /* policy: outside-window / url-not-allowed / on-chain revert */ break;
      case 409: /* partial fill on yield withdraw */ break;
      case 503: /* RPC retry exhausted — safe to retry with backoff */ break;
      default:  /* unknown — log and surface */ break;
    }
  }
}
```

The `KlinkDenyReason` union in `types.ts` enumerates the human-readable `body.detail` strings for `403` denials. **Never tight-loop on `401`/`403`** — those are policy decisions, not transient errors.

## Testing

The `fetch` implementation is injectable via the `fetch` config field — no global `fetch` mocking, no nock, no msw:

```ts
import { KlinkClient, type FetchLike } from "@klink/sdk";

const fakeFetch: FetchLike = async (_url, _init) => {
  return new Response(
    JSON.stringify({ deployed: "0", accrued: null, total_balance: "0" }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
};

const klink = new KlinkClient({
  baseUrl: "https://api.klink.test",
  apiKey: "klink_test_xxx",
  fetch: fakeFetch,
});

await klink.yieldPosition(); // hits fakeFetch, no network
```

The package's own tests in `tests/client.test.ts` are a working reference — 18 tests, every endpoint + the error taxonomy + base-URL trailing-slash normalisation.

## References

- HTTP surface: [`docs/architecture/api-surface.md`](../../docs/architecture/api-surface.md)
- Wallet design + on-chain enforcement: [`docs/specs/2026-04-28-agent-wallet-design.md`](../../docs/specs/2026-04-28-agent-wallet-design.md)
- Agent self-onboarding (skill format): [`gitbook/skill.md`](../../gitbook/skill.md)
- Operational gotchas (Render cold start, JWT-secret-mismatch trap, etc.): [`HANDOVER.md`](../../HANDOVER.md)
