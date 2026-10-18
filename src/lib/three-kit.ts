// The shared toolbox of Hembrain's little 3D worlds (the week, the house on
// Home, the pantry, the scale, the cabinet, Charlie's dial, the gift…): one
// look everywhere — rounded boxes, MeshStandardMaterial, one sun with soft
// shadows plus a hemisphere light, ACES and (optionally) GTAO — and the same
// pop-in, tap and label mechanics. Plain three.js; React mounts it through
// `Scene3D` (`src/components/scene-3d.tsx`).
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";

export const PALETTE = {
  ground: "#f4f2ed",
  tile: "#ffffff",
  weekend: "#e2f1ee",
  blue: "#2c55d4",
  sky: "#5b9cf5",
  teal: "#14a3a0",
  green: "#36a96b",
  greenLight: "#5cc486",
  grass: "#7cc98f",
  orange: "#ff7a1a",
  trunk: "#8a6a52",
  wood: "#c79a6b",
  road: "#dfe3ea",
  nobody: "#b9c0cc",
  guest: "#c9ced8",
  glass: "#dfeaff",
  dark: "#2a3140",
  skin: "#f3dcc6",
  gold: "#f2b84b",
};

export const easeOutBack = (x: number) => {
  const c = 1.9;
  return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2);
};
export const smooth = (x: number) => x * x * (3 - 2 * x);
export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export type Kit = {
  box: (w: number, h: number, d: number, r?: number) => THREE.BufferGeometry;
  sphere: THREE.BufferGeometry;
  cylinder: (r: number, h: number, segments?: number) => THREE.BufferGeometry;
  mat: (color: string, emissive?: string) => THREE.MeshStandardMaterial;
  mesh: (g: THREE.BufferGeometry, color: string, x?: number, y?: number, z?: number, emissive?: string) => THREE.Mesh;
};

export type Stage = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  world: THREE.Group;
  kit: Kit;
  still: boolean; // prefers-reduced-motion: no idle motion, no pop-in
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  // Pop in during the first second: rises from below and overshoots its size.
  pop: <T extends THREE.Object3D>(obj: T, delay: number, parent?: THREE.Object3D) => T;
  // Called every frame while on screen: time since start (s), frame delta, and `t` = time, frozen at 2 when still.
  onTick: (cb: (time: number, dt: number, t: number) => void) => void;
  onResize: (cb: (w: number, h: number) => void) => void;
  // A tap (not a drag): the first thing hit, if any.
  onTap: (cb: (hit: THREE.Intersection | undefined) => void) => void;
  // A world point → its place in the element (0–1), to pin HTML labels on it.
  project: (v: THREE.Vector3) => { x: number; y: number; visible: boolean };
  dispose: () => void;
};

