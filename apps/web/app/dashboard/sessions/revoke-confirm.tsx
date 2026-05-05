"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/app/_components/ui/dialog";
import { Button } from "@/app/_components/ui/button";
import { useBuildAndSignTx } from "@/_hooks/use-build-and-sign-tx";
import { api } from "@/lib/api-client";
import { useToast } from "@/app/_components/ui/use-toast";

interface Props { sessionId: string; label: string; onRevoked: () => void; }

export function RevokeConfirm({ sessionId, label, onRevoked }: Props) {
  const [open, setOpen] = useState(false);
  const { run, phase } = useBuildAndSignTx();
  const { toast } = useToast();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-destructive">Revoke</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Revoke session "{label}"?</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">
          The on-chain session account is closed; the API key is disabled. This is immediate and reversible only by creating a new session.
        </p>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            variant="destructive"
            disabled={phase !== "idle" && phase !== "done"}
            onClick={async () => {
              try {
                const result = await run(`/v1/session/${sessionId}`, "DELETE");
                if (result.buildResponse.alreadyExists) {
                  // T-232 self-heal: backend found no on-chain Session PDA
                  // (DB-only ghost or already-closed) and soft-revoked the
                  // DB rows in this same call. Nothing more to do  Phantom
                  // was never prompted.
                  toast({
                    title: "Session marked revoked",
                    description: "On-chain session was already closed.",
                  });
                } else {
                  // Phantom just signed + submitted the revoke_session tx. Hit
                  // DELETE again so the backend sees the now-closed PDA and
                  // takes the soft-revoke branch (sessions.revokedAt updated;
                  // api_keys soft-revoked; audit_log entry written). Without
                  // this second call the dashboard would still show the row
                  // as "active" until manual cleanup.
                  await api.del(`/v1/session/${sessionId}`);
                  toast({ title: "Session revoked" });
                }
                setOpen(false);
                onRevoked();
              } catch (e) {
                toast({ title: "Failed to revoke", description: String(e), variant: "destructive" });
              }
            }}
          >
            {phase === "idle" || phase === "done" ? "Revoke" : `${phase}…`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
