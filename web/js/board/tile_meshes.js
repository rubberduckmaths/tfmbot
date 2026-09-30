// tile_meshes.js -- Board3D mixin: placing tiles -- syncing the board with the view's tiles, the classic tile
// models, the drop-in and its dust (each tile's own art is TileArt, in tiles/).
import * as THREE from 'three';
import { gfx } from './quality.js';
import { mergeGeometries, mergeVertices } from '../../vendor/BufferGeometryUtils.js';
import { CITY, DEC, ECO_DOME_S, ECO_FEAT, ECO_PATH, ECO_PLAZA, ECO_POND, ECO_SPOKES, ECO_V, ECO_Y, MARK, MARK_CLEAR, cityGroundTex, clearingTex, ecoGroundTex, ecoPondPts, facadeTex, glassTex, groundTex, inClearing, lumpy, markerTex, shadeByHeight, srand, vhash } from './model_kit.js';
import { HEX_R, SPECIAL_ICON, TILE } from './layout.js';

export class BoardTiles {
  // ---------------------------------------------------------------- tiles
  // points inside the cell footprint (board units), Poisson-ish
  scatter(n, seed, inset, minD) {
    const r = srand(seed), pts = [];
    let guard = 0;
    while (pts.length < n && guard++ < n * 60) {
      const x = (r() - 0.5) * Math.sqrt(3) * HEX_R * inset, y = (r() - 0.5) * 2 * HEX_R * inset;
      const ax = Math.abs(x), ay = Math.abs(y);
      if (ax > Math.sqrt(3) / 2 * HEX_R * inset || ay > HEX_R * inset - ax / Math.sqrt(3)) continue;
      if (pts.some((p) => Math.hypot(p[0] - x, p[1] - y) < minD)) continue;
      pts.push([x, y]);
    }
    return pts;
  }
  frameAt(cell, x, y, lift, aligned) {
    const p = cell.proj(x, y, lift);
    const up = cell.colony ? cell.up : p.clone().normalize();
    if (!aligned) return { p, q: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), up) };
    // local x along the hex's own x axis, so boxes line up with the street grid
    const X = cell.proj(x + 0.01, y, lift).sub(p);
    X.addScaledVector(up, -X.dot(up)).normalize();
    const Z = X.clone().cross(up).normalize();
    return { p, q: new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, up, Z)) };
  }

  makeTile(space, type, owner) {
    const cell = this.cells[space];
    const g = new THREE.Group();
    const add = (m) => { m.position.sub(cell.center); g.add(m); return m; };
    const pc = this.playerColors[owner] ?? 0xffffff;
    const H = 0.07;
    // world size of this hex (circumradius) -- props scale with it
    const W = cell.proj(0, HEX_R, 0).distanceTo(cell.proj(0, -HEX_R, 0)) / 2;
    const wall = (color) => add(new THREE.Mesh(this.wallGeo(cell, 0.0, H, 0.95), new THREE.MeshStandardMaterial({ color, roughness: 0.8 })));
    const top = (mat, lift = H) => { const m = add(new THREE.Mesh(this.capGeo(cell, lift, 0.95), mat)); m.receiveShadow = true; return m; };
    const meshAt = (geo, mat, x, y, lift, scale = 1, rotY = 0) => {
      const { p, q } = this.frameAt(cell, x, y, lift);
      const m = new THREE.Mesh(geo, mat); m.position.copy(p); m.quaternion.copy(q); m.rotateY(rotY); m.scale.setScalar(scale * W);
      if (!mat.transparent) { m.castShadow = true; m.receiveShadow = true; }
      return add(m);
    };
    const inst = (geo, mat, list) => {
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      const M = new THREE.Matrix4(), S = new THREE.Vector3(), yAxis = new THREE.Vector3(0, 1, 0);
      list.forEach((it, i) => {
        const { p, q } = this.frameAt(cell, it.x, it.y, it.lift, it.align);
        q.multiply(new THREE.Quaternion().setFromAxisAngle(yAxis, it.rot || 0));
        S.set((it.sx ?? it.s) * W, (it.sy ?? it.s) * W, (it.sz ?? it.s) * W);
        M.compose(p.clone().sub(cell.center), q, S);
        im.setMatrixAt(i, M);
        if (it.c) im.setColorAt(i, it.c);
      });
      im.instanceMatrix.needsUpdate = true;
      im.castShadow = true; im.receiveShadow = true;
      g.add(im);
      return im;
    };
    // a ground decal round the marker spot (forest clearing / city plaza)
    const decal = (kind) => {
      const x0 = MARK.x - DEC, x1 = MARK.x + DEC, y0 = MARK.y - DEC, y1 = MARK.y + DEC * 1.9, N = 10, pos = [], uv = [], idx = [];
      for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
        const x = x0 + (x1 - x0) * i / N, y = y0 + (y1 - y0) * j / N, p = cell.proj(x, y, H + 0.0015).sub(cell.center);
        pos.push(p.x, p.y, p.z); uv.push(i / N, 1 - j / N);
        if (i < N && j < N) { const a = j * (N + 1) + i; idx.push(a, a + N + 1, a + 1, a + 1, a + N + 1, a + N + 2); }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx);
      geo.computeVertexNormals();
      if (new THREE.Vector3().fromBufferAttribute(geo.attributes.normal, 0).dot(cell.up) < 0) geo.index.array.reverse();
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, (this.decalMat ||= {})[kind] ||= new THREE.MeshStandardMaterial({ map: clearingTex(kind), transparent: true, depthWrite: false, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2 }));
      m.receiveShadow = true; m.renderOrder = 1;
      g.add(m);
    };
    // unit sizes below are fractions of the hex circumradius W
    const forest = (seed, n, inset) => {
      wall(0x203a18);
      top(new THREE.MeshStandardMaterial({ map: this.forestTex ||= groundTex('forest'), roughness: 1 }));
      decal('forest');
      const K = this.treeKit(), r = srand(seed + 1);
      const fol = (this.folMat ||= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));   // smooth-shaded foliage
      // trees keep their crowns (~0.07 across) out of the clearing and the sight line to it
      const pts = this.scatter(n, seed, inset, 0.085).filter(([x, y]) => !inClearing(x, y, 0.065) && !(y > MARK.y - 0.03 && Math.hypot(x - MARK.x, y - MARK.y) < 0.27));
      const conifers = [], broads = [], poplars = [];
      pts.forEach(([x, y], i) => {
        const kind = i % 7 === 0 ? 2 : i % 4 === 0 ? 1 : 0, s = (kind === 1 ? 1.0 : 1.05) + r() * 0.55, rot = r() * 6.28;
        const c = kind === 0 ? new THREE.Color().setHSL(0.3 + r() * 0.07, 0.42 + r() * 0.2, 0.2 + r() * 0.1)
          : kind === 1 ? new THREE.Color().setHSL(r() < 0.1 ? 0.1 + r() * 0.05 : 0.22 + r() * 0.08, 0.5 + r() * 0.2, 0.3 + r() * 0.1)
          : new THREE.Color().setHSL(0.24 + r() * 0.05, 0.45, 0.28 + r() * 0.08);
        [conifers, broads, poplars][kind].push({ x, y, lift: H, s, rot, c });
      });
      inst(K.conifer, fol, conifers);
      inst(K.broad, fol, broads);
      inst(K.poplar, fol, poplars);
      const bark = this.barkMat ||= new THREE.MeshStandardMaterial({ color: 0x6e4c2e, roughness: 0.95 });
      inst(K.trunk, bark, [...conifers, ...poplars]);
      inst(K.broadTrunk, bark, broads);
      // undergrowth: bushes and grass tufts (tufts also rim the clearing), a few rocks (not at Low quality: 3 draws + 3 shadow draws per forest)
      if (gfx.low) return;
      const under = this.scatter(34, seed + 5, 0.92, 0.05).filter(([x, y]) => !inClearing(x, y, -0.02));
      inst(K.bush, fol, under.slice(0, 18).map(([x, y]) => ({ x, y, lift: H, s: 0.8 + r() * 0.7, rot: r() * 6.28, c: new THREE.Color().setHSL(0.25 + r() * 0.08, 0.45, 0.24 + r() * 0.1) })));
      const tufts = under.slice(18).map(([x, y]) => ({ x, y }));
      for (let i = 0; i < 10; i++) { const a = i / 10 * 6.28 + r() * 0.3; tufts.push({ x: MARK.x + Math.cos(a) * MARK_CLEAR * 0.95, y: MARK.y + Math.sin(a) * MARK_CLEAR * 0.95 }); }
      inst(K.tuft, fol, tufts.map((t) => ({ ...t, lift: H, s: 0.8 + r() * 0.6, rot: r() * 6.28, c: new THREE.Color().setHSL(0.2 + r() * 0.08, 0.5, 0.38 + r() * 0.1) })));
      inst(K.rock, this.rockMat ||= new THREE.MeshStandardMaterial({ vertexColors: true, color: 0x9a948a, roughness: 0.9, flatShading: true }),
        this.scatter(6, seed + 9, 0.85, 0.12).filter(([x, y]) => !inClearing(x, y, -0.03)).map(([x, y]) => ({ x, y, lift: H, s: 0.8 + r() * 0.8, rot: r() * 6.28 })));
    };
    // Cities: one building per block of the shared CITY lattice, built as
    // merged per-material geometry (facade / glass / roof / lamps): low-rises
    // with rooftop plant, podium + tower, stepped setback towers and round
    // glass towers downtown, small parks on empty blocks, a plaza round the
    // marker. Facade textures tile by real size so floors match across tiers.
    const city = (seed, n, tall, gold, capitol = false) => {
      wall(0x262a33);
      top(new THREE.MeshStandardMaterial({ map: this.cityTex ||= cityGroundTex(), roughness: 0.9 }));
      decal('city');
      const r = srand(seed + 3);
      const CK = this.cityKit ||= {
        facade: new THREE.MeshStandardMaterial({ map: facadeTex(false), emissiveMap: facadeTex(true), emissive: 0xffd49a, emissiveIntensity: 0.55, roughness: 0.55, metalness: 0.25, vertexColors: true }),
        glass: new THREE.MeshStandardMaterial({ map: glassTex(false), emissiveMap: glassTex(true), emissive: 0xffffff, emissiveIntensity: 0.4, roughness: 0.15, metalness: 0.55, vertexColors: true }),
        roof: new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0.15, vertexColors: true }),
        lamp: new THREE.MeshBasicMaterial({ vertexColors: true }),
        marble: new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.05, vertexColors: true }),
        water: new THREE.MeshStandardMaterial({ color: 0x4d9bd6, roughness: 0.06, metalness: 0.35, emissive: 0x16466e, emissiveIntensity: 0.5 }),
      };
      const UW = 0.064, UH = 0.16;                       // one facade texture tile, in W units (8 windows x 8 floors)
      const B = { facade: [], glass: [], roof: [], lamp: [], marble: [], water: [] };
      const Bp = new THREE.Vector3(), Bq = new THREE.Quaternion(), tv = new THREE.Vector3(), tn = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
      let uo = 0, vo = 0;
      const vert = (b, p, n, uv, c) => {
        tv.set(p[0], p[1], p[2]).multiplyScalar(W).applyQuaternion(Bq).add(Bp);
        tn.set(n[0], n[1], n[2]).applyQuaternion(Bq);
        b.push(tv.x, tv.y, tv.z, tn.x, tn.y, tn.z, uv[0], uv[1], c.r, c.g, c.b);
      };
      const tri = (b, P, N, U, c) => {           // winding fixed to face the given normal
        e1.set(P[1][0] - P[0][0], P[1][1] - P[0][1], P[1][2] - P[0][2]); e2.set(P[2][0] - P[0][0], P[2][1] - P[0][1], P[2][2] - P[0][2]);
        const n0 = N[0], f = e1.cross(e2).dot(tv.set(n0[0] + N[1][0] + N[2][0], n0[1] + N[1][1] + N[2][1], n0[2] + N[1][2] + N[2][2])) >= 0;
        const o = f ? [0, 1, 2] : [0, 2, 1];
        for (const i of o) vert(b, P[i], N[i], U[i], c);
      };
      const quad = (b, P, n, U, c) => { tri(b, [P[0], P[1], P[2]], [n, n, n], [U[0], U[1], U[2]], c); tri(b, [P[0], P[2], P[3]], [n, n, n], [U[0], U[2], U[3]], c); };
      // a box: walls in `side` (tiled uvs), roof in `topB`
      const box = (side, topB, cx, cz, y0, w, h, d, c, rc = c) => {
        const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2, y1 = y0 + h, v0 = y0 / UH + vo, v1 = y1 / UH + vo;
        const faces = [[[x1, z1], [x1, z0], [1, 0, 0], d], [[x0, z0], [x0, z1], [-1, 0, 0], d], [[x0, z1], [x1, z1], [0, 0, 1], w], [[x1, z0], [x0, z0], [0, 0, -1], w]];
        for (const [[ax, az], [bx, bz], n, L] of faces) quad(B[side], [[ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az]], n, [[uo, v0], [uo + L / UW, v0], [uo + L / UW, v1], [uo, v1]], c);
        if (topB) quad(B[topB], [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], [0, 1, 0], [[0, 0], [0, 0], [0, 0], [0, 0]], rc);
      };
      const cyl = (side, topB, cx, cz, y0, rad, h, seg, c, rc = c) => {
        const y1 = y0 + h, v0 = y0 / UH + vo, v1 = y1 / UH + vo, L = 2 * Math.PI * rad / seg / UW;
        for (let i = 0; i < seg; i++) {
          const a0 = i / seg * 6.2832, a1 = (i + 1) / seg * 6.2832, n0 = [Math.cos(a0), 0, Math.sin(a0)], n1 = [Math.cos(a1), 0, Math.sin(a1)];
          const p00 = [cx + n0[0] * rad, y0, cz + n0[2] * rad], p10 = [cx + n1[0] * rad, y0, cz + n1[2] * rad], p11 = [cx + n1[0] * rad, y1, cz + n1[2] * rad], p01 = [cx + n0[0] * rad, y1, cz + n0[2] * rad];
          tri(B[side], [p00, p10, p11], [n0, n1, n1], [[uo + i * L, v0], [uo + (i + 1) * L, v0], [uo + (i + 1) * L, v1]], c);
          tri(B[side], [p00, p11, p01], [n0, n1, n0], [[uo + i * L, v0], [uo + (i + 1) * L, v1], [uo + i * L, v1]], c);
          if (topB) tri(B[topB], [[cx, y1, cz], p01, p11], [[0, 1, 0], [0, 1, 0], [0, 1, 0]], [[0, 0], [0, 0], [0, 0]], rc);
        }
      };
      // a dome (hemisphere scaled by hs in height) of `rings` latitude bands
      const dome = (buf, cx, cz, y0, rad, hs, seg, rings, c) => {
        const P = (i, j) => { const th = j / rings * Math.PI / 2, a = i / seg * 6.2832; return [[cx + Math.cos(a) * Math.cos(th) * rad, y0 + Math.sin(th) * rad * hs, cz + Math.sin(a) * Math.cos(th) * rad], [Math.cos(a) * Math.cos(th) / 1, Math.sin(th) / hs, Math.sin(a) * Math.cos(th)]]; };
        for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) {
          const [a0, n0] = P(i, j), [a1, n1] = P(i + 1, j), [b1, m1] = P(i + 1, j + 1), [b0, m0] = P(i, j + 1);
          tri(B[buf], [a0, a1, b1], [n0, n1, m1], [[0, 0], [0, 0], [0, 0]], c);
          if (j < rings - 1) tri(B[buf], [a0, b1, b0], [n0, m1, m0], [[0, 0], [0, 0], [0, 0]], c);
        }
      };
      // a gable (triangular prism) along x: w wide, h tall, d deep, facing +z
      const gable = (buf, cx, cz, y0, w, h, d, c) => {
        const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2, y1 = y0 + h, sl = Math.hypot(w / 2, h);
        tri(B[buf], [[x0, y0, z1], [x1, y0, z1], [cx, y1, z1]], [[0, 0, 1], [0, 0, 1], [0, 0, 1]], [[0, 0], [0, 0], [0, 0]], c);
        tri(B[buf], [[x1, y0, z0], [x0, y0, z0], [cx, y1, z0]], [[0, 0, -1], [0, 0, -1], [0, 0, -1]], [[0, 0], [0, 0], [0, 0]], c);
        const nl = [-h / sl, (w / 2) / sl, 0], nr = [h / sl, (w / 2) / sl, 0];
        quad(B[buf], [[x0, y0, z0], [x0, y0, z1], [cx, y1, z1], [cx, y1, z0]], nl, [[0, 0], [0, 0], [0, 0], [0, 0]], c);
        quad(B[buf], [[x1, y0, z1], [x1, y0, z0], [cx, y1, z0], [cx, y1, z1]], nr, [[0, 0], [0, 0], [0, 0], [0, 0]], c);
      };
      const C = (h, s2, l) => new THREE.Color().setHSL(h, s2, l);
      const facadeTint = () => gold ? C(0.12 + r() * 0.03, 0.55, 0.62 + r() * 0.1) : [C(0.6, 0.12, 0.86), C(0.1, 0.18, 0.84), C(0.58, 0.2, 0.74), C(0.08, 0.1, 0.9), C(0, 0, 0.8)][Math.floor(r() * 5)];
      const glassTint = () => gold ? C(0.11, 0.6, 0.7) : [C(0.58, 0.3, 0.82), C(0.5, 0.25, 0.8), C(0.62, 0.35, 0.78)][Math.floor(r() * 3)];
      const roofC = () => gold ? C(0.11, 0.45, 0.42 + r() * 0.12) : C(0.6, 0.06, 0.45 + r() * 0.15);
      const dark = C(0.6, 0.1, 0.22), metal = C(0.58, 0.08, 0.62), green = C(0.28, 0.45, 0.3), red = new THREE.Color(1, 0.2, 0.15), yellow = C(0.13, 0.9, 0.55), warm = new THREE.Color(1, 0.85, 0.55);
      // rooftop plant on a flat roof at height y over a w x d footprint
      const roofStuff = (y, w, d, big) => {
        const k = 1 + Math.floor(r() * (big ? 3 : 2));
        for (let i = 0; i < k; i++) { const bw2 = 0.018 + r() * 0.02, bd2 = 0.018 + r() * 0.02; box('roof', 'roof', (r() - 0.5) * (w - bw2) * 0.8, (r() - 0.5) * (d - bd2) * 0.8, y, bw2, 0.01 + r() * 0.012, bd2, metal); }
        if (r() < 0.3) cyl('roof', 'roof', (r() - 0.5) * w * 0.5, (r() - 0.5) * d * 0.5, y, 0.011, 0.022, 8, C(0.07, 0.3, 0.45));                  // water tank
        if (!big && r() < 0.3) box('roof', 'roof', 0, 0, y + 0.001, w * 0.7, 0.004, d * 0.7, green, green);                                           // roof garden
      };
      const spire = (y, len) => { cyl('roof', 'roof', 0, 0, y, 0.0045, len, 6, metal); box('lamp', 'lamp', 0, 0, y + len, 0.009, 0.009, 0.009, red); };
      const helipad = (y) => { cyl('roof', 'roof', 0, 0, y, 0.034, 0.004, 16, yellow); cyl('roof', 'roof', 0, 0, y + 0.004, 0.028, 0.002, 16, dark);
        for (let i = 0; i < 4; i++) { const a = i / 4 * 6.28 + 0.78; box('lamp', 'lamp', Math.cos(a) * 0.031, Math.sin(a) * 0.031, y + 0.004, 0.005, 0.004, 0.005, warm); } };
      // park on an empty block: lawn, a few trees (instanced after)
      const parkTrees = [];
      const lim = HEX_R * 0.8, bw = (CITY.sx - CITY.street) / HEX_R, bd = (CITY.sy - CITY.street) / HEX_R;   // block size in W units
      let tallest = { h: 0 };
      for (let gx = -4; gx <= 4; gx++) for (let gy = -5; gy <= 5; gy++) {
        const x = gx * CITY.sx, y = gy * CITY.sy;
        const ax = Math.abs(x), ay = Math.abs(y);
        if (ax > Math.sqrt(3) / 2 * lim || ay > lim - ax / Math.sqrt(3)) continue;
        const dm = Math.hypot(x - MARK.x, y - MARK.y);
        if (inClearing(x, y, 0.005)) continue;                     // the marker's plaza
        if (capitol && Math.abs(gx) <= 1 && (gy === -1 || gy === 0)) continue;     // the capitol's own grounds
        if (capitol && gx === 0 && gy >= 1) continue;                                // the mall
        if (capitol && Math.abs(gx) === 1 && gy >= 1 && gy <= 2) {                   // lawns flanking the mall
          const { p: lp, q: lq } = this.frameAt(cell, x, y, H, true);
          Bp.copy(lp).sub(cell.center); Bq.copy(lq);
          box('roof', 'roof', 0, 0, 0.001, bw * 1.02, 0.004, bd * 1.02, C(0.29, 0.42, 0.34));
          for (let i = 0; i < 2; i++) parkTrees.push({ x: x - gx * CITY.sx * 0.32, y: y + (i - 0.5) * CITY.sy * 0.55, lift: H, s: 0.42, rot: r() * 6.28, c: C(0.29, 0.5, 0.3) });
          continue;
        }
        const { p, q } = this.frameAt(cell, x, y, H, true);
        Bp.copy(p).sub(cell.center); Bq.copy(q);
        uo = r() * 4; vo = r() * 4;
        const d = Math.hypot(x, y) / HEX_R;
        const core = Math.max(0, 1 - d / 0.55);                  // downtown in the middle
        const nearMark = dm < 0.2;
        if (r() < 0.14 && !nearMark) {                              // a small park
          box('roof', 'roof', 0, 0, 0.001, bw * 0.96, 0.005, bd * 0.96, C(0.28, 0.4, 0.32 + r() * 0.06));
          for (let i = 0; i < 3; i++) parkTrees.push({ x: x + (r() - 0.5) * CITY.sx * 0.6, y: y + (r() - 0.5) * CITY.sy * 0.6, lift: H, s: 0.45 + r() * 0.2, rot: r() * 6.28, c: C(0.27 + r() * 0.06, 0.5, 0.28 + r() * 0.08) });
          continue;
        }
        const tower = !nearMark && r() < 0.15 + core * 0.6 + (capitol ? 0.2 : 0) && !(capitol && gy > 0 && Math.abs(gx) <= 2);   // the capital keeps the view down its mall open
        let hgt = (tower ? 0.22 + core * 0.3 + r() * 0.15 : 0.07 + r() * 0.12) * tall;
        if (nearMark) hgt = Math.min(hgt, y > MARK.y - 0.04 ? 0.055 : 0.09);   // low-rise round the plaza, lowest between it and the viewer
        const fw = bw * (0.9 + r() * 0.06), fd = bd * (0.9 + r() * 0.06);
        const fc = facadeTint(), rc = roofC();
        if (!tower) {                                             // low / mid rise
          if (r() < 0.35 && hgt > 0.1) {                          // L-shaped: two wings
            box('facade', 'roof', -fw * 0.2, 0, 0, fw * 0.6, hgt, fd, fc, rc);
            box('facade', 'roof', fw * 0.3, fd * 0.2, 0, fw * 0.4, hgt * 0.7, fd * 0.6, fc, rc);
          } else box('facade', 'roof', 0, 0, 0, fw, hgt, fd, fc, rc);
          roofStuff(hgt, fw * 0.6, fd * 0.8, false);
        } else {
          const style = r(), glassy = r() < 0.35;
          const pod = 0.035 + r() * 0.03;
          box('facade', 'roof', 0, 0, 0, fw, pod, fd, fc, rc);                               // podium
          const sideB = glassy ? 'glass' : 'facade', tc = glassy ? glassTint() : fc;
          let topY;
          if (style < 0.3 && core > 0.25) {                                                   // round glass tower
            const rad = Math.min(fw, fd) * 0.36;
            cyl('glass', 'roof', 0, 0, pod, rad, hgt - pod, 18, glassTint(), rc);
            cyl('roof', 'roof', 0, 0, hgt, rad * 1.06, 0.008, 18, metal);
            cyl('roof', 'roof', 0, 0, hgt + 0.008, rad * 0.55, 0.02, 12, rc);
            topY = hgt + 0.028;
            spire(topY, 0.04 + r() * 0.05 * tall);
            topY += 0.05;
          } else if (style < 0.65) {                                                          // stepped setbacks
            const t1 = pod + (hgt - pod) * 0.55, t2 = pod + (hgt - pod) * 0.82;
            box(sideB, 'roof', 0, 0, pod, fw * 0.78, t1 - pod, fd * 0.78, tc, rc);
            box(sideB, 'roof', 0, 0, t1, fw * 0.62, t2 - t1, fd * 0.62, tc, rc);
            box(sideB, 'roof', 0, 0, t2, fw * 0.46, hgt - t2, fd * 0.46, tc, rc);
            box('roof', 'roof', 0, 0, hgt, fw * 0.3, 0.014, fd * 0.3, dark);                // crown
            roofStuff(t1, fw * 0.5, fd * 0.3, true);
            topY = hgt + 0.014;
            if (r() < 0.6) { spire(topY, 0.03 + r() * 0.05 * tall); topY += 0.04; }
          } else {                                                                              // podium + slab tower
            const tw = fw * (0.58 + r() * 0.12), td = fd * (0.58 + r() * 0.12), ox = (r() - 0.5) * (fw - tw) * 0.8;
            box(sideB, 'roof', ox, 0, pod, tw, hgt - pod, td, tc, rc);
            box('roof', 'roof', ox, 0, hgt, tw * 1.02, 0.006, td * 1.02, dark);             // parapet cap
            roofStuff(pod, fw * 0.4, fd * 0.5, false);
            topY = hgt + 0.006;
            if (r() < 0.35) helipad(topY); else roofStuff(topY, tw * 0.8, td * 0.8, true);
          }
          if (topY > tallest.h) tallest = { h: topY, x, y };
        }
      }
      if (capitol) {
        // the capitol: white marble hall with a colonnaded portico and wings, a
        // drum ringed with columns under a big dome and lantern, facing a mall
        // with a reflecting pool, flags in the owner's colour and an obelisk
        const cy0 = -0.5 * CITY.sy;
        const { p: cp, q: cq } = this.frameAt(cell, 0, cy0, H, true);
        Bp.copy(cp).sub(cell.center); Bq.copy(cq);
        const marble = new THREE.Color(0.93, 0.92, 0.88), shade = new THREE.Color(0.8, 0.79, 0.75), stone = new THREE.Color(0.72, 0.7, 0.64), gilt = new THREE.Color(0.95, 0.76, 0.3), flagC = new THREE.Color(pc);
        const S0 = 0.028;                                                                   // plinth height
        box('marble', 'marble', 0, 0.01, 0, 0.66, 0.012, 0.44, stone);                     // grounds terrace
        box('marble', 'marble', 0, 0, 0.012, 0.6, S0 - 0.012, 0.34, shade);                 // plinth
        for (let i = 0; i < 3; i++) box('marble', 'marble', 0, 0.17 + 0.012 * (i + 1), 0, 0.2 - i * 0.012, S0 - 0.009 * (i + 1), 0.012, shade);   // front steps
        box('marble', 'marble', 0, -0.02, S0, 0.24, 0.1, 0.2, marble);                      // central hall
        box('marble', 'marble', 0, -0.02, S0 + 0.1, 0.25, 0.01, 0.21, shade);                // cornice
        for (const sx of [-1, 1]) {                                                          // wings
          box('marble', 'marble', sx * 0.2, -0.01, S0, 0.17, 0.075, 0.15, marble);
          box('marble', 'marble', sx * 0.2, -0.01, S0 + 0.075, 0.18, 0.008, 0.16, shade);
          for (let k = 0; k < 6; k++) cyl('marble', null, sx * 0.2 - 0.07 + k * 0.028, 0.068, S0, 0.0055, 0.075, 8, marble);   // wing colonnade
          box('lamp', null, sx * 0.2, 0.062, S0 + 0.01, 0.15, 0.05, 0.002, new THREE.Color(1, 0.86, 0.6));   // lit hall behind the columns
          gable('marble', sx * 0.2, 0.06, S0 + 0.083, 0.17, 0.022, 0.02, marble);
        }
        // portico: 8 columns, entablature and pediment
        for (let k = 0; k < 8; k++) cyl('marble', null, -0.1 + k * 0.1 / 3.5, 0.11, S0, 0.0075, 0.1, 10, marble);
        box('lamp', null, 0, 0.082, S0 + 0.01, 0.2, 0.08, 0.002, new THREE.Color(1, 0.86, 0.6));
        box('marble', 'marble', 0, 0.1, S0 + 0.1, 0.23, 0.014, 0.05, shade);
        gable('marble', 0, 0.1, S0 + 0.114, 0.23, 0.04, 0.05, marble);
        // drum with its peristyle, the dome, lantern and statue
        const dy = S0 + 0.11;
        cyl('marble', 'marble', 0, -0.03, dy, 0.085, 0.022, 28, shade);
        cyl('marble', null, 0, -0.03, dy + 0.022, 0.066, 0.055, 28, marble);
        for (let k = 0; k < 18; k++) { const a = k / 18 * 6.2832; cyl('marble', null, Math.cos(a) * 0.078, -0.03 + Math.sin(a) * 0.078, dy + 0.022, 0.004, 0.05, 6, marble); }
        cyl('marble', 'marble', 0, -0.03, dy + 0.072, 0.084, 0.008, 28, shade);
        cyl('marble', null, 0, -0.03, dy + 0.08, 0.07, 0.02, 28, marble);
        dome('marble', 0, -0.03, dy + 0.1, 0.07, 1.15, 28, 9, marble);
        const ly = dy + 0.1 + 0.07 * 1.15;
        cyl('marble', 'marble', 0, -0.03, ly - 0.004, 0.016, 0.03, 10, marble);
        dome('marble', 0, -0.03, ly + 0.026, 0.017, 1, 10, 4, marble);
        cyl('roof', 'roof', 0, -0.03, ly + 0.04, 0.004, 0.022, 6, gilt);
        box('lamp', 'lamp', 0, -0.03, ly + 0.062, 0.008, 0.008, 0.008, gilt);
        // flags: a pair either side of the steps and a line down the mall
        const flag = (fx, fz, hh) => { cyl('roof', 'roof', fx, fz, 0, 0.0028, hh, 6, C(0.6, 0.05, 0.85)); box('lamp', 'lamp', fx + 0.018, fz, hh - 0.022, 0.034, 0.02, 0.003, flagC); };
        flag(-0.14, 0.2, 0.13); flag(0.14, 0.2, 0.13);
        // the mall: lawn, a long reflecting pool with a paved rim, flags and an obelisk
        const mz0 = 0.23, mz1 = (HEX_R * 0.78 - cy0) / HEX_R;
        box('roof', 'roof', 0, (mz0 + mz1) / 2, 0.001, 0.19, 0.004, mz1 - mz0, C(0.29, 0.45, 0.36));
        box('marble', 'marble', 0, (mz0 + mz1) / 2 - 0.02, 0.001, 0.085, 0.007, mz1 - mz0 - 0.1, stone);
        box('water', 'water', 0, (mz0 + mz1) / 2 - 0.02, 0.002, 0.065, 0.0066, mz1 - mz0 - 0.12, stone);
        for (let k = 0; k < 4; k++) { const fz = mz0 + 0.04 + k * (mz1 - mz0 - 0.1) / 3; flag(-0.07, fz, 0.07); flag(0.07, fz, 0.07); }
        box('marble', 'marble', 0, mz1 - 0.04, 0.001, 0.03, 0.01, 0.03, shade);
        cyl('marble', null, 0, mz1 - 0.04, 0.011, 0.009, 0.1, 4, marble);                          // obelisk (a square taper)
        box('lamp', 'lamp', 0, mz1 - 0.04, 0.111, 0.004, 0.004, 0.004, red);
        if (ly + 0.07 > tallest.h * 0.7) tallest = tallest.h ? tallest : { h: ly + 0.07, x: 0, y: cy0 };
      }
      for (const [name, arr] of Object.entries(B)) {
        if (!arr.length) continue;
        const n = arr.length / 11, P = new Float32Array(n * 3), N = new Float32Array(n * 3), U = new Float32Array(n * 2), Cc = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) { const o = i * 11; P.set(arr.slice(o, o + 3), i * 3); N.set(arr.slice(o + 3, o + 6), i * 3); U.set(arr.slice(o + 6, o + 8), i * 2); Cc.set(arr.slice(o + 8, o + 11), i * 3); }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
        geo.setAttribute('uv', new THREE.BufferAttribute(U, 2)); geo.setAttribute('color', new THREE.BufferAttribute(Cc, 3));
        const m = new THREE.Mesh(geo, CK[name]);
        if (name !== 'lamp') { m.castShadow = true; m.receiveShadow = true; }
        g.add(m);
      }
      // trees: in the parks and round the marker's plaza
      for (let i = 0; i < 7; i++) { const a = i / 7 * 6.28 + 0.3; parkTrees.push({ x: MARK.x + Math.cos(a) * MARK_CLEAR * 0.98, y: MARK.y + Math.sin(a) * MARK_CLEAR * 0.98 * 0.9, lift: H, s: 0.38 + r() * 0.12, rot: r() * 6.28, c: C(0.27 + r() * 0.06, 0.5, 0.3 + r() * 0.08) }); }
      const TK = this.treeKit();
      inst(TK.broadLo, this.folMat ||= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }), parkTrees);
      inst(TK.trunk, this.barkMat ||= new THREE.MeshStandardMaterial({ color: 0x6e4c2e, roughness: 0.95 }), parkTrees);
      // aircraft beacon on the tallest building, and the city dome
      const beacon = meshAt(new THREE.SphereGeometry(0.014, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff4040 }), tallest.x ?? 0, tallest.y ?? 0, H + tallest.h * W + 0.01 * W);
      beacon.userData.blink = true; this.animated.push(beacon);
      meshAt(new THREE.SphereGeometry(0.88, 36, 14, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, Math.min(1.05, 0.85 * tall), 1),
        new THREE.MeshPhysicalMaterial({ color: 0xd8efff, transparent: true, opacity: 0.1, roughness: 0.02, metalness: 0.0, clearcoat: 1, depthWrite: false }), 0, 0, H - 0.004);
    };
    const special = (icon) => {
      wall(0x6b4a33);
      const tex = this.lazyTex('sp:' + icon, 409, 472, (c, w, h, [base, ic]) => {
        if (base) c.drawImage(base, 0, 0, w, h);
        if (ic) c.drawImage(ic, w / 2 - 110, h / 2 - 110, 220, 220);
      }, ['assets/tiles/special.png', `assets/tiles/${icon}.png`]);
      top(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }));
    };
    // the owner's marker: a textured cube (white skin x owner colour, so the colour stays dominant) at MARK
    const cube = (x = MARK.x, y = MARK.y) => {
      const tex = this.markerSkin ||= markerTex();
      const mat = (this.markerMats ||= {})[pc] ||= new THREE.MeshStandardMaterial({ color: pc, map: tex, emissive: pc, emissiveMap: tex, emissiveIntensity: 0.5, roughness: 0.35, metalness: 0.05 });
      return meshAt(this.markerGeo ||= new THREE.BoxGeometry(0.16, 0.16, 0.16).translate(0, 0.08, 0), mat, x, y, g.userData.lift ?? H);   // (lift: a tile with no plate, TileArt's early greenery)
    };

    // a city on the Space Haven: the station gets inhabited (see stationModules), not a Mars city
    if (cell.station) { this.stationModules(g, cell, pc); cube(0.02, 0.37); }
    else if (cell.haven) cube(0.24, 0.34);           // Ganymede: the moon itself gets terraformed (makeGanymedeHaven)
    else if (this.tileArt.build({ cell, g, add, pc, H, W, space, type, owner, wall, top, meshAt, inst, decal, cube, city, forest, special })) { /* board/tiles/ */ }
    else switch (type) {
      case TILE.OCEAN:
        // the planet dips into a rounded basin here (basinAt); the single
        // board-wide water shell (this.waterShell) fills it
        break;
      case TILE.GREENERY: forest(space * 7 + 1, 34, 0.9); cube(); break;
      case TILE.CITY: city(space * 7 + 2, 24, 1, false); cube(); break;
      case TILE.CAPITAL: city(space * 7 + 3, 28, 1.45, false, true); cube(); break;
      case TILE.COMMERCIAL: city(space * 7 + 4, 18, 1.1, true); this.floatIcon(g, cell, 'commerical_district', W); cube(); break;
      case TILE.ECO: wall(0x5e5a2c); top(new THREE.MeshStandardMaterial({ map: this.ecoTex ||= ecoGroundTex(), roughness: 0.95 })); this.ecoPark(g, cell, H, W); this.floatIcon(g, cell, 'ecological_zone', W); cube(); break;
      default:
        special(SPECIAL_ICON[type] || 'mining_area');
        this.specialProp(type, meshAt, H, W);
        cube();
    }
    if (!cell.colony && type !== TILE.OCEAN) this.ownerRim(g, cell, pc, g.userData.lift ?? H);
    g.position.copy(cell.center);
    g.userData.space = space;
    return g;
  }

  floatIcon(g, cell, name, W) {
    const t = this.lazyTex('ic:' + name, 152, 152, (c, w, h, [base, im]) => { if (base) c.drawImage(base, -20, -18, 192, 190); if (im) c.drawImage(im, 16, 16, 120, 120); }, ['assets/tiles/special.png', `assets/tiles/${name}.png`]);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
    sp.scale.set(W * 0.7, W * 0.7, 1);
    sp.position.copy(cell.proj(0, 0, W * 1.2)).sub(cell.center);
    g.add(sp);
  }

  specialProp(type, meshAt, H) {
    if (type === TILE.NUCLEAR) {
      const steam = meshAt(new THREE.SphereGeometry(0.16, 14, 10), new THREE.MeshBasicMaterial({ color: 0xf4fff0, transparent: true, opacity: 0.3, depthWrite: false }), 0, 0, H + 0.12);
      steam.userData.puff = true; this.animated.push(steam);
    } else if (type === TILE.LAVA) {
      const glow = meshAt(this.capGlowGeo ||= new THREE.CircleGeometry(0.62, 6).rotateX(-Math.PI / 2).rotateY(Math.PI / 6), new THREE.MeshBasicMaterial({ color: 0xff5a14, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }), 0, 0, H + 0.004);
      glow.userData.pulse = true; this.animated.push(glow);
    }
  }

  // Ecological Zone props: every opaque prop (animals, trees, fences, gate,
  // tower, dome frame) is baked into ONE vertex-coloured mesh; only the pond
  // water and the dome glass get their own materials.
  ecoPark(g, cell, H, W) {
    const K = this.ecoKit(), V = ECO_V;
    const pos = [], nrm = [], col = [];
    const M = new THREE.Matrix4(), S = new THREE.Vector3();
    // rotation about the local up so the template's +x points along board direction (dx, dy)
    const face = (x, y, dx, dy) => {
      const { p, q } = this.frameAt(cell, x, y, H);
      const d = cell.proj(x + dx * 0.01, y + dy * 0.01, H).sub(p).applyQuaternion(q.invert());
      return Math.atan2(-d.z, d.x);
    };
    const put = (tpl, x, y, o = {}) => {
      const { p, q } = this.frameAt(cell, x, y, o.lift ?? H);
      q.multiply(new THREE.Quaternion().setFromAxisAngle(ECO_Y, o.rot ?? 0));
      S.set((o.sx ?? o.s ?? 1) * W, (o.sy ?? o.s ?? 1) * W, (o.sz ?? o.s ?? 1) * W);
      M.compose(p.sub(cell.center), q, S);
      const t = tpl.clone().applyMatrix4(M), P = t.attributes.position.array, N = t.attributes.normal.array, C = tpl.attributes.color.array, k = o.tint ?? 1;
      for (let i = 0; i < P.length; i++) { pos.push(P[i]); nrm.push(N[i]); col.push(C[i] * k); }
    };
    const heading = (x, y, a) => face(x, y, Math.cos(a), Math.sin(a));

    // ---- fences: perimeter (open at the front gate) + both sides of each path
    const fence = (x0, y0, x1, y1) => {
      const L = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.round(L / 0.055));
      const rot = face((x0 + x1) / 2, (y0 + y1) / 2, x1 - x0, y1 - y0);
      for (let i = 0; i <= n; i++) put(K.post, x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, { rot });
      const len = cell.proj(x0, y0, H).distanceTo(cell.proj(x1, y1, H)) / W;
      for (const hh of [0.018, 0.038]) put(K.rail, (x0 + x1) / 2, (y0 + y1) / 2, { rot, sx: len, sy: 1, sz: 1, lift: H + hh * W });
    };
    const pf = 0.9, P = V.map(([x, y]) => [x * pf, y * pf]), gy = 0.43, gw = 0.06;
    for (let k = 0; k < 6; k++) {
      const [a, b] = [P[k], P[(k + 1) % 6]];
      if (k === 2 || k === 3) {   // edges into the front vertex stop at the gate
        const [s, e] = k === 2 ? [a, b] : [b, a], f = (gy - s[1]) / (e[1] - s[1]), xm = s[0] + (e[0] - s[0]) * f;
        fence(s[0], s[1], xm, gy); fence(xm, gy, Math.sign(xm) * gw, gy);
      } else fence(a[0], a[1], b[0], b[1]);
    }
    const off = ECO_PATH / 2 + 0.024;
    for (const s of ECO_SPOKES) {
      const [vx, vy] = V[s], L = Math.hypot(vx, vy), ux = vx / L, uy = vy / L, t0 = ECO_PLAZA + 0.035, t1 = s === 3 ? gy - 0.03 : 0.33;
      for (const sg of [-1, 1]) fence(ux * t0 - uy * off * sg, uy * t0 + ux * off * sg, ux * t1 - uy * off * sg, uy * t1 + ux * off * sg);
    }

    // ---- landmarks: entrance gate, watchtower, visitor biodome
    put(K.gate, 0, gy, { rot: face(0, gy, 0, 1), s: 1.2 });
    const [tx, ty] = [V[1][0] * ECO_FEAT, V[1][1] * ECO_FEAT], [dx, dy] = [V[5][0] * ECO_FEAT, V[5][1] * ECO_FEAT];
    put(K.tower, tx, ty, { rot: face(tx, ty, 1, 0), s: 1.3 });
    put(K.domeFrame, dx, dy, { rot: face(dx, dy, -1, 0.5), s: ECO_DOME_S });

    // ---- savanna (back): giraffes browsing an acacia, an elephant
    put(K.acacia, -0.16, -0.31, { s: 2.0, rot: 0.4 });
    put(K.acacia, 0.0, -0.44, { s: 1.35, rot: 2.1 });
    put(K.giraffe, -0.05, -0.21, { rot: heading(-0.05, -0.21, 3.75), s: 1.65 });
    put(K.giraffe, 0.08, -0.35, { rot: heading(0.08, -0.35, 0.2), s: 1.5, tint: 0.95 });
    put(K.elephant, 0.17, -0.22, { rot: heading(0.17, -0.22, 3.7), s: 1.8 });
    put(K.rock, -0.02, -0.16, { s: 1.6, rot: 1 }); put(K.rock, 0.02, -0.2, { s: 1, rot: 2 });
    // ---- wetland (left): flamingos in the pond, reeds, a tree
    put(K.flamingo, -0.28, 0.12, { rot: heading(-0.28, 0.12, 0.3), s: 1.8 });
    put(K.flamingo, -0.19, 0.18, { rot: heading(-0.19, 0.18, 2.8), s: 1.8 });
    put(K.flamingo, -0.3, 0.2, { rot: heading(-0.3, 0.2, -0.6), s: 1.7, tint: 0.92 });
    put(K.reeds, -0.375, 0.1, { rot: 0.3, s: 1.4 }); put(K.reeds, -0.33, 0.26, { rot: 2, s: 1.3 }); put(K.reeds, -0.11, 0.235, { rot: 4, s: 1.1 });
    put(K.tree, -0.33, -0.04, { rot: 1.2, s: 1.6 });
    put(K.bush, -0.15, 0.37, { rot: 0.5, s: 1.5 });
    put(K.rock, -0.1, 0.09, { rot: 2.4, s: 1.3 }); put(K.rock, -0.39, 0.18, { s: 1.1, rot: 0.2 });
    // ---- meadow (right): antelope herd, bushes, a tree
    put(K.zebra, 0.15, 0.04, { rot: heading(0.15, 0.04, 0.4), s: 1.8 });
    put(K.zebra, 0.27, -0.03, { rot: heading(0.27, -0.03, 2.4), s: 1.75 });
    put(K.antelope, 0.12, 0.25, { rot: heading(0.12, 0.25, -0.3), s: 1.8 });
    put(K.grazer, 0.22, 0.14, { rot: heading(0.22, 0.14, 3.6), s: 1.8, tint: 0.95 });
    put(K.tree, 0.38, 0.0, { rot: 0.1, s: 1.4 });
    put(K.bush, 0.11, 0.39, { rot: 1.5, s: 1.4 }); put(K.bush, 0.3, 0.3, { rot: 3, s: 1.1 });

    // ---- visitors strolling the paths (the plaza itself stays clear for the owner's cube)
    [[1, 0.19, 0.012], [1, 0.28, -0.014], [3, 0.2, 0.013], [3, 0.3, -0.012], [3, 0.36, 0.01], [5, 0.2, -0.013], [5, 0.27, 0.012]].forEach(([sk, t, o], i) => {
      const [vx, vy] = V[sk], L = Math.hypot(vx, vy), ux = vx / L, uy = vy / L, x = ux * t - uy * o, y = uy * t + ux * o;
      put(K.people[i % K.people.length], x, y, { s: 1.35, rot: heading(x, y, Math.atan2(uy, ux) + (i % 2 ? Math.PI : 0)) });
    });

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const props = new THREE.Mesh(geo, this.ecoMat ||= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true }));
    props.castShadow = true; props.receiveShadow = true;
    g.add(props);

    // ---- pond water: the texture's pond outline, draped on the sphere
    const pts = ecoPondPts(0.006), wp = [], shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    const sg = new THREE.ShapeGeometry(shape);
    const sp = sg.attributes.position;
    for (let i = 0; i < sp.count; i++) { const p = cell.proj(sp.getX(i), sp.getY(i), H + 0.004).sub(cell.center); wp.push(p.x, p.y, p.z); }
    const wg = new THREE.BufferGeometry();
    // the board's y runs toward the viewer, so the shape's winding may face down: flip it
    const ix = [...sg.index.array], A = new THREE.Vector3(), Bv = new THREE.Vector3(), Cv = new THREE.Vector3();
    A.fromArray(wp, ix[0] * 3); Bv.fromArray(wp, ix[1] * 3); Cv.fromArray(wp, ix[2] * 3);
    if (Bv.sub(A).cross(Cv.sub(A)).dot(cell.up) < 0) for (let i = 0; i < ix.length; i += 3) [ix[i + 1], ix[i + 2]] = [ix[i + 2], ix[i + 1]];
    wg.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3)); wg.setIndex(ix);
    wg.setAttribute('normal', new THREE.Float32BufferAttribute(wp.map((_, i) => [cell.up.x, cell.up.y, cell.up.z][i % 3]), 3));
    const water = new THREE.Mesh(wg, this.ecoWater ||= new THREE.MeshStandardMaterial({ color: 0x3aa4e6, roughness: 0.12, metalness: 0, emissive: 0x1a5f96, emissiveIntensity: 0.45 }));
    water.receiveShadow = true;
    g.add(water);

    // ---- a few birds wheeling over the pond (the pivot turns in animate())
    const fl = this.frameAt(cell, ECO_POND.x + 0.03, ECO_POND.y - 0.05, H + 0.5 * W);
    const flock = new THREE.Mesh(K.birds, this.ecoMat);
    flock.castShadow = true;
    flock.position.copy(fl.p).sub(cell.center); flock.quaternion.copy(fl.q); flock.scale.setScalar(W);
    flock.userData.circle = 0.35; flock.userData.q0 = fl.q.clone();
    this.animated.push(flock);
    g.add(flock);

    // ---- biodome glass over the visitor centre
    const { p: dp, q: dq } = this.frameAt(cell, dx, dy, H);
    const glass = new THREE.Mesh(this.ecoGlassGeo ||= new THREE.SphereGeometry(0.094, 18, 9, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.018, 0),
      this.ecoGlass ||= new THREE.MeshPhysicalMaterial({ color: 0xd8f4ff, transparent: true, opacity: 0.28, roughness: 0.05, clearcoat: 1, depthWrite: false }));
    glass.position.copy(dp).sub(cell.center); glass.quaternion.copy(dq); glass.scale.setScalar(W * ECO_DOME_S);
    g.add(glass);
  }

  // low-poly templates (units of the hex circumradius, facing +x, y up),
  // each merged into one non-indexed geometry with vertex colours
  ecoKit() {
    if (this._ecoKit) return this._ecoKit;
    const B = (x, y, z) => new THREE.BoxGeometry(x, y, z), Cy = (a, b, h, n = 6) => new THREE.CylinderGeometry(a, b, h, n), Co = (r, h, n = 5) => new THREE.ConeGeometry(r, h, n), Ic = (r) => new THREE.IcosahedronGeometry(r, 0);
    const Q = new THREE.Quaternion(), E = new THREE.Euler(), M = new THREE.Matrix4(), c = new THREE.Color();
    const kit = (parts) => {
      const pos = [], nrm = [], col = [];
      for (const [geo, color, t = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]] of parts) {
        const gg = (geo.index ? geo.toNonIndexed() : geo).applyMatrix4(M.compose(new THREE.Vector3(...t), Q.setFromEuler(E.set(...r)), new THREE.Vector3(...s)));
        c.set(color);
        pos.push(...gg.attributes.position.array); nrm.push(...gg.attributes.normal.array);
        for (let i = 0; i < gg.attributes.position.count; i++) col.push(c.r, c.g, c.b);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      return g;
    };
    const legs = (geo, color, x, z, y) => [[-x, -z], [-x, z], [x, -z], [x, z]].map(([a, b]) => [geo, color, [a, y, b]]);
    // giraffe: tall leaning neck, golden coat with dark patches
    const gold = 0xf2bf5c, patch = 0x96582a;
    const giraffe = kit([
      ...legs(B(0.014, 0.13, 0.014), 0xe2ae55, 0.034, 0.02, 0.065),
      [B(0.105, 0.058, 0.05), gold, [0, 0.155, 0], [0, 0, 0.12]],
      [B(0.024, 0.15, 0.024), gold, [0.06, 0.24, 0], [0, 0, -0.5]],
      [B(0.05, 0.022, 0.022), gold, [0.112, 0.312, 0], [0, 0, -0.25]],
      [B(0.005, 0.02, 0.005), patch, [0.1, 0.33, 0.007]], [B(0.005, 0.02, 0.005), patch, [0.1, 0.33, -0.007]],
      [B(0.006, 0.07, 0.006), patch, [-0.056, 0.13, 0], [0, 0, 0.25]],
      ...[[-0.03, 0.168], [0.0, 0.14], [0.03, 0.172], [-0.012, 0.18], [0.025, 0.145]].map(([x, y]) => [B(0.02, 0.016, 0.054), patch, [x, y, 0], [0, 0, 0.12]]),
      ...[0.2, 0.25, 0.29].map((y) => [B(0.018, 0.016, 0.027), patch, [0.06 + (y - 0.24) * 0.55, y, 0], [0, 0, -0.5]]),
    ]);
    const grey = 0xa2a2ab;
    const elephant = kit([
      ...legs(Cy(0.017, 0.019, 0.075), 0x8e8e97, 0.042, 0.026, 0.037),
      [Ic(0.07), grey, [0, 0.105, 0], [0, 0, 0], [1.3, 0.85, 0.85]],
      [Ic(0.04), grey, [0.085, 0.125, 0], [0, 0, 0], [1, 1.1, 1]],
      [B(0.008, 0.07, 0.065), 0x96969f, [0.068, 0.122, 0.045], [0, 0.55, 0]], [B(0.008, 0.07, 0.065), 0x96969f, [0.068, 0.122, -0.045], [0, -0.55, 0]],
      [Cy(0.008, 0.014, 0.08, 5), grey, [0.12, 0.075, 0], [0, 0, 0.18]],
      [Co(0.005, 0.035, 4), 0xf4efe2, [0.115, 0.095, 0.014], [0, 0, -1.9]], [Co(0.005, 0.035, 4), 0xf4efe2, [0.115, 0.095, -0.014], [0, 0, -1.9]],
      [B(0.005, 0.05, 0.005), 0x6d6d75, [-0.09, 0.09, 0], [0, 0, 0.3]],
    ]);
    const tan = 0xc97c3c, hoof = 0x7a4a2a, belly = 0xf4ecdc, horn = 0x2a1f18;
    // antelope: slim ellipsoid body, pale belly and rump, lyre horns
    const buck = (grazing) => kit([
      ...legs(B(0.0065, 0.058, 0.0065), hoof, 0.026, 0.011, 0.029),
      [Ic(0.02), tan, [0, 0.072, 0], [0, 0, 0.05], [2.0, 0.95, 0.8]],
      [B(0.058, 0.008, 0.026), belly, [0, 0.058, 0]],
      [B(0.008, 0.024, 0.026), belly, [-0.037, 0.072, 0]],
      ...(grazing ? [
        [B(0.012, 0.065, 0.012), tan, [0.047, 0.05, 0], [0, 0, -2.6]],
        [Co(0.01, 0.034, 5), tan, [0.07, 0.016, 0], [0, 0, -2.84]],
        [B(0.004, 0.03, 0.004), horn, [0.06, 0.036, 0.007], [0.2, 0, 0.9]], [B(0.004, 0.03, 0.004), horn, [0.06, 0.036, -0.007], [-0.2, 0, 0.9]],
      ] : [
        [B(0.013, 0.048, 0.013), tan, [0.04, 0.098, 0], [0, 0, -0.4]],
        [Co(0.01, 0.034, 5), tan, [0.062, 0.119, 0], [0, 0, -1.95]],
        [B(0.004, 0.032, 0.004), horn, [0.05, 0.142, 0.007], [0.18, 0, 0.35]], [B(0.004, 0.032, 0.004), horn, [0.05, 0.142, -0.007], [-0.18, 0, 0.35]],
        [B(0.0035, 0.02, 0.0035), horn, [0.047, 0.164, 0.011], [0, 0, -0.25]], [B(0.0035, 0.02, 0.0035), horn, [0.047, 0.164, -0.011], [0, 0, -0.25]],
        [B(0.012, 0.004, 0.007), tan, [0.05, 0.13, 0.012], [0, 0.6, 0]], [B(0.012, 0.004, 0.007), tan, [0.05, 0.13, -0.012], [0, -0.6, 0]],
      ]),
    ]);
    // zebra: white horse silhouette with black bands (they read from above too)
    const zw = 0xf4f4f0, zb = 0x1b1b1d;
    const zebra = kit([
      ...legs(B(0.008, 0.055, 0.008), zw, 0.028, 0.012, 0.0275),
      ...legs(B(0.009, 0.012, 0.009), zb, 0.028, 0.012, 0.006),
      [B(0.075, 0.036, 0.03), zw, [0, 0.072, 0]],
      ...[-0.029, -0.017, -0.005, 0.007, 0.019, 0.031].map((x) => [B(0.0055, 0.039, 0.033), zb, [x, 0.072, 0], [0, 0, 0.3]]),
      [B(0.015, 0.05, 0.016), zw, [0.042, 0.1, 0], [0, 0, -0.45]],
      ...[0.092, 0.108].map((y) => [B(0.017, 0.005, 0.018), zb, [0.042 + (y - 0.1) * 0.48, y, 0], [0, 0, -0.45]]),
      [B(0.005, 0.052, 0.008), zb, [0.034, 0.104, 0], [0, 0, -0.45]],
      [B(0.034, 0.017, 0.016), zw, [0.062, 0.122, 0], [0, 0, -0.5]],
      [B(0.012, 0.016, 0.017), zb, [0.077, 0.113, 0], [0, 0, -0.5]],
      [B(0.006, 0.012, 0.004), zw, [0.05, 0.136, 0.006]], [B(0.006, 0.012, 0.004), zw, [0.05, 0.136, -0.006]],
      [B(0.005, 0.032, 0.005), zb, [-0.041, 0.06, 0], [0, 0, 0.2]],
    ]);
    const pink = 0xf58fae;
    const flamingo = kit([
      [B(0.004, 0.055, 0.004), 0xe07a8a, [0, 0.0275, 0.004]], [B(0.004, 0.055, 0.004), 0xe07a8a, [0, 0.0275, -0.004]],
      [Ic(0.024), pink, [0, 0.064, 0], [0, 0, 0.15], [1.35, 0.85, 0.8]],
      [B(0.012, 0.012, 0.03), 0x2a2a2a, [-0.03, 0.068, 0], [0, 0, 0.2]],
      [B(0.007, 0.036, 0.007), pink, [0.022, 0.088, 0], [0, 0, 0.35]],
      [B(0.007, 0.03, 0.007), pink, [0.02, 0.116, 0], [0, 0, -0.4]],
      [B(0.016, 0.011, 0.011), pink, [0.031, 0.131, 0]],
      [B(0.013, 0.006, 0.006), 0x2b2b2b, [0.043, 0.126, 0], [0, 0, -0.6]],
    ]);
    const bark = 0x6a4a2a;
    const acacia = kit([
      [Cy(0.008, 0.012, 0.12, 5), bark, [0, 0.06, 0], [0, 0, 0.08]],
      [Cy(0.005, 0.007, 0.06, 5), bark, [0.022, 0.13, 0], [0, 0, -0.6]], [Cy(0.005, 0.007, 0.06, 5), bark, [-0.012, 0.13, 0.015], [0.5, 0, 0.5]],
      [Cy(0.1, 0.075, 0.026, 8), 0x6d8a2c, [0.01, 0.165, 0]],
      [Cy(0.065, 0.055, 0.02, 7), 0x82a03a, [0.03, 0.184, 0.012]],
    ]);
    const tree = kit([
      [Cy(0.01, 0.014, 0.09, 5), bark, [0, 0.045, 0]],
      [Ic(0.055), 0x4f9a34, [0, 0.12, 0]], [Ic(0.042), 0x5cae3c, [0.035, 0.1, 0.02]], [Ic(0.04), 0x46902e, [-0.032, 0.105, -0.018]], [Ic(0.035), 0x67b844, [0.005, 0.16, 0.01]],
    ]);
    const bush = kit([[Ic(0.035), 0x4c8f2e, [0, 0.022, 0], [0, 0, 0], [1.2, 0.8, 1.1]], [Ic(0.026), 0x5ea63a, [0.028, 0.02, 0.012]], [Ic(0.022), 0x3f7f28, [-0.022, 0.016, -0.02]]]);
    const rr = srand(151), reedParts = [];
    for (let i = 0; i < 9; i++) {
      const a = rr() * 6.28, d = rr() * 0.03, h = 0.05 + rr() * 0.035, x = Math.cos(a) * d, z = Math.sin(a) * d, tz = (rr() - 0.5) * 0.3, tx = (rr() - 0.5) * 0.3;
      reedParts.push([Co(0.0045, h, 4), 0x6f8f34, [x, h / 2, z], [tx, 0, tz]]);
      if (i % 3 === 0) reedParts.push([B(0.007, 0.016, 0.007), 0x5a3a20, [x - tz * h * 0.8, h * 0.8, z + tx * h * 0.8], [tx, 0, tz]]);
    }
    const reeds = kit(reedParts);
    const rock = kit([[Ic(0.025), 0x9d9282, [0, 0.008, 0], [0.3, 0.5, 0], [1.25, 0.7, 1]], [Ic(0.016), 0x8a8072, [0.022, 0.004, 0.012]]]);
    const wood = 0x7a5230, roofRed = 0xa3432a;
    const tower = kit([
      ...legs(B(0.009, 0.17, 0.009), wood, 0.03, 0.03, 0.085),
      [B(0.085, 0.01, 0.085), 0x8c6038, [0, 0.172, 0]],
      ...[[0, 0.04, 0.085, 0.004], [0, -0.04, 0.085, 0.004], [0.04, 0, 0.004, 0.085], [-0.04, 0, 0.004, 0.085]].map(([x, z, sx, sz]) => [B(sx, 0.018, sz), wood, [x, 0.186, z]]),
      ...legs(B(0.005, 0.045, 0.005), wood, 0.038, 0.038, 0.2),
      [Co(0.075, 0.05, 4), roofRed, [0, 0.245, 0], [0, Math.PI / 4, 0]],
      [B(0.05, 0.006, 0.006), wood, [0, 0.07, 0.03], [0, 0, 0.9]], [B(0.05, 0.006, 0.006), wood, [0, 0.07, -0.03], [0, 0, -0.9]],
    ]);
    const stone = 0xb3a283, leaf = 0xb4502e;
    const gate = kit([
      [B(0.028, 0.12, 0.028), stone, [0, 0.06, 0.1]], [B(0.028, 0.12, 0.028), stone, [0, 0.06, -0.1]],
      [B(0.034, 0.012, 0.034), 0x8f8068, [0, 0.126, 0.1]], [B(0.034, 0.012, 0.034), 0x8f8068, [0, 0.126, -0.1]],
      [B(0.022, 0.02, 0.24), 0x6b4424, [0, 0.13, 0]],
      [B(0.034, 0.006, 0.26), leaf, [0.013, 0.148, 0], [0, 0, -0.55]], [B(0.034, 0.006, 0.26), leaf, [-0.013, 0.148, 0], [0, 0, 0.55]],
      [B(0.006, 0.036, 0.15), 0xf0cc4a, [0.014, 0.102, 0]],
      [B(0.007, 0.016, 0.05), 0x3f8a3a, [0.0155, 0.102, 0]],
    ]);
    const white = 0xeef1f3;
    const domeFrame = kit([
      [Cy(0.1, 0.104, 0.02, 18), white, [0, 0.01, 0]],
      ...[0, Math.PI / 3, 2 * Math.PI / 3].map((a) => [new THREE.TorusGeometry(0.094, 0.0035, 4, 14, Math.PI), white, [0, 0.018, 0], [0, a, 0]]),
      [new THREE.TorusGeometry(0.081, 0.0035, 4, 18), white, [0, 0.066, 0], [Math.PI / 2, 0, 0]],
      [B(0.03, 0.04, 0.04), 0x5a6a78, [0.095, 0.02, 0]],
      [Cy(0.008, 0.01, 0.05, 5), bark, [-0.01, 0.045, 0]], [Ic(0.04), 0x5cae3c, [-0.01, 0.08, 0]], [Ic(0.028), 0x7cc24a, [0.03, 0.045, 0.03]], [Ic(0.026), 0x4f9a34, [0.0, 0.04, -0.045]],
    ]);
    // birds: white V wings with a dark body, on a ring (they fly along +x = the ring tangent)
    const birdParts = [], rb = srand(77);
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * Math.PI * 2 + rb() * 0.6, r = 0.14 + rb() * 0.1, h = (rb() - 0.5) * 0.12, bank = 0.25;
      const at = (x, y, z) => [Math.sin(a) * r + x * Math.cos(a) + z * Math.sin(a), h + y, Math.cos(a) * r - x * Math.sin(a) + z * Math.cos(a)];
      for (const sd of [-1, 1]) birdParts.push([B(0.014, 0.003, 0.04), 0xf6f6f2, at(0, 0.006, sd * 0.019), [sd * 0.4 + bank, a, 0, 'YXZ']]);
      birdParts.push([B(0.024, 0.007, 0.007), 0x3a3a40, at(0.002, 0, 0), [bank, a, 0, 'YXZ']]);
    }
    const birds = kit(birdParts);
    const person = (shirt, pants, hat) => kit([
      [B(0.012, 0.022, 0.009), pants, [0, 0.011, 0]],
      [B(0.015, 0.02, 0.011), shirt, [0, 0.032, 0]],
      [Ic(0.0075), 0xf0c8a0, [0, 0.049, 0]],
      ...(hat ? [[Cy(0.011, 0.011, 0.003, 8), hat, [0, 0.055, 0]]] : []),
    ]);
    const people = [person(0xe8413a, 0x2f3b5c), person(0x2f8fe8, 0x4a3a2a, 0xe8d8a0), person(0xf2c230, 0x2f3b5c), person(0xffffff, 0x5a6a3a, 0x3a6a2a), person(0xd05ab0, 0x3a3a44)];
    const post = kit([[B(0.012, 0.05, 0.012), 0x7a4e2a, [0, 0.025, 0]]]);
    const rail = kit([[B(1, 0.008, 0.007), 0xa0703f]]);
    return this._ecoKit = { giraffe, elephant, antelope: buck(false), grazer: buck(true), zebra, flamingo, acacia, tree, bush, reeds, rock, tower, gate, domeFrame, post, rail, birds, people };
  }

  // forest kit (units of the hex circumradius, y up): every template is one
  // geometry with a height-shaded colour attribute that the per-instance
  // colour tints. Each part is welded (seams, cone apex, icosahedron faces)
  // before its normals are computed, so crowns shade smooth, not faceted. Foliage and trunks are separate instanced
  // layers so trunks keep their own brown.
  treeKit() {
    if (this._treeKit) return this._treeKit;
    const merge = (parts) => mergeGeometries(parts.map((p) => {
      const q = p.index ? p.toNonIndexed() : p; q.deleteAttribute('uv'); q.deleteAttribute('normal');
      const w = mergeVertices(q, 1e-5); w.computeVertexNormals(); return w;
    }));
    // conifer: five ragged, drooping tiers
    const tiers = [];
    for (let k = 0; k < 5; k++) {
      const rr = 0.082 * (1 - k * 0.16), hh = 0.1 - k * 0.008, y = 0.07 + k * 0.047;
      const c = new THREE.ConeGeometry(rr, hh, 16, 2).translate(0, y + hh / 2, 0);
      const P = c.attributes.position, v = new THREE.Vector3();
      for (let i = 0; i < P.count; i++) {
        v.fromBufferAttribute(P, i);
        const rim = Math.hypot(v.x, v.z) / rr;
        if (rim > 0.9) { const j = vhash(v.x, v.y, v.z); v.x *= 0.85 + j * 0.3; v.z *= 0.85 + j * 0.3; v.y -= 0.012 * j + 0.006; }
        P.setXYZ(i, v.x, v.y, v.z);
      }
      tiers.push(c);
    }
    const conifer = shadeByHeight(merge(tiers), 0.07, 0.32, 0.5, 0.1);
    // conifer foliage is darker at each tier's skirt: add that on top of the height shade
    { const P = conifer.attributes.position, C = conifer.attributes.color;
      for (let i = 0; i < P.count; i++) { const y = P.getY(i), f = ((y - 0.07) / 0.047) % 1; const k = 0.78 + 0.22 * Math.min(1, f * 1.6); C.setXYZ(i, C.getX(i) * k, C.getY(i) * k, C.getZ(i) * k); } }
    // broadleaf: a crown of lumpy blobs over a forked trunk
    const blobs = [[0, 0.2, 0, 0.062], [0.045, 0.175, 0.02, 0.048], [-0.04, 0.18, -0.02, 0.05], [0.01, 0.17, -0.048, 0.046], [-0.015, 0.165, 0.048, 0.046], [0.005, 0.245, 0.005, 0.04]];
    const broad = shadeByHeight(merge(blobs.map(([x, y, z, rr]) => lumpy(new THREE.IcosahedronGeometry(rr, 2), 0.16).translate(x, y, z))), 0.12, 0.28, 0.45, 0.12);
    // poplar: tall narrow column
    const pop = [[0, 0.16, 0, 0.042, 1.9], [0, 0.26, 0, 0.034, 1.7], [0.012, 0.12, 0.008, 0.036, 1.4]];
    const poplar = shadeByHeight(merge(pop.map(([x, y, z, rr, sy]) => lumpy(new THREE.IcosahedronGeometry(rr, 2), 0.15).scale(1, sy, 1).translate(x, y, z))), 0.06, 0.34, 0.5, 0.1);
    const trunk = new THREE.CylinderGeometry(0.009, 0.016, 0.1, 7).translate(0, 0.05, 0);
    const broadTrunk = merge([
      new THREE.CylinderGeometry(0.011, 0.018, 0.15, 7).translate(0, 0.075, 0),
      new THREE.CylinderGeometry(0.005, 0.008, 0.07, 5).rotateZ(0.6).translate(0.022, 0.15, 0),
      new THREE.CylinderGeometry(0.005, 0.008, 0.065, 5).rotateZ(-0.55).rotateY(1.2).translate(-0.01, 0.15, -0.018),
    ]);
    const bush = shadeByHeight(merge([[0, 0.022, 0, 0.032], [0.026, 0.018, 0.01, 0.024], [-0.022, 0.016, -0.012, 0.022]].map(([x, y, z, rr]) => lumpy(new THREE.IcosahedronGeometry(rr, 1), 0.16).scale(1, 0.8, 1).translate(x, y, z))), 0, 0.045, 0.55, 0.15);
    const rock = shadeByHeight(merge([lumpy(new THREE.IcosahedronGeometry(0.024, 1), 0.3).scale(1.3, 0.6, 1).translate(0, 0.006, 0), lumpy(new THREE.IcosahedronGeometry(0.014, 0), 0.3).translate(0.024, 0.004, 0.01)]), -0.01, 0.02, 0.6, 0.12);
    const tuftParts = [];
    for (let i = 0; i < 5; i++) { const a = i / 5 * 6.28, d = 0.006 + (i % 3) * 0.004; tuftParts.push(new THREE.ConeGeometry(0.0035, 0.03 + (i % 3) * 0.008, 3, 1, true).translate(0, 0.016, 0).rotateZ(Math.cos(a) * 0.35).rotateX(Math.sin(a) * 0.35).translate(Math.cos(a) * d, 0, Math.sin(a) * d)); }
    const tuft = shadeByHeight(merge(tuftParts), 0, 0.04, 0.5, 0.1);
    // a lighter broadleaf for street / park trees in cities (seen small)
    const broadLo = shadeByHeight(merge(blobs.slice(0, 4).map(([x, y, z, rr]) => lumpy(new THREE.IcosahedronGeometry(rr * 1.1, 1), 0.12).translate(x, y, z))), 0.12, 0.28, 0.5, 0.12);
    return this._treeKit = { conifer, broad, broadLo, poplar, trunk, broadTrunk, bush, rock, tuft };
  }

  syncTiles(tiles, animate) {
    this.clearPicked();                  // the picked tiles land now
    const seen = new Set(), placed = [];
    for (const [space, type, owner] of tiles) {
      seen.add(space);
      const key = `${type}:${owner}`;
      const cur = this.tiles.get(space);
      if (cur && cur.userData.key === key) continue;
      if (cur) { this.board.remove(cur); cur.traverse((o) => o.geometry?.dispose()); }
      const t = this.makeTile(space, type, owner);
      t.userData.key = key;
      this.board.add(t);
      this.tiles.set(space, t);
      if (this.claimMarks?.has(space)) { const cm = this.claimMarks.get(space); this.board.remove(cm); cm.traverse((o) => o.geometry?.dispose()); this.claimMarks.delete(space); }   // the claim is used up
      this.cells[space].cap.visible = !!(this.cells[space].station || this.cells[space].haven);     // the colonies keep their hex frame
      if (animate) { if (type !== TILE.OCEAN && !this.tileArt.animateIn(t)) this.dropIn(t); placed.push(space); }   // TileArt builds it up in place; dropIn for the rest
    }
    for (const [space, t] of this.tiles) if (!seen.has(space)) { this.board.remove(t); t.traverse((o) => o.geometry?.dispose()); this.tiles.delete(space); this.cells[space].cap.visible = true; }
    for (const h of [this.station, this.gany]) if (h) { const t = this.tiles.get(h.space); h.setOwner(t ? this.playerColors[+t.userData.key.split(':')[1]] ?? 0xffffff : null, animate); }
    const holes = tiles.filter(([sp, ty]) => ty === 0 && !this.cells[sp].colony).slice(0, 16);
    const hu = this.pmat.uniforms;
    this.holeT ||= new Map();
    holes.forEach(([sp], i) => {
      hu.uHoles.value[i].set(this.cells[sp].bx, this.cells[sp].by);
      if (!this.holeT.has(sp)) this.holeT.set(sp, animate ? 0 : 1);
    });
    for (const sp of [...this.holeT.keys()]) if (!holes.some(([h]) => h === sp)) this.holeT.delete(sp);
    const sync = () => holes.forEach(([sp], i) => { hu.uHoleT.value[i] = this.holeT.get(sp); });
    sync();
    hu.uHoleN.value = holes.length;
    this.holeBorn ||= new Map();
    for (const sp of [...this.holeBorn.keys()]) if (!holes.some(([h]) => h === sp)) this.holeBorn.delete(sp);
    this.holeOrder = holes.map(([sp]) => sp);
    // (a sync while an ocean is still filling must not start it over: once per ocean)
    this.holeFilling ||= new Set();
    for (const [sp] of holes) if (this.holeT.get(sp) < 1 && !this.holeFilling.has(sp)) {
      // the ground sinks, the water rises into it, and settles with one soft ring
      this.holeFilling.add(sp);
      this.holeBorn.set(sp, performance.now() / 1000);
      const gen = this.boardGen;                      // (a map switch mid-fill drops it)
      this.tween(2400, (k) => { if (this.boardGen !== gen) return; this.holeT.set(sp, 1 - Math.pow(1 - k, 3)); sync(); }, () => { if (this.boardGen === gen) this.holeFilling.delete(sp); });
    }
    this.tileArt.afterSync(animate);
    this.badges.sync(tiles, animate);
    this.shadowDirty = true;
    return placed;
  }
  // the type emblems again, now (after this.variedTiles changes; tile_badges.js also polls it)
  syncBadges() { this.badges.refresh(); }

  dropIn(obj) {
    const cell = this.cells[obj.userData.space];
    const end = obj.position.clone(), start = end.clone().addScaledVector(cell.up, 1.6);
    obj.position.copy(start); obj.scale.setScalar(0.7);
    this.tween(650, (k) => {
      const e = 1 - Math.pow(1 - k, 3);
      obj.position.lerpVectors(start, end, e);
      obj.scale.setScalar(k < 0.8 ? 0.7 + 0.38 * (k / 0.8) : 1.08 - 0.08 * ((k - 0.8) / 0.2));
    }, () => { obj.position.copy(end); obj.scale.setScalar(1); if (!cell.colony && obj.parent === this.board) this.dust(cell); });
  }

  dust(cell) {
    const n = 70, g = new THREE.BufferGeometry(), pos = new Float32Array(n * 3), vel = [];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 0.3 + Math.random() * 0.6;
      vel.push(cell.east.clone().multiplyScalar(Math.cos(a) * sp).addScaledVector(cell.north, Math.sin(a) * sp).addScaledVector(cell.up, Math.random() * 0.3));
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: 0xd8a070, size: 0.05, transparent: true, opacity: 0.9, depthWrite: false });
    const pts = new THREE.Points(g, mat);
    this.board.add(pts);
    this.tween(900, (k) => {
      for (let i = 0; i < n; i++) { const p = cell.center.clone().addScaledVector(vel[i], k * 0.7); pos.set([p.x, p.y, p.z], i * 3); }
      g.attributes.position.needsUpdate = true;
      mat.opacity = 0.9 * (1 - k);
    }, () => { this.board.remove(pts); g.dispose(); mat.dispose(); });
  }

  flashSpace(space, color = 0xffffff) {
    const cell = this.cells[space];
    if (!cell) return;
    const ring = new THREE.Mesh(this.capGeo(cell, 0.12, 1.05, 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide }));
    ring.renderOrder = 5;
    this.board.add(ring);
    this.tween(1100, (k) => { ring.material.opacity = 0.7 * (1 - k); }, () => { this.board.remove(ring); ring.geometry.dispose(); ring.material.dispose(); });
  }
}
