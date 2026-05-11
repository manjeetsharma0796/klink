"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/app/_components/ui/dialog";
import { SignIn } from "@/app/sign-in";

/**
 * Non-dismissable wallet sign-in gate that floats over the dashboard chrome
 * when the JWT cookie is missing. The landing page (separate repo) hands
 * users straight into /dashboard; this gate prompts them to sign before
 * any dashboard data is shown. On success, the inner SignIn component
 * calls router.refresh() which re-runs the layout's server-side JWT check
 * and the gate falls away automatically.
 */
export function SignInGate() {
  return (
    <Dialog open modal>
      <DialogContent
        hideClose
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        className="max-w-md gap-6 sm:p-8"
      >
        <DialogHeader className="items-center text-center sm:text-center">
          <img
            src="/icon.png"
            alt=""
            width={56}
            height={56}
            className="mb-1 h-14 w-14 rounded-2xl shadow-[var(--shadow-pill)]"
          />
          <DialogTitle className="text-xl">Sign in to klink</DialogTitle>
          <DialogDescription className="max-w-[44ch] leading-relaxed">
            Connect your Solana wallet and approve the sign-in message to access your agent vault.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-2 pt-1">
          <SignIn />
        </div>
      </DialogContent>
    </Dialog>
  );
}
