"use client";

import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { type ReactNode, useMemo } from "react";
import { SWRConfig } from "swr";
import { SOLANA_RPC_URL } from "../lib/constants";
import { swrFetcher } from "../lib/api-client";

export function Providers({ children }: { children: ReactNode }) {
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);

  return (
    <ConnectionProvider endpoint={SOLANA_RPC_URL}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <SWRConfig value={{ fetcher: swrFetcher, revalidateOnFocus: true, dedupingInterval: 30_000 }}>
            {children}
          </SWRConfig>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
