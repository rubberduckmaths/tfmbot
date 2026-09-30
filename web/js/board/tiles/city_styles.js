// city_styles.js -- TileArt mixin: the city looks of the varied tileset (Cupola City, Noctis City, Underground
// City, Arcology...), one per placing card, built from the parts in city_parts.js.
import * as THREE from 'three';
import { mergeGeometries } from '../../../vendor/BufferGeometryUtils.js';
import { gfx } from '../quality.js';
import { BALL, BALL2, BOX, Kit, TAU, V3, _c, _c2, _q, capsuleX, clamp01, dish, fbm2, hexCorner, lathe, smooth } from './kit.js';

export class CityStyles {
  // Cupola City: a cluster of geodesic cupolas of different sizes -- homes,
  // a greenhouse, a tower dome -- linked by lit tube corridors.
  cupolaCity(ctx) {
    const r = this.env.srand(ctx.space * 89 + 3), g = this.grow;
    ctx.wall(0x2c2e34);
    this.groundMesh(ctx, () => 0.002 * fbm2(0, 0, 1), (x, z) => { const n = fbm2(x * 24, z * 24, 3); return _c.setRGB(0.56 + n * 0.1, 0.38 + n * 0.07, 0.27 + n * 0.05); }, { sub: 10 });
    const K = new Kit(), NK = this.natureKit();
    const domes = [[-0.08, -0.12, 0.19, 'city'], [0.2, -0.2, 0.12, 'green'], [-0.28, 0.12, 0.12, 'home'], [0.05, 0.2, 0.1, 'home'], [0.24, 0.02, 0.08, 'tower'], [-0.3, -0.26, 0.08, 'green']];
    for (const [x, z, rad, kind] of domes) {
      K.cyl('std', 0x9a9ea6, x, 0, z, rad + 0.012, rad + 0.006, 0.01, 40);
      const b = 0.01;
      if (kind === 'city') this.downtown(K, r, { sp: 0.05, inside: (X, Z) => Math.hypot(X - x, Z - z) < rad - 0.035, base: () => b, tall: 0.9, hmul: (X, Z) => 1 - (Math.hypot(X - x, Z - z) / rad) ** 2, parks: 0.1 });
      else if (kind === 'green') {
        K.add('std', new THREE.CircleGeometry(rad - 0.005, 24).rotateX(-Math.PI / 2), 0x3f7a34, [x, b + 0.001, z]);
        for (let i = 0; i < 7; i++) { const a = r() * TAU, d = r() * (rad - 0.03); K.add('std', NK.broad, (X, Yy) => _c.setHSL(0.27 + r() * 0.05, 0.55, 0.16 + Yy * 2.4), [x + Math.cos(a) * d, b, z + Math.sin(a) * d], [0, r() * 6, 0], 0.45 + r() * 0.3); }
      } else if (kind === 'home') {
        for (let i = 0; i < 5; i++) { const a = i / 5 * TAU + r(), d = rad * 0.45; this.tower(K, 'cfac', new THREE.Color().setHSL(0.08 + r() * 0.05, 0.3, 0.8), x + Math.cos(a) * d, b, z + Math.sin(a) * d, 0.028, 0.025 + r() * 0.02 + g * 0.006, 0.028, a); }
        K.add('std', new THREE.CircleGeometry(rad * 0.25, 16).rotateX(-Math.PI / 2), 0x3f7a34, [x, b + 0.001, z]);
      } else { this.rtower(K, 'cglass', new THREE.Color(0.75, 0.88, 1), x, b, z, 0.022, rad * 1.1 + g * 0.01); }
      this.dome(K, x, z, b, rad, kind === 'tower' ? 1.6 : 0.85, { detail: rad > 0.15 ? 2 : 1, strut: 0.0018 });
      (ctx.g.userData.domes ||= []).push({ x, z, r: rad, y: b, hs: kind === 'tower' ? 1.6 : 0.85 });   // (edgeBlend: tubes to an early forest next door)
    }
    // tube corridors between neighbouring cupolas
    const links = [[0, 1], [0, 2], [0, 3], [3, 4], [1, 4], [0, 5], [2, 5]];
    for (const [a, b] of links) {
      const [x0, z0, r0] = domes[a], [x1, z1, r1] = domes[b], L = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / L, uz = (z1 - z0) / L, len = L - r0 - r1;
      if (len <= 0) continue;
      const mx = x0 + ux * (r0 + len / 2), mz = z0 + uz * (r0 + len / 2);
      K.add('std', new THREE.CylinderGeometry(0.011, 0.011, len + 0.02, 14, 1, true).rotateZ(Math.PI / 2), 0xe4e8ee, [mx, 0.014, mz], [0, -Math.atan2(uz, ux), 0]);
      K.add('glow', new THREE.CylinderGeometry(0.0113, 0.0113, len * 0.5, 14, 1, true).rotateZ(Math.PI / 2), 0x9fe8ff, [mx, 0.014, mz], [0, -Math.atan2(uz, ux), 0], [1, 1, 1]);
    }
    this.emit(K, ctx);
  }

  // Research Outpost: an Antarctic-style base -- insulated orange/red and
  // white prefab modules up on stilts, enclosed link bridges, a radome and a
  // turning radar dish, a weather mast with a spinning anemometer, antenna
  // masts, fuel tanks, a tracked snowcat and a row of flags.
  outpostCity(ctx) {
    const r = this.env.srand(ctx.space * 97 + 5), g = this.grow;
    ctx.wall(0x3a3a40);
    this.groundMesh(ctx, (x, z) => 0.003 * fbm2(x * 16, z * 16, 3), (x, z) => {
      const n = fbm2(x * 20, z * 20, 4), snow = clamp01((fbm2(x * 8 + 7, z * 8, 3) - 0.42) * 3);
      _c.setRGB(0.6 + n * 0.1, 0.42 + n * 0.07, 0.3 + n * 0.05).lerp(new THREE.Color(0.9, 0.92, 0.95), snow * 0.6);
      const track = Math.abs(z - 0.12 - 0.08 * Math.sin(x * 6)) < 0.012 || Math.abs(x + 0.05 - z * 0.3) < 0.01; if (track) _c.multiplyScalar(0.8);
      return _c;
    }, { sub: 16 });
    const K = new Kit(), ORG = 0xff6a24, RED = 0xe8402a, WH = 0xf6f6f2, STL = 0x6a6e76;
    // a module on stilts: panelled walls in bands, a lit window strip, a roof lip
    const module = (x, z, L, ry, col) => {
      const H0 = 0.035, h = 0.04, d = 0.05, c = Math.cos(ry), s = Math.sin(ry);
      for (let i = -2; i <= 2; i++) for (const sd of [-1, 1]) K.cyl('metal', STL, x + c * i * L / 4.6 + s * sd * d * 0.35, 0, z - s * i * L / 4.6 + c * sd * d * 0.35, 0.0035, 0.0035, H0, 6);
      const n = Math.round(L / 0.025);
      for (let i = 0; i < n; i++) { const t = (i + 0.5) / n - 0.5; K.box('std', i % 3 === 1 ? WH : col, x + c * t * L, H0, z - s * t * L, L / n * 0.98, h, d, ry); }
      K.box('std', 0xdadada, x, H0 + h, z, L + 0.006, 0.005, d + 0.006, ry);
      K.box('glow', 0xffe2a8, x + s * (d / 2 + 0.0008), H0 + h * 0.55, z + c * (d / 2 + 0.0008), L * 0.8, 0.008, 0.002, ry);
      K.box('std', 0x2a2d33, x, H0 - 0.004, z, L * 0.95, 0.004, d * 0.9, ry);
    };
    module(-0.12, -0.16, 0.2, 0.15, ORG);
    module(0.14, -0.2, 0.14, -0.35, RED);
    module(-0.26, 0.1, 0.13, 1.2, WH);
    if (g >= 1) module(0.02, 0.08, 0.12, 0.6, ORG);
    if (g >= 2) module(-0.02, -0.36, 0.12, 0.05, RED);
    // enclosed link bridges
    K.box('std', 0xdadada, 0.01, 0.047, -0.19, 0.08, 0.022, 0.022, -0.1);
    K.box('std', 0xdadada, -0.22, 0.047, -0.03, 0.022, 0.022, 0.1, 0.4);
    // the radome on its tower, and a turning radar dish on the main module
    K.cyl('metal', STL, 0.3, 0, -0.02, 0.022, 0.018, 0.08, 10);
    K.add('std', BALL2, 0xf4f4f4, [0.3, 0.115, -0.02], [0, 0, 0], [0.045, 0.045, 0.045]);
    K.add('std', new THREE.TorusGeometry(0.0445, 0.0015, 6, 32).rotateX(Math.PI / 2), 0xb8bcc4, [0.3, 0.115, -0.02]);
    K.cyl('std', 0xdadada, 0.3, 0.075, -0.02, 0.03, 0.03, 0.01, 16);
    const radar = new THREE.Group(), rk = new Kit();
    rk.add('std2', dish(0.04, 0.012, 20), 0xf0f0f0, [0, 0.02, 0], [Math.PI / 2 - 0.3, 0, 0]);
    rk.cyl('metal', STL, 0, 0, 0, 0.004, 0.004, 0.02, 6);
    rk.add('blink', BALL, 0xffffff, [0, 0.05, 0], [0, 0, 0], 0.004);
    for (const [key, list] of rk.by) radar.add(new THREE.Mesh(mergeGeometries(list), this.mat(key)));
    this.spin(this.place(radar, ctx, -0.16, -0.17, 0.08), 1.1, r() * 6);
    // weather mast: banded lattice, anemometer cups turning, wind vane
    const [mx, mz] = [0.06, -0.02];
    for (let i = 0; i < 6; i++) K.cyl('metal', i % 2 ? WH : RED, mx, i * 0.04, mz, 0.004, 0.004, 0.04, 6);
    for (const a of [0, 2.1, 4.2]) K.add('metal', new THREE.CylinderGeometry(0.0006, 0.0006, 0.16, 3), 0xaaaaaa, [mx + Math.cos(a) * 0.04, 0.08, mz + Math.sin(a) * 0.04], [Math.sin(a) * 0.26, 0, -Math.cos(a) * 0.26]);
    const ane = new THREE.Group(), ak = new Kit();
    for (let i = 0; i < 3; i++) { const a = i / 3 * TAU; ak.add('metal', new THREE.CylinderGeometry(0.0012, 0.0012, 0.03, 4).rotateZ(Math.PI / 2), 0xdddddd, [Math.cos(a) * 0.015, 0, Math.sin(a) * 0.015], [0, -a, 0]); ak.add('std', new THREE.SphereGeometry(0.006, 10, 6, 0, TAU, 0, Math.PI / 2).rotateZ(Math.PI / 2), 0xf2f2f2, [Math.cos(a) * 0.03, 0, Math.sin(a) * 0.03], [0, -a, 0]); }
    for (const [key, list] of ak.by) ane.add(new THREE.Mesh(mergeGeometries(list), this.mat(key)));
    this.spin(this.place(ane, ctx, mx, mz, 0.245), 5, 0);
    K.add('blink', BALL, 0xffffff, [mx, 0.25, mz], [0, 0, 0], 0.005);
    // antenna masts
    for (const [x, z, h] of [[-0.36, -0.1, 0.18], [0.24, -0.34, 0.14], [-0.05, 0.3, 0.12]]) { if (this.env.inClearing(x, z, 0.02)) continue; K.cyl('metal', 0xc8c8c8, x, 0, z, 0.0025, 0.0015, h, 5); K.box('metal', 0xc8c8c8, x, h * 0.75, z, 0.03, 0.002, 0.002); K.box('metal', 0xc8c8c8, x, h * 0.9, z, 0.02, 0.002, 0.002); K.add('blink', BALL, 0xffffff, [x, h + 0.003, z], [0, 0, 0], 0.004); }
    // fuel tanks, snowcat, flags
    for (let i = 0; i < 3; i++) K.add('std', new THREE.CapsuleGeometry(0.014, 0.05, 4, 12).rotateZ(Math.PI / 2), 0xd8d8d0, [-0.34 + i * 0.03, 0.016, 0.28], [0, 0.9, 0], 1, { smooth: true });
    K.box('std', ORG, 0.12, 0.012, 0.3, 0.06, 0.03, 0.035, 0.3); K.box('std', 0x2a3440, 0.135, 0.03, 0.295, 0.025, 0.014, 0.03, 0.3);
    for (const s of [-1, 1]) K.box('std', 0x222222, 0.12 - Math.sin(0.3) * s * 0.02, 0, 0.3 - Math.cos(0.3) * s * 0.02, 0.068, 0.014, 0.01, 0.3);
    const fc = [0xd8281e, 0x2a5ad8, 0xf2c21c, 0x2aa84a, 0xffffff];
    for (let i = 0; i < 5; i++) { const x = -0.18 + i * 0.03, z = 0.36; K.cyl('metal', 0xdddddd, x, 0, z, 0.0015, 0.0015, 0.07, 4); K.box('std', fc[i], x + 0.01, 0.055, z, 0.02, 0.013, 0.001); }
    this.emit(K, ctx);
    this.puffs(ctx, [{ x: -0.12, z: -0.16, y: 0.085, n: 4, life: 3.5, rise: 0.12, size: 0.05, col: [0.95, 0.95, 0.95, 0.4], drift: [0.06, -0.02] }]);
    this.cityEmblem(ctx, -0.3, -0.3);
  }

