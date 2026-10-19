// The family's week as a little diorama (Calendar → 3D week): a floating slab
// with the house in the middle and the next seven days as the steps of a
// spiral staircase around it: today in front, the highest step, then
// counter-clockwise (tomorrow on its right, the way we read), each day a step
// lower, and an opening between the last day and today so they don't read as
// neighbours. On each step, a little scene per activity (a dinner is a
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
const R = 6; // the middle of the steps
const R_IN = 3.7;
const R_OUT = 8.3;
const STEP = THREE.MathUtils.degToRad(46); // from one day to the next
const WIDTH = THREE.MathUtils.degToRad(43); // a step's own angle (the rest is a thin gap between steps)
const GAP = Math.PI * 2 - 6 * STEP; // the opening, from the last day back to today
const RISE = 0.3; // each day a step lower: a gentle spiral
const ROAD_R = 9.3;
const SLAB_R = 10.2;
// Day i on the spiral: the opening straight in front, today on its right, then
// counter-clockwise as seen from the camera (tomorrow on the right and further
// back, the last day on the left of the opening).
const dayAngle = (i: number) => Math.PI / 2 - GAP / 2 - i * STEP;
const stepTop = (i: number) => 0.3 + (6 - i) * RISE;
const AZ = 0; // the camera's usual angle: looking into the opening

export function createWeekScene(el: HTMLElement, days: SceneDay[], onPick: (day: number | null) => void, inline = false): WeekScene {
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
  // Trees in the opening, between the last day and today.
  [[-0.2, 7.6, 1], [0, 6.4, 0.8], [0.2, 7.6, 0.9]].forEach(([da, r, k], i) => {
    const a = Math.PI / 2 + da;
    pop(tree(Math.cos(a) * r, Math.sin(a) * r, k), 0.35 + i * 0.03);
  });
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

  // A step of the staircase: a slice of a ring, centred on +x at radius R
  // (the step's origin), `h` high, rounded at the edges.
  const geos: THREE.BufferGeometry[] = [];
  const slice = (grow: number, h: number) => {
    const half = WIDTH / 2 + grow / R;
    const s = new THREE.Shape();
    s.absarc(0, 0, R_OUT + grow, -half, half, false);
    s.absarc(0, 0, R_IN - grow, half, -half, true);
    const bevel = Math.min(0.12, h / 3);
    const g = new THREE.ExtrudeGeometry(s, { depth: h - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 32 });
    g.rotateX(-Math.PI / 2); // the shape lies flat, extruded upwards
    g.translate(-R, bevel, 0);
    geos.push(g);
    return g;
  };

  // The seven days.
  const at = (i: number, r = R) => new THREE.Vector3(Math.cos(dayAngle(i)) * r, 0, Math.sin(dayAngle(i)) * r);
  const tilePos = (i: number) => at(i).setY(stepTop(i));
  const beacons: THREE.Mesh[] = [];
  const vignettes: Vignette[] = [];
  days.forEach((d, i) => {
    const g = new THREE.Group();
    g.position.copy(at(i));
    // The step, down to the plate, so the spiral casts its shadows on the lower ones.
    const top = stepTop(i);
    const steps = new THREE.Group();
    steps.rotation.y = -dayAngle(i);
    if (d.today) steps.add(mesh(slice(0.2, 0.24), PALETTE.orange, 0, top - 0.34, 0)); // an orange collar under the top
    steps.add(mesh(slice(0, top), d.weekend ? PALETTE.weekend : PALETTE.tile));
    g.add(steps);
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
    // Signs at the outer corners, out of the scenes' way.
    const corner = (side: number) => at(i, R_OUT - 0.45).applyAxisAngle(new THREE.Vector3(0, 1, 0), side * (WIDTH / 2 - 0.06)).sub(at(i));
    if (d.todos) {
      const flag = new THREE.Group();
      flag.position.copy(corner(1)).setY(top);
      flag.add(mesh(box(0.06, 0.9, 0.06, 0.02), PALETTE.dark, 0, 0.45, 0));
      flag.add(mesh(box(0.4, 0.26, 0.04, 0.02), PALETTE.green, 0.21, 0.75, 0));
      pop(flag, 0.8 + i * 0.04, g);
    }
    if (d.needs) {
      const c = corner(-1);
      const pole = mesh(box(0.08, 1.2, 0.08, 0.02), PALETTE.dark, c.x, top + 0.6, c.z);
      const light = mesh(sphereGeo, PALETTE.orange, c.x, top + 1.4, c.z, PALETTE.orange);
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
    onPick(focused);
  });

  // Frame the plate whatever the screen shape (tall 9:16 or a card).
  let fit = 30;
  stage.onResize(() => {
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    fit = Math.max((SLAB_R + 0.3) / (tanV * camera.aspect), (inline ? 8.6 : 12) / tanV);
  });

  const labels = () => days.map((_, i) => stage.project(at(i, R_OUT + 0.1).setY(stepTop(i))));

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

  return {
    labels,
    dispose: () => {
      stage.dispose();
      for (const g of geos) g.dispose();
    },
  };
}
