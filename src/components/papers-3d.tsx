"use client";

import { Scene3D } from "@/components/scene-3d";
import { createPapersScene, type Shelf } from "@/lib/papers-scene";

// The papers plate (loaded with next/dynamic; see `papers-scene.ts`).
export default function Papers3D({ shelves, names, onPick, onFail }: { shelves: Shelf[]; names: string[]; onPick: (i: number) => void; onFail: () => void }) {
  const sig = JSON.stringify(shelves);
  return (
    <Scene3D
      sig={sig}
      build={(el) => createPapersScene(el, JSON.parse(sig) as Shelf[], onPick)}
      onFail={onFail}
      labels={names.map((n, i) => ({ key: `${i}-${n}`, node: n, className: "glass max-w-[7rem] truncate rounded-full px-2 py-0.5 text-[11px] font-semibold shadow-sm" }))}
    />
  );
}
