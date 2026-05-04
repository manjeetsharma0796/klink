import { createHmac, timingSafeEqual } from "node:crypto";
import { TOKEN_PROGRAM_ID, createTransferInstruction } from "@solana/spl-token";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { eq } from "drizzle-orm";
import type { Request, Response } from "express";
// Treasury loader shared with spend.ts + yield.ts agent paths (T-226).
import {
  loadTreasury as defaultLoadTreasury,
  loadTreasuryAta as defaultLoadTreasuryAta,
} from "../crypto/treasury";
import { getDb } from "../db/client";
import { auditLog, dodoPayments, treasuryDisbursements, wallets } from "../db/schema";

/**
 * Dodo Payments fiat-in (spec §4.1.2). Two endpoints:
 *
 *   POST /v1/fund/dodo-checkout  (dashboard JWT) — T-214
 *     Creates a Dodo checkout session, INSERTs dodo_payments(pending),
 *     returns { checkout_url, dodo_session_id }.
 *
 *   POST /v1/webhooks/dodo       (HMAC-signed)   — T-215
 *     Verifies signature, idempotent on dodo_session_id, runs the
 *     treasury-disburser inline (SPL transfer treasury USDC ATA →
 *     vault USDC ATA), records treasury_disbursements + audit_log.
 *
 * Idempotency: dodo_session_id is unique. Replays return 200 with
 * `{ status: "already_settled" }` after the first success.
 */

function envOrThrow(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

// ---------------------------------------------------------------------------
// T-214 — POST /v1/fund/dodo-checkout
// ---------------------------------------------------------------------------

interface DodoCheckoutBody {
  amount_usd: number; // whole dollars; integer
  wallet_id: string;
  /** Optional URLs for redirect after pay/cancel — pass through to Dodo. */
  success_url?: string;
  cancel_url?: string;
}

interface ValidationError {
  ok: false;
  status: number;
  body: { error: string };
}
function fail(status: number, error: string): ValidationError {
  return { ok: false, status, body: { error } };
}

function parseCheckoutBody(raw: unknown): { ok: true; body: DodoCheckoutBody } | ValidationError {
  if (!raw || typeof raw !== "object") return fail(400, "request body must be JSON object");
  const b = raw as Record<string, unknown>;
  if (
    typeof b.amount_usd !== "number" ||
    !Number.isInteger(b.amount_usd) ||
    b.amount_usd <= 0 ||
    b.amount_usd > 10_000
  ) {
    return fail(400, "amount_usd must be positive integer ≤ 10000 (USD whole dollars)");
  }
  if (typeof b.wallet_id !== "string" || !b.wallet_id) {
    return fail(400, "wallet_id required (uuid)");
  }
  if (b.success_url !== undefined && typeof b.success_url !== "string") {
    return fail(400, "success_url must be string if provided");
  }
  if (b.cancel_url !== undefined && typeof b.cancel_url !== "string") {
    return fail(400, "cancel_url must be string if provided");
  }
  return {
    ok: true,
    body: {
      amount_usd: b.amount_usd,
      wallet_id: b.wallet_id,
      success_url: b.success_url as string | undefined,
      cancel_url: b.cancel_url as string | undefined,
    },
  };
}

export interface DodoSession {
  id: string;
  url: string;
}

/**
 * Wraps a single call to Dodo's checkout-create endpoint. Defaulted to a real
 * `fetch` against `DODO_API_BASE_URL`; tests inject a stub. Kept thin on
 * purpose so the surface to mock is small.
 *
 * T-243 fix: previously called `/checkout/sessions` with a flat
 * `{ amount, currency }` body and parsed `{ id, url }` from the response —
 * none of those exist in Dodo's actual API. The real endpoint is `/checkouts`,
 * the body needs `product_cart` + `customer`, and the response is keyed
 * `{ session_id, checkout_url }`. Latent since T-214 shipped — every dashboard
 * fund-page checkout returned 502 until this landed.
 */
export type CreateDodoSession = (input: {
  amountUsdCents: number;
  walletId: string;
  userId: string;
  /** Synthesized from the SIWS user record; Dodo requires a customer block. */
  customerEmail: string;
  customerName: string;
  successUrl?: string;
  cancelUrl?: string;
}) => Promise<DodoSession>;

const defaultCreateDodoSession: CreateDodoSession = async (input) => {
  const apiBase = envOrThrow("DODO_API_BASE_URL").replace(/\/$/, "");
  const apiKey = envOrThrow("DODO_API_KEY");
  // One canonical pay-what-you-want product; per-checkout amount lives on the
  // cart line item. See `docs/runbooks/dodo-product-setup.md` if/when added.
  const productId = envOrThrow("DODO_PRODUCT_ID");
  const resp = await fetch(`${apiBase}/checkouts`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      product_cart: [
        {
          product_id: productId,
          quantity: 1,
          amount: input.amountUsdCents,
        },
      ],
      customer: {
        email: input.customerEmail,
        name: input.customerName,
      },
      return_url: input.successUrl,
      metadata: { wallet_id: input.walletId, user_id: input.userId },
    }),
  });
  if (!resp.ok) {
    const detail = await resp.text();
    throw new Error(`dodo session create failed: ${resp.status} ${detail.slice(0, 200)}`);
  }
  const json = (await resp.json()) as { session_id?: string; checkout_url?: string | null };
  if (!json.session_id || !json.checkout_url) {
    throw new Error("dodo session response missing session_id or checkout_url");
  }
  return { id: json.session_id, url: json.checkout_url };
};

