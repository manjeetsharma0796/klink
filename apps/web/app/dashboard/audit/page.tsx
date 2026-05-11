"use client";

import { useAudit } from "@/_hooks/use-audit";
import { Badge } from "@/app/_components/ui/badge";
import { Button } from "@/app/_components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/_components/ui/card";
import { Skeleton } from "@/app/_components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/_components/ui/table";
import { cn } from "@/lib/cn";
import { formatTimestamp, formatUsdc, truncatePubkey } from "@/lib/formatters";
import { useState } from "react";
import { PageHeader } from "../_components/page-header";

const FILTERS = [
  { v: "all", label: "All" },
  { v: "allow", label: "Allow" },
  { v: "deny", label: "Deny" },
] as const;

export default function AuditPage() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["v"]>("all");
  const { data, size, setSize, isLoading } = useAudit(filter);
  const entries = data?.flatMap((p) => p.entries) ?? [];
  const last = data?.[data.length - 1];
  const hasMore = last?.next_cursor !== null && last?.next_cursor !== undefined;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Activity"
        title="Audit log"
        subtitle="Every allow / deny decision the agent triggered, with the on-chain tx signature when one was submitted."
      />
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Button
            key={f.v}
            variant={filter === f.v ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(f.v)}
          >
            {f.label}
          </Button>
        ))}
      </div>
      <Card>
        <CardHeader>
          <span className="klink-eyebrow">Entries</span>
          <CardTitle className="klink-num">{entries.length} {entries.length === 1 ? "entry" : "entries"}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && entries.length === 0 ? (
            <Skeleton className="h-40 w-full" />
          ) : entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No audit entries.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Recipient / URL</TableHead>
                  <TableHead>Decision</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Tx / Invoice</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-xs">
                      {formatTimestamp(Date.parse(e.createdAt) / 1000)}
                    </TableCell>
                    <TableCell>{e.action}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {e.amount ? formatUsdc(e.amount) : "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {e.recipientOrUrl ? truncatePubkey(e.recipientOrUrl) : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={e.decision === "allow" ? "default" : "destructive"}
                        className={cn(
                          e.decision === "deny" && "bg-destructive/10 text-destructive",
                        )}
                      >
                        {e.decision}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{e.reason ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">
                      <div className="flex flex-col gap-1">
                        {e.txSignature ? (
                          <a
                            className="text-olive-deep font-medium hover:underline"
                            target="_blank"
                            href={`https://solscan.io/tx/${e.txSignature}?cluster=devnet`}
                            rel="noreferrer"
                          >
                            {truncatePubkey(e.txSignature)}
                          </a>
                        ) : null}
                        {/* T-245 — invoice download for fund_dodo rows. Falls through silently when invoice_url isn't populated yet (e.g. webhook hasn't fired). */}
                        {e.dodoInvoiceUrl ? (
                          <a
                            className="text-olive-deep hover:underline"
                            target="_blank"
                            href={e.dodoInvoiceUrl}
                            rel="noreferrer"
                          >
                            invoice
                          </a>
                        ) : null}
                        {!e.txSignature && !e.dodoInvoiceUrl ? "—" : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {hasMore && (
            <div className="mt-4 flex justify-center">
              <Button variant="secondary" size="sm" onClick={() => setSize(size + 1)}>
                Load more
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
