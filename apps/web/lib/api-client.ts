import { API_BASE_URL } from "./constants";

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

async function call<T>(method: string, path: string, opts: ApiClientOpts = {}): Promise<T> {
  const url = path.startsWith("http") ? path : `${API_BASE_URL}${path}`;
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["content-type"] = "application/json";

  const res = await fetch(url, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    credentials: "include", // sends siws cookie set by /api/auth/siws
    signal: opts.signal,
  });

  if (!res.ok) {
    let detail: unknown;
    try { detail = await res.json(); } catch { detail = await res.text(); }
    const code = (detail as { error?: string })?.error ?? `HTTP_${res.status}`;
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
