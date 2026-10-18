// Builds src/lib/world-globe.json (country outlines for the Travels globe, in an
// equirectangular 1000×500 plane that is painted onto the sphere as a texture).
// Run from a scratch folder with
//   npm i world-atlas topojson-client d3-geo i18n-iso-countries
// then `node path/to/gen-world-globe.mjs`. Shapes: Natural Earth 1:110m; small
// countries missing there (Monaco, Malta, Hong Kong…) become dots, from 1:50m.
// `centers` = [lon, lat] of each country's main landmass (France → mainland, not
// Guiana), where the globe turns to and where travel arcs land.
import fs from "fs";
import { feature } from "topojson-client";
import { geoArea, geoCentroid, geoEquirectangular, geoPath } from "d3-geo";
import countries from "i18n-iso-countries";
const load = (r) => { const t = JSON.parse(fs.readFileSync(`node_modules/world-atlas/countries-${r}.json`)); const fc = feature(t, t.objects.countries); fc.features = fc.features.filter(f => f.id !== "010"); return fc; };
const code = (f) => (f.id ? countries.numericToAlpha2(f.id) : f.properties.name === "Kosovo" ? "XK" : undefined);
const coarse = load("110m"), fine = load("50m");
const W = 1000, H = 500;
const proj = geoEquirectangular().scale(W / (2 * Math.PI)).translate([W / 2, H / 2]);
const path = geoPath(proj).digits(1);
const main = (f) => {
  if (f.geometry.type !== "MultiPolygon") return geoCentroid(f);
  const polys = f.geometry.coordinates.map((coordinates) => ({ type: "Polygon", coordinates }));
  return geoCentroid(polys.reduce((a, b) => (geoArea(b) > geoArea(a) ? b : a)));
};
const r1 = (n) => Math.round(n * 10) / 10;
const shapes = {}, dots = {}, centers = {};
for (const f of coarse.features) { const c = code(f); if (!c) continue; shapes[c] = (shapes[c] ?? "") + path(f); centers[c] ??= main(f).map(r1); }
for (const f of fine.features) {
  const c = code(f); if (!c || shapes[c]) continue;
  const ll = main(f); if (!isFinite(ll[0])) continue;
  centers[c] = ll.map(r1);
  dots[c] = proj(ll).map(Math.round);
}
const out = new URL("../src/lib/world-globe.json", import.meta.url);
fs.writeFileSync(out, JSON.stringify({ width: W, height: H, shapes, dots, centers }));
console.log(Object.keys(shapes).length, "shapes,", Object.keys(dots).length, "dots,", fs.statSync(out).size, "bytes");
