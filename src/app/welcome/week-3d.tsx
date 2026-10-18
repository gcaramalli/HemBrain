"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import type { SceneDay } from "@/lib/week-scene";
import { ALEX, LEO, SAM } from "./demos";

const WeekScene3D = dynamic(() => import("./week-3d-scene"), { ssr: false, loading: () => <div className="absolute inset-0" /> });

// The calendar's 3D week on the landing page, for the made-up family (Alex,
// Sam, Leo): it builds itself, then lives on its loop. Nothing here reads data.
// Without WebGL, `fallback` (the flat week strip) shows instead.
const DAYS: SceneDay[] = [
  { today: true, weekend: false, acts: [{ kind: "meal", colors: [SAM.color, ALEX.color] }], needs: 0, todos: 1 },
  { today: false, weekend: false, acts: [{ kind: "swim", colors: [SAM.color, LEO.color] }], needs: 1, todos: 0 },
  { today: false, weekend: false, acts: [{ kind: "work", colors: [ALEX.color] }], needs: 0, todos: 0 },
  { today: false, weekend: false, acts: [{ kind: "racket", colors: [ALEX.color] }, { kind: "drinks", colors: [SAM.color] }], needs: 0, todos: 0 },
  { today: false, weekend: false, acts: [{ kind: "family", colors: [LEO.color] }], needs: 0, todos: 0 },
  { today: false, weekend: true, acts: [{ kind: "party", colors: [LEO.color] }], needs: 0, todos: 0 },
  { today: false, weekend: true, acts: [{ kind: "outing", colors: [ALEX.color, SAM.color, LEO.color] }], needs: 0, todos: 0 },
];

export function Week3D({ bcp47, fallback }: { bcp47: string; fallback: React.ReactNode }) {
  const [flat, setFlat] = useState(false);
  if (flat) return <>{fallback}</>;
  // Day names from a fixed Monday, so the server and every visitor agree.
  const labels = DAYS.map((_, i) => new Date(Date.UTC(2026, 0, 5 + i, 12)).toLocaleDateString(bcp47, { weekday: "short", timeZone: "UTC" }));
  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[22px]">
      <WeekScene3D days={DAYS} labels={labels} onFail={() => setFlat(true)} />
    </div>
  );
}
