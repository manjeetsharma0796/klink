import type { NextFunction, Request, Response } from "express";
import { jwtVerify } from "jose";

/**
 * Verifies the dashboard JWT minted by `/v1/auth/siws` (T-203). The middleware
 * augments `req.user` with `{ id, pubkey }` so downstream handlers can build
 * owner-signed transactions without re-decoding the token.
 *
 * Naming caveat: `req.user` is the convention Passport.js claims. We don't use
 * Passport, but if it's ever introduced rename to `req.klinkUser` (mirrors the
 * `req.session` / `req.wallet` comment in `api-key.ts`).
 */
declare global {
  namespace Express {
    interface Request {
      user?: KlinkUser;
    }
  }
}

export interface KlinkUser {
  /** users.id (uuid) — JWT `sub` claim */
  id: string;
  /** Phantom pubkey (base58) — JWT custom `pubkey` claim */
  pubkey: string;
}

/**
 * Distinguishes "operator screwed up the env" (`MisconfiguredError`) from
 * "user sent a bad token" (every other thrown error). The middleware turns
 * the former into a 500 and the latter into a 401 — masking config errors as
 * 401 made deployment issues look like auth bugs.
 */
export class MisconfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MisconfiguredError";
  }
}

export type JwtVerifier = (token: string) => Promise<KlinkUser>;

const defaultVerifier: JwtVerifier = async (token) => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new MisconfiguredError("JWT_SECRET is not set");
  }
  const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
    algorithms: ["HS256"],
  });
  if (typeof payload.sub !== "string" || typeof payload.pubkey !== "string") {
    throw new Error("jwt missing required claims");
  }
  return { id: payload.sub, pubkey: payload.pubkey };
};

export interface MakeRequireDashboardJwtOpts {
  verify?: JwtVerifier;
}

export function makeRequireDashboardJwt(opts: MakeRequireDashboardJwtOpts = {}) {
  const verify = opts.verify ?? defaultVerifier;

  return async function requireDashboardJwt(req: Request, res: Response, next: NextFunction) {
    const auth = req.header("authorization");
    if (!auth || !auth.startsWith("Bearer ")) {
      res.status(401).json({ error: "missing bearer token" });
      return;
    }
    const token = auth.slice("Bearer ".length).trim();
    if (!token) {
      res.status(401).json({ error: "missing bearer token" });
      return;
    }

    let user: KlinkUser;
    try {
      user = await verify(token);
    } catch (err) {
      if (err instanceof MisconfiguredError) {
        // Server's fault, not the caller's. Log so ops can see which env is
        // wrong; return a generic 500 (no internal details leaked).
        console.error("[requireDashboardJwt] misconfigured:", err.message);
        res.status(500).json({ error: "server misconfigured" });
        return;
      }
      res.status(401).json({ error: "invalid jwt" });
      return;
    }

    req.user = user;
    next();
  };
}

export const requireDashboardJwt = makeRequireDashboardJwt();
