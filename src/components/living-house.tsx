"use client";

import { Scene3D } from "@/components/scene-3d";
import { createHomeScene, type HomeSceneData } from "@/lib/home-scene";

// The living house at the top of Home (loaded with next/dynamic; see `home-scene.ts`).
export default function LivingHouse({ data, names, onFail }: { data: HomeSceneData; names: Record<string, string>; onFail: () => void }) {
  const sig = JSON.stringify(data);
  return (
    <Scene3D
      sig={sig}
      build={(el) => createHomeScene(el, JSON.parse(sig) as HomeSceneData)}
      onFail={onFail}
      labels={data.people.map((p) => ({
        key: p.id,
        className: "glass flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
        node: (
          <>
            <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
            {names[p.id]}
          </>
        ),
      }))}
    />
  );
}