  // Noctis City: built on the rims of a canyon of the Noctis Labyrinthus --
  // towers on both lips, terraces and lit cave-windows down the walls,
  // bridges across, a river of lights along the floor.
  noctisCity(ctx) {
    const r = this.env.srand(ctx.space * 101 + 1);
    ctx.wall(0x3a2a22);
    const cl = (x) => 0.02 + 0.06 * Math.sin(x * 5 + 0.6);           // the canyon's centre line (z of x)
    const gorge = (x, z) => Math.abs(z - cl(x));
    const hf = (x, z) => {
      const d = gorge(x, z), e = smooth(0, 0.05, this.edgeDist(x, z));
      const t = smooth(0.06, 0.12, d);                                     // 0 in the gorge .. 1 on the rim
      const terr = Math.floor(t * 3) / 3 + smooth(0.8, 1, (t * 3) % 1) / 3;
      return (-0.03 * (1 - terr) + 0.035 * terr) * e + 0.035 * (1 - e) * 0;
    };
    const cf = (x, z, h) => {
      const n = fbm2(x * 24, z * 24, 3), d = gorge(x, z);
      if (d < 0.12) return _c.setRGB(0.5 + n * 0.1, 0.28 + n * 0.06, 0.18 + n * 0.04).multiplyScalar(0.3 + 0.9 * clamp01((h + 0.03) / 0.065) ** 1.5);
      return _c.setRGB(0.36, 0.38, 0.42).multiplyScalar(0.9 + 0.2 * n);
    };
    this.groundMesh(ctx, hf, cf, { sub: 40 });
    const K = new Kit();
    // towers on both rims, tallest right at the lip
    const tl = this.downtown(K, r, { sp: 0.08, skip: (x, z) => gorge(x, z) < 0.13, base: (x, z) => hf(x, z), tall: 1.3, hmul: (x, z) => 0.6 + 1.2 * Math.exp(-(((gorge(x, z) - 0.14) / 0.08) ** 2)), parks: 0.08 });
    this.beacon(ctx, K, tl);
    // lit windows cut into the canyon walls, and balconies on the terraces
    for (let i = 0; i < 70; i++) {
      const x = (r() - 0.5) * 0.9, side = r() < 0.5 ? -1 : 1, d = 0.065 + r() * 0.05, z = cl(x) + side * d;
      if (this.edgeDist(x, z) < 0.03) continue;
      K.box('glow', r() < 0.2 ? 0xbfe8ff : 0xffcf7a, x, hf(x, z) - 0.004 + r() * 0.01, z - side * 0.006, 0.008, 0.006, 0.002, 0);
    }
    for (let i = 0; i < 10; i++) { const x = -0.4 + i * 0.09, z = cl(x) + (i % 2 ? 1 : -1) * 0.09; if (this.edgeDist(x, z) < 0.04) continue; this.tower(K, 'cfac', new THREE.Color(0.8, 0.7, 0.62), x, hf(x, z), z, 0.03, 0.02 + r() * 0.02, 0.025); }
    // bridges across the gorge
    for (const x of [-0.22, 0.05, 0.28]) {
      const z = cl(x), dz = 0.14, y = 0.035 + 0.008;
      if (this.edgeDist(x, z) < 0.05) continue;
      K.box('metal', 0xc8ccd2, x, y, z, 0.022, 0.006, dz * 2 + 0.03);
      K.box('glow', 0x9fe8ff, x - 0.012, y + 0.004, z, 0.002, 0.002, dz * 2);
      K.box('glow', 0x9fe8ff, x + 0.012, y + 0.004, z, 0.002, 0.002, dz * 2);
      K.add('metal', new THREE.TorusGeometry(dz, 0.003, 6, 24, Math.PI).rotateY(Math.PI / 2), 0xc8ccd2, [x, y - 0.002, z], [Math.PI, 0, 0], [1, 0.25, 1]);
    }
    // the floor: a ribbon of lights (a transit line) along the canyon
    for (let i = 0; i < 40; i++) { const x = -0.45 + i * 0.023, z = cl(x); if (this.edgeDist(x, z) < 0.02) continue; K.box('glow', i % 2 ? 0xffb050 : 0xff7040, x, hf(x, z) + 0.002, z, 0.012, 0.002, 0.004, -Math.atan(0.3 * Math.cos(x * 5 + 0.6))); }
    this.emit(K, ctx);
  }

