// mining.js -- TileArt mixin: Mining Area (a terraced open pit with a haul road and trucks) and Mining Rights
// (a staked claim with drilling rigs, test pits and ore carts), plus their shared mine pieces.
import * as THREE from 'three';
import { gfx } from '../quality.js';
import { mergeGeometries } from '../../../vendor/BufferGeometryUtils.js';
import { BALL, BOX, Kit, TAU, V3, Y, _c, _c2, _q, capsuleX, clamp01, dish, fbm2, hexCorner, lathe, smooth, smoothGeo } from './kit.js';

export class MiningArt {
  // ore colouring for the mining tiles: steel (rust/ochre) or titanium (steel-blue)
  oreOf(cell) { return (cell.b || []).includes(1) ? 'ti' : 'fe'; }

  // Mining Area: a stepped open-pit mine -- terraced benches banded with ore,
  // a haul road spiralling down, dump trucks and an excavator at work, a
  // conveyor up to the crusher and its ore stockpile, floodlight masts.
  // shared pieces of the mining tiles, in their own local frame (x forward, z to the side), placed by a
  // (x, z, ang, y) frame: see mineFrame()
  mineFrame(K, x, z, ang, y, sc = 1) {
    const ca = Math.cos(ang), sa = Math.sin(ang);
    return (mat, geo, col, lx, ly, lz, s = 1, rot = [0, 0, 0], o) => K.add(mat, geo, col, [x + (ca * lx - sa * lz) * sc, y + ly * sc, z + (sa * lx + ca * lz) * sc], [rot[0], -ang + rot[1], rot[2], 'YXZ'], typeof s === 'number' ? s * sc : s.map((v) => v * sc), o);
  }
  // unit pieces, built once
  minePieces() {
    if (this._mp) return this._mp;
    const S2 = Math.SQRT2;
    return this._mp = {
      frustum: new THREE.CylinderGeometry(0.5 * S2, 0.4 * S2, 1, 4, 1).rotateY(Math.PI / 4),              // a flared square tub (dump bodies, hoppers, dippers)
      tire: smoothGeo(new THREE.TorusGeometry(0.0062, 0.0032, 10, 22)),                                      // (in the xy plane: the axle is z)
      hub: new THREE.CylinderGeometry(0.0042, 0.0042, 0.0072, 16).rotateX(Math.PI / 2),
      heap: lathe([[0.001, 0], [0.5, 0], [0.42, 0.18], [0.26, 0.4], [0.1, 0.52], [0.001, 0.56]], 20),
      roof: new THREE.CylinderGeometry(0.5, 0.5, 1, 3, 1).rotateZ(Math.PI / 2).rotateX(Math.PI / 6),           // a gable (triangular prism along x)
      track: smoothGeo(new THREE.CapsuleGeometry(0.5, 1, 6, 16).rotateZ(Math.PI / 2)),
      rock: new THREE.IcosahedronGeometry(1, 0), rock2: new THREE.DodecahedronGeometry(1, 0),                   // faceted ore chunks
      pile: (() => { const g = new THREE.CylinderGeometry(0.175 * S2, 0.5 * S2, 1, 4, 1).rotateY(Math.PI / 4).toNonIndexed(); g.computeVertexNormals(); return g; })(),   // a hipped heap on a unit square, faceted (loads in the tubs)
      wheel: new THREE.CylinderGeometry(1, 1, 1, 12).rotateX(Math.PI / 2),                                    // a unit disc on a z axle (cart wheels, axles)
    };
  }
  // a load of ore heaped in a rectangular hopper whose rim (inner L x W) is at height y, centred at local x cx:
  // a hipped pile shaped to the hopper and faceted chunks lying on its slopes, peaking about Hh above y
  oreHeap(P, cx, y, L, W, Hh, col, col2, n) {
    const M = this.minePieces(), hm = Hh * 0.6;
    P('matte', M.pile, col2, cx, y + hm / 2, 0, [L, hm, W]);
    [[0.02, 0.03, 1, 0.3, 0.2, 0.1], [-0.2, -0.1, 0.9, 1.1, 0.7, 0.4], [0.22, 0.12, 0.9, 0.5, 2.1, 0.9], [-0.05, 0.24, 0.75, 2.2, 1.3, 0.2], [0.1, -0.24, 0.8, 0.8, 2.8, 1.7],
      [-0.34, 0.16, 0.7, 1.7, 0.4, 2.3], [0.34, -0.14, 0.7, 2.6, 1.9, 0.6], [-0.3, -0.26, 0.6, 0.9, 1.5, 2.8], [0.3, 0.27, 0.6, 1.3, 2.4, 0.5], [0.14, 0.02, 0.8, 2.9, 0.6, 1.2]]
      .slice(0, n).forEach(([u, v, s, a, b, c], i) => {
        const cs = s * W * 0.2, sy = Math.min(cs * 0.75, Hh * 0.3), ph = hm * clamp01((1 - Math.max(Math.abs(2 * u), Math.abs(2 * v))) / 0.65);   // (ph: the pile's surface there)
        P('matte', i % 2 ? M.rock2 : M.rock, i % 3 === 2 ? col2 : col, cx + u * L, y + ph * 0.92 + sy * 0.35, v * W, [cs * 1.25, sy, cs], [a, b, c]);
      });
  }
  // a haul truck (about 0.06 long, 0.035 wide over the tyres) at (x, z) heading ang, on ground height y; load: ore colour or null
  haulTruck(K, x, z, ang, y, load, o = {}) {
    const P = this.mineFrame(K, x, z, ang, y), M = this.minePieces(), yel = o.body ?? 0xf2b418, dark = 0x2a2c30, lo = gfx.low;
    P('std', BOX, 0x3a3c40, 0, 0.012, 0, [0.05, 0.007, 0.012]);                                         // chassis
    P('std', BOX, dark, 0.0278, 0.0085, 0, [0.002, 0.004, 0.024]);                                          // front bumper
    if (o.tank) {                                                                                            // water truck: a white tank and spray bar
      P('std', capsuleX(0.0105, 0.022, 16), 0xeef0ee, -0.006, 0.027, 0, 1, [0, 0, 0], { smooth: true });
      P('std', BOX, 0x3a86c8, -0.006, 0.027, 0, [0.024, 0.004, 0.0215]);
      P('metal', BOX, 0x7a8088, -0.03, 0.013, 0, [0.004, 0.003, 0.024]);
    } else {
      // the dump body: a long flared tub (0.046 x 0.032 at the rim), a rim lip, ribbed sides, the canopy over the cab
      const bx = -0.0095, by = 0.0275, BL = 0.046, BW = 0.032, BH = 0.016, yt = by + BH / 2, rib = new THREE.Color(yel).multiplyScalar(0.72);
      P('std', M.frustum, yel, bx, by, 0, [BL, BH, BW]);
      for (const s of [-1, 1]) {
        P('std', BOX, rib, bx, yt, s * (BW / 2 + 0.0004), [BL + 0.0024, 0.0026, 0.0018]);                    // the lip: sides
        P('std', BOX, rib, bx + s * (BL / 2 + 0.0004), yt, 0, [0.0018, 0.0026, BW + 0.0024]);                //   and ends
        if (!lo) for (const lx of [-0.016, -0.0055, 0.005]) P('std', BOX, rib, bx + lx, by, s * (0.45 * BW + 0.0006), [0.0024, BH * 0.98, 0.0014], [s * Math.atan2(0.1 * BW, BH), 0, 0]);   // side ribs, on the flare
      }
      if (!lo) P('std', BOX, rib, bx - 0.45 * BL - 0.0006, by, 0, [0.0014, BH * 0.98, 0.022], [0, 0, Math.atan2(0.1 * BL, BH)]);   // a rib across the tail
      P('std', BOX, yel, 0.0205, yt - 0.0008, 0, [0.015, 0.0025, BW + 0.001]);                             // the canopy over the cab
      if (load != null) this.oreHeap(P, bx, yt - 0.0015, BL * 0.9, BW * 0.86, 0.011, load, new THREE.Color(load).multiplyScalar(0.72), lo ? 4 : 10);
    }
    P('std', BOX, 0xe8e6e0, 0.018, 0.022, 0.006, [0.011, 0.011, 0.011]);                                  // cab
    P('glow', BOX, 0x9fd8ff, 0.0237, 0.025, 0.006, [0.0006, 0.005, 0.009]);
    P('std', BOX, yel, 0.021, 0.017, 0, [0.012, 0.009, 0.025]);                                             // deck + radiator
    P('glow', BOX, 0xfff4d0, 0.0272, 0.016, -0.009, [0.001, 0.003, 0.004]); P('glow', BOX, 0xfff4d0, 0.0272, 0.016, 0.009, [0.001, 0.003, 0.004]);
    for (const [lx, lz] of [[0.017, -0.0142], [0.017, 0.0142], [-0.013, -0.0085], [-0.013, 0.0085], [-0.013, -0.0145], [-0.013, 0.0145]]) {   // (rear: duals)
      P('matte', M.tire, dark, lx, 0.0094, lz); P('std', M.hub, yel, lx, 0.0094, lz, [1, 1, 0.8]);
    }
    if (!o.quiet) P('blinkA', BALL, 0xffffff, 0.013, 0.04, -0.009, 0.0025);
  }
  // a mine cart on rails of half gauge G (local x along the track, y = 0 the rail tops): a long flared tub
  // (0.026 x 0.015 at the rim) with a rim lip and ribbed sides on a frame of two sills with buffer beams and
  // couplers at the ends, four flanged wheels on two axles; heaped with ore (col, col2)
  mineCart(P, G, col, col2) {
    const M = this.minePieces(), lo = gfx.low, steel = 0x7a7e86, rib = 0x55595f, dark = 0x2a2a2c;
    const L = 0.026, W = 0.015, H = 0.0088, y0 = 0.0044, yc = y0 + H / 2, yt = y0 + H, WR = 0.0025, WX = 0.0082;
    P('metal', M.frustum, steel, 0, yc, 0, [L, H, W]);
    for (const s of [-1, 1]) {
      P('metal', BOX, rib, 0, yt, s * (W / 2 + 0.0002), [L + 0.0014, 0.0013, 0.0011]);                       // the lip
      P('metal', BOX, rib, s * (L / 2 + 0.0002), yt, 0, [0.0011, 0.0013, W + 0.0015]);
      P('metal', BOX, dark, 0, y0 - 0.0008, s * 0.0045, [L + 0.002, 0.0016, 0.0016]);                         // the sills
      P('metal', BOX, dark, s * (L / 2 + 0.0008), y0 - 0.0004, 0, [0.0016, 0.0028, W * 0.78]);                  // buffer beams
      P('metal', BOX, rib, s * (L / 2 + 0.0026), y0 - 0.0004, 0, [0.0028, 0.0011, 0.0022]);                     // couplers
      for (const lx of [-WX, WX]) {
        P('metal', M.wheel, dark, lx, WR, s * G, [WR, WR, 0.0015]);                                             // wheels on the rails
        if (!lo) P('metal', M.wheel, dark, lx, WR, s * (G - 0.001), [WR + 0.0006, WR + 0.0006, 0.0005]);       //   their flanges, inside
      }
      if (!lo) {
        for (const lx of [-0.0085, 0, 0.0085]) P('metal', BOX, rib, lx, yc, s * (0.45 * W + 0.0003), [0.0012, H * 0.98, 0.0007], [s * Math.atan2(0.1 * W, H), 0, 0]);   // side ribs, on the flare
        P('metal', BOX, rib, s * (0.45 * L + 0.0003), yc, 0, [0.0007, H * 0.98, 0.0012], [0, 0, -s * Math.atan2(0.1 * L, H)]);
      }
    }
    for (const lx of [-WX, WX]) P('metal', M.wheel, dark, lx, WR, 0, [0.0006, 0.0006, 2 * G]);                // axles
    this.oreHeap(P, 0, yt - 0.001, L * 0.9, W * 0.86, 0.0042, col, col2, lo ? 4 : 9);
  }
  // Mining Area: a deep open-pit mine -- terraced benches cut through ore
  // strata (tinted by the space's bonus: steel rusty, titanium blue-grey), a
  // haul road spiralling down them, haul trucks at every depth (one driving
  // the ramp), an electric rope shovel loading at the face, a water truck
  // damping the dust; at the rim the crusher, conveyors to the processing
  // plant (mill, silos, thickeners) and a radial stacker over the stockpile;
  // floodlight masts lighting the pit.
  miningArea(ctx) {
    const r = this.env.srand(ctx.space * 53 + 2), ti = this.oreOf(ctx.cell) === 'ti', low = gfx.low, k = this.kOf(ctx.cell);
    ctx.wall(0x3a2c22);
    const cx = -0.075, cz = -0.085, R0 = 0.065, R1 = 0.285, D = 0.12, N = low ? 4 : 5, turns = 1.3, th0 = 2.05;
    const terr = (d) => { const u = (d - R0) / (R1 - R0); if (u <= 0) return -D; if (u >= 1) return 0; const f = u * N, kk = Math.floor(f); return -D * (1 - (kk + smooth(0.64, 0.97, f - kk)) / N); };
    const rho = (s) => R1 + 0.014 - s * (R1 + 0.014 - R0 - 0.03), tho = (s) => th0 - s * turns * TAU;
    const roadAt = (s) => [cx + Math.cos(tho(s)) * rho(s), cz + Math.sin(tho(s)) * rho(s), -D * s];
    const road = (x, z) => {                                          // [distance to the ramp's centreline, its s there]
      const dx = x - cx, dz = z - cz, d = Math.hypot(dx, dz), a = Math.atan2(dz, dx);
      let best = 9, bs = 0;
      for (let m = -3; m <= 3; m++) { const s = (th0 - a - TAU * m) / (turns * TAU); if (s < -0.02 || s > 1.02) continue; const e = Math.abs(d - rho(clamp01(s))); if (e < best) { best = e; bs = clamp01(s); } }
      return [best, bs];
    };
    // pull-out bays cut into the pit wall on the ramp's outer side: the parked trucks stand in them, clear of the one driving the ramp's inner lane
    const parked = low ? [[0.46, 1], [0.84, 0]] : [[0.34, 0], [0.46, 1], [0.68, 0], [0.84, 1]], waterS = 0.57, BAYW = 0.036;   // (BAYW: a parked truck's centre, out from the ramp's)
    const bays = [...parked.map(([s]) => s), waterS];
    const bay = (x, z) => {                                           // [how much (x, z) is on a bay's floor, the ramp's s there]
      const d = Math.hypot(x - cx, z - cz), a = Math.atan2(z - cz, x - cx);
      let best = 0, bs = 0;
      for (const sb of bays) {
        const s = (th0 - a - TAU * Math.round((th0 - a - sb * turns * TAU) / TAU)) / (turns * TAU), w = d - rho(s), al = (s - sb) * turns * TAU * rho(sb);
        const m = smooth(0.046, 0.036, Math.abs(al)) * smooth(0.064, 0.057, w) * smooth(-0.03, -0.02, w);
        if (m > best) { best = m; bs = s; }
      }
      return [best, bs];
    };
    const exitP = roadAt(0), crusher = [-0.22, 0.3];
    const seg = (x, z, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], t = clamp01(((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)); return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t); };
    const access = (x, z) => seg(x, z, exitP, crusher);
    const hf = (x, z) => {
      const d = Math.hypot(x - cx, z - cz), t = terr(d), [e, s] = road(x, z), m = smooth(0.021, 0.015, e);
      let h = t + (-D * s - t) * m;
      const [bm, bs] = bay(x, z); if (bm > 0) h += (-D * bs - h) * bm;                                  // the bays, level with the ramp
      if (d > R1) h += 0.012 * Math.exp(-(((d - R1 - 0.04) / 0.028) ** 2)) * smooth(0.02, 0.05, access(x, z)) * smooth(0, 0.04, this.edgeDist(x, z));   // the spoil berm round the rim
      return h + 0.0016 * (fbm2(x * 34, z * 34, 3) - 0.5);
    };
    const oreA = ti ? [0.42, 0.5, 0.6] : [0.66, 0.34, 0.18], oreB = ti ? [0.64, 0.7, 0.78] : [0.8, 0.54, 0.3], host = ti ? [0.5, 0.47, 0.46] : [0.56, 0.42, 0.32];
    const oreHex = ti ? 0x7c8ea4 : 0xa4582c;
    const cf = (x, z, h) => {
      const d = Math.hypot(x - cx, z - cz), n = fbm2(x * 24, z * 24, 3), n2 = fbm2(x * 60 + 3, z * 60, 2);
      if (d > R1 + 0.004) {
        _c.setRGB(0.6 + n * 0.1, 0.42 + n * 0.07, 0.3 + n * 0.05);                                     // the plain
        if (h > 0.004) _c.lerp(_c2.setRGB(oreB[0] * 0.9, oreB[1] * 0.9, oreB[2] * 0.9), clamp01((h - 0.004) / 0.008) * 0.55);   // spoil with ore in it
        const ac = access(x, z); if (ac < 0.022) _c.lerp(_c2.setRGB(0.4, 0.37, 0.34), smooth(0.022, 0.012, ac));
        return _c;
      }
      // the strata: bands by depth, wavy, ore rich and poor
      const band = (-h / D) * 9 + 0.2 * (fbm2(x * 8 + 5, z * 8, 2) - 0.5), bi = Math.floor(band), bf = band - bi;
      const cc = bi % 3 === 0 ? oreA : bi % 3 === 1 ? host : oreB, dk = (0.7 + n * 0.28 + (n2 - 0.5) * 0.14) * (0.8 + 0.2 * (1 + h / D));
      _c.setRGB(cc[0] * dk, cc[1] * dk, cc[2] * dk);
      if (bf < 0.08) _c.multiplyScalar(0.85);
      const u = (d - R0) / (R1 - R0), f = u * N - Math.floor(u * N);
      if (u > 0 && (f < 0.58 || f > 0.985)) _c.lerp(_c2.setRGB(0.82, 0.72, 0.6), f > 0.985 || f < 0.04 ? 0.55 : 0.3); else if (u > 0) _c.multiply(_c2.setRGB(ti ? 0.62 : 0.8, ti ? 0.68 : 0.56, ti ? 0.8 : 0.44));                                  // bench tops: dusty
      if (u <= 0) _c.lerp(_c2.setRGB(0.3, 0.28, 0.27), 0.45);                                            // the wet pit floor
      const [e] = road(x, z);
      if (e < 0.017) _c.lerp(_c2.setRGB(0.46 + n * 0.06, 0.42 + n * 0.05, 0.38), smooth(0.017, 0.012, e) * 0.9);   // the ramp
      const [bm] = bay(x, z);
      if (bm > 0.01) _c.lerp(_c2.setRGB(0.46 + n * 0.06, 0.42 + n * 0.05, 0.38), bm * 0.85);                  // its bays
      if (Math.abs(e - 0.0155) < 0.002 && bm < 0.3) _c.lerp(_c2.setRGB(0.78, 0.72, 0.6), 0.6);               // its edge berms
      return _c;
    };
    // the ground: the plain round the pit (a hex grid, holed), and the pit itself as a polar mesh whose rings follow the benches
    const pitR = R1 + 0.035, radii = [0, R0 * 0.5, R0 * 0.85];
    for (let b = 0; b < N; b++) for (const f of [0, 0.3, 0.6, 0.66, 0.72, 0.79, 0.86, 0.92, 0.97]) radii.push(R0 + (b + f) / N * (R1 - R0));
    radii.push(R1, R1 + 0.008, R1 + 0.018, R1 + 0.027, pitR);
    const outer = this.holed(this.ground(hf, cf, { sub: low ? 24 : 36 }), (x, z) => Math.hypot(x - cx, z - cz) < pitR - 0.014);
    // per-pixel detail (imGround): the bench faces rock with strata, drill half-barrels and joints; grit, pebbles and tyre tracks on the flats
    this.imGroundAttr(outer, (x, y, z, ny) => [smooth(0.93, 0.8, ny) * 0.6, access(x, z), 1, 0, 0]);
    this.groundMeshGeo(ctx, outer, { mat: this.imGround() });
    const pitG = this.imGroundAttr(this.polarGround(cx, cz, radii, low ? 72 : 150, hf, cf), (x, y, z, ny) => {
      const rk = smooth(0.94, 0.74, ny), [e] = road(x, z), [bm] = bay(x, z);
      return [rk, bm > 0.3 ? 1 : e, 1 - rk, Math.atan2(z - cz, x - cx) * Math.hypot(x - cx, z - cz), 0];
    });
    this.groundMeshGeo(ctx, pitG, { mat: this.imGround(true), frost: false });
    const K = new Kit(), M = this.minePieces(), steel = 0x5a6068;
    const at = (s, ds = 0.012) => { const [x, z, y] = roadAt(s), [x2, z2] = roadAt(Math.min(1, s + ds)); return [x, z, y, Math.atan2(z2 - z, x2 - x)]; };
    // haul trucks pulled over in the ramp's bays: loaded ones facing up, empties facing down
    for (const [s, up] of parked) {
      const [x0, z0, , a] = at(s), x = x0 - Math.sin(a) * BAYW, z = z0 + Math.cos(a) * BAYW;             // (outward: the moving truck keeps to the inner lane)
      this.haulTruck(K, x, z, a + (up ? Math.PI : 0), hf(x, z) - 0.001, up ? oreHex : null);
    }
    // the water truck, damping the ramp from its bay
    const [wx0, wz0, , wa] = at(waterS), wx = wx0 - Math.sin(wa) * BAYW, wz = wz0 + Math.cos(wa) * BAYW;
    this.haulTruck(K, wx, wz, wa, hf(wx, wz) - 0.001, null, { tank: true, body: 0xd8dcdc });
    // the electric rope shovel at the face on the pit floor, a truck beside it being loaded
    const shA = th0 - turns * TAU + 0.5, sx = cx - Math.cos(shA) * 0.03, sz = cz - Math.sin(shA) * 0.03, sy0 = -D;
    { const P = this.mineFrame(K, sx, sz, shA, sy0, 1.35);            // facing out, at the face
      for (const lz of [-0.017, 0.017]) P('matte', M.track, 0x34363a, 0, 0.008, lz, [0.042, 0.016, 0.012]);
      P('std', BOX, 0x44474c, 0, 0.012, 0, [0.036, 0.01, 0.028]);
      P('std', BOX, 0xeaa21c, -0.006, 0.019, 0, [0.05, 0.026, 0.032]); P('std', BOX, 0xf2f0ea, -0.006, 0.033, 0, [0.046, 0.003, 0.03]);                                        // the house
      P('std', BOX, 0xc8302a, -0.006, 0.026, 0, [0.0505, 0.004, 0.0325]);                                     // its red band
      P('std', BOX, 0x9a9690, -0.034, 0.02, 0, [0.012, 0.02, 0.03]);                                           // counterweight
      P('std', BOX, 0xece6d4, 0.02, 0.028, -0.011, [0.012, 0.014, 0.012]); P('glow', BOX, 0xbfe8ff, 0.0262, 0.031, -0.011, [0.0008, 0.006, 0.01]);   // cab
      for (const lz of [-0.009, 0.009]) P('metal', new THREE.CylinderGeometry(0.0022, 0.0022, 0.05, 8).translate(0, 0.025, 0), steel, -0.02, 0.032, lz, 1, [0, 0, 0.42]);   // the gantry
      P('metal', BOX, 0xe0b020, 0.05, 0.068, 0, [0.12, 0.007, 0.009], [0, 0, 0.8]);                            // the boom
      P('metal', smoothGeo(new THREE.TorusGeometry(0.008, 0.0025, 8, 20)), steel, 0.093, 0.111, 0);            // point sheave
      P('metal', BOX, 0x4a4d52, 0.052, 0.04, 0, [0.075, 0.0055, 0.0055], [0, 0, 0.12]);                       // dipper handle
      P('std', M.frustum, 0xe0b020, 0.09, 0.03, 0, [0.022, 0.024, 0.024], [0, 0, 0.3]);                        // the dipper
      for (let i = 0; i < 5; i++) P('metal', BOX, 0x8a8e94, 0.1, 0.018, -0.01 + i * 0.005, [0.008, 0.002, 0.002]);
      for (const lz of [-0.004, 0.004]) { const g = new THREE.CylinderGeometry(0.0008, 0.0008, 1, 4).translate(0, 0.5, 0); P('metal', g, 0x222222, -0.001, 0.052, lz, [1, 0.105, 1], [0, 0, -1.02]); }   // hoist ropes
      P('glow', BOX, 0xfff4d8, 0.03, 0.04, 0.016, [0.004, 0.004, 0.004]);
    }
    { const tA = shA + 1.6, tx = cx + Math.cos(tA) * 0.045, tz = cz + Math.sin(tA) * 0.045; this.haulTruck(K, tx, tz, tA + Math.PI / 2, -D, oreHex, { quiet: true }); }
    // the sump: water pooled on the pit floor, away from the shovel
    { const a = shA - 1.35, x = cx + Math.cos(a) * 0.036, z = cz + Math.sin(a) * 0.036; K.add('water', new THREE.CircleGeometry(0.014, 20).rotateX(-Math.PI / 2), 0xffffff, [x, -D + 0.0012, z]); }
    // a drill rig on a bench out of the ramp's way, the blast pattern it is drilling laid out beside it: holes, primers, flags
    { const kb = 2, dC = R0 + (kb + 0.32) / N * (R1 - R0);
      let best = -1, ba = 0;
      for (let a = 0; a < TAU; a += 0.05) {
        let m = 9;
        for (let da = -0.34; da <= 0.16; da += 0.05) { const x = cx + Math.cos(a + da) * dC, z = cz + Math.sin(a + da) * dC; m = Math.min(m, road(x, z)[0] - 0.05 * bay(x, z)[0]); }
        if (m > best) { best = m; ba = a; }
      }
      if (best > 0.028) {
        const at2 = (a, dd = 0) => { const x = cx + Math.cos(a) * (dC + dd), z = cz + Math.sin(a) * (dC + dd); return [x, z, hf(x, z)]; };
        for (let i = 0; i < 5; i++) for (const dd of [-0.006, 0.006]) {
          const [x, z, y] = at2(ba - 0.3 + i * 0.045 + (dd > 0 ? 0.022 : 0), dd);
          K.add('matte', new THREE.CircleGeometry(0.0021, 10).rotateX(-Math.PI / 2), 0x1a1410, [x, y + 0.0006, z]);
          if ((i + (dd > 0 ? 1 : 0)) % 2 === 0) K.cyl('std', 0xff6a1a, x + 0.003, y, z, 0.0008, 0.0008, 0.004, 4);
        }
        for (const a of [ba - 0.34, ba - 0.08]) { const [x, z, y] = at2(a, -0.011); K.cyl('std', 0xf2f2ee, x, y, z, 0.0009, 0.0009, 0.016, 4); K.box('std', 0xff5a1a, x + 0.002, y + 0.012, z, 0.004, 0.003, 0.0006); }
        const [x, z, y] = at2(ba + 0.07), P = this.mineFrame(K, x, z, ba + Math.PI / 2, y);
        for (const lz of [-0.0075, 0.0075]) P('matte', M.track, 0x34363a, 0, 0.004, lz, [0.024, 0.008, 0.006]);
        P('std', BOX, 0xe8b020, -0.002, 0.008, 0, [0.022, 0.009, 0.016]); P('std', BOX, 0xece6d4, -0.008, 0.017, 0.004, [0.008, 0.009, 0.008]);
        P('glow', BOX, 0xbfe8ff, -0.0038, 0.0195, 0.004, [0.0006, 0.004, 0.006]);
        P('metal', BOX, 0xe0b020, 0.009, 0.034, 0, [0.004, 0.052, 0.005]); P('metal', BOX, 0x3a3a3a, 0.0118, 0.03, 0, [0.0014, 0.046, 0.0014]);
        P('blinkA', BALL, 0xffffff, -0.008, 0.023, 0.004, 0.0022);
      }
    }
    // ore scattered at the face
    for (let i = 0; i < 5; i++) { const a = shA + (r() - 0.5) * 1.2, d = 0.05 + r() * 0.012; K.add('matte', BALL, oreHex, [cx + Math.cos(a) * d, -D + 0.002, cz + Math.sin(a) * d], [r(), r(), r()], [0.008 + r() * 0.005, 0.005, 0.007]); }
    // the crusher at the head of the access road: a dump pocket, the crusher house, a hopper
    { const P = this.mineFrame(K, crusher[0], crusher[1], 0.35, 0);
      P('std', BOX, 0x9a9a92, 0, 0, 0, [0.07, 0.05, 0.06]); P('std', BOX, 0x7a7a74, 0, 0.05, 0, [0.07, 0.004, 0.06]);
      P('std', M.frustum, 0x6a6e74, -0.03, 0.05, 0.0, [0.04, 0.03, 0.05], [Math.PI, 0, 0]);
      P('std', BOX, 0xd8b020, -0.052, 0.012, 0, [0.02, 0.024, 0.056]);                                         // the dump wall
      P('glow', BOX, 0xffe0a0, 0.0355, 0.03, -0.015, [0.001, 0.008, 0.02]);
      P('blinkA', BALL, 0xffffff, 0.02, 0.058, 0.02, 0.004);
    }
    // conveyors on trestles: crusher -> mill, mill -> the stacker over the stockpile
    const conveyor = (a, b, y0, y1) => {
      const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz), ang = Math.atan2(dz, dx), tilt = Math.atan2(y1 - y0, L), Ls = Math.hypot(L, y1 - y0);
      const P = this.mineFrame(K, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, ang, (y0 + y1) / 2);
      P('metal', BOX, 0x6a7078, 0, 0, 0, [Ls, 0.005, 0.014], [0, 0, tilt]);
      K.add(this.imBelt(), this.imBeltGeo([a[0], y0 + 0.0042, a[1]], [b[0], y1 + 0.0042, b[1]], 0.008), oreHex);   // the belt, ore riding it (imBelt)
      for (const lz of [-0.0075, 0.0075]) P('metal', BOX, 0x9aa0a8, 0, 0.004, lz, [Ls, 0.004, 0.0015], [0, 0, tilt]);      // side rails
      const n = Math.max(2, Math.round(L / 0.06));
      for (let i = 0; i <= n; i++) { const t = i / n, h = y0 + (y1 - y0) * t; K.cyl('metal', 0x50545a, a[0] + dx * t, 0, a[1] + dz * t, 0.0028, 0.0028, Math.max(0.004, h - 0.003), 6); }
    };
    const mill = [0.06, 0.33], stack = [0.345, -0.03];
    conveyor([crusher[0] + 0.03, crusher[1] + 0.012], [mill[0] - 0.05, mill[1] - 0.005], 0.03, 0.075);
    conveyor([mill[0] + 0.04, mill[1] - 0.03], [stack[0] - 0.04, stack[1] + 0.06], 0.05, 0.1);
    // the processing plant: a gabled mill hall with a tall concentrator, silos, two thickeners
    { const P = this.mineFrame(K, mill[0], mill[1], -0.12, 0);
      P('std', BOX, 0x8e9aa8, 0, 0, 0, [0.11, 0.05, 0.06]); P('std', M.roof, 0x6a7888, 0, 0.05, 0, [0.112, 0.022, 0.062]);
      P('std', BOX, 0xa8b0b8, -0.035, 0, -0.005, [0.04, 0.095, 0.045]); P('std', BOX, 0x6a7888, -0.035, 0.095, -0.005, [0.042, 0.004, 0.047]);
      for (let i = 0; i < 3; i++) P('glow', BOX, 0xffe2a8, 0.0 + i * 0.022, 0.028, 0.0305, [0.014, 0.006, 0.001]);
      P('glow', BOX, 0xffe2a8, -0.035, 0.07, 0.018, [0.026, 0.005, 0.001]);
      P('metal', new THREE.CylinderGeometry(0.004, 0.005, 0.05, 10).translate(0, 0.025, 0), 0x8a8e94, -0.045, 0.095, -0.015);
    }
    for (const [x, z] of [[0.16, 0.31], [0.19, 0.27]]) K.add('std', lathe([[0.001, 0], [0.022, 0], [0.022, 0.07], [0.012, 0.084], [0.001, 0.086]], 24), (X, Yy) => _c.setRGB(0.86, 0.86, 0.84).multiplyScalar(0.8 + Yy * 2.2), [x, 0, z]);
    for (const [x, z, rr] of [[-0.075, 0.4, 0.036], [0.0, 0.43, 0.026]]) {
      if (this.edgeDist(x, z) < rr + 0.005) continue;
      K.add('std', lathe([[0.001, 0], [rr, 0], [rr, 0.016], [rr * 0.94, 0.016], [rr * 0.94, 0.012], [0.001, 0.012]], 32), 0xb8b4ac, [x, 0, z]);
      K.add('water', new THREE.CircleGeometry(rr * 0.93, 32).rotateX(-Math.PI / 2), 0xffffff, [x, 0.013, z]);
      K.box('metal', 0x6a7078, x, 0.016, z, rr * 2, 0.003, 0.004, 0.4);
      K.cyl('metal', 0x8a8e94, x, 0.012, z, 0.004, 0.004, 0.008, 10);
    }
    // the stockpile under a radial stacker
    this.imKind(K, 5, () => K.add(this.imSurf('matte'), M.heap, (X, Yy) => _c.set(oreHex).multiplyScalar(0.8 + Yy * 5), [stack[0] - 0.01, 0, stack[1] - 0.005], [0, r() * 6, 0], [0.13, 0.13, 0.12]));
    { const P = this.mineFrame(K, stack[0] - 0.035, stack[1] + 0.055, -1.2, 0.1);
      P('metal', BOX, 0xe0b020, 0.03, -0.004, 0, [0.07, 0.005, 0.01], [0, 0, -0.35]);
      K.cyl('metal', 0x50545a, stack[0] - 0.035, 0, stack[1] + 0.055, 0.004, 0.004, 0.1, 8);
      if (!low) { const tx = stack[0] - 0.035 + Math.cos(-1.2) * 0.063, tz = stack[1] + 0.055 + Math.sin(-1.2) * 0.063;   // ore pouring off the boom's tip
        for (const ry of [0, Math.PI / 2]) K.add(this.imBelt(), this.imBeltGeo([0, 0.083, 0], [0, 0.058, 0], 0.005).rotateY(ry).translate(tx, 0, tz), oreHex); } }
    // run-of-mine stockpiles by the crusher, graded
    for (const [x, z, sc, col] of [[-0.12, 0.29, 0.055, oreHex], [-0.055, 0.275, 0.045, ti ? 0x6a6a70 : 0x7a5a44]]) {
      if (this.edgeDist(x, z) < sc || Math.hypot(x - cx, z - cz) < pitR + 0.02) continue;
      this.imKind(K, 5, () => K.add(this.imSurf('matte'), M.heap, (X, Yy) => _c.set(col).multiplyScalar(0.78 + Yy * 9), [x, hf(x, z) - 0.002, z], [0, r() * 6, 0], [sc, sc * 0.7, sc]));
    }
    // floodlight masts on the rim, their beams into the pit
    const Kb = new Kit();
    for (const a of [0.5, 3.5, 5.3]) {
      const x = cx + Math.cos(a) * (R1 + 0.035), z = cz + Math.sin(a) * (R1 + 0.035);
      if (this.edgeDist(x, z) < 0.025 || this.env.inClearing(x, z, 0.02) || access(x, z) < 0.04) continue;
      const y0 = hf(x, z), top = y0 + 0.15;
      K.cyl('metal', 0x7a8088, x, y0, z, 0.0035, 0.0025, 0.15, 8);
      const P = this.mineFrame(K, x, z, a + Math.PI, top);
      P('metal', BOX, 0x4a4e54, 0, 0, 0, [0.006, 0.014, 0.03]);
      for (const lz of [-0.009, 0, 0.009]) P('glow', BOX, 0xfff6e0, 0.0035, 0, lz, [0.002, 0.009, 0.007]);
      if (!low) {
        const tgt = new V3(cx - x, -D * 0.6 - top, cz - z), len = tgt.length() * 0.95, q = new THREE.Quaternion().setFromUnitVectors(new V3(0, -1, 0), tgt.normalize()), e = new THREE.Euler().setFromQuaternion(q);
        Kb.add('beam', new THREE.ConeGeometry(0.035, len, 20, 1, true).translate(0, -len / 2, 0), (X, Yy, Z) => _c.setRGB(1, 0.95, 0.82).multiplyScalar(0.12 * Math.pow(clamp01(1 - Math.hypot(X - x, Yy - top, Z - z) / len), 1.4)), [x, top, z], [e.x, e.y, e.z]);
      }
    }
    // a site office and fuel tanks by the crusher
    K.box('std', 0xe8e4d8, -0.33, 0, 0.14, 0.05, 0.022, 0.028, 0.6); K.box('glow', 0xbfe4ff, -0.33, 0.01, 0.14, 0.052, 0.005, 0.02, 0.6);
    K.add('std', capsuleX(0.009, 0.03, 14), 0xd8d8d0, [-0.38, 0.011, 0.03], [0, 1.1, 0], 1, { smooth: true });
    this.imEmit(K, ctx);
    if (Kb.by.size) for (const m of this.emit(Kb, ctx, { shadow: false })) m.renderOrder = 7;
    // one truck driving the ramp (separate: down empty, loaded back up)
    if (!low) {
      const tk = new Kit(); this.haulTruck(tk, 0, 0, 0, 0, oreHex);
      const g = new THREE.Group();
      for (const [key, list] of tk.by) { const m = new THREE.Mesh(mergeGeometries(list), this.mat(key)); m.castShadow = key !== 'glow' && key !== 'blinkA'; g.add(m); }
      this.place(g, ctx, exitP[0], exitP[1], 0);
      this.imDustTrail(ctx, g, -0.032, 0.006, 0, [...(ti ? [0.62, 0.64, 0.67] : [0.74, 0.54, 0.38]), 0.34], 10);   // dust kicked up behind it
      const n = 48, pts = [], qs = [];
      for (let i = 0; i <= n; i++) {
        const s = i / n, [x0, z0, , a] = at(Math.min(s, 0.985)), x = x0 + Math.sin(a) * 0.0085, z = z0 - Math.cos(a) * 0.0085, { p, q } = this.b.frameAt(ctx.cell, x, z, ctx.H + (hf(x, z) - 0.001) * k, true);
        pts.push(p.sub(ctx.cell.center)); qs.push(q.clone().multiply(_q.setFromAxisAngle(Y, -a)));
      }
      const flipQ = new THREE.Quaternion().setFromAxisAngle(Y, Math.PI), T = 34, ph = r();
      this.anim.push({ o: g, f: (tt) => {
        const c = ((tt / T) + ph) % 1, down = c < 0.5, s = down ? c * 2 : 2 - c * 2, e = s * s * (3 - 2 * s), fi = e * n, i0 = Math.min(n - 1, Math.floor(fi)), w = fi - i0;
        g.position.lerpVectors(pts[i0], pts[i0 + 1], w);
        g.quaternion.slerpQuaternions(qs[i0], qs[i0 + 1], w);
        if (!down) g.quaternion.multiply(flipQ);
      } });
    }
    // dust: the shovel and the face, the ramp behind the trucks, the crusher
    const dust = ti ? [0.62, 0.64, 0.67] : [0.74, 0.54, 0.38];
    this.puffs(ctx, [{ x: sx, z: sz, y: -D + 0.01, n: 7, life: 5, rise: 0.13, size: 0.1, col: [...dust, 0.32], drift: [0.08, -0.03], jit: 0.04 },
      ...(low ? [] : [0.16, 0.38, 0.6, 0.8].map((s) => { const [x, z, y] = roadAt(s); return { x, z, y: y + 0.004, n: 3, life: 3.5, rise: 0.05, size: 0.05, col: [...dust, 0.22], drift: [0.03, 0], jit: 0.02 }; })),
      { x: wx, z: wz, y: roadAt(waterS)[2] + 0.004, n: 4, life: 2.5, rise: 0.03, size: 0.04, col: [0.9, 0.93, 0.96, 0.35], drift: [0.02, 0.01], jit: 0.01 },
      { x: crusher[0], z: crusher[1], y: 0.06, n: 4, life: 4, rise: 0.1, size: 0.07, col: [...dust, 0.26], drift: [0.05, -0.03], jit: 0.02 }]);
    this.emblem(ctx, 'mining_area', 0.27, -0.3, 0.28, 0.28);
    this.pitPunch(ctx, cx, cz, R1 + 0.03);
  }
  // A pit deeper than the tile's lift goes below the planet's surface, which would hide it.
  // So: the planet is drawn first of all (renderOrder -2), then a disc over the pit mouth,
  // pushed to the far plane in its vertex shader, colour off, depth test "always" (-1): it resets
  // the depth there to "far"; everything else (this pit, its trucks, the neighbours) is
  // drawn after it and depth-tests as usual -- the pit shows through the planet's surface.
  pitPunch(ctx, x, z, rr) {
    const disc = new THREE.CircleGeometry(rr, 72).rotateX(-Math.PI / 2).translate(x, 0.0005, z);
    disc.deleteAttribute('uv'); disc.deleteAttribute('normal');
    this.drape(disc, ctx.cell, ctx.H);
    const m = new THREE.Mesh(disc, this.mats.punch ||= Object.assign(new THREE.ShaderMaterial({
      vertexShader: 'void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w * 0.99999; }',
      fragmentShader: 'void main(){ gl_FragColor = vec4(0.0); }',
      colorWrite: false, depthWrite: true, depthFunc: THREE.AlwaysDepth,       // (a disabled depth test would write no depth either)
    }), { userData: { shared: true } }));
    m.renderOrder = -1;
    if (this.b.planet && this.b.planet.renderOrder > -2) this.b.planet.renderOrder = -2;
    ctx.g.add(m);
    return m;
  }

  // Mining Rights: a staked claim being proved. A perimeter of survey stakes
  // strung with pennant lines; the main drilling rig on its gravel pad (a
  // braced lattice derrick, its drill turning and working up and down, the
  // doghouse, mud tank, pipe rack, generator and fuel tank) and a second
  // derrick; exploration trenches and test pits cut into the ore, which is
  // tinted by the space's bonus (steel: rusty brown, titanium: blue-grey), as
  // are the tailings; core-sample racks by a logging table; two short cart
  // tracks, each with its own ore cart shuttling between tunnel portals that
  // go down into the ground at either end; the prospector's hab with its
  // airlock, solar wings and dish, a six-wheeled buggy, a light tower; and a
  // tall claim beacon flying the owner's colour.
  miningRights(ctx) {
    const r = this.env.srand(ctx.space * 59 + 4), ti = this.oreOf(ctx.cell) === 'ti', k = this.kOf(ctx.cell), low = gfx.low, M = this.minePieces();
    ctx.wall(0x3a2c22);
    const seg = (x, z, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], t = clamp01(((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)); return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t); };
    const trenches = [[[-0.085, -0.085], [0.11, -0.05]], [[-0.075, -0.155], [0.12, -0.12]]], pits = [[-0.36, 0.12], [0.08, 0.18], [-0.02, -0.26]];
    const pads = [[-0.2, -0.19, 0.08, 0.075], [0.205, -0.155, 0.065, 0.06]];
    const trench = (x, z) => Math.min(...trenches.map(([a, b]) => seg(x, z, a, b)));
    const pit = (x, z) => Math.min(...pits.map(([px, pz]) => Math.hypot(x - px, z - pz)));
    const pad = (x, z) => pads.some(([px, pz, w, d]) => Math.abs(x - px) < w && Math.abs(z - pz) < d);
    // two short, separate cart tracks, each running between two tunnel portals: at each end the
    // rails drop down a walled cutting into a decline that goes on under the ground
    const tracks = [[[-0.235, -0.04], [-0.13, 0.14]], [[0.02, 0.06], [0.19, 0.11]]].map(([a, b]) => {
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]); return { a, b, L, ux: (b[0] - a[0]) / L, uz: (b[1] - a[1]) / L, ang: Math.atan2(b[1] - a[1], b[0] - a[0]) };
    });
    const Dp = 0.026, Lr = 0.068, q3 = (t) => t * t * (2 - t);                                   // the depth at the portals, the ramp's length
    const prof = (u, L) => u < 0 ? -Dp + u * Dp / Lr : u > L ? -Dp - (u - L) * Dp / Lr : u < Lr ? -Dp * q3(1 - u / Lr) : u > L - Lr ? -Dp * q3(1 - (L - u) / Lr) : 0;   // rail bed height along a track
    const uw = (tr, x, z) => { const dx = x - tr.a[0], dz = z - tr.a[1]; return [dx * tr.ux + dz * tr.uz, -dx * tr.uz + dz * tr.ux]; };
    const trkD = (x, z) => Math.min(...tracks.map((tr) => { const [u, w] = uw(tr, x, z); return Math.hypot(Math.abs(w), Math.max(0, -u, u - tr.L)); }));
    const cut = (x, z) => { for (const tr of tracks) { const [u, w] = uw(tr, x, z); if (u > -0.002 && u < tr.L + 0.002 && Math.abs(w) < 0.024) return [prof(u, tr.L) - 0.0005, smooth(0.024, 0.019, Math.abs(w)), Math.abs(w)]; } return null; };
    const cover = (x, z) => { let c = 0; for (const tr of tracks) { const [u, w] = uw(tr, x, z), d = u < 0 ? -u : u - tr.L; if (d > 0) c = Math.max(c, smooth(0.036, 0.018, Math.abs(w)) * smooth(0.07, 0.014, d)); } return c; };   // the ground banked over the tunnels
    const hf = (x, z) => {
      const t = trench(x, z), p = pit(x, z);
      const h = 0.0065 * cover(x, z) + 0.006 * (fbm2(x * 12 + 4, z * 12, 4) - 0.4) * smooth(0, 0.05, this.edgeDist(x, z)) * (pad(x, z) ? 0.2 : 1)
        - 0.016 * smooth(0.02, 0.009, t) + 0.006 * Math.exp(-(((t - 0.03) / 0.008) ** 2))       // the trenches, their spoil ridges
        - 0.012 * smooth(0.02, 0.01, p) + 0.004 * Math.exp(-(((p - 0.027) / 0.006) ** 2));
      const c = cut(x, z);
      return c ? h + (c[0] - h) * c[1] : h;                                                     // the track beds, graded, cut down at the ends
    };
    const oreA = ti ? [0.44, 0.54, 0.66] : [0.7, 0.34, 0.16], oreB = ti ? [0.62, 0.68, 0.76] : [0.8, 0.5, 0.28];
    const cf = (x, z) => {
      const n = fbm2(x * 26, z * 26, 4), grid = (Math.abs(((x + 0.5) * 10) % 1 - 0.5) < 0.025 || Math.abs(((z + 0.6) * 10) % 1 - 0.5) < 0.025) ? 0.92 : 1;
      _c.setRGB((0.62 + n * 0.12) * grid, (0.42 + n * 0.08) * grid, (0.3 + n * 0.05) * grid);
      if (pad(x, z)) _c.setRGB(0.56 + n * 0.1, 0.54 + n * 0.1, 0.5 + n * 0.1);                        // gravel drill pads
      const t = Math.min(trench(x, z), pit(x, z) - 0.006);
      if (t < 0.04) { const o = n > 0.5 ? oreA : oreB; _c.lerp(_c2.setRGB(o[0] * (0.72 + n * 0.3), o[1] * (0.72 + n * 0.3), o[2] * (0.72 + n * 0.3)), smooth(0.04, 0.016, t) * (t < 0.018 ? 1 : 0.75)); }   // ore showing in the cuts and their spoil
      const cb = cut(x, z);                                                                      // the cart tracks' beds, darker down in the cuttings
      if (cb && cb[2] < 0.02) _c.multiplyScalar(0.74 - 0.28 * smooth(0.002, 0.014, -cb[0]));
      return _c;
    };
    const gG = this.ground(hf, cf, { sub: low ? 26 : 50 });              // per-pixel detail (imGround): grit and pebbles, gravel pads, wind ripples in the sand, strata in the cuts
    this.imGroundAttr(gG, (x, y, z, ny) => { const t = Math.min(trench(x, z), pit(x, z) - 0.006), pd = pad(x, z); return [smooth(0.92, 0.72, ny) * 0.8, 1, pd ? 1 : 0.5, (x + z) * 0.7, pd || cut(x, z) || t < 0.035 ? 0 : smooth(0.02, 0.06, this.edgeDist(x, z))]; });
    this.groundMeshGeo(ctx, gG, { mat: this.imGround() });
    const K = new Kit(), org = 0xe86a1c, oreC = ti ? 0x8a9cb4 : 0xa8582a, oreC2 = ti ? 0x6a7c94 : 0x7a4428, steel = 0x8a9098;
    const A = new Kit(), AS = this.imAnimMat('std'), S = this.imSurf('std'), Mt = this.imSurf('metal');   // moving parts: on the GPU (A); Low: standing still in K
    const mv = (kind, pv, dir, sp, ph, amp, fn) => (low ? fn(K, 'metal') : this.imMove(A, kind, pv, dir, sp, ph, amp, () => fn(A, AS)));
    const free = (x, z, pad2 = 0.02) => this.edgeDist(x, z) > 0.03 && !this.env.inClearing(x, z, pad2) && Math.hypot(x - 0.02, z - 0.24) > 0.12;
    // ---- claim perimeter: stakes on an inner hexagon, pennant lines between them
    const RS = this.HEX_R * 0.8, stakes = [];
    for (let i = 0; i < 6; i++) { const [x, z] = hexCorner(i, RS); stakes.push([x, z]); }
    const tri = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([-0.006, 0, 0, 0.006, 0, 0, 0, -0.012, 0], 3)); tri.computeVertexNormals();
    stakes.forEach(([x, z], i) => {
      K.cyl('std', 0xf2f2ee, x, hf(x, z), z, 0.0028, 0.0028, 0.062, 8);
      K.add('std', M.frustum, 0xff5a1a, [x, hf(x, z) + 0.058, z], [0, 0, 0], [0.008, 0.012, 0.008]);
      const [x2, z2] = stakes[(i + 1) % 6];
      if (this.env.inClearing((x + x2) / 2, (z + z2) / 2, 0.0) || (i === 2 || i === 3) && Math.hypot((x + x2) / 2 - 0.02, (z + z2) / 2 - 0.24) < 0.2) return;   // keep the marker's side open
      const L = Math.hypot(x2 - x, z2 - z), ang = -Math.atan2(z2 - z, x2 - x);
      K.add('std', new THREE.CylinderGeometry(0.0009, 0.0009, L, 4).rotateZ(Math.PI / 2), 0xe8e0d0, [(x + x2) / 2, 0.052, (z + z2) / 2], [0, ang, 0]);
      for (let j = 1; j < 9; j++) {
        const t = j / 9, px = x + (x2 - x) * t, pz = z + (z2 - z) * t, sag = 0.052 - 0.008 * Math.sin(Math.PI * t);
        K.add('std2', tri, j % 2 ? 0xff7a2a : 0xf4f0e6, [px, sag, pz], [0, ang, 0]);
      }
    });
    // ---- the derricks: four legs, girts at every level, X-bracing on every face
    const derrick = (x, z, h, main) => {
      const b = 0.045, t = 0.012, y = hf(x, z), lv = main ? 7 : 6;
      const corner = (i, sx, sz) => { const s = b - (b - t) * i / lv; return [x + sx * s, y + h * i / lv, z + sz * s]; };
      const C4 = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      for (const [sx, sz] of C4) this.strut(K, 'metal', org, corner(0, sx, sz), corner(lv, sx, sz), 0.0038, 8);
      for (let i = 1; i <= lv; i++) for (let f = 0; f < 4; f++) {
        const [ax, az] = C4[f], [bx2, bz2] = C4[(f + 1) % 4];
        this.strut(K, 'metal', org, corner(i, ax, az), corner(i, bx2, bz2), 0.0018, 5);                        // girt
        if (!low) { this.strut(K, 'metal', org, corner(i - 1, ax, az), corner(i, bx2, bz2), 0.0012, 4); this.strut(K, 'metal', org, corner(i - 1, bx2, bz2), corner(i, ax, az), 0.0012, 4); }   // the X
      }
      K.box('metal', 0xd8d8d8, x, y + h, z, 0.032, 0.014, 0.032);                                           // crown block
      K.add('metal', smoothGeo(new THREE.TorusGeometry(0.009, 0.0022, 8, 20)), 0x3a3a3a, [x, y + h + 0.016, z], [0, 0.4, 0]);
      K.add('blink', BALL, 0xffffff, [x, y + h + 0.03, z], [0, 0, 0], 0.006);
      K.box('metal', 0x5a5e66, x, y, z, 0.1, 0.012, 0.1);                                                  // the substructure / drill floor
      K.box('metal', 0x8a8e96, x, y + 0.012, z, 0.104, 0.002, 0.104);
      for (const [sx, sz] of C4) K.cyl('metal', 0xf2c21c, x + sx * 0.05, y + 0.014, z + sz * 0.05, 0.0012, 0.0012, 0.018, 4);   // handrail posts
      // the doghouse: a small cabin with a lit window, beside the floor
      K.box('std', 0xd8d4c8, x + 0.075, y, z + 0.02, 0.045, 0.034, 0.036); K.box('std', 0x8a8e94, x + 0.075, y + 0.034, z + 0.02, 0.048, 0.004, 0.04);
      K.box('glow', 0xffd890, x + 0.075, y + 0.02, z + 0.0385, 0.03, 0.008, 0.002);
      if (main) {
        K.add('std', lathe([[0.001, 0], [0.024, 0], [0.024, 0.03], [0.02, 0.034], [0.001, 0.034]], 24), 0x6a7078, [x - 0.1, y, z - 0.03]);   // mud tank
        K.add('water', new THREE.CircleGeometry(0.021, 20).rotateX(-Math.PI / 2), 0xffffff, [x - 0.1, y + 0.0345, z - 0.03]);
        for (let i = 0; i < 6; i++) K.add('metal', new THREE.CylinderGeometry(0.003, 0.003, 0.1, 10).rotateZ(Math.PI / 2), 0x8a8e96, [x + 0.01, y + 0.005 + (i % 2) * 0.005, z + 0.085 + Math.floor(i / 2) * 0.007]);   // pipe rack
        for (const d of [-0.04, 0.06]) K.box('metal', 0x5a4a3a, x + 0.01 + d, y, z + 0.092, 0.006, 0.006, 0.03);
        K.box('std', 0x3c7a4a, x - 0.1, y, z + 0.045, 0.05, 0.026, 0.028); K.box('metal', 0x4a4e54, x - 0.1, y + 0.026, z + 0.045, 0.02, 0.006, 0.02);   // generator
        K.add('std', capsuleX(0.011, 0.035, 18), 0xe8e4d8, [x - 0.02, y + 0.014, z - 0.1], [0, 0.15, 0], 1, { smooth: true });            // fuel tank
        for (const d of [-0.018, 0.018]) K.box('std', 0x5a5e66, x - 0.02 + d, y, z - 0.1, 0.006, 0.006, 0.02, 0.15);
      }
      // the drill string + top drive: turning, and working slowly up and down
      const dk = new Kit();
      dk.cyl('metal', 0x2e3136, 0, 0, 0, 0.004, 0.004, h * 0.82, 10);
      dk.cyl('metal', 0xd0a040, 0, h * 0.6, 0, 0.011, 0.011, 0.018, 16);
      dk.box('metal', 0x3a3a3a, 0, h * 0.62, 0, 0.032, 0.006, 0.004);
      const g = new THREE.Group();
      for (const [key, list] of dk.by) { const m = new THREE.Mesh(mergeGeometries(list), this.mat(key)); m.castShadow = true; g.add(m); }
      this.place(g, ctx, x, z, y);
      const p0 = g.position.clone(), up = ctx.cell.up, ph = r() * 6;
      this.anim.push({ o: g, f: (tt) => { g.quaternion.copy(g.userData.q0).multiply(_q.setFromAxisAngle(Y, tt * (main ? 3 : 2))); g.position.copy(p0).addScaledVector(up, -0.018 * k * (0.5 + 0.5 * Math.sin(tt * 0.9 + ph))); } });
      this.puffs(ctx, [{ x, z, y: 0.02, n: 4, life: 4, rise: 0.1, size: 0.07, col: [0.7, 0.55, 0.42, 0.3], drift: [0.06, 0], jit: 0.05 }]);
    };
    derrick(-0.2, -0.19, 0.3, true);
    // ---- the exploration shaft: a steel headframe over its collar, backstays toward the hoist house, two sheave
    // wheels turning as the skips wind up and down between the legs (in step: the GPU), the tipple's chute to an
    // ore bin on legs, ore heaped under it
    { const x0 = 0.205, z0 = -0.155, y0 = hf(x0, z0), H = 0.165, stl = 0x5a6a7a, SR = 0.016, zs = z0 - SR * 0.5, TR = 0.108, sp = 0.32, ph = r() * 6;
      this.imKind(K, 2, () => K.box(S, 0xa8a298, x0, y0 - 0.002, z0, 0.056, 0.008, 0.056));
      K.box('matte', 0x0c0a09, x0, y0 + 0.0061, z0, 0.03, 0.001, 0.03);
      const lg = (i, sx, sz) => { const t = i / 4, w = 0.021 - 0.009 * t; return [x0 + sx * w, y0 + 0.006 + (H - 0.006) * t, z0 + sz * w]; };
      const C4 = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      for (const [sx, sz] of C4) this.strut(K, 'metal', stl, lg(0, sx, sz), lg(4, sx, sz), 0.0026, 6);
      for (let i = 1; i <= 4; i++) for (let fc = 0; fc < 4; fc++) {
        const [ax, az] = C4[fc], [bx2, bz2] = C4[(fc + 1) % 4];
        this.strut(K, 'metal', stl, lg(i, ax, az), lg(i, bx2, bz2), 0.0013, 4);
        if (!low && i < 4) this.strut(K, 'metal', stl, lg(i - 1, ax, az), lg(i, bx2, bz2), 0.0009, 4);
      }
      for (const sx of [-1, 1]) this.strut(K, 'metal', stl, [x0 + sx * 0.02, y0, z0 - 0.1], [x0 + sx * 0.012, y0 + H, z0 - 0.012], 0.0024, 6);   // the backstays
      if (!low) for (const sx of [-1, 1]) this.strut(K, 'metal', stl, [x0 + sx * 0.02, y0 + 0.05, z0 - 0.07], [x0 + sx * 0.02, y0 + 0.05, z0 - 0.02], 0.0011, 4);
      K.box('metal', 0x3a3e44, x0, y0 + H, z0 - 0.005, 0.05, 0.004, 0.04);                                     // the sheave deck
      for (const sx of [-1, 1]) K.box('metal', 0x3a3e44, x0 + sx * 0.023, y0 + H + 0.004, z0 - 0.005, 0.002, 0.008, 0.04);
      K.add('blink', BALL, 0xffffff, [x0 + 0.024, y0 + H + 0.012, z0 + 0.012], [0, 0, 0], 0.0035);
      K.box('glow', 0xfff0c8, x0, y0 + H - 0.002, z0 + 0.0152, 0.008, 0.002, 0.001);
      for (const [dx, sg] of [[-0.009, 1], [0.009, -1]]) {
        const cy = y0 + H + 0.004 + SR;
        mv(3, [x0 + dx, cy, zs], [1, 0, 0], sp, ph, sg * TR / SR, (Kt, key) => {                                  // a sheave wheel: rim, spokes, hub
          Kt.add(key, smoothGeo(new THREE.TorusGeometry(SR, 0.0019, 6, 28)).rotateY(Math.PI / 2), 0xc8ccd2, [x0 + dx, cy, zs]);
          for (let k2 = 0; k2 < 3; k2++) Kt.add(key, BOX, 0x8a9098, [x0 + dx, cy, zs], [k2 * Math.PI / 3, 0, 0], [0.0012, 2 * SR, 0.0014]);
          Kt.add(key, new THREE.CylinderGeometry(0.0032, 0.0032, 0.005, 10).rotateZ(Math.PI / 2), 0x3a3e44, [x0 + dx, cy, zs]);
        });
        for (const s2 of [-1, 1]) K.box('metal', 0x2a2c30, x0 + dx + s2 * 0.004, y0 + H + 0.004, zs, 0.0015, SR, 0.004);   // its bearings
        K.cyl('metal', 0x1a1a1a, x0 + dx, y0 + 0.012, zs + SR, 0.0005, 0.0005, H - 0.008 + SR, 4);                      // the guide rope, collar to sheave
        this.strut(K, 'metal', 0x1a1a1a, [x0 + dx, cy + SR * 0.7, zs - SR * 0.7], [x0 + dx * 0.6, y0 + 0.026, z0 - 0.107], 0.0005, 4);   // the hoist rope to the drum
        mv(0, [0, 0, 0], [0, sg * TR, 0], sp, ph, 0, (Kt, key) => {                                                // a skip, riding its rope
          const yb = sg > 0 ? y0 + 0.012 : y0 + 0.012 + TR;
          Kt.add(key, BOX, 0x8a5a3a, [x0 + dx, yb + 0.008, zs + SR], [0, 0, 0], [0.009, 0.016, 0.009]);
          Kt.add(key, BOX, 0x3a3e44, [x0 + dx, yb + 0.0165, zs + SR], [0, 0, 0], [0.01, 0.002, 0.01]);
        });
      }
      // the hoist house: clad, a lit window and door, its roof vent
      const hx = x0, hz = z0 - 0.125;
      this.imKind(K, 0, () => { K.box(S, 0xc8c2b4, hx, y0, hz, 0.056, 0.034, 0.038); K.add(S, M.roof, 0x6a7078, [hx, y0 + 0.034, hz], [0, 0, 0], [0.058, 0.02, 0.04]); });
      K.box('glow', 0xffd890, hx - 0.012, y0 + 0.018, hz + 0.0192, 0.014, 0.008, 0.001); K.box('std', 0x4a4e54, hx + 0.014, y0, hz + 0.0192, 0.01, 0.02, 0.001);
      K.add('std', new THREE.CylinderGeometry(0.008, 0.008, 0.03, 14).rotateZ(Math.PI / 2), 0x3a3e44, [hx, y0 + 0.026, hz + 0.022]);   // the drum, at the wall
      K.cyl('metal', 0x6a6e76, hx + 0.02, y0 + 0.04, hz - 0.008, 0.003, 0.003, 0.02, 8);
      // the tipple chute and the ore bin on its legs, ore heaped below it
      const bx0 = x0 + 0.062, bz0 = z0 + 0.012;
      this.imKind(K, 3, () => {
        K.box(Mt, 0x7a5a42, bx0, y0 + 0.034, bz0, 0.036, 0.026, 0.032);
        K.add(Mt, M.frustum, 0x6a4a36, [bx0, y0 + 0.028, bz0], [Math.PI, 0, 0], [0.036, 0.012, 0.032]);
        this.strut(K, Mt, 0x8a6a4a, [x0 + 0.012, y0 + H * 0.72, z0 + 0.006], [bx0 - 0.012, y0 + 0.052, bz0], 0.0022, 4);
      });
      for (const [sx, sz] of C4) K.cyl('metal', 0x4a4e54, bx0 + sx * 0.016, y0, bz0 + sz * 0.014, 0.0016, 0.0016, 0.034, 5);
      K.box('metal', 0x3a3e44, bx0, y0 + 0.02, bz0 + 0.01, 0.008, 0.004, 0.012);
      this.imKind(K, 5, () => K.add(this.imSurf('matte'), M.heap, (X, Yy) => _c.set(oreC).multiplyScalar(0.8 + Yy * 18), [bx0 + 0.002, y0, bz0 + 0.032], [0, 1, 0], [0.028, 0.022, 0.026]));
      this.puffs(ctx, [{ x: hx + 0.02, z: hz - 0.008, y: 0.065, n: 3, life: 3.5, rise: 0.06, size: 0.035, col: [0.88, 0.88, 0.9, 0.3], drift: [0.03, 0], jit: 0.004 }]);
    }
    // ---- core-sample racks and a logging table under an awning
    for (let rk = 0; rk < 2; rk++) {
      const x0 = -0.06 + rk * 0.1, z0 = -0.36;
      K.box('std', 0x5a4a3a, x0, 0, z0, 0.085, 0.004, 0.05);
      for (let i = 0; i < 5; i++) {
        K.box('std', 0x4a3c30, x0 - 0.034 + i * 0.017, 0.004, z0, 0.013, 0.006, 0.046);
        K.add('std', new THREE.CylinderGeometry(0.0045, 0.0045, 0.044, 10).rotateX(Math.PI / 2), i % 2 ? oreC : oreC2, [x0 - 0.034 + i * 0.017, 0.012, z0]);
      }
    }
    K.box('std', 0xc8c4bc, 0.1, 0.018, -0.29, 0.05, 0.004, 0.03); for (const [dx, dz] of [[-0.02, -0.012], [0.02, -0.012], [-0.02, 0.012], [0.02, 0.012]]) K.box('std', 0x6a6a6a, 0.1 + dx, 0, -0.29 + dz, 0.003, 0.018, 0.003);
    K.add('std', new THREE.CylinderGeometry(0.004, 0.004, 0.03, 10).rotateZ(Math.PI / 2), oreC, [0.1, 0.024, -0.29]);
    K.box('std2', 0x3a7ac0, 0.1, 0.045, -0.29, 0.07, 0.002, 0.05); for (const [dx, dz] of [[-0.033, -0.023], [0.033, -0.023], [-0.033, 0.023], [0.033, 0.023]]) K.cyl('metal', steel, 0.1 + dx, 0, -0.29 + dz, 0.0015, 0.0015, 0.045, 5);
    // ---- the trenches: shoring timbers across, a few ore lumps; stakes at their ends
    for (const [a, b] of trenches) {
      const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz), ang = -Math.atan2(dz, dx);
      for (let i = 1; i < 6; i++) { const t = i / 6, x = a[0] + dx * t, z = a[1] + dz * t; K.box('std', 0x6a5238, x, hf(x, z) + 0.009, z, 0.004, 0.003, 0.03, ang); }
      for (const p of [a, b]) { K.cyl('std', 0xf2f2ee, p[0], hf(p[0], p[1]), p[1], 0.002, 0.002, 0.03, 6); K.box('std', 0xff5a1a, p[0] + 0.004, hf(p[0], p[1]) + 0.024, p[1], 0.008, 0.006, 0.001); }
      for (let i = 0; i < 4; i++) { const t = r(), x = a[0] + dx * t, z = a[1] + dz * t; K.add('matte', BALL, i % 2 ? oreC : oreC2, [x, hf(x, z) + 0.002, z], [r(), r(), r()], [0.006, 0.004, 0.005]); }
      void L;
    }
    // ---- the cart tracks: rails on sleepers between two tunnel portals, the ends dropping down
    // walled cuttings to a concrete headwall with a timber set round the dark mouth
    const G = 0.007, RT = 0.0055;                                                                         // half gauge; rail top above the bed
    const voidG = (sg) => new THREE.BoxGeometry(0.047, 0.036, 0.026).applyMatrix4(new THREE.Matrix4().makeShear(sg * Dp / Lr, 0, 0, 0, 0, 0));   // (sheared: its face stays upright)
    for (const tr of tracks) {
      const P = this.mineFrame(K, tr.a[0], tr.a[1], tr.ang, 0), L = tr.L, y = (u) => prof(u, L);
      const us = [-0.004]; for (let i = 1; i <= 5; i++) us.push(Lr * i / 5); us.push(L - Lr); for (let i = 4; i >= 0; i--) us.push(L - Lr * i / 5); us.push(L + 0.004);
      for (let i = 0; i + 1 < us.length; i++) {                                                          // the rails, bent over the ramps
        const u0 = us[i], u1 = us[i + 1], y0 = y(u0), y1 = y(u1), len = Math.hypot(u1 - u0, y1 - y0), tilt = Math.atan2(y1 - y0, u1 - u0);
        for (const w of [-G, G]) P('metal', BOX, 0xaab0b8, (u0 + u1) / 2, (y0 + y1) / 2 + 0.0042, w, [len + 0.0008, 0.0026, 0.0022], [0, 0, tilt]);
      }
      const ns = Math.round(L / 0.012);
      for (let i = 0; i <= ns; i++) { const u = 0.004 + (L - 0.008) * i / ns, d = 0.002; P('std', BOX, 0x4a3a2c, u, y(u) + 0.0015, 0, [0.005, 0.003, 0.024], [0, 0, Math.atan2(y(u + d) - y(u - d), 2 * d)]); }
      for (const end of [0, 1]) {                                                                        // each end: a cutting and a portal
        const sg = end ? -1 : 1, u0 = end ? L : 0, U = (du) => u0 + sg * du;                          // du: distance from the portal toward the track's middle
        for (let i = 0; i < 4; i++) {                                                                    // the cutting's retaining walls
          const a = Lr * i / 4, b = Lr * (i + 1) / 4, lo = Math.min(y(U(a)), y(U(b))) - 0.002;
          for (const w of [-0.02, 0.02]) P('std', BOX, 0xa29c90, U((a + b) / 2), (lo + 0.0035) / 2, w, [b - a + 0.0005, 0.0035 - lo, 0.004]);
        }
        const yb = y(u0), top = 0.008, mt = yb + 0.024;                                                // the bed at the portal, the headwall's top, the mouth's top
        for (const w of [-0.0225, 0.0225]) P('std', BOX, 0xa8a298, U(-0.003), (yb - 0.003 + top) / 2, w, [0.006, top - yb + 0.003, 0.019]);   // the headwall: piers
        P('std', BOX, 0xa8a298, U(-0.003), (mt + top) / 2, 0, [0.006, top - mt, 0.026]);                   // and over the mouth
        P('std', BOX, 0x8e897e, U(-0.003), top + 0.0008, 0, [0.008, 0.0016, 0.066]);                       // its coping
        for (const w of [-0.0115, 0.0115]) P('std', BOX, 0x6a5238, U(0.0005), (yb + mt) / 2, w, [0.0035, mt - yb, 0.003]);   // the timber set: legs
        P('std', BOX, 0x5a4430, U(0.0005), mt - 0.0012, 0, [0.004, 0.0034, 0.029]);                        // its cap
        P('matte', voidG(sg), 0x050404, U(-0.024), (yb - 0.012 + mt) / 2 - Dp / Lr * 0.0235, 0);          // the dark, going on down: the carts vanish into it
        P('glow', BOX, 0xffc860, U(0.0003), top - 0.0025, 0, [0.001, 0.0025, 0.006]);                      // a lamp over the mouth
      }
    }
    // tailings: smooth, lumpy heaps in the bonus colour at the track's end and round the claim
    const heap = lathe([[0.06, 0], [0.052, 0.012], [0.04, 0.026], [0.024, 0.038], [0.01, 0.045], [0.001, 0.047]], 32);
    for (const [x, z, s] of [[0.26, 0.02, 1.1], [0.3, 0.1, 0.8], [0.2, -0.03, 0.6], [-0.34, 0.03, 0.9], [-0.32, -0.08, 0.6]]) {
      if (!free(x, z, 0.0)) continue;
      this.imKind(K, 5, () => K.add(this.imSurf('matte'), heap, (X, Yy, Z) => _c.set(Yy > 0.02 ? oreC : oreC2).multiplyScalar(0.78 + Yy * 5 + 0.14 * (fbm2(X * 60, Z * 60, 2) - 0.5)), [x, hf(x, z), z], [0, r() * 6, 0], s));
    }
    // the carts: one small tub to each track (separate, animated), shuttling from one tunnel to the
    // other -- it climbs out of a portal, runs the track, dips down into the far one and is gone a
    // moment underground, then comes back the other way
    const ZZ = new V3(0, 0, 1), EXT = 0.036;
    tracks.forEach((tr, c) => {
      const ck = new Kit();
      this.mineCart(this.mineFrame(ck, 0, 0, 0, 0), G, oreC, oreC2);
      const g = new THREE.Group();
      for (const [key, list] of ck.by) { const m = new THREE.Mesh(mergeGeometries(list), this.mat(key)); m.castShadow = true; g.add(m); }
      this.place(g, ctx, tr.a[0], tr.a[1], 0);
      const L = tr.L, n = 40, pts = [], qs = [], u0 = -EXT, uL = L + 2 * EXT;
      for (let i = 0; i <= n; i++) {
        const u = u0 + uL * i / n, x = tr.a[0] + tr.ux * u, z = tr.a[1] + tr.uz * u, d = 0.002, pitch = Math.atan2(prof(u + d, L) - prof(u - d, L), 2 * d);
        const { p, q } = this.b.frameAt(ctx.cell, x, z, ctx.H + (prof(u, L) + RT) * k, true);
        pts.push(p.sub(ctx.cell.center)); qs.push(q.clone().multiply(_q.setFromAxisAngle(Y, -tr.ang)).multiply(_q.setFromAxisAngle(ZZ, pitch)));
      }
      const T = c ? 15 : 12, ph = (c * 0.55 + ctx.space * 0.137) % 1, vis = 0.0125;                                // (vis: past this beyond a portal it is wholly in the dark)
      this.anim.push({ o: g, f: (tt) => {
        const f = ((tt / T) + ph) % 1, e = f < 0.42 ? f / 0.42 : f < 0.5 ? 1 : f < 0.92 ? 1 - (f - 0.5) / 0.42 : 0, s = e * e * (3 - 2 * e), u = u0 + uL * s;
        g.visible = u > -vis && u < L + vis;
        if (!g.visible) return;
        const fi = s * n, i0 = Math.min(n - 1, Math.floor(fi)), w = fi - i0;
        g.position.lerpVectors(pts[i0], pts[i0 + 1], w);
        g.quaternion.slerpQuaternions(qs[i0], qs[i0 + 1], w);
      } });
    });
    // ---- the prospector's hab: a ribbed module with a window band, legs, airlock, solar wings, dish and mast
    { const P = this.mineFrame(K, -0.3, 0.25, -0.4, 0);
      P('std', capsuleX(0.03, 0.08, 24), 0xeeeee8, 0, 0.036, 0, 1, [0, 0, 0], { smooth: true });
      P('glow', new THREE.CylinderGeometry(0.0305, 0.0305, 0.01, 24, 1, true).rotateZ(Math.PI / 2), 0x9fe3ff, -0.012, 0.036, 0);
      for (const lx of [-0.04, 0.02, 0.04]) P('std', smoothGeo(new THREE.TorusGeometry(0.0306, 0.0018, 6, 28)).rotateY(Math.PI / 2), 0xb8bcc0, lx, 0.036, 0);
      for (const lx of [-0.035, 0.035]) for (const lz of [-0.02, 0.02]) P('metal', BOX, 0x7a8088, lx, 0.004, lz, [0.004, 0.012, 0.004]);
      P('std', new THREE.CylinderGeometry(0.016, 0.016, 0.03, 20).rotateX(Math.PI / 2), 0xc8ccd0, 0.02, 0.024, 0.042);                   // airlock
      P('glow', BOX, 0xffd890, 0.02, 0.024, 0.0575, [0.012, 0.014, 0.001]);
      for (const s of [-1, 1]) {                                                                               // two solar wings on a boom
        P('metal', BOX, steel, -0.01, 0.07, 0, [0.003, 0.003, 0.14]);
        for (let i = 0; i < 2; i++) { P('std2', BOX, 0x243a78, -0.01, 0.07, s * (0.04 + i * 0.03), [0.034, 0.0015, 0.026]); P('metal', BOX, 0xc8ccd0, -0.01, 0.0695, s * (0.04 + i * 0.03), [0.036, 0.001, 0.028]); }
      }
      P('metal', new THREE.CylinderGeometry(0.0025, 0.0025, 0.07, 8).translate(0, 0.035, 0), steel, -0.004, 0.036, 0);
      P('std2', dish(0.024, 0.01, 24), 0xe8e8e8, 0.05, 0.075, -0.01, 1, [0.5, 0, -0.6]);
      P('metal', new THREE.CylinderGeometry(0.0015, 0.0015, 0.1, 6).translate(0, 0.05, 0), steel, -0.05, 0.03, 0.01);
      P('blink', BALL, 0xffffff, -0.05, 0.132, 0.01, 0.004);
    }
    K.box('std', 0x6a5a48, -0.2, 0, 0.2, 0.03, 0.02, 0.02, 0.3); K.box('std', 0x8a7a58, -0.196, 0.02, 0.2, 0.02, 0.014, 0.018, 0.3);   // supply crates
    // ---- the buggy: a six-wheeled prospector's rover by the hab
    if (free(-0.17, 0.3, 0)) { const P = this.mineFrame(K, -0.17, 0.3, 0.5, hf(-0.17, 0.3));
      P('std', BOX, 0xe8e6e0, 0, 0.018, 0, [0.05, 0.012, 0.026]); P('std', BOX, 0xd05a20, 0.012, 0.028, 0, [0.02, 0.01, 0.022]); P('glow', BOX, 0x9fd8ff, 0.0225, 0.029, 0, [0.001, 0.006, 0.018]);
      P('metal', BOX, steel, -0.016, 0.03, 0, [0.014, 0.012, 0.02]);
      for (const lx of [-0.018, 0, 0.018]) for (const lz of [-0.016, 0.016]) { P('matte', M.tire, 0x2a2c30, lx, 0.0094, lz, 0.95); P('std', M.hub, 0xb8bcc0, lx, 0.0094, lz, [0.9, 0.9, 0.8]); } }
    // ---- a light tower
    { const lx = 0.33, lz = -0.2; if (free(lx, lz, 0)) { K.box('std', 0xe8c020, lx, 0.004, lz, 0.03, 0.014, 0.018); K.cyl('metal', steel, lx, 0.018, lz, 0.0025, 0.002, 0.12, 8);
      const P = this.mineFrame(K, lx, lz, 2.6, 0.14); P('metal', BOX, 0x4a4e54, 0, 0, 0, [0.006, 0.014, 0.03]); for (const d of [-0.008, 0.008]) P('glow', BOX, 0xfff6e0, 0.0035, 0, d, [0.002, 0.01, 0.012]); } }
    // ---- the claim beacon: a tall mast, a lamp turning at its top, the owner's pennant
    const bx = 0.34, bz = -0.02;
    K.cyl('metal', 0xb8bcc4, bx, hf(bx, bz), bz, 0.0035, 0.0025, 0.26, 10);
    K.add('std2', new THREE.PlaneGeometry(0.05, 0.028, 4, 1).translate(0.025, 0, 0), ctx.pc, [bx, 0.225, bz], [0, -0.5, 0], 1, { uv: false });
    const lamp = new THREE.Group(), lk = new Kit();
    lk.cyl('metal', 0x3a3a3a, 0, 0, 0, 0.008, 0.008, 0.01, 14);
    lk.box('glow', 0xffb030, 0.006, 0.004, 0, 0.004, 0.006, 0.01);
    lk.add('blink', BALL, 0xffffff, [0, 0.014, 0], [0, 0, 0], 0.0045);
    for (const [key, list] of lk.by) lamp.add(new THREE.Mesh(mergeGeometries(list), this.mat(key)));
    this.spin(this.place(lamp, ctx, bx, bz, 0.26), 2.4, r() * 6);
    // survey boreholes across the claim, each with its marker stake
    for (let i = 0; i < 9; i++) { const x = (r() - 0.5) * 0.7, z = (r() - 0.5) * 0.7; if (!free(x, z) || trench(x, z) < 0.04 || pad(x, z) || trkD(x, z) < 0.045) continue; K.add('std', new THREE.CircleGeometry(0.01, 16).rotateX(-Math.PI / 2), 0x1a1410, [x, hf(x, z) + 0.001, z]); K.cyl('std', 0xf2f2ee, x + 0.014, hf(x, z), z, 0.0018, 0.0018, 0.03, 6); K.box('std', 0xff5a1a, x + 0.0175, hf(x, z) + 0.026, z, 0.006, 0.005, 0.001); }
    // ---- the prospector's camp: a pressurised tent with its airlock, a work table with a flickering lamp and
    // sample trays, a windsock swinging on its mast (the GPU)
    { const tx = -0.27, tz = 0.1, ty = hf(tx, tz), ang = 0.35;
      if (free(tx, tz, 0.02) && trkD(tx, tz) > 0.07 && pit(tx, tz) > 0.07) {
        const P = this.mineFrame(K, tx, tz, ang, ty);
        P('std', new THREE.CylinderGeometry(0.018, 0.018, 0.05, 18, 1, false, 0, Math.PI).rotateZ(Math.PI / 2), 0xe8e2d4, 0, 0, 0);
        for (const lx of [-0.02, -0.007, 0.007, 0.02]) P('std', new THREE.TorusGeometry(0.0182, 0.0012, 4, 16, Math.PI).rotateY(Math.PI / 2), 0xe86a1c, lx, 0, 0);
        P('std', BOX, 0xc8ccd0, 0.031, 0.009, 0, [0.012, 0.018, 0.016]); P('glow', BOX, 0xffd890, 0.0372, 0.009, 0, [0.0006, 0.012, 0.008]);
        P('glow', BOX, 0xffe8b8, 0, 0.012, 0.0165, [0.02, 0.003, 0.0006], [0.4, 0, 0]);
        P('std', BOX, 0x8a7a58, -0.035, 0.005, 0.008, [0.012, 0.01, 0.01]);
        const P2 = this.mineFrame(K, tx + 0.045, tz + 0.03, ang, ty);                                          // the work table
        P2('std', BOX, 0xb8b4ac, 0, 0.012, 0, [0.024, 0.0018, 0.014]);
        for (const [lx, lz] of [[-0.01, -0.005], [0.01, -0.005], [-0.01, 0.005], [0.01, 0.005]]) P2('metal', BOX, 0x5a5e66, lx, 0.006, lz, [0.0012, 0.012, 0.0012]);
        for (let i = 0; i < 3; i++) P2('std', BOX, i % 2 ? oreC : oreC2, -0.006 + i * 0.005, 0.0138, 0.002, [0.004, 0.0018, 0.007]);
        P2('glow', BOX, 0xffb050, 0.008, 0.016, -0.003, [0.003, 0.005, 0.003]); P2('metal', BOX, 0x2a2a2a, 0.008, 0.0192, -0.003, [0.0036, 0.0012, 0.0036]);
        for (const lx of [-0.016, 0.016]) P2('std', BOX, 0x6a5a48, lx, 0.004, 0.011, [0.006, 0.008, 0.006]);
      }
      const wx = -0.23, wz = 0.33;
      if (free(wx, wz, 0)) {
        const wy = hf(wx, wz), top = wy + 0.07;
        K.cyl('metal', 0xc8ccd0, wx, wy, wz, 0.0014, 0.0011, 0.072, 6); K.add('blink', BALL, 0xffffff, [wx, top + 0.004, wz], [0, 0, 0], 0.0025);
        mv(2, [wx, top, wz], [0, 1, 0], 0.7, r() * 6, 0.45, (Kt, key) => {
          for (let i = 0; i < 3; i++) Kt.add(key, new THREE.CylinderGeometry(0.0042 - i * 0.0011, 0.0053 - i * 0.0011, 0.007, 10, 1, true).rotateZ(Math.PI / 2), i % 2 ? 0xf2f2ee : 0xff5a1a, [wx + 0.0045 + i * 0.007, top - 0.002, wz]);
          Kt.add(key, new THREE.TorusGeometry(0.0053, 0.0006, 4, 12).rotateY(Math.PI / 2), 0x8a9098, [wx + 0.001, top - 0.002, wz]);
        });
      }
    }
    this.imEmit(K, ctx);
    if (!low) for (const m of this.imAnimEmit(A, ctx)) m.castShadow = false;
    this.emblem(ctx, 'mining_area', 0.02, 0.24, 0.26, 0.28);
  }
}
