"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/app/_components/ui/dialog";
import { Button } from "@/app/_components/ui/button";
import { useBuildAndSignTx } from "@/_hooks/use-build-and-sign-tx";
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
                await run(`/v1/session/${sessionId}`, "DELETE");
                toast({ title: "Session revoked" });
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
