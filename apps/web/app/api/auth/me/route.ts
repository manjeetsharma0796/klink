import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { COOKIE_NAME } from "../../../../lib/auth-config";
import { verifyKlinkJwt } from "../../../../lib/jwt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ error: "not signed in" }, { status: 401 });
  }
  const session = await verifyKlinkJwt(token);
  if (!session) {
    return NextResponse.json({ error: "invalid session" }, { status: 401 });
  }
  return NextResponse.json(session);
}
