import { NextResponse } from "next/server";
import {
  COOKIE_MAX_AGE_SECONDS,
  COOKIE_NAME,
  getApiBaseUrl,
  isCookieSecure,
} from "../../../../lib/auth-config";
import { proxySiws } from "../../../../lib/siws-proxy";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const result = await proxySiws(payload as Record<string, unknown>, {
    apiBase: getApiBaseUrl(),
    fetch,
  });

  const res = NextResponse.json(result.body, { status: result.status });
  if (result.jwt) {
    res.cookies.set({
      name: COOKIE_NAME,
      value: result.jwt,
      httpOnly: true,
      sameSite: "lax",
      secure: isCookieSecure(),
      path: "/",
      maxAge: COOKIE_MAX_AGE_SECONDS,
    });
  }
  return res;
}
