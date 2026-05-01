import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/_components/ui/card";
import { Skeleton } from "@/app/_components/ui/skeleton";
import { cn } from "@/lib/cn";

interface Row { label: string; value: string | null; href?: string; cta?: string; mono?: boolean; }
interface Props { title: string; rows: Row[]; loading?: boolean; }

export function StatCard({ title, rows, loading }: Props) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-4">
            <span className="text-sm text-muted-foreground">{row.label}</span>
            <div className="flex items-center gap-3">
              {loading ? (
                <Skeleton className="h-4 w-24" />
              ) : (
                <span className={cn("text-sm", row.mono && "font-mono")}>{row.value ?? "Not set"}</span>
              )}
              {row.href && (
                <Link href={row.href} className="text-xs font-medium text-primary hover:underline">
                  {row.cta ?? "Configure"}
                </Link>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
