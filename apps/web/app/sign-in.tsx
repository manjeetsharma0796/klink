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

  useEffect(() => {
    if (connected && phase === "idle") {
      void signIn();
    }
  }, [connected, phase, signIn]);

  return (
    <div className="flex flex-col items-center gap-3">
      <WalletMultiButton />
      {connected && phase !== "done" && (
        <p className="text-sm text-gray-600">{phaseLabel(phase)}</p>
      )}
      {phase === "error" && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-sm text-red-600">{error ?? "sign-in failed"}</p>
          <button
            type="button"
            onClick={() => {
              setPhase("idle");
              void signIn();
            }}
            className="rounded border border-gray-300 bg-white px-3 py-1 text-sm hover:bg-gray-100"
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
            className="text-xs text-gray-500 underline"
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
      return "Requesting nonce…";
    case "awaiting-signature":
      return "Approve the sign-in message in Phantom";
    case "exchanging":
      return "Verifying signature…";
    case "done":
      return "Signed in.";
    default:
      return "";
  }
}
