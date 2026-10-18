// The wrapped gift of GiftInbox: a box in the sender's colour with an orange
// ribbon and bow that wiggles until you tap it; then the lid flies off, the
// walls fold open and confetti bursts out (the gift's emoji appears above,
// in HTML). `state.opened` is read every frame, so the same scene plays the opening.
import * as THREE from "three";
import { clamp01, createStage, diorama, PALETTE, plate, smooth } from "./three-kit";

export function createGiftScene(el: HTMLElement, color: string, state: { opened: boolean }) {
  const stage = createStage(el, { ao: false, shadow: 4, fov: 32 });
  const { kit, pop, still } = stage;
  const { box, mesh, sphere } = kit;
  stage.sun.shadow.normalBias = 0.05; // no acne on the walls once they lie flat

  // On a small floating plate, like every scene.
  pop(plate(kit, 1.25), 0);
  const gift = new THREE.Group();
  gift.rotation.y = 0.5;
  pop(gift, 0.05);

  // The floor of the box and four walls hinged at their bottom edge, so they can fold open.
  const S = 1;
  const H = 0.8;
  gift.add(mesh(box(S, 0.06, S, 0.02), color, 0, 0.03, 0));
  const walls = [0, 1, 2, 3].map((i) => {
    const hinge = new THREE.Group();
    const a = (i * Math.PI) / 2;
    hinge.position.set(Math.sin(a) * (S / 2), 0, Math.cos(a) * (S / 2));
    hinge.rotation.order = "YXZ"; // turn to its side, then tip outwards about its bottom edge
    hinge.rotation.y = a;
    const wall = mesh(box(S, H, 0.06, 0.02), color, 0, H / 2, 0);
    const band = mesh(box(0.16, H + 0.01, 0.07, 0.01), PALETTE.orange, 0, H / 2, 0.005);
    hinge.add(wall, band);
    gift.add(hinge);
    return hinge;
  });

  // The lid with its ribbon and bow.
  const lid = new THREE.Group();
  lid.position.y = H + 0.1;
  lid.add(mesh(box(S + 0.1, 0.2, S + 0.1, 0.05), color, 0, 0, 0));
  lid.add(mesh(box(0.17, 0.21, S + 0.11, 0.02), PALETTE.orange, 0, 0, 0), mesh(box(S + 0.11, 0.21, 0.17, 0.02), PALETTE.orange, 0, 0, 0));
  for (const s of [-1, 1]) {
    const loop = mesh(sphere, PALETTE.orange, s * 0.17, 0.2, 0);
    loop.scale.set(0.18, 0.1, 0.09);
    loop.rotation.z = s * 0.5;
    lid.add(loop);
  }
  const knot = mesh(sphere, PALETTE.orange, 0, 0.17, 0);
  knot.scale.setScalar(0.08);
  lid.add(knot);
  gift.add(lid);

  // Confetti, hidden until the box opens.
  const colours = [PALETTE.blue, PALETTE.teal, PALETTE.orange, PALETTE.green, "#ec5f8f", PALETTE.gold];
  const confetti = Array.from({ length: 36 }, (_, i) => {
    const c = mesh(box(0.07, 0.07, 0.02, 0.01), colours[i % colours.length], 0, H / 2, 0);
    c.visible = false;
    const a = (i / 36) * Math.PI * 2 + Math.random() * 0.4;
    const speed = 1.4 + Math.random() * 1.2;
    gift.add(c);
    return { c, v: new THREE.Vector3(Math.cos(a) * speed * 0.45, 2.6 + Math.random() * 1.6, Math.sin(a) * speed * 0.45), spin: Math.random() * 8 };
  });

  let openedAt: number | null = null;
  stage.onTick((time, _dt, t) => {
    if (state.opened && openedAt === null) openedAt = time;
    if (openedAt === null) {
      // Wrapped: a little wiggle every couple of seconds, and a slow turn.
      const w = still ? 0 : Math.max(0, Math.sin(t * 3.2)) ** 8;
      gift.rotation.z = 0.12 * w * Math.sin(t * 30);
      gift.position.y = 0.05 * w;
      return;
    }
    const u = time - openedAt;
    gift.rotation.z = 0;
    // The lid flies up and away, spinning.
    const l = clamp01(u / 0.7);
    lid.position.set(0.6 * l, H + 0.1 + 2.2 * smooth(l), -0.3 * l);
    lid.rotation.set(-1.2 * l, 2 * l, 0.6 * l);
    lid.visible = l < 1;
    // The walls fold out like petals.
    const f = smooth(clamp01((u - 0.2) / 0.6));
    walls.forEach((w) => (w.rotation.x = f * 1.3));
    // Confetti: thrown up and out, falling back down.
    const c = Math.max(0, u - 0.25);
    for (const p of confetti) {
      p.c.visible = u > 0.25 && c < 2.6;
      p.c.position.set(p.v.x * c, H / 2 + p.v.y * c - 2.2 * c * c, p.v.z * c);
      p.c.rotation.set(p.spin * c, p.spin * 0.7 * c, 0);
    }
  });
  diorama(stage, { radius: 1.25, height: 1.3, el: 30 });
  return { dispose: stage.dispose };
}
