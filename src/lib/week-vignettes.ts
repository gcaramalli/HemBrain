// The little scenes standing on each day of the 3D week (`week-scene.ts`): one
// per activity, guessed from its title in English, French or Swedish — a
// dinner is a table with its people around it, swimming a pool, padel a court…
// A title we don't recognise gets a question mark, until it gets its own scene.
// Each fits in about 1.1 × 1.1 units around its origin, stands on y = 0, and
// moves a little on its own (`update(time)`).
import * as THREE from "three";
import { PALETTE, person, type Kit } from "./three-kit";

export { actKind, type ActKind } from "./act-kind";
import type { ActKind } from "./act-kind";

export type Vignette = { group: THREE.Group; update: (time: number) => void };

const C = { ...PALETTE, white: "#ffffff", ball: "#e9ef5a" };

const face = (g: THREE.Object3D, x: number, z: number) => (g.rotation.y = Math.atan2(x - g.position.x, z - g.position.z));

export function buildVignette(kit: Kit, kind: ActKind, colors: string[], seed: number): Vignette {
  const g = new THREE.Group();
  const { box, sphere, mesh, mat } = kit;
  const people = colors.length ? colors : [C.guest];
  let update: (t: number) => void = () => {};

  switch (kind) {
    case "meal": {
      // A table for four, always full: who is really there sits on the far side, facing the
      // camera, in their colours ("Jenny" alone = Jenny + three grey guests, "Jenny and
      // Guillaume" = both + two guests), grey guests take the other seats.
      g.add(mesh(box(0.72, 0.06, 0.48, 0.03), C.wood, 0, 0.36, 0));
      g.add(mesh(box(0.08, 0.33, 0.08, 0.02), C.wood, 0, 0.17, 0));
      const diners = [...colors.slice(0, 4), ...Array(4).fill(C.guest)].slice(0, 4);
      const seats = [[-0.2, -0.4], [0.2, -0.4], [-0.2, 0.4], [0.2, 0.4]];
      const sitters = diners.map((c, i) => {
        const [x, z] = seats[i];
        const p = person(kit, c, x, z, true);
        face(p, x, 0);
        g.add(p);
        g.add(mesh(box(0.15, 0.02, 0.15, 0.01), C.white, x, 0.4, z * 0.45));
        return p;
      });
      g.add(mesh(box(0.16, 0.1, 0.16, 0.05), C.orange, 0, 0.44, 0)); // the dish
      const steam = mesh(sphere, C.white, 0, 0.6, 0);
      g.add(steam);
      update = (t) => {
        sitters.forEach((p, i) => (p.children[1].position.y = 0.46 + 0.02 * Math.sin(t * 3 + i * 2)));
        const u = (t * 0.6 + seed) % 1;
        steam.position.y = 0.52 + u * 0.35;
        steam.scale.setScalar(0.04 + u * 0.05);
      };
      break;
    }
    case "swim": {
      g.add(mesh(box(1.05, 0.14, 0.72, 0.05), C.white, 0, 0.07, 0));
      g.add(mesh(box(0.92, 0.04, 0.58, 0.02), C.sky, 0, 0.13, 0));
      for (const z of [-0.1, 0.1]) g.add(mesh(box(0.88, 0.02, 0.015, 0.005), C.white, 0, 0.155, z));
      const swimmers = people.slice(0, 2).map((c, i) => {
        const s = new THREE.Group();
        s.add(mesh(box(0.22, 0.05, 0.1, 0.025), c, 0, 0.16, 0));
        const head = mesh(sphere, "#f3dcc6", 0.14, 0.18, 0);
        head.scale.setScalar(0.06);
        s.add(head);
        s.position.z = i ? 0.2 : -0.2;
        g.add(s);
        return s;
      });
      update = (t) =>
        swimmers.forEach((s, i) => {
          const u = Math.sin(t * 0.9 + i * 1.7 + seed);
          s.position.x = u * 0.3;
          s.rotation.y = Math.cos(t * 0.9 + i * 1.7 + seed) >= 0 ? 0 : Math.PI;
        });
      break;
    }
    case "racket": {
      g.add(mesh(box(1.1, 0.04, 0.66, 0.02), C.teal, 0, 0.02, 0));
      g.add(mesh(box(0.015, 0.006, 0.6, 0.002), C.white, 0, 0.043, 0));
      g.add(mesh(box(1.0, 0.006, 0.015, 0.002), C.white, 0, 0.043, 0));
      g.add(mesh(box(0.03, 0.16, 0.66, 0.01), C.dark, 0, 0.12, 0)); // the net
      const players = (people.length < 2 ? [...people, C.guest] : people.slice(0, 2)).map((c, i) => {
        const p = person(kit, c, i ? 0.4 : -0.4, 0);
        face(p, 0, 0);
        g.add(p);
        return p;
      });
      const ball = mesh(sphere, C.ball, 0, 0.3, 0);
      ball.scale.setScalar(0.035);
      g.add(ball);
      update = (t) => {
        const u = (t * 0.8 + seed) % 2;
        const x = u < 1 ? u : 2 - u; // there and back
        ball.position.set(-0.32 + x * 0.64, 0.25 + Math.sin(Math.PI * (u % 1)) * 0.3, 0.05);
        players.forEach((p, i) => (p.position.z = 0.08 * Math.sin(t * 1.6 + i * 2)));
      };
      break;
    }
    case "sport": {
      g.add(mesh(box(0.9, 0.03, 0.42, 0.015), C.teal, 0, 0.015, 0));
      const jumpers = people.slice(0, 2).map((c, i) => {
        const p = person(kit, c, people.length > 1 ? (i ? 0.2 : -0.2) : 0, 0);
        g.add(p);
        return p;
      });
      g.add(mesh(box(0.22, 0.05, 0.05, 0.02), C.dark, 0.36, 0.06, 0.12));
      update = (t) => jumpers.forEach((p, i) => (p.position.y = 0.03 + Math.abs(Math.sin(t * 4 + i + seed)) * 0.14));
      break;
    }
    case "health": {
      g.add(mesh(box(0.7, 0.5, 0.55, 0.05), C.white, 0, 0.25, -0.12));
      g.add(mesh(box(0.76, 0.06, 0.6, 0.03), C.teal, 0, 0.53, -0.12));
      const cross = new THREE.Group();
      cross.add(mesh(box(0.22, 0.07, 0.03, 0.01), C.green, 0, 0, 0), mesh(box(0.07, 0.22, 0.03, 0.01), C.green, 0, 0, 0));
      cross.position.set(0, 0.3, 0.16);
      g.add(cross);
      g.add(mesh(box(0.14, 0.24, 0.02, 0.01), C.glass, 0.22, 0.12, 0.16));
      people.slice(0, 2).forEach((c, i) => g.add(person(kit, c, -0.25 + i * 0.22, 0.38)));
      update = (t) => cross.scale.setScalar(1 + 0.08 * Math.max(0, Math.sin(t * 3 + seed)));
      break;
    }
    case "party": {
      g.add(mesh(box(0.42, 0.18, 0.42, 0.06), C.white, 0, 0.09, 0));
      g.add(mesh(box(0.44, 0.04, 0.44, 0.02), people[0] === C.guest ? C.blue : people[0], 0, 0.1, 0));
      g.add(mesh(box(0.28, 0.14, 0.28, 0.05), C.white, 0, 0.25, 0));
      g.add(mesh(box(0.03, 0.12, 0.03, 0.01), C.white, 0, 0.38, 0));
      const flame = mesh(sphere, C.orange, 0, 0.47, 0, C.orange);
      flame.scale.set(0.03, 0.05, 0.03);
      g.add(flame);
      const balloons = [C.blue, C.teal, C.orange].map((c, i) => {
        const b = mesh(sphere, c, -0.38 + i * 0.1, 0.75, -0.3 + (i % 2) * 0.08);
        b.scale.set(0.08, 0.1, 0.08);
        g.add(b);
        g.add(mesh(box(0.008, 0.45, 0.008, 0.003), C.dark, -0.38 + i * 0.1, 0.42, -0.3 + (i % 2) * 0.08));
        return b;
      });
      update = (t) => {
        flame.scale.y = 0.05 + 0.015 * Math.sin(t * 17 + seed);
        balloons.forEach((b, i) => (b.position.y = 0.75 + 0.04 * Math.sin(t * 1.5 + i)));
      };
      break;
    }
    case "travel": {
      g.add(mesh(box(1.0, 0.02, 0.22, 0.01), "#cfd5df", 0, 0.01, 0));
      const plane = new THREE.Group();
      plane.add(mesh(box(0.7, 0.13, 0.13, 0.06), C.white, 0, 0, 0));
      plane.add(mesh(box(0.18, 0.025, 0.78, 0.01), C.blue, 0.02, 0, 0));
      plane.add(mesh(box(0.1, 0.18, 0.025, 0.01), C.blue, -0.3, 0.1, 0));
      plane.add(mesh(box(0.08, 0.02, 0.26, 0.01), C.blue, -0.3, 0.02, 0));
      plane.add(mesh(box(0.07, 0.05, 0.135, 0.02), C.glass, 0.3, 0.03, 0));
      g.add(plane);
      update = (t) => {
        plane.position.y = 0.5 + 0.06 * Math.sin(t * 1.2 + seed);
        plane.rotation.x = 0.12 * Math.sin(t * 0.8 + seed);
        plane.rotation.z = 0.06 + 0.04 * Math.sin(t * 1.2 + seed);
      };
      break;
    }
    case "show": {
      g.add(mesh(box(0.8, 0.42, 0.04, 0.02), C.dark, 0, 0.36, -0.36));
      const screen = mesh(box(0.72, 0.34, 0.02, 0.01), C.white, 0, 0.36, -0.335, C.sky);
      g.add(screen);
      for (const z of [0.05, 0.3]) g.add(mesh(box(0.8, 0.12, 0.14, 0.04), C.blue, 0, 0.06, z));
      people.slice(0, 3).forEach((c, i) => {
        const p = person(kit, c, -0.22 + i * 0.22, 0.05);
        p.position.y = 0.06;
        g.add(p);
      });
      const glow = screen.material as THREE.MeshStandardMaterial;
      update = (t) => (glow.emissiveIntensity = 0.5 + 0.35 * Math.abs(Math.sin(t * 2.3 + seed)));
      break;
    }
    case "work": {
      // An office block with a window grid, someone heading in with a briefcase.
      g.add(mesh(box(0.62, 0.95, 0.5, 0.05), "#9fb4d8", 0, 0.475, -0.2));
      const lit: THREE.Mesh[] = [];
      for (let r = 0; r < 3; r++)
        for (let c = 0; c < 3; c++) {
          const w = mesh(box(0.14, 0.16, 0.02, 0.01), C.glass, -0.18 + c * 0.18, 0.3 + r * 0.24, 0.06);
          g.add(w);
          lit.push(w);
        }
      g.add(mesh(box(0.2, 0.26, 0.02, 0.01), C.blue, 0, 0.13, 0.06));
      const workers = people.slice(0, 2).map((c, i) => {
        const p = person(kit, c, -0.25 + i * 0.5, 0.35);
        p.add(mesh(box(0.12, 0.09, 0.04, 0.015), C.dark, 0.13, 0.12, 0));
        g.add(p);
        return p;
      });
      const on = mat(C.glass, "#ffe9a8");
      const off = lit[0].material;
      update = (t) => {
        const k = Math.floor(t * 1.5 + seed * 7) % lit.length;
        lit.forEach((w, i) => (w.material = i === k || i === (k + 4) % lit.length ? on : off));
        workers.forEach((p, i) => (p.position.z = 0.35 + 0.05 * Math.sin(t * 2 + i * 2)));
      };
      break;
    }
    case "lesson": {
      // A blackboard, a teacher, and the pupils at their desks.
      g.add(mesh(box(0.7, 0.42, 0.04, 0.02), "#2f5d4a", 0, 0.5, -0.38));
      g.add(mesh(box(0.74, 0.04, 0.06, 0.01), C.wood, 0, 0.27, -0.36));
      for (const x of [-0.3, 0.3]) g.add(mesh(box(0.04, 0.3, 0.04, 0.01), C.wood, x, 0.15, -0.38));
      const chalk = mesh(box(0.3, 0.02, 0.01, 0.005), C.white, -0.1, 0.55, -0.355);
      g.add(chalk);
      const teacher = person(kit, C.guest, 0.42, -0.25);
      face(teacher, 0, 0.3);
      g.add(teacher);
      const pupils = people.slice(0, 3).map((c, i) => {
        const x = -0.3 + i * 0.3;
        g.add(mesh(box(0.24, 0.03, 0.16, 0.01), C.wood, x, 0.26, 0.12));
        const p = person(kit, c, x, 0.3, true);
        face(p, x, -1);
        g.add(p);
        return p;
      });
      update = (t) => {
        chalk.scale.x = 0.3 + 0.7 * ((t * 0.4 + seed) % 1);
        teacher.rotation.y = -0.8 + 0.4 * Math.sin(t * 1.2 + seed);
        pupils.forEach((p, i) => (p.children[1].position.y = 0.46 + 0.015 * Math.sin(t * 3 + i)));
      };
      break;
    }
    case "drinks": {
      // A high bar table, stools, glasses that clink now and then.
      g.add(mesh(box(0.5, 0.05, 0.5, 0.03), C.wood, 0, 0.62, 0));
      g.add(mesh(box(0.07, 0.6, 0.07, 0.02), C.dark, 0, 0.3, 0));
      g.add(mesh(box(0.32, 0.03, 0.32, 0.01), C.dark, 0, 0.015, 0));
      const guests = (people.length < 2 ? [...people, C.guest] : people.slice(0, 3)).map((c, i, all) => {
        const a = (i / all.length) * Math.PI * 2 + 0.6;
        const p = person(kit, c, Math.sin(a) * 0.42, Math.cos(a) * 0.42);
        p.scale.setScalar(1.25);
        face(p, 0, 0);
        g.add(p);
        return p;
      });
      const glasses = [0, 1, 2].map((i) => {
        const a = (i / 3) * Math.PI * 2;
        const gl = mesh(box(0.06, 0.12, 0.06, 0.02), "#f2b84b", Math.sin(a) * 0.12, 0.71, Math.cos(a) * 0.12);
        g.add(gl);
        return gl;
      });
      update = (t) => {
        const cheers = Math.max(0, Math.sin(t * 1.3 + seed)) ** 6; // every few seconds
        glasses.forEach((gl, i) => (gl.position.y = 0.71 + cheers * 0.1 + 0.01 * Math.sin(t * 4 + i)));
        guests.forEach((p, i) => (p.rotation.x = 0.12 * cheers + 0.02 * Math.sin(t * 2 + i)));
      };
      break;
    }
    case "family": {
      // Family visiting: their little house, a suitcase, everyone together, a heart above.
      g.add(mesh(box(0.5, 0.4, 0.4, 0.04), C.white, -0.28, 0.2, -0.25));
      for (const s of [-1, 1]) {
        const roof = mesh(box(0.34, 0.05, 0.46, 0.02), C.blue, -0.28 + s * 0.12, 0.48, -0.25);
        roof.rotation.z = -s * 0.6;
        g.add(roof);
      }
      g.add(mesh(box(0.12, 0.2, 0.02, 0.01), C.teal, -0.28, 0.1, -0.04));
      const crowd = [C.guest, C.guest, ...people.slice(0, 2)].map((c, i) => {
        const p = person(kit, c, -0.3 + i * 0.22, 0.25);
        g.add(p);
        return p;
      });
      g.add(mesh(box(0.14, 0.18, 0.08, 0.03), C.teal, -0.5, 0.09, 0.32));
      const heart = new THREE.Group();
      for (const s of [-1, 1]) {
        const lobe = mesh(sphere, "#ec5f8f", s * 0.045, 0, 0);
        lobe.scale.setScalar(0.06);
        heart.add(lobe);
      }
      const tip = mesh(box(0.09, 0.09, 0.05, 0.02), "#ec5f8f", 0, -0.045, 0);
      tip.rotation.z = Math.PI / 4;
      heart.add(tip);
      heart.position.set(0.05, 0.75, 0.25);
      g.add(heart);
      update = (t) => {
        heart.position.y = 0.72 + 0.05 * Math.sin(t * 2 + seed);
        heart.scale.setScalar(1 + 0.12 * Math.max(0, Math.sin(t * 4 + seed)));
        crowd.forEach((p, i) => (p.position.y = Math.abs(Math.sin(t * 3 + i * 0.8)) * 0.04));
      };
      break;
    }
    case "cleaning": {
      // Someone mopping, a bucket, soap bubbles.
      g.add(mesh(box(0.9, 0.02, 0.7, 0.01), "#e8f4f8", 0, 0.01, 0));
      g.add(mesh(box(0.18, 0.18, 0.18, 0.05), C.sky, 0.3, 0.09, -0.2));
      const cleaner = person(kit, people[0], -0.05, 0.05);
      const mop = new THREE.Group();
      mop.add(mesh(box(0.025, 0.5, 0.025, 0.01), C.wood, 0, 0.25, 0), mesh(box(0.16, 0.04, 0.08, 0.02), C.teal, 0, 0.02, 0));
      mop.position.set(0.12, 0, 0.18);
      mop.rotation.x = 0.35;
      g.add(cleaner, mop);
      const bubbles = [0, 1, 2, 3].map(() => {
        const b = mesh(sphere, C.white, 0.3, 0.2, -0.2);
        b.castShadow = false;
        g.add(b);
        return b;
      });
      update = (t) => {
        const x = 0.15 * Math.sin(t * 2.2 + seed);
        mop.position.x = 0.12 + x;
        mop.rotation.z = -x;
        cleaner.position.x = -0.05 + x * 0.4;
        bubbles.forEach((b, i) => {
          const u = (t * 0.5 + i / 4 + seed) % 1;
          b.position.set(0.3 + 0.1 * Math.sin(u * 9 + i), 0.2 + u * 0.6, -0.2);
          b.scale.setScalar(0.03 + 0.03 * Math.sin(u * Math.PI));
        });
      };
      break;
    }
    case "shop": {
      g.add(mesh(box(0.7, 0.36, 0.06, 0.02), C.white, 0, 0.18, -0.35));
      for (let i = 0; i < 4; i++) g.add(mesh(box(0.175, 0.05, 0.22, 0.02), i % 2 ? C.white : C.teal, -0.26 + i * 0.175, 0.42, -0.26));
      g.add(mesh(box(0.7, 0.04, 0.16, 0.02), C.green, 0, 0.2, -0.28));
      const cart = new THREE.Group();
      cart.add(mesh(box(0.3, 0.16, 0.2, 0.03), C.teal, 0, 0.16, 0));
      cart.add(mesh(box(0.02, 0.18, 0.2, 0.01), C.dark, -0.17, 0.25, 0));
      for (const [x, z] of [[0.1, 0.08], [-0.1, 0.08], [0.1, -0.08], [-0.1, -0.08]]) cart.add(mesh(box(0.05, 0.05, 0.03, 0.02), C.dark, x, 0.03, z));
      const shopper = person(kit, people[0], -0.3, 0);
      face(shopper, 1, 0);
      const walk = new THREE.Group();
      walk.add(cart, shopper);
      walk.position.z = 0.25;
      g.add(walk);
      update = (t) => (walk.position.x = 0.15 * Math.sin(t * 0.8 + seed));
      break;
    }
    case "outing": {
      g.add(mesh(box(1.0, 0.03, 0.8, 0.015), C.grass, 0, 0.015, 0));
      const tree = new THREE.Group();
      tree.position.set(-0.3, 0, -0.2);
      tree.add(mesh(box(0.07, 0.3, 0.07, 0.02), C.wood, 0, 0.15, 0), mesh(box(0.36, 0.34, 0.36, 0.14), C.green, 0, 0.45, 0));
      g.add(tree);
      g.add(mesh(box(0.4, 0.04, 0.14, 0.02), C.wood, 0.2, 0.14, -0.15), mesh(box(0.4, 0.14, 0.03, 0.01), C.wood, 0.2, 0.22, -0.22));
      const walkers = people.slice(0, 3).map((c, i) => {
        const p = person(kit, c, 0, 0.2);
        g.add(p);
        return { p, i };
      });
      update = (t) => {
        tree.rotation.z = 0.04 * Math.sin(t * 1.4 + seed);
        walkers.forEach(({ p, i }) => {
          const a = t * 0.5 + seed + i * 0.5;
          p.position.set(Math.cos(a) * 0.32, Math.abs(Math.sin(t * 6 + i)) * 0.02, 0.12 + Math.sin(a) * 0.2);
          p.rotation.y = -a;
        });
      };
      break;
    }
    case "repair": {
      const box1 = mesh(box(0.34, 0.16, 0.18, 0.03), C.blue, 0.2, 0.08, 0.1);
      g.add(box1, mesh(box(0.2, 0.04, 0.03, 0.01), C.dark, 0.2, 0.18, 0.1));
      for (const x of [-0.42, -0.24]) g.add(mesh(box(0.03, 0.75, 0.03, 0.01), C.wood, x, 0.37, -0.2));
      for (let i = 0; i < 4; i++) g.add(mesh(box(0.2, 0.025, 0.025, 0.01), C.wood, -0.33, 0.12 + i * 0.17, -0.2));
      const wrench = mesh(box(0.04, 0.22, 0.03, 0.01), C.dark, 0, 0.3, 0.25);
      const worker = person(kit, people[0], -0.05, 0.2);
      g.add(worker, wrench);
      update = (t) => (wrench.rotation.z = 0.6 * Math.sin(t * 5 + seed));
      break;
    }
    default: {
      // Not recognised yet: a question mark (made of shapes, no text) by whoever goes.
      const q = new THREE.Group();
      const hook = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.055, 12, 32, Math.PI * 1.45), mat(people[0] === C.guest ? C.dark : people[0]));
      hook.rotation.z = -Math.PI * 0.45;
      hook.position.y = 0.72;
      hook.castShadow = true;
      q.add(hook, mesh(box(0.11, 0.17, 0.11, 0.05), people[0] === C.guest ? C.dark : people[0], 0, 0.45, 0));
      const dot = mesh(sphere, people[0] === C.guest ? C.dark : people[0], 0, 0.22, 0);
      dot.scale.setScalar(0.065);
      q.add(dot);
      g.add(q);
      people.slice(0, 2).forEach((c, i) => g.add(person(kit, c, -0.35 + i * 0.7, 0.2)));
      update = (t) => {
        q.position.y = 0.05 * Math.sin(t * 2 + seed);
        q.rotation.y = 0.6 * Math.sin(t * 0.8 + seed);
      };
    }
  }
  return { group: g, update };
}
