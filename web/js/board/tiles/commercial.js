// commercial.js -- TileArt mixin: the Commercial District, a neon market hub of glass towers, holo billboards,
// a market plaza and circling air-cars, with its ground, glass and hologram materials.
import { gfx } from '../quality.js';
import * as THREE from 'three';
import { mergeGeometries } from '../../../vendor/BufferGeometryUtils.js';
import { BALL, BOX, Kit, TAU, _c, capsuleX, hash2, part } from './kit.js';

export class CommercialArt {
  // Commercial District: a neon market hub -- glass towers edged in neon,
  // holo billboards, a market plaza of lit stalls round a hologram of the
  // district's symbol, air-cars circling the towers.
  commercial(ctx) {
    const r = this.env.srand(ctx.space * 61 + 3), HR = this.HEX_R, g = this.grow, low = gfx.low, hs = (i, j) => hash2(i * 7.3 + ctx.space * 0.37, j + 1.9);
    ctx.wall(0x1c1a26);
    const tex = () => this.canvas('com-ground', 256, 296, (cg, w, h) => {
      const px = (x) => (0.5 + x / (Math.sqrt(3) * HR * 0.95)) * w, py = (z) => (0.5 + z / (2 * HR * 0.95)) * h, S = w / (Math.sqrt(3) * HR * 0.95);
      cg.fillStyle = '#23212c'; cg.fillRect(0, 0, w, h);
      for (let i = 0; i < 400; i++) { cg.fillStyle = `rgba(255,255,255,${0.02 + Math.random() * 0.03})`; cg.fillRect(Math.random() * w, Math.random() * h, 3, 3); }
      cg.strokeStyle = 'rgba(255,60,200,0.9)'; cg.lineWidth = 2; cg.shadowColor = '#ff3cc8'; cg.shadowBlur = 6;
      cg.beginPath(); cg.arc(px(-0.04), py(0.02), 0.15 * S, 0, TAU); cg.stroke();
      cg.strokeStyle = 'rgba(40,230,255,0.9)'; cg.shadowColor = '#28e6ff';
      cg.beginPath(); cg.arc(px(-0.04), py(0.02), 0.1 * S, 0, TAU); cg.stroke();
      for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; cg.beginPath(); cg.moveTo(px(-0.04 + Math.cos(a) * 0.15), py(0.02 + Math.sin(a) * 0.15)); cg.lineTo(px(-0.04 + Math.cos(a) * 0.42), py(0.02 + Math.sin(a) * 0.42)); cg.stroke(); }
      cg.shadowBlur = 0;
    });
    // the ground: neon rings and spokes round the plaza (the canvas at Low; comGroundMat draws them per pixel,
    // crisp close up, with dark floor panels, a tron grid, light running in along the six walkways and a
    // ripple going out from the dais every few seconds)
    const tm = low ? (this.mats.comG ||= this.own(new THREE.MeshStandardMaterial({ map: tex(), emissiveMap: tex(), emissive: 0xffffff, emissiveIntensity: 0.5, roughness: 0.4, metalness: 0.3 }))) : this.comGroundMat();
    this.groundMesh(ctx, () => 0, () => _c.setRGB(1, 1, 1), { sub: 6, uv: true, mat: tm });
    const K = new Kit(), neon = [0xff3cc8, 0x28e6ff, 0xffd23c, 0x8a5cff, 0x3cff9a], GL = low ? 'glass' : this.comGlassMat(), HM = this.comHoloMat();
    const hol = (slot, ph, rep = 0) => new THREE.Color().setRGB(slot / 8, ph, rep / 8);          // (comHoloMat: which ad, its phase, a scroll's repeats)
    const pcx = -0.04, pcz = 0.02;
    // towers round the plaza (skip the owner's marker)
    const spots = [];
    for (let i = 0; i < 11; i++) {
      const a = i / 11 * TAU + 0.3, d = 0.3 + (i % 2) * 0.06, x = pcx + Math.cos(a) * d, z = pcz + Math.sin(a) * d * 0.95;
      if (this.edgeDist(x, z) < 0.05 || this.env.inClearing(x, z, 0.04)) continue;
      spots.push([x, z]);
    }
    spots.forEach(([x, z], i) => {
      const back = z < 0; let hgt = (back ? 0.2 + r() * 0.2 : 0.07 + r() * 0.07) * (0.8 + 0.1 * g), w = 0.06 + r() * 0.03, d = 0.05 + r() * 0.03, ry = r() * 0.5;
      const glassC = new THREE.Color().setHSL(0.62 + r() * 0.1, 0.4, 0.22 + r() * 0.1);
      const nc = neon[i % neon.length], shape = r();
      if (back && shape < 0.3) {                          // a round glass tower ringed with neon, a news ticker running round it
        const rad = Math.min(w, d) * 0.55;
        K.add(GL, new THREE.CylinderGeometry(rad, rad, hgt, 20).translate(0, hgt / 2, 0), glassC, [x, 0, z]);
        for (let f = 1; f < 6; f++) K.add('glow', new THREE.TorusGeometry(rad + 0.0015, 0.0018, 4, 20).rotateX(Math.PI / 2), f % 2 ? nc : neon[(i + 1) % neon.length], [x, hgt * f / 6, z]);
        K.add('glow', BALL, nc, [x, hgt + 0.004, z], [0, 0, 0], 0.007);
        K.add(HM, new THREE.CylinderGeometry(rad + 0.004, rad + 0.004, 0.014, 28, 1, true), hol(3, hs(i, 1), 2), [x, hgt * 0.74, z], [0, 0, 0], 1, { uv: true });
        return;
      }
      if (back && shape < 0.6) {                          // stepped: a slimmer upper block
        K.box(GL, glassC, x, hgt * 0.6, z, w * 0.66, hgt * 0.4, d * 0.66, ry + 0.4);
        K.box('glow', neon[(i + 1) % neon.length], x, hgt - 0.006, z, w * 0.66 + 0.004, 0.005, d * 0.66 + 0.004, ry + 0.4);
        hgt *= 0.6;
      }
      K.box(GL, glassC, x, 0, z, w, hgt, d, ry);
      if (!back) { const fa = Math.atan2(pcz - z, pcx - x); K.box('glow', neon[(i + 3) % neon.length], x + Math.cos(fa) * (Math.max(w, d) / 2 + 0.001), 0.004, z + Math.sin(fa) * (Math.max(w, d) / 2 + 0.001), 0.04, 0.016, 0.002, -fa + Math.PI / 2); }   // a lit shopfront
      // neon edges: vertical strips on the corners, a crown band
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const ex = x + Math.cos(ry) * sx * w / 2 + Math.sin(ry) * sz * d / 2, ez = z - Math.sin(ry) * sx * w / 2 + Math.cos(ry) * sz * d / 2;
        K.box('glow', nc, ex, 0, ez, 0.004, hgt, 0.004, ry);
      }
      K.box('glow', nc, x, hgt - 0.008, z, w + 0.004, 0.006, d + 0.004, ry);
      K.box('glow', neon[(i + 2) % neon.length], x, hgt * 0.35, z, w + 0.003, 0.004, d + 0.003, ry);
      if (back && r() < 0.7) {                           // a spire with a beacon
        K.cyl('metal', 0x8a8a9a, x, hgt, z, 0.004, 0.002, 0.06, 6);
        K.add('glow', BALL, nc, [x, hgt + 0.062, z], [0, 0, 0], 0.006);
      }
      // a holo billboard on the plaza-facing side: animated ads (comHoloMat), in a thin neon frame
      if (hgt > 0.12 || r() < 0.4) {
        const fa = Math.atan2(pcz - z, pcx - x), o = Math.max(w, d) / 2 + 0.006, bx = x + Math.cos(fa) * o, bz = z + Math.sin(fa) * o;
        K.add(HM, new THREE.PlaneGeometry(0.06, 0.04), hol(i % 3, hs(i, 2)), [bx, hgt * 0.62, bz], [0, -fa + Math.PI / 2, 0], 1, { uv: true });
        if (!low) for (const e of [-1, 1]) K.add('glow', BOX, neon[(i + 1) % neon.length], [bx + Math.sin(fa) * e * 0.031, hgt * 0.62, bz - Math.cos(fa) * e * 0.031], [0, -fa + Math.PI / 2, 0], [0.0016, 0.042, 0.0016]);
      }
    });
    // market stalls round the plaza with glowing awnings, each with a little lit price tag
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * TAU, x = pcx + Math.cos(a) * 0.19, z = pcz + Math.sin(a) * 0.19;
      if (this.env.inClearing(x, z, 0.01)) continue;
      K.box('std', 0x4a4458, x, 0, z, 0.026, 0.018, 0.02, -a);
      K.add('glow', new THREE.ConeGeometry(0.022, 0.012, 4).rotateY(Math.PI / 4), neon[(i * 3) % neon.length], [x, 0.024, z], [0, -a, 0]);
      if (!low) K.box('glow', neon[(i * 3 + 1) % neon.length], x - Math.cos(a) * 0.0105, 0.009, z - Math.sin(a) * 0.0105, 0.001, 0.005, 0.012, -a);
    }
    // the hologram dais at the centre (the emblem hovers over it) with its light cone
    K.cyl('metal', 0x3a3a48, pcx, 0, pcz, 0.06, 0.05, 0.016, 24);
    K.add('glow', new THREE.TorusGeometry(0.052, 0.004, 6, 32).rotateX(Math.PI / 2), 0x28e6ff, [pcx, 0.016, pcz]);
    if (!low) for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; K.add('glow', BOX, neon[i % 2 ? 0 : 1], [pcx + Math.cos(a) * 0.04, 0.0165, pcz + Math.sin(a) * 0.04], [0, -a, 0], [0.012, 0.0012, 0.003]); }
    K.add('beam', new THREE.CylinderGeometry(0.1, 0.045, 0.22, 24, 1, true), (x, y, z) => _c.setRGB(0.2, 0.9, 1).multiplyScalar(0.9 - y * 3.5), [pcx, 0.126, pcz]);
    // shoppers (not at Low): lit specks strolling round the stalls and along the walkways (capMoveMat, on the GPU)
    if (!low) {
      const MG = this.capMoveMat(true), SPK = this._comSpeck ||= new THREE.CylinderGeometry(0.0012, 0.0012, 0.0045, 5).translate(0, 0.00225, 0);
      const cols = [0x9ff4ff, 0xff9ae0, 0xffffff, 0xffe98a], clear = (x, z) => this.edgeDist(x, z) > 0.02 && !this.env.inClearing(x, z, 0.01) && spots.every(([sx, sz]) => Math.hypot(x - sx, z - sz) > 0.06);
      for (let i = 0; i < 16; i++) {
        let A, M, B;
        if (i < 10) { const a0 = hs(i, 3) * TAU, a1 = a0 + 0.35 + hs(i, 4) * 0.4, rr = 0.222 + (i % 3) * 0.008, at = (a) => [pcx + Math.cos(a) * rr, pcz + Math.sin(a) * rr]; A = at(a0); M = at((a0 + a1) / 2); B = at(a1); }
        else { const a = (i - 10) / 6 * TAU, off = (i % 2 ? 1 : -1) * 0.005, at = (d) => [pcx + Math.cos(a) * d - Math.sin(a) * off, pcz + Math.sin(a) * d + Math.cos(a) * off]; A = at(0.165); B = at(0.26); M = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2]; }
        if (![A, M, B].every(([x, z]) => clear(x, z))) continue;
        K.raw(MG, this.capMover(ctx, part(SPK, cols[i % cols.length], [A[0], 0, A[1]]), A, M, B, 0, null, [hs(i, 5), 0.006 / (2 * Math.hypot(B[0] - A[0], B[1] - A[1])), 0.12]));
      }
    }
    if (!low) for (const gm of K.by.get(GL) || []) gm.setAttribute('aL', gm.attributes.position.clone());   // (comGlassMat's windows: board position)
    for (const m of this.emit(K, ctx)) if (m.material === this.mats.capMoveG) m.castShadow = false;
    // air-cars: a ring of glowing capsules circling the towers, each drawing a light trail; a second, lower
    // lane the other way round (not at Low). One group per lane, turned in tick
    const lane = (n, rad, dr, h0, dh, speed, trail, seed) => {
      const grp = new THREE.Group(), ck = new Kit(), sg = Math.sign(speed);
      for (let i = 0; i < n; i++) {
        const a = i / n * TAU + seed, rr = rad + (i % 2) * dr, h = h0 + (i % 3) * dh, nc = neon[(i + seed * 3) % neon.length | 0];
        ck.add('std', capsuleX(0.006, 0.012, 8), 0xe8e8f0, [Math.cos(a) * rr, h, Math.sin(a) * rr], [0, -a - Math.PI / 2, 0]);
        ck.add('glow', BALL, nc, [Math.cos(a) * rr, h - 0.006, Math.sin(a) * rr], [0, 0, 0], 0.005);
        if (trail) ck.raw(this.comTrailMat(), this.comTrail(a, rr, h, nc, sg, 0.6 + hs(i, 6) * 0.3));
      }
      for (const [key, list] of ck.by) { const m = new THREE.Mesh(mergeGeometries(list), typeof key === 'string' ? this.mat(key) : key); if (m.material.transparent) m.renderOrder = 3; grp.add(m); }
      return this.spin(this.place(grp, ctx, pcx, pcz, 0), speed, r() * 6);
    };
    lane(5, 0.26, 0.05, 0.14, 0.04, 0.25, !low, 0);
    if (!low) lane(4, 0.232, 0.012, 0.052, 0.012, -0.18, true, 0.4);
    // the plaza's hologram: the M€ coin turning slowly in the light cone, under the emblem
    {
      const coin = new THREE.Group();
      const face = new THREE.Mesh(part(new THREE.CircleGeometry(0.034, 40), hol(4, 0.37), [0, 0, 0], [0, 0, 0], 1, { uv: true }), HM);
      face.renderOrder = 3;
      coin.add(face, new THREE.Mesh(part(new THREE.TorusGeometry(0.0345, 0.0014, 6, 48), 0xffd23c), this.mat('glow')));
      this.spin(this.place(coin, ctx, pcx, pcz, 0.108), 0.7, 0);
    }
    this.emblem(ctx, 'commerical_district', pcx, pcz, 0.27, 0.3, false);
  }
  // ---- Commercial District parts
  // a light trail behind an air-car on its ring: a flat and an upright ribbon along the arc behind it (sg: the
  // way the ring turns), its colour fading out to nothing (additive)
  comTrail(a, rr, h, col, sg, span) {
    const c = new THREE.Color(col), pos = [], cl = [], idx = [], N = 14, w = 0.0035, a0 = a + sg * 0.014 / rr;
    for (let L = 0; L < 2; L++) for (let i = 0; i <= N; i++) {
      const s = i / N, an = a0 + sg * span * s, f = Math.pow(1 - s, 1.6), ca = Math.cos(an), sa = Math.sin(an), ww = w * (1 - 0.5 * s);
      if (L === 0) pos.push(ca * (rr - ww), h - 0.004, sa * (rr - ww), ca * (rr + ww), h - 0.004, sa * (rr + ww));
      else pos.push(ca * rr, h - 0.004 - ww, sa * rr, ca * rr, h - 0.004 + ww, sa * rr);
      for (let e = 0; e < 2; e++) cl.push(c.r * f, c.g * f, c.b * f);
      if (i < N) { const q = L * (N + 1) * 2 + i * 2; idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3)); g.setIndex(idx);
    return g;
  }
  comTrailMat() {
    return this.mats.comTrail ||= Object.assign(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }), { userData: { shared: true } });
  }
  // the district's floor: dark panels with seams (a speckled canvas), the plaza's magenta and cyan rings and
  // the six spokes drawn per pixel with their glow, and on the GPU clock: a tron grid, chevrons of light running
  // in along the walkways, the rings breathing, a ripple going out from the dais every few seconds. Board
  // position from the ground's uv
  comGroundMat() {
    if (this.mats.comGround) return this.mats.comGround;
    const tex = this.canvas('com-floor', 256, 296, (cg, w, h) => {
      cg.fillStyle = '#23212c'; cg.fillRect(0, 0, w, h);
      for (let i = 0; i < 400; i++) { cg.fillStyle = `rgba(255,255,255,${0.02 + hash2(i, 1) * 0.03})`; cg.fillRect(hash2(i, 2) * w, hash2(i, 3) * h, 3, 3); }
    });
    const m = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.5, roughness: 0.4, metalness: 0.3 });
    const R0 = this.HEX_R * 0.95;
    m.onBeforeCompile = (s) => {
      s.uniforms.uTime = this.time;
      s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vComB;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>\nvComB = vec2((uv.x - 0.5) * ${(Math.sqrt(3) * R0).toFixed(6)}, (0.5 - uv.y) * ${(2 * R0).toFixed(6)});`);
      s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vComB; uniform float uTime;')
        .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec2 p = vComB; float px = max(length(fwidth(p)), 1e-6);
  vec2 pq = 0.5 - abs(fract(p / 0.05) - 0.5);
  float seam = 1.0 - smoothstep(0.0, 0.0005 + px, min(pq.x, pq.y) * 0.05);
  diffuseColor.rgb *= 1.0 - 0.35 * seam * clamp(1.0 - px * 150.0, 0.0, 1.0);
}`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  vec2 p = vComB, c = p - vec2(-0.04, 0.02); float px = max(length(fwidth(p)), 1e-6);
  float rr = length(c), aa = atan(c.y, c.x), fine = clamp(1.0 - px * 140.0, 0.0, 1.0);
  vec3 e = vec3(0.0);
  vec2 gq = 0.5 - abs(fract(p / 0.025) - 0.5);
  e += vec3(0.05, 0.35, 0.55) * 0.34 * (1.0 - smoothstep(0.0, 0.0004 + px, min(gq.x, gq.y) * 0.025)) * fine * smoothstep(0.17, 0.21, rr);
  float sk = aa / 6.2832 * 6.0, k = floor(sk + 0.5), sd = abs(sk - k) * 6.2832 / 6.0 * rr;
  // the rings (magenta 0.15, cyan 0.1: breathing) and the cyan spokes, each a hot core in a soft halo
  float breathe = 1.0 + 0.35 * sin(uTime * 2.2);
  float r1 = abs(rr - 0.15), r2 = abs(rr - 0.1), sp = rr > 0.15 && rr < 0.42 ? sd : 1.0;
  e += vec3(1.0, 0.16, 0.7) * (0.9 * (1.0 - smoothstep(0.0022, 0.0022 + px * 1.5, r1)) + 0.4 * exp(-r1 * 260.0)) * 0.5 * breathe;
  e += vec3(0.1, 0.85, 1.0) * (0.9 * (1.0 - smoothstep(0.0022, 0.0022 + px * 1.5, r2)) + 0.4 * exp(-r2 * 260.0)) * 0.5 * breathe;
  e += vec3(0.1, 0.85, 1.0) * (0.9 * (1.0 - smoothstep(0.0018, 0.0018 + px * 1.5, sp)) + 0.3 * exp(-sp * 300.0)) * 0.45;
  float walk = smoothstep(0.14, 0.165, rr) * (1.0 - smoothstep(0.4, 0.44, rr));
  vec3 wc = mod(k, 2.0) < 0.5 ? vec3(1.0, 0.24, 0.78) : vec3(0.16, 0.9, 1.0);
  float edge = (1.0 - smoothstep(0.0, 0.0005 + px, abs(sd - 0.011))) * walk * fine;
  float ch = fract((rr - sd * 0.8) / 0.028 + uTime * 0.7);
  float chev = smoothstep(0.62, 0.8, ch) * (1.0 - smoothstep(0.8, 0.95, ch)) * (1.0 - smoothstep(0.006, 0.0095, sd)) * walk;
  e += wc * (edge * 0.55 + chev * mix(0.35, 0.9, fine) + (1.0 - smoothstep(0.009, 0.011, sd)) * walk * 0.07);
  float ph = fract(uTime / 3.2), R = 0.06 + ph * 0.42;
  e += vec3(1.0, 0.3, 0.85) * (1.0 - smoothstep(0.0, 0.003 + px, abs(rr - R))) * (1.0 - ph) * (1.0 - ph) * 0.7;
  totalEmissiveRadiance += e;
}`);
    };
    m.customProgramCacheKey = () => 'comGround';
    this.own(m, 0.55);
    return this.mats.comGround = m;
  }
  // the towers' glass: vertex colours, and per pixel (aL = board position) a grid of windows on the walls, some
  // lit white, cyan or magenta, with a scan of light climbing them now and then; from afar a faint even glow
  comGlassMat() {
    if (this.mats.comGlass) return this.mats.comGlass;
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.12, metalness: 0.85 });
    m.onBeforeCompile = (s) => {
      s.uniforms.uTime = this.time;
      s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aL; varying vec3 vL;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvL = aL;');
      s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vL; uniform float uTime;
float comH(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  vec3 p = vL; float px = max(length(fwidth(p)), 1e-6);
  vec3 nL = normalize(cross(dFdx(p), dFdy(p)));
  if (abs(nL.y) < 0.5) {
    float h = dot(p.xz, normalize(vec2(-nL.z, nL.x)));
    vec2 w = vec2(h / 0.0062, p.y / 0.0078), id = floor(w), f = abs(fract(w) - 0.5);
    float win = (1.0 - smoothstep(0.3, 0.3 + px / 0.0062, f.x)) * (1.0 - smoothstep(0.26, 0.26 + px / 0.0078, f.y));
    float hs = comH(id + vec2(floor(nL.x * 3.0) * 7.1, floor(nL.z * 3.0) * 3.7));
    vec3 tint = normalize(vColor.rgb + 0.02) * 1.25;
    vec3 wc = hs > 0.96 ? vec3(1.0, 0.3, 0.85) : hs > 0.925 ? vec3(0.25, 0.9, 1.0) : mix(vec3(0.7, 0.78, 1.0), tint, 0.7);
    float sc = fract(p.y * 4.0 - uTime * 0.11 + comH(vec2(floor(h * 18.0), 3.0)));
    float band = smoothstep(0.0, 0.015, sc) * (1.0 - smoothstep(0.015, 0.06, sc));
    float fine = clamp(1.0 - px * 190.0, 0.0, 1.0);
    float floorLine = (1.0 - smoothstep(0.0, 0.00025 + px, (0.5 - abs(fract(p.y / 0.0156) - 0.5)) * 0.0156)) * 0.16;
    vec3 e = wc * step(0.88, hs) * win * (0.3 + 1.3 * band) + tint * floorLine;
    totalEmissiveRadiance += mix(vec3(0.018, 0.02, 0.04), e * 0.6, fine);
  }
}`);
    };
    m.customProgramCacheKey = () => 'comGlass';
    this.own(m, 1);
    return this.mats.comGlass = m;
  }
  // the holograms (billboards, tickers, the plaza's coin): one shader over an atlas of five ads; the
  // vertex colour picks the ad (r * 8), its phase (g) and, for a ticker, how often it repeats round (b * 8, it
  // scrolls). Scanlines drift down them, and now and then one flickers or tears sideways for a moment
  comHoloMat() {
    if (this.mats.comHolo) return this.mats.comHolo;
    const NS = 5, SH = 160;
    const tex = this.canvas('comHolo', 256, NS * SH, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      const slot = (s, draw) => { g.save(); g.translate(0, (NS - 1 - s) * SH); g.beginPath(); g.rect(0, 0, w, SH); g.clip(); draw(); g.restore(); };
      g.textAlign = 'center'; g.textBaseline = 'middle';
      slot(0, () => {                                                  // M€ and a +4 coin
        const gr = g.createLinearGradient(0, 0, w, SH); gr.addColorStop(0, 'rgba(58,14,98,0.9)'); gr.addColorStop(1, 'rgba(14,58,98,0.9)');
        g.fillStyle = gr; g.fillRect(8, 8, w - 16, SH - 16);
        g.strokeStyle = '#ff3cc8'; g.lineWidth = 6; g.strokeRect(11, 11, w - 22, SH - 22);
        g.font = '700 78px Rajdhani, sans-serif'; g.shadowColor = '#28e6ff'; g.shadowBlur = 12; g.fillStyle = '#9ff4ff'; g.fillText('M€', w * 0.37, SH * 0.53);
        g.shadowColor = '#ffd23c'; g.fillStyle = '#ffe98a'; g.beginPath(); g.arc(w * 0.78, SH * 0.5, 30, 0, TAU); g.fill();
        g.shadowBlur = 0; g.fillStyle = '#2a0a4a'; g.font = '700 36px Rajdhani, sans-serif'; g.fillText('+4', w * 0.78, SH * 0.53);
      });
      slot(1, () => {                                                  // the market: a chart going up
        g.fillStyle = 'rgba(6,30,44,0.88)'; g.fillRect(8, 8, w - 16, SH - 16);
        g.strokeStyle = 'rgba(40,230,255,0.35)'; g.lineWidth = 2; for (let i = 1; i < 6; i++) { g.beginPath(); g.moveTo(8 + i * 40, 12); g.lineTo(8 + i * 40, SH - 12); g.stroke(); } for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(12, 8 + i * 36); g.lineTo(w - 12, 8 + i * 36); g.stroke(); }
        for (let i = 0; i < 7; i++) { const bh = 18 + i * 11 + (i % 2) * 10; g.fillStyle = i % 2 ? 'rgba(255,60,200,0.75)' : 'rgba(40,230,255,0.75)'; g.fillRect(24 + i * 30, SH - 16 - bh, 18, bh); }
        g.strokeStyle = '#ffe98a'; g.lineWidth = 5; g.shadowColor = '#ffd23c'; g.shadowBlur = 10; g.beginPath(); [[24, 120], [70, 100], [110, 108], [150, 70], [190, 58], [232, 26]].forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
        g.fillStyle = '#ffe98a'; g.beginPath(); g.moveTo(236, 14); g.lineTo(246, 34); g.lineTo(224, 30); g.closePath(); g.fill(); g.shadowBlur = 0;
        g.strokeStyle = '#28e6ff'; g.lineWidth = 5; g.strokeRect(10, 10, w - 20, SH - 20);
      });
      slot(2, () => {                                                  // a sale: %, with sparkles
        g.fillStyle = 'rgba(40,6,54,0.9)'; g.fillRect(8, 8, w - 16, SH - 16);
        g.strokeStyle = '#ffd23c'; g.lineWidth = 5; g.setLineDash([14, 8]); g.strokeRect(12, 12, w - 24, SH - 24); g.setLineDash([]);
        g.font = '700 120px Rajdhani, sans-serif'; g.shadowColor = '#ff3cc8'; g.shadowBlur = 16; g.fillStyle = '#ff9ae0'; g.fillText('%', w * 0.5, SH * 0.55);
        g.fillStyle = '#9ff4ff'; g.shadowColor = '#28e6ff';
        for (const [x, y, s] of [[40, 40, 12], [214, 48, 10], [52, 118, 8], [206, 116, 13]]) { g.beginPath(); for (let k = 0; k < 8; k++) { const a = k / 8 * TAU, q = k % 2 ? s * 0.35 : s; g.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); } g.closePath(); g.fill(); }
        g.shadowBlur = 0;
      });
      slot(3, () => {                                                  // the ticker: repeats seamlessly round
        g.fillStyle = 'rgba(8,4,26,0.7)'; g.fillRect(0, 40, w, 80);
        g.fillStyle = '#28e6ff'; g.fillRect(0, 40, w, 4); g.fillRect(0, 116, w, 4);
        g.font = '700 50px Rajdhani, sans-serif'; g.shadowBlur = 8;
        for (const ox of [-w, 0, w]) [['M€', '#9ff4ff', 36], ['▲', '#7dffb0', 100], ['+4', '#ffe98a', 150], ['◆', '#ff3cc8', 214]].forEach(([t, c, x]) => { g.shadowColor = c; g.fillStyle = c; g.fillText(t, x + ox, 82); });
        g.shadowBlur = 0;
      });
      slot(4, () => {                                                  // the coin (an ellipse: the disc's uv is square)
        g.translate(w / 2, SH / 2); g.scale(1, SH / w);
        const gr = g.createRadialGradient(0, 0, 20, 0, 0, 124); gr.addColorStop(0, 'rgba(255,233,138,0.25)'); gr.addColorStop(0.8, 'rgba(255,210,60,0.45)'); gr.addColorStop(1, 'rgba(255,210,60,0.95)');
        g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 124, 0, TAU); g.fill();
        g.strokeStyle = '#fff2b0'; g.lineWidth = 7; g.beginPath(); g.arc(0, 0, 104, 0, TAU); g.stroke();
        g.font = '700 118px Rajdhani, sans-serif'; g.shadowColor = '#ffd23c'; g.shadowBlur = 14; g.fillStyle = '#fff6d0'; g.fillText('M€', 0, 8);
      });
    });
    const m = new THREE.ShaderMaterial({
      uniforms: { uTime: this.time, uTex: { value: tex } },
      vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: /* glsl */`varying vec2 vUv; varying vec3 vC;
        void main(){ vUv = uv; vC = color; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`
        uniform float uTime; uniform sampler2D uTex; varying vec2 vUv; varying vec3 vC;
        float hh(float x){ return fract(sin(x * 91.7) * 43758.5453); }
        void main(){
          float slot = floor(vC.r * 8.0 + 0.5), ph = vC.g * 10.0, rep = floor(vC.b * 8.0 + 0.5), t = uTime + ph;
          float blk = floor(t * 7.0), glitch = step(0.94, hh(blk + ph * 13.0));
          vec2 uv = vUv;
          uv.x += glitch * (hh(floor(uv.y * 9.0) + blk) - 0.5) * 0.14;
          if (rep > 0.5) uv.x = uv.x * rep - t * 0.25;
          uv.x = rep > 0.5 ? fract(uv.x) : clamp(uv.x, 0.0, 1.0);
          vec4 c = texture2D(uTex, vec2(uv.x, (slot + clamp(uv.y, 0.01, 0.99)) / ${NS}.0));
          float scan = 0.78 + 0.22 * sin(vUv.y * 80.0 + t * 5.0);
          float flick = 1.0 - 0.45 * glitch - 0.3 * step(0.975, hh(floor(t * 23.0) + ph));
          gl_FragColor = vec4(c.rgb * 1.15, c.a * scan * flick);
          #include <colorspace_fragment>
        }`,
    });
    m.userData.shared = true;
    return this.mats.comHolo = m;
  }
}
