// Pure proxy logic for SIWS. The Next.js route handlers (app/api/auth/...)
// are thin shells over these — keeps the network choreography unit-testable
// without spinning up Next.

export type FetchLike = typeof fetch;

export interface ProxyResult {
  status: number;
  body: unknown;
  /** Present only on a successful exchange. The route handler sets the cookie. */
  jwt?: string;
}

export async function proxyNonce(deps: {
  apiBase: string;
  fetch: FetchLike;
}): Promise<ProxyResult> {
  const upstream = await deps.fetch(`${deps.apiBase}/v1/auth/siws/nonce`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  const body = await readJson(upstream);
  return { status: upstream.status, body };
}

export interface SiwsExchangeInput {
  pubkey?: unknown;
  signature?: unknown;
  nonce?: unknown;
}

export async function proxySiws(
  input: SiwsExchangeInput,
  deps: { apiBase: string; fetch: FetchLike },
): Promise<ProxyResult> {
  const { pubkey, signature, nonce } = input;
  if (typeof pubkey !== "string" || typeof signature !== "string" || typeof nonce !== "string") {
    return {
      status: 400,
      body: { error: "pubkey, signature, nonce required (strings)" },
    };
  }

  const upstream = await deps.fetch(`${deps.apiBase}/v1/auth/siws`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pubkey, signature, nonce }),
  });
  const body = await readJson(upstream);

  if (upstream.status !== 200 || !isJwtPayload(body)) {
    return { status: upstream.status, body };
  }

  // Strip the JWT from the response body — it lives in the httpOnly cookie now,
  // not in something JS can read. Surface only the userId for the dashboard.
  return {
    status: 200,
    body: { userId: body.userId },
    jwt: body.token,
  };
}

function isJwtPayload(body: unknown): body is { token: string; userId: string } {
  if (typeof body !== "object" || body === null) return false;
  const b = body as Record<string, unknown>;
  return typeof b.token === "string" && typeof b.userId === "string";
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}
