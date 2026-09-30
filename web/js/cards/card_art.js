// card_art.js -- a small painted vignette for each card, in the empty lower
// part of the card body. Only where there is room (enlarged cards, dialogs,
// reveal trays: CSS shows the slot there, and a container query hides it when
// the rules text leaves too little space); never in the resting hand or the
// tableau. Each card's picture is painted once, on a canvas, the first
// time its slot is actually on screen (IntersectionObserver), and cached per
// card id as a JPEG (a blob URL, encoded off the main thread) -- nothing is ever redrawn per frame.
//
// The scene comes from what the card is about (its name and rules text first:
// asteroids, oceans, cities, forests, mines, reactors...; else its first tag),
// with small variations seeded by the card id, so a card always gets the same
// picture.
import { gfx } from '../board/quality.js';
// Quality (quality.js): High paints in 12 ms slices as slots appear; Medium
// paints only when the browser is idle; Low paints nothing (the slot stays
// empty -- the card's text and layout are the same at every level).
// The scenes paint in a 360x180 logical space; the canvas itself is 2x-3x that
// (by devicePixelRatio: the slot shows at most ~230x115 CSS px), so edges and
// gradients stay crisp on any screen. Kept as JPEG (q 0.85), at most CACHE_MAX
// pictures (least recently used dropped: a repaint is cheap).
const W = 360, H = 180;
const CACHE_MAX = 160;
const SCALE = () => { const d = (typeof devicePixelRatio === 'number' && devicePixelRatio) || 1; return d <= 1.3 ? 2 : d <= 2.1 ? 2.5 : 3; };
const cache = new Map();                    // card id -> picture URL, blob: or data: (insertion order = recency)
function cacheGet(id) { const u = cache.get(id); cache.delete(id); cache.set(id, u); return u; }
function cacheSet(id, u) { cache.set(id, u); while (cache.size > CACHE_MAX) { const k = cache.keys().next().value, old = cache.get(k); cache.delete(k); if (old?.startsWith('blob:')) URL.revokeObjectURL(old); } }
let io = null;
const queue = [];
let pumping = false;

const TAGN = ['building', 'space', 'power', 'science', 'jovian', 'earth', 'plant', 'microbe', 'animal', 'city', 'event', 'wild'];

function srand(seed) { let s = (seed * 2654435761 + 12345) >>> 0; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

// ---------------------------------------------------------------- which scene
const BY_NAME = [                           // checked in order: what the card is about, by its name
  ['impact', /asteroid|comet|meteor|deimos|impactor|ice cap melting/],
  ['power', /nuclear|reactor|fusion|power|solar|wind|energy|generator|grid|tidal|thorium/],
  ['saturn', /\btitan\b|saturn/],                     // (Titan is Saturn's; 'titanium' is not)
  ['jovian', /jupiter|jovian|\bio\b|ganymede|europa|callisto/],
  ['earth', /earth|terran|luna\b|lunar/],
  ['ocean', /ocean|aquifer|lake|water|flood|reservoir|towing|arctic|polar|fish|ice|kelp/],
  ['volcano', /volcan|lava|mohole|magma|geothermal|thermal|greenhouse|heat/],
  ['microbe', /microbe|bacteri|algae|lichen|tardigrade|decomposer|nitrite|ants\b|worms|symbiotic|fungi|mycel|virus|gene|regolith eaters|extremophile/],
  ['animal', /birds|pets|predator|livestock|herbivore|animal|zoo|penguin|bees|small animals|ecological/],
  ['green', /forest|tree|greenery|kelp|grass|farm|plant|bush|soil|garden|agric|vegetation|valley|mangrove|biosphere|moss/],
  ['lab', /research|lab\b|laborator|science|university|institute|academy|physics|observatory|invention|designer/],
  ['city', /city|town|dome|habitat|urban|metropol|capital|settlement|housing|tower|arcology|immigra/],
  ['mine', /mine|mining|ore\b|quarry|rover|drill|smelt|steel|titanium|metal|industr|factory|foundry|robot/],
  ['space', /satellite|station|space|orbit|shuttle|rocket|launch|elevator|port\b|spacecraft|mirror|ship|trade|vessel|freight|haven|phobos|colony/],
];
const BY_TAG = { space: 'space', power: 'power', science: 'lab', jovian: 'jovian', earth: 'earth', plant: 'green', microbe: 'microbe', animal: 'animal', city: 'city', building: 'mine' };
// the corporations each get their own scene
const CORP = { 'tharsis republic': 'tharsis', 'saturn systems': 'saturn', ecoline: 'greenhouse', helion: 'sun', phobolog: 'phobos', credicor: 'tower',
  'mining guild': 'mine', teractor: 'teractor', thorgate: 'power', 'united nations mars initiative': 'unmi', inventrix: 'lab', 'interplanetary cinematics': 'cinema',
  'point luna': 'moon', 'valley trust': 'valley', vitor: 'stage', 'cheung shing mars': 'market', 'robinson industries': 'factory', 'beginner corporation': 'dawn' };
export function sceneOf(card) {
  const n = (card.name || '').toLowerCase(), d = `${card.description || ''}`.toLowerCase();
  if (card.type === 0) return CORP[n] || 'dawn';
  if (/callisto/.test(n)) return 'callisto';
  for (const [scene, re] of BY_NAME) if (re.test(n)) return scene;
  if (/place an? ocean/.test(d)) return 'ocean';
  if (/place a greenery/.test(d)) return 'green';
  if (/place a city/.test(d)) return 'city';
  if (card.type === 4) return 'dawn';                 // preludes: a Martian dawn unless the name says more
  for (const t of card.tags || []) { const sc = BY_TAG[TAGN[t]]; if (sc) return sc; }
  if (card.type === 3) return 'impact';
  return 'dusk';
}

// ---------------------------------------------------------------- painting helpers
// colours: '#rrggbb' -> rgba() with alpha, and mixes
const hexRGB = (h) => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const rgba = (h, a = 1) => { const [r, g, b] = hexRGB(h); return `rgba(${r},${g},${b},${a})`; };
const mix = (h1, h2, t, a = 1) => { const A = hexRGB(h1), B = hexRGB(h2); return `rgba(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')},${a})`; };
const lin = (g, x0, y0, x1, y1, stops) => { const gr = g.createLinearGradient(x0, y0, x1, y1); for (const [t, c] of stops) gr.addColorStop(t, c); return gr; };
const rad = (g, x0, y0, r0, x1, y1, r1, stops) => { const gr = g.createRadialGradient(x0, y0, r0, x1, y1, r1); for (const [t, c] of stops) gr.addColorStop(t, c); return gr; };

// a sky: gradient stops [[t, colour], ...] top to bottom, and a soft horizon haze at hy (fraction)
function sky(g, stops, hy = 0, haze = null) {
  g.fillStyle = lin(g, 0, 0, 0, H, stops); g.fillRect(0, 0, W, H);
  if (haze) { g.fillStyle = lin(g, 0, H * hy - 40, 0, H * hy + 30, [[0, rgba(haze, 0)], [0.6, rgba(haze, 0.45)], [1, rgba(haze, 0)]]); g.fillRect(0, H * hy - 40, W, 70); }
}
// stars: small soft points, a few bright ones with a halo and cross glint
function stars(g, r, n, a = 0.8, ymax = 0.85) {
  for (let i = 0; i < n; i++) {
    const x = r() * W, y = r() * H * ymax, big = r() < 0.07, s = big ? 1.1 : 0.35 + r() * 0.55, al = (0.3 + r() * 0.7) * a;
    const tint = r(); const c = tint < 0.2 ? '200,220,255' : tint < 0.35 ? '255,225,200' : '255,250,245';
    if (big) { glow(g, x, y, 5, `rgba(${c},A)`, al * 0.5); g.strokeStyle = `rgba(${c},${al * 0.35})`; g.lineWidth = 0.5; g.beginPath(); g.moveTo(x - 5, y); g.lineTo(x + 5, y); g.moveTo(x, y - 5); g.lineTo(x, y + 5); g.stroke(); }
    g.fillStyle = `rgba(${c},${al})`; g.beginPath(); g.arc(x, y, s, 0, 7); g.fill();
  }
}
// a soft round glow; col has 'A' where the alpha goes
function glow(g, x, y, rr, col, a = 1) {
  g.fillStyle = rad(g, x, y, 0, x, y, rr, [[0, col.replace('A', a)], [0.35, col.replace('A', a * 0.45)], [1, col.replace('A', 0)]]);
  g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
}
// a smooth curve through points (quadratic through the midpoints)
function curve(g, pts, move = true) {
  if (move) g.moveTo(pts[0][0], pts[0][1]); else g.lineTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length - 1; i++) g.quadraticCurveTo(pts[i][0], pts[i][1], (pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2);
  const l = pts[pts.length - 1]; g.lineTo(l[0], l[1]);
}
// a ridge line across the picture at height y (fraction), amplitude amp (px): smooth, noise-shaped
function ridgePts(r, y, amp, rough = 1, step = 14) {
  const ph = [r() * 6, r() * 6, r() * 6, r() * 6], pts = [];
  for (let x = -step; x <= W + step; x += step) {
    const t = x / W;
    const v = Math.sin(t * 3.1 + ph[0]) * 0.55 + Math.sin(t * 7.3 + ph[1]) * 0.3 * rough + Math.sin(t * 15.7 + ph[2]) * 0.12 * rough + Math.sin(t * 31 + ph[3]) * 0.04 * rough;
    pts.push([x, H * y - v * amp]);
  }
  return pts;
}
// a lit ridge: gradient body (lighter at its crest), a rim of light along the crest from the light colour
function ridge(g, r, y, amp, col, o = {}) {
  const pts = o.pts || ridgePts(r, y, amp, o.rough ?? 1), top = Math.min(...pts.map((p) => p[1]));
  g.beginPath(); curve(g, pts); g.lineTo(W + 20, H + 2); g.lineTo(-20, H + 2); g.closePath();
  g.fillStyle = lin(g, 0, top, 0, Math.min(H, top + (o.depth ?? 60)), [[0, o.lit ? mix(col, o.lit, 0.28) : col], [1, o.dark || mix(col, '#000000', 0.35)]]);
  g.fill();
  if (o.rim) { g.save(); g.beginPath(); curve(g, pts); g.strokeStyle = o.rim; g.lineWidth = o.rimW ?? 1.2; g.stroke(); g.restore(); }
  return pts;
}
// the height of a ridge's points at x
function ridgeY(pts, x) { for (let i = 1; i < pts.length; i++) if (pts[i][0] >= x) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; return y0 + (y1 - y0) * (x - x0) / (x1 - x0); } return pts[pts.length - 1][1]; }
// atmospheric haze over what is already drawn, fading up from y1 to y0
function haze(g, y0, y1, col, a) { g.fillStyle = lin(g, 0, y0, 0, y1, [[0, rgba(col, 0)], [1, rgba(col, a)]]); g.fillRect(0, y0, W, y1 - y0); }
// a planet / moon: paint(g) draws its surface inside the clip; lit from light [x, y] (unit-ish);
// soft terminator, limb darkening, a rim of light on the lit limb, an optional atmosphere
function sphere(g, x, y, R, paint, o = {}) {
  const L = o.light || [-0.6, -0.55], ln = Math.hypot(L[0], L[1]) || 1, lx = L[0] / ln, ly = L[1] / ln, night = o.night ?? 0.9;
  if (o.atm) g.fillStyle = rad(g, x, y, R * 0.92, x, y, R * (1.28 + (o.atmW ?? 0)), [[0, rgba(o.atm, 0.55)], [0.3, rgba(o.atm, 0.22)], [1, rgba(o.atm, 0)]]), g.fillRect(x - R * 1.5, y - R * 1.5, R * 3, R * 3);
  g.save(); g.beginPath(); g.arc(x, y, R, 0, Math.PI * 2); g.clip();
  paint(g);
  // day / night: a gradient across the light direction, soft at the terminator
  const t0 = o.term ?? 0.1;
  g.fillStyle = lin(g, x + lx * R, y + ly * R, x - lx * R, y - ly * R, [[0, 'rgba(0,0,0,0)'], [0.42 + t0, 'rgba(0,0,0,0.08)'], [0.62 + t0, `rgba(2,3,10,${night * 0.8})`], [1, `rgba(2,3,10,${night})`]]);
  g.fillRect(x - R, y - R, R * 2, R * 2);
  // the highlight, and darkening toward the limb
  g.fillStyle = rad(g, x + lx * R * 0.45, y + ly * R * 0.45, 0, x + lx * R * 0.45, y + ly * R * 0.45, R * 0.9, [[0, `rgba(255,248,235,${o.spec ?? 0.16})`], [1, 'rgba(255,248,235,0)']]);
  g.fillRect(x - R, y - R, R * 2, R * 2);
  g.fillStyle = rad(g, x, y, R * 0.55, x, y, R, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.38)']]);
  g.fillRect(x - R, y - R, R * 2, R * 2);
  if (o.atm) { g.fillStyle = rad(g, x, y, R * 0.8, x, y, R, [[0, rgba(o.atm, 0)], [1, rgba(o.atm, 0.45)]]); g.fillRect(x - R, y - R, R * 2, R * 2); }
  g.restore();
  // the rim of light on the lit limb
  const a0 = Math.atan2(ly, lx);
  g.save(); g.lineCap = 'round';
  for (const [w, al] of [[Math.min(R * 0.07, 4), 0.1], [Math.min(R * 0.022, 1.4), 0.42]]) { g.strokeStyle = rgba(o.rim || '#fff4e0', al); g.lineWidth = w; g.beginPath(); g.arc(x, y, R - w * 0.4, a0 - 1.15, a0 + 1.15); g.stroke(); }
  g.restore();
}
// a soft cloud / smoke billow: overlapping radial puffs along a line
function billow(g, r, x, y, w, h, col, a, n = 7) {
  for (let i = 0; i < n; i++) {
    const px = x + (r() - 0.5) * w, py = y + (r() - 0.5) * h, pr = (0.35 + r() * 0.45) * Math.max(w, h) * 0.5;
    g.fillStyle = rad(g, px, py - pr * 0.2, 0, px, py, pr, [[0, rgba(col, a)], [0.6, rgba(col, a * 0.5)], [1, rgba(col, 0)]]);
    g.fillRect(px - pr, py - pr, pr * 2, pr * 2);
  }
}
// a glass dome on the ground at (x, y): tinted, with an inner glow, a frame and a bright reflection
function dome(g, x, y, rr, o = {}) {
  const h = rr * (o.h ?? 0.8);
  g.save(); g.beginPath(); g.ellipse(x, y, rr, h, 0, Math.PI, 0); g.closePath(); g.clip();
  g.fillStyle = lin(g, x, y - h, x, y, [[0, rgba(o.tint || '#bfe6ff', 0.26)], [1, rgba(o.tint || '#bfe6ff', 0.1)]]); g.fillRect(x - rr, y - h, rr * 2, h);
  if (o.inner) o.inner(g);
  if (o.lit) glow(g, x, y - h * 0.2, rr * 1.1, o.lit, 0.55);
  g.restore();
  g.strokeStyle = 'rgba(225,240,255,0.28)'; g.lineWidth = 0.7;
  for (let i = 1; i < 5; i++) { g.beginPath(); g.ellipse(x, y, rr * i / 5, h, 0, Math.PI, 0); g.stroke(); }
  for (let i = 1; i < 3; i++) { g.beginPath(); g.ellipse(x, y - h * i / 3, rr * Math.sqrt(1 - (i / 3) ** 2), h * 0.14 * (1 - i / 3), 0, 0, Math.PI * 2); g.stroke(); }
  g.strokeStyle = 'rgba(235,248,255,0.55)'; g.lineWidth = 1.1; g.beginPath(); g.ellipse(x, y, rr, h, 0, Math.PI, 0); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = rr * 0.06; g.lineCap = 'round'; g.beginPath(); g.ellipse(x, y, rr * 0.82, h * 0.82, 0, Math.PI * 1.18, Math.PI * 1.42); g.stroke();
}
// a building face with its lit windows: a vertical gradient, a lit edge, a window grid
function tower(g, r, x, base, w, h, o = {}) {
  const c = o.col || '#232638';
  g.fillStyle = lin(g, x, 0, x + w, 0, [[0, mix(c, o.lit || '#ffb080', 0.18)], [0.35, c], [1, mix(c, '#000000', 0.35)]]);
  g.beginPath();
  if (o.round) { g.moveTo(x, base); g.lineTo(x, base - h + w / 2); g.arc(x + w / 2, base - h + w / 2, w / 2, Math.PI, 0); g.lineTo(x + w, base); }
  else if (o.spire) { g.moveTo(x, base); g.lineTo(x, base - h); g.lineTo(x + w / 2, base - h - o.spire); g.lineTo(x + w, base - h); g.lineTo(x + w, base); }
  else g.rect(x, base - h, w, h);
  g.fill();
  g.fillStyle = rgba(o.lit || '#ffb080', 0.35); g.fillRect(x, base - h + (o.round ? w / 2 : 0), 0.8, h - (o.round ? w / 2 : 0));
  const wc = o.win || '255,214,150', dens = o.dens ?? 0.4;
  for (let yy = base - h + 4 + (o.round ? w / 2 : 0); yy < base - 3; yy += 4.5) for (let xx = x + 2; xx < x + w - 2; xx += 3.6) if (r() < dens) { g.fillStyle = `rgba(${wc},${0.45 + r() * 0.55})`; g.fillRect(xx, yy, 1.8, 1.6); }
}
// painterly finish: soft translucent brush strokes, a vignette and a fine grain
let grainPat = null;
function finish(g, r, cols, n = 26) {
  g.save(); g.globalCompositeOperation = 'soft-light'; g.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    g.strokeStyle = cols[i % cols.length]; g.globalAlpha = 0.04 + r() * 0.07; g.lineWidth = 8 + r() * 18;
    const x = r() * W, y = r() * H, a = (r() - 0.5) * 0.7, L = 40 + r() * 80;
    g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + Math.cos(a) * L * 0.33, y + Math.sin(a) * L * 0.33 + (r() - 0.5) * 14, x + Math.cos(a) * L * 0.66, y + Math.sin(a) * L * 0.66 + (r() - 0.5) * 14, x + Math.cos(a) * L, y + Math.sin(a) * L); g.stroke();
  }
  g.restore();
  g.fillStyle = rad(g, W / 2, H * 0.52, H * 0.45, W / 2, H * 0.52, W * 0.62, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.32)']]); g.fillRect(0, 0, W, H);
  if (!grainPat) {                                               // one fixed noise tile, offset per card
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d'), id = x.createImageData(128, 128), rr = srand(99);
    for (let i = 0; i < id.data.length; i += 4) { const v = 128 + (rr() - 0.5) * 120; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
    x.putImageData(id, 0, 0); grainPat = c;
  }
  g.save(); g.globalCompositeOperation = 'overlay'; g.globalAlpha = 0.09;
  const p = g.createPattern(grainPat, 'repeat'); p.setTransform?.(new DOMMatrix().translate(r() * 128, r() * 128).scale(0.5)); g.fillStyle = p; g.fillRect(0, 0, W, H);
  g.restore();
}

