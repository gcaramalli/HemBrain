// The family's week as a little diorama (Calendar → 3D week): a floating slab
// with the house in the middle and the next seven days as tiles around it,
// today in front. On each tile, a little scene per activity (a dinner is a
// table with its people around it, see `week-vignettes.ts`), a green flag for
// to-dos, an orange beacon where a drop-off or pick-up still needs someone.
// The camera sways on a 10 s loop.
// Plain three.js (no React), driven by `WeekDiorama`.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { buildVignette, type ActKind, type Vignette } from "./week-vignettes";

export type SceneDay = {
  weekend: boolean;
  acts: { kind: ActKind; colors: string[] }[]; // the day's main activities, at most 3 shown
  needs: number; // drop-offs / pick-ups nobody has taken
  todos: number;
};
export type WeekScene = { dispose: () => void; labels: () => { x: number; y: number; visible: boolean }[] };

const LOOP = 10; // seconds
const R = 5.9; // ring of days
const TILE = 3.9;
const ROAD_R = 9.3;
const SLAB_R = 10.2;
// Day i on the ring: today in front, then round clockwise (seen from above).
const dayAngle = (i: number) => Math.PI / 2 - (i / 7) * Math.PI * 2;
const AZ = 0; // the camera's usual angle: today straight in front
const PALETTE = {
  ground: "#f4f2ed",
  tile: "#ffffff",
  weekend: "#e2f1ee",
  blue: "#2c55d4",
  teal: "#14a3a0",
  green: "#36a96b",
  greenLight: "#5cc486",
  orange: "#ff7a1a",
  trunk: "#8a6a52",
  road: "#dfe3ea",
  nobody: "#b9c0cc",
  glass: "#dfeaff",
  dark: "#2a3140",
};

