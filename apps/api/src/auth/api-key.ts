import { eq } from "drizzle-orm";
import type { NextFunction, Request, Response } from "express";
import { getDb } from "../db/client";
import { apiKeys, sessions, wallets } from "../db/schema";

// Augments the express Request with klink-issued session + wallet context
// once the bearer token is validated. Use `req.session` / `req.wallet` in
// downstream handlers (T-205 onward). If we ever pull in `express-session`,
// rename to `req.klinkSession` / `req.klinkWallet` to avoid collision.
declare global {
  namespace Express {
    interface Request {
      session?: KlinkSession;
      wallet?: KlinkWallet;
    }
  }
}

export interface KlinkSession {
  id: string;
  walletId: string;
  sessionPubkey: string;
}

export interface KlinkWallet {
  id: string;
  vaultPda: string;
  usdcAta: string;
}

const STATIC_PREFIX = "klink_dev_";
const PREFIX_LEN = 8;
const MIN_BODY_LEN = PREFIX_LEN + 16;

export interface ApiKeyRow {
  apiKeyId: string;
  hashedToken: string;
  apiKeyRevokedAt: Date | null;
  sessionId: string;
  sessionRevokedAt: Date | null;
  walletId: string;
  sessionPubkey: string;
  vaultPda: string;
  usdcAta: string;
}

export type ApiKeyLookup = (keyPrefix: string) => Promise<ApiKeyRow | null>;
export type LastUsedUpdater = (apiKeyId: string) => Promise<void>;

const defaultLookup: ApiKeyLookup = async (keyPrefix) => {
  const db = getDb();
  const rows = await db
    .select({
      apiKeyId: apiKeys.id,
      hashedToken: apiKeys.hashedToken,
      apiKeyRevokedAt: apiKeys.revokedAt,
      sessionId: sessions.id,
      sessionRevokedAt: sessions.revokedAt,
      walletId: sessions.walletId,
      sessionPubkey: sessions.sessionPubkey,
      vaultPda: wallets.vaultPda,
      usdcAta: wallets.usdcAta,
    })
    .from(apiKeys)
    .innerJoin(sessions, eq(apiKeys.sessionId, sessions.id))
    .innerJoin(wallets, eq(sessions.walletId, wallets.id))
    .where(eq(apiKeys.keyPrefix, keyPrefix))
    .limit(1);
  return rows[0] ?? null;
};

const defaultUpdateLastUsed: LastUsedUpdater = async (apiKeyId) => {
  const db = getDb();
  await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, apiKeyId));
};

export interface MakeRequireApiKeyOpts {
  lookup?: ApiKeyLookup;
  updateLastUsed?: LastUsedUpdater;
}

export function makeRequireApiKey(opts: MakeRequireApiKeyOpts = {}) {
  const lookup = opts.lookup ?? defaultLookup;
  const updateLastUsed = opts.updateLastUsed ?? defaultUpdateLastUsed;

  return async function requireApiKey(req: Request, res: Response, next: NextFunction) {
    const auth = req.header("authorization");
    if (!auth || !auth.startsWith("Bearer ")) {
      res.status(401).json({ error: "missing bearer token" });
      return;
    }
    const token = auth.slice("Bearer ".length).trim();
    if (!token.startsWith(STATIC_PREFIX)) {
      res.status(401).json({ error: "invalid token format" });
      return;
    }
    const body = token.slice(STATIC_PREFIX.length);
    if (body.length < MIN_BODY_LEN) {
      res.status(401).json({ error: "invalid token format" });
      return;
    }
    const keyPrefix = body.slice(0, PREFIX_LEN);

    const row = await lookup(keyPrefix);
    if (!row) {
      res.status(401).json({ error: "invalid api key" });
      return;
    }
    if (row.apiKeyRevokedAt) {
      res.status(401).json({ error: "api key revoked" });
      return;
    }
    if (row.sessionRevokedAt) {
      res.status(401).json({ error: "session revoked" });
      return;
    }

    // Bun.password.verify is constant-time per the Bun docs (uses argon2id's
    // own constant-time comparator under the hood).
    const valid = await Bun.password.verify(token, row.hashedToken);
    if (!valid) {
      res.status(401).json({ error: "invalid api key" });
      return;
    }

    // Fire-and-forget last-used update — swallow errors so a transient DB
    // hiccup doesn't fail an otherwise-valid request.
    updateLastUsed(row.apiKeyId).catch(() => undefined);

    req.session = {
      id: row.sessionId,
      walletId: row.walletId,
      sessionPubkey: row.sessionPubkey,
    };
    req.wallet = {
      id: row.walletId,
      vaultPda: row.vaultPda,
      usdcAta: row.usdcAta,
    };
    next();
  };
}

export const requireApiKey = makeRequireApiKey();

/**
 * Generate a fresh API key. Token is `klink_dev_<base64url-32B>`. The first 8
 * chars of the body section are the lookup prefix stored in api_keys.key_prefix.
 */
export function generateApiKey(): { token: string; prefix: string } {
  const random = crypto.getRandomValues(new Uint8Array(32));
  const body = Buffer.from(random).toString("base64url");
  const token = STATIC_PREFIX + body;
  const prefix = body.slice(0, PREFIX_LEN);
  return { token, prefix };
}

/** Hash a token with argon2id (Bun.password default). */
export async function hashApiKey(token: string): Promise<string> {
  return Bun.password.hash(token);
}
