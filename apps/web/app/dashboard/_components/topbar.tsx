import { ProgressBar } from "@/app/_components/progress-bar";
import { truncatePubkey } from "@/lib/formatters";
import { SignOutButton } from "../sign-out-button";

interface Props { pubkey: string; }

export function Topbar({ pubkey }: Props) {
  return (
    <header className="sticky top-0 z-30 flex h-20 items-center justify-end gap-3 border-b border-olive-deep/[0.08] bg-card/80 px-6 backdrop-blur-md md:px-10">
      {/* Connected wallet pill, mirrors the landing nav status indicator. */}
      <div className="group flex items-center gap-2.5 rounded-pill bg-card px-4 py-2 text-sm shadow-[var(--shadow-pill)] ring-1 ring-olive-deep/[0.06] transition-all duration-[var(--dur-base)] ease-[var(--ease-klink)] hover:-translate-y-[1px] hover:shadow-[0_4px_12px_rgba(61,79,42,0.08)]">
        <span className="relative flex h-2 w-2">
          <span className="absolute inset-0 rounded-full bg-sap-green opacity-60 klink-pulse" />
          <span className="relative inline-block h-2 w-2 rounded-full bg-sap-green" />
        </span>
        <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Connected
        </span>
        <span className="font-mono text-xs text-olive-deep">
          {truncatePubkey(pubkey)}
        </span>
      </div>
      <SignOutButton />
      {/* T-248: app-wide progress bar lives at the bottom edge of the topbar */}
      <ProgressBar />
    </header>
  );
}
