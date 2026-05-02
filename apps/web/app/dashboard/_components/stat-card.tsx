"use client";

import Link from "next/link";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/_components/ui/card";
import { Skeleton } from "@/app/_components/ui/skeleton";
import { useToast } from "@/app/_components/ui/use-toast";
import { cn } from "@/lib/cn";
import { truncatePubkey } from "@/lib/formatters";

interface Row {
  label: string;
  value: string | null;
  href?: string;
  cta?: string;
  mono?: boolean;
  /**
   * When set, renders a copy button next to the value. The displayed text
   * is auto-truncated via truncatePubkey so long base58 strings (vault
   * PDAs, ATAs, recipient addresses) don't blow out the card width. The
   * copy button always copies the full untruncated value.
   */
  copy?: boolean;
}

interface Props {
  title: string;
  rows: Row[];
  loading?: boolean;
}

export function StatCard({ title, rows, loading }: Props) {
  const { toast } = useToast();
  const [copiedLabel, setCopiedLabel] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.map((row) => {
          const display =
            row.value === null
              ? null
              : row.copy
                ? truncatePubkey(row.value)
                : row.value;
          return (
            <div key={row.label} className="flex items-center justify-between gap-4">
              <span className="text-sm text-muted-foreground">{row.label}</span>
              <div className="flex items-center gap-2">
                {loading ? (
                  <Skeleton className="h-4 w-24" />
                ) : (
                  <span className={cn("text-sm", row.mono && "font-mono")}>
                    {display ?? "Not set"}
                  </span>
                )}
                {row.copy && row.value && !loading && (
                  <button
                    type="button"
                    aria-label={`Copy ${row.label}`}
                    className="text-xs font-medium text-primary hover:underline"
                    onClick={async () => {
                      // row.value is a string here — the outer guard rules out null.
                      const v = row.value as string;
                      await navigator.clipboard.writeText(v);
                      setCopiedLabel(row.label);
                      toast({ title: `${row.label} copied` });
                      setTimeout(
                        () => setCopiedLabel((c) => (c === row.label ? null : c)),
                        1500,
                      );
                    }}
                  >
                    {copiedLabel === row.label ? "Copied" : "Copy"}
                  </button>
                )}
                {row.href && (
                  <Link
                    href={row.href}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    {row.cta ?? "Configure"}
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
