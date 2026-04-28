import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_NAME } from "../../lib/auth-config";
import { verifyKlinkJwt } from "../../lib/jwt";
import { SignOutButton } from "./sign-out-button";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const token = cookies().get(COOKIE_NAME)?.value;
  const session = token ? await verifyKlinkJwt(token) : null;
  if (!session) {
    redirect("/");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-gray-50 p-8">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="max-w-md text-center text-sm text-gray-600">
        Signed in as <code className="rounded bg-gray-200 px-1">{session.pubkey}</code>
      </p>
      <p className="text-xs text-gray-400">
        Wallet creation, sessions, and audit views land in T-303 / T-304 / T-306.
      </p>
      <SignOutButton />
    </main>
  );
}
