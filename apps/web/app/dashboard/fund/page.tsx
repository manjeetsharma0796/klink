"use client";

import { useState } from "react";
import useSWR from "swr";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/_components/ui/card";
import { Button } from "@/app/_components/ui/button";
import { Input } from "@/app/_components/ui/input";
import { Label } from "@/app/_components/ui/label";
import { Skeleton } from "@/app/_components/ui/skeleton";
import { api } from "@/lib/api-client";
import { fundDepositAddressSchema, dodoCheckoutResponseSchema } from "@/lib/schemas";
import { useWalletData } from "@/_hooks/use-wallet";
import { useToast } from "@/app/_components/ui/use-toast";

export default function FundPage() {
  const { wallet } = useWalletData();
  // GET /v1/fund/deposit-address requires wallet_id — see apps/api/src/routes/fund.ts.
  // Skip the fetch entirely when no wallet exists yet so we don't 400 on every load.
  const fund = useSWR<unknown>(
    wallet ? `/v1/fund/deposit-address?wallet_id=${wallet.id}` : null,
  );
  const fundParsed = fund.data ? fundDepositAddressSchema.safeParse(fund.data) : null;
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  async function copyAta() {
    if (fundParsed?.success) {
      await navigator.clipboard.writeText(fundParsed.data.usdc_ata);
      toast({ title: "Address copied" });
    }
  }

  async function dodoCheckout(usd: number) {
    if (!wallet) return;
    setBusy(true);
    try {
      const r = await api.post<unknown>("/v1/fund/dodo-checkout", { amount_usd: usd, wallet_id: wallet.id });
      const parsed = dodoCheckoutResponseSchema.parse(r);
      window.location.assign(parsed.checkout_url);
    } catch (e) {
      toast({ title: "Checkout failed", description: String(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Fund</h1>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Direct deposit (free)</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {!wallet ? (
              <p className="text-sm text-muted-foreground">
                No wallet yet. Create one from Overview.
              </p>
            ) : fund.isLoading ? (
              <Skeleton className="h-40 w-40" />
            ) : fundParsed?.success ? (
              <>
                <img
                  src={fundParsed.data.qr_data_url}
                  alt="Vault USDC ATA QR"
                  className="h-40 w-40 rounded-md border"
                />
                <p className="font-mono text-xs">{fundParsed.data.usdc_ata}</p>
                <Button variant="secondary" size="sm" onClick={copyAta}>
                  Copy address
                </Button>
                <p className="text-xs text-muted-foreground">
                  Send USDC on Solana to this address. Confirms in ~400ms.
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Couldn't load deposit address. Check api logs.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Add card / fiat (Dodo)</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              {[10, 50, 100, 250].map((v) => (
                <Button key={v} variant="secondary" size="sm" disabled={busy} onClick={() => dodoCheckout(v)}>${v}</Button>
              ))}
            </div>
            <Label htmlFor="custom">Custom amount (USD)</Label>
            <div className="flex gap-2">
              <Input id="custom" type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="100" />
              <Button disabled={busy || !amount} onClick={() => dodoCheckout(Number(amount))}>Add</Button>
            </div>
            <p className="text-xs text-muted-foreground">Card processing fee applies. Settles to your vault on confirmation.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