export function createStage(el: HTMLElement, opts: { ao?: boolean; shadow?: number; fov?: number; exposure?: number } = {}): Stage {
  const { ao = true, shadow = 13, fov = 30, exposure = 1.05 } = opts;
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  const dpr = Math.min(window.devicePixelRatio, 2);
  renderer.setPixelRatio(dpr);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap; // soft through shadow.radius (PCFSoft is gone in r18x)
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = exposure;
  renderer.domElement.style.display = "block";
  el.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 200);
  const hemi = new THREE.HemisphereLight("#ffffff", "#c6d0e4", 1.6);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight("#fff4e4", 2.6);
  sun.position.set(shadow * 0.55, shadow * 1.1, shadow * 0.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.radius = 6;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  Object.assign(sun.shadow.camera, { left: -shadow, right: shadow, top: shadow, bottom: -shadow, near: 0.5, far: shadow * 3.5 });
  scene.add(sun);

  // Tone mapping goes through the OutputPass when there is a composer (AO), else the renderer does it.
  let composer: EffectComposer | null = null;
  let gtao: GTAOPass | null = null;
  if (ao) {
    composer = new EffectComposer(renderer);
    composer.setPixelRatio(Math.min(dpr, 1.5)); // the AO pass is the heavy part on phones
    composer.addPass(new RenderPass(scene, camera));
    gtao = new GTAOPass(scene, camera, 512, 512);
    gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1, thickness: 1, scale: 1 });
    gtao.blendIntensity = 0.9;
    composer.addPass(gtao);
    composer.addPass(new OutputPass());
  }

  // Shared geometry and materials.
  const geos: THREE.BufferGeometry[] = [];
  const mats = new Map<string, THREE.MeshStandardMaterial>();
  const box = (w: number, h: number, d: number, r = 0.08) => {
    const g = new RoundedBoxGeometry(w, h, d, 3, Math.max(0.0005, Math.min(r, w / 2, h / 2, d / 2) - 0.001));
    geos.push(g);
    return g;
  };
  const sphere = new THREE.SphereGeometry(1, 20, 14);
  geos.push(sphere);
  const cylinder = (r: number, h: number, segments = 48) => {
    const g = new THREE.CylinderGeometry(r, r, h, segments);
    geos.push(g);
    return g;
  };
  const mat = (color: string, emissive?: string) => {
    const key = color + (emissive ?? "");
    if (!mats.has(key)) mats.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0, emissive: emissive ?? "#000000", emissiveIntensity: emissive ? 1.4 : 0 }));
    return mats.get(key)!;
  };
  const mesh = (g: THREE.BufferGeometry, color: string, x = 0, y = 0, z = 0, emissive?: string) => {
    const m = new THREE.Mesh(g, mat(color, emissive));
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  };
  const kit: Kit = { box, sphere, cylinder, mat, mesh };

  const world = new THREE.Group();
  scene.add(world);
  const pops: { obj: THREE.Object3D; y: number; k: THREE.Vector3; delay: number }[] = [];
  const pop = <T extends THREE.Object3D>(obj: T, delay: number, parent: THREE.Object3D = world) => {
    pops.push({ obj, y: obj.position.y, k: obj.scale.clone(), delay });
    if (!still) obj.scale.setScalar(0.0001);
    parent.add(obj);
    return obj;
  };

  const ticks: ((time: number, dt: number, t: number) => void)[] = [];
  const resizes: ((w: number, h: number) => void)[] = [];
  const taps: ((hit: THREE.Intersection | undefined) => void)[] = [];

  const ray = new THREE.Raycaster();
  let downAt: { x: number; y: number } | null = null;
  const down = (e: PointerEvent) => (downAt = { x: e.clientX, y: e.clientY });
  const up = (e: PointerEvent) => {
    if (!downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 8) return;
    downAt = null;
    const r = el.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    const hit = ray.intersectObjects(world.children, true)[0];
    taps.forEach((cb) => cb(hit));
  };
  el.addEventListener("pointerdown", down);
  el.addEventListener("pointerup", up);

  const resize = () => {
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = `${w}px`;
    renderer.domElement.style.height = `${h}px`;
    composer?.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    resizes.forEach((cb) => cb(w, h));
  };
  const ro = new ResizeObserver(resize);
  ro.observe(el);

  // Only draw while it is on screen.
  let visible = true;
  const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
  io.observe(el);

  const tmp = new THREE.Vector3();
  const project = (v: THREE.Vector3) => {
    tmp.copy(v).project(camera);
    return { x: (tmp.x + 1) / 2, y: (1 - tmp.y) / 2, visible: tmp.z < 1 };
  };

  const start = performance.now();
  let last = start;
  let frame = 0;
  const tick = (now: number) => {
    frame = requestAnimationFrame(tick);
    if (document.hidden || !visible) return;
    const time = (now - start) / 1000;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = still ? 2 : time;
    for (const p of pops) {
      const x = clamp01((t - p.delay) / 0.45);
      const s = Math.max(0.0001, easeOutBack(x));
      p.obj.scale.set(p.k.x * s, p.k.y * s, p.k.z * s);
      p.obj.position.y = p.y - (1 - smooth(x)) * 1.2;
    }
    ticks.forEach((cb) => cb(time, dt, t));
    if (composer) composer.render();
    else renderer.render(scene, camera);
  };

  return {
    scene,
    camera,
    world,
    kit,
    still,
    sun,
    hemi,
    pop,
    onTick: (cb) => {
      ticks.push(cb);
      if (!frame) {
        resize();
        frame = requestAnimationFrame(tick);
      }
    },
    onResize: (cb) => {
      resizes.push(cb);
      if (el.clientWidth && el.clientHeight) cb(el.clientWidth, el.clientHeight);
    },
    onTap: (cb) => taps.push(cb),
    project,
    dispose() {
      cancelAnimationFrame(frame);
      ro.disconnect();
      io.disconnect();
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointerup", up);
      scene.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      geos.forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose());
      gtao?.dispose();
      composer?.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

// —— Props shared by the scenes ——————————————————————————————————————————

// A person in someone's colour, standing or seated (with a little stool).
export function person(kit: Kit, color: string, x = 0, z = 0, seated = false) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const h = seated ? 0.24 : 0.32;
  g.add(kit.mesh(kit.box(0.2, h, 0.16, 0.07), color, 0, h / 2 + (seated ? 0.12 : 0), 0));
  const head = kit.mesh(kit.sphere, PALETTE.skin, 0, h + 0.1 + (seated ? 0.12 : 0), 0);
  head.scale.setScalar(0.09);
  g.add(head);
  if (seated) g.add(kit.mesh(kit.box(0.2, 0.12, 0.2, 0.04), PALETTE.wood, 0, 0.06, 0));
  return g;
}

