// The pantry (Kitchen → Purchases), in the calendar's style: a floating round
// plate with one plot per thing we buy regularly, soonest due first (front
// row, left to right). On each plot a jar as full as what's probably left
// (1 = just bought, empty = time to buy); an orange rim when it's due within
// three days; things bought once stand on a soft plot with an empty jar and a
// grey lid (still learning). Tap a jar for its details (`onPick`).
import * as THREE from "three";
import { createStage, diorama, PALETTE, plate, tile } from "./three-kit";

export type Jar = { left: number | null; soon: boolean };

const COLS = 4;
const PLOT = 1.7;
const PITCH = 1.95;
const FILL = ["#14a3a0", "#5b9cf5", "#36a96b", "#f2b84b", "#ec5f8f", "#9b7bd8", "#c79a6b"];

export function createPantryScene(el: HTMLElement, jars: Jar[], onPick: (i: number) => void) {
  const stage = createStage(el, { shadow: 7 });
  const { kit, pop, still } = stage;
  const { mesh, cylinder } = kit;
  const shown = jars.slice(0, COLS * 3);
  const rows = Math.max(1, Math.ceil(shown.length / COLS));
  const cols = Math.min(COLS, shown.length);
  const radius = Math.hypot((cols * PITCH) / 2, (rows * PITCH) / 2) + 0.7;

  pop(plate(kit, radius), 0);

  const glass = new THREE.MeshStandardMaterial({ color: "#eaf4ff", transparent: true, opacity: 0.32, roughness: 0.1, depthWrite: false });
  // Soonest first: the front row, left to right, then further back.
  const at = (i: number) => {
    const row = Math.floor(i / COLS);
    const inRow = Math.min(COLS, shown.length - row * COLS);
    return new THREE.Vector3((i % COLS - (inRow - 1) / 2) * PITCH, 0, ((rows - 1) / 2 - row) * PITCH);
  };
  const items = shown.map((j, i) => {
    const plot = tile(kit, PLOT, { soft: j.left === null, attention: j.soon });
    plot.group.position.copy(at(i));
    const jar = new THREE.Group();
    jar.position.y = plot.top;
    const h = 0.85;
    const shell = new THREE.Mesh(cylinder(0.42, h, 40), glass);
    shell.position.y = h / 2;
    shell.renderOrder = 2;
    jar.add(shell);
    if (j.left !== null && j.left > 0.02) {
      const fill = Math.max(0.06, (h - 0.1) * j.left);
      jar.add(mesh(cylinder(0.38, fill, 40), FILL[i % FILL.length], 0, 0.05 + fill / 2, 0));
    }
    jar.add(mesh(cylinder(0.46, 0.14, 40), j.left === null ? PALETTE.nobody : j.soon ? PALETTE.orange : PALETTE.dark, 0, h + 0.08, 0));
    plot.group.add(jar);
    plot.group.traverse((o) => (o.userData.jar = i));
    pop(plot.group, 0.15 + i * 0.05);
    return { plot: plot.group, jar };
  });

  diorama(stage, { radius, height: 1.3 });
  stage.onTap((hit) => {
    const i = hit?.object.userData.jar;
    if (i !== undefined) onPick(i);
  });
  // Jars that are due wobble now and then, asking to be bought.
  stage.onTick((time) => {
    if (still) return;
    items.forEach(({ jar }, i) => (jar.rotation.z = shown[i].soon ? 0.07 * Math.sin(time * 6 + i) * Math.max(0, Math.sin(time * 1.3 + i)) ** 4 : 0));
  });

  // Names at the front edge of each plot, like the calendar's days.
  const v = new THREE.Vector3();
  const labels = () => items.map(({ plot }) => stage.project(plot.localToWorld(v.set(0, 0.2, PLOT / 2 + 0.15))));
  return {
    labels,
    dispose: () => {
      glass.dispose();
      stage.dispose();
    },
  };
}
