import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { offChainPolicies, serviceCatalog } from "../db/schema";

export type OffChainCheckResult =
  | { allowed: true }
  | { allowed: false; reason: "URL_NOT_ALLOWED" | "OUTSIDE_TIME_WINDOW" };

export interface OffChainPolicyRow {
  allowedUrls: AllowedUrlEntry[];
  timeWindowStartMin: number;
  timeWindowEndMin: number;
  timeWindowDowBitmask: number;
  timezone: string;
}

export interface AllowedUrlEntry {
  pattern: string;
  max_per_call?: number;
}

export type LoadPolicy = (walletId: string) => Promise<OffChainPolicyRow | null>;
export type IsCuratedSlug = (url: string) => Promise<boolean>;

export const defaultLoadPolicy: LoadPolicy = async (walletId) => {
  const db = getDb();
  const rows = await db
    .select({
      allowedUrls: offChainPolicies.allowedUrls,
      timeWindowStartMin: offChainPolicies.timeWindowStartMin,
      timeWindowEndMin: offChainPolicies.timeWindowEndMin,
      timeWindowDowBitmask: offChainPolicies.timeWindowDowBitmask,
      timezone: offChainPolicies.timezone,
    })
    .from(offChainPolicies)
    .where(eq(offChainPolicies.walletId, walletId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    allowedUrls: (row.allowedUrls as AllowedUrlEntry[]) ?? [],
    timeWindowStartMin: row.timeWindowStartMin,
    timeWindowEndMin: row.timeWindowEndMin,
    timeWindowDowBitmask: row.timeWindowDowBitmask,
    timezone: row.timezone,
  };
};

const defaultIsCurated: IsCuratedSlug = async (url) => {
  const db = getDb();
  // The proxy uses slug-keyed lookup, but the spec says "if url ∈
  // service_catalog (curated): pass — proxy handles". In practice the curated
  // proxy receives a slug from the agent and constructs the URL itself, so
  // the URL passed here matches a row's base_url + path. Conservative: if the
  // URL starts with any enabled service's base_url, it's curated.
  const rows = await db
    .select({ baseUrl: serviceCatalog.baseUrl })
    .from(serviceCatalog)
    .where(eq(serviceCatalog.enabled, true));
  return rows.some((r) => url.startsWith(r.baseUrl));
};

/**
 * Match a URL against an allowlist pattern. Wildcards are restricted to path
 * segments only — no host wildcards. The pattern's host must equal the URL's
 * host exactly. Path segments containing only `*` match any single segment;
 * a trailing `/*` matches one or more remaining segments. No regex.
 *
 * Examples:
 *   pattern "https://api.example.com/v1/users/*" matches
 *     "https://api.example.com/v1/users/123" but not
 *     "https://api.example.com/v1/users/123/posts" (single-segment) and not
 *     "https://api.example.com/v1/products" (different second segment).
 */
export function matchUrl(url: string, pattern: string): boolean {
  let urlObj: URL;
  let patternObj: URL;
  try {
    urlObj = new URL(url);
    patternObj = new URL(pattern);
  } catch {
    return false;
  }
  if (urlObj.protocol !== patternObj.protocol) return false;
  if (urlObj.host !== patternObj.host) return false;

  const urlSegs = urlObj.pathname.split("/").filter(Boolean);
  const patternSegs = patternObj.pathname.split("/").filter(Boolean);

  for (let i = 0; i < patternSegs.length; i++) {
    const pSeg = patternSegs[i];
    const uSeg = urlSegs[i];
    if (pSeg === "*") {
      // Trailing /* matches one or more remaining segments.
      if (i === patternSegs.length - 1) return urlSegs.length > i;
      // Mid-path /* matches exactly one segment, continue.
      if (uSeg === undefined) return false;
      continue;
    }
    if (uSeg !== pSeg) return false;
  }

  // Pattern fully consumed; URL must have no extra segments unless trailing *
  return urlSegs.length === patternSegs.length;
}

export interface CheckOpts {
  walletId: string;
  url: string;
  /** ms since epoch; defaults to Date.now(). Override for deterministic tests. */
  nowMs?: number;
  loadPolicy?: LoadPolicy;
  isCurated?: IsCuratedSlug;
}

/**
 * Per spec §3.5. Returns allowed:true if either the URL belongs to a curated
 * service slug or matches the wallet's URL allowlist, AND the current time
 * falls within the wallet's time-of-day window in its timezone.
 */
export async function checkOffChainPolicy(opts: CheckOpts): Promise<OffChainCheckResult> {
  const loadPolicy = opts.loadPolicy ?? defaultLoadPolicy;
  const isCurated = opts.isCurated ?? defaultIsCurated;
  const nowMs = opts.nowMs ?? Date.now();

  const policy = await loadPolicy(opts.walletId);
  if (!policy) {
    return { allowed: false, reason: "URL_NOT_ALLOWED" };
  }

  // URL check: curated slug OR allowlist match.
  let urlOk = await isCurated(opts.url);
  if (!urlOk) {
    urlOk = policy.allowedUrls.some((entry) => matchUrl(opts.url, entry.pattern));
  }
  if (!urlOk) {
    return { allowed: false, reason: "URL_NOT_ALLOWED" };
  }

  // Time check: convert nowMs to wallet's timezone and check window.
  if (!withinTimeWindow(nowMs, policy)) {
    return { allowed: false, reason: "OUTSIDE_TIME_WINDOW" };
  }

  return { allowed: true };
}

interface TimeWindow {
  timezone: string;
  timeWindowStartMin: number;
  timeWindowEndMin: number;
  timeWindowDowBitmask: number;
}

export function withinTimeWindow(nowMs: number, w: TimeWindow): boolean {
  // Use Intl.DateTimeFormat to extract day-of-week and minute-of-day in the
  // wallet's timezone. Bun + Node both ship full Intl.
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: w.timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date(nowMs));
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hourStr = parts.find((p) => p.type === "hour")?.value ?? "0";
  const minuteStr = parts.find((p) => p.type === "minute")?.value ?? "0";

  // Mon=bit 0 ... Sun=bit 6
  const dowMap: Record<string, number> = {
    Mon: 0,
    Tue: 1,
    Wed: 2,
    Thu: 3,
    Fri: 4,
    Sat: 5,
    Sun: 6,
  };
  const dowBit = dowMap[weekday];
  if (dowBit === undefined) return false;
  if ((w.timeWindowDowBitmask & (1 << dowBit)) === 0) return false;

  const hour = Number.parseInt(hourStr, 10);
  const minute = Number.parseInt(minuteStr, 10);
  // Intl returns "24" for midnight in some impls — normalize to 0.
  const minuteOfDay = (hour === 24 ? 0 : hour) * 60 + minute;

  return minuteOfDay >= w.timeWindowStartMin && minuteOfDay < w.timeWindowEndMin;
}
