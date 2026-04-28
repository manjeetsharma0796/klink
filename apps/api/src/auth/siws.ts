import { randomBytes } from "node:crypto";
import bs58 from "bs58";
import { eq } from "drizzle-orm";
import type { Request, Response } from "express";
import { SignJWT } from "jose";
import nacl from "tweetnacl";
import { getDb } from "../db/client";
import { users } from "../db/schema";

const NONCE_TTL_SECONDS = 60;
const NONCE_PREFIX = "siws_nonce:";
const JWT_EXPIRES_IN = "24h";

const APP_NAME = "klink";

/**
 * The exact message Phantom signs. Must match what the dashboard prompts the
 * user with — if either side drifts, signatures won't verify.
 */
export function siwsMessage(nonce: string): string {
  return `Sign in to ${APP_NAME}: ${nonce}`;
}

/**
 * Minimal Redis surface needed by SIWS. Any client implementing setex + getdel
 * + (optionally) get works.
 */
export interface NonceStore {
  setex(key: string, ttlSeconds: number, value: string): Promise<unknown>;
  /** Atomically read and delete. Used to enforce single-use nonces. */
  getdel(key: string): Promise<string | null>;
}

/** Returns the user's UUID, inserting if necessary. */
export type UserUpserter = (phantomPubkey: string) => Promise<string>;

const defaultUpsertUser: UserUpserter = async (phantomPubkey) => {
  const db = getDb();
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.phantomPubkey, phantomPubkey))
    .limit(1);
  if (existing[0]) return existing[0].id;
  const inserted = await db.insert(users).values({ phantomPubkey }).returning({ id: users.id });
  if (!inserted[0]) {
    throw new Error("user upsert failed to return id");
  }
  return inserted[0].id;
};

export type JwtSigner = (userId: string, phantomPubkey: string) => Promise<string>;

const defaultJwtSigner: JwtSigner = async (userId, phantomPubkey) => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not set");
  }
  return new SignJWT({ pubkey: phantomPubkey })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRES_IN)
    .sign(new TextEncoder().encode(secret));
};

export interface SiwsHandlersDeps {
  store?: NonceStore;
  upsertUser?: UserUpserter;
  signJwt?: JwtSigner;
  generateNonce?: () => string;
}

function defaultGenerateNonce(): string {
  return randomBytes(32).toString("hex");
}

export function makeSiwsHandlers(deps: SiwsHandlersDeps = {}) {
  const generate = deps.generateNonce ?? defaultGenerateNonce;
  const upsertUser = deps.upsertUser ?? defaultUpsertUser;
  const signJwt = deps.signJwt ?? defaultJwtSigner;
  const getStore = () => {
    if (deps.store) return deps.store;
    // Lazy-load real Redis only when there's no injected store (i.e. in prod).
    return require("../redis/client").getRedis() as NonceStore;
  };

  async function nonce(_req: Request, res: Response) {
    const value = generate();
    const store = getStore();
    await store.setex(`${NONCE_PREFIX}${value}`, NONCE_TTL_SECONDS, "1");
    res.json({ nonce: value });
  }

  async function siws(req: Request, res: Response) {
    const { pubkey, signature, nonce } = req.body ?? {};
    if (typeof pubkey !== "string" || typeof signature !== "string" || typeof nonce !== "string") {
      res.status(400).json({ error: "pubkey, signature, nonce required (strings)" });
      return;
    }

    const store = getStore();
    const stored = await store.getdel(`${NONCE_PREFIX}${nonce}`);
    if (!stored) {
      res.status(401).json({ error: "nonce unknown or already used" });
      return;
    }

    let pubkeyBytes: Uint8Array;
    let signatureBytes: Uint8Array;
    try {
      pubkeyBytes = bs58.decode(pubkey);
      signatureBytes = bs58.decode(signature);
    } catch {
      res.status(400).json({ error: "pubkey/signature must be base58" });
      return;
    }

    if (pubkeyBytes.length !== 32) {
      res.status(400).json({ error: "pubkey must be 32 bytes" });
      return;
    }
    if (signatureBytes.length !== 64) {
      res.status(400).json({ error: "signature must be 64 bytes" });
      return;
    }

    const message = new TextEncoder().encode(siwsMessage(nonce));
    const valid = nacl.sign.detached.verify(message, signatureBytes, pubkeyBytes);
    if (!valid) {
      res.status(401).json({ error: "invalid signature" });
      return;
    }

    const userId = await upsertUser(pubkey);
    const token = await signJwt(userId, pubkey);
    res.json({ token, userId });
  }

  return { nonce, siws };
}

export const siwsHandlers = makeSiwsHandlers();
