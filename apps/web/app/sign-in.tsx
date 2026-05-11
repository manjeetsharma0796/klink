"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import bs58 from "bs58";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { siwsMessage } from "../lib/siws-message";

type Phase = "idle" | "requesting-nonce" | "awaiting-signature" | "exchanging" | "done" | "error";

export function SignIn() {
  const { publicKey, signMessage, connected, disconnect } = useWallet();
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);

  // T-247: hydration guard. WalletMultiButton renders different HTML on
  // server vs client (server: empty button, client: button with the wallet
  // icon `<i>` once the adapter detects Phantom via Wallet Standard). Only
  // render the wallet UI after mount so SSR and the first client render
  // produce identical markup.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const signIn = useCallback(async () => {
    if (!publicKey || !signMessage) {
      setError("wallet does not support message signing");
      setPhase("error");
      return;
    }
    setError(null);

    try {
      setPhase("requesting-nonce");
      const nonceRes = await fetch("/api/auth/siws/nonce", { method: "POST" });
      if (!nonceRes.ok) throw new Error(`nonce request failed (${nonceRes.status})`);
      const { nonce } = (await nonceRes.json()) as { nonce: string };
      if (!nonce) throw new Error("server returned no nonce");

      setPhase("awaiting-signature");
      const message = new TextEncoder().encode(siwsMessage(nonce));
      const signatureBytes = await signMessage(message);

      setPhase("exchanging");
      const exchange = await fetch("/api/auth/siws", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          pubkey: publicKey.toBase58(),
          signature: bs58.encode(signatureBytes),
          nonce,
        }),
      });
      if (!exchange.ok) {
        const body = (await exchange.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `sign-in failed (${exchange.status})`);
      }

      setPhase("done");
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "sign-in failed");
      setPhase("error");
    }
  }, [publicKey, signMessage, router]);

  // T-247: reset local error/phase state when the wallet disconnects, so a
  // failed connect (user rejected, switched wallet, etc.) doesn't leave the
  // page stuck on a stale "error" phase.
  useEffect(() => {
    if (!connected) {
      setPhase("idle");
      setError(null);
    }
  }, [connected]);

  useEffect(() => {
    if (connected && phase === "idle") {
      void signIn();
    }
  }, [connected, phase, signIn]);

  // SSR / first-render placeholder. Same height as the loaded button so the
  // layout doesn't jump when the real button mounts.
  if (!mounted) {
    return (
      <div className="flex flex-col items-center gap-3">
        <div className="h-12 w-48 rounded-pill bg-muted/40" aria-hidden />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <WalletMultiButton />
      {connected && phase !== "done" && (
        <p className="text-sm text-muted-foreground">{phaseLabel(phase)}</p>
      )}
      {phase === "error" && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-sm text-destructive">{error ?? "sign-in failed"}</p>
          <button
            type="button"
            onClick={() => {
              setPhase("idle");
              void signIn();
            }}
            className="rounded-pill border border-input bg-card px-3 py-1 text-sm hover:bg-secondary/50"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => {
              void disconnect();
              setPhase("idle");
              setError(null);
            }}
            className="text-xs text-muted-foreground underline"
          >
            Disconnect wallet
          </button>
        </div>
      )}
    </div>
  );
}

function phaseLabel(p: Phase): string {
  switch (p) {
    case "requesting-nonce":
      return "Requesting nonce...";
    case "awaiting-signature":
      return "Approve the sign-in message in your wallet";
    case "exchanging":
      return "Verifying signature...";
    case "done":
      return "Signed in.";
    default:
      return "";
  }
}
