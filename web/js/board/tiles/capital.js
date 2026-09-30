// capital.js -- TileArt mixin: the Capital, a canal city round a harbour whose canals run out to neighbouring
// oceans, and its parts (marble and ground materials, statues, and the shader-moved traffic and people that commercial.js reuses).
import { gfx } from '../quality.js';
import * as THREE from 'three';
import { mergeGeometries } from '../../../vendor/BufferGeometryUtils.js';
import { BALL, BOX, Kit, TAU, V3, _c, _c2, capsuleX, clamp01, fbm2, hash2, lathe, part, smooth, smoothGeo } from './kit.js';

export class CapitalArt {
  // Capital: a grand canal city. A white-and-gold capitol faces a round
  // harbour; canals run from the harbour to every hex side that has an ocean
  // next to it, through lock gates and down a spillway into that ocean's
  // water (rebuilt when an ocean arrives next door, via xkey). With no ocean
  // neighbour the canals ring the capitol and end at closed locks.
  capital(ctx) {
    const r = this.env.srand(ctx.space * 151 + 3), g = this.grow, cell = ctx.cell, k = this.kOf(cell), low = gfx.low, life = this.b.variedTiles ? this.life : 1;
    ctx.wall(0x2a2c32);
    const HB = [0, -0.02], HBR = 0.075;                                 // the harbour
    // canal directions: toward each ocean neighbour (board units, unit vectors)
    const oceans = this.neighbours(cell).filter((c) => this.b.tiles.get(c.i)?.userData.key?.startsWith('0:'));
    let dirs = oceans.map((c) => { const dx = c.bx - cell.bx, dz = c.by - cell.by, L = Math.hypot(dx, dz); return [dx / L, dz / L, true]; });
    // the capitol stands on the side farthest from every canal (back, back-left/right, left, front-left: never on the owner marker)
    const cand = [-Math.PI / 2, -2 * Math.PI / 3, -Math.PI / 3, Math.PI, 2 * Math.PI / 3];
    let ca = cand[0], best = -1;
    for (const a of cand) { const m = Math.min(4, ...dirs.map(([dx, dz]) => Math.abs(((Math.atan2(dz, dx) - a + 3 * Math.PI) % TAU) - Math.PI))); if (m > best + 0.01) { best = m; ca = a; } }
    const [cx, cz] = [Math.cos(ca) * 0.23, Math.sin(ca) * 0.23], capX = cx, capZ = cz, cth = Math.atan2(HB[0] - cx, HB[1] - cz);   // cth turns the capitol's front (+z) toward the harbour
    const capLocal = (x, z) => { const dx = x - cx, dz = z - cz, c = Math.cos(cth), s = Math.sin(cth); return [dx * c - dz * s, dx * s + dz * c]; };
    const capWorld = (lx, lz) => { const c = Math.cos(cth), s = Math.sin(cth); return [cx + lx * c + lz * s, cz - lx * s + lz * c]; };
    if (!dirs.length) dirs = [[-Math.sqrt(3) / 2, 0.5, false], [Math.sqrt(3) / 2, -0.5, false]];
    const segs = dirs.map(([dx, dz, open]) => ({ dx, dz, open, x0: HB[0] + dx * HBR, z0: HB[1] + dz * HBR, x1: dx * 0.47, z1: dz * 0.47 }));
    const segD = (x, z, s) => { const vx = s.x1 - s.x0, vz = s.z1 - s.z0, t = clamp01(((x - s.x0) * vx + (z - s.z0) * vz) / (vx * vx + vz * vz)); return Math.hypot(x - s.x0 - vx * t, z - s.z0 - vz * t); };
    const ring = oceans.length === 0;                                   // the moat round the capitol
    const RC = [cx * 0.87, cz * 0.87], RR = 0.17;
    const canalD = (x, z) => { let d = Math.hypot(x - HB[0], z - HB[1]) - HBR + 0.02; for (const s of segs) { const q = segD(x, z, s); if (q < d) d = q; } return ring ? Math.min(d, Math.abs(Math.hypot(x - RC[0], (z - RC[1]) * 1.2) - RR)) : d; };
    const CW = 0.022;
    // the forecourt: the capitol's block and the paved circle round the harbour (soft edged, for the paving)
    const plazaSd = (x, z) => { const [lx, lz] = capLocal(x, z); return Math.min(Math.max(Math.abs(lx) - 0.19, Math.abs(lz - 0.015) - 0.115), Math.hypot(x - HB[0], z - HB[1]) - HBR - 0.03); };
    // ---- the ground: the grid's vertices just outside the water's edge are snapped onto it, so the quays'
    // tops are crisp lines (the grid's zigzag is left under the water); aCp = (x, z, forecourt, distance to
    // the water) for the paving (capGroundMat)
    {
      const hf = (x, z) => canalD(x, z) < CW ? -0.014 : 0;
      const geo = this.ground(hf, () => _c.setRGB(1, 1, 1), { sub: 48 });
      const P = geo.attributes.position, C = geo.attributes.color, n = P.count, step = this.HEX_R * 0.95 / 48, e = 1e-4, aC = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) {
        let x = P.getX(i), z = P.getZ(i); const d = canalD(x, z), y = P.getY(i);
        if (d > CW && d < CW + step * 1.02 && this.edgeDist(x, z) > 0.004) {
          const gx = (canalD(x + e, z) - canalD(x - e, z)) / (2 * e), gz = (canalD(x, z + e) - canalD(x, z - e)) / (2 * e), gl = Math.hypot(gx, gz) || 1;
          x -= gx / gl * (d - CW) / gl; z -= gz / gl * (d - CW) / gl; P.setX(i, x); P.setZ(i, z);
        }
        const wet = y < -0.002, dd = Math.max(canalD(x, z), wet ? 0 : CW);
        if (wet) _c.setRGB(0.26, 0.28, 0.31).multiplyScalar(dd < CW - 0.004 ? 1 : 1.9);           // the bed; the foot of the quay wall paler
        else if (low && dd < CW + 0.01) _c.setRGB(0.86, 0.84, 0.78);                               // (Low: the kerb in the vertex colours)
        else _c.setRGB(0.36, 0.38, 0.42).multiplyScalar(0.95 + 0.1 * fbm2(x * 30, z * 30, 2));
        C.setXYZ(i, _c.r, _c.g, _c.b);
        aC[i * 4] = x; aC[i * 4 + 1] = z; aC[i * 4 + 2] = smooth(0.012, -0.004, plazaSd(x, z)); aC[i * 4 + 3] = wet ? -0.05 : Math.max(dd, CW);
      }
      geo.setAttribute('aCp', new THREE.BufferAttribute(aC, 4));
      geo.computeVertexNormals();
      this.groundMeshGeo(ctx, geo, { mat: low ? this.mat('ground') : this.capGroundMat() });
    }
    const K = new Kit(), marble = 0xf4f1e8, shade = 0xd8d4c8, gilt = 0xf2c24a, MB = this.capMarbleMat(), MOVE = this.capMoveMat(false), MOVEG = this.capMoveMat(true);
    const water = this.ecoWaterMat(), puffs = [];
    const LB = this._capLamp ||= smoothGeo(new THREE.IcosahedronGeometry(1, 1)), POLE = this._capPole ||= new THREE.CylinderGeometry(1, 1, 1, 4).translate(0, 0.5, 0);
    const pole = (x, y, z, h, rad = 0.0006) => K.add('metal', POLE, 0x3a3e46, [x, y, z], [0, 0, 0], [rad, h, rad]);
    // ---- the water: one sheet for the canals, the harbour and the moat, in the Ecological Zone's shared
    // water (ripples dragged along the flow: out to the open locks, round the fountain, round the moat)
    this.waterSheet(K, water, [-0.5, 0.5, -0.56, 0.56], gfx.pick(0.009, 0.0075, 0.0065),
      (x, z) => this.edgeDist(x, z) < 0.003 ? 1 : Math.max(0, canalD(x, z) - CW + 0.002),
      (x, z) => {
        let fx = 0, fz = 0, dep = 0.5, wh = 0, bd = 9;
        for (const s of segs) {
          const d = segD(x, z, s); if (d >= bd) continue; bd = d;
          const L = Math.hypot(s.x1 - s.x0, s.z1 - s.z0), sp = s.open ? 0.03 : 0.007;
          fx = (s.x1 - s.x0) / L * sp; fz = (s.z1 - s.z0) / L * sp; dep = 0.3 + 0.45 * clamp01(1 - d / CW);
          if (s.open) wh = 0.45 * smooth(0.06, 0.0, Math.hypot(x - s.dx * 0.44, z - s.dz * 0.44));
        }
        const hx = x - HB[0], hz = z - HB[1], hr = Math.hypot(hx, hz) || 1e-6;
        if (hr - HBR + 0.02 < bd) { bd = hr - HBR + 0.02; fx = -hz / hr * 0.012 + hx / hr * 0.004; fz = hx / hr * 0.012 + hz / hr * 0.004; dep = 0.55 + 0.25 * smooth(HBR, 0.02, hr); wh = 0.2 * smooth(0.058, 0.047, hr) * smooth(0.034, 0.045, hr); }
        if (ring) { const rx = x - RC[0], rz = (z - RC[1]) * 1.2, rq = Math.hypot(rx, rz) || 1e-6; if (Math.abs(rq - RR) < bd) { fx = -rz / rq * 0.008; fz = rx / rq * 0.008 / 1.2; dep = 0.35 + 0.4 * clamp01(1 - Math.abs(rq - RR) / CW); wh = 0; } }
        return [-0.006, fx, fz, dep, wh, 1];
      });
    for (const s of segs) {
      const L = Math.hypot(s.x1 - s.x0, s.z1 - s.z0), a = Math.atan2(s.z1 - s.z0, s.x1 - s.x0), ux = Math.cos(a), uz = Math.sin(a), nx = -uz, nz = ux;
      // quay lamps along both banks
      const n = Math.floor(L / 0.035);
      for (let i = 1; i < n; i++) for (const sd of [-1, 1]) {
        const t = i / n, x = s.x0 + (s.x1 - s.x0) * t + nx * sd * (CW + 0.004), z = s.z0 + (s.z1 - s.z0) * t + nz * sd * (CW + 0.004);
        if (this.env.inClearing(x, z, -0.02) || Math.abs(t - 0.5) * L < 0.02) continue;
        if (!low) pole(x, 0, z, 0.011);
        K.add('glow', LB, 0xffe2a8, [x, low ? 0.004 : 0.012, z], [0, 0, 0], low ? 0.003 : 0.0024);
      }
      // the lock gate at the tile side: two piers and a lit gate
      const gx = s.dx * 0.44, gz = s.dz * 0.44;
      for (const sd of [-1, 1]) { K.box(MB, shade, gx + nx * sd * (CW + 0.004), -0.014, gz + nz * sd * (CW + 0.004), 0.02, 0.044, 0.012, -a); K.box(MB, marble, gx + nx * sd * (CW + 0.004), 0.03, gz + nz * sd * (CW + 0.004), 0.023, 0.003, 0.015, -a); }
      K.box('metal', s.open ? 0x6a7078 : 0x9a4a2a, gx, s.open ? 0.024 : -0.012, gz, 0.006, s.open ? 0.008 : 0.034, CW * 2.2, -a);
      K.add(s.open ? 'glow' : 'blinkA', BALL, s.open ? 0x7dffb0 : 0xffffff, [gx + nx * (CW + 0.004), 0.037, gz + nz * (CW + 0.004)], [0, 0, 0], 0.004);
      // a bridge over the canal half way: a marble arch, a deck with parapets, a lamp at each end
      const bx = (s.x0 + s.x1) / 2, bz = (s.z0 + s.z1) / 2;
      K.add(MB, new THREE.TorusGeometry(CW * 1.3, 0.004, 6, 16, Math.PI), marble, [bx, -0.004, bz], [0, -a, 0], [1, 0.6, 3.2]);
      K.box(MB, marble, bx, 0.008, bz, 0.02, 0.003, CW * 2.6, -a);
      for (const sd of [-1, 1]) K.box(MB, shade, bx + ux * sd * 0.0085, 0.011, bz + uz * sd * 0.0085, 0.0025, 0.0035, CW * 2.6, -a);
      if (!low) for (const sd of [-1, 1]) { const lx = bx + nx * sd * CW * 1.35, lz = bz + nz * sd * CW * 1.35; pole(lx, 0.011, lz, 0.012); K.add('glow', LB, 0xfff0cc, [lx, 0.024, lz], [0, 0, 0], 0.0026); }
      if (s.open) {
        // the spillway: water steps down off the city, across the shore, into the ocean
        const sp = [], sB = [], sF = [], sW = [], out = 0.63, drop = -ctx.H / k;
        for (let i = 0; i <= 10; i++) {
          const t = i / 10, rr = 0.46 + (out - 0.46) * t, y = t < 0.18 ? -0.006 + (drop + 0.004 + 0.006) * (t / 0.18) : drop + 0.004 - 0.024 * smooth(0.45, 1, t);   // dives under the ocean's surface at the far end
          for (const sd of [-1, 1]) { const x = s.dx * rr - s.dz * sd * CW * (0.95 + t * 0.6), z = s.dz * rr + s.dx * sd * CW * (0.95 + t * 0.6); sp.push(x, y, z); sB.push(x, z); sF.push(s.dx * 0.1, s.dz * 0.1); sW.push(0.25, 0.75 * (1 - t) + 0.15, 1); }
        }
        const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
        const ix = []; for (let i = 0; i < 10; i++) { const q = i * 2; ix.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
        sg.setIndex(ix); sg.computeVertexNormals();
        { const N = sg.attributes.normal; let up = 0; for (let i = 0; i < N.count; i++) up += N.getY(i); if (up < 0) { sg.index.array.reverse(); sg.computeVertexNormals(); } }
        sg.setAttribute('aB', new THREE.Float32BufferAttribute(sB, 2)); sg.setAttribute('aFlow', new THREE.Float32BufferAttribute(sF, 2)); sg.setAttribute('aW', new THREE.Float32BufferAttribute(sW, 3));
        K.raw(water, sg);
        // white water down the spillway: the waterfall streaks over the drop (v falls downstream: the streaks run down)
        const fp = [], fuv = [];
        for (let i = 0; i <= 3; i++) { const t = i / 3 * 0.26, rr = 0.46 + (out - 0.46) * t, y = t < 0.18 ? -0.006 + (drop + 0.004 + 0.006) * (t / 0.18) : drop + 0.004 - t * 0.012; for (const sd of [-1, 1]) { fp.push(s.dx * rr - s.dz * sd * CW * (0.95 + t * 0.6), y + 0.0015, s.dz * rr + s.dx * sd * CW * (0.95 + t * 0.6)); fuv.push(sd > 0 ? 1 : 0, 3 - i); } }
        const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3)); fg.setAttribute('uv', new THREE.Float32BufferAttribute(fuv, 2));
        const fi = []; for (let i = 0; i < 3; i++) { const q = i * 2; fi.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
        fg.setIndex(fi); fg.computeVertexNormals();
        K.add('falls', fg, 0xffffff, [0, 0, 0], [0, 0, 0], 1, { uv: true });
        puffs.push({ x: s.dx * 0.49, z: s.dz * 0.49, y: drop + 0.004, n: 4, life: 2.5, rise: 0.04, size: 0.04, col: [0.95, 0.98, 1, 0.5], drift: [s.dx * 0.05, s.dz * 0.05], jit: 0.03 });
      }
    }
    // ---- the fountain in the harbour: a marble pool round the obelisk, jets arching out into the basin
    K.add(MB, new THREE.TorusGeometry(0.022, 0.0028, 6, 40).rotateX(Math.PI / 2), marble, [HB[0], -0.004, HB[1]]);
    K.cyl(MB, marble, HB[0], -0.006, HB[1], 0.012, 0.012, 0.01, 12);
    K.cyl(MB, shade, HB[0], 0.004, HB[1], 0.009, 0.008, 0.004, 4, [0, Math.PI / 4, 0]);
    K.add(MB, new THREE.CylinderGeometry(0.002, 0.0065, 0.078, 4).translate(0, 0.039, 0), marble, [HB[0], 0.008, HB[1]], [0, Math.PI / 4, 0]);
    K.add('glow', BALL, gilt, [HB[0], 0.089, HB[1]], [0, 0, 0], 0.004);
    if (!low) {
      const NJ = 10;
      for (let j = 0; j < NJ; j++) {
        const a = j / NJ * TAU + 0.2, ca2 = Math.cos(a), sa2 = Math.sin(a), pos = [], uv = [], idx = [], N = 10, w = 0.0022;
        for (let i = 0; i <= N; i++) {
          const s = i / N, rr = 0.018 + 0.03 * s, y = -0.002 + (-0.006 + 0.002) * s + 4 * 0.022 * s * (1 - s);
          for (const sd of [-1, 1]) { pos.push(HB[0] + ca2 * rr - sa2 * sd * w * (0.6 + s), y, HB[1] + sa2 * rr + ca2 * sd * w * (0.6 + s)); uv.push(sd > 0 ? 1 : 0, (1 - s) * 2.2); }
          if (i < N) { const q = i * 2; idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
        }
        const jg = new THREE.BufferGeometry(); jg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); jg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); jg.setIndex(idx); jg.computeVertexNormals();
        K.add('falls', jg, 0xffffff, [0, 0, 0], [0, 0, 0], 1, { uv: true });
        puffs.push({ x: HB[0] + ca2 * 0.047, z: HB[1] + sa2 * 0.047, y: -0.005, n: 2, life: 1.4, rise: 0.01, size: 0.012, col: [0.92, 0.97, 1, 0.35], jit: 0.006, spread: 0.01 });
      }
    }
    // ---- boats: out along the canals and back (on the other side of the canal), and slowly round the harbour
    const boats = Math.min(segs.length * 2 + 2, 2 + g * 2);
    const boat = (x, z, a, i) => {
      const hull = part(capsuleX(0.004, 0.012, 8), 0xf6f6f2, [x, -0.004, z], [0, -a, 0], [1, 0.6, 1], { smooth: true }), cab = part(BOX, i % 3 ? 0x2a6ac0 : 0xc84a2a, [x - Math.cos(a) * 0.002, 0.001, z + Math.sin(-a) * 0.002], [0, -a, 0], [0.006, 0.004, 0.005]);
      const lamp = part(LB, 0xfff2c0, [x + Math.cos(a) * 0.009, 0.0015, z + Math.sin(a) * 0.009], [0, 0, 0], 0.0015);
      return [hull, cab, lamp];
    };
    for (let i = 0; i < boats; i++) {
      const s = segs[i % segs.length], L = Math.hypot(s.x1 - s.x0, s.z1 - s.z0), ux = (s.x1 - s.x0) / L, uz = (s.z1 - s.z0) / L;
      let A, M, B, a, lane = null, ph;
      if (i < 2) {                                                     // round the harbour: a slow arc between the fountain and the quay
        const a0 = i * 3 + 0.4, a1 = a0 + 1.1, rr = 0.058;
        A = [HB[0] + Math.cos(a0) * rr, HB[1] + Math.sin(a0) * rr]; M = [HB[0] + Math.cos((a0 + a1) / 2) * rr, HB[1] + Math.sin((a0 + a1) / 2) * rr]; B = [HB[0] + Math.cos(a1) * rr, HB[1] + Math.sin(a1) * rr];
        a = Math.atan2(B[1] - A[1], B[0] - A[0]); ph = [hash2(i, 3), 0.025, 0.2];
      } else {                                                         // along a canal: out on one side, back on the other
        const t0 = 0.12 + 0.05 * (i % 2), t1 = 0.86, off = CW * 0.42 * (i % 2 ? 1 : -1);
        A = [s.x0 + (s.x1 - s.x0) * t0 - uz * off, s.z0 + (s.z1 - s.z0) * t0 + ux * off]; B = [s.x0 + (s.x1 - s.x0) * t1 - uz * off, s.z0 + (s.z1 - s.z0) * t1 + ux * off]; M = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
        a = Math.atan2(uz, ux); lane = [uz * off * 2, -ux * off * 2]; ph = [hash2(i, 7), 0.008 / (L * (t1 - t0)), 0.12];
      }
      const parts = boat(A[0], A[1], a, i);
      if (low) { K.raw('std', parts[0]); K.raw('std', parts[1]); continue; }
      for (const p of parts) K.raw(p === parts[2] ? MOVEG : MOVE, this.capMover(ctx, p, A, M, B, 0, lane, ph));
    }
    // ---- the capitol (built at the origin facing +z, then turned toward the harbour)
    const K0 = K;
    { const K = new Kit(), cx = 0, cz = 0, win = 0xffdca0, lit = 0xfff0cc, bronze = 0x6f9a86, W = [], wbox = (...b) => W.push(b);   // (the lit windows: one part, capBoxes)
    K.box(MB, shade, cx, 0, cz, 0.3, 0.016, 0.15);                                                  // the podium
    K.box(MB, marble, cx, 0.016, cz, 0.16, 0.06, 0.1);                                              // the central block and its cornice
    K.box(MB, shade, cx, 0.076, cz, 0.168, 0.006, 0.108);
    for (const sx of [-1, 1]) {
      const wx = cx + sx * 0.11;
      K.box(MB, marble, wx, 0.016, cz + 0.005, 0.07, 0.045, 0.085);                                 // the wings: a colonnade in front, an attic over the cornice
      K.box(MB, shade, wx, 0.061, cz + 0.005, 0.076, 0.005, 0.09);
      K.box(MB, marble, wx, 0.066, cz + 0.005, 0.066, 0.004, 0.08);
      for (let i = 0; i < 4; i++) { const x = wx - 0.024 + i * 0.016; K.cyl(MB, marble, x, 0.016, cz + 0.05, 0.003, 0.003, 0.045, 8); K.box(MB, shade, x, 0.016, cz + 0.05, 0.0075, 0.002, 0.0075); K.box(MB, shade, x, 0.0585, cz + 0.05, 0.0075, 0.0025, 0.0075); }
      // lit windows, two storeys: between the columns, round the ends and along the back
      for (const [wy, wh] of [[0.021, 0.014], [0.04, 0.012]]) {
        for (let i = 0; i < 3; i++) wbox(i === 1 && wy < 0.03 ? lit : win, wx - 0.016 + i * 0.016, wy, cz + 0.0478, 0.0072, wh, 0.001);
        for (let i = 0; i < 4; i++) wbox(win, cx + sx * 0.1452, wy, cz + 0.005 - 0.027 + i * 0.018, 0.001, wh, 0.0072);
        for (let i = 0; i < 4; i++) wbox(win, wx - 0.024 + i * 0.016, wy, cz - 0.0378, 0.0072, wh, 0.001);
      }
    }
    // the portico: eight columns with bases and capitals, the entablature, the pediment with a gilt medallion
    for (let i = 0; i < 8; i++) { const x = cx - 0.056 + i * 0.016; K.cyl(MB, marble, x, 0.016, cz + 0.062, 0.0042, 0.0037, 0.06, 10); K.box(MB, shade, x, 0.016, cz + 0.062, 0.0095, 0.0025, 0.0095); K.box(MB, shade, x, 0.0735, cz + 0.062, 0.0095, 0.0028, 0.0095); }
    K.box(MB, shade, cx, 0.076, cz + 0.058, 0.128, 0.008, 0.032);
    { const sh = new THREE.Shape(); sh.moveTo(-0.066, 0); sh.lineTo(0.066, 0); sh.lineTo(0, 0.024); sh.closePath();
      K.add(MB, new THREE.ExtrudeGeometry(sh, { depth: 0.03, bevelEnabled: false }), marble, [cx, 0.084, cz + 0.043]);
      K.add('metal', new THREE.CylinderGeometry(0.0055, 0.0055, 0.0015, 16).rotateX(Math.PI / 2), gilt, [cx, 0.0915, cz + 0.0735]); }
    // behind the columns: tall lit windows and the bronze doors
    for (let i = 0; i < 7; i++) { const x = cx - 0.048 + i * 0.016; if (i === 3) wbox(lit, x, 0.016, cz + 0.0508, 0.012, 0.028, 0.001); else wbox(win, x, 0.022, cz + 0.0508, 0.0075, 0.018, 0.001); wbox(win, x, 0.049, cz + 0.0508, 0.0075, 0.014, 0.001); }
    for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) for (const wy of [0.024, 0.049]) wbox(win, cx + sx * 0.0805, wy, cz - 0.03 + i * 0.03, 0.001, 0.014, 0.008);
    for (let i = 0; i < 5; i++) for (const wy of [0.024, 0.049]) wbox(win, cx - 0.056 + i * 0.028, wy, cz - 0.0505, 0.009, 0.014, 0.001);
    // the grand stair between two plinths, each with a bronze statue
    for (let i = 0; i < 3; i++) K.box(MB, shade, cx, 0.016 - (i + 1) * 0.005, cz + 0.082 + i * 0.01, 0.12, 0.005, 0.012);
    for (const sx of [-1, 1]) {
      const px = cx + sx * 0.068;
      K.box(MB, shade, px, 0, cz + 0.094, 0.014, 0.018, 0.03); K.box(MB, marble, px, 0.018, cz + 0.094, 0.016, 0.0025, 0.032);
      if (!low) this.capStatue(K, px, 0.0205, cz + 0.1, sx * 0.3, bronze);
    }
    for (const sx of [-1, 1]) if (!low) this.capStatue(K, cx + sx * 0.142, 0.016, cz + 0.066, 0, bronze);
    // the dome: a drum ringed by sixteen columns with lit windows between them, a ribbed gilt dome, a lit lantern
    const dy = 0.082;
    K.cyl(MB, shade, cx, dy, cz, 0.058, 0.058, 0.012, 32);
    K.cyl(MB, marble, cx, dy + 0.012, cz, 0.046, 0.046, 0.04, 32);
    for (let i = 0; i < 16; i++) { const a = i / 16 * TAU; K.cyl(MB, marble, cx + Math.cos(a) * 0.052, dy + 0.012, cz + Math.sin(a) * 0.052, 0.0028, 0.0028, 0.036, 6); }
    for (let i = 0; i < 16; i++) { const a = (i + 0.5) / 16 * TAU; wbox(win, cx + Math.cos(a) * 0.0462, dy + 0.0225, cz + Math.sin(a) * 0.0462, 0.0014, 0.017, 0.0075, -a); }
    K.cyl(MB, shade, cx, dy + 0.048, cz, 0.056, 0.056, 0.006, 32);
    const prof = [[0.05, 0], [0.049, 0.012], [0.044, 0.03], [0.034, 0.047], [0.02, 0.058], [0.001, 0.063]];
    K.add('metal', lathe(prof, 36), gilt, [cx, dy + 0.054, cz]);
    if (!low) for (let i = 0; i < 12; i++) {
      const a = i / 12 * TAU, pts = prof.slice(0, 5).map(([rr, y]) => new V3(Math.cos(a) * (rr + 0.0006), dy + 0.054 + y, Math.sin(a) * (rr + 0.0006)));
      K.add('metal', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.0011, 4, false), 0xffe08a, [cx, 0, cz]);
    }
    K.cyl(MB, marble, cx, dy + 0.112, cz, 0.0105, 0.0095, 0.003, 12);
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; K.cyl(MB, marble, cx + Math.cos(a) * 0.0078, dy + 0.115, cz + Math.sin(a) * 0.0078, 0.0011, 0.0011, 0.013, 5); }
    K.cyl('glow', lit, cx, dy + 0.115, cz, 0.0058, 0.0058, 0.013, 12);
    K.cyl(MB, shade, cx, dy + 0.128, cz, 0.0098, 0.0098, 0.003, 12);
    K.add('metal', lathe([[0.008, 0], [0.0065, 0.004], [0.001, 0.007]], 12), gilt, [cx, dy + 0.131, cz]);
    K.cyl('metal', gilt, cx, dy + 0.136, cz, 0.0022, 0.001, 0.028, 6);
    K.add('glow', BALL, gilt, [cx, dy + 0.166, cz], [0, 0, 0], 0.004);
    // flags in the owner's colour either side of the steps (they fly: capMoveMat's wave)
    const flags = [];
    for (const sx of [-1, 1]) {
      K.cyl('metal', 0xdddddd, cx + sx * 0.085, 0.016, cz + 0.09, 0.0018, 0.0014, 0.1, 5); K.add('glow', LB, 0xf2c24a, [cx + sx * 0.085, 0.117, cz + 0.09], [0, 0, 0], 0.0022);
      const fg = part(new THREE.BoxGeometry(0.024, 0.014, 0.001, 8, 1, 1), ctx.pc, [cx + sx * 0.0975, 0.103, cz + 0.09]);
      if (low) K.raw('glow', fg); else flags.push([fg, sx]);
    }
    // lamps at the foot of the stair
    if (!low) for (const sx of [-1, 1]) { K.cyl('metal', 0x2e3238, cx + sx * 0.048, 0, cz + 0.122, 0.001, 0.0007, 0.018, 5); K.box('metal', 0x2e3238, cx + sx * 0.048, 0.017, cz + 0.122, 0.012, 0.0012, 0.0012); for (const e of [-1, 1]) K.add('glow', LB, 0xfff0cc, [cx + sx * 0.048 + e * 0.006, 0.0165, cz + 0.122], [0, 0, 0], 0.0022); }
    K.raw('glow', this.capBoxes(W));
    // the ashlar's own coordinates (capMarbleMat): the capitol's frame, before it is turned
    for (const gm of K.by.get(MB) || []) gm.setAttribute('aL', gm.attributes.position.clone());
    const Mx = new THREE.Matrix4().makeRotationY(cth).setPosition(capX, 0, capZ);
    for (const [key, list] of K.by) for (const gm of list) K0.raw(key, gm.applyMatrix4(Mx));
    const c = Math.cos(cth), s = Math.sin(cth);
    for (const [fg, sx] of flags) {                                    // they flutter across (local +z), more toward the fly end, the wave running out along them
      const [px, pz] = capWorld(sx * 0.085, 0.09), fx = sx * c, fz = -sx * s;
      K0.raw(MOVEG, this.capWave(ctx, fg.applyMatrix4(Mx), s, c, (x, z) => clamp01(((x - px) * fx + (z - pz) * fz) / 0.024), 0.0035));
    }
    }
    // ---- the city round it: blocks everywhere the water and the capitol leave free; lower in front of
    // the capitol (toward the viewer), so the dome still reads over the rooftops
    const occ = [];
    const tl = this.downtown(K, r, { sp: 0.08, tall: 1.2, parks: 0.1,
      skip: (x, z) => { const [lx, lz] = capLocal(x, z); const s = canalD(x, z) < CW + 0.03 || (Math.abs(lx) < 0.19 && lz < 0.13 && lz > -0.1) || Math.hypot(x - HB[0], z - HB[1]) < HBR + 0.03; if (!s) occ.push([x, z]); return s; },
      hmul: (x, z) => (0.7 + 0.6 * clamp01((Math.hypot(x, z) - 0.1) / 0.3)) * (1 - 0.4 * smooth(0.2, 0.05, Math.abs(x - capX)) * smooth(capZ - 0.02, capZ + 0.12, z)) });
    this.beacon(ctx, K, tl);
    const busy = (x, z, pad) => occ.some(([ox, oz]) => Math.abs(x - ox) < 0.032 + pad && Math.abs(z - oz) < 0.032 + pad);
    const inCap = (x, z) => { const [lx, lz] = capLocal(x, z); return Math.abs(lx) < 0.158 && lz > -0.08 && lz < 0.112; };
    // ---- trees along the quays and round the harbour (planters only while the air is thin)
    const TR = this._capTrees ||= [0, 1, 2].map((v) => { const cr = smoothGeo(new THREE.IcosahedronGeometry(1, 1)); return mergeGeometries([part(BOX, 0xa8a298, [0, 0.0006, 0], [0, 0, 0], [0.0078, 0.0012, 0.0078]), part(POLE, 0x5a4030, [0, 0.001, 0], [0, 0, 0], [0.0011, 0.01, 0.0011]), part(cr, _c2.setHSL(0.27 + v * 0.03, 0.45, 0.25 + v * 0.04), [0, 0.015, 0], [0, v * 2, 0], [0.0062, 0.0085, 0.0062])]); });
    const tree = (x, z) => {                                          // (one pre-coloured part each: planter, trunk, crown)
      if (busy(x, z, 0.004) || inCap(x, z) || this.edgeDist(x, z) < 0.02 || this.env.inClearing(x, z, 0.01) || canalD(x, z) < CW + 0.008) return;
      if (life < 0.2) { K.box('std', 0xa8a298, x, 0, z, 0.0078, 0.0012, 0.0078); return; }
      const h = hash2(x * 91, z * 37);
      K.add('std', TR[Math.floor(h * 3)], null, [x, 0, z], [0, h * 6, 0], 0.55 + 0.45 * life);
    };
    for (const s of segs) {
      const L = Math.hypot(s.x1 - s.x0, s.z1 - s.z0), ux = (s.x1 - s.x0) / L, uz = (s.z1 - s.z0) / L, n = Math.floor(L / 0.035);
      for (let i = 0; i < n; i++) for (const sd of [-1, 1]) { const t = (i + 0.5) / n; if (Math.abs(t - 0.5) * L < 0.03 || t * L > L - 0.05) continue; tree(s.x0 + (s.x1 - s.x0) * t - uz * sd * (CW + 0.015), s.z0 + (s.z1 - s.z0) * t + ux * sd * (CW + 0.015)); }
    }
    for (let i = 0; i < 16; i++) { const a = i / 16 * TAU + 0.1; tree(HB[0] + Math.cos(a) * (HBR + 0.016), HB[1] + Math.sin(a) * (HBR + 0.016)); }
    if (ring) for (let i = 0; i < 20; i++) { const a = i / 20 * TAU; tree(RC[0] + Math.cos(a) * (RR + CW + 0.012), RC[1] + Math.sin(a) * (RR + CW + 0.012) / 1.2); }
    // ---- life on the streets (not at Low): people strolling the forecourt and the quays, and the
    // lights of the traffic up and down the streets between the blocks -- all moved on the GPU
    if (!low) {
      const walk = (x, z) => canalD(x, z) > CW + 0.006 && !inCap(x, z) && !busy(x, z, 0.002) && this.edgeDist(x, z) > 0.02 && !this.env.inClearing(x, z, 0.01) && (plazaSd(x, z) < 0 || canalD(x, z) < CW + 0.03);
      const PPL = this._capPerson ||= mergeGeometries([new THREE.CylinderGeometry(0.0011, 0.0014, 0.004, 5).translate(0, 0.002, 0), new THREE.IcosahedronGeometry(0.0011, 0).translate(0, 0.0048, 0)].map((q) => (q.index ? q.toNonIndexed() : q).deleteAttribute('uv')));
      const cloth = [0xd84a3a, 0x3a6ad8, 0xe8e0d0, 0x2a2a30, 0xe8b83a, 0x4aa06a, 0xa04ab0];
      let made = 0;
      for (let tries = 0; tries < 400 && made < 12 + g * 8; tries++) {
        const x = (r() - 0.5) * 0.9, z = (r() - 0.5) * 1.0, a = r() * TAU, L = 0.03 + r() * 0.05, bx = x + Math.cos(a) * L, bz = z + Math.sin(a) * L;
        let ok = true; for (let q = 0; q <= 6 && ok; q++) ok = walk(x + (bx - x) * q / 6, z + (bz - z) * q / 6);
        if (!ok) continue;
        made++;
        K.raw(MOVE, this.capMover(ctx, part(PPL, cloth[made % cloth.length], [x, 0, z]), [x, z], [(x + bx) / 2, (z + bz) / 2], [bx, bz], 0, null, [r(), 0.005 / (2 * L), 0.15]));
      }
      const sp = 0.08;
      for (const axis of [0, 1]) for (let i = -6; i <= 5; i++) {
        const c = (i + 0.5) * sp, free = (t) => { const x = axis ? t : c, z = axis ? c : t; return canalD(x, z) > CW + 0.016 && plazaSd(x, z) > 0.01 && this.edgeDist(x, z) > 0.03 && !this.env.inClearing(x, z, 0.02) && !inCap(x, z); };
        let t0 = null;
        for (let t = -0.56; t <= 0.565; t += 0.005) {
          const f = t <= 0.56 && free(t);
          if (f && t0 === null) t0 = t;
          if (!f && t0 !== null) {
            const t1 = t - 0.005, L = t1 - t0;
            if (L > 0.1) for (let j = 0, n = Math.min(3, Math.floor(L / 0.07)) * (g >= 1 ? 1 : 0); j < n; j++) {
              const side = j % 2 ? 1 : -1, lo = 0.0032 * side, A = axis ? [t0, c + lo] : [c + lo, t0], B = axis ? [t1, c + lo] : [c + lo, t1];
              const geo = part(BOX, j % 3 === 1 ? 0xff5a3c : 0xfff0c8, [A[0], 0.0016, A[1]], [0, 0, 0], axis ? [0.004, 0.0018, 0.0022] : [0.0022, 0.0018, 0.004]);
              K.raw(MOVEG, this.capMover(ctx, geo, A, [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2], B, 0.0016, axis ? [0, -2 * lo] : [-2 * lo, 0], [r(), 0.03 / (2 * L), 0.04]));
            }
            t0 = null;
          }
        }
      }
    }
    if (puffs.length) this.puffs(ctx, puffs);
    for (const gm of K.by.get(MB) || []) if (!gm.attributes.aL) gm.setAttribute('aL', gm.attributes.position.clone());
    for (const m of this.emit(K, ctx)) if (m.material === MOVE || m.material === MOVEG) m.castShadow = false;   // (the shadow pass does not move them)
  }
  // ---- Capital parts
  // many small boxes as one part (the capitol's lit windows): [colour, x, y (bottom), z, w, h, d, ry] each
  capBoxes(list) {
    const P = BOX.attributes.position, N = BOX.attributes.normal, I = BOX.index.array, nv = P.count, ni = I.length, n = list.length;
    const pos = new Float32Array(n * nv * 3), nor = new Float32Array(n * nv * 3), col = new Float32Array(n * nv * 3), idx = new Uint32Array(n * ni);
    list.forEach(([c, x, y, z, w, h, d, ry = 0], b) => {
      const cs = Math.cos(ry), sn = Math.sin(ry); _c.set(c);
      for (let i = 0; i < nv; i++) {
        const o = (b * nv + i) * 3, px = P.getX(i) * w, pz = P.getZ(i) * d, nx = N.getX(i), nz = N.getZ(i);
        pos[o] = x + px * cs + pz * sn; pos[o + 1] = y + (P.getY(i) + 0.5) * h; pos[o + 2] = z - px * sn + pz * cs;
        nor[o] = nx * cs + nz * sn; nor[o + 1] = N.getY(i); nor[o + 2] = -nx * sn + nz * cs;
        col[o] = _c.r; col[o + 1] = _c.g; col[o + 2] = _c.b;
      }
      for (let k = 0; k < ni; k++) idx[b * ni + k] = I[k] + b * nv;
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setIndex(new THREE.BufferAttribute(idx, 1));
    return g;
  }
  // a bronze statue on a small pedestal: a standing figure, one arm raised
  capStatue(K, x, y, z, ry, col) {
    K.box(this.capMarbleMat(), 0xd8d4c8, x, y, z, 0.0075, 0.005, 0.0075, ry);
    K.cyl('metal', col, x, y + 0.005, z, 0.0026, 0.0017, 0.0085, 8);
    K.ball('metal', col, x, y + 0.0152, z, 0.0017);
    K.add('metal', new THREE.CylinderGeometry(0.0006, 0.0007, 0.0075, 5).translate(0, 0.00375, 0), col, [x + Math.cos(ry) * 0.0022, y + 0.012, z - Math.sin(ry) * 0.0022], [0, ry, -0.35]);
  }
  // the capitol's marble: vertex colours plus per-pixel ashlar from aL (the part's own frame): courses and
  // staggered joints on the walls, slabs on the tops, a little tone per block, faint veins and grime toward
  // the foot. Every detail fades before it gets smaller than a pixel.
  capMarbleMat() {
    if (this.mats.capMarble) return this.mats.capMarble;
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.05 });
    m.onBeforeCompile = (s) => {
      s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aL; varying vec3 vL;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvL = aL;');
      s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vL;
float capH(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float capN(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(capH(i), capH(i + vec2(1.0, 0.0)), f.x), mix(capH(i + vec2(0.0, 1.0)), capH(i + vec2(1.0, 1.0)), f.x), f.y); }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec3 p = vL; float px = max(length(fwidth(p)), 1e-6);
  vec3 nL = normalize(cross(dFdx(p), dFdy(p)));
  float fine = clamp(1.0 - px * 330.0, 0.0, 1.0);
  vec2 bc = abs(nL.y) < 0.6 ? vec2((abs(nL.x) > abs(nL.z) ? p.z : p.x) / 0.011, p.y / 0.0055) : p.xz / vec2(0.011, 0.0075);
  bc.x += floor(bc.y) * 0.5;
  vec2 fb = 0.5 - abs(fract(bc) - 0.5);
  float jw = 0.00022 + px * 0.6;
  float j = max(1.0 - smoothstep(0.0, jw, fb.y * (abs(nL.y) < 0.6 ? 0.0055 : 0.0075)), 1.0 - smoothstep(0.0, jw, fb.x * 0.011)) * fine;
  float tone = (capH(floor(bc) + 3.1) - 0.5) * fine;
  float vein = (1.0 - smoothstep(0.0, 0.02, abs(capN(p.xz * 210.0 + p.y * 150.0) - 0.5))) * smoothstep(0.55, 0.8, capN(p.xz * 37.0 + p.y * 29.0 + 5.0)) * fine;
  float grime = (1.0 - smoothstep(0.0, 0.03, p.y)) * (0.5 + 0.5 * capN(p.xz * 90.0 + p.y * 40.0));
  diffuseColor.rgb *= (1.0 - 0.2 * j) * (1.0 + 0.08 * tone) * (1.0 - 0.07 * vein) * (1.0 - 0.16 * grime);
}`);
    };
    m.customProgramCacheKey = () => 'capMarble';
    this.own(m, 0.55);
    return this.mats.capMarble = m;
  }
  // the Capital's paving (aCp = x, z, forecourt 0..1, distance to the water): the city's streets on the
  // blocks' lattice (asphalt, kerbs, a dashed centre line, warm pools of lamplight) with setts behind;
  // travertine rings and rays round the harbour on the forecourt; pale kerb stones along every quay
  capGroundMat() {
    if (this.mats.capGround) return this.mats.capGround;
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
    m.onBeforeCompile = (s) => {
      s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aCp; varying vec4 vCp;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvCp = aCp;');
      s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>
varying vec4 vCp;
float cgH(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float cgN(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(cgH(i), cgH(i + vec2(1.0, 0.0)), f.x), mix(cgH(i + vec2(0.0, 1.0)), cgH(i + vec2(1.0, 1.0)), f.x), f.y); }
float cgLine(float d, float w, float px){ return 1.0 - smoothstep(w, w + px, d); }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
vec3 capE = vec3(0.0);
{
  vec2 p = vCp.xy; float px = max(length(fwidth(p)), 1e-6), plaza = clamp(vCp.z, 0.0, 1.0), d = vCp.w;
  float f1 = clamp(1.0 - px * 300.0, 0.0, 1.0), f2 = clamp(1.0 - px * 110.0, 0.0, 1.0);
  float n = cgN(p * 90.0) * 0.6 + cgN(p * 23.0) * 0.4;
  // setts (the quays and the pavements)
  vec2 sq = p / 0.0045; vec2 sf = 0.5 - abs(fract(sq) - 0.5);
  vec3 sett = vec3(0.47, 0.47, 0.5) * (0.9 + 0.2 * n) * (1.0 - 0.2 * cgLine(min(sf.x, sf.y) * 0.0045, 0.0003, px) * f1) * (0.94 + 0.12 * (cgH(floor(sq)) - 0.5) * f1 + 0.06);
  // streets on the lattice's mid-lines
  vec2 q = abs(fract(p / 0.08) - 0.5) * 0.08;
  float sd = min(q.x, q.y), road = cgLine(sd, 0.0092, px), kerb = cgLine(sd, 0.0112, px) - road;
  float along = q.x < q.y ? p.y : p.x;
  float dash = step(0.5, fract(along / 0.014)) * cgLine(sd, 0.0004, px) * f2;
  float pool = (1.0 - smoothstep(0.0, 0.011, length(vec2(sd, (fract(along / 0.04) - 0.5) * 0.04)))) * f2;
  vec3 asph = vec3(0.16, 0.17, 0.19) * (0.88 + 0.24 * n) + vec3(0.2, 0.15, 0.08) * pool;
  vec3 city = mix(sett, asph, road);
  city = mix(city, vec3(0.66, 0.65, 0.62), kerb);
  city = mix(city, vec3(0.92, 0.84, 0.55), dash * road * 0.7);
  capE += vec3(0.1, 0.07, 0.03) * pool * road;
  // the forecourt: travertine rings round the harbour, more slabs further out, a granite band every
  // fourth ring, eight dark rays (a compass star)
  vec2 h = p - vec2(0.0, -0.02); float rr = length(h), aa = atan(h.y, h.x);
  float ring = rr / 0.013, ri = floor(ring), segs = 6.0 * (ri + 1.0), sa = aa / 6.2832 * segs;
  float jr = cgLine((0.5 - abs(fract(ring) - 0.5)) * 0.013, 0.00025, px), ja = cgLine((0.5 - abs(fract(sa) - 0.5)) * 6.2832 * rr / segs, 0.00025, px);
  vec3 trav = vec3(0.86, 0.82, 0.74) * (0.95 + 0.1 * cgH(vec2(ri, floor(sa))) * f1) * (0.94 + 0.08 * n);
  trav = mix(trav, vec3(0.42, 0.42, 0.45), step(3.0, mod(ri, 4.0)));
  float ray = cgLine(abs(fract(aa / 6.2832 * 8.0 + 0.5) - 0.5) * 6.2832 * rr / 8.0, 0.0018 * smoothstep(0.08, 0.2, rr), px);
  trav = mix(trav, vec3(0.5, 0.47, 0.44), ray * 0.8);
  trav *= 1.0 - 0.25 * max(jr, ja) * f1;
  // quays: setts; the kerb along the water's edge
  float quay = 1.0 - smoothstep(0.05, 0.054, d);
  vec3 col = mix(city, sett, quay);
  col = mix(col, trav, plaza);
  float kb = 1.0 - smoothstep(0.0288, 0.0288 + px, d);
  vec3 kc = vec3(0.8, 0.78, 0.73) * (0.93 + 0.1 * cgH(floor(p / 0.007)) * f1);
  kc *= 1.0 - 0.3 * cgLine(abs(d - 0.0288), 0.0003, px) * f1;
  col = mix(col, kc, kb);
  float land = smoothstep(0.0215, 0.0219, d);
  diffuseColor.rgb = mix(diffuseColor.rgb, col, land);
}`)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += capE;');
    };
    m.customProgramCacheKey = () => 'capGround';
    this.own(m, 0.55);
    return this.mats.capGround = m;
  }
  // things on the move, moved in the vertex shader off the shared clock (no per-frame CPU work): aMv = the
  // (draped) way from its start to the far end, aBow = the bend midway (the curved board, a curved way),
  // aSide = the lane it comes back in (0: the same one), aPh = (phase 0..1, round trips / s, pause at the ends).
  // aPh.z < 0: a flutter instead -- it swings by aMv * sin(uTime * aPh.y + aPh.x). glow: unlit (lights, flags)
  capMoveMat(glow) {
    const key = glow ? 'capMoveG' : 'capMove';
    if (this.mats[key]) return this.mats[key];
    const m = glow ? new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }) : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.1 });
    m.onBeforeCompile = (s) => {
      s.uniforms.uTime = this.time;
      s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aMv; attribute vec3 aBow; attribute vec3 aSide; attribute vec3 aPh; uniform float uTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
if (aPh.z < 0.0) transformed += aMv * sin(uTime * aPh.y + aPh.x);
else {
  float c = fract(uTime * aPh.y + aPh.x), h = c < 0.5 ? c * 2.0 : 2.0 - c * 2.0;
  float f = smoothstep(aPh.z, 1.0 - aPh.z, h);
  transformed += aMv * f + aBow * (4.0 * f * (1.0 - f)) + aSide * step(0.5, c);
}`);
    };
    m.customProgramCacheKey = () => key;
    if (glow) m.userData.shared = true; else this.own(m, 0.55);
    return this.mats[key] = m;
  }
  // a part set moving for capMoveMat: geo (board units, standing at a = [x, z]) goes to b by way of m and back
  // (by lane [dx, dz] on the way back, if given); y = its height for the draping; ph = [phase, trips / s, pause]
  capMover(ctx, geo, a, m, b, y, lane, ph) {
    const C = ctx.cell, k = this.kOf(C), P = (x, z) => C.proj(x, z, ctx.H + y * k);
    const A = P(a[0], a[1]), B = P(b[0], b[1]), Mv = B.clone().sub(A), Bow = P(m[0], m[1]).sub(A.clone().add(B).multiplyScalar(0.5)), S = lane ? P(a[0] + lane[0], a[1] + lane[1]).sub(A) : new V3();
    const n = geo.attributes.position.count, at = (v) => { const o = new Float32Array(n * 3); for (let i = 0; i < n; i++) { o[i * 3] = v.x; o[i * 3 + 1] = v.y; o[i * 3 + 2] = v.z; } return new THREE.BufferAttribute(o, 3); };
    geo.setAttribute('aMv', at(Mv)); geo.setAttribute('aBow', at(Bow)); geo.setAttribute('aSide', at(S)); geo.setAttribute('aPh', at({ x: ph[0], y: ph[1], z: ph[2] }));
    return geo;
  }
  // a flag flying (capMoveMat's flutter): each vertex swings across the flag, (nx, nz) in board units, by amp
  // times u(x, z) (0 at the pole, 1 at the fly end), the wave running out along it
  capWave(ctx, geo, nx, nz, u, amp) {
    const C = ctx.cell, k = this.kOf(C), P = geo.attributes.position, n = P.count, mv = new Float32Array(n * 3), ph = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i), w = u(x, z);
      const d = C.proj(x + nx * amp * w, z + nz * amp * w, ctx.H + y * k).sub(C.proj(x, z, ctx.H + y * k));
      mv[i * 3] = d.x; mv[i * 3 + 1] = d.y; mv[i * 3 + 2] = d.z; ph[i * 3] = -w * 3.2; ph[i * 3 + 1] = 5.5; ph[i * 3 + 2] = -1;
    }
    geo.setAttribute('aMv', new THREE.BufferAttribute(mv, 3)); geo.setAttribute('aBow', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); geo.setAttribute('aSide', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); geo.setAttribute('aPh', new THREE.BufferAttribute(ph, 3));
    return geo;
  }
}
