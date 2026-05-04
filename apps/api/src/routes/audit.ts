import { and, desc, eq, inArray, lt } from "drizzle-orm";
import type { Request, Response } from "express";
import { getDb } from "../db/client";
import { auditLog, dodoPayments, wallets } from "../db/schema";

/**
 * `GET /v1/audit?cursor=<id>&limit=<n>&decision=allow|deny|all` — T-216.
 *
 * Owner-authenticated. Cursor-paginated read of `audit_log` scoped to wallets
 * the caller owns. `cursor` is the last seen `id` (bigserial, monotonic);
 * results are returned in `id desc` order so a consistent forward-paging
 * cursor never skips entries even under concurrent inserts.
 */

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function parseQuery(req: Request):
  | {
      cursor: number | null;
      limit: number;
      decision: "allow" | "deny" | "all";
    }
  | { error: string } {
  const cursorRaw = typeof req.query.cursor === "string" ? req.query.cursor : "";
  const limitRaw = typeof req.query.limit === "string" ? req.query.limit : "";
  const decisionRaw = typeof req.query.decision === "string" ? req.query.decision : "all";

  let cursor: number | null = null;
  if (cursorRaw) {
    const n = Number(cursorRaw);
    if (!Number.isInteger(n) || n < 0) return { error: "cursor must be a non-negative integer" };
    cursor = n;
  }

  let limit = DEFAULT_LIMIT;
  if (limitRaw) {
    const n = Number(limitRaw);
    if (!Number.isInteger(n) || n < 1) return { error: "limit must be a positive integer" };
    limit = Math.min(n, MAX_LIMIT);
  }

  if (decisionRaw !== "allow" && decisionRaw !== "deny" && decisionRaw !== "all") {
    return { error: "decision must be 'allow' | 'deny' | 'all'" };
  }
  return { cursor, limit, decision: decisionRaw };
}

export async function getAuditHandler(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: "auth required" });
    return;
  }

  const q = parseQuery(req);
  if ("error" in q) {
    res.status(400).json({ error: q.error });
    return;
  }

  const db = getDb();

  // Scope: every audit row whose wallet belongs to the caller. Two queries
  // (wallets first, then audit_log) keeps the SQL straightforward; a JOIN
  // would also work but the wallet list is typically small per user.
  const userWallets = await db
    .select({ id: wallets.id })
    .from(wallets)
    .where(eq(wallets.userId, userId));
  const walletIds = userWallets.map((w) => w.id);
  if (walletIds.length === 0) {
    res.json({ entries: [], next_cursor: null });
    return;
  }

  const conditions = [inArray(auditLog.walletId, walletIds)];
  if (q.cursor !== null) {
    conditions.push(lt(auditLog.id, q.cursor));
  }
  if (q.decision !== "all") {
    conditions.push(eq(auditLog.decision, q.decision));
  }

  // T-245 — LEFT JOIN dodo_payments so fund_dodo rows can carry the hosted
  // invoice URL + Dodo's session/payment ids. Other action types just get
  // null on those columns (they don't carry a dodoPaymentId FK).
  const rows = await db
    .select({
      id: auditLog.id,
      walletId: auditLog.walletId,
      sessionId: auditLog.sessionId,
      action: auditLog.action,
      amount: auditLog.amount,
      recipientOrUrl: auditLog.recipientOrUrl,
      decision: auditLog.decision,
      reason: auditLog.reason,
      txSignature: auditLog.txSignature,
      createdAt: auditLog.createdAt,
      dodoPaymentId: auditLog.dodoPaymentId,
      dodoSessionId: dodoPayments.dodoSessionId,
      dodoInvoiceUrl: dodoPayments.invoiceUrl,
      dodoPaymentIdExternal: dodoPayments.paymentId,
    })
    .from(auditLog)
    .leftJoin(dodoPayments, eq(auditLog.dodoPaymentId, dodoPayments.id))
    .where(and(...conditions))
    .orderBy(desc(auditLog.id))
    .limit(q.limit + 1);

  const hasMore = rows.length > q.limit;
  const entries = hasMore ? rows.slice(0, q.limit) : rows;
  const nextCursor = hasMore ? (entries[entries.length - 1]?.id ?? null) : null;

  // Drizzle already returns camelCase column aliases; the dashboard's
  // `auditEntrySchema` (apps/web/lib/schemas.ts) expects camelCase too. Don't
  // re-map to snake_case here — every prior version did, which silently broke
  // the audit page (zod parse failed, data went null, "No audit entries"
  // rendered forever). `createdAt` is the only field that needs a JSON-safe
  // cast since Drizzle hands back a Date object on `timestamp` columns.
  res.json({
    entries: entries.map((e) => ({
      ...e,
      createdAt: e.createdAt instanceof Date ? e.createdAt.toISOString() : e.createdAt,
    })),
    next_cursor: nextCursor,
  });
}