export interface MakePostDodoCheckoutDeps {
  createSession?: CreateDodoSession;
}

export function makePostDodoCheckoutHandler(deps: MakePostDodoCheckoutDeps = {}) {
  const createSession = deps.createSession ?? defaultCreateDodoSession;

  return async function postDodoCheckout(req: Request, res: Response): Promise<void> {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "auth required" });
      return;
    }

    const parsed = parseCheckoutBody(req.body);
    if (!parsed.ok) {
      res.status(parsed.status).json(parsed.body);
      return;
    }
    const body = parsed.body;

    const db = getDb();
    const [wallet] = await db
      .select({ id: wallets.id, userId: wallets.userId })
      .from(wallets)
      .where(eq(wallets.id, body.wallet_id))
      .limit(1);
    if (!wallet || wallet.userId !== userId) {
      // Same 404 for "wrong owner" and "not found" — don't leak existence to a
      // caller authenticated as a different user.
      res.status(404).json({ error: "wallet not found" });
      return;
    }

    const amountUsdCents = body.amount_usd * 100;
    // USDC has 6 decimals; $1 == 1_000_000 base units.
    const amountUsdc = body.amount_usd * 1_000_000;

    // Dodo requires a customer block on every checkout. SIWS doesn't collect
    // email, so we synthesize one from the user id (uuid → looks like email)
    // and use the Phantom pubkey prefix as the display name. Any real email
    // collection (profile flow, etc.) should land later as a follow-up.
    const userPubkey = (req.user as { pubkey?: string } | undefined)?.pubkey;
    const customerEmail = `${userId}@klink.local`;
    const customerName = userPubkey
      ? `klink-${userPubkey.slice(0, 8)}`
      : `klink-${userId.slice(0, 8)}`;

    let session: DodoSession;
    try {
      session = await createSession({
        amountUsdCents,
        walletId: wallet.id,
        userId,
        customerEmail,
        customerName,
        successUrl: body.success_url,
        cancelUrl: body.cancel_url,
      });
    } catch (err) {
      console.error("[POST /v1/fund/dodo-checkout] dodo create failed:", err);
      res.status(502).json({ error: "dodo session create failed" });
      return;
    }

    try {
      await db.insert(dodoPayments).values({
        dodoSessionId: session.id,
        userId,
        walletId: wallet.id,
        amountUsd: amountUsdCents,
        amountUsdc,
        status: "pending",
      });
    } catch (err) {
      console.error("[POST /v1/fund/dodo-checkout] dodo_payments insert failed:", err);
      res.status(500).json({ error: "failed to record pending payment" });
      return;
    }

    res.json({
      checkout_url: session.url,
      dodo_session_id: session.id,
    });
  };
}

