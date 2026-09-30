// eco_zone.js -- TileArt mixin: the Ecological Zone, a Yosemite-like valley with a granite wall, a waterfall,
// a winding river, woods and wildlife (its shared pieces live in nature_kit.js).
import { gfx } from '../quality.js';
import * as THREE from 'three';
import { mergeGeometries } from '../../../vendor/BufferGeometryUtils.js';
import { BOX, Kit, TAU, V3, _c, _c2, clamp01, fbm2, hash2, lineField, part, smin, smooth, spacedPts, vnoise } from './kit.js';

export class EcoZoneArt {
  // Ecological Zone: a wild Yosemite valley -- a granite wall and a half
  // dome across the back, a waterfall pouring off the rim into a plunge pool
  // that feeds a winding river, conifer woods on the rim and the valley
  // floor, a meadow with deer, a bear fishing the river, eagles overhead.
  // The river runs in a carved bed: gravel banks, the water a little below
  // the lip, clear over the shallows, whitewater under the falls, at two
  // rapids and behind the rocks in the stream; a plank footbridge carries the
  // trail from the ranger's cabin over it to the meadow. It never runs off the
  // tile's edge: it ends in a lake down the valley -- or, with an ocean next
  // door, it runs out into it (riverMouth), dropping in rapids to the sea's
  // level and opening into an estuary (estuary: a fan over sandbars, the sea's
  // own water run up it, tidal flats either side); to a side at the back it
  // leaves through a gorge cut in the wall. The wall is granite
  // with strata, joints and streaks (ecoGroundMat), talus at its foot. The
  // animals idle (a grazer's bob, a deer looking round, ear and tail flicks,
  // the bear dipping its head and swiping) and the eagles flap and glide,
  // all in the vertex shader (ecoAnimMat).
  // Stage: an ice-fall, a frozen river and snow on the rim while it is cold;
  // more forest, grass, wildflowers and wildlife as the oxygen rises.
  // Quality: Low / Medium thin the talus, the trees' undergrowth of grass and
  // flowers, the spray and the ground mesh; Low keeps the animals still and has
  // no eagles; never the river or falls.
  eco(ctx) {
    const r = this.env.srand(ctx.space * 67 + 11), Y = this.yosemiteKit(), life = this.life, frozen = this.st.temp < -12;
    const Q = (lo, mid, hi) => gfx.pick(lo, mid, hi);
    const zc = (x) => -0.1 + 0.035 * Math.sin(x * 9 + 1) + 0.02 * Math.sin(x * 21);     // the cliff line
    const wx = -0.13, HC = 0.17, FL = 0.009;                                                 // the falls, the rim, the valley floor
    const lz = zc(wx) + 0.03, px0 = wx + 0.004, pz0 = zc(wx) + 0.052, PR = 0.04;            // where the falls land; the plunge pool
    // ---- the river's way: with an ocean next door it runs out to the sea (riverMouth: the valley's own way
    // out first -- the front, then the flanks, last back through a gorge it has cut in the wall), its last reach
    // dropping in rapids to the sea's level, then out through its estuary (E); else it winds on down the valley
    // into a lake (Mirror Lake)
    const MO = this.riverMouth(ctx, [2, 3, 1, 0, 4, 5], (i) => [0, 0.18, 0, -0.06, -0.08, -0.18][i]), E = MO ? this.estuary(ctx, MO, 0.026) : null;
    const gorge = !!MO && MO.i >= 4, LK = [-0.1, 0.32], LR = 0.068;
    const ROUTE = [[[wx + 0.04, 0.03], [-0.04, 0.1], [0.08, 0.08], [0.2, 0.03], [0.3, 0.0]], [[wx + 0.04, 0.03], [wx - 0.01, 0.14], [-0.01, 0.25], [0.05, 0.33]],
      [[wx + 0.04, 0.03], [wx - 0.03, 0.14], [wx - 0.01, 0.25]], [[wx + 0.04, 0.03], [wx - 0.01, 0.13], [-0.24, 0.15], [-0.33, 0.07]],
      [[-0.2, 0.01], [-0.27, -0.06], [-0.25, -0.17]], [[-0.06, 0.03], [-0.04, -0.1], [-0.02, -0.22], [-0.005, -0.34]]];   // (per side: its bends)
    const ctrl = [[px0, pz0], ...(MO ? [...ROUTE[MO.i], MO.at(0.4, MO.t)] : [[wx + 0.04, 0.03], [wx - 0.03, 0.14], [wx + 0.01, 0.24], LK])];
    const Lt = new THREE.CatmullRomCurve3(ctrl.map(([x, z]) => new V3(x, 0, z)), false, 'centripetal').getLength();
    const NS = 80, rs = spacedPts(ctrl, NS), RF = lineField(rs, 0.2);
    // along it (0..1): sP the pool's outlet, S1 where the running river ends (the lake's shore, the head of the
    // drop to the sea), sR the estuary's head (at the sea's level); fr(u): u of the way down the running river
    const sP = PR / Lt, at1 = (f) => { const i = rs.findIndex(f); return (i < 0 ? NS : i) / NS; };
    const sR = MO ? at1((p) => E.sOf(p[0], p[1]) >= E.sH) : 1, S1 = MO ? Math.max(sP + 0.4 * (sR - sP), sR - 0.15 / Lt) : at1((p) => Math.hypot(p[0] - LK[0], p[1] - LK[1]) < LR);
    const fr = (u) => sP + (S1 - sP) * u, uOf = (s) => (s - sP) / (S1 - sP), ptAt = (s) => rs[Math.max(0, Math.min(NS, Math.round(s * NS)))];
    const rw = (s) => 0.018 + 0.0035 * Math.sin(s * 11 + 1) + 0.004 * s + (MO ? 0.006 * smooth(S1, sR, s) : 0);   // half width (opening out toward the estuary)
    const rapid = (s) => { const u = uOf(s); return Math.exp(-(((u - 0.36) / 0.045) ** 2)) + Math.exp(-(((u - 0.72) / 0.045) ** 2)); };
    const cas = (s) => (MO ? smooth(S1 - 0.01, S1 + 0.02, s) * (1 - smooth(sR - 0.02 / Lt, sR + 0.012 / Lt, s)) : 0);   // the drop to the sea: whitewater
    const P0 = 0.0045, lv0 = (s) => { const u = clamp01(uOf(s)); return P0 - 0.0035 * u - 0.0018 * smooth(0.33, 0.39, u) - 0.0018 * smooth(0.69, 0.75, u); }, LE = lv0(S1);
    const lvl = (s) => (s <= S1 ? lv0(s) : MO ? LE + (MO.yw + 0.001 - LE) * smooth(S1, sR, s) : LE);   // the water level: a step at each rapid; down to the sea's
    const lakeR = (dx, dz) => { const a = Math.atan2(dz, dx); return LR * (0.86 + 0.28 * vnoise(Math.cos(a) * 1.5 + 7, Math.sin(a) * 1.5 + 3)); };
    const cove = E ? (x, z) => { const e = E.at(x, z); return Math.max(e.fl, e.co); } : () => 0;   // (the estuary's flats and beach: the land brought down to the sea)
    // the water body at (x, z): c = signed distance to its edge (< 0 in the water), L its level, D the bed's
    // depth, pw / lw / fan how much of it is the pool / the lake / the estuary (its bed, f how far down it, its
    // flow), s / d along / off the centre line, w half width
    const W = { c: 1, L: 0, D: 0, pw: 0, lw: 0, fan: 0, bed: 0, ff: 0, efx: 0, efz: 0, s: 0, d: 0, w: 0, fx: 0, fz: 1 };
    const water = (x, z) => {
      const d = RF.d(x, z), s = RF.s, w = rw(s), a = d - w, b = Math.hypot(x - px0, z - pz0) - PR;
      let c = smin(a, b, 0.02);                                                              // (a smooth union: the pool's outlet flares)
      W.pw = smooth(-0.012, 0.012, a - b); W.s = s; W.d = d; W.fx = RF.tx; W.fz = RF.tz;
      W.L = lvl(s) + (P0 - lvl(s)) * W.pw;
      W.D = 0.0085 * (1 - 0.45 * rapid(s)) * (1 - W.pw) + 0.017 * W.pw;
      W.w = w + (PR - w) * W.pw; W.lw = 0;
      if (!MO) {                                                                             // the lake the river runs into
        const dx = x - LK[0], dz = z - LK[1], e = Math.hypot(dx, dz) - lakeR(dx, dz);
        W.lw = smooth(-0.015, 0.015, c - e); c = smin(c, e, 0.03);
        W.L += (LE - W.L) * W.lw; W.D += (0.022 - W.D) * W.lw; W.w += (LR - W.w) * W.lw;
      }
      if (E) {                                                                               // the estuary it opens into
        const e = E.at(x, z), fw = smooth(-0.012, 0.012, c - e.c);
        c = smin(c, e.c, 0.02);
        W.fan = fw; W.bed = e.bed; W.ff = e.f; W.efx = e.fx; W.efz = e.fz;
        W.L += (MO.yw + 0.001 - W.L) * fw; W.w += (0.08 - W.w) * fw;
      }
      W.c = c;
      return W;
    };
    const wat = (x, z) => { const back = z <= zc(x) - 0.01; if (back && !gorge) return null; const w = water(x, z); return back && w.pw > 0.05 ? null : w; };   // (behind the wall's face: only a gorge)
    // ---- the footbridge a quarter of the way down; the ranger's cabin (the first free spot of a few, the bridge
    // in reach dry-shod); the trail from its porch over the bridge and on to the meadow when it can get there dry
    const sb = fr(0.26), ib = Math.min(NS - 1, Math.round(sb * NS)), bp = rs[ib], bq = rs[ib + 1], bl0 = Math.hypot(bq[0] - bp[0], bq[1] - bp[1]), bax = -(bq[1] - bp[1]) / bl0, baz = (bq[0] - bp[0]) / bl0;   // across the river there
    const bHalf = rw(sb) + 0.015, bE = [[bp[0] - bax * bHalf, bp[1] - baz * bHalf], [bp[0] + bax * bHalf, bp[1] + baz * bHalf]];
    const dry = (a, b) => { for (let q = 0; q <= 10; q++) { const w = wat(a[0] + (b[0] - a[0]) * q / 10, a[1] + (b[1] - a[1]) * q / 10); if (w && w.c < 0.006) return false; } return true; };
    const beyond = (p, q, L) => { const dx = p[0] - q[0], dz = p[1] - q[1], l = Math.hypot(dx, dz) || 1; return [p[0] + dx / l * L, p[1] + dz / l * L]; };
    const near = (p) => (Math.hypot(bE[0][0] - p[0], bE[0][1] - p[1]) < Math.hypot(bE[1][0] - p[0], bE[1][1] - p[1]) ? [bE[0], bE[1]] : [bE[1], bE[0]]);
    const cabOk = ([x, z]) => {
      const w = wat(x, z);
      if ((w && w.c < 0.07) || cove(x, z) > 0.02 || this.env.inClearing(x, z, 0.06) || this.edgeDist(x, z) < 0.07 || z < zc(x) + 0.1 || Math.hypot(x - bp[0], z - bp[1]) < 0.09) return false;
      const [n0, n1] = near([x + 0.03, z]); return dry([x + 0.03, z], beyond(n0, n1, 0.015));
    };
    const c0 = [[-0.3, 0.1], [-0.33, 0.01], [-0.27, 0.25], [0.02, 0.03], [-0.05, 0.37]].find(cabOk) || [-0.3, 0.1];
    const cab = { x: c0[0] + (r() - 0.5) * 0.02, z: c0[1] + (r() - 0.5) * 0.03, ry: (r() - 0.5) * 0.4 };
    const door = [cab.x + 0.03 * Math.cos(cab.ry), cab.z - 0.03 * Math.sin(cab.ry)], [n0, n1] = near(door), MD = [0.12, 0.29], past = beyond(n1, n0, 0.035);
    const trail = [door, beyond(n0, n1, 0.015), n0, n1, past, ...(dry(past, MD) ? [[(past[0] + MD[0]) / 2 - 0.01, (past[1] + MD[1]) / 2 + 0.02], MD] : [])];
    const tz0 = Math.min(...trail.map((p) => p[1])) - 0.03, tz1 = Math.max(...trail.map((p) => p[1])) + 0.03;
    const trailD = (x, z) => { if (z < tz0 || z > tz1) return 1; let best = 1; for (let i = 0; i < trail.length - 1; i++) { const [ax, az] = trail[i], [bx, bz] = trail[i + 1], dx = bx - ax, dz = bz - az, t = clamp01(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)); best = Math.min(best, Math.hypot(ax + dx * t - x, az + dz * t - z)); } return best; };
    const blocked = (x, z, pad) => Math.hypot(x - cab.x, z - cab.z) < 0.042 + pad || Math.hypot(x - bp[0], z - bp[1]) < bHalf + 0.006 + pad;
    const meadow = (x, z) => 1 - smooth(0.0, 0.1, Math.hypot((x - 0.14) / 1.3, z - 0.2) - 0.08);
    // ---- the ground: wall, dome and talus, then the river's bed and banks carved into the valley floor
    const hBase = (x, z) => {
      const zz = zc(x), face = 1 - smooth(zz - 0.016, zz + 0.016, z);                     // sheer face
      let h = HC * face * (0.85 + 0.3 * fbm2(x * 7, z * 7, 3));
      const dome = Math.hypot((x - 0.2) / 0.17, (z + 0.26) / 0.15);                          // the half dome, cut flat on its face
      if (dome < 1) h = Math.max(h, (0.27 * Math.sqrt(1 - dome * dome)) * (1 - smooth(-0.2, -0.17, z + (x - 0.2) * 0.2)));
      h -= Math.exp(-(((x - wx) / 0.028) ** 2)) * face * 0.03;                                // the falls' notch
      h += (1 - face) * 0.02 * Math.exp(-(((z - zz - 0.03) / 0.032) ** 2)) * (0.6 + 0.8 * fbm2(x * 34 + 3, z * 34, 2));   // talus apron
      if (gorge && z < zz + 0.05) {                                                          // the gorge: sheer walls down to the river and its estuary
        const d = RF.d(x, z); if (d < 0.19 && RF.s > sP + 0.03) h = Math.min(h, Math.max(0, d - rw(RF.s) - 0.006) * 3.2);
        h = Math.min(h, Math.max(0, E.at(x, z).c - 0.006) * 3.2);
      }
      return h + FL;
    };
    const edgeF = (x, z) => smooth(0, 0.06, this.edgeDist(x, z));
    const hf = (x, z) => {
      let h = (hBase(x, z) + 0.003 * fbm2(x * 40, z * 40, 2)) * edgeF(x, z);
      if (E) { const e = E.at(x, z), fl = Math.max(e.fl, e.co * (1 - smooth(0.04, 0.1, h))); if (fl > 0) h += (e.y - h) * fl; }   // the estuary's flats, the beach: eased down to the sea (not the high rock)
      const w = wat(x, z);
      if (w) {
        const c = w.c, fan = w.fan, bed = w.bed;
        let hr = h;
        if (c < 0) hr = w.L - w.D * smooth(0, 0.65 * w.w, -c) + 0.0012 * (vnoise(x * 160, z * 160) - 0.5);   // the bed
        else if (c < 0.03) {                                                                 // the banks: from the waterline up to the lip, a low levee where the floor is lower
          const top = h + Math.max(0, w.L + 0.0045 - h) * (1 - smooth(0.016, 0.03, c));
          hr = w.L + (top - w.L) * smooth(0, 0.016, c);
        }
        h = hr + (bed + (h - bed) * smooth(-0.004, 0.012, c) - hr) * fan;                    // (the estuary: its bed, its flats)
      }
      return h;
    };
    const slopeAt = (x, z) => { const e = 0.006; return Math.hypot(hBase(x + e, z) - hBase(x - e, z), hBase(x, z + e) - hBase(x, z - e)) / (2 * e); };
    const cGr = new THREE.Color(), cRk = new THREE.Color(), cSo = new THREE.Color();
    const ext = [];                                                                                            // (per vertex, in ground()'s order: rock weight, water distance)
    const cf = (x, z, h) => {
      const cv = cove(x, z), w = wat(x, z), n = fbm2(x * 30, z * 30, 3), sl = slopeAt(x, z), rock = Math.max(smooth(0.7, 1.6, sl), smooth(0.19, 0.22, h)) * (1 - smooth(0.3, 0.8, cv)), zz = zc(x), mead = meadow(x, z);
      ext.push(rock, w ? w.c : 1);
      cRk.setRGB(0.78, 0.77, 0.74).multiplyScalar((0.78 + 0.34 * n) * (h > 0.2 ? 1.07 : 1));                   // granite (strata, joints, streaks: the shader)
      cGr.setHSL(0.2 + 0.05 * n + 0.02 * mead, 0.38 + 0.14 * life - 0.05 * mead, (0.19 + 0.08 * n + 0.05 * mead) * (0.78 + 0.34 * life));
      if (frozen) cGr.lerp(_c2.setRGB(0.6, 0.54, 0.42), 0.55);                                                // cold: dry straw
      cSo.setRGB(0.36, 0.27, 0.19).multiplyScalar(0.8 + 0.3 * n);                                              // forest floor
      _c.copy(cGr).lerp(cSo, clamp01(smooth(HC * 0.7, HC * 0.8, h) * 0.45 + (0.35 - life * 0.3) * (1 - mead) + (n - 0.5) * 0.6));
      const tal = z > zz ? Math.exp(-(((z - zz - 0.03) / 0.03) ** 2)) : 0;                                   // grey scree at the wall's foot
      if (tal > 0.05) _c.lerp(_c2.setRGB(0.52, 0.5, 0.46).multiplyScalar(0.85 + 0.3 * n), clamp01(tal * 0.8 * (0.6 + n)));
      _c.lerp(cRk, rock);
      if (w) {                                                                                                 // the river: pebbly bed, wet line, gravel banks
        const c = w.c, fan = w.fan;
        if (c < 0) _c.lerp(_c2.setRGB(0.5, 0.46, 0.36).multiplyScalar((0.75 + 0.35 * vnoise(x * 150, z * 150)) * (1 - 0.4 * smooth(0, 0.65 * w.w, -c))), 1 - fan);
        else if (c < 0.02) { _c.lerp(_c2.setRGB(0.6, 0.56, 0.48).multiplyScalar(0.85 + 0.3 * vnoise(x * 120, z * 120)), (1 - smooth(0.007, 0.02, c)) * (1 - fan)); if (c < 0.004) _c.multiplyScalar(1 - (1 - fan) * 0.3 * (1 - c / 0.004)); }
      }
      if (E && (cv > 0.02 || (w && w.c < 0.01 && w.fan > 0.02))) _c.lerp(E.sand(x, z, h, _c2), Math.max(smooth(0.15, 0.7, h / MO.yP), w && w.c < 0.01 ? w.fan : 0));   // the estuary: its sand and silt, tidal flats, a beach
      const td = trailD(x, z); if (td < 0.008) _c.lerp(_c2.setRGB(0.5, 0.4, 0.28), (1 - smooth(0.003, 0.008, td)) * 0.8 * (1 - rock));
      if (frozen && h > 0.1) _c.lerp(_c2.setRGB(0.92, 0.94, 0.98), smooth(0.1, 0.16, h) * (1 - smooth(0.6, 1.2, sl)) * 0.85);   // snow on the rim and the dome
      return _c;
    };
    const sub = Q(34, 42, 50), geo = this.ground(hf, cf, { sub });
    {                                                                                                          // per-pixel detail weights (ecoGroundMat)
      const Pp = geo.attributes.position, n = Pp.count, a = new Float32Array(n * 4), b = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) {
        const x = Pp.getX(i), y = Pp.getY(i), z = Pp.getZ(i), same = ext.length === n * 2;
        const rock = same ? ext[i * 2] : Math.max(smooth(0.7, 1.6, slopeAt(x, z)), smooth(0.19, 0.22, y)), wet = smooth(0, 0.012, same ? ext[i * 2 + 1] : wat(x, z)?.c ?? 1);
        a[i * 4] = x; a[i * 4 + 1] = y; a[i * 4 + 2] = z; a[i * 4 + 3] = rock;
        b[i * 2] = (1 - rock) * wet * (trailD(x, z) < 0.006 ? 0.3 : 1) * (1 - cove(x, z)); b[i * 2 + 1] = frozen ? 0 : meadow(x, z) * life * wet;
      }
      geo.setAttribute('aEco', new THREE.BufferAttribute(a, 4)); geo.setAttribute('aEco2', new THREE.BufferAttribute(b, 2));
    }
    this.groundMeshGeo(ctx, geo, { mat: this.ecoGroundMat() });
    if (E) { E.chain(ctx); E.wall(ctx, hf, 0x4a4238, sub); }                                                // the sea's water up the estuary; the walls, open to it
    else ctx.wall(0x4a4238);
    const K = new Kit();
    // ---- rocks in the stream (their wakes foam)
    const sRocks = [];
    for (const [s0, n0] of [[fr(0.36), 3], [fr(0.72), 3], [fr(0.18), 1], [fr(0.56), 1]]) for (let j = 0; j < n0; j++) {
      const s = s0 + (r() - 0.5) * 0.05, i = Math.min(NS - 1, Math.floor(s * NS)), p = rs[i], q = rs[i + 1], tl = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1, tx = (q[0] - p[0]) / tl, tz = (q[1] - p[1]) / tl, off = (r() - 0.5) * 1.4 * rw(s);
      const x = p[0] - tz * off, z = p[1] + tx * off;
      if (this.edgeDist(x, z) < 0.03 || Math.hypot(x - bp[0], z - bp[1]) < bHalf || z < zc(x) + 0.02) continue;
      sRocks.push({ x, z, rad: 0.0035 + r() * 0.0035, tx, tz });
    }
    // ---- the water: one surface over the pool, the river and the lake (or down to the sea: faded out at the rim,
    // where the ocean's own water has come up the mouth), a fine grid clipped to the wetted area; flow, depth and
    // whitewater per vertex
    {
      const [bx0, bx1, bz0, bz1] = RF.box, pd = MO ? 0.05 : 0.1, I = ptAt(S1);
      this.waterSheet(K, frozen ? 'ice' : this.ecoWaterMat(), [Math.max(-0.5, Math.min(bx0, px0 - PR) - pd), Math.min(0.5, bx1 + pd), Math.max(-0.56, Math.min(bz0, pz0 - PR) - pd), Math.min(0.56, bz1 + pd)], Q(0.0075, 0.006, 0.005),
        (x, z) => { if (this.edgeDist(x, z) <= 0.002) return 1; const w = wat(x, z); return !w || (w.fan > 0.5 && (frozen || w.ff > 0.6)) ? 1 : w.c; },   // (not far out in the estuary: faded out there; the ice stops at its head)
        (x, z) => {
          const w = water(x, z), L = w.L, pw = w.pw, lw = w.lw, s = w.s, across = clamp01(w.d / w.w), fx = w.fx, fz = w.fz, fan = w.fan, ff = w.ff, efx = w.efx, efz = w.efz;
          const sp = 0.03 * (1 + 1.4 * rapid(s) + 1.5 * cas(s)) * (1 - 0.5 * across * across), dx = x - wx, dz = z - lz, dl = Math.hypot(dx, dz) || 1, ps = 0.02 * (1 - 0.5 * clamp01(dl / PR));
          const ix = x - I[0], iz = z - I[1], il = Math.hypot(ix, iz) || 1, ls = 0.008 * Math.exp(-il / 0.06);   // (in the lake: a slow spread from where the river runs in)
          let flx = fx * sp + (dx / dl * ps - fx * sp) * pw, flz = fz * sp + (dz / dl * ps - fz * sp) * pw;
          flx += (ix / il * ls - flx) * lw; flz += (iz / il * ls - flz) * lw;
          flx += (efx - flx) * fan; flz += (efz - flz) * fan;                                   // (spreading out over the estuary)
          const depth = clamp01((L - hf(x, z)) / 0.012);
          let foam = Math.exp(-(dx * dx + dz * dz) / (0.016 * 0.016)) + 0.3 * pw * Math.exp(-((dl / 0.045) ** 2)) + (0.75 * rapid(s) * (1 - pw) + 0.65 * cas(s)) * (1 - lw);
          for (const q of sRocks) { const vx = x - q.x, vz = z - q.z, al = vx * q.tx + vz * q.tz, pr = Math.abs(-vx * q.tz + vz * q.tx); foam += 0.8 * Math.exp(-(((Math.hypot(vx, vz) - q.rad) / 0.004) ** 2)) + (al > 0 ? 0.7 * Math.exp(-((pr / (q.rad * 0.9 + al * 0.35)) ** 2)) * Math.exp(-al / 0.035) : 0); }
          return [L, flx, flz, depth, Math.min(1, foam * (1 - 0.7 * fan)), smooth(0.001, 0.015, this.edgeDist(x, z)) * (E ? 1 - fan + fan * E.sheet(ff) : 1)];   // (the sea's own water takes over up the estuary)
        });
    }
    // ---- the falls: two sheets from the notch in the rim, arcing out from the face to the pool
    {
      const topY = hf(wx, zc(wx) - 0.045);
      const faceZ = (y) => { let lo = zc(wx) - 0.07, hi = zc(wx) + 0.05; for (let i = 0; i < 22; i++) { const m = (lo + hi) / 2; if (hf(wx, m) > y) lo = m; else hi = m; } return lo; };
      const NF = 22, NU = 6, zLip = faceZ(topY - 0.002), rows = [];
      for (let i = 0; i <= NF; i++) { const t = i / NF, y = topY + (P0 - topY) * t; rows.push([t, y, Math.max(zLip + (lz - zLip) * Math.pow(t, 1.6), faceZ(y) + 0.004)]); }
      const fp = [], fF = [], fuv = [], fi = [];
      for (const L of [0, 1]) {
        const base = fp.length / 3;
        for (const [t, y, z0] of rows) {
          const hw = (0.011 + 0.013 * t) * (L ? 0.8 : 1);
          for (let u = 0; u <= NU; u++) { const f = u / NU; fp.push(wx + (f - 0.5) * 2 * hw + (L ? 0.002 : 0), y, z0 - L * 0.0025 + 0.003 * (1 - (2 * f - 1) ** 2)); fF.push(f, t, L); fuv.push(f, t * 3); }
        }
        for (let i = 0; i < NF; i++) for (let u = 0; u < NU; u++) { const a = base + i * (NU + 1) + u, b = a + NU + 1; fi.push(a, a + 1, b, a + 1, b + 1, b); }
      }
      const fg = new THREE.BufferGeometry();
      fg.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3)); fg.setAttribute('aF', new THREE.Float32BufferAttribute(fF, 3)); fg.setAttribute('uv', new THREE.Float32BufferAttribute(fuv, 2));
      fg.setIndex(fi); fg.computeVertexNormals();
      K.raw(frozen ? this.ecoIcefallMat() : this.ecoFallsMat(), fg);
    }
    // ---- the cabin and the footbridge
    K.add('std', Y.cabin, null, [cab.x, hf(cab.x, cab.z) - 0.001, cab.z], [0, cab.ry, 0], 1);
    {
      const bk = [], Lb = bHalf * 2, deck = Math.max(hf(...bE[0]), hf(...bE[1])) + 0.0015;
      for (let k = 0; k < 9; k++) { const u = (k + 0.5) / 9 - 0.5; bk.push(part(BOX, k % 2 ? 0x8a6440 : 0x7a5636, [u * Lb, 0.004 * (1 - (2 * u) ** 2) + 0.001, 0], [0, 0, 0], [Lb / 9 * 0.94, 0.0016, 0.013])); }
      for (const s of [-1, 1]) {
        bk.push(part(new THREE.CylinderGeometry(0.0013, 0.0013, Lb, 6).rotateZ(Math.PI / 2), 0x5a4030, [0, -0.0005, s * 0.0045]));           // stringers
        bk.push(part(BOX, 0x6a4a30, [0, 0.0125, s * 0.006], [0, 0, 0], [Lb * 0.96, 0.0014, 0.0014]));                                     // hand rails
        for (let k = 0; k < 4; k++) { const u = -0.45 + k * 0.3, a = 0.004 * (1 - (2 * u) ** 2); bk.push(part(BOX, 0x6a4a30, [u * Lb, a + (0.0125 - a) / 2 + 0.001, s * 0.006], [0, 0, 0], [0.0014, 0.0125 - a, 0.0014])); }
      }
      K.add('std', mergeGeometries(bk), null, [bp[0], deck, bp[1]], [0, Math.atan2(-baz, bax), 0], 1);
    }
    // ---- forest: firs, pines and snags on the rim; pines, cedars and firs on the valley floor; birches by the river
    const trees = [], nT = Math.round(Q(20, 28, 34) + Q(14, 24, 32) * life);
    for (let i = 0, g = 0; i < nT && g < 1400; g++) {
      const x = (r() - 0.5) * 0.9, z = (r() - 0.5) * 1.0;
      if (this.edgeDist(x, z) < 0.032 || this.env.inClearing(x, z, 0.02) || blocked(x, z, 0.004)) continue;
      const zz = zc(x), h = hf(x, z), valley = z > zz;
      if ((z > zz - 0.03 && z < zz + 0.04) || h > 0.205) continue;
      const w = wat(x, z), c = w ? w.c : 1;
      if (c < (valley ? 0.012 : 0.03) || (valley && Math.hypot(x - wx, z - lz) < 0.07) || cove(x, z) > 0.4) continue;
      if (meadow(x, z) > 0.3 && r() > 0.1) continue;                                        // the meadow stays open
      if (trailD(x, z) < 0.012 || trees.some((t) => Math.hypot(t.x - x, t.z - z) < (valley ? 0.034 : 0.03))) continue;
      const q = r(), sp = valley && c < 0.05 && life > 0.25 && q < 0.55 ? 'birch' : !valley ? (q < 0.5 ? 'fir' : q < 0.86 ? 'pine' : 'snag') : (q < 0.3 ? 'fir' : q < 0.62 ? 'pine' : q < 0.94 ? 'cedar' : 'snag');
      trees.push({ x, z, h, sp }); i++;
    }
    for (const t of trees) {
      const s = (0.72 + r() * 0.55) * (0.82 + 0.22 * life) * (t.z < zc(t.x) ? 0.85 : 1), ry = r() * TAU, dk = r(), y0 = t.h - 0.003, at = [t.x, y0, t.z], rot = [0, ry, 0];
      const green = (hue, sat, l0, l1) => (X, Yy) => _c.setHSL(hue + dk * 0.04, sat * (0.75 + 0.25 * life), l0 + (Yy - y0) / s * l1);
      if (t.sp === 'fir') { K.add('std', Y.fir, green(0.36, 0.4, 0.085, 1.3), at, rot, s * 1.05); K.add('std', Y.trunk, 0x4a3222, at, rot, s); }
      else if (t.sp === 'pine') { K.add('std', Y.pineCrown, green(0.29, 0.36, 0.1, 1.25), at, rot, s); K.add('std', Y.pineTrunk, 0x7a5236, at, rot, s); }
      else if (t.sp === 'cedar') { K.add('std', Y.cedar, green(0.25, 0.42, 0.11, 1.4), at, rot, s); K.add('std', Y.cedarTrunk, 0x8a4a2a, at, rot, s); }
      else if (t.sp === 'snag') K.add('std', Y.snag, (X, Yy) => _c.setRGB(0.56, 0.53, 0.49).multiplyScalar(0.75 + 0.45 * clamp01((Yy - y0) / (0.1 * s))), at, rot, s);
      else { K.add('std', Y.birchTrunks, (X, Yy, Z) => (hash2(Math.floor((Yy - y0) / s * 240), Math.floor((X + Z) * 3000)) > 0.72 ? _c.setRGB(0.16, 0.15, 0.14) : _c.setRGB(0.9, 0.9, 0.86)), at, rot, s); K.add('std', Y.birchCrown, frozen ? green(0.1, 0.62, 0.34, 1.1) : green(0.2, 0.55, 0.3, 1.3), at, rot, s); }   // (cold: autumn gold)
    }
    // ---- talus: boulders heaped at the wall's foot (bigger near it), a few erratics on the floor
    const nB = Q(12, 26, 38);
    for (let i = 0, g = 0; i < nB && g < 400; g++) {
      const erratic = i >= nB - 3, x = (r() - 0.5) * 0.86, zz = zc(x), z = erratic ? zz + 0.1 + r() * 0.4 : zz + 0.012 + Math.pow(r(), 1.6) * 0.085;
      if (this.edgeDist(x, z) < 0.025 || this.env.inClearing(x, z, 0) || blocked(x, z, 0.01) || (wat(x, z)?.c ?? 1) < 0.003 || cove(x, z) > 0.5 || trailD(x, z) < 0.01) continue;
      const s = erratic ? 0.008 + r() * 0.006 : (0.004 + Math.pow(r(), 2) * 0.014) * (1.25 - (z - zz) * 4), tone = 0.52 + r() * 0.16;
      K.add('std', r() < 0.5 ? Y.rockA : Y.rockB, (X, Yy, Z) => _c.setRGB(tone * 1.02, tone, tone * 0.93).multiplyScalar(0.8 + 0.35 * vnoise(X * 500 + 3, Z * 500 + Yy * 400)), [x, hf(x, z) + s * 0.2, z], [r() * 3, r() * 3, r() * 3], [s * (1 + r() * 0.4), s * (0.6 + r() * 0.3), s]);
      i++;
    }
    for (const q of sRocks) { const w = water(q.x, q.z); K.add('std', Y.rockC, (X, Yy) => _c.setRGB(0.42, 0.41, 0.38).multiplyScalar(0.8 + 0.5 * clamp01((Yy - w.L) / q.rad)), [q.x, w.L + q.rad * 0.1, q.z], [r(), r() * 6, r()], [q.rad * 1.2, q.rad * 0.75, q.rad]); }
    // ---- grass tufts (the meadow and the banks) and wildflowers
    const nG = Math.round(Q(0, 60, 140) * (0.35 + 0.65 * life));
    for (let i = 0, g = 0; i < nG && g < nG * 8; g++) {
      const x = (r() - 0.5) * 0.85, z = (r() - 0.5) * 0.95, zz = zc(x);
      if (z < zz + 0.05 || this.edgeDist(x, z) < 0.02 || this.env.inClearing(x, z, 0) || blocked(x, z, 0) || trailD(x, z) < 0.005) continue;
      const c = wat(x, z)?.c ?? 1, mead = meadow(x, z);
      if (c < 0.005 || (mead < 0.2 && c > 0.035 && r() < 0.7) || cove(x, z) > 0.5) continue;
      const y0 = hf(x, z), s = 0.8 + r() * 0.7, hue = frozen ? 0.11 : 0.19 + r() * 0.07, sat = frozen ? 0.3 : 0.45 + 0.1 * life;
      K.add('std', Y.tuft, (X, Yy) => _c.setHSL(hue, sat, (frozen ? 0.2 : 0.16) + clamp01((Yy - y0) / (0.015 * s)) * (0.2 + 0.08 * life)), [x, y0, z], [0, r() * 6, 0], s);
      i++;
    }
    if (!frozen && life > 0.15) {
      const nF = Math.round(Q(0, 30, 70) * life), PET = [[0.62, 0.42, 0.9], [0.98, 0.8, 0.2], [0.96, 0.95, 0.9], [0.9, 0.3, 0.25]];
      for (let i = 0, g = 0; i < nF && g < nF * 8; g++) {
        const x = 0.14 + (r() - 0.5) * 0.36, z = 0.2 + (r() - 0.5) * 0.28;
        if (meadow(x, z) < 0.4 || this.env.inClearing(x, z, 0) || trailD(x, z) < 0.005) continue;
        const y0 = hf(x, z), pc = PET[Math.floor(r() * 4)], s = 0.8 + r() * 0.5;
        K.add('std', Y.flower, (X, Yy) => (Yy - y0 > 0.0065 * s ? _c.setRGB(pc[0], pc[1], pc[2]) : _c.setRGB(0.2, 0.36, 0.14)), [x, y0, z], [0, r() * 6, 0], s);
        i++;
      }
    }
    // ---- wildlife: deer in the meadow (a stag, some grazing), a bear fishing the lower rapid, eagles.
    // They move a little (ecoAnimMat, their own mesh); Low keeps them still, in the static batch.
    const HD = this.herd(K), beast = HD.add;
    const nd = 2 + Math.round(life * 3);
    for (let i = 0, g = 0; i < nd && g < 80; g++) {
      const x = 0.04 + r() * 0.24, z = 0.06 + r() * 0.24;
      if (this.env.inClearing(x, z, 0.02) || (wat(x, z)?.c ?? 1) < 0.02 || cove(x, z) > 0.3 || trailD(x, z) < 0.01) continue;
      beast(i === 0 ? Y.stag : i % 2 ? Y.graze : Y.deer, i % 2, [x, hf(x, z), z], r() * 6, 1.15);
      i++;
    }
    const sBr = [fr(0.72), fr(0.58), fr(0.44)].find((s) => { const p = ptAt(s); return p[1] > zc(p[0]) + 0.06 && this.edgeDist(p[0], p[1]) > 0.07 && Math.hypot(p[0] - bp[0], p[1] - bp[1]) > 0.08; });
    if (life > 0.2 && sBr != null) {                                          // (the lower rapid -- or higher up, clear of the gorge and the bridge)
      const ia = Math.min(NS - 1, Math.round(sBr * NS)), p = rs[ia], q = rs[ia + 1], tl = Math.hypot(q[0] - p[0], q[1] - p[1]), nxr = -(q[1] - p[1]) / tl, nzr = (q[0] - p[0]) / tl, sd = rw(sBr) + 0.01;
      const side = this.env.inClearing(p[0] + nxr * sd, p[1] + nzr * sd, 0) ? -1 : 1, bx = p[0] + nxr * sd * side, bz = p[1] + nzr * sd * side;
      beast(Y.bear, 2, [bx, hf(bx, bz) - 0.001, bz], Math.atan2(nzr * side, -nxr * side), 1.25);
    }
    this.emit(K, ctx);
    HD.done(ctx);                                       // the animals: rest pose + per-vertex offsets to each channel's pose, all draped
    if (life > 0.1) this.ecoEagles(ctx, Y.eagle, 2 + Math.round(life * 2), 0.05, -0.05, 0.36, 0.14, 0.3, ctx.space);
    // ---- mist and spray under the falls, smoke from the cabin's chimney (one Points object)
    const pl = [], ch = Y.chimney, cr = Math.cos(cab.ry), sr = Math.sin(cab.ry);
    if (!frozen) {
      pl.push({ x: wx, z: lz + 0.012, y: P0 + 0.004, n: Q(5, 9, 12), life: 3.2, rise: 0.075, size: 0.075, col: [0.95, 0.97, 1, 0.42], drift: [0.02, 0.045], jit: 0.035, spread: 0.05 });
      if (!gfx.low) pl.push({ x: wx, z: lz + 0.004, y: P0 + 0.002, n: Q(0, 6, 9), life: 1.3, rise: 0.03, size: 0.03, col: [1, 1, 1, 0.55], drift: [0, 0.035], jit: 0.02, spread: 0.07 });
    }
    pl.push({ x: cab.x + ch[0] * cr + ch[2] * sr, z: cab.z - ch[0] * sr + ch[2] * cr, y: hf(cab.x, cab.z) + ch[1], n: Q(3, 4, 5), life: 5, rise: 0.12, size: 0.028, col: [0.72, 0.72, 0.74, 0.3], drift: [0.035, -0.02], jit: 0.004, spread: 0.02 });
    this.puffs(ctx, pl);
    this.emblem(ctx, 'ecological_zone', 0.2, 0.3, 0.26, 0.26);
  }
}
