// The little scenes standing on each day of the 3D week (`week-scene.ts`): one
// per activity, guessed from its title in English, French or Swedish — a
// dinner is a table with its people around it, swimming a pool, padel a court…
// Each fits in about 1.1 × 1.1 units around its origin, stands on y = 0, and
// moves a little on its own (`update(time)`).
import * as THREE from "three";

export type ActKind = "meal" | "swim" | "racket" | "sport" | "health" | "party" | "travel" | "show" | "meeting" | "shop" | "outing" | "repair" | "other";

// First match wins, so the order matters ("courses" is shopping before "course" is running).
const KINDS: [ActKind, RegExp][] = [
  ["meal", /(d[iî]n(er|ner)|after-?work|drinks|\bbar\b|lunch|d[ée]jeuner|d[ée]j\b|brunch|breakfast|petit[- ]?d[ée]j|frukost|middag|resto|restaurant|fika|caf[ée]|coffee|ap[ée]ro|bbq|barbecue|grill|pizza|souper|go[uû]ter)/i],
  ["swim", /(swim|nag(e|eur|euse)|natation|piscine|pool|sim(ning|skola|hall)|badhus)/i],
  ["racket", /(padel|tennis|badminton|squash|ping[- ]?pong)/i],
  ["shop", /(courses|shopping|handla|ikea|march[ée]|market|achats?\b|soldes)/i],
  ["sport", /(gym|yoga|\brun|jogg|course [àa] pied|foot|fotboll|sport|tr[äa]ning|workout|pilates|v[ée]lo|cykel|\bski|match|crossfit|boxe|danse|dance|klättr|escalade|climb)/i],
  ["health", /(m[ée]decin|docteur|doctor|dentist|tandl[äa]kare|l[äa]kare|bvc|vaccin|kin[ée]|physio|ost[ée]o|hospital|h[ôo]pital|sjukhus|v[åa]rdcentral|p[ée]diatr|pharma|apotek|opticien|optiker|check-?up)/i],
  ["party", /(anniv|birthday|f[öo]delsedag|kalas|party|f[êe]te|soir[ée]e|mariage|wedding|br[öo]llop|bapt[êe]me|celebrat|jubil)/i],
  ["travel", /(flight|\bvol\b|avion|flyg|train\b|t[åa]g\b|airport|a[ée]roport|voyage|trip\b|\bresa\b|vacances|semester|holiday)/i],
  ["show", /(cin[ée]|movie|film|\bbio\b|th[ée][âa]tre|theater|teater|concert|konsert|spectacle|op[ée]ra|show)/i],
  ["meeting", /(r[ée]union|meeting|m[öo]te|\bcall\b|entretien|interview|conf[ée]rence|\bwork\b|travail|jobb|bureau|office|[ée]cole|school|skola|parents|utvecklingssamtal)/i],
  ["outing", /(zoo|parc|park|mus[ée]e|museum|picnic|pique|plage|beach|strand|balade|promenade|walk\b|sortie|lekplats|playground|aquarium|ferme|skansen|utflykt)/i],
  ["repair", /(plomb|plumber|r[öo]rmokare|[ée]lectric|repair|r[ée]par|artisan|hantverk|install|livraison|delivery|d[ée]m[ée]nag|moving|m[ée]nage|cleaning|st[äa]d|garage|pneu|d[äa]ck|bilprovning)/i],
];

export function actKind(title: string, badge?: string): ActKind {
  if (badge) return "party"; // our anniversary, a family birthday
  return KINDS.find(([, re]) => re.test(title))?.[0] ?? "other";
}

export type Kit = {
  box: (w: number, h: number, d: number, r?: number) => THREE.BufferGeometry;
  sphere: THREE.BufferGeometry;
  mesh: (g: THREE.BufferGeometry, color: string, x?: number, y?: number, z?: number, emissive?: string) => THREE.Mesh;
};
export type Vignette = { group: THREE.Group; update: (time: number) => void };

