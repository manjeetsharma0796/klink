"use client";

import useSWRInfinite from "swr/infinite";
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
      const r = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}${path}`, { credentials: "include" });
      if (!r.ok) throw Object.assign(new Error(`HTTP ${r.status}`), { status: r.status });
      return auditPageSchema.parse(await r.json());
    },
  );
}
