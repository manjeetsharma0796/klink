"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/_components/ui/card";
import { Button } from "@/app/_components/ui/button";
import { Input } from "@/app/_components/ui/input";
import { api, ApiError } from "@/lib/api-client";
import { useToast } from "@/app/_components/ui/use-toast";
import { BackendPending } from "../../_components/backend-pending";

interface Row { pattern: string; max_per_call: number; }
interface Props { walletId: string; current: Row[] | null; onSaved: () => void; }

export function UrlAllowlist({ walletId, current, onSaved }: Props) {
  const [rows, setRows] = useState<Row[]>(current ?? []);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const { toast } = useToast();

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">URL allowlist (off-chain)</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {pending && <BackendPending taskId="T-223" description="PATCH /v1/wallet/off-chain-policy — set URL allowlist + time window." />}
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
              if (e instanceof ApiError && (e.status === 404 || e.status === 405)) setPending(true);
              else toast({ title: "Failed", description: String(e), variant: "destructive" });
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
