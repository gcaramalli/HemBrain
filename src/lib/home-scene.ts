// The living house at the top of Home: the family right now. A round plate
// with the house in the middle, the office, the preschool (when there are
// kids), a runway for trips and a park for everything else; each of us stands
// where today's calendar puts us (`placeFamily()` in `src/lib/home-now.ts`).
// At night the sun goes down, the windows and lamps light up; a kid asleep
// lies in their bed with little bubbles rising; the chimney smokes once
// dinner is logged.
import * as THREE from "three";
import { createStage, diorama, house as makeHouse, person, PALETTE, plate, tree } from "./three-kit";
import type { Place } from "./home-now";

export type HomeSceneData = {
  people: { id: string; color: string; kid: boolean; place: Place; asleep: boolean }[];
  night: boolean;
  smoke: boolean;
  preschool: boolean; // the family has kids
};

const R = 6.2;
// Where each place sits on the plate, and where its people stand.
const SPOTS: Record<Place, THREE.Vector3> = {
  home: new THREE.Vector3(0, 0, 1.9),
  work: new THREE.Vector3(3.3, 0, -0.9),
  preschool: new THREE.Vector3(-3.4, 0, -0.6),
  away: new THREE.Vector3(2.9, 0, 3.1),
  out: new THREE.Vector3(-2.9, 0, 3.0),
};

