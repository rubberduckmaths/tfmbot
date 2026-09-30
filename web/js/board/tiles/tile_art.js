// tile_art.js -- TileArt: the 3D art of every tile on the board. The class is split by tile type across
// the files of this folder (mixins); this file holds the stage (terraforming progress), the rebuild keys,
// the shared materials and textures, and the dispatch from a tile to its builder.
import { gfx } from '../quality.js';
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from '../../../vendor/BufferGeometryUtils.js';
import { BALL, Kit, TAU, V3, Y, _c, _c2, _n, _q, _v, clamp01, compact, fbm2, hexCorner, smooth, vnoise } from './kit.js';
import { mixin } from '../../mixin.js';
import { RestrictedArt } from './restricted.js';
import { NuclearArt } from './nuclear.js';
import { MoholeArt } from './mohole.js';
import { LavaArt } from './lava.js';
import { IndustrialArt } from './industrial.js';
import { MiningArt } from './mining.js';
import { CommercialArt } from './commercial.js';
import { NatureKit } from './nature_kit.js';
import { EcoZoneArt } from './eco_zone.js';
import { PreserveArt } from './preserve.js';
import { CityParts } from './city_parts.js';
import { CityStyles } from './city_styles.js';
import { CapitalArt } from './capital.js';
import { SettlementArt } from './settlements.js';
import { ValleyArt } from './valley.js';
import { WaterArt } from './water.js';
import { TileAnimJobs } from './anim_jobs.js';

export class TileArt {
  // env: constants and helpers shared with board3d.js
  constructor(board, env) {
    this.b = board;
    this.env = env;
    this.HEX_R = env.HEX_R;
    this.anim = [];
    this.mats = {};
    this.tex = {};
    this.st = { gen: 1, temp: -30, oxy: 0, oceans: 0 };
    this.time = { value: 0 };
  }

  // ---------------------------------------------------------------- stage
  // 0..1 terraforming progress, and the pieces tiles key their look on
  get prog() { const s = this.st; return clamp01(((s.temp + 30) / 38 + s.oxy / 14 + s.oceans / 9) / 3); }
  get frost() { return 1 - smooth(-30, -6, this.st.temp); }
  get life() { return smooth(3, 13, this.st.oxy); }
  // city growth bucket 0..3 (a rebuild when it changes): generation and terraforming
  // greenery's look: 0 pioneer lichen and moss (thin cold air), 1 shrubland and young woods, 2 lush forest
  // (the standard tileset -- Settings > Tiles, the default -- is always the grown forest: board.variedTiles off)
  get fstage() { const s = this.st; return !this.b.variedTiles ? 2 : s.oxy >= 9 && s.temp >= -10 ? 2 : s.oxy >= 4 ? 1 : 0; }
  get grow() { const s = this.st; return Math.min(3, Math.floor(Math.max((s.gen - 1) / 3, this.prog * 3.6))); }

  setGlobals(temp, oxy, oceans) {
    Object.assign(this.st, { temp, oxy, oceans });
    if (this.b.stageGen) this.st.gen = this.b.stageGen;
    this.applyStage();
    this.refresh();
  }
  // material-level stage (no rebuild): frost, lights, lushness
  applyStage() {
    const M = this.mats;
    const life = this.b.variedTiles ? this.life : 1;      // (the standard tileset's forests are always lush)
    if (M.frost) { M.frost.opacity = 0.5 * this.frost; M.frost.visible = this.frost > 0.02; }   // (no draw at all once it has thawed)
    if (this.mistFade) this.mistFade.value = 0.25 + 0.75 * this.life;
    // greenery (board3d's shared foliage): dull and olive in thin air, lush green as the oxygen rises
    if (this.b.folMat) { this.b.folMat.color.setRGB(0.9 + 0.1 * life, 0.9 + 0.1 * life, 0.72 + 0.28 * life); this.b.folMat.emissive?.setRGB(0.02, 0.05, 0.015); }   // (the emissive: softer self-shadow in the canopy)
    // city lights: brighter and more of them lit as the cities grow
    if (M.cfac) M.cfac.emissiveIntensity = 0.35 + 0.22 * this.grow;
    if (M.cglass) M.cglass.emissiveIntensity = 0.3 + 0.18 * this.grow;
  }

