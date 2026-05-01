"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/app/_components/ui/dialog";
import { Button } from "@/app/_components/ui/button";
import { Input } from "@/app/_components/ui/input";
import { Label } from "@/app/_components/ui/label";
import { useBuildAndSignTx } from "@/_hooks/use-build-and-sign-tx";
import { postSessionResponseSchema } from "@/lib/schemas";
import { INSTRUCTION_BITS, MAX_RECIPIENTS } from "@/lib/constants";
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

interface Props { onCreated: () => void; }

export function NewSessionModal({ onCreated }: Props) {
  const [open, setOpen] = useState(false);
  const [revealKey, setRevealKey] = useState<string | null>(null);
  const { run, phase } = useBuildAndSignTx();
  const { toast } = useToast();

  const { register, handleSubmit, formState: { errors }, reset } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      label: "", maxPerTx: 100_000, dailyCap: 1_000_000, expiry: 0,
      recipients: "",
      allowTransfer: true, allowKaminoDeposit: false, allowKaminoWithdraw: false,
    },
  });

  async function onSubmit(values: FormValues) {
    const recipients = values.recipients.trim().split(/\s+/).filter(Boolean);
    let bitmap = 0;
    if (values.allowTransfer) bitmap |= 1 << INSTRUCTION_BITS.TRANSFER_USDC;
    if (values.allowKaminoDeposit) bitmap |= 1 << INSTRUCTION_BITS.KAMINO_DEPOSIT;
    if (values.allowKaminoWithdraw) bitmap |= 1 << INSTRUCTION_BITS.KAMINO_WITHDRAW;

    try {
      const result = await run("/v1/session", "POST", {
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
