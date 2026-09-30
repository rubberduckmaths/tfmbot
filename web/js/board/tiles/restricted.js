// restricted.js -- TileArt mixin: the Restricted Area, a fenced radar / tracking site (its turning dishes use the
// nrSpin helpers in nuclear.js; its buildings nrPanel / nrConc).
import { gfx } from '../quality.js';
import * as THREE from 'three';
import { BALL, BOX, Kit, TAU, V3, _c, _c2, dish, fbm2, hash2, hexCorner, smooth, vnoise } from './kit.js';

const ROCK = new THREE.IcosahedronGeometry(1, 0);                  // (a faceted rock)

export class RestrictedArt {
  // Restricted Area: a radar / tracking station behind a security fence, on a gravel pad swept out of the Mars dust.
  // Few big shapes, so it reads as a radar site at board distance: a large white geodesic radome, a smaller one, and a
  // tracking dish on its pedestal turning slowly (nrSpin); the low control building by the gate with a small search
  // radar spinning on its roof, and a guyed lattice mast (its one red obstruction light the only blinker). Close up:
  // radome panel seams (raDomeMat), the dish's back ribs, feed quadripod and yoke, cable trenches between the
  // buildings, a swing-clearance ring round the dish, dust drifted against everything. The perimeter: chain-link on
  // posts with outrigger arms and razor-wire coil, warning plates, a gate at the front corner.
  restricted(ctx) {
    const { space } = ctx, r = this.env.srand(space * 31 + 7), HR = this.HEX_R, low = gfx.low;
    const DA = [-0.14, -0.13, 0.125], DB = [0.2, -0.165, 0.078];     // the radomes: x, z, sphere radius
    const DC = [0.075, 0.035], DR = 0.108;                             // the tracking dish: pedestal x, z; dish rim radius
    const BL = [0.015, 0.265, 0.17, 0.072];                          // the control building: x, z, width, depth
    const MS = [0.335, 0.0], GN = [-0.29, 0.0];                       // the lattice mast; the generator
    ctx.wall(0x5a3a28);
    const tex = this.canvas('ra-ground3', 512, 592, (g, w, h) => {
      const R0 = HR * 0.95, S = w / (Math.sqrt(3) * R0), px = (x) => (0.5 + x / (Math.sqrt(3) * R0)) * w, py = (z) => (0.5 + z / (2 * R0)) * h;
      const hexD = (x, z) => Math.max(Math.abs(x), Math.abs(x * 0.5 + z * Math.sqrt(3) / 2), Math.abs(x * 0.5 - z * Math.sqrt(3) / 2));
      { // the base at half resolution: rusty regolith outside, a raked strip inside the fence, the gravel pad, dust drifting over its edge
        const c = document.createElement('canvas'); c.width = w / 2; c.height = h / 2;
        const cg = c.getContext('2d'), id = cg.createImageData(c.width, c.height), d = id.data;
        for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
          const bx = (x * 2 / w - 0.5) * Math.sqrt(3) * R0, bz = (y * 2 / h - 0.5) * 2 * R0, hd = hexD(bx, bz);
          const n = fbm2(x / 26, y / 26, 4), f = vnoise(x / 3 + 11, y / 3), i = (y * c.width + x) * 4;
          const dust = [168, 122, 90], pad = [146, 137, 125];
          let col, l = 0.86 + n * 0.26 + f * 0.08;
          if (hd > 0.425) col = [dust[0] * 0.94, dust[1] * 0.9, dust[2] * 0.88];
          else if (hd > 0.385) { l = 0.97 + 0.05 * Math.sin((bx * 0.5 - bz * 0.87) * 700) + f * 0.05; col = [160, 132, 108]; }
          else {
            const edge = smooth(0.33, 0.385, hd + (n - 0.5) * 0.08), drift = smooth(0.58, 0.8, fbm2(x / 14 + 40, y / 34, 3));   // (drifts: long, along the wind)
            const t = Math.min(1, edge + drift * 0.35);
            col = [pad[0] + (dust[0] - pad[0]) * t, pad[1] + (dust[1] - pad[1]) * t, pad[2] + (dust[2] - pad[2]) * t];
          }
          d[i] = col[0] * l; d[i + 1] = col[1] * l; d[i + 2] = col[2] * l; d[i + 3] = 255;
        }
        cg.putImageData(id, 0, 0);
        g.imageSmoothingEnabled = true; g.drawImage(c, 0, 0, w, h);
      }
      const joints = (step) => { g.strokeStyle = 'rgba(40,36,32,0.4)'; g.lineWidth = 1; return step; };
      // the gate road: packed gravel, tyre ruts
      g.fillStyle = '#7e7466'; g.beginPath(); g.moveTo(px(-0.045), py(0.5)); g.lineTo(px(0.045), py(0.5)); g.lineTo(px(0.04), py(0.3)); g.lineTo(px(-0.04), py(0.3)); g.fill();
      g.strokeStyle = 'rgba(50,44,38,0.3)'; g.lineWidth = 2.5;
      for (const s of [-1, 1]) { g.beginPath(); g.moveTo(px(s * 0.02), py(0.5)); g.bezierCurveTo(px(s * 0.02), py(0.4), px(s * 0.02 + 0.03), py(0.36), px(s * 0.02 + 0.07), py(0.335)); g.stroke(); }
      // cable trenches: concrete covers from the building to the radars and the mast
      const trench = (pts) => {
        const line = (col, wd) => { g.strokeStyle = col; g.lineWidth = wd; g.beginPath(); pts.forEach(([x, z], i) => (i ? g.lineTo(px(x), py(z)) : g.moveTo(px(x), py(z)))); g.stroke(); };
        g.lineCap = 'square'; g.lineJoin = 'miter'; line('rgba(40,34,28,0.5)', 0.016 * S + 2); line('#a39d92', 0.016 * S); g.lineCap = 'butt';
        g.strokeStyle = 'rgba(40,36,32,0.35)'; g.lineWidth = 1;
        for (let i = 1; i < pts.length; i++) {
          const [x0, z0] = pts[i - 1], [x1, z1] = pts[i], L = Math.hypot(x1 - x0, z1 - z0), nx = -(z1 - z0) / L * 0.007, nz = (x1 - x0) / L * 0.007;
          for (let t = 0.02; t < L; t += 0.02) { const x = x0 + (x1 - x0) * t / L, z = z0 + (z1 - z0) * t / L; g.beginPath(); g.moveTo(px(x - nx), py(z - nz)); g.lineTo(px(x + nx), py(z + nz)); g.stroke(); }
        }
      };
      trench([[BL[0] - 0.05, BL[1] - 0.04], [DA[0] + 0.03, DA[1] + 0.12]]);
      trench([[BL[0] + 0.02, BL[1] - 0.04], [DC[0], DC[1] + 0.05]]);
      trench([[DC[0] + 0.05, DC[1] - 0.02], [DB[0] - 0.02, DB[1] + 0.085]]);
      trench([[DC[0] + 0.05, DC[1]], [MS[0] - 0.02, MS[1]]]);
      trench([[BL[0] - BL[2] / 2, BL[1]], [GN[0] + 0.03, BL[1]], [GN[0] + 0.03, GN[1] + 0.04]]);
      // pads: the radomes' round aprons, the dish's octagon, the building slab (joints)
      for (const [x, z, rr] of [DA, DB]) {
        const R = (rr * 1.12 + 0.02) * S; g.fillStyle = '#aaa59b'; g.beginPath(); g.arc(px(x), py(z), R, 0, TAU); g.fill();
        joints(); for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; g.beginPath(); g.moveTo(px(x) + Math.cos(a) * R * 0.75, py(z) + Math.sin(a) * R * 0.75); g.lineTo(px(x) + Math.cos(a) * R, py(z) + Math.sin(a) * R); g.stroke(); }
        g.beginPath(); g.arc(px(x), py(z), R, 0, TAU); g.stroke();
      }
      { const R = 0.07 * S; g.fillStyle = '#aaa59b'; g.beginPath(); for (let k = 0; k < 8; k++) { const a = (k + 0.5) / 8 * TAU; g.lineTo(px(DC[0]) + Math.cos(a) * R, py(DC[1]) + Math.sin(a) * R); } g.closePath(); g.fill(); joints(); g.stroke();
        g.strokeStyle = '#e0b020'; g.lineWidth = 2; g.setLineDash([7, 5]); g.beginPath(); g.arc(px(DC[0]), py(DC[1]), (DR + 0.022) * S, 0, TAU); g.stroke(); g.setLineDash([]); }   // (the dish's swing clearance)
      g.fillStyle = '#9e998f'; g.fillRect(px(BL[0] - BL[2] / 2 - 0.015), py(BL[1] - BL[3] / 2 - 0.015), (BL[2] + 0.03) * S, (BL[3] + 0.03) * S);
      // gate: hazard stripes across the opening, a stop line inside
      g.save(); g.beginPath(); g.rect(px(-0.045), py(0.446), 0.09 * S, 0.02 * S); g.clip();
      for (let i = -10; i < 30; i++) { g.fillStyle = i % 2 ? '#e8b820' : '#1c1c1c'; g.beginPath(); const x0 = px(-0.045) + i * 7; g.moveTo(x0, py(0.446)); g.lineTo(x0 + 7, py(0.446)); g.lineTo(x0 + 17, py(0.466)); g.lineTo(x0 + 10, py(0.466)); g.fill(); }
      g.restore();
      g.fillStyle = 'rgba(236,232,220,0.85)'; g.fillRect(px(-0.035), py(0.415), 0.07 * S, 2.5);
      for (let i = 0; i < 7; i++) {                                    // oil / dust stains
        const x = [BL[0] + 0.1, 0, DC[0], DA[0] + 0.1, GN[0], DB[0] - 0.06, 0.25][i] + (r() - 0.5) * 0.04, z = [BL[1], 0.36, DC[1] + 0.08, DA[1] + 0.12, GN[1] + 0.05, DB[1] + 0.1, 0.05][i] + (r() - 0.5) * 0.04, R = (0.008 + r() * 0.012) * S;
        const gr = g.createRadialGradient(px(x), py(z), 0, px(x), py(z), R); gr.addColorStop(0, 'rgba(24,18,12,0.32)'); gr.addColorStop(1, 'rgba(24,18,12,0)');
        g.fillStyle = gr; g.fillRect(px(x) - R, py(z) - R, 2 * R, 2 * R);
      }
    });
    const geo = this.ground(() => 0.0, () => _c.setRGB(1, 1, 1), { uv: true, sub: 6 });
    const gm = new THREE.Mesh(this.drape(geo, ctx.cell, ctx.H), this.raGroundMat(tex));
    gm.receiveShadow = true; ctx.g.add(gm);
    this.frostOver(ctx, geo);

    const K = new Kit(), N = new Kit(), fence = new Kit();
    const steel = 0x6a7078, steelL = 0x9aa0a8, conc = 0xa6a298, concD = 0x7a766e, white = 0xecebe6;
    // Mars dust on everything near the ground: a colour fn fading base -> dust below height y1 (board units)
    const dusty = (hex, y1 = 0.03, a = 0.55) => { const base = new THREE.Color(hex); return (x, y, z) => _c.copy(base).lerp(_c2.setRGB(0.6, 0.38, 0.25), a * (1 - smooth(0, y1, y)) * (0.6 + 0.4 * vnoise(x * 90, z * 90 + y * 40))); };
    // a geometry in a local frame, then through a matrix (the dish's elevation frame)
    const xf = (g0, t = [0, 0, 0], rr = [0, 0, 0], s = 1, M = null) => { const S = typeof s === 'number' ? [s, s, s] : s, g1 = g0.clone().applyMatrix4(new THREE.Matrix4().compose(new V3(...t), new THREE.Quaternion().setFromEuler(new THREE.Euler(rr[0], rr[1], rr[2])), new V3(...S))); return M ? g1.applyMatrix4(M) : g1; };
    const rod = (a, b, rad, seg = 5) => { const d = new V3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), L = d.length(); return new THREE.CylinderGeometry(rad, rad, L, seg, 1, true).translate(0, L / 2, 0).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), d.divideScalar(L))).translate(a[0], a[1], a[2]); };

    // ---- the perimeter: chain-link on posts, outrigger arms leaning out with razor-wire coil, warning plates; a gate at the front corner
    const FR = HR * 0.84, fh = 0.05;
    const panel = (x0, z0, x1, z1) => {
      const L = Math.hypot(x1 - x0, z1 - z0), ry = -Math.atan2(z1 - z0, x1 - x0), mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      const nx = Math.sin(ry), nz = Math.cos(ry), o = nx * mx + nz * mz > 0 ? 1 : -1, ox = nx * o, oz = nz * o;   // (ox, oz: outward)
      const g = new THREE.PlaneGeometry(L, fh).translate(0, fh / 2, 0), uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * L / 0.05, uv.getY(i));
      fence.add('fence', g, 0xffffff, [mx, 0, mz], [0, ry, 0], 1, { uv: true });
      const n = Math.max(1, Math.round(L / 0.065));
      for (let i = 0; i <= n; i++) {
        const x = x0 + (x1 - x0) * i / n, z = z0 + (z1 - z0) * i / n, end = i === 0 || i === n;
        K.cyl('metal', steel, x, 0, z, end ? 0.005 : 0.0038, end ? 0.005 : 0.0038, fh + 0.004, 6);
        if (!low) K.cyl('std', conc, x, 0, z, 0.008, 0.007, 0.004, 6);                                          // (footings)
        K.add('metal', rod([x, fh, z], [x + ox * 0.014, fh + 0.014, z + oz * 0.014], 0.0022, 4), steel);    // the outrigger arm
      }
      K.add('metal', new THREE.CylinderGeometry(0.003, 0.003, L, 5), steelL, [mx, fh, mz], [0, ry, Math.PI / 2]);   // top rail
      K.add('metal', new THREE.CylinderGeometry(0.0012, 0.0012, L, 3), 0x3a3c40, [mx + ox * 0.014, fh + 0.014, mz + oz * 0.014], [0, ry, Math.PI / 2]);   // barbed strand on the arms
      const cg = new THREE.PlaneGeometry(L, 0.022).translate(0, 0.011, 0), cu = cg.attributes.uv; for (let i = 0; i < cu.count; i++) cu.setXY(i, cu.getX(i) * L / 0.04, cu.getY(i));
      for (const t of low ? [0] : [0.6, -0.6]) fence.add(this.raCoilMat(), cg, 0xffffff, [mx + ox * 0.008, fh + 0.003, mz + oz * 0.008], [t, ry, 0, 'YXZ'], 1, { uv: true });
      return [mx, mz, ry, L, ox, oz];
    };
    const cs = [0, 1, 2, 3, 4, 5].map((k) => hexCorner(k, FR)), runs = [], GAP = 0.05;
    for (let k = 0; k < 6; k++) {
      const [a, b] = [cs[k], cs[(k + 1) % 6]];
      if (k === 2) { const f = (-GAP - a[0]) / (b[0] - a[0]); runs.push(panel(a[0], a[1], -GAP, a[1] + (b[1] - a[1]) * f)); }   // the gate gap at the front corner
      else if (k === 3) { const f = (GAP - a[0]) / (b[0] - a[0]); runs.push(panel(GAP, a[1] + (b[1] - a[1]) * f, b[0], b[1])); }
      else runs.push(panel(a[0], a[1], b[0], b[1]));
    }
    for (const [i, [mx, mz, ry, , ox, oz]] of runs.entries()) {          // a warning plate on each run, facing out
      if (low && i % 2) continue;
      K.add(this.raSignMat(), new THREE.PlaneGeometry(0.032, 0.024), 0xffffff, [mx + ox * 0.0025, 0.028, mz + oz * 0.0025], [0, ry + (ox * Math.sin(ry) + oz * Math.cos(ry) < 0 ? Math.PI : 0), 0], 1, { uv: true });
    }
    { // the gate: heavy posts, one chain-link leaf shut, the other swung in
      const gz = cs[2][1] + (cs[3][1] - cs[2][1]) * ((-GAP - cs[2][0]) / (cs[3][0] - cs[2][0]));
      for (const s of [-1, 1]) { K.cyl('metal', steelL, s * GAP, 0, gz, 0.0065, 0.0065, fh + 0.014, 8); K.ball('metal', steelL, s * GAP, fh + 0.014, gz, 0.0065); }
      const leaf = (x, z, ry) => {
        const gg = new THREE.PlaneGeometry(GAP * 0.96, fh * 0.9).translate(GAP * 0.48, fh * 0.45 + 0.004, 0), uv = gg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * GAP / 0.05, uv.getY(i));
        fence.add('fence', gg, 0xffffff, [x, 0, z], [0, ry, 0], 1, { uv: true });
        for (const y of [0.004, fh * 0.9 + 0.004]) K.add('metal', new THREE.CylinderGeometry(0.0022, 0.0022, GAP * 0.96, 5).rotateZ(Math.PI / 2).translate(GAP * 0.48, 0, 0), steelL, [x, y, z], [0, ry, 0]);
        K.add('metal', new THREE.CylinderGeometry(0.0022, 0.0022, fh * 0.9, 5).translate(GAP * 0.96, fh * 0.45 + 0.004, 0), steelL, [x, 0, z], [0, ry, 0]);
      };
      leaf(-GAP, gz, 0); leaf(GAP, gz, Math.PI - 1.25);
      K.add(this.raSignMat(), new THREE.PlaneGeometry(0.03, 0.022), 0xffffff, [-GAP * 0.5, 0.03, gz + 0.002], [0, 0, 0], 1, { uv: true });
    }
    this.emit(fence, ctx, { shadow: false });

    // ---- the radomes: geodesic spheres (raDomeMat: panel seams) on concrete ring walls, a flange, a door, a lightning rod
    const radome = ([x, z, R], det) => {
      const wallH = R * 0.3, cut = -0.5, yc = wallH - cut * R * 0.96;
      K.add('nrConc', new THREE.CylinderGeometry(R * 0.9, R * 0.94, wallH, 28), dusty(conc, 0.03, 0.4), [x, wallH / 2, z]);
      K.add('metal', new THREE.TorusGeometry(R * 0.885, R * 0.035, 5, 32).rotateX(Math.PI / 2), 0x8e9298, [x, wallH, z]);   // the base flange
      K.add(this.raDomeMat(), this.raDomeGeo(det, cut, (x * 13.7 + z * 5.1) | 0), null, [x, yc, z], [0, r() * TAU, 0], R);
      K.add('metal', new THREE.CylinderGeometry(0.0012, 0.002, R * 0.35, 4).translate(0, R * 0.175, 0), steelL, [x, yc + R * 0.99, z]);
      const da = Math.atan2(-z, -x) + 0.9, dx = x + Math.cos(da) * R * 0.92, dz = z + Math.sin(da) * R * 0.92;   // the door faces round toward the centre
      K.box('std', 0x3a3e44, dx, 0, dz, 0.022, Math.min(0.03, wallH * 0.92), 0.012, -da + Math.PI / 2);
      K.box('nrConc', concD, x + Math.cos(da) * (R * 0.92 + 0.012), 0, z + Math.sin(da) * (R * 0.92 + 0.012), 0.03, 0.005, 0.018, -da + Math.PI / 2);   // the step
      K.box('metal', 0x8a9096, x + Math.cos(da + 0.5) * R * 0.93, 0.008, z + Math.sin(da + 0.5) * R * 0.93, 0.016, 0.018, 0.01, -da - 0.5 + Math.PI / 2);   // a junction box
    };
    radome(DA, low ? 2 : 3); radome(DB, low ? 2 : 3);

    // ---- the tracking dish: an octagonal plinth, the steel pedestal (static); turret, yoke and the dish on it turning (nrSpin)
    const [cx, cz] = DC, HP = 0.14, tilt = 0.58;
    K.add('nrConc', new THREE.CylinderGeometry(0.052, 0.058, 0.022, 8).rotateY(Math.PI / 8), dusty(conc, 0.02, 0.35), [cx, 0.011, cz]);
    K.cyl('metal', 0xb8bcc0, cx, 0.022, cz, 0.026, 0.02, HP - 0.075, 12);
    K.cyl('metal', 0x9aa0a6, cx, HP - 0.056, cz, 0.028, 0.028, 0.006, 16);                              // the bearing ring
    if (!low) {
      for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; K.box('metal', 0x7a8088, cx + Math.cos(a) * 0.024, 0.022, cz + Math.sin(a) * 0.024, 0.006, 0.014, 0.006, -a); }   // (base gussets)
      for (let i = 0; i < 6; i++) K.box('metal', 0x5a5e64, cx + 0.0215, 0.028 + i * 0.008, cz, 0.003, 0.0015, 0.012);                   // ladder rungs
      K.box('std', 0x4a4e54, cx - 0.02, 0.022, cz + 0.02, 0.018, 0.02, 0.012, -0.8);                                                     // the drive cabinet
    }
    { const M = new THREE.Matrix4().makeTranslation(cx, HP, cz).multiply(new THREE.Matrix4().makeRotationX(tilt)).multiply(new THREE.Matrix4().makeTranslation(0, 0.012, 0));
      const piv = [cx, HP, cz], spin = [0.28, r() * TAU], parts = [];
      const P = (g0, col) => parts.push([g0, col]);
      // turret and yoke (turning frame, not tilted)
      P(xf(new THREE.CylinderGeometry(0.03, 0.03, 0.022, 16), [cx, HP - 0.042, cz]), 0xdcdcd6);
      P(xf(BOX, [cx, HP - 0.028, cz - 0.01], [0, 0, 0], [0.05, 0.012, 0.03]), 0xd0d0ca);
      for (const s of [-1, 1]) P(xf(BOX, [cx + s * 0.036, HP - 0.018, cz], [0, 0, 0], [0.008, 0.04, 0.022]), 0xd8d8d2);
      P(xf(new THREE.CylinderGeometry(0.006, 0.006, 0.08, 8).rotateZ(Math.PI / 2), [cx, HP, cz]), 0x8a9098);             // the elevation axle
      // the dish (tilted frame): a closed shell (a lip at the rim), the rim ring, back ribs and hub, the feed on its quadripod
      const dep = 0.03, fz = DR * DR / (4 * dep), prof = [];
      for (let i = 0; i <= 8; i++) { const rr = Math.max(0.004, DR * i / 8 * 0.985); prof.push(new THREE.Vector2(rr, dep * (rr / DR) ** 2 - 0.004)); }
      for (let i = 8; i >= 0; i--) { const rr = Math.max(0.004, DR * i / 8); prof.push(new THREE.Vector2(rr, dep * (rr / DR) ** 2)); }
      P(xf(new THREE.LatheGeometry(prof, low ? 20 : 36), [0, 0, 0], [0, 0, 0], 1, M), (X, Y, Z) => _c.set(white).multiplyScalar(1.2 + 0.06 * vnoise(X * 200, Z * 200)));   // (brighter than white: nrSpin is half metal)
      P(xf(new THREE.TorusGeometry(DR, 0.0028, 4, low ? 24 : 40).rotateX(Math.PI / 2), [0, dep, 0], [0, 0, 0], 1, M), 0xc8ccd0);
      if (!low) {                                                                                          // the reflector's panel joints: two rings, radial seams
        for (const q of [0.42, 0.74]) P(xf(new THREE.TorusGeometry(DR * q, 0.0009, 3, 32).rotateX(Math.PI / 2), [0, dep * q * q + 0.0008, 0], [0, 0, 0], 1, M), 0xa8acb0);
        for (let k = 0; k < 12; k++) { const a = k / 12 * TAU, y = (q) => dep * q * q + 0.0008; P(xf(rod([Math.cos(a) * DR * 0.2, y(0.2), Math.sin(a) * DR * 0.2], [Math.cos(a) * DR * 0.98, y(0.98), Math.sin(a) * DR * 0.98], 0.0008, 3), [0, 0, 0], [0, 0, 0], 1, M), 0xa8acb0); }
      }
      P(xf(new THREE.CylinderGeometry(0.024, 0.03, 0.02, 12), [0, -0.012, 0], [0, 0, 0], 1, M), 0xc4c6c2);
      if (!low) for (let k = 0; k < 8; k++) {
        const a = k / 8 * TAU, ca = Math.cos(a), sa = Math.sin(a), y = (q) => dep * (q / DR) ** 2 - 0.006;
        P(xf(rod([ca * 0.028, y(0.028) - 0.004, sa * 0.028], [ca * DR * 0.95, y(DR * 0.95), sa * DR * 0.95], 0.0022, 4), [0, 0, 0], [0, 0, 0], 1, M), 0xb0b4b8);
      }
      if (!low) P(xf(new THREE.TorusGeometry(DR * 0.55, 0.0018, 4, 24).rotateX(Math.PI / 2), [0, dep * 0.3 - 0.008, 0], [0, 0, 0], 1, M), 0xa8acb0);   // the back ring truss
      for (let k = 0; k < (low ? 3 : 4); k++) { const a = (k + 0.5) / (low ? 3 : 4) * TAU; P(xf(rod([Math.cos(a) * DR * 0.9, dep * 0.81, Math.sin(a) * DR * 0.9], [0, fz - 0.01, 0], 0.0016, 4), [0, 0, 0], [0, 0, 0], 1, M), 0x9aa0a6); }
      P(xf(new THREE.CylinderGeometry(0.006, 0.01, 0.02, 10), [0, fz - 0.008, 0], [0, 0, 0], 1, M), 0x6a7078);          // the feed horn
      P(xf(new THREE.CylinderGeometry(0.012, 0.012, 0.004, 14), [0, fz + 0.004, 0], [0, 0, 0], 1, M), 0xd0d2d4);       // its subreflector
      const Yw = new THREE.Matrix4().makeTranslation(cx, 0, cz).multiply(new THREE.Matrix4().makeRotationY(2.4)).multiply(new THREE.Matrix4().makeTranslation(-cx, 0, -cz));
      for (const [g0, col] of parts) {                                                                      // (built facing the front, turned to face the back-right: into the light, when it stands still)
        g0.applyMatrix4(Yw);
        if (low) K.add('std', g0, col);                                                                      // (low: standing still)
        else this.nrSpinAdd(N, 'nrSpin', g0, col, [0, 0, 0], [0, 0, 0], 1, piv, spin);
      }
    }

    // ---- the control building: panelled, a flat roof with a parapet, a door and a few lit windows toward the gate;
    // on the roof HVAC units, a small satcom dish, whips and a search radar spinning; a generator and fuel tank beside it
    { const [bx, bz, bw, bd] = BL, bh = 0.044;
      K.box('nrPanel', dusty(0xc8c2b4, 0.02, 0.5), bx, 0, bz, bw, bh, bd);
      K.box('nrConc', 0x6a665f, bx, bh, bz, bw + 0.008, 0.005, bd + 0.008);                              // the roof (a dark membrane)
      if (!low) for (const [ox, oz, ww, dd] of [[0, bd / 2 + 0.0025, bw + 0.008, 0.003], [0, -bd / 2 - 0.0025, bw + 0.008, 0.003], [bw / 2 + 0.0025, 0, 0.003, bd + 0.008], [-bw / 2 - 0.0025, 0, 0.003, bd + 0.008]]) K.box('nrConc', 0x9a968e, bx + ox, bh + 0.005, bz + oz, ww, 0.004, dd);   // the parapet
      K.box('nrConc', 0x8a857c, bx, 0, bz, bw + 0.004, 0.006, bd + 0.004);                              // the plinth
      { const ax = bx + bw * 0.3, az = bz + bd / 2 + 0.013;                                              // the airlock porch: its outer door, a small window, a step
        K.box('nrPanel', dusty(0xb8b2a4, 0.02, 0.5), ax, 0, az, 0.036, 0.036, 0.026);
        K.box('std', 0x5a5650, ax, 0.036, az, 0.04, 0.003, 0.03);
        K.box('std', 0x3a3e44, ax, 0.002, az + 0.0131, 0.018, 0.028, 0.002); K.box('std', 0x1c2026, ax, 0.021, az + 0.0142, 0.008, 0.006, 0.001);
        K.box('nrConc', concD, ax, 0, az + 0.019, 0.026, 0.004, 0.012); }
      for (let i = 0; i < 4; i++) { const lit = i !== 2, x = bx - bw * 0.38 + i * 0.024;                   // windows: frames, two lit (dimly)
        K.box('std', 0x4a4c50, x, 0.018, bz + bd / 2 + 0.0006, 0.017, 0.013, 0.002);
        K.box(lit ? 'glow' : 'std', lit ? 0xb89a62 : 0x23272c, x, 0.0195, bz + bd / 2 + 0.0012, 0.013, 0.009, 0.002); }
      for (let i = 0; i < 3; i++) { const x = bx - bw * 0.3 + i * 0.05; K.box('std', 0x4a4c50, x, 0.018, bz - bd / 2 - 0.0006, 0.017, 0.013, 0.002); K.box('std', 0x23272c, x, 0.0195, bz - bd / 2 - 0.0012, 0.013, 0.009, 0.002); }
      if (!low) {                                                                                         // a ladder up the side, the cable riser from the trench
        for (const s of [-1, 1]) K.box('metal', steel, bx - bw / 2 - 0.004, 0, bz + s * 0.006, 0.0015, bh + 0.014, 0.0015);
        for (let i = 1; i < 8; i++) K.box('metal', steel, bx - bw / 2 - 0.004, i * 0.0065, bz, 0.0012, 0.0012, 0.012);
        K.box('metal', 0x8a9096, bx - bw * 0.3, 0, bz - bd / 2 - 0.004, 0.012, bh - 0.004, 0.006);
      }
      for (const [ox, oz] of [[-0.05, -0.012], [-0.022, -0.012]]) {                                        // HVAC units, fan grilles
        K.box('metal', 0x9aa0a4, bx + ox, bh + 0.005, bz + oz, 0.022, 0.012, 0.03);
        K.cyl('std', 0x2a2c30, bx + ox, bh + 0.017, bz + oz, 0.008, 0.008, 0.001, 12);
      }
      K.add('std', dish(0.014, 0.006, 14), 0xe8e8e4, [bx + 0.055, bh + 0.02, bz + 0.012], [0.7, 0.4, 0]); K.cyl('metal', steel, bx + 0.055, bh + 0.005, bz + 0.012, 0.002, 0.002, 0.015, 5);
      for (const [ox, oz, hh] of [[0.07, -0.025, 0.07], [0.076, -0.018, 0.05]]) K.cyl('metal', steelL, bx + ox, bh + 0.005, bz + oz, 0.0014, 0.0008, hh, 4);
      // the roof search radar: a slotted bar on a short mast, turning quickly
      const rx = bx + 0.012, rz = bz + 0.012, ry = bh + 0.005;
      K.cyl('metal', steel, rx, ry, rz, 0.004, 0.004, 0.022, 6); K.cyl('metal', 0x4a4e54, rx, ry + 0.02, rz, 0.007, 0.007, 0.006, 10);
      { const piv = [rx, ry + 0.03, rz], spin = [1.5, r() * TAU];
        const bar = [[BOX, 0xe4e4e0, [rx, ry + 0.032, rz], [0, 0, 0], [0.07, 0.012, 0.005]], [BOX, 0x505458, [rx, ry + 0.032, rz + 0.003], [0, 0, 0], [0.066, 0.009, 0.0015]], [BOX, 0x7a7e84, [rx, ry + 0.027, rz - 0.002], [0, 0, 0], [0.012, 0.006, 0.008]]];
        for (const [g0, col, t, rr, s] of bar) { if (low) K.add('metal', g0, col, t, rr, s); else this.nrSpinAdd(N, 'nrSpin', g0, col, t, rr, s, piv, spin); } }
      // the generator (a container) and a fuel tank on saddles
      const [gx, gz] = GN;
      K.box('nrPanel', dusty(0x6f7456, 0.02, 0.45), gx, 0, gz, 0.036, 0.03, 0.06);
      K.box('std', 0x2a2c30, gx, 0.031, gz - 0.012, 0.018, 0.001, 0.018); K.cyl('metal', 0x4a4e54, gx + 0.008, 0.03, gz + 0.018, 0.003, 0.003, 0.018, 6);
      if (!low) for (const s of [-1, 1]) for (let i = 0; i < 4; i++) K.box('std', 0x3a3e30, gx + s * 0.0182, 0.008 + i * 0.004, gz - 0.012, 0.001, 0.0018, 0.024);   // louvres
      K.box('std', 0x4a5040, gx + 0.0182, 0.002, gz + 0.016, 0.001, 0.024, 0.014);                                                     // the service door
      K.add('metal', new THREE.CylinderGeometry(0.012, 0.012, 0.05, 14).rotateX(Math.PI / 2), dusty(0xd4d0c6, 0.02, 0.4), [gx, 0.016, gz + 0.065]);
      for (const s of [-1, 1]) { K.box('nrConc', concD, gx, 0, gz + 0.065 + s * 0.016, 0.026, 0.007, 0.006); K.add('metal', new THREE.TorusGeometry(0.0121, 0.0009, 3, 16), 0x9a968c, [gx, 0.016, gz + 0.065 + s * 0.016]); }
      K.cyl('metal', 0x8a8e90, gx, 0.027, gz + 0.065, 0.003, 0.003, 0.004, 8);                                                           // the filler cap
    }

    // ---- the lattice mast: three legs, cross-bracing, guy wires to their anchors, antennas; one red obstruction light on top
    { const [mx, mz] = MS, H = 0.32, w0 = 0.011;
      const leg = (k, y) => { const a = k / 3 * TAU + 0.3, s = w0 * (1 - 0.35 * y / H); return [mx + Math.cos(a) * s, y, mz + Math.sin(a) * s]; };
      const band = (x, y) => (Math.floor(y / H * 7) % 2 ? _c.setRGB(0.86, 0.85, 0.82) : _c.setRGB(0.74, 0.22, 0.14));   // (painted in aviation bands)
      for (let k = 0; k < 3; k++) K.add('metal', rod(leg(k, 0), leg(k, H), 0.0016, 4), band);
      if (!low) for (let i = 0; i < 14; i++) for (let k = 0; k < 3; k++) { const y0 = i * H / 14, y1 = (i + 1) * H / 14; K.add('metal', rod(leg(k, y0), leg((k + 1) % 3, y1), 0.0007, 3), band); }
      K.box('nrConc', concD, mx, 0, mz, 0.03, 0.006, 0.03);
      for (let k = 0; k < 3; k++) {
        const a = k / 3 * TAU + 0.3 + Math.PI / 3, ax = mx + Math.cos(a) * 0.1, az = mz + Math.sin(a) * 0.1;
        if (Math.max(Math.abs(ax), Math.abs(ax * 0.5 + az * 0.866), Math.abs(ax * 0.5 - az * 0.866)) > 0.38) continue;   // (no anchor outside the fence)
        K.box('nrConc', concD, ax, 0, az, 0.012, 0.005, 0.012);
        if (!low) for (const y of [H * 0.45, H * 0.8]) K.add('metal', rod([ax, 0.005, az], [mx, y, mz], 0.0005, 3), 0x303234);
      }
      for (const [y, a] of [[H * 0.72, 0.4], [H * 0.72, 2.5], [H * 0.6, 4.5]]) K.box('std', 0xe0e0dc, mx + Math.cos(a) * 0.012, y, mz + Math.sin(a) * 0.012, 0.008, 0.028, 0.004, -a + Math.PI / 2);   // panel antennas
      K.cyl('metal', steelL, mx, H, mz, 0.0015, 0.0008, 0.045, 4);
      K.add('blink', BALL, 0xff2a1a, [mx, H + 0.003, mz], [0, 0, 0], 0.004);
    }
    // a few rocks, half-buried in the drifts
    for (let i = 0; i < (low ? 6 : 14); i++) {
      const a = r() * TAU, d = 0.2 + r() * 0.2, x = Math.cos(a) * d, z = Math.sin(a) * d, s = 0.005 + r() * 0.008;
      if (Math.max(Math.abs(x), Math.abs(x * 0.5 + z * 0.866), Math.abs(x * 0.5 - z * 0.866)) > 0.37) continue;
      if (Math.hypot(x - DC[0], z - DC[1]) < 0.13 || Math.hypot(x - DA[0], z - DA[1]) < DA[2] + 0.05 || Math.hypot(x - DB[0], z - DB[1]) < DB[2] + 0.05 || Math.abs(x) < 0.07 || Math.hypot(x - 0.32, z - 0.22) < 0.12 || Math.hypot(x - GN[0], z - GN[1]) < 0.07) continue;
      K.add('std', ROCK, _c.setRGB(0.36, 0.24, 0.17).multiplyScalar(0.8 + r() * 0.4).getHex(), [x, -s * 0.15, z], [r() * 0.4, r() * TAU, 0], [s * 1.3, s * 0.55, s]);
    }
    for (const [k, L] of K.by) if (typeof k === 'string' && k.startsWith('nr')) { N.by.set(k, L); K.by.delete(k); }
    this.emit(K, ctx);
    this.nrEmit(N, ctx);
    this.emblem(ctx, 'restricted_area', -0.2, 0.2, 0.26, 0.28);
  }
  // a radome's geodesic shell: the top of an icosphere (unit radius, cut flat at y = cut), each triangle a panel with
  // its own shade of white (a little dust toward the base), smooth normals; aBar = barycentrics for the seams (raDomeMat)
  raDomeGeo(det, cut, seed) {
    const key = 'raDome' + det + ':' + seed, C = (this.raDomeCache ||= {});
    if (C[key]) return C[key];
    const src = new THREE.IcosahedronGeometry(1, det), P = src.attributes.position, pos = [], nor = [], bar = [], col = [];
    for (let f = 0; f < P.count; f += 3) {
      const ys = [P.getY(f), P.getY(f + 1), P.getY(f + 2)];
      if (Math.max(...ys) < cut + 0.02) continue;
      const cx = P.getX(f) + P.getX(f + 1) + P.getX(f + 2), cz = P.getZ(f) + P.getZ(f + 1) + P.getZ(f + 2), cy = (ys[0] + ys[1] + ys[2]) / 3;
      const t = 0.87 + 0.13 * hash2(cx * 17.3 + seed, cz * 11.1 + cy * 5.7), dust = 0.3 * (1 - smooth(cut, cut + 0.9, cy)) * (0.5 + hash2(cx * 3.1, cz * 7.9 + seed));
      for (let j = 0; j < 3; j++) {
        const x = P.getX(f + j), y = Math.max(cut, P.getY(f + j)), z = P.getZ(f + j), l = Math.hypot(x, y, z);
        pos.push(x, y, z); nor.push(x / l, y / l, z / l); bar.push(j === 0 ? 1 : 0, j === 1 ? 1 : 0, j === 2 ? 1 : 0);
        _c.setRGB(0.93, 0.925, 0.9).multiplyScalar(t).lerp(_c2.setRGB(0.66, 0.44, 0.3), dust); col.push(_c.r, _c.g, _c.b);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('aBar', new THREE.Float32BufferAttribute(bar, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    src.dispose();
    return C[key] = g;
  }
  // the radomes' material: vertex-coloured panels, their seams drawn from the barycentrics (a hairline, fading out
  // once the panels get too small on screen)
  raDomeMat() {
    if (this.mats.raDome) return this.mats.raDome;
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.02 });
    m.onBeforeCompile = (s) => {
      s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aBar; varying vec3 vBar;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvBar = aBar;');
      s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vBar;').replace('#include <color_fragment>', `#include <color_fragment>
{
  float e = min(min(vBar.x, vBar.y), vBar.z), fw = fwidth(e);
  float seam = (1.0 - smoothstep(fw * 0.6, fw * 1.6, e)) * clamp(1.4 - fw * 14.0, 0.0, 1.0);
  diffuseColor.rgb *= 1.0 - 0.32 * seam;
}`);
    };
    m.customProgramCacheKey = () => 'raDome';
    this.own(m, 0.7);
    return this.mats.raDome = m;
  }
  // the Restricted Area's ground: its painted canvas (ra-ground3) plus per-pixel detail from the board position
  // (from the hex uv): grit, gravel aggregate, hairline cracks in patches; fades under a pixel
  raGroundMat(tex) {
    if (this.mats.raGround3) return this.mats.raGround3;
    const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92 }), R0 = (this.HEX_R * 0.95).toFixed(5);
    m.onBeforeCompile = (s) => {
      s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>
float raH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float raN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(raH(i), raH(i + vec2(1.0, 0.0)), f.x), mix(raH(i + vec2(0.0, 1.0)), raH(i + vec2(1.0, 1.0)), f.x), f.y); }`)
        .replace('#include <map_fragment>', `#include <map_fragment>
{
  vec2 p = vec2((vMapUv.x - 0.5) * 1.7320508 * ${R0}, (0.5 - vMapUv.y) * 2.0 * ${R0});
  float px = length(fwidth(p)), fine = clamp(1.0 - px * 300.0, 0.0, 1.0), mid = clamp(1.0 - px * 80.0, 0.0, 1.0);
  vec3 c = diffuseColor.rgb; float sat = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
  float grey = 1.0 - smoothstep(0.06, 0.14, sat);
  float agg = raH(floor(p * 1400.0)) * fine;
  c *= 0.93 + 0.12 * raN(p * 800.0) * fine + 0.08 * (raN(p * 90.0) - 0.5);
  c += vec3(0.05) * step(0.9, agg) * grey - vec3(0.04) * step(agg, 0.06) * grey;
  float cx = abs(raN(p * 55.0 + vec2(raN(p * 9.0) * 2.0)) - 0.5);
  c *= 1.0 - 0.22 * (1.0 - smoothstep(0.0, 0.02, cx)) * smoothstep(0.55, 0.75, raN(p * 11.0 + 3.0)) * mid * grey;
  diffuseColor.rgb = c;
}`);
    };
    m.customProgramCacheKey = () => 'raGround3';
    this.own(m, 0.55);
    return this.mats.raGround3 = m;
  }
  // the perimeter's warning plate: white, a red border, the restricted symbol and two lines of 'text'
  raSignMat() {
    if (this.mats.raSign) return this.mats.raSign;
    const t = this.canvas('raSign', 64, 48, (g, w, h) => {
      g.fillStyle = '#f2f0ea'; g.fillRect(0, 0, w, h); g.strokeStyle = '#c81e1e'; g.lineWidth = 4; g.strokeRect(2, 2, w - 4, h - 4);
      g.lineWidth = 3.5; g.beginPath(); g.arc(18, 24, 10, 0, TAU); g.stroke();
      g.save(); g.translate(18, 24); g.rotate(-Math.PI / 4); g.fillStyle = '#c81e1e'; g.fillRect(-10, -1.8, 20, 3.6); g.restore();
      g.fillStyle = '#1a1a1a'; g.fillRect(34, 15, 22, 4); g.fillRect(34, 23, 18, 3); g.fillRect(34, 30, 20, 3);
    });
    const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.55, side: THREE.DoubleSide });
    this.own(m, 0.55);
    return this.mats.raSign = m;
  }
  // razor-wire coil (concertina) on the fence: overlapping loops with barbs, alpha-tested
  raCoilMat() {
    if (this.mats.raCoil) return this.mats.raCoil;
    const t = this.canvas('raCoil', 128, 32, (g, w, h) => {
      g.clearRect(0, 0, w, h); g.strokeStyle = 'rgba(220,224,228,1)'; g.lineWidth = 1.6;
      for (let i = -1; i < 9; i++) { g.beginPath(); g.ellipse(i * 16 + 8, 16, 13, 13.5, 0.35, 0, TAU); g.stroke(); }
      g.lineWidth = 1.2; for (let i = 0; i < 40; i++) { const x = hash2(i, 3) * w, y = 3 + hash2(i, 5) * (h - 6); g.beginPath(); g.moveTo(x - 2, y - 2); g.lineTo(x + 2, y + 2); g.stroke(); }
    });
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    const m = new THREE.MeshStandardMaterial({ map: t, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.4, metalness: 0.7, color: 0xc8ccd0 });
    this.own(m, 1);
    return this.mats.raCoil = m;
  }
}
