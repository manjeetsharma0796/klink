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
    <Card className="flex flex-col items-center justify-center gap-4 p-8">
      <CardContent className="flex flex-col items-center gap-4 p-0">
        {loading ? (
          <Skeleton className="h-40 w-40" />
        ) : qrDataUrl ? (
          <img src={qrDataUrl} alt="Vault USDC ATA QR" className="h-40 w-40 rounded-md border" />
        ) : (
          <div className="flex h-40 w-40 items-center justify-center rounded-md border bg-muted/40 text-xs text-muted-foreground">
            No address yet
          </div>
        )}
        <div className="text-center">
          <div className="text-3xl font-semibold">{formatUsdc(total)}</div>
          <div className="text-xs text-muted-foreground">
            liquid {formatUsdc(liquid ?? BigInt(0))} · deployed {formatUsdc(deployed ?? BigInt(0))}
          </div>
        </div>
        {vaultPda && (
          <span className="font-mono text-xs text-muted-foreground">{truncatePubkey(vaultPda)}</span>
        )}
        <div className="flex gap-2">
          <Button asChild size="sm"><Link href="/dashboard/fund">Fund</Link></Button>
          <Button asChild size="sm" variant="secondary"><Link href="/dashboard/yield">Yield</Link></Button>
        </div>
      </CardContent>
    </Card>
  );
}
