"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useSessions } from "@/_hooks/use-sessions";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/_components/ui/card";
import { Skeleton } from "@/app/_components/ui/skeleton";
import { Badge } from "@/app/_components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/app/_components/ui/table";
import { truncatePubkey, formatTimestamp } from "@/lib/formatters";
import {
  buildAddToSessionQuery,
  hasAnyAddToSessionParam,
  parseAddToSessionParams,
} from "@/lib/add-to-session-params";
import { PageHeader } from "../_components/page-header";
import { NewSessionModal } from "./new-session-modal";
import { RevokeConfirm } from "./revoke-confirm";
import { RotateKeyButton } from "./rotate-key-button";

export default function SessionsPage() {
  const { sessions, error, isLoading, mutate } = useSessions();
  const searchParams = useSearchParams();
  const pending = parseAddToSessionParams(
    new URLSearchParams(searchParams?.toString() ?? ""),
  );
  const isPending = hasAnyAddToSessionParam(pending);
  const forwardQuery = buildAddToSessionQuery(pending);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Sessions"
        subtitle="Each session is one API key bound to one on-chain Session PDA, with its own caps, allowlist, and audit trail."
        action={
          <NewSessionModal
            onCreated={() => mutate()}
            prefill={
              isPending
                ? {
                    url: pending.addUrl,
                    recipient: pending.addRecipient,
                    suggestedMaxPerCall: pending.suggestMaxPerCall,
                  }
                : null
            }
          />
        }
      />

      {isPending && (
        <Card className="border-yellow bg-[#FFFFC4]/60 klink-reveal">
          <CardHeader>
            <span className="klink-eyebrow text-olive-deep/70">Pending whitelist</span>
            <CardTitle className="text-base text-olive-deep">Add to which session?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-olive-deep/80">
            <ul className="space-y-1 font-mono text-xs">
              {pending.addUrl && (
                <li>
                  URL: <span className="text-olive-deep">{pending.addUrl}</span>
                </li>
              )}
              {pending.addRecipient && (
                <li>
                  Recipient: <span className="text-olive-deep">{truncatePubkey(pending.addRecipient)}</span>
                </li>
              )}
              {pending.suggestMaxPerCall !== null && (
                <li>
                  Suggested per-call cap:{" "}
                  <span className="text-olive-deep">
                    {pending.suggestMaxPerCall.toLocaleString()} base units (
                    {(pending.suggestMaxPerCall / 1_000_000).toFixed(2)} USDC)
                  </span>
                </li>
              )}
            </ul>
            {!isLoading && sessions && sessions.length === 0 && (
              <p className="text-sm">
                No sessions yet. Click <strong>New session</strong> above to create one with these
                values pre-filled.
              </p>
            )}
            {!isLoading && sessions && sessions.length > 0 && (
              <p className="text-sm">
                Pick a session below to open its allowlist editor with these values queued. The URL
                allowlist update is a single API call; the on-chain recipient add still needs a
                wallet signature.
              </p>
            )}
          </CardContent>
        </Card>
      )}

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
                          {isPending && status === "active" && (
                            <Link
                              href={`/dashboard/sessions/${s.id}${forwardQuery}`}
                              className="rounded-pill bg-sap-green px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-primary-foreground transition-all duration-[var(--dur-base)] ease-[var(--ease-klink)] hover:opacity-90 active:scale-[0.97]"
                            >
                              Add to {s.label}
                            </Link>
                          )}
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
