"use client";

import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { type ReactNode, useMemo } from "react";
import { SWRConfig } from "swr";
import { SOLANA_RPC_URL } from "../lib/constants";
import { ApiError, swrFetcher } from "../lib/api-client";

export function Providers({ children }: { children: ReactNode }) {
  // T-247: empty adapters array. Phantom and other modern wallets register
  // themselves automatically via the Wallet Standard, so the legacy
  // PhantomWalletAdapter plugin is redundant. Per anza-xyz/wallet-adapter
  // APP.md, removing legacy adapters reduces bundle size and supply-chain
  // surface, and the duplicate registration was contributing to the
  // post-sign-out hydration mismatch on WalletMultiButton.
  const wallets = useMemo(() => [], []);

  return (
    <ConnectionProvider endpoint={SOLANA_RPC_URL}>
      {/* T-247: autoConnect removed. The SIWS flow is always a deliberate
          user action and autoConnect re-prompted Phantom on every mount,
          which produced WalletConnectionError: User rejected when the user
          tried to switch wallets after signing out. */}
      <WalletProvider wallets={wallets}>
        <WalletModalProvider>
          <SWRConfig
            value={{
              fetcher: swrFetcher,
              revalidateOnFocus: true,
              dedupingInterval: 30_000,
              // Don't retry client-side errors. 404 means "no such resource"
              // (e.g. wallet not created yet) and the UI handles that branch
              // explicitly. Retrying floods the network tab and burns the
              // backend for nothing. Server-side 5xx still retries normally.
              shouldRetryOnError: (err: unknown) =>
                !(err instanceof ApiError && err.status >= 400 && err.status < 500),
            }}
          >
            {children}
          </SWRConfig>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
