"use client";

import useSWR from "swr";
import { useWalletData } from "@/_hooks/use-wallet";
import { useOnChainVault } from "@/_hooks/use-on-chain-vault";
import { fundDepositAddressSchema } from "@/lib/schemas";
import { StatCard } from "./_components/stat-card";
import { BalanceCard } from "./_components/balance-card";
import { ActivityRail } from "./_components/activity-rail";
import { CreateWalletCta } from "./_components/create-wallet-cta";
import { BackendPending } from "./_components/backend-pending";

export default function DashboardPage() {
  const w = useWalletData();
  const onChain = useOnChainVault(w.wallet?.ownerPubkey ?? null);
  const fund = useSWR<unknown>(w.wallet ? "/v1/fund/deposit-address" : null);
  const fundParsed = fund.data ? fundDepositAddressSchema.safeParse(fund.data) : null;

  if (w.notFound) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <CreateWalletCta />
      </div>
    );
  }

  if (w.error) {
    // Most likely T-224 not yet shipped — graceful fallback.
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <BackendPending taskId="T-224" description="GET /v1/wallet — read wallet info. Required to render the overview." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
      <div className="grid gap-6 lg:grid-cols-3">
        <StatCard
          title="Wallet Settings"
          loading={w.isLoading}
          rows={[
            {
              label: "Max Deployed",
              value: w.wallet ? `${w.wallet.maxDeployedFractionBp / 100}%` : null,
              href: "/dashboard/settings",
              cta: "Configure",
            },
            { label: "Active Sessions", value: "—", href: "/dashboard/sessions", cta: "Manage" },
            {
              label: "Vault PDA",
              value: w.wallet?.vaultPda ?? null,
              mono: true,
            },
          ]}
        />
        <BalanceCard
          loading={onChain.isLoading || fund.isLoading}
          liquid={onChain.data?.liquid ?? null}
          deployed={onChain.data?.deployed ?? null}
          vaultPda={onChain.data?.vaultPda ?? null}
          qrDataUrl={fundParsed?.success ? fundParsed.data.qr_data_url : null}
        />
        <ActivityRail />
      </div>
    </div>
  );
}
