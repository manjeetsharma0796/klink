/**
 * Query-param contract for the "Add to session" deep-link flow (T-314).
 *
 * The /services page links into the dashboard with these params; the sessions
 * pages (list + detail) and the new-session modal read them back to pre-fill
 * the URL allowlist, on-chain recipient list, and per-call cap.
 *
 * Suggested max_per_call comes from a free-text price like "0.01 USDC" parsed
 * to base units and multiplied by a headroom factor so price drift on the
 * upstream doesn't 402 every call.
 */

export interface AddToSessionParams {
  addUrl: string | null;
  addRecipient: string | null;
  /** USDC base units (6 decimals). 0 means "no cap". */
  suggestMaxPerCall: number | null;
}

const HEADROOM_MULTIPLIER = 5;
const FALLBACK_MAX_PER_CALL_BASE_UNITS = 100_000;

export function parseAddToSessionParams(
  search: URLSearchParams,
): AddToSessionParams {
  const addUrl = search.get("add_url");
  const addRecipient = search.get("add_recipient");
  const raw = search.get("suggest_max_per_call");
  const n = raw === null ? null : Number(raw);
  const suggestMaxPerCall =
    n !== null && Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
  return { addUrl, addRecipient, suggestMaxPerCall };
}

export function buildAddToSessionQuery(params: AddToSessionParams): string {
  const sp = new URLSearchParams();
  if (params.addUrl) sp.set("add_url", params.addUrl);
  if (params.addRecipient) sp.set("add_recipient", params.addRecipient);
  if (params.suggestMaxPerCall !== null)
    sp.set("suggest_max_per_call", String(params.suggestMaxPerCall));
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export function hasAnyAddToSessionParam(p: AddToSessionParams): boolean {
  return (
    p.addUrl !== null ||
    p.addRecipient !== null ||
    p.suggestMaxPerCall !== null
  );
}

/**
 * Parse a gitbook services-table price cell to a USDC base-units cap with
 * sensible headroom for upstream price drift. "0.01 USDC" → 50_000 (= 5x).
 * Returns the fallback when the price string can't be parsed numerically.
 */
export function suggestMaxPerCallFromPrice(price: string): number {
  const match = price.match(/(\d+(?:\.\d+)?)/);
  if (!match) return FALLBACK_MAX_PER_CALL_BASE_UNITS;
  const usdc = Number(match[1]);
  if (!Number.isFinite(usdc) || usdc <= 0)
    return FALLBACK_MAX_PER_CALL_BASE_UNITS;
  return Math.ceil(usdc * 1_000_000 * HEADROOM_MULTIPLIER);
}
