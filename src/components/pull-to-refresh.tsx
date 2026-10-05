"use client";

import { useEffect, useRef, useState } from "react";
import { ThinkingDots } from "./thinking-dots";

const THRESHOLD = 70; // px of indicator height that triggers the refresh
const MIN_SPIN = 1200; // ms: a full bounce of the three dots, so you see it happen

// Pull down from the top of the page to refresh. An installed app on an iPhone
// has no pull-to-refresh of its own, so the app draws one: the logo's three
// dots appear as you pull and bounce while the page loads again.
export function PullToRefresh({ onRefresh }: { onRefresh: () => void }) {
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const start = useRef<number | null>(null);
  const pullRef = useRef(0);

  useEffect(() => {
    // In Safari itself the browser already pulls to refresh: only the installed app needs this.
    const installed = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
    if (!installed) return;
    const down = (e: TouchEvent) => {
      // Only from the very top, and not inside an open sheet.
      const inSheet = (e.target as Element | null)?.closest?.("[data-sheet]");
      start.current = window.scrollY <= 0 && !inSheet && !busy ? e.touches[0].clientY : null;
      setDragging(start.current !== null);
    };
    const move = (e: TouchEvent) => {
      if (start.current === null) return;
      const dy = e.touches[0].clientY - start.current;
      if (dy <= 0 || window.scrollY > 0) {
        pullRef.current = 0;
        setPull(0);
        return;
      }
      // Resistance: the further you pull, the slower it follows.
      pullRef.current = Math.min(110, dy * 0.45);
      setPull(pullRef.current);
    };
    const up = () => {
      if (start.current === null) return;
      start.current = null;
      setDragging(false);
      if (pullRef.current >= THRESHOLD) {
        setBusy(true);
        setPull(THRESHOLD);
        onRefresh();
        setTimeout(() => {
          setBusy(false);
          setPull(0);
        }, MIN_SPIN);
      } else setPull(0);
      pullRef.current = 0;
    };
    window.addEventListener("touchstart", down, { passive: true });
    window.addEventListener("touchmove", move, { passive: true });
    window.addEventListener("touchend", up);
    window.addEventListener("touchcancel", up);
    return () => {
      window.removeEventListener("touchstart", down);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", up);
      window.removeEventListener("touchcancel", up);
    };
  }, [busy, onRefresh]);

  const progress = Math.min(1, pull / THRESHOLD);
  return (
    <div
      aria-hidden={!busy}
      className="flex items-end justify-center overflow-hidden"
      style={{ height: pull, transition: dragging ? undefined : "height 200ms ease-out" }}
    >
      <span className="pb-4" style={{ opacity: busy ? 1 : progress, transform: `scale(${0.6 + 0.4 * progress})` }}>
        <ThinkingDots size={11} still={!busy} />
      </span>
    </div>
  );
}
