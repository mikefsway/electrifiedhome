// The picture at the top of the home page: an all-electric house at dusk,
// with solar panels, a heat pump and a car charging on the drive.
//
//   node scripts/hero-art.mjs              writes site/assets/home-hero.svg
//   node scripts/hero-art.mjs --full F     also writes the whole scene, with
//                                          sky, lawn and road, to F
//
// Each part is its own Inkscape layer (background, tree, house, heat-pump,
// garden, car), so the SVG can be opened and edited by hand. Running this
// script again overwrites hand edits. The hero version leaves out the sky and
// the ground: it stands on the green strip style.css draws under the navy band,
// and its bottom edge is the ground line. Foliage, gravel, fence slats and
// panel cells are generated; everything else is drawn directly, and the heat
// pump and car are modelled in 3D and projected through the house's camera.
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
  far: '#1a3346', hedge: '#1d4634', hedgeLit: '#28573d',
  treeDark: '#24502e', treeMid: '#3f7134', treeLit: '#8fa83f',
  brick: '#d45d2f', brickSide: '#b94a26', brickShade: '#a8411f',
  roof: '#1c2540', roofEdge: '#141a2e', ridge: '#2b3553',
  panel: '#1d3160', panelLine: '#6f8fcf',
  trim: '#f1ebdf', stone: '#eadfca',
  glass: '#f6c25a', glassHot: '#fde2a0', night: '#2b4373',
  door: '#1d2f5f', brass: '#e2b443', pipe: '#2a2f45',
  hp: '#e8ecf1', hpShade: '#c3cad4', fan: '#232a3b',
  lawn: '#3b7434', lawnLit: '#5b9440', path: '#b9b3a6', gravel: '#575c68',
  pave: '#848a98', road: '#262a38',
  car: '#f1f2f4', carShade: '#c6cbd4', carGlass: '#1e293d', tail: '#c4283a',
};

// ---------- sky ----------
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

// ---------- background: far trees, hedge, fence ----------
let bg = '';
bg += `<path fill="${C.far}" d="M1040,760 ${[1060, 1100, 1150, 1190, 1240, 1290, 1340, 1380, 1420, 1470, 1500].map((x, i) => `L${x},${700 + (i % 3) * 14 - (i % 2) * 18}`).join(' ')} L1500,800 L1040,800Z"/>`;
for (const [x, y, r] of [[1090, 712, 32], [1150, 700, 40], [1215, 715, 30], [1290, 705, 36], [1350, 712, 28], [1410, 700, 34]]) bg += `<path fill="${C.far}" d="${circ(x, y, r)}"/>`;
bg += `<ellipse cx="1452" cy="690" rx="22" ry="72" fill="${C.far}"/>`;
bg += `<rect x="1040" y="745" width="460" height="170" fill="${C.hedge}"/>`;
bg += `<path fill="${C.hedge}" d="${Array.from({ length: 24 }, (_, i) => circ(1045 + i * 20, 748 + rr(-3, 3), rr(10, 14))).join('')}"/>`;
bg += `<path fill="${C.hedgeLit}" opacity="0.6" d="${Array.from({ length: 140 }, () => circ(rr(1045, 1500), rr(752, 905), rr(3, 6))).join('')}"/>`;
// left: dark trees behind the fence
bg += clump({ cx: 120, cy: 610, rx: 150, ry: 110, r: 34, n: 40, tones: ['#173a2a', '#20462f', '#2f5a33'], light: [0.8, -0.5] });
// fence
let fence = `<rect x="0" y="712" width="252" height="172" fill="#8a5a3b"/>`;
for (let y = 718; y < 884; y += 14) fence += `<rect x="0" y="${y}" width="252" height="3" fill="#6b4329"/>`;
for (const x of [0, 86, 170, 246]) fence += `<rect x="${x}" y="702" width="9" height="184" fill="#6f472d"/><rect x="${x}" y="702" width="3" height="184" fill="#a06d49"/>`;
bg += fence;

