"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/app/_components/ui/dialog";
import { Button } from "@/app/_components/ui/button";
import { useToast } from "@/app/_components/ui/use-toast";

interface Props { apiKey: string | null; onClose: () => void; }

export function ApiKeyRevealModal({ apiKey, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  return (
    <Dialog open={apiKey !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>API key — copy now</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">
          We will not show this again. Copy it and store it in your agent's environment.
        </p>
        <pre className="overflow-x-auto rounded-md border bg-secondary px-3 py-2 font-mono text-xs">
          {apiKey ?? ""}
        </pre>
        <DialogFooter>
          <Button
            variant="secondary"
            onClick={async () => {
              if (apiKey) await navigator.clipboard.writeText(apiKey);
              setCopied(true);
              toast({ title: "Copied" });
            }}
          >
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
