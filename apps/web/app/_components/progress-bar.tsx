"use client";

import { useEffect, useState } from "react";
import { useProgress } from "./progress-context";

/**
 * T-248: thin progress bar that sits at the bottom edge of the topbar.
 *
 * Two render modes selected by what's happening in the ProgressContext:
 *   - active > 0     -> indeterminate sap-green sweep, bar visible
 *   - flashKey bumps -> determinate 0->100% in 400ms, then fade
 *
 * Pure CSS animations (no JS tweening). The keyframes live in this file
 * and are hooked via inline <style> so we don't have to plumb new entries
 * into globals.css for a one-off component.
 */
export function ProgressBar() {
  const { state } = useProgress();
  const { active, flashKey } = state;

  // Track the previous flashKey so we can mount a one-shot determinate
  // animation that restarts via React key.
  const [lastFlashKey, setLastFlashKey] = useState(flashKey);
  const [flashVisible, setFlashVisible] = useState(false);
  useEffect(() => {
    if (flashKey !== lastFlashKey) {
      setLastFlashKey(flashKey);
      setFlashVisible(true);
      const t = setTimeout(() => setFlashVisible(false), 600);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [flashKey, lastFlashKey]);

  const isActive = active > 0;
  const isVisible = isActive || flashVisible;

  return (
    <>
      <style jsx>{`
        .klink-progress-track {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          height: 2px;
          overflow: hidden;
          pointer-events: none;
          opacity: 0;
          transition: opacity 200ms cubic-bezier(0.22, 1, 0.36, 1);
        }
        .klink-progress-track.is-visible {
          opacity: 1;
        }
        .klink-progress-fill-indeterminate {
          position: absolute;
          inset: 0;
          width: 30%;
          background: linear-gradient(
            90deg,
            transparent 0%,
            #9cc36b 50%,
            transparent 100%
          );
          animation: klink-progress-sweep 1.2s cubic-bezier(0.65, 0, 0.35, 1) infinite;
        }
        .klink-progress-fill-determinate {
          position: absolute;
          inset: 0 100% 0 0;
          background: #9cc36b;
          animation: klink-progress-flash 600ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
        @keyframes klink-progress-sweep {
          0% {
            transform: translateX(-110%);
          }
          100% {
            transform: translateX(440%);
          }
        }
        @keyframes klink-progress-flash {
          0% {
            inset: 0 100% 0 0;
            opacity: 0.9;
          }
          80% {
            inset: 0 0 0 0;
            opacity: 1;
          }
          100% {
            inset: 0 0 0 0;
            opacity: 0;
          }
        }
      `}</style>
      <div
        className={`klink-progress-track ${isVisible ? "is-visible" : ""}`}
        role="progressbar"
        aria-hidden={!isVisible}
        aria-busy={isActive}
      >
        {isActive ? (
          <div className="klink-progress-fill-indeterminate" />
        ) : flashVisible ? (
          <div key={lastFlashKey} className="klink-progress-fill-determinate" />
        ) : null}
      </div>
    </>
  );
}