// ---------- the big tree behind the house ----------
let tree = `<path fill="#3a2a20" d="M380,560 C390,470 395,420 388,380 L420,380 C412,430 418,480 430,560Z"/>`;
tree += clump({ cx: 300, cy: 330, rx: 210, ry: 190, r: 30, n: 150, tones: [C.treeDark, C.treeMid, C.treeLit], light: [0.75, -0.65], lit: 0.15 });
tree += clump({ cx: 470, cy: 190, rx: 150, ry: 130, r: 26, n: 90, tones: [C.treeDark, C.treeMid, C.treeLit], light: [0.75, -0.65], lit: 0.05 });
tree += clump({ cx: 180, cy: 470, rx: 120, ry: 90, r: 26, n: 60, tones: [C.treeDark, '#2f5f31', C.treeMid], light: [0.75, -0.65] });

// ---------- house ----------
let house = '';
// side (gable) wall and front wall
house += poly([[255, 912], [255, 505], [402, 262], [548, 470], [548, 912]], C.brickSide);
house += poly([[548, 470], [1050, 476], [1050, 912], [548, 912]], C.brick);
house += `<rect x="548" y="470" width="502" height="442" fill="url(#wallShade)"/>`;
house += poly([[255, 505], [402, 262], [548, 470], [548, 520], [402, 300], [255, 540]], C.brickShade, 'opacity="0.55"');
// roof: front slope, gable verge, ridge, fascia
house += poly([[400, 238], [918, 268], [1084, 482], [548, 466]], C.roof);
house += poly([[400, 238], [226, 500], [246, 508], [412, 254]], C.roofEdge);
house += poly([[400, 238], [548, 466], [540, 474], [394, 248]], C.roofEdge);
house += `<line x1="400" y1="238" x2="918" y2="268" stroke="${C.ridge}" stroke-width="8" stroke-linecap="round"/>`;
house += poly([[540, 464], [1086, 481], [1086, 496], [540, 479]], C.trim);
house += poly([[548, 479], [1050, 496], [1050, 512], [548, 494]], C.brickShade, 'opacity="0.5"');
// solar panels: a 5 x 4 grid laid on the slope by bilinear interpolation
{
  const q = { tl: [512, 290], tr: [880, 306], br: [998, 470], bl: [598, 460] };
  const at = (u, v) => {
    const top = [q.tl[0] + (q.tr[0] - q.tl[0]) * u, q.tl[1] + (q.tr[1] - q.tl[1]) * u];
    const bot = [q.bl[0] + (q.br[0] - q.bl[0]) * u, q.bl[1] + (q.br[1] - q.bl[1]) * u];
    return [f(top[0] + (bot[0] - top[0]) * v), f(top[1] + (bot[1] - top[1]) * v)];
  };
  let pv = poly([q.tl, q.tr, q.br, q.bl], C.panelLine);
  const g = 0.006;
  for (let i = 0; i < 5; i++) for (let j = 0; j < 4; j++) {
    const u0 = i / 5 + g, u1 = (i + 1) / 5 - g, v0 = j / 4 + g * 2, v1 = (j + 1) / 4 - g * 2;
    pv += poly([at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1)], 'url(#panel)');
  }
  house += `<g id="solar-panels">${pv}</g>`;
}
// downpipe
house += `<rect x="565" y="486" width="8" height="378" fill="${C.pipe}"/><rect x="560" y="482" width="18" height="10" fill="${C.pipe}"/>`;

