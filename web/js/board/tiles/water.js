// water.js -- TileArt mixin: the Mangrove, the greenery and ocean overlays (canopy mist, ice floes, sailboats)
// and the small flocks of birds that cross the forests as the oxygen rises.
import * as THREE from 'three';
import { gfx } from '../quality.js';
import { mergeGeometries } from '../../../vendor/BufferGeometryUtils.js';
import { BALL, BOX, FLOE, Kit, TAU, V3, Y, _bM, _bP, _bS, _c, capsuleX, hash2, hexCorner, part } from './kit.js';

export class WaterArt {
  // Mangrove: a greenery on an ocean spot, as a tidal forest -- shallow
  // water over the ground and arched roots at the base of every tree
  mangrove(ctx) {
    const cell = ctx.cell, bo = this.boardOf(cell), K = new Kit(), M = new THREE.Matrix4(), P = new V3();
    // the shallow water over the whole hex
    const R0 = this.HEX_R * 0.93, wp = [0, 0, 0], wi = [];
    for (let k = 0; k < 6; k++) { const [x, z] = hexCorner(k, R0); wp.push(x, 0, z); }
    for (let k = 1; k <= 6; k++) wi.push(0, (k % 6) + 1, k);
    const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3)); wg.setIndex(wi); wg.computeVertexNormals();
    if (wg.attributes.normal.getY(0) < 0) { wg.index.array.reverse(); wg.computeVertexNormals(); }
    K.add('shallow', wg, 0xffffff, [0, 0.006, 0]);
    // arched prop roots round each tree (the trunks' instances)
    const root = new THREE.TorusGeometry(0.034, 0.003, 5, 12, Math.PI);          // (wide enough to show past the crowns from above)
    let n = 0;
    for (const m of ctx.g.children) {
      if (!m.isInstancedMesh || m.material !== this.b.barkMat) continue;
      for (let i = 0; i < m.count && n < 60; i++, n++) {
        m.getMatrixAt(i, M); P.setFromMatrixPosition(M);
        const [x, z] = bo(P), h = hash2(x * 31, z * 17);
        for (let j = 0; j < 5; j++) K.add('matte', root, 0x5a3e26, [x, 0.002, z], [0, h * 6 + j * Math.PI * 0.4, 0], [0.8 + 0.5 * hash2(i, j), 0.9, 1]);
      }
    }
    // a few mudflats and seedlings in the open water
    for (let i = 0; i < 10; i++) { const x = (hash2(i, 1) - 0.5) * 0.7, z = (hash2(i, 2) - 0.5) * 0.7; if (this.edgeDist(x, z) < 0.03 || this.env.inClearing(x, z, 0.0)) continue; K.add('matte', BALL, 0x6a5a3a, [x, 0.002, z], [0, 0, 0], [0.03, 0.004, 0.02]); K.cyl('matte', 0x3a6a2a, x, 0.004, z, 0.003, 0.0015, 0.02, 5); }
    this.emit(K, ctx);
  }

  // ================================================================ greenery / ocean overlays
  // Greenery keeps board3d's forest; on top: wisps of low mist drifting over
  // the canopy (their opacity follows the oxygen via the shared mist fade).
  greeneryOver(ctx) {
    queueMicrotask(() => this.applyStage());          // (the forest's shared foliage material exists once makeTile finishes)
    if (gfx.low) return;                              // (no mist at Low quality)
    const r = this.env.srand(ctx.space * 157 + 1), list = [];
    for (let i = 0; i < 3; i++) {
      const x = (r() - 0.5) * 0.5, z = (r() - 0.5) * 0.6;
      list.push({ x, z, y: 0.17 + r() * 0.05, n: 3, life: 11 + r() * 5, rise: 0.02, size: 0.3 + r() * 0.12, col: [0.93, 0.96, 1, 0.42], drift: [0.28, -0.06 + r() * 0.12], jit: 0.12, spread: 0.02 });
    }
    const m = this.puffs(ctx, list);
    m.material = this.mistMat();
  }
  mistMat() {
    if (this.mats.mist) return this.mats.mist;
    const m = this.puffMat().clone();
    m.uniforms = { ...this.puffMat().uniforms, uFade: this.mistFade ||= { value: 0.25 + 0.75 * this.life } };
    m.userData.shared = true;
    return this.mats.mist = m;
  }
  // Ocean: ice floes while it is cold (fewer as it warms), a sailboat or two
  // once the climate is mild. Floes sit on the board's shared water shell.
  oceanOver(ctx) {
    const r = this.env.srand(ctx.space * 163 + 5), k = this.kOf(ctx.cell), wy = (-0.03 - ctx.H) / k, K = new Kit();
    const nF = Math.round(this.frost * 10);
    for (let i = 0; i < nF; i++) {
      const a = r() * TAU, d = 0.05 + r() * 0.27, s = 0.012 + r() * 0.03;
      K.add('std', FLOE, (X, Yy) => _c.setRGB(0.86, 0.93, 0.98).multiplyScalar(Yy > wy ? 1 : 0.8), [Math.cos(a) * d, wy - 0.002, Math.sin(a) * d], [0, r() * 6, 0], [s * (1 + r() * 0.7), s * 0.08, s * (0.6 + r() * 0.4)]);
    }
    if (K.by.size) this.emit(K, ctx, { shadow: false });
    // a sailboat on about one ocean in four once the climate is mild, drifting slowly round its water
    if (this.st.temp > -4 && hash2(ctx.space * 3.17 + 0.3, 7.9) < 0.26) this.sailboat(ctx, wy, r);
  }
  // the sailboat's parts (local: bow toward +x, deck at y 0), built once: a smooth hull
  // (fine bow, full stern, a blue boot stripe at the waterline), a deck, cabin, mast and
  // boom, a billowed mainsail and a jib
  boatKit() {
    if (this._boat) return this._boat;
    const L = 0.062, B = 0.0125, Dp = 0.009, NU = 22, NV = 12, pos = [], idx = [];
    const half = (u) => B * Math.pow(Math.max(0, 1 - Math.pow(Math.max(0, u), 2)), 0.55) * (u < 0 ? Math.pow(1 - 0.35 * u * u, 1) : 1);   // u -1 stern .. 1 bow
    for (let i = 0; i <= NU; i++) {
      const u = -1 + 2 * i / NU, w = Math.max(half(u), u > 0.98 ? 0 : 0.0006), x = u * L / 2, sh = 0.0025 * u * u + (u > 0 ? 0.002 * u : 0);   // sheer: rising to the bow
      for (let j = 0; j <= NV; j++) { const t = Math.PI * j / NV, y = -Dp * Math.sin(t) * (1 - 0.35 * Math.max(0, u) ** 2) + sh; pos.push(x, y, -w * Math.cos(t)); }
    }
    for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) { const a = i * (NV + 1) + j, b = a + NV + 1; idx.push(a, a + 1, b, b, a + 1, b + 1); }
    let hull = new THREE.BufferGeometry(); hull.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); hull.setIndex(idx); hull.computeVertexNormals();
    { const P = hull.attributes.position, N = hull.attributes.normal; let out = 0; for (let i = 0; i < P.count; i++) out += N.getZ(i) * P.getZ(i) + N.getY(i) * P.getY(i); if (out < 0) { hull.index.array.reverse(); hull.computeVertexNormals(); } }
    const col = (x, y) => (y < -0.0038 ? _c.setRGB(0.12, 0.24, 0.5) : y < -0.0026 ? _c.setRGB(0.95, 0.95, 0.9) : _c.setRGB(0.97, 0.97, 0.95));
    const K = new Kit(), SK = new Kit();
    K.add('std', hull, col);
    // the deck: the hull's top outline, filled
    const dp = [0, 0.0015, 0], di = []; for (let i = 0; i <= NU; i++) { const u = -1 + 2 * i / NU; dp.push(u * L / 2, 0.0025 * u * u + (u > 0 ? 0.002 * u : 0), -Math.max(half(u), 0.0006)); } for (let i = NU; i >= 0; i--) { const u = -1 + 2 * i / NU; dp.push(u * L / 2, 0.0025 * u * u + (u > 0 ? 0.002 * u : 0), Math.max(half(u), 0.0006)); }
    const nd = dp.length / 3 - 1; for (let i = 1; i <= nd; i++) di.push(0, i, (i % nd) + 1);
    const deck = new THREE.BufferGeometry(); deck.setAttribute('position', new THREE.Float32BufferAttribute(dp, 3)); deck.setIndex(di); deck.computeVertexNormals(); if (deck.attributes.normal.getY(1) < 0) { deck.index.array.reverse(); deck.computeVertexNormals(); }
    K.add('std', deck, 0xc8a878);
    K.add('std', capsuleX(0.0045, 0.012, 14), 0xf2f2ee, [-0.008, 0.003, 0], [0, 0, 0], [1, 0.7, 1.4], { smooth: true });            // the cabin
    K.add('glow', BOX, 0x9fd8ff, [-0.008, 0.0045, 0], [0, 0, 0], [0.012, 0.0014, 0.0128]);
    K.add('metal', new THREE.CylinderGeometry(0.0007, 0.0009, 0.07, 8).translate(0, 0.035, 0), 0xd8dade, [0.004, 0.002, 0]);        // mast
    K.add('metal', new THREE.CylinderGeometry(0.0006, 0.0006, 0.03, 6).rotateZ(Math.PI / 2), 0xd8dade, [-0.011, 0.012, 0]);      // boom
    // the sails: gently billowed triangles (double-sided)
    const sail = (pts, bil, n = 8) => {
      const [A, Bp, C] = pts, sp = [], si = [], row = (i) => i * (i + 1) / 2;
      for (let i = 0; i <= n; i++) for (let j = 0; j <= i; j++) {
        const a = 1 - i / n, b = (i - j) / n, c = j / n, x = A[0] * a + Bp[0] * b + C[0] * c, y = A[1] * a + Bp[1] * b + C[1] * c;
        sp.push(x, y, bil * 27 * a * b * c);                                       // (the belly: deepest mid-sail)
      }
      for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) { si.push(row(i) + j, row(i + 1) + j, row(i + 1) + j + 1); if (j < i) si.push(row(i) + j, row(i + 1) + j + 1, row(i) + j + 1); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3)); g.setIndex(si); g.computeVertexNormals(); return g;
    };
    SK.add('std2', sail([[0.004, 0.071], [0.0035, 0.013], [-0.026, 0.013]], 0.004), (x, y) => _c.setRGB(0.98, 0.97, 0.93).multiplyScalar(0.9 + y * 1.5));
    SK.add('std2', sail([[0.0045, 0.066], [0.029, 0.005], [0.006, 0.006]], 0.003), 0xf2eee6);
    return this._boat = { K, SK };
  }
  sailboat(ctx, wy, r) {
    const { K, SK } = this.boatKit(), g = new THREE.Group(), k = this.kOf(ctx.cell);
    for (const kit of [K, SK]) for (const [key, list] of kit.by) { const m = new THREE.Mesh(mergeGeometries(list.map((x) => x.clone())), this.mat(key)); m.castShadow = true; g.add(m); }
    // the drift: a slow loop round the hex (precomputed frames), heading along it, a gentle bob and heel
    const n = 64, pts = [], qs = [], R0 = 0.13 + r() * 0.08, ph = r() * TAU, dir = r() < 0.5 ? 1 : -1, ex = 0.8 + r() * 0.3;
    for (let i = 0; i <= n; i++) {
      const a = ph + dir * i / n * TAU, x = Math.cos(a) * R0 * ex, z = Math.sin(a) * R0, a2 = a + dir * 0.02, hx = Math.cos(a2) * R0 * ex - x, hz = Math.sin(a2) * R0 - z;
      const { p, q } = this.b.frameAt(ctx.cell, x, z, ctx.H + (wy + 0.0055) * k, true);
      pts.push(p.sub(ctx.cell.center)); qs.push(q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(Y, -Math.atan2(hz, hx))));
    }
    this.place(g, ctx, 0, 0, 0);
    const T = 90 + r() * 50, t0 = r() * T, up = ctx.cell.up, tilt = new THREE.Quaternion(), X = new V3(1, 0, 0);
    this.anim.push({ o: g, f: (tt) => {
      const c = (((tt + t0) / T) % 1) * n, i0 = Math.floor(c), w = c - i0;
      g.position.lerpVectors(pts[i0], pts[i0 + 1], w).addScaledVector(up, 0.0012 * k * Math.sin(tt * 1.7 + t0));
      g.quaternion.slerpQuaternions(qs[i0], qs[i0 + 1], w).multiply(tilt.setFromAxisAngle(X, dir * (0.12 + 0.05 * Math.sin(tt * 0.9 + t0))));
    } });
    return g;
  }
  // occasional small flocks crossing a random forest; more (and bigger)
  // as the oxygen rises, none while the air is unbreathable
  birdTick(t, dt) {
    const life = this.life;
    const f = this.birds;
    if (f && f.mesh.parent) {
      const k = (t - f.t0) / f.dur;
      if (k >= 1) { f.mesh.parent.remove(f.mesh); this.birds = null; }
      else {
        const M = _bM, S = _bS, P = _bP;
        for (let i = 0; i < f.n; i++) {
          const o = f.off[i], flap = Math.sin(t * 11 + i * 1.7);
          P.copy(f.a).lerp(f.b, k).addScaledVector(f.side, o[0]).addScaledVector(f.fwd, o[1]).addScaledVector(f.up, o[2] + Math.sin(t * 2 + i) * 0.01);
          S.set(f.s, f.s * (0.35 + 0.9 * flap), f.s);
          M.compose(P, f.q, S); f.mesh.setMatrixAt(i, M);
        }
        f.mesh.instanceMatrix.needsUpdate = true;
      }
      return;
    }
    this.birds = null;
    if (life < 0.15 || gfx.low) return;                  // (no birds at Low quality)
    this.nextBirds ??= t + 4;
    if (t < this.nextBirds) return;
    this.nextBirds = t + (26 - 16 * life) * (0.6 + Math.random() * 0.8);
    const forests = [...this.b.tiles.entries()].filter(([, g]) => g.userData.key?.startsWith('1:')).map(([s]) => this.b.cells[s]);
    if (!forests.length) return;
    const cell = forests[Math.floor(Math.random() * forests.length)], k = cell.W / this.HEX_R;
    const ang = Math.random() * TAU, dir = cell.east.clone().multiplyScalar(Math.cos(ang)).addScaledVector(cell.north, Math.sin(ang));
    const h = 0.32 * k, a = cell.center.clone().addScaledVector(cell.up, h).addScaledVector(dir, -1.4 * cell.W), b = cell.center.clone().addScaledVector(cell.up, h + 0.1 * k).addScaledVector(dir, 1.4 * cell.W);
    const n = 3 + Math.round(life * 6), mesh = this.birdMesh(n);
    mesh.frustumCulled = false;
    const up = cell.up.clone(), fwd = dir.clone(), side = fwd.clone().cross(up).normalize();
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(fwd, up, fwd.clone().cross(up).normalize()));
    const off = []; for (let i = 0; i < n; i++) { const row = Math.ceil(i / 2), sd = i % 2 ? 1 : -1; off.push([sd * row * 0.05 * k + (Math.random() - 0.5) * 0.02 * k, -row * 0.05 * k, (Math.random() - 0.5) * 0.03 * k]); }
    this.b.board.add(mesh);
    this.birds = { mesh, n, a, b, t0: t, dur: 7 + Math.random() * 3, off, fwd, side, up, q, s: 0.022 * k };
  }

  birdMesh(n) {
    const geo = this.birdGeo ||= mergeGeometries([part(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, -0.5, 0.35, 0.9, -0.2, 0, 0, 0, 0, 0, -0.2, 0, 0, -0.5, 0.35, -0.9], 3)), 0x2a2622)]);
    geo.userData.shared = true;
    return new THREE.InstancedMesh(geo, this.mats.bird ||= this.own(new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.8 })), n);
  }
}
