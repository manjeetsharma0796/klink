import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_NAME } from "../lib/auth-config";
import { verifyKlinkJwt } from "../lib/jwt";
import { SignIn } from "./sign-in";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (token && (await verifyKlinkJwt(token))) redirect("/dashboard");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-muted/30 p-8">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-4xl font-semibold tracking-tight">klink</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          Non-custodial Solana wallet for AI agents. On-chain spend caps, allowlists, and audit by default.
        </p>
      </div>
      <div className="rounded-xl border bg-card p-8 shadow-sm">
        <SignIn />
      </div>
    </main>
  );
}
