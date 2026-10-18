"use client";

import { Scene3D } from "@/components/scene-3d";
import { createScaleScene, type ScaleData } from "@/lib/scale-scene";

// The balance on the expenses page (loaded with next/dynamic; see `scale-scene.ts`).
export default function ExpenseScale({ data, labels, onFail }: { data: ScaleData; labels: string[]; onFail: () => void }) {
  const sig = JSON.stringify(data);
  return (
    <Scene3D
      sig={sig}
      build={(el) => createScaleScene(el, JSON.parse(sig) as ScaleData)}
      onFail={onFail}
      labels={labels.map((l, i) => ({ key: String(i), node: l, className: "glass whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold shadow-sm" }))}
    />
  );
}
