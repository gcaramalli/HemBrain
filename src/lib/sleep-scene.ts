// The kid's last 24 hours of sleep (Kid → Sleep), in the calendar's style: a
// floating plate with a 24-hour dial (midnight at the back, noon in front) of
// little blocks, one per quarter of an hour, raised where they slept — nights
// in night blue, naps in the kid's colour, awake flat and white. An ink pin
// marks now; in the middle the kid lies in bed when asleep, or stands under the
// sun or the moon.
import * as THREE from "three";
import { createStage, diorama, person, PALETTE, plate } from "./three-kit";

export type SleepDial = {
  slots: (0 | 1 | 2)[]; // 96 quarters, oldest first, the last one = now: 0 awake, 1 nap, 2 night
  nowMinutes: number; // minutes since midnight, now
  color: string; // the kid's colour
  asleep: boolean;
  night: boolean; // evening / night hours: the moon instead of the sun
};

const R = 2.7;
const NIGHT = "#2c3a66";

// Clock minutes → a point on the dial: midnight at the back, 06 on the right, noon in front.
const onDial = (minutes: number, r: number) => {
  const a = (minutes / 1440) * Math.PI * 2;
  return new THREE.Vector3(Math.sin(a) * r, 0, -Math.cos(a) * r);
};

export function createSleepScene(el: HTMLElement, d: SleepDial) {
  const stage = createStage(el, { shadow: 5 });
  const { kit, pop, still } = stage;
  const { box, mesh } = kit;
  const radius = R + 1.1;
  pop(plate(kit, radius), 0);

  // The dial: 96 blocks.
  const start = d.nowMinutes - 24 * 60 + 15;
  d.slots.forEach((s, i) => {
    const minutes = (((start + i * 15) % 1440) + 1440) % 1440;
    const p = onDial(minutes + 7.5, R);
    const h = s === 2 ? 0.42 : s === 1 ? 0.3 : 0.08;
    const b = mesh(box(0.16, h, 0.42, 0.04), s === 2 ? NIGHT : s === 1 ? d.color : PALETTE.tile, p.x, h / 2, p.z);
    b.rotation.y = -Math.atan2(p.x, -p.z);
    pop(b, 0.2 + i * 0.006);
  });
  // Hour ticks at 0, 6, 12, 18.
  for (const m of [0, 360, 720, 1080]) {
    const p = onDial(m, R + 0.45);
    pop(mesh(box(0.08, 0.05, 0.25, 0.02), PALETTE.dark, p.x, 0.03, p.z), 0.3).rotation.y = -Math.atan2(p.x, -p.z);
  }

  // Now: an ink pin just outside the dial.
  const now = onDial(d.nowMinutes, R + 0.45);
  const pin = new THREE.Group();
  pin.position.copy(now);
  pin.add(mesh(box(0.06, 0.7, 0.06, 0.02), PALETTE.dark, 0, 0.35, 0));
  const ball = mesh(kit.sphere, PALETTE.dark, 0, 0.75, 0);
  ball.scale.setScalar(0.12);
  pin.add(ball);
  pop(pin, 0.8);

  // In the middle: a bed, the kid in it or standing beside it, and the sun or the moon.
  const middle = new THREE.Group();
  middle.add(mesh(box(1.0, 0.25, 1.5, 0.08), "#ffffff", 0, 0.13, 0), mesh(box(1.04, 0.5, 0.12, 0.05), PALETTE.wood, 0, 0.25, -0.75));
  middle.add(mesh(box(1.02, 0.12, 0.8, 0.05), PALETTE.sky, 0, 0.3, 0.3));
  const kid = person(kit, d.color);
  kid.scale.setScalar(2.2);
  if (d.asleep) {
    kid.rotation.x = -Math.PI / 2;
    kid.position.set(0, 0.32, -0.45);
  } else kid.position.set(0.9, 0, 0.4);
  middle.add(kid);
  pop(middle, 0.4);
  const sky = mesh(kit.sphere, d.night ? "#e9edff" : PALETTE.gold, -1.3, 2.4, 0.2, d.night ? "#9db4ff" : "#ffb54a");
  sky.scale.setScalar(0.32);
  sky.castShadow = false;
  pop(sky, 0.9);
  const zz = d.asleep
    ? [0, 1, 2].map(() => {
        const z = mesh(kit.sphere, "#c9d8ff", 0, 0.8, -0.4, "#9db4ff");
        z.castShadow = false;
        middle.add(z);
        return z;
      })
    : [];

  diorama(stage, { radius, height: 2.2 });
  stage.onTick((time) => {
    if (still) return;
    sky.position.y = 2.4 + 0.08 * Math.sin(time * 0.9);
    ball.scale.setScalar(0.12 + 0.03 * Math.max(0, Math.sin(time * 3)));
    if (!d.asleep) kid.position.y = Math.abs(Math.sin(time * 2.4)) * 0.08;
    zz.forEach((z, i) => {
      const u = (time * 0.4 + i / 3) % 1;
      z.position.set(0.1 + u * 0.35, 0.6 + u * 0.9, -0.45);
      z.scale.setScalar(0.05 + u * 0.07);
    });
  });

  // Hour labels: 0, 6, 12, 18.
  const v = new THREE.Vector3();
  const labels = () => [0, 360, 720, 1080].map((m) => stage.project(v.copy(onDial(m, R + 0.95)).setY(0.1)));
  return { dispose: stage.dispose, labels };
}
