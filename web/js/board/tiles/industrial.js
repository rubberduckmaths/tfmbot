// industrial.js -- TileArt mixin: the Industrial Center, and the im* helpers it shares with the mining tiles
// (per-pixel surface detail for cladding, plate, concrete and ore; belts, moving vehicles, dust trails).
import * as THREE from 'three';
import { mergeGeometries } from '../../../vendor/BufferGeometryUtils.js';
import { gfx } from '../quality.js';
import { BALL, BALL2, BOX, Kit, TAU, V3, _c, capsuleX, clamp01, fbm2, hash2, lathe, vnoise } from './kit.js';

export class IndustrialArt {
  // ================================================================ Industrial Center / mining tiles: detail and motion
  // (the im* helpers). Props: imSurf materials draw per-pixel surface detail from each part's board-space
  // position and normal (aImL = xyz + kind, aImN; imKind tags the parts, imEmit fills the rest with -1):
  // 0 cladding (panel seams, girts, corrugated roofs, grime at the foot, streaks), 1 welded plate (weld
  // courses, staggered seams, rust runs), 2 concrete (form-tie holes, pour lines, blotches, rain streaks),
  // 3 rusty steel, 4 container (corrugation), 5 rubble (ore heaps: lumps and crevices); -1 none. One
  // program for every base; the detail fades out with distance (fwidth).
  imGLSL() {
    return `float imH(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float imN(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(imH(i), imH(i + vec2(1.0, 0.0)), f.x), mix(imH(i + vec2(0.0, 1.0)), imH(i + vec2(1.0, 1.0)), f.x), f.y); }`;
  }
  imSurf(base = 'std') {
    const key = 'imSurf:' + base;
    if (this.mats[key]) return this.mats[key];
    const [ro, me] = { std: [0.8, 0.08], metal: [0.42, 0.6], matte: [0.97, 0] }[base];
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: ro, metalness: me });
    m.onBeforeCompile = (s) => {
      s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aImL; attribute vec3 aImN; varying vec4 vImL; varying vec3 vImN;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvImL = aImL; vImN = aImN;');
      s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec4 vImL; varying vec3 vImN;\n' + this.imGLSL())
        .replace('#include <color_fragment>', `#include <color_fragment>
{
  float kd = vImL.w;
  if (kd > -0.5) {
    vec3 p = vImL.xyz, n = normalize(vImN);
    float px = max(length(fwidth(p)), 1e-6), fine = clamp(1.0 - px * 220.0, 0.0, 1.0), vfine = clamp(1.0 - px * 650.0, 0.0, 1.0);
    float side = 1.0 - smoothstep(0.55, 0.8, abs(n.y));                      // an upright face
    float h = abs(n.x) > abs(n.z) ? p.z : p.x;                               // along the face
    float blot = imN(p.xz * 90.0 + p.y * 60.0) * 0.6 + imN(p.xz * 310.0 - p.y * 230.0) * 0.4;
    float g = 1.0, tw = 0.0; vec3 tint = vec3(0.42, 0.22, 0.12);
    if (kd < 0.5) {                                                          // cladding
      float seam = smoothstep(0.40, 0.48, abs(fract(h * 120.0) - 0.5)) * side;
      float girt = smoothstep(0.43, 0.49, abs(fract(p.y * 60.0 + 0.5) - 0.5)) * side;
      float rib = (1.0 - side) * (0.5 + 0.5 * sin(h * 1300.0)) * fine;
      float streak = smoothstep(0.55, 0.95, imN(vec2(h * 420.0, p.y * 12.0))) * side;
      g = (1.0 - 0.32 * seam * fine) * (1.0 - 0.16 * girt * fine) * (1.0 - 0.2 * rib) * (1.0 - 0.2 * streak) * mix(0.66, 1.0, smoothstep(0.0, 0.02, p.y)) * (0.94 + 0.12 * blot);
    } else if (kd < 1.5) {                                                   // welded plate
      float cy = p.y * 90.0, an = atan(n.z, n.x) * 2.2 + floor(cy) * 0.5;
      float weld = max(smoothstep(0.43, 0.49, abs(fract(cy) - 0.5)), smoothstep(0.44, 0.49, abs(fract(an) - 0.5))) * side;
      g = (1.0 - 0.3 * weld * fine) * (0.95 + 0.1 * blot) * mix(0.8, 1.0, smoothstep(0.0, 0.015, p.y));
      tw = smoothstep(0.62, 0.95, imN(vec2(an * 5.0, p.y * 22.0))) * side * 0.45;
    } else if (kd < 2.5) {                                                   // concrete
      vec2 q = vec2(h, p.y) * 110.0;
      float tie = smoothstep(0.16, 0.08, length(fract(q) - 0.5)) * side * vfine;
      float lift = smoothstep(0.44, 0.49, abs(fract(p.y * 55.0) - 0.5)) * side;
      float streak = smoothstep(0.5, 0.95, imN(vec2(h * 300.0, p.y * 6.0))) * side;
      g = (0.86 + 0.26 * blot) * (1.0 - 0.35 * tie) * (1.0 - 0.12 * lift * fine) * (1.0 - 0.24 * streak);
    } else if (kd < 3.5) {                                                   // rusty steel
      tw = smoothstep(0.42, 0.8, blot) * 0.6;
      g = 0.88 + 0.22 * imN(p.xz * 520.0 + p.y * 400.0) * vfine;
    } else if (kd < 4.5) {                                                   // container
      float cor = (0.5 + 0.5 * sin(h * 2600.0)) * side * vfine;
      g = (1.0 - 0.2 * cor) * (0.92 + 0.14 * blot);
      tw = smoothstep(0.7, 0.95, blot) * 0.3;
    } else {                                                                 // rubble
      float l1 = imN(p.xz * 700.0 + p.y * 500.0), l2 = imN(p.xz * 230.0 - p.y * 170.0);
      g = (0.72 + 0.5 * l2) * mix(1.0, 0.7 + 0.5 * l1, vfine) * (1.0 - 0.35 * smoothstep(0.3, 0.12, l2) * fine);
    }
    diffuseColor.rgb = mix(diffuseColor.rgb, tint * (0.8 + 0.4 * blot), tw) * g;
  }
}`);
    };
    m.customProgramCacheKey = () => 'imSurf';
    m.userData.imSurf = true;
    this.own(m, base === 'metal' ? 1 : 0.55);
    return this.mats[key] = m;
  }
  // board-space position + kind and normal of a placed part, for imSurf / imFlick
  imAttr(g, kind) {
    const P = g.attributes.position, N = g.attributes.normal, n = P.count, L = new Float32Array(n * 4), Nn = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      L[i * 4] = P.getX(i); L[i * 4 + 1] = P.getY(i); L[i * 4 + 2] = P.getZ(i); L[i * 4 + 3] = kind;
      if (N) { Nn[i * 3] = N.getX(i); Nn[i * 3 + 1] = N.getY(i); Nn[i * 3 + 2] = N.getZ(i); } else Nn[i * 3 + 1] = 1;
    }
    g.setAttribute('aImL', new THREE.BufferAttribute(L, 4)); g.setAttribute('aImN', new THREE.BufferAttribute(Nn, 3));
    return g;
  }
  // the imSurf / imFlick parts fn() adds to K get detail kind `kind`
  imKind(K, kind, fn) {
    const n0 = new Map(); for (const [k, l] of K.by) n0.set(k, l.length);
    fn();
    for (const [k, l] of K.by) if (k.userData?.imSurf || k.userData?.imFlick) for (let i = n0.get(k) ?? 0; i < l.length; i++) this.imAttr(l[i], kind);
  }
  // emit a kit holding imSurf / imFlick batches: untagged parts get kind -1 (plain); a plain 'std' / 'metal' /
  // 'matte' batch is folded into its imSurf twin when the kit has one (one draw less)
  imEmit(K, ctx, o) {
    for (const base of ['std', 'metal', 'matte']) { const L = K.by.get(base), T = this.mats['imSurf:' + base]; if (L && T && K.by.has(T)) { K.by.get(T).push(...L); K.by.delete(base); } }
    for (const [k, l] of K.by) if (k.userData?.imSurf || k.userData?.imFlick) for (const g of l) if (!g.attributes.aImL) this.imAttr(g, -1);
    return this.emit(K, ctx, o);
  }
  // furnace light: a glow that flickers and shimmers (aImL: imKind / imEmit)
  imFlick() {
    if (this.mats.imFlick) return this.mats.imFlick;
    const m = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    m.onBeforeCompile = (s) => {
      s.uniforms.uTime = this.time;
      s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aImL; varying vec4 vImL;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvImL = aImL;');
      s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uTime; varying vec4 vImL;\n' + this.imGLSL())
        .replace('#include <color_fragment>', `#include <color_fragment>
{ vec3 p = vImL.xyz; float t = uTime + (p.x + p.z) * 40.0;
  float f = 0.74 + 0.14 * sin(t * 7.3) * sin(t * 3.1 + 1.7) + 0.2 * (imN(vec2(p.x * 700.0 + p.z * 700.0, p.y * 600.0 - uTime * 4.0)) - 0.5);
  diffuseColor.rgb *= f; }`);
    };
    m.customProgramCacheKey = () => 'imFlick';
    m.userData.shared = true; m.userData.imFlick = true;
    return this.mats.imFlick = m;
  }
  // a conveyor belt: ore lumps riding along it (aImB: distance along the belt in board units, -1..1 across);
  // the part's colour is the ore's. Also a falling stream of ore (along = down).
  imBelt() {
    if (this.mats.imBelt) return this.mats.imBelt;
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.05, side: THREE.DoubleSide });
    m.onBeforeCompile = (s) => {
      s.uniforms.uTime = this.time;
      s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aImB; varying vec2 vImB;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvImB = aImB;');
      s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uTime; varying vec2 vImB;\n' + this.imGLSL())
        .replace('#include <color_fragment>', `#include <color_fragment>
{ float u = vImB.x * 260.0 - uTime * 7.0, c = floor(u), f = fract(u), h = imH(vec2(c, 1.7)), h2 = imH(vec2(c, 5.3));
  vec2 q = vec2(f - 0.5 + (h2 - 0.5) * 0.3, vImB.y * 0.8 + (h - 0.5) * 0.6);
  float rr = 0.24 + 0.16 * h2, lump = smoothstep(rr + 0.1, rr - 0.04, length(q) + (imN(vec2(u * 3.0, vImB.y * 3.0)) - 0.5) * 0.3) * step(0.3, h);
  float bed = smoothstep(0.7, 0.45, abs(vImB.y)) * (0.35 + 0.4 * imN(vec2(u * 1.7, vImB.y * 4.0)));
  float aa = clamp(1.0 - fwidth(u) * 1.2, 0.0, 1.0), ore = mix(0.55, max(lump, bed), aa) * (1.0 - smoothstep(0.8, 0.95, abs(vImB.y)));
  diffuseColor.rgb = mix(vec3(0.07, 0.07, 0.075), diffuseColor.rgb * (0.72 + 0.56 * mix(0.5, h2, aa)), ore); }`);
    };
    m.customProgramCacheKey = () => 'imBelt';
    this.own(m, 0.4);
    return this.mats.imBelt = m;
  }
  // a belt's running surface (imBelt) from a to b (board [x, y, z]), width w
  imBeltGeo(a, b, w) {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dx, dy, dz);
    const g = new THREE.PlaneGeometry(L, w, Math.max(1, Math.round(L / 0.02)), 1).rotateX(-Math.PI / 2);
    const uv = g.attributes.uv, n = uv.count, B = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) { B[i * 2] = uv.getX(i) * L; B[i * 2 + 1] = uv.getY(i) * 2 - 1; }
    g.setAttribute('aImB', new THREE.BufferAttribute(B, 2));
    return g.rotateZ(Math.atan2(dy, Math.hypot(dx, dz))).rotateY(-Math.atan2(dz, dx)).translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  }
  // parts moved on the GPU: imMove tags what fn() adds to K (any key: imAnimMat('std' | 'glow')), imAnimEmit
  // drapes them; kind 0 shuttles along dir with a dwell at each end, 1 spins about the axis dir through the
  // pivot, 2 swings about it (amp radians), 3 turns amp radians in step with a kind-0 shuttle of the same
  // speed and phase (a sheave paying out rope); speed rad/s, phase ph. One draw per material, no CPU per frame.
  imAnimMat(base = 'std') {
    const key = 'imAnim:' + base;
    if (this.mats[key]) return this.mats[key];
    const m = base === 'glow' ? new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }) : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.35 });
    m.onBeforeCompile = (s) => {
      s.uniforms.uTime = this.time;
      const calc = 'float imK = aImC.w, imT = uTime * aImD.w + aImS.x, imA = imK > 2.5 ? aImS.y * smoothstep(-0.75, 0.75, sin(imT)) : imK > 1.5 ? aImS.y * sin(imT) : imT; vec3 imAx = normalize(aImD.xyz + vec3(1e-7)); float imCo = cos(imA), imSi = sin(imA);';
      s.vertexShader = s.vertexShader.replace('#include <common>', `#include <common>
attribute vec4 aImC; attribute vec4 aImD; attribute vec2 aImS; uniform float uTime;
vec3 imRot(vec3 v, vec3 a, float c, float s){ return v * c + cross(a, v) * s + a * dot(a, v) * (1.0 - c); }`)
        .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
{ ${calc} if (imK > 0.5) objectNormal = imRot(objectNormal, imAx, imCo, imSi); }`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
{ ${calc} if (imK < 0.5) transformed += aImD.xyz * smoothstep(-0.75, 0.75, sin(imT)); else transformed = aImC.xyz + imRot(transformed - aImC.xyz, imAx, imCo, imSi); }`);
    };
    m.customProgramCacheKey = () => 'imAnim:' + base;
    if (base === 'glow') m.userData.shared = true; else this.own(m, 0.8);
    return this.mats[key] = m;
  }
  imMove(K, kind, pivot, dir, speed, ph, amp, fn) {
    const n0 = new Map(); for (const [k, l] of K.by) n0.set(k, l.length);
    fn();
    for (const [k, l] of K.by) for (let i = n0.get(k) ?? 0; i < l.length; i++) {
      const g = l[i], n = g.attributes.position.count, C = new Float32Array(n * 4), D = new Float32Array(n * 4), Sx = new Float32Array(n * 2);
      for (let j = 0; j < n; j++) { C[j * 4] = pivot[0]; C[j * 4 + 1] = pivot[1]; C[j * 4 + 2] = pivot[2]; C[j * 4 + 3] = kind; D[j * 4] = dir[0]; D[j * 4 + 1] = dir[1]; D[j * 4 + 2] = dir[2]; D[j * 4 + 3] = speed; Sx[j * 2] = ph; Sx[j * 2 + 1] = amp; }
      g.setAttribute('aImC', new THREE.BufferAttribute(C, 4)); g.setAttribute('aImD', new THREE.BufferAttribute(D, 4)); g.setAttribute('aImS', new THREE.BufferAttribute(Sx, 2));
    }
  }
  // the imMove kit, merged per material, its pivots and vectors carried onto the sphere, draped
  imAnimEmit(K, ctx) {
    const k = this.kOf(ctx.cell), q = this.b.frameAt(ctx.cell, 0, 0, ctx.H, true).q, pv = new V3(), dv = new V3(), out = [];
    for (const [mat, list] of K.by) {
      if (!list.length) continue;
      const geo = mergeGeometries(list);
      if (!geo) { console.warn('tile_art: imAnim merge failed'); continue; }
      const C = geo.attributes.aImC, D = geo.attributes.aImD;
      let lx = NaN, ly = NaN, lz = NaN;
      for (let i = 0; i < C.count; i++) {
        const x = C.getX(i), y = C.getY(i), z = C.getZ(i);
        if (x !== lx || y !== ly || z !== lz) { pv.copy(ctx.cell.proj(x, z, ctx.H + y * k)).sub(ctx.cell.center); lx = x; ly = y; lz = z; }
        C.setXYZ(i, pv.x, pv.y, pv.z);
        dv.set(D.getX(i), D.getY(i), D.getZ(i)).applyQuaternion(q).multiplyScalar(k); D.setXYZ(i, dv.x, dv.y, dv.z);
      }
      this.drape(geo, ctx.cell, ctx.H);
      const m = new THREE.Mesh(geo, mat);
      m.frustumCulled = false; m.receiveShadow = !mat.isMeshBasicMaterial;
      ctx.g.add(m); out.push(m);
    }
    return out;
  }
  // a dust trail riding with a moving vehicle group g (placed: board units, scaled by k): puffs rise from
  // (x, y, z) behind it and drift back (the shared puff material, so no CPU per frame)
  imDustTrail(ctx, g, x, y, z, col, n = 8) {
    const k = this.kOf(ctx.cell), r = this.env.srand(ctx.space * 13 + 7), pos = [], up = [], P = [], dr = [], cl = [];
    for (let i = 0; i < n; i++) {
      pos.push(x + (r() - 0.5) * 0.006, y, z + (r() - 0.5) * 0.02); up.push(0, 1, 0);
      P.push((i + r() * 0.5) / n, 2.2 + r() * 0.8, 0.018, 0.035 * k * (0.8 + r() * 0.4));
      dr.push(-0.03 - r() * 0.02, 0, (r() - 0.5) * 0.03); cl.push(col[0], col[1], col[2], col[3]);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('aUp', new THREE.Float32BufferAttribute(up, 3));
    geo.setAttribute('aP', new THREE.Float32BufferAttribute(P, 4)); geo.setAttribute('aDrift', new THREE.Float32BufferAttribute(dr, 3)); geo.setAttribute('aCol', new THREE.Float32BufferAttribute(cl, 4));
    const pts = new THREE.Points(geo, this.puffMat());
    pts.renderOrder = 8; pts.frustumCulled = false;
    g.add(pts);
    return pts;
  }
  // ground detail for the mining tiles (imGroundAttr sets aImG = board xyz + rock-face weight, aImG2 = distance
  // to a haul road's centreline (tyre tracks; >= 0.02: none), gravel weight, distance along the face (drill
  // half-barrels), sand weight (wind ripples)): strata laminations, half-barrels and joints on the faces,
  // grit and pebbles on the flats, tyre tracks along the roads, ripples in the sand. po: polygon offset (the pit)
  imGround(po = false) {
    const key = po ? 'imGroundPO' : 'imGround';
    if (this.mats[key]) return this.mats[key];
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, ...(po ? { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 } : {}) });
    m.onBeforeCompile = (s) => {
      s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aImG; attribute vec4 aImG2; varying vec4 vImG; varying vec4 vImG2;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvImG = aImG; vImG2 = aImG2;');
      s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec4 vImG; varying vec4 vImG2;\n' + this.imGLSL())
        .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec3 p = vImG.xyz; float px = max(length(fwidth(p)), 1e-6), fine = clamp(1.0 - px * 200.0, 0.0, 1.0), vfine = clamp(1.0 - px * 600.0, 0.0, 1.0);
  float rock = vImG.w, road = vImG2.x, grav = vImG2.y, along = vImG2.z, sand = vImG2.w;
  vec3 c = diffuseColor.rgb * (0.95 + 0.1 * (imH(floor(p.xz * 1500.0)) - 0.5) * 2.0 * vfine);
  vec2 pc = p.xz * 280.0 + imN(p.xz * 50.0) * 1.5, pf = floor(pc); float ph = imH(pf + 7.1);
  float pr = 0.12 + 0.2 * imH(pf + 9.7), peb = smoothstep(pr + 0.1, pr - 0.02, length(fract(pc) - 0.5 + (vec2(imH(pf + 2.3), imH(pf + 4.9)) - 0.5) * 0.4)) * step(0.8, ph) * fine * grav * (1.0 - rock);
  c *= 1.0 - 0.2 * peb * (ph > 0.93 ? -0.7 : 1.0);
  if (sand > 0.02) c *= 1.0 - 0.07 * sand * fine * (0.5 + 0.5 * sin(dot(p.xz, vec2(0.8, 0.6)) * 900.0 + imN(p.xz * 35.0) * 7.0));
  if (road < 0.02) {
    float tr = abs(road), t1 = smoothstep(0.0013, 0.0005, abs(tr - 0.0034)) + smoothstep(0.0013, 0.0005, abs(tr - 0.0092));
    c *= 1.0 - 0.22 * t1 * fine * (0.65 + 0.35 * imN(p.xz * 400.0)) * (1.0 - rock);
  }
  if (rock > 0.02) {
    float yb = p.y + imN(p.xz * 30.0) * 0.004;
    float lam = sin(yb * 1400.0) * fine, sheet = imN(vec2(along * 25.0, yb * 160.0));
    float bar = smoothstep(0.3, 0.46, abs(fract(along * 300.0) - 0.5)) * vfine;
    float joint = smoothstep(0.46, 0.495, abs(fract(along * 45.0 + imN(vec2(yb * 60.0, along * 9.0)) * 0.6) - 0.5)) * fine;
    vec3 f = c * (0.9 + 0.12 * lam + (sheet - 0.5) * 0.44) * (1.0 - 0.26 * bar) * (1.0 - 0.38 * joint);
    c = mix(c, f, rock);
  }
  diffuseColor.rgb = c;
}`);
    };
    m.customProgramCacheKey = () => 'imGround';
    this.own(m, 0.55);
    return this.mats[key] = m;
  }
  // f(x, y, z, normal y) -> [rock, road, gravel, along, sand], per vertex of a ground geometry (board units)
  imGroundAttr(geo, f) {
    const P = geo.attributes.position, N = geo.attributes.normal, n = P.count, a = new Float32Array(n * 4), b = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i), v = f(x, y, z, N ? N.getY(i) : 1);
      a[i * 4] = x; a[i * 4 + 1] = y; a[i * 4 + 2] = z; a[i * 4 + 3] = v[0]; b[i * 4] = v[1]; b[i * 4 + 1] = v[2]; b[i * 4 + 2] = v[3] ?? 0; b[i * 4 + 3] = v[4] ?? 0;
    }
    geo.setAttribute('aImG', new THREE.BufferAttribute(a, 4)); geo.setAttribute('aImG2', new THREE.BufferAttribute(b, 4));
    return geo;
  }
  // the Industrial Center's ground: poured slabs with joints and stains, ballast under the tracks, painted lanes
  indGroundTex() {
    return this.canvas('ind-ground2', 512, 592, (g, w, h) => {
      const HR = this.HEX_R, BW = Math.sqrt(3) * HR * 0.95, BH = 2 * HR * 0.95, px = (x) => (0.5 + x / BW) * w, py = (z) => (0.5 + z / BH) * h, S = w / BW;
      const hw = w >> 1, hh = h >> 1, c2 = document.createElement('canvas'); c2.width = hw; c2.height = hh;   // the concrete's tone at half size, scaled up (4x fewer noise samples)
      const g2 = c2.getContext('2d'), id = g2.createImageData(hw, hh), d = id.data;
      for (let y = 0; y < hh; y++) for (let x = 0; x < hw; x++) {
        const bx = (x / hw - 0.5) * BW, bz = (y / hh - 0.5) * BH, sl = hash2(Math.floor(bx / 0.08 + 50), Math.floor(bz / 0.08 + 50));
        const n = fbm2(x / 7, y / 7, 3), f = vnoise(x / 1.1, y / 1.1), c = 92 + n * 40 + (sl - 0.5) * 14 + (f - 0.5) * 12, i = (y * hw + x) * 4;
        d[i] = c; d[i + 1] = c * 0.98; d[i + 2] = c * 0.94; d[i + 3] = 255;
      }
      g2.putImageData(id, 0, 0); g.imageSmoothingEnabled = true; g.drawImage(c2, 0, 0, w, h);
      const rr = this.env.srand(4711);
      for (let i = 0; i < 7000; i++) { g.fillStyle = i % 2 ? 'rgba(255,250,240,0.14)' : 'rgba(0,0,0,0.16)'; g.fillRect(rr() * w, rr() * h, 1, 1); }   // grit
      for (let i = 0; i < 34; i++) {                                      // oil and rust stains
        const x = px((rr() - 0.5) * 0.9), y = py((rr() - 0.5) * 1.0), R = (0.01 + rr() * 0.03) * S, gr = g.createRadialGradient(x, y, 0, x, y, R);
        gr.addColorStop(0, rr() < 0.3 ? 'rgba(90,50,30,0.3)' : 'rgba(18,16,14,0.32)'); gr.addColorStop(1, 'rgba(18,16,14,0)');
        g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, R, R * (0.5 + rr() * 0.5), rr() * 3, 0, TAU); g.fill();
      }
      g.strokeStyle = 'rgba(30,30,30,0.5)'; g.lineWidth = 1.2;                // slab joints
      for (let x = -0.48; x < 0.5; x += 0.08) { g.beginPath(); g.moveTo(px(x), 0); g.lineTo(px(x), h); g.stroke(); }
      for (let z = -0.56; z < 0.6; z += 0.08) { g.beginPath(); g.moveTo(0, py(z)); g.lineTo(w, py(z)); g.stroke(); }
      const ballast = (pts, wd) => {                                     // track ballast: dark, speckled
        g.lineCap = 'round'; g.lineJoin = 'round';
        g.strokeStyle = '#3e3834'; g.lineWidth = wd * S; g.beginPath(); pts.forEach(([x, z], i) => (i ? g.lineTo(px(x), py(z)) : g.moveTo(px(x), py(z)))); g.stroke();
      };
      ballast([[-0.5, 0.125], [0.5, 0.125]], 0.036); ballast([[0.03, 0.125], [0.08, 0.16], [0.2, 0.16]], 0.034);
      for (let i = 0; i < 2600; i++) {
        const x = (rr() - 0.5), z = rr() < 0.75 ? 0.125 + (rr() - 0.5) * 0.034 : 0.16 + (rr() - 0.5) * 0.03;
        if (z > 0.145 && x < 0.07) continue;
        const v = 50 + rr() * 60; g.fillStyle = `rgb(${v},${v * 0.94},${v * 0.88})`; g.fillRect(px(x), py(z), 1.4, 1.4);
      }
      g.lineCap = 'butt';
      g.strokeStyle = 'rgba(236,232,220,0.75)'; g.lineWidth = 1.4;           // the lane: white edges, a yellow dashed centre
      for (const z of [0.168, 0.212]) { g.beginPath(); g.moveTo(px(-0.5), py(z)); g.lineTo(px(0.5), py(z)); g.stroke(); }
      g.strokeStyle = '#e8c020'; g.lineWidth = 1.6; g.setLineDash([7, 6]);
      g.beginPath(); g.moveTo(px(-0.5), py(0.19)); g.lineTo(px(0.5), py(0.19)); g.stroke(); g.setLineDash([]);
      g.fillStyle = 'rgba(236,232,220,0.7)';                               // a crossing to the office
      for (let i = 0; i < 5; i++) g.fillRect(px(-0.1 + i * 0.012), py(0.17), 0.006 * S, 0.04 * S);
      g.save(); g.beginPath(); g.rect(px(-0.37), py(0.19), 0.22 * S, 0.01 * S); g.clip();   // hazard band along the dock
      g.fillStyle = '#e8c020'; g.fillRect(px(-0.37), py(0.19), 0.22 * S, 0.01 * S); g.fillStyle = '#222';
      for (let x = -0.38; x < -0.14; x += 0.012) { g.beginPath(); g.moveTo(px(x), py(0.2)); g.lineTo(px(x + 0.006), py(0.2)); g.lineTo(px(x + 0.016), py(0.19)); g.lineTo(px(x + 0.01), py(0.19)); g.fill(); }
      g.restore();
      g.strokeStyle = 'rgba(20,18,16,0.22)'; g.lineWidth = 2.2;              // tyre marks
      for (let i = 0; i < 6; i++) { const x = px((rr() - 0.5) * 0.7), y = py(0.19 + (rr() - 0.5) * 0.03), R = (0.05 + rr() * 0.08) * S; g.beginPath(); g.arc(x, y - R, R, 0.6 + rr(), 1.6 + rr()); g.stroke(); }
      g.fillStyle = 'rgba(22,22,22,0.7)';                                   // drains
      for (const [x, z] of [[-0.02, -0.05], [0.2, 0.2], [-0.35, -0.3], [0.3, -0.26]]) g.fillRect(px(x) - 3, py(z) - 3, 6, 6);
    });
  }

  // Industrial Center: a foundry and refinery works. Panel-clad sawtooth halls with lit north lights, the
  // foundry's doors glowing with the melt; a melt-shop tower ducted to three banded smokestacks trailing
  // smoke; a concrete cooling tower on its legs, steaming; welded tanks in their bunds and a gas sphere; a
  // two-tier pipe rack; a belt carrying ore up from the stockpile; a container yard whose gantry crane
  // shuttles a box along its girders over the rail siding, where a shunting loco works; a lorry on the
  // lane; an office block with lit windows. Detail and motion: the im* helpers above.
  industrial(ctx) {
    const r = this.env.srand(ctx.space * 47 + 5), low = gfx.low, M = this.minePieces();
    ctx.wall(0x2e2f33);
    const tm = this.mats.indG2 ||= this.own(new THREE.MeshStandardMaterial({ map: this.indGroundTex(), roughness: 0.9 }));
    this.groundMesh(ctx, () => 0, () => _c.setRGB(1, 1, 1), { sub: 6, uv: true, mat: tm });
    const K = new Kit(), Kb = new Kit(), S = this.imSurf('std'), Mt = this.imSurf('metal'), FL = this.imFlick();
    const A = new Kit(), AS = this.imAnimMat('std');
    // moving parts: on the GPU (A); Low: standing still in K
    const mv = (kind, pv, dir, sp, ph, amp, fn) => (low ? fn(K, S, 'glow') : this.imMove(A, kind, pv, dir, sp, ph, amp, () => fn(A, AS, AS)));   // (moving lamps: plain bright paint, one draw)
    const wallC = 0xbab4a8, roofC = 0x7e858e, trim = 0x4a4d54, yel = 0xe0b020, cc = [0xc0392b, 0x2980b9, 0x27ae60, 0xd68910, 0x8e44ad, 0x7f8c8d];
    // ---- the halls: panel-clad, sawtooth roofs with lit north lights, eaves trim, downpipes
    const hall = (x, z, w, d, h, n, col) => {
      const step = w / n;
      this.imKind(K, 0, () => {
        K.box(S, col, x, 0, z, w, h, d);
        for (let i = 0; i < n; i++) {
          const pr = new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(-step / 2, 0), new THREE.Vector2(step / 2, 0), new THREE.Vector2(step / 2, 0.035)]), { depth: d, bevelEnabled: false });
          K.add(S, pr, roofC, [x - w / 2 + step * (i + 0.5), h, z - d / 2]);
        }
      });
      for (let i = 0; i < n; i++) K.box('glow', 0xffd890, x - w / 2 + step * (i + 1) - 0.002, h + 0.004, z, 0.003, 0.026, d * 0.96);
      K.box(Mt, trim, x, h - 0.003, z, w + 0.004, 0.004, d + 0.004);
      for (const s of [-1, 1]) K.box(Mt, 0x5a5e66, x + s * (w / 2 - 0.008), 0, z + d / 2 + 0.002, 0.003, h - 0.003, 0.003);
    };
    // the foundry: its doors open on the melt, windows along the top, fume hoods on the roof
    const [ax, az, aw, ad, ah] = [-0.14, -0.17, 0.3, 0.2, 0.07], fz = az + ad / 2;
    hall(ax, az, aw, ad, ah, 5, wallC);
    for (const dx of [-0.2, -0.075]) {
      K.box(Mt, 0x34363a, dx, 0, fz + 0.001, 0.046, 0.05, 0.002);
      K.box(FL, (X, Yy) => _c.setRGB(1, Math.max(0.1, 0.42 - Yy * 6), 0.06), dx, 0.001, fz + 0.0022, 0.036, 0.043, 0.0015);
      Kb.add('beam', new THREE.PlaneGeometry(0.08, 0.08, 1, 6).rotateX(-Math.PI / 2), (X, Yy, Z) => _c.setRGB(1, 0.38, 0.08).multiplyScalar(2.6 * clamp01(1 - (Z - fz) / 0.08) ** 2), [dx, 0.0015, fz + 0.04]);
    }
    for (let i = 0; i < 12; i++) { const x = ax - aw / 2 + 0.015 + i * (aw - 0.03) / 11; if (Math.abs(x + 0.2) > 0.03 && Math.abs(x + 0.075) > 0.03) K.box('glow', 0xffe0a0, x, 0.02, fz + 0.001, 0.014, 0.012, 0.002); K.box('glow', 0xffe0a0, x, 0.054, fz + 0.001, 0.016, 0.007, 0.002); }
    for (const [x, z] of [[-0.03, -0.2], [-0.03, -0.13]]) { this.imKind(K, 3, () => K.box(Mt, 0x7a6a5a, x, ah + 0.02, z, 0.022, 0.02, 0.018)); K.cyl(Mt, 0x5a5e66, x, ah + 0.04, z, 0.004, 0.004, 0.025, 8); }
    // the warehouse: shutter doors on the dock, lamps over them
    hall(-0.26, 0.26, 0.22, 0.12, 0.06, 4, 0xc6c0b2);
    for (const x of [-0.33, -0.26, -0.19]) { this.imKind(K, 4, () => K.box(S, 0x6a6e74, x, 0, 0.2 - 0.001, 0.036, 0.04, 0.002)); K.box('glow', 0xfff2d0, x, 0.046, 0.199, 0.01, 0.003, 0.003); }
    // ---- the melt shop: a tall clad tower, its tapping door lit, a rusty fume duct to the big stack
    const tw = [0.06, -0.225];
    this.imKind(K, 0, () => { K.box(S, 0x9a9288, tw[0], 0, tw[1], 0.07, 0.125, 0.075); K.add(S, M.roof, roofC, [tw[0], 0.125, tw[1]], [0, Math.PI / 2, 0], [0.079, 0.028, 0.074]); });
    K.box(Mt, 0x34363a, tw[0], 0, tw[1] + 0.0385, 0.028, 0.034, 0.002);
    K.box(FL, (X, Yy) => _c.setRGB(1, Math.max(0.12, 0.5 - Yy * 8), 0.07), tw[0], 0.001, tw[1] + 0.0396, 0.02, 0.028, 0.0015);
    Kb.add('beam', new THREE.PlaneGeometry(0.05, 0.05, 1, 6).rotateX(-Math.PI / 2), (X, Yy, Z) => _c.setRGB(1, 0.38, 0.08).multiplyScalar(2.4 * clamp01(1 - (Z - tw[1] - 0.0375) / 0.05) ** 2), [tw[0], 0.0015, tw[1] + 0.0625]);
    for (let i = 0; i < 3; i++) K.box('glow', 0xffd8a0, tw[0] - 0.02 + i * 0.02, 0.095, tw[1] + 0.0385, 0.01, 0.012, 0.002);
    this.imKind(K, 3, () => { this.strut(K, Mt, 0x7a5e4a, [0.078, 0.11, -0.25], [0.112, 0.2, -0.325], 0.009, 8); });
    // ---- smokestacks: concrete, tapered, red/white bands at the top, a gallery, a red light
    const stacks = [[0.12, -0.34, 0.42], [0.2, -0.3, 0.36], [0.07, -0.02, 0.3]];
    for (const [x, z, h] of stacks) {
      this.imKind(K, 2, () => K.cyl(S, 0xc8c0b4, x, 0, z, 0.03, 0.02, h, 20));
      for (let i = 0; i < 3; i++) K.cyl(S, i % 2 ? 0xf2f2ee : 0xc8281e, x, h - 0.06 + i * 0.02, z, 0.0205 + (2 - i) * 0.001, 0.0203, 0.02, 20);
      K.add(Mt, new THREE.TorusGeometry(0.021, 0.004, 6, 20).rotateX(Math.PI / 2), trim, [x, h, z]);
      const gy = h * 0.62, gr = 0.03 - 0.01 * 0.62;
      K.cyl(Mt, 0x4a4e54, x, gy, z, gr + 0.008, gr + 0.008, 0.0016, 20);
      if (!low) K.add(Mt, new THREE.TorusGeometry(gr + 0.0075, 0.0009, 4, 24).rotateX(Math.PI / 2), 0x8a8e96, [x, gy + 0.007, z]);
      K.add('blink', BALL, 0xffffff, [x + 0.022, h - 0.01, z], [0, 0, 0], 0.006);
    }
    // ---- the cooling tower: a concrete shell on a ring of raking columns over its basin, steaming
    const ct = [0.32, -0.1];
    this.imKind(K, 2, () => {
      K.add(S, lathe([[0.1, 0.018], [0.086, 0.07], [0.068, 0.155], [0.07, 0.2], [0.077, 0.23]], 40), 0xb8b2a6, [ct[0], 0, ct[1]]);
      const nc = low ? 12 : 24;
      for (let i = 0; i < nc; i++) { const a = i / nc * TAU, b = a + (i % 2 ? 1 : -1) * TAU / nc; this.strut(K, S, 0xa8a296, [ct[0] + Math.cos(b) * 0.1, 0, ct[1] + Math.sin(b) * 0.1], [ct[0] + Math.cos(a) * 0.099, 0.02, ct[1] + Math.sin(a) * 0.099], 0.0028, 5); }
    });
    K.add(Mt, new THREE.TorusGeometry(0.077, 0.0025, 6, 40).rotateX(Math.PI / 2), 0x9a948a, [ct[0], 0.23, ct[1]]);
    K.add(S, new THREE.CircleGeometry(0.096, 32).rotateX(-Math.PI / 2), 0x2c3a40, [ct[0], 0.004, ct[1]]);                    // the basin
    K.add('glow', new THREE.RingGeometry(0.01, 0.07, 24).rotateX(-Math.PI / 2), 0x402818, [ct[0], 0.15, ct[1]]);
    // ---- the tank farm: welded tanks with roof rails and ladders in low bund walls, a gas sphere on legs
    for (const [x, z, s] of [[0.39, 0.02, 0.8], [0.17, 0.3, 0.85]]) {
      if (this.env.inClearing(x, z, 0.02) || this.edgeDist(x, z) < 0.045 * s + 0.012) continue;
      this.imKind(K, 1, () => K.add(Mt, lathe([[0.001, 0], [0.045, 0], [0.045, 0.06], [0.036, 0.075], [0.001, 0.08]], 32), 0xd8dcdf, [x, 0, z], [0, 0, 0], s));
      K.cyl(S, 0x2a6ac0, x, 0.036 * s, z, 0.0456 * s, 0.0456 * s, 0.009 * s, 32);
      K.add(Mt, new THREE.TorusGeometry(0.043 * s, 0.0008, 4, 32).rotateX(Math.PI / 2), 0xe8c020, [x, 0.067 * s, z]);
      K.box(Mt, 0x5a5e66, x, 0, z + 0.0462 * s, 0.005, 0.064 * s, 0.0016);
      if (!low) this.imKind(K, 2, () => { const b = 0.062 * s; for (const [dx, dz, w, dd] of [[0, -b, 2 * b, 0.004], [0, b, 2 * b, 0.004], [-b, 0, 0.004, 2 * b], [b, 0, 0.004, 2 * b]]) K.box(S, 0xa8a298, x + dx, 0, z + dz, w, 0.007, dd); });
    }
    { const x = 0.05, z = 0.29, R = 0.034, y = 0.05;
      this.imKind(K, 1, () => K.add(Mt, BALL2, 0xe6e8ea, [x, y, z], [0, 0, 0], R));
      K.add(Mt, new THREE.TorusGeometry(R * 1.005, 0.0016, 4, 32).rotateX(Math.PI / 2), 0x6a6e76, [x, y, z]);
      for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + 0.3; K.cyl(Mt, 0x8a8e96, x + Math.cos(a) * R * 0.98, 0, z + Math.sin(a) * R * 0.98, 0.0024, 0.0024, y, 6); }
      K.cyl(Mt, 0x5a5e66, x, y + R - 0.002, z, 0.008, 0.008, 0.004, 12); }
    // ---- the pipe rack: T-bents, two tiers, five lines; one drops into the big tank
    const rz = 0.035, rx0 = 0.03, rx1 = 0.34;
    for (let i = 0; i <= 6; i++) {
      const x = rx0 + (rx1 - rx0) * i / 6;
      for (const s of [-1, 1]) K.box(Mt, 0x5a5e66, x, 0, rz + s * 0.012, 0.004, 0.072, 0.004);
      for (const y of [0.046, 0.068]) K.box(Mt, 0x6a6e76, x, y, rz, 0.004, 0.004, 0.03);
    }
    for (const [rad, col, y, dz] of [[0.0055, 0xd8d8d0, 0.05, -0.006], [0.004, 0xa05a2a, 0.05, 0.005], [0.0035, 0x3a7ac0, 0.072, -0.008], [0.003, 0x2e8a4a, 0.072, 0], [0.0045, 0x6a7078, 0.072, 0.008]]) {
      K.add(Mt, new THREE.CylinderGeometry(rad, rad, rx1 - rx0 + 0.02, 10).rotateZ(Math.PI / 2), col, [(rx0 + rx1) / 2, y + rad, rz + dz]);
    }
    K.cyl(Mt, 0xd8d8d0, rx1 + 0.012, 0.03, rz - 0.006, 0.0055, 0.0055, 0.026, 10);
    // ---- the belt: ore from the stockpile up to the foundry's gable, a hopper at its foot
    const oreC = 0x5a4a40, b0 = [-0.372, 0.016, 0.0], b1 = [-0.312, 0.086, -0.128];
    this.imKind(K, 5, () => K.add(S, M.heap, (X, Yy) => _c.set(oreC).multiplyScalar(0.75 + Yy * 7), [-0.405, 0, 0.03], [0, r() * 6, 0], [0.09, 0.08, 0.09]));
    { const dx = b1[0] - b0[0], dy = b1[1] - b0[1], dz = b1[2] - b0[2], L = Math.hypot(dx, dz), yaw = -Math.atan2(dz, dx), tilt = Math.atan2(dy, L), Ls = Math.hypot(L, dy);
      K.add(Mt, BOX, 0x6a7078, [(b0[0] + b1[0]) / 2, (b0[1] + b1[1]) / 2 - 0.003, (b0[2] + b1[2]) / 2], [0, yaw, tilt, 'YXZ'], [Ls, 0.004, 0.014]);
      K.add(this.imBelt(), this.imBeltGeo([b0[0], b0[1] + 0.0002, b0[2]], [b1[0], b1[1] + 0.0002, b1[2]], 0.009), 0x8a7058);
      for (const s of [-1, 1]) K.add(Mt, BOX, 0x9aa0a8, [(b0[0] + b1[0]) / 2 - s * 0.0075 * dz / L, (b0[1] + b1[1]) / 2 + 0.001, (b0[2] + b1[2]) / 2 + s * 0.0075 * dx / L], [0, yaw, tilt, 'YXZ'], [Ls, 0.003, 0.0015]);   // side rails
      for (let i = 1; i <= 3; i++) { const t = i / 4; K.cyl(Mt, 0x50545a, b0[0] + dx * t, 0, b0[2] + dz * t, 0.0026, 0.0026, b0[1] + dy * t - 0.004, 6); }
      K.add(Mt, M.frustum, 0x6a6e74, [b0[0] - 0.004, b0[1] + 0.004, b0[2] + 0.004], [Math.PI, 0, 0], [0.026, 0.016, 0.026]);
      this.imKind(K, 0, () => K.box(S, 0x8a8478, -0.305, 0, -0.14, 0.03, 0.1, 0.034)); K.box('glow', 0xffe0a0, -0.305, 0.07, -0.1225, 0.012, 0.008, 0.002); }
    // ---- the container yard under the gantry crane, flats with boxes on the main track
    for (let c = 0; c < 4; c++) for (let row = 0; row < 2; row++) {
      const x = -0.205 + c * 0.052, z = 0.062 + row * 0.034, n = r() < 0.55 ? 1 : 2;
      if (r() < 0.12) continue;
      for (let j = 0; j < n; j++) this.imKind(K, 4, () => K.box(S, cc[Math.floor(r() * 6)], x, j * 0.021, z, 0.048, 0.02, 0.027));
    }
    for (const x of [-0.2, -0.125]) {
      K.box(Mt, 0x3a3c40, x, 0.006, 0.125, 0.062, 0.005, 0.018);
      for (const dx of [-0.02, 0.02]) K.add(Mt, M.wheel, 0x222326, [x + dx, 0.0045, 0.125], [0, 0, 0], [0.0045, 0.0045, 0.02]);
      this.imKind(K, 4, () => K.box(S, cc[Math.floor(r() * 6)], x, 0.011, 0.125, 0.056, 0.02, 0.02));
    }
    for (const x of [-0.25, 0.0]) {
      for (const z of [0.03, 0.15]) K.box(Mt, yel, x, 0, z, 0.008, 0.1, 0.008);
      for (const z of [0.03, 0.15]) K.box(Mt, yel, x, 0, z, 0.012, 0.007, 0.03);   // the bogies under the legs
      K.box(Mt, yel, x, 0.1, 0.09, 0.01, 0.01, 0.13);                             // end ties
      if (!low) for (const z of [0.03, 0.15]) this.strut(K, Mt, yel, [x, 0.074, z], [x + (x < -0.1 ? 0.022 : -0.022), 0.1, z], 0.0018, 5);   // knee braces
    }
    for (const z of [0.03, 0.15]) K.box(Mt, yel, -0.125, 0.1, z, 0.262, 0.012, 0.01);  // the girders
    this.imKind(K, 0, () => K.box(S, 0xe8e4d8, -0.25, 0.11, 0.05, 0.02, 0.016, 0.022)); K.box('glow', 0xbfe4ff, -0.239, 0.118, 0.05, 0.001, 0.006, 0.016);
    K.add('blink', BALL, 0xffffff, [0.0, 0.113, 0.09], [0, 0, 0], 0.004);
    mv(0, [0, 0, 0], [0.15, 0, 0], 0.3, r() * 6, 0, (Kt, sk) => {             // the trolley, a box on its spreader
      for (const dx of [-0.012, 0.012]) Kt.box(sk, 0xb8901a, -0.2 + dx, 0.11, 0.09, 0.005, 0.007, 0.13);
      Kt.box(sk, 0xe8e4d8, -0.2, 0.112, 0.09, 0.022, 0.014, 0.032); Kt.box(sk, 0x6a6e76, -0.2, 0.126, 0.09, 0.024, 0.002, 0.034);
      for (const [dx, dz] of [[-0.01, 0.08], [0.01, 0.08], [-0.01, 0.1], [0.01, 0.1]]) Kt.box(sk, 0x1a1a1a, -0.2 + dx, 0.082, dz, 0.0008, 0.028, 0.0008);
      Kt.box(sk, yel, -0.2, 0.079, 0.09, 0.052, 0.003, 0.03);
      Kt.box(sk, cc[Math.floor(r() * 6)], -0.2, 0.058, 0.09, 0.048, 0.02, 0.027);
    });
    // ---- the rails: the main track across the tile, a siding off it; sleepers, a buffer stop
    const rail = (a, b, sleep) => {
      const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz), ang = -Math.atan2(dz, dx), nx = -dz / L, nz = dx / L;
      for (const s of [-1, 1]) K.box(Mt, 0xaab0b8, (a[0] + b[0]) / 2 + nx * s * 0.007, 0.002, (a[1] + b[1]) / 2 + nz * s * 0.007, L + 0.001, 0.0028, 0.0022, ang);
      const n = Math.floor(L / (low ? 0.026 : 0.013));
      if (sleep) for (let i = 0; i <= n; i++) { const t = (i + 0.5) / (n + 1); K.box('std', 0x4a3c30, a[0] + dx * t, 0, a[1] + dz * t, 0.004, 0.002, 0.026, ang); }
    };
    rail([-0.475, 0.125], [0.475, 0.125], true); rail([0.03, 0.125], [0.08, 0.16], false); rail([0.08, 0.16], [0.2, 0.16], true);
    K.box(S, 0xc8281e, 0.203, 0, 0.16, 0.005, 0.012, 0.02);
    // tank wagons on the siding
    for (const x of [0.105, 0.165]) {
      K.box(Mt, 0x3a3c40, x, 0.006, 0.16, 0.052, 0.004, 0.016);
      for (const dx of [-0.018, 0.018]) K.add(Mt, M.wheel, 0x222326, [x + dx, 0.0045, 0.16], [0, 0, 0], [0.0045, 0.0045, 0.018]);
      this.imKind(K, 1, () => K.add(Mt, capsuleX(0.009, 0.034, 14), x < 0.13 ? 0x2a2c30 : 0xd8d8d0, [x, 0.019, 0.16], [0, 0, 0], 1, { smooth: true }));
      K.cyl(Mt, 0x5a5e66, x, 0.027, 0.16, 0.003, 0.003, 0.004, 8);
    }
    // the shunting loco working the main track east of the gantry (A: the GPU moves it)
    mv(0, [0, 0, 0], [0.17, 0, 0], 0.22, r() * 6, 0, (Kt, sk, gk) => {
      const x = 0.05, z = 0.125;
      Kt.box(sk, 0x2a2c30, x, 0.006, z, 0.056, 0.005, 0.02);
      Kt.box(sk, 0xe8b020, x - 0.008, 0.011, z, 0.034, 0.015, 0.016);
      Kt.box(sk, 0xe8b020, x + 0.017, 0.011, z, 0.016, 0.024, 0.02); Kt.box(sk, 0x2a2c30, x + 0.017, 0.035, z, 0.018, 0.002, 0.022);
      Kt.box(gk, 0x9fd8ff, x + 0.017, 0.026, z, 0.0165, 0.006, 0.0205);
      for (const e of [-1, 1]) Kt.box(sk, 0xc8281e, x + e * 0.0282, 0.004, z, 0.001, 0.004, 0.02);
      for (const dx of [-0.018, 0.018]) Kt.add(sk, M.wheel, 0x222326, [x + dx, 0.0045, z], [0, 0, 0], [0.0045, 0.0045, 0.019]);
      Kt.box(gk, 0xfff4d0, x + 0.0285, 0.016, z, 0.001, 0.004, 0.006); Kt.box(gk, 0xfff4d0, x - 0.0255, 0.016, z, 0.001, 0.004, 0.006);
      Kt.cyl(sk, 0x3a3a3a, x - 0.015, 0.026, z, 0.002, 0.002, 0.006, 6);
    });
    // the lorry running the lane (A)
    mv(0, [0, 0, 0], [0.29, 0, 0], 0.16, r() * 6, 0, (Kt, sk, gk) => {
      const x = -0.115, z = 0.19;
      this.imKind(Kt, 4, () => Kt.box(sk, 0xe8e6e0, x - 0.008, 0.007, z, 0.04, 0.02, 0.017));
      Kt.box(sk, 0xc0392b, x + 0.02, 0.005, z, 0.014, 0.016, 0.017); Kt.box(gk, 0x9fd8ff, x + 0.0272, 0.013, z, 0.0006, 0.005, 0.014);
      Kt.box(sk, 0x2a2c30, x, 0.002, z, 0.052, 0.004, 0.015);
      for (const dx of [-0.02, -0.01, 0.018]) Kt.add(sk, M.wheel, 0x1e1f22, [x + dx, 0.0035, z], [0, 0, 0], [0.0035, 0.0035, 0.018]);
      Kt.box(gk, 0xfff4d0, x + 0.0273, 0.007, z - 0.006, 0.0008, 0.002, 0.003); Kt.box(gk, 0xfff4d0, x + 0.0273, 0.007, z + 0.006, 0.0008, 0.002, 0.003);
      Kt.box(gk, 0xff3020, x - 0.0283, 0.006, z - 0.006, 0.0008, 0.002, 0.003); Kt.box(gk, 0xff3020, x - 0.0283, 0.006, z + 0.006, 0.0008, 0.002, 0.003);
    });
    // ---- lamp posts along the lane, their light on the ground
    for (const x of [-0.135, 0.0, 0.14]) {
      K.cyl(Mt, 0x5a5e66, x, 0, 0.222, 0.0018, 0.0014, 0.07, 6); K.box(Mt, 0x5a5e66, x, 0.068, 0.216, 0.003, 0.003, 0.014); K.box('glow', 0xfff0c8, x, 0.065, 0.211, 0.006, 0.002, 0.006);
      if (!low) Kb.add('beam', new THREE.ConeGeometry(0.032, 0.064, 16, 1, true).translate(0, -0.032, 0), (X, Yy) => _c.setRGB(1, 0.94, 0.8).multiplyScalar(0.14 * clamp01((Yy - 0.001) / 0.064) ** 0.6), [x, 0.065, 0.211]);
    }
    // ---- the office block: lit windows on both long faces, plant on the roof
    { const x = -0.075, z = 0.27, w = 0.084, d = 0.046, h = 0.05;
      this.imKind(K, 0, () => K.box(S, 0xd8d4c8, x, 0, z, w, h, d)); K.box(S, 0x9a9ea4, x, h, z, w + 0.003, 0.003, d + 0.003);
      for (const s of [-1, 1]) for (let row = 0; row < 3; row++) for (let i = 0; i < 6; i++) {
        const lit = hash2(i + row * 7 + ctx.space, s) > 0.3;
        K.box(lit ? 'glow' : 'std', lit ? 0xffe6b0 : 0x2a3440, x - w / 2 + 0.01 + i * (w - 0.02) / 5, 0.008 + row * 0.014, z + s * (d / 2 + 0.0008), 0.009, 0.007, 0.0012);
      }
      K.box(Mt, 0x8a8e96, x - 0.02, h + 0.003, z, 0.016, 0.008, 0.014); K.box(Mt, 0x8a8e96, x + 0.015, h + 0.003, z - 0.006, 0.012, 0.006, 0.012);
      K.cyl(Mt, 0x8a8e96, x + 0.03, h + 0.003, z + 0.012, 0.001, 0.001, 0.04, 4); K.add('blink', BALL, 0xffffff, [x + 0.03, h + 0.044, z + 0.012], [0, 0, 0], 0.0035); }
    this.imEmit(K, ctx);
    for (const m of this.emit(Kb, ctx, { shadow: false })) m.renderOrder = 7;
    if (!low) for (const m of this.imAnimEmit(A, ctx)) m.castShadow = false;
    const soot = 0.35 + 0.35 * clamp01((this.st.gen - 1) / 8);
    this.puffs(ctx, [...stacks.map(([x, z, h], i) => ({ x, z, y: h + 0.01, n: 9, life: 6, rise: 0.22, size: 0.12, col: i === 0 ? [0.26, 0.25, 0.25, soot + 0.1] : [0.34, 0.33, 0.32, soot], drift: [0.2, 0.02], jit: 0.01 })),
      { x: ct[0], z: ct[1], y: 0.24, n: 8, life: 5, rise: 0.35, size: 0.15, col: [0.96, 0.96, 0.96, 0.42], drift: [0.1, -0.05], jit: 0.04 },
      ...(low ? [] : [[-0.03, -0.2], [-0.03, -0.13]].map(([x, z]) => ({ x, z, y: ah + 0.07, n: 3, life: 3.5, rise: 0.08, size: 0.05, col: [0.92, 0.9, 0.88, 0.3], drift: [0.05, 0], jit: 0.005 }))),
      ...(low ? [] : [{ x: tw[0], z: tw[1] + 0.045, y: 0.01, n: 3, life: 3, rise: 0.05, size: 0.04, col: [1, 0.62, 0.3, 0.22], drift: [0.01, 0.02], jit: 0.01 }])]);
    this.emblem(ctx, 'industrial_center', -0.25, 0.08, 0.28, 0.28);
  }
}
