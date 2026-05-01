"use client";
import useSWR from "swr";
import { sessionDetailSchema, type SessionDetail } from "@/lib/schemas";

export function useSession(id: string | undefined) {
  const { data, error, isLoading, mutate } = useSWR<unknown>(id ? `/v1/sessions/${id}` : null);
  const parsed = data ? sessionDetailSchema.safeParse(data) : null;
  return {
    session: parsed?.success ? (parsed.data as SessionDetail) : null,
    notImplemented: error?.status === 404 || error?.status === 405,
    error: error && ![404, 405].includes(error.status) ? error : null,
    isLoading,
    mutate,
  };
}
