"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/_components/ui/card";
import { Button } from "@/app/_components/ui/button";
import { Slider } from "@/app/_components/ui/slider";
import { Input } from "@/app/_components/ui/input";
import { api, ApiError } from "@/lib/api-client";
import { useToast } from "@/app/_components/ui/use-toast";
import { BackendPending } from "../../_components/backend-pending";

interface Props {
  walletId: string;
  current: { startMin: number; endMin: number; dowBitmask: number; tz: string } | null;
  onSaved: () => void;
}

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function TimeWindow({ walletId, current, onSaved }: Props) {
  const [start, setStart] = useState(current?.startMin ?? 0);
  const [end, setEnd] = useState(current?.endMin ?? 1440);
  const [mask, setMask] = useState(current?.dowBitmask ?? 127);
  const [tz, setTz] = useState(current?.tz ?? "UTC");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const { toast } = useToast();

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Time window (off-chain)</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {pending && <BackendPending taskId="T-223" description="PATCH /v1/wallet/off-chain-policy — set time window." />}
        <div className="flex flex-wrap gap-2">
          {DOW.map((d, i) => (
            <label key={d} className="flex items-center gap-1 text-sm">
              <input type="checkbox" checked={((mask >> i) & 1) === 1} onChange={(e) => setMask(e.target.checked ? mask | (1 << i) : mask & ~(1 << i))} />
              {d}
            </label>
          ))}
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Start: {Math.floor(start / 60)}:{String(start % 60).padStart(2, "0")}</p>
          <Slider min={0} max={1440} step={5} value={[start]} onValueChange={(v) => setStart(v[0])} />
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">End: {Math.floor(end / 60)}:{String(end % 60).padStart(2, "0")}</p>
          <Slider min={0} max={1440} step={5} value={[end]} onValueChange={(v) => setEnd(v[0])} />
        </div>
        <div>
          <Input value={tz} onChange={(e) => setTz(e.target.value)} placeholder="UTC" />
        </div>
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api.patch("/v1/wallet/off-chain-policy", {
                wallet_id: walletId,
                time_window_start_min: start,
                time_window_end_min: end,
                time_window_dow_bitmask: mask,
                timezone: tz,
              });
              toast({ title: "Time window saved" });
              onSaved();
            } catch (e) {
              if (e instanceof ApiError && (e.status === 404 || e.status === 405)) setPending(true);
              else toast({ title: "Failed", description: String(e), variant: "destructive" });
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Saving…" : "Save time window"}
        </Button>
      </CardContent>
    </Card>
  );
}
