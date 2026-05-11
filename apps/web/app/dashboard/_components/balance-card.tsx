import Link from "next/link";
import { Card, CardContent } from "@/app/_components/ui/card";
import { Button } from "@/app/_components/ui/button";
import { Skeleton } from "@/app/_components/ui/skeleton";
import { formatUsdc, truncatePubkey } from "@/lib/formatters";

interface Props {
  liquid: bigint | null;
  deployed: bigint | null;
  vaultPda: string | null;
  qrDataUrl: string | null;
  loading?: boolean;
}

export function BalanceCard({ liquid, deployed, vaultPda, qrDataUrl, loading }: Props) {
  const total = (liquid ?? BigInt(0)) + (deployed ?? BigInt(0));
  return (
    <Card className="overflow-hidden">
      <CardContent className="flex flex-col items-center gap-5 p-7">
        <span className="klink-eyebrow self-start">Total balance</span>

        <div className="flex w-full flex-col items-center gap-1">
          {loading ? (
            <Skeleton className="h-9 w-32" />
          ) : (
            <div className="klink-num text-[40px] font-bold leading-none tracking-tight text-olive-deep">
              {formatUsdc(total)}
            </div>
          )}
          <div className="text-[12px] text-muted-foreground">
            <span className="klink-num font-medium text-olive-deep/80">{formatUsdc(liquid ?? BigInt(0))}</span> liquid
            <span className="px-1.5 text-muted-foreground/40">·</span>
            <span className="klink-num font-medium text-olive-deep/80">{formatUsdc(deployed ?? BigInt(0))}</span> deployed
          </div>
        </div>

        {loading ? (
          <Skeleton className="h-36 w-36 rounded-2xl" />
        ) : qrDataUrl ? (
          <div className="rounded-2xl bg-cream p-2 shadow-[var(--shadow-pill)] ring-1 ring-olive-deep/[0.06]">
            <img
              src={qrDataUrl}
              alt="Vault USDC ATA QR"
              className="h-36 w-36 rounded-xl"
            />
          </div>
        ) : (
          <div className="flex h-36 w-36 items-center justify-center rounded-2xl border border-dashed border-olive-deep/15 bg-secondary/40 text-[11px] text-muted-foreground">
            No address yet
          </div>
        )}

        {vaultPda && (
          <span className="font-mono text-[11px] text-muted-foreground">
            {truncatePubkey(vaultPda)}
          </span>
        )}

        <div className="flex w-full gap-2 pt-1">
          <Button asChild size="sm" className="flex-1">
            <Link href="/dashboard/fund">Fund</Link>
          </Button>
          <Button asChild size="sm" variant="secondary" className="flex-1">
            <Link href="/dashboard/yield">Yield</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
