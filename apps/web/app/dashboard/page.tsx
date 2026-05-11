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
import { PageHeader } from "./_components/page-header";

export default function DashboardPage() {
  const w = useWalletData();
  const onChain = useOnChainVault(w.wallet?.ownerPubkey ?? null);
  const sessions = useSessions();
  // GET /v1/fund/deposit-address requires wallet_id — see apps/api/src/routes/fund.ts.
  // Without it the backend returns 400 and the QR card stays empty.
  const fund = useSWR<unknown>(
    w.wallet ? `/v1/fund/deposit-address?wallet_id=${w.wallet.id}` : null,
  );
  const fundParsed = fund.data ? fundDepositAddressSchema.safeParse(fund.data) : null;

  if (w.notFound) {
    return (
      <div className="space-y-8">
        <PageHeader eyebrow="Dashboard" title="Overview" subtitle="Spin up your non-custodial agent wallet to get started." />
        <CreateWalletCta />
      </div>
    );
  }

  if (w.error) {
    // Real failure — backend down, RPC dead, JWT invalid. T-224 itself is
    // shipped; a 404 would be caught by w.notFound (CreateWalletCta branch).
    return (
      <div className="space-y-8">
        <PageHeader eyebrow="Dashboard" title="Overview" />
        <p className="text-sm text-destructive">
          Couldn&apos;t load wallet info. Check the api logs and retry.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Dashboard"
        title="Overview"
        subtitle="A live snapshot of your klink agent wallet — balance, sessions, and recent activity."
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <StatCard
          eyebrow="Wallet"
          title="Wallet settings"
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
              // Live count from GET /v1/sessions — only un-revoked rows.
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