// A tree: trunk and two blocks of leaves.
export function tree(kit: Kit, x: number, z: number, k = 1) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.add(kit.mesh(kit.box(0.18, 0.7, 0.18, 0.05), PALETTE.trunk, 0, 0.35, 0));
  g.add(kit.mesh(kit.box(0.85 * k, 0.75 * k, 0.85 * k, 0.3 * k), PALETTE.green, 0, 0.9, 0));
  g.add(kit.mesh(kit.box(0.55 * k, 0.5 * k, 0.55 * k, 0.2 * k), PALETTE.greenLight, 0, 1.35 * (0.6 + 0.4 * k), 0));
  return g;
}

// The family house: walls with a window grid, a gable roof, the orange door,
// a chimney with smoke. `windows` light up at night, `smoke` puffs when someone cooks.
export function house(kit: Kit) {
  const group = new THREE.Group();
  group.add(kit.mesh(kit.box(2.6, 1.7, 2.1, 0.12), PALETTE.blue, 0, 0.85, 0));
  const windows: THREE.Mesh[] = [];
  for (const [sx, sy] of [[-0.75, 1.15], [0.75, 1.15], [-0.75, 0.55], [0.75, 0.55]]) {
    const w = kit.mesh(kit.box(0.42, 0.36, 0.06, 0.04), PALETTE.glass, sx, sy, 1.06);
    windows.push(w);
    group.add(w);
  }
  group.add(kit.mesh(kit.box(0.5, 0.8, 0.06, 0.04), PALETTE.orange, 0, 0.4, 1.06));
  for (const s of [-1, 1]) {
    const roof = kit.mesh(kit.box(1.72, 0.18, 2.4, 0.08), PALETTE.teal, s * 0.62, 2.02, 0);
    roof.rotation.z = -s * 0.62;
    group.add(roof);
  }
  group.add(kit.mesh(kit.box(0.3, 0.6, 0.3, 0.06), PALETTE.teal, 0.7, 2.3, -0.5));
  const smoke = Array.from({ length: 4 }, () => {
    const s = kit.mesh(kit.sphere, "#ffffff", 0.7, 2.7, -0.5);
    s.castShadow = false;
    group.add(s);
    return s;
  });
  const puff = (time: number, on = true) =>
    smoke.forEach((s, i) => {
      const u = (time * 0.35 + i / smoke.length) % 1;
      s.position.set(0.7 + u * 0.4, 2.7 + u * 1.3, -0.5);
      s.scale.setScalar(0.1 + u * 0.22);
      s.visible = on && u < 0.95;
    });
  return { group, windows, puff };
}

// A round floating plate, the base of every diorama.
export function plate(kit: Kit, r: number, color = PALETTE.ground) {
  const g = new THREE.Group();
  g.add(kit.mesh(kit.cylinder(r, 0.9, 96), color, 0, -0.45, 0));
  g.add(kit.mesh(kit.cylinder(r - 0.5, 0.5, 96), "#e4e0d7", 0, -1.05, 0));
  return g;
}
