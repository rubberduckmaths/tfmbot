// restricted.js -- TileArt mixin: the Restricted Area, a fenced research compound with guard towers, searchlights
// and an airstrip (its moving parts use the nr* helpers in nuclear.js).
import { gfx } from '../quality.js';
import * as THREE from 'three';
import { BALL, BALL2, BOX, Kit, TAU, V3, _c, capsuleX, clamp01, dish, fbm2, hash2, hexCorner, part, vnoise } from './kit.js';

export class RestrictedArt {
  // Restricted Area: a secret installation behind layered fences. The outer chain-link perimeter
  // (red-and-white restricted signs on it), a raked sand strip, then an inner fence topped with
  // razor-wire coil; one way in at the front: a guard hut and boom at the outer gate, a jersey-barrier
  // chicane, the inner gate. Guard towers at three corners sweep their searchlights (beam and pool of
  // light, on the GPU) over the compound; a patrol vehicle drives the ring road (nrMove). Inside: an
  // arched hangar, its door lit, a black flying wing out on the airstrip whose edge lights chase in
  // sequence toward it; a rotating radar on its lattice tower and a white radome; the command bunker
  // with a spinning surface-search radar on its roof, blast door and lit slits, an antenna farm by it
  // (a lattice mast with red obstruction lights, whips, a wire dipole); a helipad painted with the
  // restricted symbol, a VTOL on it. Buildings in panelled metal / formwork concrete (nrPanel / nrConc),
  // the ground crisp at close range (raGroundMat: grit, aggregate, hairline cracks).
  restricted(ctx) {
    const { space } = ctx, r = this.env.srand(space * 31 + 7), HR = this.HEX_R, low = gfx.low;
    const RX = 0.32, RZ = 0.35;                                       // the ring road (an ellipse round the centre)
    const AX = -0.09, AZ0 = -0.07, AZ1 = 0.27, AW = 0.07;              // the airstrip: centre line x, from the hangar door to its threshold
    const HP = [0.085, 0.14];                                         // the helipad
    ctx.wall(0x3a3c30);
    const tex = this.canvas('ra-ground2', 512, 592, (g, w, h) => {
      const R0 = HR * 0.95, S = w / (Math.sqrt(3) * R0), px = (x) => (0.5 + x / (Math.sqrt(3) * R0)) * w, py = (z) => (0.5 + z / (2 * R0)) * h;
      const hexD = (x, z) => Math.max(Math.abs(x), Math.abs(x * 0.5 + z * Math.sqrt(3) / 2), Math.abs(x * 0.5 - z * Math.sqrt(3) / 2));
      { // the base at half resolution: olive / sand camo scrub outside, the raked strip between the fences, packed gravel inside
        const c = document.createElement('canvas'); c.width = w / 2; c.height = h / 2;
        const cg = c.getContext('2d'), id = cg.createImageData(c.width, c.height), d = id.data;
        for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
          const bx = (x * 2 / w - 0.5) * Math.sqrt(3) * R0, bz = (y * 2 / h - 0.5) * 2 * R0, hd = hexD(bx, bz);
          const n = fbm2(x / 30, y / 30, 3), f = vnoise(x / 4 + 11, y / 4), i = (y * c.width + x) * 4;
          let R, G, B;
          if (hd > 0.43) { const camo = n > 0.52, l = 0.86 + f * 0.24; R = (camo ? 100 : 150) * l; G = (camo ? 102 : 136) * l; B = (camo ? 70 : 100) * l; }
          else if (hd > 0.37) { const l = 0.95 + 0.07 * Math.sin((bx * 0.5 - bz * 0.87) * 900) + f * 0.06; R = 182 * l; G = 164 * l; B = 128 * l; }
          else { const l = 0.84 + n * 0.22 + f * 0.1; R = 132 * l; G = 126 * l; B = 110 * l; }
          d[i] = R; d[i + 1] = G; d[i + 2] = B; d[i + 3] = 255;
        }
        cg.putImageData(id, 0, 0);
        g.imageSmoothingEnabled = true; g.drawImage(c, 0, 0, w, h);
      }
      const slab = (x0, z0, x1, z1, col, step) => {                  // a concrete slab with its joints
        g.fillStyle = col; g.fillRect(px(x0), py(z0), (x1 - x0) * S, (z1 - z0) * S);
        g.strokeStyle = 'rgba(30,30,28,0.45)'; g.lineWidth = 1;
        for (let x = x0; x <= x1 + 1e-6; x += step) { g.beginPath(); g.moveTo(px(x), py(z0)); g.lineTo(px(x), py(z1)); g.stroke(); }
        for (let z = z0; z <= z1 + 1e-6; z += step) { g.beginPath(); g.moveTo(px(x0), py(z)); g.lineTo(px(x1), py(z)); g.stroke(); }
      };
      // the ring road, the gate road, the airstrip
      g.strokeStyle = '#3e3e3b'; g.lineWidth = 0.05 * S; g.beginPath(); g.ellipse(px(0), py(0), RX * S, RZ * S, 0, 0, TAU); g.stroke();
      g.fillStyle = '#3e3e3b'; g.fillRect(px(-0.032), py(0.3), 0.064 * S, py(0.58) - py(0.3));
      g.strokeStyle = 'rgba(200,196,180,0.55)'; g.lineWidth = 1.2;
      for (const k of [-1, 1]) { g.beginPath(); g.ellipse(px(0), py(0), RX * S + k * 0.023 * S, RZ * S + k * 0.023 * S, 0, 0, TAU); g.stroke(); }
      g.strokeStyle = '#d0a820'; g.lineWidth = 1.4; g.setLineDash([6, 6]); g.beginPath(); g.ellipse(px(0), py(0), RX * S, RZ * S, 0, 0, TAU); g.stroke(); g.setLineDash([]);
      slab(AX - AW / 2 - 0.035, AZ0 - 0.035, AX + AW / 2 + 0.035, AZ0 + 0.035, '#8e8d86', 0.035);   // the apron at the hangar door
      g.fillStyle = '#2f3032'; g.fillRect(px(AX - AW / 2), py(AZ0), AW * S, (AZ1 - AZ0) * S);
      g.fillStyle = '#e8e6de';
      g.fillRect(px(AX - AW / 2 + 0.004), py(AZ0), 1.4, (AZ1 - AZ0) * S); g.fillRect(px(AX + AW / 2 - 0.004) - 1.4, py(AZ0), 1.4, (AZ1 - AZ0) * S);
      for (let z = AZ0 + 0.03; z < AZ1 - 0.05; z += 0.03) g.fillRect(px(AX) - 1, py(z), 2, 0.016 * S);
      for (let i = 0; i < 6; i++) g.fillRect(px(AX - AW / 2 + 0.008 + i * 0.0105), py(AZ1 - 0.03), 0.006 * S, 0.022 * S);   // threshold bars
      g.fillStyle = 'rgba(12,12,12,0.35)';
      for (let i = 0; i < 5; i++) { const x = AX + (r() - 0.5) * 0.03, z = AZ1 - 0.06 - r() * 0.12; g.fillRect(px(x), py(z), 1.5, 0.04 * S); }   // tyre marks
      g.fillStyle = '#e0b422'; g.fillRect(px(AX - AW / 2), py(AZ1 + 0.015), AW * S, 2); g.fillRect(px(AX - AW / 2), py(AZ1 + 0.022), AW * S, 2);   // hold short
      // gate: hazard stripes between the fences, a stop line inside
      g.save(); g.beginPath(); g.rect(px(-0.032), py(0.43), 0.064 * S, 0.02 * S); g.clip();
      for (let i = -10; i < 30; i++) { g.fillStyle = i % 2 ? '#f0c020' : '#1c1c1c'; g.beginPath(); const x0 = px(-0.032) + i * 7; g.moveTo(x0, py(0.43)); g.lineTo(x0 + 7, py(0.43)); g.lineTo(x0 + 18, py(0.45)); g.lineTo(x0 + 11, py(0.45)); g.fill(); }
      g.restore();
      g.fillStyle = '#e8e6de'; g.fillRect(px(-0.03), py(0.375), 0.06 * S, 2.5);
      // pads: radar, radome, bunker, the helipad's apron
      slab(0.125, -0.245, 0.215, -0.155, '#8a8983', 0.045); slab(0.0, -0.3, 0.08, -0.22, '#8a8983', 0.04); slab(0.16, -0.06, 0.29, 0.05, '#85847e', 0.043);
      slab(HP[0] - 0.075, HP[1] - 0.075, HP[0] + 0.075, HP[1] + 0.075, '#8e8d86', 0.05);
      { const hx = px(HP[0]), hy = py(HP[1]), R = 0.064 * S;                                // the helipad: the restricted symbol
        g.fillStyle = '#34343a'; g.beginPath(); g.arc(hx, hy, R, 0, TAU); g.fill();
        g.strokeStyle = '#f2c21c'; g.lineWidth = R * 0.1; g.beginPath(); g.arc(hx, hy, R * 0.9, 0, TAU); g.stroke();
        g.fillStyle = '#ecebe4'; g.beginPath(); g.arc(hx, hy, R * 0.66, 0, TAU); g.fill();
        g.strokeStyle = '#c81e1e'; g.lineWidth = R * 0.14; g.beginPath(); g.arc(hx, hy, R * 0.5, 0, TAU); g.stroke();
        g.save(); g.translate(hx, hy); g.rotate(-Math.PI / 4); g.fillStyle = '#c81e1e'; g.fillRect(-R * 0.5, -R * 0.07, R, R * 0.14); g.restore(); }
      for (let i = 0; i < 9; i++) {                                    // oil stains
        const x = [AX, AX, 0.2, 0.0, HP[0], -0.05, 0.25, AX, 0.04][i] + (r() - 0.5) * 0.04, z = [-0.02, 0.12, 0.0, 0.3, 0.1, 0.3, -0.03, 0.2, -0.2][i] + (r() - 0.5) * 0.04, R = (0.008 + r() * 0.012) * S;
        const gr = g.createRadialGradient(px(x), py(z), 0, px(x), py(z), R); gr.addColorStop(0, 'rgba(10,10,8,0.4)'); gr.addColorStop(1, 'rgba(10,10,8,0)');
        g.fillStyle = gr; g.fillRect(px(x) - R, py(z) - R, 2 * R, 2 * R);
      }
    });
    const geo = this.ground(() => 0.0, () => _c.setRGB(1, 1, 1), { uv: true, sub: 6 });
    const gm = new THREE.Mesh(this.drape(geo, ctx.cell, ctx.H), this.raGroundMat(tex));
    gm.receiveShadow = true; ctx.g.add(gm);
    this.frostOver(ctx, geo);

