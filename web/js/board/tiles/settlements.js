// settlements.js -- TileArt mixin: the greenery stages -- the early pioneer outpost (domes, outbuildings, glass
// tunnels), the shrubland, and the late forest's brighter canopy and meadow flowers.
import * as THREE from 'three';
import { mergeGeometries } from '../../../vendor/BufferGeometryUtils.js';
import { gfx } from '../quality.js';
import { BALL, BOX, Kit, TAU, V3, Y, _c, _c2, capsuleX, clamp01, dish, fbm2, hash2, hexCorner, lathe, smooth, vnoise } from './kit.js';

export class SettlementArt {
  // a geodesic dome's frame (unit radius, y up; the icosphere's edges above the
  // ground as struts, with hubs at the joints), cached per detail level
  geodesicFrame(detail) {
    const key = 'geo' + detail;
    if ((this.geoCache ||= {})[key]) return this.geoCache[key];
    const ico = new THREE.IcosahedronGeometry(1, detail), P = ico.attributes.position, seen = new Set(), parts = [], hubs = new Map();
    const a = new V3(), b = new V3(), q = new THREE.Quaternion();
    const kf = (v) => `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
    const strut = new THREE.CylinderGeometry(0.0085, 0.0085, 1, 6, 1, true).translate(0, 0.5, 0);
    for (let i = 0; i < P.count; i += 3) for (let j = 0; j < 3; j++) {
      a.fromBufferAttribute(P, i + j); b.fromBufferAttribute(P, i + (j + 1) % 3);
      if (Math.max(a.y, b.y) < 0.02) continue;
      const ka = kf(a), kb = kf(b), key2 = ka < kb ? ka + '|' + kb : kb + '|' + ka;
      if (seen.has(key2)) continue;
      seen.add(key2);
      const d = b.clone().sub(a), L = d.length();
      parts.push(strut.clone().applyMatrix4(new THREE.Matrix4().compose(a, q.setFromUnitVectors(Y, d.normalize()), new V3(1, L, 1))));
      for (const [k2, v] of [[ka, a], [kb, b]]) if (v.y > -0.02 && !hubs.has(k2)) hubs.set(k2, v.clone());
    }
    for (const v of hubs.values()) parts.push(new THREE.IcosahedronGeometry(0.02, 0).translate(v.x, v.y, v.z));   // (tiny at any zoom: 20 triangles each, not 80)
    for (const p of parts) { p.deleteAttribute('uv'); p.deleteAttribute('normal'); }
    const g = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)));
    g.computeVertexNormals();
    return this.geoCache[key] = g;
  }
  // a planted dome at (x, z), radius rad: the frame, the glass (unless open),
  // straight rows of young trees with drip lines between, grow-lights over
  // the rows and a soft green glow inside. Returns the tree instances.
  // o: { glass, sy, ang (row direction), rowGap, treeGap, lights, seed, young (0..1 size),
  //      detail (the frame's), small (fewer segments), trees (false: crop beds only),
  //      Kg (a ground kit: the dome's own floor -- tilled soil, a paved rim walk -- and a planting bed under each row) }
  plantedDome(ctx, K, x, z, rad, o = {}) {
    const sy = o.sy ?? 0.78, ang = o.ang ?? 0, ca = Math.cos(ang), sa = Math.sin(ang), r = this.env.srand(o.seed ?? 1), low = gfx.low, small = !!o.small;
    const rowGap = (o.rowGap ?? 0.043) * (low ? 1.3 : 1), treeGap = (o.treeGap ?? 0.034) * (low ? 1.3 : 1), young = o.young ?? 1;
    // the frame: geodesic struts, a concrete footing ring
    K.add('std', this.geodesicFrame(o.detail ?? (low ? 1 : 2)), 0xf4f6f8, [x, 0, z], [0, (o.seed ?? 0) * 0.37, 0], [rad, rad * sy, rad]);
    K.add('std', new THREE.TorusGeometry(1, 0.035, 6, small ? 28 : 48).rotateX(Math.PI / 2), 0xc8c4bc, [x, 0.001, z], [0, 0, 0], [rad, rad * 1.6, rad], { smooth: true });
    if (o.glass !== false) {
      K.add('gdome', new THREE.SphereGeometry(1, small ? 28 : 48, small ? 10 : 16, 0, TAU, 0, Math.PI / 2), 0xffffff, [x, 0, z], [0, 0, 0], [rad * 1.004, rad * sy * 1.004, rad * 1.004], { smooth: true });
      if (!low) K.add('beam', new THREE.SphereGeometry(1, small ? 20 : 32, small ? 8 : 10, 0, TAU, 0, Math.PI / 2), (X, Yy) => _c.setRGB(0.4, 1, 0.5).multiplyScalar(0.75 * (1 - clamp01(Yy / (rad * sy))) ** 1.6), [x, 0, z], [0, 0, 0], [rad * 0.97, rad * sy * 0.97, rad * 0.97], { smooth: true });
    }
    if (o.Kg) o.Kg.raw('ground', this.polarGround(x, z, [0, rad * 0.45, rad * 0.8, rad * 0.86, rad * 0.93, rad * 1.01], small ? 24 : 40, () => 0.0012, (px, pz) => {
      const n = fbm2(px * 30 + 7, pz * 30, 3);
      return Math.hypot(px - x, pz - z) < rad * 0.83 ? _c.setRGB(0.31 + n * 0.08, 0.22 + n * 0.06, 0.15 + n * 0.04) : _c.setRGB(0.8, 0.78, 0.72).multiplyScalar(0.94 + n * 0.1);
    }));
    // the rows: straight lines across the dome floor (row direction ang), trees on a grid
    const trees = [], Rin = rad * 0.84, n = Math.floor(Rin / rowGap);
    for (let i = -n; i <= n; i++) {
      const v = i * rowGap, half = Math.sqrt(Math.max(0, Rin * Rin - v * v));
      if (half < treeGap) continue;
      const m = Math.floor(half / treeGap), kind = (i + (o.seed ?? 0)) % 3 === 0 ? 'broad' : 'conifer';
      if (o.Kg) { const cr = o.trees === false; o.Kg.box('ground', _c2.setRGB(cr ? 0.42 : 0.34, cr ? 0.66 : 0.5, cr ? 0.24 : 0.2).multiplyScalar(0.9 + r() * 0.2), x - sa * v, 0.0012, z + ca * v, half * 2, 0.003, cr ? 0.024 : 0.02, -ang); }   // the planting bed (crops: fuller, brighter)
      if (o.trees !== false) for (let j = -m; j <= m; j++) {
        const u = j * treeGap + (i & 1 ? treeGap * 0.5 : 0);
        if (Math.abs(u) > half) continue;
        const tx = x + ca * u - sa * v, tz = z + sa * u + ca * v;
        trees.push({ kind, x: tx, y: tz, lift: ctx.H, s: (kind === 'broad' ? 0.28 : 0.34) * young * (0.85 + r() * 0.3), rot: r() * 6.28, c: new THREE.Color().setHSL(0.27 + r() * 0.06, 0.62 + r() * 0.12, 0.36 + r() * 0.08) });
      }
      // the drip line between this row and the next: a water channel with a pipe along it
      const v2 = v + rowGap / 2, h2 = Math.sqrt(Math.max(0, Rin * Rin - v2 * v2)) + 0.01;
      if (i < n && h2 > 0.03) {
        const mx = x - sa * v2, mz = z + ca * v2;
        K.add('water', BOX, 0xffffff, [mx, 0.0012, mz], [0, -ang, 0], [h2 * 2, 0.002, 0.007]);
        K.add('std', new THREE.CylinderGeometry(0.0022, 0.0022, h2 * 2, 8).rotateZ(Math.PI / 2), 0xe8ecef, [mx + sa * 0.005, 0.003, mz - ca * 0.005], [0, -ang, 0], 1, { smooth: true });
      }
      // a grow-light bar hung over the row (inside the glass)
      if (o.lights !== false && (i & 1) === 0) {
        const y = Math.min(rad * sy * 0.62, 0.13), dmax = Math.sqrt(Math.max(0, rad * rad - (y / sy) ** 2)) - 0.02, hl = Math.min(half, Math.sqrt(Math.max(0, dmax * dmax - v * v)));
        if (hl > 0.03) {
          K.add('glow', BOX, 0xffc8f2, [x - sa * v, y, z + ca * v], [0, -ang, 0], [hl * 2, 0.003, 0.004]);
          K.add('std', BOX, 0xe6eaee, [x - sa * v, y + 0.003, z + ca * v], [0, -ang, 0], [hl * 2, 0.0025, 0.0055]);
        }
      }
    }
    // the ring header the drip lines feed from
    K.add('std', new THREE.TorusGeometry(1, 0.012, 5, small ? 28 : 48).rotateX(Math.PI / 2), 0xdfe6ea, [x, 0.004, z], [0, 0, 0], [Rin + 0.012, Rin + 0.012, Rin + 0.012], { smooth: true });
    return trees;
  }
  // ---- the pioneer outpost (early greenery): layout, buildings, links
  // where the domes and buildings go on this space (seeded, so every tile differs):
  // two big domes on one of three plans, one to three sub-domes budding off them,
  // then the outbuildings round the domes -- all clear of the marker's clearing,
  // the hex rim and each other. Returns { domes, lots, links, lock }.
  pioneerLayout(ctx) {
    const r = this.env.srand(ctx.space * 97 + 3), low = gfx.low, inC = this.env.inClearing, MARK = this.env.MARK;
    const plan = [[[-0.12, -0.04, 0.23], [0.2, -0.235, 0.15]], [[0.05, -0.17, 0.215], [-0.24, 0.12, 0.16]], [[-0.16, -0.15, 0.205], [0.17, 0.0, 0.14]]][Math.floor(hash2(ctx.space * 0.917 + 0.3, 7.1) * 2.999)];
    const occ = [], links = [];                                   // taken circles [x, z, radius]; tunnels / paths as segments
    const segD = (x, z, s) => { const dx = s[2] - s[0], dz = s[3] - s[1], t = clamp01(((x - s[0]) * dx + (z - s[1]) * dz) / (dx * dx + dz * dz || 1)); return Math.hypot(x - s[0] - dx * t, z - s[1] - dz * t); };
    const free = (x, z, rad, gap = 0.02) => this.edgeDist(x, z) > rad + 0.018 && !inC(x, z, rad + 0.012) && occ.every(([ox, oz, orr]) => Math.hypot(x - ox, z - oz) > rad + orr + gap) && links.every((s) => segD(x, z, s) > rad + 0.018);
    const domes = plan.map(([x, z, rad], i) => ({ x: x + (r() - 0.5) * 0.03, z: z + (r() - 0.5) * 0.03, r: rad * (0.95 + r() * 0.08), ang: (r() - 0.5) * 1.2, big: true, i }));
    for (const d of domes) { while (d.r > 0.1 && !free(d.x, d.z, d.r, 0.03)) d.r -= 0.005; occ.push([d.x, d.z, d.r]); }
    const [A, B] = domes;
    links.push([A.x, A.z, B.x, B.z]);
    // the main airlock faces the marker's pad, a path between them
    const lx = MARK.x - A.x, lz = MARK.y - A.z, lL = Math.hypot(lx, lz), lock = { d: A, ux: lx / lL, uz: lz / lL };
    links.push([A.x + lock.ux * A.r, A.z + lock.uz * A.r, MARK.x, MARK.y]);
    // sub-domes budding off the big ones (a short tunnel each)
    const nSub = low ? (r() < 0.5 ? 1 : 0) : 1 + Math.floor(r() * 2.99);
    for (let s = 0, t = 0; s < nSub && t < 60; t++) {
      const p = domes[r() < 0.6 ? 0 : 1], rs = 0.055 + r() * 0.035, a = r() * TAU, dd = p.r + rs + 0.035 + r() * 0.03;
      const x = p.x + Math.cos(a) * dd, z = p.z + Math.sin(a) * dd;
      if (!free(x, z, rs, 0.025)) continue;
      const d = { x, z, r: rs, ang: r() * 3, big: false, i: domes.length, parent: p, crop: r() < 0.45 };
      domes.push(d); occ.push([x, z, rs]); links.push([p.x, p.z, x, z]); s++;
    }
    // the outbuildings, biggest first; each faces (door +z) the dome it sits by
    const kinds = low ? [['hab', 0.055], ['solar', 0.052], ['pump', 0.042], ['tank', 0.04]]
      : [['lab', 0.066], ['hab', 0.055], ['rover', 0.052], ['solar', 0.052], ['pump', 0.042], ['tank', 0.04], ['mast', 0.032], ['crates', 0.028], ['solar', 0.052], ['hab', 0.055], ['crates', 0.028]];
    const lots = [];
    for (const [kind, fr] of kinds) {
      for (let t = 0; t < 70; t++) {
        let x, z, d;
        if (t < 50) { d = domes[Math.floor(r() * Math.min(domes.length, 2 + (t > 25 ? 3 : 0)))]; const a = r() * TAU, dd = d.r + fr + 0.022 + r() * 0.07; x = d.x + Math.cos(a) * dd; z = d.z + Math.sin(a) * dd; }
        else { x = (r() - 0.5) * 0.86; z = (r() - 0.5) * 0.96; d = domes.reduce((m, q) => (Math.hypot(x - q.x, z - q.z) - q.r < Math.hypot(x - m.x, z - m.z) - m.r ? q : m)); }
        if (!free(x, z, fr, 0.016)) continue;
        const ang = Math.atan2(d.x - x, d.z - z);
        lots.push({ kind, x, z, fr, ang, d });
        occ.push([x, z, fr]);
        if (kind !== 'solar' && kind !== 'crates') { const ux = (d.x - x), uz = (d.z - z), L = Math.hypot(ux, uz); links.push([x, z, d.x - ux / L * d.r, d.z - uz / L * d.r]); }
        break;
      }
    }
    return { domes, lots, links, lock };
  }
  // a tiny light's ball: 80 triangles (BALL's 320 are wasted on a lamp a few pixels across)
  dotGeo() { return (this.geoCache ||= {}).dot ||= new THREE.IcosahedronGeometry(1, 1); }
  // stamp a local kit (built at the origin, door +z) into K at (x, z), turned by ang
  stamp(K, L, x, z, ang) {
    const M = new THREE.Matrix4().makeRotationY(ang).setPosition(x, 0, z);
    for (const [key, list] of L.by) for (const g of list) K.raw(key, g.applyMatrix4(M));
  }
  // a soft dark ring on the ground round a footprint (contact shade on bare Mars, which takes no tile shadows)
  shadeMat() { return this.mats.shadeAO ||= this.own(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })); }
  halo(S, x, z, rad, a = 0.3, w = 0.035) {
    const seg = 28, R = [rad * 0.8, rad + 0.004, rad + w], Al = [a, a * 0.85, 0], pos = [], col = [], idx = [];
    for (let i = 0; i < 3; i++) for (let j = 0; j < seg; j++) { const t = j / seg * TAU; pos.push(x + Math.cos(t) * R[i], 0.0003, z + Math.sin(t) * R[i]); col.push(0.08, 0.04, 0.02, Al[i]); }
    for (let i = 0; i < 2; i++) for (let j = 0; j < seg; j++) { const a0 = i * seg + j, a1 = i * seg + (j + 1) % seg; idx.push(a0, a0 + seg, a1, a1, a0 + seg, a1 + seg); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4)); g.setIndex(idx);
    S.raw(this.shadeMat(), g);
  }
  // a flat strip of ground from a to b (a service path), w wide, in the ground kit
  ribbon(G, ax, az, bx, bz, w, cf, y = 0.0008) {
    const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
    if (L < 0.012) return;
    G.add('ground', new THREE.PlaneGeometry(L, w, Math.max(1, Math.ceil(L / 0.03)), 1).rotateX(-Math.PI / 2), cf, [(ax + bx) / 2, y, (az + bz) / 2], [0, -Math.atan2(dz, dx), 0]);
  }
  // a glass tunnel between two domes { x, z, r }: the tube, its ribs, a walkway and its lights, a slab under it
  glassTunnel(K, G, a, b, rad) {
    const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L, t0 = a.r - 0.02, t1 = L - b.r + 0.02, ang = -Math.atan2(dz, dx), len = t1 - t0;
    if (len < 0.012) return;
    const mx = a.x + ux * (t0 + t1) / 2, mz = a.z + uz * (t0 + t1) / 2, y = rad * 0.55;
    K.add('gdome', new THREE.CylinderGeometry(rad, rad, len, 16, 1, true).rotateZ(Math.PI / 2), 0xffffff, [mx, y, mz], [0, ang, 0], 1, { smooth: true });
    const n = Math.max(2, Math.round(len / 0.028));
    for (let i = 0; i <= n; i++) { const t = t0 + len * i / n; K.add('metal', new THREE.TorusGeometry(rad * 1.04, 0.0024, 5, 16).rotateY(Math.PI / 2), 0xeef2f4, [a.x + ux * t, y, a.z + uz * t], [0, ang, 0]); }
    K.box('std', 0x8e8a84, mx, 0, mz, len, 0.004, rad * 1.5, ang);
    K.box('glow', 0xcfeeff, mx, y + rad * 0.8, mz, len * 0.92, 0.0015, 0.0028, ang);
    G.box('ground', 0xb2ada4, mx, 0, mz, len, 0.0022, rad * 2.5, ang);
  }
  // a door vestibule on a dome's rim facing (ux, uz): a short white box, a lit door, a step
  domeDoor(K, G, d, ux, uz, s = 1) {
    const x = d.x + ux * (d.r + 0.006 * s), z = d.z + uz * (d.r + 0.006 * s), ang = Math.atan2(ux, uz);
    const L = new Kit(), Lg = new Kit();
    L.box('std', 0xf2f1ec, 0, 0, 0, 0.026 * s, 0.022 * s, 0.024 * s);
    L.box('metal', 0x8a929c, 0, 0.022 * s, 0, 0.029 * s, 0.003, 0.027 * s);
    L.box('glow', 0x9fe8ff, 0, 0.002, 0.0122 * s, 0.012 * s, 0.016 * s, 0.0015);
    L.box('glow', 0xffe0a8, 0, 0.019 * s, 0.0124 * s, 0.006 * s, 0.002, 0.0015);
    Lg.box('ground', 0xb8b3aa, 0, 0, 0.01 * s, 0.034 * s, 0.0024, 0.03 * s);
    this.stamp(K, L, x, z, ang); this.stamp(G, Lg, x, z, ang);
  }
  // ---- the outbuildings: each at the origin, door +z (L: structure, G: its footprint), sizes in board units
  // a hab module: a white capsule on saddles, a lit window row, an entry porch, a vent and an aerial
  habModule(L, G) {
    G.box('ground', 0xb4aea4, 0, 0, 0, 0.104, 0.0026, 0.06);
    for (const sx of [-0.026, 0.026]) L.box('metal', 0x6a7078, sx, 0, 0, 0.008, 0.012, 0.03);
    L.add('std', capsuleX(0.017, 0.056, 14), 0xf1f0ea, [0, 0.026, 0], [0, 0, 0], 1, { smooth: true });
    for (const sx of [-0.036, 0.036]) L.add('std', new THREE.CylinderGeometry(0.0176, 0.0176, 0.005, 16, 1, true).rotateZ(Math.PI / 2), 0xd8742c, [sx, 0.026, 0]);   // orange trim bands
    for (let i = 0; i < 5; i++) if (i !== 2) L.box('glow', 0xffd890, -0.026 + i * 0.013, 0.027, 0.0158, 0.007, 0.006, 0.002);   // lit windows (the porch in the middle)
    for (let i = 0; i < 4; i++) L.box('glow', 0xffd890, -0.02 + i * 0.013, 0.027, -0.0158, 0.007, 0.006, 0.002);
    L.box('std', 0xe6e4de, 0, 0, 0.02, 0.02, 0.026, 0.016);                                              // the porch
    L.box('metal', 0x7c848e, 0, 0.026, 0.02, 0.023, 0.003, 0.019);
    L.box('glow', 0x9fe8ff, 0, 0.002, 0.0282, 0.01, 0.016, 0.0015);
    L.box('metal', 0x9aa0a8, 0.012, 0.041, -0.002, 0.018, 0.006, 0.012);                                    // a roof vent unit
    L.cyl('metal', 0xcfd4da, -0.03, 0.038, 0, 0.0012, 0.0008, 0.032, 4);                                   // the aerial, a red tip
    L.add('glow', this.dotGeo(), 0xff4a3a, [-0.03, 0.071, 0], [0, 0, 0], 0.0024);
    L.add('metal', new THREE.CylinderGeometry(0.011, 0.011, 0.004, 14).rotateZ(Math.PI / 2), 0x8a929c, [0.0465, 0.026, 0]);   // end hatches
    L.add('metal', new THREE.CylinderGeometry(0.011, 0.011, 0.004, 14).rotateZ(Math.PI / 2), 0x8a929c, [-0.0465, 0.026, 0]);
  }
  // a greenhouse lab: a flat-roofed lab block (window strips, door, roof plant) with a hoop greenhouse on its side
  greenhouseLab(L, G) {
    G.box('ground', 0xb4aea4, 0, 0, 0, 0.13, 0.0026, 0.064);
    L.box('std', 0xeceae4, -0.036, 0, 0, 0.046, 0.03, 0.048);
    L.box('metal', 0x7c848e, -0.036, 0.03, 0, 0.05, 0.004, 0.052);
    L.box('std', 0x3a8ac8, -0.036, 0.022, 0, 0.0465, 0.003, 0.0485);                                        // a blue trim band
    for (const sz of [1, -1]) L.box('glow', 0xbfe6ff, -0.04, 0.012, sz * 0.0243, 0.034, 0.006, 0.0012);     // window strips
    L.box('metal', 0x4a525c, -0.024, 0, 0.0242, 0.01, 0.018, 0.0016);                                        // the door, its lamp
    L.box('glow', 0xffe0a8, -0.024, 0.02, 0.0246, 0.006, 0.0022, 0.0012);
    L.box('metal', 0x9aa0a8, -0.046, 0.034, -0.008, 0.014, 0.008, 0.014);                                     // roof plant: a unit, a stack, a dish
    L.cyl('metal', 0xb8bec6, -0.028, 0.034, 0.01, 0.0025, 0.0025, 0.012, 6);
    L.add('std', dish(0.007, 0.003, 12), 0xf0f0f0, [-0.05, 0.042, 0.012], [0.9, 0, 0]);
    // the greenhouse: a glass half-tube on a kerb, arched ribs, glass ends, beds and a grow-light inside
    const gl = 0.07, gr = 0.024, gx = 0.024;
    L.box('std', 0xd8d4cc, gx, 0, 0, gl + 0.004, 0.004, gr * 2 + 0.004);
    L.add('gdome', new THREE.CylinderGeometry(1, 1, 1, 16, 1, true, 0, Math.PI).rotateZ(Math.PI / 2), 0xffffff, [gx, 0.004, 0], [0, 0, 0], [gl, gr, gr], { smooth: true });
    for (let i = 0; i <= 5; i++) L.add('metal', new THREE.TorusGeometry(gr * 1.02, 0.0016, 4, 14, Math.PI).rotateY(Math.PI / 2), 0xeef2f4, [gx - gl / 2 + gl * i / 5, 0.004, 0]);
    for (const e of [-1, 1]) L.add('gdome', new THREE.CircleGeometry(gr, 14, 0, Math.PI).rotateY(Math.PI / 2), 0xffffff, [gx + e * gl / 2, 0.004, 0]);
    L.add('metal', new THREE.CylinderGeometry(0.0016, 0.0016, gl, 5).rotateZ(Math.PI / 2), 0xeef2f4, [gx, 0.004 + gr * 1.02, 0]);   // the ridge
    for (const sz of [-0.009, 0.009]) L.box('std', 0x4f8a34, gx, 0.004, sz, gl - 0.008, 0.007, 0.009);
    L.box('glow', 0xffc8f2, gx, 0.02, 0, gl - 0.01, 0.0015, 0.003);
  }
  // a pump house: block, roof lip, trim, door and lamp, a lit window, a roof fan and a stack,
  // blue pipes out of its side with red valve wheels, a pressure bottle on the other side
  pumpHouse(L, G) {
    G.box('ground', 0xb4aea4, 0, 0, 0, 0.082, 0.0026, 0.062);
    L.box('std', 0xd8d4cc, 0, 0, 0, 0.055, 0.03, 0.042);
    L.box('metal', 0x7c848e, 0, 0.03, 0, 0.059, 0.004, 0.046);
    L.box('std', 0x3a8ac8, 0, 0.024, 0, 0.0555, 0.003, 0.0425);
    L.box('metal', 0x4a525c, -0.012, 0, 0.0212, 0.012, 0.02, 0.0016);
    L.box('glow', 0xffe0a8, -0.012, 0.021, 0.0216, 0.006, 0.0022, 0.0012);
    L.box('glow', 0xffe0a8, 0.012, 0.011, 0.0212, 0.016, 0.007, 0.0012);
    L.cyl('metal', 0x7a8088, 0.012, 0.034, -0.006, 0.01, 0.01, 0.005, 14);                                   // the roof fan
    L.add('std', new THREE.TorusGeometry(0.0098, 0.0014, 4, 14).rotateX(Math.PI / 2), 0x2a2e34, [0.012, 0.039, -0.006]);
    L.box('std', 0x2a2e34, 0.012, 0.039, -0.006, 0.018, 0.0012, 0.003, 0.6); L.box('std', 0x2a2e34, 0.012, 0.039, -0.006, 0.018, 0.0012, 0.003, 2.2);
    L.cyl('metal', 0x9aa0a8, -0.018, 0.034, -0.01, 0.003, 0.003, 0.018, 6);
    for (const [pz, h] of [[0.008, 0.02], [-0.008, 0.014]]) {                                                   // pipes out of the side, down, along the ground
      L.cyl('metal', 0x3a78b0, 0.031, 0.006, pz, 0.0036, 0.0036, h, 8);
      L.add('metal', new THREE.CylinderGeometry(0.0036, 0.0036, 0.016, 8).rotateZ(Math.PI / 2), 0x3a78b0, [0.039, 0.006, pz]);
      L.add('std', new THREE.TorusGeometry(0.0048, 0.0012, 4, 10), 0xd83a2a, [0.04, 0.006, pz + 0.006]);
      L.box('metal', 0x5a6068, 0.04, 0.004, pz + 0.004, 0.002, 0.004, 0.004);
    }
    L.add('std', capsuleX(0.0065, 0.02, 10), 0xe8e8e0, [-0.034, 0.008, 0], [0, Math.PI / 2, 0], 1, { smooth: true });
    L.box('metal', 0x6a7078, -0.034, 0, 0, 0.012, 0.003, 0.024);
  }
  // a water tank: a domed drum on a ring of legs, a blue band, a ladder up its side, a railed top, a hatch
  waterTank(L, G) {
    G.cyl('ground', 0xb4aea4, 0, 0, 0, 0.052, 0.052, 0.0026, 24);
    L.add('std', lathe([[0.001, 0.02], [0.042, 0.02], [0.042, 0.075], [0.036, 0.088], [0.02, 0.096], [0.001, 0.098]], 28), (X, Yy) => _c.setRGB(0.9, 0.92, 0.93).multiplyScalar(0.85 + Yy * 1.6), [0, 0, 0]);
    L.add('std', new THREE.TorusGeometry(0.0425, 0.003, 6, 28).rotateX(Math.PI / 2), 0x3a8ac8, [0, 0.06, 0]);
    L.add('std', new THREE.TorusGeometry(0.0425, 0.002, 6, 28).rotateX(Math.PI / 2), 0x9aa0a8, [0, 0.036, 0]);
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; L.cyl('metal', 0x8a9098, Math.cos(a) * 0.036, 0, Math.sin(a) * 0.036, 0.003, 0.003, 0.022, 6); }
    for (const sx of [-0.0045, 0.0045]) L.cyl('metal', 0x8a9098, sx, 0.004, 0.045, 0.0011, 0.0011, 0.086, 4);   // the ladder
    for (let i = 0; i < 9; i++) L.box('metal', 0x8a9098, 0, 0.012 + i * 0.0095, 0.045, 0.009, 0.0012, 0.0012);
    L.add('metal', new THREE.TorusGeometry(0.03, 0.0011, 4, 24).rotateX(Math.PI / 2), 0xc8ccd0, [0, 0.106, 0]);   // the railing
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; L.cyl('metal', 0xc8ccd0, Math.cos(a) * 0.03, 0.09, Math.sin(a) * 0.03, 0.0009, 0.0009, 0.016, 4); }
    L.box('metal', 0x7c848e, 0.008, 0.097, -0.006, 0.012, 0.003, 0.012);
    L.cyl('metal', 0x3a78b0, 0, 0, 0, 0.005, 0.005, 0.02, 8);                                                  // the downpipe
  }
  // a solar array: tilted panel rows on posts, frames, an inverter box
  solarRow(L, G, n = 3) {
    G.box('ground', 0xa8a298, 0, 0, 0, 0.106, 0.002, n * 0.03 + 0.012);
    for (let j = 0; j < n; j++) {
      const z = (j - (n - 1) / 2) * 0.03;
      L.add('std2', BOX, 0x24386a, [0, 0.017, z], [-0.5, 0, 0], [0.09, 0.0016, 0.022]);
      L.add('metal', BOX, 0xb8bec6, [0, 0.0164, z], [-0.5, 0, 0], [0.093, 0.0012, 0.0245]);
      for (let i = 1; i < 4; i++) L.add('metal', BOX, 0x8a9aae, [-0.045 + i * 0.0225, 0.0178, z], [-0.5, 0, 0], [0.0008, 0.0006, 0.022]);
      for (const sx of [-0.034, 0.034]) L.cyl('metal', 0x8a9098, sx, 0, z, 0.0014, 0.0014, 0.016, 5);
    }
    L.box('std', 0xd8d4cc, 0.052, 0, 0, 0.01, 0.014, 0.012);
    L.box('glow', 0x7dff7a, 0.052, 0.009, 0.0062, 0.003, 0.002, 0.001);
  }
  // a comms mast: a tapering lattice tower with brace rings, a dish, whips, a beacon, a hut at its foot
  commsMast(L, G) {
    G.box('ground', 0xb4aea4, 0, 0, 0, 0.056, 0.0026, 0.052);
    L.box('std', 0xeceae4, 0.012, 0, 0.01, 0.022, 0.016, 0.018);
    L.box('metal', 0x7c848e, 0.012, 0.016, 0.01, 0.025, 0.003, 0.021);
    L.box('glow', 0x9fe8ff, 0.012, 0.001, 0.0192, 0.007, 0.011, 0.0012);
    L.add('metal', new THREE.CylinderGeometry(0.0022, 0.0075, 0.12, 3, 1, true), 0xd8dde2, [-0.01, 0.06, -0.006]);
    for (let i = 0; i < 5; i++) { const y = 0.012 + i * 0.022, rr = 0.0072 - i * 0.0011; L.add('metal', new THREE.TorusGeometry(rr * 0.6, 0.0008, 3, 6).rotateX(Math.PI / 2), 0xd8dde2, [-0.01, y, -0.006]); }
    L.add('std', dish(0.013, 0.005, 16), 0xf0f0f0, [-0.004, 0.08, -0.002], [1.15, 0, 0]);
    L.cyl('metal', 0xcfd4da, -0.01, 0.12, -0.006, 0.0009, 0.0006, 0.03, 4);
    L.cyl('metal', 0xcfd4da, -0.013, 0.1, -0.006, 0.0007, 0.0005, 0.024, 4, [0, 0, 0.35]);
    L.add('blinkA', BALL, 0xffffff, [-0.01, 0.151, -0.006], [0, 0, 0], 0.0035);
  }
  // a rover on its charging pad: pad with hazard edges, chassis, dark cab glass, headlights,
  // a solar deck, six wheels, a camera mast, the charging post with its lamp
  roverPad(L, G) {
    G.box('ground', 0x9c978e, 0, 0, 0, 0.094, 0.0026, 0.074);
    for (const [x, z, w, d] of [[0, 0.035, 0.09, 0.003], [0, -0.035, 0.09, 0.003], [0.045, 0, 0.003, 0.07], [-0.045, 0, 0.003, 0.07]]) L.box('std', 0xe8b820, x, 0, z, w, 0.003, d);
    const R = new Kit();
    R.box('std', 0xe8e6e0, 0, 0.009, 0, 0.05, 0.012, 0.026);
    R.box('metal', 0x2a3440, 0.022, 0.012, 0, 0.012, 0.01, 0.022);
    for (const sz of [-0.007, 0.007]) R.box('glow', 0xfff0c0, 0.0285, 0.014, sz, 0.0015, 0.003, 0.004);
    R.box('std2', 0x24386a, -0.006, 0.0212, 0, 0.034, 0.0015, 0.025);
    for (const sz of [1, -1]) R.box('std', 0xd8742c, 0, 0.0145, sz * 0.0132, 0.05, 0.003, 0.0008);
    for (const x of [-0.017, 0, 0.017]) for (const sz of [1, -1]) R.add('std', new THREE.CylinderGeometry(0.0068, 0.0068, 0.0055, 10).rotateX(Math.PI / 2), 0x2a2a2e, [x, 0.0068, sz * 0.0155]);
    R.cyl('metal', 0xcfd4da, 0.012, 0.021, -0.008, 0.001, 0.001, 0.014, 4);
    R.box('std', 0xeceae4, 0.012, 0.035, -0.008, 0.006, 0.004, 0.007);
    this.stamp(L, R, -0.004, -0.004, 0.25);
    L.cyl('metal', 0x7c848e, -0.036, 0, 0.025, 0.003, 0.003, 0.02, 6);
    L.add('glow', this.dotGeo(), 0x7dff7a, [-0.036, 0.022, 0.025], [0, 0, 0], 0.003);
  }
  // a stack of cargo crates on a pallet slab
  crateStack(L, G, r) {
    G.box('ground', 0xa8a298, 0, 0, 0, 0.052, 0.0022, 0.044);
    const cols = [0xd8742c, 0x8a9098, 0xc8b070, 0xe8e6e0, 0x3a8ac8];
    for (const [x, z, y, s] of [[-0.012, -0.008, 0, 0.018], [0.01, -0.009, 0, 0.016], [-0.002, 0.011, 0, 0.017], [-0.011, -0.008, 0.0145, 0.014], [0.015, 0.012, 0, 0.012]]) {
      const c = cols[Math.floor(r() * cols.length)], a = (r() - 0.5) * 0.4;
      L.box('std', c, x, y, z, s, s * 0.8, s, a);
      L.box('std', 0x3a3c40, x, y + s * 0.3, z, s * 1.04, 0.0015, s * 1.04, a);
    }
  }
  // early: a pioneer outpost on bare Mars -- young trees planted in rows under big
  // geodesic glass domes (drip lines, grow-lights), smaller sub-domes budding off
  // them on glass tunnels, and round them the outbuildings: a hab module, a
  // greenhouse lab, a pump house with its pipes and valves, a water tank with a
  // ladder and railing, solar rows, a comms mast, a rover on its pad, crates;
  // service paths with grow-light masts, and the marker on its own pad.
  // ctx.bare (build(): a plain early greenery): the tile has no ground plate --
  // only the footprints (dome floors, slabs, paths, pads) are drawn, the planet
  // shows between them; otherwise (called for another tile's early look) it
  // stands on a regolith plate as the other tiles do.
  pioneer(ctx) {
    const bare = !!ctx.bare, low = gfx.low, r = this.env.srand(ctx.space * 131 + 9), TK = this.env.treeKit(), MARK = this.env.MARK, HR = this.HEX_R;
    const { domes, lots, lock } = this.pioneerLayout(ctx);
    // (a domed city next door runs a glass tube to the nearest of these: edgeBlend / domeTube, from the city's side)
    ctx.g.userData.pioDomes = { domes: domes.map((d) => ({ x: d.x, z: d.z, r: d.r, y: 0, hs: 0.78, big: d.big })), keep: [...lots.map((b) => [b.x, b.z, b.fr]), [MARK.x, MARK.y, 0.1]], tun: [[domes[0].x, domes[0].z, domes[1].x, domes[1].z], ...domes.filter((d) => d.parent).map((d) => [d.parent.x, d.parent.z, d.x, d.z])] };
    const K = new Kit(), G = new Kit(), S = new Kit(), trees = [];
    if (!bare) {
      ctx.wall(0x6a5236);
      this.groundMesh(ctx, (x, z) => 0.003 * (fbm2(x * 9 + 2, z * 9, 4) - 0.5) - 0.002, (x, z) => { const n = fbm2(x * 30, z * 30, 3), n2 = fbm2(x * 7 + 3, z * 7, 3); return _c.setRGB(0.76 + n * 0.1, 0.56 + n * 0.08, 0.4 + n * 0.06).multiplyScalar(0.92 + n2 * 0.16); }, { sub: low ? 16 : 24 });
    }
    const pathC = (X, Yy, Z) => _c.setRGB(0.5, 0.42, 0.35).multiplyScalar(0.88 + 0.24 * fbm2(X * 40 + 3, Z * 40, 2));
    // the domes: planted rows under glass, sub-domes (smaller, some crop-only) on tunnels to their parent
    domes.forEach((d) => {
      trees.push(...this.plantedDome(ctx, K, d.x, d.z, d.r, { seed: ctx.space + d.i, ang: d.ang, Kg: G, small: !d.big, detail: d.big && !low ? 2 : 1, trees: d.big || !d.crop, young: d.big ? 1 : 0.8 }));
      if (!low) this.halo(S, d.x, d.z, d.r, 0.34, 0.04);
    });
    this.glassTunnel(K, G, domes[0], domes[1], 0.022);
    for (const d of domes) if (d.parent) this.glassTunnel(K, G, d.parent, d, 0.016);
    // the main airlock and the marker's pad, a path between them
    { const { d, ux, uz } = lock, lx = d.x + ux * (d.r + 0.02), lz = d.z + uz * (d.r + 0.02), ang = -Math.atan2(uz, ux);
      K.add('std', capsuleX(0.017, 0.03, 14), 0xf2f2ee, [lx, 0.016, lz], [0, ang, 0], [1, 1, 1], { smooth: true });
      K.add('std', new THREE.CylinderGeometry(0.0175, 0.0175, 0.005, 16, 1, true).rotateZ(Math.PI / 2), 0xd8742c, [lx, 0.016, lz], [0, ang, 0]);
      K.box('glow', 0x9fe8ff, lx + ux * 0.032, 0.002, lz + uz * 0.032, 0.002, 0.022, 0.016, ang);
      K.add('blinkA', BALL, 0xffffff, [lx, 0.036, lz], [0, 0, 0], 0.0045);
      G.box('ground', 0xb8b3aa, lx, 0, lz, 0.07, 0.0024, 0.04, ang);
      const pr = 0.085, px = MARK.x - ux * pr, pz = MARK.y - uz * pr;
      this.ribbon(G, lx + ux * 0.03, lz + uz * 0.03, px, pz, 0.026, pathC);
      if (!low) for (const t of [0.35, 0.7]) { const x = lx + (px - lx) * t - uz * 0.022, z = lz + (pz - lz) * t + ux * 0.022; K.cyl('metal', 0x8a9098, x, 0, z, 0.0014, 0.0011, 0.032, 5); K.add('glow', this.dotGeo(), 0xffc8f2, [x, 0.033, z], [0, 0, 0], [0.0045, 0.003, 0.0045]); }
      // the pad: concrete with a painted ring and landing lights round it
      G.raw('ground', this.polarGround(MARK.x, MARK.y, [0, pr * 0.55, pr * 0.7, pr * 0.78, pr], low ? 20 : 32, () => 0.0016, (x, z) => { const q = Math.hypot(x - MARK.x, z - MARK.y) / pr; return q > 0.66 && q < 0.8 ? _c.setRGB(0.86, 0.72, 0.3) : _c.setRGB(0.66, 0.64, 0.6); }));
      if (!low) { this.halo(S, MARK.x, MARK.y, pr, 0.28, 0.03); for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; K.add('glow', this.dotGeo(), 0xfff0c0, [MARK.x + Math.cos(a) * pr * 0.92, 0.002, MARK.y + Math.sin(a) * pr * 0.92], [0, 0, 0], [0.004, 0.0025, 0.004]); } }
    }
    // the outbuildings, each with a path (and a door) to its dome
    const make = { hab: (L, Lg) => this.habModule(L, Lg), lab: (L, Lg) => this.greenhouseLab(L, Lg), pump: (L, Lg) => this.pumpHouse(L, Lg), tank: (L, Lg) => this.waterTank(L, Lg), solar: (L, Lg) => this.solarRow(L, Lg, low ? 2 : 3), mast: (L, Lg) => this.commsMast(L, Lg), rover: (L, Lg) => this.roverPad(L, Lg), crates: (L, Lg) => this.crateStack(L, Lg, r) };
    const at = {};
    for (const b of lots) {
      const L = new Kit(), Lg = new Kit();
      make[b.kind](L, Lg);
      this.stamp(K, L, b.x, b.z, b.ang); this.stamp(G, Lg, b.x, b.z, b.ang);
      if (!low) this.halo(S, b.x, b.z, b.fr * 0.82, 0.26, 0.03);
      (at[b.kind] ||= b);
      if (b.kind === 'solar' || b.kind === 'crates') continue;
      const d = b.d, ux = d.x - b.x, uz = d.z - b.z, L0 = Math.hypot(ux, uz), dx = ux / L0, dz = uz / L0;
      const sx = b.x + dx * b.fr * 0.75, sz = b.z + dz * b.fr * 0.75, ex = d.x - dx * d.r, ez = d.z - dz * d.r;
      this.ribbon(G, sx, sz, ex, ez, 0.02, pathC);
      this.domeDoor(K, G, d, -dx, -dz, d.big ? 1 : 0.8);
      if (!low && Math.hypot(ex - sx, ez - sz) > 0.05) { const x = (sx + ex) / 2 + dz * 0.017, z = (sz + ez) / 2 - dx * 0.017; K.cyl('metal', 0x8a9098, x, 0, z, 0.0014, 0.0011, 0.03, 5); K.add('glow', this.dotGeo(), 0xffc8f2, [x, 0.031, z], [0, 0, 0], [0.0045, 0.003, 0.0045]); }
      b.path = [sx, sz, ex, ez, dx, dz];
    }
    // the water: a blue pipe from the pump house (and from the tank to it) along the paths, on little supports
    const pipe = (ax, az, bx, bz) => {
      const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz); if (L < 0.02) return;
      K.add('metal', new THREE.CylinderGeometry(0.0034, 0.0034, L, 8).rotateZ(Math.PI / 2), 0x3a78b0, [(ax + bx) / 2, 0.006, (az + bz) / 2], [0, -Math.atan2(dz, dx), 0], 1, { smooth: true });
      for (let i = 1, n = Math.floor(L / 0.035); i < n; i++) K.box('metal', 0x5a6068, ax + dx * i / n, 0, az + dz * i / n, 0.004, 0.004, 0.009, -Math.atan2(dz, dx));
    };
    if (at.pump?.path) { const [sx, sz, ex, ez, dx, dz] = at.pump.path; pipe(sx + dz * 0.014, sz - dx * 0.014, ex + dz * 0.014, ez - dx * 0.014); }
    if (at.tank && at.pump && Math.hypot(at.tank.x - at.pump.x, at.tank.z - at.pump.z) < 0.2) pipe(at.tank.x, at.tank.z, at.pump.x, at.pump.z);
    else if (at.tank?.path) { const [sx, sz, ex, ez, dx, dz] = at.tank.path; pipe(sx + dz * 0.014, sz - dx * 0.014, ex + dz * 0.014, ez - dx * 0.014); }
    // the claim: a short post at each hex corner with a light in the owner's colour
    for (let k = 0; k < 6; k++) {
      const [x, z] = hexCorner(k, HR * 0.9);
      if (this.env.inClearing(x, z, 0.0)) continue;
      K.cyl('metal', 0x8a9098, x, 0, z, 0.003, 0.0024, 0.026, 6);
      K.add('glow', this.dotGeo(), ctx.pc, [x, 0.03, z], [0, 0, 0], 0.0075);
    }
    this.emit(K, ctx);
    this.emit(G, ctx, { shadow: false });
    if (S.by.size) this.emit(S, ctx, { shadow: false });
    // the trees: instanced (board3d's foliage and bark)
    const fol = this.b.folMat ||= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
    const bark = this.b.barkMat ||= new THREE.MeshStandardMaterial({ color: 0x6e4c2e, roughness: 0.95 });
    const con = trees.filter((t) => t.kind === 'conifer'), br = trees.filter((t) => t.kind === 'broad');
    ctx.inst(TK.conifer, fol, con); ctx.inst(TK.trunk, bark, con);
    ctx.inst(TK.broadLo || TK.broad, fol, br); ctx.inst(TK.broadTrunk, bark, br);
  }

  // mid: shrubland and young woods -- dense bright shrubs, grasses, small conifers
  // and saplings in clumps, patches of ground still showing, a pond with a rill
  // (the young woods: a pond on about one forest in four, an opened plantation dome on about one in three)
  shrubland(ctx) {
    const r = this.env.srand(ctx.space * 89 + 7), H0 = ctx.H, TK = this.env.treeKit(), low = gfx.low;
    ctx.wall(0x3e4a24);
    const pick = ctx.pvWater ? 1 : hash2(ctx.space * 1.713 + 0.5, 3.1), hasPond = pick < 0.25, hasFrame = !hasPond && pick < 0.6;   // (a Protected Valley with its own channels: neither)
    // the pond: an irregular natural outline (noise on the radius), a muddy margin, reeds and stones
    const pond = [(r() - 0.5) * 0.24 - 0.1, (r() - 0.5) * 0.2 - 0.08], pr = 0.085, pa = r() * 6;
    const pR = (a) => pr * (0.78 + 0.42 * vnoise(Math.cos(a) * 1.6 + pa, Math.sin(a) * 1.6 + pa * 0.7) + 0.08 * Math.sin(a * 2 + pa)) * (1 + 0.25 * Math.cos(a - pa));
    const pd = (x, z) => { if (!hasPond) return 9; const dx = x - pond[0], dz = z - pond[1]; return Math.hypot(dx, dz) - pR(Math.atan2(dz, dx)); };   // < 0 in the water
    const frame = [0.02 * (ctx.space % 2 ? 1 : -1) - 0.08, -0.1, 0.22];
    const hf = (x, z) => { const d = pd(x, z); return (d < 0.02 ? -0.012 * smooth(0.02, -0.02, d) : 0) + 0.006 * (fbm2(x * 10 + 4, z * 10, 4) - 0.5) * smooth(0, 0.05, this.edgeDist(x, z)); };
    const bare = (x, z) => smooth(0.63, 0.7, fbm2(x * 6 + 21, z * 6 + 5, 4));
    const cf = (x, z) => {
      const n = fbm2(x * 28, z * 28, 3), b = bare(x, z), d = pd(x, z);
      _c.setRGB(0.4 + n * 0.12, 0.62 + n * 0.1, 0.22 + n * 0.06);                                       // bright young grass
      _c.lerp(_c2.setRGB(0.66 + n * 0.08, 0.5 + n * 0.06, 0.34), b * 0.6);                              // a little ground still showing
      if (hasFrame) { const fd = Math.hypot(x - frame[0], z - frame[1]); _c.lerp(_c2.setRGB(0.78, 0.76, 0.7), smooth(0.012, 0.004, Math.abs(fd - frame[2] * 0.87)) * 0.8); }   // the old dome's rim walk
      if (d < 0.035) _c.lerp(_c2.setRGB(0.3 + n * 0.06, 0.24 + n * 0.05, 0.16), smooth(0.035, 0.008, d));   // wet mud round the water
      return _c;
    };
    this.groundMesh(ctx, hf, cf, { sub: 30, frost: true });
    const V = this.pvGround; ctx.g.userData.gcf = V ? (x, z) => V.c(x, z, V.h(x, z, hf(x, z)), cf(x, z)) : cf;   // (edgeBlend: the seams toward another forest carry this ground on)
    const K = new Kit();
    const reeds = [], stones = [];
    if (hasPond) {
      // the water: a fan over the outline, a little under the banks
      const N = 48, wp = [pond[0], 0, pond[1]], wi = [];
      for (let i = 0; i < N; i++) { const a = i / N * TAU, R = pR(a) + 0.004; wp.push(pond[0] + Math.cos(a) * R, 0, pond[1] + Math.sin(a) * R); }
      for (let i = 1; i <= N; i++) wi.push(0, (i % N) + 1, i);
      const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3)); wg.setIndex(wi); wg.computeVertexNormals();
      if (wg.attributes.normal.getY(0) < 0) { wg.index.array.reverse(); wg.computeVertexNormals(); }
      K.add('water', wg, 0xffffff, [0, -0.0045, 0]);
      // reeds in clumps along parts of the margin, stones on the others, lily pads on the water
      for (let i = 0; i < 60; i++) {
        const a = r() * TAU, R = pR(a) + (r() - 0.35) * 0.02, x = pond[0] + Math.cos(a) * R, z = pond[1] + Math.sin(a) * R;
        if (this.edgeDist(x, z) < 0.02 || this.env.inClearing(x, z, 0.0)) continue;
        if (vnoise(Math.cos(a) * 2 + 9, Math.sin(a) * 2) > 0.45) reeds.push({ x, y: z, lift: H0, s: 0.9 + r() * 0.6, sy: 1.5 + r() * 0.9, rot: r() * 6.28, c: new THREE.Color().setHSL(0.17 + r() * 0.06, 0.45, 0.32 + r() * 0.12) });
        else if (r() < 0.35) stones.push([x, z, 0.006 + r() * 0.008]);
      }
      for (const [x, z, s] of stones) K.add('matte', BALL, (X, Yy) => _c.setRGB(0.52, 0.5, 0.47).multiplyScalar(0.75 + clamp01(Yy * 60)), [x, -0.003, z], [r(), r(), r()], [s * 1.3, s * 0.7, s]);
      for (let i = 0; i < 6; i++) { const a = r() * TAU, R = pR(a) * (0.35 + r() * 0.45); K.add('matte', new THREE.CircleGeometry(0.007, 12, 0.4, TAU - 0.5).rotateX(-Math.PI / 2), 0x4a8a3a, [pond[0] + Math.cos(a) * R, -0.0038, pond[1] + Math.sin(a) * R], [0, r() * 6, 0]); }
    }
    const ok = (x, z, pad = 0.035) => this.edgeDist(x, z) > pad && !this.env.inClearing(x, z, 0.02) && pd(x, z) > 0.03;
    const shrubs = [], tufts = [], con = [], broad = [], sap = [];
    const C = (h, s, l) => new THREE.Color().setHSL(h + r() * 0.08, s + r() * 0.15, l + r() * 0.1);
    // the opened dome: its glass gone, the frame standing over rows of young trees grown up out of it
    if (hasFrame) {
      const rows = this.plantedDome(ctx, K, frame[0], frame[1], frame[2], { glass: false, lights: false, seed: ctx.space, ang: (r() - 0.5) * 0.6, rowGap: 0.05, treeGap: 0.042, young: 1.55 });
      for (const t of rows) if (ok(t.x, t.y, 0.02)) (t.kind === 'broad' ? broad : con).push({ ...t, s: t.s * (t.kind === 'broad' ? 1.5 : 1) });
    }
    const inFrame = (x, z) => hasFrame && Math.hypot(x - frame[0], z - frame[1]) < frame[2] + 0.02;
    // clumps of young conifers and broadleaf saplings, denser toward their middles
    for (let c = 0; c < (low ? 7 : 11); c++) {
      const cx = (r() - 0.5) * 0.66, cz = (r() - 0.5) * 0.7;
      for (let i = 0; i < 9; i++) { const a = r() * TAU, d = Math.sqrt(r()) * 0.085, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d; if (!ok(x, z) || inFrame(x, z)) continue;
        const it = { x, y: z, lift: H0, s: 0.42 + r() * 0.3 * (1 - d / 0.1), rot: r() * 6.28, c: C(0.26, 0.5, 0.34) };
        (r() < 0.62 ? con : broad).push(it); }
    }
    // single saplings everywhere between (small poplars and conifers)
    for (let i = 0; i < (low ? 14 : 26); i++) { const x = (r() - 0.5) * 0.85, z = (r() - 0.5) * 0.9; if (!ok(x, z) || inFrame(x, z)) continue; sap.push({ x, y: z, lift: H0, s: 0.3 + r() * 0.18, rot: r() * 6.28, c: C(0.24, 0.5, 0.38) }); }
    for (let i = 0; i < (low ? 70 : 120); i++) { const x = (r() - 0.5) * 0.88, z = (r() - 0.5) * 0.92; if (!ok(x, z, 0.025) || bare(x, z) > 0.7 || inFrame(x, z)) continue; shrubs.push({ x, y: z, lift: H0, s: 0.7 + r() * 0.7, rot: r() * 6.28, c: C(0.23, 0.5, 0.36) }); }
    for (let i = 0; i < (low ? 40 : 80); i++) { const x = (r() - 0.5) * 0.88, z = (r() - 0.5) * 0.92; if (!ok(x, z, 0.015)) continue; tufts.push({ x, y: z, lift: H0, s: 0.8 + r() * 0.6, rot: r() * 6.28, c: C(0.2, 0.55, 0.42) }); }
    const fol = this.b.folMat ||= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
    const bark = this.b.barkMat ||= new THREE.MeshStandardMaterial({ color: 0x6e4c2e, roughness: 0.95 });
    ctx.inst(TK.conifer, fol, [...con, ...sap.filter((_, i) => i % 2)]); ctx.inst(TK.trunk, bark, [...con, ...sap]);
    ctx.inst(TK.broad, fol, broad); ctx.inst(TK.broadTrunk, bark, broad);
    ctx.inst(TK.poplar, fol, sap.filter((_, i) => !(i % 2)));
    ctx.inst(TK.bush, fol, shrubs); ctx.inst(TK.tuft, fol, [...tufts, ...reeds.map((t) => ({ ...t, sx: t.s, sz: t.s }))]);
    this.emit(K, ctx);
  }

  // ---------------------------------------------------------------- greenery stages
  // the forest (board3d's) a little brighter, with some colour variety between trees
  brighten(ctx) {
    const c = new THREE.Color(), hsl = {};
    for (const m of ctx.g.children) if (m.isMesh && !m.isInstancedMesh && m.material?.map && m.material.map === this.b.forestTex) m.material.color.setRGB(1.7, 1.8, 1.4);   // the forest floor: lighter, less of a black hole under the canopy
    for (const m of ctx.g.children) {
      if (!m.isInstancedMesh || !m.instanceColor || m.material !== this.b.folMat) continue;
      for (let i = 0; i < m.count; i++) {
        m.getColorAt(i, c); c.getHSL(hsl);
        c.setHSL(hsl.h + (hash2(i, m.count) - 0.5) * 0.07, Math.min(1, hsl.s * 1.2), Math.min(0.5, hsl.l * 1.18 + 0.02));
        m.setColorAt(i, c);
      }
      m.instanceColor.needsUpdate = true;
    }
  }
  // late: meadow flowers in the clearings
  flowers(ctx, bad) {                                  // (bad(x, z): no flower there -- a Protected Valley's water)
    const K = new Kit(), r = this.env.srand(ctx.space * 71 + 5), cols = [0xfff4e0, 0xffd84a, 0xff9ac8, 0xb8a0ff, 0xffffff];
    for (let i = 0; i < 40; i++) {
      const a = r() * TAU, d = 0.06 + r() * 0.1, x = this.env.MARK.x + Math.cos(a) * d * 1.3 - 0.12, z = this.env.MARK.y + Math.sin(a) * d - 0.08;
      if (this.edgeDist(x, z) < 0.02 || this.env.inClearing(x, z, -0.03) || bad?.(x, z)) continue;
      K.add('glow', BALL, cols[i % cols.length], [x, 0.012, z], [0, 0, 0], 0.0045);
    }
    this.emit(K, ctx);
  }
}
