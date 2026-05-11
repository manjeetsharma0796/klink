"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/app/_components/ui/dialog";
import { Button } from "@/app/_components/ui/button";
import { Input } from "@/app/_components/ui/input";
import { Label } from "@/app/_components/ui/label";
import { useBuildAndSignTx } from "@/_hooks/use-build-and-sign-tx";
import { useWalletData } from "@/_hooks/use-wallet";
import { postSessionResponseSchema } from "@/lib/schemas";
import { INSTRUCTION_BITS, MAX_RECIPIENTS } from "@/lib/constants";
import { buildAddToSessionQuery } from "@/lib/add-to-session-params";
import { useToast } from "@/app/_components/ui/use-toast";
import { ApiKeyRevealModal } from "./api-key-reveal-modal";

const formSchema = z.object({
  label: z.string().min(1).max(255),
  maxPerTx: z.coerce.number().int().positive(),
  dailyCap: z.coerce.number().int().positive(),
  expiry: z.coerce.number().int().nonnegative(),
  recipients: z.string().refine(
    (s) => s.trim().split(/\s+/).filter(Boolean).length <= MAX_RECIPIENTS,
    `Max ${MAX_RECIPIENTS} recipients`,
  ),
  allowTransfer: z.boolean(),
  allowKaminoDeposit: z.boolean(),
  allowKaminoWithdraw: z.boolean(),
});
type FormValues = z.infer<typeof formSchema>;

/** T-314 deep-link payload from /services. All fields nullable. */
export interface NewSessionPrefill {
  url: string | null;
  recipient: string | null;
  suggestedMaxPerCall: number | null;
}

interface Props {
  onCreated: () => void;
  prefill?: NewSessionPrefill | null;
}

export function NewSessionModal({ onCreated, prefill }: Props) {
  const [open, setOpen] = useState(false);
  const [revealKey, setRevealKey] = useState<string | null>(null);
  const { run, phase } = useBuildAndSignTx();
  const { wallet } = useWalletData();
  const { toast } = useToast();
  const router = useRouter();

  const initialMaxPerTx =
    prefill?.suggestedMaxPerCall && prefill.suggestedMaxPerCall > 0
      ? prefill.suggestedMaxPerCall
      : 100_000;
  const initialDailyCap = Math.max(initialMaxPerTx * 10, 1_000_000);
  const { register, handleSubmit, formState: { errors }, reset } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      label: "", maxPerTx: initialMaxPerTx, dailyCap: initialDailyCap, expiry: 0,
      recipients: prefill?.recipient ?? "",
      allowTransfer: true, allowKaminoDeposit: false, allowKaminoWithdraw: false,
    },
  });

  // Auto-open the modal when arriving with prefill (T-314 deep-link from
  // /services). Triggers exactly once per page-load with prefill present.
  useEffect(() => {
    if (prefill && (prefill.url || prefill.recipient)) {
      setOpen(true);
    }
  }, [prefill]);

  async function onSubmit(values: FormValues) {
    if (!wallet) {
      toast({
        title: "No wallet",
        description: "Create a wallet from Overview first.",
        variant: "destructive",
      });
      return;
    }
    const recipients = values.recipients.trim().split(/\s+/).filter(Boolean);
    let bitmap = 0;
    if (values.allowTransfer) bitmap |= 1 << INSTRUCTION_BITS.TRANSFER_USDC;
    if (values.allowKaminoDeposit) bitmap |= 1 << INSTRUCTION_BITS.KAMINO_DEPOSIT;
    if (values.allowKaminoWithdraw) bitmap |= 1 << INSTRUCTION_BITS.KAMINO_WITHDRAW;

    try {
      // wallet_id is required by the backend (apps/api/src/routes/session.ts:65)
      // — without it the POST returns 400 before building the tx.
      const result = await run("/v1/session", "POST", {
        wallet_id: wallet.id,
        label: values.label,
        max_per_tx: values.maxPerTx,
        daily_cap: values.dailyCap,
        expiry: values.expiry,
        allowed_recipients: recipients,
        allowed_instructions: bitmap,
      });
      const parsed = postSessionResponseSchema.parse(result.buildResponse);
      setRevealKey(parsed.apiKey);
      setOpen(false);
      reset();
      onCreated();
      // T-314: if the user came from a /services deep-link, hand the URL +
      // suggested cap to the new session's allowlist editor. The recipient
      // already went on-chain via this create, so it doesn't need to forward.
      if (prefill?.url) {
        const q = buildAddToSessionQuery({
          addUrl: prefill.url,
          addRecipient: null,
          suggestMaxPerCall: prefill.suggestedMaxPerCall,
        });
        router.push(`/dashboard/sessions/${parsed.sessionId}${q}`);
      }
    } catch (e) {
      toast({ title: "Failed to create session", description: String(e), variant: "destructive" });
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button>New session</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle>New session</DialogTitle></DialogHeader>
          {prefill?.url && (
            <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <p className="font-semibold text-foreground">Pending whitelist from /services</p>
              <p className="mt-1 break-all font-mono">URL: {prefill.url}</p>
              {prefill.recipient && (
                <p className="mt-0.5 break-all font-mono">Recipient: {prefill.recipient}</p>
              )}
              <p className="mt-1">
                Caps below are pre-filled. After you sign the create tx, the URL is queued for the
                allowlist editor on the next screen.
              </p>
            </div>
          )}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <Label htmlFor="label">Label</Label>
              <Input id="label" {...register("label")} placeholder="my-agent" />
              {errors.label && <p className="text-xs text-destructive">{errors.label.message}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="maxPerTx">Max per tx (USDC base units)</Label>
                <Input id="maxPerTx" type="number" {...register("maxPerTx")} />
              </div>
              <div>
                <Label htmlFor="dailyCap">Daily cap</Label>
                <Input id="dailyCap" type="number" {...register("dailyCap")} />
              </div>
            </div>
            <div>
              <Label htmlFor="expiry">Expiry (unix seconds; 0 = never)</Label>
              <Input id="expiry" type="number" {...register("expiry")} />
            </div>
            <div>
              <Label htmlFor="recipients">Allowed recipients (whitespace-separated, max 10)</Label>
              <Input id="recipients" {...register("recipients")} placeholder="pubkey1 pubkey2 ..." className="font-mono text-xs" />
              {errors.recipients && <p className="text-xs text-destructive">{errors.recipients.message}</p>}
            </div>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Allowed instructions</legend>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" {...register("allowTransfer")} /> transfer_usdc</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" {...register("allowKaminoDeposit")} /> kamino_deposit</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" {...register("allowKaminoWithdraw")} /> kamino_withdraw</label>
            </fieldset>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={phase !== "idle" && phase !== "done"}>
                {phase === "idle" || phase === "done" ? "Create" : `${phase}…`}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ApiKeyRevealModal apiKey={revealKey} onClose={() => setRevealKey(null)} />
    </>
  );
}
