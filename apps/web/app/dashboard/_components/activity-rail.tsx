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
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <span className="klink-eyebrow">Sessions</span>
          <CardTitle>Active Sessions</CardTitle>
        </CardHeader>
        <CardContent className="flex items-end justify-between gap-4">
          {sessions.isLoading ? (
            <Skeleton className="h-9 w-16" />
          ) : (
            <div className="flex items-baseline gap-2">
              <span className="klink-num text-[40px] font-bold leading-none tracking-tight text-olive-deep">
                {activeCount ?? "—"}
              </span>
              <span className="text-[12px] text-muted-foreground">active</span>
            </div>
          )}
          <Link
            href="/dashboard/sessions"
            className="klink-arrow-link rounded-pill px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-olive-deep transition-colors hover:bg-secondary/60"
          >
            <span>Manage</span>
            <span className="klink-arrow-icon" aria-hidden="true">→</span>
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <span className="klink-eyebrow">Audit</span>
          <CardTitle>Recent activity</CardTitle>
        </CardHeader>
        <CardContent>
          {audit.isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : !auditParsed?.success || auditParsed.data.entries.length === 0 ? (
            <p className="py-2 text-[13px] text-muted-foreground">No activity yet.</p>
          ) : (
            <ul className="-mx-2 divide-y divide-olive-deep/[0.06]">
              {auditParsed.data.entries.slice(0, 5).map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between gap-3 px-2 py-2.5"
                >
                  <span className="truncate text-[13px] text-olive-deep/80">{row.action}</span>
                  <span className="klink-num font-mono text-[12px] font-medium text-olive-deep">
                    {row.amount ? formatUsdc(row.amount) : "—"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
