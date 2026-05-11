"use client";

import Link from "next/link";
import { useSessions } from "@/_hooks/use-sessions";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/_components/ui/card";
import { Skeleton } from "@/app/_components/ui/skeleton";
import { Badge } from "@/app/_components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/app/_components/ui/table";
import { truncatePubkey, formatTimestamp } from "@/lib/formatters";
import { PageHeader } from "../_components/page-header";
import { NewSessionModal } from "./new-session-modal";
import { RevokeConfirm } from "./revoke-confirm";
import { RotateKeyButton } from "./rotate-key-button";

export default function SessionsPage() {
  const { sessions, error, isLoading, mutate } = useSessions();

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Agent keys"
        title="Sessions"
        subtitle="Each session is one API key bound to one on-chain Session PDA, with its own caps, allowlist, and audit trail."
        action={<NewSessionModal onCreated={() => mutate()} />}
      />

      {error && (
        <p className="text-sm text-destructive">
          Couldn&apos;t load sessions. Check the api logs and retry.
        </p>
      )}

      {!error && (
        <Card className="klink-reveal">
          <CardHeader>
            <span className="klink-eyebrow">All sessions</span>
            <CardTitle>Active and historical sessions</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : !sessions || sessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sessions yet. Create one to issue an API key.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Label</TableHead>
                    <TableHead>Pubkey</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>API key</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessions.map((s) => {
                    const status = s.revokedAt ? "revoked" : s.expiresAt && Date.parse(s.expiresAt) < Date.now() ? "expired" : "active";
                    return (
                      <TableRow key={s.id}>
                        <TableCell>{s.label}</TableCell>
                        <TableCell className="font-mono text-xs">{truncatePubkey(s.sessionPubkey)}</TableCell>
                        <TableCell><Badge variant={status === "active" ? "default" : "secondary"}>{status}</Badge></TableCell>
                        <TableCell className="font-mono text-xs">
                          {s.keyPrefix ? `${s.keyPrefix}…` : "—"}
                        </TableCell>
                        <TableCell className="text-xs">{formatTimestamp(Date.parse(s.createdAt) / 1000)}</TableCell>
                        <TableCell className="space-x-2 text-right">
                          <Link
                            href={`/dashboard/sessions/${s.id}`}
                            className="klink-arrow-link text-xs font-medium text-olive-deep"
                          >
                            <span className="klink-underline">Allowlist</span>
                            <span className="klink-arrow-icon" aria-hidden="true">→</span>
                          </Link>
                          {status === "active" && (
                            <>
                              <RotateKeyButton
                                sessionId={s.id}
                                label={s.label}
                                onRotated={() => mutate()}
                              />
                              <RevokeConfirm sessionId={s.id} label={s.label} onRevoked={() => mutate()} />
                            </>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