// ---------------------------------------------------------------- scenes
const SCENES = {
  impact(g, r) {
    sky(g, [[0, '#0a0610'], [0.45, '#261018'], [0.8, '#5e2216'], [1, '#8a3816']], 0.72, '#b0502a');
    stars(g, r, 60, 0.55, 0.55);
    ridge(g, r, 0.7, 7, '#5a2a22', { lit: '#c06040', rough: 0.7, depth: 30 });
    haze(g, H * 0.55, H * 0.75, '#a0482a', 0.35);
    const x0 = W * (0.66 + r() * 0.28), y0 = -24, x1 = W * (0.2 + r() * 0.28), y1 = H * (0.68 + r() * 0.05);
    const ang = Math.atan2(y1 - y0, x1 - x0), L = Math.hypot(x1 - x0, y1 - y0);
    // the trail: tapering plasma streaks, brightest at the head
    g.save(); g.translate(x1, y1); g.rotate(ang); g.globalCompositeOperation = 'lighter';
    for (const [w, a, c] of [[22, 0.16, '255,120,60'], [11, 0.3, '255,180,110'], [4.5, 0.75, '255,236,200'], [1.6, 1, '255,255,245']]) {
      g.fillStyle = lin(g, -L, 0, 0, 0, [[0, `rgba(${c},0)`], [0.65, `rgba(${c},${a * 0.45})`], [1, `rgba(${c},${a})`]]);
      g.beginPath(); g.moveTo(-L, 0); g.quadraticCurveTo(-L * 0.35, -w, 0, -w * 0.5); g.arc(0, 0, w * 0.5, -Math.PI / 2, Math.PI / 2); g.quadraticCurveTo(-L * 0.35, w, -L, 0); g.fill();
    }
    for (let i = 0; i < 16; i++) { const t = r(), d = (r() - 0.5) * 14 * t; g.fillStyle = `rgba(255,${190 + r() * 60 | 0},140,${0.6 * (1 - t)})`; g.beginPath(); g.arc(-t * L * 0.5, d, 0.6 + r() * 0.9, 0, 7); g.fill(); }   // sparks shed
    g.restore();
    // the flash and shock ring, dust thrown up
    glow(g, x1, y1, 90, 'rgba(255,170,90,A)', 0.55); glow(g, x1, y1, 26, 'rgba(255,245,225,A)', 1);
    g.strokeStyle = 'rgba(255,220,170,0.45)'; g.lineWidth = 1.4; g.beginPath(); g.ellipse(x1, y1 + 3, 46, 7, 0, 0, Math.PI * 2); g.stroke();
    billow(g, r, x1, y1 - 10, 60, 18, '#c07050', 0.28, 9);
    ridge(g, r, 0.86, 9, '#2c120c', { lit: '#ff9050', rim: 'rgba(255,170,100,0.55)', depth: 40 });
    ridge(g, r, 0.97, 6, '#150806', { rim: 'rgba(255,140,80,0.35)', depth: 20 });
    glow(g, x1, H, 130, 'rgba(255,100,40,A)', 0.2);
  },
  jovian(g, r) {
    sky(g, [[0, '#05060d'], [1, '#12101a']]); stars(g, r, 80);
    const cx = W * (0.3 + r() * 0.4), cy = H * (1.02 + r() * 0.12), R = H * (0.78 + r() * 0.15), tilt = (r() - 0.5) * 0.25;
    sphere(g, cx, cy, R, (g) => {
      g.save(); g.translate(cx, cy); g.rotate(tilt);
      const cols = ['#d9b894', '#efe0c4', '#a8744e', '#e2c8a2', '#c08a60', '#f2e6d0', '#b07e58', '#dcc4a0'];
      for (let i = -9; i <= 9; i++) {                                                         // wavy belts and zones
        const y = i * R / 9, h = R / 9 + 1, c = cols[(i + 9 + (r() * 2 | 0)) % cols.length];
        g.fillStyle = lin(g, 0, y - h, 0, y + h, [[0, rgba(c, 0)], [0.3, c], [0.7, c], [1, rgba(c, 0)]]);
        g.beginPath(); const ph = r() * 6, amp = 1.2 + r() * 2;
        const top = [], bot = []; for (let x = -R; x <= R; x += R / 8) { top.push([x, y - h * 0.8 + Math.sin(x / R * 9 + ph) * amp]); bot.push([x, y + h * 0.8 + Math.sin(x / R * 7 + ph + 1) * amp]); }
        curve(g, top); curve(g, bot.reverse(), false); g.closePath(); g.fill();
      }
      for (let i = 0; i < 40; i++) {                                                          // turbulent streaks and ovals
        const x = (r() - 0.5) * R * 2, y = (r() - 0.5) * R * 1.6, w = 6 + r() * 26;
        g.strokeStyle = r() < 0.5 ? 'rgba(255,245,230,0.22)' : 'rgba(120,70,40,0.22)'; g.lineWidth = 0.8 + r() * 1.4; g.lineCap = 'round';
        g.beginPath(); g.moveTo(x - w, y); g.quadraticCurveTo(x, y + (r() - 0.5) * 5, x + w, y + (r() - 0.5) * 3); g.stroke();
      }
      const sx = (r() - 0.5) * R * 0.7, sy = -R * 0.52;                                     // the Great Red Spot
      g.fillStyle = rad(g, sx, sy, 0, sx, sy, R * 0.14, [[0, '#c0543a'], [0.6, '#b8603e'], [1, 'rgba(210,140,100,0)']]);
      g.beginPath(); g.ellipse(sx, sy, R * 0.15, R * 0.075, 0, 0, 7); g.fill();
      g.strokeStyle = 'rgba(245,220,190,0.4)'; g.lineWidth = 1; g.beginPath(); g.ellipse(sx, sy, R * 0.17, R * 0.085, 0, 0, 7); g.stroke();
      g.restore();
    }, { light: [-0.5, -0.9], night: 0.92, rim: '#ffe8c8' });
    // a moon, and its shadow on the clouds
    const mx = W * (r() < 0.5 ? 0.14 : 0.86), my = H * (0.2 + r() * 0.18), mr = 7 + r() * 5, mc = ['#d8c890', '#cfd6dc', '#8a7f74'][r() * 3 | 0];
    sphere(g, mx, my, mr, (g) => { g.fillStyle = mc; g.fillRect(mx - mr, my - mr, mr * 2, mr * 2); for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(60,40,30,0.25)'; g.beginPath(); g.arc(mx + (r() - 0.5) * mr * 1.6, my + (r() - 0.5) * mr * 1.6, mr * (0.1 + r() * 0.2), 0, 7); g.fill(); } }, { light: [-0.5, -0.9], night: 0.85 });
  },
  earth(g, r) {
    sky(g, [[0, '#03050b'], [1, '#080b16']]); stars(g, r, 110);
    const cx = W * (0.3 + r() * 0.4), cy = H * 0.66, R = H * 0.46;
    sphere(g, cx, cy, R, (g) => {
      g.fillStyle = rad(g, cx - R * 0.3, cy - R * 0.3, 0, cx, cy, R, [[0, '#2f78c8'], [1, '#0f3470']]); g.fillRect(cx - R, cy - R, R * 2, R * 2);
      for (let i = 0; i < 5; i++) {                                                           // continents: smooth blobs, green to desert
        const x = cx + (r() - 0.5) * R * 1.5, y = cy + (r() - 0.5) * R * 1.3, s = R * (0.2 + r() * 0.3), pts = [];
        for (let k = 0; k < 11; k++) { const a = k / 10 * Math.PI * 2, rr = s * (0.6 + r() * 0.5); pts.push([x + Math.cos(a) * rr * 1.3, y + Math.sin(a) * rr * 0.8]); }
        pts.push(pts[0], pts[1]);
        g.fillStyle = rad(g, x, y, 0, x, y, s * 1.3, [[0, '#a89660'], [0.45, '#5a8a44'], [1, '#3a6a36']]);
        g.beginPath(); curve(g, pts); g.closePath(); g.fill();
      }
      g.fillStyle = 'rgba(245,250,255,0.85)'; g.beginPath(); g.ellipse(cx, cy - R * 0.97, R * 0.5, R * 0.12, 0, 0, 7); g.fill();     // polar cap
      for (let i = 0; i < 16; i++) {                                                          // cloud swirls
        const x = cx + (r() - 0.5) * R * 1.9, y = cy + (r() - 0.5) * R * 1.8, w = R * (0.15 + r() * 0.35);
        const a = 0.12 + r() * 0.16, bw = 2 + r() * 4, c1 = 6 * r(), c2 = 6 * r(); g.lineCap = 'round';
        for (const [lw, al] of [[bw * 2.6, a * 0.35], [bw * 1.5, a * 0.6], [bw * 0.7, a]]) { g.strokeStyle = `rgba(250,252,255,${al})`; g.lineWidth = lw; g.beginPath(); g.moveTo(x - w, y); g.bezierCurveTo(x - w * 0.3, y - c1, x + w * 0.3, y + c2, x + w, y - 2); g.stroke(); }
      }
    }, { light: [-0.75, -0.45], atm: '#6fb4ff', atmW: -0.12, night: 0.93, rim: '#cfe8ff', spec: 0.25 });
    // city lights on the night side
    g.save(); g.beginPath(); g.arc(cx, cy, R * 0.98, 0, 7); g.clip();
    for (let i = 0; i < 70; i++) { const a = r() * 7, d = Math.sqrt(r()) * R, x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d; if ((x - cx) * 0.75 + (y - cy) * 0.45 < R * 0.35) continue; g.fillStyle = `rgba(255,200,120,${0.3 + r() * 0.5})`; g.fillRect(x, y, 0.9, 0.9); }
    g.restore();
    sphere(g, cx + R * 1.35 * (cx < W / 2 ? 1 : -1), H * 0.24, 6, (g) => { g.fillStyle = '#b8b4ae'; g.fillRect(0, 0, W, H); }, { light: [-0.75, -0.45] });
  },
  ocean(g, r) {
    sky(g, [[0, '#23243a'], [0.45, '#7a5a64'], [0.62, '#d49a74'], [0.7, '#f0c090']]);
    const sx = W * (0.25 + r() * 0.5), sy = H * 0.56;
    glow(g, sx, sy, 110, 'rgba(255,200,150,A)', 0.55); glow(g, sx, sy, 14, 'rgba(255,248,230,A)', 1);
    billow(g, r, W * 0.5, H * 0.28, W, 20, '#e8a888', 0.18, 8);
    ridge(g, r, 0.6, 9, '#7a4a44', { lit: '#f0a070', rough: 0.6, depth: 16 });
    haze(g, H * 0.48, H * 0.62, '#f0b890', 0.4);
    const wy = H * 0.62;
    g.fillStyle = lin(g, 0, wy, 0, H, [[0, '#6a7a94'], [0.25, '#3c6488'], [1, '#12283e']]); g.fillRect(0, wy, W, H - wy);
    // the sun's path on the water and the swell lines
    g.save(); g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 70; i++) { const y = wy + 1 + Math.pow(r(), 1.6) * (H - wy), sp = 6 + (y - wy) * 0.6, x = sx + (r() - 0.5) * sp * 2, w = 2 + r() * 10 * (1 + (y - wy) / 40);
      g.strokeStyle = `rgba(255,${200 + r() * 40 | 0},160,${0.5 * (1 - Math.abs(x - sx) / (sp + 1))})`; g.lineWidth = 0.7 + (y - wy) / 60; g.beginPath(); g.moveTo(x - w / 2, y); g.lineTo(x + w / 2, y); g.stroke(); }
    g.restore();
    g.strokeStyle = 'rgba(200,225,245,0.18)'; g.lineWidth = 0.8;
    for (let i = 0; i < 18; i++) { const y = wy + 4 + Math.pow(i / 18, 1.5) * (H - wy), x = r() * W, w = 20 + r() * 60 * (y - wy) / 30; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + w / 2, y - 1.5, x + w, y); g.stroke(); }
    // a rocky headland in front, lit along its edge
    const pts = [[-10, H * 0.66], [W * 0.08, H * 0.64], [W * 0.17, H * 0.7], [W * 0.22, H * 0.8], [W * 0.3, H * 0.92], [W * 0.34, H + 4]];
    g.beginPath(); curve(g, pts); g.lineTo(-10, H + 4); g.closePath(); g.fillStyle = lin(g, 0, H * 0.64, 0, H, [[0, '#6a3a2a'], [1, '#2a140e']]); g.fill();
    g.beginPath(); curve(g, pts); g.strokeStyle = 'rgba(255,190,140,0.5)'; g.lineWidth = 1.2; g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1; g.beginPath(); g.moveTo(W * 0.2, H * 0.78); g.quadraticCurveTo(W * 0.26, H * 0.84, W * 0.31, H * 0.93); g.stroke();   // surf
  },
  volcano(g, r) {
    sky(g, [[0, '#0e070a'], [0.5, '#2e1210'], [1, '#6a2410']], 0.8, '#90401c'); stars(g, r, 28, 0.45, 0.4);
    const cx = W * (0.38 + r() * 0.24), top = H * 0.36, base = H * 0.96;
    // the ash plume, lit from below
    for (let i = 0; i < 7; i++) billow(g, r, cx + i * 9 + (r() - 0.5) * 10, top - 12 - i * 13, 36 + i * 9, 16, i < 2 ? '#a0503a' : '#4a3a38', 0.3, 4);
    // a shield volcano: long smooth flanks, the caldera
    const flank = (s) => [[cx - W * 0.6 * s, base + 4], [cx - W * 0.3 * s, base - H * 0.12], [cx - W * 0.12, top + H * 0.14], [cx - 16, top + 2], [cx, top], [cx + 16, top + 2], [cx + W * 0.12, top + H * 0.14], [cx + W * 0.3 * s, base - H * 0.12], [cx + W * 0.6 * s, base + 4]];
    const pts = flank(1);
    g.beginPath(); curve(g, pts); g.closePath(); g.fillStyle = lin(g, cx - 60, top, cx + 80, base, [[0, '#4a2418'], [0.5, '#2c140e'], [1, '#160a08']]); g.fill();
    g.beginPath(); curve(g, pts.slice(0, 5)); g.strokeStyle = 'rgba(255,140,70,0.35)'; g.lineWidth = 1.2; g.stroke();
    glow(g, cx, top, 70, 'rgba(255,120,40,A)', 0.75); glow(g, cx, top + 1, 14, 'rgba(255,230,160,A)', 1);
    // lava rivers: glowing, branching, fading as they cool
    g.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const dir = i < 2 ? -1 : 1, x0 = cx + dir * (4 + r() * 8), ex = cx + dir * (40 + r() * 100), ey = base - r() * 20;
      for (const [w, c] of [[6, 'rgba(255,90,20,0.25)'], [2.6, 'rgba(255,150,50,0.9)'], [0.9, 'rgba(255,240,180,0.95)']]) {
        g.strokeStyle = c; g.lineWidth = w; g.beginPath(); g.moveTo(x0, top + 3); g.bezierCurveTo(x0 + dir * 10, top + 30, ex - dir * 40 + (r() - 0.5) * 20, ey - 50, ex, ey); g.stroke();
      }
    }
    for (let i = 0; i < 26; i++) { const a = -Math.PI / 2 + (r() - 0.5) * 1.4, d = 8 + r() * 44; g.fillStyle = `rgba(255,${160 + r() * 90 | 0},90,${0.5 + r() * 0.5})`; g.beginPath(); g.arc(cx + Math.cos(a) * d, top + Math.sin(a) * d, 0.5 + r() * 1.1, 0, 7); g.fill(); }   // embers
    ridge(g, r, 0.98, 5, '#0e0605', { rim: 'rgba(255,120,60,0.3)', depth: 10 });
  },
  power(g, r, card) {
    const nuke = /nuclear|reactor|fusion|thorium/i.test(card.name), solar = /solar|mirror/i.test(card.name);
    sky(g, [[0, '#18223c'], [0.5, '#5a4460'], [0.78, '#c07a58'], [1, '#e0a070']], 0.78, '#f0b080');
    const sx = W * (0.25 + r() * 0.5); glow(g, sx, H * 0.7, 90, 'rgba(255,215,170,A)', 0.55);
    ridge(g, r, 0.74, 8, '#6a3a30', { lit: '#f0a070', rough: 0.6, depth: 20 });
    haze(g, H * 0.6, H * 0.78, '#e8a078', 0.3);
    const gy = H * 0.84, gnd = ridge(g, r, 0.84, 4, '#3a2018', { lit: '#c07050', rim: 'rgba(255,190,140,0.4)', rough: 0.4 });
    if (nuke) {
      for (let i = 0; i < 2; i++) {                                                           // cooling towers: hyperboloid shells, lit from the sun
        const x = W * (0.28 + i * 0.24), w = 40 - i * 6, h = 70 - i * 10, b = ridgeY(gnd, x) + 2;
        g.beginPath(); g.moveTo(x - w / 2, b); g.bezierCurveTo(x - w * 0.28, b - h * 0.55, x - w * 0.3, b - h * 0.8, x - w * 0.36, b - h); g.lineTo(x + w * 0.36, b - h); g.bezierCurveTo(x + w * 0.3, b - h * 0.8, x + w * 0.28, b - h * 0.55, x + w / 2, b); g.closePath();
        g.fillStyle = lin(g, x - w / 2, 0, x + w / 2, 0, [[0, '#b8aca4'], [0.35, '#9a908a'], [1, '#4a4448']]); g.fill();
        g.strokeStyle = 'rgba(80,70,70,0.3)'; g.lineWidth = 0.6; for (let k = 1; k < 4; k++) { g.beginPath(); g.moveTo(x - w * 0.34, b - h * k / 4); g.lineTo(x + w * 0.34, b - h * k / 4); g.stroke(); }
        g.fillStyle = rgba('#2a2428', 0.9); g.beginPath(); g.ellipse(x, b - h, w * 0.36, 2.4, 0, 0, 7); g.fill();
        for (let k = 0; k < 6; k++) billow(g, r, x + k * 8, b - h - 10 - k * 11, 22 + k * 7, 12, '#f2eee8', 0.3 - k * 0.03, 3);
      }
      g.fillStyle = lin(g, 0, gy - 18, 0, gy, [[0, '#8a8488'], [1, '#5a5458']]); g.fillRect(W * 0.62, gy - 18, 44, 18); g.fillStyle = rgba('#dfe8e8', 0.9);
      g.beginPath(); g.ellipse(W * 0.62 + 22, gy - 18, 16, 12, 0, Math.PI, 0); g.fill();                         // the reactor dome
      glow(g, W * 0.62 + 22, gy - 8, 30, 'rgba(120,255,160,A)', 0.25);
    } else if (solar) {
      glow(g, sx, H * 0.24, 40, 'rgba(255,245,220,A)', 0.9);
      for (let row = 0; row < 3; row++) {                                                    // rows of tilted panels reflecting the sky, on legs
        const y = gy + 6 + row * 13, s = 1.2 + row * 0.6;
        for (let i = -1; i < 9; i++) {
          const x = (i + (row % 2) * 0.5) * 30 * s + 6 - row * 20, w = 24 * s, h = 7 * s;
          g.strokeStyle = '#2a2020'; g.lineWidth = 0.8 * s; g.beginPath(); g.moveTo(x + w * 0.3, y); g.lineTo(x + w * 0.3, y + 3 * s); g.moveTo(x + w * 0.8, y); g.lineTo(x + w * 0.8, y + 3 * s); g.stroke();
          g.fillStyle = lin(g, x, y - h, x, y, [[0, '#6a84c0'], [0.5, '#2a3a78'], [1, '#141c40']]);
          g.beginPath(); g.moveTo(x, y); g.lineTo(x + w * 0.1, y - h); g.lineTo(x + w * 1.05, y - h); g.lineTo(x + w, y); g.closePath(); g.fill();
          g.strokeStyle = 'rgba(255,220,180,0.35)'; g.lineWidth = 0.5; g.beginPath(); g.moveTo(x + w * 0.1, y - h); g.lineTo(x + w * 1.05, y - h); g.stroke();
        }
      }
    } else {
      const xs = [];
      for (let i = 0; i < 3; i++) {                                                           // wind turbines with smooth tapered blades
        const x = W * (0.18 + i * 0.28) + (r() - 0.5) * 20, s = 1 - i * 0.16, y = ridgeY(gnd, x) + 1, hh = 78 * s, hy = y - hh, a0 = r() * 7;
        g.fillStyle = lin(g, x - 2, 0, x + 2, 0, [[0, '#e8e2dc'], [1, '#8a8490']]); g.beginPath(); g.moveTo(x - 2.4 * s, y); g.lineTo(x - 1 * s, hy); g.lineTo(x + 1 * s, hy); g.lineTo(x + 2.4 * s, y); g.fill();
        for (let k = 0; k < 3; k++) { const a = a0 + k * 2.094, L = 34 * s; g.save(); g.translate(x, hy); g.rotate(a); g.fillStyle = lin(g, 0, -2, 0, 2, [[0, '#f4f0ea'], [1, '#9a949c']]); g.beginPath(); g.moveTo(0, -1.6 * s); g.quadraticCurveTo(L * 0.3, -3 * s, L, -0.3); g.quadraticCurveTo(L * 0.4, 1.2 * s, 0, 1.6 * s); g.fill(); g.restore(); }
        g.fillStyle = '#d8d2cc'; g.beginPath(); g.ellipse(x + 2 * s, hy, 4 * s, 2.2 * s, 0, 0, 7); g.fill();
        glow(g, x, hy - 2, 5, 'rgba(255,60,40,A)', 0.8); xs.push([x, y]);
      }
    }
    glow(g, W * 0.5, H, 140, 'rgba(160,110,255,A)', 0.12);
  },
  microbe(g, r) {
    g.fillStyle = rad(g, W / 2, H / 2, 10, W / 2, H / 2, W * 0.62, [[0, '#123a32'], [0.6, '#0a1e1c'], [1, '#040a0a']]); g.fillRect(0, 0, W, H);
    const hue = 90 + r() * 110;
    for (let i = 0; i < 14; i++) { const x = r() * W, y = r() * H, s = 8 + r() * 26; glow(g, x, y, s, `hsla(${hue + r() * 60},70%,60%,A)`, 0.12); }   // out-of-focus bokeh
    for (let i = 0; i < 26; i++) {
      const a = r() * 6.28, d = Math.sqrt(r()), x = W / 2 + Math.cos(a) * d * W * 0.4, y = H * 0.52 + Math.sin(a) * d * H * 0.4, s = 4 + r() * 11, rot = r() * 3, el = 0.45 + r() * 0.5, h = hue + r() * 50;
      g.save(); g.translate(x, y); g.rotate(rot);
      if (r() < 0.4) { g.strokeStyle = `hsla(${h},60%,75%,0.4)`; g.lineWidth = 0.7; g.beginPath(); g.moveTo(-s, 0); g.bezierCurveTo(-s * 1.6, -s * 0.5, -s * 2, s * 0.5, -s * 2.6, 0); g.stroke(); }   // flagellum
      g.fillStyle = rad(g, -s * 0.25, -s * el * 0.3, 0, 0, 0, s, [[0, `hsla(${h},80%,82%,0.95)`], [0.6, `hsla(${h},70%,55%,0.75)`], [0.92, `hsla(${h},70%,40%,0.55)`], [1, `hsla(${h},80%,80%,0.9)`]]);
      g.beginPath(); g.ellipse(0, 0, s, s * el, 0, 0, 7); g.fill();
      g.fillStyle = `hsla(${h + 30},60%,30%,0.55)`; g.beginPath(); g.ellipse(s * 0.2, 0, s * 0.3, s * el * 0.35, 0, 0, 7); g.fill();   // nucleus
      g.fillStyle = 'rgba(255,255,255,0.55)'; g.beginPath(); g.ellipse(-s * 0.35, -s * el * 0.4, s * 0.22, s * el * 0.12, -0.3, 0, 7); g.fill();
      g.restore();
    }
    // the microscope's field: dark outside a soft circle, a faint lens edge
    g.fillStyle = rad(g, W / 2, H / 2, H * 0.62, W / 2, H / 2, W * 0.56, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.75)']]); g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(180,240,220,0.14)'; g.lineWidth = 2; g.beginPath(); g.ellipse(W / 2, H / 2, W * 0.44, H * 0.47, 0, 0, 7); g.stroke();
  },
  animal(g, r) {
    sky(g, [[0, '#34466a'], [0.5, '#a89078'], [0.75, '#e8b484'], [1, '#f0c894']]);
    const sx = W * (0.55 + r() * 0.3); glow(g, sx, H * 0.5, 90, 'rgba(255,230,180,A)', 0.6); glow(g, sx, H * 0.5, 12, 'rgba(255,250,235,A)', 1);
    ridge(g, r, 0.62, 10, '#7a7a60', { lit: '#e8c090', rough: 0.6, depth: 18 }); haze(g, H * 0.5, H * 0.66, '#f0c8a0', 0.35);
    const mid = ridge(g, r, 0.74, 10, '#5e7a3a', { lit: '#d8c070', rim: 'rgba(255,230,160,0.45)', depth: 30 });
    const near = ridge(g, r, 0.9, 7, '#3a5424', { lit: '#a8b060', rim: 'rgba(255,230,160,0.4)', depth: 24 });
    if (r() < 0.5) {                                                                           // a flight of birds
      g.strokeStyle = '#1e1a18'; g.lineCap = 'round';
      for (let i = 0; i < 8; i++) { const x = W * (0.15 + r() * 0.7), y = H * (0.12 + r() * 0.32), s = 3 + r() * 5, f = 0.3 + r() * 0.6; g.lineWidth = 1.1 + s * 0.12;
        g.beginPath(); g.moveTo(x - s, y - s * f * 0.4); g.quadraticCurveTo(x - s * 0.45, y - s * f, x, y); g.quadraticCurveTo(x + s * 0.45, y - s * f, x + s, y - s * f * 0.4); g.stroke(); }
    }
    for (let i = 0; i < 4; i++) {                                                             // grazing herbivores, rim-lit
      const x = W * (0.2 + i * 0.17 + r() * 0.05), s = 1 - i * 0.12, y = ridgeY(i < 2 ? near : mid, x) + 1, head = r() < 0.5;
      g.fillStyle = '#1c1a14';
      g.beginPath(); g.ellipse(x, y - 11 * s, 13 * s, 6 * s, 0, 0, 7); g.fill();
      g.beginPath(); g.moveTo(x + 9 * s, y - 14 * s); g.quadraticCurveTo(x + 15 * s, y - (head ? 12 : 20) * s, x + 17 * s, y - (head ? 5 : 17) * s); g.lineWidth = 3.4 * s; g.strokeStyle = '#1c1a14'; g.stroke();
      g.beginPath(); g.ellipse(x + 18 * s, y - (head ? 4 : 18) * s, 3.4 * s, 2.2 * s, 0.4, 0, 7); g.fill();
      g.lineWidth = 1.6 * s; for (const dx of [-8, -4, 5, 9]) { g.beginPath(); g.moveTo(x + dx * s, y - 7 * s); g.lineTo(x + dx * s + 0.4, y); g.stroke(); }
      g.strokeStyle = 'rgba(255,220,160,0.5)'; g.lineWidth = 0.8; g.beginPath(); g.ellipse(x, y - 11 * s, 13 * s, 6 * s, 0, Math.PI * 1.05, Math.PI * 1.7); g.stroke();
    }
    for (let i = 0; i < 40; i++) { const x = r() * W, y = ridgeY(near, x) + 2 + r() * 20; g.strokeStyle = `rgba(${40 + r() * 40 | 0},${70 + r() * 40 | 0},30,0.7)`; g.lineWidth = 0.8; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 1, y - 4, x + (r() - 0.5) * 4, y - 7 - r() * 5); g.stroke(); }
  },
  green(g, r) {
    sky(g, [[0, '#3a5a82'], [0.5, '#9ab4b8'], [0.8, '#e0d8b0'], [1, '#f0e0b0']]);
    const sx = W * (0.2 + r() * 0.6); glow(g, sx, H * 0.26, 80, 'rgba(255,248,220,A)', 0.6);
    g.save(); g.globalCompositeOperation = 'lighter'; for (let i = 0; i < 4; i++) { const a = 0.9 + i * 0.42 + r() * 0.15, w = 0.08 + r() * 0.06; g.fillStyle = rad(g, sx, H * 0.26, 10, sx, H * 0.26, 220, [[0, 'rgba(255,245,210,0.07)'], [1, 'rgba(255,245,210,0)']]); g.beginPath(); g.moveTo(sx, H * 0.26); g.lineTo(sx + Math.cos(a - w) * 260, H * 0.26 + Math.sin(a - w) * 260); g.lineTo(sx + Math.cos(a + w) * 260, H * 0.26 + Math.sin(a + w) * 260); g.fill(); } g.restore();
    ridge(g, r, 0.58, 12, '#7a9a78', { lit: '#e8e0b0', rough: 0.6, depth: 20 }); haze(g, H * 0.45, H * 0.62, '#e8e8d0', 0.35);
    const mid = ridge(g, r, 0.7, 12, '#5a8a48', { lit: '#c8d888', rim: 'rgba(255,250,210,0.45)', depth: 30 });
    dome(g, W * (0.2 + r() * 0.6), ridgeY(mid, W * 0.5) + 2, 26, { tint: '#d0f0ff', inner: (g) => glow(g, W / 2, H * 0.7, 40, 'rgba(120,220,120,A)', 0.4) });
    const near = ridge(g, r, 0.86, 9, '#3a7030', { lit: '#a8c870', rim: 'rgba(255,250,200,0.4)', depth: 30 });
    const tree = (x, y, s) => {                                                              // a round-crowned tree, lit on the sun's side
      g.fillStyle = '#3a2a1a'; g.fillRect(x - 0.7 * s, y - 6 * s, 1.4 * s, 6 * s);
      const cy = y - 9 * s;
      g.fillStyle = rad(g, x - 2 * s, cy - 3 * s, 0, x, cy, 6.5 * s, [[0, '#8ac858'], [0.55, '#3e7a30'], [1, '#1e4a1a']]);
      g.beginPath(); g.arc(x - 2.4 * s, cy + 0.6 * s, 4 * s, 0, 7); g.arc(x + 2.4 * s, cy + 0.8 * s, 4 * s, 0, 7); g.arc(x, cy - 2.2 * s, 4.4 * s, 0, 7); g.fill();
    };
    const ts = []; for (let i = 0; i < 22; i++) { const x = r() * W, s = 0.7 + r() * 0.8; ts.push([x, ridgeY(near, x) + 2 + (s - 0.7) * 22, s]); }
    ts.sort((a, b) => a[1] - b[1]).forEach(([x, y, s]) => tree(x, y, s));
  },
  lab(g, r) {
    sky(g, [[0, '#070a1c'], [0.55, '#221e3c'], [1, '#6a4a50']], 0.8, '#8a5a60'); stars(g, r, 80, 0.8, 0.7);
    for (let i = 0; i < 4; i++) billow(g, r, W * (0.2 + r() * 0.6), H * (0.2 + r() * 0.25), 80, 26, ['#6a3a8a', '#2a4a8a', '#8a3a6a'][i % 3], 0.1, 5);   // a faint nebula
    const gnd = ridge(g, r, 0.82, 6, '#3a2420', { lit: '#a06050', rim: 'rgba(255,170,130,0.35)', rough: 0.5 });
    const x = W * (0.32 + r() * 0.3), y = ridgeY(gnd, x) + 2;
    // the observatory: a lit drum and a shaded hemisphere with its slit open, the telescope showing
    g.fillStyle = lin(g, x - 34, 0, x + 34, 0, [[0, '#8a8e9c'], [0.4, '#c8ccd4'], [1, '#4a4c58']]); g.fillRect(x - 34, y - 20, 68, 20);
    g.fillStyle = rad(g, x - 12, y - 44, 2, x, y - 20, 38, [[0, '#f2f4f8'], [0.6, '#b8bcc8'], [1, '#5a5c6a']]); g.beginPath(); g.arc(x, y - 20, 34, Math.PI, 0); g.fill();
    g.fillStyle = '#10121e'; g.beginPath(); g.moveTo(x - 5, y - 20); g.lineTo(x - 7, y - 52); g.quadraticCurveTo(x, y - 55, x + 7, y - 52); g.lineTo(x + 5, y - 20); g.fill();
    g.strokeStyle = '#9aa0b0'; g.lineWidth = 3; g.lineCap = 'round'; g.beginPath(); g.moveTo(x, y - 30); g.lineTo(x + 10, y - 58); g.stroke();
    for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(255,220,160,0.9)'; g.fillRect(x - 28 + i * 11, y - 11, 3, 2); }
    glow(g, x + 10, y - 58, 8, 'rgba(160,220,255,A)', 0.5);
    // a radio dish on its mount
    const dx = x + (x < W / 2 ? 100 : -100), dy = ridgeY(gnd, dx) + 1;
    g.strokeStyle = '#6a6e7c'; g.lineWidth = 2.2; g.beginPath(); g.moveTo(dx - 7, dy); g.lineTo(dx, dy - 24); g.lineTo(dx + 7, dy); g.stroke();
    g.save(); g.translate(dx, dy - 30); g.rotate(-0.55);
    g.fillStyle = lin(g, -20, 0, 20, 0, [[0, '#f0f2f6'], [1, '#6a6e7c']]); g.beginPath(); g.ellipse(0, 0, 20, 7, 0, 0, Math.PI); g.quadraticCurveTo(0, -4, 20, 0); g.fill();
    g.strokeStyle = '#8a8e9c'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(-12, -1); g.lineTo(0, -14); g.lineTo(12, -1); g.stroke();
    g.restore();
  },
  city(g, r) {
    sky(g, [[0, '#0a0e22'], [0.5, '#34243c'], [0.82, '#b06448'], [1, '#d88050']], 0.84, '#e08858'); stars(g, r, 30, 0.5, 0.45);
    ridge(g, r, 0.8, 8, '#4a2a2a', { lit: '#d07050', rough: 0.5, depth: 20 }); haze(g, H * 0.64, H * 0.84, '#e08858', 0.3);
    const base = H * 0.88;
    for (let layer = 0; layer < 2; layer++) {                                                 // two rows of towers, the far one hazier
      for (let i = 0; i < 14; i++) {
        const w = 10 + r() * 14, hgt = (18 + r() * 64 * (1 - Math.abs(i / 13 - 0.5))) * (layer ? 1 : 0.8), x = (i / 14) * W + r() * 10 - 4;
        tower(g, r, x, base + layer * 2, w, hgt, { col: layer ? '#1c1e30' : '#2e2a40', lit: '#ff9a6a', round: r() < 0.18, spire: r() < 0.15 ? 6 + r() * 12 : 0, dens: layer ? 0.42 : 0.25 });
      }
      if (!layer) haze(g, base - 70, base, '#b06448', 0.25);
    }
    dome(g, W * (0.2 + r() * 0.6), base + 2, 50 + r() * 16, { tint: '#9ad0f0', lit: 'rgba(255,200,140,A)' });
    g.strokeStyle = 'rgba(120,230,255,0.6)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(0, base - 22); g.bezierCurveTo(W * 0.3, base - 30, W * 0.7, base - 16, W, base - 26); g.stroke();   // the maglev line
    g.fillStyle = lin(g, 0, base, 0, H, [[0, '#1a1216'], [1, '#0c0809']]); g.fillRect(0, base + 2, W, H - base);
  },
  mine(g, r) {
    sky(g, [[0, '#262236'], [0.5, '#7a4a3c'], [0.85, '#d08050'], [1, '#e89a60']], 0.62, '#f0a070');
    glow(g, W * 0.82, H * 0.5, 70, 'rgba(255,220,170,A)', 0.5);
    ridge(g, r, 0.56, 14, '#7a4430', { lit: '#f09060', rough: 0.9, depth: 26 }); haze(g, H * 0.42, H * 0.6, '#f0a070', 0.35);
    ridge(g, r, 0.66, 6, '#5a3020', { lit: '#c06a40', rough: 0.5, depth: 30 });
    // the open pit: terraced benches as nested ellipses, lit on the far wall
    const px = W * 0.56, py = H * 0.84, pw = W * 0.4, ph = H * 0.15;
    for (let i = 0; i < 6; i++) {
      const s = 1 - i * 0.15;
      g.fillStyle = lin(g, 0, py - ph * s, 0, py + ph * s, [[0, mix('#a05a34', '#3a1e14', i / 6)], [1, mix('#5a3020', '#1e0e0a', i / 6)]]);
      g.beginPath(); g.ellipse(px, py + i * 2.2, pw * s, ph * s, 0, 0, 7); g.fill();
      g.strokeStyle = `rgba(255,190,140,${0.4 - i * 0.05})`; g.lineWidth = 0.9; g.beginPath(); g.ellipse(px, py + i * 2.2, pw * s, ph * s, 0, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
    }
    g.strokeStyle = 'rgba(80,70,64,0.8)'; g.lineWidth = 2; g.beginPath(); g.ellipse(px, py + 5, pw * 0.72, ph * 0.72, 0, 0.2, 2.4); g.stroke();   // the haul road
    // a headframe with its wheel, conveyors, a haul truck with its lights
    const hx = W * (0.12 + r() * 0.12), hy = H * 0.86;
    g.strokeStyle = '#d89a2a'; g.lineWidth = 2.2; g.beginPath(); g.moveTo(hx - 12, hy); g.lineTo(hx, hy - 62); g.lineTo(hx + 12, hy); g.moveTo(hx - 8, hy - 20); g.lineTo(hx + 8, hy - 20); g.moveTo(hx - 5, hy - 40); g.lineTo(hx + 5, hy - 40); g.stroke();
    g.strokeStyle = '#3a3030'; g.lineWidth = 1.6; g.beginPath(); g.arc(hx, hy - 64, 7, 0, 7); g.stroke(); g.beginPath(); g.moveTo(hx - 7, hy - 64); g.lineTo(hx + 7, hy - 64); g.moveTo(hx, hy - 71); g.lineTo(hx, hy - 57); g.stroke();
    g.strokeStyle = '#5a5a60'; g.lineWidth = 2.4; g.beginPath(); g.moveTo(hx + 10, hy - 10); g.lineTo(px - pw * 0.55, py - 20); g.stroke();
    const tx = px + pw * 0.45, ty = py - 8;
    g.fillStyle = lin(g, 0, ty - 10, 0, ty, [[0, '#f2b83a'], [1, '#a06a14']]); g.beginPath(); g.moveTo(tx - 16, ty - 4); g.lineTo(tx - 12, ty - 11); g.lineTo(tx + 6, ty - 11); g.lineTo(tx + 6, ty - 4); g.fill(); g.fillRect(tx + 6, ty - 9, 8, 6);
    g.fillStyle = '#1e1c1c'; for (const dx of [-11, -4, 10]) { g.beginPath(); g.arc(tx + dx, ty - 2, 3, 0, 7); g.fill(); }
    glow(g, tx + 15, ty - 6, 14, 'rgba(255,230,170,A)', 0.8);
    billow(g, r, px, py - 6, pw, 12, '#d09070', 0.14, 6);
  },
  space(g, r, card) {
    sky(g, [[0, '#03040a'], [1, '#0b0c18']]); stars(g, r, 120);
    for (let i = 0; i < 3; i++) billow(g, r, W * r(), H * r() * 0.6, 100, 30, ['#3a2a6a', '#1a3a6a', '#5a2a4a'][i], 0.08, 5);
    const left = r() < 0.5, px = W * (left ? 0.1 : 0.9), R = H * 1.05;
    sphere(g, px, H + R * 0.62, R, (g) => {
      g.fillStyle = rad(g, px, H, 0, px, H + R * 0.6, R, [[0, '#c0643a'], [1, '#6a2a16']]); g.fillRect(0, 0, W, H);
      for (let i = 0; i < 20; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '90,40,24' : '220,150,110'},0.25)`; g.beginPath(); g.ellipse(px + (r() - 0.5) * R * 1.6, H - r() * R * 0.4, 6 + r() * 30, 2 + r() * 6, 0, 0, 7); g.fill(); }
    }, { light: [left ? 0.8 : -0.8, -0.6], atm: '#ff9a6a', night: 0.85, rim: '#ffd0a8' });
    const sx = W * (0.34 + r() * 0.32), sy = H * (0.32 + r() * 0.16);
    if (/station|haven|colony|elevator|port/i.test(card.name) || (!/ship|shuttle|rocket|vessel|freight|launch/i.test(card.name) && r() < 0.5)) {
      g.save(); g.translate(sx, sy); g.rotate(-0.25);                                          // a ring station: a torus band, hub, spokes, solar wings
      for (const [w, c] of [[5, '#5a6070'], [3.4, '#c8ced8'], [1, '#ffffff']]) { g.strokeStyle = c; g.lineWidth = w; g.beginPath(); g.ellipse(0, 0, 40, 13, 0, Math.PI * 1.02, Math.PI * 1.98); g.stroke(); }
      g.strokeStyle = '#8a92a0'; g.lineWidth = 1.2; for (const a of [0.4, 2.2, 3.6, 5.2]) { g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * 40, Math.sin(a) * 13); g.stroke(); }
      g.fillStyle = lin(g, -5, 0, 5, 0, [[0, '#e0e4ea'], [1, '#6a7280']]); g.fillRect(-4, -20, 8, 40);
      for (const s of [-1, 1]) { g.fillStyle = lin(g, 0, -4, 0, 4, [[0, '#4a6ab0'], [1, '#1a2a60']]); g.fillRect(s > 0 ? 6 : -30, -3, 24, 6); }
      for (const [w, c] of [[5, '#6a7080'], [3.4, '#dce2ea'], [1.2, '#ffffff']]) { g.strokeStyle = c; g.lineWidth = w; g.beginPath(); g.ellipse(0, 0, 40, 13, 0, 0.02, Math.PI * 0.98); g.stroke(); }
      for (let i = 0; i < 14; i++) { const a = i / 14 * 6.28; g.fillStyle = 'rgba(255,220,150,0.95)'; g.beginPath(); g.arc(Math.cos(a) * 40, Math.sin(a) * 13, 0.7, 0, 7); g.fill(); }
      g.restore();
      glow(g, sx, sy, 50, 'rgba(160,190,255,A)', 0.12);
    } else {
      g.save(); g.translate(sx, sy); g.rotate(-0.35);                                          // a ship on its burn
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = lin(g, -70, 0, -14, 0, [[0, 'rgba(120,180,255,0)'], [1, 'rgba(170,215,255,0.8)']]); g.beginPath(); g.moveTo(-14, -4); g.quadraticCurveTo(-40, -6, -80, 0); g.quadraticCurveTo(-40, 6, -14, 4); g.fill();
      g.globalCompositeOperation = 'source-over';
      glow(g, -16, 0, 14, 'rgba(200,230,255,A)', 0.9);
      g.fillStyle = lin(g, 0, -7, 0, 7, [[0, '#f0f2f6'], [0.5, '#b8bec8'], [1, '#5a6270']]); g.beginPath(); g.moveTo(30, 0); g.bezierCurveTo(22, -7, 0, -7, -14, -5); g.lineTo(-14, 5); g.bezierCurveTo(0, 7, 22, 7, 30, 0); g.fill();
      g.fillStyle = '#6a7282'; g.beginPath(); g.moveTo(-6, -5); g.lineTo(-12, -14); g.lineTo(-2, -14); g.lineTo(4, -5); g.fill(); g.beginPath(); g.moveTo(-6, 5); g.lineTo(-12, 14); g.lineTo(-2, 14); g.lineTo(4, 5); g.fill();
      g.fillStyle = 'rgba(160,220,255,0.9)'; g.beginPath(); g.ellipse(20, -1.5, 4, 1.6, 0, 0, 7); g.fill();
      g.restore();
    }
  },
  // ---- corporations, preludes, Callisto
  dawn(g, r) {
    sky(g, [[0, '#221f3c'], [0.45, '#8a6a8a'], [0.72, '#f0b0a0'], [0.8, '#ffe0c8']]); stars(g, r, 16, 0.4, 0.35);
    const sx = W * (0.3 + r() * 0.4); glow(g, sx, H * 0.72, 140, 'rgba(255,225,215,A)', 0.8); glow(g, sx, H * 0.72, 22, 'rgba(255,252,245,A)', 1);
    billow(g, r, W / 2, H * 0.36, W * 1.2, 18, '#ffc8b8', 0.18, 8);
    ridge(g, r, 0.7, 16, '#9a6a78', { lit: '#ffc0a8', rough: 0.9, depth: 16 }); haze(g, H * 0.56, H * 0.76, '#ffd0c0', 0.35);
    const mid = ridge(g, r, 0.84, 12, '#5a3444', { lit: '#e09090', rim: 'rgba(255,210,190,0.5)', depth: 22 });
    // the first outpost on the ridge, in silhouette: a lander on its legs or a pair of small domes, one lit window
    const ox = W * (r() < 0.5 ? 0.22 + r() * 0.15 : 0.62 + r() * 0.15), oy = ridgeY(mid, ox) + 1;
    g.save(); g.translate(ox, oy); g.scale(1.9, 1.9); g.translate(-ox, -oy);
    g.fillStyle = '#2a1824'; g.strokeStyle = '#2a1824'; g.lineWidth = 1.2;
    if (r() < 0.5) { g.beginPath(); g.moveTo(ox - 9, oy); g.lineTo(ox - 5, oy - 8); g.moveTo(ox + 9, oy); g.lineTo(ox + 5, oy - 8); g.stroke(); g.beginPath(); g.moveTo(ox - 7, oy - 7); g.lineTo(ox - 5, oy - 17); g.quadraticCurveTo(ox, oy - 22, ox + 5, oy - 17); g.lineTo(ox + 7, oy - 7); g.fill(); g.fillStyle = 'rgba(255,220,160,0.95)'; g.fillRect(ox - 1.5, oy - 15, 3, 2); }
    else { for (const [dx, rr] of [[-6, 7], [7, 5]]) { g.beginPath(); g.arc(ox + dx, oy, rr, Math.PI, 0); g.fill(); } g.fillStyle = 'rgba(255,220,160,0.95)'; g.fillRect(ox - 7, oy - 3, 2.4, 1.6); }
    g.strokeStyle = '#2a1824'; g.lineWidth = 0.7; g.beginPath(); g.moveTo(ox + 14, oy); g.lineTo(ox + 14, oy - 16); g.stroke(); g.fillStyle = 'rgba(255,120,80,0.9)'; g.fillRect(ox + 14, oy - 16, 5, 3);
    glow(g, ox, oy - 8, 14, 'rgba(255,200,150,A)', 0.25);
    g.restore();
    ridge(g, r, 0.96, 5, '#2a1622', { rim: 'rgba(255,190,170,0.35)', depth: 12 });
  },
  callisto(g, r) {
    sky(g, [[0, '#04050b'], [1, '#0a0b15']]); stars(g, r, 90);
    sphere(g, W * 0.82, H * 0.22, 26, (g) => { for (let i = -5; i <= 5; i++) { g.fillStyle = ['#d8b894', '#efe0c4', '#b07e58'][(i + 6) % 3]; g.fillRect(W * 0.82 - 30, H * 0.22 + i * 5.2 - 3, 60, 5.6); } }, { light: [-0.9, 0.2], night: 0.9 });
    const cx = W * 0.5, cy = H * 1.9, R = H * 1.42;
    sphere(g, cx, cy, R, (g) => {
      g.fillStyle = rad(g, cx, cy - R, 0, cx, cy, R, [[0, '#6a6258'], [1, '#2a2622']]); g.fillRect(cx - R, cy - R, R * 2, R * 2);
      for (let i = 0; i < 90; i++) {                                                           // craters: a dark floor, a bright rim toward the sun
        const x = r() * W, y = cy - R + 4 + Math.pow(r(), 1.4) * 70, s = (1.5 + r() * r() * 14) * (0.5 + (y - (cy - R)) / 60);
        g.fillStyle = 'rgba(20,18,16,0.45)'; g.beginPath(); g.ellipse(x, y, s, s * 0.35, 0, 0, 7); g.fill();
        g.strokeStyle = 'rgba(220,210,190,0.35)'; g.lineWidth = 0.7; g.beginPath(); g.ellipse(x, y, s, s * 0.35, 0, Math.PI * 0.1, Math.PI * 0.9); g.stroke();
      }
    }, { light: [-0.6, -1], night: 0.6 });
    const bx = W * (0.3 + r() * 0.4), by = cy - R + 6;
    glow(g, bx, by - 4, 50, 'rgba(255,200,130,A)', 0.35);
    for (let i = 0; i < 3; i++) dome(g, bx - 22 + i * 22, by + (i % 2) * 2, 9 + (i % 2) * 5, { tint: '#a0d0f0', lit: 'rgba(255,210,150,A)' });
    for (let i = 0; i < 12; i++) { g.fillStyle = i % 4 ? 'rgba(255,220,150,0.95)' : 'rgba(255,70,50,0.95)'; g.beginPath(); g.arc(bx - 34 + i * 6, by + 4, 0.7, 0, 7); g.fill(); }
  },
  tharsis(g, r) {
    sky(g, [[0, '#1c1c34'], [0.5, '#7a4a52'], [0.85, '#e0905a'], [1, '#f0a868']], 0.7, '#f0a070');
    glow(g, W * 0.82, H * 0.3, 60, 'rgba(255,230,190,A)', 0.45);
    for (const [x, w, h, c] of [[0.28, 0.62, 0.64, '#8a4c3a'], [0.76, 0.46, 0.46, '#6a3a2c']]) {   // the Tharsis shields
      const pts = [[W * (x - w / 2), H + 2], [W * (x - w * 0.25), H * (1 - h * 0.55)], [W * (x - w * 0.08), H * (1 - h * 0.97)], [W * x, H * (1 - h)], [W * (x + w * 0.08), H * (1 - h * 0.97)], [W * (x + w * 0.25), H * (1 - h * 0.55)], [W * (x + w / 2), H + 2]];
      g.beginPath(); curve(g, pts); g.closePath(); g.fillStyle = lin(g, W * (x - w / 3), 0, W * (x + w / 3), 0, [[0, mix(c, '#f0a070', 0.3)], [1, mix(c, '#000000', 0.3)]]); g.fill();
      g.fillStyle = rgba('#2a1410', 0.5); g.beginPath(); g.ellipse(W * x, H * (1 - h) + 2, W * w * 0.07, 2.2, 0, 0, 7); g.fill();
    }
    haze(g, H * 0.55, H * 0.8, '#f0a878', 0.3);
    const base = H * 0.8;
    for (let i = 0; i < 11; i++) tower(g, r, W * (0.08 + i * 0.045), base + i * 1.6, 11, 12 + r() * 28, { col: '#2a2234', lit: '#ffa070', round: r() < 0.3, dens: 0.55 });
    dome(g, W * 0.3, base + 8, 44, { tint: '#a8d4f0', lit: 'rgba(255,210,150,A)' });
    ridge(g, r, 0.95, 4, '#2a1612', { rim: 'rgba(255,170,120,0.35)', rough: 0.4, depth: 12 });
  },
  saturn(g, r) {
    sky(g, [[0, '#04050b'], [1, '#0e0c16']]); stars(g, r, 100);
    const cx = W * 0.5, cy = H * 0.55, R = H * 0.3, tilt = -0.28;
    const ring = (front) => {
      g.save(); g.translate(cx, cy); g.rotate(tilt); g.beginPath(); if (front) g.rect(-W, 0, W * 2, H); else g.rect(-W, -H, W * 2, H); g.clip();
      for (let i = 0; i < 28; i++) {                                                         // many fine ringlets, the Cassini gap
        const k = i / 28; if (k > 0.62 && k < 0.68) continue;
        const a = (0.25 + 0.5 * Math.sin(k * 40 + 1) ** 2) * (k < 0.3 ? 0.55 : 1) * (front ? 1 : 0.8);
        g.strokeStyle = mix('#e8d4a8', '#9a8260', k, a); g.lineWidth = 1.1;
        g.beginPath(); g.ellipse(0, 0, R * (1.35 + k * 0.95), R * (0.3 + k * 0.21), 0, 0, 7); g.stroke();
      }
      g.restore();
    };
    ring(false);
    sphere(g, cx, cy, R, (g) => {
      g.save(); g.translate(cx, cy); g.rotate(tilt);
      for (let i = -7; i <= 7; i++) { const c = ['#e8d0a0', '#d0b07c', '#f2e2bc', '#c8a472'][(i + 8) % 4]; g.fillStyle = lin(g, 0, i * R / 7 - R / 7, 0, i * R / 7 + R / 7, [[0, rgba(c, 0)], [0.5, c], [1, rgba(c, 0)]]); g.fillRect(-R, i * R / 7 - R / 7, R * 2, R * 2 / 7); }
      g.fillStyle = 'rgba(40,30,20,0.35)'; g.fillRect(-R, R * 0.05, R * 2, R * 0.07);               // the rings' shadow on the globe
      g.restore();
    }, { light: [-0.7, -0.5], night: 0.88, rim: '#fff0d0' });
    ring(true);
    const tx = W * (r() < 0.5 ? 0.2 : 0.8), ty = H * (0.18 + r() * 0.12);                     // Titan: small, orange, hazy
    sphere(g, tx, ty, 8, (g) => { g.fillStyle = '#d8903a'; g.fillRect(0, 0, W, H); }, { light: [-0.7, -0.5], atm: '#ffb060', night: 0.8 });
  },
  greenhouse(g, r) {
    sky(g, [[0, '#3a5a82'], [0.55, '#b0bca8'], [1, '#e0cca0']]); glow(g, W * 0.78, H * 0.24, 60, 'rgba(255,248,215,A)', 0.55);
    ridge(g, r, 0.78, 8, '#9a7a58', { lit: '#f0d0a0', rough: 0.5, depth: 20 });
    const x0 = W * 0.16, y0 = H * 0.86, w = W * 0.68, h = H * 0.5;
    // plants in rows under a long arched glasshouse
    for (let row = 0; row < 3; row++) for (let i = 0; i < 12; i++) { const x = x0 + w * (0.05 + i * 0.08) + row * 4, y = y0 - 4 - row * 5, s = 6 + r() * 4 - row;
      g.fillStyle = rad(g, x - s * 0.3, y - s * 1.2, 0, x, y - s, s * 1.2, [[0, '#9ae070'], [0.6, '#4a9a3a'], [1, '#2a6a26']]); g.beginPath(); g.ellipse(x, y - s, s * 0.8, s * 1.1, 0, 0, 7); g.fill(); }
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0, y0 - h * 0.5); g.bezierCurveTo(x0 + w * 0.1, y0 - h * 1.2, x0 + w * 0.9, y0 - h * 1.2, x0 + w, y0 - h * 0.5); g.lineTo(x0 + w, y0); g.closePath();
    g.fillStyle = lin(g, 0, y0 - h, 0, y0, [[0, 'rgba(210,245,235,0.3)'], [1, 'rgba(180,230,210,0.12)']]); g.fill();
    g.strokeStyle = 'rgba(240,252,248,0.7)'; g.lineWidth = 1.1; g.stroke();
    g.lineWidth = 0.7; g.strokeStyle = 'rgba(240,252,248,0.4)';
    for (let i = 1; i < 8; i++) { const t = i / 8, x = x0 + w * t, top = y0 - h * 0.5 - h * 0.4 * Math.sin(Math.PI * t) * 1.02 - (t > 0.1 && t < 0.9 ? h * 0.08 : 0); g.beginPath(); g.moveTo(x, y0); g.lineTo(x, top); g.stroke(); }
    g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 3; g.lineCap = 'round'; g.beginPath(); g.moveTo(x0 + w * 0.2, y0 - h * 0.86); g.quadraticCurveTo(x0 + w * 0.35, y0 - h * 1.02, x0 + w * 0.5, y0 - h * 1.02); g.stroke();
    g.fillStyle = lin(g, 0, y0, 0, H, [[0, '#5a4430'], [1, '#2a1e14']]); g.fillRect(0, y0, W, H - y0);
  },
  sun(g, r) {
    sky(g, [[0, '#120604'], [0.5, '#2e0e06'], [1, '#160604']]);
    const cx = W * 0.5, cy = H * 0.56;
    glow(g, cx, cy, 190, 'rgba(255,120,30,A)', 0.5); glow(g, cx, cy, 80, 'rgba(255,190,90,A)', 0.8);
    g.fillStyle = rad(g, cx - 8, cy - 8, 0, cx, cy, 36, [[0, '#fffbe8'], [0.6, '#ffe08a'], [0.92, '#ffb040'], [1, '#ff8a20']]); g.beginPath(); g.arc(cx, cy, 36, 0, 7); g.fill();
    g.save(); g.globalCompositeOperation = 'lighter'; g.lineCap = 'round';                    // prominences: arcing loops off the limb
    for (let i = 0; i < 26; i++) { const a = r() * 6.28, L = 44 + r() * 50; g.strokeStyle = `rgba(255,200,120,${0.05 + r() * 0.06})`; g.lineWidth = 2 + r() * 5; g.beginPath(); g.moveTo(cx + Math.cos(a) * 34, cy + Math.sin(a) * 34); g.quadraticCurveTo(cx + Math.cos(a + 0.1) * L * 0.7, cy + Math.sin(a + 0.1) * L * 0.7, cx + Math.cos(a + 0.05) * L, cy + Math.sin(a + 0.05) * L); g.stroke(); }   // corona streamers
    for (let i = 0; i < 6; i++) { const a = r() * 6.28, h = 3 + r() * 6, s = 0.06 + r() * 0.1;
      const p0 = [cx + Math.cos(a - s) * 35, cy + Math.sin(a - s) * 35], p1 = [cx + Math.cos(a + s) * 35, cy + Math.sin(a + s) * 35], pc = [cx + Math.cos(a) * (35 + h * 2), cy + Math.sin(a) * (35 + h * 2)];
      for (const [w, al] of [[4, 0.18], [1.4, 0.6]]) { g.strokeStyle = `rgba(255,140,60,${al})`; g.lineWidth = w; g.beginPath(); g.moveTo(...p0); g.quadraticCurveTo(...pc, ...p1); g.stroke(); } }
    g.restore();
    sphere(g, W * 0.17, H * 0.3, 8, (g) => { g.fillStyle = '#6a3a28'; g.fillRect(0, 0, W, H); }, { light: [1, 0.3], night: 0.95, rim: '#ffb070' });   // a planet in silhouette
  },
  phobos(g, r) {
    sky(g, [[0, '#04050b'], [1, '#0c0b10']]); stars(g, r, 80);
    const R = H * 0.95;
    sphere(g, W * 0.5, H * 1.62, R, (g) => { g.fillStyle = rad(g, W * 0.5, H * 0.7, 0, W * 0.5, H * 1.62, R, [[0, '#c46a3e'], [1, '#6a2a16']]); g.fillRect(0, 0, W, H); }, { light: [0.3, -1], atm: '#ff9060', night: 0.7, rim: '#ffc098' });
    const cx = W * 0.62, cy = H * 0.4;
    g.save(); g.translate(cx, cy); g.rotate(-0.4);                                             // Phobos: a lumpy potato, cratered, lit from the left
    const pts = []; for (let k = 0; k <= 14; k++) { const a = k / 14 * 6.28, rr = 1 + 0.12 * Math.sin(a * 3 + 1) + 0.06 * Math.sin(a * 5); pts.push([Math.cos(a) * 40 * rr, Math.sin(a) * 27 * rr]); } pts.push(pts[1]);
    g.beginPath(); curve(g, pts); g.closePath(); g.save(); g.clip();
    g.fillStyle = rad(g, -16, -12, 2, 0, 0, 46, [[0, '#a89684'], [0.55, '#6a5a4c'], [1, '#1c1612']]); g.fillRect(-50, -40, 100, 80);
    for (let i = 0; i < 12; i++) { const x = (r() - 0.5) * 70, y = (r() - 0.5) * 44, s = 2 + r() * 7; g.fillStyle = 'rgba(30,24,20,0.45)'; g.beginPath(); g.ellipse(x, y, s, s * 0.75, 0, 0, 7); g.fill(); g.strokeStyle = 'rgba(210,190,170,0.3)'; g.lineWidth = 0.7; g.beginPath(); g.ellipse(x + 0.5, y + 0.5, s, s * 0.75, 0, Math.PI * 0.1, Math.PI * 0.9); g.stroke(); }
    g.restore();
    g.restore();
    for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(255,220,150,0.95)'; g.beginPath(); g.arc(cx - 14 + i * 5, cy + 6, 0.8, 0, 7); g.fill(); }
    g.save(); g.translate(W * 0.28, H * 0.3); g.rotate(-0.3);                                   // a small ring station
    for (const [w, c] of [[3, '#5a6070'], [1.8, '#c8ced8']]) { g.strokeStyle = c; g.lineWidth = w; g.beginPath(); g.ellipse(0, 0, 20, 7, 0, 0, 7); g.stroke(); }
    g.fillStyle = '#b8c0cc'; g.fillRect(-2, -8, 4, 16); g.restore();
  },
  tower(g, r) {
    sky(g, [[0, '#0a1024'], [0.5, '#2a2a48'], [0.9, '#9a6048'], [1, '#c07850']], 0.9, '#d08858'); stars(g, r, 24, 0.4, 0.4);
    const base = H * 0.96, cx = W * 0.5;
    for (let i = 0; i < 13; i++) tower(g, r, W * (i / 13) + r() * 6 - 3, base, 18 + r() * 8, 18 + r() * 40, { col: '#1a1c2c', lit: '#ff9a6a', dens: 0.3 });
    // the gold tower: a faceted spire with a gleaming edge and a beacon
    g.fillStyle = lin(g, cx - 24, 0, cx + 24, 0, [[0, '#6a5220'], [0.45, '#f2d27a'], [0.55, '#fff0b8'], [1, '#5a4418']]);
    g.beginPath(); g.moveTo(cx - 24, base); g.lineTo(cx - 17, H * 0.18); g.quadraticCurveTo(cx - 8, H * 0.07, cx, H * 0.02); g.quadraticCurveTo(cx + 8, H * 0.07, cx + 17, H * 0.18); g.lineTo(cx + 24, base); g.fill();
    for (let k = 0; k < 30; k++) { g.fillStyle = `rgba(255,${230 + r() * 25 | 0},180,${0.3 + r() * 0.5})`; g.fillRect(cx - 13 + (k % 4) * 7, H * 0.22 + (k / 4 | 0) * 16, 3, 1.6); }
    glow(g, cx, H * 0.03, 22, 'rgba(255,220,130,A)', 0.9);
    g.strokeStyle = 'rgba(255,245,200,0.6)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(cx, H * 0.03); g.lineTo(cx, base); g.stroke();
  },
  teractor(g, r) {
    sky(g, [[0, '#050712'], [0.6, '#0e1426'], [1, '#1c2238']]); stars(g, r, 60);
    sphere(g, W * 0.74, H * 0.3, 26, (g) => { g.fillStyle = '#2a64b0'; g.fillRect(0, 0, W, H); g.fillStyle = '#4a8a44'; g.beginPath(); g.ellipse(W * 0.72, H * 0.27, 10, 7, 0.4, 0, 7); g.fill(); g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.ellipse(W * 0.76, H * 0.34, 12, 2.5, 0.2, 0, 7); g.fill(); }, { light: [-0.8, -0.3], atm: '#6ab0ff', night: 0.9 });
    const base = H * 0.92;
    for (let i = 0; i < 15; i++) tower(g, r, W * (i / 15) - 2, base, 16 + r() * 6, 30 + r() * 72, { col: '#141a30', lit: '#7ab8ff', win: '160,210,255', round: r() < 0.25, spire: r() < 0.2 ? 10 : 0, dens: 0.45 });
    haze(g, base - 40, base, '#3a6ab0', 0.25);
    g.fillStyle = '#0a0c16'; g.fillRect(0, base, W, H - base);
  },
  unmi(g, r) {
    sky(g, [[0, '#08162e'], [0.6, '#1a3a6a'], [1, '#3a6aa0']]); stars(g, r, 40, 0.5);
    const cx = W * 0.5, cy = H * 0.6, R = H * 0.4;
    sphere(g, cx, cy, R, (g) => { g.fillStyle = rad(g, cx, cy, 0, cx, cy, R, [[0, '#c8703e'], [1, '#8a3a1e']]); g.fillRect(0, 0, W, H); for (let i = 0; i < 16; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '90,40,24' : '230,160,120'},0.3)`; g.beginPath(); g.ellipse(cx + (r() - 0.5) * R * 1.6, cy + (r() - 0.5) * R * 1.6, 4 + r() * 18, 2 + r() * 6, r(), 0, 7); g.fill(); } }, { light: [-0.6, -0.5], atm: '#ffa070', night: 0.75 });
    g.strokeStyle = 'rgba(230,240,255,0.8)'; g.lineWidth = 1.6; g.beginPath(); g.arc(cx, cy, R + 9, 0, 7); g.stroke();
    for (const s of [-1, 1]) for (let i = 0; i < 9; i++) {                                     // the laurel: leaves along two arcs
      const a = Math.PI / 2 + s * (0.35 + i * 0.26), x = cx + Math.cos(a) * (R + 20), y = cy + Math.sin(a) * (R + 20);
      g.save(); g.translate(x, y); g.rotate(a + s * 0.9); g.fillStyle = lin(g, -6, 0, 6, 0, [[0, 'rgba(230,240,255,0.9)'], [1, 'rgba(160,190,230,0.7)']]); g.beginPath(); g.moveTo(-6, 0); g.quadraticCurveTo(0, -3.2, 6, 0); g.quadraticCurveTo(0, 3.2, -6, 0); g.fill(); g.restore();
    }
  },
  cinema(g, r) {
    sky(g, [[0, '#06050b'], [1, '#18101a']]);
    const sx = W * 0.6, sy = H * 0.14, sw = W * 0.34, sh = H * 0.46;
    glow(g, sx + sw / 2, sy + sh / 2, sw * 0.9, 'rgba(160,200,255,A)', 0.3);
    g.fillStyle = lin(g, sx, sy, sx, sy + sh, [[0, '#2a3a6a'], [0.6, '#c07040'], [1, '#6a3020']]); g.fillRect(sx, sy, sw, sh);    // on screen: a Martian sunset
    g.fillStyle = 'rgba(255,230,180,0.9)'; g.beginPath(); g.arc(sx + sw * 0.6, sy + sh * 0.62, sh * 0.12, 0, 7); g.fill();
    g.fillStyle = '#3a1a14'; g.beginPath(); g.moveTo(sx, sy + sh); g.lineTo(sx, sy + sh * 0.75); g.quadraticCurveTo(sx + sw * 0.3, sy + sh * 0.6, sx + sw * 0.55, sy + sh * 0.78); g.quadraticCurveTo(sx + sw * 0.8, sy + sh * 0.68, sx + sw, sy + sh * 0.8); g.lineTo(sx + sw, sy + sh); g.fill();
    g.strokeStyle = 'rgba(200,190,180,0.35)'; g.lineWidth = 1.5; g.strokeRect(sx - 1, sy - 1, sw + 2, sh + 2);
    const px = W * 0.08, py = H * 0.86;
    g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = lin(g, px, py, sx, sy + sh / 2, [[0, 'rgba(255,245,210,0.5)'], [1, 'rgba(255,245,210,0.04)']]); g.beginPath(); g.moveTo(px, py); g.lineTo(sx, sy); g.lineTo(sx, sy + sh); g.fill();
    for (let i = 0; i < 30; i++) { const t = r(), x = px + (sx - px) * t, y = py + (sy + sh * r() - py) * t; g.fillStyle = `rgba(255,245,220,${0.3 * (1 - t)})`; g.beginPath(); g.arc(x, y, 0.6, 0, 7); g.fill(); }   // dust in the beam
    g.restore();
    g.fillStyle = lin(g, px - 12, py - 8, px + 12, py + 8, [[0, '#4a4450'], [1, '#141016']]); g.beginPath(); g.ellipse(px, py, 13, 10, -0.6, 0, 7); g.fill(); glow(g, px + 3, py - 2, 18, 'rgba(255,245,210,A)', 0.8);
    for (let i = 0; i < 10; i++) { g.fillStyle = '#08060a'; g.beginPath(); g.arc(W * (0.22 + i * 0.075), H * 1.0, 10, Math.PI, 0); g.fill(); g.strokeStyle = 'rgba(160,190,240,0.25)'; g.lineWidth = 0.7; g.beginPath(); g.arc(W * (0.22 + i * 0.075), H * 1.0, 10, Math.PI * 1.15, Math.PI * 1.6); g.stroke(); }
  },
  moon(g, r) {
    sky(g, [[0, '#03040a'], [1, '#08090f']]); stars(g, r, 90);
    sphere(g, W * 0.8, H * 0.22, 13, (g) => { g.fillStyle = '#2a64b0'; g.fillRect(0, 0, W, H); g.fillStyle = '#4a8a44'; g.beginPath(); g.ellipse(W * 0.79, H * 0.2, 5, 4, 0.4, 0, 7); g.fill(); }, { light: [-0.9, 0.1], atm: '#6ab0ff', night: 0.9 });
    ridge(g, r, 0.72, 10, '#8a8a8e', { lit: '#e8e8e8', rim: 'rgba(255,255,255,0.4)', rough: 0.7, depth: 20 });
    const gy = H * 0.8; g.fillStyle = lin(g, 0, gy, 0, H, [[0, '#7a7a80'], [1, '#3a3a40']]); g.fillRect(0, gy, W, H - gy);
    for (let i = 0; i < 16; i++) { const x = r() * W, y = H * (0.8 + r() * 0.2), s = (4 + r() * 14) * (0.5 + (y - gy) / 30); g.fillStyle = 'rgba(30,30,36,0.5)'; g.beginPath(); g.ellipse(x, y, s, s * 0.25, 0, 0, 7); g.fill(); g.strokeStyle = 'rgba(230,230,235,0.4)'; g.lineWidth = 0.7; g.beginPath(); g.ellipse(x, y, s, s * 0.25, 0, 0, Math.PI); g.stroke(); }
    dome(g, W * 0.3, gy + 2, 28, { tint: '#b0d8f0', lit: 'rgba(255,220,160,A)' });
    for (let i = 0; i < 7; i++) { g.fillStyle = 'rgba(255,220,160,0.95)'; g.beginPath(); g.arc(W * 0.3 - 18 + i * 6, gy - 2, 0.8, 0, 7); g.fill(); }
  },
  valley(g, r) {
    sky(g, [[0, '#34466a'], [0.55, '#b0a08c'], [1, '#e8c090']]); glow(g, W * 0.5, H * 0.38, 80, 'rgba(255,240,210,A)', 0.55);
    // canyon walls in layers, receding, the river down the middle
    for (const [k, c] of [[0, '#b07a5a'], [1, '#8a4a34'], [2, '#6a3424']]) {
      const inset = 0.36 - k * 0.12, y0 = H * (0.2 + k * 0.08);
      for (const s of [-1, 1]) {
        const xe = s < 0 ? 0 : W, xi = W * (0.5 + s * inset * 0.35);
        const pts = [[xe, y0], [W * (0.5 + s * (inset + 0.2)), y0 + 10], [xi + s * 10, H * 0.7], [xi, H + 4]];
        g.beginPath(); g.moveTo(xe, H + 4); curve(g, pts, false); g.closePath();
        g.fillStyle = lin(g, xe, 0, xi, 0, [[0, mix(c, '#000000', 0.25)], [1, s < 0 ? mix(c, '#f0c090', 0.3) : mix(c, '#000000', 0.1)]]); g.fill();
        g.strokeStyle = 'rgba(40,20,14,0.25)'; g.lineWidth = 0.8; for (let i = 1; i < 5; i++) { g.beginPath(); g.moveTo(xe, y0 + i * 18); g.quadraticCurveTo((xe + xi) / 2, y0 + i * 18 + 6, xi + s * (18 - i * 3), y0 + i * 22); g.stroke(); }   // strata
      }
      haze(g, y0 - 10, y0 + 50, '#e8c8a0', 0.12);
    }
    g.fillStyle = lin(g, 0, H * 0.6, 0, H, [[0, '#6a9a58'], [1, '#2e5a28']]); g.beginPath(); g.moveTo(W * 0.3, H + 2); g.quadraticCurveTo(W * 0.5, H * 0.56, W * 0.7, H + 2); g.fill();
    for (const [w, c] of [[4, 'rgba(120,180,230,0.5)'], [1.6, 'rgba(200,235,255,0.9)']]) { g.strokeStyle = c; g.lineWidth = w; g.beginPath(); g.moveTo(W * 0.5, H * 0.62); g.bezierCurveTo(W * 0.46, H * 0.74, W * 0.56, H * 0.84, W * 0.49, H + 2); g.stroke(); }
  },
  stage(g, r) {
    sky(g, [[0, '#0b0710'], [1, '#22121a']]);
    for (const x of [0.3, 0.7]) { g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = lin(g, W * x, 0, W * 0.5, H * 0.8, [[0, 'rgba(255,230,180,0.4)'], [1, 'rgba(255,230,180,0)']]); g.beginPath(); g.moveTo(W * x - 5, 0); g.lineTo(W * x + 5, 0); g.lineTo(W * 0.62, H * 0.82); g.lineTo(W * 0.38, H * 0.82); g.fill(); g.restore(); }
    g.fillStyle = lin(g, 0, H * 0.82, 0, H, [[0, '#5a2a30'], [1, '#1a0a0e']]); g.fillRect(W * 0.12, H * 0.82, W * 0.76, H * 0.18);
    glow(g, W * 0.5, H * 0.84, 70, 'rgba(255,220,160,A)', 0.3);
    for (const s of [0, 1]) {                                                                  // velvet curtains in soft folds
      const x0 = s ? W * 0.86 : 0, w = W * 0.14;
      g.fillStyle = lin(g, x0, 0, x0 + w, 0, [...Array(7)].map((_, i) => [i / 6, i % 2 ? '#5a0e16' : '#a8222e']));
      g.beginPath(); g.moveTo(x0, 0); g.lineTo(x0 + w, 0); g.quadraticCurveTo(x0 + w * (s ? 0.2 : 0.8), H * 0.6, x0 + w * (s ? 0.1 : 0.9), H); g.lineTo(x0 + (s ? w : 0), H); g.fill();
    }
    const tx = W * 0.5, ty = H * 0.74; glow(g, tx, ty - 22, 46, 'rgba(255,215,110,A)', 0.6);
    g.fillStyle = lin(g, tx - 16, 0, tx + 16, 0, [[0, '#8a5a12'], [0.4, '#ffe08a'], [0.55, '#fff4c8'], [1, '#8a5a12']]);
    g.beginPath(); g.moveTo(tx - 16, ty - 46); g.lineTo(tx + 16, ty - 46); g.quadraticCurveTo(tx + 15, ty - 19, tx + 2, ty - 15); g.lineTo(tx + 3, ty - 6); g.lineTo(tx + 10, ty - 3); g.lineTo(tx + 10, ty + 1); g.lineTo(tx - 10, ty + 1); g.lineTo(tx - 10, ty - 3); g.lineTo(tx - 3, ty - 6); g.lineTo(tx - 2, ty - 15); g.quadraticCurveTo(tx - 15, ty - 19, tx - 16, ty - 46); g.fill();
    g.strokeStyle = 'rgba(255,230,150,0.7)'; g.lineWidth = 1.6; for (const s of [-1, 1]) { g.beginPath(); g.arc(tx + s * 17, ty - 38, 6, s < 0 ? Math.PI * 0.5 : -Math.PI * 0.5, s < 0 ? Math.PI * 1.5 : Math.PI * 0.5, s > 0); g.stroke(); }
  },
  market(g, r) {
    sky(g, [[0, '#0e1228'], [0.55, '#3a2a44'], [1, '#b0604a']], 0.9, '#d07050'); stars(g, r, 20, 0.4, 0.4);
    const base = H * 0.9;
    g.strokeStyle = 'rgba(40,30,30,0.8)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(0, H * 0.2); g.quadraticCurveTo(W / 2, H * 0.34, W, H * 0.2); g.stroke();
    for (let i = 0; i < 13; i++) { const t = (i + 0.5) / 13, x = W * t, y = H * 0.2 + H * 0.14 * 4 * t * (1 - t) + 3, c = ['#ff6a4a', '#ffd766', '#8ad0ff'][i % 3]; glow(g, x, y, 9, `rgba(${hexRGB(c).join(',')},A)`, 0.5); g.fillStyle = c; g.beginPath(); g.arc(x, y, 2.4, 0, 7); g.fill(); }
    for (let i = 0; i < 6; i++) {                                                              // stalls with striped awnings, lit inside
      const x = W * (0.03 + i * 0.16), w = W * 0.14, hgt = 30 + r() * 18, col = ['#e04848', '#e8a83a', '#3aa0e0', '#48c078'][i % 4];
      g.fillStyle = lin(g, 0, base - hgt, 0, base, [[0, '#3a2e3a'], [1, '#1c161c']]); g.fillRect(x, base - hgt, w, hgt);
      glow(g, x + w / 2, base - hgt * 0.45, 26, 'rgba(255,200,130,A)', 0.55);
      g.fillStyle = 'rgba(255,215,160,0.7)'; g.fillRect(x + 4, base - hgt * 0.6, w - 8, hgt * 0.35);
      for (let k = 0; k < 6; k++) { g.fillStyle = k % 2 ? '#f2eee4' : col; g.beginPath(); g.moveTo(x - 4 + k * (w + 8) / 6, base - hgt); g.lineTo(x - 4 + (k + 1) * (w + 8) / 6, base - hgt); g.lineTo(x - 4 + (k + 1) * (w + 8) / 6, base - hgt + 5); g.quadraticCurveTo(x - 4 + (k + 0.5) * (w + 8) / 6, base - hgt + 9, x - 4 + k * (w + 8) / 6, base - hgt + 5); g.fill(); }
      g.fillStyle = col; g.beginPath(); g.moveTo(x - 4, base - hgt); g.lineTo(x + w / 2, base - hgt - 11); g.lineTo(x + w + 4, base - hgt); g.fill();
    }
    g.fillStyle = lin(g, 0, base, 0, H, [[0, '#2a1a1c'], [1, '#100a0c']]); g.fillRect(0, base, W, H - base);
  },
  factory(g, r) {
    sky(g, [[0, '#18182a'], [0.55, '#4a3a40'], [1, '#b0704a']], 0.9, '#c07850');
    const base = H * 0.9;
    for (let i = 0; i < 2; i++) billow(g, r, W * (0.68 + i * 0.1) + 20, base - 120, 80, 40, '#c8c0b8', 0.22, 8);
    for (const x of [0.66, 0.76]) { g.fillStyle = lin(g, W * x, 0, W * x + 12, 0, [[0, '#6a6070'], [1, '#2a2630']]); g.beginPath(); g.moveTo(W * x, base); g.lineTo(W * x + 1.5, base - 92); g.lineTo(W * x + 10.5, base - 92); g.lineTo(W * x + 12, base); g.fill(); g.fillStyle = '#c83a2a'; g.fillRect(W * x + 1.3, base - 84, 9.4, 3); glow(g, W * x + 6, base - 94, 5, 'rgba(255,80,50,A)', 0.8); }
    g.fillStyle = lin(g, 0, base - 50, 0, base, [[0, '#3a3644'], [1, '#1c1a22']]);
    g.beginPath(); g.moveTo(W * 0.08, base); for (let i = 0; i < 4; i++) { g.lineTo(W * (0.08 + i * 0.12), base - 50); g.lineTo(W * (0.2 + i * 0.12), base - 36); } g.lineTo(W * 0.56, base); g.fill();
    g.fillStyle = 'rgba(160,210,255,0.35)'; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(W * (0.08 + i * 0.12) + 2, base - 47); g.lineTo(W * (0.08 + i * 0.12) + 2, base - 38); g.lineTo(W * (0.2 + i * 0.12) - 3, base - 36); g.fill(); }   // sawtooth roof lights
    for (let i = 0; i < 10; i++) { g.fillStyle = 'rgba(255,200,120,0.9)'; g.fillRect(W * (0.11 + i * 0.044), base - 20, 4, 6); }
    glow(g, W * 0.32, base - 16, 70, 'rgba(255,170,90,A)', 0.18);
    g.strokeStyle = '#e0a82a'; g.lineWidth = 2; g.beginPath(); g.moveTo(W * 0.9, base); g.lineTo(W * 0.9, base - 70); g.lineTo(W * 0.72, base - 70); g.moveTo(W * 0.9, base - 62); g.lineTo(W * 0.86, base - 70); g.stroke();
    g.strokeStyle = 'rgba(40,36,40,0.9)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(W * 0.75, base - 70); g.lineTo(W * 0.75, base - 40); g.stroke();
    g.fillStyle = lin(g, 0, base, 0, H, [[0, '#1c1614'], [1, '#0c0908']]); g.fillRect(0, base, W, H - base);
  },
  dusk(g, r) {
    sky(g, [[0, '#18182e'], [0.5, '#5a3a50'], [0.8, '#b87050'], [1, '#d08a5a']], 0.72, '#d08a70'); stars(g, r, 30, 0.5, 0.45);
    const sx = W * (0.2 + r() * 0.6); glow(g, sx, H * 0.66, 90, 'rgba(170,200,255,A)', 0.4); glow(g, sx, H * 0.66, 10, 'rgba(235,245,255,A)', 0.9);   // a small blue Martian sunset
    ridge(g, r, 0.66, 12, '#7a4a44', { lit: '#c0a0b0', rough: 0.7, depth: 20 }); haze(g, H * 0.52, H * 0.7, '#b0a0c0', 0.3);
    ridge(g, r, 0.78, 12, '#5a3024', { lit: '#b07a6a', rim: 'rgba(200,215,255,0.4)', depth: 26 });
    ridge(g, r, 0.92, 7, '#2e1812', { rim: 'rgba(200,215,255,0.3)', depth: 16 });
  },
};

