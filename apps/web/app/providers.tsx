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
      {/* T-250: autoConnect re-enabled. T-247 originally turned this off to
          fix a post-sign-out reconnect loop, but that broke dashboard pages
          on reload where the user has a valid JWT but a fresh adapter
          state. The reconnect-loop is now mitigated by sign-out also
          clearing the cached wallet name via select(null) (see
          sign-out-button.tsx), so autoConnect has nothing to reconnect to
          after the user signs out and they get a clean wallet picker on
          the SignIn page. */}
      <WalletProvider wallets={wallets} autoConnect>
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
