"use client";

import { useBuildAndSignTx } from "@/_hooks/use-build-and-sign-tx";
import { Button } from "@/app/_components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/_components/ui/card";
import { useToast } from "@/app/_components/ui/use-toast";
import { api } from "@/lib/api-client";
import { useState } from "react";
import { useSWRConfig } from "swr";

export function CreateWalletCta() {
  const [busy, setBusy] = useState(false);
  const { run, error, phase } = useBuildAndSignTx();
  const { toast } = useToast();
  const { mutate } = useSWRConfig();

  return (
    <Card className="col-span-full border-dashed bg-muted/20">
      <CardHeader>
        <CardTitle>Create your klink wallet</CardTitle>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-6">
        <p className="text-sm text-muted-foreground">
          One-time setup. Your wallet signs the <code className="font-mono">init_vault</code> tx; the
          backend never sees your key.
        </p>
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const result = await run("/v1/wallet", "POST", { max_deployed_fraction_bp: 8000 });
              if (result.buildResponse.alreadyExists) {
                // Self-heal path: backend found the vault already on-chain
                // and backfilled the wallets row in this same call. Nothing
                // more to do.
                toast({
                  title: "Wallet linked",
                  description:
                    "An on-chain vault already existed for this wallet — linked it to your account.",
                });
              } else {
                // Build-tx branch only returns the unsigned tx; it does NOT
                // INSERT a wallets row. After Phantom signed and the on-chain
                // init_vault confirmed, POST /v1/wallet again — this time the
                // backend sees the on-chain vault, takes the alreadyExists
                // branch, and backfills the DB row. Without this second call,
                // GET /v1/wallet stays 404 forever and the CTA renders
                // forever (T-225).
                await api.post("/v1/wallet", { max_deployed_fraction_bp: 8000 });
                toast({ title: "Wallet created", description: "Your vault is live on-chain." });
              }
              mutate("/v1/wallet");
            } catch (e) {
              toast({
                title: "Failed",
                description: error?.message ?? String(e),
                variant: "destructive",
              });
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? `${phase}…` : "Create wallet"}
        </Button>
      </CardContent>
    </Card>
  );
}