// ---------------------------------------------------------------- the picture of a card
// paint a card's picture onto a fresh canvas (scaled for the screen)
function paintCard(card) {
  const S = SCALE(), c = document.createElement('canvas'); c.width = W * S; c.height = H * S;
  const g = c.getContext('2d');
  g.scale(S, S); g.imageSmoothingQuality = 'high'; g.lineJoin = 'round';
  const r = srand(card.id * 7919 + 17), scene = sceneOf(card);
  (SCENES[scene] || SCENES.dusk)(g, r, card);
  const tint = card.type === 3 ? ['#ff6a4a', '#401010'] : card.type === 2 ? ['#6ab0ff', '#101830'] : card.type === 4 ? ['#ffb0e0', '#402034'] : card.type === 0 ? ['#ffe0a0', '#302410'] : ['#c0e080', '#1a2410'];
  finish(g, r, [...tint, '#ffffff', '#000000']);
  return c;
}
// the picture as a URL: the JPEG encoded off the main thread (toBlob) into a blob URL,
// or a data URL in browsers without toBlob
function cardArtAsync(card, done) {
  if (cache.has(card.id)) return done(cacheGet(card.id));
  const c = paintCard(card);
  if (!c.toBlob) { let u = ''; try { u = c.toDataURL('image/jpeg', 0.85); } catch { u = ''; } c.width = c.height = 1; cacheSet(card.id, u); return done(u); }
  c.toBlob((blob) => {
    c.width = c.height = 1;
    if (cache.has(card.id)) return done(cacheGet(card.id));
    const u = blob ? URL.createObjectURL(blob) : '';
    cacheSet(card.id, u); done(u);
  }, 'image/jpeg', 0.85);
}

