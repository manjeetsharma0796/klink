import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { COOKIE_NAME } from "../../lib/auth-config";
import { verifyKlinkJwt } from "../../lib/jwt";
import { ConfirmProvider } from "@/app/_components/confirm-dialog";
import { ProgressProvider } from "@/app/_components/progress-context";
import { RouteProgressFlash } from "@/app/_components/route-progress-flash";
import { Toaster } from "@/app/_components/ui/toaster";
import { Sidebar } from "./_components/sidebar";
import { Topbar } from "./_components/topbar";
import { SignInGate } from "./_components/sign-in-gate";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const token = cookies().get(COOKIE_NAME)?.value;
  const session = token ? await verifyKlinkJwt(token) : null;
  const signedIn = !!session;

  return (
    <ProgressProvider>
      <ConfirmProvider>
        <RouteProgressFlash />
        <div className="relative flex min-h-screen">
          <Sidebar />
          <div className="flex flex-1 flex-col">
            <Topbar pubkey={session?.pubkey ?? null} />
            <main className="klink-glow-bg relative flex-1 px-6 py-10 md:px-10 md:py-12">
              <div className="relative mx-auto max-w-7xl">
                {signedIn ? (
                  children
                ) : (
                  // Soft placeholder behind the sign-in gate — gives the gate
                  // a visually grounded backdrop without firing the SWR hooks
                  // in the real dashboard pages (which would all 401 against
                  // the missing JWT and clutter the network log).
                  <div
                    aria-hidden
                    className="pointer-events-none select-none space-y-8 opacity-50 blur-[2px]"
                  >
                    <div className="h-9 w-40 rounded-md bg-muted" />
                    <div className="h-5 w-72 rounded-md bg-muted/70" />
                    <div className="grid gap-6 lg:grid-cols-3">
                      <div className="h-64 rounded-[var(--radius)] bg-muted" />
                      <div className="h-64 rounded-[var(--radius)] bg-muted" />
                      <div className="h-64 rounded-[var(--radius)] bg-muted" />
                    </div>
                  </div>
                )}
              </div>
            </main>
          </div>
          <Toaster />
          {!signedIn && <SignInGate />}
        </div>
      </ConfirmProvider>
    </ProgressProvider>
  );
}
