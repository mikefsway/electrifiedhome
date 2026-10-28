// The picture at the top of the home page: an all-electric house at dusk,
// with solar panels, a heat pump and a car charging on the drive.
//
//   node scripts/hero-art.mjs              writes site/assets/home-hero.svg
//   node scripts/hero-art.mjs --full F     also writes the whole scene, with
//                                          sky and road, to F
//
// Each part is its own Inkscape layer (background, tree, ground, house,
// heat-pump, garden, car), so the SVG can be opened and edited by hand. Running
// this script again overwrites hand edits. The hero version leaves out the sky
// and the road, and its bottom edge is the ground line: it stands on the green
// strip style.css draws under the navy band, and its lawn is the same green.
//
// The house, heat pump, car, fence, hedge and paving are modelled in 3D, in
// metres, and drawn through one perspective camera (see "camera"), so they all
// share a viewpoint. Change the house's size or the camera and everything that
// sits on it follows. Foliage is drawn flat, anchored to points on the ground.
import { writeFileSync } from 'node:fs';

const W = 1500, H = 1047;

// deterministic randomness, so re-running gives the same picture
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const rr = (a, b) => a + rnd() * (b - a);
const f = (n) => Math.round(n * 10) / 10;

const circ = (x, y, r) => `M${f(x - r)},${f(y)}a${f(r)},${f(r)} 0 1,0 ${f(2 * r)},0a${f(r)},${f(r)} 0 1,0 ${f(-2 * r)},0`;

// A clump of foliage: a dark mass of overlapping circles, a mid tone set up and
// towards the light, and highlights on the lit edge. light = [dx, dy] unit-ish.
function clump({ cx, cy, rx, ry, r, n, tones, light = [0.6, -0.8], lit = 0.25 }) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd());
    pts.push([cx + Math.cos(a) * d * rx, cy + Math.sin(a) * d * ry, r * rr(0.7, 1.15)]);
  }
  // scalloped rim
  const rim = Math.max(8, Math.round((rx + ry) / r * 1.6));
  for (let i = 0; i < rim; i++) {
    const a = (i / rim) * Math.PI * 2 + rr(-0.1, 0.1);
    pts.push([cx + Math.cos(a) * rx * 0.92, cy + Math.sin(a) * ry * 0.92, r * rr(0.6, 0.95)]);
  }
  const [lx, ly] = light;
  const score = ([x, y]) => ((x - cx) / rx) * lx + ((y - cy) / ry) * ly;
  let out = `<path fill="${tones[0]}" d="${pts.map(([x, y, s]) => circ(x, y, s)).join('')}"/>`;
  const mid = pts.filter((p) => score(p) > -0.2);
  out += `<path fill="${tones[1]}" d="${mid.map(([x, y, s]) => circ(x + lx * s * 0.18, y + ly * s * 0.18, s * 0.92)).join('')}"/>`;
  if (tones[2]) {
    const hi = pts.filter((p) => score(p) > lit && rnd() < 0.6);
    out += `<path fill="${tones[2]}" d="${hi.map(([x, y, s]) => circ(x + lx * s * 0.3, y + ly * s * 0.3, s * 0.75)).join('')}"/>`;
  }
  return out;
}

const layer = (id, body) => `<g id="${id}" inkscape:groupmode="layer" inkscape:label="${id}">\n${body}\n</g>\n`;
const poly = (pts, fill, extra = '') => `<polygon points="${pts.map((p) => p.join(',')).join(' ')}" fill="${fill}" ${extra}/>`;

// ---------- palette ----------
const C = {
  skyTop: '#13285c', skyMid: '#1d3f80', skyLow: '#2c4f8c', glow: '#f08c4e',
  cloud: '#46558e', cloudLit: '#e6905e',
  far: '#1a3346', hedge: '#1d4634', hedgeTop: '#24533a', hedgeLit: '#28573d',
  treeDark: '#24502e', treeMid: '#3f7134', treeLit: '#8fa83f',
  brick: '#d45d2f', brickSide: '#b94a26', brickShade: '#a8411f', reveal: '#8f3519',
  roof: '#1c2540', roofEdge: '#141a2e', ridge: '#2b3553',
  panel: '#1d3160', panelLine: '#6f8fcf',
  trim: '#f1ebdf', trimShade: '#cfc6b4', stone: '#eadfca', stoneShade: '#c9bca2',
  glass: '#f6c25a', glassHot: '#fde2a0', night: '#2b4373',
  door: '#1d2f5f', brass: '#e2b443', pipe: '#2a2f45', pipeLit: '#3a4058',
  hp: '#e8ecf1', hpTop: '#f6f7f9', hpShade: '#c3cad4', fan: '#232a3b',
  lawn: '#2f7d3a', lawnLit: '#5b9440', path: '#b9b3a6', pathEdge: '#9d9789', gravel: '#575c68',
  pave: '#848a98', road: '#262a38',
  fence: '#8a5a3b', fenceDark: '#6b4329', post: '#6f472d', postLit: '#a06d49',
  carRear: '#f1f2f4', carRoof: '#e2e5ea', carSide: '#cdd2da', carGlass: '#1e293d', carTrim: '#2a2f3a', tail: '#c4283a',
};

