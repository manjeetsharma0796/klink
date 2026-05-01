"use client";

import useSWR from "swr";
import type { Wallet } from "@/lib/schemas";
import { walletSchema } from "@/lib/schemas";

export function useWalletData() {
  const { data, error, isLoading, mutate } = useSWR<unknown>("/v1/wallet");
  const parsed = data ? walletSchema.safeParse(data) : null;
  if (typeof window !== "undefined") {
    console.log("[klink:useWalletData]", {
      isLoading,
      errorStatus: error?.status,
      errorCode: error?.code,
      hasData: data !== undefined,
      data,
      parseOk: parsed?.success ?? null,
      parseIssues: parsed && !parsed.success ? parsed.error.issues : null,
    });
  }
  return {
    wallet: parsed?.success ? (parsed.data as Wallet) : null,
    notFound: error?.status === 404,
    error: error && error.status !== 404 ? error : null,
    isLoading,
    mutate,
  };
}
