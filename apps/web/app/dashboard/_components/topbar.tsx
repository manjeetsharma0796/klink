import { ProgressBar } from "@/app/_components/progress-bar";
import { truncatePubkey } from "@/lib/formatters";
import { SignOutButton } from "../sign-out-button";

interface Props { pubkey: string; }

export function Topbar({ pubkey }: Props) {
  return (
    <header className="relative flex h-20 items-center justify-end gap-3 bg-card px-8">
      {/* Connected wallet pill, mirrors the landing nav status indicator */}
      <div className="flex items-center gap-2 rounded-pill bg-primary/15 px-4 py-2 text-sm shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
        <span className="h-2 w-2 rounded-full bg-sap-green" />
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
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