function window({ x, y, w, h, lit = true, bars = 'cross', plant = false, lamp = false, side = false }) {
  const t = 7;
  let s = `<rect x="${x - 9}" y="${y - 17}" width="${w + 18}" height="${17}" fill="${C.stone}"/>`;
  s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${lit ? 'url(#glassLit)' : C.night}"/>`;
  if (lamp) for (const lx of [x + w * 0.3, x + w * 0.72]) s += `<line x1="${lx}" y1="${y}" x2="${lx}" y2="${y + h * 0.45}" stroke="#7a5a2a" stroke-width="1.5"/><circle cx="${lx}" cy="${y + h * 0.5}" r="${w * 0.065}" fill="${C.glassHot}"/>`;
  if (plant) {
    const px = x + w * 0.72, py = y + h - t;
    s += `<rect x="${px - 9}" y="${py - 14}" width="18" height="14" fill="#8a4a2a"/>`;
    s += `<path fill="${lit ? '#4c6b2c' : '#3d5a48'}" d="${[[-10, -24, 9], [0, -32, 10], [11, -24, 9], [-3, -20, 8]].map(([dx, dy, r]) => circ(px + dx, py + dy, r)).join('')}"/>`;
  }
  s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${C.trim}" stroke-width="${t}"/>`;
  if (bars === 'cross' || bars === 'mullion') s += `<rect x="${x + w / 2 - 3}" y="${y}" width="6" height="${h}" fill="${C.trim}"/>`;
  if (bars === 'cross') s += `<rect x="${x}" y="${y + h * 0.32 - 3}" width="${w}" height="6" fill="${C.trim}"/>`;
  s += `<rect x="${x - 11}" y="${y + h}" width="${w + 22}" height="11" fill="${C.stone}"/><rect x="${x - 11}" y="${y + h + 11}" width="${w + 22}" height="4" fill="${C.brickShade}" opacity="0.6"/>`;
  if (lit && !side) s += `<rect x="${x - 20}" y="${y - 20}" width="${w + 40}" height="${h + 50}" fill="url(#spill)" opacity="0.35"/>`;
  return s;
}
house += window({ x: 345, y: 528, w: 36, h: 87, bars: 'none', plant: true, side: true });
house += window({ x: 632, y: 516, w: 106, h: 98, lamp: true, plant: true });
house += window({ x: 880, y: 526, w: 77, h: 92, lit: false, plant: true });
house += window({ x: 612, y: 716, w: 140, h: 128, plant: true });
// lamp silhouette in the ground floor window
house += `<path fill="#c98a3a" d="M628,820 l10,-22 h16 l10,22z"/><rect x="644" y="820" width="4" height="18" fill="#7a5a2a"/>`;
// front door with fanlight, pediment, step, wall light
house += `<rect x="826" y="676" width="122" height="20" fill="${C.trim}"/><rect x="820" y="672" width="134" height="7" fill="${C.trim}"/>`;
house += `<rect x="838" y="696" width="88" height="214" fill="${C.trim}"/>`;
house += `<rect x="848" y="704" width="68" height="20" fill="url(#glassLit)"/>`;
house += `<rect x="846" y="732" width="72" height="176" fill="${C.door}"/>`;
house += `<rect x="878" y="752" width="7" height="44" rx="2" fill="${C.brass}"/><rect x="866" y="830" width="30" height="7" fill="${C.brass}"/><rect x="852" y="814" width="10" height="4" fill="${C.brass}"/>`;
house += `<rect x="830" y="906" width="104" height="8" fill="${C.stone}"/>`;
house += `<polygon points="815,742 790,840 842,840" fill="url(#lampGlow)"/><rect x="809" y="722" width="13" height="22" rx="2" fill="#1d2233"/>`;
// charger
house += `<rect x="1003" y="778" width="27" height="44" rx="5" fill="#252b3a"/><circle cx="1016.5" cy="796" r="7" fill="none" stroke="#48d46e" stroke-width="2.5"/>`;

