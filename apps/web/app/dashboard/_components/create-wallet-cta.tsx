"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/_components/ui/card";
import { Button } from "@/app/_components/ui/button";
import { useBuildAndSignTx } from "@/_hooks/use-build-and-sign-tx";
import { useToast } from "@/app/_components/ui/use-toast";
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
          One-time setup. Phantom signs the <code className="font-mono">init_vault</code> tx; the backend never sees your key.
        </p>
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await run("/v1/wallet", "POST", { max_deployed_fraction_bp: 8000 });
              toast({ title: "Wallet created", description: "Your vault is live on-chain." });
              mutate("/v1/wallet");
            } catch (e) {
              toast({ title: "Failed", description: error?.message ?? String(e), variant: "destructive" });
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
