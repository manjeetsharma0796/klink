import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { COOKIE_NAME } from "../../lib/auth-config";
import { verifyKlinkJwt } from "../../lib/jwt";
import { ConfirmProvider } from "@/app/_components/confirm-dialog";
import { ProgressProvider } from "@/app/_components/progress-context";
import { RouteProgressFlash } from "@/app/_components/route-progress-flash";
import { Toaster } from "@/app/_components/ui/toaster";
import { Sidebar } from "./_components/sidebar";
import { Topbar } from "./_components/topbar";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const token = cookies().get(COOKIE_NAME)?.value;
  const session = token ? await verifyKlinkJwt(token) : null;
  if (!session) redirect("/");

  return (
    <ProgressProvider>
      <ConfirmProvider>
        <RouteProgressFlash />
        <div className="flex min-h-screen">
          <Sidebar />
          <div className="flex flex-1 flex-col">
            <Topbar pubkey={session.pubkey} />
            <main className="flex-1 px-8 py-8">
              <div className="mx-auto max-w-7xl">{children}</div>
            </main>
          </div>
          <Toaster />
        </div>
      </ConfirmProvider>
    </ProgressProvider>
  );
}