// ---------- camera ----------
// Two-point perspective with a long lens: verticals stay vertical, horizontal
// edges converge gently on two vanishing points on the horizon. World units are
// metres: x along the front of the house, y back into the plot, z up, with the
// origin at the front-left corner of the house at ground level. The viewer
// stands to the front-left (yaw), `dist` metres from the middle of the front,
// with their eye `eye` metres up, which shows the front, the left gable and the
// front slope of the roof. `scale` is pixels per metre at that distance, and
// the front-left corner of the house lands at (ox, oy).
const VIEW = { yaw: 34, eye: 3.4, dist: 32, scale: 76, ox: 480, oy: 900 };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const CAM = (() => {
  const t = (VIEW.yaw * Math.PI) / 180, st = Math.sin(t), ct = Math.cos(t);
  const right = [ct, -st, 0], ahead = [st, ct, 0], fl = VIEW.scale * VIEW.dist;
  const target = [4.2, 0, VIEW.eye], at = target.map((v, i) => v - ahead[i] * VIEW.dist);
  const raw = (p) => { const v = p.map((c, i) => c - at[i]); const d = dot(v, ahead); return [(fl * dot(v, right)) / d, (-fl * v[2]) / d]; };
  const [x0, y0] = raw([0, 0, 0]);
  return { st, ct, right, ahead, fl, at, raw, dx: VIEW.ox - x0, dy: VIEW.oy - y0 };
})();
const P = (x, y, z) => { const [u, v] = CAM.raw([x, y, z]); return [f(u + CAM.dx), f(v + CAM.dy)]; };
const HORIZON = CAM.dy; // screen y of the eye level
const toward = (p) => CAM.at.map((c, i) => c - p[i]); // from a point to the viewer
const pts2 = (pts3) => pts3.map((p) => P(...p).join(',')).join(' ');
const face = (pts3, fill, extra = '') => `<polygon points="${pts2(pts3)}" fill="${fill}" ${extra}/>`;
const ring = (fn, n = 48) => Array.from({ length: n }, (_, i) => fn((i / n) * Math.PI * 2));
const loop = (pts3, attrs) => `<polygon points="${pts2(pts3)}" ${attrs}/>`;
const smooth = (pts) => {
  let d = `M${pts[0]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    d += `C${f(p1[0] + (p2[0] - p0[0]) / 6)},${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)},${f(p2[1] - (p3[1] - p1[1]) / 6)} ${p2}`;
  }
  return d;
};

// A six-sided block from its eight corners, c(i, j, k) with i, j, k in {0, 1}:
// i runs along, j up and k out. Only the faces turned towards the viewer are
// drawn. fills: out (k = 1), top (j = 1), end (i = 0 or 1), back (k = 0).
function block(c, fills) {
  const all = [0, 1].flatMap((i) => [0, 1].flatMap((j) => [0, 1].map((k) => c(i, j, k))));
  const mid = (ps) => [0, 1, 2].map((a) => ps.reduce((s, p) => s + p[a], 0) / ps.length);
  const centre = mid(all);
  const sides = [
    [[0, 0, 0], [0, 1, 0], [0, 1, 1], [0, 0, 1]].map(([i, j, k]) => [i, j, k]), // i = 0
    [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]],
    [[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]], // top
    [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]],
    [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], // out
    [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]],
  ];
  const fill = [fills.end, fills.end, fills.top, fills.bottom || fills.end, fills.out, fills.back || fills.out];
  let s = '';
  sides.forEach((ix, n) => {
    const q = ix.map(([i, j, k]) => c(i, j, k)), m = mid(q);
    if (dot([m[0] - centre[0], m[1] - centre[1], m[2] - centre[2]], toward(m)) > 1e-6) s += face(q, fill[n]);
  });
  return s;
}

// ---------- the house ----------
// Shared measurements, in metres. The roof is a plain pitched roof with its
// ridge along x, a gable at each end, and the left gable faces the viewer.
const HOUSE = { w: 8.4, d: 6.0, eaves: 5.4, pitch: 38, eave: 0.25, verge: 0.25, thick: 0.16, board: 0.2 };
const R = (() => {
  const t = Math.tan((HOUSE.pitch * Math.PI) / 180), c = Math.cos((HOUSE.pitch * Math.PI) / 180), s = Math.sin((HOUSE.pitch * Math.PI) / 180);
  const top = (y) => HOUSE.eaves + HOUSE.thick + y * t; // roof's top surface over the front slope
  const half = HOUSE.d / 2;
  return {
    t, c, s, top, half,
    apex: HOUSE.eaves + half * t, // the gable wall's peak
    ridge: top(half),
    edge: top(-HOUSE.eave), // top of the roof at the eaves edge
    slope: (half + HOUSE.eave) / c, // length of the front slope, eaves to ridge
    x0: -HOUSE.verge, x1: HOUSE.w + HOUSE.verge,
  };
})();

// Surfaces, each mapping local coordinates to the world:
//   (a, b, d): a across, b up, d out from the surface towards the viewer.
const FRONT = (a, b, d = 0) => [a, -d, b]; // a from the left corner
const GABLE = (a, b, d = 0) => [-d, HOUSE.d - a, b]; // a from the back corner
const ROOF = (a, b, d = 0) => [a, -HOUSE.eave + b * R.c - d * R.s, R.edge + b * R.s + d * R.c]; // b up the slope from the eaves edge
const GROUND = (x, y) => [x, y, 0];
const on = (M, pts, d = 0) => pts.map(([a, b]) => M(a, b, d));
const rect = (a0, b0, a1, b1) => [[a0, b0], [a1, b0], [a1, b1], [a0, b1]];
const box = (M, a0, a1, b0, b1, d0, d1, fills) => block((i, j, k) => M(i ? a1 : a0, j ? b1 : b0, k ? d1 : d0), fills);
const disc = (M, a, b, r, d, attrs, n = 48) => loop(ring((t) => M(a + r * Math.cos(t), b + r * Math.sin(t), d), n), attrs);

let clipN = 0;
// A window set into a wall: stone head, a reveal, the frame and glass set back
// in the opening, and a projecting sill.
function window(M, { a, b, w, h, lit = true, bars = 'cross', plant = false, lamp = false, spill = true }) {
  const depth = 0.08, fr = 0.085, id = `opening${++clipN}`;
  let s = '';
  if (lit && spill) s += face(on(M, rect(a - 0.3, b - 0.7, a + w + 0.3, b + h + 0.3)), 'url(#spill)', 'opacity="0.35"');
  s += box(M, a - 0.1, a + w + 0.1, b + h, b + h + 0.2, 0, 0.025, { out: C.stone, top: C.stone, end: C.stoneShade });
  const hole = on(M, rect(a, b, a + w, b + h));
  s += `<clipPath id="${id}"><polygon points="${pts2(hole)}"/></clipPath>`;
  s += face(hole, C.reveal);
  let g = face(on(M, rect(a, b, a + w, b + h), -depth), lit ? 'url(#glassLit)' : C.night);
  if (lamp) for (const la of [a + w * 0.3, a + w * 0.72]) {
    g += `<polyline points="${pts2([M(la, b + h, -depth), M(la, b + h * 0.58, -depth)])}" stroke="#7a5a2a" stroke-width="1.5" fill="none"/>`;
    g += disc(M, la, b + h * 0.53, w * 0.06, -depth, `fill="${C.glassHot}"`, 20);
  }
  if (plant) {
    const pa = a + w * 0.72, pb = b + fr;
    g += face(on(M, rect(pa - 0.11, pb, pa + 0.11, pb + 0.17), -depth), '#8a4a2a');
    for (const [da, db, r] of [[-0.12, 0.3, 0.11], [0, 0.4, 0.12], [0.13, 0.3, 0.11], [-0.03, 0.25, 0.1]])
      g += disc(M, pa + da, pb + db, r, -depth, `fill="${lit ? '#4c6b2c' : '#3d5a48'}"`, 20);
  }
  const bar = (a0, b0, a1, b1) => face(on(M, rect(a0, b0, a1, b1), -depth), C.trim);
  g += bar(a, b, a + w, b + fr) + bar(a, b + h - fr, a + w, b + h) + bar(a, b, a + fr, b + h) + bar(a + w - fr, b, a + w, b + h);
  if (bars === 'cross' || bars === 'mullion') g += bar(a + w / 2 - 0.04, b, a + w / 2 + 0.04, b + h);
  if (bars === 'cross') g += bar(a, b + h * 0.68 - 0.04, a + w, b + h * 0.68 + 0.04);
  s += `<g clip-path="url(#${id})">${g}</g>`;
  s += box(M, a - 0.13, a + w + 0.13, b - 0.12, b, -depth, 0.07, { out: C.stone, top: C.trim, end: C.stoneShade });
  return s;
}

let house = '';
// walls: the left gable, then the front
house += face([[0, 0, 0], [0, HOUSE.d, 0], [0, HOUSE.d, HOUSE.eaves], [0, R.half, R.apex], [0, 0, HOUSE.eaves]], C.brickSide);
house += face([[0, 0, HOUSE.eaves], [0, R.half, R.apex], [0, HOUSE.d, HOUSE.eaves], [0, HOUSE.d, HOUSE.eaves - 0.4], [0, R.half, R.apex - 0.4], [0, 0, HOUSE.eaves - 0.4]], C.brickShade, 'opacity="0.55"');
house += face(on(FRONT, rect(0, 0, HOUSE.w, HOUSE.eaves)), C.brick);
house += face(on(FRONT, rect(0, 0, HOUSE.w, HOUSE.eaves)), 'url(#wallShade)');
house += face(on(FRONT, rect(0, HOUSE.eaves - 0.45, HOUSE.w, HOUSE.eaves)), C.brickShade, 'opacity="0.5"');

house += window(GABLE, { a: 2.7, b: 3.2, w: 0.6, h: 1.15, bars: 'none', plant: true, spill: false });
house += window(FRONT, { a: 1.9, b: 3.25, w: 1.45, h: 1.25, lamp: true, plant: true });
house += window(FRONT, { a: 5.15, b: 3.25, w: 1.0, h: 1.2, lit: false, plant: true });
house += window(FRONT, { a: 1.75, b: 0.85, w: 1.8, h: 1.5, plant: true });
// lamp silhouette in the ground-floor window, on the sill inside
house += face(on(FRONT, [[1.95, 1.2], [2.4, 1.2], [2.28, 1.48], [2.07, 1.48]], -0.08), '#c98a3a');
house += face(on(FRONT, rect(2.15, 0.94, 2.2, 1.2), -0.08), '#7a5a2a');

// front door: recessed leaf and fanlight, a cream surround, a hood and a step
{
  const a = 5.25, w = 0.9, h = 2.35, id = `opening${++clipN}`;
  const hole = on(FRONT, rect(a, 0, a + w, h));
  house += `<clipPath id="${id}"><polygon points="${pts2(hole)}"/></clipPath>` + face(hole, C.reveal);
  let g = face(on(FRONT, rect(a, 2.06, a + w, h), -0.1), 'url(#glassLit)');
  g += face(on(FRONT, rect(a, 1.98, a + w, 2.06), -0.1), C.trim);
  g += face(on(FRONT, rect(a, 0, a + w, 1.98), -0.1), C.door);
  g += face(on(FRONT, rect(a + 0.42, 1.2, a + 0.48, 1.6), -0.1), C.brass);
  g += face(on(FRONT, rect(a + 0.3, 0.75, a + 0.6, 0.8), -0.1), C.brass);
  g += face(on(FRONT, rect(a + 0.1, 0.95, a + 0.18, 0.99), -0.1), C.brass);
  house += `<g clip-path="url(#${id})">${g}</g>`;
  const trim = { out: C.trim, top: C.trim, end: C.trimShade };
  house += box(FRONT, a - 0.16, a, 0.1, h, 0, 0.05, trim) + box(FRONT, a + w, a + w + 0.16, 0.1, h, 0, 0.05, trim);
  house += box(FRONT, a - 0.2, a + w + 0.2, h, h + 0.22, 0, 0.1, trim);
  house += box(FRONT, a - 0.28, a + w + 0.28, h + 0.22, h + 0.3, 0, 0.18, trim);
  house += box(FRONT, a - 0.24, a + w + 0.24, 0, 0.1, 0, 0.32, { out: C.stone, top: C.trim, end: C.stoneShade });
  // wall light, and its glow on the brick
  house += face(on(FRONT, [[4.83, 1.85], [4.55, 0.9], [5.08, 0.9]]), 'url(#lampGlow)');
  house += box(FRONT, 4.77, 4.89, 1.85, 2.12, 0, 0.1, { out: '#1d2233', top: '#2a3046', end: '#151925' });
}

// car charger
house += box(FRONT, 7.55, 7.9, 0.95, 1.5, 0, 0.12, { out: '#252b3a', top: '#3a4152', end: '#1b1f2b' });
house += disc(FRONT, 7.725, 1.32, 0.085, 0.121, 'fill="none" stroke="#48d46e" stroke-width="2.5"', 32);

// downpipe, from the gutter at the left end to the ground
const gutterZ = R.edge - HOUSE.board;
house += box(FRONT, 0.09, 0.17, 0.05, gutterZ - 0.4, 0.02, 0.1, { out: C.pipe, top: C.pipe, end: C.pipeLit });
house += box(FRONT, 0.07, 0.2, 0.05, 0.12, 0.02, 0.16, { out: C.pipe, top: C.pipe, end: C.pipeLit });

// roof: the front slope, solar panels, fascia and gutter, verge boards, ridge
house += face(on(ROOF, rect(R.x0, 0, R.x1, R.slope)), C.roof);
{
  // two rows of six portrait modules, 1.13 x 1.72 m, laid out in the roof's
  // own coordinates and centred on the slope
  const cols = 6, rows = 2, pw = 1.13, ph = 1.72, gap = 0.025;
  const a0 = (HOUSE.w - cols * pw) / 2, b0 = (R.slope - rows * ph) / 2;
  let pv = face(on(ROOF, rect(a0 - 0.04, b0 - 0.04, a0 + cols * pw + 0.04, b0 + rows * ph + 0.04), 0.03), C.panelLine);
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++)
    pv += face(on(ROOF, rect(a0 + i * pw + gap, b0 + j * ph + gap, a0 + (i + 1) * pw - gap, b0 + (j + 1) * ph - gap), 0.04), 'url(#panel)');
  house += `<g id="solar-panels">${pv}</g>`;
}
// fascia along the eaves, the gutter on it, and the outlet into the downpipe
house += block((i, j, k) => [i ? R.x1 : R.x0, -HOUSE.eave - (k ? 0.03 : 0), j ? R.edge : gutterZ], { out: C.trim, top: C.trim, end: C.trimShade });
house += block((i, j, k) => [i ? R.x1 : R.x0, -HOUSE.eave - (k ? 0.15 : 0.03), gutterZ + (j ? 0.1 : -0.03)], { out: C.pipe, top: C.pipeLit, end: C.pipeLit });
house += `<path d="M${P(0.13, -HOUSE.eave - 0.09, gutterZ - 0.03)} L${P(0.13, -HOUSE.eave - 0.09, gutterZ - 0.14)} L${P(0.13, -0.06, gutterZ - 0.38)} L${P(0.13, -0.06, gutterZ - 0.45)}" stroke="${C.pipe}" stroke-width="${f(0.085 * VIEW.scale)}" fill="none" stroke-linejoin="round"/>`;
// verge boards on the gable end, front and back slopes. The underside of the
// back slope's overhang faces forward, so it shows between its board and the wall.
const under = (y) => R.top(HOUSE.d - y) - HOUSE.thick;
house += face([[R.x0 + 0.03, R.half, under(R.half)], [R.x0 + 0.03, HOUSE.d + HOUSE.eave, under(HOUSE.d + HOUSE.eave)], [0, HOUSE.d + HOUSE.eave, under(HOUSE.d + HOUSE.eave)], [0, R.half, under(R.half)]], '#10152a');
const verge = (y0, z0, y1, z1) => block((i, j, k) => [R.x0 + (k ? 0 : 0.03), i ? y1 : y0, (i ? z1 : z0) - (j ? 0 : HOUSE.board)], { out: C.roofEdge, top: C.roofEdge, end: C.roofEdge });
house += verge(R.half, R.ridge, HOUSE.d + HOUSE.eave, R.edge);
house += verge(-HOUSE.eave, R.edge, R.half, R.ridge);
house += block((i, j, k) => [i ? R.x1 : R.x0, R.half + (k ? -0.12 : 0.12), R.ridge + (j ? 0.09 : -0.04)], { out: C.ridge, top: C.ridge, end: C.roofEdge });

// ---------- heat pump, against the front wall at the left ----------
let hp = '';
{
  const M = FRONT, a0 = 0.4, a1 = 1.4, b0 = 0.16, b1 = 0.94, d0 = 0.06, d1 = 0.44;
  hp += face([GROUND(a0 - 0.06, -d1 - 0.12), GROUND(a1 + 0.1, -d1 - 0.12), GROUND(a1 + 0.1, 0), GROUND(a0 - 0.06, 0)], '#000', 'opacity="0.18"');
  for (const a of [a0 + 0.1, a1 - 0.2]) hp += box(M, a, a + 0.1, 0, b0, d0 + 0.04, d1 - 0.04, { out: '#4a5060', top: '#4a5060', end: '#3a404e' });
  hp += box(M, a0, a1, b0, b1, d0, d1, { out: C.hp, top: C.hpTop, end: C.hpShade });
  const fa = a0 + 0.36, fb = (b0 + b1) / 2, fd = d1 + 0.004, at = (r, t) => M(fa + r * Math.cos(t), fb + r * Math.sin(t), fd);
  hp += loop(ring((t) => at(0.31, t)), `fill="${C.fan}"`);
  for (let k = 0; k < 4; k++) {
    const t0 = (k * Math.PI) / 2;
    hp += `<polyline points="${pts2(Array.from({ length: 8 }, (_, i) => at(0.05 + i * 0.033, t0 + i * 0.16)))}" fill="none" stroke="#4a536a" stroke-width="5" stroke-linecap="round"/>`;
  }
  for (const r of [0.12, 0.2, 0.28]) hp += loop(ring((t) => at(r, t)), 'fill="none" stroke="#3a4256" stroke-width="1"');
  hp += loop(ring((t) => at(0.05, t), 24), 'fill="#8a93a6"');
  hp += face(on(M, rect(a1 - 0.3, 0.56, a1 - 0.08, 0.82), fd), C.hpShade);
}

// ---------- car, nosed in on the drive with its back to the street ----------
// The body is a smoothed side profile swept across the car's width, with the
// cabin drawn in above the windowline. Each band of it is shaded by which way
// it faces, so the back rolls over into the roof. Wheels are circles on the
// near side. t is metres forward from the rear bumper.
const CAR_SHAPE = [[0.06, 0.3], [0, 0.55], [0.03, 0.95], [0.22, 1.25], [0.55, 1.5], [0.95, 1.58], [2.7, 1.58], [3.1, 1.46], [3.5, 1.1], [4.15, 0.96], [4.42, 0.8], [4.48, 0.5], [4.4, 0.3]];
const curve = (pts, n = 6) => { // Catmull-Rom through the points, n steps a span
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    for (let k = 0; k < n; k++) {
      const s = k / n, s2 = s * s, s3 = s2 * s;
      out.push([0, 1].map((a) => 0.5 * (2 * p1[a] + (p2[a] - p0[a]) * s + (2 * p0[a] - 5 * p1[a] + 4 * p2[a] - p3[a]) * s2 + (3 * p1[a] - p0[a] - 3 * p2[a] + p3[a]) * s3)));
    }
  }
  return [...out, pts[pts.length - 1]];
};
const mix = (a, b, w) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - w) + parseInt(b.slice(i, i + 2), 16) * w).toString(16).padStart(2, '0')).join('');
function drawCar({ x0, rear, paint }) {
  const x1 = x0 + 1.82, prof = curve(CAR_SHAPE), [side, back, top] = paint;
  const inset = (z) => (z <= 1.02 ? 0 : 0.16 * ((z - 1.02) / 0.56)); // cabin tapers in
  const at = (x, t, z) => [x, rear + t, z], L = (z) => x0 + inset(z), Rt = (z) => x1 - inset(z);
  let s = face([GROUND(x0 - 0.1, rear + 0.2), GROUND(x1 + 0.1, rear + 0.2), GROUND(x1 + 0.1, rear + 4.3), GROUND(x0 - 0.1, rear + 4.3)], '#000', 'opacity="0.28"');
  // the far rear wheel, seen under the back bumper
  s += loop(ring((q) => at(x1 - 0.25, 0.85 + 0.34 * Math.cos(q), 0.34 + 0.34 * Math.sin(q)), 32), 'fill="#101318"');
  // body bands that face the viewer, shaded from the back's colour to the roof's
  const ct = prof.reduce((n, p) => n + p[0], 0) / prof.length, cz = prof.reduce((n, p) => n + p[1], 0) / prof.length;
  for (let i = 0; i < prof.length - 1; i++) {
    const [[t0, z0], [t1, z1]] = [prof[i], prof[i + 1]], len = Math.hypot(t1 - t0, z1 - z0);
    let n = [(z1 - z0) / len, -(t1 - t0) / len];
    if (n[0] * ((t0 + t1) / 2 - ct) + n[1] * ((z0 + z1) / 2 - cz) < 0) n = [-n[0], -n[1]];
    if (dot([0, n[0], n[1]], toward(at((x0 + x1) / 2, (t0 + t1) / 2, (z0 + z1) / 2))) <= 0) continue;
    const fill = mix(back, top, Math.min(1, Math.max(0, n[1])) ** 1.5);
    s += face([at(L(z0), t0, z0), at(Rt(z0), t0, z0), at(Rt(z1), t1, z1), at(L(z1), t1, z1)], fill, `stroke="${fill}" stroke-width="0.8" stroke-linejoin="round"`);
  }
  // rear details, laid on the curved back: t found from the profile at height z
  const backT = (z) => {
    for (let i = 0; i < prof.length - 1; i++) {
      const [[t0, z0], [t1, z1]] = [prof[i], prof[i + 1]];
      if (z >= z0 && z <= z1) return t0 + ((t1 - t0) * (z - z0)) / (z1 - z0);
    }
    return prof[0][0];
  };
  const onBack = (u0, u1, z0, z1, fill, n = 6) => {
    const pt = (u, z) => at(L(z) + (Rt(z) - L(z)) * u, backT(z) - 0.01, z), zs = Array.from({ length: n + 1 }, (_, k) => z0 + ((z1 - z0) * k) / n);
    return face([...zs.map((z) => pt(u0, z)), ...zs.reverse().map((z) => pt(u1, z))], fill, 'stroke-linejoin="round"');
  };
  s += onBack(0, 1, 0.3, 0.44, C.carTrim);
  s += onBack(0.12, 0.88, 1.02, 1.4, C.carGlass);
  s += onBack(0.03, 0.22, 0.72, 0.84, C.tail) + onBack(0.78, 0.97, 0.72, 0.84, C.tail);
  s += onBack(0.38, 0.62, 0.5, 0.62, '#f6d13a');
  // near side, its windows following the taper, sill, wheel arches, wheels
  const flat = (pts, fill, dx = 0) => face(pts.map(([t, z]) => at(L(z) - dx, t, z)), fill, 'stroke-linejoin="round"');
  s += flat(prof, side, 0);
  // side glass: straight edges parallel to the pillars, with rounded corners
  const rounded = (pts, r) => pts.flatMap((p, i) => {
    const a = pts[(i + pts.length - 1) % pts.length], b = pts[(i + 1) % pts.length];
    const toward2 = (q) => { const d = Math.hypot(q[0] - p[0], q[1] - p[1]), k = Math.min(r, d / 2) / d; return [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k]; };
    const s0 = toward2(a), s1 = toward2(b);
    return [0, 0.25, 0.5, 0.75, 1].map((u) => [0, 1].map((k) => (1 - u) ** 2 * s0[k] + 2 * u * (1 - u) * p[k] + u * u * s1[k]));
  });
  s += flat(rounded([[0.6, 1.07], [0.86, 1.47], [2.66, 1.5], [2.93, 1.44], [3.3, 1.07]], 0.07), C.carGlass, 0.005);
  s += flat([[1.88, 1.05], [1.97, 1.05], [1.97, 1.52], [1.88, 1.52]], side, 0.01);
  s += flat(curve([[0.1, 0.3], [0.04, 0.4], [1.2, 0.42], [3.2, 0.42], [4.4, 0.4], [4.36, 0.3]], 4), C.carTrim, 0.005);
  for (const t of [0.85, 3.6]) {
    const wheel = (r, dx, attrs, n = 40) => loop(ring((q) => at(x0 - dx, t + r * Math.cos(q), 0.34 + r * Math.sin(q)), n), attrs);
    s += wheel(0.42, 0.006, `fill="${C.carTrim}"`) + wheel(0.34, 0.03, 'fill="#181b22"') + wheel(0.19, 0.035, 'fill="#9aa3ae"');
  }
  return s;
}let car = '';
const CAR = { x0: 9.15, rear: -4.95 };
car += drawCar({ ...CAR, paint: [C.carSide, C.carRear, C.carRoof] });
// charge port on the front wing, and the cable from the charger to it
car += face([[CAR.x0 - 0.01, CAR.rear + 4.0, 0.8], [CAR.x0 - 0.01, CAR.rear + 4.12, 0.8], [CAR.x0 - 0.01, CAR.rear + 4.12, 0.9], [CAR.x0 - 0.01, CAR.rear + 4.0, 0.9]], '#9aa1ad');
{
  const cable = [P(7.725, -0.12, 0.95), P(7.76, -0.2, 0.3), P(7.95, -0.55, 0.03), P(8.6, -1.0, 0.03), P(8.95, -1.0, 0.45), P(CAR.x0 - 0.04, CAR.rear + 4.06, 0.85)];
  car += `<path d="${smooth(cable)}" stroke="#1d2230" stroke-width="4" fill="none" stroke-linecap="round"/>`;
}

// ---------- ground: lawn, path to the door, drive ----------
// lawn is the strip's green in the hero; the full scene adds a lit edge
const lawn = face([GROUND(-30, -14), GROUND(40, -14), GROUND(40, 6.2), GROUND(-30, 6.2)], C.lawn);
let paving = face([GROUND(5.03, -0.32), GROUND(6.4, -0.32), GROUND(6.4, -14), GROUND(5.03, -14)], C.path);
paving += face([GROUND(8.6, -14), GROUND(11.9, -14), GROUND(11.9, 3), GROUND(8.6, 3)], C.gravel);
paving += face([GROUND(8.6, -14), GROUND(8.72, -14), GROUND(8.72, 3), GROUND(8.6, 3)], C.pathEdge);
paving += `<path fill="#6b717d" d="${Array.from({ length: 220 }, () => circ(...P(rr(8.75, 11.9), rr(-14, 3), 0), rr(0.8, 1.6))).join('')}"/>`;

// ---------- background: far trees, hedge, fence ----------
let bg = '';
// hedge along the right-hand boundary, behind the drive
const HEDGE = { x0: 8.6, x1: 30, y0: 3, y1: 3.8, h: 2.1 };
{
  const { x0, x1, y0, y1, h } = HEDGE;
  // far trees, standing behind it
  const back = [];
  for (let x = x0; x <= 24; x += 1.4) back.push(P(x, 8, h + 0.5 + (Math.round(x * 7) % 3) * 0.18));
  bg += `<path fill="${C.far}" d="M${P(x0, 8, 0)} L${back.join(' L')} L${P(24, 8, 0)}Z"/>`;
  for (const [x, z, r] of [[10.2, 3.0, 0.42], [11.7, 3.2, 0.5], [13.4, 2.95, 0.38], [15.1, 3.15, 0.46], [16.7, 3.0, 0.36], [18.2, 3.2, 0.42]]) bg += `<path fill="${C.far}" d="${circ(...P(x, 8, z), r * VIEW.scale)}"/>`;
  bg += `<ellipse cx="${P(20.2, 8, 3.2)[0]}" cy="${P(20.2, 8, 3.2)[1]}" rx="22" ry="72" fill="${C.far}"/>`;
  bg += block((i, j, k) => [i ? x1 : x0, k ? y0 : y1, j ? h : 0], { out: C.hedge, top: C.hedgeTop, end: C.hedge });
  bg += `<path fill="${C.hedge}" d="${Array.from({ length: 34 }, (_, i) => circ(...P(x0 + i * 0.32, y0, h + rr(-0.04, 0.04)), rr(10, 14))).join('')}"/>`;
  bg += `<path fill="${C.hedgeLit}" opacity="0.6" d="${Array.from({ length: 140 }, () => circ(...P(rr(x0, 20), y0, rr(0.1, h - 0.1)), rr(3, 6))).join('')}"/>`;
}
// left: dark trees behind the fence
bg += clump({ cx: 120, cy: 610, rx: 150, ry: 110, r: 34, n: 40, tones: ['#173a2a', '#20462f', '#2f5a33'], light: [0.8, -0.5] });
// close-board fence in line with the back of the house
{
  const y = HOUSE.d, x0 = -12, x1 = -0.05, h = 1.85;
  let fence = face([[x0, y, 0], [x1, y, 0], [x1, y, h], [x0, y, h]], C.fence);
  for (let z = 0.08; z < h; z += 0.17) fence += `<polyline points="${pts2([[x0, y, z], [x1, y, z]])}" stroke="${C.fenceDark}" stroke-width="3" fill="none"/>`;
  for (let x = x1 - 0.1; x > x0; x -= 1.83) fence += box(FRONT, x - 0.1, x, 0, h + 0.1, -y + 0.02, -y + 0.12, { out: C.post, top: C.postLit, end: C.postLit });
  bg += fence;
}

// ---------- the big tree behind the house ----------
let tree = `<path fill="#3a2a20" d="M380,560 C390,470 395,420 388,380 L420,380 C412,430 418,480 430,560Z"/>`;
tree += clump({ cx: 300, cy: 330, rx: 210, ry: 190, r: 30, n: 150, tones: [C.treeDark, C.treeMid, C.treeLit], light: [0.75, -0.65], lit: 0.15 });
tree += clump({ cx: 470, cy: 190, rx: 150, ry: 130, r: 26, n: 90, tones: [C.treeDark, C.treeMid, C.treeLit], light: [0.75, -0.65], lit: 0.05 });
tree += clump({ cx: 180, cy: 470, rx: 120, ry: 90, r: 26, n: 60, tones: [C.treeDark, '#2f5f31', C.treeMid], light: [0.75, -0.65] });

// ---------- garden ----------
// Plants are flat, each standing on a point on the ground.
let garden = '';
const plant = (x, y, o) => { const [cx, gy] = P(x, y, 0); return clump({ ...o, cx, cy: gy - o.ry * 0.85 }); };
// the garden uplight's glow on the gable wall
garden += `<ellipse cx="${P(0, 1.4, 0.7)[0]}" cy="${P(0, 1.4, 0.7)[1]}" rx="140" ry="85" fill="url(#uplight)"/>`;
// flowering shrub by the fence
garden += plant(-2.9, 2.6, { rx: 62, ry: 100, r: 18, n: 40, tones: ['#1f4a2c', '#2f6034', '#4a7a3a'], light: [0.7, -0.7] });
{
  const [cx, gy] = P(-2.9, 2.6, 0);
  garden += `<path fill="#f3eedc" d="${Array.from({ length: 45 }, () => circ(rr(cx - 50, cx + 50), rr(gy - 185, gy - 10), rr(2, 3.5))).join('')}"/>`;
}
// small tree in front of the gable
{
  const [tx, ty] = P(-1.25, -0.2, 0);
  garden += `<path fill="#4a3426" transform="translate(${f(tx - 441)},${f(ty - 910)})" d="M436,910 C438,860 430,820 444,770 L450,772 C440,820 448,860 446,910Z M440,840 C420,820 410,800 400,790 L404,786 C416,798 428,812 444,830Z"/>`;
  garden += clump({ cx: tx - 4, cy: ty - 178, rx: 100, ry: 80, r: 20, n: 45, tones: ['#3d6a2e', '#6a9a3c', '#a8c25a'], light: [0.5, -0.85], lit: 0.1 });
}
// shrubs along the front wall and by the fence
for (const [x, y, rx, ry] of [[2.05, -0.55, 42, 34], [2.95, -0.6, 40, 24], [3.85, -0.5, 48, 28], [-3.7, 2.4, 60, 34]])
  garden += plant(x, y, { rx, ry, r: 13, n: 22, tones: ['#244f2c', '#3c6e35', '#5f8f42'], light: [0.6, -0.8] });
// lavender
for (let i = 0; i < 26; i++) {
  const [x, y] = P(rr(-1.0, 0.25), rr(-0.95, -0.35), 0), hgt = rr(20, 38);
  garden += `<line x1="${f(x)}" y1="${f(y)}" x2="${f(x + rr(-6, 6))}" y2="${f(y - hgt)}" stroke="#4a6a3a" stroke-width="1.5"/><ellipse cx="${f(x + rr(-5, 5))}" cy="${f(y - 2 - hgt)}" rx="3" ry="7" fill="#7c6fc0"/>`;
}
{
  const [cx, gy] = P(2.95, -0.6, 0);
  garden += `<path fill="#f3eedc" d="${Array.from({ length: 18 }, () => circ(rr(cx - 30, cx + 30), rr(gy - 22, gy - 4), rr(2, 3))).join('')}"/>`;
}
// planters either side of the door
for (const x of [4.72, 6.42]) {
  garden += box(FRONT, x - 0.2, x + 0.2, 0, 0.5, 0.12, 0.52, { out: '#22283a', top: '#151a26', end: '#2c3346' });
  const [cx, gy] = P(x, -0.32, 0.5);
  garden += clump({ cx, cy: gy - 26, rx: 18, ry: 32, r: 9, n: 18, tones: ['#2b5530', '#4a7a3a', '#6d9a48'], light: [0.5, -0.85] });
}

// ---------- geometry check ----------
// Runs on every build, using the same functions the drawing uses. In two-point
// perspective, every edge along the front (ridge, eaves, sills, wall base) must
// point at one vanishing point on the horizon, every edge along the side at the
// other, and verticals must stay vertical. The roof slope must be one flat
// plane with the house's pitch.
{
  const fail = [], sub = (a, b) => a.map((v, i) => v - b[i]);
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const deg = (r) => (r * 180) / Math.PI;
  // how far, in degrees, a projected edge is from pointing at a vanishing point
  // (or, with no vanishing point, from vertical)
  const miss = ([p, q], vp) => {
    const a = P(...p), [ux, uy] = sub(P(...q), a), [vx, vy] = vp ? sub(vp, a) : [0, 1];
    return deg(Math.asin(Math.min(1, Math.abs(ux * vy - uy * vx) / Math.hypot(ux, uy) / Math.hypot(vx, vy))));
  };
  const vanish = (d) => [(CAM.fl * dot(d, CAM.right)) / dot(d, CAM.ahead) + CAM.dx, HORIZON];
  const near = (a, b, tol = 1e-9) => Math.abs(a - b) < tol;
  const roof = on(ROOF, rect(R.x0, 0, R.x1, R.slope)); // eaves left, eaves right, ridge right, ridge left
  if (!near(dot(cross(sub(roof[1], roof[0]), sub(roof[3], roof[0])), sub(roof[2], roof[0])), 0)) fail.push('roof corners not coplanar');
  for (const [p, q] of [[roof[0], roof[3]], [roof[1], roof[2]]]) {
    const [dy, dz] = [q[1] - p[1], q[2] - p[2]];
    if (q[0] !== p[0] || !near(deg(Math.atan2(dz, dy)), HOUSE.pitch)) fail.push('roof verge not at the house pitch');
  }
  if (!near(roof[3][2], R.ridge) || !near(roof[3][1], R.half)) fail.push('roof slope does not reach the ridge');
  if (!near(R.apex, R.top(R.half) - HOUSE.thick)) fail.push('gable peak is not under the ridge');
  if (!near(R.top(0) - HOUSE.thick, HOUSE.eaves)) fail.push('roof does not sit on the front wall');
  // every x-direction edge on the page: ridge, eaves, wall top and base, sills
  const alongX = [[roof[3], roof[2]], [roof[0], roof[1]], [FRONT(0, HOUSE.eaves), FRONT(HOUSE.w, HOUSE.eaves)], [FRONT(0, 0), FRONT(HOUSE.w, 0)], [FRONT(1.62, 0.85, 0.07), FRONT(3.68, 0.85, 0.07)]];
  const alongY = [[GABLE(0, 0), GABLE(HOUSE.d, 0)], [GABLE(0, HOUSE.eaves), GABLE(HOUSE.d, HOUSE.eaves)], [[HEDGE.x0, 0, 0], [HEDGE.x0, -12, 0]]];
  const upZ = [[FRONT(0, 0), FRONT(0, HOUSE.eaves)], [FRONT(HOUSE.w, 0), FRONT(HOUSE.w, HOUSE.eaves)], [GABLE(0, 0), GABLE(0, HOUSE.eaves)]];
  for (const [name, set, vp] of [['front', alongX, vanish([1, 0, 0])], ['side', alongY, vanish([0, 1, 0])], ['vertical', upZ, null]]) {
    const worst = Math.max(...set.map((e) => miss(e, vp)));
    if (worst > 0.15) fail.push(`${name} edges miss their vanishing point by ${worst.toFixed(2)} degrees`);
  }
  if (fail.length) throw new Error('geometry check failed:\n  ' + fail.join('\n  '));
  const slope = (z) => { const [ex, ey] = sub(P(HOUSE.w, 0, z), P(0, 0, z)); return deg(Math.atan2(-ey, ex)).toFixed(1); };
  console.log(`geometry ok: roof planar at ${HOUSE.pitch} degrees; front edges meet at x = ${Math.round(vanish([1, 0, 0])[0])}, side edges at x = ${Math.round(vanish([0, 1, 0])[0])}, horizon y = ${Math.round(HORIZON)}; front base rises ${slope(0)} degrees, eaves ${slope(HOUSE.eaves)}`);
}

// ---------- full scene only: sky, pavement, road, foreground ----------
const sky = `
<rect width="${W}" height="${H}" fill="url(#sky)"/>
<rect width="${W}" height="${H}" fill="url(#sunset)"/>
${[[1180, 432, 1.0], [1130, 566, 0.8], [1300, 668, 0.6]].map(([x, y, s]) => {
  // flat-bottomed cloud: bumps arc over the top, a lit strip along the base
  const bumps = [[30, 22], [70, 36], [120, 46], [170, 36], [220, 28], [262, 18], [300, 14]];
  let d = `M${x},${y}`, px = 0;
  for (const [bx, r] of bumps) { const ch = (bx - px) * 1.1 * s, rad = f(ch * (0.52 + r / 200)); d += `A${rad},${rad} 0 1,1 ${f(x + bx * 1.1 * s)},${y}`; px = bx; }
  d += 'Z';
  return `<path fill="${C.cloud}" d="${d}"/><rect x="${f(x + 6 * s)}" y="${f(y - 3 * s)}" width="${f(px * 1.1 * s - 12 * s)}" height="${f(7 * s)}" rx="${f(3.5 * s)}" fill="${C.cloudLit}"/>`;}).join('\n')}`;
let street = face([GROUND(-30, -9), GROUND(40, -9), GROUND(40, -10.6), GROUND(-30, -10.6)], C.pave);
street += face([GROUND(-30, -9), GROUND(40, -9), GROUND(40, -9.15), GROUND(-30, -9.15)], '#a2a8b4');
street += face([GROUND(-30, -10.6), GROUND(40, -10.6), GROUND(40, -60), GROUND(-30, -60)], C.road);
let front = clump({ cx: 40, cy: 975, rx: 130, ry: 95, r: 30, n: 40, tones: ['#14301f', '#1d3e28', '#2a5233'], light: [0.7, -0.7] });
front += clump({ cx: 205, cy: 1030, rx: 80, ry: 45, r: 24, n: 20, tones: ['#14301f', '#1d3e28', '#2a5233'], light: [0.7, -0.7] });

const defs = `<defs>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.skyTop}"/><stop offset="0.55" stop-color="${C.skyMid}"/><stop offset="0.75" stop-color="${C.skyLow}"/></linearGradient>
<radialGradient id="sunset" cx="1420" cy="760" r="520" gradientTransform="translate(1420 760) scale(1 0.35) translate(-1420 -760)" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${C.glow}"/><stop offset="0.45" stop-color="${C.glow}" stop-opacity="0.45"/><stop offset="1" stop-color="${C.glow}" stop-opacity="0"/></radialGradient>
<linearGradient id="wallShade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7a2a14" stop-opacity="0.25"/><stop offset="0.3" stop-color="#7a2a14" stop-opacity="0"/><stop offset="1" stop-color="#ffb070" stop-opacity="0.12"/></linearGradient>
<linearGradient id="panel" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2a447c"/><stop offset="0.5" stop-color="${C.panel}"/><stop offset="1" stop-color="#16274d"/></linearGradient>
<radialGradient id="glassLit" cx="0.5" cy="0.35" r="0.8"><stop offset="0" stop-color="${C.glassHot}"/><stop offset="1" stop-color="${C.glass}"/></radialGradient>
<radialGradient id="spill" cx="0.5" cy="0.6" r="0.6"><stop offset="0" stop-color="#ffcf7a" stop-opacity="0.6"/><stop offset="1" stop-color="#ffcf7a" stop-opacity="0"/></radialGradient>
<linearGradient id="lampGlow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd27a" stop-opacity="0.9"/><stop offset="1" stop-color="#ffd27a" stop-opacity="0"/></linearGradient>
<radialGradient id="uplight"><stop offset="0" stop-color="#ffb04a" stop-opacity="0.75"/><stop offset="1" stop-color="#ffb04a" stop-opacity="0"/></radialGradient>
<linearGradient id="lawnLit" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.lawnLit}"/><stop offset="1" stop-color="${C.lawnLit}" stop-opacity="0"/></linearGradient>
</defs>`;

const head = (vb, w, h) => `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" viewBox="${vb}" width="${w}" height="${h}">
<!-- Generated by scripts/hero-art.mjs. -->
${defs}`;

// The hero: no sky or road, cropped at the ground line. The background, the
// big tree and the lawn fade out at the sides so they don't end in a hard edge.
const BOTTOM = 912, TOP = 25;
const fade = `<defs><linearGradient id="edgeFade"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.06" stop-color="#fff"/><stop offset="0.94" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
<mask id="edges" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="url(#edgeFade)"/></mask></defs>`;
const hero = head(`0 ${TOP} ${W} ${BOTTOM - TOP}`, W, BOTTOM - TOP) + fade +
  `<g mask="url(#edges)">${layer('background', bg)}${layer('tree', tree)}${layer('ground', lawn + paving)}</g>` +
  layer('house', house) + layer('heat-pump', hp) + layer('garden', garden) + layer('car', car) + '</svg>\n';
writeFileSync(new URL('../site/assets/home-hero.svg', import.meta.url), hero);
console.log('wrote site/assets/home-hero.svg,', (hero.length / 1024).toFixed(0), 'KB');

const i = process.argv.indexOf('--full');
if (i > 0 && process.argv[i + 1]) {
  const ground = lawn + `<rect x="0" y="${BOTTOM - 20}" width="${W}" height="60" fill="url(#lawnLit)" opacity="0.6"/>` + paving + street;
  const full = head(`0 0 ${W} ${H}`, W, H) + layer('sky', sky) + layer('background', bg) + layer('tree', tree) + layer('ground', ground) +
    layer('house', house) + layer('heat-pump', hp) + layer('garden', garden) + layer('car', car) + layer('foreground', front) + '</svg>\n';
  writeFileSync(process.argv[i + 1], full);
  console.log('wrote', process.argv[i + 1]);
}
