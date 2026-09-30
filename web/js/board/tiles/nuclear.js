// nuclear.js -- TileArt mixin: the Nuclear Zone, a terraforming test site with a glassed crater, dust devils and a
// checkpoint, and the nr* shader-driven motion helpers it shares with the Restricted Area (restricted.js).
import { gfx } from '../quality.js';
import * as THREE from 'three';
import { mergeGeometries } from '../../../vendor/BufferGeometryUtils.js';
import { BALL, BOX, Kit, TAU, _c, _c2, _n, _v, clamp01, dish, fbm2, part, smooth } from './kit.js';

export class NuclearArt {
  // Nuclear Zone: a terraforming test site -- deep shots set off to warm the planet, a civil
  // engineering project, not a weapons range. Ground zero is a shallow subsidence crater, its floor
  // fused into a crust of dark green glass (nucGroundMat: per-pixel glass cells with pale fractures and
  // a sheen, the faintest warm glow still in a few fissures), blast rays scorched out over cracked rust
  // hardpan. The twisted stub of the steel shot tower stands on its four footings, a stone marker by
  // zero. The border the players know: hazard-striped posts strung with tape and trefoil signs, their
  // lamps now rotating beacons, and the way in a decontamination checkpoint on the access road (a
  // wash-down portal misting over its pad, a striped decon trailer, a boom). Round zero runs the survey
  // ring road, a science rover driving it (nrMove, on the GPU); outside the fence the project's
  // control bunker and an instrument bunker watch zero, cable runs trenched in (a telemetry dish, a
  // high-speed camera mast); a thermal-probe string runs down into the glass, a seismometer vault and
  // dosimetry stakes blink on the rim, and now and then a dust devil wanders over the flats.
  nuclear(ctx) {
    const r = this.env.srand(ctx.space * 37 + 3), cx = -0.04, cz = -0.05, CR = 0.21, low = gfx.low;
    const TX = 0.29, TZ = 0.275;                                      // the survey ring road round zero (an ellipse)
    ctx.wall(0x33251d);
    // the bunkers [x, z, yaw facing zero], and their cable runs from the slit face in to the crater rim
    const bunkers = [[0.4, -0.16], [0.02, -0.44]].map(([x, z]) => [x, z, Math.atan2(cx - x, cz - z)]);
    const runs = bunkers.map(([x, z, th]) => { const ux = Math.sin(th), uz = Math.cos(th), L = Math.hypot(cx - x, cz - z); return [[x + ux * 0.035, z + uz * 0.035], [x + ux * (L - CR * 1.05), z + uz * (L - CR * 1.05)]]; });
    const seg = (x, z, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], t = clamp01(((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)); return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t); };
    const trench = (x, z) => Math.min(...runs.map(([a, b]) => seg(x, z, a, b)));
    const ring = (x, z) => (Math.hypot((x - cx) / TX, (z - cz) / TZ) - 1) * 0.28;   // ~ distance off the ring road's centre line
    const rays = []; for (let i = 0; i < 13; i++) rays.push([r() * TAU, 0.12 + r() * 0.16, 1.8 + r() * 1.4]);
    const hf = (x, z) => {
      const d = Math.hypot(x - cx, z - cz) / CR, e = smooth(0, 0.06, this.edgeDist(x, z));
      return (-0.03 * clamp01(1 - d * d) + 0.014 * Math.exp(-(((d - 1) / 0.3) ** 2)) * e + 0.004 * (fbm2(x * 30, z * 30, 3) - 0.5) - 0.004 * smooth(0.008, 0.003, trench(x, z)) * smooth(1, 1.15, d)) * (d < 1 ? 1 : e);
    };
    const scorchAt = (x, z) => {
      const d = Math.hypot(x - cx, z - cz) / CR, a = Math.atan2(z - cz, x - cx);
      let ray = 0; for (const [ra, w, L] of rays) { const da = Math.abs(((a - ra + Math.PI) % TAU + TAU) % TAU - Math.PI); ray = Math.max(ray, clamp01(1 - da / (w * 0.35)) * clamp01((L - d) / 0.9)); }
      return clamp01(clamp01(1.25 - d * 0.45) * 0.8 + ray * 0.7);
    };
    const cf = (x, z) => {
      const d = Math.hypot(x - cx, z - cz) / CR, n = fbm2(x * 22 + 5, z * 22, 4);
      _c.setRGB(0.56 + n * 0.1, 0.38 + n * 0.07, 0.26 + n * 0.05);                                          // rust ground
      _c.lerp(_c2.setRGB(0.07, 0.055, 0.045), scorchAt(x, z));                                             // scorched
      _c.lerp(_c2.setRGB(0.4 + n * 0.1, 0.31 + n * 0.06, 0.24 + n * 0.05), Math.exp(-(((d - 1.1) / 0.28) ** 2)) * 0.5);   // the churned ejecta on the rim
      if (d > 1) _c.multiplyScalar(1 - 0.55 * smooth(0.008, 0.003, trench(x, z)));                          // the cable trenches
      return _c;
    };
    { // the ground: vertex colours, per-pixel detail from aNuc = (x, z from zero, scorch, 0) (nucGroundMat)
      const geo = this.ground(hf, cf, { sub: low ? 22 : 30 }), P = geo.attributes.position, A = new Float32Array(P.count * 4);
      for (let i = 0; i < P.count; i++) { const x = P.getX(i), z = P.getZ(i); A[i * 4] = x - cx; A[i * 4 + 1] = z - cz; A[i * 4 + 2] = scorchAt(x, z); }
      geo.setAttribute('aNuc', new THREE.BufferAttribute(A, 4));
      this.groundMeshGeo(ctx, geo, { mat: this.nucGroundMat() });
    }
    const K = new Kit(), N = new Kit(), by = hf(cx, cz), Rb = this.nrRb(ctx);
    const conc = 0x9a958c, concD = 0x6e6a64, steel = 0x6a7078, rust = 0x4a3528, rustD = 0x2e2420;
    // ---- ground zero: a faint glint at the heart of the glass, a few flung shards round it
    if (!low) for (let i = 0; i < 5; i++) { const a = r() * TAU, d = 0.1 + r() * 0.05, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d; K.add('glass', BALL, 0x2e5230, [x, hf(x, z) + 0.0006, z], [0, r() * 3, 0], [0.007 + r() * 0.005, 0.0012, 0.004 + r() * 0.003]); }
    K.add('glowG', new THREE.CircleGeometry(0.011, 14).rotateX(-Math.PI / 2), 0xffffff, [cx, by + 0.0035, cz]);
    for (let i = 0; i < 3; i++) {                                     // a few hairline glints in the glass
      const a = i / 3 * TAU + r() * 1.4, d0 = 0.012 + r() * 0.01, L = 0.016 + r() * 0.016, x = cx + Math.cos(a) * (d0 + L / 2), z = cz + Math.sin(a) * (d0 + L / 2);
      K.add('glowG', BOX, 0xffffff, [x, hf(x, z) + 0.0032, z], [0, -a + (r() - 0.5) * 0.5, 0], [L, 0.0012, 0.0018]);
    }
    // ---- the shot tower's stub: four concrete footings, the legs buckled, melted and drooping outward
    const TB = 0.038, mids = [];
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sz], li) => {
      const fx = cx + sx * TB, fz = cz + sz * TB, fy = hf(fx, fz), ca = Math.atan2(sz, sx);
      K.box('nrConc', conc, fx, fy - 0.006, fz, 0.026, 0.02, 0.026);
      const stub = li === 2, h1 = stub ? 0.018 : 0.034 + r() * 0.034;
      const a = [fx, fy + 0.012, fz], b = [fx - sx * 0.006 + (r() - 0.5) * 0.01, fy + 0.012 + h1, fz - sz * 0.006 + (r() - 0.5) * 0.01];   // (leaning in: the tower tapered)
      this.strut(K, 'metal', rust, a, b, 0.0052, 6);
      mids.push([a[0] + (b[0] - a[0]) * 0.5, a[1] + (b[1] - a[1]) * 0.5, a[2] + (b[2] - a[2]) * 0.5]);
      if (stub) {                                                     // sheared off low: its top lies twisted beside the footing
        const gx = fx + sx * 0.03, gz = fz + sz * 0.012;
        K.add('metal', BOX, rustD, [gx, hf(gx, gz) + 0.004, gz], [0.3, ca + 0.9, 0.2], [0.046, 0.0075, 0.0075]);
        return;
      }
      // buckled: the top bends off sideways (the tower twisted as it went), sags, and the end curls down
      const da = ca + (li % 2 ? 1 : -1) * (1.1 + r() * 0.5), out = 0.02 + r() * 0.016, c = [b[0] + Math.cos(da) * out, b[1] - 0.004 - r() * 0.012, b[2] + Math.sin(da) * out];
      this.strut(K, 'metal', rustD, b, c, 0.0044, 6);
      K.add('metal', BALL, rust, b, [0, 0, 0], 0.0056);
      if (!low) { const e = [c[0] + Math.cos(da + 0.9) * 0.008, Math.max(hf(c[0], c[2]) + 0.004, c[1] - 0.016), c[2] + Math.sin(da + 0.9) * 0.008]; this.strut(K, 'metal', rustD, c, e, 0.003, 5); K.add('metal', BALL, rustD, c, [0, 0, 0], 0.004); }
    });
    this.strut(K, 'metal', rust, mids[0], mids[1], 0.0022, 5);            // what is left of the bracing: one girt whole, one torn off halfway
    if (!low) { const [m0, m3] = [mids[0], mids[3]]; this.strut(K, 'metal', rustD, m3, [m3[0] + (m0[0] - m3[0]) * 0.55, m3[1] - 0.008, m3[2] + (m0[2] - m3[2]) * 0.55], 0.0022, 5); }
    for (let i = 0; i < 2; i++) {                                     // fallen tower sections across zero
      const a = r() * TAU, x = cx + Math.cos(a) * 0.012, z = cz + Math.sin(a) * 0.012;
      K.add('metal', BOX, i ? rust : rustD, [x, hf(x, z) + 0.004, z], [(r() - 0.5) * 0.3, r() * 3, (r() - 0.5) * 0.3], [0.05 + r() * 0.02, 0.006, 0.006]);
    }
    K.add('metal', BOX, rustD, [cx + 0.055, hf(cx + 0.055, cz - 0.035) + 0.003, cz - 0.035], [0.25, r() * 3, 0.18], [0.03, 0.003, 0.022]);   // a slumped plate of the cab
    // the marker obelisk: dark lava rock, beside zero
    { const ox = cx + 0.082, oz = cz + 0.052, oy = hf(ox, oz);
      K.box('nrConc', concD, ox, oy - 0.004, oz, 0.03, 0.008, 0.03);
      K.add('std', new THREE.CylinderGeometry(0.0085, 0.0125, 0.062, 4, 1).rotateY(Math.PI / 4).translate(0, 0.031, 0), 0x46403b, [ox, oy + 0.004, oz], [0, 0.4, 0]);
      K.add('std', new THREE.ConeGeometry(0.0085, 0.012, 4).rotateY(Math.PI / 4).translate(0, 0.006, 0), 0x3a3531, [ox, oy + 0.066, oz], [0, 0.4, 0]); }
    // a rotating amber beacon (lamp dome + a flare going round with its lobe) at (x, y, z)
    const beacon = (x, y, z, ph, s = 1) => {
      this.nrLampAdd(N, BALL, 0xffa21a, [x, y, z], [0, 0, 0], [0.0075 * s, 0.0065 * s, 0.0075 * s], 3.4, ph);
      K.cyl('metal', 0x2a2c30, x, y - 0.006 * s, z, 0.006 * s, 0.006 * s, 0.004 * s, 10);
      if (!low) this.nrSpinAdd(N, 'nrBeam', new THREE.PlaneGeometry(0.05 * s, 0.012 * s).translate(0.027 * s, 0, 0), (X) => _c.setRGB(1, 0.62, 0.15).multiplyScalar(clamp01(1 - (X - x) / (0.052 * s)) ** 1.5), [x, y, z], [0, 0, 0], 1, [x, y, z], [3.4, ph]);
    };
    // ---- the bunkers: low sloped concrete (formwork lines, tie holes), a lit slit toward zero, an earth berm behind, a vent;
    // the first is the project's control bunker (a beacon on its roof), the second carries the telemetry dish
    const L2W = (x, z, th, lx, lz) => [x + lx * Math.cos(th) + lz * Math.sin(th), z - lx * Math.sin(th) + lz * Math.cos(th)];
    bunkers.forEach(([bx, bz, th], bi) => {
      const y0 = hf(bx, bz) - 0.004;
      const [ex, ez] = L2W(bx, bz, th, 0, -0.03); K.add('std', BALL, 0x94684a, [ex, hf(ex, ez) - 0.005, ez], [0, th, 0], [0.07, 0.016, 0.028]);
      K.add('nrConc', new THREE.CylinderGeometry(0.036, 0.05, 0.034, 4, 1).rotateY(Math.PI / 4), conc, [bx, y0 + 0.017, bz], [0, th, 0], [1.25, 1, 0.8]);
      K.box('nrConc', concD, bx, y0 + 0.034, bz, 0.058, 0.004, 0.038, th);
      const [sx, sz] = L2W(bx, bz, th, 0, 0.0245); K.box('glow', 0x8fc4cc, sx, y0 + 0.014, sz, 0.05, 0.0045, 0.003, th);
      const [vx, vz] = L2W(bx, bz, th, 0.016, -0.008); K.cyl('metal', steel, vx, y0 + 0.034, vz, 0.0028, 0.0028, 0.022, 6);
      const [dx, dz] = L2W(bx, bz, th, -0.018, -0.006);
      if (bi === 0) beacon(dx, y0 + 0.045, dz, 1.3);
      else { K.cyl('metal', steel, dx, y0 + 0.038, dz, 0.0022, 0.0022, 0.02, 6); K.add('std2', dish(0.017, 0.006, 16), 0xe4e6e8, [dx, y0 + 0.062, dz], [-0.9, th + Math.PI, 0]); }
    });
    // the camera mast beside the first bunker, its camera trained on zero
    { const [bx, bz, th] = bunkers[0], [mx, mz] = L2W(bx, bz, th, 0.062, 0.004), my = hf(mx, mz);
      K.cyl('metal', steel, mx, my, mz, 0.0034, 0.0024, 0.1, 6);
      for (let i = 0; i < 3; i++) { const a = i / 3 * TAU + 0.3; this.strut(K, 'metal', steel, [mx + Math.cos(a) * 0.024, my, mz + Math.sin(a) * 0.024], [mx, my + 0.05, mz], 0.0012, 4); }
      K.box('std', 0x2e3236, mx, my + 0.1, mz, 0.014, 0.014, 0.024, th);
      const [lx, lz] = L2W(mx, mz, th, 0, 0.014); K.add('std', new THREE.CylinderGeometry(0.0055, 0.0055, 0.006, 10).rotateX(Math.PI / 2), 0x14161a, [lx, my + 0.107, lz], [0, th, 0]);
      K.add('blinkA', BALL, 0xffffff, [mx, my + 0.119, mz], [0, 0, 0], 0.0045); }
    // cable runs on short poles along the trenches -- buried where they pass under the ring road
    if (!low) for (const [a, b] of runs) {
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(L / 0.05)); let prev = null;
      for (let i = 0; i <= n; i++) {
        const x = a[0] + (b[0] - a[0]) * i / n, z = a[1] + (b[1] - a[1]) * i / n, y = hf(x, z);
        if (Math.abs(ring(x, z)) < 0.034) { prev = null; continue; }
        K.cyl('std', 0x5a4634, x, y - 0.002, z, 0.0018, 0.0018, 0.02, 5);
        if (prev) this.strut(K, 'std', 0x1a1a1a, prev, [x, y + 0.017, z], 0.0009, 4);
        prev = [x, y + 0.017, z];
      }
    }
    // ---- on the rim: a thermal-probe string run from its logger down into the glass (red-capped probes
    // on a cable), a seismometer vault (a flush concrete hatch, a GPS mast), dosimetry stakes blinking green
    const onRim = (a, d = 0.245) => [cx + Math.cos(a) * d * TX / 0.28, cz + Math.sin(a) * d * TZ / 0.28];
    { const a = 2.95, [lx, lz] = onRim(a), ly = hf(lx, lz);
      K.box('nrPanel', 0xd8d4c8, lx, ly - 0.002, lz, 0.022, 0.018, 0.016, -a);
      K.box('std', 0x1c2a44, lx, ly + 0.017, lz, 0.026, 0.002, 0.02, -a);                    // its solar lid
      let prev = [lx + Math.cos(a + Math.PI) * 0.012, ly + 0.004, lz + Math.sin(a + Math.PI) * 0.012];
      for (let i = 0; i < (low ? 3 : 5); i++) {
        const d = 0.22 - i * 0.032, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d, y = hf(x, z);
        K.cyl('metal', 0x8a8e94, x, y - 0.002, z, 0.0016, 0.0016, 0.016, 5);
        K.cyl('std', 0xc8321e, x, y + 0.014, z, 0.0026, 0.0026, 0.004, 8);
        this.strut(K, 'std', 0x1a1a1a, prev, [x, y + 0.004, z], 0.0008, 4); prev = [x, y + 0.004, z];
      }
      this.nrLampAdd(N, BOX, 0x40ff70, [lx, ly + 0.012, lz + 0.0081], [0, -a, 0], [0.004, 0.003, 0.001], -0.5, 0.3); }
    { const a = -2.35, [vx, vz] = onRim(a), vy = hf(vx, vz);
      K.box('nrConc', concD, vx, vy - 0.004, vz, 0.034, 0.008, 0.034, 0.3);
      K.box('metal', 0x5a6068, vx, vy + 0.004, vz, 0.024, 0.0015, 0.024, 0.3);
      K.cyl('metal', steel, vx + 0.012, vy, vz - 0.012, 0.0016, 0.0016, 0.045, 5);
      K.add('std', BALL, 0xeceae4, [vx + 0.012, vy + 0.048, vz - 0.012], [0, 0, 0], [0.0045, 0.003, 0.0045]); }
    for (const [i, a] of [0.35, 1.95, -1.05, -0.35].entries()) {
      const [x, z] = onRim(a, 0.232 + (i % 2) * 0.014), y = hf(x, z);
      K.cyl('std', 0xf2c21c, x, y - 0.002, z, 0.0017, 0.0017, 0.03, 5);
      K.box('nrPanel', 0xe6e4dc, x, y + 0.02, z + 0.0025, 0.009, 0.012, 0.004, 0);
      this.nrLampAdd(N, BOX, 0x40ff70, [x, y + 0.023, z + 0.0048], [0, 0, 0], [0.0025, 0.0025, 0.001], -0.45, i * 0.27);
    }
    // ---- a bent instrument mast: buckled over away from zero, its cross-arm hanging
    { const mx = 0.09, mz = 0.07, my = hf(mx, mz), aw = Math.atan2(mz - cz, mx - cx), ux = Math.cos(aw), uz = Math.sin(aw);
      const p1 = [mx + ux * 0.012, my + 0.06, mz + uz * 0.012], p2 = [p1[0] + ux * 0.042, p1[1] - 0.012, p1[2] + uz * 0.042];
      K.box('nrConc', concD, mx, my - 0.003, mz, 0.018, 0.008, 0.018);
      this.strut(K, 'metal', 0x5c5854, [mx, my, mz], p1, 0.0032, 6); this.strut(K, 'metal', 0x4a4642, p1, p2, 0.0026, 6);
      K.add('metal', BALL, 0x5c5854, p1, [0, 0, 0], 0.0036);
      if (!low) { this.strut(K, 'metal', 0x4a4642, [p1[0] - uz * 0.016, p1[1] - 0.002, p1[2] + ux * 0.016], [p1[0] + uz * 0.012, p1[1] - 0.018, p1[2] - ux * 0.012], 0.0014, 4); K.box('std', 0x2e3236, p2[0], p2[1] - 0.012, p2[2], 0.01, 0.01, 0.01, r()); } }
    // ---- the decontamination checkpoint where the access road comes in through the border (front):
    // a hazard-striped wash-down portal over a wet pad (spray bar, trefoil, beacon), a boom, the decon trailer and its tank
    const GX = 0.0, GZ = 0.3;
    { const pz = GZ, y0 = hf(GX, pz);
      K.box('nrConc', 0x8a8680, GX, y0 - 0.004, pz, 0.1, 0.007, 0.07);
      K.add('glass', new THREE.CircleGeometry(0.026, 16).rotateX(-Math.PI / 2), 0x6a625a, [GX, y0 + 0.0032, pz], [0, 0, 0], [1.3, 1, 0.8]);   // the wet film on the pad
      K.box('metal', 0x1a1a1a, GX, y0 + 0.0035, pz, 0.05, 0.0006, 0.006);                   // its drain grate
      for (const s of [-1, 1]) for (let k = 0; k < 6; k++) K.cyl('std', k % 2 ? 0x1a1a1a : 0xf2c21c, GX + s * 0.045, y0 + k * 0.014, pz, 0.0045, 0.0045, 0.014, 8);
      K.box('std', 0xf2c21c, GX, y0 + 0.084, pz, 0.1, 0.008, 0.008);
      for (let k = 0; k < 5; k++) K.box('std', 0x1a1a1a, GX - 0.04 + k * 0.02, y0 + 0.084, pz, 0.01, 0.0082, 0.0082);
      K.add('metal', new THREE.CylinderGeometry(0.0018, 0.0018, 0.084, 6).rotateZ(Math.PI / 2), 0x9aa0a8, [GX, y0 + 0.074, pz]);   // the spray bar
      for (let k = 0; k < 5; k++) K.cyl('metal', 0x9aa0a8, GX - 0.032 + k * 0.016, y0 + 0.066, pz, 0.0012, 0.0024, 0.008, 6);
      K.add('trefoil', new THREE.PlaneGeometry(0.036, 0.036), 0xffffff, [GX, y0 + 0.104, pz + 0.004], [0, 0, 0], 1, { uv: true });
      K.box('std', 0xf2c21c, GX, y0 + 0.086, pz + 0.001, 0.004, 0.006, 0.002);
      beacon(GX - 0.045, y0 + 0.094, pz, 0.4);
      const bzz = pz + 0.052;                                                                // the boom, down across the road outside
      K.box('std', 0x3a3a3a, GX + 0.05, y0, bzz, 0.012, 0.03, 0.012);
      for (let k = 0; k < 6; k++) K.box('std', k % 2 ? 0xd82020 : 0xf2f2ee, GX + 0.042 - k * 0.015 - 0.0075, y0 + 0.026, bzz, 0.015, 0.005, 0.005);
      if (!low) this.puffs(ctx, [{ x: GX, z: pz, y: y0 + 0.07, n: 5, life: 2.6, rise: -0.05, size: 0.035, col: [0.9, 0.93, 0.95, 0.16], drift: [0, 0.01], jit: 0.07, spread: 0.02 }]);
    }
    { const tx = 0.098, tz = 0.405, ty = hf(tx, tz);
      K.box('nrPanel', 0xe8e6e0, tx, ty + 0.008, tz, 0.046, 0.034, 0.1, 0);
      K.box('std', 0xf2c21c, tx, ty + 0.024, tz, 0.0465, 0.006, 0.1005, 0);                  // the hazard band
      K.box('glow', 0xa8dcff, tx - 0.0232, ty + 0.03, tz - 0.022, 0.001, 0.008, 0.02, 0);
      K.box('std', 0x5a6068, tx - 0.0233, ty + 0.009, tz + 0.02, 0.001, 0.024, 0.014, 0);   // the door
      K.box('metal', 0x7a8088, tx - 0.03, ty, tz + 0.02, 0.012, 0.004, 0.016, 0);
      K.add('trefoil', new THREE.PlaneGeometry(0.018, 0.018), 0xffffff, [tx - 0.0236, ty + 0.03, tz + 0.006], [0, -Math.PI / 2, 0], 1, { uv: true });
      for (const s of [-1, 1]) K.add('std', new THREE.CylinderGeometry(0.008, 0.008, 0.005, 12).rotateZ(Math.PI / 2), 0x1e1e1e, [tx + s * 0.022, ty + 0.008, tz + 0.012]);
      K.box('metal', steel, tx, ty + 0.042, tz - 0.03, 0.02, 0.006, 0.014, 0);
      const wx = -0.08, wz = 0.4, wy = hf(wx, wz);                                          // the water tank on its skid
      K.box('nrConc', concD, wx, wy - 0.003, wz, 0.05, 0.006, 0.03);
      K.add('nrPanel', new THREE.CylinderGeometry(0.013, 0.013, 0.044, 14).rotateZ(Math.PI / 2), 0xdcd8cc, [wx, wy + 0.016, wz]);
      this.strut(K, 'metal', 0x6a7078, [wx + 0.022, wy + 0.008, wz], [GX - 0.05, hf(GX - 0.05, 0.33) + 0.004, 0.33], 0.0014, 5); }
    // ---- hazard posts round the crater, trefoil signs on some, a tape between, rotating beacons on top;
    // the checkpoint portal stands in the gap in front
    const posts = [];
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * TAU + 0.2, x = cx + Math.cos(a) * 0.37, z = cz + Math.sin(a) * 0.35;
      if (this.edgeDist(x, z) < 0.03 || this.env.inClearing(x, z, 0.02) || Math.hypot(x - GX, z - GZ) < 0.06) continue;
      posts.push([x, z, a]);
      const y0 = hf(x, z);
      for (let k = 0; k < 5; k++) K.cyl('std', k % 2 ? 0x1a1a1a : 0xf2c21c, x, y0 + k * 0.014, z, 0.006, 0.006, 0.014, 8);
      beacon(x, y0 + 0.076, z, i * 1.9);
      if (i % 2 === 0) K.add('trefoil', new THREE.PlaneGeometry(0.05, 0.05), 0xffffff, [x, y0 + 0.05, z + 0.008], [-0.25, 0, 0], 1, { uv: true });
    }
    const tape = ([x0, z0], [x1, z1]) => K.add('std', new THREE.CylinderGeometry(0.002, 0.002, Math.hypot(x1 - x0, z1 - z0), 4), 0xf2c21c, [(x0 + x1) / 2, (hf(x0, z0) + hf(x1, z1)) / 2 + 0.042, (z0 + z1) / 2], [0, -Math.atan2(z1 - z0, x1 - x0), Math.PI / 2]);
    for (let i = 0; i + 1 < posts.length; i++) if (Math.hypot(posts[i + 1][0] - posts[i][0], posts[i + 1][1] - posts[i][1]) <= 0.3) tape(posts[i], posts[i + 1]);
    for (const p of posts) for (const s of [-1, 1]) { const q = [GX + s * 0.045, GZ]; if (Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.3 && (p[0] - GX) * s > 0) tape(p, q); }   // taped in to the portal
    // ---- scattered debris: scorched rocks and twisted girder ends, kept off the structures and the roads
    const busy = [...bunkers.map(([x, z]) => [x, z, 0.075]), [0.09, 0.07, 0.05], [cx + 0.082, cz + 0.052, 0.03], [GX, GZ + 0.05, 0.1]];
    for (let i = 0; i < (low ? 8 : 16); i++) {
      const a = r() * TAU, d = 0.1 + r() * 0.3, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      if (this.edgeDist(x, z) < 0.02 || this.env.inClearing(x, z, 0.01) || busy.some(([bx, bz, rr]) => Math.hypot(x - bx, z - bz) < rr) || trench(x, z) < 0.012 || Math.abs(ring(x, z)) < 0.032) continue;
      if (r() < 0.4) K.add('std', BALL, 0x4a3c32, [x, hf(x, z) + 0.002, z], [r(), r(), r()], [0.006 + r() * 0.008, 0.005, 0.006 + r() * 0.006]);
      else K.add('metal', BOX, r() < 0.5 ? rust : 0x4a4540, [x, hf(x, z) + 0.003, z], [(r() - 0.5) * 0.5, r() * 3, (r() - 0.5) * 0.4], [0.026 + r() * 0.026, 0.005, 0.006]);
    }
    for (const [k, L] of K.by) if (typeof k === 'string' && k.startsWith('nr')) { N.by.set(k, L); K.by.delete(k); }   // (the panelled / concrete buildings: nrEmit)
    this.emit(K, ctx);
    this.nrEmit(N, ctx);
    // ---- the science rover on the ring road: six wheels, a white body, solar deck, camera mast, headlamps
    { const RP = [], RG = [], P = (L, g, c, t, rr = [0, 0, 0], s = 1) => L.push(part(g, c, [t[0], t[1] + 0.005, t[2]], rr, s));   // (a hair up: the rim's ejecta under the road)
      P(RP, BOX, 0xe8e6e0, [0, 0.017, 0], [0, 0, 0], [0.05, 0.013, 0.026]);
      P(RP, BOX, 0x1c2a44, [-0.004, 0.0245, 0], [0, 0, 0], [0.058, 0.0018, 0.036]);
      P(RP, BOX, 0x9a9ea4, [0, 0.0115, 0], [0, 0, 0], [0.046, 0.003, 0.034]);
      for (const x of [-0.019, 0, 0.019]) for (const z of [-0.018, 0.018]) P(RP, new THREE.CylinderGeometry(0.0062, 0.0062, 0.005, 10).rotateX(Math.PI / 2), 0x262626, [x, 0.0062, z]);
      P(RP, new THREE.CylinderGeometry(0.0014, 0.0014, 0.028, 5), 0x8a8e94, [0.017, 0.038, -0.008]);
      P(RP, BOX, 0xdedcd4, [0.018, 0.054, -0.008], [0, 0, 0], [0.008, 0.007, 0.013]);
      P(RP, new THREE.CylinderGeometry(0.0008, 0.0008, 0.03, 4), 0x2a2a2a, [-0.02, 0.04, 0.012]);
      P(RP, dish(0.008, 0.003, 10), 0xeceae4, [-0.014, 0.03, -0.01], [0.5, 0, 0]);
      for (const z of [-0.007, 0.007]) P(RG, BOX, 0xfff2c8, [0.0252, 0.018, z], [0, 0, 0], [0.0015, 0.0035, 0.004]);
      P(RG, BOX, 0x40ff70, [0.018, 0.054, -0.0012], [0, 0, 0], [0.0015, 0.0015, 0.0015]);
      this.nrMoveEmit(ctx, this.nrVehicle(RP, RG, [cx, cz, TX, TZ], -0.16, r() * TAU, Rb)); }
    this.puffs(ctx, [{ x: cx, z: cz, y: by + 0.02, n: 4, life: 6, rise: 0.14, size: 0.06, col: [0.56, 0.46, 0.4, 0.18], drift: [0.05, -0.03], jit: 0.03 }]);   // a thin warm wisp off zero
    if (!low) this.nucDevils(ctx, [[0.3, -0.36, 0.035, 0.1], [-0.33, -0.18, 0.03, 0.55]], Rb);
    this.emblem(ctx, 'nuclear_zone', -0.22, 0.24, 0.26, 0.28);
  }
  // the Nuclear Zone's ground (vertex colours + aNuc = x, z from zero, scorch): grit everywhere; fine radial blast
  // striations over the scorch; polygon cracks in the hardpan out on the flats; the survey ring road and the access
  // road, compacted and rutted; and zero's fused crust -- cells of dark bottle-green glass with pale fractures,
  // each cell tilted a little so the sheen breaks up (low roughness), a few fissures near the heart still faintly
  // warm. Every detail fades out where it would be under a pixel.
  nucGroundMat() {
    if (this.mats.nucGround) return this.mats.nucGround;
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
    m.onBeforeCompile = (s) => {
      s.uniforms.uTime = this.time;
      s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aNuc; varying vec4 vNuc;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvNuc = aNuc;');
      s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>
uniform float uTime; varying vec4 vNuc;
float nuH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float nuN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(nuH(i), nuH(i + vec2(1.0, 0.0)), f.x), mix(nuH(i + vec2(0.0, 1.0)), nuH(i + vec2(1.0, 1.0)), f.x), f.y); }
vec3 nuVor(vec2 x) {
  vec2 n = floor(x), f = fract(x); float F1 = 8.0, F2 = 8.0; vec2 id = n;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j)), o = vec2(nuH(n + g), nuH(n + g + 17.31)), rr = g + o * 0.85 - f; float d = dot(rr, rr);
    if (d < F1) { F2 = F1; F1 = d; id = n + g; } else if (d < F2) F2 = d;
  }
  return vec3(sqrt(F2) - sqrt(F1), nuH(id + 3.1), nuH(id + 7.7));
}`)
        .replace('#include <color_fragment>', `#include <color_fragment>
