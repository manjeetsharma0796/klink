import { NextResponse } from "next/server";
import { getApiBaseUrl } from "../../../../../lib/auth-config";
import { proxyNonce } from "../../../../../lib/siws-proxy";

export const runtime = "nodejs";

export async function POST() {
  const result = await proxyNonce({ apiBase: getApiBaseUrl(), fetch });
  return NextResponse.json(result.body, { status: result.status });
}
