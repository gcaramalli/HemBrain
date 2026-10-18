"use client";

import { Scene3D } from "@/components/scene-3d";
import { createSleepScene, type SleepDial } from "@/lib/sleep-scene";
import { createWardrobeScene, type Rail } from "@/lib/wardrobe-scene";

const pill = "glass whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold shadow-sm";

// The kid's last 24 h of sleep as a dial (loaded with next/dynamic; see `sleep-scene.ts`).
export function SleepDial3D({ dial, onFail }: { dial: SleepDial; onFail: () => void }) {
  const sig = JSON.stringify(dial);
  return (
    <Scene3D
      sig={sig}
      build={(el) => createSleepScene(el, JSON.parse(sig) as SleepDial)}
      onFail={onFail}
      labels={["00", "06", "12", "18"].map((h) => ({ key: h, node: h, className: pill }))}
    />
  );
}

// The wardrobe plate (see `wardrobe-scene.ts`).
export function Wardrobe3D({ rails, names, color, onPick, onFail }: { rails: Rail[]; names: string[]; color: string; onPick: (i: number) => void; onFail: () => void }) {
  const sig = JSON.stringify({ rails, color });
  return (
    <Scene3D
      sig={sig}
      build={(el) => createWardrobeScene(el, rails, color, onPick)}
      onFail={onFail}
      labels={names.map((n, i) => ({ key: `${i}-${n}`, node: n, className: `${pill} max-w-[8rem] truncate` }))}
    />
  );
}
