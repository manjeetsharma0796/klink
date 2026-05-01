"use client";

import { useParams } from "next/navigation";
import { useSession } from "@/_hooks/use-session";
import { Skeleton } from "@/app/_components/ui/skeleton";
import { BackendPending } from "../../_components/backend-pending";
import { RecipientList } from "./recipient-list";
import { InstructionBitmap } from "./instruction-bitmap";
import { UrlAllowlist } from "./url-allowlist";
import { TimeWindow } from "./time-window";

export default function SessionAllowlistPage() {
  const params = useParams<{ id: string }>();
  const { session, notImplemented, isLoading, mutate } = useSession(params.id);

  if (notImplemented) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">Allowlist editor</h1>
        <BackendPending taskId="T-219" description="GET /v1/sessions/:id — single session detail with on-chain + off-chain state." />
      </div>
    );
  }

  if (isLoading || !session) {
    return <div className="space-y-6"><Skeleton className="h-8 w-64" /><Skeleton className="h-96 w-full" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{session.label}</h1>
        <p className="font-mono text-xs text-muted-foreground">{session.sessionPubkey}</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <RecipientList sessionId={session.id} current={session.allowedRecipients} onSaved={() => mutate()} />
        <InstructionBitmap sessionId={session.id} current={session.allowedInstructions} onSaved={() => mutate()} />
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
