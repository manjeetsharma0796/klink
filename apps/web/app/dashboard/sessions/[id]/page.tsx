"use client";

import { useParams } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { useSession } from "@/_hooks/use-session";
import { Skeleton } from "@/app/_components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/_components/ui/card";
import { RecipientList } from "./recipient-list";
import { InstructionBitmap } from "./instruction-bitmap";
import { UrlAllowlist } from "./url-allowlist";
import { TimeWindow } from "./time-window";

export default function SessionAllowlistPage() {
  const params = useParams<{ id: string }>();
  const { session, error, isLoading, mutate } = useSession(params.id);

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">Allowlist editor</h1>
        <p className="text-sm text-destructive">
          Couldn't load this session. Check the api logs and retry.
        </p>
      </div>
    );
  }

  if (isLoading || !session) {
    return <div className="space-y-6"><Skeleton className="h-8 w-64" /><Skeleton className="h-96 w-full" /></div>;
  }

  // On-chain state may be null for two reasons: the session PDA hasn't been
  // created yet (between POST /v1/session and the owner submitting the build
  // tx), or the program isn't deployed (T-113 pending). Both render the
  // on-chain editors disabled with the surfaced reason.
  const onChain = session.onChain;
  const onChainError = session.onChainError;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{session.label}</h1>
        <p className="font-mono text-xs text-muted-foreground">{session.sessionPubkey}</p>
      </div>
      {!onChain && (
        <Card className="border-yellow bg-[#FFFFC4]/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-olive-deep">
              <AlertCircle className="h-4 w-4" />
              On-chain state unavailable
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-olive-deep/80">
            {onChainError ?? "session PDA not yet on-chain"}. Recipient and instruction-bitmap edits are disabled until the session is committed on-chain.
          </CardContent>
        </Card>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        {onChain && (
          <>
            <RecipientList
              sessionId={session.id}
              current={onChain.allowedRecipients.slice(0, onChain.allowedRecipientsCount)}
              onSaved={() => mutate()}
            />
            <InstructionBitmap
              sessionId={session.id}
              current={onChain.allowedInstructions}
              onSaved={() => mutate()}
            />
          </>
        )}
        <UrlAllowlist
          walletId={session.walletId}
          current={session.offChainPolicy?.allowedUrls ?? null}
          onSaved={() => mutate()}
        />
        <TimeWindow
          walletId={session.walletId}
          current={
            session.offChainPolicy
              ? {
                  startMin: session.offChainPolicy.timeWindowStartMin,
                  endMin: session.offChainPolicy.timeWindowEndMin,
                  dowBitmask: session.offChainPolicy.timeWindowDowBitmask,
                  tz: session.offChainPolicy.timezone,
                }
              : null
          }
          onSaved={() => mutate()}
        />
      </div>
    </div>
  );
}
