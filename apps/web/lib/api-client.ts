export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public detail?: unknown,
  ) {
    super(message);
  }
}

export interface ApiClientOpts {
  signal?: AbortSignal;
  body?: unknown;
}

// Dashboard fetches go through the same-origin Next.js proxy at /api/v1/*
// (apps/web/app/api/v1/[...path]/route.ts), which reads the httpOnly
// klink_session cookie server-side and forwards as Authorization: Bearer.
// This sidesteps cross-origin CORS and the backend's header-only auth in
// one shot. Plain absolute URLs (http://...) still bypass the rewrite.
async function call<T>(method: string, path: string, opts: ApiClientOpts = {}): Promise<T> {
  const url = path.startsWith("http") ? path : `/api${path}`;
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["content-type"] = "application/json";

  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  console.log(`[klink:fetch] → ${method} ${url}`, opts.body ? { body: opts.body } : "");

  const res = await fetch(url, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    credentials: "include",
    signal: opts.signal,
  });

  const ms = Math.round(
    (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0,
  );

  if (!res.ok) {
    let detail: unknown;
    try {
      detail = await res.json();
    } catch {
      detail = await res.text();
    }
    const code = (detail as { error?: string })?.error ?? `HTTP_${res.status}`;
    console.warn(`[klink:fetch] ← ${method} ${url} ${res.status} (${ms}ms) error=${code}`, detail);
    throw new ApiError(res.status, code, code, detail);
  }
  if (res.status === 204) {
    console.log(`[klink:fetch] ← ${method} ${url} 204 (${ms}ms)`);
    return undefined as T;
  }
  const data = (await res.json()) as T;
  console.log(`[klink:fetch] ← ${method} ${url} ${res.status} (${ms}ms)`, data);
  return data;
}

export const api = {
  get: <T,>(p: string, o?: ApiClientOpts) => call<T>("GET", p, o),
  post: <T,>(p: string, body?: unknown, o?: ApiClientOpts) => call<T>("POST", p, { ...o, body }),
  patch: <T,>(p: string, body?: unknown, o?: ApiClientOpts) => call<T>("PATCH", p, { ...o, body }),
  del: <T,>(p: string, o?: ApiClientOpts) => call<T>("DELETE", p, o),
};

export const swrFetcher = <T,>(path: string): Promise<T> => api.get<T>(path);
