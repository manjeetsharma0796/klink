"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/_components/ui/card";
import { Button } from "@/app/_components/ui/button";
import { useBuildAndSignTx } from "@/_hooks/use-build-and-sign-tx";
import { useToast } from "@/app/_components/ui/use-toast";
import { INSTRUCTION_BITS } from "@/lib/constants";

interface Props { sessionId: string; current: number; onSaved: () => void; }

export function InstructionBitmap({ sessionId, current, onSaved }: Props) {
  const [transfer, setTransfer] = useState(((current >> INSTRUCTION_BITS.TRANSFER_USDC) & 1) === 1);
  const [deposit, setDeposit] = useState(((current >> INSTRUCTION_BITS.KAMINO_DEPOSIT) & 1) === 1);
  const [withdraw, setWithdraw] = useState(((current >> INSTRUCTION_BITS.KAMINO_WITHDRAW) & 1) === 1);
  const { run, phase } = useBuildAndSignTx();
  const { toast } = useToast();

  const computed =
    (transfer ? 1 << INSTRUCTION_BITS.TRANSFER_USDC : 0) |
    (deposit ? 1 << INSTRUCTION_BITS.KAMINO_DEPOSIT : 0) |
    (withdraw ? 1 << INSTRUCTION_BITS.KAMINO_WITHDRAW : 0);

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Allowed instructions (on-chain)</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={transfer} onChange={(e) => setTransfer(e.target.checked)} /> transfer_usdc (bit 0)</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={deposit} onChange={(e) => setDeposit(e.target.checked)} /> kamino_deposit (bit 1)</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={withdraw} onChange={(e) => setWithdraw(e.target.checked)} /> kamino_withdraw (bit 2)</label>
        <p className="font-mono text-xs text-muted-foreground">computed bitmap: 0b{computed.toString(2).padStart(3, "0")} ({computed})</p>
        <Button
          disabled={phase !== "idle" && phase !== "done"}
          onClick={async () => {
            try {
              await run(`/v1/session/${sessionId}/allowlist`, "PATCH", { action: "Set", allowed_instructions: computed });
              toast({ title: "Bitmap updated" });
              onSaved();
            } catch (e) {
              toast({ title: "Failed", description: String(e), variant: "destructive" });
            }
          }}
        >
          {phase === "idle" || phase === "done" ? "Save bitmap" : `${phase}…`}
        </Button>
      </CardContent>
    </Card>
  );
}
