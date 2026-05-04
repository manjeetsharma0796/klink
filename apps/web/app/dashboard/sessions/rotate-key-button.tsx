"use client";

import { useState } from "react";
import { ApiError, api } from "@/lib/api-client";
import { useConfirm } from "@/app/_components/confirm-dialog";
import { useToast } from "@/app/_components/ui/use-toast";
import { ApiKeyRevealModal } from "./api-key-reveal-modal";

interface Props {
  sessionId: string;
  label: string;
  onRotated: () => void;
}

/**
 * Calls T-230's `POST /v1/session/:id/rotate-key` and reuses the same
 * one-time reveal modal that the create flow uses. The backend revokes
 * any previously-active api_keys for this session in the same DB
 * transaction, so the displayed key is the only valid one going forward.
 *
 * Threat model is "you saved the key when you minted it" — backend never
 * sees plaintext after this modal closes, so the only path to recover a
 * lost key is another rotation (which invalidates the old one again).
 */
export function RotateKeyButton({ sessionId, label, onRotated }: Props) {
  const [busy, setBusy] = useState(false);
  const [revealKey, setRevealKey] = useState<string | null>(null);
  const { toast } = useToast();
  const confirm = useConfirm();

  return (
    <>
      <button
        type="button"
        disabled={busy}
        className="text-xs font-medium text-olive-deep hover:underline disabled:opacity-50"
        onClick={async () => {
          const ok = await confirm({
            title: `Rotate key for "${label}"?`,
            description: "The current API key stops working immediately. Make sure any agent using it is ready for the new key.",
            confirmText: "Rotate key",
            destructive: true,
          });
          if (!ok) return;
          setBusy(true);
          try {
            const r = await api.post<{ apiKey: string; keyPrefix: string }>(
              `/v1/session/${sessionId}/rotate-key`,
            );
            setRevealKey(r.apiKey);
            onRotated();
          } catch (e) {
            const msg =
              e instanceof ApiError ? `${e.status} ${e.code}` : String(e);
            toast({
              title: "Rotate failed",
              description: msg,
              variant: "destructive",
            });
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Rotating…" : "Rotate key"}
      </button>
      <ApiKeyRevealModal
        apiKey={revealKey}
        onClose={() => setRevealKey(null)}
      />
    </>
  );
}
