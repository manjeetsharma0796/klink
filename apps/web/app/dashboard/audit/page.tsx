"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/_components/ui/card";
import { Button } from "@/app/_components/ui/button";
import { Badge } from "@/app/_components/ui/badge";
import { Skeleton } from "@/app/_components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/app/_components/ui/table";
import { formatTimestamp, formatUsdc, truncatePubkey } from "@/lib/formatters";
import { cn } from "@/lib/cn";
import { useAudit } from "@/_hooks/use-audit";

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
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
      <div className="flex gap-2">
        {FILTERS.map((f) => (
          <Button
            key={f.v}
            variant={filter === f.v ? "default" : "secondary"}
            size="sm"
            onClick={() => setFilter(f.v)}
          >
            {f.label}
          </Button>
        ))}
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">{entries.length} entries</CardTitle></CardHeader>
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
                  <TableHead>Tx</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-xs">{formatTimestamp(Date.parse(e.createdAt) / 1000)}</TableCell>
                    <TableCell>{e.action}</TableCell>
                    <TableCell className="font-mono text-xs">{e.amount ? formatUsdc(e.amount) : "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{e.recipientOrUrl ? truncatePubkey(e.recipientOrUrl) : "—"}</TableCell>
                    <TableCell>
                      <Badge variant={e.decision === "allow" ? "default" : "destructive"} className={cn(e.decision === "deny" && "bg-destructive/10 text-destructive")}>
                        {e.decision}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{e.reason ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {e.txSignature ? (
                        <a className="text-primary hover:underline" target="_blank" href={`https://solscan.io/tx/${e.txSignature}?cluster=devnet`} rel="noreferrer">
                          {truncatePubkey(e.txSignature)}
                        </a>
                      ) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {hasMore && (
            <div className="mt-4 flex justify-center">
              <Button variant="secondary" size="sm" onClick={() => setSize(size + 1)}>Load more</Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
