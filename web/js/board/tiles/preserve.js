// preserve.js -- TileArt mixin: the Natural Preserve, a protected red-rock landscape of mesas, hoodoos and an
// arch, with a spring whose brook ends in a pool or runs out into a neighbouring ocean.
import { gfx } from '../quality.js';
import * as THREE from 'three';
import { BALL, Kit, V3, _c, _c2, clamp01, fbm2, hexCorner, lineField, smin, smooth, spacedPts, vnoise } from './kit.js';

export class PreserveArt {
  // Natural Preserve: untouched Martian wilderness under a faint protective field -- banded red-rock mesas,
  // hoodoos and a natural arch on the red desert floor. A spring wells up in front of the arch among fallen
  // blocks, crusted pale with its minerals, and its brook (the Ecological Zone's water: ripples dragged along
  // its flow, a riffle over a rock step, lace round the stones in it) winds down between the hoodoos to a
  // pool, where it sinks into the sand (a damp fan of dark sand below it) -- or, with an ocean next door, runs
  // on out to the sea through its estuary (estuary), cutting a slot through the red rock where it leaves
  // between the mesas (back under the arch). Six corner beacons hold a shimmering boundary.
  // Stage: brook and pool frozen while it is cold (the spring steams); lichen and moss creep over the sand and
  // a few hardy pines take hold as the air thickens (the standard tileset: its end-game look).
  // Quality: Low / Medium coarsen the ground and water meshes and drop the stones in the brook; Low: no birds.
  preserve(ctx) {
    const r = this.env.srand(ctx.space * 71 + 5), life = this.life, NK = this.natureKit(), Y = this.yosemiteKit(), HR = this.HEX_R;
    const frozen = this.st.temp < -12, Q = (lo, mid, hi) => gfx.pick(lo, mid, hi), sub = Q(34, 42, 48);
    const mesas = [[-0.19, -0.24, 0.14, 0.13], [0.2, -0.28, 0.1, 0.17], [0.27, 0.02, 0.07, 0.09], [-0.31, 0.1, 0.07, 0.07]];
    const rockH = (x, z) => {                                                                 // sheer banded walls, a bench half way down, a talus apron
      let h = 0;
      for (const [mx, mz, mr, mh] of mesas) {
        if (Math.abs(x - mx) > mr * 1.9 || Math.abs(z - mz) > mr * 1.9) continue;
        const wx = x + 0.05 * (fbm2(x * 9 + mx * 7, z * 9, 3) - 0.5), wz = z + 0.05 * (fbm2(x * 9, z * 9 + mz * 7, 3) - 0.5), d = Math.hypot(wx - mx, wz - mz) / mr;
        const cliff = mh * (1 - smooth(0.86, 0.97, d)) * (0.95 + 0.08 * fbm2(x * 30, z * 30, 2)), ledge = d > 0.9 ? mh * 0.55 * (1 - smooth(1.02, 1.12, d)) : 0;
        h = Math.max(h, cliff, ledge, mh * 0.3 * (1 - smooth(1.0, 1.6, d)));
      }
      return h;
    };
    const SP = [0.02, -0.17], PL = [0.14, 0.23], PR = 0.05;                                  // the spring; the pool the brook ends in
    const floor = (x, z) => 0.002 + 0.004 * fbm2(x * 20, z * 20, 3) + 0.012 * (1 - smooth(0.02, 0.14, Math.hypot(x - SP[0], z - SP[1])));   // (a low rise at the spring)
    // ---- the brook: from the spring down between the hoodoos to its pool -- or, with an ocean next door, out to
    // the sea (riverMouth: the front first, then the flanks, last back under the arch; E its estuary)
    const MO = this.riverMouth(ctx, [2, 1, 0, 3, 5, 4], (i) => [-0.1, 0.04, -0.06, 0.06, 0.2, -0.2][i]), E = MO ? this.estuary(ctx, MO, 0.018) : null;
    const ROUTE = [[[0.1, -0.14], [0.22, -0.1]], [[-0.01, -0.09], [0.0, 0.0], [0.08, 0.09]], [[-0.01, -0.09], [0.0, 0.0], [-0.05, 0.11]],
      [[-0.03, -0.11], [-0.1, -0.05], [-0.23, -0.05]], [[0.0, -0.25], [0.0, -0.32]], [[0.0, -0.25], [0.0, -0.32]]];   // (per side: its bends)
    const ctrl = [SP, ...(MO ? [...ROUTE[MO.i], MO.at(0.4, MO.t)] : [[-0.01, -0.09], [0.0, 0.0], [0.05, 0.09], [0.1, 0.17], PL])];
    const Lt = new THREE.CatmullRomCurve3(ctrl.map(([x, z]) => new V3(x, 0, z)), false, 'centripetal').getLength(), NS = 64, rs = spacedPts(ctrl, NS), RF = lineField(rs, 0.14);
    // along it (0..1): sF the estuary's head (the sea's level), S1 where it starts its drop to it; the riffle half way down
    const at1 = (f) => { const i = rs.findIndex(f); return (i < 0 ? NS : i) / NS; };
    const sF = E ? at1((p) => E.sOf(p[0], p[1]) >= E.sH) : 1, S1 = E ? Math.max(0.45 * sF, sF - 0.17 / Lt) : 1, sRf = 0.5 * S1, yw1 = MO ? MO.yw + 0.001 : 0;
    const bw = (s) => 0.0105 + 0.004 * s + 0.012 * (1 - smooth(0, 0.05 / Lt, s));             // half width (its head: the spring's pool)
    const rif = (s) => Math.exp(-((((s - sRf) * Lt) / 0.012) ** 2));
    const cas = (s) => (E ? smooth(S1 - 0.01, S1 + 0.02, s) * (1 - smooth(sF - 0.02 / Lt, sF + 0.012 / Lt, s)) : 0);   // whitewater down the drop to the sea
    // its level: a little under the floor along its way, never rising, a step at the riffle; then down to the sea's
    const Lc = new Float32Array(NS + 1);
    for (let j = 0; j <= NS; j++) { const s = j / NS, f = Math.min(floor(...rs[j]), 0.012) - 0.0025 - 0.0015 * smooth(sRf - 0.012 / Lt, sRf + 0.012 / Lt, s); Lc[j] = j ? Math.min(Lc[j - 1], f) : f; }
    const lv0 = (s) => { const q = clamp01(s) * NS, j = Math.min(NS - 1, Math.floor(q)); return Lc[j] + (Lc[j + 1] - Lc[j]) * (q - j); };
    const lv = (s) => (E && s > S1 ? lv0(S1) + (yw1 - lv0(S1)) * smooth(S1, sF, s) : lv0(s)), LPo = lv0(1);
    // the water at (x, z): c = signed distance to its edge (< 0 in the water), L its level, D the bed's depth, w half
    // width, s / d along / off the brook, (fx, fz) its way; pl / fan how much of it is the pool / the estuary (its bed,
    // how far down it, its flow; fl / fy: the flats beside it)
    const W = { c: 1, L: 0, D: 0, w: 0, s: 0, d: 0, fx: 0, fz: 1, pl: 0, fan: 0, bed: 0, ff: 0, efx: 0, efz: 0, fl: 0, co: 0, fy: 0 };
    const water = (x, z) => {
      const d = RF.d(x, z), s = RF.s, b = bw(s);
      let c = d - b;
      W.s = s; W.d = d; W.fx = RF.tx; W.fz = RF.tz; W.L = lv(s); W.D = 0.006 + 0.007 * (1 - smooth(0, 0.05 / Lt, s)); W.w = b; W.pl = 0; W.fan = 0; W.fl = 0; W.co = 0;
      if (!E) {
        const dx = x - PL[0], dz = z - PL[1], a = Math.atan2(dz, dx), e = Math.hypot(dx, dz) - PR * (0.84 + 0.3 * vnoise(Math.cos(a) * 1.6 + 2.3, Math.sin(a) * 1.6 + 5.1));
        W.pl = smooth(-0.012, 0.012, c - e); c = smin(c, e, 0.025);
        W.L += (LPo - W.L) * W.pl; W.D += (0.013 - W.D) * W.pl; W.w += (PR - W.w) * W.pl;
      } else {
        const e = E.at(x, z), fw = smooth(-0.012, 0.012, c - e.c);
        c = smin(c, e.c, 0.02);
        W.fan = fw; W.bed = e.bed; W.ff = e.f; W.efx = e.fx; W.efz = e.fz; W.fl = e.fl; W.co = e.co; W.fy = e.y;
        W.L += (yw1 - W.L) * fw; W.w += (0.08 - W.w) * fw;
      }
      W.c = c;
      return W;
    };
    // ---- the ground: the old desert floor and its mesas -- the rock cut back into a slot where the water runs
    // through it -- the brook's bed and banks, the pool's hollow; brought down to the flats round the estuary
    const land = (x, z, c) => { const f = floor(x, z); let h = Math.max(f, rockH(x, z)); if (c < 0.25) h = Math.min(h, f + Math.max(0, c - 0.006) * 3); return h * smooth(0, 0.05, this.edgeDist(x, z)); };
    const hf = (x, z) => {
      const w = water(x, z), c = w.c, fan = w.fan, bed = w.bed, L = w.L, D = w.D, ww = w.w, fy = w.fy;
      let h = land(x, z, c);
      const fl = Math.max(w.fl, w.co * (1 - smooth(0.04, 0.1, h)));                          // the estuary's flats, the beach (not the mesas)
      if (fl > 0) h += (fy - h) * fl;
      let hr = h;
      if (c < 0) hr = L - D * smooth(0, 0.65 * Math.min(ww, 0.05), -c) + 0.001 * (vnoise(x * 150, z * 150) - 0.5);        // the bed
      else if (c < 0.03) { const top = h + Math.max(0, L + 0.003 - h) * (1 - smooth(0.012, 0.03, c)); hr = L + (top - L) * smooth(0, 0.012, c); }   // the banks
      return hr + (bed + (h - bed) * smooth(-0.004, 0.012, c) - hr) * fan;                   // (the estuary: its bed, its flats)
    };
    const band = [[0.62, 0.22, 0.12], [0.86, 0.5, 0.3], [0.7, 0.3, 0.16], [0.93, 0.78, 0.6], [0.55, 0.2, 0.12], [0.8, 0.42, 0.24]];
    const cMoss = new THREE.Color(), ext = [];                                                // (per vertex, in ground()'s order: rock, moss)
    const cf = (x, z, h) => {
      const w = water(x, z), c = w.c, fan = w.fan, n = fbm2(x * 25, z * 25, 3), beach = E ? smooth(0.15, 0.7, h / MO.yP) : 0, fl = Math.max(w.fl, beach);
      const rock = smooth(0.016, 0.024, h) * smooth(0.004, 0.012, rockH(x, z)) * (1 - smooth(0.3, 0.8, fl));
      const b = band[((Math.floor(h * 90 + n * 0.6) % 6) + 6) % 6];
      _c.setRGB(0.76, 0.45, 0.28).multiplyScalar(0.85 + 0.25 * n).lerp(_c2.setRGB(b[0], b[1], b[2]).multiplyScalar(0.82 + 0.25 * n), rock);   // red sand, banded rock
      const damp = c > 0 && fan < 0.5 ? (1 - smooth(0.004, 0.05, c)) * 0.8 : 0;                          // damp banks
      const seep = E ? 0 : (1 - smooth(0.0, 0.03 + 0.12 * clamp01((z - PL[1] + 0.02) / 0.18), Math.hypot(x - PL[0], z - PL[1]) - PR)) * (1 - smooth(0.02, 0.05, Math.abs(x - PL[0] - 0.4 * (z - PL[1])) - 0.02 - 0.2 * clamp01(z - PL[1])));   // (the pool sinking into the sand: a damp fan below it)
      const wet = Math.max(damp, seep * 0.85);
      if (wet > 0) _c.multiplyScalar(1 - 0.38 * wet * (1 - rock));
      let moss = life * clamp01((fbm2(x * 9 + 3, z * 9, 3) - 0.45) * 3) * (h < 0.03 ? 1 : 0.4) + life * 0.7 * wet * smooth(0.35, 0.6, fbm2(x * 30 + 5, z * 30, 2));   // lichen and moss creep in; greener where it is wet
      moss = clamp01(moss) * (frozen ? 0.4 : 1) * (1 - smooth(0.2, 0.6, fl));
      _c.lerp(cMoss.setHSL(0.26 + 0.06 * n, 0.4, 0.26), moss * 0.8);
      const sd = Math.hypot(x - SP[0], z - SP[1]);                                           // the spring's mineral crust
      if (sd < 0.07) _c.lerp(_c2.setRGB(0.88, 0.8, 0.64).multiplyScalar(0.9 + 0.15 * n), (1 - smooth(0.035, 0.07, sd)) * smooth(0.3, 0.55, vnoise(x * 70, z * 70)) * 0.8 * (1 - rock));
      if (c < 0) _c.lerp(_c2.setRGB(0.5, 0.36, 0.26).multiplyScalar((0.75 + 0.35 * vnoise(x * 150, z * 150)) * (1 - 0.4 * smooth(0, 0.04, -c))), 1 - fan);   // its pebbly red bed
      else if (c < 0.004 && fan < 0.5) _c.multiplyScalar(0.72 + 0.28 * c / 0.004);                                                                  // the wet line
      if (E && (fl > 0.02 || (c < 0.01 && fan > 0.02))) _c.lerp(E.sand(x, z, h, _c2), Math.max(beach, smooth(0.1, 0.55, w.fl) * 0.7, c < 0.01 ? fan : 0));   // the estuary: its sand and silt, tidal flats, a beach
      ext.push(rock, moss);
      return _c;
    };
    const geo = this.ground(hf, cf, { sub });
    {                                                                                        // per-pixel detail (ecoGroundMat): strata on the rock, a texture to the moss
      const Pp = geo.attributes.position, n = Pp.count, a = new Float32Array(n * 4), b = new Float32Array(n * 2), same = ext.length === n * 2;
      for (let i = 0; i < n; i++) { a[i * 4] = Pp.getX(i); a[i * 4 + 1] = Pp.getY(i); a[i * 4 + 2] = Pp.getZ(i); a[i * 4 + 3] = same ? ext[i * 2] : 0; b[i * 2] = same ? ext[i * 2 + 1] * 0.7 : 0; }
      geo.setAttribute('aEco', new THREE.BufferAttribute(a, 4)); geo.setAttribute('aEco2', new THREE.BufferAttribute(b, 2));
    }
    this.groundMeshGeo(ctx, geo, { mat: this.ecoGroundMat() });
    if (E) { E.chain(ctx); E.wall(ctx, hf, 0x5a3222, sub); }                                 // the sea's water up the estuary; the walls, open to it
    else ctx.wall(0x5a3222);
    const K = new Kit(), wc = (x, z) => water(x, z).c;
    const bandCol = (y0) => (X, Yy) => { const b = band[((Math.floor((Yy - y0) * 90) % 6) + 6) % 6]; return _c.setRGB(b[0], b[1], b[2]); };
    // ---- hoodoos: slender stacked spires with a pale cap stone (stepped aside off the water)
    for (const [x0, z0, s] of [[0.03, -0.1, 1], [0.08, -0.05, 0.75], [-0.06, 0.04, 0.9], [0.11, 0.13, 0.7], [-0.16, 0.27, 0.85], [0.0, 0.34, 0.6]]) {
      const p = [[0, 0], [0.04, 0], [-0.04, 0], [0, 0.04], [0, -0.04], [0.05, 0.04], [-0.05, -0.04]].map(([ox, oz]) => [x0 + ox, z0 + oz]).find(([x, z]) => wc(x, z) > 0.028 && !this.env.inClearing(x, z, 0.02) && this.edgeDist(x, z) > 0.04);
      if (!p) continue;
      const [x, z] = p; let yy = land(x, z, 1) - 0.002;
      for (let q = 0; q < 4; q++) { const rr = (0.016 - q * 0.0025) * s * (q % 2 ? 0.8 : 1), hh = 0.028 * s; K.add('std', NK.rock, new THREE.Color(...band[(q * 2 + 1) % 6]), [x, yy + hh * 0.5, z], [0, r() * 6, 0], [rr, hh * 0.6, rr]); yy += hh * 0.8; }
      K.add('std', NK.rock, 0xe8d4b8, [x, yy + 0.004, z], [0, r(), 0], [0.017 * s, 0.006 * s, 0.015 * s]);
    }
    // ---- the natural arch: a thick tube bent over a gap, banded like the rock (its feet on the ground either side)
    {
      const ax = 0.0, az = -0.3, ar = 0.35, lx = Math.cos(ar) * 0.075, lz = -Math.sin(ar) * 0.075, base = Math.min(land(ax - lx, az - lz, 1), land(ax + lx, az + lz, 1));
      const arch = new THREE.CatmullRomCurve3([new V3(-0.075, -0.012, 0), new V3(-0.06, 0.06, 0), new V3(0, 0.1, 0), new V3(0.06, 0.06, 0), new V3(0.075, -0.012, 0)]);
      K.add('std', new THREE.TubeGeometry(arch, 24, 0.017, 10), bandCol(base), [ax, base, az], [0, ar, 0], [1, 1, 1.3], { smooth: true });
    }
    // ---- the spring rises among fallen blocks; stones in the brook (their wakes foam), a rock step at the riffle
    for (let q = 0; q < 7; q++) {
      const a = -2.2 + q * 0.62 + (r() - 0.5) * 0.3, rr = 0.03 + r() * 0.012, x = SP[0] + Math.cos(a) * rr, z = SP[1] + Math.sin(a) * rr, s = 0.005 + r() * 0.006, tone = 0.5 + r() * 0.2;
      if (wc(x, z) < 0.004) continue;
      K.add('std', r() < 0.5 ? Y.rockA : Y.rockB, (X, Yy, Z) => _c.setRGB(tone * 1.25, tone * 0.72, tone * 0.5).multiplyScalar(0.8 + 0.35 * vnoise(X * 500 + 3, Z * 500 + Yy * 400)), [x, hf(x, z) + s * 0.25, z], [r() * 3, r() * 3, r() * 3], [s * 1.3, s * 0.8, s]);
    }
    const sRocks = [];
    if (!gfx.low) for (const [s0, n0] of [[sRf, 2], [sRf * 1.5, 1]]) for (let j = 0; j < n0; j++) {
      const s = s0 + (r() - 0.5) * 0.02, i = Math.min(NS - 1, Math.floor(s * NS)), p = rs[i], q = rs[i + 1], tl = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1, tx = (q[0] - p[0]) / tl, tz = (q[1] - p[1]) / tl, off = (r() - 0.5) * 1.3 * bw(s);
      const x = p[0] - tz * off, z = p[1] + tx * off;
      if (this.edgeDist(x, z) < 0.03 || s > S1 - 0.02) continue;
      sRocks.push({ x, z, rad: 0.003 + r() * 0.0028, tx, tz });
    }
    for (const q of sRocks) { RF.d(q.x, q.z); const L = lv(RF.s); K.add('std', Y.rockC, (X, Yy) => _c.setRGB(0.55, 0.36, 0.26).multiplyScalar(0.8 + 0.5 * clamp01((Yy - L) / q.rad)), [q.x, L + q.rad * 0.1, q.z], [r(), r() * 6, r()], [q.rad * 1.2, q.rad * 0.75, q.rad]); }
    // ---- the water: one surface over the spring, the brook and the pool (or down to the sea and faded out up the
    // estuary, where the sea's own water has come up it), a fine grid clipped to the wetted area; its flow, depth and
    // whitewater per vertex: the spring's boil, the riffle, the stones' wakes, the drop to the sea
    {
      const I = rs.find((p) => !E && Math.hypot(p[0] - PL[0], p[1] - PL[1]) < PR) || PL, bx = [RF.box, ...(E ? [] : [[PL[0] - PR * 1.3, PL[0] + PR * 1.3, PL[1] - PR * 1.3, PL[1] + PR * 1.3]])];
      const box = [Math.max(-0.5, Math.min(...bx.map((b) => b[0])) - 0.04), Math.min(0.5, Math.max(...bx.map((b) => b[1])) + 0.04), Math.max(-0.56, Math.min(...bx.map((b) => b[2])) - 0.04), Math.min(0.56, Math.max(...bx.map((b) => b[3])) + 0.04)];
      const ice = frozen && (this.mats.presIce ||= this.own(new THREE.MeshStandardMaterial({ color: 0x6f9cc0, roughness: 0.22, metalness: 0.05, emissive: 0x16304a, emissiveIntensity: 0.3, transparent: true, opacity: 0.66, depthWrite: false }), 0.5));   // (clear blue ice: the red bed shows through)
      this.waterSheet(K, frozen ? ice : this.ecoWaterMat(), box, Q(0.0075, 0.006, 0.005),
        (x, z) => { if (this.edgeDist(x, z) <= 0.002) return 1; const w = water(x, z); return w.fan > 0.5 && (frozen || w.ff > 0.6) ? 1 : w.c; },   // (not far out in the estuary: faded out there; the ice stops at its head)
        (x, z) => {
          const w = water(x, z), L = w.L, s = w.s, pl = w.pl, fan = w.fan, ff = w.ff, efx = w.efx, efz = w.efz, across = clamp01(w.d / w.w), fx = w.fx, fz = w.fz;
          const sp = 0.026 * (1 + 1.2 * rif(s) + 1.1 * cas(s)) * (1 - 0.5 * across * across) * (1 - pl), ix = x - I[0], iz = z - I[1], il = Math.hypot(ix, iz) || 1, ls = 0.007 * Math.exp(-il / 0.05);
          let flx = fx * sp + (ix / il * ls) * pl, flz = fz * sp + (iz / il * ls) * pl;
          flx += (efx - flx) * fan; flz += (efz - flz) * fan;
          const depth = clamp01((L - hf(x, z)) / 0.012);
          let foam = (0.6 * (1 - smooth(0, 0.035 / Lt, s)) + 0.55 * rif(s)) * (1 - pl) + 0.3 * cas(s) + 0.3 * pl * Math.exp(-((il / 0.025) ** 2));
          for (const q of sRocks) { const vx = x - q.x, vz = z - q.z, al = vx * q.tx + vz * q.tz, pr = Math.abs(-vx * q.tz + vz * q.tx); foam += 0.6 * Math.exp(-(((Math.hypot(vx, vz) - q.rad) / 0.003) ** 2)) + (al > 0 ? 0.45 * Math.exp(-((pr / (q.rad * 0.8 + al * 0.25)) ** 2)) * Math.exp(-al / 0.02) : 0); }
          return [L, flx, flz, depth, Math.min(1, foam * (1 - 0.7 * fan)), smooth(0.001, 0.015, this.edgeDist(x, z)) * (E ? 1 - fan + fan * E.sheet(ff) : 1)];
        });
    }
    // ---- a few hardy pines on the open sand as the air thickens (not on the rock, the wet ground or the flats)
    for (let i = 0, g = 0, nP = Math.round(life * 12); i < nP && g < 300; g++) {
      const x = (r() - 0.5) * 0.8, z = (r() - 0.5) * 0.9, h = land(x, z, 1);
      if (this.edgeDist(x, z) < 0.04 || h > 0.03 || this.env.inClearing(x, z, 0.02)) continue;
      const w = water(x, z); if (w.c < 0.035 || w.fl > 0.2 || w.co > 0.2) continue;
      const y0 = hf(x, z);
      K.add('std', NK.conifer, (X, Yy) => _c.setHSL(0.3, 0.35, 0.12 + (Yy - y0) * 1.4), [x, y0, z], [0, r() * 6, 0], 0.55 + r() * 0.35); K.add('std', NK.trunk, 0x4a3222, [x, y0, z], [0, 0, 0], 0.6); i++;
    }
    // ---- the boundary: six corner beacons, a faint shimmering curtain between them (over the ground, and the water)
    const top = (x, z) => { const w = water(x, z); return Math.max(hf(x, z), w.c < 0 ? w.L : -1); };
    for (let q = 0; q < 6; q++) {
      const [x, z] = hexCorner(q, HR * 0.88), y = top(x, z);
      K.cyl('metal', 0xd8dcd8, x, y, z, 0.007, 0.005, 0.06, 10);
      K.add('glow', BALL, 0x7dffb0, [x, y + 0.064, z], [0, 0, 0], 0.008);
    }
    const cur = [], ci = [], NQ = 8;
    for (let q = 0; q < 6; q++) for (let j = 0; j <= NQ; j++) {
      const [x0, z0] = hexCorner(q, HR * 0.88), [x1, z1] = hexCorner(q + 1, HR * 0.88), x = x0 + (x1 - x0) * j / NQ, z = z0 + (z1 - z0) * j / NQ, y = top(x, z) + 0.002;
      cur.push(x, y, z, x, y + 0.053, z);
      if (j) { const a = (q * (NQ + 1) + j - 1) * 2; ci.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.Float32BufferAttribute(cur, 3)); cg.setIndex(ci);
    { const P = cg.attributes.position, col = new Float32Array(P.count * 3); for (let i = 0; i < P.count; i++) { const f = 0.9 * (i % 2 ? 0 : 1); col[i * 3] = 0.3 * f; col[i * 3 + 1] = f; col[i * 3 + 2] = 0.6 * f; } cg.setAttribute('color', new THREE.BufferAttribute(col, 3)); }
    K.raw('beam', cg);
    this.emit(K, ctx);
    if (life > 0.3) this.flock(ctx, NK.eagle, 2, 0.0, -0.05, 0.3, 0.12, -0.25, ctx.space + 3);
    // ---- steam off the spring while it is cold
    if (this.st.temp < 0) this.puffs(ctx, [{ x: SP[0], z: SP[1], y: lv0(0) + 0.004, n: Q(3, 5, 7), life: 3.5, rise: 0.06, size: 0.035, col: [0.95, 0.97, 1, 0.35], drift: [0.01, 0.02], jit: 0.012, spread: 0.02 }]);
    this.emblem(ctx, 'natural_preserve', -0.02, 0.2, 0.26, 0.26, false);
  }
}
