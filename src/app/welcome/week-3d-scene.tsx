"use client";

import { Scene3D } from "@/components/scene-3d";
import { createWeekScene, type SceneDay } from "@/lib/week-scene";

// The made-up family's week as the 3D diorama (loaded by `Week3D`).
export default function WeekScene3D({ days, labels, onFail }: { days: SceneDay[]; labels: string[]; onFail: () => void }) {
  return (
    <Scene3D
      sig={JSON.stringify(days)}
      build={(el) => createWeekScene(el, days, () => {}, true)}
      onFail={onFail}
      labels={labels.map((l, i) => ({
        key: String(i),
        node: l,
        className: `rounded-full px-2 py-0.5 text-[11px] font-semibold shadow-sm ${i === 0 ? "bg-[#ff7a1a] text-white" : "glass"}`,
      }))}
    />
  );
}
