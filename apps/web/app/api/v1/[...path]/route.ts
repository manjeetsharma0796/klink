import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME, getApiBaseUrl } from "../../../../lib/auth-config";

export const dynamic = "force-dynamic";

// Catch-all proxy that fronts the backend api on the same origin as the
// dashboard. Two reasons it exists:
//
// 1. CORS — the backend doesn't ship CORS headers; cross-origin browser
//    fetches would be blocked. Same-origin via Next.js sidesteps this
//    without touching the backend.
//
// 2. Auth header — the backend reads `Authorization: Bearer <jwt>` and
//    ignores cookies. The httpOnly `klink_session` cookie isn't reachable
//    from client JS, so we read it server-side here and forward as the
//    Bearer header. Net effect: dashboard fetches feel cookie-authed but
//    upstream stays header-authed.

async function proxy(req: NextRequest, ctx: { params: { path: string[] } }) {
  const apiBase = getApiBaseUrl();
  const segments = ctx.params.path ?? [];
  const search = req.nextUrl.search; // includes leading "?"
  const upstreamUrl = `${apiBase}/v1/${segments.join("/")}${search}`;

  const headers = new Headers();
  const ct = req.headers.get("content-type");
  if (ct) headers.set("content-type", ct);
  const accept = req.headers.get("accept");
  if (accept) headers.set("accept", accept);

  const token = cookies().get(COOKIE_NAME)?.value;
  if (token) headers.set("authorization", `Bearer ${token}`);

  const init: RequestInit = { method: req.method, headers };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = await req.arrayBuffer();
  }

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, init);
  } catch (err) {
    console.error("[/api/v1 proxy]", req.method, segments.join("/"), err);
    return NextResponse.json({ error: "upstream unreachable" }, { status: 502 });
  }

  const body = await upstream.arrayBuffer();
  const out = new NextResponse(body, { status: upstream.status });
  const upstreamCt = upstream.headers.get("content-type");
  if (upstreamCt) out.headers.set("content-type", upstreamCt);
  return out;
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const PUT = proxy;
