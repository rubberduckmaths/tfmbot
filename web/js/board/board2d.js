// board2d.js -- the flat, top-down board: Settings > Board view > 2D map (or ?board=2d).
//
// Same public interface as Board3D (board3d.js), as far as app/ uses it:
// setMap / syncTiles / syncClaims / highlight / clearHighlight / markPicked /
// clearPicked / flashSpace / screenOf / ensureVisible / resetView / setInsets /
// onHover / onInspect / onPick / highlighted / cells ..., plus strike() and
// offBoardSpot() for the asteroid moments. The 3D-only parts (moons, space
// cards' scenery, globe terrain fx, tile-art shaders) are no-op stubs.
//
// One SVG over the page (where the WebGL canvas would be), user units = CSS px;
// the board lives in a "world" group in hex units (column pitch 1, y down,
// the same board plane board3d.js projects onto the globe), scaled to fit the
// free area between the HUD panels, with wheel / pinch zoom and drag panning.
// Under the grid: the map's own regional Mars texture (assets/maps/<key>/region*.webp,
// azimuthal-equidistant about the board centre -- the flat board plane IS that projection).
import { MAP_KEYS, MAP_LABELS } from './board3d.js';
import { tName, onLangChange } from '../i18n.js';
import { MAP_TEX_V } from './layout.js';

const NS = 'http://www.w3.org/2000/svg';
const HEX_R = 1 / Math.sqrt(3);          // pointy-top hex circumradius, column pitch 1 (as board3d.js)
const THETA_MAX = 50 * Math.PI / 180;    // board edge on the globe (board3d.js): fixes the texture scale
const REG_A = 62 * Math.PI / 180;        // regional texture radius (the baked regional texture's radius: web/assets/maps/README.md)
const TEX_W = 256, TEX_H = 296;          // board3d.js cellTex box: a hex is drawn in these units, scaled to 1 x 2*HEX_R
const SPECIAL_ICON = { 4: 'commerical_district', 7: 'lava_flows', 10: 'mohole_area', 11: 'natural_preserve', 12: 'nuclear_zone', 13: 'restricted_area', 14: 'industrial_center', 15: 'ecological_zone', 16: 'mining_area', 17: 'mining_area' };
const BONUS_ICON = { 0: 'steel', 1: 'titanium', 2: 'plant', 3: 'card', 4: 'heat', 5: 'power', 11: '../tiles/ocean', 12: '../temperature', 14: '../temperature' };
const BONUS_COST = { 11: 6, 12: 3, 14: 4 };
const ICON_ASPECT = { card: 334 / 478, '../tiles/ocean': 418 / 483, '../temperature': 163 / 547 };
const COLONY_K = 1.2;                    // the off-planet hexes are drawn a little larger

const el = (tag, attrs, parent) => {
  const e = document.createElementNS(NS, tag);
  if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
};
const hexPts = (r, cx = 0, cy = 0) => {
  const p = [];
  for (let k = 0; k < 6; k++) { const a = Math.PI / 2 + k * Math.PI / 3; p.push(`${(cx + Math.cos(a) * r).toFixed(4)},${(cy - Math.sin(a) * r).toFixed(4)}`); }
  return p.join(' ');
};
const css = (c) => (typeof c === 'number' ? '#' + c.toString(16).padStart(6, '0') : c);
const tileArt = (kind) => ({ city: 'city', greenery: 'greenery', ocean: 'ocean' }[kind] || 'special');

export class Board2D {
  constructor(canvas) {
    this.flat = true;
    document.body.classList.add('board-2d');       // (app.css hides the WebGL canvas)
    this.svg = el('svg', { id: 'board2d', 'aria-label': 'Mars' });
    canvas.after(this.svg);
    this.canvas = this.svg;                        // (hud.js layout(): the insets are measured from this element's edges)
    this.defs = el('defs', null, this.svg);
    this.world = el('g', { class: 'b2-world' }, this.svg);
    this.fxWrap = this.world;
    this.cells = [];
    this.tiles = new Map();
    this.claimMarks = new Map();
    this.highlighted = new Set();
    this.hlEls = new Map();
    this.picked = [];
    this.hoverSpace = -1;
    this.playerColors = [0x3fb6ff, 0xff6a3d];
    this.insets = { l: 0, r: 0, t: 0, b: 0 };
    this.zoom = 1; this.pan = null;               // user view: zoom factor over the fit, world point at the free area's centre
    this.terrainReady = Promise.resolve();
    this.hold = false;
    this.bindPointer();
    addEventListener('resize', () => this.apply());
    onLangChange(() => { if (this.map) this.relabel(); });
  }

  // ---------------------------------------------------------------- 3D-only: stubs
  setMoonState() {}
  prewarmTiles(phase, onProgress) { onProgress?.(1); return Promise.resolve(); }
  setGlobals(temp, oxy, oceans) { this.globals = { temp, oxy, oceans }; }

