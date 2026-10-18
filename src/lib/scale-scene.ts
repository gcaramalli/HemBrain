// The expenses as a balance (Home → Expenses): one pan per parent in their
// colour with a stack of coins for what they paid, the beam tipped towards
// whoever is owed money (they have put more in). All square = level. The
// beam swings into place like a real one (a damped spring).
import * as THREE from "three";
import { createStage, PALETTE } from "./three-kit";

export type ScaleData = { sides: { color: string; paid: number }[]; tilt: number }; // tilt: -1 (left down) … 1 (right down)

export function createScaleScene(el: HTMLElement, data: ScaleData) {
  const stage = createStage(el, { shadow: 4, fov: 30 });
  const { camera, kit, pop, still } = stage;
  const { box, mesh, cylinder } = kit;
  const W = 1.5; // half the beam

  // Base, post and pivot.
  pop(mesh(box(1.2, 0.12, 0.7, 0.05), PALETTE.dark, 0, 0.06, 0), 0);
  pop(mesh(box(0.12, 1.5, 0.12, 0.04), PALETTE.dark, 0, 0.85, 0), 0.05);
  const beam = new THREE.Group();
  beam.position.y = 1.65;
  beam.add(mesh(box(W * 2 + 0.2, 0.08, 0.1, 0.03), PALETTE.gold, 0, 0, 0));
  beam.add(mesh(kit.sphere, PALETTE.gold, 0, 0, 0));
  beam.children[1].scale.setScalar(0.1);
  pop(beam, 0.1);

  // The pans hang from the beam ends and stay level whatever the tilt.
  const most = Math.max(1, ...data.sides.map((s) => s.paid));
  const pans = data.sides.slice(0, 2).map((s, i) => {
    const x = i ? W : -W;
    const hang = new THREE.Group();
    hang.position.set(x, 0, 0);
    beam.add(hang);
    const pan = new THREE.Group();
    pan.position.y = -0.85;
    // Three cords from the rim up to the beam end.
    for (const a of [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3]) {
      const bx = Math.cos(a) * 0.48;
      const bz = Math.sin(a) * 0.48;
      const len = Math.hypot(bx, 0.82, bz);
      const cord = mesh(box(0.015, len, 0.015, 0.005), PALETTE.dark, bx / 2, 0.44, bz / 2);
      cord.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-bx, 0.82, -bz).normalize()); // from the rim to the hook
      pan.add(cord);
    }
    pan.add(mesh(cylinder(0.55, 0.06), s.color, 0, 0, 0));
    // Coins: one per tenth of the biggest payer's total, dropping in one after another.
    const n = Math.max(s.paid > 0 ? 1 : 0, Math.round((s.paid / most) * 10));
    for (let k = 0; k < n; k++) {
      const coin = mesh(cylinder(0.17, 0.05, 32), PALETTE.gold, ((k * 37) % 5) * 0.025 - 0.05, 0.06 + k * 0.055, ((k * 53) % 5) * 0.025 - 0.05);
      pop(coin, 0.5 + i * 0.15 + k * 0.06, pan);
    }
    hang.add(pan);
    return hang;
  });

  // Up to 0.3 rad either way.
  const target = Math.max(-1, Math.min(1, data.tilt)) * 0.3;
  let angle = still ? target : 0;
  let speed = 0;
  stage.onResize(() => {
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const d = Math.max(2.3 / (tanV * camera.aspect), 1.3 / tanV);
    camera.position.set(0, 1.5 + d * 0.25, d);
    camera.lookAt(0, 1.0, 0);
  });
  stage.onTick((_time, dt, t) => {
    if (!still && t > 0.9) {
      // A damped spring towards the target: it overshoots a little and settles.
      speed += ((target - angle) * 18 - speed * 3.2) * dt;
      angle += speed * dt;
    }
    beam.rotation.z = -angle;
    pans.forEach((p) => (p.rotation.z = angle)); // keep the pans level
  });

  // Labels under each pan.
  const at = new THREE.Vector3();
  const labels = () => pans.map((p) => stage.project(p.localToWorld(at.set(0, -1.15, 0))));
  return { dispose: stage.dispose, labels };
}
