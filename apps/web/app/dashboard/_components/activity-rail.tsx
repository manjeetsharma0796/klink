"use client";

import Link from "next/link";
import useSWR from "swr";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/_components/ui/card";
import { Skeleton } from "@/app/_components/ui/skeleton";
import { formatUsdc } from "@/lib/formatters";
import { sessionsListSchema, auditPageSchema } from "@/lib/schemas";

export function ActivityRail() {
  const sessions = useSWR<unknown>("/v1/sessions");
  const audit = useSWR<unknown>("/v1/audit?limit=5");

  const sessionsParsed = sessions.data ? sessionsListSchema.safeParse(sessions.data) : null;
  const auditParsed = audit.data ? auditPageSchema.safeParse(audit.data) : null;

  const activeCount = sessionsParsed?.success
    ? sessionsParsed.data.filter((s) => !s.revokedAt).length
    : null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Active Sessions</CardTitle></CardHeader>
        <CardContent className="flex items-center justify-between">
          {sessions.isLoading ? <Skeleton className="h-5 w-20" /> : (
            <span className="text-2xl font-semibold">{activeCount ?? "—"}</span>
          )}
          <Link href="/dashboard/sessions" className="text-xs font-medium text-primary hover:underline">
            Manage
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Recent Activity</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {audit.isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : !auditParsed?.success || auditParsed.data.entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {auditParsed.data.entries.slice(0, 5).map((row) => (
                <li key={row.id} className="flex items-center justify-between">
                  <span className="truncate text-muted-foreground">{row.action}</span>
                  <span className="font-mono text-xs">{row.amount ? formatUsdc(row.amount) : "—"}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
