import { ProgressBar } from "@/app/_components/progress-bar";
import { truncatePubkey } from "@/lib/formatters";
import { SignOutButton } from "../sign-out-button";

interface Props {
  /** Null when the user is not signed in (the dashboard layout still renders
   *  the chrome behind a sign-in gate modal in that case). */
  pubkey: string | null;
}

export function Topbar({ pubkey }: Props) {
  const connected = pubkey !== null;
  return (
    <header className="sticky top-0 z-30 flex h-20 items-center justify-end gap-3 border-b border-olive-deep/[0.08] bg-card/80 px-6 backdrop-blur-md md:px-10">
      {/* Status pill — sage when connected, muted-amber when waiting on sign-in. */}
      <div className="group flex items-center gap-2.5 rounded-pill bg-card px-4 py-2 text-sm shadow-[var(--shadow-pill)] ring-1 ring-olive-deep/[0.06] transition-all duration-[var(--dur-base)] ease-[var(--ease-klink)] hover:-translate-y-[1px] hover:shadow-[0_4px_12px_rgba(61,79,42,0.08)]">
        <span className="relative flex h-2 w-2">
          <span
            className={`absolute inset-0 rounded-full opacity-60 klink-pulse ${connected ? "bg-sap-green" : "bg-muted-foreground/60"}`}
          />
          <span
            className={`relative inline-block h-2 w-2 rounded-full ${connected ? "bg-sap-green" : "bg-muted-foreground/70"}`}
          />
        </span>
        <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          {connected ? "Connected" : "Not connected"}
        </span>
        {connected && (
          <span className="font-mono text-xs text-olive-deep">
            {truncatePubkey(pubkey)}
          </span>
        )}
      </div>
      {connected && <SignOutButton />}
      {/* T-248: app-wide progress bar lives at the bottom edge of the topbar */}
      <ProgressBar />
    </header>
  );
}
