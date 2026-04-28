import { ConnectButton } from "./connect-button";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-gray-50 p-8">
      <h1 className="text-3xl font-semibold">Klink</h1>
      <p className="max-w-md text-center text-sm text-gray-600">
        Agent wallets on Solana. Connect your Phantom wallet to create or manage a vault.
      </p>
      <ConnectButton />
      <p className="text-xs text-gray-400">Scaffold only — wallet flows land in T-302/T-303.</p>
    </main>
  );
}
