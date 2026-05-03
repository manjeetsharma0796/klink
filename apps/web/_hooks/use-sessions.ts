"use client";
import useSWR from "swr";
import { sessionsListSchema, type SessionRow } from "@/lib/schemas";

export function useSessions() {
  const { data, error, isLoading, mutate } = useSWR<unknown>("/v1/sessions");
  const parsed = data ? sessionsListSchema.safeParse(data) : null;
  return {
    sessions: parsed?.success ? (parsed.data as SessionRow[]) : null,
    error,
    isLoading,
    mutate,
  };
}
