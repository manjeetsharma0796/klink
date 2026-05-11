"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/_components/ui/card";
import { Button } from "@/app/_components/ui/button";
import { Input } from "@/app/_components/ui/input";
import { api } from "@/lib/api-client";
import { useToast } from "@/app/_components/ui/use-toast";

interface Row { pattern: string; max_per_call: number; }
interface PendingAdd { pattern: string; maxPerCall: number; }
interface Props {
  walletId: string;
  current: Row[] | null;
  pendingAdd?: PendingAdd | null;
  onSaved: () => void;
}

export function UrlAllowlist({ walletId, current, pendingAdd, onSaved }: Props) {
  const [rows, setRows] = useState<Row[]>(current ?? []);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  // T-314: when arriving via /services deep-link with a pending URL, append it
  // to the editing draft if not already present. Single-shot per mount; the
  // user reviews and saves explicitly.
  useEffect(() => {
    if (!pendingAdd) return;
    setRows((prev) => {
      if (prev.some((r) => r.pattern === pendingAdd.pattern)) return prev;
      return [...prev, { pattern: pendingAdd.pattern, max_per_call: pendingAdd.maxPerCall }];
    });
    // Intentionally one-shot per mount; deps include pendingAdd identity so a
    // navigation with a different URL re-runs cleanly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAdd?.pattern, pendingAdd?.maxPerCall]);

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">URL allowlist (off-chain)</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {pendingAdd && (
          <p className="rounded-md border border-yellow bg-[#FFFFC4]/40 px-3 py-2 text-xs text-olive-deep">
            Pending whitelist queued from /services. Review the row below and click Save.
          </p>
        )}
        <ul className="space-y-2">
          {rows.map((r, i) => (
            <li key={i} className="flex gap-2">
              <Input value={r.pattern} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, pattern: e.target.value } : x)))} placeholder="https://api.example.com/*" />
              <Input type="number" value={r.max_per_call} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, max_per_call: Number(e.target.value) } : x)))} className="w-32" />
              <Button variant="ghost" size="sm" onClick={() => setRows(rows.filter((_, j) => j !== i))}>Remove</Button>
            </li>
          ))}
        </ul>
        <Button variant="secondary" size="sm" onClick={() => setRows([...rows, { pattern: "", max_per_call: 0 }])}>Add row</Button>
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api.patch("/v1/wallet/off-chain-policy", { wallet_id: walletId, allowed_urls: rows });
              toast({ title: "URL allowlist saved" });
              onSaved();
            } catch (e) {
              toast({ title: "Failed", description: String(e), variant: "destructive" });
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Saving…" : "Save URLs"}
        </Button>
      </CardContent>
    </Card>
  );
}
