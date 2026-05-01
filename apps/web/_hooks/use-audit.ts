"use client";

import useSWRInfinite from "swr/infinite";
import { ApiError } from "@/lib/api-client";
import { auditPageSchema, type AuditPage } from "@/lib/schemas";

type Decision = "all" | "allow" | "deny";

export function useAudit(decision: Decision) {
  return useSWRInfinite<AuditPage>(
    (i, prev: AuditPage | null) => {
      if (prev && !prev.next_cursor) return null;
      const cursor = prev?.next_cursor ? `&cursor=${prev.next_cursor}` : "";
      const f = decision === "all" ? "" : `&decision=${decision}`;
      return `/v1/audit?limit=50${cursor}${f}`;
    },
    async (path: string) => {
      // Same-origin via the Next.js /api/v1 proxy — see lib/api-client.ts.
      const r = await fetch(`/api${path}`, { credentials: "include" });
      if (!r.ok) {
        let detail: unknown;
        try { detail = await r.json(); } catch { detail = await r.text(); }
        const code = (detail as { error?: string })?.error ?? `HTTP_${r.status}`;
        throw new ApiError(r.status, code, code, detail);
      }
      return auditPageSchema.parse(await r.json());
    },
  );
}