  // ---------------------------------------------------------------- the map
  setMap(map, mapId) {
    this.map = map;
    const key = map.key || MAP_KEYS[mapId] || 'tharsis';
    this.mapId = mapId ?? +(Object.entries(MAP_KEYS).find(([, v]) => v === key)?.[0] ?? 0);
    const labels = MAP_LABELS[this.mapId];
    this.world.textContent = ''; this.defs.textContent = '';
    this.tiles = new Map(); this.claimMarks = new Map(); this.highlighted = new Set(); this.hlEls = new Map(); this.picked = [];
    this.onPick = null; this.ghostKind = null; this.ghost = null;
    this.zoom = 1; this.pan = null;
    const land = map.spaces.filter((s) => s.kind !== 2);
    const uv = (s) => [s.x + (s.y % 2 ? 0.5 : 0), s.y * 1.5 * HEX_R];
    const us = land.map((s) => uv(s)[0]), vs = land.map((s) => uv(s)[1]);
    const u0 = (Math.min(...us) + Math.max(...us)) / 2, v0 = (Math.min(...vs) + Math.max(...vs)) / 2;
    let rmax = 0;
    for (const s of land) {
      const [u, v] = uv(s);
      for (let k = 0; k < 6; k++) { const a = Math.PI / 2 + k * Math.PI / 3; rmax = Math.max(rmax, Math.hypot(u - u0 + Math.cos(a) * HEX_R, v - v0 - Math.sin(a) * HEX_R)); }
    }
    this.rmax = rmax;
    const scale = THETA_MAX / rmax;                 // radians per hex unit on the globe
    // layers, bottom to top
    const L = (cls) => el('g', { class: cls }, this.world);
    this.lDisc = L('b2-disc'); this.lHex = L('b2-hexes'); this.lTiles = L('b2-tiles'); this.lClaims = L('b2-claims');
    this.lMarks = L('b2-marks'); this.lHl = L('b2-hl'); this.lFx = L('b2-fx'); this.lGhost = L('b2-ghost');
    this.hoverEl = el('polygon', { class: 'b2-hover', points: hexPts(HEX_R * 0.97) }, this.lHl);
    this.hoverEl.style.display = 'none';
    this.buildDisc(key, scale);
    this.cells = [];
    let colonyIdx = 0;
    const top = Math.min(...land.map((s) => uv(s)[1] - v0));
    for (const s of map.spaces) {
      let cell;
      if (s.kind === 2) {
        // off-planet: up-left / up-right of the board, beyond the rim (Ganymede left, Phobos right, as on the globe)
        const side = colonyIdx++ === 0 ? -1 : 1;
        cell = { i: s.i, colony: true, x: side * (rmax - 0.35), y: top + 0.3, k: COLONY_K };
      } else {
        const [u, v] = uv(s);
        cell = { i: s.i, colony: false, x: u - u0, y: v - v0, k: 1 };
      }
      Object.assign(cell, { kind: s.kind, name: s.kind === 2 || !labels ? s.name : labels[s.i] || '', b: s.b || [], volc: !!s.volc, adj: s.adj });
      cell.bx = cell.x; cell.by = cell.y;
      this.cells[s.i] = cell;
      this.buildCell(cell);
    }
    // the fit box: every hex (the Mars disc may be cropped)
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const c of this.cells) {
      if (!c) continue;
      const rx = (c.colony ? 1.05 : 0.5) * c.k, ry = (c.colony ? 1.45 : HEX_R) * c.k;   // colonies: their body and label
      x0 = Math.min(x0, c.x - rx); x1 = Math.max(x1, c.x + rx); y0 = Math.min(y0, c.y - HEX_R * c.k - 0.05); y1 = Math.max(y1, c.y + (c.colony ? ry : HEX_R));
    }
    this.box = { x0, y0, x1, y1 };
    this.apply();
  }

  // the planet under the grid: this map's regional texture, a soft-edged disc a little wider than the board
  buildDisc(key, scale) {
    const R = this.rmax * 1.13, half = REG_A / scale;
    const id = 'b2m' + (this.discN = (this.discN || 0) + 1);
    const grad = el('radialGradient', { id: id + 'g' }, this.defs);
    el('stop', { offset: '0.86', 'stop-color': '#fff' }, grad);
    el('stop', { offset: '1', 'stop-color': '#000' }, grad);
    const mask = el('mask', { id: id + 'm', maskContentUnits: 'userSpaceOnUse' }, this.defs);
    el('circle', { cx: 0, cy: 0, r: R, fill: `url(#${id}g)` }, mask);
    const shade = el('radialGradient', { id: id + 's' }, this.defs);   // a little limb darkening: reads as a planet, not a photo
    el('stop', { offset: '0.55', 'stop-color': '#000', 'stop-opacity': '0' }, shade);
    el('stop', { offset: '1', 'stop-color': '#000', 'stop-opacity': '0.55' }, shade);
    el('circle', { class: 'b2-glow', cx: 0, cy: 0, r: R * 1.02 }, this.lDisc);
    el('circle', { cx: 0, cy: 0, r: R, fill: '#8a4a2c' }, this.lDisc);   // (until the texture is in)
    const g = el('g', { mask: `url(#${id}m)` }, this.lDisc);
    const img = el('image', { x: -half, y: -half, width: 2 * half, height: 2 * half, preserveAspectRatio: 'none', class: 'b2-tex' }, g);
    el('circle', { cx: 0, cy: 0, r: R, fill: `url(#${id}s)` }, g);
    const real = Object.values(MAP_KEYS).includes(key);
    const light = innerWidth * devicePixelRatio < 1400;
    const url = real ? `assets/maps/${key}/region${light ? '_1k' : ''}.webp?v=${MAP_TEX_V}` : 'assets/mars_disc.jpg';
    this.terrainReady = new Promise((res) => {
      const im = new Image();
      const done = () => { clearTimeout(to); res(); };
      const to = setTimeout(done, 8000);
      im.onload = () => { img.setAttribute('href', url); done(); };
      im.onerror = () => { console.warn('2d map texture', url); done(); };
      im.src = url;
    });
  }

  buildCell(c) {
    const g = el('g', { class: 'b2-cell' + (c.kind === 1 ? ' ocean' : c.colony ? ' colony' : ''), transform: `translate(${c.x.toFixed(4)},${c.y.toFixed(4)})${c.k !== 1 ? ` scale(${c.k})` : ''}` }, this.lHex);
    c.g = g;
    if (c.colony) {
      const gany = /ganymede/i.test(c.name || '');
      el('circle', { class: 'b2-moon ' + (gany ? 'gany' : 'phobos'), cx: 0, cy: 0, r: gany ? 0.62 : 0.52 }, g);
    }
    el('polygon', { class: 'b2-hex', points: hexPts(HEX_R * 0.985) }, g);
    el('polygon', { class: 'b2-hexin', points: hexPts(HEX_R * 0.9) }, g);
    const deco = el('g', { class: 'b2-deco', transform: `scale(${1 / TEX_W}) translate(${-TEX_W / 2},${-TEX_H / 2})` }, g);
    c.deco = deco;
    this.drawDeco(c);
    if (c.colony) {
      c.label = el('text', { class: 'b2-clabel', x: 0, y: 0, transform: `translate(0,${(HEX_R + 0.2).toFixed(3)}) scale(0.01)` }, g);
      this.relabelColony(c);
    }
  }

  // bonuses, volcano glyph and name, in board3d.js cellTex's 256 x 296 box (same layout, same numbers)
  drawDeco(c) {
    const g = c.deco, w = TEX_W, h = TEX_H;
    g.textContent = '';
    const list = c.b.filter((b) => BONUS_ICON[b]), icons = list.map((b) => BONUS_ICON[b]);
    const cost = c.b.reduce((a, b) => a + (BONUS_COST[b] || 0), 0);
    const n = icons.length, sz = n > 2 ? 76 : 100;             // (a little larger than on the globe: read flat, from further away)
    const box = icons.map((ic, k) => {
      if (!BONUS_COST[list[k]]) return { w: sz, h: sz, paid: false };
      const asp = ICON_ASPECT[ic] || 1, hh = sz * (asp < 0.5 ? 0.88 : 0.8); return { w: hh * asp, h: hh, paid: true };
    });
    const bs = cost ? Math.round(sz * 0.58) : 0;
    const step = (k) => (box[k - 1].paid || box[k].paid ? box[k - 1].w + 4 : sz * 0.9);
    let span = box.length ? box[box.length - 1].w : 0;
    for (let k = 1; k < box.length; k++) span += step(k);
    let x = w / 2 - (span + (cost ? 5 + bs : 0)) / 2;
    icons.forEach((ic, k) => {
      if (k) x += step(k);
      el('image', { class: 'b2-bonus', href: `assets/res/${ic}.png`, x: x.toFixed(1), y: (h / 2 - box[k].h / 2).toFixed(1), width: box[k].w.toFixed(1), height: box[k].h.toFixed(1) }, g);
    });
    if (cost) {
      const bx = x + (box.length ? box[box.length - 1].w + 5 : 0), by = h / 2 - bs / 2 + sz * 0.06;
      el('image', { class: 'b2-bonus', href: 'assets/res/megacredit.png', x: bx, y: by, width: bs, height: bs }, g);
      const tx = el('text', { class: 'b2-cost', x: bx + bs / 2 - bs * 0.03, y: by + bs * 0.56, 'font-size': Math.round(bs * 0.64) }, g);
      tx.textContent = `-${cost}`;
    }
    if (c.volc) {
      el('path', { class: 'b2-volc', d: `M${w / 2 - 26},78L${w / 2 - 8},52L${w / 2 + 8},52L${w / 2 + 26},78Z` }, g);
      el('circle', { class: 'b2-volc-fire', cx: w / 2, cy: 46, r: 6 }, g);
    }
    if (c.name && !c.colony) {
      const name = tName('space.', c.name) || c.name;
      const words = name.split(' '), lines = words.length > 1 ? [words.slice(0, -1).join(' '), words[words.length - 1]] : [name];
      lines.forEach((ln, k) => {
        const t = el('text', { class: 'b2-name', x: w / 2, y: (lines.length > 1 ? h - 74 + k * 31 : h - 60) }, g);
        t.textContent = ln.toLocaleUpperCase();
        const room = k === lines.length - 1 ? 9 : 12;       // (the hex narrows toward its bottom point)
        if (ln.length > room) t.setAttribute('font-size', Math.max(18, Math.round(32 * room / ln.length)));
      });
    }
  }

  relabelColony(c) {
    const words = (tName('space.', c.name) || c.name || '').split(' ');
    const lines = words.length > 1 ? [words.slice(0, -1).join(' '), words[words.length - 1]] : words;
    c.label.textContent = '';
    lines.forEach((ln, k) => { const s = el('tspan', { x: 0, dy: k ? '1.1em' : '0.8em' }, c.label); s.textContent = ln.toLocaleUpperCase(); });
  }

  relabel() { for (const c of this.cells) if (c) { this.drawDeco(c); if (c.colony) this.relabelColony(c); } }

  // ---------------------------------------------------------------- view: fit + zoom / pan
  setInsets(ins) { this.insets = ins; this.apply(); }
  // the free area between the HUD panels, in the SVG's own pixels (its box: hud.js layout() sizes it to the visible viewport)
  free() {
    const R = this.svg.getBoundingClientRect(), W = R.width || innerWidth, H = R.height || innerHeight;
    this.orgX = R.left; this.orgY = R.top;
    const ins = this.insets || { l: 0, r: 0, t: 0, b: 0 }, pad = Math.min(W, H) < 500 ? 4 : 12;
    const x0 = Math.max(0, ins.l) + pad, x1 = W - Math.max(0, ins.r) - pad;
    let y0 = Math.max(0, ins.t) + pad, y1 = H - Math.max(0, ins.b) - pad;
    // a flat board is not seen past the HUD like the globe: keep it clear of the status line
    // above and the undo / pass row below (the action rows fade while a tile is placed: app.css)
    const vis = (e) => e && e.offsetParent !== null && !e.classList.contains('hidden');
    const st = document.getElementById('status'), ctl = document.querySelector('#turnctl .ctl');
    if (vis(st)) { const r = st.getBoundingClientRect(); if (r.bottom - R.top < H / 3 && r.right - R.left > x0 && r.left - R.left < x1) y0 = Math.max(y0, r.bottom - R.top + 2); }
    if (vis(ctl)) { const r = ctl.getBoundingClientRect(); if (r.top - R.top > H / 2 && r.height) y1 = Math.min(y1, r.top - R.top - 2); }
    return { x0, y0, w: Math.max(120, x1 - x0), h: Math.max(120, y1 - y0) };
  }
  apply() {
    if (!this.box) return;
    const f = this.free(), b = this.box, bw = b.x1 - b.x0, bh = b.y1 - b.y0;
    this.fitK = Math.min(f.w / bw, f.h / bh);
    this.K = this.fitK * this.zoom;
    const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    const p = this.pan || { x: cx, y: cy };
    // drag pans at any zoom: zoomed in edge to edge, and always up to a third of the board beyond that (to pull hexes out from under the panels)
    const hx = Math.max(0, (bw - f.w / this.K) / 2) + bw * 0.34, hy = Math.max(0, (bh - f.h / this.K) / 2) + bh * 0.34;
    p.x = Math.min(cx + hx, Math.max(cx - hx, p.x)); p.y = Math.min(cy + hy, Math.max(cy - hy, p.y));
    if (this.pan) this.pan = p;
    this.TX = f.x0 + f.w / 2 - p.x * this.K; this.TY = f.y0 + f.h / 2 - p.y * this.K;
    this.world.setAttribute('transform', `matrix(${this.K.toFixed(5)},0,0,${this.K.toFixed(5)},${this.TX.toFixed(2)},${this.TY.toFixed(2)})`);
  }
  // client (event) coordinates <-> the board plane
  toWorld(cx, cy) { return { x: (cx - (this.orgX || 0) - this.TX) / this.K, y: (cy - (this.orgY || 0) - this.TY) / this.K }; }
  zoomAt(z, sx, sy) {
    z = Math.max(0.8, Math.min(4, z));             // (a little below the fit: the edge hexes can be seen clear of the HUD)
    const w = this.toWorld(sx, sy), f = this.free();
    sx -= this.orgX; sy -= this.orgY;
    this.zoom = z; this.K = this.fitK * z;
    // keep the world point under (sx, sy) where it is
    this.pan = { x: w.x - (sx - (f.x0 + f.w / 2)) / this.K, y: w.y - (sy - (f.y0 + f.h / 2)) / this.K };
    this.apply();
  }
  resetView() {
    if (this.zoom === 1 && !this.pan) return;
    const z0 = this.zoom, p0 = this.pan || this.centre(), p1 = this.centre(), t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / 350), e = 1 - Math.pow(1 - k, 3);
      this.zoom = z0 + (1 - z0) * e; this.pan = { x: p0.x + (p1.x - p0.x) * e, y: p0.y + (p1.y - p0.y) * e };
      if (k >= 1) { this.zoom = 1; this.pan = null; }
      this.apply();
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  centre() { const b = this.box; return { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 }; }
  // a bot move or a hint off screen (zoomed in or panned away): glide to it
  ensureVisible(space) {
    const c = this.cells[space];
    if (!c) return;
    const p = this.screenOf(space), f = this.free(), m = 30, x = p.x - this.orgX, y = p.y - this.orgY;
    if (x > f.x0 + m && x < f.x0 + f.w - m && y > f.y0 + m && y < f.y0 + f.h - m) return;
    const p0 = this.pan || this.centre(), t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / 450), e = 1 - Math.pow(1 - k, 3);
      this.pan = { x: p0.x + (c.x - p0.x) * e, y: p0.y + (c.y - p0.y) * e };
      this.apply();
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  ensureVisibleAuto(space) { this.ensureVisible(space); }
  screenOf(space) {
    const c = this.cells[space];
    if (!c || this.K == null) return null;
    return { x: (this.orgX || 0) + this.TX + c.x * this.K, y: (this.orgY || 0) + this.TY + c.y * this.K };
  }
  get slots() { return this.cells; }

  // ---------------------------------------------------------------- tiles
  syncTiles(tiles, animate) {
    this.clearPicked();
    const seen = new Set(), placed = [];
    for (const [space, type, owner] of tiles) {
      const c = this.cells[space];
      if (!c) continue;
      seen.add(space);
      const key = `${type}:${owner}`, cur = this.tiles.get(space);
      if (cur && cur.key === key) continue;
      if (cur) cur.g.remove();
      const g = this.makeTile(c, type, owner);
      this.tiles.set(space, { g, key, type, owner });
      c.g.classList.add('covered');
      const cm = this.claimMarks.get(space);
      if (cm) { cm.remove(); this.claimMarks.delete(space); }      // the claim is used up
      if (animate) { this.animateIn(c, g, type); placed.push(space); }
    }
    for (const [space, t] of this.tiles) if (!seen.has(space)) { t.g.remove(); this.tiles.delete(space); this.cells[space]?.g.classList.remove('covered'); }
    return placed;
  }

  // a greenery drawn to fill its hex exactly (the tile art's hex is off-centre with an oxygen badge): a green
  // bevelled hex, a tree, and the owner's player marker (a small cube in their colour) on top
  greenery(g, owner) {
    if (!this.defs.querySelector('#b2-grn')) {
      const gr = el('linearGradient', { id: 'b2-grn', x1: 0, y1: 0, x2: 0, y2: 1 }, this.defs);
      el('stop', { offset: '0', 'stop-color': '#6fbf55' }, gr); el('stop', { offset: '0.55', 'stop-color': '#3f8f3c' }, gr); el('stop', { offset: '1', 'stop-color': '#2a6a2c' }, gr);
    }
    el('polygon', { points: hexPts(HEX_R * 0.985), fill: 'url(#b2-grn)', stroke: '#1f4f22', 'stroke-width': 0.02 }, g);
    el('polygon', { points: hexPts(HEX_R * 0.86), fill: 'none', stroke: 'rgba(255,255,255,.22)', 'stroke-width': 0.018 }, g);
    const s = HEX_R / 0.577, tree = el('g', { transform: `scale(${s.toFixed(3)})` }, g);
    el('path', { d: 'M-.04 .02 L.04 .02 L.055 .27 L-.055 .27 Z', fill: '#1e4d22' }, tree);
    for (const [x, y, r] of [[-.12, -.1, .13], [.12, -.1, .13], [0, -.22, .15], [0, -.04, .14]])
      el('circle', { cx: x, cy: y, r, fill: '#2f7033', stroke: '#1e4d22', 'stroke-width': .014 }, tree);
    if (owner >= 0) {                                   // the player marker: a little cube, top face lit
      const pc = css(this.playerColors[owner] ?? 0xffffff), m = el('g', { transform: `translate(${(0.19 * s).toFixed(3)},${(-0.24 * s).toFixed(3)}) scale(${(1.4 * s).toFixed(3)})` }, g);
      el('polygon', { points: '-.07,-.035 0,-.07 .07,-.035 0,0', fill: pc, stroke: 'rgba(0,0,0,.55)', 'stroke-width': .01 }, m);
      for (const [pts, shade] of [['-.07,-.035 0,0 0,.075 -.07,.04', .22], ['.07,-.035 0,0 0,.075 .07,.04', .4]]) {   // the sides in shade
        el('polygon', { points: pts, fill: pc }, m);
        el('polygon', { points: pts, fill: `rgba(0,0,0,${shade})`, stroke: 'rgba(0,0,0,.55)', 'stroke-width': .01 }, m);
      }
    }
  }

  makeTile(c, type, owner) {
    const outer = el('g', { class: 'b2-tile', transform: `translate(${c.x.toFixed(4)},${c.y.toFixed(4)})${c.k !== 1 ? ` scale(${c.k})` : ''}` }, this.lTiles);
    const g = el('g', { class: 'b2-tin' }, outer);
    const f = 0.95, W = f, H = 2 * HEX_R * f;
    const img = (href, s = 1, dy = 0) => el('image', { href, x: (-W * s / 2).toFixed(4), y: (-H * s / 2 + dy).toFixed(4), width: (W * s).toFixed(4), height: (H * s).toFixed(4) }, g);
    const special = SPECIAL_ICON[type];
    if (type === 0) img('assets/tiles/ocean.png');
    else if (type === 1) this.greenery(g, owner);
    else if (type === 2) img('assets/tiles/city.png');
    else if (type === 3) {                      // Capital: a city with a gold star
      img('assets/tiles/city.png');
      el('path', { class: 'b2-capital', d: starPath(0.2, -0.3, 0.13) }, g);
    } else {
      img('assets/tiles/special.png');
      if (special) el('image', { href: `assets/tiles/${special}.png`, x: -0.29, y: -0.3, width: 0.58, height: 0.58 }, g);
    }
    if (owner >= 0) {
      const pc = css(this.playerColors[owner] ?? 0xffffff);
      el('polygon', { class: 'b2-own-shadow', points: hexPts(HEX_R * 0.955) }, g);
      el('polygon', { class: 'b2-own', points: hexPts(HEX_R * 0.93), stroke: pc }, g);
    }
    outer.dataset.space = c.i;
    return outer;
  }

  // a tile pops in (falls a little, overshoots, settles) with a puff of dust; an ocean floods in with ripples
  animateIn(c, outer, type) {
    const g = outer.firstChild;
    if (type === 0) {
      g.animate([{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'scale(1.04)', offset: 0.7 }, { opacity: 1, transform: 'scale(1)' }], { duration: 900, easing: 'ease-out' });
      for (let i = 0; i < 3; i++) this.ring(c, '#8fd3ff', 0.2, 0.95, 1100, i * 260, 0.05);
      return;
    }
    g.animate([
      { opacity: 0, transform: 'translate(0px,-0.45px) scale(1.45)' },
      { opacity: 1, transform: 'translate(0px,0px) scale(0.93)', offset: 0.62 },
      { opacity: 1, transform: 'scale(1.03)', offset: 0.82 },
      { opacity: 1, transform: 'scale(1)' },
    ], { duration: 560, easing: 'cubic-bezier(.3,.7,.4,1)' });
    const fx = this.fxGen;                        // (a replay seek bumps fxGen: no dust after it)
    setTimeout(() => { if (fx === this.fxGen) this.dust(c); }, 340);
  }
  ring(c, color, r0, r1, ms, delay = 0, sw = 0.06) {
    const r = el('circle', { class: 'b2-ring', cx: c.x, cy: c.y, r: r1 * c.k, stroke: color, 'stroke-width': sw }, this.lFx);
    r.animate([{ transform: `scale(${(r0 / r1).toFixed(3)})`, opacity: 0.9 }, { transform: 'scale(1)', opacity: 0 }], { duration: ms, delay, easing: 'ease-out', fill: 'both' }).finished.then(() => r.remove(), () => r.remove());
  }
  dust(c) {
    const g = el('g', { transform: `translate(${c.x},${c.y})` }, this.lFx);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + Math.random() * 0.4, d = 0.45 + Math.random() * 0.25;
      const p = el('circle', { class: 'b2-dust', cx: 0, cy: 0, r: 0.035 + Math.random() * 0.03 }, g);
      p.animate([{ transform: 'translate(0px,0px)', opacity: 0.9 }, { transform: `translate(${(Math.cos(a) * d).toFixed(3)}px,${(Math.sin(a) * d).toFixed(3)}px)`, opacity: 0 }], { duration: 650, easing: 'ease-out', fill: 'both' });
    }
    setTimeout(() => g.remove(), 700);
  }

  // Land Claim: a dashed outline and a little flag in the claimant's colour, on an empty hex
  syncClaims(claims = []) {
    const want = new Map();
    for (const [sp, owner] of claims) if (this.cells[sp] && !this.cells[sp].colony && !this.tiles.has(sp)) want.set(sp, owner);
    for (const [sp, m] of this.claimMarks) if (want.get(sp) !== +m.dataset.owner) { m.remove(); this.claimMarks.delete(sp); }
    for (const [sp, owner] of want) {
      if (this.claimMarks.has(sp)) continue;
      const c = this.cells[sp], pc = css(this.playerColors[owner] ?? 0xffffff);
      const g = el('g', { class: 'b2-claim', transform: `translate(${c.x},${c.y})` }, this.lClaims);
      g.dataset.owner = owner;
      el('polygon', { class: 'b2-claim-ring', points: hexPts(HEX_R * 0.88), stroke: pc }, g);
      el('line', { class: 'b2-claim-pole', x1: -0.2, y1: -0.02, x2: -0.2, y2: -0.42 }, g);
      el('path', { class: 'b2-claim-flag', d: 'M-0.19,-0.42L0.07,-0.34L-0.19,-0.26Z', fill: pc }, g);
      this.claimMarks.set(sp, g);
    }
  }

  // ---------------------------------------------------------------- picking
  highlight(spaces, onPick, ghost) {
    this.clearHighlight();
    this.highlighted = new Set(spaces);
    this.onPick = onPick;
    this.ghostKind = ghost || null;
    document.body.classList.toggle('b2-placing', spaces.length > 0);
    for (const s of spaces) {
      const c = this.cells[s];
      if (!c) continue;
      const p = el('polygon', { class: 'b2-hlhex', points: hexPts(HEX_R * 0.94 * c.k, c.x, c.y) }, this.lHl);
      this.hlEls.set(s, p);
    }
    if (this.hoverSpace >= 0) this.setHover(this.hoverSpace);
  }
  clearHighlight() {
    for (const p of this.hlEls.values()) p.remove();
    this.hlEls = new Map();
    this.highlighted = new Set();
    this.onPick = null; this.ghostKind = null;
    document.body.classList.remove('b2-placing');
    this.showGhost(-1);
    this.svg.style.cursor = '';
  }
  // the tile being placed floats over the hovered candidate
  showGhost(space) {
    if (this.ghost) { this.ghost.remove(); this.ghost = null; }
    if (space < 0 || !this.ghostKind || !this.highlighted.has(space)) return;
    const c = this.cells[space];
    const outer = el('g', { class: 'b2-ghostw', transform: `translate(${c.x},${c.y - 0.12 * c.k}) scale(${c.k})` }, this.lGhost);
    const g = el('g', { class: 'b2-ghostin' }, outer);
    el('image', { href: `assets/tiles/${tileArt(this.ghostKind)}.png`, x: -0.45, y: -HEX_R * 0.9, width: 0.9, height: 2 * HEX_R * 0.9 }, g);
    this.ghost = outer;
  }
  // a pick inside a multi-tile placement (Giant Ice Asteroid's 2 oceans...): the tile rests on the hex, ringed, until the tiles land
  markPicked(space, kind) {
    const c = this.cells[space];
    if (!c) return;
    const g = el('g', { class: 'b2-picked', transform: `translate(${c.x},${c.y}) scale(${c.k})` }, this.lMarks);
    el('image', { href: `assets/tiles/${tileArt(kind)}.png`, x: -0.42, y: -HEX_R * 0.84, width: 0.84, height: 2 * HEX_R * 0.84, opacity: 0.95 }, g);
    el('polygon', { class: 'b2-pickring', points: hexPts(HEX_R * 1.0) }, g);
    this.picked.push(g);
  }
  clearPicked() { for (const g of this.picked) g.remove(); this.picked = []; }

  flashSpace(space, color = 0xffffff) {
    const c = this.cells[space];
    if (!c) return;
    const p = el('polygon', { class: 'b2-flash', points: hexPts(HEX_R * 1.02 * c.k, c.x, c.y), stroke: css(color), fill: css(color) }, this.lFx);
    p.animate([{ opacity: 0.95 }, { opacity: 0 }], { duration: 1100, easing: 'ease-in', fill: 'both' }).finished.then(() => p.remove(), () => p.remove());
  }

  setHover(s) {
    this.hoverSpace = s;
    const c = this.cells[s];
    for (const [sp, p] of this.hlEls) p.classList.toggle('on', sp === s);
    if (c && !this.highlighted.has(s)) {
      this.hoverEl.setAttribute('transform', `translate(${c.x},${c.y}) scale(${c.k})`);
      this.hoverEl.style.display = '';
    } else this.hoverEl.style.display = 'none';
    this.svg.style.cursor = s >= 0 && this.highlighted.has(s) ? 'pointer' : '';
    this.showGhost(s);
  }

  // the space under a screen point: exact hex hit test (nearest centre, then inside the hexagon)
  pickAt(cx, cy, touch = false) {
    const w = this.toWorld(cx, cy);
    let best = -1, bd = Infinity;
    for (const c of this.cells) {
      if (!c) continue;
      const dx = Math.abs(w.x - c.x) / c.k, dy = Math.abs(w.y - c.y) / c.k;
      const inside = c.colony ? Math.hypot(dx, dy) < HEX_R * 1.05 : dx <= 0.5 && dy <= HEX_R - dx / Math.sqrt(3);
      if (inside) { const d = Math.hypot(dx, dy); if (d < bd) { bd = d; best = c.i; } }
    }
    // a finger is wide: a tap just over the edge of a candidate hex still picks it
    if (touch && this.highlighted.size && !this.highlighted.has(best)) {
      let nb = -1, nd = 0.62;
      for (const s of this.highlighted) { const c = this.cells[s]; if (!c) continue; const d = Math.hypot(w.x - c.x, w.y - c.y) / c.k; if (d < nd) { nd = d; nb = s; } }
      if (nb >= 0) return nb;
    }
    return best;
  }
  pick(e) { return this.pickAt(e.clientX, e.clientY, e.pointerType && e.pointerType !== 'mouse'); }

  bindPointer() {
    const svg = this.svg, pts = new Map();
    let down = null, pinch = null;
    svg.addEventListener('pointerdown', (e) => {
      if (e.button > 0 && e.pointerType === 'mouse') return;
      try { svg.setPointerCapture?.(e.pointerId); } catch {}   // (throws if the pointer was already released)
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) down = { x: e.clientX, y: e.clientY, pan: { ...(this.pan || this.centre()) }, moved: false };
      else if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, z: this.zoom };
        if (down) down.moved = true;           // never a tap
      }
    });
    svg.addEventListener('pointermove', (e) => {
      if (pts.has(e.pointerId)) pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pts.size >= 2) {
        const [a, b] = [...pts.values()];
        this.zoomAt(pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d, (a.x + b.x) / 2, (a.y + b.y) / 2);
        return;
      }
      if (down && pts.size === 1) {
        const dx = e.clientX - down.x, dy = e.clientY - down.y;
        if (!down.moved && Math.hypot(dx, dy) > 8) down.moved = true;
        if (down.moved) { this.pan = { x: down.pan.x - dx / this.K, y: down.pan.y - dy / this.K }; this.apply(); }
        if (down.moved) return;
      }
      if (e.pointerType !== 'mouse') return;
      const s = this.pick(e);
      if (s !== this.hoverSpace) this.setHover(s);
      this.onHover?.(s, e);
    });
    const up = (e) => {
      const had = pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (!had || pts.size) return;
      const d = down; down = null;
      if (!d || d.moved || e.type !== 'pointerup') return;
      const s = this.pick(e);
      if (s >= 0 && this.onPick && this.highlighted.has(s)) this.onPick(s);
      else if (s >= 0 && this.onInspect) this.onInspect(s, e);
    };
    svg.addEventListener('pointerup', up);
    svg.addEventListener('pointercancel', up);
    svg.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !pts.size) { this.setHover(-1); this.onHover?.(-1, e); } });
    svg.addEventListener('dblclick', () => this.resetView());
    svg.addEventListener('wheel', (e) => { e.preventDefault(); this.zoomAt(this.zoom * Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY); }, { passive: false });
    svg.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // ---------------------------------------------------------------- asteroid moments (anim.js animateDiff)
  // a spot just beyond the board's rim, below it (a miss that still hits Mars)
  offBoardSpot() {
    const a = Math.PI * (0.2 + Math.random() * 0.6), r = this.rmax * (1.02 + Math.random() * 0.06);
    return { i: -1, colony: false, off: true, x: Math.cos(a) * r, y: Math.sin(a) * r, k: 1 };
  }
  // a streak falls onto the cell, a flash, a shock ring and a scorch mark that fades
  strike(cell, { big = false } = {}) {
    if (!cell || !this.lFx) return;
    const s = big ? 1.5 : 1, x = cell.x, y = cell.y;
    const g = el('g', { class: 'b2-strike' }, this.lFx);
    const from = { x: x + 2.6, y: y - 3.4 };
    const tail = el('line', { class: 'b2-streak', x1: from.x, y1: from.y, x2: from.x, y2: from.y, 'stroke-width': 0.09 * s }, g);
    const head = el('circle', { class: 'b2-rock', cx: from.x, cy: from.y, r: 0.09 * s }, g);
    const t0 = performance.now(), FALL = 420;
    const fall = (now) => {
      const k = Math.min(1, (now - t0) / FALL), e = k * k;
      const hx = from.x + (x - from.x) * e, hy = from.y + (y - from.y) * e, tk = Math.max(0, e - 0.35);
      head.setAttribute('cx', hx); head.setAttribute('cy', hy);
      tail.setAttribute('x2', hx); tail.setAttribute('y2', hy);
      tail.setAttribute('x1', from.x + (x - from.x) * tk); tail.setAttribute('y1', from.y + (y - from.y) * tk);
      if (k < 1) return requestAnimationFrame(fall);
      head.remove(); tail.remove();
      const scorch = el('circle', { class: 'b2-scorch', cx: x, cy: y, r: 0.3 * s }, g);
      scorch.animate([{ opacity: 0.8 }, { opacity: 0.8, offset: 0.4 }, { opacity: 0 }], { duration: 2600, fill: 'both' });
      const flash = el('circle', { class: 'b2-boom', cx: x, cy: y, r: 0.75 * s }, g);
      flash.animate([{ transform: 'scale(.13)', opacity: 1 }, { transform: 'scale(1)', opacity: 0 }], { duration: 520, easing: 'ease-out', fill: 'both' });
      this.ring({ x, y, k: 1 }, '#ffd28a', 0.2, 1.3 * s, 800, 0, 0.07);
      this.svg.animate([{ transform: 'translate(0,0)' }, { transform: `translate(${3 * s}px,${-2 * s}px)` }, { transform: `translate(${-2 * s}px,${2 * s}px)` }, { transform: 'translate(0,0)' }], { duration: 260 });
      setTimeout(() => g.remove(), 2700);
    };
    requestAnimationFrame(fall);
  }
}

function starPath(cx, cy, r) {
  let d = '';
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * 0.45 : r;
    d += `${k ? 'L' : 'M'}${(cx + Math.cos(a) * rr).toFixed(4)},${(cy + Math.sin(a) * rr).toFixed(4)}`;
  }
  return d + 'Z';
}
