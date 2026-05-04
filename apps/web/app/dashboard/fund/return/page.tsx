"use client";

import { Button } from "@/app/_components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/_components/ui/card";
import { Skeleton } from "@/app/_components/ui/skeleton";
import { dodoPaymentStatusSchema } from "@/lib/schemas";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import useSWR from "swr";

/**
 * T-244 — post-checkout return page.
 *
 * Customer lands here after paying on Dodo's hosted checkout. We read the
 * dodo session id either from a query param (if Dodo appends one) or from
 * sessionStorage (set by the Fund page before navigating to Dodo). We poll
 * `/v1/fund/dodo-payment/:sessionId` every 2s for up to 30s while the
 * webhook → on-chain settlement closes, then auto-redirect to the dashboard
 * once the payment is settled.
 */
export default function FundReturnPage() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  // One-shot read from URL or sessionStorage on mount.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get("session_id") || params.get("session");
    let fromStorage: string | null = null;
    try {
      fromStorage = sessionStorage.getItem("klink:dodo-pending-session");
    } catch {
      // ignore
    }
    setSessionId(fromUrl || fromStorage);
  }, []);

  // Tick a counter every second so we can stop polling at the timeout.
  useEffect(() => {
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Poll the status endpoint every 2s. SWR's refreshInterval handles cadence;
  // we stop polling once we hit settled/failed or 30s elapsed.
  const stopped = elapsed >= 30;
  const { data, error } = useSWR<unknown>(
    sessionId && !stopped ? `/v1/fund/dodo-payment/${sessionId}` : null,
    {
      refreshInterval: 2000,
      revalidateOnFocus: false,
      dedupingInterval: 0,
    },
  );
  const parsed = data ? dodoPaymentStatusSchema.safeParse(data) : null;
  const status = parsed?.success ? parsed.data.status : null;

  // Auto-redirect to overview 5s after settlement.
  useEffect(() => {
    if (status !== "settled") return;
    const t = setTimeout(() => {
      try {
        sessionStorage.removeItem("klink:dodo-pending-session");
      } catch {
        // ignore
      }
      window.location.assign("/dashboard");
    }, 5000);
    return () => clearTimeout(t);
  }, [status]);

  const handleManualReturn = useCallback(() => {
    try {
      sessionStorage.removeItem("klink:dodo-pending-session");
    } catch {
      // ignore
    }
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Payment status</h1>
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="text-base">{titleFor(status, sessionId, stopped, error)}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!sessionId ? (
            <NoSessionFallback onReturn={handleManualReturn} />
          ) : status === null && !stopped ? (
            <PendingState />
          ) : status === "pending" && !stopped ? (
            <PendingState />
          ) : status === "settled" && parsed?.success ? (
            <SettledState
              amountUsd={parsed.data.amount_usd}
              amountUsdc={parsed.data.amount_usdc}
              txSignature={parsed.data.tx_signature}
              onReturn={handleManualReturn}
            />
          ) : status === "failed" ? (
            <FailedState onReturn={handleManualReturn} />
          ) : (
            <TimeoutState onReturn={handleManualReturn} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function titleFor(
  status: string | null,
  sessionId: string | null,
  stopped: boolean,
  error: unknown,
): string {
  if (!sessionId) return "Payment status";
  if (error) return "Couldn't reach the payment status service";
  if (status === "settled") return "Funded";
  if (status === "failed") return "Payment didn't go through";
  if (stopped) return "Still processing";
  return "Processing your payment...";
}

function PendingState() {
  return (
    <>
      <div className="flex items-center gap-3">
        <div className="size-2 rounded-full bg-amber-500 animate-pulse" />
        <p className="text-sm text-muted-foreground">
          We're confirming your payment with Dodo and disbursing USDC to your vault. This usually
          takes 5-15 seconds.
        </p>
      </div>
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
    </>
  );
}

function SettledState({
  amountUsd,
  amountUsdc,
  txSignature,
  onReturn,
}: {
  amountUsd: number;
  amountUsdc: number;
  txSignature: string | null;
  onReturn: () => void;
}) {
  const usdDollars = (amountUsd / 100).toFixed(2);
  const usdcWhole = (amountUsdc / 1_000_000).toFixed(2);
  return (
    <>
      <div className="flex items-center gap-3">
        <div className="size-2 rounded-full bg-emerald-500" />
        <p className="text-sm">
          Paid <span className="font-semibold">${usdDollars}</span> · received{" "}
          <span className="font-semibold">{usdcWhole} USDC</span> in your vault.
        </p>
      </div>
      {txSignature ? (
        <p className="font-mono text-xs text-muted-foreground break-all">
          tx: {txSignature}{" "}
          <a
            href={`https://explorer.solana.com/tx/${txSignature}?cluster=devnet`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            view on explorer
          </a>
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">Redirecting to your dashboard in 5 seconds...</p>
      <div className="flex gap-2 pt-2">
        <Link href="/dashboard">
          <Button onClick={onReturn}>Go to dashboard</Button>
        </Link>
        <Link href="/dashboard/audit">
          <Button variant="secondary" onClick={onReturn}>
            View audit log
          </Button>
        </Link>
      </div>
    </>
  );
}

function FailedState({ onReturn }: { onReturn: () => void }) {
  return (
    <>
      <div className="flex items-center gap-3">
        <div className="size-2 rounded-full bg-red-500" />
        <p className="text-sm text-muted-foreground">
          Your payment didn't complete. No charge was recorded. You can try again any time.
        </p>
      </div>
      <div className="flex gap-2 pt-2">
        <Link href="/dashboard/fund">
          <Button onClick={onReturn}>Try again</Button>
        </Link>
        <Link href="/dashboard">
          <Button variant="secondary" onClick={onReturn}>
            Back to dashboard
          </Button>
        </Link>
      </div>
    </>
  );
}

function TimeoutState({ onReturn }: { onReturn: () => void }) {
  return (
    <>
      <p className="text-sm text-muted-foreground">
        We're still settling your payment. It can occasionally take a minute longer than expected.
        Check the audit log for the on-chain confirmation.
      </p>
      <div className="flex gap-2 pt-2">
        <Link href="/dashboard/audit">
          <Button onClick={onReturn}>View audit log</Button>
        </Link>
        <Link href="/dashboard">
          <Button variant="secondary" onClick={onReturn}>
            Back to dashboard
          </Button>
        </Link>
      </div>
    </>
  );
}

function NoSessionFallback({ onReturn }: { onReturn: () => void }) {
  return (
    <>
      <p className="text-sm text-muted-foreground">
        No active payment session. If you just paid, your USDC is on its way to your vault. Check
        the audit log to confirm.
      </p>
      <div className="flex gap-2 pt-2">
        <Link href="/dashboard/audit">
          <Button onClick={onReturn}>View audit log</Button>
        </Link>
        <Link href="/dashboard/fund">
          <Button variant="secondary" onClick={onReturn}>
            Back to fund page
          </Button>
        </Link>
      </div>
    </>
  );
}
