"use client";

import { createContext, type ReactNode, useCallback, useContext, useMemo, useRef, useState } from "react";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

/**
 * T-248: branded confirm dialog system, replaces native window.confirm.
 *
 * Usage:
 *
 *   const confirm = useConfirm();
 *   const ok = await confirm({
 *     title: "Send 5 USDC to ...",
 *     description: "This cannot be undone.",
 *     confirmText: "Withdraw",
 *     destructive: true,
 *   });
 *   if (ok) ...
 *
 * Backed by a single dialog instance mounted at the provider boundary. The
 * hook returns a promise that resolves true on confirm, false on cancel /
 * dismiss. If two confirms are requested concurrently the second one
 * queues, the first resolves first.
 */

interface ConfirmOptions {
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  /** Renders the confirm button in the destructive variant (orange-bright
   *  under the klink palette). Use for irreversible actions. */
  destructive?: boolean;
}

type Resolver = (ok: boolean) => void;

interface ConfirmApi {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmApi | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const queueRef = useRef<Array<{ opts: ConfirmOptions; resolve: Resolver }>>([]);
  const activeResolveRef = useRef<Resolver | null>(null);

  const showNext = useCallback(() => {
    const next = queueRef.current.shift();
    if (!next) {
      setOpen(false);
      setOpts(null);
      activeResolveRef.current = null;
      return;
    }
    setOpts(next.opts);
    activeResolveRef.current = next.resolve;
    setOpen(true);
  }, []);

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        queueRef.current.push({ opts: options, resolve });
        if (!activeResolveRef.current) showNext();
      }),
    [showNext],
  );

  const settle = useCallback(
    (ok: boolean) => {
      const resolve = activeResolveRef.current;
      activeResolveRef.current = null;
      setOpen(false);
      // Resolve after close transition starts so the dialog doesn't flicker
      // when caller's then() immediately opens a new one.
      setTimeout(() => {
        resolve?.(ok);
        showNext();
      }, 50);
    },
    [showNext],
  );

  const value = useMemo<ConfirmApi>(() => ({ confirm }), [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <Dialog open={open} onOpenChange={(next) => { if (!next) settle(false); }}>
        <DialogContent className="border-border/60 bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-olive-deep">{opts?.title}</DialogTitle>
            {opts?.description && (
              <DialogDescription className="text-muted-foreground">
                {opts.description}
              </DialogDescription>
            )}
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="ghost" onClick={() => settle(false)}>
              {opts?.cancelText ?? "Cancel"}
            </Button>
            <Button
              variant={opts?.destructive ? "destructive" : "default"}
              onClick={() => settle(true)}
            >
              {opts?.confirmText ?? "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmApi["confirm"] {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    // Test/SSR fallback: log and return false so callers don't crash. Real
    // provider replaces this at runtime in the dashboard layout.
    return () => Promise.resolve(false);
  }
  return ctx.confirm;
}
