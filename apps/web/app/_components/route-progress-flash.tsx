"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { useProgress } from "./progress-context";

/**
 * T-248: flash the progress bar 0->100% on every route change. Mounted
 * once near the top of the dashboard layout. Pure side-effect component,
 * renders nothing.
 */
export function RouteProgressFlash() {
  const pathname = usePathname();
  const { flash } = useProgress();
  const lastPathRef = useRef<string | null>(null);
  useEffect(() => {
    if (lastPathRef.current !== null && lastPathRef.current !== pathname) {
      flash();
    }
    lastPathRef.current = pathname;
  }, [pathname, flash]);
  return null;
}
