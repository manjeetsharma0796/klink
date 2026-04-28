"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function SignOutButton() {
  const { disconnect } = useWallet();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await fetch("/api/auth/logout", { method: "POST" });
          await disconnect().catch(() => undefined);
          router.push("/");
          router.refresh();
        } finally {
          setBusy(false);
        }
      }}
      className="rounded border border-gray-300 bg-white px-3 py-1 text-sm hover:bg-gray-100 disabled:opacity-50"
    >
      Sign out
    </button>
  );
}
