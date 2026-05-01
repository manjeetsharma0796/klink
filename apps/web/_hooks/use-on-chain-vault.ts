"use client";

import { PublicKey } from "@solana/web3.js";
import useSWR from "swr";
import { fetchVault, fetchUsdcAtaBalance, getRpcConnection, deriveVaultPda } from "@/lib/on-chain";

export function useOnChainVault(ownerPubkey: string | null | undefined) {
  return useSWR(
    ownerPubkey ? ["on-chain-vault", ownerPubkey] : null,
    async () => {
      const owner = new PublicKey(ownerPubkey!);
      const conn = getRpcConnection();
      const vaultPda = deriveVaultPda(owner);
      const [vault, liquid] = await Promise.all([
        fetchVault(conn, owner),
        fetchUsdcAtaBalance(conn, vaultPda),
      ]);
      return {
        vaultPda: vaultPda.toBase58(),
        liquid,
        deployed: vault?.deployedAmount ?? BigInt(0),
        exists: vault !== null,
      };
    },
    { refreshInterval: 15_000 },
  );
}
