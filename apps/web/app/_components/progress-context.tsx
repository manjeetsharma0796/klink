"use client";

import { createContext, type ReactNode, useCallback, useContext, useMemo, useRef, useState } from "react";

/**
 * T-248: app-wide progress indicator state.
 *
 * Tracks active operations as a refcount. Any consumer can call `start()`
 * which returns a stable `end` function. When the refcount goes from 0 to 1
 * the bar becomes visible (indeterminate animation); when it returns to 0
 * the bar fades out. There is also `flash()` for short determinate pulses
 * (route transitions etc) that just animates 0 → 100% in ~400ms.
 *
 * The bar component itself reads the `active` and `flashKey` values and
 * decides what to render. This file is pure state plumbing so it can be
 * tested without DOM.
 */

interface ProgressState {
  /** Number of in-flight operations. */
  active: number;
  /** Bumped each time flash() is called; the bar component uses this as a
   *  React key so the determinate animation restarts on each flash. */
  flashKey: number;
}

interface ProgressApi {
  state: ProgressState;
  /** Increment the active counter; returns a function that decrements once. */
  start: () => () => void;
  /** Trigger a one-off 0->100% pulse, no refcount change. */
  flash: () => void;
}

const ProgressContext = createContext<ProgressApi | null>(null);

export function ProgressProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ProgressState>({ active: 0, flashKey: 0 });
  // Guard against double-end() calls on the same returned function.
  const tokenSeqRef = useRef(0);
  const liveTokensRef = useRef(new Set<number>());

  const start = useCallback(() => {
    const token = ++tokenSeqRef.current;
    liveTokensRef.current.add(token);
    setState((s) => ({ ...s, active: s.active + 1 }));
    let ended = false;
    return () => {
      if (ended) return;
      ended = true;
      if (!liveTokensRef.current.delete(token)) return;
      setState((s) => ({ ...s, active: Math.max(0, s.active - 1) }));
    };
  }, []);

  const flash = useCallback(() => {
    setState((s) => ({ ...s, flashKey: s.flashKey + 1 }));
  }, []);

  const value = useMemo<ProgressApi>(() => ({ state, start, flash }), [state, start, flash]);

  return <ProgressContext.Provider value={value}>{children}</ProgressContext.Provider>;
}

export function useProgress(): ProgressApi {
  const ctx = useContext(ProgressContext);
  if (!ctx) {
    // Tests / SSR / components rendered outside the provider fall back to a
    // no-op so they can import the hook without forcing every test to wrap
    // in a provider. Real provider always wins at runtime.
    return {
      state: { active: 0, flashKey: 0 },
      start: () => () => undefined,
      flash: () => undefined,
    };
  }
  return ctx;
}
