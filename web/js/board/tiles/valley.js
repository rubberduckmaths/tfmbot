// valley.js -- TileArt mixin: the Protected Valley, a forest carved into a waterlogged valley with marshes and
// channels, dammed against its neighbouring oceans (the dams rise and the water runs in as oceans arrive).
import * as THREE from 'three';
import { gfx } from '../quality.js';
import { BALL, Kit, TAU, V3, _c, _c2, clamp01, fbm2, hash2, smooth, vnoise } from './kit.js';

export class ValleyArt {
  // the forest's instances (trees, bushes, tufts, rocks) whose base is where drop(x, z) says: removed (scaled to nothing)
  clearTrees(ctx, drop) {
    const bo = this.boardOf(ctx.cell), M = new THREE.Matrix4(), P = new V3();
    for (const m of ctx.g.children) {
      if (!m.isInstancedMesh) continue;
      for (let i = 0; i < m.count; i++) { m.getMatrixAt(i, M); P.setFromMatrixPosition(M); const [x, z] = bo(P); if (drop(x, z)) { M.makeScale(1e-5, 1e-5, 1e-5).setPosition(P); m.setMatrixAt(i, M); } }
      m.instanceMatrix.needsUpdate = true;
    }
  }
  // Protected Valley: a greenery on an ocean spot, kept dry -- the stage's own forest
  // (pioneer domes, shrubland, the lush forest) on dark, waterlogged ground with seepage
  // pools and reeds, and on each side that faces an ocean a low, weathered sea dam standing
  // on the rim. The ocean's own water runs right up to the dam's face (the board's basin
  // grows an inlet there: valleyWater), and rivers let in through sluices in the dams skirt
  // the valley from one ocean side to the next -- the same water surface as the oceans, in
  // beds carved into the ground (while the valley is still domed they are piped round its rim);
  // with no river to run, a creek comes in through a sluice and ends in a pool. Rebuilt when an ocean arrives next door (the dam rises, the water runs
  // in) or the stage moves on (regrown like any forest).
  valley(ctx) {
    const P = this.valleyPlan(ctx), g = ctx.g, stg = P.stage, wall0 = ctx.wall;
    g.userData.pvChains = P.chains.length ? P.chains : null;
    ctx.wall = (col) => this.valleyWall(ctx, P, col);                   // the stage's walls: none on the dams' sides
    ctx.pvWater = P.chains.some((c) => c.carve);                        // (shrubland: no pond or old dome frame in the way of its channels)
    this.pvGround = P;                                                  // (ground(): the stage's ground, carved and wet)
    try {
      if (stg === 2) {
        const before = new Set(g.children);
        ctx.forest(ctx.space * 7 + 1, 34, 0.9);
        // board3d's flat cap and wall go: our carved floor (in its forest texture) and walls instead
        for (const m of g.children.filter((o) => !before.has(o) && o.isMesh && !o.isInstancedMesh && !o.material.transparent)) { g.remove(m); m.geometry.dispose(); m.material.dispose(); }
        this.valleyWall(ctx, P, 0x203a18);
        const floor = this.mats.pvFloor ||= this.own(new THREE.MeshStandardMaterial({ map: this.b.forestTex, vertexColors: true, roughness: 1, color: new THREE.Color(1.7, 1.8, 1.4) }));
        this.groundMesh(ctx, () => 0, () => _c.setRGB(1, 1, 1), { sub: gfx.low ? 20 : 30, uv: true, mat: floor, frost: false });
        this.brighten(ctx); this.flowers(ctx, P.wet);
      } else if (stg === 1) this.shrubland(ctx);
      else this.pioneer(ctx);
    } finally { ctx.wall = wall0; this.pvGround = null; delete ctx.pvWater; }
    this.clearTrees(ctx, P.wet);
    this.valleyDams(ctx, P);
    this.valleyMarsh(ctx, P);
    if (stg > 0) this.greeneryOver(ctx); else queueMicrotask(() => this.applyStage());
  }
  // the valley's layout (tile-local board units; side i faces the neighbour at angle i * 60deg):
  // which sides face an ocean; the water chains, points [x, z, radius, in the valley] of tapered
  // capsules (the inlets, not carved; the rivers and the creek, carved); their sluices [side, t,
  // radius]; the rivers still piped [side, t, side, t] (early on); the seepage pools [x, z, r, seed]. sdf: the carved chains' distance (the board's basinAt, in JS);
  // h / c: the stage ground's carve and wet colour; wet(x, z): no tree stands there
  valleyPlan(ctx) {
    const cell = ctx.cell, S = Math.PI / 3, MK = this.env.MARK, r = this.env.srand(ctx.space * 53 + 11), stage = this.fstage;
    const yw = (-0.032 - ctx.H) / this.kOf(cell);                         // the oceans' water level (board3d WATER_LEVEL), tile-local
    const ocean = new Array(6).fill(false);
    for (const c of this.neighbours(cell)) { const i = ((Math.round(Math.atan2(c.by - cell.by, c.bx - cell.bx) / S) % 6) + 6) % 6; ocean[i] = !!this.b.tiles.get(c.i)?.userData.key?.startsWith('0:'); }
    const oc = [0, 1, 2, 3, 4, 5].filter((i) => ocean[i]);
    const at = (i, s, t) => { const c = Math.cos(i * S), sn = Math.sin(i * S); return [c * s - sn * t, sn * s + c * t]; };   // s out through side i, t along it (counter-clockwise)
    const out = (i, x, z) => x * Math.cos(i * S) + z * Math.sin(i * S);
    const CLR = this.env.MARK_CLEAR + 0.075, mk = (p) => Math.hypot(p[0] - MK.x, p[1] - MK.y);
    const away = (p) => {                                                   // a channel keeps off the owner's marker (it swings inside it)
      for (let q = 0; q < 4 && mk(p) < CLR; q++) {
        const f = CLR / Math.max(mk(p), 1e-3); p[0] = MK.x + (p[0] - MK.x) * f; p[1] = MK.y + (p[1] - MK.y) * f;
        const L = Math.hypot(p[0], p[1]); if (L > 0.37) { p[0] *= 0.37 / L; p[1] *= 0.37 / L; }
      }
      return p;
    };
    // a sluice through side i's dam at t0 -- or moved toward t1 till its channel clears the marker
    const gate = (i, t0, t1) => { for (let q = 0; q <= 8; q++) { const t = t0 + (t1 - t0) * q / 8; if (mk(at(i, 0.42, t)) > CLR && mk(at(i, 0.47, t)) > CLR) return t; } return t1; };
    const spaced = (ctrl, step) => {
      let L = 0; for (let j = 1; j < ctrl.length; j++) L += Math.hypot(ctrl[j][0] - ctrl[j - 1][0], ctrl[j][1] - ctrl[j - 1][1]);
      return new THREE.CatmullRomCurve3(ctrl.map(([x, z]) => new V3(x, 0, z)), false, 'centripetal').getSpacedPoints(Math.max(2, Math.round(L / step))).map((v) => [v.x, v.z]);
    };
    const chains = [], sluices = [], pipes = [], inside = (p) => this.edgeDist(p[0], p[1]) > 0.02;       // (a point in the valley: its bed is carved into the tile)
    // the inlets: the ocean's water on up to the dam's face (the board's water; nothing carved) -- a
    // cone that carries the ocean's own shorelines on its flanking sides straight up to the dam (their
    // waterline: t = 0.577 s - 0.119 in this side's frame; the rim 0.058 out), so it never bulges past
    // them into the hexes either side; the dam's ends past it stand on the beach. A corner shared with
    // a second ocean side is open water: the inlet runs along the dam into it
    const cone = (s) => 0.5774 * s - 0.119 + 0.058 - 0.006;
    for (const i of oc) {
      chains.push({ key: 'i' + i, pts: [[...at(i, 0.45, 0), cone(0.45)], [...at(i, 0.72, 0), cone(0.72)]] });
      for (const e of [-1, 1]) if (ocean[(i + e + 6) % 6]) chains.push({ key: 'i' + i + (e > 0 ? 'u' : 'd'), pts: [[...at(i, 0.55, 0), 0.125], [...at(i, 0.55, e * 0.3), 0.125]] });
    }
    const RR = 0.086;                                                       // a river's capsule (its water: RR - 0.058 either side)
    const river = (a, b) => {                                               // from ocean side a, counter-clockwise past the land, to ocean side b
      const ta = gate(a, 0.12, -0.06), tb = gate(b, -0.12, 0.06);
      const a0 = a * S + Math.atan2(ta, 0.43), a1 = (b < a ? b + 6 : b) * S + Math.atan2(tb, 0.43), n = Math.max(2, Math.round((a1 - a0) / 0.3));
      const ctrl = [at(a, 0.43, ta)];
      for (let j = 1; j < n; j++) { const an = a0 + (a1 - a0) * j / n, rad = 0.355 + (r() - 0.5) * 0.04; ctrl.push(away([Math.cos(an) * rad, Math.sin(an) * rad])); }
      ctrl.push(at(b, 0.43, tb));
      if (!stage) { pipes.push([a, ta, b, tb]); return; }                   // (still domed: piped along the rim, see valleyDams)
      const pts = [at(a, 0.6, ta), at(a, 0.5, ta), ...spaced(ctrl, 0.085), at(b, 0.5, tb), at(b, 0.6, tb)];
      chains.push({ key: 'r' + a + b, carve: true, pts: pts.map((p, j) => [p[0], p[1], RR * (0.93 + 0.14 * hash2(j, a + b)), inside(p)]) });
      sluices.push([a, ta, RR], [b, tb, RR]);
    };
    const creek = (a) => {                                                  // in through a sluice, winding in, ending in a pool
      const side = r() < 0.5 ? -1 : 1, ta = gate(a, side * 0.04, -side * 0.15), bend = side * (0.035 + r() * 0.045), ctrl = [at(a, 0.43, ta)];
      let t = ta;
      for (let j = 1; j <= 3; j++) { t += bend + (r() - 0.5) * 0.04; ctrl.push(away(at(a, 0.43 - j * 0.072, t))); }
      if (!stage) return;                                                   // (no creek while the valley is domed)
      const pts = [at(a, 0.6, ta), at(a, 0.5, ta), ...spaced(ctrl, 0.07)];
      chains.push({ key: 'c' + a, carve: true, pts: pts.map((p, j) => [p[0], p[1], j === pts.length - 1 ? 0.112 : 0.08 - 0.01 * j / pts.length, inside(p)]) });
      sluices.push([a, ta, 0.08]);
    };
    // rivers link each ocean side to the next round the valley, past one to three land sides --
    // all but the widest gap (the valley keeps a way out by land; on a tie, the gap past the marker)
    if (oc.length >= 2) {
      const gaps = oc.map((a, j) => { const b = oc[(j + 1) % oc.length]; return { a, b, g: (b - a + 5) % 6 }; });
      const pastMark = (q) => ((6 - q.a) % 6 <= q.g ? 1 : 0);                // it would pass the corner between sides 0 and 1, where the marker stands
      const drop = gaps.slice().sort((p, q) => q.g - p.g || pastMark(q) - pastMark(p))[0];
      for (const q of gaps) if (q !== drop && q.g >= 1 && q.g <= 3) river(q.a, q.b);
    }
    if (oc.length && !chains.some((c) => c.carve) && !pipes.length) creek(oc[0]);
    const carved = chains.filter((c) => c.carve);
    const sdf = (x, z) => {
      let e = 1e3;
      for (const { pts } of carved) for (let j = 1; j < pts.length; j++) {
        const [ax, az, ar] = pts[j - 1], [bx, bz, br] = pts[j], ux = bx - ax, uz = bz - az, t = clamp01(((x - ax) * ux + (z - az) * uz) / Math.max(ux * ux + uz * uz, 1e-8));
        e = Math.min(e, Math.hypot(x - ax - ux * t, z - az - uz * t) - (ar + (br - ar) * t));
      }
      return e;
    };
    // seepage pools: along the inner foot of each dam, and a few about the valley
    const pools = [];
    const tryPool = (x, z, pr) => { if (this.edgeDist(x, z) > pr + 0.035 && !this.env.inClearing(x, z, pr + 0.02) && sdf(x, z) > pr + 0.035 && oc.every((i) => out(i, x, z) < 0.44 - pr) && pools.every((q) => Math.hypot(q[0] - x, q[1] - z) > q[2] + pr + 0.03)) pools.push([x, z, pr, r() * 6]); };
    for (const i of oc) for (let j = 0; j < 3; j++) tryPool(...at(i, 0.39 + r() * 0.02, (r() - 0.5) * 0.36), 0.022 + r() * 0.016);
    for (let j = 0; j < 5; j++) { const a = r() * TAU, d = 0.1 + r() * 0.26; tryPool(Math.cos(a) * d, Math.sin(a) * d, 0.018 + r() * 0.02); }
    const pR = (p, a) => p[2] * (0.8 + 0.35 * vnoise(Math.cos(a) * 1.5 + p[3], Math.sin(a) * 1.5 + p[3]));
    const pd = (x, z) => { let d = 9; for (const p of pools) { const dx = x - p[0], dz = z - p[1]; if (Math.abs(dx) < 0.1 && Math.abs(dz) < 0.1) d = Math.min(d, Math.hypot(dx, dz) - pR(p, Math.atan2(dz, dx))); } return d; };   // < 0 in a pool
    // the ground: channel banks down to beds under the oceans' level; the pools' hollows (not while domed)
    const h = (x, z, y) => {
      y = Math.min(y, Math.max(yw - 0.012, yw + 1.25 * (sdf(x, z) + 0.058)));          // (the bed stays over the planet's dip under it)
      if (stage) y = Math.min(y, -0.009 * smooth(0.012, -0.006, pd(x, z)));
      return y;
    };
    // its colour: damp dark patches everywhere, seepage behind the dams, mud banks, silt beds;
    // frozen puddles while domed. (The late floor's colours multiply board3d's forest texture.)
    const mult = stage === 2;
    const col = (x, z, y, c) => {
      const e = sdf(x, z), n = fbm2(x * 23 + 7, z * 23 + 3, 3), p = pd(x, z);
      let wet = Math.max(0.8 * smooth(0.42, 0.62, fbm2(x * 6 + 13, z * 6 + 2, 3)), 0.7 * smooth(0.6, 0.7, fbm2(x * 17 + 5, z * 17 + 9, 2)));
      for (const i of oc) wet = Math.max(wet, 0.9 * smooth(0.33, 0.44, out(i, x, z)));
      wet = Math.max(wet, smooth(0.03, -0.01, e), stage ? smooth(0.025, 0.0, p) : 0);
      const bank = smooth(-0.004, -0.03, e) * (0.85 + 0.3 * n), bed = smooth(-0.05, -0.064, e);
      if (mult) {
        c.multiplyScalar(1 - 0.4 * wet);
        c.lerp(_c2.setRGB(1.2, 0.68, 0.52), bank * 0.85).lerp(_c2.setRGB(0.3, 0.26, 0.26), bed);
        if (stage && p < 0.004) c.lerp(_c2.setRGB(0.5, 0.42, 0.36), smooth(0.004, -0.006, p));                  // the pools' muddy beds
      } else {
        c.lerp(_c2.setRGB(c.r * 0.36 + 0.03, c.g * 0.42 + 0.05, c.b * 0.44 + 0.03), wet * 0.9);
        c.lerp(_c2.setRGB(0.3, 0.24, 0.17), bank).lerp(_c2.setRGB(0.12, 0.12, 0.11), bed);
        if (stage && p < 0.004) c.lerp(_c2.setRGB(0.2, 0.17, 0.12), smooth(0.004, -0.006, p));
        if (!stage && p < 0.006 && oc.some((i) => out(i, x, z) > 0.34)) c.lerp(_c2.setRGB(0.25, 0.22, 0.2), smooth(0.006, 0, p)).lerp(_c2.setRGB(0.68, 0.77, 0.86), smooth(-0.002, -0.01, p));   // frozen puddles in the seepage
      }
      return c;
    };
    const wet = (x, z) => sdf(x, z) < 0.035 || pd(x, z) < 0.02 || oc.some((i) => out(i, x, z) > 0.42);
    return { stage, yw, ocean, oc, at, out, chains, sluices, pipes, pools, pR, sdf, h, c: col, wet };
  }
  // the valley's side walls: as any tile's on its land sides (a little deeper: the basins dip
  // beside it); an ocean side has its dam instead
  valleyWall(ctx, P, color) {
    const K = new Kit(), S = Math.PI / 3, R0 = this.HEX_R * 0.95, yb = -(ctx.H + 0.08) / this.kOf(ctx.cell);
    const top = new THREE.Color(color), bot = top.clone().multiplyScalar(0.7);
    for (let i = 0; i < 6; i++) {
      if (P.ocean[i]) continue;
      const a0 = i * S - S / 2, a1 = i * S + S / 2, x0 = Math.cos(a0) * R0, z0 = Math.sin(a0) * R0, x1 = Math.cos(a1) * R0, z1 = Math.sin(a1) * R0;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([x0, yb, z0, x1, yb, z1, x1, 0, z1, x0, 0, z0], 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute([...bot.toArray(), ...bot.toArray(), ...top.toArray(), ...top.toArray()], 3));
      g.setIndex([0, 1, 2, 0, 2, 3]); g.computeVertexNormals();
      if (g.attributes.normal.getX(0) * Math.cos(i * S) + g.attributes.normal.getZ(0) * Math.sin(i * S) < 0) { g.index.array.reverse(); g.computeVertexNormals(); }
      K.raw('matte', g);
    }
    if (K.by.size) this.emit(K, ctx);
  }
  // the dams: a low, weathered concrete wall along each ocean side's rim, battered down into
  // the water (weed below the waterline, a tide mark, run streaks, a paler worn crest, grime low
  // down; moss on the crest once it is green), only a kerb seen from the valley; one welded surface
  // over a profile with rounded shoulders and a rounded parapet (no hard edges). Where it ends beside
  // land it sinks and narrows into an earth bank that buries its end; a sluice where a channel passes
  // (piers, a raised gate, a walkway over it)
  valleyDams(ctx, P) {
    if (!P.oc.length) return;
    const K = new Kit(), yw = P.yw, yB = yw - 0.06, yc = 0.01, stg = P.stage, T3 = Math.tan(Math.PI / 6), S = Math.PI / 3, low = gfx.low;
    const prof = [[0.455, -0.016], [0.4575, yc - 0.0045], [0.4592, yc - 0.0012], [0.4615, yc], [0.4735, yc], [0.4755, yc + 0.0032], [0.4775, yc + 0.0056], [0.4798, yc + 0.006],
      [0.4818, yc + 0.0045], [0.4832, yc + 0.001], [0.4842, yc - 0.006], [0.4858, yw + 0.03], [0.4885, yw + 0.006], [0.4935, yw - 0.02], [0.5, yB]];
    const rows = [];                                                         // (the profile, subdivided: colour detail down the face)
    for (let j = 0; j + 1 < prof.length; j++) { const [s0, y0] = prof[j], [s1, y1] = prof[j + 1], R = Math.max(1, Math.ceil(Math.max(Math.abs(y1 - y0) / 0.006, Math.abs(s1 - s0) / 0.004))); for (let v = j ? 1 : 0; v <= R; v++) rows.push([s0 + (s1 - s0) * v / R, y0 + (y1 - y0) * v / R]); }
    const conc = (i, s, y, t, w = 0) => {
      const n = 0.86 + 0.16 * vnoise(t * 55 + i * 7.1, y * 70 + s * 30), st = vnoise(t * 130 + i * 3.3, 0.5), bl = 0.9 + 0.2 * fbm2(t * 14 + i * 3.7, y * 18 + 2, 2);
      const face = y < yc - 0.001, fl = ((y - yB) / 0.019) % 1, fj = ((t + 0.6) / 0.075) % 1;
      _c.setRGB(0.53, 0.51, 0.46).multiplyScalar(n * bl * (0.84 + 0.2 * smooth(yw - 0.02, yc, y)) * (1 - 0.26 * smooth(0.5, 0.85, st) * smooth(yc, yw, y)));   // mottled, darker low down, run streaks down the face
      if (face) _c.multiplyScalar((fl < 0.14 ? 0.9 : 1) * (Math.abs(fj - 0.5) > 0.44 ? 0.84 : 1));                        // pour lifts and expansion joints
      else _c.lerp(_c2.setRGB(0.68, 0.66, 0.61), smooth(yc + 0.002, yc + 0.0055, y) * 0.45);                            // the parapet's top, worn pale
      _c.lerp(_c2.setRGB(0.34, 0.33, 0.29), smooth(yw + 0.036, yw + 0.016, y) * 0.75);                                   // the tide mark
      _c.lerp(_c2.setRGB(0.2, 0.24, 0.19), smooth(yw + 0.012, yw - 0.004, y));                                            // weed below the waterline
      if (y > yc - 0.001 && stg > 0) _c.lerp(_c2.setRGB(0.36, 0.44, 0.26), smooth(0.4, 0.7, vnoise(t * 40 + i, s * 200)) * 0.6);   // moss on the crest
      if (w > 0) _c.lerp(_c2.setRGB(0.46, 0.34, 0.25), w * 0.55);                                                          // earth-stained where it runs into its bank
      return _c;
    };
    const geo = (pos, col, idx) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals(); return g; };
    const yG = -ctx.H / this.kOf(ctx.cell);                                    // the planet's surface round the tile (under its plate)
    for (const i of P.oc) {
      const gaps = P.sluices.filter(([k]) => k === i).map(([, t, rr]) => [t, rr - 0.058 + 0.012]).sort((a, b) => a[0] - b[0]);
      const pos = [], col = [], idx = [], NR = rows.length;
      // one span of the wall between tA and tB (null: to the corner -- mitred into the next dam, or sunk into a bank beside land)
      const span = (tA, tB) => {
        const land = [tA == null && !P.ocean[(i + 5) % 6], tB == null && !P.ocean[(i + 1) % 6]];
        const vert = (s0, y0, q, M) => {
          const lo = tA ?? -s0 * T3, hi = tB ?? s0 * T3, t = lo + (hi - lo) * q / M;
          const w = Math.max(land[0] ? 1 - smooth(0, 0.075, t - lo) : 0, land[1] ? 1 - smooth(0, 0.075, hi - t) : 0) ** 1.5;
          const y = y0 - w * 0.02 * smooth(yw, yc + 0.006, y0), s = s0 - w * 0.55 * Math.max(0, s0 - 0.47), [x, z] = P.at(i, s, t);
          pos.push(x, y, z); conc(i, s, y, t, w).toArray(col, col.length);
        };
        const M = Math.max(2, Math.ceil(((tB ?? 0.5 * T3) - (tA ?? -0.5 * T3)) / 0.006)), base = pos.length / 3;
        for (let q = 0; q <= M; q++) for (const [s0, y0] of rows) vert(s0, y0, q, M);
        for (let q = 0; q < M; q++) for (let v = 0; v + 1 < NR; v++) { const a = base + q * NR + v, c = a + NR; idx.push(a, c, a + 1, a + 1, c, c + 1); }
        // the ends: the profile closed off (at a sluice, or -- small and buried in its bank -- next to land)
        for (const [end, tt] of [[-1, tA], [1, tB]]) {
          if (tt == null && P.ocean[(i + end + 6) % 6]) continue;
          const b0 = pos.length / 3; let cx = 0, cy = 0, cs = 0;
          for (const [s0, y0] of rows) { vert(s0, y0, end > 0 ? M : 0, M); cx += pos[pos.length - 3]; cy += pos[pos.length - 2]; cs += pos[pos.length - 1]; }
          pos.push(cx / NR, cy / NR, cs / NR); conc(i, 0.48, cy / NR, tt ?? 0).toArray(col, col.length);
          for (let j = 0; j < NR; j++) idx.push(b0 + NR, ...(end > 0 ? [b0 + (j + 1) % NR, b0 + j] : [b0 + j, b0 + (j + 1) % NR]));   // (the profile turns clockwise in (s, y): -t)
        }
        // the banks: a mound of earth and rubble against each end beside land, down to the planet's
        // surface, its top flush with the valley floor (grassed once it is green), a few boulders at its foot
        for (const [end, isLand] of [[-1, land[0]], [1, land[1]]]) {
          if (!isLand) continue;
          const tE = end * 0.5 * T3, [mx, mz] = P.at(i, 0.5, tE * 0.9), R0 = 0.072, NA = low ? 14 : 24, NRr = low ? 4 : 6, mp = [mx, -0.004, mz], mc = [], mi = [];
          const r = this.env.srand(ctx.space * 17 + i * 5 + end + 3), ph = r() * 6;
          const mcol = (x, z, f) => { const nn = fbm2(x * 40 + ph, z * 40, 3); _c.setRGB(0.4 + nn * 0.12, 0.29 + nn * 0.08, 0.21 + nn * 0.05); if (stg > 0) _c.lerp(_c2.setRGB(0.36, 0.46, 0.24), (1 - f) * smooth(0.45, 0.6, nn + 0.1 * stg) * 0.8); if (nn > 0.58) _c.lerp(_c2.setRGB(0.4, 0.38, 0.36), 0.6); return _c; };
          mcol(mx, mz, 0).toArray(mc, 0);
          for (let ri = 1; ri <= NRr; ri++) for (let a = 0; a < NA; a++) {
            const an = a / NA * TAU, f = ri / NRr, rr = R0 * f * (0.8 + 0.35 * vnoise(Math.cos(an) * 1.7 + ph, Math.sin(an) * 1.7 + ph)), x = mx + Math.cos(an) * rr, z = mz + Math.sin(an) * rr;
            const y = -0.004 + (yG - 0.03 + 0.004) * (1 - Math.cos(f * Math.PI / 2) ** 1.4) + 0.004 * (vnoise(x * 90, z * 90) - 0.5) * f;
            mp.push(x, y, z); mcol(x, z, f).toArray(mc, mc.length);
          }
          for (let a = 0; a < NA; a++) mi.push(0, 1 + (a + 1) % NA, 1 + a);
          for (let ri = 1; ri < NRr; ri++) for (let a = 0; a < NA; a++) { const p0 = 1 + (ri - 1) * NA + a, p1 = 1 + (ri - 1) * NA + (a + 1) % NA; mi.push(p0, p1 + NA, p0 + NA, p0, p1, p1 + NA); }
          const mg = geo(mp, mc, mi);
          if (mg.attributes.normal.getY(0) < 0) { mg.index.array.reverse(); mg.computeVertexNormals(); }
          K.raw('matte', mg);
          if (!low) for (let q = 0; q < 5; q++) { const an = r() * TAU, rr = R0 * (0.55 + r() * 0.4), bs = 0.007 + r() * 0.008; K.add('matte', BALL, (X, Yy) => _c.setRGB(0.4, 0.38, 0.35).multiplyScalar(0.65 + 0.45 * vnoise(X * 200, Yy * 200)), [mx + Math.cos(an) * rr, yG - 0.012 + (1 - rr / R0) * 0.09, mz + Math.sin(an) * rr], [r(), r(), r()], [bs * 1.3, bs * 0.8, bs]); }
        }
      };
      let tA = null;
      for (const [t, w] of gaps) { span(tA, t - w); tA = t + w; }
      span(tA, null);
      K.raw('std', geo(pos, col, idx));
      // the sluices: piers either side, a gate raised over the water, a walkway across
      for (const [t, w] of gaps) {
        for (const sg of [-1, 1]) { const [x, z] = P.at(i, 0.478, t + sg * (w + 0.006)); K.box('std', 0x86827a, x, yB, z, 0.05, yc + 0.016 - yB, 0.012, -i * S); }
        { const [x, z] = P.at(i, 0.471, t); K.box('std', 0x5e5a54, x, yc + 0.004, z, 0.024, 0.004, 2 * w + 0.024, -i * S); }
        { const [x, z] = P.at(i, 0.4865, t); K.box('metal', 0x3a4046, x, yc - 0.016, z, 0.004, 0.022, 2 * w, -i * S); }                  // (raised: the water runs under)
        { const [x, z] = P.at(i, 0.466, t + w * 0.5); K.cyl('metal', 0x8a3a24, x, yc + 0.008, z, 0.0022, 0.0022, 0.008, 6); }
      }
    }
    // still domed: the water between the oceans is piped -- an intake housing on each dam, a pipe
    // on low supports round the inside of the rim, past the land sides
    const T2 = 0.445 / Math.cos(S / 2);
    for (const [a, ta, b, tb] of P.pipes) {
      const pts = [P.at(a, 0.445, ta)];
      for (let c = a; c !== b; c = (c + 1) % 6) { const an = (c + 0.5) * S; pts.push([Math.cos(an) * T2, Math.sin(an) * T2]); }
      pts.push(P.at(b, 0.445, tb));
      for (const [i, t] of [[a, ta], [b, tb]]) {
        const [x, z] = P.at(i, 0.466, t); K.box('std', 0xb8b4ac, x, yc, z, 0.03, 0.016, 0.034, -i * S); K.box('std', 0x6e6a64, x, yc + 0.016, z, 0.034, 0.003, 0.038, -i * S);
        K.cyl('metal', 0x8a3a24, x, yc + 0.019, z, 0.004, 0.004, 0.004, 10);
      }
      for (let j = 1; j < pts.length; j++) {
        const [x0, z0] = pts[j - 1], [x1, z1] = pts[j], dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz), ang = -Math.atan2(dz, dx);
        K.add('metal', new THREE.CylinderGeometry(0.0055, 0.0055, L, 10).rotateZ(Math.PI / 2), 0x4a8ab8, [(x0 + x1) / 2, 0.011, (z0 + z1) / 2], [0, ang, 0], 1, { smooth: true });
        K.add('metal', BALL, 0x3a6a90, [x1, 0.011, z1], [0, 0, 0], 0.0075);
        for (let q = 1, n = Math.max(1, Math.round(L / 0.07)); q < n; q++) K.box('std', 0x8a8680, x0 + dx * q / n, 0, z0 + dz * q / n, 0.008, 0.007, 0.014, ang);
      }
    }
    for (const m of this.emit(K, ctx)) m.userData.dam = true;
  }
  // the wet ground's life: seepage pools ringed with reeds (lily pads once lush), reeds along the
  // channels' waterline, a footbridge over the river or creek (steel while the valley is domed)
  valleyMarsh(ctx, P) {
    const stg = P.stage, K = new Kit(), r = this.env.srand(ctx.space * 61 + 3), TK = this.env.treeKit(), low = gfx.low, k = this.kOf(ctx.cell), H0 = ctx.H;
    const reeds = [];
    const reed = (x, z) => {
      if (this.edgeDist(x, z) < 0.025 || this.env.inClearing(x, z, 0) || P.oc.some((i) => P.out(i, x, z) > 0.44)) return;
      const s = 0.8 + r() * 0.6;
      reeds.push({ x, y: z, lift: H0 + P.h(x, z, 0) * k, s, sx: s, sz: s, sy: 1.6 + r() * 1.0, rot: r() * 6.28, c: new THREE.Color().setHSL(0.15 + r() * 0.08, 0.42 + r() * 0.15, 0.3 + r() * 0.12) });
    };
    // still domed: the seepage behind the dams lies frozen
    if (!stg) for (const p of P.pools) {
      if (!P.oc.some((i) => P.out(i, p[0], p[1]) > 0.36)) continue;
      const N = 24, wp = [p[0], 0, p[1]], wi = [];
      for (let j = 0; j < N; j++) { const a = j / N * TAU, R = P.pR(p, a) * 1.1; wp.push(p[0] + Math.cos(a) * R, 0, p[1] + Math.sin(a) * R); }
      for (let j = 1; j <= N; j++) wi.push(0, (j % N) + 1, j);
      const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3)); wg.setIndex(wi); wg.computeVertexNormals();
      if (wg.attributes.normal.getY(0) < 0) { wg.index.array.reverse(); wg.computeVertexNormals(); }
      K.add('ice', wg, 0xffffff, [0, 0.0012, 0]);
    }
    if (stg > 0) {
      for (const p of P.pools) {
        const N = 28, wp = [p[0], 0, p[1]], wi = [];
        for (let j = 0; j < N; j++) { const a = j / N * TAU, R = P.pR(p, a) + 0.003; wp.push(p[0] + Math.cos(a) * R, 0, p[1] + Math.sin(a) * R); }
        for (let j = 1; j <= N; j++) wi.push(0, (j % N) + 1, j);
        const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3)); wg.setIndex(wi); wg.computeVertexNormals();
        if (wg.attributes.normal.getY(0) < 0) { wg.index.array.reverse(); wg.computeVertexNormals(); }
        K.add(this.frost > 0.55 ? 'ice' : 'shallow', wg, 0xffffff, [0, -0.004, 0]);
        for (let j = 0; j < (low ? 5 : 11); j++) { const a = r() * TAU, R = P.pR(p, a) + (r() - 0.3) * 0.012; if (r() < 0.75) reed(p[0] + Math.cos(a) * R, p[1] + Math.sin(a) * R); }
        if (stg === 2) for (let j = 0; j < 3; j++) { const a = r() * TAU, R = P.pR(p, a) * r() * 0.6; K.add('matte', new THREE.CircleGeometry(0.0055, 10, 0.4, TAU - 0.5).rotateX(-Math.PI / 2), 0x4a8a3a, [p[0] + Math.cos(a) * R, -0.0036, p[1] + Math.sin(a) * R], [0, r() * 6, 0]); }
      }
      for (const ch of P.chains) if (ch.carve) for (let j = 2; j < ch.pts.length; j++) {
        const [x0, z0] = ch.pts[j - 1], [x1, z1, rr] = ch.pts[j], L = Math.hypot(x1 - x0, z1 - z0) || 1, nx = -(z1 - z0) / L, nz = (x1 - x0) / L;
        for (const sg of [-1, 1]) if (r() < (low ? 0.3 : 0.6)) { const o = rr - 0.053 + r() * 0.012; reed(x1 + nx * o * sg + (r() - 0.5) * 0.02, z1 + nz * o * sg + (r() - 0.5) * 0.02); }
      }
    }
    // the footbridge, halfway along the longest channel
    const main = P.chains.filter((c) => c.carve).sort((a, b) => b.pts.length - a.pts.length)[0];
    if (main) {
      const j = Math.floor(main.pts.length / 2), [x, z, rr] = main.pts[j], [xa, za] = main.pts[j - 1], [xb, zb] = main.pts[j + 1];
      const L = Math.hypot(xb - xa, zb - za) || 1, tx = (xb - xa) / L, tz = (zb - za) / L, len = 2 * (rr - 0.008) + 0.03, ry = -Math.atan2(tx, -tz);
      if (this.edgeDist(x, z) > len / 2 + 0.02 && !this.env.inClearing(x, z, len / 2)) {
        const steel = stg === 0, mat = steel ? 'metal' : 'matte', deck = steel ? 0x8a9098 : 0x6e4c30, rail = steel ? 0xb8bec4 : 0x54381f;
        K.box(mat, deck, x, 0.002, z, len, 0.004, 0.026, ry);
        for (const sg of [-1, 1]) {
          K.box(mat, rail, x + tx * sg * 0.012, 0.014, z + tz * sg * 0.012, len, 0.0025, 0.0025, ry);
          for (const u of [-0.5, 0, 0.5]) { const px = x + tx * sg * 0.012 - tz * u * len * 0.9, pz = z + tz * sg * 0.012 + tx * u * len * 0.9; K.cyl(mat, rail, px, 0.002, pz, 0.0014, 0.0014, 0.013, 5); }
        }
      }
    }
    if (K.by.size) this.emit(K, ctx);
    if (reeds.length) ctx.inst(TK.tuft, this.b.folMat ||= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }), reeds);
  }
  // the Protected Valleys' water chains (and the river mouths': riverMouth), in board units, into the board's
  // basin uniforms (board3d basinGLSL uCh): new water runs in (from each chain's start) when the change is animated
  valleyWater(animate) {
    const B = this.b, U = B.pmat?.uniforms;
    if (!U?.uCh) return;
    const F = this.pvFill ||= new Map();
    for (const sp of [...F.keys()]) if (!B.tiles.get(sp)?.userData.pvChains) F.delete(sp);
    for (const [sp, g] of B.tiles) {
      const ch = g.userData.pvChains, f = F.get(sp);
      if (!ch || f?.ch === ch) continue;
      const nf = { ch, t: 1, keep: new Set(!animate ? ch.map((c) => c.key) : f ? f.ch.map((c) => c.key) : []) };
      F.set(sp, nf);
      if (ch.some((c) => !nf.keep.has(c.key))) { nf.t = 0; B.tween(3200, (kk) => { nf.t = kk; this.uploadWater(); }, () => { nf.t = 1; this.uploadWater(); }); }
    }
    this.uploadWater();
  }
  uploadWater() {
    const B = this.b, U = B.pmat.uniforms, A = U.uCh.value;
    let n = 0;
    for (const [sp, f] of this.pvFill || []) {
      const c = B.cells[sp];
      for (const ch of f.ch) {
        if (n + ch.pts.length > A.length) continue;                         // (out of room: that chain stays dry)
        const T = f.keep.has(ch.key) ? 1 : f.t, L = ch.pts.length - 1;
        const io = ch.key[0] === 'i' ? 4 : ch.key[0] === 'e' ? 12 : 0;       // (an inlet: the ocean's own water, its shore and surf -- not a channel's; an estuary: its surf fading up it)
        ch.pts.forEach(([x, z, rr, deep], j) => A[n++].set(c.bx + x, c.by + z, j ? rr : -rr, clamp01(T * 2.2 - 0.2 - j / L) + (deep ? 2 : 0) + io));
      }
    }
    U.uChN.value = n;
  }
}
