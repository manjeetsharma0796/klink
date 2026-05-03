"use client";
import useSWR from "swr";
import { sessionDetailSchema, type SessionDetail } from "@/lib/schemas";

export function useSession(id: string | undefined) {
  const { data, error, isLoading, mutate } = useSWR<unknown>(id ? `/v1/sessions/${id}` : null);
  const parsed = data ? sessionDetailSchema.safeParse(data) : null;
  return {
    session: parsed?.success ? (parsed.data as SessionDetail) : null,
    error,
    isLoading,
    mutate,
  };
}
