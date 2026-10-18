// The family's week as a little diorama (Calendar → 3D week): a floating slab
// with the house in the middle and the next seven days as tiles around it,
// today in front. On each tile, one stack of blocks per person in their
// colour (one block per activity), a gift for our dates, an orange beacon
// where a drop-off or pick-up still needs someone. Each of us is a pawn that
// hops from the house to their next activity and back, on a 10 s loop.
// Plain three.js (no React), driven by `WeekDiorama`.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";

export type SceneDay = {
  weekend: boolean;
  stacks: { color: string; count: number }[]; // one per person (grey = nobody)
  dates: number; // birthdays, our anniversary
  needs: number; // drop-offs / pick-ups nobody has taken
  todos: number;
};
export type ScenePawn = { color: string; kid: boolean; day: number | null }; // day = index of their next activity
export type WeekScene = { dispose: () => void; labels: () => { x: number; y: number; visible: boolean }[] };

const LOOP = 10; // seconds
const R = 5.1; // ring of days
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

export function createWeekScene(el: HTMLElement, days: SceneDay[], pawns: ScenePawn[], onPick: (day: number) => void): WeekScene {
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
  Object.assign(sun.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, near: 1, far: 40 });
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
  const pops: { obj: THREE.Object3D; y: number; delay: number }[] = [];
  const world = new THREE.Group();
  scene.add(world);
  const pop = (obj: THREE.Object3D, delay: number, parent: THREE.Object3D = world) => {
    pops.push({ obj, y: obj.position.y, delay });
    if (!still) obj.scale.setScalar(0.0001);
    parent.add(obj);
    return obj;
  };

  // The slab, floating.
  const slab = mesh(box(15.6, 0.9, 15.6, 0.45), PALETTE.ground, 0, -0.45, 0);
  pop(slab, 0);
  const under = mesh(box(14.7, 0.5, 14.7, 0.25), "#e4e0d7", 0, -1.05, 0);
  pop(under, 0.03);

  // Ring road at the edge, with a car going round each way.
  const roadR = 6.95;
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    const seg = mesh(box(1.42, 0.06, 0.9, 0.03), PALETTE.road, Math.cos(a) * roadR, 0.03, Math.sin(a) * roadR);
    seg.rotation.y = -a + Math.PI / 2;
    seg.castShadow = false;
    pop(seg, 0.05 + i * 0.006);
  }
  const car = (body: string) => {
    const g = new THREE.Group();
    g.add(mesh(box(0.95, 0.32, 0.5, 0.1), body, 0, 0.3, 0));
    g.add(mesh(box(0.5, 0.26, 0.44, 0.08), PALETTE.glass, -0.04, 0.55, 0));
    for (const [x, z] of [[0.3, 0.24], [-0.3, 0.24], [0.3, -0.24], [-0.3, -0.24]]) g.add(mesh(box(0.22, 0.22, 0.1, 0.05), PALETTE.dark, x, 0.13, z));
    return g;
  };
  const cars = [
    { obj: pop(car(PALETTE.teal), 0.6), dir: 1, lane: roadR + 0.2, phase: 0 },
    { obj: pop(car(PALETTE.blue), 0.65), dir: -1, lane: roadR - 0.2, phase: 0.5 },
  ];

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
  pop(house, 0.25);
  const smoke = Array.from({ length: 4 }, () => {
    const s = mesh(sphereGeo, "#ffffff", 0.7, 2.7, -0.5);
    s.castShadow = false;
    house.add(s);
    return s;
  });

  // Trees and street lamps around the ring.
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
  const corners = [[-6.9, -6.9], [6.9, -6.9], [-7, 7], [7, 6.9], [-2.2, -2.4], [2.3, -2.2], [-2.6, 1.9], [2.7, 1.6]];
  corners.forEach(([x, z], i) => pop(tree(x, z, i < 4 ? 1.15 : 0.8), 0.35 + i * 0.04));
  const lamps: THREE.Mesh[] = [];
  for (const [x, z] of [[-1.5, 2.6], [1.5, 2.6], [0, -2.7]]) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.add(mesh(box(0.09, 1.3, 0.09, 0.03), PALETTE.dark, 0, 0.65, 0));
    const head = mesh(box(0.26, 0.14, 0.26, 0.05), "#fff3d6", 0, 1.35, 0, "#ffd9a0");
    lamps.push(head);
    g.add(head);
    pop(g, 0.45);
  }

  // The seven days, today in front, going round clockwise.
  const dayAngle = (i: number) => Math.PI / 2 - (i / days.length) * Math.PI * 2;
  const tilePos = (i: number) => new THREE.Vector3(Math.cos(dayAngle(i)) * R, 0, Math.sin(dayAngle(i)) * R);
  const beacons: THREE.Mesh[] = [];
  days.forEach((d, i) => {
    const g = new THREE.Group();
    g.position.copy(tilePos(i));
    g.rotation.y = -dayAngle(i) + Math.PI / 2;
    if (i === 0) g.add(mesh(box(2.75, 0.16, 2.75, 0.14), PALETTE.orange, 0, 0.08, 0));
    const tile = mesh(box(2.5, 0.26, 2.5, 0.12), d.weekend ? PALETTE.weekend : PALETTE.tile, 0, 0.16 + (i === 0 ? 0.04 : 0), 0);
    g.add(tile);
    const top = 0.29 + (i === 0 ? 0.04 : 0);
    // One stack per person, on a 2×2 grid (a fifth person shares the middle).
    const spots = [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5], [0, 0]];
    d.stacks.slice(0, 5).forEach((s, j) => {
      const n = Math.min(s.count, 5);
      for (let k = 0; k < n; k++) {
        const b = mesh(box(0.78, 0.28, 0.78, 0.09), s.color, spots[j][0], top + 0.15 + k * 0.31, spots[j][1]);
        pop(b, 0.55 + i * 0.05 + k * 0.05, g);
      }
    });
    if (d.dates) {
      const gift = new THREE.Group();
      gift.position.set(0.95, top, 0.95);
      gift.add(mesh(box(0.4, 0.34, 0.4, 0.05), PALETTE.blue, 0, 0.17, 0));
      gift.add(mesh(box(0.42, 0.36, 0.08, 0.02), PALETTE.orange, 0, 0.17, 0));
      gift.add(mesh(box(0.08, 0.36, 0.42, 0.02), PALETTE.orange, 0, 0.17, 0));
      pop(gift, 0.75 + i * 0.04, g);
    }
    if (d.todos) {
      const flag = new THREE.Group();
      flag.position.set(-0.98, top, 0.98);
      flag.add(mesh(box(0.05, 0.7, 0.05, 0.02), PALETTE.dark, 0, 0.35, 0));
      flag.add(mesh(box(0.32, 0.2, 0.04, 0.02), PALETTE.green, 0.17, 0.58, 0));
      pop(flag, 0.8 + i * 0.04, g);
    }
    if (d.needs) {
      const pole = mesh(box(0.06, 0.6, 0.06, 0.02), PALETTE.dark, 1.0, top + 0.3, -1.0);
      const light = mesh(sphereGeo, PALETTE.orange, 1.0, top + 0.7, -1.0, PALETTE.orange);
      light.scale.setScalar(0.14);
      beacons.push(light);
      pop(pole, 0.85, g);
      g.add(light);
    }
    g.traverse((o) => (o.userData.day = i));
    pop(g, 0.12 + i * 0.05);
  });
  // Stepping stones from the house to each day.
  days.forEach((_, i) => {
    for (const f of [0.42, 0.58, 0.74]) {
      const p = tilePos(i).multiplyScalar(f);
      const stone = mesh(box(0.34, 0.06, 0.34, 0.03), "#e6e2d9", p.x, 0.03, p.z);
      stone.castShadow = false;
      pop(stone, 0.2 + i * 0.03);
    }
  });

  // The family: a pawn each (kids smaller), waiting by the door.
  const doorstep = (j: number) => new THREE.Vector3((j - (pawns.length - 1) / 2) * 0.8, 0, 1.85);
  const people = pawns.map((p, j) => {
    const k = p.kid ? 1 : 1.4;
    const g = new THREE.Group();
    const body = new THREE.Group();
    body.add(mesh(box(0.42 * k, 0.56 * k, 0.32 * k, 0.14 * k), p.color, 0, 0.3 * k, 0));
    const head = mesh(sphereGeo, "#f3dcc6", 0, 0.78 * k, 0);
    head.scale.setScalar(0.2 * k);
    body.add(head);
    g.add(body);
    g.position.copy(doorstep(j));
    pop(g, 0.95 + j * 0.06);
    const target = p.day === null ? null : tilePos(p.day).multiplyScalar(0.86).add(new THREE.Vector3((j % 2) * 0.3 - 0.15, 0.33, 0));
    return { g, body, home: doorstep(j), target, offset: j * 0.9 };
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
    const day = ray.intersectObjects(world.children, true)[0]?.object.userData.day;
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
    const half = Math.min(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect, Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 0.95);
    fit = 11.2 / half;
  };
  const ro = new ResizeObserver(resize);
  ro.observe(el);
  resize();

  const label = new THREE.Vector3();
  const labels = () =>
    days.map((_, i) => {
      label.copy(tilePos(i)).multiplyScalar(1.4).applyMatrix4(world.matrixWorld).project(camera);
      return { x: (label.x + 1) / 2, y: (1 - label.y) / 2, visible: label.z < 1 };
    });

  const start = performance.now();
  let frame = 0;
  const tick = (now: number) => {
    frame = requestAnimationFrame(tick);
    if (document.hidden) return;
    const time = (now - start) / 1000;
    const t = still ? 2 : time;
    const loop = ((t - 1.2) % LOOP + LOOP) % LOOP; // the living part starts once the world is built

    for (const p of pops) {
      const x = clamp01((t - p.delay) / 0.45);
      p.obj.scale.setScalar(Math.max(0.0001, easeOutBack(x)));
      p.obj.position.y = p.y - (1 - smooth(x)) * 1.2;
    }

    // Camera: a slow eased sway with a gentle push-in, seamless over the loop.
    const phase = (loop / LOOP) * Math.PI * 2;
    const az = still ? 0.62 : 0.62 + 0.26 * Math.sin(phase); // around a 3/4 view, today in front
    const intro = still ? 0 : 1 - smooth(clamp01(t / 1.4));
    const dist = fit * (1.02 - 0.05 * (0.5 - 0.5 * Math.cos(phase)) + 0.25 * intro);
    const el2 = THREE.MathUtils.degToRad(52 + 8 * intro);
    camera.position.set(Math.sin(az) * Math.cos(el2) * dist, Math.sin(el2) * dist, Math.cos(az) * Math.cos(el2) * dist);
    camera.lookAt(0, -0.2, 0);

    if (!still) {
      for (const c of cars) {
        const a = c.phase * Math.PI * 2 + c.dir * (loop / LOOP) * Math.PI * 2;
        c.obj.position.x = Math.cos(a) * c.lane;
        c.obj.position.z = Math.sin(a) * c.lane;
        c.obj.rotation.y = -a - (c.dir * Math.PI) / 2;
      }
      trees.forEach((tr, i) => (tr.rotation.z = Math.sin(time * 1.3 + i) * 0.035));
      smoke.forEach((s, i) => {
        const u = (time * 0.35 + i / smoke.length) % 1;
        s.position.set(0.7 + u * 0.4, 2.7 + u * 1.3, -0.5);
        s.scale.setScalar(0.1 + u * 0.22);
        s.visible = t > 1.2 && u < 0.95;
      });
      for (const b of beacons) b.scale.setScalar(0.12 + 0.05 * (0.5 + 0.5 * Math.sin(time * 6)));
      (lamps[0].material as THREE.MeshStandardMaterial).emissiveIntensity = 1.1 + 0.3 * Math.sin(time * 2);

      // Each pawn: hop out to their next activity, stay, hop home; staggered.
      for (const p of people) {
        const u = ((loop - p.offset) % LOOP + LOOP) % LOOP;
        let pos = p.home;
        let hop = 0;
        if (p.target) {
          const go = clamp01((u - 0.5) / 1.6);
          const back = clamp01((u - 6.8) / 1.6);
          const k = smooth(go) - smooth(back);
          pos = p.home.clone().lerp(p.target, k);
          const moving = (go > 0 && go < 1) || (back > 0 && back < 1);
          hop = moving ? Math.abs(Math.sin((go < 1 ? go : back) * Math.PI * 4)) * 0.45 : 0;
          const dir = (go < 1 ? p.target.clone().sub(p.home) : p.home.clone().sub(p.target)).normalize();
          if (moving) p.g.rotation.y = Math.atan2(dir.x, dir.z);
        }
        p.g.position.set(pos.x, pos.y + hop, pos.z);
        p.body.position.y = hop ? 0 : Math.abs(Math.sin(time * 2.4 + p.offset)) * 0.06;
      }
    } else {
      for (const p of people) if (p.target) p.g.position.copy(p.target);
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
      geos.forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose());
      gtao.dispose();
      composer.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
