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
  /** Optional small uppercase eyebrow rendered above the title. */
  eyebrow?: string;
  rows: Row[];
  loading?: boolean;
}

export function StatCard({ title, eyebrow, rows, loading }: Props) {
  const { toast } = useToast();
  const [copiedLabel, setCopiedLabel] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader>
        {eyebrow && <span className="klink-eyebrow">{eyebrow}</span>}
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="divide-y divide-olive-deep/[0.06]">
        {rows.map((row, idx) => {
          const display =
            row.value === null
              ? null
              : row.copy
                ? truncatePubkey(row.value)
                : row.value;
          return (
            <div
              key={row.label}
              className={cn(
                "flex items-center justify-between gap-4 py-3",
                idx === 0 && "pt-1",
              )}
            >
              <span className="text-[13px] text-muted-foreground">{row.label}</span>
              <div className="flex items-center gap-3">
                {loading ? (
                  <Skeleton className="h-4 w-24" />
                ) : (
                  <span
                    className={cn(
                      "text-[13px] font-medium text-olive-deep",
                      row.mono && "font-mono klink-num",
                    )}
                  >
                    {display ?? <span className="text-muted-foreground/70 font-normal">Not set</span>}
                  </span>
                )}
                {row.copy && row.value && !loading && (
                  <button
                    type="button"
                    aria-label={`Copy ${row.label}`}
                    className="rounded-pill px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-olive-deep transition-all duration-[var(--dur-base)] ease-[var(--ease-klink)] hover:bg-secondary/60 active:scale-[0.96]"
                    onClick={async () => {
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
                    <span
                      key={copiedLabel === row.label ? "copied" : "copy"}
                      className="klink-reveal-soft inline-block"
                    >
                      {copiedLabel === row.label ? "Copied ✓" : "Copy"}
                    </span>
                  </button>
                )}
                {row.href && (
                  <Link
                    href={row.href}
                    className="klink-arrow-link rounded-pill px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-olive-deep transition-colors hover:bg-secondary/60"
                  >
                    <span>{row.cta ?? "Configure"}</span>
                    <span className="klink-arrow-icon" aria-hidden="true">→</span>
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