    const K = new Kit(), N = new Kit(), Rb = this.nrRb(ctx);
    const olive = 0x5d6344, oliveD = 0x474c34, conc = 0x9a9a92, concD = 0x6e6e68, steel = 0x6a7078, dark = 0x22252a;
    // ---- the outer perimeter: chain-link panels on posts, restricted signs; the inner fence with its razor-wire coil
    const FR = HR * 0.86, FR2 = HR * 0.745, fh = 0.055, fh2 = 0.046;
    const fence = new Kit();
    const panel = (x0, z0, x1, z1, H, coil) => {
      const L = Math.hypot(x1 - x0, z1 - z0), ry = -Math.atan2(z1 - z0, x1 - x0), mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      const g = new THREE.PlaneGeometry(L, H).translate(0, H / 2, 0);
      const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * L / 0.05, uv.getY(i));
      fence.add('fence', g, 0xffffff, [mx, 0, mz], [0, ry, 0], 1, { uv: true });
      const n = Math.max(1, Math.round(L / 0.07));
      for (let i = 0; i <= n; i++) K.cyl('metal', steel, x0 + (x1 - x0) * i / n, 0, z0 + (z1 - z0) * i / n, 0.004, 0.004, H + 0.012, 5);
      K.add('metal', new THREE.CylinderGeometry(0.0035, 0.0035, L, 5), steel, [mx, H + 0.01, mz], [0, ry, Math.PI / 2]);
      if (coil) for (const t of low ? [0] : [0.6, -0.6]) {
        const cg = new THREE.PlaneGeometry(L, 0.024).translate(0, 0.012, 0), cu = cg.attributes.uv; for (let i = 0; i < cu.count; i++) cu.setXY(i, cu.getX(i) * L / 0.04, cu.getY(i));
        fence.add(this.raCoilMat(), cg, 0xffffff, [mx, H + 0.006, mz], [t, ry, 0, 'YXZ'], 1, { uv: true });
      }
      return [mx, mz, ry, L];
    };
    const ring = (R, H, gap, coil) => {
      const cs = [0, 1, 2, 3, 4, 5].map((k) => hexCorner(k, R)), out = [];
      for (let k = 0; k < 6; k++) {
        const [a, b] = [cs[k], cs[(k + 1) % 6]];
        if (k === 2) { const f = (-gap - a[0]) / (b[0] - a[0]); out.push(panel(a[0], a[1], -gap, a[1] + (b[1] - a[1]) * f, H, coil)); }   // the gate gap at the front corner
        else if (k === 3) { const f = (gap - a[0]) / (b[0] - a[0]); out.push(panel(gap, a[1] + (b[1] - a[1]) * f, b[0], b[1], H, coil)); }
        else out.push(panel(a[0], a[1], b[0], b[1], H, coil));
      }
      return out;
    };
    const outer = ring(FR, fh, 0.075, false);
    ring(FR2, fh2, 0.045, true);
    this.emit(fence, ctx, { shadow: false });
    for (const [i, [mx, mz, ry]] of outer.entries()) {                 // a restricted sign on each outer run, facing out
      if (low && i % 2) continue;
      const nx = Math.sin(ry), nz = Math.cos(ry), o = nx * mx + nz * mz > 0 ? 1 : -1;
      K.add(this.raSignMat(), new THREE.PlaneGeometry(0.034, 0.026), 0xffffff, [mx + nx * o * 0.003, 0.03, mz + nz * o * 0.003], [0, ry + (o < 0 ? Math.PI : 0), 0], 1, { uv: true });
    }
    // ---- the gate: posts, boom (red/white) and the guard hut outside; a jersey-barrier chicane between the fences; the inner gate leaf slid open
    K.box('nrConc', conc, -0.085, 0, 0.455, 0.022, 0.07, 0.022); K.box('nrConc', conc, 0.085, 0, 0.455, 0.022, 0.07, 0.022);
    for (let i = 0; i < 6; i++) K.box('std', i % 2 ? 0xd82020 : 0xf2f2ee, -0.07 + i * 0.022 + 0.011, 0.045, 0.455, 0.022, 0.009, 0.009);
    this.nrLampAdd(N, BALL, 0xff3a20, [0.085, 0.076, 0.455], [0, 0, 0], [0.006, 0.005, 0.006], -0.9, 0);
    K.box('nrPanel', 0xd8d4c4, -0.13, 0, 0.38, 0.05, 0.045, 0.045); K.box('glow', 0xffe2a8, -0.13, 0.024, 0.4028, 0.04, 0.013, 0.002);
    K.box('std', oliveD, -0.13, 0.045, 0.38, 0.058, 0.006, 0.052);
    for (const [x, z] of [[-0.022, 0.405], [0.022, 0.395]]) K.add('nrConc', new THREE.CylinderGeometry(0.004, 0.009, 0.014, 4, 1).rotateY(Math.PI / 4).translate(0, 0.007, 0), conc, [x, 0, z], [0, 0, 0], [2.4, 1, 0.9]);
    K.box('std', steel, 0.075, 0, 0.388, 0.07, 0.04, 0.004);          // the inner gate leaf, slid aside
    // ---- guard towers at three corners, their searchlights sweeping the compound (head, beam and the pool of light it throws)
    const towers = [1, 5, 3].map((k) => hexCorner(k, FR * 0.93));
    for (const [ti, [tx, tz]] of towers.entries()) {
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) K.add('metal', new THREE.CylinderGeometry(0.0035, 0.0045, 0.15, 5), steel, [tx + dx * 0.018, 0.075, tz + dz * 0.018], [dz * 0.08, 0, -dx * 0.08]);
      for (const y of [0.05, 0.1]) K.box('metal', steel, tx, y, tz, 0.042 - y * 0.08, 0.003, 0.042 - y * 0.08);
      K.box('nrPanel', olive, tx, 0.15, tz, 0.062, 0.042, 0.062);
      K.box('glow', 0xffe0a0, tx, 0.166, tz, 0.064, 0.01, 0.064);                    // lit windows band
      K.add('std', new THREE.ConeGeometry(0.052, 0.03, 4).rotateY(Math.PI / 4), oliveD, [tx, 0.207, tz]);
      K.add('blink', BALL, 0xff2a1a, [tx, 0.225, tz], [0, 0, 0], 0.007);
      const az = Math.atan2(-tz, -tx), hL = 0.2, dH = 0.27, len = Math.hypot(hL, dH), piv = [tx, 0.196, tz], spin = [0.42 + ti * 0.07, ti * 2.1, low ? 0.35 : 0.62];
      const D = new V3(Math.cos(az) * dH, -hL, Math.sin(az) * dH).normalize(), lx = tx + Math.cos(az) * 0.036, lz = tz + Math.sin(az) * 0.036, ly = 0.196;
      const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new V3(0, -1, 0), D)), er = [e.x, e.y, e.z];
      this.nrSpinAdd(N, 'nrSpin', new THREE.CylinderGeometry(0.009, 0.007, 0.018, 12).translate(0, -0.004, 0), 0x3a3e36, [lx, ly, lz], er, 1, piv, spin);
      this.nrSpinAdd(N, 'nrSpin', BOX, steel, [tx + Math.cos(az) * 0.018, ly + 0.004, tz + Math.sin(az) * 0.018], [0, -az, 0], [0.034, 0.004, 0.004], piv, spin);
      this.nrSpinAdd(N, 'nrBeam', new THREE.CircleGeometry(0.0085, 12).rotateX(Math.PI / 2).translate(0, -0.0135, 0), 0xfff4d8, [lx, ly, lz], er, 1, piv, spin);
      this.nrSpinAdd(N, 'nrBeam', new THREE.ConeGeometry(0.052, len, 16, 1, true).translate(0, -len / 2, 0), (x, y, z) => _c.setRGB(1, 0.95, 0.8).multiplyScalar(0.25 + 0.75 * Math.pow(clamp01(1 - Math.hypot(x - lx, y - ly, z - lz) / len), 1.3)), [lx, ly, lz], er, 1, piv, spin);
      const gx = lx + D.x / Math.hypot(D.x, D.z) * dH, gz = lz + D.z / Math.hypot(D.x, D.z) * dH;
      this.nrSpinAdd(N, 'nrBeam', new THREE.CircleGeometry(0.05, 20).rotateX(-Math.PI / 2), (x, y, z) => _c.setRGB(1, 0.95, 0.82).multiplyScalar(2.2 * Math.pow(clamp01(1 - Math.hypot((x - gx) / 1.35, z - gz) / 0.05 * 1.35), 0.8)), [gx, 0.0018, gz], [0, -az, 0], [1.35, 1, 1], piv, spin);
    }
    // ---- the hangar: an arched shell (panelled, ribbed), closed at the back; its front door open on a lit interior
    { const hx = AX, L = 0.17, rad = 0.072, z1 = AZ0 - 0.012, z0 = z1 - L, zc = (z0 + z1) / 2;
      K.add('nrPanel', new THREE.CylinderGeometry(rad, rad, L, 26, 1, true, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2), 0x737a5a, [hx, 0, zc]);
      for (let i = 0; i <= 5; i++) K.add('std', new THREE.TorusGeometry(rad * 1.012, 0.0022, 4, 20, Math.PI), 0x5a6046, [hx, 0, z0 + i / 5 * L]);
      const face = (z, door) => {
        const sh = new THREE.Shape(); sh.moveTo(-rad, 0); sh.absarc(0, 0, rad, Math.PI, 0, true); sh.lineTo(rad, 0);
        if (door) { sh.lineTo(0.05, 0); sh.lineTo(0.05, 0.052); sh.lineTo(-0.05, 0.052); sh.lineTo(-0.05, 0); }
        sh.lineTo(-rad, 0);
        return new THREE.ExtrudeGeometry(sh, { depth: 0.004, bevelEnabled: false, curveSegments: 14 }).translate(0, 0, z);
      };
      K.add('nrPanel', face(z0 - 0.004, false), 0x656b4e, [hx, 0, 0]);
      K.add('nrPanel', face(z1 - 0.002, true), 0x656b4e, [hx, 0, 0]);
      K.box('std', 0x121416, hx, 0, zc, rad * 1.4, rad * 0.6, L - 0.008);                  // the dark inside
      K.add('glow', new THREE.PlaneGeometry(0.1, 0.052).translate(0, 0.026, 0), (x, y) => _c.setRGB(1, 0.86, 0.6).multiplyScalar(0.3 + 0.35 * clamp01(y / 0.052)), [hx, 0, z1 - 0.012]);
      for (const s of [-1, 1]) K.box('nrPanel', 0x6a7052, hx + s * 0.068, 0, z1 + 0.004, 0.036, 0.05, 0.004);   // the door leaves, rolled aside
      K.box('glow', 0xffe8b0, hx, 0.058, z1 + 0.004, 0.04, 0.004, 0.003);                  // the lamp over the door
      // the flying wing out on the apron, nose to the strip
      const fw = new THREE.Shape(); fw.moveTo(0, -0.058); fw.lineTo(0.078, 0.022); fw.lineTo(0.052, 0.036); fw.lineTo(0.026, 0.022); fw.lineTo(0, 0.036); fw.lineTo(-0.026, 0.022); fw.lineTo(-0.052, 0.036); fw.lineTo(-0.078, 0.022); fw.lineTo(0, -0.058);
      const wz = AZ0 + 0.06, wy = 0.012;
      K.add('metal', new THREE.ExtrudeGeometry(fw, { depth: 0.004, bevelEnabled: true, bevelThickness: 0.0015, bevelSize: 0.002, bevelSegments: 1 }).rotateX(Math.PI / 2), 0x1d2024, [hx, wy + 0.004, wz]);
      K.add('metal', BALL, 0x24282c, [hx, wy + 0.004, wz - 0.012], [0, 0, 0], [0.016, 0.007, 0.034]);
      K.add('glass', BALL, 0x3a4450, [hx, wy + 0.008, wz - 0.03], [0, 0, 0], [0.007, 0.004, 0.012]);
      for (const [x, z] of [[0, -0.035], [-0.025, 0.01], [0.025, 0.01]]) K.cyl('metal', 0x3a3c40, hx + x, 0, wz + z, 0.0018, 0.0018, wy, 5);
      K.box('glow', 0xff3020, hx - 0.077, wy + 0.004, wz + 0.021, 0.003, 0.002, 0.003); K.box('glow', 0x30ff60, hx + 0.077, wy + 0.004, wz + 0.021, 0.003, 0.002, 0.003); }
    // the airstrip's edge lights, flashing in sequence toward the hangar; green threshold lights
    for (let i = 0; i < (low ? 6 : 9); i++) {
      const z = AZ1 - 0.02 - i * (AZ1 - AZ0 - 0.04) / ((low ? 6 : 9) - 1);
      for (const s of [-1, 1]) this.nrLampAdd(N, BOX, 0xfff0b8, [AX + s * (AW / 2 + 0.006), 0.003, z], [0, 0, 0], [0.004, 0.005, 0.004], -0.7, i * 0.06);
    }
    for (let i = 0; i < 5; i++) K.box('glow', 0x40ff70, AX - AW / 2 + 0.008 + i * 0.0135, 0, AZ1 + 0.004, 0.004, 0.004, 0.004);
    // ---- the radar: lattice tower, the dish turning (nrSpin)
    const [rx, rz] = [0.17, -0.2];
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) K.add('metal', new THREE.CylinderGeometry(0.004, 0.006, 0.2, 5), steel, [rx + dx * 0.024, 0.1, rz + dz * 0.024], [dz * 0.1, 0, -dx * 0.1]);
    for (let i = 1; i < 4; i++) K.box('metal', steel, rx, i * 0.05, rz, 0.05 - i * 0.006, 0.004, 0.05 - i * 0.006);
    if (!low) for (let i = 0; i < 3; i++) for (const s of [-1, 1]) this.strut(K, 'metal', steel, [rx + s * (0.026 - i * 0.004), i * 0.05 + 0.005, rz + 0.026 - i * 0.004], [rx - s * (0.022 - i * 0.004), (i + 1) * 0.05, rz + 0.022 - i * 0.004], 0.0012, 4);
    K.cyl('metal', 0x8a9098, rx, 0.2, rz, 0.02, 0.016, 0.02, 12);
    { const piv = [rx, 0.26, rz], sp = [0.9, r() * 6];
      this.nrSpinAdd(N, 'nrSpin', dish(0.085, 0.03, 24), 0xe6e8ea, [rx, 0.26, rz], [Math.PI / 2 - 0.45, 0, 0], 1, piv, sp);
      this.nrSpinAdd(N, 'nrSpin', new THREE.CylinderGeometry(0.003, 0.003, 0.07, 5), steel, [rx, 0.26 + 0.015, rz + 0.03], [Math.PI / 2 - 0.45, 0, 0], 1, piv, sp);
      this.nrSpinAdd(N, 'nrSpin', new THREE.CylinderGeometry(0.006, 0.006, 0.05, 6), steel, [rx, 0.235, rz], [0, 0, 0], 1, piv, sp);
      this.nrSpinAdd(N, 'nrSpin', BOX, 0x4a4f56, [rx, 0.245, rz - 0.03], [0, 0, 0], [0.02, 0.014, 0.014], piv, sp); }
    K.add('blink', BALL, 0xff2a1a, [rx, 0.215, rz + 0.02], [0, 0, 0], 0.006);
    // the radome on its drum
    K.cyl('nrConc', concD, 0.04, 0, -0.26, 0.032, 0.03, 0.024, 16);
    K.add('nrPanel', BALL2, 0xeeeeea, [0.04, 0.024, -0.26], [0, 0, 0], [0.036, 0.034, 0.036]);
    // ---- the command bunker: sloped concrete, a blast door and lit slits; a surface-search radar spinning on its roof
    { const bx = 0.225, bz = -0.005;
      K.add('nrConc', new THREE.CylinderGeometry(0.07, 0.09, 0.05, 4, 1).rotateY(Math.PI / 4), conc, [bx, 0.025, bz], [0, 0.15, 0], [1.2, 1, 0.85]);
      K.box('nrConc', concD, bx, 0.05, bz, 0.1, 0.004, 0.07, 0.15);
      K.box('glow', 0x9fe3ff, bx - 0.012, 0.03, bz + 0.052, 0.07, 0.005, 0.004, 0.15);
      K.box('metal', 0x4a5058, bx + 0.045, 0.0, bz + 0.05, 0.028, 0.03, 0.006, 0.15);        // the blast door
      K.box('glow', 0xff3a20, bx + 0.045, 0.033, bz + 0.053, 0.006, 0.003, 0.002, 0.15);
      K.cyl('metal', steel, bx - 0.02, 0.054, bz - 0.01, 0.004, 0.004, 0.02, 8);
      const piv = [bx - 0.02, 0.078, bz - 0.01], sp = [2.4, 0.5];
      this.nrSpinAdd(N, 'nrSpin', BOX, 0x30343a, [bx - 0.02, 0.078, bz - 0.01], [0, 0, 0], [0.06, 0.006, 0.006], piv, sp);
      this.nrSpinAdd(N, 'nrSpin', BOX, 0x8a9098, [bx - 0.02, 0.074, bz - 0.01], [0, 0, 0], [0.012, 0.006, 0.012], piv, sp);
      // the antenna farm: a lattice mast with red obstruction lights, two whips, a wire dipole to a short pole
      const mx = bx + 0.05, mz = bz - 0.075;
      for (const [dx, dz] of [[-1, -1], [1, -1], [0, 1]]) this.strut(K, 'metal', steel, [mx + dx * 0.012, 0, mz + dz * 0.012], [mx, 0.28, mz], 0.0022, 5);
      if (!low) for (let i = 1; i < 7; i++) K.add('metal', new THREE.TorusGeometry(0.012 * (1 - i / 7), 0.0012, 3, 3), steel, [mx, i * 0.04, mz], [Math.PI / 2, 0, 0]);
      K.add('blink', BALL, 0xff2a1a, [mx, 0.283, mz], [0, 0, 0], 0.0065); K.add('blink', BALL, 0xff2a1a, [mx, 0.15, mz], [0, 0, 0], 0.005);
      for (const [x, z, hh] of [[bx - 0.06, bz - 0.06, 0.15], [bx - 0.035, bz - 0.075, 0.12]]) { K.cyl('metal', 0x9aa0a8, x, 0, z, 0.0016, 0.0009, hh, 5); K.box('nrConc', concD, x, 0, z, 0.012, 0.004, 0.012); }
      if (!low) { K.cyl('metal', steel, bx - 0.095, 0, bz + 0.03, 0.002, 0.002, 0.08, 5); this.strut(K, 'metal', 0x2a2a2a, [mx, 0.2, mz], [bx - 0.095, 0.078, bz + 0.03], 0.0007, 3); }
      for (let i = 0; i < 6; i++) K.add('std', BALL, 0x8f8360, [bx - 0.09 + i * 0.022, 0.007, bz + 0.085], [0, 0, 0], [0.013, 0.008, 0.009]);   // sandbags
    }
    // ---- the helipad's VTOL
    { const [x, z] = HP, ry = 0.6;
      K.add('std', capsuleX(0.016, 0.07, 10), 0x4f5a46, [x, 0.022, z], [0, ry, 0], 1, { smooth: true });
      K.box('std', 0x46503e, x, 0.026, z, 0.028, 0.004, 0.14, ry);
      K.box('std', 0x46503e, x - Math.cos(ry) * 0.05, 0.028, z + Math.sin(ry) * 0.05, 0.011, 0.003, 0.06, ry);
      K.box('glass', 0x7fb8d8, x + Math.cos(ry) * 0.04, 0.03, z - Math.sin(ry) * 0.04, 0.018, 0.007, 0.014, ry);
      for (const s of [-1, 1]) { K.cyl('std', 0x3c4436, x + Math.sin(ry) * s * 0.068, 0.016, z + Math.cos(ry) * s * 0.068, 0.016, 0.016, 0.014, 16); K.add('glow', BALL, s < 0 ? 0xff3020 : 0x30ff60, [x + Math.sin(ry) * s * 0.071, 0.03, z + Math.cos(ry) * s * 0.071], [0, 0, 0], 0.0025); } }
    // parked: an armoured carrier by the hut, a fuel bowser by the apron
    const rover = (x, z, ry, c, L = 0.07) => {
      K.box('std', c, x, 0.012, z, L, 0.028, 0.04, ry);
      K.box('std', 0x2a3440, x + Math.cos(ry) * L * 0.31, 0.03, z - Math.sin(ry) * L * 0.31, 0.022, 0.014, 0.036, ry);
      for (const [a, b] of [[-L * 0.36, -0.022], [L * 0.36, -0.022], [-L * 0.36, 0.022], [L * 0.36, 0.022]]) K.add('std', new THREE.CylinderGeometry(0.011, 0.011, 0.008, 12).rotateX(Math.PI / 2), dark, [x + Math.cos(ry) * a + Math.sin(ry) * b, 0.011, z - Math.sin(ry) * a + Math.cos(ry) * b], [0, ry, 0]);
    };
    rover(-0.205, -0.03, Math.PI / 2, oliveD);
    { const x = AX + 0.1, z = AZ0 - 0.005; rover(x, z, Math.PI / 2, 0x6a6f4c, 0.06); K.add('nrPanel', new THREE.CylinderGeometry(0.014, 0.014, 0.04, 12).rotateX(Math.PI / 2), 0xb8b4a0, [x, 0.03, z + 0.008]); }
    for (let i = 0; i < 4; i++) K.box('nrConc', conc, 0.04 + i * 0.012, 0, -0.07 - i * 0.004, 0.01, 0.018, 0.034, 0.3);   // spare barriers stacked by the radome
    for (const [k, L] of K.by) if (typeof k === 'string' && k.startsWith('nr')) { N.by.set(k, L); K.by.delete(k); }
    this.emit(K, ctx);
    this.nrEmit(N, ctx);
    // ---- the patrol vehicle on the ring road: an armoured scout car, amber light bar, headlamps
    { const VP = [], VG = [], P = (L, g, c, t, rr = [0, 0, 0], s = 1) => L.push(part(g, c, t, rr, s));
      P(VP, BOX, 0x565c40, [0, 0.016, 0], [0, 0, 0], [0.056, 0.016, 0.03]);
      P(VP, BOX, 0x4a5036, [-0.006, 0.029, 0], [0, 0, 0], [0.032, 0.012, 0.027]);
      P(VP, BOX, 0x1e2a34, [0.011, 0.03, 0], [0, 0, 0.5], [0.003, 0.009, 0.024]);
      for (const x of [-0.019, 0.019]) for (const z of [-0.016, 0.016]) P(VP, new THREE.CylinderGeometry(0.0085, 0.0085, 0.006, 12).rotateX(Math.PI / 2), 0x1e1e1e, [x, 0.0085, z]);
      P(VP, new THREE.CylinderGeometry(0.0008, 0.0008, 0.04, 4), 0x2a2a2a, [-0.02, 0.05, 0.01]);
      P(VG, BOX, 0xffa21a, [-0.006, 0.0365, 0], [0, 0, 0], [0.005, 0.003, 0.018]);
      for (const z of [-0.01, 0.01]) P(VG, BOX, 0xfff2c8, [0.0282, 0.018, z], [0, 0, 0], [0.0015, 0.004, 0.006]);
      for (const z of [-0.011, 0.011]) P(VG, BOX, 0xff2010, [-0.0282, 0.018, z], [0, 0, 0], [0.0015, 0.003, 0.004]);
      this.nrMoveEmit(ctx, this.nrVehicle(VP, VG, [0, 0, RX, RZ], 0.21, r() * TAU, Rb)); }
    this.emblem(ctx, 'restricted_area', -0.2, 0.2, 0.26, 0.28);
  }
  // the Restricted Area's ground: its painted canvas (ra-ground2) plus per-pixel detail from the board position
  // (from the hex uv): grit, asphalt aggregate on the dark surfaces, hairline cracks in patches; fades under a pixel
  raGroundMat(tex) {
    if (this.mats.raGround2) return this.mats.raGround2;
    const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }), R0 = (this.HEX_R * 0.95).toFixed(5);
    m.onBeforeCompile = (s) => {
      s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>
float raH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float raN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(raH(i), raH(i + vec2(1.0, 0.0)), f.x), mix(raH(i + vec2(0.0, 1.0)), raH(i + vec2(1.0, 1.0)), f.x), f.y); }`)
        .replace('#include <map_fragment>', `#include <map_fragment>
{
  vec2 p = vec2((vMapUv.x - 0.5) * 1.7320508 * ${R0}, (0.5 - vMapUv.y) * 2.0 * ${R0});
  float px = length(fwidth(p)), fine = clamp(1.0 - px * 300.0, 0.0, 1.0), mid = clamp(1.0 - px * 80.0, 0.0, 1.0);
  vec3 c = diffuseColor.rgb; float lum = dot(c, vec3(0.3, 0.59, 0.11));
  float agg = raH(floor(p * 1400.0)) * fine, dk = 1.0 - smoothstep(0.03, 0.09, lum);
  c *= 0.93 + 0.12 * raN(p * 800.0) * fine + 0.08 * (raN(p * 90.0) - 0.5);
  c += vec3(0.05) * step(0.93, agg) * dk;
  float cx = abs(raN(p * 55.0 + vec2(raN(p * 9.0) * 2.0)) - 0.5);
  c *= 1.0 - 0.25 * (1.0 - smoothstep(0.0, 0.02, cx)) * smoothstep(0.55, 0.75, raN(p * 11.0 + 3.0)) * mid;
  diffuseColor.rgb = c;
}`);
    };
    m.customProgramCacheKey = () => 'raGround2';
    this.own(m, 0.55);
    return this.mats.raGround2 = m;
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
  // razor-wire coil (concertina) on the inner fence: overlapping loops with barbs, alpha-tested
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