  // the extra key of a tile: when it changes the tile is rebuilt in place
  // the standard tileset (board.variedTiles off): the special tiles (the Capital, the Ecological Zone...) as they look
  // at the end of the game -- built, and keyed, with the end-game globals in place of the live ones
  endLook(type) { const T = this.env.TILE; return !this.b.variedTiles && !this.inEnd && type !== T.CITY && type !== T.GREENERY && type !== T.OCEAN; }
  withEnd(fn) {
    const s0 = { ...this.st };
    Object.assign(this.st, { gen: 14, temp: 8, oxy: 14, oceans: 9 }); this.inEnd = true;
    try { return fn(); } finally { Object.assign(this.st, s0); this.inEnd = false; }
  }
  xkey(space, type) {
    if (this.endLook(type)) return this.withEnd(() => this.xkey(space, type));
    const T = this.env.TILE;
    if (type === T.CAPITAL) return 'c' + this.oceanMask(space) + ':' + this.grow;
    if (type === T.CITY) return this.cityStyle(space) + ':' + this.grow;
    if (type === T.ECO || type === T.PRESERVE) return 'l' + Math.floor(this.life * 3.99) + (this.st.temp < -12 ? 'f' : '') + ':' + this.oceanMask(space);   // (an ocean next door: the river runs out into it)
    if (type === T.GREENERY) { const n = this.b.tileSrc?.[space] || ''; return /protected valley/i.test(n) ? 'pv' + this.fstage + ':' + this.oceanMask(space) : /mangrove/i.test(n) ? 'mg' : 's' + this.fstage; }
    if (type === T.LAVA) return 'v' + Math.round(this.prog * 4);                 // (the flows crust over as the planet warms)
    if (type === T.OCEAN) return 'f' + Math.round(this.frost * 10) + (this.st.temp > -4 ? 'b' + (this.st.oceans > 6 ? 2 : 1) : '');
    return '';
  }
  // after every syncTiles: rebuild tiles whose extra key changed (an ocean
  // arrived next to the Capital, the stage moved on, the log named a card)
  afterSync(animate) { if (this.b.stageGen) this.st.gen = this.b.stageGen; this.refresh(animate); }
  refresh(animate = false) {
    const B = this.b;
    for (const [space, t] of B.tiles) {
      const [type, owner] = t.userData.key.split(':').map(Number);
      if (t.userData.edge && t.userData.edge.sig !== this.edgeSig(space)) (this.edgeQ ||= new Set()).add(space);   // a neighbour came or went: its seams are redone (tick)
      const xk = this.xkey(space, type);
      if (t.userData.xkey === undefined) { t.userData.xkey = xk; continue; }
      if (t.userData.xkey === xk) continue;
      const pvStage = /^pv/.test(xk) && xk.split(':')[1] === String(t.userData.xkey).split(':')[1];   // a Protected Valley whose oceans are as they were: only its stage moved
      if (type === this.env.TILE.GREENERY && (pvStage || /^s\d/.test(xk) && /^s\d/.test(String(t.userData.xkey))) && performance.now() - (t.userData.born || 0) > 3000) {
        (this.regrowQ ||= new Set()).add(space);                     // a new stage: regrown in the tick, one forest per frame
        continue;
      }
      const n = B.makeTile(space, type, owner);
      n.userData.key = t.userData.key; n.userData.xkey = xk;
      n.position.copy(t.position);
      const was = t.userData.animating, oldMask = t.userData.xkey;
      B.board.remove(t); t.traverse((o) => o.geometry?.dispose());
      B.board.add(n); B.tiles.set(space, n);
      // rebuilt while still coming in: carry on from where it was
      if (was) this.animateIn(n, { from: Math.min(0.95, (performance.now() - was.t0) / 1300) });
      // the Capital: a new ocean next door -- its canal fills
      else if (animate && type === this.env.TILE.CAPITAL) {
        const ids = (x) => new Set(String(x).split(':')[0].slice(1).split('.').filter(Boolean).map(Number));
        const before = ids(oldMask), fresh = [...ids(xk)].filter((i) => !before.has(i));
        if (fresh.length) {
          const cc = B.cells[space], dir = B.cells[fresh[0]].center.clone().sub(cc.center);
          this.animateIn(n, { only: (m) => m.material === this.mats.water || m.material === this.mats.ecoWater, dir });   // (the canals: the Ecological Zone's water)
        }
      }
      // a Protected Valley with a new ocean next door: its dam rises (the water runs in: valleyWater)
      else if (animate && type === this.env.TILE.GREENERY && xk.startsWith('pv') && xk.length > String(oldMask).length) this.animateIn(n, { only: (m) => !!m.userData.dam });
    }
    this.valleyWater(animate);
  }
  // ---------------------------------------------------------------- seams between tiles
  // Each placed land tile fills its half of the gap to every neighbouring tile
  // (the ring between its 0.95 inset and the true hex edge): ground that fades
  // from its own colour to the pair's mean at the shared edge, so the two meet
  // seamlessly -- and a touch of what the pair calls for: forest-forest trees
  // on the seam (one canopy), city-city a street with a dashed line and lamps,
  // city-forest a lawn and a fringe of park trees, works and specials a gravel
  // strip with bollards. A faint line keeps the hex edge; the owner rims stay on
  // top. Redone (just the seams, one tile per frame) when a neighbour arrives.
  edgeCat(type) { const T = this.env.TILE; return type === T.GREENERY ? 'g' : type === T.CITY || type === T.CAPITAL ? 'c' : type === T.COMMERCIAL || type === T.INDUSTRIAL ? 'i' : type === T.OCEAN ? 'o' : 's'; }
  edgeSig(space) {
    const cell = this.b.cells[space];
    if (!cell || cell.colony) return '';
    return this.neighbours(cell).map((n) => { const k = this.b.tiles.get(n.i)?.userData.key; return n.i + (k ? this.edgeCat(+k.split(':')[0]) : '-'); }).join('.') + ':' + this.fstage;
  }
  edgeCol(cat, stage) {
    return cat === 'g' ? [[0.72, 0.55, 0.4], [0.42, 0.6, 0.25], [0.3, 0.47, 0.21]][stage] : cat === 'c' ? [0.33, 0.35, 0.39] : cat === 'i' ? [0.47, 0.46, 0.44] : [0.6, 0.44, 0.31];
  }
  edgeBlend(ctx0) {
    const cell = ctx0.cell;
    if (!cell || cell.colony) return;
    const g = ctx0.g, E = g.userData.edge ||= { ctx: { cell, g, H: ctx0.H, W: ctx0.W, space: ctx0.space, type: ctx0.type, inst: ctx0.inst }, objs: [] }, ctx = E.ctx;
    for (const o of E.objs) { g.remove(o); if (!o.isInstancedMesh) o.geometry?.dispose(); }
    E.objs = [];
    E.sig = this.edgeSig(ctx.space);
    // ---- early greenery (build(): userData.bare): no ground plate, Mars shows round the outpost --
    // so no seams from it, and none painted toward it (below: treated like an empty hex)
    if (g.userData.bare) return;
    const bareNb = (i) => !!this.b.tiles.get(i)?.userData.bare;
    // ----
    const before = new Set(g.children), stage = this.fstage, low = gfx.low, own = this.edgeCat(ctx.type), K = new Kit(), TK = this.env.treeKit();
    const trees = { con: [], broad: [], bush: [] }, HR = this.HEX_R;
    const floor = own === 'g' ? this.forestFloorOf(g) : null;               // (a lush forest: its textured floor runs on into the seams)
    for (const n of this.neighbours(cell)) {
      const nt = this.b.tiles.get(n.i), k = nt?.userData.key;
      if (!k) continue;
      if (own === 'c' && g.userData.domes && nt.userData.pioDomes && stage === 0) this.domeTube(ctx, K, n, nt);   // a domed city next to a domed forest: a glass tube between them
      if (bareNb(n.i)) continue;                                           // (an early greenery: bare Mars, as an empty hex)
      const cn = this.edgeCat(+k.split(':')[0]);
      if (cn === 'o') continue;                                              // (oceans have their own shore)
      let dx = n.bx - cell.bx, dz = n.by - cell.by; const L = Math.hypot(dx, dz); dx /= L; dz /= L;
      const ex = -dz, ez = dx, first = ctx.space < n.i, r = this.env.srand(ctx.space * 311 + n.i * 7), gg = own === 'g' && cn === 'g';
      const pt = (s, v) => [s * (0.5 * dx + v * HR / 2 * ex), s * (0.5 * dz + v * HR / 2 * ez)];
      // the ground: a strip from our edge (inset 0.95) to the shared edge, own colour -> the pair's mean
      const A = this.edgeCol(own, stage), B = this.edgeCol(cn, stage), Mc = A.map((v, i) => (v + B[i]) / 2);
      const lawn = (own === 'c' && cn === 'g') ? [0.4, 0.58, 0.3] : null;
      // forest | forest: no seam of their own -- each floor runs on to the shared edge: a lush
      // forest's textured floor itself (uv carried on past its rim), a young wood's ground colour
      // (its own at our rim, the two floors' mean at the edge, sampled at the same points both sides)
      const tex = gg && floor, ownCf = gg && g.userData.gcf, nbCf = gg && nt.userData.gcf, ox = n.bx - cell.bx, oz = n.by - cell.by, _a = new THREE.Color(), _b = new THREE.Color();
      const NU = 3, NV = 14, pos = [], col = [], uvs = [], idx = [];
      for (let i = 0; i <= NU; i++) for (let j = 0; j <= NV; j++) {
        const u = i / NU, v = -1 + 2 * j / NV, [x, z] = pt(0.95 + 0.05 * u, v), nz = 0.9 + 0.2 * fbm2(x * 30 + 3, z * 30, 2);
        const c0 = lawn && u > 0.2 ? lawn : A, t = smooth(0, 1, u);
        pos.push(x, 0.0006, z);
        if (tex) { col.push(1, 1, 1); uvs.push(0.5 + x / (Math.sqrt(3) * HR * 0.95), 0.5 - z / (2 * HR * 0.95)); }
        else if (ownCf) {
          const [x0, z0] = pt(0.95, v), [x1, z1] = pt(1, v);
          _a.copy(ownCf(x0, z0)); _b.copy(ownCf(x1, z1));
          if (nbCf) _b.lerp(nbCf(x1 - ox, z1 - oz), 0.5); else _b.lerp(_c2.setRGB(...B), 0.5);
          _a.lerp(_b, t); col.push(_a.r, _a.g, _a.b);
        } else col.push((c0[0] + (Mc[0] - c0[0]) * t) * (gg ? 1 : nz), (c0[1] + (Mc[1] - c0[1]) * t) * (gg ? 1 : nz), (c0[2] + (Mc[2] - c0[2]) * t) * (gg ? 1 : nz));
      }
      for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) { const a = i * (NV + 1) + j, b2 = a + NV + 1; idx.push(a, a + 1, b2, b2, a + 1, b2 + 1); }
      const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); sg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); sg.setIndex(idx);
      if (tex) sg.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      sg.computeVertexNormals();
      if (sg.attributes.normal.getY(0) < 0) { sg.index.array.reverse(); sg.computeVertexNormals(); }
      if (tex) K.raw(floor, sg); else K.add('ground', sg, null);
      // the hex edge, kept as a faint line (drawn once per pair) -- not between two forests: one wood
      if (first && !gg) { const [x0, z0] = pt(1, -1), [x1, z1] = pt(1, 1); K.box('std', 0x2a2a2e, (x0 + x1) / 2, 0.0006, (z0 + z1) / 2, Math.hypot(x1 - x0, z1 - z0), 0.0007, 0.0022, -Math.atan2(z1 - z0, x1 - x0)); }
      if (low && !gg) continue;
      const along = (s, v) => { const [x, z] = pt(s, v); return { x, z }; }, ang = -Math.atan2(ez, ex);
      if (gg && stage > 0) this.seamWood(ctx, n, trees, { dx, dz, ex, ez });   // one wood across the edge: trees scattered through it, not a row
      else if (low) continue;
      else if (own === 'g' && cn === 'c' && stage > 0) {                   // the forest's side of a park edge: bushes
        for (let i = 0; i < 5; i++) { const { x, z } = along(0.975, -0.8 + i * 0.4); trees.bush.push({ x, y: z, lift: ctx.H, s: 0.7 + r() * 0.4, rot: r() * 6.28, c: new THREE.Color().setHSL(0.25, 0.5, 0.36 + r() * 0.08) }); }
      } else if (own === 'c' && cn === 'g') {                              // the city's side: a fringe of park trees
        for (let i = 0; i < 3; i++) { const { x, z } = along(0.975, -0.6 + i * 0.6 + (r() - 0.5) * 0.15); trees.broad.push({ x, y: z, lift: ctx.H, s: 0.3 + r() * 0.08, rot: r() * 6.28, lo: true, c: new THREE.Color().setHSL(0.28, 0.5, 0.32 + r() * 0.06) }); }
      } else if (own === 'c' && cn === 'c') {                              // a street along the seam: dashes (once), lamps (each side)
        if (first) for (let i = 0; i < 7; i++) { const { x, z } = along(1, -0.84 + i * 0.28); K.box('glow', 0xd8d4c0, x, 0.0009, z, 0.022, 0.0004, 0.0022, ang); }
        for (const v of [-0.55, 0.05, 0.6]) { const { x, z } = along(0.962, v); K.cyl('metal', 0x3a3e44, x, 0, z, 0.001, 0.0008, 0.02, 5); K.add('glow', BALL, 0xffe2a8, [x, 0.021, z], [0, 0, 0], 0.0024); }
      } else if (first) {                                                  // works / specials: bollards along the seam
        for (let i = 0; i < 9; i++) { const { x, z } = along(1, -0.88 + i * 0.22); K.cyl('std', i % 2 ? 0xf2c21c : 0x3a3a3a, x, 0, z, 0.0022, 0.0022, 0.009, 8); }
      }
    }
    if (K.by.size) this.emit(K, ctx, { shadow: false });
    const fol = this.b.folMat ||= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }), bark = this.b.barkMat ||= new THREE.MeshStandardMaterial({ color: 0x6e4c2e, roughness: 0.95 });
    if (trees.con.length) { ctx.inst(TK.conifer, fol, trees.con); ctx.inst(TK.trunk, bark, trees.con); }
    const bl = trees.broad.filter((t) => t.lo), bb = trees.broad.filter((t) => !t.lo);
    if (bb.length) { ctx.inst(TK.broad, fol, bb); ctx.inst(TK.broadTrunk, bark, bb); }
    if (bl.length) { ctx.inst(TK.broadLo, fol, bl); ctx.inst(TK.trunk, bark, bl); }
    if (trees.bush.length) ctx.inst(TK.bush, fol, trees.bush);
    E.objs = g.children.filter((o) => !before.has(o));
  }
  // a lush forest's floor (board3d's forest-textured cap, or a Protected Valley's carved floor): its
  // material, on a copy of the texture without the dark hex border drawn round it (the border would
  // show as a line along every forest's rim); the seams carry the same floor on to the shared edge
  forestFloorOf(g) {
    const src = this.b.forestTex;
    if (!src?.image) return null;
    const clean = this.canvas('forestClean', src.image.width, src.image.height, (c, w, h) => { c.translate(w / 2, h / 2); c.scale(1.2, 1.2); c.drawImage(src.image, -w / 2, -h / 2); });   // (1.2x: the border falls outside even the seams' uv, which runs 5% past the rim)
    let mat = null;
    for (const m of g.children) if (m.isMesh && !m.isInstancedMesh && m.material && (m.material.map === src || m.material.map === clean)) { m.material.map = clean; mat = m.material; }
    return mat;
  }
  // forest | forest: one wood across the shared edge -- trees, saplings and bushes scattered through
  // the seam zone (a band either side of the edge, where neither forest plants its own), in clumps and
  // gaps, never a row. Seeded by the pair in a frame both sides share, so the two agree; each side
  // plants those rooted on its side (their crowns reach over the line). f: our unit direction to the
  // neighbour (dx, dz) and along the edge (ex, ez)
  seamWood(ctx, n, trees, f) {
    const HR = this.HEX_R, late = this.fstage === 2, lo = Math.min(ctx.space, n.i), sg = ctx.space === lo ? 1 : -1, low = gfx.low;
    const r = this.env.srand(lo * 977 + Math.max(ctx.space, n.i) * 31 + 5), ph = r() * 9, pts = [];
    const W = 0.085, gap = late ? 0.046 : 0.036;
    for (let t = 0; t < 90 && pts.length < (late ? 11 : 14); t++) {
      const v = (r() * 2 - 1) * 0.9, a = (r() * 2 - 1) * W * (1 - 0.4 * v * v), q = r(), p = { a, lat: v * HR / 2, kind: r(), s: r(), rot: r() * 6.28, h: r(), l: r() };
      if (q > 0.25 + 0.75 * vnoise(v * 2.3 + ph, ph)) continue;                              // denser here, thinner there
      if (pts.some((o) => Math.hypot(o.a - p.a, o.lat - p.lat) < gap)) continue;
      pts.push(p);
    }
    for (const p of pts) {
      if (sg * p.a >= 0) continue;                                                          // (the neighbour plants it)
      const al = 0.5 + sg * p.a, lat = sg * p.lat, x = al * f.dx + lat * f.ex, z = al * f.dz + lat * f.ez;
      if (this.env.inClearing(x, z, 0.03)) continue;
      const bush = p.kind > (late ? 0.74 : 0.58);
      if (low && bush) continue;
      const it = { x, y: z, lift: ctx.H, rot: p.rot };
      if (bush) trees.bush.push({ ...it, s: 0.75 + p.s * 0.7, c: new THREE.Color().setHSL(0.24 + p.h * 0.08, 0.5, (late ? 0.28 : 0.36) + p.l * 0.1) });
      else if (p.kind < (late ? 0.44 : 0.36)) trees.con.push({ ...it, s: late ? 0.95 + p.s * 0.55 : 0.4 + p.s * 0.3, c: new THREE.Color().setHSL(late ? 0.3 + p.h * 0.07 : 0.26 + p.h * 0.08, 0.5 + p.l * 0.2, late ? 0.25 + p.l * 0.1 : 0.34 + p.l * 0.1) });
      else trees.broad.push({ ...it, s: late ? 0.9 + p.s * 0.5 : 0.4 + p.s * 0.3, c: new THREE.Color().setHSL(late ? 0.22 + p.h * 0.08 : 0.26 + p.h * 0.08, 0.55 + p.l * 0.2, late ? 0.36 + p.l * 0.1 : 0.34 + p.l * 0.1) });
    }
  }
  // A domed city next to an early (still domed) forest: a glass tube from the nearest city dome to the
  // nearest forest dome -- the city domes' frosted glass, a thin metal ring every so often, a walkway
  // along its floor and a light strip under its crown, sealed into both domes with metal collars. It
  // rests just over the ground on low saddles, following it across the shared edge, and ramps down
  // off the city's plate on legs to the forest on bare Mars. Built from the city's side only (once per
  // pair) with its seams (edgeBlend: redone when either tile changes; gone once the forest has grown).
  // Domed cities: the Domed Crater and the seeded dome city (domeCity), the Cupola City (cupolaCity)
  // -- their builders list their domes in userData.domes; the forest lists its (pioneer: pioDomes).
  domeTube(ctx, K, n, nt) {
    const k = this.kOf(ctx.cell), low = gfx.low, P = nt.userData.pioDomes, CD = ctx.g.userData.domes, rt = 0.019;
    const ox = n.bx - ctx.cell.bx, oz = n.by - ctx.cell.by;                                 // the forest's centre in our frame
    const fy = ((nt.userData.lift ?? ctx.H) - ctx.H) / k;                                    // its ground in our units (bare Mars: under our plate)
    const FD = P.domes.map((d) => ({ ...d, x: d.x + ox, z: d.z + oz })), keep = P.keep.map(([x, z, rr]) => [x + ox, z + oz, rr]);
    const tun = (P.tun || []).map(([ax, az, bx, bz]) => [ax + ox, az + oz, bx + ox, bz + oz]);
    const segD = (x, z, s) => { const dx = s[2] - s[0], dz = s[3] - s[1], t = clamp01(((x - s[0]) * dx + (z - s[1]) * dz) / (dx * dx + dz * dz || 1)); return Math.hypot(x - s[0] - dx * t, z - s[1] - dz * t); };
    const crossSeg = (p, q, s) => { const d = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]), A = [s[0], s[1]], B = [s[2], s[3]]; return d(p, q, A) * d(p, q, B) < 0 && d(A, B, p) * d(A, B, q) < 0; };
    // the pair: the shortest run, well clear of the other domes, the outbuildings, the tunnels and the marker
    let best = null;
    for (const a of CD) for (const b of FD) {
      const D = Math.hypot(b.x - a.x, b.z - a.z), ux = (b.x - a.x) / D, uz = (b.z - a.z) / D, t0 = a.r - 0.012, t1 = D - b.r + 0.012;
      if (t1 - t0 < 0.03) continue;
      let pen = t1 - t0;
      const p = [a.x + ux * t0, a.z + uz * t0], q = [a.x + ux * t1, a.z + uz * t1], s = [...p, ...q];
      for (const o of [...CD.filter((c) => c !== a), ...FD.filter((c) => c !== b)]) if (segD(o.x, o.z, s) < o.r + rt + 0.008) pen += 1;
      for (const [x, z, rr] of keep) if (segD(x, z, s) < rr + rt + 0.01) pen += 1;
      for (const w of tun) if (crossSeg(p, q, w)) pen += 1;
      for (let i = 1; i < 8; i++) { const x = p[0] + (q[0] - p[0]) * i / 8, z = p[1] + (q[1] - p[1]) * i / 8; if (this.env.inClearing(x, z, rt)) { pen += 0.6; break; } }
      if (!best || pen < best.pen) best = { a, b, D, ux, uz, t0, t1, pen };
    }
    if (!best || best.t1 - best.t0 > 0.8) return;
    const { a, b, ux, uz, t0, t1 } = best, sx = -uz, sz = ux;
    // the ground under the run: our plate (a crater's rim, a dome's plinth), then the forest's
    const plate = (x, z) => this.edgeDist(x, z) > 0;
    const gnd = (x, z) => { if (!plate(x, z)) return fy; const g = a.hf ? a.hf(x, z) : 0, pl = CD.reduce((m, d) => (Math.hypot(x - d.x, z - d.z) < d.r + 0.018 ? Math.max(m, d.y) : m), -1e3); return pl > -1e3 ? Math.max(g, pl) : g; };
    const N = Math.max(12, Math.round((t1 - t0) / 0.01)), T = (i) => t0 + (t1 - t0) * i / N, X = (t) => a.x + ux * t, Z = (t) => a.z + uz * t;
    const g0 = [], y = [];
    for (let i = 0; i <= N; i++) g0.push(gnd(X(T(i)), Z(T(i))));
    // on the plate: over its ground (a crater's rim smoothed over); off it: down a ramp to the forest's ground
    let iE = N; for (let i = 0; i <= N; i++) if (!plate(X(T(i)), Z(T(i)))) { iE = i; break; }
    const Rm = Math.max(1, Math.round(0.03 / ((t1 - t0) / N)));
    for (let i = 0; i <= N; i++) { let m = -1e3; for (let j = Math.max(0, i - Rm); j <= Math.min(iE - 1, i + Rm); j++) m = Math.max(m, g0[j]); y.push(m > -1e3 ? m : g0[i]); }
    const ys = y.map((_, i) => { let s = 0, c = 0; for (let j = Math.max(0, i - Rm); j <= Math.min(N, i + Rm); j++) if ((j < iE) === (i < iE)) { s += y[j]; c++; } return s / c + rt * 1.08; });
    if (iE < N) {                                                                             // the ramp: from the plate's edge, down over ~0.12 (or till the forest dome)
      const yE = ys[Math.max(0, iE - 1)], yF = fy + rt * 1.08, tE = T(iE), tR = Math.max(tE + 0.03, Math.min(tE + 0.13, t1 - b.r * 0.35 - 0.03));
      for (let i = iE; i <= N; i++) ys[i] = yE + (yF - yE) * smooth(tE, tR, T(i));
    }
    const pts = ys.map((yy, i) => new V3(X(T(i)), yy, Z(T(i))));
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal'), L = curve.getLength();
    const tube = new THREE.TubeGeometry(curve, Math.max(12, Math.round(L / (low ? 0.02 : 0.008))), rt, low ? 10 : 18, false);
    K.add(this.domeGlass(), tube, 0xffffff, [0, 0, 0], [0, 0, 0], 1, { smooth: true });
    // the collars where it enters each dome: a thick metal ring and a short sleeve, on the dome's wall
    const _t = new V3(), _q2 = new THREE.Quaternion(), ez = new V3(0, 0, 1), eu = new THREE.Euler();
    const onCurve = (tt) => { const u = clamp01((tt - t0) / (t1 - t0)); return { p: curve.getPoint(u), d: curve.getTangent(u, _t).clone() }; };   // (by plan distance: the points are evenly spaced in plan)
    const ring = (mat, geo, col, tt) => { const { p, d } = onCurve(tt); eu.setFromQuaternion(_q2.setFromUnitVectors(ez, d.normalize())); K.add(mat, geo, col, [p.x, p.y, p.z], [eu.x, eu.y, eu.z]); };
    const wallT = (d, dist0, sign) => { let tt = dist0; for (let it = 0; it < 3; it++) { const hh = onCurve(tt).p.y - d.y, rw = d.r * Math.sqrt(Math.max(0.05, 1 - (hh / (d.r * d.hs)) ** 2)); tt = sign > 0 ? rw : best.D - rw; } return tt; };
    const tA = wallT(a, a.r, 1), tB = wallT({ ...b, y: fy }, best.D - b.r, -1);
    for (const tt of [tA, tB]) {
      ring('metal', new THREE.TorusGeometry(rt * 1.2, rt * 0.2, 8, low ? 14 : 24), 0xdde3ea, tt);
      if (!low) ring('metal', new THREE.CylinderGeometry(rt * 1.1, rt * 1.1, 0.012, 20, 1, true).rotateX(Math.PI / 2), 0xc4cad2, tt + (tt === tA ? 0.004 : -0.004));
      if (!low) ring('glow', new THREE.TorusGeometry(rt * 1.23, rt * 0.06, 4, 20), 0x9fe8ff, tt + (tt === tA ? 0.0045 : -0.0045));
    }
    if (!low) {
      // the ribs: a thin ring every ~0.04 between the collars
      const nR = Math.max(1, Math.round((tB - tA) / 0.04));
      const rib = new THREE.TorusGeometry(rt * 1.015, 0.0012, 5, 18);
      for (let i = 1; i < nR; i++) ring('metal', rib, 0xeef2f4, tA + (tB - tA) * i / nR);
      // the walkway along the floor inside, and a light strip under the crown
      const strip = (w, dy, col, mat) => {
        const M = Math.max(8, Math.round((tB - tA) / 0.01)), pos = [], idx = [];
        for (let i = 0; i <= M; i++) { const { p } = onCurve(tA + (tB - tA) * i / M); for (const e of [-1, 1]) pos.push(p.x + sx * e * w / 2, p.y + dy, p.z + sz * e * w / 2); if (i) { const q = (i - 1) * 2; idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); } }
        const sgeo = new THREE.BufferGeometry(); sgeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); sgeo.setIndex(idx); sgeo.computeVertexNormals();
        if (sgeo.attributes.normal.getY(0) < 0) { sgeo.index.array.reverse(); sgeo.computeVertexNormals(); }
        K.add(mat, sgeo, col);
      };
      strip(rt * 1.2, -rt * 0.6, 0x8e8a84, 'std');
      strip(0.0028, rt * 0.86, 0xcfeeff, 'glow');
    }
    // what it stands on: low saddles where it rests on the ground, legs with a foot where it runs over it
    for (let tt = tA + 0.02; tt < tB - 0.015; tt += 0.036) {
      const { p } = onCurve(tt), gy = gnd(p.x, p.z), bot = p.y - rt, clr = bot - gy, ang = -Math.atan2(uz, ux);
      if (clr < 0.014) K.box('metal', 0x8a9098, p.x, gy, p.z, 0.008, Math.max(0.002, clr + rt * 0.3), rt * 1.5, ang);
      else { K.cyl('metal', 0x9aa0a8, p.x, gy, p.z, 0.0024, 0.002, clr + 0.002, 6); K.box('metal', 0x7c848e, p.x, bot - 0.002, p.z, 0.006, 0.003, rt * 1.4, ang); K.cyl('std', 0xa8a298, p.x, gy, p.z, 0.006, 0.006, 0.002, 8); }
    }
  }
  // neighbouring spaces (board distance ~1), cached per cell
  neighbours(cell) {
    if (cell.nb) return cell.nb;
    return cell.nb = this.b.cells.filter((c) => c && !c.colony && c !== cell && Math.hypot(c.bx - cell.bx, c.by - cell.by) < 1.2);
  }
  oceanMask(space) {
    const cell = this.b.cells[space];
    if (!cell || cell.colony) return '';
    return this.neighbours(cell).filter((c) => this.b.tiles.get(c.i)?.userData.key?.startsWith('0:')).map((c) => c.i).join('.');
  }

  // ---------------------------------------------------------------- tick
  tick(t, dt) {
    this.time.value = t;
    if (this.regrowQ?.size) {                                       // forests growing into a new stage: one per frame, animated
      const [space] = this.regrowQ; this.regrowQ.delete(space);
      const B = this.b, old = B.tiles.get(space);
      if (old && old.userData.key?.startsWith('1:')) {
        const xk = this.xkey(space, this.env.TILE.GREENERY);
        if (old.userData.xkey !== xk) {
          const [type, owner] = old.userData.key.split(':').map(Number);
          const n = B.makeTile(space, type, owner);
          n.userData.key = old.userData.key; n.userData.xkey = xk; n.position.copy(old.position);
          B.board.remove(old); old.traverse((o) => o.geometry?.dispose());
          B.board.add(n); B.tiles.set(space, n);
          if (/^pv/.test(xk)) { this.animateIn(n, { only: (m) => !m.userData.dam }); this.valleyWater(true); }   // (a valley: its dams stand through it; a river newly dug runs in)
          else this.animateIn(n);
        }
      }
    }
    if (this.edgeQ?.size) {                                          // seams to redo: one tile per frame
      const [space] = this.edgeQ; this.edgeQ.delete(space);
      const t = this.b.tiles.get(space);
      if (t?.userData.edge) this.edgeBlend(t.userData.edge.ctx);
    }
    if (this.animData?.length) {               // placement data is only kept for a moment after a build
      const now = performance.now();
      this.animData = this.animData.filter((a) => { if (now - a.t < 4000 || a.geo.userData.animating) return true; delete a.geo.userData.anim; return false; });
    }
    this.birdTick(t, dt);
    if (this.viewH) this.viewH.value = this.b.renderer.domElement.height;
    compact(this.anim, (a) => a.o.parent && a.o.parent.parent);
    for (const a of this.anim) a.f(t, dt);
    const M = this.mats;
    // emblems: larger from afar (the home view), smaller close up
    if (this.emblems?.length) {
      const d = this.b.camera.position.length(), vp = Math.min(innerWidth, innerHeight * 1.6), f = (0.5 + 0.7 * smooth(11.5, 33, d)) * (1 + 0.35 * smooth(900, 480, vp));   // a touch larger on phones
      compact(this.emblems, (s) => s.parent && s.parent.parent);
      for (const s of this.emblems) s.scale.copy(s.userData.s0).multiplyScalar(f);
    }
    if (M.blink) M.blink.color.setScalar((t * 1.1) % 1 < 0.5 ? 1 : 0.12).multiply(_c.set(0xff2a1a));
    if (M.blinkA) M.blinkA.color.setScalar((t * 0.8 + 0.5) % 1 < 0.45 ? 1 : 0.15).multiply(_c.set(0xffb020));
    if (M.glowG) M.glowG.color.setRGB(0.3, 1, 0.2).multiplyScalar(0.7 + 0.3 * Math.sin(t * 2.2));
    if (M.lavaG) M.lavaG.emissiveIntensity = 1.5 + 0.25 * Math.sin(t * 1.3);
    if (this.tex.falls) this.tex.falls.offset.y = t * 0.9;
  }

  // ---------------------------------------------------------------- materials
  mat(key) {
    if (this.mats[key]) return this.mats[key];
    let m;
    switch (key) {
      case 'std': m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.08 }); break;
      case 'std2': m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.2, side: THREE.DoubleSide }); break;
      case 'metal': m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.65 }); break;
      case 'matte': m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }); break;
      case 'glow': m = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }); break;
      case 'blink': m = new THREE.MeshBasicMaterial({ color: 0xff2a1a, toneMapped: false }); break;
      case 'blinkA': m = new THREE.MeshBasicMaterial({ color: 0xffb020, toneMapped: false }); break;
      case 'beam': m = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }); break;
      case 'frost': m = new THREE.MeshStandardMaterial({ color: 0xf4f8ff, map: this.frostTex(), transparent: true, opacity: 0.5 * this.frost, depthWrite: false, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -1 }); m.visible = this.frost > 0.02; break;
      case 'ground': m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }); break;
      case 'glass': m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.12, metalness: 0.85, envMapIntensity: 1 }); break;
      case 'glowG': m = new THREE.MeshBasicMaterial({ color: 0x4dff3a, toneMapped: false }); break;
      case 'trefoil': m = new THREE.MeshStandardMaterial({ map: this.signTex('trefoil'), roughness: 0.6, side: THREE.DoubleSide }); break;
      case 'holo': m = new THREE.MeshBasicMaterial({ map: this.holoTex(), side: THREE.DoubleSide, toneMapped: false, transparent: true, opacity: 0.92 }); break;
      case 'water': m = new THREE.MeshStandardMaterial({ color: 0x2c74a6, roughness: 0.12, metalness: 0.1, emissive: 0x114466, emissiveIntensity: 0.55 }); break;
      case 'gdome': m = new THREE.MeshStandardMaterial({ color: 0xf2fff6, roughness: 0.06, metalness: 0.2, transparent: true, opacity: 0.2, depthWrite: false, emissive: 0x5ac080, emissiveIntensity: 0.18 }); break;
      case 'growdome': m = new THREE.MeshStandardMaterial({ color: 0xe8fff0, roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.38, depthWrite: false, emissive: 0x2a5a2a, emissiveIntensity: 0.35 }); break;
      case 'shallow': m = new THREE.MeshStandardMaterial({ color: 0x2f8088, roughness: 0.12, metalness: 0.15, transparent: true, opacity: 0.62, depthWrite: false, emissive: 0x0c3a40, emissiveIntensity: 0.4, polygonOffset: true, polygonOffsetFactor: -2 }); break;
      case 'ice': m = new THREE.MeshStandardMaterial({ color: 0xd8ecf8, roughness: 0.25, metalness: 0.05, emissive: 0x6a8aa8, emissiveIntensity: 0.25 }); break;
      case 'falls': m = new THREE.MeshBasicMaterial({ map: this.fallsTex(), transparent: true, depthWrite: false, side: THREE.DoubleSide, color: 0xe8f6ff }); break;
      case 'icefall': m = new THREE.MeshStandardMaterial({ map: this.fallsTex(), color: 0xe0f0ff, roughness: 0.3, transparent: true, side: THREE.DoubleSide }); break;
      case 'fence': m = new THREE.MeshStandardMaterial({ map: this.fenceTex(), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.5, color: 0xb8bcc0 }); break;
      default: throw new Error('mat ' + key);
    }
    this.own(m, key === 'metal' || key === 'glass' ? 1 : key === 'gdome' ? 1.6 : key === 'water' ? 0.3 : 0.55);
    return this.mats[key] = m;
  }
  // a material of ours: shared (never disposed with a tile), and lit by the
  // environment probe as well, so metal and glass read (the scene has none)
  own(m, envI = 0.55) {
    m.userData.shared = true;
    if (m.isMeshStandardMaterial) { m.envMap = this.envTex(); m.envMapIntensity = envI; }
    return m;
  }
  // a tiny sky/ground probe: butterscotch Mars sky, dark red ground, a sun
  envTex() {
    if (this.tex.env) return this.tex.env;
    const c = document.createElement('canvas'); c.width = 128; c.height = 64;
    const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 64);
    gr.addColorStop(0, '#8fa6c8'); gr.addColorStop(0.42, '#d8b898'); gr.addColorStop(0.5, '#a07860'); gr.addColorStop(0.58, '#5a3a2c'); gr.addColorStop(1, '#2a1a14');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 64);
    const sg = g.createRadialGradient(40, 16, 0, 40, 16, 14); sg.addColorStop(0, 'rgba(255,248,230,1)'); sg.addColorStop(1, 'rgba(255,240,210,0)');
    g.fillStyle = sg; g.fillRect(0, 0, 128, 64);
    const t = new THREE.CanvasTexture(c); t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = THREE.SRGBColorSpace;
    const pm = new THREE.PMREMGenerator(this.b.renderer);
    this.tex.env = pm.fromEquirectangular(t).texture;
    pm.dispose(); t.dispose();
    return this.tex.env;
  }
  canvas(key, w, h, draw) {
    if (this.tex[key]) return this.tex[key];
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return this.tex[key] = t;
  }
  frostTex() {
    return this.canvas('frost', 256, 296, (g, w, h) => {
      const id = g.createImageData(w, h), d = id.data;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const n = fbm2(x / 22, y / 22, 5), s = fbm2(x / 5 + 40, y / 5, 2);
        const a = clamp01((n - 0.42) * 3.2) * 0.85 + clamp01((s - 0.6) * 4) * 0.3;
        const i = (y * w + x) * 4; d[i] = 240; d[i + 1] = 246; d[i + 2] = 255; d[i + 3] = Math.min(255, a * 255);
      }
      g.putImageData(id, 0, 0);
    });
  }
  fenceTex() {
    const t = this.canvas('fence', 64, 64, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.strokeStyle = 'rgba(210,214,220,1)'; g.lineWidth = 1.6;
      for (let i = -64; i < 128; i += 10) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 64, 64); g.stroke(); g.beginPath(); g.moveTo(i + 64, 0); g.lineTo(i, 64); g.stroke(); }
      g.lineWidth = 4; g.beginPath(); g.moveTo(0, 2); g.lineTo(w, 2); g.moveTo(0, h - 2); g.lineTo(w, h - 2); g.stroke();
    });
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }

  // ---------------------------------------------------------------- smoke / steam / mist
  // One Points object per tile for all its plumes; every puff rises, grows and
  // fades in the vertex shader from the shared clock, so no per-frame CPU work.
  puffMat() {
    if (this.mats.puff) return this.mats.puff;
    const tex = this.canvas('puff', 64, 64, (g, w, h) => {
      const id = g.createImageData(w, h), d = id.data;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const dx = (x - 31.5) / 32, dy = (y - 31.5) / 32, r = Math.hypot(dx, dy);
        const n = fbm2(x / 9, y / 9, 3);
        const a = Math.min(1, clamp01(1 - r) ** 1.1 * (0.7 + 0.7 * n) * 1.3);
        const i = (y * w + x) * 4; d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = Math.min(255, a * 255);
      }
      g.putImageData(id, 0, 0);
    });
    const m = new THREE.ShaderMaterial({
      uniforms: { uTime: this.time, uViewH: this.viewH ||= { value: 800 }, uTex: { value: tex }, uFade: this.puffFade ||= { value: 1 } },
      vertexShader: /* glsl */`
        attribute vec3 aUp; attribute vec4 aP; attribute vec3 aDrift; attribute vec4 aCol;
        uniform float uTime, uViewH, uFade;
        varying vec4 vCol; varying float vRot;
        void main(){
          float k = fract(uTime / aP.y + aP.x);
          vec3 p = position + aUp * (aP.z * (k * (1.4 - 0.4 * k))) + aDrift * k;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = aP.w * (0.35 + 1.0 * k) * projectionMatrix[1][1] * uViewH * 0.5 / -mv.z;
          vCol = vec4(aCol.rgb, aCol.a * uFade * smoothstep(0.0, 0.12, k) * (1.0 - k) * (1.0 - k * 0.3));
          vRot = aP.x * 6.2832 + k * 1.2;
        }`,
      fragmentShader: /* glsl */`
        uniform sampler2D uTex; varying vec4 vCol; varying float vRot;
        void main(){
          vec2 c = gl_PointCoord - 0.5; float cs = cos(vRot), sn = sin(vRot);
          c = mat2(cs, -sn, sn, cs) * c;
          float a = min(1.0, texture2D(uTex, c + 0.5).a * vCol.a * 2.2);
          if (a < 0.004) discard;
          gl_FragColor = vec4(vCol.rgb, a);
        }`,
      transparent: true, depthWrite: false,
    });
    m.userData.shared = true;
    return this.mats.puff = m;
  }
  // plumes: [{ x, z, y, n, life, rise, size, col: [r,g,b,a], drift: [dx, dz], jit }] in board units
  puffs(ctx, list) {
    const k = this.kOf(ctx.cell), pos = [], up = [], P = [], dr = [], col = [];
    const r = this.env.srand(ctx.space * 17 + list.length);
    for (const e of list) {
      const n = e.n ?? 6;
      for (let i = 0; i < n; i++) {
        const jx = (r() - 0.5) * (e.jit ?? 0.01), jz = (r() - 0.5) * (e.jit ?? 0.01);
        const p = ctx.cell.proj(e.x + jx, e.z + jz, ctx.H + (e.y ?? 0) * k).sub(ctx.cell.center);
        pos.push(p.x, p.y, p.z);
        const u = ctx.cell.proj(e.x, e.z, 1).sub(ctx.cell.proj(e.x, e.z, 0)).normalize();
        up.push(u.x, u.y, u.z);
        P.push((i + r() * 0.5) / n, (e.life ?? 4) * (0.85 + r() * 0.3), (e.rise ?? 0.3) * k, (e.size ?? 0.08) * k * (0.8 + r() * 0.4));
        const d = e.drift ? ctx.cell.proj(e.x + e.drift[0], e.z + e.drift[1], ctx.H).sub(ctx.cell.proj(e.x, e.z, ctx.H)) : new V3();
        d.addScaledVector(ctx.cell.east, (r() - 0.5) * (e.spread ?? 0.04) * k).addScaledVector(ctx.cell.north, (r() - 0.5) * (e.spread ?? 0.04) * k);
        dr.push(d.x, d.y, d.z);
        const c = e.col ?? [0.8, 0.8, 0.8, 0.5];
        col.push(c[0], c[1], c[2], c[3]);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aUp', new THREE.Float32BufferAttribute(up, 3));
    g.setAttribute('aP', new THREE.Float32BufferAttribute(P, 4));
    g.setAttribute('aDrift', new THREE.Float32BufferAttribute(dr, 3));
    g.setAttribute('aCol', new THREE.Float32BufferAttribute(col, 4));
    g.boundingSphere = new THREE.Sphere(new V3(), ctx.W * 3);
    const pts = new THREE.Points(g, this.puffMat());
    pts.renderOrder = 8; pts.frustumCulled = false;
    ctx.g.add(pts);
    return pts;
  }

  // waterfall streaks (scrolled down in tick)
  fallsTex() {
    const t = this.canvas('falls', 32, 128, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      for (let i = 0; i < 90; i++) { const x = Math.random() * w, y = Math.random() * h, L = 10 + Math.random() * 40; const gr = g.createLinearGradient(0, y, 0, y + L); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, `rgba(255,255,255,${0.5 + Math.random() * 0.5})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(x, y, 1.5 + Math.random() * 2, L); g.fillRect(x, y - h, 1.5, L); }
      g.fillStyle = 'rgba(230,245,255,0.35)'; g.fillRect(0, 0, w, h);
    });
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }
  // a holo billboard: neon ad panel (drawn once)
  holoTex() {
    return this.canvas('holo', 128, 86, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#2a0a4a'); gr.addColorStop(1, '#0a2a4a');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#ff3cc8'; g.lineWidth = 4; g.strokeRect(2, 2, w - 4, h - 4);
      g.font = '700 44px Rajdhani, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.shadowColor = '#28e6ff'; g.shadowBlur = 8; g.fillStyle = '#9ff4ff'; g.fillText('M€', w * 0.36, h * 0.52);
      g.shadowColor = '#ffd23c'; g.fillStyle = '#ffe98a'; g.beginPath(); g.arc(w * 0.78, h * 0.5, 16, 0, TAU); g.fill();
      g.fillStyle = '#2a0a4a'; g.font = '700 20px Rajdhani, sans-serif'; g.fillText('+4', w * 0.78, h * 0.53);
    });
  }
  // a signpost plate texture: a hazard/warning sign drawn once
  signTex(kind) {
    return this.canvas('sign:' + kind, 64, 64, (g, w, h) => {
      if (kind === 'trefoil') {
        g.fillStyle = '#f2c61e'; g.fillRect(0, 0, w, h);
        g.strokeStyle = '#161616'; g.lineWidth = 4; g.strokeRect(2, 2, w - 4, h - 4);
        g.fillStyle = '#161616'; g.beginPath(); g.arc(32, 32, 5, 0, TAU); g.fill();
        for (let i = 0; i < 3; i++) { const a0 = -Math.PI / 2 + i * TAU / 3 - 0.5, a1 = a0 + 1.0; g.beginPath(); g.moveTo(32 + Math.cos(a0) * 8, 32 + Math.sin(a0) * 8); g.arc(32, 32, 24, a0, a1); g.arc(32, 32, 8, a1, a0, true); g.fill(); }
      }
    });
  }

  // ---------------------------------------------------------------- placing
  // world units per board unit on this cell
  kOf(cell) { return cell.W / this.HEX_R; }
  // board coordinates (x, z) of a tile-local world offset, for the tile's own frame
  boardOf(cell) {
    if (cell._bo) return cell._bo;
    const p0 = this.b.frameAt(cell, 0, 0, 0, true).p, ex = this.b.frameAt(cell, 0.1, 0, 0, true).p.sub(p0).divideScalar(0.1), ez = this.b.frameAt(cell, 0, 0.1, 0, true).p.sub(p0).divideScalar(0.1);
    const d0 = p0.clone().sub(cell.center), ex2 = ex.lengthSq(), ez2 = ez.lengthSq();
    return (cell._bo = (off) => { const o = _v.copy(off).sub(d0); return [o.dot(ex) / ex2, o.dot(ez) / ez2]; });
  }
  // drape a local geometry (board units, y up) onto the sphere, relative to the cell centre
  drape(geo, cell, lift) {
    const k = this.kOf(cell), P = geo.attributes.position, N = geo.attributes.normal;
    const q = this.b.frameAt(cell, 0, 0, lift, true).q;
    for (let i = 0; i < P.count; i++) {
      const p = cell.proj(P.getX(i), P.getZ(i), lift + P.getY(i) * k).sub(cell.center);
      P.setXYZ(i, p.x, p.y, p.z);
    }
    if (N) for (let i = 0; i < N.count; i++) { _n.fromBufferAttribute(N, i).applyQuaternion(q); N.setXYZ(i, _n.x, _n.y, _n.z); }
    const F = geo.attributes.aFoot;
    if (F) {                                   // the parts' draped feet, heights and staggers, for animateIn (CPU only)
      const n = F.count, foot = new Float32Array(n * 3), h = new Float32Array(n), st = geo.attributes.aStag.array.slice();
      let lx = NaN, ly = NaN, lz = NaN;
      for (let i = 0; i < n; i++) {
        const fx = F.getX(i), fy = F.getY(i), fz = F.getZ(i);
        if (fx !== lx || fy !== ly || fz !== lz) { _v.copy(cell.proj(fx, fz, lift + fy * k)).sub(cell.center); lx = fx; ly = fy; lz = fz; }
        foot[i * 3] = _v.x; foot[i * 3 + 1] = _v.y; foot[i * 3 + 2] = _v.z; h[i] = F.getW(i) * k;
      }
      geo.deleteAttribute('aFoot'); geo.deleteAttribute('aStag');
      geo.userData.anim = { foot, h, st };
      (this.animData ||= []).push({ geo, t: performance.now() });
    }
    geo.computeBoundingSphere();
    return geo;
  }
  // merged, draped meshes of a kit, added to the tile group
  emit(kit, ctx, o = {}) {
    const out = [];
    for (const [key, list] of kit.by) {
      if (!list.length) continue;
      const needUv = list.some((g) => g.attributes.uv);
      for (const g of list) if (needUv && !g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      const geo = mergeGeometries(list);
      if (!geo) { console.warn('tile_art: merge failed', key); continue; }
      this.drape(geo, ctx.cell, ctx.H);
      const mat = typeof key === 'string' ? this.mat(key) : key;
      const m = new THREE.Mesh(geo, mat);
      if (!mat.transparent && !(mat.isMeshBasicMaterial)) { m.castShadow = o.shadow !== false; m.receiveShadow = true; }
      if (mat.transparent) m.renderOrder = 2;
      ctx.g.add(m);
      out.push(m);
    }
    return out;
  }
  // a small separate object at board point (x, z), height y (board units), turning about local up
  place(obj, ctx, x, z, y = 0, ry = 0) {
    const { p, q } = this.b.frameAt(ctx.cell, x, z, ctx.H + y * this.kOf(ctx.cell), true);
    obj.position.copy(p).sub(ctx.cell.center);
    obj.quaternion.copy(q);
    obj.userData.q0 = q.clone();
    if (ry) obj.rotateY(ry);
    obj.scale.setScalar(this.kOf(ctx.cell));
    ctx.g.add(obj);
    return obj;
  }
  spin(obj, w, ph = 0) { this.anim.push({ o: obj, f: (t) => obj.quaternion.copy(obj.userData.q0).multiply(_q.setFromAxisAngle(Y, ph + t * w)) }); return obj; }
  // a strut (cylinder) between two board points a and b
  strut(K, mat, col, a, b, rad, seg = 6) {
    const d = new V3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), L = d.length();
    const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(Y, d.divideScalar(L)));
    K.add(mat, new THREE.CylinderGeometry(rad, rad, L, seg, 1, true).translate(0, L / 2, 0), col, a, [e.x, e.y, e.z]);
  }

  // a hex ground (board units) with height fn(x, z) and colour fn(x, z, h);
  // welded, smooth normals; uv = the hex image box (as capGeo) when uv is set
  ground(hf, cf, o = {}) {
    const V = this.pvGround;                          // building a Protected Valley's stage: its ground is carved and waterlogged (valley)
    if (V) { const h0 = hf, c0 = cf; hf = (x, z) => V.h(x, z, h0(x, z)); cf = (x, z, y) => V.c(x, z, y, c0(x, z, y)); }
    const R0 = this.HEX_R * (o.inset ?? 0.95), sub = o.sub ?? 14;
    const pos = [], uvs = [], idx = [];
    const add = (x, z) => { pos.push(x, hf(x, z), z); uvs.push(0.5 + x / (Math.sqrt(3) * R0), 0.5 - z / (2 * R0)); return pos.length / 3 - 1; };
    for (let k = 0; k < 6; k++) {
      const B = hexCorner(k, R0), C = hexCorner(k + 1, R0), grid = [];
      for (let i = 0; i <= sub; i++) { grid.push([]); for (let j = 0; j <= sub - i; j++) { const a = i / sub, b = j / sub; grid[i].push(add(B[0] * a + C[0] * b, B[1] * a + C[1] * b)); } }
      for (let i = 0; i < sub; i++) for (let j = 0; j < sub - i; j++) {
        idx.push(grid[i][j], grid[i][j + 1], grid[i + 1][j]);
        if (j < sub - i - 1) idx.push(grid[i + 1][j], grid[i][j + 1], grid[i + 1][j + 1]);
      }
    }
    let g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    if (o.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx);
    g = mergeVertices(g, 1e-6);
    g.computeVertexNormals();
    // outward (up) normals whatever the winding
    const N = g.attributes.normal; let up = 0; for (let i = 0; i < N.count; i++) up += N.getY(i);
    if (up < 0) { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } g.computeVertexNormals(); }
    const P = g.attributes.position, col = new Float32Array(P.count * 3);
    for (let i = 0; i < P.count; i++) { const c = cf(P.getX(i), P.getZ(i), P.getY(i)); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  }
  // frost overlay: the ground again, a hair above, in the shared frost material
  frostOver(ctx, geo) {
    const f = new THREE.Mesh(geo, this.mat('frost'));
    f.renderOrder = 1; f.receiveShadow = true;
    ctx.g.add(f);
  }

  // the official tile face (tan hex + icon) as a holo-sign over a projector
  // pylon at board (x, z): the at-a-glance indicator of what the tile is
  emblem(ctx, icon, x, z, y = 0.3, size = 0.36, pylon = true, img = null) {
    const t = this.b.lazyTex('emb:' + icon, 160, 184, (c, w, h, [base, im]) => {
      const hex = (ins) => { c.beginPath(); for (let k = 0; k < 6; k++) { const a = Math.PI / 2 + k * Math.PI / 3, x = w / 2 + Math.cos(a) * (h / 2 - ins), y = h / 2 - Math.sin(a) * (h / 2 - ins); k ? c.lineTo(x, y) : c.moveTo(x, y); } c.closePath(); };
      c.save(); hex(6); c.shadowColor = 'rgba(120,230,255,0.95)'; c.shadowBlur = 10; c.fillStyle = '#c89a6a'; c.fill(); c.restore();
      c.save(); hex(8); c.clip(); if (base) c.drawImage(base, -8, -8, w + 16, h + 16); c.restore();
      if (im) c.drawImage(im, w / 2 - 62, h / 2 - 62, 124, 124);
      if (!im && img) { c.save(); hex(8); c.clip(); c.drawImage(base, -2, -2, w + 4, h + 4); c.restore(); }
      hex(7); c.lineWidth = 4; c.strokeStyle = 'rgba(190,245,255,0.95)'; c.stroke();
    }, img ? [img] : ['assets/tiles/special.png', `assets/tiles/${icon}.png`]);
    const sm = (this.emblemMats ||= {})[icon] ||= Object.assign(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }), { userData: { shared: true } });
    const sp = new THREE.Sprite(sm);
    const k = this.kOf(ctx.cell);
    sp.scale.set(size * k * 160 / 184, size * k, 1);
    sp.position.copy(ctx.cell.proj(x, z, ctx.H + y * k)).sub(ctx.cell.center);
    sp.renderOrder = 6;
    sp.userData.s0 = sp.scale.clone();
    (this.emblems ||= []).push(sp);
    ctx.g.add(sp);
    if (pylon) {                                  // the holo projector: a small lit pad on the ground
      const kit = new Kit();
      kit.cyl('metal', 0x8a929c, x, 0, z, 0.024, 0.02, 0.008, 16);
      kit.add('glow', new THREE.TorusGeometry(0.018, 0.0035, 6, 20).rotateX(Math.PI / 2), 0x7fe8ff, [x, 0.009, z]);
      kit.add('beam', new THREE.CylinderGeometry(0.05, 0.016, y - 0.02, 16, 1, true).translate(0, (y - 0.02) / 2 + 0.01, 0), (X, Yy) => _c.setRGB(0.5, 0.9, 1).multiplyScalar(0.3 * (1 - Yy / y)), [x, 0, z]);
      this.emit(kit, ctx);
    }
    return sp;
  }

  // ---------------------------------------------------------------- gallery
  // ?gallery=<layout>&stage=early|mid|late (chrome.js gallery()): debug boards
  //   all      every tile type round the centre, the Capital with two oceans
  //   cities   every city archetype (card-placed and seeded)
  //   capital  Capitals with 0 / 1 / 3 adjacent oceans
  //   rivers   Ecological Zones and Natural Preserves with 0 / 1 / 2 adjacent oceans (&rv=, &rt=: below)
  //   <type>   one tile type (a TILE id) on a few spaces
  galleryTiles(layout, stage) {
    const B = this.b, T = this.env.TILE;
    const S = { early: [1, -30, 0, 0], mid: [6, -14, 6, 4], late: [11, 6, 13, 8] }[stage || 'mid'] || [6, -14, 6, 4];
    B.stageGen = S[0]; B.setGlobals(S[1], S[2], S[3]);
    const land = B.cells.filter((c) => c && !c.colony).sort((a, b) => Math.hypot(a.bx, a.by + 0.4) - Math.hypot(b.bx, b.by + 0.4));
    const used = new Set(), out = [];
    const put = (c, type, owner) => { used.add(c.i); out.push([c.i, type, owner]); };
    const free = () => land.find((c) => !used.has(c.i));
    const nb = (c) => this.neighbours(c).filter((n) => !used.has(n.i));
    B.tileSrc = {};
    if (layout === 'all') {
      const cap = land[0]; put(cap, T.CAPITAL, 0);
      nb(cap).slice(0, 2).forEach((n) => put(n, T.OCEAN, -1));
      [T.CITY, T.COMMERCIAL, T.LAVA, T.MOHOLE, T.PRESERVE, T.NUCLEAR, T.RESTRICTED, T.INDUSTRIAL, T.ECO, T.MINING_RIGHTS, T.MINING_AREA, T.GREENERY, T.GREENERY, T.CITY, T.OCEAN]
        .forEach((t, i) => put(free(), t, t === T.OCEAN ? -1 : (i + 1) % 2));
      B.cells.filter((c) => c?.colony).forEach((c, i) => out.push([c.i, T.CITY, i % 2]));     // Ganymede Colony / Phobos Space Haven
      return out;
    }
    if (layout === 'cities') {
      const names = ['Domed Crater', 'Cupola City', 'Research Outpost', 'Noctis City', 'Underground City', 'Immigrant City', 'Urbanized Area', 'Open City', 'Lava Tube Settlement', 'Corporate Stronghold', 'Early Settlement', '', '', '', '', ''];
      names.forEach((n, i) => { const c = free(); put(c, T.CITY, i % 2); if (n) B.tileSrc[c.i] = n; });
      return out;
    }
    if (layout === 'capital') {
      const picks = [land[0], land.find((c) => Math.hypot(c.bx - land[0].bx, c.by - land[0].by) > 3), land.find((c) => Math.hypot(c.bx - land[0].bx, c.by - land[0].by) > 3 && c.bx < land[0].bx - 2)].filter(Boolean);
      picks.forEach((c, k) => { put(c, T.CAPITAL, k % 2); });
      picks.forEach((c, k) => nb(c).slice(0, [0, 1, 3][k]).forEach((n) => put(n, T.OCEAN, -1)));
      return out;
    }
    if (layout === 'valley') {
      // Protected Valleys with 1 (and a Mangrove and a forest next door) / 2 (a third of the way
      // round) / 3 ocean neighbours; &pv=3: two opposite oceans instead of the three
      const far = (c) => out.every(([s]) => Math.hypot(B.cells[s].bx - c.bx, B.cells[s].by - c.by) > 2.6);
      [[0], [0, 2], new URLSearchParams(location.search).get('pv') === '3' ? [0, 3] : [0, 1, 3]].forEach((pick, k) => {
        const c = land.find((c) => !used.has(c.i) && this.neighbours(c).length === 6 && far(c));
        if (!c) return;
        put(c, T.GREENERY, k % 2); B.tileSrc[c.i] = 'Protected Valley';
        const ns = this.neighbours(c).slice().sort((a, b) => Math.atan2(a.by - c.by, a.bx - c.bx) - Math.atan2(b.by - c.by, b.bx - c.bx));
        pick.forEach((j) => put(ns[j], T.OCEAN, -1));
        if (k === 0) { put(ns[2], T.GREENERY, 1); B.tileSrc[ns[2].i] = 'Mangrove'; put(ns[4], T.GREENERY, 0); }
      });
      return out;
    }
    if (layout === 'rivers') {
      // Ecological Zones and Natural Preserves with 0 / 1 / 2 ocean neighbours: their rivers end in a lake, or run
      // out into the sea. &rv=<sides>/<sides>/...: each tile's ocean sides, '.'-separated (side i: the neighbour at
      // i * 60deg -- 0 right, 1 front-right, 2 front-left, 3 left, 4 back-left, 5 back-right; '-' none); &rt=eco|pres: one kind only
      const q = new URLSearchParams(location.search), S = Math.PI / 3, rt = q.get('rt');
      const sets = (q.get('rv') || '-/2/0.4').split('/').map((s) => s.split('.').filter((v) => /^\d$/.test(v)).map(Number));
      const far = (c, d) => out.every(([s]) => Math.hypot(B.cells[s].bx - c.bx, B.cells[s].by - c.by) > d);
      const spot = (d) => land.find((c) => !used.has(c.i) && this.neighbours(c).length === 6 && far(c, d));
      for (const t of rt === 'eco' ? [T.ECO] : rt === 'pres' ? [T.PRESERVE] : [T.ECO, T.PRESERVE]) sets.forEach((pick, k) => {
        const c = spot(2.6) || spot(1.9);
        if (!c) return;
        put(c, t, k % 2);
        for (const n of this.neighbours(c)) if (!used.has(n.i) && pick.includes(((Math.round(Math.atan2(n.by - c.by, n.bx - c.bx) / S) % 6) + 6) % 6)) put(n, T.OCEAN, -1);
      });
      return out;
    }
    const type = +layout;
    if (Number.isFinite(type)) { for (let i = 0; i < 6; i++) put(free(), type, i % 2); return out; }
    return null;
  }

  // ---------------------------------------------------------------- entry
  // ctx: { cell, g, add, pc, H, W, space, type, owner, wall, top, meshAt, inst, decal, cube, city, forest, special }
  // returns true when this module built the tile (else board3d's default runs)
  build(ctx) {
    const T = this.env.TILE, cell = ctx.cell;
    if (cell.colony) return false;
    cell.W = ctx.W;
    ctx.g.userData.xkey = this.xkey(ctx.space, ctx.type);     // what this build saw (refresh() rebuilds when it changes)
    if (ctx.type === T.GREENERY) {
      const src = this.b.tileSrc?.[ctx.space] || '';
      if (/protected valley/i.test(src)) {                                          // the stage's forest, waterlogged, dammed against its oceans
        this.valley(ctx); ctx.cube(); this.edgeBlend(ctx);
        ctx.g.userData.born = performance.now();
        return true;
      }
      if (/mangrove/i.test(src)) {                                                  // board3d's forest, then the card's own touch on it
        ctx.forest(ctx.space * 7 + 1, 34, 0.9); this.brighten(ctx);
        this.mangrove(ctx);
        this.greeneryOver(ctx); ctx.cube(); this.edgeBlend(ctx);
        return true;
      }
      const stg = this.fstage;
      // early: no ground plate -- the outpost stands on the planet itself (a hair above it, as the
      // empty hexes' caps do), so Mars shows between its footprints; board3d's marker cube and
      // owner rim follow userData.lift, and the seams skip it (edgeBlend: userData.bare)
      const bare = stg === 0, was = this.b.tiles.get(ctx.space);
      if (bare) { ctx.bare = true; ctx.H = 0.005; ctx.g.userData.bare = true; ctx.g.userData.lift = ctx.H; }
      if (was && !!was.userData.bare !== bare) for (const n of this.neighbours(cell)) if (this.b.tiles.get(n.i)?.userData.edge) (this.edgeQ ||= new Set()).add(n.i);   // (regrown out of / into bare: the neighbours' seams toward it change)
      if (stg === 2) { ctx.forest(ctx.space * 7 + 1, 34, 0.9); this.brighten(ctx); this.flowers(ctx); }
      else if (stg === 1) this.shrubland(ctx);
      else this.pioneer(ctx);
      if (stg > 0) this.greeneryOver(ctx); else queueMicrotask(() => this.applyStage());
      ctx.cube(); this.edgeBlend(ctx);
      ctx.g.userData.born = performance.now();
      return true;
    }
    if (ctx.type === T.OCEAN) { this.oceanOver(ctx); return false; }           // the water shell + our floes / boats
    if (this.endLook(ctx.type)) return this.withEnd(() => this.build(ctx));
    switch (ctx.type) {
      case T.RESTRICTED: this.restricted(ctx); break;
      case T.NUCLEAR: this.nuclear(ctx); break;
      case T.MOHOLE: this.mohole(ctx); break;
      case T.LAVA: this.lava(ctx); break;
      case T.INDUSTRIAL: this.industrial(ctx); break;
      case T.MINING_AREA: this.miningArea(ctx); break;
      case T.MINING_RIGHTS: this.miningRights(ctx); break;
      case T.COMMERCIAL: this.commercial(ctx); break;
      case T.ECO: this.eco(ctx); break;
      case T.CITY: this.city(ctx); break;
      case T.CAPITAL: this.capital(ctx); break;
      case T.PRESERVE: this.preserve(ctx); break;
      default: return false;
    }
    ctx.cube(); this.edgeBlend(ctx);
    return true;
  }

  // a ground mesh for a tile: height fn, colour fn -> draped mesh in `mat`
  // (default: the vertex-coloured ground), plus the stage's frost overlay
  groundMesh(ctx, hf, cf, o = {}) {
    const geo = this.drape(this.ground(hf, cf, o), ctx.cell, ctx.H);
    const m = new THREE.Mesh(geo, o.mat || this.mat('ground'));
    m.receiveShadow = true;
    ctx.g.add(m);
    if (o.frost !== false) this.frostOver(ctx, geo);
    return geo;
  }
  // the same for a ready ground geometry (board units): draped, plus frost unless o.frost === false
  groundMeshGeo(ctx, geo, o = {}) {
    this.drape(geo, ctx.cell, ctx.H);
    const m = new THREE.Mesh(geo, o.mat || this.mat('ground'));
    m.receiveShadow = true;
    ctx.g.add(m);
    if (o.frost !== false) this.frostOver(ctx, geo);
    return m;
  }
  // a ground geometry with the triangles wholly inside(x, z) dropped (a hole for a finer mesh)
  holed(geo, inside) {
    const P = geo.attributes.position, ix = geo.index.array, out = [];
    const inn = new Uint8Array(P.count); for (let i = 0; i < P.count; i++) inn[i] = inside(P.getX(i), P.getZ(i)) ? 1 : 0;
    for (let i = 0; i < ix.length; i += 3) if (!(inn[ix[i]] && inn[ix[i + 1]] && inn[ix[i + 2]])) out.push(ix[i], ix[i + 1], ix[i + 2]);
    geo.setIndex(out);
    return geo;
  }
  // a round ground patch at (cx, cz) as a polar grid: rings at the given radii (radii[0] = 0), seg
  // around; height hf(x, z), colour cf(x, z, h); welded, smooth, up-facing normals
  polarGround(cx, cz, radii, seg, hf, cf) {
    const pos = [], idx = [];
    pos.push(cx, hf(cx, cz), cz);
    for (let i = 1; i < radii.length; i++) for (let j = 0; j < seg; j++) { const a = j / seg * TAU, x = cx + Math.cos(a) * radii[i], z = cz + Math.sin(a) * radii[i]; pos.push(x, hf(x, z), z); }
    const V = (i, j) => (i === 0 ? 0 : 1 + (i - 1) * seg + (j % seg));
    for (let j = 0; j < seg; j++) idx.push(0, V(1, j + 1), V(1, j));
    for (let i = 1; i < radii.length - 1; i++) for (let j = 0; j < seg; j++) idx.push(V(i, j), V(i, j + 1), V(i + 1, j), V(i + 1, j), V(i, j + 1), V(i + 1, j + 1));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    const N = g.attributes.normal; let up = 0; for (let i = 0; i < N.count; i++) up += N.getY(i);
    if (up < 0) { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } g.computeVertexNormals(); }
    const P = g.attributes.position, col = new Float32Array(P.count * 3);
    for (let i = 0; i < P.count; i++) { const c = cf(P.getX(i), P.getZ(i), P.getY(i)); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  }
  // distance from (x, z) to the tile's edge (board units; 0 on the rim)
  edgeDist(x, z, inset = 0.95) {
    const a = this.HEX_R * Math.sqrt(3) / 2 * inset, s3 = Math.sqrt(3) / 2;
    return a - Math.max(Math.abs(x), Math.abs(x * 0.5 + z * s3), Math.abs(x * 0.5 - z * s3));
  }
}
mixin(TileArt, RestrictedArt, NuclearArt, MoholeArt, LavaArt, IndustrialArt, MiningArt, CommercialArt, NatureKit, EcoZoneArt, PreserveArt, CityParts, CityStyles, CapitalArt, SettlementArt, ValleyArt, WaterArt, TileAnimJobs);
