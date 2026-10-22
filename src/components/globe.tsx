"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import world from "@/lib/world-globe.json";
import type { Region } from "@/lib/countries";
import type { Member, Trip } from "@/lib/types";

const SHAPES: Record<string, string> = world.shapes;
const DOTS: Record<string, number[]> = world.dots;
const CENTERS: Record<string, number[]> = world.centers;

// Where each region turns to, and how close the camera comes.
const VIEWS: Record<Region, { lon: number; lat: number; dist: number }> = {
  world: { lon: 15, lat: 25, dist: 4.9 },
  europe: { lon: 14, lat: 50, dist: 3.1 },
  americas: { lon: -80, lat: 12, dist: 4.4 },
  asia: { lon: 95, lat: 30, dist: 4 },
  africa: { lon: 20, lat: 3, dist: 4 },
  oceania: { lon: 145, lat: -25, dist: 4 },
};

// A point on the unit sphere, matching SphereGeometry's UVs (lon -180 at -X, 0 at +X).
function toVec(lon: number, lat: number) {
  const phi = ((lon + 180) / 360) * Math.PI * 2;
  const la = (lat * Math.PI) / 180;
  return new THREE.Vector3(-Math.cos(phi) * Math.cos(la), Math.sin(la), Math.sin(phi) * Math.cos(la));
}

type Arc = { from: string; to: string; color: string };
type Scene = {
  paint: (fill: (code: string) => string, land: string, border: string) => void;
  arcs: (arcs: Arc[], home: string | null, ink: string) => void;
  look: (lon: number, lat: number, dist: number, spin: boolean) => void;
  dispose: () => void;
};

// The Travels globe: the same colours as WorldMap (each person's colour, ink
// where both parents went) painted on a sphere you turn with a finger, plus an
// arc from home to every trip on the timeline. Drawn with three.js, loaded only
// on this page (next/dynamic). Falls back to `fallback` without WebGL.
export function Globe({
  who,
  people,
  trips = [],
  region = "world",
  onPick,
  fallback,
}: {
  who: Map<string, string[]>;
  people: Member[];
  trips?: Trip[];
  region?: Region;
  onPick?: (code: string) => void;
  fallback?: React.ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const scene = useRef<Scene | null>(null);
  const pick = useRef(onPick);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    pick.current = onPick;
  }, [onPick]);

  useEffect(() => {
    if (!box.current) return;
    try {
      scene.current = createScene(box.current, (code) => pick.current?.(code));
    } catch {
      setFailed(true);
    }
    return () => {
      scene.current?.dispose();
      scene.current = null;
    };
  }, []);

  // Colours: re-read the theme each time (dark mode flips --foreground to white).
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const draw = () => {
      const s = scene.current;
      if (!s || !box.current) return;
      const css = getComputedStyle(box.current);
      const ink = css.getPropertyValue("--foreground").trim();
      const parents = people.filter((p) => p.profile_id);
      const colour = (ids: string[]) => {
        const went = people.filter((p) => ids.includes(p.id));
        if (!went.length) return null;
        if (parents.length > 1 && parents.every((p) => ids.includes(p.id))) return ink;
        return (went.find((p) => p.profile_id) ?? went[0]).color;
      };
      s.paint((code) => colour(who.get(code) ?? []) ?? "", css.getPropertyValue("--map-land").trim(), css.getPropertyValue("--surface").trim());

      // Home = where we live now (an open "lived" trip), else the last place lived in.
      const ours = trips.filter((x) => x.member_ids.some((id) => people.some((p) => p.id === id)));
      const lived = ours.filter((x) => x.lived).sort((a, b) => (b.start_month ?? "").localeCompare(a.start_month ?? ""));
      const home = (lived.find((x) => !x.end_month) ?? lived[0])?.country ?? null;
      const seen = new Set<string>();
      const arcs: Arc[] = [];
      for (const x of ours) {
        const color = colour(x.member_ids);
        const key = `${x.country}|${color}`;
        if (!home || !color || x.country === home || seen.has(key) || !CENTERS[x.country]) continue;
        seen.add(key);
        arcs.push({ from: home, to: x.country, color });
      }
      s.arcs(arcs, home && CENTERS[home] ? home : null, ink);
    };
    draw();
    mq.addEventListener("change", draw);
    return () => mq.removeEventListener("change", draw);
  }, [who, people, trips]);

  useEffect(() => {
    const v = VIEWS[region];
    scene.current?.look(v.lon, v.lat, v.dist, region === "world");
  }, [region]);

  if (failed) return <>{fallback}</>;
  return <div ref={box} className="relative aspect-square max-h-[28rem] w-full cursor-grab touch-pan-y select-none active:cursor-grabbing" role="img" aria-label="Globe" />;
}

