"use client";

import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { type ReactNode, useMemo } from "react";
import { SWRConfig } from "swr";
import { SOLANA_RPC_URL } from "../lib/constants";
import { ApiError, swrFetcher } from "../lib/api-client";

export function Providers({ children }: { children: ReactNode }) {
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);

  return (
    <ConnectionProvider endpoint={SOLANA_RPC_URL}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <SWRConfig
            value={{
              fetcher: swrFetcher,
              revalidateOnFocus: true,
              dedupingInterval: 30_000,
              // Don't retry client-side errors  404 means "no such resource"
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
