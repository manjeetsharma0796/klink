import { NextResponse } from "next/server";
import { COOKIE_NAME, isCookieSecure } from "../../../../lib/auth-config";

export const runtime = "nodejs";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: isCookieSecure(),
    path: "/",
    maxAge: 0,
  });
  return res;
}