float nuGlass = 0.0, nuGlow = 0.0; vec2 nuTilt = vec2(0.0);
{
  vec2 p = vNuc.xy; float r = length(p), d = r / 0.21, ang = atan(p.y, p.x);
  float px = length(fwidth(p)), fine = clamp(1.0 - px * 260.0, 0.0, 1.0), mid = clamp(1.0 - px * 70.0, 0.0, 1.0);
  vec3 col = diffuseColor.rgb;
  col *= 0.93 + 0.14 * nuN(p * 900.0) * fine + 0.12 * (nuN(p * 120.0) - 0.5);
  float stri = nuN(vec2(ang * 110.0, r * 16.0));
  col *= 1.0 - vNuc.z * 0.3 * smoothstep(0.45, 0.85, stri) * mid;
  vec3 v = nuVor(p * 64.0 + vec2(nuN(p * 30.0), nuN(p * 30.0 + 5.0)) * 0.8);
  float fl = smoothstep(0.62, 0.9, d), patchy = smoothstep(0.3, 0.7, nuN(p * 14.0 + 9.0));
  col *= 1.0 - 0.24 * (1.0 - smoothstep(0.012, 0.05, v.x)) * fl * patchy * mid;
  col *= 1.0 + 0.08 * (v.y - 0.5) * fl * patchy;
  float ring = (length(p / vec2(0.29, 0.275)) - 1.0) * 0.28;
  float band = 1.0 - smoothstep(0.017, 0.025, abs(ring));
  float lat = p.x - 0.04, acc = (1.0 - smoothstep(0.017, 0.025, abs(lat))) * smoothstep(0.26, 0.28, p.y);
  float rut = max((1.0 - smoothstep(0.0018, 0.0042, abs(abs(ring) - 0.0105))) * band, (1.0 - smoothstep(0.0018, 0.0042, abs(abs(lat) - 0.0105))) * acc);
  float rd = max(band, acc);
  col = mix(col, col * vec3(1.14, 1.1, 1.05) + vec3(0.02), rd * 0.65);
  col *= 1.0 - 0.22 * rut * mid;
  float gl = 1.0 - smoothstep(0.36, 0.52, d + (nuN(p * 26.0) - 0.5) * 0.3);
  if (gl > 0.001) {
    vec3 g = nuVor(p * 120.0);
    float fr = (1.0 - smoothstep(0.012, 0.05, g.x)) * mid;
    vec3 gc = mix(vec3(0.035, 0.07, 0.045), vec3(0.1, 0.18, 0.085), g.y * g.y) * (0.88 + 0.24 * nuN(p * 420.0));
    gc = mix(gc, vec3(0.2, 0.26, 0.17), fr * 0.4);
    col = mix(col, gc, gl);
    nuGlass = gl * (1.0 - fr * 0.85);
    nuTilt = (vec2(g.y, g.z) - 0.5) * 0.9 * gl * mid;
    nuGlow = fr * gl * (1.0 - smoothstep(0.12, 0.34, d)) * step(0.55, nuN(p * 60.0 + 4.0));
  }
  diffuseColor.rgb = col;
}`)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.12, nuGlass);')
        .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 0.4, nuGlass);')
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize(normal + vec3(nuTilt, 0.0));')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.34, 0.07) * nuGlow * (0.5 + 0.25 * sin(uTime * 1.2 + vNuc.x * 80.0));');
    };
    m.customProgramCacheKey = () => 'nucGround';
    this.own(m, 0.7);
    return this.mats.nucGround = m;
  }
  // dust devils wandering over the flats: a twisting funnel of streaky dust, each on its own slow cycle
  // (grows, wanders, fades), all in the vertex / fragment shader. list: [x, z, wander radius, phase 0..1]
  nucDevils(ctx, list, Rb) {
    const geos = list.map(([x, z, w, ph]) => {
      const pts = []; for (let j = 0; j <= 7; j++) { const h = j / 7 * 0.16; pts.push(new THREE.Vector2(0.004 + 0.034 * Math.pow(h / 0.16, 1.6), h)); }
      const g = new THREE.LatheGeometry(pts, 14), n = g.attributes.position.count, A = new Float32Array(n * 4), B = new Float32Array(n);
      for (let i = 0; i < n; i++) { A[i * 4] = x; A[i * 4 + 1] = z; A[i * 4 + 2] = w; A[i * 4 + 3] = ph; B[i] = Rb; }
      g.deleteAttribute('normal'); g.setAttribute('aDv', new THREE.BufferAttribute(A, 4)); g.setAttribute('aRb', new THREE.BufferAttribute(B, 1));
      return g;
    });
    const m = new THREE.Mesh(mergeGeometries(geos), this.mats.nucDevil ||= Object.assign(new THREE.ShaderMaterial({
      uniforms: { uTime: this.time },
      vertexShader: /* glsl */`
        uniform float uTime; attribute vec4 aDv; attribute float aRb; varying vec2 vUv; varying float vLife;
        void main(){
          float T = 21.0, t = uTime + aDv.w * T, cyc = fract(t / T), h = position.y;
          vLife = smoothstep(0.0, 0.16, cyc) * (1.0 - smoothstep(0.55, 0.9, cyc));
          float s = t * 0.3;
          vec2 c = aDv.xy + vec2(sin(s * 1.3 + aDv.w * 17.0), cos(s * 0.9 + aDv.w * 11.0)) * aDv.z;
          vec2 lean = vec2(sin(t * 0.7 + aDv.w * 5.0), cos(t * 0.6)) * 0.22 * h + vec2(sin(t * 3.1 + h * 60.0), cos(t * 2.7 + h * 50.0)) * 0.06 * h;
          float sw = t * 7.0, cs = cos(sw), sn = sin(sw);
          vec2 q = vec2(position.x * cs - position.z * sn, position.x * sn + position.z * cs) * (0.55 + 0.45 * vLife);
          vec2 b = c + q + lean;
          vec3 d = normalize(vec3(b.x, aRb, b.y));
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(d * (aRb + h * (0.35 + 0.65 * vLife)) - vec3(0.0, aRb, 0.0), 1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform float uTime; varying vec2 vUv; varying float vLife;
        void main(){
          float u = vUv.x * 6.2832, v = vUv.y;
          float s1 = 0.5 + 0.5 * sin(u * 3.0 + v * 14.0 - uTime * 9.0), s2 = 0.5 + 0.5 * sin(u * 5.0 - v * 9.0 - uTime * 6.0 + 1.7);
          float a = (0.3 + 0.7 * s1 * s2) * smoothstep(0.0, 0.1, v) * (1.0 - smoothstep(0.4, 1.0, v)) * vLife * 0.34;
          if (a < 0.004) discard;
          gl_FragColor = vec4(vec3(0.72, 0.57, 0.45), a);
        }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    }), { userData: { shared: true } }));
    m.frustumCulled = false; m.renderOrder = 8;
    return this.place(m, ctx, 0, 0, 0);
  }

  // ---------------------------------------------------------------- Nuclear Zone / Restricted Area parts
  // Everything that moves on these two tiles moves in the vertex / fragment shader off the shared
  // clock -- no per-frame CPU work, one draw per kind per tile:
  //   nrSpin (lit) / nrBeam (additive)  parts turning, or sweeping back and forth, about their own
  //        vertical axis: radar dishes, searchlight heads and their beams and pools, beacon flares.
  //        nrSpinAdd tags a part with its pivot (board units) and aSpin = (rad/s, phase, sweep
  //        half-angle -- 0: all the way round, tilt); nrEmit drapes the pivot and its radial axis with
  //        the part (a turn about the radial keeps a thing on the globe exactly)
  //   nrLamp  unlit lamps: rotating beacons (a hot lobe going round: aLamp = (dir x, dir z, rad/s, phase),
  //        dir from the lamp's centre) and flashers (aLamp.z < 0: a flash every 1/|z| s at phase w -- runway
  //        lights chasing along, dosimeters blinking)
  //   nrMove  vehicles driving a closed loop (aPath = ellipse centre x, z, radii; aRun = (rad/s, phase,
  //        globe radius in board units, glow)), modelled facing +x at the origin in an object placed at
  //        the tile centre; each vertex is put back on the globe (no sag over the loop)
  nrSpinAdd(K, key, geo, color, t, r, s, piv, spin) {
    K.add(key, geo, color, t, r, s);
    const L = K.by.get(key), g = L[L.length - 1], n = g.attributes.position.count, P = new Float32Array(n * 3), S = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { P[i * 3] = piv[0]; P[i * 3 + 1] = piv[1]; P[i * 3 + 2] = piv[2]; S[i * 4] = spin[0]; S[i * 4 + 1] = spin[1] || 0; S[i * 4 + 2] = spin[2] || 0; S[i * 4 + 3] = spin[3] || 0; }
    g.setAttribute('aPiv', new THREE.BufferAttribute(P, 3)); g.setAttribute('aSpin', new THREE.BufferAttribute(S, 4));
    return g;
  }
  // a lamp part centred at t: rate > 0 a rotating beacon (rad/s), rate < 0 a flasher (flashes/s), ph its phase
  nrLampAdd(K, geo, color, t, r, s, rate, ph) {
    K.add('nrLamp', geo, color, t, r, s);
    const L = K.by.get('nrLamp'), g = L[L.length - 1], P = g.attributes.position, A = new Float32Array(P.count * 4);
    for (let i = 0; i < P.count; i++) { A[i * 4] = P.getX(i) - t[0]; A[i * 4 + 1] = P.getZ(i) - t[2]; A[i * 4 + 2] = rate; A[i * 4 + 3] = ph; }
    g.setAttribute('aLamp', new THREE.BufferAttribute(A, 4));
    return g;
  }
  // the nr* kits' meshes: merged, pivots and axes draped, in their shared materials (no cast shadows: they move)
  nrEmit(K, ctx) {
    const cell = ctx.cell, k = this.kOf(cell), out = [];
    for (const [key, list] of K.by) {
      if (!list.length) continue;
      const geo = mergeGeometries(list);
      if (!geo) { console.warn('tile_art: merge failed', key); continue; }
      if (key === 'nrPanel' || key === 'nrConc') { geo.setAttribute('aBp', geo.attributes.position.clone()); geo.setAttribute('aBn', geo.attributes.normal.clone()); }   // (board-space position / normal for the panel lines)
      const Pv = geo.attributes.aPiv;
      if (Pv) {
        const n = Pv.count, piv = new Float32Array(n * 3), ax = new Float32Array(n * 3);
        let lx = NaN, ly = NaN, lz = NaN;
        for (let i = 0; i < n; i++) {
          const x = Pv.getX(i), y = Pv.getY(i), z = Pv.getZ(i);
          if (x !== lx || y !== ly || z !== lz) { _v.copy(cell.proj(x, z, ctx.H + y * k)).sub(cell.center); _n.copy(cell.proj(x, z, 1)).sub(cell.proj(x, z, 0)).normalize(); lx = x; ly = y; lz = z; }
          piv[i * 3] = _v.x; piv[i * 3 + 1] = _v.y; piv[i * 3 + 2] = _v.z; ax[i * 3] = _n.x; ax[i * 3 + 1] = _n.y; ax[i * 3 + 2] = _n.z;
        }
        geo.setAttribute('aPiv', new THREE.BufferAttribute(piv, 3)); geo.setAttribute('aAx', new THREE.BufferAttribute(ax, 3));
      }
      this.drape(geo, cell, ctx.H);
      const m = new THREE.Mesh(geo, this.nrMat(key));
      if (key === 'nrSpin') m.receiveShadow = true;
      if (key === 'nrPanel' || key === 'nrConc') m.castShadow = m.receiveShadow = true;
      if (key === 'nrBeam') m.renderOrder = 7;
      ctx.g.add(m); out.push(m);
    }
    return out;
  }
  nrMat(key) {
    if (this.mats[key]) return this.mats[key];
    const SPIN = `attribute vec3 aPiv; attribute vec3 aAx; attribute vec4 aSpin; uniform float uTime;
vec3 nrRot(vec3 v, vec3 k, float a) { float c = cos(a), s = sin(a); return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c); }
float nrAng() { return aSpin.z > 0.0 ? aSpin.z * sin(uTime * aSpin.x + aSpin.y) : uTime * aSpin.x + aSpin.y; }`;
    let m;
    if (key === 'nrSpin' || key === 'nrBeam') {
      m = key === 'nrSpin' ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.45 })
        : new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.24, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
      m.onBeforeCompile = (s) => {
        s.uniforms.uTime = this.time;
        s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\n' + SPIN)
          .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nobjectNormal = nrRot(objectNormal, aAx, nrAng());')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = aPiv + nrRot(transformed - aPiv, aAx, nrAng());');
      };
    } else if (key === 'nrLamp') {
      m = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
      m.onBeforeCompile = (s) => {
        s.uniforms.uTime = this.time;
        s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aLamp; varying vec4 vLamp;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLamp = aLamp;');
        s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uTime; varying vec4 vLamp;')
          .replace('#include <color_fragment>', `#include <color_fragment>
{
  float b;
  if (vLamp.z > 0.0) { float a = uTime * vLamp.z + vLamp.w, l = length(vLamp.xy); float c = l > 1e-6 ? dot(vLamp.xy / l, vec2(cos(a), -sin(a))) : 0.0; b = 0.28 + 1.9 * pow(max(c, 0.0), 4.0); }
  else { float f = fract(uTime * -vLamp.z - vLamp.w); b = 0.16 + 1.5 * exp(-f * 16.0); }
  diffuseColor.rgb *= b;
}`);
      };
    } else if (key === 'nrMove') {
      m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.3 });
      m.onBeforeCompile = (s) => {
        s.uniforms.uTime = this.time;
        s.vertexShader = s.vertexShader.replace('#include <common>', `#include <common>
attribute vec4 aPath; attribute vec4 aRun; uniform float uTime; varying float vGlow;
vec2 nrTg() { float th = uTime * aRun.x + aRun.y; return normalize(vec2(-sin(th), cos(th)) * aPath.zw * sign(aRun.x)); }`)
          .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n{ vec2 tg = nrTg(); objectNormal.xz = vec2(objectNormal.x * tg.x - objectNormal.z * tg.y, objectNormal.x * tg.y + objectNormal.z * tg.x); }')
          .replace('#include <begin_vertex>', `#include <begin_vertex>
{
  float th = uTime * aRun.x + aRun.y; vec2 tg = nrTg();
  vec2 b = aPath.xy + vec2(cos(th), sin(th)) * aPath.zw + vec2(transformed.x * tg.x - transformed.z * tg.y, transformed.x * tg.y + transformed.z * tg.x);
  vec3 d = normalize(vec3(b.x, aRun.z, b.y));
  transformed = d * (aRun.z + transformed.y) - vec3(0.0, aRun.z, 0.0);
  vGlow = aRun.w;
}`);
        s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vGlow;')
          .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vGlow * 2.5;');
      };
    } else if (key === 'nrPanel' || key === 'nrConc') {
      // buildings: per-pixel detail in board space (triplanar on the board-space normal) -- nrPanel: sheet-metal
      // panel seams and rivet rows, streaky grime; nrConc: formwork lifts, tie holes, weathering. Both darken
      // toward the ground; every line fades out where it would be under a pixel
      const conc = key === 'nrConc';
      m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: conc ? 0.9 : 0.6, metalness: conc ? 0.02 : 0.15 });
      m.onBeforeCompile = (s) => {
        s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aBp; attribute vec3 aBn; varying vec3 vBp; varying vec3 vBn;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBp = aBp; vBn = aBn;');
        s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vBp; varying vec3 vBn;
float nrH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float nrN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(nrH(i), nrH(i + vec2(1.0, 0.0)), f.x), mix(nrH(i + vec2(0.0, 1.0)), nrH(i + vec2(1.0, 1.0)), f.x), f.y); }
float nrLine(float u, float w) { float d = abs(fract(u) - 0.5), fw = fwidth(u); return (1.0 - smoothstep(w * 0.5, w * 0.5 + fw, 0.5 - d)) * clamp(1.0 - fw * 3.0, 0.0, 1.0); }`)
          .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec3 n = abs(normalize(vBn)); vec3 p = vBp;
  vec2 q = n.y > max(n.x, n.z) ? p.xz : n.x > n.z ? vec2(p.z, p.y) : vec2(p.x, p.y);
  bool top = n.y > max(n.x, n.z);
  float c = 1.0;
  ${conc ? `
  float lift = top ? 0.0 : nrLine(q.y / 0.012, 0.1);
  vec2 th = q / vec2(0.016, 0.012) + vec2(0.5, 0.0); vec2 tf = fract(th) - 0.5;
  float tie = top ? 0.0 : (1.0 - smoothstep(0.08, 0.14, length(tf * vec2(1.0, 1.3)))) * clamp(1.0 - fwidth(th.x) * 5.0, 0.0, 1.0);
  float blot = nrN(q * 90.0) * 0.6 + nrN(q * 260.0) * 0.4;
  c *= (1.0 - 0.2 * lift) * (1.0 - 0.35 * tie) * (0.86 + 0.24 * blot);` : `
  float seam = max(nrLine(q.x / 0.022, 0.07), nrLine(q.y / (top ? 0.022 : 0.016), 0.07));
  vec2 rv = vec2(q.x / 0.022 * 6.0, q.y / 0.016); vec2 rf = fract(rv) - 0.5;
  float rivet = top ? 0.0 : (1.0 - smoothstep(0.1, 0.2, length(vec2(rf.x, (fract(q.y / 0.016 + 0.08) - 0.5) * 6.0)))) * clamp(1.0 - fwidth(rv.x) * 4.0, 0.0, 1.0) * 0.5;
  float tint = nrH(floor(q / vec2(0.022, 0.016)));
  c *= (1.0 - 0.28 * seam) * (1.0 - 0.2 * rivet) * (0.93 + 0.1 * tint);`}
  float streak = top ? 0.0 : smoothstep(0.45, 0.95, nrN(vec2(q.x * 170.0, q.y * 9.0)));
  float ground = 1.0 - smoothstep(0.0, 0.03, p.y);
  float fine = nrN(q * 600.0) * clamp(1.0 - fwidth(q.x) * 400.0, 0.0, 1.0);
  c *= (1.0 - 0.18 * streak) * (1.0 - 0.28 * ground) * (0.95 + 0.08 * fine);
  diffuseColor.rgb *= c;
}`);
      };
    } else throw new Error('mat ' + key);
    m.customProgramCacheKey = () => key;
    if (m.isMeshStandardMaterial) this.own(m, 0.8); else m.userData.shared = true;
    return this.mats[key] = m;
  }
  // a vehicle on the loop: part geometry (board units, facing +x, wheels on y = 0) driven round
  // the ellipse (cx, cz, ax, az) at w rad/s from phase ph; glow parts (lamps) in a second list
  nrVehicle(parts, glows, path, w, ph, Rb) {
    const out = [];
    for (const [list, gl] of [[parts, 0], [glows, 1]]) for (const g of list) {
      const n = g.attributes.position.count, A = new Float32Array(n * 4), B = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) { A.set(path, i * 4); B[i * 4] = w; B[i * 4 + 1] = ph; B[i * 4 + 2] = Rb; B[i * 4 + 3] = gl; }
      g.setAttribute('aPath', new THREE.BufferAttribute(A, 4)); g.setAttribute('aRun', new THREE.BufferAttribute(B, 4));
      out.push(g);
    }
    return out;
  }
  // the vehicles' mesh: placed at the tile centre (object space = board units), never culled (it moves)
  nrMoveEmit(ctx, geos) {
    if (!geos.length) return null;
    const m = new THREE.Mesh(mergeGeometries(geos), this.nrMat('nrMove'));
    m.frustumCulled = false; m.receiveShadow = true;
    return this.place(m, ctx, 0, 0, 0);
  }
  // globe radius under a tile, in board units (the object space of a thing placed at its centre)
  nrRb(ctx) { return ctx.cell.proj(0, 0, ctx.H).length() / this.kOf(ctx.cell); }
}
