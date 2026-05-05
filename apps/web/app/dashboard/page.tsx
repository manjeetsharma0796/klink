"use client";

import useSWR from "swr";
import { useWalletData } from "@/_hooks/use-wallet";
import { useSessions } from "@/_hooks/use-sessions";
import { useOnChainVault } from "@/_hooks/use-on-chain-vault";
import { fundDepositAddressSchema } from "@/lib/schemas";
import { StatCard } from "./_components/stat-card";
import { BalanceCard } from "./_components/balance-card";
import { ActivityRail } from "./_components/activity-rail";
import { CreateWalletCta } from "./_components/create-wallet-cta";

export default function DashboardPage() {
  const w = useWalletData();
  const onChain = useOnChainVault(w.wallet?.ownerPubkey ?? null);
  const sessions = useSessions();
  // GET /v1/fund/deposit-address requires wallet_id  see apps/api/src/routes/fund.ts.
  // Without it the backend returns 400 and the QR card stays empty.
  const fund = useSWR<unknown>(
    w.wallet ? `/v1/fund/deposit-address?wallet_id=${w.wallet.id}` : null,
  );
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
    // Real failure  backend down, RPC dead, JWT invalid. T-224 itself is
    // shipped; a 404 would be caught by w.notFound (CreateWalletCta branch).
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="text-sm text-destructive">
          Couldn't load wallet info. Check the api logs and retry.
        </p>
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
            {
              label: "Active Sessions",
              // Live count from GET /v1/sessions  only un-revoked rows.
              value: sessions.sessions
                ? String(sessions.sessions.filter((s) => !s.revokedAt).length)
                : null,
              href: "/dashboard/sessions",
              cta: "Manage",
            },
            {
              label: "Vault PDA",
              value: w.wallet?.vaultPda ?? null,
              mono: true,
              copy: true,
            },
            {
              label: "USDC address",
              value: w.wallet?.usdcAta ?? null,
              mono: true,
              copy: true,
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
