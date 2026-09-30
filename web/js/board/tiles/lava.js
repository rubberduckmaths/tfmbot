// lava.js -- TileArt mixin: Lava Flows, molten channels over basalt from a spatter cone, painted by one shader
// from a flow field, with a rover, a survey station and a drone.
import { gfx } from '../quality.js';
import * as THREE from 'three';
import { mergeGeometries } from '../../../vendor/BufferGeometryUtils.js';
import { BALL, BOX, Kit, TAU, _c, _c2, clamp01, fbm2, hash2, lathe, part, smooth } from './kit.js';

export class LavaArt {
  // Lava Flows: molten rivers braided over black basalt from a spatter cone at
  // the back, running between their own levees toward the viewer. One shader
  // (lavaMat) paints the lava and the rock from a flow field (lavaField): the
  // molten surface crawls along each channel, crust plates ride on it glowing
  // at their seams -- more of them downstream and as the planet warms (the
  // stage: aLvC) -- the old flows round the channels are ropy pahoehoe, the
  // levees clinker. The vent's crater lake spills down two tongues. A rover
  // samples a flow, two stations log it, a survey drone circles; smoke,
  // sparks and heat haze rise from the vent and the channels.
  lava(ctx) {
    const r = this.env.srand(ctx.space * 43 + 1), HR = this.HEX_R, R0 = HR * 0.95, low = gfx.low, cool = this.prog;
    ctx.wall(0x201814);
    const F = this.lavaField(), [vx, vz] = F.vent, hw = 0.034 * (1 - 0.22 * cool);
    const hf = (x, z) => {
      const d = F.at(x, z), ed = this.edgeDist(x, z), dv = Math.hypot(x - vx, z - vz);
      const v = -0.003 * (1 - smooth(hw * 0.8, hw * 1.15, d)) + 0.0055 * smooth(hw * 1.15, hw * 1.7, d) * (1 - smooth(hw * 1.9, hw * 3.2, d))
        + 0.003 * (1 - smooth(0.07, 0.17, d)) + 0.011 * (fbm2(x * 16 + 3, z * 16, 4) - 0.45) * smooth(0.07, 0.17, d) + 0.016 * smooth(0.3, 0.06, dv);
      return v * (v > 0 ? smooth(0.02, 0.15, ed) : smooth(0, 0.05, ed));         // (low at the rim: board3d's owner band lies just above it)
    };
    const M = this.lavaMat(this.kOf(ctx.cell)), uvOf = (x, z) => [0.5 + x / (Math.sqrt(3) * R0), 0.5 - z / (2 * R0)];
    const coolAttr = (g) => { g.setAttribute('aLvC', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(cool), 1)); return g; };
    this.groundMeshGeo(ctx, coolAttr(this.ground(hf, () => _c.setRGB(1, 1, 1), { sub: gfx.pick(30, 40, 48), uv: true })), { mat: M, frost: false });
    const K = new Kit(), LV = new Kit();          // LV: parts in the lava material (uv = their board position)
    const lvPart = (g) => { const P = g.attributes.position, uv = new Float32Array(P.count * 2); for (let i = 0; i < P.count; i++) uv.set(uvOf(P.getX(i), P.getZ(i)), i * 2); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); LV.add(M, coolAttr(g), 0xffffff, [0, 0, 0], [0, 0, 0], 1, { uv: true }); };
    // the vent: a lumpy spatter cone, oxidised red at the top, a crater lake spilling down two tongues
    const y0 = hf(vx, vz) - 0.004, prof = [[0.15, -0.004], [0.12, 0.024], [0.078, 0.062], [0.057, 0.082], [0.047, 0.08], [0.036, 0.066], [0.001, 0.058]];
    const cone = lathe(prof, 40), CP = cone.attributes.position;
    for (let i = 0; i < CP.count; i++) {
      const x = CP.getX(i), y = CP.getY(i), z = CP.getZ(i), a = Math.atan2(z, x), n = fbm2(Math.cos(a) * 2.5 + 7, Math.sin(a) * 2.5 + y * 25, 3) - 0.5, f = 1 + n * 0.2 * smooth(0, 0.03, y);
      CP.setXYZ(i, x * f, y * (1 + n * 0.25), z * f);
    }
    cone.computeVertexNormals();
    K.add('matte', cone, (x, y) => _c.setRGB(0.12, 0.095, 0.085).multiplyScalar(0.8 + (y - y0) * 4).lerp(_c2.setRGB(0.3, 0.12, 0.07), smooth(0.045, 0.08, y - y0) * 0.8), [vx, y0, vz]);
    K.add('glow', new THREE.TorusGeometry(0.045, 0.0035, 6, 36).rotateX(Math.PI / 2), 0xff7a22, [vx, y0 + 0.074, vz]);
    lvPart(new THREE.CircleGeometry(0.046, 28).rotateX(-Math.PI / 2).translate(vx, y0 + 0.07, vz));
    const yAt = (rr) => { for (let i = 0; i + 1 < prof.length; i++) { const [ra, ya] = prof[i], [rb, yb] = prof[i + 1]; if (rr <= ra && rr >= rb) return ya + (yb - ya) * (ra - rr) / (ra - rb); } return rr > 0.15 ? -0.004 : 0.058; };
    const coneY = (a, rr) => { const y = yAt(rr), n = fbm2(Math.cos(a) * 2.5 + 7, Math.sin(a) * 2.5 + y * 25, 3) - 0.5, f = 1 + n * 0.2 * smooth(0, 0.03, y); return yAt(rr / f) * (1 + n * 0.25); };
    for (const [tx, tz] of [F.paths[0][6], F.paths[1][6]]) {                 // tongues down the flank, toward the two main channels
      const a = Math.atan2(tz - vz, tx - vx), ca = Math.cos(a), sa = Math.sin(a), pos = [], idx = [], n = 12;
      for (let i = 0; i <= n; i++) {
        const t = i / n, rr = 0.044 + t * 0.112, wd = 0.012 + t * 0.016 + 0.004 * Math.sin(t * 9);
        for (const sd of [-1, 1]) { const px = vx + ca * rr - sa * wd * sd, pz = vz + sa * rr + ca * wd * sd, pa = Math.atan2(pz - vz, px - vx), pr = Math.hypot(px - vx, pz - vz); pos.push(px, Math.max(y0 + coneY(pa, pr), hf(px, pz)) + 0.004, pz); }
        if (i) idx.push(i * 2 - 2, i * 2, i * 2 - 1, i * 2 - 1, i * 2, i * 2 + 1);
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
      if (g.attributes.normal.getY(0) < 0) { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } g.computeVertexNormals(); }
      lvPart(g);
    }
    for (let i = 0; i < 12; i++) {                                            // spatter clots round the cone
      const a = r() * TAU, rr = 0.1 + r() * 0.08, x = vx + Math.cos(a) * rr, z = vz + Math.sin(a) * rr, s = 0.006 + r() * 0.007;
      if (F.at(x, z) < hw * 1.3) continue;
      K.add('matte', this.lavaRock(), (X, Yy) => _c.setRGB(0.2, 0.09, 0.06).multiplyScalar(0.7 + Yy * 30), [x, hf(x, z) + s * 0.3, z], [r() * 3, r() * 3, r() * 3], [s, s * 0.7, s * 1.2]);
    }
    // clinker along the levees, a few basalt boulders out on the plain
    for (let i = 0, n = low ? 40 : 90; i < n; i++) {
      const x = (r() - 0.5) * 0.92, z = (r() - 0.5) * 1.02, d = F.at(x, z);
      if (this.edgeDist(x, z) < 0.03 || this.env.inClearing(x, z, 0.01) || d < hw * 1.25 || Math.hypot(x - vx, z - vz) < 0.16 || Math.hypot(x + 0.24, z - 0.24) < 0.06) continue;
      const lev = d < hw * 2.7;
      if (!lev && r() < 0.75) continue;
      const s = lev ? 0.005 + r() * 0.007 : 0.012 + r() * 0.014;
      K.add('matte', lev ? this.lavaRock() : BALL, (X, Yy) => _c.setRGB(0.1, 0.085, 0.08).multiplyScalar(0.75 + Yy * 18), [x, hf(x, z) + s * 0.2, z], [r() * 3, r() * 3, r() * 3], [s * (1 + r() * 0.6), s * 0.62, s]);
    }
    // people at work: a rover sampling the east channel, stations logging the flows
    const spot = (path, t, side, off) => {                                   // a bank spot beside a channel: [x, z, facing the channel]
      const P = F.paths[path], i = Math.min(P.length - 2, Math.floor(t * (P.length - 1))), [ax, az] = P[i], [bx, bz] = P[i + 1], L = Math.hypot(bx - ax, bz - az) || 1;
      const nx = -(bz - az) / L * side, nz = (bx - ax) / L * side;
      return [ax + nx * off, az + nz * off, Math.atan2(-nz, -nx)];
    };
    const ok = (x, z, pad) => this.edgeDist(x, z) > pad && !this.env.inClearing(x, z, pad) && F.at(x, z) > hw * 2.2 && Math.hypot(x + 0.24, z - 0.24) > 0.09;
    const [rx, rz, ra] = spot(3, 0.4, -1, 0.1);
    const [tx, tz] = [rx + Math.cos(ra) * 0.08, rz + Math.sin(ra) * 0.08];
    if (ok(rx, rz, 0.03)) this.lavaRover(K, rx, rz, hf(rx, rz), ra, 0.08, hf(tx, tz) + 0.004);
    for (const [px, pz, pa] of [spot(0, 0.3, -1, 0.1), spot(2, 0.5, 1, 0.1), spot(3, 0.62, 1, 0.09)]) if (ok(px, pz, 0.04)) this.lavaStation(K, px, pz, hf(px, pz), pa);
    this.emit(K, ctx);
    this.emit(LV, ctx);
    if (!low) this.lavaDrone(ctx, 0.02, -0.02, 0.27, 0.17, 0.32, ctx.space);
    // smoke from the vent (more of it early), sparks from the lake, wisps off the crusting channels
    const pl = [{ x: vx, z: vz, y: 0.09, n: low ? 5 : 9, life: 5, rise: 0.5, size: 0.13, col: [0.2, 0.17, 0.16, 0.5 - 0.15 * cool], drift: [0.09, -0.05], jit: 0.03 }];
    if (!low) pl.push({ x: vx, z: vz, y: 0.075, n: 12, life: 1.2, rise: 0.11, size: 0.016, col: [1, 0.66, 0.26, 0.95], jit: 0.04, spread: 0.12 });
    for (const [pi, t] of low ? [] : [[0, 0.72], [1, 0.62], [2, 0.5]]) {
      const P = F.paths[pi], [x, z] = P[Math.floor(t * (P.length - 1))];
      if (this.edgeDist(x, z) > 0.05) pl.push({ x, z, y: 0.0, n: 3, life: 3.2, rise: 0.14, size: 0.04, col: [0.5, 0.45, 0.42, 0.16 + 0.08 * (1 - cool)], drift: [0.02, -0.03], jit: 0.02 });
    }
    this.puffs(ctx, pl);
    this.emblem(ctx, 'lava_flows', -0.24, 0.24, 0.26, 0.28);
  }
  lavaRock() { return this.tex.lavaRockGeo ||= new THREE.IcosahedronGeometry(1, 0); }
  // the channels, once: a flow field (r: nearness to the nearest channel, as distance / its width, 0 beyond
  // 0.2; gb: that channel's direction; a: how far downstream) and at(x, z), the same distance on the CPU for
  // the levees; paths: each channel as a polyline (board units), vent: where they start
  lavaField() {
    if (this.tex.lavaField) return this.tex.lavaField;
    const R0 = this.HEX_R * 0.95, LW = Math.sqrt(3) * R0, LH = 2 * R0, w = 224, h = 260, MAXD = 0.2;
    const src = [[[-0.05, -0.3], [-0.12, -0.1], [0.02, 0.1], [-0.06, 0.34], [-0.02, 0.6]], [[-0.05, -0.3], [0.1, -0.12], [0.16, 0.08], [0.1, 0.2], [0.02, 0.6]],
      [[-0.12, -0.1], [-0.28, 0.05], [-0.34, 0.2], [-0.4, 0.4]], [[0.1, -0.12], [0.3, -0.1], [0.46, -0.05]], [[0.02, 0.1], [0.12, 0.2], [0.1, 0.2]]];
    const WD = [1, 1, 0.7, 0.7, 0.55], segs = [], paths = [];
    for (let pi = 0; pi < src.length; pi++) {                               // quadratic curves through the midpoints (smooth, as canvas strokes would draw them)
      const P = src[pi], pts = [P[0]];
      let [x0, z0] = P[0];
      for (let j = 1; j < P.length - 1; j++) {
        const [cx, cz] = P[j], ex = (P[j][0] + P[j + 1][0]) / 2, ez = (P[j][1] + P[j + 1][1]) / 2;
        for (let t = 1; t <= 12; t++) { const u = t / 12, a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, c = u * u; pts.push([a * x0 + b * cx + c * ex, a * z0 + b * cz + c * ez]); }
        x0 = ex; z0 = ez;
      }
      pts.push(P[P.length - 1]);
      let s = 0;
      if (pi >= 2) { let best = 9; for (const g of segs) { const d = Math.hypot(g[0] - P[0][0], g[1] - P[0][1]); if (d < best) { best = d; s = g[5]; } } }
      for (let j = 0; j + 1 < pts.length; j++) { const [ax, az] = pts[j], [bx, bz] = pts[j + 1], L = Math.hypot(bx - ax, bz - az); if (L < 1e-5) continue; segs.push([ax, az, bx, bz, WD[pi] * (1 - 0.15 * clamp01(s)), s, L]); s += L; }
      paths.push(pts);
    }
    const D = new Float32Array(w * h).fill(MAXD), DX = new Float32Array(w * h), DZ = new Float32Array(w * h).fill(1), S = new Float32Array(w * h);
    const sx = w / LW, sz = h / LH;
    for (const [ax, az, bx, bz, wd, s0, L] of segs) {
      const ux = (bx - ax) / L, uz = (bz - az) / L, R = MAXD * wd;
      const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - R + LW / 2) * sx)), i1 = Math.min(w - 1, Math.ceil((Math.max(ax, bx) + R + LW / 2) * sx));
      const j0 = Math.max(0, Math.floor((LH / 2 - Math.max(az, bz) - R) * sz)), j1 = Math.min(h - 1, Math.ceil((LH / 2 - Math.min(az, bz) + R) * sz));
      for (let j = j0; j <= j1; j++) {
        const z = LH / 2 - (j + 0.5) / sz;
        for (let i = i0; i <= i1; i++) {
          const x = (i + 0.5) / sx - LW / 2, t = Math.max(0, Math.min(L, (x - ax) * ux + (z - az) * uz)), d = Math.hypot(x - ax - ux * t, z - az - uz * t) / wd, k = j * w + i;
          if (d < D[k]) { D[k] = d; DX[k] = ux; DZ[k] = uz; S[k] = s0 + t; }
        }
      }
    }
    const data = new Uint8Array(w * h * 4);
    for (let k = 0; k < w * h; k++) { data[k * 4] = 255 * (1 - D[k] / MAXD); data[k * 4 + 1] = 127.5 + 127.5 * DX[k]; data[k * 4 + 2] = 127.5 + 127.5 * DZ[k]; data[k * 4 + 3] = 255 * clamp01(S[k] / 1.1); }
    const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
    tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true; tex.needsUpdate = true;
    const at = (x, z) => {
      const fx = Math.max(0, Math.min(w - 1.001, (x / LW + 0.5) * w - 0.5)), fz = Math.max(0, Math.min(h - 1.001, (0.5 - z / LH) * h - 0.5)), i = Math.floor(fx), j = Math.floor(fz), a = fx - i, b = fz - j, k = j * w + i;
      return (D[k] * (1 - a) + D[k + 1] * a) * (1 - b) + (D[k + w] * (1 - a) + D[k + w + 1] * a) * b;
    };
    return this.tex.lavaField = { tex, at, paths, vent: src[0][0] };
  }
  // a tileable 128^2 noise for the lava: r, a = periodic fbm; g = a Worley cell's random id (6 x 6 cells), b = how far inside its cell (0 on the seams)
  lavaNoiseTex() {
    if (this.tex.lavaNoise) return this.tex.lavaNoise;
    const N = 128, C = 6, d = new Uint8Array(N * N * 4);
    const pn = (u, v, p, sd) => {
      const x = u * p, y = v * p, xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, wr = (a) => ((a % p) + p) % p, hh = (i, j) => hash2(wr(i) + p * 17 + sd, wr(j) + p * 5);
      const uu = xf * xf * (3 - 2 * xf), vv = yf * yf * (3 - 2 * yf), a = hh(xi, yi), b = hh(xi + 1, yi), c = hh(xi, yi + 1), e = hh(xi + 1, yi + 1);
      return a + (b - a) * uu + (c - a) * vv + (a - b - c + e) * uu * vv;
    };
    const fp = (i, j) => { const a = ((i % C) + C) % C, b = ((j % C) + C) % C; return [(i + 0.12 + 0.76 * hash2(a * 3.1 + 1, b * 7.3 + 2)) / C, (j + 0.12 + 0.76 * hash2(a * 5.7 + 3, b * 1.9 + 4)) / C, hash2(a * 11.1 + 5, b * 13.7 + 6)]; };
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const u = i / N, v = j / N, ci = Math.floor(u * C), cj = Math.floor(v * C), k = (j * N + i) * 4;
      let f1 = 9, f2 = 9, id = 0;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const [px, py, q] = fp(ci + a, cj + b), dd = Math.hypot(px - u, py - v); if (dd < f1) { f2 = f1; f1 = dd; id = q; } else if (dd < f2) f2 = dd; }
      d[k] = 255 * clamp01((pn(u, v, 8, 0) * 0.5 + pn(u, v, 16, 1) * 0.3 + pn(u, v, 32, 2) * 0.2 - 0.5) * 1.8 + 0.5);
      d[k + 1] = 255 * id;
      d[k + 2] = 255 * clamp01((f2 - f1) * C * 1.6);
      d[k + 3] = 255 * clamp01((pn(u, v, 4, 3) * 0.6 + pn(u, v, 12, 4) * 0.4 - 0.5) * 1.8 + 0.5);
    }
    const t = new THREE.DataTexture(d, N, N, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true;
    return this.tex.lavaNoise = t;
  }
  // the lava ground (and the crater lake, the tongues): uv = the board position; aLvC = the stage's cooling.
  // Emission through the material's emissive (white x intensity: tick's slow throb, lavaJob's flood)
  lavaMat(k) {
    if (this.mats.lavaG) return this.mats.lavaG;
    const R0 = this.HEX_R * 0.95, F = this.lavaField(), NT = this.lavaNoiseTex();
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0.05, emissive: 0xffffff, emissiveIntensity: 1.6 });
    m.onBeforeCompile = (s) => {
      Object.assign(s.uniforms, { uTime: this.time, uLvF: { value: F.tex }, uLvN: { value: NT } });
      s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute float aLvC; varying vec2 vLv; varying float vLvC;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLv = uv; vLvC = aLvC;');
      s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>
uniform float uTime; uniform sampler2D uLvF, uLvN; varying vec2 vLv; varying float vLvC;
const float uLvK = ${k.toFixed(4)};
vec3 lvRamp(float T){
  vec3 c = mix(vec3(0.22, 0.01, 0.0), vec3(0.95, 0.16, 0.01), smoothstep(0.05, 0.5, T));
  c = mix(c, vec3(1.0, 0.5, 0.06), smoothstep(0.45, 0.8, T));
  return mix(c, vec3(1.15, 0.9, 0.45), smoothstep(0.8, 1.1, T));
}
vec3 lvBump(vec3 pos, vec3 N, float H){
  vec3 dx = dFdx(pos), dy = dFdy(pos), r1 = cross(dy, N), r2 = cross(N, dx);
  float det = dot(dx, r1);
  vec3 g = sign(det) * (dFdx(H) * r1 + dFdy(H) * r2);
  return normalize(abs(det) * N - g);
}`)
        .replace('#include <color_fragment>', `#include <color_fragment>
vec3 lvEm = vec3(0.0); float lvH = 0.0, lvR = 0.95;
{
  vec2 p = vec2((vLv.x - 0.5) * ${(Math.sqrt(3) * R0).toFixed(5)}, (0.5 - vLv.y) * ${(2 * R0).toFixed(5)});
  vec4 F = texture2D(uLvF, vLv);
  float dn = (1.0 - F.r) * 0.2, cool = vLvC, age = F.a, px = length(fwidth(p));
  vec2 dir = F.gb * 2.0 - 1.0; dir /= max(length(dir), 1e-3);
  float hw = 0.034 * (1.0 - 0.22 * cool);
  float core = 1.0 - smoothstep(hw * 0.72, hw * 1.02, dn), heat = 1.0 - smoothstep(0.0, hw * 1.05, dn);
  float levee = smoothstep(hw * 1.05, hw * 1.5, dn) * (1.0 - smoothstep(hw * 1.9, hw * 3.2, dn));
  float skirt = (1.0 - smoothstep(0.06, 0.11, dn)) * (1.0 - levee) * (1.0 - core);
  // the molten surface crawls down the channel: two phases of a flow map, cross-faded; faster mid-stream
  float t0 = fract(uTime * 0.25), t1 = fract(uTime * 0.25 + 0.5), wB = abs(2.0 * t0 - 1.0), spd = 0.065 * (0.65 + 0.35 * heat);
  vec2 q = p * 3.4, qc = p * 7.0, oA = dir * (t0 * spd), oB = dir * (t1 * spd);
  vec4 A = texture2D(uLvN, q - oA * 3.4), B = texture2D(uLvN, q + vec2(0.37, 0.61) - oB * 3.4);
  float n = mix(A.r, B.r, wB);
  vec4 CA = texture2D(uLvN, qc - oA * 7.0), CB = texture2D(uLvN, qc + vec2(0.53, 0.29) - oB * 7.0);
  // crust plates riding it (a Worley cell is crust when its id is under the share), their seams glowing
  float share = clamp(mix(0.06, 0.24, cool) + age * 0.18 + (1.0 - heat) * 0.25, 0.0, 0.85);
  float cA = smoothstep(share + 0.03, share - 0.03, CA.g), cB = smoothstep(share + 0.03, share - 0.03, CB.g);
  float iA = smoothstep(0.1, 0.3, CA.b), iB = smoothstep(0.1, 0.3, CB.b);
  float crust = mix(cA * iA, cB * iB, wB) * core, seam = mix(cA * (1.0 - iA), cB * (1.0 - iB), wB) * core;
  float T = heat * (0.4 + 0.62 * n) * (1.0 - 0.08 * cool) + 0.2 * (1.0 - smoothstep(0.0, 0.3, age)) * heat;
  lvEm = lvRamp(T) * core * (1.0 - crust * 0.96) + lvRamp(0.45 + 0.25 * n) * seam * 0.8;
  // the rock: basalt; ropy pahoehoe on the old flows (folds bowed downstream), clinker on the levees,
  // a net of cooling cracks near the channels still glowing dull red
  vec4 G = texture2D(uLvN, p * 1.3 + 0.21), S = texture2D(uLvN, p * 6.0 + 0.53);
  float b = 0.016 + 0.022 * G.r;
  vec3 rock = vec3(b, b * 0.88, b * 0.84);
  float rf = clamp(1.0 - px * 170.0, 0.0, 1.0), gf = clamp(1.0 - px * 500.0, 0.0, 1.0);
  float rope = sin((dot(p, dir) + 5.0 * dn * dn + (G.a - 0.5) * 0.035) * 290.0) * rf;
  float grain = fract(sin(dot(floor(p * 850.0), vec2(12.9898, 78.233))) * 43758.5453) * gf;
  float crack = (1.0 - smoothstep(0.012, 0.05, S.b)) * smoothstep(0.45, 0.7, G.a) * smoothstep(0.3, 0.6, S.r) * clamp(1.0 - px * 60.0, 0.0, 1.0) * (1.0 - core) * (1.0 - smoothstep(0.05, 0.1, dn));
  rock = mix(rock, rock * (1.2 + 0.25 * rope), skirt);
  rock = mix(rock, rock * (0.7 + 0.55 * grain), levee);
  rock *= 1.0 - 0.4 * crack;
  lvEm += vec3(0.8, 0.08, 0.005) * crack * (1.0 - smoothstep(hw * 1.2, hw * 3.0, dn)) * (1.0 - 0.5 * cool);
  vec3 col = mix(rock, vec3(0.2, 0.04, 0.008), core);
  diffuseColor.rgb = mix(col, vec3(0.022, 0.017, 0.015) * (0.7 + 0.6 * n), crust);
  lvR = mix(mix(0.97, 0.55, skirt), 1.0, levee);
  lvR = mix(lvR, 0.4, core * (1.0 - crust));
  lvH = (0.0007 * rope * skirt + 0.0016 * crust - 0.0012 * seam + 0.0006 * grain * levee - 0.0008 * crack) * uLvK;
}`)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = lvR;')
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = lvBump(- vViewPosition, normal, lvH);')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance = lvEm * emissive * 0.625;');
    };
    m.customProgramCacheKey = () => 'lavaG';
    return this.mats.lavaG = this.own(m, 0.55);
  }
  // a lava rover at (x, z) on ground height y, facing ang (board), its sampling arm reaching `reach` ahead
  // into the flow: six wheels on a rocker bogie, a white body with a solar deck, a camera mast, headlights
  lavaRover(K, x, z, y, ang, reach, tipY) {
    const c = Math.cos(ang), s = Math.sin(ang), at = (u, w) => [x + u * c - w * s, z + u * s + w * c], ry = -ang;
    const B = (mat, col, u, yy, w, L, H, D) => { const [px, pz] = at(u, w); K.box(mat, col, px, y + yy, pz, L, H, D, ry); };
    const wheel = this.tex.lavaWheel ||= new THREE.CylinderGeometry(1, 1, 1, 10);
    for (const u of [-0.016, 0, 0.016]) for (const sd of [-1, 1]) { const [px, pz] = at(u, sd * 0.0165); K.add('std', wheel, 0x2a2826, [px, y + 0.0065, pz], [Math.PI / 2, ry, 0, 'YXZ'], [0.0066, 0.005, 0.0066]); }
    B('metal', 0x5a5e64, 0, 0.009, 0, 0.042, 0.003, 0.028);
    B('std', 0xe8e4dc, 0, 0.012, 0, 0.034, 0.011, 0.022);
    B('std', 0xd8741a, 0, 0.0228, 0, 0.035, 0.0016, 0.023);
    B('metal', 0x1b2a48, -0.004, 0.0244, 0, 0.026, 0.0012, 0.02);
    const [mx, mz] = at(0.012, -0.007);
    K.cyl('metal', 0xbfc3c8, mx, y + 0.024, mz, 0.0014, 0.0014, 0.02, 6);
    B('std', 0xe8e4dc, 0.013, 0.043, -0.007, 0.007, 0.005, 0.011);
    B('glow', 0x9fe3ff, 0.0167, 0.0445, -0.007, 0.0008, 0.002, 0.008);
    for (const sd of [-1, 1]) B('glow', 0xfff0c8, 0.0172, 0.0145, sd * 0.0075, 0.0008, 0.003, 0.004);
    const [ax, az] = at(0.017, 0.006), [ex, ez] = at(0.034, 0.007), [tx, tz] = at(reach, 0.007);
    this.strut(K, 'metal', 0xc8ccd2, [ax, y + 0.018, az], [ex, y + 0.034, ez], 0.0015);
    this.strut(K, 'metal', 0xc8ccd2, [ex, y + 0.034, ez], [tx, tipY + 0.003, tz], 0.0013);
    K.ball('glow', 0xffa040, tx, tipY + 0.002, tz, 0.0035);
    const [nx, nz] = at(-0.014, 0.008);
    K.cyl('metal', 0xbfc3c8, nx, y + 0.024, nz, 0.0006, 0.0006, 0.026, 4);
    K.add('blinkA', BALL, 0xffffff, [nx, y + 0.051, nz], [0, 0, 0], 0.0022);
  }
  // a monitoring station at (x, z), ground height y, its thermal camera turned toward ang: a tripod mast with an
  // instrument box, a tilted solar panel, a sensor dome and an amber beacon
  lavaStation(K, x, z, y, ang) {
    const c = Math.cos(ang), s = Math.sin(ang), ry = -ang;
    for (let i = 0; i < 3; i++) { const a = i / 3 * TAU + ang + 0.5; this.strut(K, 'metal', 0x8a8e94, [x + Math.cos(a) * 0.016, y, z + Math.sin(a) * 0.016], [x, y + 0.03, z], 0.0012, 4); }
    K.cyl('metal', 0xa8acb2, x, y, z, 0.0013, 0.0013, 0.075, 6);
    K.box('std', 0xe8e4dc, x, y + 0.012, z, 0.013, 0.011, 0.011, ry);
    K.box('glow', 0x6aff8a, x + c * 0.0066, y + 0.018, z + s * 0.0066, 0.0008, 0.0016, 0.004, ry);
    K.add('metal', BOX, 0x1c2c4a, [x - c * 0.008, y + 0.046, z - s * 0.008], [0, ry, -0.6, 'YXZ'], [0.022, 0.0012, 0.017]);
    K.box('std', 0x4a4e54, x + c * 0.006, y + 0.058, z + s * 0.006, 0.01, 0.006, 0.007, ry);
    K.box('glow', 0xff5a30, x + c * 0.0112, y + 0.059, z + s * 0.0112, 0.0006, 0.003, 0.004, ry);
    K.ball('std', 0xf2f2f0, x, y + 0.075, z, 0.0048, 0.8);
    K.add('blinkA', BALL, 0xffffff, [x, y + 0.082, z], [0, 0, 0], 0.0026);
  }
  // a survey drone circling over the flows (one small mesh turned in tick, as the Ecological Zone's eagles)
  lavaDrone(ctx, x, z, y, rad, speed, seed) {
    const parts = [part(BOX, 0xd8dade, [rad, 0, 0], [0, 0, 0], [0.014, 0.0045, 0.014]), part(BOX, 0x2a2c30, [rad, -0.004, 0], [0, 0, 0], [0.005, 0.004, 0.005])];
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * TAU + Math.PI / 4, ax = rad + Math.cos(a) * 0.013, az = Math.sin(a) * 0.013;
      parts.push(part(BOX, 0x3a3c40, [rad + Math.cos(a) * 0.0065, 0, az / 2], [0, -a, 0], [0.013, 0.0018, 0.0022]));
      parts.push(part(new THREE.CylinderGeometry(0.0075, 0.0075, 0.0008, 12), 0x202224, [ax, 0.0025, az]));
    }
    parts.push(part(BALL, 0xff3a2a, [rad, -0.0065, 0], [0, 0, 0], 0.0022));
    const m = new THREE.Mesh(mergeGeometries(parts), this.mat('std'));
    m.castShadow = true;
    this.spin(this.place(m, ctx, x, z, y), speed, this.env.srand(seed)() * 6);
  }
}
