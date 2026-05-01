"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/_components/ui/card";
import { Button } from "@/app/_components/ui/button";
import { Input } from "@/app/_components/ui/input";
import { Label } from "@/app/_components/ui/label";
import { useWalletData } from "@/_hooks/use-wallet";
import { useOnChainVault } from "@/_hooks/use-on-chain-vault";
import { useBuildAndSignTx } from "@/_hooks/use-build-and-sign-tx";
import { useToast } from "@/app/_components/ui/use-toast";
import { ApiError } from "@/lib/api-client";
import { formatUsdc, parseUsdcInput } from "@/lib/formatters";
import { MAX_BP } from "@/lib/constants";
import { BackendPending } from "../_components/backend-pending";

export default function YieldPage() {
  const { publicKey } = useWallet();
  const { wallet } = useWalletData();
  const onChain = useOnChainVault(publicKey?.toBase58() ?? null);
  const [depositInput, setDepositInput] = useState("");
  const [withdrawInput, setWithdrawInput] = useState("");
  const [pending, setPending] = useState<"deposit" | "withdraw" | null>(null);
  const { run, phase } = useBuildAndSignTx();
  const { toast } = useToast();

  const liquid = onChain.data?.liquid ?? BigInt(0);
  const deployed = onChain.data?.deployed ?? BigInt(0);
  const total = liquid + deployed;
  const maxBp = wallet?.maxDeployedFractionBp ?? 0;

  async function submit(kind: "deposit" | "withdraw") {
    const raw = kind === "deposit" ? depositInput : withdrawInput;
    const baseUnits = parseUsdcInput(raw);
    if (baseUnits === null || baseUnits === 0) {
      toast({ title: "Enter a valid USDC amount", variant: "destructive" });
      return;
    }
    try {
      await run(`/v1/yield/${kind}`, "POST", { amount: baseUnits, wallet_id: wallet?.vaultPda });
      toast({ title: `${kind} confirmed` });
      onChain.mutate();
    } catch (e) {
      if (e instanceof ApiError && (e.status === 404 || e.status === 405)) setPending(kind);
      else toast({ title: "Failed", description: String(e), variant: "destructive" });
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Yield</h1>

      {pending && (
        <BackendPending
          taskId="T-222"
          description={`POST /v1/yield/${pending} (dashboard-JWT path) — owner build-tx-then-sign for Kamino. Currently only the agent-API-key path is implemented in T-213.`}
        />
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Liquid</CardTitle></CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{formatUsdc(liquid)}</div>
            <p className="mt-2 text-xs text-muted-foreground">Available for spend.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Deployed</CardTitle></CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{formatUsdc(deployed)}</div>
            <p className="mt-2 text-xs text-muted-foreground">
              {total > 0 ? `${Number((deployed * BigInt(10000)) / total) / 100}% of total` : "—"} · cap {maxBp / 100}%
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Deposit to Kamino</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Label htmlFor="dep">Amount (USDC)</Label>
            <Input id="dep" inputMode="decimal" value={depositInput} onChange={(e) => setDepositInput(e.target.value)} placeholder="100.00" />
            <Button disabled={phase !== "idle" && phase !== "done"} onClick={() => submit("deposit")}>
              {phase === "idle" || phase === "done" ? "Deposit" : `${phase}…`}
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Withdraw from Kamino</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Label htmlFor="wd">Amount (USDC)</Label>
            <Input id="wd" inputMode="decimal" value={withdrawInput} onChange={(e) => setWithdrawInput(e.target.value)} placeholder="100.00" />
            <Button variant="secondary" disabled={phase !== "idle" && phase !== "done"} onClick={() => submit("withdraw")}>
              {phase === "idle" || phase === "done" ? "Withdraw" : `${phase}…`}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
