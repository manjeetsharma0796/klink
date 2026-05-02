"use client";

import useSWR from "swr";
import type { Wallet } from "@/lib/schemas";
import { walletSchema } from "@/lib/schemas";

export function useWalletData() {
  const { data, error, isLoading, mutate } = useSWR<unknown>("/v1/wallet");
  const parsed = data ? walletSchema.safeParse(data) : null;
  return {
    wallet: parsed?.success ? (parsed.data as Wallet) : null,
    notFound: error?.status === 404,
    error: error && error.status !== 404 ? error : null,
    isLoading,
    mutate,
  };
}
