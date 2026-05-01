"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/_components/ui/card";
import { Button } from "@/app/_components/ui/button";
import { Input } from "@/app/_components/ui/input";
import { Label } from "@/app/_components/ui/label";
import { useBuildAndSignTx } from "@/_hooks/use-build-and-sign-tx";
import { useToast } from "@/app/_components/ui/use-toast";
import { MAX_RECIPIENTS } from "@/lib/constants";

interface Props {
  sessionId: string;
  current: string[];
  onSaved: () => void;
}

export function RecipientList({ sessionId, current, onSaved }: Props) {
  const [draft, setDraft] = useState(current.join("\n"));
  const [action, setAction] = useState<"Set" | "Add" | "Remove">("Set");
  const { run, phase } = useBuildAndSignTx();
  const { toast } = useToast();

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Recipients (on-chain)</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">Up to {MAX_RECIPIENTS} addresses, one per line.</p>
        <Label>Action</Label>
        <select
          value={action}
          onChange={(e) => setAction(e.target.value as "Set" | "Add" | "Remove")}
          className="rounded-md border bg-background px-2 py-1 text-sm"
        >
          <option value="Set">Replace all (Set)</option>
          <option value="Add">Add</option>
          <option value="Remove">Remove</option>
        </select>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={MAX_RECIPIENTS}
          className="w-full rounded-md border bg-background px-3 py-2 font-mono text-xs"
          placeholder="One pubkey per line"
        />
        <Button
          disabled={phase !== "idle" && phase !== "done"}
          onClick={async () => {
            const recipients = draft.split(/\s+/).map((s) => s.trim()).filter(Boolean);
            if (recipients.length > MAX_RECIPIENTS) {
              toast({ title: "Too many recipients", description: `Max ${MAX_RECIPIENTS}`, variant: "destructive" });
              return;
            }
            try {
              await run(`/v1/session/${sessionId}/allowlist`, "PATCH", { action, recipients });
              toast({ title: "Recipients updated" });
              onSaved();
            } catch (e) {
              toast({ title: "Failed", description: String(e), variant: "destructive" });
            }
          }}
        >
          {phase === "idle" || phase === "done" ? "Save recipients" : `${phase}…`}
        </Button>
      </CardContent>
    </Card>
  );
}