function createScene(el: HTMLDivElement, onPick: (code: string) => void): Scene {
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.domElement.style.display = "block";
  el.appendChild(renderer.domElement);

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(0, 0, VIEWS.world.dist);
  const root = new THREE.Scene();
  const globe = new THREE.Group();
  root.add(globe);

  // The countries are drawn on a 2D canvas (equirectangular) and wrapped on the sphere.
  // 4096 px wide keeps borders sharp when zoomed on Europe; 2048 on weaker GPUs.
  const canvas = document.createElement("canvas");
  canvas.width = renderer.capabilities.maxTextureSize >= 4096 ? 4096 : 2048;
  canvas.height = canvas.width / 2;
  const SCALE = canvas.width / world.width; // plane units → texture pixels
  const ctx = canvas.getContext("2d")!;
  const paths = new Map(Object.entries(SHAPES).map(([code, d]) => [code, new Path2D(d)]));
  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  // Raw colours in, raw colours out: the CSS hex values land on screen unchanged,
  // only darkened towards the rim so it reads as a ball.
  const material = new THREE.ShaderMaterial({
    uniforms: { map: { value: texture } },
    vertexShader: `
      varying vec2 vUv; varying float vFacing;
      void main() {
        vUv = uv;
        vec3 n = normalize(normalMatrix * normal);
        vec4 p = modelViewMatrix * vec4(position, 1.0);
        vFacing = dot(n, normalize(-p.xyz));
        gl_Position = projectionMatrix * p;
      }`,
    fragmentShader: `
      uniform sampler2D map; varying vec2 vUv; varying float vFacing;
      void main() {
        vec4 c = texture2D(map, vUv);
        gl_FragColor = vec4(c.rgb * (0.78 + 0.22 * smoothstep(0.0, 0.7, vFacing)), 1.0);
      }`,
  });
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), material);
  globe.add(sphere);

  // A soft halo behind the ball, in the land colour.
  const haloMat = new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color() } },
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide,
    vertexShader: `
      varying float vRim;
      void main() {
        vec3 n = normalize(normalMatrix * normal);
        vec4 p = modelViewMatrix * vec4(position, 1.0);
        vRim = dot(n, normalize(p.xyz));
        gl_Position = projectionMatrix * p;
      }`,
    fragmentShader: `
      uniform vec3 color; varying float vRim;
      void main() { gl_FragColor = vec4(color, pow(clamp(vRim, 0.0, 1.0), 3.0) * 0.9); }`,
  });
  const halo = new THREE.Mesh(new THREE.SphereGeometry(1.12, 64, 32), haloMat);
  root.add(halo);

  // Travel arcs, drawn in one after the other, each with a little traveller looping along it.
  const arcGroup = new THREE.Group();
  globe.add(arcGroup);
  let arcs: { tube: THREE.Mesh<THREE.TubeGeometry, THREE.MeshBasicMaterial>; curve: THREE.Curve<THREE.Vector3>; dot: THREE.Mesh; delay: number }[] = [];
  let arcsBorn = 0;
  const dotGeo = new THREE.SphereGeometry(0.012, 12, 8);
  let homeDot: THREE.Mesh | null = null;

  // Turning: drag to spin (with a bit of inertia), slow turn on its own when idle.
  const rot = { x: (VIEWS.world.lat * Math.PI) / 180, y: 0, vx: 0, vy: 0 };
  const goal = { x: rot.x, y: rot.y, dist: VIEWS.world.dist, active: false };
  let spin = !still;
  let lastTouch = 0;
  const facing = (lon: number, lat: number) => {
    const v = toVec(lon, lat);
    return { y: -Math.atan2(v.x, v.z), x: (lat * Math.PI) / 180 };
  };
  goal.y = rot.y = facing(VIEWS.world.lon, VIEWS.world.lat).y;

  let drag: { x: number; y: number; moved: number; id: number } | null = null;
  const down = (e: PointerEvent) => {
    drag = { x: e.clientX, y: e.clientY, moved: 0, id: e.pointerId };
    rot.vx = rot.vy = 0;
    goal.active = false;
    lastTouch = performance.now();
  };
  const move = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    if (drag.moved > 6) el.setPointerCapture(e.pointerId);
    drag.x = e.clientX;
    drag.y = e.clientY;
    const k = (2.2 / el.clientWidth) * (camera.position.z / VIEWS.world.dist);
    rot.vy = dx * k;
    rot.vx = e.pointerType === "mouse" ? dy * k : 0; // on a phone, vertical swipes scroll the page
    rot.y += rot.vy;
    rot.x = THREE.MathUtils.clamp(rot.x + rot.vx, -1.2, 1.2);
    lastTouch = performance.now();
  };
  const ray = new THREE.Raycaster();
  const up = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    const tap = drag.moved <= 6;
    drag = null;
    if (!tap) return;
    const r = el.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    const uv = ray.intersectObject(sphere)[0]?.uv;
    const code = uv && hit(uv.x * world.width, (1 - uv.y) * world.height);
    if (code) onPick(code);
  };
  const cancel = () => (drag = null);
  el.addEventListener("pointerdown", down);
  el.addEventListener("pointermove", move);
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", cancel);

  // Which country is under a point of the plane: tiny ones (dots) first, then outlines.
  function hit(x: number, y: number) {
    let best: string | null = null;
    let near = 5;
    for (const [code, [cx, cy]] of Object.entries(DOTS)) {
      const d = Math.hypot(cx - x, cy - y);
      if (d < near) [best, near] = [code, d];
    }
    if (best) return best;
    ctx.setTransform(1, 0, 0, 1, 0, 0); // paths are in plane units
    for (const [code, p] of paths) if (ctx.isPointInPath(p, x, y)) return code;
    return null;
  }

  const resize = () => {
    const w = el.clientWidth;
    const h = el.clientHeight;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = `${w}px`;
    renderer.domElement.style.height = `${h}px`;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(el);
  resize();

  // Only draw while the globe is on screen.
  let visible = true;
  const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
  io.observe(el);

  let frame = 0;
  let prev = performance.now();
  const tick = (now: number) => {
    frame = requestAnimationFrame(tick);
    const dt = Math.min(now - prev, 50) / 1000;
    prev = now;
    if (!visible) return;
    if (goal.active) {
      const ease = 1 - Math.exp(-dt * 4);
      const dy = Math.atan2(Math.sin(goal.y - rot.y), Math.cos(goal.y - rot.y)); // shortest way round
      rot.y += dy * ease;
      rot.x += (goal.x - rot.x) * ease;
      if (Math.abs(dy) < 0.002 && Math.abs(goal.x - rot.x) < 0.002) goal.active = false;
    } else if (!drag) {
      rot.vx *= 0.92;
      rot.vy *= 0.92;
      rot.y += rot.vy;
      rot.x = THREE.MathUtils.clamp(rot.x + rot.vx, -1.2, 1.2);
      if (spin && now - lastTouch > 4000) rot.y += dt * 0.12;
    }
    camera.position.z += (goal.dist - camera.position.z) * (1 - Math.exp(-dt * 4));
    globe.rotation.set(rot.x, rot.y, 0);

    const age = (now - arcsBorn) / 1000;
    for (const a of arcs) {
      const grow = still ? 1 : THREE.MathUtils.clamp((age - a.delay) / 0.9, 0, 1);
      const count = a.tube.geometry.index!.count;
      a.tube.geometry.setDrawRange(0, Math.ceil((count * (1 - Math.pow(1 - grow, 3))) / 6) * 6);
      a.dot.visible = !still && grow === 1;
      if (a.dot.visible) a.dot.position.copy(a.curve.getPointAt(((age - a.delay) / 2.4) % 1));
    }
    if (homeDot) homeDot.scale.setScalar(still ? 1 : 1 + 0.35 * Math.sin(now / 400));
    renderer.render(root, camera);
  };
  frame = requestAnimationFrame(tick);

  const clearArcs = () => {
    for (const a of arcs) {
      a.tube.geometry.dispose();
      a.tube.material.dispose();
      (a.dot.material as THREE.Material).dispose();
    }
    if (homeDot) (homeDot.material as THREE.Material).dispose();
    arcGroup.clear();
    arcs = [];
    homeDot = null;
  };

  return {
    paint(fill, land, border) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = border; // the sea is the card's own colour
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
      ctx.strokeStyle = border;
      ctx.lineWidth = 0.3;
      ctx.lineJoin = "round";
      for (const [code, p] of paths) {
        ctx.fillStyle = fill(code) || land;
        ctx.fill(p);
        ctx.stroke(p);
      }
      for (const [code, [cx, cy]] of Object.entries(DOTS)) {
        const on = !!fill(code);
        ctx.beginPath();
        ctx.arc(cx, cy, on ? 1.8 : 1, 0, Math.PI * 2);
        ctx.fillStyle = fill(code) || land;
        ctx.fill();
      }
      texture.needsUpdate = true;
      haloMat.uniforms.color.value.set(land);
    },
    arcs(list, home, ink) {
      const before = arcs.map((a) => a.tube.name).join();
      clearArcs();
      if (home) {
        const [lon, lat] = CENTERS[home];
        homeDot = new THREE.Mesh(dotGeo, new THREE.MeshBasicMaterial({ color: ink }));
        homeDot.position.copy(toVec(lon, lat).multiplyScalar(1.004));
        homeDot.scale.setScalar(1.4);
        arcGroup.add(homeDot);
      }
      list.forEach((arc, i) => {
        const a = toVec(CENTERS[arc.from][0], CENTERS[arc.from][1]);
        const b = toVec(CENTERS[arc.to][0], CENTERS[arc.to][1]);
        const angle = a.angleTo(b);
        const lift = 0.03 + 0.2 * (angle / Math.PI);
        const pts = Array.from({ length: 33 }, (_, j) => {
          const t = j / 32;
          return slerp(a, b, angle, t).multiplyScalar(1.002 + lift * Math.sin(Math.PI * t));
        });
        const curve = new THREE.CatmullRomCurve3(pts);
        const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.0045, 5), new THREE.MeshBasicMaterial({ color: arc.color }));
        tube.name = `${arc.to}${arc.color}`;
        const dot = new THREE.Mesh(dotGeo, new THREE.MeshBasicMaterial({ color: arc.color }));
        arcGroup.add(tube, dot);
        arcs.push({ tube, curve, dot, delay: i * 0.12 });
      });
      // Only replay the drawing when the trips shown actually changed.
      if (arcs.map((a) => a.tube.name).join() !== before) arcsBorn = performance.now();
    },
    look(lon, lat, dist, turn) {
      const f = facing(lon, lat);
      Object.assign(goal, { x: f.x, y: f.y, dist, active: true });
      spin = turn && !still;
      lastTouch = performance.now();
    },
    dispose() {
      cancelAnimationFrame(frame);
      ro.disconnect();
      io.disconnect();
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", cancel);
      clearArcs();
      dotGeo.dispose();
      sphere.geometry.dispose();
      halo.geometry.dispose();
      material.dispose();
      haloMat.dispose();
      texture.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}

function slerp(a: THREE.Vector3, b: THREE.Vector3, angle: number, t: number) {
  if (angle < 1e-4) return a.clone();
  const s = Math.sin(angle);
  return a.clone().multiplyScalar(Math.sin((1 - t) * angle) / s).add(b.clone().multiplyScalar(Math.sin(t * angle) / s));
}