export function createHomeScene(el: HTMLElement, data: HomeSceneData) {
  const stage = createStage(el, { shadow: 8, fov: 28 });
  const { kit, pop, still, sun, hemi } = stage;
  const { box, mesh } = kit;

  if (data.night) {
    sun.intensity = 0.55;
    sun.color.set("#9db4ff");
    hemi.intensity = 0.7;
    hemi.color.set("#8ea6d8");
    hemi.groundColor.set("#2a3550");
  }
  const glow = data.night ? "#ffcf7a" : undefined;

  pop(plate(kit, R), 0);
  // Paths from the door to each place.
  for (const p of ["work", "preschool", "away", "out"] as Place[]) {
    if (p === "preschool" && !data.preschool) continue;
    const to = SPOTS[p];
    const n = Math.round(to.length() / 0.55);
    for (let i = 2; i < n; i++) {
      const s = mesh(box(0.3, 0.05, 0.3, 0.02), "#e6e2d9", (to.x * i) / n, 0.025, 0.9 + ((to.z - 0.9) * i) / n);
      s.castShadow = false;
      pop(s, 0.1 + i * 0.01);
    }
  }

  // The house.
  const home = makeHouse(kit);
  home.group.position.set(0, 0, -0.4);
  pop(home.group, 0.15);
  if (glow) home.windows.forEach((w) => (w.material = kit.mat("#fff1c9", glow)));

  // The office: a block with a window grid.
  const office = new THREE.Group();
  office.position.set(SPOTS.work.x + 0.2, 0, SPOTS.work.z - 1.3);
  office.add(mesh(box(1.5, 2.4, 1.2, 0.08), "#9fb4d8", 0, 1.2, 0));
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) office.add(mesh(box(0.3, 0.32, 0.04, 0.02), PALETTE.glass, -0.42 + c * 0.42, 0.55 + r * 0.5, 0.61, glow && (r + c) % 3 === 0 ? glow : undefined));
  office.add(mesh(box(0.45, 0.5, 0.04, 0.02), PALETTE.blue, 0, 0.25, 0.61));
  pop(office, 0.25);

  // The preschool: low, teal roof, a fence and a flag.
  if (data.preschool) {
    const school = new THREE.Group();
    school.position.set(SPOTS.preschool.x - 0.2, 0, SPOTS.preschool.z - 1.2);
    school.add(mesh(box(1.8, 0.9, 1.1, 0.08), "#fff7e8", 0, 0.45, 0));
    school.add(mesh(box(2.0, 0.16, 1.3, 0.06), PALETTE.teal, 0, 0.98, 0));
    for (const x of [-0.5, 0.5]) school.add(mesh(box(0.34, 0.3, 0.04, 0.02), PALETTE.glass, x, 0.5, 0.56, glow));
    school.add(mesh(box(0.05, 1.5, 0.05, 0.02), PALETTE.dark, 0.95, 0.75, 0.4), mesh(box(0.4, 0.25, 0.03, 0.01), PALETTE.orange, 1.15, 1.35, 0.4));
    for (let i = 0; i < 7; i++) school.add(mesh(box(0.05, 0.3, 0.05, 0.02), PALETTE.wood, -0.9 + i * 0.3, 0.15, 1.25));
    school.add(mesh(box(1.9, 0.04, 0.04, 0.02), PALETTE.wood, 0, 0.25, 1.25));
    pop(school, 0.3);
  }

  // The runway for trips, with its plane.
  const runway = mesh(box(2.4, 0.04, 0.7, 0.02), "#cfd5df", SPOTS.away.x + 0.6, 0.02, SPOTS.away.z - 0.2);
  runway.rotation.y = -0.5;
  pop(runway, 0.3);
  const plane = new THREE.Group();
  plane.add(mesh(box(0.9, 0.17, 0.17, 0.08), "#ffffff", 0, 0, 0));
  plane.add(mesh(box(0.22, 0.03, 1.0, 0.01), PALETTE.blue, 0.03, 0, 0));
  plane.add(mesh(box(0.13, 0.22, 0.03, 0.01), PALETTE.blue, -0.38, 0.12, 0));
  plane.position.set(SPOTS.away.x + 1.2, 1.1, SPOTS.away.z - 0.6);
  plane.rotation.y = -0.5;
  pop(plane, 0.4);

  // The park: trees and a bench.
  const park = [tree(kit, SPOTS.out.x - 0.9, SPOTS.out.z - 0.7, 1.1), tree(kit, SPOTS.out.x + 0.2, SPOTS.out.z - 1.2, 0.8), tree(kit, -1.6, -2.6, 1), tree(kit, 1.9, -3.2, 0.9)];
  park.forEach((p, i) => pop(p, 0.35 + i * 0.04));
  const bench = new THREE.Group();
  bench.position.set(SPOTS.out.x + 0.5, 0, SPOTS.out.z - 0.4);
  bench.add(mesh(box(0.8, 0.05, 0.26, 0.02), PALETTE.wood, 0, 0.3, 0), mesh(box(0.8, 0.22, 0.04, 0.01), PALETTE.wood, 0, 0.45, -0.12));
  pop(bench, 0.4);

  // Street lamps, lit at night.
  for (const [x, z] of [[-1.6, 1.4], [1.6, 1.4]]) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.add(mesh(box(0.08, 1.2, 0.08, 0.03), PALETTE.dark, 0, 0.6, 0), mesh(box(0.24, 0.13, 0.24, 0.05), "#fff3d6", 0, 1.25, 0, data.night ? "#ffd9a0" : undefined));
    pop(g, 0.45);
  }

  // The family, gathered at their places. A kid asleep lies in a bed in front of the house.
  const zz: THREE.Mesh[] = [];
  const byPlace = new Map<Place, number>();
  const people = data.people.map((p, j) => {
    const n = byPlace.get(p.place) ?? 0;
    byPlace.set(p.place, n + 1);
    const at = SPOTS[p.place].clone().add(new THREE.Vector3((n % 3) * 0.95 - 0.95, 0, Math.floor(n / 3) * 0.7));
    const g = new THREE.Group();
    g.position.copy(at);
    const body = person(kit, p.color);
    body.scale.setScalar(p.kid ? 2.1 : 2.8);
    g.add(body);
    if (p.asleep) {
      // A bed long enough for the kid (≈1.1 lying down): headboard and pillow at
      // the back, the kid on their back with their feet at the front, under the blanket.
      g.add(
        mesh(box(0.82, 0.22, 1.4, 0.06), "#ffffff", 0, 0.11, 0),
        mesh(box(0.82, 0.5, 0.08, 0.03), PALETTE.wood, 0, 0.25, -0.72),
        mesh(box(0.5, 0.08, 0.26, 0.04), "#ffffff", 0, 0.26, -0.42),
        mesh(box(0.86, 0.38, 0.8, 0.08), PALETTE.sky, 0, 0.4, 0.3),
      );
      body.rotation.x = -Math.PI / 2;
      body.position.set(0, 0.39, 0.55);
      for (let i = 0; i < 3; i++) {
        const z = mesh(kit.sphere, "#c9d8ff", 0.1, 0.6, -0.35, "#9db4ff");
        z.castShadow = false;
        g.add(z);
        zz.push(z);
      }
    }
    pop(g, 0.7 + j * 0.08);
    return { g, body, p, j, n };
  });

  diorama(stage, { radius: R, height: 2.4, el: 44, az: 0.3 });

  // Labels: each person's name, above their head.
  const head = new THREE.Vector3();
  const labels = () =>
    people.map(({ g, p, n }) => {
      // Staggered up and down, so neighbours' names don't sit on each other.
      head.set(0, (p.asleep ? 1.1 : 1.9) + (n % 2) * 0.85, 0);
      return stage.project(g.localToWorld(head.clone()));
    });

  stage.onTick((time) => {
    home.puff(time, data.smoke && !still);
    if (still) return;
    park.forEach((p, i) => (p.rotation.z = 0.035 * Math.sin(time * 1.3 + i)));
    plane.position.y = 1.1 + 0.08 * Math.sin(time * 1.2);
    plane.rotation.z = 0.05 * Math.sin(time * 0.9);
    for (const { body, p, j } of people) if (!p.asleep) body.position.y = Math.abs(Math.sin(time * 2.2 + j * 1.3)) * 0.06;
    zz.forEach((z, i) => {
      const u = (time * 0.4 + i / 3) % 1;
      const g = z.parent!;
      z.position.set(0.15 + u * 0.3, 0.65 + u * 0.8, -0.35);
      z.scale.setScalar(0.04 + u * 0.06);
      z.visible = g.visible;
    });
  });

  return { dispose: stage.dispose, labels };
}
