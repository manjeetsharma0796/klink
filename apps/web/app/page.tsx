import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_NAME } from "../lib/auth-config";
import { verifyKlinkJwt } from "../lib/jwt";
import { SignIn } from "./sign-in";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (token && (await verifyKlinkJwt(token))) {
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-gray-50 p-8">
      <h1 className="text-3xl font-semibold">Klink</h1>
      <p className="max-w-md text-center text-sm text-gray-600">
        Agent wallets on Solana. Connect Phantom to sign in.
      </p>
      <SignIn />
    </main>
  );
}