  // Underground City: the city is all below the regolith. On top: natural
  // Martian ground on a gentle berm, and the city showing only through what it
  // needs up here -- a great glass-lensed atrium sunk into the berm (terraced
  // balconies with planters stepping down into a shaft of lit floors, glass
  // lifts, a park and pond at the bottom, warm light rising), small round
  // light wells, vent stacks and heat exchangers breathing steam, a vehicle
  // ramp down to a lit portal with a rover on it, a maglev tube nosing out of a
  // hillock, a landing pad, solar and radiator fields, path lights. More wells,
  // panels and a hopper on the pad as it grows; lichen and shrubs round the
  // atrium's warm lip as the air thickens.
  undergroundCity(ctx) {
    const r = this.env.srand(ctx.space * 103 + 7), g = this.grow, low = gfx.low, life = this.life, inC = this.env.inClearing, NK = this.natureKit();
    ctx.wall(0x33302c);
    // the plan (board units)
    const [ax, az] = [-0.07, -0.1], RL = 0.192, YB = 0.012;                  // the atrium: centre, its lip's outer radius, the berm top
    const RI = 0.155, R1 = 0.132, R2 = 0.11, Y1 = -0.006, Y2 = -0.024;      // lip inner radius; the two terraces' inner radii and floors
    const RX = 0.06, RW = 0.05, RZ0 = 0.25, RZ1 = 0.43, RD = -0.032;       // the vehicle ramp: centre x, width, portal z, top z, depth at the portal
    const [tx, tz] = [-0.25, 0.24], ux = -Math.sqrt(3) / 2, uz = 0.5;      // the maglev tube's mouth and heading (out through the front-left edge)
    const [px, pz] = [0.3, 0.02];                                          // the landing pad
    const road = [[0.262, 0.07], [0.205, 0.2], [0.11, 0.35], [RX, RZ1 + 0.02]];
    const wells = [[0.155, 0.1], [0.05, -0.37], [-0.08, 0.17], [-0.37, 0.05]].slice(0, low ? 2 : 2 + Math.min(2, g)), WR = 0.026;
    const dA = (x, z) => Math.hypot(x - ax, z - az);
    const rampY = (z) => RD * clamp01((RZ1 - z) / (RZ1 - RZ0));
    const inCut = (x, z) => Math.abs(x - RX) < RW / 2 + 0.012 && z > RZ0 - 0.004 && z < RZ1;
    const tAl = (x, z) => (x - tx) * ux + (z - tz) * uz, tAc = (x, z) => -(x - tx) * uz + (z - tz) * ux;
    const segD = (x, z, P) => { let m = 9; for (let i = 0; i + 1 < P.length; i++) { const [x0, z0] = P[i], [x1, z1] = P[i + 1], dx = x1 - x0, dz = z1 - z0, t = clamp01(((x - x0) * dx + (z - z0) * dz) / (dx * dx + dz * dz)); m = Math.min(m, Math.hypot(x - x0 - dx * t, z - z0 - dz * t)); } return m; };
    const hf = (x, z) => {
      const d = dA(x, z);
      if (d < RL) return YB;
      if (inCut(x, z)) return rampY(z) - 0.003;
      const al = tAl(x, z), ac = tAc(x, z), nat = 0.006 * (fbm2(x * 9 + 2, z * 9, 3) - 0.45) + 0.0012 * fbm2(x * 45, z * 45, 2);
      const mound = 0.038 * Math.exp(-((ac / 0.06) ** 2) - (((al + 0.03) / (al < -0.03 ? 0.05 : 0.018)) ** 2));   // the hillock the maglev comes out of
      return Math.max(YB * smooth(RL + 0.08, RL, d) + nat * smooth(RL, RL + 0.08, d), mound + nat) * smooth(0, 0.04, this.edgeDist(x, z));
    };
    const cf = (x, z) => {
      const n = fbm2(x * 22, z * 22, 4), n2 = fbm2(x * 6 + 3, z * 6, 3), d = dA(x, z);
      _c.setRGB(0.58 + n * 0.1, 0.39 + n * 0.07, 0.27 + n * 0.05);
      if (n2 > 0.55) _c.multiplyScalar(1 - 0.9 * Math.min(0.2, n2 - 0.55));                                             // darker basalt patches
      _c.lerp(_c2.setRGB(0.52, 0.43, 0.36), 0.45 * smooth(RL + 0.08, RL, d));                                            // the compacted berm
      if (life > 0.05 && n > 0.45) _c.lerp(_c2.setRGB(0.32, 0.4, 0.2), life * 0.7 * smooth(RL + 0.1, RL, d) * smooth(0.45, 0.6, n));   // lichen on the warm lip
      const rd = segD(x, z, road); if (rd < 0.018) _c.lerp(_c2.setRGB(0.42, 0.38, 0.35), 0.65 * smooth(0.018, 0.008, rd));   // the road
      if (tAl(x, z) > -0.005 && Math.abs(tAc(x, z)) < 0.022) _c.lerp(_c2.setRGB(0.46, 0.45, 0.44), 0.7);                  // the maglev's gravel bed
      if (inCut(x, z)) _c.setRGB(0.28, 0.27, 0.27);
      return _c;
    };
    const geo = this.ground(hf, cf, { sub: low ? 32 : 44 });
    this.holed(geo, (x, z) => dA(x, z) < RL - 0.006);                        // (the lip and terraces fill the hole)
    this.groundMeshGeo(ctx, geo);
    // the atrium: a lit shaft of floors below the terraces
    this.shaft(ctx, ax, az, Y2 + 0.0005, R2, 0.5, 'ucity');
    const K = new Kit();
    const ring = (mat, col, rIn, rOut, y) => K.add(mat, new THREE.RingGeometry(rIn, rOut, 56).rotateX(-Math.PI / 2), col, [ax, y, az]);
    const wallC = (col, rad, y0, y1) => K.add('std2', new THREE.CylinderGeometry(rad, rad, y1 - y0, 56, 1, true), col, [ax, (y0 + y1) / 2, az]);
    ring('std', 0xb4aea6, RI, RL, YB + 0.004); wallC(0xa8a29a, RL, YB - 0.004, YB + 0.004);          // the concrete lip
    wallC(0x9a948c, RI, Y1, YB + 0.004); ring('std', 0x8e8880, R1, RI, Y1);                         // terrace one
    wallC(0x9a948c, R1, Y2, Y1); ring('std', 0x8e8880, R2, R1, Y2);                                 // terrace two
    const green = new THREE.Color().setHSL(0.27 - 0.03 * (1 - life), 0.45, 0.2 + 0.05 * life);
    for (const [rad, y0, y1, pr, edge] of [[RI, Y1, YB + 0.004, RI - 0.0075, R1], [R1, Y2, Y1, R1 - 0.0075, R2]]) {
      // windows round the terrace walls, a lit balcony rail, planters with shrubs
      const N = Math.round(TAU * rad / 0.0125);
      for (let i = 0; i < N; i++) {
        const a = (i + 0.5) / N * TAU; if (r() < 0.28) continue;
        K.box('glow', r() < 0.15 ? 0xbfe8ff : 0xffcf86, ax + Math.cos(a) * (rad - 0.0008), (y0 + y1) / 2 - 0.0035, az + Math.sin(a) * (rad - 0.0008), 0.0075, (y1 - y0) * 0.42, 0.0015, -a - Math.PI / 2);
      }
      K.add('glow', new THREE.TorusGeometry(edge + 0.0015, 0.0011, 4, 64).rotateX(Math.PI / 2), 0xffd28a, [ax, y0 + 0.0035, az]);
      ring('std', green, pr - 0.004, pr + 0.004, y0 + 0.0012);
      if (!low) for (let i = 0; i < 9; i++) { const a = (i + r() * 0.6) / 9 * TAU; K.add('std', NK.broad, (X, Yy) => _c.copy(green).multiplyScalar(0.8 + (Yy - y0) * 20), [ax + Math.cos(a) * pr, y0, az + Math.sin(a) * pr], [0, r() * 6, 0], 0.1 + r() * 0.05); }
    }
    // the glass lens over it: a low glass cap on radial ribs, an oculus ring, a warm glow round its foot
    const LR = RI + 0.003, LH = 0.28, LY = YB + 0.004, lp = (a, t) => [ax + Math.cos(a) * LR * Math.cos(t), LY + LR * LH * Math.sin(t), az + Math.sin(a) * LR * Math.cos(t)];
    K.add(this.domeGlass(), new THREE.SphereGeometry(LR, 48, 12, 0, TAU, 0, Math.PI / 2), 0xffffff, [ax, LY, az], [0, 0, 0], [1, LH, 1]);
    const tO = Math.PI / 2 * 0.86;
    for (let i = 0; i < 16; i++) { const a = i / 16 * TAU; for (let j = 0; j < 5; j++) this.strut(K, 'metal', 0xe0e4ea, lp(a, j / 5 * tO), lp(a, (j + 1) / 5 * tO), 0.0011, 4); }
    for (const [t, w] of [[0, 0.0032], [0.5, 0.0012], [tO, 0.0019]]) K.add('metal', new THREE.TorusGeometry(LR * Math.cos(t), w, 6, t ? 40 : 64).rotateX(Math.PI / 2), 0xd0d4da, [ax, LY + LR * LH * Math.sin(t) + (t ? 0 : w), az]);
    K.add('glow', new THREE.TorusGeometry(RL - 0.004, 0.0016, 4, 64).rotateX(Math.PI / 2), 0xffc070, [ax, YB + 0.0045, az]);
    if (!low) K.add('beam', new THREE.CylinderGeometry(0.15, 0.13, 0.15, 32, 1, true).translate(0, 0.075, 0), (X, Yy) => _c.setRGB(1, 0.72, 0.42).multiplyScalar(0.4 * clamp01(1 - (Yy - LY) / 0.15)), [ax, LY, az]);
    // light wells: small round shafts of floors, each under a glass bubble on a collar
    for (const [x, z] of wells) {
      const y = hf(x, z);
      this.shaft(ctx, x, z, y + 0.004, WR, 0.22, 'ucity');
      K.add('metal', new THREE.TorusGeometry(WR + 0.003, 0.0038, 8, 28).rotateX(Math.PI / 2), 0xa4aab2, [x, y + 0.004, z]);
      K.add('glow', new THREE.TorusGeometry(WR + 0.0075, 0.0012, 4, 28).rotateX(Math.PI / 2), 0xffc878, [x, y + 0.002, z]);
      K.add(this.domeGlass(), new THREE.SphereGeometry(WR + 0.002, 20, 6, 0, TAU, 0, Math.PI / 2), 0xffffff, [x, y + 0.006, z], [0, 0, 0], [1, 0.5, 1]);
      for (const a of [0, Math.PI / 2]) K.add('metal', new THREE.TorusGeometry(WR + 0.002, 0.0009, 4, 16, Math.PI), 0xd0d4da, [x, y + 0.006, z], [0, a, 0], [1, 0.5, 1]);
    }
    // the corridors below, glowing up through lines of glass pavers: atrium to each well and to the portal
    const halls = [...wells.map(([x, z]) => [x, z, WR + 0.014]), [RX, RZ0 - 0.012, 0.012]];
    for (const [x, z, end] of halls) {
      const L = dA(x, z), ang = Math.atan2(z - az, x - ax), c = Math.cos(ang), s = Math.sin(ang);
      for (let d = RL + 0.014; d < L - end; d += 0.017) { const X = ax + c * d, Z = az + s * d; if (!inC(X, Z, 0)) K.box('glow', 0xb08050, X, hf(X, Z) - 0.0004, Z, 0.008, 0.0012, 0.0055, -ang); }
    }
    // the vehicle ramp: a sloping cut between retaining walls, down to a lit portal in its headwall
    const RL2 = RZ1 - RZ0, RS = Math.hypot(RL2, RD);
    K.add('std', BOX, 0x5e5a56, [RX, RD / 2 - 0.002, (RZ0 + RZ1) / 2], [-Math.atan2(-RD, RL2), 0, 0], [RW, 0.004, RS]);
    for (let i = 0; i < 5; i++) { const z = RZ0 + 0.025 + i * 0.034; K.add('std', BOX, 0xe8c040, [RX, rampY(z) + 0.0003, z], [-Math.atan2(-RD, RL2), 0, 0], [0.0025, 0.0008, 0.016]); }   // the centre line
    for (const s of [-1, 1]) {
      K.box('std', 0x8c8680, RX + s * (RW / 2 + 0.006), RD - 0.006, (RZ0 + RZ1) / 2, 0.012, 0.014 - RD, RL2);
      for (let i = 0; i < 6; i++) K.box('glow', 0xffb040, RX + s * (RW / 2 + 0.004), 0.008, RZ0 + 0.02 + i * 0.03, 0.003, 0.0025, 0.004);
    }
    K.box('std', 0x9a948c, RX, RD - 0.006, RZ0 - 0.004, RW + 0.05, 0.022 - RD, 0.014);                                  // the headwall
    K.add('glow', BOX, (X, Yy) => Yy > RD + 0.012 ? _c.setRGB(1, 0.74, 0.42) : _c.setRGB(0.3, 0.17, 0.08), [RX, RD + 0.012, RZ0 + 0.0035], [0, 0, 0], [RW - 0.012, 0.024, 0.001]);   // the lit tunnel inside
    K.box('std', 0x2a2826, RX, RD + 0.024, RZ0 + 0.0035, RW - 0.004, 0.004, 0.002); for (const s of [-1, 1]) K.box('std', 0x2a2826, RX + s * (RW / 2 - 0.004), RD, RZ0 + 0.0035, 0.004, 0.026, 0.002);
    K.box('glow', 0xffd890, RX, 0.011, RZ0 + 0.0035, RW + 0.03, 0.0025, 0.0012);                                          // its lit fascia
    for (const s of [-1, 1]) { K.cyl('metal', 0x3a3a3a, RX + s * 0.042, 0.016, RZ0 - 0.004, 0.0012, 0.0012, 0.018, 4); K.add('glow', BALL, 0xffe2a8, [RX + s * 0.042, 0.035, RZ0 - 0.004], [0, 0, 0], 0.003); }
    // rovers: one heading down the ramp, one by the pad
    const rover = (x, y, z, a, p, col) => {
      const M = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0, a, p, 'YZX')), o = (lx, ly, lz) => new V3(lx, ly, lz).applyMatrix4(M).add(new V3(x, y, z)).toArray(), R = [0, a, p, 'YZX'];
      K.add('std', BOX, col, o(0, 0.012, 0), R, [0.036, 0.01, 0.02]);
      K.add('std', BOX, 0xd8dce2, o(0.006, 0.021, 0), R, [0.018, 0.009, 0.017]);
      K.add('glow', BOX, 0x9fe8ff, o(0.0152, 0.021, 0), R, [0.001, 0.005, 0.014]);
      for (const s of [-1, 1]) { K.add('glow', BOX, 0xfff4d8, o(0.0182, 0.013, s * 0.007), R, [0.001, 0.003, 0.004]); K.add('glow', BOX, 0xff3020, o(-0.0182, 0.013, s * 0.007), R, [0.001, 0.003, 0.004]); }
      for (const lx of [-0.012, 0, 0.012]) for (const s of [-1, 1]) K.add('std', WHEEL, 0x2a2a2c, o(lx, 0.006, s * 0.0115), [Math.PI / 2, a, p, 'YZX'], [0.006, 0.005, 0.006]);
      K.add('metal', BOX, 0xc0c4ca, o(-0.01, 0.024, 0.005), R, [0.001, 0.014, 0.001]);
    };
    const WHEEL = (this.geoCache ||= {}).ucWheel ||= new THREE.CylinderGeometry(1, 1, 1, 10);
    rover(RX, rampY(0.34) + 0.001, 0.34, Math.PI / 2, -Math.atan2(-RD, RL2), 0xe8e2d6);
    if (g >= 1) rover(0.215, hf(0.215, 0.0), 0.0, 2.2, 0, 0xd8a040);
    // the maglev: a tube nosing out of its hillock, a shuttle waiting in the mouth, the guideway out to the edge
    const tb = Math.atan2(ux, uz);
    let TL = 0; while (TL < 0.3 && this.edgeDist(tx + ux * (TL + 0.005), tz + uz * (TL + 0.005)) > 0.004) TL += 0.005;
    const ta = (l, y = 0) => [tx + ux * l, y, tz + uz * l];                                    // (a point on the line, l along it)
    K.add('std', BOX, 0x9a948c, ta(-0.012, 0.017), [0, tb, 0], [0.072, 0.042, 0.012]);                                  // the portal's headwall in the hillside
    K.add('glow', BOX, 0x5fe0ff, ta(-0.0058, 0.0365), [0, tb, 0], [0.06, 0.0022, 0.001]);
    K.add('std', new THREE.CircleGeometry(0.0185, 24), 0x14161a, ta(-0.0055, 0.019), [0, tb, 0]);
    K.add('std2', new THREE.CylinderGeometry(0.02, 0.02, 0.02, 24, 1, true).rotateX(Math.PI / 2), 0xdfe3e8, ta(0.004, 0.019), [0, tb, 0]);   // its hood
    K.add('glow', new THREE.TorusGeometry(0.02, 0.0022, 6, 24), 0x5fe0ff, ta(0.014, 0.019), [0, tb, 0]);
    K.add('std', capsuleX(0.011, 0.03, 12), 0xf2f2f2, ta(-0.012, 0.016), [0, tb - Math.PI / 2, 0], 1, { smooth: true });
    K.add('glow', BOX, 0x9fe8ff, ta(-0.012, 0.0195), [0, tb, 0], [0.0232, 0.0026, 0.03]);
    K.box('std', 0x8a8e96, tx + ux * TL / 2, 0, tz + uz * TL / 2, 0.02, 0.005, TL, tb);
    K.box('glow', 0x5fe0ff, tx + ux * TL / 2, 0.005, tz + uz * TL / 2, 0.003, 0.0008, TL, tb);
    // the landing pad, and a hopper on it once the city is up and running
    K.cyl('std', 0x5a5e66, px, 0, pz, 0.066, 0.066, 0.005, 36);
    K.add('glow', new THREE.TorusGeometry(0.056, 0.0018, 4, 48).rotateX(Math.PI / 2), 0xffb040, [px, 0.0055, pz]);
    for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + 0.4; K.add('blinkA', BALL, 0xffffff, [px + Math.cos(a) * 0.064, 0.007, pz + Math.sin(a) * 0.064], [0, 0, 0], 0.0028); }
    if (g >= 2) {
      K.add('std', lathe([[0.001, 0], [0.017, 0.003], [0.02, 0.018], [0.014, 0.034], [0.006, 0.044], [0.001, 0.046]], 20), 0xeceef2, [px, 0.013, pz]);
      for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + 0.4; this.strut(K, 'metal', 0x8a8e96, [px + Math.cos(a) * 0.028, 0.005, pz + Math.sin(a) * 0.028], [px + Math.cos(a) * 0.016, 0.02, pz + Math.sin(a) * 0.016], 0.0016, 4); }
      K.box('glow', 0x9fe8ff, px, 0.042, pz + 0.013, 0.012, 0.005, 0.002);
    } else { for (const s of [-1, 1]) K.box('std', 0xe8e8e8, px + s * 0.013, 0.005, pz, 0.006, 0.0008, 0.042); K.box('std', 0xe8e8e8, px, 0.005, pz, 0.026, 0.0008, 0.006); }   // (a painted H)
    // the utility yard: vent stacks, a heat exchanger with its fans, radiator fins
    const stacks = [[0.255, -0.27, 0.1], [0.33, -0.2, 0.075]];
    for (const [x, z, h] of stacks) {
      const y = hf(x, z);
      K.cyl('std', 0x8c8680, x, y - 0.003, z, 0.022, 0.02, 0.009, 16);
      K.cyl('metal', 0x8a8e96, x, y, z, 0.013, 0.01, h, 14);
      K.cyl('std', 0xb8402a, x, y + h - 0.016, z, 0.0108, 0.0105, 0.007, 14);
      K.cyl('metal', 0x5a5e66, x, y + h, z, 0.0115, 0.0115, 0.003, 14);
      K.add('blink', BALL, 0xffffff, [x, y + h + 0.006, z], [0, 0, 0], 0.003);
    }
    const [hx, hz, hr] = [0.15, -0.3, 0.5], hy = hf(hx, hz), hc = Math.cos(hr), hs = Math.sin(hr);
    K.box('metal', 0xa4aab2, hx, hy - 0.002, hz, 0.074, 0.024, 0.04, hr);
    for (let i = 0; i < 9; i++) for (const s of [-1, 1]) { const l = -0.032 + i * 0.008; K.box('std', 0x3a3e44, hx + hc * l + hs * s * 0.0202, hy + 0.002, hz - hs * l + hc * s * 0.0202, 0.004, 0.014, 0.001, hr); }
    const fans = [-0.018, 0.018].map((l) => [hx + hc * l, hz - hs * l]);
    for (const [x, z] of fans) { K.cyl('std', 0x24272c, x, hy + 0.022, z, 0.013, 0.013, 0.0015, 18); K.add('metal', new THREE.TorusGeometry(0.0135, 0.0014, 4, 18).rotateX(Math.PI / 2), 0xc8ccd2, [x, hy + 0.0235, z]); }
    K.box('glow', 0x4dff7a, hx + hc * 0.037, hy + 0.012, hz - hs * 0.037, 0.001, 0.003, 0.003, hr);
    for (let i = 0; i < 3; i++) {
      const x = 0.372 + i * 0.024, z = -0.105, y = hf(x, z);
      K.box('metal', 0xe8ecf0, x, y + 0.007, z, 0.0025, 0.026, 0.07);
      for (const s of [-1, 1]) K.box('metal', 0x6a6e76, x, y - 0.002, z + s * 0.028, 0.002, 0.01, 0.003);
    }
    // the solar field on the berm's back-left flank (more rows as it grows)
    for (const z of [-0.32, -0.27, -0.22, -0.17, -0.12].slice(0, 2 + g)) for (let i = 0; i < 4; i++) {
      const x = -0.425 + i * 0.047;
      if (this.edgeDist(x, z) < 0.03 || dA(x, z) < RL + 0.03) continue;
      const y = hf(x, z);
      K.box('metal', 0x6a6e76, x, y - 0.002, z, 0.003, 0.012, 0.003);
      K.add('glass', BOX, 0x2c4a8a, [x, y + 0.011, z], [0.45, 0, 0], [0.042, 0.002, 0.03]);
      for (const l of [-0.007, 0.007]) K.add('metal', BOX, 0xb8c0cc, [x + l, y + 0.0112, z], [0.45, 0, 0], [0.0008, 0.0022, 0.03]);   // (the cell seams)
      K.add('metal', BOX, 0xc8ccd2, [x, y + 0.0098, z], [0.45, 0, 0], [0.044, 0.0012, 0.032]);
    }
    // the road from the pad to the ramp, with path lights
    for (let i = 0; i + 1 < road.length; i++) {
      const [x0, z0] = road[i], [x1, z1] = road[i + 1], L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(L / 0.05));
      for (let j = 0; j < n; j++) {
        const t = (j + 0.5) / n, s = (i + j) % 2 ? 1 : -1, x = x0 + (x1 - x0) * t + s * (z1 - z0) / L * 0.02, z = z0 + (z1 - z0) * t - s * (x1 - x0) / L * 0.02, y = hf(x, z);
        if (inCut(x, z) || inC(x, z, 0)) continue;
        K.cyl('metal', 0x3a3a3a, x, y, z, 0.0009, 0.0009, 0.014, 4); K.add('glow', BALL, 0xffe2a8, [x, y + 0.015, z], [0, 0, 0], 0.0022);
      }
    }
    // loose rock, emergency hatches, and shrubs round the lip once the air allows
    const occ = [[ax, az, RL + 0.015], [RX, (RZ0 + RZ1) / 2, 0.1], [tx - ux * 0.04, tz - uz * 0.04, 0.07], [px, pz, 0.08], [0.28, -0.24, 0.07], [0.15, -0.3, 0.05], [0.395, -0.105, 0.045], [-0.35, -0.24, 0.1], [0.2, -0.1, 0.035], ...wells.map(([x, z]) => [x, z, WR + 0.012])];
    const free = (x, z, pad) => this.edgeDist(x, z) > 0.03 && !inC(x, z, 0.02) && segD(x, z, road) > 0.022 && !(tAl(x, z) > -0.01 && Math.abs(tAc(x, z)) < 0.03) && occ.every(([X, Z, R]) => Math.hypot(x - X, z - Z) > R + pad) && halls.every(([X, Z]) => segD(x, z, [[ax, az], [X, Z]]) > pad + 0.008);
    for (let i = 0; i < (low ? 8 : 18); i++) {
      const x = (r() - 0.5) * 0.86, z = (r() - 0.5) * 0.96, s = 0.006 + r() * 0.01;
      if (!free(x, z, s)) continue;
      K.add('std', NK.rock, _c2.setRGB(0.42 + r() * 0.12, 0.3 + r() * 0.06, 0.22 + r() * 0.04), [x, hf(x, z) + s * 0.2, z], [r(), r() * 6, 0], [s, s * 0.6, s * 0.85]);
    }
    for (let i = 0, n = 0; i < 12 && n < 3; i++) {
      const x = (r() - 0.5) * 0.8, z = (r() - 0.5) * 0.85;
      if (!free(x, z, 0.025)) continue;
      n++; occ.push([x, z, 0.02]);
      const y = hf(x, z);
      K.cyl('metal', 0x9aa0a8, x, y - 0.002, z, 0.016, 0.015, 0.007, 16); K.cyl('std', 0x2a2c30, x, y + 0.005, z, 0.011, 0.011, 0.001, 16); K.add('blinkA', BALL, 0xffffff, [x + 0.016, y + 0.007, z], [0, 0, 0], 0.0028);
    }
    if (life > 0.3 && !low) for (let i = 0; i < Math.round(life * 16); i++) {
      const a = r() * TAU, d = RL + 0.012 + r() * 0.05, x = ax + Math.cos(a) * d, z = az + Math.sin(a) * d;
      if (this.edgeDist(x, z) < 0.03 || inC(x, z, 0.02) || segD(x, z, road) < 0.02 || occ.slice(1).some(([X, Z, R]) => Math.hypot(x - X, z - Z) < R + 0.01)) continue;
      const y = hf(x, z), hue = 0.27 + r() * 0.04;
      K.add('std', NK.broad, (X, Yy) => _c.setHSL(hue, 0.5, 0.16 + (Yy - y) * 12), [x, y, z], [0, r() * 6, 0], 0.14 + r() * 0.12);
    }
    this.emit(K, ctx);
    const pl = stacks.map(([x, z, h]) => ({ x, z, y: hf(x, z) + h + 0.004, n: low ? 3 : 5, life: 4, rise: 0.18, size: 0.06, col: [0.95, 0.95, 0.95, 0.35], drift: [0.05, -0.03] }));
    if (!low) for (const [x, z] of fans) pl.push({ x, z, y: hy + 0.024, n: 3, life: 2.5, rise: 0.07, size: 0.035, col: [1, 1, 1, 0.22], drift: [0.02, -0.02] });
    this.puffs(ctx, pl);
    this.cityEmblem(ctx, 0.2, -0.1);
  }

  // Immigrant City: a dense, colourful sprawl of stacked container homes
  // along narrow lanes, a colony transport just landed on its pad, cranes
  // still stacking more.
  immigrantCity(ctx) {
    const r = this.env.srand(ctx.space * 107 + 9), g = this.grow;
    ctx.wall(0x2c2e34);
    this.streetGround(ctx, { sp: 0.06, tint: '#3a3632' });
    const K = new Kit(), cols = [0xc0392b, 0x2980b9, 0x27ae60, 0xd68910, 0x8e44ad, 0x16a085, 0xd35400, 0xbdc3c7, 0xf1c40f];
    const [px, pz] = [0.1, -0.2];
    this.lattice(0.06, 0.04, (x, z) => Math.hypot(x - px, z - pz) < 0.13, (x, z, core) => {
      if (r() < 0.12 - g * 0.03) return;
      const n = 1 + Math.floor(r() * (1.5 + core * 2.5 + g * 0.6));
      for (let k = 0; k < n; k++) {
        const ry = (r() < 0.5 ? 0 : Math.PI / 2) + (r() - 0.5) * 0.15;
        this.tower(K, 'cfac', new THREE.Color(cols[Math.floor(r() * cols.length)]).lerp(new THREE.Color(1, 1, 1), 0.25), x + (r() - 0.5) * 0.01, k * 0.022, z + (r() - 0.5) * 0.01, 0.045, 0.021, 0.022, ry);
      }
      if (r() < 0.3) K.box('std', 0x3f7a34, x, n * 0.022, z, 0.03, 0.004, 0.018);         // roof gardens
      if (r() < 0.25) K.cyl('std', 0x6a8aa8, x + 0.012, n * 0.022, z, 0.007, 0.007, 0.012, 10);   // water tanks
    });
    // the landing pad and the colony transport
    K.cyl('std', 0x5a5e66, px, 0, pz, 0.12, 0.12, 0.006, 40);
    K.add('glow', new THREE.TorusGeometry(0.105, 0.003, 6, 48).rotateX(Math.PI / 2), 0xffb040, [px, 0.007, pz]);
    K.add('std', lathe([[0.001, 0], [0.035, 0.005], [0.042, 0.04], [0.04, 0.1], [0.03, 0.14], [0.012, 0.165], [0.001, 0.17]], 28), 0xe8eaee, [px, 0.02, pz]);
    for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + 0.4; K.box('std', 0xc0392b, px + Math.cos(a) * 0.045, 0.02, pz + Math.sin(a) * 0.045, 0.004, 0.06, 0.03, -a); K.cyl('metal', 0x5a5e66, px + Math.cos(a) * 0.05, 0, pz + Math.sin(a) * 0.05, 0.004, 0.003, 0.025, 6); }
    K.box('glow', 0x9fe8ff, px, 0.11, pz + 0.041, 0.02, 0.008, 0.002);
    if (g < 3) this.crane(K, -0.2, -0.1, 0.16, 1.2);
    this.emit(K, ctx);
  }

  // Urbanized Area: a dense megablock of slab towers knitted together by lit
  // sky-bridges, with an elevated transit loop threading between them.
  urbanCity(ctx) {
    const r = this.env.srand(ctx.space * 109 + 1), g = this.grow;
    ctx.wall(0x26282e);
    this.streetGround(ctx, { sp: 0.1 });
    const K = new Kit(), tops = [];
    this.lattice(0.1, 0.05, null, (x, z, core) => {
      const h = (0.1 + core * 0.2 + r() * 0.1) * (0.8 + 0.12 * g) * (this.env.inClearing(x, z, 0.1) ? 0.4 : 1);
      const glass = r() < 0.5, w = 0.055 + r() * 0.025, d = 0.045 + r() * 0.025;
      if (r() < 0.2) this.rtower(K, 'cglass', new THREE.Color(0.72, 0.84, 0.96), x, 0, z, 0.032, h);
      else {
        this.tower(K, glass ? 'cglass' : 'cfac', glass ? new THREE.Color(0.7, 0.82, 0.95) : new THREE.Color().setHSL(0.6, 0.08, 0.78 + r() * 0.15), x, 0, z, w, h * 0.7, d);
        this.tower(K, glass ? 'cglass' : 'cfac', glass ? new THREE.Color(0.76, 0.86, 0.98) : new THREE.Color().setHSL(0.6, 0.08, 0.82 + r() * 0.12), x, h * 0.7, z, w * 0.75, h * 0.3, d * 0.75);
      }
      K.box('std', 0xa8aeb6, x, h, z, 0.03, 0.008, 0.025);
      tops.push([x, z, h]);
    });
    // sky-bridges between neighbours
    for (let i = 0; i < tops.length; i++) for (let j = i + 1; j < tops.length; j++) {
      const [x0, z0, h0] = tops[i], [x1, z1, h1] = tops[j], L = Math.hypot(x1 - x0, z1 - z0);
      if (L > 0.105 || r() > 0.55) continue;
      const y = Math.min(h0, h1) * (0.5 + r() * 0.35), ang = Math.atan2(z1 - z0, x1 - x0);
      K.box('cglass' === 'x' ? 'std' : 'metal', 0xc8ccd2, (x0 + x1) / 2, y, (z0 + z1) / 2, L, 0.012, 0.016, -ang);
      K.box('glow', 0x9fe8ff, (x0 + x1) / 2, y + 0.004, (z0 + z1) / 2, L - 0.06, 0.004, 0.0165, -ang);
    }
    // the elevated transit loop
    K.add('metal', new THREE.TorusGeometry(0.3, 0.006, 8, 64).rotateX(Math.PI / 2), 0xd8dce2, [0, 0.07, 0], [0, 0, 0], [1, 1, 0.95]);
    K.add('glow', new THREE.TorusGeometry(0.3, 0.0025, 6, 64).rotateX(Math.PI / 2), 0xff5ad0, [0, 0.077, 0], [0, 0, 0], [1, 1, 0.95]);
    for (let i = 0; i < 12; i++) { const a = i / 12 * TAU, x = Math.cos(a) * 0.3, z = Math.sin(a) * 0.285; if (this.env.inClearing(x, z, 0.01)) continue; K.cyl('metal', 0x8a8e96, x, 0, z, 0.004, 0.004, 0.07, 6); }
    this.emit(K, ctx);
    const train = new THREE.Group(), tk = new Kit();
    for (let i = 0; i < 4; i++) { const a = i * 0.09; tk.add('std', capsuleX(0.008, 0.02, 10), 0xf2f2f2, [Math.cos(a) * 0.3, 0.084, Math.sin(a) * 0.285], [0, -a - Math.PI / 2, 0]); }
    tk.add('glow', BALL, 0xffffff, [Math.cos(0.3) * 0.3, 0.084, Math.sin(0.3) * 0.285], [0, 0, 0], 0.005);
    for (const [key, list] of tk.by) train.add(new THREE.Mesh(mergeGeometries(list), this.mat(key)));
    this.spin(this.place(train, ctx, 0, 0, 0), -0.5, r() * 6);
  }

  // Open City: no dome -- the air is breathable. Garden towers stepped with
  // green terraces, tree-lined boulevards, lawns and ponds, birds.
  openCity(ctx) {
    const r = this.env.srand(ctx.space * 113 + 3), NK = this.natureKit();
    ctx.wall(0x2c3a2a);
    this.groundMesh(ctx, () => 0, (x, z) => { const n = fbm2(x * 20, z * 20, 3), road = Math.abs(x % 0.12) < 0.012 || Math.abs(z % 0.12) < 0.012; return road ? _c.setRGB(0.55, 0.55, 0.52) : _c.setHSL(0.26, 0.4, 0.26 + 0.06 * n); }, { sub: 24 });
    const K = new Kit();
    const tl = this.downtown(K, r, { sp: 0.1, tall: 1.2, parks: 0.2, tint: () => new THREE.Color().setHSL(0.1, 0.15, 0.88),
      park: (x, z) => { for (let i = 0; i < 3; i++) K.add('std', NK.broad, (X, Yy) => _c.setHSL(0.27 + r() * 0.05, 0.5, 0.17 + Yy * 2.3), [x + (r() - 0.5) * 0.06, 0, z + (r() - 0.5) * 0.06], [0, r() * 6, 0], 0.6 + r() * 0.3); } });
    // terraced gardens on the tallest tower, and trees everywhere along the roads
    for (let k = 0; k < 4; k++) K.box('std', 0x3f8a3a, tl.x, tl.h * (0.3 + k * 0.17), tl.z, 0.085, 0.006, 0.075);
    for (let i = 0; i < 40; i++) { const x = (r() - 0.5) * 0.85, z = (r() - 0.5) * 0.95; if (this.edgeDist(x, z) < 0.03 || this.env.inClearing(x, z, 0.02)) continue; K.add('std', NK.broad, (X, Yy) => _c.setHSL(0.26 + r() * 0.06, 0.5, 0.18 + Yy * 2.4), [x, 0, z], [0, r() * 6, 0], 0.35 + r() * 0.2); }
    K.add('water', new THREE.CircleGeometry(0.05, 24).rotateX(-Math.PI / 2), 0xffffff, [-0.22, 0.003, 0.2], [0, 0, 0], [1.4, 1, 1]);
    this.emit(K, ctx);
    this.flock(ctx, NK.eagle, 4, 0, 0, 0.36, 0.12, 0.5, ctx.space + 5);
  }

  // Lava Tube Settlement: living inside a collapsed lava tube -- a sinuous
  // basalt ridge (the tube's roof) with glowing skylights, arched portals at
  // its ends, habitats and a landing pad on the flank.
  lavaTubeCity(ctx) {
    const g = this.grow;
    ctx.wall(0x2a221e);
    const ridge = (x) => -0.06 + 0.1 * Math.sin(x * 4.2 + 0.4);
    const hf = (x, z) => { const d = Math.abs(z - ridge(x)); return (0.075 * Math.exp(-((d / 0.11) ** 2)) + 0.005 * fbm2(x * 20, z * 20, 3)) * smooth(0, 0.07, this.edgeDist(x, z)); };
    this.groundMesh(ctx, hf, (x, z, h) => {
      const n = fbm2(x * 24, z * 24, 3), crack = fbm2(x * 40 + 3, z * 40, 2) > 0.66 ? 0.6 : 1;
      return _c.setRGB(0.2 + n * 0.08, 0.15 + n * 0.06, 0.13 + n * 0.05).multiplyScalar((0.9 + h * 7) * crack);
    }, { sub: 40 });
    const K = new Kit();
    // skylights along the crest: the atrium shader, warm-lit, each with a soft light column
    const sky = [-0.3, -0.12, 0.06, 0.24].slice(0, 2 + Math.min(2, g + 1));
    for (const x of sky) {
      const z = ridge(x); if (this.edgeDist(x, z) < 0.08) continue;
      const y = hf(x, z);
      this.shaft(ctx, x, z, y + 0.002, 0.045, 0.35, 'atrium');
      K.add('metal', new THREE.TorusGeometry(0.047, 0.005, 8, 28).rotateX(Math.PI / 2), 0xa8aeb6, [x, y + 0.003, z]);
      K.add('beam', new THREE.CylinderGeometry(0.05, 0.04, 0.14, 20, 1, true).translate(0, 0.07, 0), (X, Yy) => _c.setRGB(1, 0.8, 0.5).multiplyScalar(0.7 * (1 - Yy / 0.14)), [x, y, z]);
    }
    // a lit path along the crest between the skylights
    for (let i = 0; i < 26; i++) { const x = -0.4 + i * 0.032, z = ridge(x) + 0.055; if (this.edgeDist(x, z) < 0.03) continue; K.add('glow', BALL, 0xffc870, [x, hf(x, z) + 0.003, z], [0, 0, 0], 0.0035); }
    // the portal: a lit arch into the tube's end
    { const x = 0.33, z = ridge(x), y = hf(x, z) * 0.2;
      K.add('std', new THREE.TorusGeometry(0.05, 0.011, 10, 24, Math.PI), 0x9aa0a8, [x, y, z], [0, Math.PI / 2 + 0.3, 0]);
      K.add('glow', new THREE.CircleGeometry(0.046, 20, 0, Math.PI), 0xffc870, [x + 0.004, y, z], [0, Math.PI / 2 + 0.3, 0]);
      K.box('std', 0x3a3a3a, x + 0.06, 0, z + 0.02, 0.09, 0.004, 0.05, -0.3); }
    // habitats on the flank: domed modules with lit bands, a landing pad
    for (let i = 0; i < 4 + g; i++) {
      const x = -0.34 + i * 0.12, z = ridge(x) + 0.2 + (i % 2) * 0.05; if (this.edgeDist(x, z) < 0.05 || this.env.inClearing(x, z, 0.03)) continue;
      K.cyl('std', 0xd8dce2, x, 0, z, 0.03, 0.03, 0.022, 20); K.add('std', new THREE.SphereGeometry(0.03, 20, 10, 0, TAU, 0, Math.PI / 2), 0xe8ecf0, [x, 0.022, z], [0, 0, 0], [1, 0.6, 1]);
      K.add('glow', new THREE.CylinderGeometry(0.0305, 0.0305, 0.006, 20, 1, true), 0xffe2a8, [x, 0.012, z]);
    }
    K.cyl('std', 0x5a5e66, -0.2, 0, 0.1, 0.06, 0.06, 0.005, 32); K.add('glow', new THREE.TorusGeometry(0.052, 0.0025, 6, 32).rotateX(Math.PI / 2), 0xffb040, [-0.2, 0.006, 0.1]);
    this.emit(K, ctx);
    this.cityEmblem(ctx, -0.12, 0.34);
  }


  // Corporate Stronghold: a black-glass monolith HQ edged in gold light,
  // inside a fortified hex wall with corner turrets and a gatehouse.
  strongholdCity(ctx) {
    const r = this.env.srand(ctx.space * 131 + 1), g = this.grow, HR = this.HEX_R, sp = 0.1;
    ctx.wall(0x1e1e22);
    this.streetGround(ctx, { sp, tint: '#23242a' });
    const K = new Kit(), gold = 0xffc84a;
    // the headquarters: a 2x2 block of the street lattice (centred on a street crossing), faces square to the streets
    const cx = -0.05, cz = -0.05, W2 = sp + sp * 0.74, H = 0.34 + 0.03 * g;
    this.tower(K, 'cglass', new THREE.Color(0.25, 0.26, 0.3), cx, 0, cz, W2, H, W2, 0);
    this.tower(K, 'cglass', new THREE.Color(0.3, 0.31, 0.36), cx, H, cz, W2 * 0.7, 0.05, W2 * 0.7, 0);          // a setback crown
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) K.box('glow', gold, cx + sx * W2 / 2, 0, cz + sz * W2 / 2, 0.004, H, 0.004);
    K.box('glow', gold, cx, H - 0.01, cz, W2 + 0.004, 0.006, W2 + 0.004);
    K.box('std', 0x3a3a40, cx, 0, cz, W2 + 0.03, 0.012, W2 + 0.03);                                          // plaza plinth along the streets
    K.cyl('metal', 0x2a2a2e, cx, H + 0.05, cz, 0.02, 0.01, 0.06, 8); K.add('blink', BALL, 0xffffff, [cx, H + 0.114, cz], [0, 0, 0], 0.006);
    // lesser towers inside the wall, on the other blocks
    this.downtown(K, r, { sp, inside: (x, z) => this.edgeDist(x, z) > 0.08 && !(Math.abs(x - cx) < sp && Math.abs(z - cz) < sp), tall: 0.8, parks: 0.05 });
    // the wall, turrets, gatehouse
    const WR = HR * 0.86;
    for (let k = 0; k < 6; k++) {
      const [x0, z0] = hexCorner(k, WR), [x1, z1] = hexCorner(k + 1, WR), L = Math.hypot(x1 - x0, z1 - z0), a = Math.atan2(z1 - z0, x1 - x0);
      K.box('std', 0x4a4c52, (x0 + x1) / 2, 0, (z0 + z1) / 2, L, 0.045, 0.018, -a);
      K.box('glow', gold, (x0 + x1) / 2, 0.045, (z0 + z1) / 2, L, 0.003, 0.019, -a);
      K.cyl('std', 0x3a3c42, x0, 0, z0, 0.026, 0.022, 0.07, 12); K.add('blink', BALL, 0xffffff, [x0, 0.075, z0], [0, 0, 0], 0.005);
    }
    this.emit(K, ctx);
  }

  // Early / Self-Sufficient Settlement: a frontier habitat -- inflatable
  // domes and half-cylinder hab modules, greenhouse tunnels glowing green,
  // a solar farm, a comms mast and a rover.
  settlementCity(ctx) {
    const r = this.env.srand(ctx.space * 137 + 3), g = this.grow;
    ctx.wall(0x3a2c22);
    this.groundMesh(ctx, (x, z) => 0.003 * fbm2(x * 14, z * 14, 3), (x, z) => {
      const n = fbm2(x * 22, z * 22, 3), path = Math.abs(z - 0.02 - 0.05 * Math.sin(x * 7)) < 0.014 || Math.abs(x + 0.02) < 0.012;
      return path ? _c.setRGB(0.45, 0.33, 0.25) : _c.setRGB(0.6 + n * 0.1, 0.41 + n * 0.07, 0.29 + n * 0.05);
    }, { sub: 18 });
    const K = new Kit(), W1 = 0xeeeeea, ORG = 0xff7a2a;
    // hab modules: ribbed half-cylinders, porthole windows, an airlock and a coloured stripe
    const hab = (x, z, L, ry, stripe) => {
      const c = Math.cos(ry), s = Math.sin(ry);
      K.add('std', new THREE.CylinderGeometry(0.032, 0.032, L, 24).rotateX(Math.PI / 2), W1, [x, 0, z], [0, ry, 0]);
      for (let i = 0; i <= 4; i++) { const t = (i / 4 - 0.5) * L; K.add('std', new THREE.TorusGeometry(0.0325, 0.0022, 6, 20, Math.PI), 0xb8bcc4, [x + s * t, 0, z + c * t], [0, ry, 0]); }
      K.add('std', new THREE.TorusGeometry(0.0327, 0.003, 6, 24, Math.PI), stripe, [x, 0, z], [0, ry, 0], [1, 1, 3]);
      for (let i = 0; i < 3; i++) { const t = (i - 1) * L * 0.28; for (const sd of [-1, 1]) K.add('glow', new THREE.CircleGeometry(0.0045, 10), 0xffe2a8, [x + s * t + c * sd * 0.0325 * 0.72, 0.022, z + c * t - s * sd * 0.0325 * 0.72], [0, ry + (sd > 0 ? Math.PI / 2 : -Math.PI / 2), 0], 1); }
      K.add('std', new THREE.CylinderGeometry(0.014, 0.014, 0.03, 14).rotateX(Math.PI / 2), 0xc8ccd2, [x + s * (L / 2 + 0.012), 0.014, z + c * (L / 2 + 0.012)], [0, ry, 0]);
    };
    hab(-0.1, -0.12, 0.15, 0.2, ORG); hab(0.1, -0.16, 0.13, -0.5, 0x2a7ad8); hab(-0.26, 0.06, 0.11, 1.3, ORG);
    if (g >= 1) hab(0.04, 0.12, 0.11, 0.9, 0x2aa84a);
    if (g >= 2) hab(-0.12, 0.28, 0.1, -0.2, 0x2a7ad8);
    // greenhouse tunnels: glass half-cylinders over crop rows
    for (let i = 0; i < 2 + Math.min(2, g); i++) {
      const x = 0.24, z = -0.36 + i * 0.07; if (this.edgeDist(x, z) < 0.05 || this.env.inClearing(x, z, 0.03)) continue;
      K.add(this.domeGlass(), new THREE.CylinderGeometry(0.026, 0.026, 0.13, 18, 1, true, -Math.PI / 2, Math.PI).rotateZ(Math.PI / 2), 0xffffff, [x, 0, z]);
      for (let j = -2; j <= 2; j++) K.add('std', new THREE.TorusGeometry(0.0265, 0.0015, 4, 14, Math.PI), 0xd8dce2, [x + j * 0.03, 0, z], [0, Math.PI / 2, 0]);
      for (let j = -1; j <= 1; j++) K.box('std', 0x4aa83a, x, 0.002, z + j * 0.012, 0.12, 0.006, 0.007);
      K.box('glow', 0xff66dd, x, 0.022, z, 0.12, 0.002, 0.004);                         // grow lights
    }
    // a lander on its pad
    const [lx, lz] = [0.3, 0.06];
    K.cyl('std', 0x5a5e66, lx, 0, lz, 0.06, 0.06, 0.004, 28); K.add('glow', new THREE.TorusGeometry(0.052, 0.002, 6, 28).rotateX(Math.PI / 2), 0xffb040, [lx, 0.005, lz]);
    K.add('std', lathe([[0.03, 0], [0.034, 0.02], [0.03, 0.045], [0.018, 0.06], [0.001, 0.064]], 20), 0xe4e4e0, [lx, 0.016, lz]);
    for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + 0.4; K.add('metal', new THREE.CylinderGeometry(0.002, 0.002, 0.03, 5), 0x9a9ea6, [lx + Math.cos(a) * 0.036, 0.012, lz + Math.sin(a) * 0.036], [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5]); }
    // solar farm: tilted panel rows
    for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) { const x = -0.33 + j * 0.05, z = 0.2 + i * 0.05; if (this.edgeDist(x, z) < 0.03) continue; K.add('std', BOX, 0x22346a, [x, 0.014, z], [-0.5, 0, 0], [0.042, 0.003, 0.03]); K.cyl('metal', 0x8a8e96, x, 0, z, 0.002, 0.002, 0.012, 4); }
    // two small wind turbines (their rotors turn), a comms mast, a rover
    this.emit(K, ctx);
    for (const [x, z] of [[-0.36, -0.2], [-0.02, -0.34]]) {
      if (this.edgeDist(x, z) < 0.03) continue;
      const T = new Kit(); T.cyl('metal', 0xe8e8e8, x, 0, z, 0.004, 0.0025, 0.13, 8); T.box('std', 0xdddddd, x, 0.126, z + 0.004, 0.008, 0.008, 0.014); this.emit(T, ctx);
      const rot = new THREE.Group(), rk = new Kit();
      for (let b = 0; b < 3; b++) rk.add('std', new THREE.BoxGeometry(0.004, 0.05, 0.0015).translate(0, 0.025, 0), 0xf4f4f4, [0, 0, 0], [0, 0, b / 3 * TAU]);
      for (const [key, list] of rk.by) rot.add(new THREE.Mesh(mergeGeometries(list), this.mat(key)));
      const { p, q } = this.b.frameAt(ctx.cell, x, z + 0.012, ctx.H + 0.13 * this.kOf(ctx.cell), true);
      rot.position.copy(p).sub(ctx.cell.center); rot.quaternion.copy(q); rot.scale.setScalar(this.kOf(ctx.cell)); ctx.g.add(rot);
      const q0 = q.clone(), ph = r() * 6, Z = new V3(0, 0, 1);
      this.anim.push({ o: rot, f: (t) => rot.quaternion.copy(q0).multiply(_q.setFromAxisAngle(Z, ph + t * 2.2)) });
    }
    const M2 = new Kit();
    M2.cyl('metal', 0xc8c8c8, 0.34, 0, -0.14, 0.003, 0.002, 0.16, 5); M2.add('std2', dish(0.02, 0.008, 12), 0xeeeeee, [0.34, 0.12, -0.14], [0.8, 0, 0.3]); M2.add('blink', BALL, 0xffffff, [0.34, 0.163, -0.14], [0, 0, 0], 0.004);
    M2.box('std', 0xd8a030, 0.02, 0.01, 0.34, 0.05, 0.02, 0.03, 0.4); M2.box('std', 0x2a3440, 0.03, 0.026, 0.335, 0.02, 0.01, 0.026, 0.4);
    this.emit(M2, ctx);
    this.cityEmblem(ctx, 0.14, -0.36);
  }


  // Arcology: one great stepped megastructure -- terraced gardens and lit
  // floors climbing to a crown spire -- over a ring of low blocks.
  arcologyCity(ctx) {
    const r = this.env.srand(ctx.space * 139 + 7), g = this.grow, sp = 0.09;
    ctx.wall(0x26282e);
    this.streetGround(ctx, { sp });
    const K = new Kit(), steps = 4 + Math.min(2, g);
    // the pyramid sits on the lattice: centred on a block, its base covering 5x5 blocks
    // (edge to edge of the outer blocks, so the streets run straight up to its faces)
    const cx = 0, cz = -sp, bw = sp * 0.74, base = 4 * sp + bw;
    const inFoot = (x, z) => Math.abs(x - cx) < base / 2 + 0.005 && Math.abs(z - cz) < base / 2 + 0.005;
    this.downtown(K, r, { sp, skip: inFoot, tall: 0.5, parks: 0.14 });
    for (let k = 0; k < steps; k++) {
      const s0 = base - k * (base - 0.08) / steps, y = k * 0.05, ns = base - (k + 1) * (base - 0.08) / steps;
      this.tower(K, k % 2 ? 'cglass' : 'cfac', k % 2 ? new THREE.Color(0.7, 0.85, 1) : new THREE.Color(0.92, 0.9, 0.86), cx, y, cz, s0, 0.05, s0, 0);
      for (const [dx, dz, w, d] of [[0, -s0 / 2, s0, 0.003], [0, s0 / 2, s0, 0.003], [-s0 / 2, 0, 0.003, s0], [s0 / 2, 0, 0.003, s0]]) K.box('glow', 0x9fe8ff, cx + dx, y + 0.049, cz + dz, w + 0.002, 0.002, d + 0.002);   // lit edge of the step
      K.box('std', 0x6a6e74, cx, y + 0.0495, cz, s0 - 0.004, 0.0012, s0 - 0.004);   // the terrace deck
      // the terrace ring (between this step's edge and the next step): gardens, HVAC, antennas, solar, pads
      const band = (s0 - ns) / 2, yt = y + 0.05, rr = this.env.srand(ctx.space * 7 + k);
      for (const side of [0, 1, 2, 3]) {
        const along = (u, v) => side === 0 ? [cx + u, cz - v] : side === 1 ? [cx + v, cz + u] : side === 2 ? [cx - u, cz + v] : [cx - v, cz - u];
        const v0 = s0 / 2 - band / 2;
        for (let u = -s0 / 2 + band; u < s0 / 2 - band; u += band * 1.1) {
          const [x, z] = along(u + band * 0.55, v0), pick = rr();
          if (pick < 0.45) { K.box('std', 0x4a9a3a, x, yt, z, band * 0.9, 0.004, band * 0.9); K.add('matte', BALL, 0x3f8a34, [x, yt + 0.006, z], [0, 0, 0], [band * 0.28, band * 0.25, band * 0.28]); }   // roof garden
          else if (pick < 0.65) { K.box('std', 0x8a9098, x, yt, z, band * 0.5, 0.012, band * 0.4); K.cyl('metal', 0x5a5e66, x, yt + 0.012, z, band * 0.12, band * 0.12, 0.003, 10); }   // HVAC unit + fan
          else if (pick < 0.82) K.add('std2', BOX, 0x22346a, [x, yt + 0.006, z], [-0.35, 0, 0], [band * 0.85, 0.002, band * 0.6]);   // solar panel
          else if (pick < 0.92) { K.cyl('metal', 0xc0c4cc, x, yt, z, 0.0015, 0.001, 0.035, 4); K.add('blink', BALL, 0xffffff, [x, yt + 0.036, z], [0, 0, 0], 0.0025); }   // antenna
          else { K.cyl('std', 0x4a4e56, x, yt, z, band * 0.42, band * 0.42, 0.002, 16); K.add('glow', new THREE.TorusGeometry(band * 0.36, 0.0012, 4, 16).rotateX(Math.PI / 2), 0xffb040, [x, yt + 0.003, z]); }   // landing pad
        }
      }
    }
    const top = steps * 0.05;
    K.cyl('std', 0x4a4e56, cx, top, cz, 0.03, 0.03, 0.003, 20); K.add('glow', new THREE.TorusGeometry(0.026, 0.0015, 4, 20).rotateX(Math.PI / 2), 0xffb040, [cx, top + 0.004, cz]);
    K.cyl('metal', 0xd8dce2, cx + 0.018, top, cz - 0.018, 0.008, 0.003, 0.1, 10);
    K.add('blink', BALL, 0xffffff, [cx + 0.018, top + 0.104, cz - 0.018], [0, 0, 0], 0.006);
    this.emit(K, ctx);
  }

  // Tharsis Republic's founding city: a Coruscant -- a tight forest of towers
  // of every height over the whole street grid, lit windows, billboards and
  // holo-signs, sky-bridges between the tall ones, air traffic weaving
  // between them. It grows into by far the biggest city on Mars: taller,
  // denser, brighter and busier with every growth stage (generation /
  // terraforming, this.grow 0..3).
  coruscantCity(ctx) {
    const r = this.env.srand(ctx.space * 173 + 11), g = this.grow, sp = 0.07;
    ctx.wall(0x1c1e24);
    this.streetGround(ctx, { sp, tint: '#23262e' });
    const K = new Kit(), grow = 1 + 0.45 * g, towers = [];
    const neon = [0xff4ad0, 0x4ad8ff, 0xffd84a, 0x8aff6a, 0xff7a3a, 0xb07aff];
    this.lattice(sp, 0.035, null, (x, z, core) => {
      if (r() < 0.12 - g * 0.035) { this.tinyPark(K, x, z, sp, r); return; }          // a few squares early, filled in as it grows
      const bw = sp * (0.66 + r() * 0.12), bd = sp * (0.66 + r() * 0.12);
      let h = (0.05 + 0.26 * Math.pow(core, 1.3) * (0.45 + r() * 0.9) + r() * 0.04) * grow;
      if (this.env.inClearing(x, z, 0.06)) h = Math.min(h, 0.05);
      h = Math.min(h, 0.95);
      const glass = r() < 0.45, col = glass ? new THREE.Color().setHSL(0.56 + r() * 0.08, 0.35, 0.74 + r() * 0.12) : new THREE.Color().setHSL(0.6 + r() * 0.1, 0.1, 0.7 + r() * 0.2);
      if (h > 0.22 && r() < 0.6) {                                                         // setback skyscraper: base, shaft, crown
        this.tower(K, glass ? 'cglass' : 'cfac', col, x, 0, z, bw, h * 0.45, bd, 0);
        this.tower(K, 'cglass', col.clone().multiplyScalar(1.05), x, h * 0.45, z, bw * 0.78, h * 0.4, bd * 0.78, 0);
        this.tower(K, 'cfac', col, x, h * 0.85, z, bw * 0.52, h * 0.15, bd * 0.52, 0);
        K.box('glow', neon[Math.floor(r() * neon.length)], x, h * 0.85 - 0.002, z, bw * 0.8, 0.003, bd * 0.8);
      } else if (h > 0.16 && r() < 0.3) this.rtower(K, 'cglass', col, x, 0, z, Math.min(bw, bd) * 0.5, h);
      else this.tower(K, glass ? 'cglass' : 'cfac', col, x, 0, z, bw, h, bd, 0);
      if (h > 0.18 && r() < 0.55) { K.cyl('metal', 0xc0c8d0, x, h, z, 0.0022, 0.0012, 0.03 + r() * 0.04, 5); K.add('blink', BALL, 0xffffff, [x, h + 0.07, z], [0, 0, 0], 0.003); }
      towers.push({ x, z, h, bw, bd });
    });
    // billboards and holo-signs on the towers' viewer-facing sides, more as the city grows
    const tall = towers.filter((t) => t.h > 0.12).sort((a, b) => b.h - a.h);
    const nb = Math.min(tall.length, 4 + g * 5);
    for (let i = 0; i < nb; i++) {
      const t = tall[i], y = t.h * (0.35 + r() * 0.45), c = neon[i % neon.length], face = r() < 0.7;
      if (face) K.box('glow', c, t.x, y, t.z + t.bd / 2 + 0.0015, t.bw * 0.7, 0.022 + r() * 0.02, 0.002);          // a billboard on the face
      else { K.box('glow', c, t.x + t.bw / 2 + 0.012, y, t.z, 0.002, 0.03, 0.02); K.box('metal', 0x3a3a3a, t.x + t.bw / 2 + 0.006, y, t.z, 0.012, 0.002, 0.002); }   // a blade sign
    }
    // sky-bridges between neighbouring tall towers
    let nbr = 0;
    for (const a of tall) for (const b of tall) {
      if (nbr >= 3 + g * 4 || a === b || !(a.x < b.x || (a.x === b.x && a.z < b.z))) continue;
      const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz);
      if (L > sp * 1.05 || L < sp * 0.95) continue;
      const y = Math.min(a.h, b.h) * (0.5 + r() * 0.3), mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, horiz = Math.abs(dx) > Math.abs(dz);
      K.box(this.cityMat('cglass'), 0xbfe0ff, mx, y, mz, horiz ? L : 0.012, 0.01, horiz ? 0.012 : L);
      K.box('glow', 0xfff0c8, mx, y - 0.001, mz, horiz ? L : 0.004, 0.002, horiz ? 0.004 : L);
      nbr++;
    }
    this.emit(K, ctx);
    // air traffic: lanes of little lit craft circling between the towers, busier as it grows
    for (let l = 0; l < 2 + Math.min(2, g); l++) {
      const lane = new THREE.Group(), lk = new Kit(), n = 5 + g * 2, rad = 0.12 + l * 0.08, y = 0.12 + l * 0.07 + g * 0.03;
      for (let i = 0; i < n; i++) { const a = i / n * TAU + r(); lk.box('glow', i % 3 ? 0xfff2d0 : 0xff5a4a, Math.cos(a) * rad, y, Math.sin(a) * rad * 0.9, 0.006, 0.003, 0.003, -a); }
      for (const [key, list] of lk.by) lane.add(new THREE.Mesh(mergeGeometries(list), this.mat(key)));
      this.spin(this.place(lane, ctx, -0.02, -0.03, 0), (l % 2 ? -1 : 1) * (0.25 + l * 0.08), r() * 6);
    }
  }

  // Spire city: slender needle towers with lit crowns, like a crystal
  // garden, over low terraces.
  spireCity(ctx) {
    const r = this.env.srand(ctx.space * 149 + 3), g = this.grow;
    ctx.wall(0x26282e);
    this.streetGround(ctx, { sp: 0.1 });
    const K = new Kit();
    // the spires stand on blocks of the street lattice (the rest of the blocks: low terraces)
    const n = 5 + g, spots = [], key = (x, z) => Math.round(x * 10) + ',' + Math.round(z * 10);
    for (let i = 0; i < n * 2 && spots.length < n; i++) {
      const a = i / n * TAU + r(), d = 0.06 + r() * 0.2, x = Math.round((Math.cos(a) * d - 0.03) / 0.1) * 0.1, z = Math.round((Math.sin(a) * d - 0.05) / 0.1) * 0.1;
      if (this.env.inClearing(x, z, 0.05) || this.edgeDist(x, z) < 0.06 || spots.some((p) => p.k === key(x, z))) continue;
      spots.push({ x, z, k: key(x, z) });
    }
    this.downtown(K, r, { sp: 0.1, tall: 0.45, parks: 0.2, skip: (x, z) => spots.some((p) => p.k === key(x, z)) });
    for (let i = 0; i < spots.length; i++) {
      const { x, z } = spots[i];
      const h = 0.22 + r() * 0.2 + g * 0.02, rad = 0.018 + r() * 0.01;
      const prof = [[rad, 0], [rad * 0.92, h * 0.55], [rad * 0.6, h * 0.85], [0.001, h]];
      const radAt = (y) => { for (let j = 1; j < prof.length; j++) if (y <= prof[j][1]) { const t = (y - prof[j - 1][1]) / (prof[j][1] - prof[j - 1][1]); return prof[j - 1][0] + (prof[j][0] - prof[j - 1][0]) * t; } return 0; };
      K.add('std', lathe(prof, 20), (X, Yy) => _c.setHSL(0.57 + (i % 3) * 0.03, 0.25, 0.78 + 0.15 * Yy / h), [x, 0, z]);
      for (let f = 1; f < 9; f++) K.add('glow', new THREE.TorusGeometry(radAt(h * f / 11) + 0.0006, 0.0013, 4, 18).rotateX(Math.PI / 2), 0xffe6b0, [x, h * f / 11, z]);
      K.add('glow', new THREE.TorusGeometry(rad * 0.75, 0.0022, 6, 16).rotateX(Math.PI / 2), [0x9fe8ff, 0xff9ad8, 0xffe08a][i % 3], [x, h * 0.75, z]);
      K.add('glow', BALL, 0xffffff, [x, h, z], [0, 0, 0], 0.004);
    }
    this.emit(K, ctx);
  }
}
