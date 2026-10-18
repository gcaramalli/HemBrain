// The kid's wardrobe (Kid → Wardrobe), in the calendar's style: a floating
// plate with a little wardrobe in the middle and one plot per category in use
// (jackets, rain gear, shoes…). On each plot a stack of folded clothes for
// what they have; what's still to buy stands as a see-through ghost and rims
// the plot in orange; what's too small waits in a cardboard box. Tap a plot →
// its category (`onPick`).
import * as THREE from "three";
import { createStage, diorama, PALETTE, plate, tile } from "./three-kit";

export type Rail = { have: number; need: number; outgrown: number };

const PLOT = 2.0;
const SHADES = [PALETTE.teal, PALETTE.blue, PALETTE.green, PALETTE.gold, "#ec5f8f", "#9b7bd8", "#9fb4d8"];

export function createWardrobeScene(el: HTMLElement, rails: Rail[], color: string, onPick: (i: number) => void) {
  const stage = createStage(el, { shadow: 8 });
  const { kit, pop, still } = stage;
  const { box, mesh } = kit;
  const n = rails.length;
  const R = Math.max(3.0, (n * (PLOT + 0.6)) / (2 * Math.PI));
  const radius = R + PLOT / 2 + 0.9;
  pop(plate(kit, radius), 0);

  // The wardrobe in the middle: two doors in the kid's colour, gold knobs.
  const closet = new THREE.Group();
  closet.add(mesh(box(1.5, 2.0, 0.9, 0.1), "#fff7e8", 0, 1.0, 0));
  for (const s of [-1, 1]) {
    closet.add(mesh(box(0.68, 1.8, 0.05, 0.05), color, s * 0.36, 1.0, 0.46));
    const knob = mesh(kit.sphere, PALETTE.gold, s * 0.08, 1.05, 0.52);
    knob.scale.setScalar(0.05);
    closet.add(knob);
  }
  pop(closet, 0.15);

  const ghost = new THREE.MeshStandardMaterial({ color: PALETTE.orange, transparent: true, opacity: 0.3, depthWrite: false });
  const ghosts: { g: THREE.Mesh; y: number }[] = [];
  const angle = (i: number) => Math.PI / 2 - (i / Math.max(n, 1)) * Math.PI * 2;
  const plots = rails.map((r, i) => {
    const plot = tile(kit, PLOT, { attention: r.need > 0 });
    plot.group.position.set(Math.cos(angle(i)) * R, 0, Math.sin(angle(i)) * R);
    const shade = SHADES[i % SHADES.length];
    // Folded clothes: a stack for what they have.
    for (let k = 0; k < Math.min(r.have, 5); k++) {
      const fold = mesh(box(0.9, 0.16, 0.7, 0.07), k % 2 ? color : shade, -0.3 + ((k * 37) % 5) * 0.02, plot.top + 0.09 + k * 0.17, -0.1);
      fold.rotation.y = ((k * 29) % 7) * 0.03 - 0.09;
      plot.group.add(fold);
    }
    // What's still to buy: a see-through ghost, pulsing.
    if (r.need) {
      const g = new THREE.Mesh(box(0.7, 0.5, 0.5, 0.1), ghost);
      g.position.set(0.45, plot.top + 0.27, 0.35);
      g.renderOrder = 2;
      ghosts.push({ g, y: g.position.y });
      plot.group.add(g);
    }
    // Too small: a cardboard box.
    if (r.outgrown) {
      plot.group.add(mesh(box(0.55, 0.4, 0.5, 0.04), "#c9a27a", 0.55, plot.top + 0.2, -0.5), mesh(box(0.57, 0.04, 0.2, 0.02), "#b48a60", 0.55, plot.top + 0.42, -0.5));
    }
    plot.group.traverse((o) => (o.userData.rail = i));
    pop(plot.group, 0.25 + i * 0.06);
    return plot.group;
  });

  diorama(stage, { radius, height: 2.0 });
  stage.onTap((hit) => {
    const i = hit?.object.userData.rail;
    if (i !== undefined) onPick(i);
  });
  stage.onTick((time) => {
    if (still) return;
    ghost.opacity = 0.22 + 0.14 * (0.5 + 0.5 * Math.sin(time * 2.5));
    ghosts.forEach(({ g, y }, i) => (g.position.y = y + 0.05 * Math.sin(time * 2 + i)));
  });

  const v = new THREE.Vector3();
  const labels = () => plots.map((p) => stage.project(p.localToWorld(v.set(0, 0.2, PLOT / 2 + 0.2))));
  return {
    labels,
    dispose: () => {
      ghost.dispose();
      stage.dispose();
    },
  };
}