const C = {
  white: "#ffffff",
  wood: "#c79a6b",
  blue: "#2c55d4",
  sky: "#5b9cf5",
  teal: "#14a3a0",
  green: "#36a96b",
  grass: "#7cc98f",
  orange: "#ff7a1a",
  dark: "#2a3140",
  glass: "#dfeaff",
  guest: "#c9ced8",
  ball: "#e9ef5a",
};

// A seated or standing person in someone's colour.
function person(kit: Kit, color: string, x: number, z: number, seated = false) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const h = seated ? 0.24 : 0.32;
  g.add(kit.mesh(kit.box(0.2, h, 0.16, 0.07), color, 0, h / 2 + (seated ? 0.12 : 0), 0));
  const head = kit.mesh(kit.sphere, "#f3dcc6", 0, h + 0.1 + (seated ? 0.12 : 0), 0);
  head.scale.setScalar(0.09);
  g.add(head);
  if (seated) g.add(kit.mesh(kit.box(0.2, 0.12, 0.2, 0.04), C.wood, 0, 0.06, 0));
  return g;
}

const face = (g: THREE.Object3D, x: number, z: number) => (g.rotation.y = Math.atan2(x - g.position.x, z - g.position.z));

export function buildVignette(kit: Kit, kind: ActKind, colors: string[], seed: number): Vignette {
  const g = new THREE.Group();
  const { box, sphere, mesh } = kit;
  const people = colors.length ? colors : [C.guest];
  let update: (t: number) => void = () => {};

  switch (kind) {
    case "meal": {
      // A table, plates, and everyone around it (at least two: a meal is shared).
      g.add(mesh(box(0.72, 0.06, 0.48, 0.03), C.wood, 0, 0.36, 0));
      g.add(mesh(box(0.08, 0.33, 0.08, 0.02), C.wood, 0, 0.17, 0));
      const diners = people.length < 2 ? [...people, C.guest] : people.slice(0, 4);
      const seats = [[-0.2, 0.4], [0.2, -0.4], [0.2, 0.4], [-0.2, -0.4]];
      const sitters = diners.map((c, i) => {
        const p = person(kit, c, seats[i][0], seats[i][1], true);
        face(p, seats[i][0], 0);
        g.add(p);
        g.add(mesh(box(0.15, 0.02, 0.15, 0.01), C.white, seats[i][0], 0.4, seats[i][1] * 0.45));
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
    case "meeting": {
      g.add(mesh(box(0.7, 0.05, 0.42, 0.02), C.white, 0, 0.32, 0));
      for (const x of [-0.3, 0.3]) g.add(mesh(box(0.05, 0.3, 0.36, 0.02), C.white, x, 0.15, 0));
      g.add(mesh(box(0.28, 0.02, 0.18, 0.01), C.dark, 0, 0.355, 0.05));
      const screen = mesh(box(0.28, 0.18, 0.02, 0.01), C.dark, 0, 0.45, -0.04, C.sky);
      g.add(screen);
      const talkers = people.slice(0, 3).map((c, i) => {
        const x = -0.22 + i * 0.22;
        const p = person(kit, c, x, 0.42, true);
        face(p, x, 0);
        g.add(p);
        return p;
      });
      update = (t) => talkers.forEach((p, i) => (p.rotation.z = 0.06 * Math.sin(t * 2.5 + i * 1.3 + seed)));
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
      // A map pin in the colour of whoever goes, with them standing by it.
      const pin = new THREE.Group();
      const head = mesh(sphere, people[0], 0, 0.62, 0);
      head.scale.setScalar(0.17);
      const dot = mesh(sphere, C.white, 0, 0.62, 0.15);
      dot.scale.setScalar(0.06);
      pin.add(head, dot, mesh(box(0.05, 0.4, 0.05, 0.02), C.dark, 0, 0.25, 0));
      g.add(pin);
      people.slice(0, 2).forEach((c, i) => g.add(person(kit, c, -0.3 + i * 0.6, 0.25)));
      update = (t) => {
        pin.position.y = 0.05 * Math.sin(t * 2 + seed);
        pin.rotation.y = 0.5 * Math.sin(t * 0.8 + seed);
      };
    }
  }
  return { group: g, update };
}
