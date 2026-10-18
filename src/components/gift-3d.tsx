"use client";

import { useEffect, useRef } from "react";
import { Scene3D } from "@/components/scene-3d";
import { createGiftScene } from "@/lib/gift-scene";

// The wrapped gift in 3D (loaded with next/dynamic from GiftInbox). Tap it to open.
export default function Gift3D({ color, opened, onOpen, onFail }: { color: string; opened: boolean; onOpen: () => void; onFail: () => void }) {
  const state = useRef({ opened });
  useEffect(() => {
    state.current.opened = opened;
  }, [opened]);
  return (
    <div className="relative mx-auto my-2 h-56 w-56 cursor-pointer" onClick={() => !opened && onOpen()}>
      <Scene3D sig={color} build={(el) => createGiftScene(el, color, state.current)} onFail={onFail} />
    </div>
  );
}