const easeOutBack = (x: number) => {
  const c = 1.9;
  return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2);
};
const smooth = (x: number) => x * x * (3 - 2 * x);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export function createWeekScene(el: HTMLElement, days: SceneDay[], onPick: (day: number) => void): WeekScene {
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  const dpr = Math.min(window.devicePixelRatio, 2);
  renderer.setPixelRatio(dpr);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.domElement.style.display = "block";
  el.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 200);

  scene.add(new THREE.HemisphereLight("#ffffff", "#c6d0e4", 1.6));
  const sun = new THREE.DirectionalLight("#fff4e4", 2.6);
  sun.position.set(7, 14, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.radius = 6;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  Object.assign(sun.shadow.camera, { left: -13, right: 13, top: 13, bottom: -13, near: 1, far: 45 });
  scene.add(sun);

  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(Math.min(dpr, 1.5)); // the AO pass is the heavy part on phones
  composer.addPass(new RenderPass(scene, camera));
  const gtao = new GTAOPass(scene, camera, 512, 512);
  gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1, thickness: 1, scale: 1 });
  gtao.blendIntensity = 0.9;
  composer.addPass(gtao);
  composer.addPass(new OutputPass()); // tone mapping + sRGB

  // Shared geometry and materials (everything is a rounded box or a sphere).
  const geos: THREE.BufferGeometry[] = [];
  const mats = new Map<string, THREE.MeshStandardMaterial>();
  const box = (w: number, h: number, d: number, r = 0.08) => {
    const g = new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2) - 0.001);
    geos.push(g);
    return g;
  };
  const mat = (color: string, emissive?: string) => {
    const key = color + (emissive ?? "");
    if (!mats.has(key)) mats.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0, emissive: emissive ?? "#000000", emissiveIntensity: emissive ? 1.4 : 0 }));
    return mats.get(key)!;
  };
  const sphereGeo = new THREE.SphereGeometry(1, 20, 14);
  geos.push(sphereGeo);
  const mesh = (g: THREE.BufferGeometry, color: string, x = 0, y = 0, z = 0, emissive?: string) => {
    const m = new THREE.Mesh(g, mat(color, emissive));
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  };

  // Everything pops in during the first second: rises from below and overshoots its size.
  const pops: { obj: THREE.Object3D; y: number; k: number; delay: number }[] = [];
  const world = new THREE.Group();
  scene.add(world);
  const pop = (obj: THREE.Object3D, delay: number, parent: THREE.Object3D = world) => {
    pops.push({ obj, y: obj.position.y, k: obj.scale.x, delay });
    if (!still) obj.scale.setScalar(0.0001);
    parent.add(obj);
    return obj;
  };

  // The slab, floating: a round plate with the house in the middle, the seven
  // days in a ring around it (today in front) and a road round the edge.
  const plate = (r: number, h: number, color: string, y: number) => {
    const g = new THREE.CylinderGeometry(r, r, h, 96);
    geos.push(g);
    return mesh(g, color, 0, y, 0);
  };
  pop(plate(SLAB_R, 0.9, PALETTE.ground, -0.45), 0);
  pop(plate(SLAB_R - 0.5, 0.5, "#e4e0d7", -1.05), 0.03);
  const ring = new THREE.RingGeometry(ROAD_R - 0.45, ROAD_R + 0.45, 96);
  ring.rotateX(-Math.PI / 2);
  geos.push(ring);
  const road = mesh(ring, PALETTE.road, 0, 0.012, 0);
  road.castShadow = false;
  pop(road, 0.05);

  const car = (body: string) => {
    const g = new THREE.Group();
    const inner = new THREE.Group();
    inner.add(mesh(box(0.5, 0.32, 0.95, 0.1), body, 0, 0.3, 0));
    inner.add(mesh(box(0.44, 0.26, 0.5, 0.08), PALETTE.glass, 0, 0.55, 0.04));
    for (const [x, z] of [[0.24, 0.3], [-0.24, 0.3], [0.24, -0.3], [-0.24, -0.3]]) inner.add(mesh(box(0.1, 0.22, 0.22, 0.05), PALETTE.dark, x, 0.13, z));
    g.add(inner);
    return { g, inner };
  };
  const cars = [
    { ...car(PALETTE.teal), dir: 1, lane: ROAD_R + 0.2, phase: 0 },
    { ...car(PALETTE.blue), dir: -1, lane: ROAD_R - 0.2, phase: 0.45 },
  ];
  cars.forEach((c, i) => pop(c.g, 0.6 + i * 0.05));

  // The house in the middle: walls with a window grid, a gable roof, a chimney that smokes.
  const house = new THREE.Group();
  house.add(mesh(box(2.6, 1.7, 2.1, 0.12), PALETTE.blue, 0, 0.85, 0));
  for (const [sx, sy] of [[-0.75, 1.15], [0.75, 1.15], [-0.75, 0.55], [0.75, 0.55]]) house.add(mesh(box(0.42, 0.36, 0.06, 0.04), PALETTE.glass, sx, sy, 1.06));
  house.add(mesh(box(0.5, 0.8, 0.06, 0.04), PALETTE.orange, 0, 0.4, 1.06)); // the door: the one warm accent
  for (const s of [-1, 1]) {
    const roof = mesh(box(1.72, 0.18, 2.4, 0.08), PALETTE.teal, s * 0.62, 2.02, 0);
    roof.rotation.z = -s * 0.62;
    house.add(roof);
  }
  house.add(mesh(box(0.3, 0.6, 0.3, 0.06), PALETTE.teal, 0.7, 2.3, -0.5));
  house.scale.setScalar(0.8);
  pop(house, 0.25);
  const smoke = Array.from({ length: 4 }, () => {
    const s = mesh(sphereGeo, "#ffffff", 0.7, 2.7, -0.5);
    s.castShadow = false;
    house.add(s);
    return s;
  });

  const trees: THREE.Object3D[] = [];
  const tree = (x: number, z: number, k: number) => {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.add(mesh(box(0.18, 0.7, 0.18, 0.05), PALETTE.trunk, 0, 0.35, 0));
    g.add(mesh(box(0.85 * k, 0.75 * k, 0.85 * k, 0.3 * k), PALETTE.green, 0, 0.9, 0));
    g.add(mesh(box(0.55 * k, 0.5 * k, 0.55 * k, 0.2 * k), PALETTE.greenLight, 0, 1.35 * (0.6 + 0.4 * k), 0));
    trees.push(g);
    return g;
  };
  // Trees between the days, out by the road.
  for (let i = 0; i < 7; i++) {
    const a = dayAngle(i + 0.5);
    pop(tree(Math.cos(a) * (R + 1.2), Math.sin(a) * (R + 1.2), i % 2 ? 0.8 : 1), 0.35 + i * 0.03);
  }
  const lamps: THREE.Mesh[] = [];
  for (const [x, z] of [[-1.5, 1.4], [1.5, 1.4], [0, -1.7]]) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.add(mesh(box(0.09, 1.3, 0.09, 0.03), PALETTE.dark, 0, 0.65, 0));
    const head = mesh(box(0.26, 0.14, 0.26, 0.05), "#fff3d6", 0, 1.35, 0, "#ffd9a0");
    lamps.push(head);
    g.add(head);
    pop(g, 0.45);
  }

  // The seven days.
  const tilePos = (i: number) => new THREE.Vector3(Math.cos(dayAngle(i)) * R, 0, Math.sin(dayAngle(i)) * R);
  const beacons: THREE.Mesh[] = [];
  const vignettes: Vignette[] = [];
  const kit = { box, sphere: sphereGeo, mesh, mat };
  days.forEach((d, i) => {
    const g = new THREE.Group();
    g.position.copy(tilePos(i));
    if (i === 0) g.add(mesh(box(TILE + 0.3, 0.16, TILE + 0.3, 0.16), PALETTE.orange, 0, 0.08, 0));
    g.add(mesh(box(TILE, 0.26, TILE, 0.14), d.weekend ? PALETTE.weekend : PALETTE.tile, 0, 0.16 + (i === 0 ? 0.04 : 0), 0));
    const top = 0.29 + (i === 0 ? 0.04 : 0);
    // The day's activities as little scenes; bigger when there are fewer.
    const acts = d.acts.slice(0, 3);
    const layout = [[[0, 0]], [[-0.95, 0.1], [0.95, -0.1]], [[-0.95, -0.7], [0.95, -0.7], [0, 0.8]]][acts.length - 1] ?? [];
    const size = [3.2, 1.8, 1.5][acts.length - 1];
    acts.forEach((a, j) => {
      const v = buildVignette(kit, a.kind, a.colors, i + j * 0.37);
      v.group.position.set(layout[j][0], top, layout[j][1]);
      v.group.scale.setScalar(size);
      vignettes.push(v);
      pop(v.group, 0.55 + i * 0.06 + j * 0.08, g);
    });
    // Signs at the back corners, out of the scenes' way.
    const back = -TILE / 2 + 0.3;
    if (d.todos) {
      const flag = new THREE.Group();
      flag.position.set(-TILE / 2 + 0.3, top, back);
      flag.add(mesh(box(0.06, 0.9, 0.06, 0.02), PALETTE.dark, 0, 0.45, 0));
      flag.add(mesh(box(0.4, 0.26, 0.04, 0.02), PALETTE.green, 0.21, 0.75, 0));
      pop(flag, 0.8 + i * 0.04, g);
    }
    if (d.needs) {
      const pole = mesh(box(0.08, 1.2, 0.08, 0.02), PALETTE.dark, TILE / 2 - 0.3, top + 0.6, back);
      const light = mesh(sphereGeo, PALETTE.orange, TILE / 2 - 0.3, top + 1.4, back, PALETTE.orange);
      light.scale.setScalar(0.3);
      beacons.push(light);
      pop(pole, 0.85, g);
      g.add(light);
    }
    g.traverse((o) => (o.userData.day = i));
    pop(g, 0.12 + i * 0.05);
  });

  // Tap a tile → that day.
  const ray = new THREE.Raycaster();
  let downAt: { x: number; y: number } | null = null;
  const down = (e: PointerEvent) => (downAt = { x: e.clientX, y: e.clientY });
  const up = (e: PointerEvent) => {
    if (!downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 8) return;
    downAt = null;
    const r = el.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    // A day: zoom on it (again: back out). Anywhere else: back out.
    const day = ray.intersectObjects(world.children, true)[0]?.object.userData.day;
    focused = day === undefined || day === focused ? null : day;
    if (day !== undefined) onPick(day);
  };
  el.addEventListener("pointerdown", down);
  el.addEventListener("pointerup", up);

  // Frame the slab whatever the screen shape (tall 9:16 or wide).
  let fit = 30;
  const resize = () => {
    const w = el.clientWidth;
    const h = el.clientHeight;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = `${w}px`;
    renderer.domElement.style.height = `${h}px`;
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    // Wide enough for the plate, and short enough to leave room for the cards above and below.
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    fit = Math.max((SLAB_R + 0.3) / (tanV * camera.aspect), 12 / tanV);
  };
  const ro = new ResizeObserver(resize);
  ro.observe(el);
  resize();

  const label = new THREE.Vector3();
  const labels = () =>
    days.map((_, i) => {
      label.copy(tilePos(i)).multiplyScalar((R + TILE / 2 + 0.1) / R).applyMatrix4(world.matrixWorld).project(camera);
      return { x: (label.x + 1) / 2, y: (1 - label.y) / 2, visible: label.z < 1 };
    });

  const start = performance.now();
  let last = start;
  let focused: number | null = null;
  let zoom = 0;
  const aim = new THREE.Vector3();
  let frame = 0;
  const tick = (now: number) => {
    frame = requestAnimationFrame(tick);
    if (document.hidden) return;
    const time = (now - start) / 1000;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = still ? 2 : time;
    const loop = ((t - 1.2) % LOOP + LOOP) % LOOP; // the living part starts once the world is built

    for (const p of pops) {
      const x = clamp01((t - p.delay) / 0.45);
      p.obj.scale.setScalar(Math.max(0.0001, easeOutBack(x)) * p.k);
      p.obj.position.y = p.y - (1 - smooth(x)) * 1.2;
    }

    // Camera: a slow eased sway with a gentle push-in, seamless over the loop.
    const phase = (loop / LOOP) * Math.PI * 2;
    const az = still ? AZ : AZ + 0.3 * Math.sin(phase) * (1 - zoom);
    const intro = still ? 0 : 1 - smooth(clamp01(t / 1.4));
    // Zoom: ease towards the tapped day, and back out.
    zoom += ((focused === null ? 0 : 1) - zoom) * (1 - Math.exp(-dt * 3.5));
    if (focused !== null) aim.copy(tilePos(focused));
    const look = new THREE.Vector3(0, -0.2, -0.3).lerp(aim, smooth(zoom));
    const dist = fit * (1.02 - 0.05 * (0.5 - 0.5 * Math.cos(phase)) + 0.25 * intro) * (1 - 0.66 * smooth(zoom));
    const el2 = THREE.MathUtils.degToRad(50 + 10 * intro - 6 * zoom);
    camera.position.set(look.x + Math.sin(az) * Math.cos(el2) * dist, look.y + Math.sin(el2) * dist, look.z + Math.cos(az) * Math.cos(el2) * dist);
    camera.lookAt(look);

    if (!still) {
      for (const c of cars) {
        const a = (c.phase + (c.dir * loop) / LOOP) * Math.PI * 2;
        c.g.position.set(Math.cos(a) * c.lane, 0, Math.sin(a) * c.lane);
        c.g.rotation.y = -a + (c.dir > 0 ? Math.PI : 0);
      }
      trees.forEach((tr, i) => (tr.rotation.z = Math.sin(time * 1.3 + i) * 0.035));
      smoke.forEach((s, i) => {
        const u = (time * 0.35 + i / smoke.length) % 1;
        s.position.set(0.7 + u * 0.4, 2.7 + u * 1.3, -0.5);
        s.scale.setScalar(0.1 + u * 0.22);
        s.visible = t > 1.2 && u < 0.95;
      });
      for (const b of beacons) b.scale.setScalar(0.26 + 0.08 * (0.5 + 0.5 * Math.sin(time * 6)));
      (lamps[0].material as THREE.MeshStandardMaterial).emissiveIntensity = 1.1 + 0.3 * Math.sin(time * 2);
      for (const v of vignettes) v.update(time);
    } else {
      for (const v of vignettes) v.update(0);
    }
    composer.render();
  };
  frame = requestAnimationFrame(tick);

  return {
    labels,
    dispose() {
      cancelAnimationFrame(frame);
      ro.disconnect();
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointerup", up);
      world.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      geos.forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose());
      gtao.dispose();
      composer.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
