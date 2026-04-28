/**
 * Server-side auth configuration. Read ONLY from server components and route
 * handlers — `JWT_SECRET` must never reach the browser.
 */

export const COOKIE_NAME = "klink_session";

export const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24; // 24h — matches backend JWT expiry

export function getApiBaseUrl(): string {
  return (
    process.env.KLINK_API_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000"
  );
}

export function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not set");
  }
  return new TextEncoder().encode(secret);
}

export function isCookieSecure(): boolean {
  if (process.env.KLINK_COOKIE_SECURE === "true") return true;
  if (process.env.KLINK_COOKIE_SECURE === "false") return false;
  return process.env.NODE_ENV === "production";
}
