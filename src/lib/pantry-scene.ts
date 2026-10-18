// The pantry (Kitchen → Purchases): a wooden shelf of jars, one per thing we
// buy regularly, soonest due top left. Each jar is as full as what's probably
// left (1 = just bought, empty = time to buy), the lid turns orange when it's
// due within three days; things bought once are empty jars with a grey lid
// (still learning). Tap a jar for its details (`onPick`).
import * as THREE from "three";
import { createStage, PALETTE } from "./three-kit";

export type Jar = { left: number | null; soon: boolean };

const COLS = 4;
const FILL = ["#14a3a0", "#5b9cf5", "#36a96b", "#f2b84b", "#ec5f8f", "#9b7bd8", "#c79a6b"];

export function createPantryScene(el: HTMLElement, jars: Jar[], onPick: (i: number) => void) {
  const stage = createStage(el, { shadow: 4, fov: 30 });
  const { camera, kit, pop, still } = stage;
  const { box, mesh, cylinder } = kit;
  const ROWS = Math.min(3, Math.max(1, Math.ceil(jars.length / COLS))); // as many shelves as needed
  const W = 4.2;
  const step = 1.1;
  const H = step * ROWS;

  // The shelf: back, sides and three boards.
  pop(mesh(box(W, H + 0.2, 0.1, 0.03), "#f6efe4", 0, H / 2, -0.55), 0);
  for (const x of [-W / 2, W / 2]) pop(mesh(box(0.12, H + 0.2, 1.2, 0.04), PALETTE.wood, x, H / 2, 0), 0.05);
  for (let r = 0; r <= ROWS; r++) pop(mesh(box(W, 0.1, 1.2, 0.03), PALETTE.wood, 0, r * step, 0), 0.08 + r * 0.03);

  const glass = new THREE.MeshStandardMaterial({ color: "#eaf4ff", transparent: true, opacity: 0.32, roughness: 0.1, depthWrite: false });
  const items = jars.slice(0, COLS * ROWS).map((j, i) => {
    const row = Math.floor(i / COLS);
    const col = i % COLS;
    const g = new THREE.Group();
    g.position.set(-W / 2 + (col + 0.5) * (W / COLS), (ROWS - 1 - row) * step + 0.05, 0.05);
    const jarH = 0.62;
    const shell = new THREE.Mesh(cylinder(0.3, jarH, 32), glass);
    shell.position.y = jarH / 2;
    shell.renderOrder = 2;
    g.add(shell);
    if (j.left !== null && j.left > 0.02) {
      const h = Math.max(0.04, (jarH - 0.06) * j.left);
      g.add(mesh(cylinder(0.27, h, 32), FILL[i % FILL.length], 0, 0.03 + h / 2, 0));
    }
    g.add(mesh(cylinder(0.32, 0.1, 32), j.left === null ? PALETTE.nobody : j.soon ? PALETTE.orange : PALETTE.dark, 0, jarH + 0.05, 0));
    g.traverse((o) => (o.userData.jar = i));
    pop(g, 0.3 + i * 0.05);
    return g;
  });

  stage.onTap((hit) => {
    const i = hit?.object.userData.jar;
    if (i !== undefined) onPick(i);
  });
  stage.onResize(() => {
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const d = Math.max((W / 2 + 0.4) / (tanV * camera.aspect), (H / 2 + 0.5) / tanV);
    camera.position.set(0.6, H / 2 + 1.0, d);
    camera.lookAt(0, H / 2 - 0.1, 0);
  });
  // Jars that are due wobble a little, asking to be bought.
  stage.onTick((time) => {
    if (still) return;
    items.forEach((g, i) => (g.rotation.z = jars[i].soon ? 0.06 * Math.sin(time * 5 + i) * Math.max(0, Math.sin(time * 1.3 + i)) : 0));
  });

  const at = new THREE.Vector3();
  const labels = () => items.map((g) => stage.project(g.localToWorld(at.set(0, -0.12, 0.45))));
  return {
    labels,
    dispose: () => {
      glass.dispose();
      stage.dispose();
    },
  };
}
