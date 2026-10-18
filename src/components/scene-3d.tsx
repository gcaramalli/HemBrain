"use client";

import { useEffect, useRef, useState } from "react";

export type Built = { dispose: () => void; labels?: () => { x: number; y: number; visible: boolean }[] };
export type SceneLabel = { key: string; node: React.ReactNode; className?: string };

// Mounts one of the little three.js worlds (built with `createStage` from
// `src/lib/three-kit.ts`) in a box, rebuilds it only when `sig` changes (the
// data it shows, as a string), and pins HTML labels on the points its
// `labels()` gives (no 3D text). Without WebGL it renders nothing and calls `onFail`.
// Import it through next/dynamic so three.js only loads where a scene is shown.
export function Scene3D({
  build,
  sig,
  labels = [],
  className = "absolute inset-0",
  onFail,
}: {
  build: (el: HTMLDivElement) => Built;
  sig: string;
  labels?: SceneLabel[];
  className?: string;
  onFail?: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const tags = useRef<(HTMLSpanElement | null)[]>([]);
  const make = useRef(build);
  const fail = useRef(onFail);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    make.current = build;
    fail.current = onFail;
  });

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let scene: Built;
    try {
      scene = make.current(el);
    } catch {
      setFailed(true);
      fail.current?.();
      return;
    }
    let frame = 0;
    const place = () => {
      frame = requestAnimationFrame(place);
      scene.labels?.().forEach((p, i) => {
        const tag = tags.current[i];
        if (!tag) return;
        tag.style.transform = `translate(${p.x * el.clientWidth}px, ${p.y * el.clientHeight}px) translate(-50%, -50%)`;
        tag.style.visibility = p.visible ? "visible" : "hidden";
      });
    };
    if (scene.labels) frame = requestAnimationFrame(place);
    return () => {
      cancelAnimationFrame(frame);
      scene.dispose();
    };
  }, [sig]);

  if (failed) return null;
  return (
    <div ref={box} className={`${className} touch-manipulation`}>
      {labels.map((l, i) => (
        <span
          key={l.key}
          ref={(el) => {
            tags.current[i] = el;
          }}
          className={`pointer-events-none absolute left-0 top-0 ${l.className ?? ""}`}
        >
          {l.node}
        </span>
      ))}
    </div>
  );
}
