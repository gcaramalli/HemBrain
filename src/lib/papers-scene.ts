// Papers (Me → Papers), in the calendar's style: a floating plate with a little
// safe in the middle and one plot per category around it (insurance, housing,
// IDs…). On each plot a stack of folders, one per paper; when one has a
// deadline in the next 30 days the plot gets the orange rim and that folder
// slides out of the stack with an orange tab. Tap a plot → its category (`onPick`).
import * as THREE from "three";
import { createStage, diorama, PALETTE, plate, tile } from "./three-kit";

export type Shelf = { count: number; due: boolean };

const PLOT = 2.1;
const COLOURS = [PALETTE.teal, PALETTE.blue, PALETTE.green, PALETTE.gold, "#9fb4d8", "#ec5f8f", "#9b7bd8"];

export function createPapersScene(el: HTMLElement, shelves: Shelf[], onPick: (i: number) => void) {
  const stage = createStage(el, { shadow: 8 });
  const { kit, pop, still } = stage;
  const { box, mesh } = kit;
  const n = shelves.length;
  // A ring like the calendar's week, wide enough for the plots not to touch.
  const R = Math.max(3.1, (n * (PLOT + 0.6)) / (2 * Math.PI));
  const radius = R + PLOT / 2 + 0.9;
  pop(plate(kit, radius), 0);

  // The safe in the middle: a dark block with a dial and a handle.
  const safe = new THREE.Group();
  safe.add(mesh(box(1.4, 1.5, 1.2, 0.12), PALETTE.dark, 0, 0.75, 0));
  safe.add(mesh(box(1.15, 1.25, 0.06, 0.06), "#3a4357", 0, 0.75, 0.6));
  const dial = mesh(kit.cylinder(0.2, 0.08, 32), PALETTE.gold, -0.15, 0.85, 0.66);
  dial.rotation.x = Math.PI / 2;
  safe.add(dial, mesh(box(0.08, 0.35, 0.08, 0.03), PALETTE.gold, 0.35, 0.8, 0.66));
  pop(safe, 0.15);

  const angle = (i: number) => Math.PI / 2 - (i / Math.max(n, 1)) * Math.PI * 2; // first in front, then round
  const sliders: { folder: THREE.Object3D; base: number; i: number }[] = [];
  const plots = shelves.map((s, i) => {
    const plot = tile(kit, PLOT, { attention: s.due });
    plot.group.position.set(Math.cos(angle(i)) * R, 0, Math.sin(angle(i)) * R);
    const colour = COLOURS[i % COLOURS.length];
    const k = Math.min(s.count, 6);
    for (let f = 0; f < k; f++) {
      const folder = new THREE.Group();
      folder.position.set(((f * 37) % 5) * 0.03 - 0.06, plot.top + 0.09 + f * 0.2, ((f * 53) % 5) * 0.03 - 0.06);
      folder.rotation.y = ((f * 29) % 7) * 0.03 - 0.09;
      folder.add(mesh(box(1.35, 0.16, 1.0, 0.05), colour, 0, 0, 0), mesh(box(1.25, 0.04, 0.9, 0.01), "#ffffff", 0, 0.09, 0));
      // The paper with a deadline: the top one, sticking out with an orange tab.
      if (s.due && f === k - 1) {
        folder.add(mesh(box(0.3, 0.06, 0.16, 0.02), PALETTE.orange, 0.35, 0.02, 0.5));
        sliders.push({ folder, base: folder.position.z, i });
      }
      plot.group.add(folder);
    }
    plot.group.traverse((o) => (o.userData.shelf = i));
    pop(plot.group, 0.25 + i * 0.06);
    return plot.group;
  });

  diorama(stage, { radius, height: 1.6 });
  stage.onTap((hit) => {
    const i = hit?.object.userData.shelf;
    if (i !== undefined) onPick(i);
  });
  stage.onTick((time) => {
    dial.rotation.y = still ? 0 : time * 0.6;
    for (const s of sliders) s.folder.position.z = s.base + (still ? 0.35 : 0.2 + 0.18 * Math.sin(time * 2 + s.i));
  });

  const v = new THREE.Vector3();
  const labels = () => plots.map((p) => stage.project(p.localToWorld(v.set(0, 0.2, PLOT / 2 + 0.2))));
  return { dispose: stage.dispose, labels };
}
