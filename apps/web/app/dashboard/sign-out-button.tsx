"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useRouter } from "next/navigation";
import { Button } from "@/app/_components/ui/button";

export function SignOutButton() {
  const router = useRouter();
  const { disconnect } = useWallet();
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={async () => {
        // T-247: disconnect the wallet first so the wallet-adapter's cached
        // selection is cleared. Without this, after sign-out the adapter
        // still thinks it is connected to the previous wallet, and the
        // WalletMultiButton stays in a stale state when the user wants to
        // pick a different wallet.
        try {
          await disconnect();
        } catch {
          // disconnect() can throw if the wallet was already disconnected
          // (race with another tab, extension reload, etc). Best-effort,
          // continue with logout regardless.
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
