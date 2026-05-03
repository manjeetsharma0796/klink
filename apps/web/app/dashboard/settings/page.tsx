"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/_components/ui/card";
import { Button } from "@/app/_components/ui/button";
import { Input } from "@/app/_components/ui/input";
import { Label } from "@/app/_components/ui/label";
import { Slider } from "@/app/_components/ui/slider";
import { Skeleton } from "@/app/_components/ui/skeleton";
import { useWalletData } from "@/_hooks/use-wallet";
import { useBuildAndSignTx } from "@/_hooks/use-build-and-sign-tx";
import { useToast } from "@/app/_components/ui/use-toast";
import { MAX_BP } from "@/lib/constants";

export default function SettingsPage() {
  const { wallet, isLoading, mutate } = useWalletData();
  const [bp, setBp] = useState<number | null>(null);
  const { run, phase } = useBuildAndSignTx();
  const { toast } = useToast();

  // Emergency drain (T-116 / T-235) is intentionally a separate hook instance
  // so its phase doesn't conflict with the policy slider above.
  const drain = useBuildAndSignTx();
  const [drainAddress, setDrainAddress] = useState("");
  const [drainAmount, setDrainAmount] = useState("");

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (!wallet) return <p className="text-sm text-muted-foreground">No wallet yet — create one first.</p>;

  const value = bp ?? wallet.maxDeployedFractionBp;
  const drainBusy = drain.phase !== "idle" && drain.phase !== "done" && drain.phase !== "error";

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

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
                toast({ title: "Failed", description: String(e), variant: "destructive" });
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

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-base text-destructive">Danger zone — emergency drain</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Move USDC out of the vault directly to any Solana address. Bypasses every session
            policy — no allowlist, no per-tx cap, no daily cap. Signed by your Phantom; the
            backend never holds your key. Use this if klink is offline and you want to recover funds.
          </p>
          <div className="space-y-2">
            <Label htmlFor="drain-recipient">Recipient pubkey</Label>
            <Input
              id="drain-recipient"
              value={drainAddress}
              onChange={(e) => setDrainAddress(e.target.value)}
              placeholder="e.g. 6fELFcucWR7CPrBrRmfAs8tNjvt5dUnQDk3cguAtdrjZ"
              className="font-mono"
              spellCheck={false}
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="drain-amount">Amount (USDC)</Label>
            <Input
              id="drain-amount"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.000001"
              value={drainAmount}
              onChange={(e) => setDrainAmount(e.target.value)}
              placeholder="100"
            />
            <p className="text-xs text-muted-foreground">
              Converted to USDC base units (×1,000,000) before signing.
            </p>
          </div>
          <Button
            variant="destructive"
            disabled={drainBusy || !drainAddress.trim() || !drainAmount.trim() || Number(drainAmount) <= 0}
            onClick={async () => {
              const usdc = Number(drainAmount);
              if (!Number.isFinite(usdc) || usdc <= 0) {
                toast({ title: "Enter a positive amount", variant: "destructive" });
                return;
              }
              const baseUnits = Math.round(usdc * 1_000_000);
              const ok = window.confirm(
                `Transfer ${usdc} USDC from your vault to ${drainAddress.trim()}?\n\nThis bypasses session policy and cannot be undone.`,
              );
              if (!ok) return;
              try {
                const result = await drain.run("/v1/wallet/transfer", "POST", {
                  amount: baseUnits,
                  recipient: drainAddress.trim(),
                  wallet_id: wallet.id,
                });
                toast({
                  title: "Drain submitted",
                  description: result.signature ? `tx ${result.signature.slice(0, 12)}…` : "ok",
                });
                setDrainAmount("");
              } catch (e) {
                toast({ title: "Drain failed", description: String(e), variant: "destructive" });
              }
            }}
          >
            {drain.phase === "idle" || drain.phase === "done" || drain.phase === "error"
              ? "Drain to recipient"
              : `${drain.phase}…`}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