// ---------- camera ----------
// The house is drawn in two-point perspective. Its edges meet at a left
// vanishing point near (-3150, 912) and a right one near (15000, 912), so the
// horizon is the ground line. This camera reproduces that view, so anything
// modelled in 3D below sits in the same perspective as the house. World units
// are metres: x along the front wall, y back into the plot, z up, with the
// origin at the front-left corner of the house at ground level.
const CAM = (() => {
  const vl = -3150, vr = 15000, cx = 750, hy = 912;
  const fl = Math.sqrt((vr - cx) * (cx - vl));
  const th = Math.atan(fl / (vr - cx));
  const oz = fl * 5.4 / (912 - 470); // the front-left corner is 5.4 m tall, 442 px
  return { fl, cx, hy, c: Math.cos(th), s: Math.sin(th), oz, ox: (548 - cx) / fl * oz };
})();
const P = (x, y, z) => {
  const xc = CAM.ox + x * CAM.c - y * CAM.s, zc = CAM.oz + x * CAM.s + y * CAM.c;
  return [f(CAM.cx + CAM.fl * xc / zc), f(CAM.hy - CAM.fl * z / zc)];
};
const face = (pts, fill, extra = '') => poly(pts.map((p) => P(...p)), fill, extra);
const ring = (fn, n = 48) => Array.from({ length: n }, (_, i) => fn((i / n) * Math.PI * 2));
const loop = (pts3, attrs) => `<polygon points="${pts3.map((p) => P(...p).join(',')).join(' ')}" ${attrs}/>`;
const smooth = (pts) => {
  let d = `M${pts[0]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    d += `C${f(p1[0] + (p2[0] - p0[0]) / 6)},${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)},${f(p2[1] - (p3[1] - p1[1]) / 6)} ${p2}`;
  }
  return d;
};

// ---------- heat pump, beside the side wall with its fan facing the street ----------
// the garden uplight's glow falls on the wall behind the unit
let hp = `<ellipse cx="430" cy="860" rx="150" ry="90" fill="url(#uplight)"/>`;
{
  const x0 = -1.12, x1 = -0.08, y0 = 0.7, y1 = 1.1, z0 = 0.14, z1 = 0.92;
  for (const x of [x0 + 0.12, x1 - 0.15]) hp += face([[x - 0.05, y0 + 0.04, 0], [x + 0.05, y0 + 0.04, 0], [x + 0.05, y0 + 0.04, z0], [x - 0.05, y0 + 0.04, z0]], '#4a5060');
  hp += face([[x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1]], C.hpShade);
  hp += face([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], C.hp);
  const fy = y0 - 0.004, fx = x0 + 0.4, fz = (z0 + z1) / 2, on = (r, a) => [fx + r * Math.cos(a), fy, fz + r * Math.sin(a)];
  hp += loop(ring((a) => on(0.31, a)), `fill="${C.fan}"`);
  for (let k = 0; k < 4; k++) {
    const a0 = k * Math.PI / 2;
    hp += `<polyline points="${Array.from({ length: 8 }, (_, i) => P(...on(0.05 + i * 0.033, a0 + i * 0.16)).join(',')).join(' ')}" fill="none" stroke="#4a536a" stroke-width="5" stroke-linecap="round"/>`;
  }
  for (const r of [0.12, 0.2, 0.28]) hp += loop(ring((a) => on(r, a)), 'fill="none" stroke="#3a4256" stroke-width="1"');
  hp += loop(ring((a) => on(0.05, a), 24), 'fill="#8a93a6"');
  hp += face([[x1 - 0.3, fy, 0.56], [x1 - 0.08, fy, 0.56], [x1 - 0.08, fy, 0.82], [x1 - 0.3, fy, 0.82]], C.hpShade);
}
// ---------- garden ----------
let garden = '';
// warm uplight glow

// flowering shrub by the fence
garden += clump({ cx: 190, cy: 790, rx: 62, ry: 100, r: 18, n: 40, tones: ['#1f4a2c', '#2f6034', '#4a7a3a'], light: [0.7, -0.7] });
garden += `<path fill="#f3eedc" d="${Array.from({ length: 45 }, () => circ(rr(140, 250), rr(700, 890), rr(2, 3.5))).join('')}"/>`;
// small tree
garden += `<path transform="translate(-64,0)" fill="#4a3426" d="M436,910 C438,860 430,820 444,770 L450,772 C440,820 448,860 446,910Z M440,840 C420,820 410,800 400,790 L404,786 C416,798 428,812 444,830Z"/>`;
garden += clump({ cx: 380, cy: 732, rx: 100, ry: 80, r: 20, n: 45, tones: ['#3d6a2e', '#6a9a3c', '#a8c25a'], light: [0.5, -0.85], lit: 0.1 });
// shrubs along the front
for (const [cx, cy, rx, ry] of [[590, 880, 42, 34], [665, 892, 40, 24], [745, 888, 48, 28], [130, 872, 60, 34]])
  garden += clump({ cx, cy, rx, ry, r: 13, n: 22, tones: ['#244f2c', '#3c6e35', '#5f8f42'], light: [0.6, -0.8] });
// lavender
for (let i = 0; i < 26; i++) {
  const x = rr(330, 400), y = rr(866, 900), hgt = rr(20, 38);
  garden += `<line x1="${f(x)}" y1="${f(y + 20)}" x2="${f(x + rr(-6, 6))}" y2="${f(y + 20 - hgt)}" stroke="#4a6a3a" stroke-width="1.5"/><ellipse cx="${f(x + rr(-5, 5))}" cy="${f(y + 18 - hgt)}" rx="3" ry="7" fill="#7c6fc0"/>`;
}
garden += `<path fill="#f3eedc" d="${Array.from({ length: 18 }, () => circ(rr(640, 700), rr(880, 900), rr(2, 3))).join('')}"/>`;
// pots by the door
for (const px of [808, 958]) {
  garden += `<path fill="#22283a" d="M${px - 20},866 h40 l-5,46 h-30z"/>`;
  garden += clump({ cx: px, cy: 838, rx: 18, ry: 32, r: 9, n: 18, tones: ['#2b5530', '#4a7a3a', '#6d9a48'], light: [0.5, -0.85] });
}

// ---------- car, nosed in on the drive with its back to the street ----------
let car = '';
{
  const x0 = 8.05, x1 = 9.9, yr = -5.0; // left side, right side, rear bumper
  const Y = (t) => yr + t; // t: metres forward from the rear
  const side = (pts, fill, xx = x0) => face(pts.map(([t, z]) => [xx, Y(t), z]), fill);
  const sideRing = (t, z, r, attrs, n = 40) => loop(ring((a) => [x0 - 0.01, Y(t) + r * Math.cos(a), z + r * Math.sin(a)], n), attrs);
  const carSide = '#cdd2da', carRear = '#f1f2f4', trim = '#2a2f3a';

  // left side: body profile, sill, arches, glass, pillars
  car += side([[0.02, 0.3], [0, 0.62], [0.03, 1.02], [0.42, 1.56], [0.6, 1.62], [2.85, 1.62], [3.05, 1.56], [3.6, 1.08], [4.36, 0.98], [4.48, 0.8], [4.5, 0.45], [4.44, 0.3]], carSide);
  car += side([[0.02, 0.3], [4.44, 0.3], [4.48, 0.46], [0, 0.46]], trim);
  for (const t of [0.85, 3.6]) car += sideRing(t, 0.36, 0.44, `fill="${trim}"`);
  car += side([[0.55, 1.1], [0.7, 1.5], [2.8, 1.52], [3.42, 1.1]], C.carGlass);
  car += side([[1.9, 1.08], [1.98, 1.08], [1.98, 1.53], [1.9, 1.53]], carSide);
  car += side([[2.25, 0.98], [2.45, 0.98], [2.45, 1.01], [2.25, 1.01]], '#9aa1ad');
  car += side([[0.95, 0.98], [1.15, 0.98], [1.15, 1.01], [0.95, 1.01]], '#9aa1ad');
  car += side([[0.28, 0.86], [0.42, 0.86], [0.42, 0.96], [0.28, 0.96]], '#9aa1ad'); // charge port
  for (const t of [0.85, 3.6]) {
    car += sideRing(t, 0.36, 0.36, 'fill="#181b22"');
    car += sideRing(t, 0.36, 0.21, 'fill="#9aa3ae"');
    car += sideRing(t, 0.36, 0.07, 'fill="#5c6470"', 16);
  }
  // rear: tailgate with its sloping glass, lights, plate, bumper
  const back = (x, t, z) => [x, Y(t), z];
  car += face([back(x0, 0.02, 0.3), back(x1, 0.02, 0.3), back(x1, 0, 0.62), back(x1, 0.03, 1.02), back(x1 - 0.1, 0.42, 1.56),
    back(x1 - 0.18, 0.6, 1.62), back(x0 + 0.18, 0.6, 1.62), back(x0 + 0.1, 0.42, 1.56), back(x0, 0.03, 1.02), back(x0, 0, 0.62)], carRear);
  car += face([back(x0 + 0.16, 0.1, 1.12), back(x1 - 0.16, 0.1, 1.12), back(x1 - 0.2, 0.38, 1.5), back(x0 + 0.2, 0.38, 1.5)], C.carGlass);
  car += face([back(x0 + 0.02, 0.02, 0.88), back(x0 + 0.4, 0.02, 0.88), back(x0 + 0.4, 0.02, 0.98), back(x0 + 0.02, 0.025, 1.0)], C.tail);
  car += face([back(x1 - 0.4, 0.02, 0.88), back(x1 - 0.02, 0.02, 0.88), back(x1 - 0.02, 0.025, 1.0), back(x1 - 0.4, 0.02, 0.98)], C.tail);
  car += face([back(x0 + 0.4, 0.02, 0.92), back(x1 - 0.4, 0.02, 0.92), back(x1 - 0.4, 0.02, 0.95), back(x0 + 0.4, 0.02, 0.95)], '#8a1c2a');
  const mx = (x0 + x1) / 2;
  car += face([back(mx - 0.26, 0.01, 0.5), back(mx + 0.26, 0.01, 0.5), back(mx + 0.26, 0.01, 0.62), back(mx - 0.26, 0.01, 0.62)], '#f6d13a');
  car += face([back(x0, 0.02, 0.3), back(x1, 0.02, 0.3), back(x1, 0.01, 0.44), back(x0, 0.01, 0.44)], trim);
  // charging cable: from the charger, down the wall, across the drive, up to the port
  const cable = [[1016.5, 822], P(6.72, -0.25, 0.03), P(7.3, -2.2, 0.03), P(7.85, -4.4, 0.05), P(x0 - 0.03, Y(0.35), 0.9)];
  car += `<path d="${smooth(cable)}" stroke="#1d2230" stroke-width="4" fill="none" stroke-linecap="round"/>`;
}

// ---------- ground ----------
let ground = '';
ground += `<rect x="0" y="905" width="${W}" height="${H - 905}" fill="${C.lawn}"/>`;
ground += `<rect x="0" y="905" width="1050" height="60" fill="url(#lawnLit)"/>`;
ground += poly([[1000, 908], [1500, 905], [1500, 972], [1240, 972]], C.gravel);
ground += `<path fill="#6b717d" d="${Array.from({ length: 260 }, () => circ(rr(1060, 1500), rr(912, 970), rr(0.8, 1.8))).join('')}"/>`;
ground += poly([[838, 910], [930, 910], [1250, 966], [1150, 966]], C.path);
ground += `<rect x="0" y="966" width="${W}" height="28" fill="${C.pave}"/><rect x="0" y="966" width="${W}" height="4" fill="#a2a8b4"/><rect x="0" y="990" width="${W}" height="5" fill="#5e6472"/>`;
ground += `<rect x="0" y="995" width="${W}" height="${H - 995}" fill="${C.road}"/>`;
// dark foreground shrubs
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

// The hero: no sky or ground, cropped at the ground line. The background and
// the big tree fade out at the sides so they don't end in a hard edge.
const GROUND = 912, TOP = 25;
const fade = `<defs><linearGradient id="edgeFade"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.06" stop-color="#fff"/><stop offset="0.94" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
<mask id="edges" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="url(#edgeFade)"/></mask></defs>`;
const hero = head(`0 ${TOP} ${W} ${GROUND - TOP}`, W, GROUND - TOP) + fade +
  `<g mask="url(#edges)">${layer('background', bg)}${layer('tree', tree)}</g>` +
  layer('house', house) + layer('heat-pump', hp) + layer('garden', garden) + layer('car', car) + '</svg>\n';
writeFileSync(new URL('../site/assets/home-hero.svg', import.meta.url), hero);
console.log('wrote site/assets/home-hero.svg,', (hero.length / 1024).toFixed(0), 'KB');

const i = process.argv.indexOf('--full');
if (i > 0 && process.argv[i + 1]) {
  const full = head(`0 0 ${W} ${H}`, W, H) + layer('sky', sky) + layer('background', bg) + layer('tree', tree) + layer('ground', ground) +
    layer('house', house) + layer('heat-pump', hp) + layer('garden', garden) + layer('car', car) + layer('foreground', front) + '</svg>\n';
  writeFileSync(process.argv[i + 1], full);
  console.log('wrote', process.argv[i + 1]);
}
