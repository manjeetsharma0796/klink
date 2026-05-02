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

  const res = await fetch(url, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    credentials: "include",
    signal: opts.signal,
  });

  if (!res.ok) {
    let detail: unknown;
    try {
      detail = await res.json();
    } catch {
      detail = await res.text();
    }
    const code = (detail as { error?: string })?.error ?? `HTTP_${res.status}`;
    // Surface server errors so failed mutations aren't swallowed; success
    // responses stay quiet to avoid the dev-tools render-storm seen during
    // SWR revalidation cycles.
    console.warn(`[klink:fetch] ← ${method} ${url} ${res.status} error=${code}`, detail);
    throw new ApiError(res.status, code, code, detail);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T,>(p: string, o?: ApiClientOpts) => call<T>("GET", p, o),
  post: <T,>(p: string, body?: unknown, o?: ApiClientOpts) => call<T>("POST", p, { ...o, body }),
  patch: <T,>(p: string, body?: unknown, o?: ApiClientOpts) => call<T>("PATCH", p, { ...o, body }),
  del: <T,>(p: string, o?: ApiClientOpts) => call<T>("DELETE", p, o),
};

export const swrFetcher = <T,>(path: string): Promise<T> => api.get<T>(path);
