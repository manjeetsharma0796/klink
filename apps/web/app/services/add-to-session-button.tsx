"use client";

import Link from "next/link";
import {
  buildAddToSessionQuery,
  suggestMaxPerCallFromPrice,
} from "@/lib/add-to-session-params";

interface Props {
  url: string;
  recipient: string;
  price: string;
}

/**
 * Renders a deep link into the dashboard's sessions list with the URL +
 * recipient + suggested per-call cap encoded as query params. The dashboard
 * sessions page handles the auth gate, the multi-session picker, and the
 * zero-session create-new flow. T-314.
 */
export function AddToSessionButton({ url, recipient, price }: Props) {
  const q = buildAddToSessionQuery({
    addUrl: url,
    addRecipient: recipient,
    suggestMaxPerCall: suggestMaxPerCallFromPrice(price),
  });
  return (
    <Link
      href={`/dashboard/sessions${q}`}
      className="rounded-pill bg-sap-green px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-primary-foreground transition-all duration-[var(--dur-base)] ease-[var(--ease-klink)] hover:opacity-90 active:scale-[0.97]"
    >
      Add to session
    </Link>
  );
}
