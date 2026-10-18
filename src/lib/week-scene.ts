// The family's week as a little diorama (Calendar → 3D week): a floating slab
// with the house in the middle and the next seven days as tiles around it,
// today in front. On each tile, a little scene per activity (a dinner is a
// table with its people around it, see `week-vignettes.ts`), a green flag for
// to-dos, an orange beacon where a drop-off or pick-up still needs someone.
// The camera sways on a 10 s loop.
// Plain three.js (no React), driven by `WeekDiorama`.
import * as THREE from "three";
import { clamp01, createStage, house as makeHouse, PALETTE, plate, smooth, tree as makeTree } from "./three-kit";
import { buildVignette, type ActKind, type Vignette } from "./week-vignettes";

export type SceneDay = {
  today: boolean;
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

export function createWeekScene(el: HTMLElement, days: SceneDay[], onPick: (day: number) => void, inline = false): WeekScene {
  const stage = createStage(el);
  const { camera, kit, pop, still } = stage;
  const { box, mesh } = kit;
  const sphereGeo = kit.sphere;

  // The slab, floating: a round plate with the house in the middle, the seven
  // days in a ring around it (today in front) and a road round the edge.
  pop(plate(kit, SLAB_R), 0);
  const ring = new THREE.RingGeometry(ROAD_R - 0.45, ROAD_R + 0.45, 96);
  ring.rotateX(-Math.PI / 2);
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

  // The house in the middle.
  const home = makeHouse(kit);
  home.group.scale.setScalar(0.8);
  pop(home.group, 0.25);

  const trees: THREE.Object3D[] = [];
  const tree = (x: number, z: number, k: number) => {
    const g = makeTree(kit, x, z, k);
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
  days.forEach((d, i) => {
    const g = new THREE.Group();
    g.position.copy(tilePos(i));
    if (d.today) g.add(mesh(box(TILE + 0.3, 0.16, TILE + 0.3, 0.16), PALETTE.orange, 0, 0.08, 0));
    g.add(mesh(box(TILE, 0.26, TILE, 0.14), d.weekend ? PALETTE.weekend : PALETTE.tile, 0, 0.16 + (d.today ? 0.04 : 0), 0));
    const top = 0.29 + (d.today ? 0.04 : 0);
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

  // Tap a tile → that day: zoom on it (again: back out). Anywhere else: back out.
  let focused: number | null = null;
  stage.onTap((hit) => {
    const day = hit?.object.userData.day;
    focused = day === undefined || day === focused ? null : day;
    if (day !== undefined) onPick(day);
  });

  // Frame the plate whatever the screen shape (tall 9:16 or a card).
  let fit = 30;
  stage.onResize(() => {
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    fit = Math.max((SLAB_R + 0.3) / (tanV * camera.aspect), (inline ? 8.6 : 12) / tanV);
  });

  const labels = () => days.map((_, i) => stage.project(tilePos(i).multiplyScalar((R + TILE / 2 + 0.1) / R)));

  let zoom = 0;
  const aim = new THREE.Vector3();
  stage.onTick((time, dt, t) => {
    const loop = ((t - 1.2) % LOOP + LOOP) % LOOP; // the living part starts once the world is built

    // Camera: a slow eased sway with a gentle push-in, seamless over the loop.
    const phase = (loop / LOOP) * Math.PI * 2;
    const az = still ? AZ : AZ + 0.3 * Math.sin(phase) * (1 - zoom);
    const intro = still ? 0 : 1 - smooth(clamp01(t / 1.4));
    // Zoom: ease towards the tapped day, and back out.
    zoom += ((focused === null ? 0 : 1) - zoom) * (1 - Math.exp(-dt * 3.5));
    if (focused !== null) aim.copy(tilePos(focused));
    const look = new THREE.Vector3(0, -0.2, inline ? 0.9 : -0.3).lerp(aim, smooth(zoom));
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
      home.puff(time, t > 1.2);
      for (const b of beacons) b.scale.setScalar(0.26 + 0.08 * (0.5 + 0.5 * Math.sin(time * 6)));
      (lamps[0].material as THREE.MeshStandardMaterial).emissiveIntensity = 1.1 + 0.3 * Math.sin(time * 2);
      for (const v of vignettes) v.update(time);
    } else {
      home.puff(0, false);
      for (const v of vignettes) v.update(0);
    }
  });

  return { labels, dispose: stage.dispose };
}
