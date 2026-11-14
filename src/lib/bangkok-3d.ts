import * as THREE from "three";

// Bangkok in 3D, 1767 → 2026: a schematic city that grows with a timeline (landmarks, canals, roads,
// rails, Skytrain, motorways, towers), with a card per historical event. Geometry and scale are NOT real;
// dates are historical landmarks, populations are rough orders of magnitude. Ported from a standalone
// page: it draws into the DOM that `Bangkok3D` renders (elements marked with data-k).

type L = { en: string; fr: string };
const L = (en: string, fr: string): L => ({ en, fr });
type Pt = { x: number; z: number };

export type BangkokOptions = { lang: "en" | "fr" };

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const eob = (t: number) => {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const c1 = 1.4;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

const Y0 = 1767;
const Y1 = 2026;
const GOLD = 0xf0b73c;
const GOLDE = 0x4a3000;

type Landmark = { id: string; name: L; year: number; x: number; z: number; type: string; rot: number; pri: number; fr: number; keep: number };
type Ev = { y: number; t: L; x: L; lm?: string; at?: Pt; fr?: number };

// x = east, z = south (north is negative z). The Chao Phraya flows north → south.
const RX = (z: number) => -30 + 9 * Math.sin(z / 30) - 10 * Math.exp(-(z / 20) * (z / 20));
const CX = RX(0);
const B = (z: number, dx: number): Pt => ({ x: RX(z) + dx, z });
const E = (dx: number, z: number): Pt => ({ x: CX + dx, z });
const P = B(-6, 11); // Grand Palace

const LMS_DEF: Landmark[] = [
  { id: "thonfort", name: L("Wichaiprasit Fort", "Fort Wichaiprasit"), year: 1767, ...B(2, -10), type: "fort", rot: 0, pri: 3, fr: 22, keep: 3.5 },
  { id: "chaeng", name: L("Wat Chaeng", "Wat Chaeng"), year: 1767, ...B(11, -11), type: "temple", rot: 0, pri: 3, fr: 22, keep: 4.5 },
  { id: "palace", name: L("Grand Palace", "Grand Palais"), year: 1782, ...P, type: "palace", rot: 0, pri: 1, fr: 30, keep: 8 },
  { id: "yaowarat", name: L("Yaowarat", "Yaowarat"), year: 1782, ...B(23, 27), type: "label", rot: 0, pri: 2, fr: 34, keep: 0 },
  { id: "mahakan", name: L("Mahakan Fort", "Fort Mahakan"), year: 1783, ...B(-12, 14), type: "fort", rot: 0, pri: 3, fr: 20, keep: 3 },
  { id: "swing", name: L("Giant Swing", "Sao Ching Cha"), year: 1784, ...B(1, 15), type: "swing", rot: 0, pri: 3, fr: 18, keep: 2.6 },
  { id: "watpho", name: L("Wat Pho", "Wat Pho"), year: 1788, ...B(6, 10), type: "temple", rot: 0, pri: 2, fr: 26, keep: 5 },
  { id: "prang", name: L("Wat Arun", "Wat Arun"), year: 1851, ...B(7, -14), type: "prang", rot: 0, pri: 1, fr: 30, keep: 6 },
  { id: "vimanmek", name: L("Vimanmek", "Vimanmek"), year: 1901, x: P.x + 13, z: -36, type: "vimanmek", rot: 0.35, pri: 3, fr: 30, keep: 4.5 },
  { id: "throne", name: L("Ananta Samakhom", "Ananta Samakhom"), year: 1915, x: P.x + 25, z: -38, type: "throne", rot: -0.2, pri: 2, fr: 34, keep: 7.5 },
  { id: "station", name: L("Hua Lamphong", "Hua Lamphong"), year: 1916, ...B(12, 39), type: "station", rot: 0.25, pri: 2, fr: 32, keep: 6 },
  { id: "bridge", name: L("Memorial Bridge", "Pont Memorial"), year: 1932, x: RX(14), z: 14, type: "bridge", rot: 0, pri: 3, fr: 36, keep: 0 },
  { id: "monument", name: L("Democracy Monument", "Monument de la Démocratie"), year: 1940, x: P.x + 9, z: -16, type: "monument", rot: 0, pri: 2, fr: 26, keep: 3.5 },
  { id: "baiyoke", name: L("Baiyoke Tower II", "Baiyoke Tower II"), year: 1997, ...E(62, -6), type: "baiyoke", rot: 0, pri: 1, fr: 42, keep: 3.5 },
  { id: "bridge8", name: L("Rama VIII Bridge", "Pont Rama VIII"), year: 2002, x: RX(-34), z: -34, type: "bridge8", rot: 0, pri: 3, fr: 60, keep: 0 },
  { id: "airport", name: L("Suvarnabhumi", "Suvarnabhumi"), year: 2006, ...E(200, 40), type: "airport", rot: 0.05, pri: 1, fr: 95, keep: 17 },
  { id: "mahanakhon", name: L("MahaNakhon", "MahaNakhon"), year: 2016, ...E(31, 40), type: "mahanakhon", rot: 0, pri: 1, fr: 46, keep: 3.5 },
  { id: "iconsiam", name: L("ICONSIAM", "ICONSIAM"), year: 2018, x: RX(50) - 12, z: 50, type: "iconsiam", rot: 0, pri: 2, fr: 48, keep: 7 },
];

const EVENTS: Ev[] = [
  { y: 1767, t: L("Thonburi, a capital improvised", "Thonburi, capitale de fortune"), lm: "thonfort", x: L("After the fall of Ayutthaya, General Taksin sets up his capital at Thonburi, on the west bank of the Chao Phraya, around a fort and Wat Chaeng.", "Après la chute d'Ayutthaya, le général Taksin installe sa capitale à Thonburi, sur la rive ouest du Chao Phraya, autour d'un fort et du temple Wat Chaeng.") },
  { y: 1782, t: L("Rattanakosin: the east bank", "Rattanakosin : la rive est"), lm: "palace", x: L("Rama I crosses the river and founds the new capital. The Grand Palace rises and the Chinese community is moved to Sampheng, today's Yaowarat.", "Rama Iᵉʳ traverse le fleuve et fonde la nouvelle capitale. Le Grand Palais sort de terre et la communauté chinoise est déplacée vers Sampheng, l'actuel Yaowarat.") },
  { y: 1783, t: L("Moats, walls and forts", "Douves, murs et forts"), lm: "mahakan", x: L("The Khlong Rop Krung canal is dug to turn Rattanakosin into a fortified island. Mahakan Fort is part of the wall.", "On creuse le canal Khlong Rop Krung pour faire de Rattanakosin une île fortifiée. Le fort Mahakan fait partie de l'enceinte.") },
  { y: 1788, t: L("Wat Pho rebuilt", "Wat Pho reconstruit"), lm: "watpho", x: L("Rama I has Wat Pho rebuilt. It becomes a great centre of learning (traditional medicine, massage).", "Rama Iᵉʳ fait rebâtir le Wat Pho, qui deviendra un grand centre du savoir (médecine traditionnelle, massage).") },
  { y: 1851, t: L("The city spills over", "La ville déborde"), lm: "prang", x: L("Rama IV has the Phadung Krung Kasem canal dug: a second ring of moats that doubles the city's area. Wat Arun's prang takes its present shape.", "Rama IV fait creuser le canal Phadung Krung Kasem : un second cercle de douves qui double la surface de la ville. Le prang du Wat Arun prend sa silhouette actuelle.") },
  { y: 1861, t: L("Charoen Krung, the first modern road", "Charoen Krung, première route moderne"), at: B(30, 14), fr: 60, x: L("After the Bowring Treaty (1855), foreign merchants settle in. Rama IV opens the 'New Road', the first Western-style road.", "Après le traité Bowring (1855), les marchands étrangers s'installent. Rama IV fait ouvrir la « New Road », première route de type occidental.") },
  { y: 1893, t: L("Rails and trams", "Rails et tramways"), at: E(52, 40), fr: 85, x: L("First railway to Paknam and an electric tram: the city starts to stretch along the lines.", "Premier chemin de fer vers Paknam et tramway électrique : la ville commence à s'étirer le long des lignes.") },
  { y: 1901, t: L("Dusit, the royal quarter in European style", "Dusit, le quartier royal à l'européenne"), lm: "vimanmek", x: L("Rama V creates Ratchadamnoen Avenue and the Dusit district, with the teak palace of Vimanmek.", "Rama V crée l'avenue Ratchadamnoen et le district de Dusit, avec le palais de teck Vimanmek.") },
  { y: 1915, t: L("Ananta Samakhom Throne Hall", "Salle du Trône Ananta Samakhom"), lm: "throne", x: L("White marble and neo-Renaissance domes: the high point of royal Dusit, finished after works begun in 1908.", "Marbre blanc et dômes néo-Renaissance : le sommet du Dusit royal, achevé après des travaux commencés en 1908.") },
  { y: 1916, t: L("Hua Lamphong station", "Gare de Hua Lamphong"), lm: "station", x: L("The capital's great rail terminal opens in 1916 and remains a monument of the railway age.", "Le grand terminal ferroviaire de la capitale ouvre en 1916 et reste un monument de l'ère du rail.") },
  { y: 1932, t: L("Memorial Bridge, a constitutional monarchy", "Pont Memorial, monarchie constitutionnelle"), lm: "bridge", x: L("The Phra Phutthayotfa Bridge finally links the two banks for Bangkok's 150th birthday. The June revolution ends the absolute monarchy.", "Le pont Phra Phutthayotfa relie enfin les deux rives pour les 150 ans de Bangkok. La révolution de juin met fin à la monarchie absolue.") },
  { y: 1940, t: L("Democracy Monument", "Monument de la Démocratie"), lm: "monument", x: L("Built on Ratchadamnoen Avenue in 1939-1940, it celebrates the new constitution and sets the axis of the modern capital.", "Érigé sur l'avenue Ratchadamnoen en 1939-1940, il célèbre la nouvelle constitution et fixe l'axe de la capitale moderne.") },
  { y: 1960, t: L("The canals are filled in", "On comble les canaux"), at: E(40, 15), fr: 140, x: L("The 'Venice of the East' swaps its khlongs for roads: the car replaces the boat, and the population passes 2 million.", "La « Venise de l'Orient » remplace peu à peu ses khlongs par des routes : la voiture succède au bateau, et la population dépasse les 2 millions.") },
  { y: 1981, t: L("The first urban motorways", "Premières autoroutes urbaines"), at: E(36, 10), fr: 115, x: L("The first section of the Chaloem Maha Nakhon expressway opens: the city grows upwards and to the east.", "Ouverture du premier tronçon de l'autoroute Chaloem Maha Nakhon : la ville s'étire en hauteur et vers l'est.") },
  { y: 1997, t: L("Baiyoke II and the crisis", "Baiyoke II et la crise"), lm: "baiyoke", x: L("The 304 m tower is finished just as the Asian financial crisis breaks out in Bangkok in July 1997, freezing many building sites.", "La tour de 304 m est achevée au moment où la crise financière asiatique éclate à Bangkok, en juillet 1997, et fige de nombreux chantiers.") },
  { y: 1999, t: L("The Skytrain (BTS)", "Le Skytrain (BTS)"), at: E(63, 10), fr: 95, x: L("Two elevated lines open in December 1999 and redraw Sukhumvit and Silom.", "Deux lignes aériennes ouvrent en décembre 1999 et redessinent Sukhumvit et Silom.") },
  { y: 2002, t: L("Rama VIII Bridge", "Pont Rama VIII"), lm: "bridge8", x: L("A single-pylon cable-stayed bridge: a symbol of the contemporary river.", "Pont à haubans à pylône unique : un symbole du fleuve contemporain.") },
  { y: 2004, t: L("The MRT metro", "Le métro MRT"), at: E(55, 15), fr: 135, x: L("First underground line in July 2004, with a loop linking old quarters and new business hubs.", "Première ligne souterraine en juillet 2004, avec une boucle qui relie anciens quartiers et nouveaux pôles d'affaires.") },
  { y: 2006, t: L("Suvarnabhumi", "Suvarnabhumi"), lm: "airport", x: L("The new international airport, to the east, stretches the metropolis even further.", "Le nouvel aéroport international, à l'est, étire encore la métropole.") },
  { y: 2016, t: L("MahaNakhon", "MahaNakhon"), lm: "mahanakhon", x: L("The 'pixelated' Silom tower (314 m) becomes, on completion, the tallest skyscraper in Thailand.", "La tour « pixélisée » de Silom (314 m) devient, à son achèvement, le plus haut gratte-ciel de Thaïlande.") },
  { y: 2018, t: L("ICONSIAM", "ICONSIAM"), lm: "iconsiam", x: L("A mega shopping centre on the west bank: the river becomes a major axis again, more than 250 years after Taksin.", "Un méga-centre commercial sur la rive ouest : le fleuve redevient un axe majeur, plus de 250 ans après Taksin.") },
  { y: 2026, t: L("Today", "Aujourd'hui"), at: E(45, 20), fr: 235, x: L("A metropolis of more than 10 million people, born from a small fort on the river.", "Une métropole de plus de 10 millions d'habitants, née d'un petit fort au bord du fleuve.") },
];

const POP: [number, number][] = [[1767, 8000], [1782, 25000], [1822, 50000], [1855, 200000], [1910, 365000], [1937, 750000], [1960, 2000000], [1980, 4800000], [2000, 6300000], [2026, 10000000]];
const ERAS: [number, number, L][] = [
  [Y0, 1782, L("Thonburi", "Thonburi")],
  [1782, 1851, L("Rattanakosin", "Rattanakosin")],
  [1851, 1932, L("Opening up and royal modernisation", "Ouverture et modernisation royale")],
  [1932, 1980, L("Modern capital", "Capitale moderne")],
  [1980, 2100, L("Global metropolis", "Métropole mondiale")],
];

export function mountBangkok(root: HTMLElement, opts: BangkokOptions): () => void {
  const lang = opts.lang;
  const tr = (l: L) => (lang === "fr" ? l.fr : l.en);
  const el = <T extends HTMLElement = HTMLElement>(k: string) => root.querySelector(`[data-k="${k}"]`) as T;
  const canvas = el<HTMLCanvasElement>("canvas");
  const prevCM = THREE.ColorManagement.enabled;
  // The scene was tuned without colour management (colours as written, lights not physical).
  THREE.ColorManagement.enabled = false;

  // ---- PRNG
  let seed = 20261114;
  const rand = () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const R = (a: number, b: number) => a + (b - a) * rand();

  // ---- Renderer / scene
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const SKY = 0x14213a;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, 230, 720);
  const cam = new THREE.PerspectiveCamera(45, 1, 0.5, 1600);
  scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x3d3426, 0.95 * Math.PI));
  const sun = new THREE.DirectionalLight(0xffe2b0, 0.95 * Math.PI);
  sun.position.set(-70, 110, 50);
  scene.add(sun);

  const ground = new THREE.Mesh(new THREE.CircleGeometry(440, 72), new THREE.MeshLambertMaterial({ color: 0x3b5a43 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, 20);
  scene.add(ground);
  const grid = new THREE.GridHelper(880, 88, 0xffffff, 0xffffff);
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.05;
  grid.position.set(0, 0.02, 20);
  scene.add(grid);
  const gA = new THREE.Color(0x3d5f46);
  const gB = new THREE.Color(0x2e333b);

  // ---- Primitives
  const matCache: Record<string, THREE.MeshLambertMaterial> = {};
  const M = (c: number, em = 0) => matCache[`${c}_${em}`] ?? (matCache[`${c}_${em}`] = new THREE.MeshLambertMaterial({ color: c, emissive: em }));
  const addM = (g: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  const bx = (g: THREE.Object3D, w: number, h: number, d: number, c: number, x: number, y: number, z: number, em?: number) => addM(g, new THREE.BoxGeometry(w, h, d), M(c, em), x, y + h / 2, z);
  const cn = (g: THREE.Object3D, r: number, h: number, c: number, x: number, y: number, z: number, seg = 8, em?: number) => addM(g, new THREE.ConeGeometry(r, h, seg), M(c, em), x, y + h / 2, z);
  const cy = (g: THREE.Object3D, rt: number, rb: number, h: number, c: number, x: number, y: number, z: number, seg = 12, em?: number) => addM(g, new THREE.CylinderGeometry(rt, rb, h, seg), M(c, em), x, y + h / 2, z);

  const BUILD: Record<string, (g: THREE.Group) => number> = {
    palace(g) {
      bx(g, 10, 0.8, 6, 0xf4ead2, 0, 0, 0);
      bx(g, 8, 1.3, 3.6, 0xf8f3e4, 0, 0.8, 0);
      bx(g, 8.6, 0.25, 4.2, 0xc2502b, 0, 2.1, 0);
      bx(g, 6, 0.2, 2.6, 0xd05f32, 0, 2.35, 0);
      cn(g, 0.5, 3.0, GOLD, -3, 2.55, 0, 8, GOLDE);
      cn(g, 0.6, 4.0, GOLD, 0, 2.55, 0, 8, GOLDE);
      cn(g, 0.5, 3.0, GOLD, 3, 2.55, 0, 8, GOLDE);
      cy(g, 0.55, 0.8, 1.2, GOLD, 5.6, 0, 3.6, 10, GOLDE);
      cn(g, 0.55, 2.2, GOLD, 5.6, 1.2, 3.6, 10, GOLDE);
      return 6.6;
    },
    temple(g) {
      bx(g, 6, 0.6, 3.6, 0xefe3c8, 0, 0, 0);
      bx(g, 4.8, 1.0, 2.2, 0xf6eedc, 0, 0.6, 0);
      bx(g, 5.4, 0.2, 2.8, 0xb8452b, 0, 1.6, 0);
      cn(g, 0.4, 2.4, GOLD, -2.2, 1.7, 1.9, 8, GOLDE);
      cn(g, 0.4, 2.4, 0x6fa8d6, 0, 1.7, 1.9, 8);
      cn(g, 0.4, 2.4, GOLD, 2.2, 1.7, 1.9, 8, GOLDE);
      return 4.1;
    },
    prang(g) {
      bx(g, 7.5, 0.5, 7.5, 0xd8cdb2, 0, 0, 0);
      const pts = [[2.0, 0], [1.9, 0.9], [1.5, 2.0], [1.15, 3.4], [0.75, 5.2], [0.4, 6.8], [0.1, 8.4]].map((p) => new THREE.Vector2(p[0], p[1]));
      const lg = new THREE.LatheGeometry(pts, 8);
      addM(g, lg, M(0xeee6d2, 0x1a1710), 0, 0.5, 0);
      cn(g, 0.07, 1.4, GOLD, 0, 8.9, 0, 6, GOLDE);
      [[-2.7, -2.7], [2.7, -2.7], [-2.7, 2.7], [2.7, 2.7]].forEach((p) => {
        const m = addM(g, lg, M(0xe6dcc4, 0x1a1710), p[0], 0.5, p[1]);
        m.scale.set(0.34, 0.34, 0.34);
      });
      return 10.3;
    },
    fort(g) {
      cy(g, 1.1, 1.3, 1.4, 0xf2efe6, 0, 0, 0, 8);
      cn(g, 1.25, 0.8, 0xb04b2c, 0, 1.4, 0, 8);
      return 2.2;
    },
    swing(g) {
      bx(g, 3.4, 0.2, 1.2, 0x7d7466, 0, 0, 0);
      bx(g, 0.25, 4, 0.25, 0xb3261e, -1.1, 0.2, 0);
      bx(g, 0.25, 4, 0.25, 0xb3261e, 1.1, 0.2, 0);
      bx(g, 2.7, 0.2, 0.3, 0xb3261e, 0, 3.9, 0);
      bx(g, 2.7, 0.15, 0.25, 0xb3261e, 0, 3.1, 0);
      return 4.3;
    },
    vimanmek(g) {
      bx(g, 6, 1.6, 2.4, 0xe9c97a, 0, 0, 0);
      bx(g, 2.4, 1.6, 5, 0xe9c97a, -1.8, 0, 0);
      cn(g, 2.1, 1.1, 0x9a4a2c, 1.2, 1.6, 0, 4).rotation.y = Math.PI / 4;
      cn(g, 2.0, 1.1, 0x9a4a2c, -1.8, 1.6, 0, 4).rotation.y = Math.PI / 4;
      return 3.0;
    },
    throne(g) {
      bx(g, 12, 1.4, 4, 0xf6f3ea, 0, 0, 0);
      bx(g, 10, 1.0, 3.4, 0xfaf7ef, 0, 1.4, 0);
      cy(g, 1.8, 1.8, 0.6, 0xf6f3ea, 0, 2.4, 0, 16);
      addM(g, new THREE.SphereGeometry(1.7, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), M(0x9fb3a6), 0, 3.0, 0);
      [-5.2, -3.5, 3.5, 5.2].forEach((x) => addM(g, new THREE.SphereGeometry(0.8, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), M(0x9fb3a6), x, 2.4, 0));
      return 4.8;
    },
    station(g) {
      bx(g, 9, 1.4, 3, 0xdccfa8, 0, 0, 0);
      bx(g, 9.4, 0.3, 3.4, 0x8c3b2c, 0, 1.4, 0);
      bx(g, 1.3, 3.2, 1.3, 0xe6d9b4, 0, 1.7, 0);
      cn(g, 1.0, 0.9, 0x8c3b2c, 0, 4.9, 0, 4);
      return 5.8;
    },
    bridge(g) {
      bx(g, 16, 0.35, 1.4, 0x56636e, 0, 0.8, 0);
      bx(g, 0.5, 0.8, 1.0, 0x56636e, -3, 0, 0);
      bx(g, 0.5, 0.8, 1.0, 0x56636e, 3, 0, 0);
      const t = new THREE.TorusGeometry(3.2, 0.13, 6, 22, Math.PI);
      addM(g, t, M(0x6d8aa0), 0, 1.0, 0.6);
      addM(g, t, M(0x6d8aa0), 0, 1.0, -0.6);
      return 4.2;
    },
    monument(g) {
      cy(g, 2.2, 2.4, 0.4, 0xd9ccaa, 0, 0, 0, 24);
      cy(g, 0.35, 0.55, 4.2, GOLD, 0, 0.4, 0, 12, GOLDE);
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2;
        bx(g, 0.35, 3.0, 1.1, 0xd9b25a, Math.cos(a) * 1.3, 0.4, Math.sin(a) * 1.3, 0x2a1c00).rotation.y = -a;
      }
      return 4.8;
    },
    baiyoke(g) {
      bx(g, 2.2, 6.6, 2.2, 0xc9d3dc, 0, 0, 0);
      bx(g, 2.0, 2.6, 2.0, 0xe8453c, 0, 6.6, 0);
      bx(g, 1.8, 1.6, 1.8, 0xf4c542, 0, 9.2, 0);
      bx(g, 1.5, 1.3, 1.5, 0x3da35d, 0, 10.8, 0);
      cy(g, 0.07, 0.1, 3.4, 0xdddddd, 0, 12.1, 0, 6);
      return 15.5;
    },
    mahanakhon(g) {
      for (let i = 0; i < 10; i++) {
        const w = 2.0 - i * 0.05;
        const o = Math.sin(i * 1.1) * 0.22;
        bx(g, w, 1.35, w, 0xdff1f7, o, i * 1.35, Math.cos(i * 1.1) * 0.22, 0x1d3a46);
      }
      cn(g, 0.2, 1.2, 0xdff1f7, 0, 13.5, 0, 4);
      return 14.8;
    },
    iconsiam(g) {
      bx(g, 8, 1.8, 4.5, 0xd9c79a, 0, 0, 0);
      bx(g, 7, 0.2, 3.8, 0x9ed6e6, 0, 1.8, 0);
      bx(g, 1.6, 9, 1.6, 0xbfd4df, 5.4, 0, -1.3);
      bx(g, 1.6, 7.6, 1.6, 0xbfd4df, 5.4, 0, 1.3);
      return 9.2;
    },
    bridge8(g) {
      bx(g, 18, 0.3, 1.2, 0x5d6a75, 0, 0.8, 0);
      bx(g, 0.45, 7.8, 0.45, 0xe8eef3, -3.5, 0, 0);
      const pos: number[] = [];
      [-12, -9, -6, -1, 3, 6, 9].forEach((x) => pos.push(-3.5, 8.4, 0, x, 1.1, 0));
      const gg = new THREE.BufferGeometry();
      gg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.add(new THREE.LineSegments(gg, new THREE.LineBasicMaterial({ color: 0xdfe8ee })));
      return 8.6;
    },
    airport(g) {
      bx(g, 14, 1.2, 3.2, 0xdfe6ea, 0, 0, 0);
      bx(g, 14.4, 0.2, 3.6, 0x9fb3bf, 0, 1.2, 0);
      bx(g, 1.6, 0.8, 10, 0xdfe6ea, -4, 0, 0);
      bx(g, 1.6, 0.8, 10, 0xdfe6ea, 4, 0, 0);
      cy(g, 0.35, 0.5, 5, 0xcfd6db, 8, 0, 2.5, 8);
      bx(g, 46, 0.06, 1.1, 0x2a2f35, 0, 0, 12);
      bx(g, 46, 0.06, 1.1, 0x2a2f35, 0, 0, -12);
      return 5.2;
    },
    label: () => 0.5,
  };

  type Lm = Landmark & { group: THREE.Group; h: number; s: number; label: HTMLDivElement };
  const labelsEl = el("labels");
  const LMS: Lm[] = [];
  const LMB: Record<string, Lm> = {};
  const keep: { x: number; z: number; r: number }[] = [];
  LMS_DEF.forEach((d) => {
    const g = new THREE.Group();
    const h = BUILD[d.type](g);
    g.position.set(d.x, 0, d.z);
    g.rotation.y = d.rot;
    g.scale.set(1, 0.0001, 1);
    g.visible = false;
    scene.add(g);
    const label = document.createElement("div");
    label.className = "bk-lb";
    label.textContent = tr(d.name);
    labelsEl.appendChild(label);
    const lm: Lm = { ...d, group: g, h, s: 0, label };
    LMS.push(lm);
    LMB[d.id] = lm;
    if (d.keep > 0) keep.push({ x: d.x, z: d.z, r: d.keep });
  });

  // ---- Infrastructure (streets, canals, rails)
  type Fader = { year: number; root: THREE.Object3D; mats: { m: THREE.Material; op: number }[]; o: number };
  const faders: Fader[] = [];
  const densify = (pts: Pt[], y: number) => new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p.x, y, p.z)), false, "catmullrom", 0.5);
  const stripGeo = (curve: THREE.CatmullRomCurve3, n: number, width: number, y: number) => {
    const pts = curve.getPoints(n);
    const pos: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(pts.length - 1, i + 1)];
      let dx = b.x - a.x;
      let dz = b.z - a.z;
      const l = Math.hypot(dx, dz) || 1;
      dx /= l;
      dz /= l;
      const nx = -dz;
      const nz = dx;
      const h = width / 2;
      const p = pts[i];
      pos.push(p.x + nx * h, y, p.z + nz * h, p.x - nx * h, y, p.z - nz * h);
    }
    for (let i = 0; i < pts.length - 1; i++) {
      const k = i * 2;
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    return g;
  };
  const addStrip = (year: number, pts: Pt[], width: number, color: number, y: number, op = 1) => {
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
    const mesh = new THREE.Mesh(stripGeo(densify(pts, y), Math.max(12, pts.length * 8), width, y), m);
    mesh.renderOrder = 1;
    scene.add(mesh);
    faders.push({ year, root: mesh, mats: [{ m, op }], o: 0 });
  };
  const addElevated = (year: number, pts: Pt[], radius: number, color: number, y: number) => {
    const g = new THREE.Group();
    const tm = new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 0, emissive: color, emissiveIntensity: 0.25 });
    g.add(new THREE.Mesh(new THREE.TubeGeometry(densify(pts, y), Math.max(16, pts.length * 12), radius, 6, false), tm));
    const sm = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    g.add(new THREE.Mesh(stripGeo(densify(pts, 0.05), Math.max(16, pts.length * 8), radius * 3, 0.05), sm));
    scene.add(g);
    faders.push({ year, root: g, mats: [{ m: tm, op: 1 }, { m: sm, op: 0.28 }], o: 0 });
  };
  const arc = (ext: number, zh: number, steps: number): Pt[] => {
    const pts: Pt[] = [];
    for (let i = 0; i <= steps; i++) {
      const a = -Math.PI / 2 + (Math.PI * i) / steps;
      const z = zh * Math.sin(a);
      pts.push({ x: RX(z) + ext * Math.cos(a), z });
    }
    return pts;
  };
  const charoen: Pt[] = [];
  for (let zz = 0; zz <= 80; zz += 10) charoen.push({ x: RX(zz) + 14, z: zz });
  const ratcha: Pt[] = [{ x: P.x + 3, z: -10 }, { x: P.x + 9, z: -16 }, { x: P.x + 16, z: -24 }, { x: P.x + 21, z: -32 }, { x: P.x + 24, z: -37 }];
  const eastRoad: Pt[] = [E(48, 12), E(75, 14), E(100, 24), E(140, 36), E(195, 42)];
  const river: Pt[] = [];
  for (let z = -280; z <= 280; z += 10) river.push({ x: RX(z), z });
  addStrip(-1, river, 10, 0x3b86a8, 0.03);
  addStrip(1782, arc(19, 20, 22), 1.4, 0x4a9bbd, 0.06); // Khlong Rop Krung
  addStrip(1851, arc(36, 34, 28), 1.7, 0x4a9bbd, 0.06); // Phadung Krung Kasem
  addStrip(1861, charoen, 0.8, 0xe3d6b0, 0.08); // Charoen Krung
  addStrip(1899, ratcha, 1.6, 0xe9dfc2, 0.08); // Ratchadamnoen
  addStrip(1945, eastRoad, 1.3, 0xcfc7b3, 0.08);
  addStrip(1893, [B(12, 39), E(52, 40), E(58, 70), E(66, 100), E(80, 150)], 0.55, 0x6c7178, 0.09); // Paknam rail
  addStrip(1897, [B(12, 39), E(46, -10), E(50, -60), E(54, -120)], 0.55, 0x6c7178, 0.09); // northern rail
  addElevated(1981, [E(30, -90), E(34, -40), E(36, 0), E(40, 22), E(32, 46), E(38, 76), E(60, 110)], 0.38, 0xe58a3a, 1.5); // motorway
  addElevated(1981, [E(40, 22), E(80, 20), E(120, 26), E(160, 38)], 0.38, 0xe58a3a, 1.5);
  addElevated(1999, [E(62, -80), E(63, -40), E(63, 0), E(66, 14), E(90, 22), E(125, 32), E(160, 42)], 0.3, 0x7ee0c3, 2.6); // BTS Sukhumvit
  addElevated(1999, [E(63, 12), E(52, 22), E(40, 34), E(30, 42), B(46, 6)], 0.3, 0x7ee0c3, 2.6); // BTS Silom
  addStrip(2004, [E(46, 16), E(34, 40), E(52, 46), E(70, 30), E(72, 0), E(66, -40), E(52, -62), E(30, -60), E(20, -30)], 0.7, 0x5a8bff, 0.12, 0.9); // MRT

  const avoid: { pts: Pt[]; w: number }[] = [{ pts: charoen, w: 1.6 }, { pts: ratcha, w: 2 }, { pts: eastRoad, w: 1.8 }];
  const dSeg = (px: number, pz: number, a: Pt, b: Pt) => {
    const vx = b.x - a.x;
    const vz = b.z - a.z;
    const l2 = vx * vx + vz * vz;
    const t = l2 ? clamp(((px - a.x) * vx + (pz - a.z) * vz) / l2, 0, 1) : 0;
    return Math.hypot(px - (a.x + vx * t), pz - (a.z + vz * t));
  };
  const nearRoad = (x: number, z: number) => {
    for (const a of avoid) for (let j = 0; j < a.pts.length - 1; j++) if (dSeg(x, z, a.pts[j], a.pts[j + 1]) < a.w) return true;
    return false;
  };

  // ---- Buildings (instances)
  type Bd = { x: number; z: number; w: number; d: number; h: number; y: number; rot: number };
  const BS: Bd[] = [];
  const occ: Record<number, number> = {};
  const colStops: [number, THREE.Color][] = ([[1767, "#a4764a"], [1850, "#bc8d5d"], [1900, "#e6d6b0"], [1950, "#cbc4b6"], [1985, "#92a8b8"], [2005, "#6fc3da"], [2026, "#92e2f2"]] as [number, string][]).map((s) => [s[0], new THREE.Color(s[1])]);
  const colorFor = (y: number, out: THREE.Color) => {
    let i = 0;
    while (i < colStops.length - 2 && y > colStops[i + 1][0]) i++;
    const a = colStops[i];
    const b = colStops[i + 1];
    const t = clamp((y - a[0]) / (b[0] - a[0]), 0, 1);
    out.copy(a[1]).lerp(b[1], t);
    return out.multiplyScalar(R(0.88, 1.1));
  };
  const key = (ix: number, iz: number) => (ix + 700) * 2000 + (iz + 700);
  const tryPlace = (x: number, z: number, w: number, d: number) => {
    const x0 = Math.floor(x - w / 2 - 0.15);
    const x1 = Math.floor(x + w / 2 + 0.15);
    const z0 = Math.floor(z - d / 2 - 0.15);
    const z1 = Math.floor(z + d / 2 + 0.15);
    for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) if (occ[key(i, j)]) return false;
    for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) occ[key(i, j)] = 1;
    return true;
  };
  const blocked = (x: number, z: number) => {
    for (const k of keep) if (Math.hypot(x - k.x, z - k.z) < k.r + 0.9) return true;
    return nearRoad(x, z);
  };
  const rho = (dx: number, z: number, ext: number, zh: number) => Math.hypot(dx / ext, z / zh);
  const onMoat = (dx: number, z: number) => Math.abs(rho(dx, z, 19, 20) - 1) < 0.075 || Math.abs(rho(dx, z, 36, 34) - 1) < 0.045;
  const pushB = (x: number, z: number, w: number, d: number, h: number, year: number, rot = 0) => {
    if (blocked(x, z) || !tryPlace(x, z, w, d)) return false;
    BS.push({ x, z, w, d, h, y: year, rot });
    return true;
  };
  type BandOpts = { westYear?: [number, number]; westSkip?: number; hp?: number };
  const band = (inE: number, inZ: number, outE: number, outZ: number, n: number, y0: number, y1: number, h0: number, h1: number, w0: number, w1: number, o: BandOpts = {}) => {
    let c = 0;
    let guard = 0;
    const lo = inE ? (inE / outE + inZ / outZ) / 2 : 0;
    while (c < n && guard++ < n * 500) {
      const z = R(-outZ, outZ);
      const dx = R(-outE, outE);
      const ro = rho(dx, z, outE, outZ);
      if (ro > 1) continue;
      if (inE && rho(dx, z, inE, inZ) < 1) continue;
      if (Math.abs(dx) < 7.8) continue;
      if (onMoat(dx, z)) continue;
      const u = clamp((ro - lo) / (1 - lo), 0, 1);
      if (rand() > 1 - 0.5 * u) continue;
      if (dx < 0 && rand() < (o.westSkip ?? 0.3)) continue;
      let yr = lerp(y0, y1, clamp(u * 0.8 + R(-0.1, 0.25), 0, 1));
      if (dx < 0 && o.westYear) yr = lerp(o.westYear[0], o.westYear[1], clamp(u + R(-0.1, 0.2), 0, 1));
      const h = h0 + (h1 - h0) * Math.pow(rand(), o.hp ?? 1.8);
      const w = R(w0, w1);
      const d = R(w0, w1) * R(0.75, 1.25);
      if (pushB(RX(z) + dx, z, w, d, h, yr, rand() < 0.15 ? R(-0.3, 0.3) : 0)) c++;
    }
  };
  const cluster = (cx: number, cz: number, rx: number, rz: number, n: number, y0: number, y1: number, h0: number, h1: number, w0: number, w1: number) => {
    let c = 0;
    let guard = 0;
    while (c < n && guard++ < n * 500) {
      const a = R(0, Math.PI * 2);
      const r = Math.sqrt(rand());
      const x = cx + Math.cos(a) * r * rx;
      const z = cz + Math.sin(a) * r * rz;
      if (Math.abs(x - RX(z)) < 8) continue;
      const h = h0 + (h1 - h0) * Math.pow(1 - r, 1.1) * (0.45 + 0.55 * rand());
      if (pushB(x, z, R(w0, w1), R(w0, w1), h, lerp(y0, y1, Math.pow(rand(), 0.9)), 0)) c++;
    }
  };
  const corridor = (a: Pt, b: Pt, wid: number, n: number, y0: number, y1: number, h0: number, h1: number, w0: number, w1: number) => {
    let c = 0;
    let guard = 0;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const l = Math.hypot(dx, dz);
    const nx = -dz / l;
    const nz = dx / l;
    while (c < n && guard++ < n * 500) {
      const s = rand();
      const lat = R(-wid, wid);
      const x = a.x + dx * s + nx * lat;
      const z = a.z + dz * s + nz * lat;
      if (Math.abs(x - RX(z)) < 8) continue;
      const h = h0 + (h1 - h0) * (1 - s * 0.75) * Math.pow(rand(), 1.4);
      if (pushB(x, z, R(w0, w1), R(w0, w1), h, lerp(y0, y1, clamp(s * 0.8 + rand() * 0.3, 0, 1)), 0)) c++;
    }
  };
  // business districts first, then growth rings
  cluster(E(30, 40).x, 40, 13, 13, 70, 1975, 2016, 2.5, 10.5, 1.3, 2.0); // Silom / Sathorn
  cluster(E(56, 6).x, 8, 14, 12, 80, 1975, 2012, 2.0, 8, 1.3, 2.0); // Siam / Ratchaprasong / Pratunam
  cluster(E(52, -72).x, -72, 16, 14, 55, 1990, 2016, 1.6, 6, 1.3, 2.0); // Chatuchak / Ratchada
  corridor(E(68, 14), E(168, 42), 7, 230, 1975, 2012, 1.2, 6.5, 1.1, 1.9); // Sukhumvit eastwards
  band(0, 0, 19, 20, 320, 1782, 1840, 0.28, 0.75, 0.8, 1.5, { westYear: [1767, 1805], westSkip: 0.2, hp: 2.2 });
  band(19, 20, 36, 34, 380, 1851, 1905, 0.3, 0.95, 0.9, 1.6, { hp: 2 });
  band(36, 34, 70, 64, 640, 1900, 1960, 0.4, 1.5, 1.0, 1.8, { hp: 1.9 });
  band(70, 64, 135, 120, 1000, 1955, 2005, 0.5, 2.1, 1.0, 1.9, { hp: 1.9 });
  band(135, 120, 195, 172, 560, 1985, 2022, 0.4, 1.7, 1.0, 2.0, { hp: 1.8 });

  const NB = BS.length;
  const geoB = new THREE.BoxGeometry(1, 1, 1);
  geoB.translate(0, 0.5, 0);
  const inst = new THREE.InstancedMesh(geoB, new THREE.MeshLambertMaterial({ color: 0xffffff }), NB);
  inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  inst.frustumCulled = false;
  const dummy = new THREE.Object3D();
  const tc = new THREE.Color();
  const SB = new Float32Array(NB);
  BS.forEach((b, i) => {
    inst.setColorAt(i, colorFor(b.y, tc));
    dummy.position.set(b.x, 0, b.z);
    dummy.rotation.set(0, b.rot, 0);
    dummy.scale.set(0.0001, 0.0001, 0.0001);
    dummy.updateMatrix();
    inst.setMatrixAt(i, dummy.matrix);
  });
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  inst.instanceMatrix.needsUpdate = true;
  scene.add(inst);
  const yearsSorted = BS.map((b) => b.y).sort((a, b) => a - b);
  const countUpTo = (y: number) => {
    let lo = 0;
    let hi = yearsSorted.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (yearsSorted[m] <= y) lo = m + 1;
      else hi = m;
    }
    return lo;
  };

  // ---- Boats on the river
  const boats: { g: THREE.Group; z: number; v: number; off: number }[] = [];
  for (let i = 0; i < 16; i++) {
    const g = new THREE.Group();
    const long = i % 3 === 0;
    bx(g, long ? 1.6 : 1.0, 0.22, 0.38, long ? 0x7b5430 : 0xf0f0f0, 0, 0, 0);
    if (!long) bx(g, 0.5, 0.25, 0.3, 0x4a90b8, 0, 0.22, 0);
    scene.add(g);
    boats.push({ g, z: R(-200, 200), v: (rand() < 0.5 ? -1 : 1) * R(2, 5), off: R(-3, 3) });
  }

  // ---- Pulses marking events
  const pulses: { m: THREE.Mesh; t: number }[] = [];
  const pulse = (x: number, z: number) => {
    const m = new THREE.Mesh(new THREE.RingGeometry(1, 1.3, 48), new THREE.MeshBasicMaterial({ color: 0xf2c14e, transparent: true, opacity: 1, side: THREE.DoubleSide, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.25, z);
    m.renderOrder = 3;
    scene.add(m);
    pulses.push({ m, t: 0 });
  };

  // ---- Events: where the camera goes
  const EVP = EVENTS.map((e) => {
    if (e.lm) {
      const l = LMB[e.lm];
      return { ...e, px: l.x, pz: l.z, fr: l.fr };
    }
    return { ...e, px: e.at!.x, pz: e.at!.z, fr: e.fr! };
  });

  const popAt = (y: number) => {
    let i = 0;
    while (i < POP.length - 2 && y > POP[i + 1][0]) i++;
    const a = POP[i];
    const b = POP[i + 1];
    const t = clamp((y - a[0]) / (b[0] - a[0]), 0, 1);
    return Math.exp(lerp(Math.log(a[1]), Math.log(b[1]), t));
  };
  const nf = lang === "fr" ? "fr-FR" : "en-GB";
  const fmtPop = (p: number) => {
    if (p >= 1e6) return `~ ${(p / 1e6).toLocaleString(nf, { maximumFractionDigits: 1, minimumFractionDigits: 1 })} M`;
    const r = p < 1e5 ? 5000 : p < 1e6 ? 10000 : 50000;
    return `~ ${Math.max(r, Math.round(p / r) * r).toLocaleString(nf)}`;
  };
  const eraOf = (y: number) => {
    for (const e of ERAS) if (y < e[1]) return tr(e[2]);
    return tr(ERAS[ERAS.length - 1][2]);
  };

  // ---- Camera
  const AK = [[1767, 38, -34, 0], [1782, 48, -32, -2], [1851, 70, -28, 4], [1900, 105, -22, 6], [1950, 150, -15, 10], [1990, 200, -5, 14], [2026, 235, 5, 18]];
  const autoAt = (y: number) => {
    let i = 0;
    while (i < AK.length - 2 && y > AK[i + 1][0]) i++;
    const a = AK[i];
    const b = AK[i + 1];
    const t = smooth(a[0], b[0], y);
    return { r: lerp(a[1], b[1], t), x: lerp(a[2], b[2], t), z: lerp(a[3], b[3], t) };
  };
  const cur = { x: -34, z: 0, r: 40, th: 0.55, ph: 0.95 };
  const goal = { x: -34, z: 0, r: 40, th: 0.55, ph: 0.95 };
  let autoCam = true;
  let focusId: string | null = null;
  const bAuto = el("bAuto");
  const bLabels = el("bLabels");
  const hint = el("hint");
  const setAuto = (v: boolean) => {
    autoCam = v;
    bAuto.classList.toggle("on", v);
    if (v) focusId = null;
  };

  type Ptr = { x: number; y: number; btn: number; shift: boolean };
  const ptrs = new Map<number, Ptr>();
  let lastPinch = 0;
  let lastMid: { x: number; y: number } | null = null;
  const pan = (dx: number, dy: number) => {
    const k = goal.r * 0.0016;
    const s = Math.sin(cur.th);
    const c = Math.cos(cur.th);
    goal.x += -dx * k * c + dy * k * -s;
    goal.z += -dx * k * -s + dy * k * -c;
    setAuto(false);
  };
  const touched = () => {
    hint.style.opacity = "0";
  };
  const onDown = (e: PointerEvent) => {
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {}
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, btn: e.button, shift: e.shiftKey });
    if (ptrs.size === 2) {
      const v = [...ptrs.values()];
      lastPinch = Math.hypot(v[0].x - v[1].x, v[0].y - v[1].y);
      lastMid = { x: (v[0].x + v[1].x) / 2, y: (v[0].y + v[1].y) / 2 };
    }
    touched();
  };
  const onMove = (e: PointerEvent) => {
    const p = ptrs.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    if (ptrs.size === 1) {
      if (p.btn === 2 || p.shift) pan(dx, dy);
      else {
        goal.th -= dx * 0.006;
        goal.ph = clamp(goal.ph - dy * 0.005, 0.12, 1.48);
      }
      p.x = e.clientX;
      p.y = e.clientY;
    } else if (ptrs.size === 2) {
      p.x = e.clientX;
      p.y = e.clientY;
      const v = [...ptrs.values()];
      const d = Math.hypot(v[0].x - v[1].x, v[0].y - v[1].y);
      const mid = { x: (v[0].x + v[1].x) / 2, y: (v[0].y + v[1].y) / 2 };
      if (lastPinch > 0 && d > 0) {
        goal.r = clamp((goal.r * lastPinch) / d, 12, 430);
        setAuto(false);
      }
      if (lastMid) pan(mid.x - lastMid.x, mid.y - lastMid.y);
      lastPinch = d;
      lastMid = mid;
    }
  };
  const onUp = (e: PointerEvent) => {
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) {
      lastPinch = 0;
      lastMid = null;
    }
  };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    goal.r = clamp(goal.r * Math.exp(e.deltaY * 0.0012), 12, 430);
    setAuto(false);
    touched();
  };
  const onCtx = (e: Event) => e.preventDefault();
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("contextmenu", onCtx);

  const focusOn = (x: number, z: number, r: number, id: string | null) => {
    setAuto(false);
    focusId = id;
    goal.x = x;
    goal.z = z;
    goal.r = r;
    goal.ph = Math.min(goal.ph, 1.0);
  };

  // ---- State / UI
  let year = Y0;
  let playing = true;
  let speedIdx = 0;
  const SPEEDS = [1, 2, 4];
  const BASE = 6.2;
  let finished = false;
  let showLabels = true;
  const slider = el<HTMLInputElement>("slider");
  const playBtn = el("play");
  const ticks: HTMLElement[] = [];
  const ticksEl = el("ticks");
  EVENTS.forEach((e) => {
    const d = document.createElement("i");
    d.style.left = `${((e.y - Y0) / (Y1 - Y0)) * 100}%`;
    ticksEl.appendChild(d);
    ticks.push(d);
  });

  let evIdx = -1;
  const showEvent = (i: number, doPulse: boolean) => {
    evIdx = i;
    const e = EVP[i];
    el("cy").textContent = String(e.y);
    el("ctitle").textContent = tr(e.t);
    el("ctext").textContent = tr(e.x);
    if (doPulse) pulse(e.px, e.pz);
  };
  const evFor = (y: number) => {
    let k = 0;
    for (let i = 0; i < EVENTS.length; i++) if (EVENTS[i].y <= Math.floor(y)) k = i;
    return k;
  };
  const setYear = (y: number) => {
    year = clamp(y, Y0, Y1);
    slider.value = String(year);
  };
  const goEvent = (i: number) => {
    i = clamp(i, 0, EVENTS.length - 1);
    const e = EVP[i];
    playing = false;
    finished = false;
    playBtn.textContent = "▶";
    setYear(e.y);
    showEvent(i, true);
    focusOn(e.px, e.pz, e.fr, e.lm ?? null);
  };
  const onPrev = () => {
    const k = evFor(year);
    goEvent(year > EVENTS[k].y + 1 ? k : k - 1);
    touched();
  };
  const onNext = () => {
    goEvent(evFor(year) + 1);
    touched();
  };
  const onPlay = () => {
    touched();
    if (finished || year >= Y1 - 0.05) {
      setYear(Y0);
      finished = false;
      setAuto(true);
    }
    playing = !playing;
    playBtn.textContent = playing ? "❚❚" : "▶";
  };
  const speedBtn = el("speed");
  const onSpeed = () => {
    speedIdx = (speedIdx + 1) % SPEEDS.length;
    speedBtn.textContent = `${SPEEDS[speedIdx]}×`;
  };
  const onSlider = () => {
    playing = false;
    finished = false;
    playBtn.textContent = "▶";
    year = parseFloat(slider.value);
    touched();
  };
  const onLabels = () => {
    showLabels = !showLabels;
    bLabels.classList.toggle("on", showLabels);
  };
  const onAuto = () => {
    setAuto(!autoCam);
    if (autoCam) goal.ph = 0.95;
  };
  el("prev").addEventListener("click", onPrev);
  el("next").addEventListener("click", onNext);
  playBtn.addEventListener("click", onPlay);
  speedBtn.addEventListener("click", onSpeed);
  slider.addEventListener("input", onSlider);
  bLabels.addEventListener("click", onLabels);
  bAuto.addEventListener("click", onAuto);

  // ---- Loop
  let last = performance.now();
  let W = 1;
  let H = 1;
  const shown = { y: -1, bld: -1, era: "" };
  const v3 = new THREE.Vector3();
  const resize = () => {
    W = root.clientWidth || window.innerWidth;
    H = root.clientHeight || window.innerHeight;
    renderer.setSize(W, H, false);
    cam.aspect = W / H;
    cam.fov = W / H < 0.8 ? 58 : 45;
    cam.updateProjectionMatrix();
  };
  window.addEventListener("resize", resize);
  resize();

  let raf = 0;
  let disposed = false;
  const popEl = el("pop");
  const bldEl = el("bld");
  const yearEl = el("year");
  const eraEl = el("era");
  const frame = (now: number) => {
    if (disposed) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (playing) {
      year += dt * BASE * SPEEDS[speedIdx];
      if (year >= Y1) {
        year = Y1;
        playing = false;
        finished = true;
        playBtn.textContent = "↻";
      }
      slider.value = String(year);
    }
    const iy = Math.floor(year);
    const k = evFor(year);
    if (k !== evIdx) showEvent(k, playing);
    if (shown.y !== iy) {
      shown.y = iy;
      yearEl.textContent = String(iy);
      const er = eraOf(iy);
      if (er !== shown.era) {
        shown.era = er;
        eraEl.textContent = er;
      }
      popEl.textContent = fmtPop(popAt(year));
      ticks.forEach((t, i) => t.classList.toggle("past", EVENTS[i].y <= iy));
      (ground.material as THREE.MeshLambertMaterial).color.copy(gA).lerp(gB, smooth(1790, 2000, year));
    }
    slider.style.setProperty("--p", `${((year - Y0) / (Y1 - Y0)) * 100}%`);

    const a = 1 - Math.exp(-dt * 5);
    let dirty = false;
    for (let i = 0; i < NB; i++) {
      const b = BS[i];
      const tg = year >= b.y ? 1 : 0;
      let s = SB[i];
      if (s !== tg) {
        s += (tg - s) * a;
        if (Math.abs(tg - s) < 0.004) s = tg;
        SB[i] = s;
        dummy.position.set(b.x, 0, b.z);
        dummy.rotation.set(0, b.rot, 0);
        const e1 = Math.max(0.0001, eob(s));
        const e2 = Math.max(0.0001, Math.min(1, e1 * 4));
        dummy.scale.set(b.w * e2, b.h * e1, b.d * e2);
        dummy.updateMatrix();
        inst.setMatrixAt(i, dummy.matrix);
        dirty = true;
      }
    }
    if (dirty) inst.instanceMatrix.needsUpdate = true;
    let nb = countUpTo(year);
    for (const l of LMS) {
      const t2 = year >= l.year ? 1 : 0;
      if (l.s !== t2) {
        l.s += (t2 - l.s) * a;
        if (Math.abs(t2 - l.s) < 0.004) l.s = t2;
      }
      l.group.scale.set(1, Math.max(0.0001, eob(l.s)), 1);
      l.group.visible = l.s > 0.01;
      if (t2) nb++;
    }
    if (shown.bld !== nb) {
      shown.bld = nb;
      bldEl.textContent = nb.toLocaleString(nf);
    }
    for (const fd of faders) {
      const tg2 = year >= fd.year ? 1 : 0;
      fd.o += (tg2 - fd.o) * a;
      if (Math.abs(tg2 - fd.o) < 0.004) fd.o = tg2;
      for (const q of fd.mats) q.m.opacity = fd.o * q.op;
      fd.root.visible = fd.o > 0.01;
    }
    for (const bt of boats) {
      bt.z += bt.v * dt;
      if (bt.z > 240) bt.z = -240;
      if (bt.z < -240) bt.z = 240;
      const sg = bt.v > 0 ? 1 : -1;
      const dxr = RX(bt.z + 1) - RX(bt.z);
      bt.g.position.set(RX(bt.z) + bt.off, 0.1, bt.z);
      bt.g.rotation.y = Math.atan2(-sg, sg * dxr);
    }
    for (let pi = pulses.length - 1; pi >= 0; pi--) {
      const pu = pulses[pi];
      pu.t += dt / 1.8;
      if (pu.t >= 1) {
        scene.remove(pu.m);
        pu.m.geometry.dispose();
        (pu.m.material as THREE.Material).dispose();
        pulses.splice(pi, 1);
        continue;
      }
      const sz = 1 + pu.t * 7 * Math.max(0.8, cur.r / 60);
      pu.m.scale.set(sz, sz, sz);
      (pu.m.material as THREE.MeshBasicMaterial).opacity = 1 - pu.t;
    }
    if (autoCam) {
      const au = autoAt(year);
      goal.x = au.x;
      goal.z = au.z;
      goal.r = au.r;
      if (playing && ptrs.size === 0) goal.th += dt * 0.04;
    }
    const ca = 1 - Math.exp(-dt * 4);
    cur.x += (goal.x - cur.x) * ca;
    cur.z += (goal.z - cur.z) * ca;
    cur.r += (goal.r - cur.r) * ca;
    cur.th += (goal.th - cur.th) * Math.min(1, ca * 1.6);
    cur.ph += (goal.ph - cur.ph) * ca;
    const sp = Math.sin(cur.ph);
    cam.position.set(cur.x + cur.r * sp * Math.sin(cur.th), cur.r * Math.cos(cur.ph), cur.z + cur.r * sp * Math.cos(cur.th));
    cam.lookAt(cur.x, 0, cur.z);
    cam.updateMatrixWorld();

    const lvl = cur.r > 135 ? 1 : cur.r > 75 ? 2 : 3;
    for (const lm of LMS) {
      let vis = showLabels && lm.s > 0.6 && (lm.pri <= lvl || focusId === lm.id);
      if (vis) {
        v3.set(lm.x, lm.h * eob(lm.s) + 0.8, lm.z).project(cam);
        if (v3.z > 1 || v3.z < -1 || Math.abs(v3.x) > 1.1 || Math.abs(v3.y) > 1.1) vis = false;
        else lm.label.style.transform = `translate(${((v3.x * 0.5 + 0.5) * W).toFixed(1)}px,${((-v3.y * 0.5 + 0.5) * H).toFixed(1)}px) translate(-50%,-110%)`;
      }
      lm.label.style.opacity = vis ? "1" : "0";
    }
    renderer.render(scene, cam);
    raf = requestAnimationFrame(frame);
  };
  showEvent(0, false);
  playBtn.textContent = "❚❚";
  const hintTimer = window.setTimeout(() => {
    hint.style.opacity = "0";
  }, 6500);
  raf = requestAnimationFrame((t) => {
    last = t;
    frame(t);
  });

  return () => {
    disposed = true;
    cancelAnimationFrame(raf);
    window.clearTimeout(hintTimer);
    window.removeEventListener("resize", resize);
    canvas.removeEventListener("pointerdown", onDown);
    canvas.removeEventListener("pointermove", onMove);
    canvas.removeEventListener("pointerup", onUp);
    canvas.removeEventListener("pointercancel", onUp);
    canvas.removeEventListener("wheel", onWheel);
    canvas.removeEventListener("contextmenu", onCtx);
    el("prev").removeEventListener("click", onPrev);
    el("next").removeEventListener("click", onNext);
    playBtn.removeEventListener("click", onPlay);
    speedBtn.removeEventListener("click", onSpeed);
    slider.removeEventListener("input", onSlider);
    bLabels.removeEventListener("click", onLabels);
    bAuto.removeEventListener("click", onAuto);
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
    });
    Object.values(matCache).forEach((m) => m.dispose());
    labelsEl.replaceChildren();
    ticksEl.replaceChildren();
    renderer.dispose();
    renderer.forceContextLoss();
    THREE.ColorManagement.enabled = prevCM;
  };
}