export const postDodoCheckoutHandler = makePostDodoCheckoutHandler();

// ---------------------------------------------------------------------------
// T-244 — GET /v1/fund/dodo-payment/:sessionId
//
// Read-only status query for the post-checkout return page. Polled by the
// dashboard while the customer waits for the webhook → on-chain settlement
// loop to close. Owner-scoped (matches the wallet's userId) so one customer
// can't see another's payment status.
// ---------------------------------------------------------------------------

export function makeGetDodoPaymentHandler() {
  return async function getDodoPayment(req: Request, res: Response): Promise<void> {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "auth required" });
      return;
    }
    // T-245 — accept either Dodo's checkout session id (cks_...) or its
    // payment id (pay_...). The dashboard stashes the session id in
    // sessionStorage before redirecting to Dodo; Dodo's redirect URL appends
    // payment_id. Either should resolve to the same dodo_payments row.
    const id = req.params.id ?? req.params.sessionId;
    if (!id || typeof id !== "string") {
      res.status(400).json({ error: "id required (session_id or payment_id)" });
      return;
    }

    const db = getDb();
    const matchExpr = id.startsWith("pay_")
      ? eq(dodoPayments.paymentId, id)
      : eq(dodoPayments.dodoSessionId, id);
    const [payment] = await db
      .select({
        status: dodoPayments.status,
        amountUsd: dodoPayments.amountUsd,
        amountUsdc: dodoPayments.amountUsdc,
        treasuryTxSignature: dodoPayments.treasuryTxSignature,
        settledAt: dodoPayments.settledAt,
        paymentId: dodoPayments.paymentId,
        invoiceId: dodoPayments.invoiceId,
        invoiceUrl: dodoPayments.invoiceUrl,
        userId: dodoPayments.userId,
      })
      .from(dodoPayments)
      .where(matchExpr)
      .limit(1);

    // Same 404 for "not found" and "wrong owner" — don't leak existence.
    if (!payment || payment.userId !== userId) {
      res.status(404).json({ error: "payment not found" });
      return;
    }

    res.json({
      status: payment.status, // "pending" | "settled" | "failed"
      amount_usd: payment.amountUsd, // cents
      amount_usdc: payment.amountUsdc, // base units (10^6)
      tx_signature: payment.treasuryTxSignature ?? null,
      payment_id: payment.paymentId ?? null,
      invoice_id: payment.invoiceId ?? null,
      invoice_url: payment.invoiceUrl ?? null,
      settled_at: payment.settledAt?.toISOString() ?? null,
    });
  };
}

export const getDodoPaymentHandler = makeGetDodoPaymentHandler();

// ---------------------------------------------------------------------------
// T-215 — POST /v1/webhooks/dodo  (HMAC-signed by Dodo)
// ---------------------------------------------------------------------------

export interface DodoWebhookEvent {
  /** Event type — only "payment.succeeded" triggers disbursement. */
  type: string;
  data: {
    /**
     * Dodo's checkout-session id (`cks_...`). Present on payment.* events;
     * this is what we match against `dodo_payments.dodoSessionId`.
     */
    checkout_session_id?: string;
    /** Dodo's payment id (`pay_...`). Captured for invoice lookup + redirect URL parity. */
    payment_id?: string;
    /** Invoice metadata captured on settlement — surfaced via the return page + audit log. */
    invoice_id?: string;
    invoice_url?: string;
    /** "paid" | "succeeded" | "open" | "expired" — only "paid"/"succeeded" should disburse. */
    status?: string;
    amount?: number;
    currency?: string;
  };
}

