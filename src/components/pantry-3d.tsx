"use client";

import { Scene3D } from "@/components/scene-3d";
import { createPantryScene, type Jar } from "@/lib/pantry-scene";

// The pantry shelf (loaded with next/dynamic; see `pantry-scene.ts`).
export default function Pantry3D({ jars, names, onPick, onFail }: { jars: Jar[]; names: string[]; onPick: (i: number) => void; onFail: () => void }) {
  const sig = JSON.stringify(jars);
  return (
    <Scene3D
      sig={sig}
      build={(el) => createPantryScene(el, JSON.parse(sig) as Jar[], onPick)}
      onFail={onFail}
      labels={names.map((n, i) => ({ key: `${i}-${n}`, node: n, className: "glass max-w-[6rem] truncate rounded-full px-2 py-0.5 text-[11px] font-semibold shadow-sm" }))}
    />
  );
}
