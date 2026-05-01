import { truncatePubkey } from "@/lib/formatters";
import { SignOutButton } from "../sign-out-button";

interface Props { pubkey: string; }

export function Topbar({ pubkey }: Props) {
  return (
    <header className="flex h-16 items-center justify-between border-b bg-card px-6">
      <div />
      <div className="flex items-center gap-3">
        <span className="rounded-full bg-secondary px-3 py-1 text-xs font-mono text-secondary-foreground">
          {truncatePubkey(pubkey)}
        </span>
        <SignOutButton />
      </div>
    </header>
  );
}