/**
 * Verifies a Dodo Payments webhook using the [Standard Webhooks](https://www.standardwebhooks.com/)
 * scheme that Dodo follows (confirmed by docs + the `whsec_` prefix on the
 * live secret).
 *
 * Dodo sends three headers:
 *   `webhook-id`        — opaque event id, e.g. `msg_2pBe...`
 *   `webhook-timestamp` — Unix seconds as a string
 *   `webhook-signature` — one or more space-separated `v<n>,<base64>` tokens
 *
 * The HMAC key is the live secret with the `whsec_` prefix stripped and the
 * remainder base64-decoded. The signed payload is the literal byte string
 * `${webhook-id}.${webhook-timestamp}.${rawBody}`. We accept any v1 token in
 * the multi-sig header (key-rotation cutover support); `v0`, `v2`, etc. are
 * ignored. A ±300s replay window guards against captured-then-resent events.
 *
 * Found by T-236 — T-215's original tests signed-and-verified with a custom
 * HMAC scheme that didn't match what Dodo actually sends, so live signatures
 * were rejected on every attempt.
 */
export interface VerifyDodoOpts {
  rawBody: Buffer;
  webhookId: string | undefined;
  webhookTimestamp: string | undefined;
  webhookSignature: string | undefined;
  secret: string;
  /** Replay window in seconds. Defaults to 300 (Standard Webhooks default). */
  toleranceSeconds?: number;
  /** Injectable clock; returns Unix seconds. Defaults to `Date.now()/1000`. */
  now?: () => number;
}

const DEFAULT_TOLERANCE_SEC = 300;

export function verifyDodoSignature(opts: VerifyDodoOpts): boolean {
  const { rawBody, webhookId, webhookTimestamp, webhookSignature, secret } = opts;
  const tolerance = opts.toleranceSeconds ?? DEFAULT_TOLERANCE_SEC;
  const now = opts.now ?? (() => Math.floor(Date.now() / 1000));

  if (!webhookId || !webhookTimestamp || !webhookSignature) return false;

  const ts = Number.parseInt(webhookTimestamp, 10);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(now() - ts) > tolerance) return false;

  const keyBytes = decodeWebhookSecret(secret);
  if (!keyBytes) return false;

  const signedPayload = Buffer.concat([
    Buffer.from(webhookId, "utf8"),
    Buffer.from(".", "utf8"),
    Buffer.from(webhookTimestamp, "utf8"),
    Buffer.from(".", "utf8"),
    rawBody,
  ]);
  const expected = createHmac("sha256", keyBytes).update(signedPayload).digest();

  // Header is whitespace-separated `v<n>,<b64>` tokens. Accept on first v1 match.
  for (const token of webhookSignature.split(/\s+/).filter(Boolean)) {
    const comma = token.indexOf(",");
    if (comma <= 0 || comma === token.length - 1) continue;
    const version = token.slice(0, comma);
    const b64 = token.slice(comma + 1);
    if (version !== "v1") continue;
    let sig: Buffer;
    try {
      sig = Buffer.from(b64, "base64");
    } catch {
      continue;
    }
    if (sig.length !== expected.length) continue;
    try {
      if (timingSafeEqual(sig, expected)) return true;
    } catch {
      // fall through to next token
    }
  }
  return false;
}

/**
 * Strip the `whsec_` prefix (if present) and base64-decode the remainder to
 * produce the raw HMAC key. Returns `null` if the secret is empty or decodes
 * to zero bytes — both indicate an unconfigured / corrupted secret rather than
 * something we should silently HMAC against.
 */
function decodeWebhookSecret(secret: string): Buffer | null {
  if (!secret) return null;
  const stripped = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  if (!stripped) return null;
  const buf = Buffer.from(stripped, "base64");
  return buf.length > 0 ? buf : null;
}

export type ConnectionFactory = () => Connection;
export type SubmitFn = (conn: Connection, tx: Transaction, signers: Keypair[]) => Promise<string>;

export interface MakePostDodoWebhookDeps {
  connection?: ConnectionFactory;
  submit?: SubmitFn;
  /** Test seam: override how the treasury keypair is loaded. */
  loadTreasury?: () => Keypair;
  /** Test seam: override the treasury USDC ATA pubkey. */
  loadTreasuryAta?: () => PublicKey;
}

