"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { ThinkingDots } from "@/components/thinking-dots";

// Plays the welcome page's conversation once it scrolls into view: each
// message appears in turn, and before each of Hem's answers its three dots
// bounce for a moment. Everything is shown at once without JS or with
// reduced motion. Items keep their space while hidden, so nothing jumps.
const STEP_MS = 650;
const Phase = createContext(Infinity);

export function ChatPlayer({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState(Infinity);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
    // Below the fold at load: hide the conversation until it is seen.
    if (el.getBoundingClientRect().top < window.innerHeight) return;
    setPhase(-1);
    let timer: ReturnType<typeof setInterval> | undefined;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || timer) return;
        setPhase(0);
        timer = setInterval(() => setPhase((p) => (p >= 40 ? (clearInterval(timer), Infinity) : p + 1)), STEP_MS);
        io.disconnect();
      },
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      if (timer) clearInterval(timer);
    };
  }, []);

  return (
    <div ref={ref} className={className}>
      <Phase.Provider value={phase}>{children}</Phase.Provider>
    </div>
  );
}

// Message number `n` of the conversation. Hem's answers (`typing`) are
// preceded by the bouncing dots.
export function Step({ n, typing, children }: { n: number; typing?: boolean; children: React.ReactNode }) {
  const phase = useContext(Phase);
  const at = n * 2 + (typing ? 1 : 0);
  const shown = phase >= at;
  const thinking = typing && phase === at - 1;
  return (
    <div className="relative">
      <div className={shown ? "transition-opacity duration-300" : "invisible opacity-0"}>{children}</div>
      {thinking && (
        <span className="absolute top-2 left-1">
          <ThinkingDots size={8} label="Hem" />
        </span>
      )}
    </div>
  );
}
