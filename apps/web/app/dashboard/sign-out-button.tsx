"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useRouter } from "next/navigation";
import { Button } from "@/app/_components/ui/button";

export function SignOutButton() {
  const router = useRouter();
  const { disconnect, select } = useWallet();
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={async () => {
        // T-247 + T-250: disconnect the live wallet AND clear the cached
        // wallet name so the next page load has nothing to autoConnect to.
        // Without select(null), even after disconnect() the adapter
        // remembers the previously-selected wallet, and on next mount
        // autoConnect re-prompts Phantom for the same wallet, blocking
        // the user from picking a different one.
        try {
          await disconnect();
        } catch {
          // disconnect() can throw if the wallet was already disconnected
          // (race with another tab, extension reload, etc). Best-effort,
          // continue with logout regardless.
        }
        try {
          select(null);
        } catch {
          // select(null) is documented to clear the selection and should
          // not throw, but tolerate it just in case to keep sign-out
          // robust.
        }
        await fetch("/api/auth/logout", { method: "POST" });
        router.push("/");
        router.refresh();
      }}
    >
      Sign out
    </Button>
  );
}