export function makePostDodoWebhookHandler(deps: MakePostDodoWebhookDeps = {}) {
  const newConn =
    deps.connection ?? (() => new Connection(envOrThrow("SOLANA_RPC_URL"), "confirmed"));
  const doSubmit = deps.submit ?? sendAndConfirmTransaction;
  const loadTreasury = deps.loadTreasury ?? defaultLoadTreasury;
  const loadTreasuryAta = deps.loadTreasuryAta ?? defaultLoadTreasuryAta;

  return async function postDodoWebhook(req: Request, res: Response): Promise<void> {
    const secret = process.env.DODO_WEBHOOK_SECRET;
    if (!secret) {
      console.error("[POST /v1/webhooks/dodo] DODO_WEBHOOK_SECRET not set");
      res.status(500).json({ error: "server misconfigured" });
      return;
    }

    // The webhook route is mounted with `express.raw({ type: () => true })`
    // (see app.ts) so req.body is a Buffer of the exact bytes Dodo signed,
    // regardless of Content-Type. The legacy `req.rawBody` capture still works
    // for callers that mounted the route with the old express.json verify
    // hook (T-215 unit tests use that path via injected fixtures).
    const rawBody = Buffer.isBuffer(req.body)
      ? req.body
      : (req as Request & { rawBody?: Buffer }).rawBody;
    if (!rawBody) {
      console.error("[POST /v1/webhooks/dodo] rawBody missing — middleware misconfigured");
      res.status(500).json({ error: "server misconfigured" });
      return;
    }

    // Standard Webhooks (Dodo Payments) — three headers carry the signature
    // material; verifyDodoSignature handles missing/expired/mismatched cases
    // and returns false for any auth failure.
    const ok = verifyDodoSignature({
      rawBody,
      webhookId: req.header("webhook-id"),
      webhookTimestamp: req.header("webhook-timestamp"),
      webhookSignature: req.header("webhook-signature"),
      secret,
    });
    if (!ok) {
      res.status(401).json({ error: "invalid signature" });
      return;
    }

    let event: DodoWebhookEvent;
    try {
      event = JSON.parse(rawBody.toString("utf8")) as DodoWebhookEvent;
    } catch {
      res.status(400).json({ error: "invalid json" });
      return;
    }

    // T-245 — Dodo's payment.succeeded events carry `data.checkout_session_id`
    // (the cks_... we stored as dodoSessionId), NOT a generic `data.id` field.
    // The original handler queried by data.id and silently 0-rowed every real
    // payment, leaving every fund_dodo flow stuck at status=pending forever.
    const sessionId = event?.data?.checkout_session_id;
    if (!sessionId || typeof sessionId !== "string") {
      // Some Dodo event types (subscription.*, dispute.*, license.*) don't
      // carry a checkout_session_id — they're outside the fund-in flow we
      // care about. Acknowledge and move on.
      res.status(200).json({ status: "ignored", reason: "no_checkout_session_id" });
      return;
    }

    // Only process the terminal-paid state. Other events (open, expired,
    // failed, processing) are acknowledged with 200 so Dodo stops retrying.
    const isPaid =
      event.type === "payment.succeeded" ||
      event.data.status === "paid" ||
      event.data.status === "succeeded";
    if (!isPaid) {
      res.status(200).json({ status: "ignored", type: event.type });
      return;
    }

    const db = getDb();

    // Idempotency: lock the row and check current status.
    const [payment] = await db
      .select({
        id: dodoPayments.id,
        userId: dodoPayments.userId,
        walletId: dodoPayments.walletId,
        amountUsdc: dodoPayments.amountUsdc,
        status: dodoPayments.status,
      })
      .from(dodoPayments)
      .where(eq(dodoPayments.dodoSessionId, sessionId))
      .limit(1);
    if (!payment) {
      // Dodo sent us a session we never created. Treat as success-noop so
      // they stop retrying; log loud so ops can investigate.
      console.error(`[POST /v1/webhooks/dodo] unknown session id ${sessionId} — orphan webhook`);
      res.status(200).json({ status: "unknown_session" });
      return;
    }

    if (payment.status === "settled") {
      res.status(200).json({ status: "already_settled" });
      return;
    }
    if (payment.status === "failed") {
      // Already terminal in the failed direction; don't disburse.
      res.status(200).json({ status: "already_failed" });
      return;
    }

    const [wallet] = await db
      .select({ usdcAta: wallets.usdcAta })
      .from(wallets)
      .where(eq(wallets.id, payment.walletId))
      .limit(1);
    if (!wallet) {
      console.error(`[POST /v1/webhooks/dodo] wallet ${payment.walletId} missing`);
      res.status(500).json({ error: "wallet missing" });
      return;
    }

    let vaultUsdcAta: PublicKey;
    let treasury: Keypair;
    let treasuryAta: PublicKey;
    try {
      vaultUsdcAta = new PublicKey(wallet.usdcAta);
      treasury = loadTreasury();
      treasuryAta = loadTreasuryAta();
    } catch (err) {
      console.error("[POST /v1/webhooks/dodo] keypair/ata load failed:", err);
      res.status(500).json({ error: "server misconfigured" });
      return;
    }

    const conn = newConn();
    const ix = createTransferInstruction(
      treasuryAta,
      vaultUsdcAta,
      treasury.publicKey,
      BigInt(payment.amountUsdc),
      [],
      TOKEN_PROGRAM_ID,
    );
    const tx = new Transaction({ feePayer: treasury.publicKey });
    tx.add(ix);
    try {
      const { blockhash } = await conn.getLatestBlockhash("finalized");
      tx.recentBlockhash = blockhash;
    } catch (err) {
      console.error("[POST /v1/webhooks/dodo] blockhash fetch failed:", err);
      // Return 503 so Dodo retries — the webhook hasn't done anything yet.
      res.status(503).json({ error: "rpc unavailable" });
      return;
    }

    let signature: string;
    try {
      signature = await doSubmit(conn, tx, [treasury]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown";
      console.error("[POST /v1/webhooks/dodo] disburse submit failed:", msg);
      // Mark failed in DB so a retry doesn't disburse twice; respond 503 so
      // Dodo retries (we'll see the failed status and ignore on replay).
      await db
        .update(dodoPayments)
        .set({
          status: "failed",
          paymentId: event.data.payment_id ?? null,
          invoiceId: event.data.invoice_id ?? null,
          invoiceUrl: event.data.invoice_url ?? null,
        })
        .where(eq(dodoPayments.id, payment.id));
      await db.insert(auditLog).values({
        walletId: payment.walletId,
        dodoPaymentId: payment.id,
        action: "fund_dodo",
        amount: payment.amountUsdc,
        decision: "deny",
        reason: `TREASURY_SUBMIT_FAILED: ${msg.slice(0, 200)}`,
      });
      res.status(503).json({ error: "treasury submit failed", detail: msg });
      return;
    }

    // Settled. Record in three places: dodo_payments status + tx + invoice
    // metadata, treasury_disbursements, audit_log. T-245 captures payment_id /
    // invoice_id / invoice_url so the return page + audit row can render the
    // hosted-invoice download CTA later.
    await db
      .update(dodoPayments)
      .set({
        status: "settled",
        settledAt: new Date(),
        treasuryTxSignature: signature,
        paymentId: event.data.payment_id ?? null,
        invoiceId: event.data.invoice_id ?? null,
        invoiceUrl: event.data.invoice_url ?? null,
      })
      .where(eq(dodoPayments.id, payment.id));
    await db.insert(treasuryDisbursements).values({
      dodoPaymentId: payment.id,
      amountUsdc: payment.amountUsdc,
      txSignature: signature,
    });
    await db.insert(auditLog).values({
      walletId: payment.walletId,
      dodoPaymentId: payment.id,
      action: "fund_dodo",
      amount: payment.amountUsdc,
      decision: "allow",
      txSignature: signature,
    });

    res.status(200).json({ status: "settled", tx_signature: signature });
  };
}

export const postDodoWebhookHandler = makePostDodoWebhookHandler();
