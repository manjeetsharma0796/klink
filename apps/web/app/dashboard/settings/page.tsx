"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/_components/ui/card";
import { Button } from "@/app/_components/ui/button";
import { Slider } from "@/app/_components/ui/slider";
import { Skeleton } from "@/app/_components/ui/skeleton";
import { useWalletData } from "@/_hooks/use-wallet";
import { useBuildAndSignTx } from "@/_hooks/use-build-and-sign-tx";
import { useToast } from "@/app/_components/ui/use-toast";
import { ApiError } from "@/lib/api-client";
import { MAX_BP } from "@/lib/constants";
import { BackendPending } from "../_components/backend-pending";

export default function SettingsPage() {
  const { wallet, isLoading, mutate } = useWalletData();
  const [bp, setBp] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const { run, phase } = useBuildAndSignTx();
  const { toast } = useToast();

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (!wallet) return <p className="text-sm text-muted-foreground">No wallet yet — create one first.</p>;

  const value = bp ?? wallet.maxDeployedFractionBp;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

      {pending && <BackendPending taskId="T-221" description="POST /v1/wallet/policy — build set_max_deployed_fraction tx." />}

      <Card>
        <CardHeader><CardTitle className="text-base">Max Deployed Fraction</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Maximum percentage of total balance that can be deployed to yield. Enforced on-chain.
          </p>
          <div className="text-3xl font-semibold">{value / 100}%</div>
          <Slider min={0} max={MAX_BP} step={100} value={[value]} onValueChange={(v) => setBp(v[0])} />
          <Button
            disabled={(phase !== "idle" && phase !== "done") || bp === null || bp === wallet.maxDeployedFractionBp}
            onClick={async () => {
              try {
                await run("/v1/wallet/policy", "POST", { max_deployed_fraction_bp: bp });
                toast({ title: "Policy updated" });
                setBp(null);
                mutate();
              } catch (e) {
                if (e instanceof ApiError && (e.status === 404 || e.status === 405)) setPending(true);
                else toast({ title: "Failed", description: String(e), variant: "destructive" });
              }
            }}
          >
            {phase === "idle" || phase === "done" ? "Save" : `${phase}…`}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Wallet info</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div><span className="text-muted-foreground">Owner pubkey:</span> <span className="font-mono">{wallet.ownerPubkey}</span></div>
          <div><span className="text-muted-foreground">Vault PDA:</span> <span className="font-mono">{wallet.vaultPda}</span></div>
          <div><span className="text-muted-foreground">USDC ATA:</span> <span className="font-mono">{wallet.usdcAta}</span></div>
          <div><span className="text-muted-foreground">Created:</span> {wallet.createdAt}</div>
        </CardContent>
      </Card>
    </div>
  );
}
