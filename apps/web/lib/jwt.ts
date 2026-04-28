import { jwtVerify } from "jose";
import { getJwtSecret } from "./auth-config";

export interface KlinkSession {
  userId: string;
  pubkey: string;
}

export async function verifyKlinkJwt(token: string): Promise<KlinkSession | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    if (typeof payload.sub !== "string") return null;
    if (typeof payload.pubkey !== "string") return null;
    return { userId: payload.sub, pubkey: payload.pubkey };
  } catch {
    return null;
  }
}