// paint a card's art slot once it is actually on screen (never for hidden slots)
const idle = (f) => (gfx.high || typeof requestIdleCallback === 'undefined' ? setTimeout(f, 16) : requestIdleCallback(f, { timeout: 1500 }));
const show = (el, url) => { if (url && el.isConnected) { el.firstElementChild.style.backgroundImage = `url(${url})`; el.classList.add('on'); } };
function pump() {
  pumping = true;
  if (gfx.low) { queue.length = 0; pumping = false; return; }
  const t0 = performance.now(), budget = gfx.high ? 12 : 6;
  while (queue.length && performance.now() - t0 < budget) {
    const [el, card] = queue.shift();
    if (!el.isConnected) continue;
    cardArtAsync(card, (url) => show(el, url));
  }
  if (queue.length) idle(pump); else pumping = false;
}
export function watchArt(slot, card) {
  if (!slot || typeof IntersectionObserver === 'undefined' || gfx.low) return;
  if (cache.has(card.id)) { const u = cacheGet(card.id); if (u) { slot.firstElementChild.style.backgroundImage = `url(${u})`; slot.classList.add('on'); } return; }
  slot._card = card;
  io ||= new IntersectionObserver((ents) => {
    for (const e of ents) if (e.isIntersecting) { io.unobserve(e.target); queue.push([e.target, e.target._card]); }
    if (queue.length && !pumping) { if (gfx.high) pump(); else { pumping = true; idle(pump); } }
  });
  io.observe(slot);
}
