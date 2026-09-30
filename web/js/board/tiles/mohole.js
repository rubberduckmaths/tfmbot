// mohole.js -- TileArt mixin: the Mohole Area, a deep parallax-shaded shaft (shaft(), also used by city_styles.js)
// under a working derrick, with its animated lifts and steam.
import { gfx } from '../quality.js';
import * as THREE from 'three';
import { mergeGeometries } from '../../../vendor/BufferGeometryUtils.js';
import { BALL, BOX, Kit, TAU, V3, Y, _c, fbm2, lathe, part, smooth, tagPart } from './kit.js';

export class MoholeArt {
  // Mohole: a shaft bored deep into the crust -- a parallax-shaded bore
  // (depth rings, maintenance lamps, service platforms, lift cars riding
  // their rails, steam haze over the glowing mantle heat at the bottom)
  // under a braced derrick whose travelling block works up and down the
  // drill string, ringed by a bolted steel collar with a molten lip and a
  // safety rail; a headframe on the back rim lowers a lit cage into the bore;
  // heat exchangers on their pads venting steam, flanged pipelines, a control
  // block, a cable reel, floodlights. The apron (moholeGroundMat) has slab
  // joints, a crisp hazard ring, stains and soot, the basalt round it grit.
  mohole(ctx) {
    const r = this.env.srand(ctx.space * 41 + 9), cx = -0.04, cz = -0.06, HR = 0.165, low = gfx.low;
    ctx.wall(0x2b2724);
    const hf = (x, z) => { const d = Math.hypot(x - cx, z - cz); if (d < HR + 0.006) return -0.02; return 0.012 * smooth(0.3, 0.26, d) * smooth(0, 0.05, this.edgeDist(x, z) + 0.2) + 0.003 * fbm2(x * 25, z * 25, 3); };
    this.groundMesh(ctx, hf, () => _c.setRGB(1, 1, 1), { sub: gfx.pick(20, 28, 28), uv: true, mat: this.moholeGroundMat() });
    const top = 0.012, ang = (x, z) => Math.atan2(z - cz, x - cx), near = (a, b, w) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) < w;
    // the bore itself: a disc whose shader ray-casts the shaft beneath it
    this.shaft(ctx, cx, cz, top + 0.0015, HR, 1.6).userData.open = true;       // (the bore opens as the tile is placed)
    const K = new Kit(), A = this.moAnim(K), steel = 0x5a6068, rust = 0x8a5a3a;
    const legA = [0.5, 0.5 + TAU / 3, 0.5 + TAU * 2 / 3], HA = -1.05;          // the derrick's legs; the headframe's side (board angles round the bore)
    const hx = [[0.28, -0.26], [-0.33, 0.02], [0.3, -0.02]], pipeA = hx.map(([x, z]) => ang(x, z));
    // the collar: a steel ring on a bolted flange, the bore's glow on its inner lip, a yellow safety rail round it
    K.add('metal', new THREE.TorusGeometry(HR + 0.012, 0.012, 10, 48).rotateX(Math.PI / 2), 0x6c737c, [cx, top + 0.006, cz]);
    K.add('glow', new THREE.TorusGeometry(HR + 0.001, 0.004, 6, 48).rotateX(Math.PI / 2), 0xff8a2a, [cx, top + 0.004, cz]);
    K.add('metal', new THREE.CylinderGeometry(HR + 0.03, HR + 0.034, 0.008, 48, 1, true), 0x4a5058, [cx, top + 0.002, cz]);
    K.add('metal', new THREE.RingGeometry(HR + 0.012, HR + 0.03, 48, 1).rotateX(-Math.PI / 2), 0x555b63, [cx, top + 0.006, cz]);
    if (!low) for (let i = 0; i < 32; i++) { const a = i / 32 * TAU, rr = HR + 0.024; K.box('metal', 0xa0a6ae, cx + Math.cos(a) * rr, top + 0.006, cz + Math.sin(a) * rr, 0.004, 0.003, 0.004, -a); }
    const RR = HR + 0.048;
    for (const y of [0.03, 0.046]) K.add('metal', new THREE.TorusGeometry(RR, 0.0015, 3, 48).rotateX(Math.PI / 2), 0xe8b818, [cx, top + y, cz]);
    for (let i = 0, n = low ? 12 : 24; i < n; i++) { const a = (i + 0.5) / n * TAU; if (near(a, HA, 0.25) || pipeA.some((p) => near(a, p, 0.12)) || legA.some((p) => near(a, p, 0.12))) continue; K.cyl('metal', 0xd8a818, cx + Math.cos(a) * RR, top, cz + Math.sin(a) * RR, 0.0014, 0.0014, 0.047, 5); }
    // derrick: three braced legs to an apex, a crown block, the drill string down the middle with the travelling block working on it
    const apex = [cx, 0.36, cz], feet = legA.map((a) => [cx + Math.cos(a) * (HR + 0.03), top, cz + Math.sin(a) * (HR + 0.03)]);
    feet.forEach(([fx, , fz]) => {
      const dxv = apex[0] - fx, dyv = apex[1] - top, dzv = apex[2] - fz, L = Math.hypot(dxv, dyv, dzv);
      const q = new THREE.Quaternion().setFromUnitVectors(Y, new V3(dxv, dyv, dzv).normalize()), e = new THREE.Euler().setFromQuaternion(q);
      K.add('metal', new THREE.CylinderGeometry(0.006, 0.009, L, 8).translate(0, L / 2, 0), steel, [fx, top, fz], [e.x, e.y, e.z]);
      K.box('std', 0x3c3c3c, fx, top, fz, 0.03, 0.012, 0.03);
      for (let j = 1; j < 4; j++) { const t = j / 4.2; K.add('metal', new THREE.SphereGeometry(0.006, 8, 6), steel, [fx + dxv * t, top + dyv * t, fz + dzv * t]); }
    });
    const onLeg = (i, t) => [feet[i][0] + (apex[0] - feet[i][0]) * t, top + (apex[1] - top) * t, feet[i][2] + (apex[2] - feet[i][2]) * t];
    for (const t of [0.62]) for (let i = 0; i < 3; i++) this.strut(K, 'metal', 0x6a7078, onLeg(i, t), onLeg((i + 1) % 3, t), 0.0026, 5);     // (one ring of braces, high: the view into the bore stays clear)
    K.box('metal', 0xd09a2a, cx, 0.34, cz, 0.05, 0.03, 0.05);
    K.cyl('metal', 0x2a2d31, cx, top, cz, 0.008, 0.008, 0.34, 8);
    K.add('blink', BALL, 0xffffff, [cx, 0.378, cz], [0, 0, 0], 0.008);
    const blk = (y) => [part(BOX, 0xd8a020, [cx, y, cz], [0, 0.4, 0], [0.024, 0.032, 0.024]), part(new THREE.CylinderGeometry(0.0022, 0.0022, 0.34 - y - 0.016, 5, 1, true).translate(0, (0.34 - y - 0.016) / 2, 0), 0x9aa0a8, [cx + 0.009, y + 0.016, cz])];
    const [b0, b1] = [blk(0.24), blk(0.1)];
    A.add(b0[0], b1[0], 1, 0, r()); A.add(b0[1], b1[1], 1, 0, r());
    // drawworks by the back-left leg, its line up to the crown
    const dw = [cx + Math.cos(legA[1] + 0.45) * (HR + 0.085), cz + Math.sin(legA[1] + 0.45) * (HR + 0.085)];
    K.box('std', 0x3a4452, dw[0], hf(dw[0], dw[1]), dw[1], 0.05, 0.03, 0.035, -(legA[1] + 0.45));
    K.add('std', new THREE.CylinderGeometry(0.012, 0.012, 0.042, 14).rotateX(Math.PI / 2), 0x2a2c30, [dw[0], hf(dw[0], dw[1]) + 0.036, dw[1]], [0, -(legA[1] + 0.45) + Math.PI / 2, 0]);
    this.strut(K, 'metal', 0x2a2d31, [dw[0], hf(dw[0], dw[1]) + 0.04, dw[1]], [cx, 0.335, cz], 0.0012, 4);
    // the headframe: an A-frame on the back rim, a boom over the bore, a sheave; its lit cage goes down the shaft and back
    {
      const ca = Math.cos(HA), sa = Math.sin(HA), px = -sa, pz = ca, P = (rr, sd) => [cx + ca * rr + px * sd, cz + sa * rr + pz * sd];
      const yT = 0.21, rT = HR + 0.012, rB = HR - 0.034;
      for (const sd of [-1, 1]) {
        const [fx, fz] = P(HR + 0.07, sd * 0.034), [tx, tz] = P(rT, sd * 0.012), [bx, bz] = P(HR + 0.15, sd * 0.02);
        this.strut(K, 'metal', 0x9a4a2a, [fx, top, fz], [tx, yT, tz], 0.004, 6);
        this.strut(K, 'metal', 0x9a4a2a, [bx, hf(bx, bz), bz], [tx, yT, tz], 0.003, 6);
        K.box('std', 0x3c3c3c, fx, top - 0.002, fz, 0.02, 0.01, 0.02);
        K.box('std', 0x3c3c3c, bx, hf(bx, bz) - 0.002, bz, 0.016, 0.008, 0.016);
      }
      for (const [t, w] of [[0.5, 0.023], [0.8, 0.017]]) { const rr = HR + 0.07 + (rT - HR - 0.07) * t, [ax, az] = P(rr, w), [bx, bz] = P(rr, -w); this.strut(K, 'metal', 0x9a4a2a, [ax, top + (yT - top) * t, az], [bx, top + (yT - top) * t, bz], 0.0022, 5); }
      const [b0x, b0z] = P(rT + 0.012, 0), [b1x, b1z] = P(rB, 0), L = Math.hypot(b1x - b0x, b1z - b0z);
      K.box('metal', 0x9a4a2a, (b0x + b1x) / 2, yT, (b0z + b1z) / 2, L, 0.012, 0.014, -HA);
      K.add('metal', new THREE.TorusGeometry(0.013, 0.003, 6, 20), 0x3a3e44, [b1x, yT + 0.018, b1z], [0, -HA, 0]);
      K.add('blinkA', BALL, 0xffffff, [b0x, yT + 0.02, b0z], [0, 0, 0], 0.0055);
      const cage = (y) => {
        const out = [part(BOX, 0xe8e4dc, [b1x, y + 0.017, b1z], [0, -HA, 0], [0.026, 0.034, 0.026]), part(BOX, 0x3a3e44, [b1x, y + 0.036, b1z], [0, -HA, 0], [0.03, 0.004, 0.03])];
        const cl = yT + 0.005 - (y + 0.038);
        out.push(part(new THREE.CylinderGeometry(0.0012, 0.0012, cl, 4, 1, true).translate(0, cl / 2, 0), 0x2a2c30, [b1x, y + 0.038, b1z]));
        return out;
      };
      const win = (y) => [part(BOX, 0xffd890, [b1x, y + 0.022, b1z], [0, -HA, 0], [0.0275, 0.009, 0.02]), part(BOX, 0xffd890, [b1x, y + 0.022, b1z], [0, -HA, 0], [0.02, 0.009, 0.0275])];
      const [c0, c1, w0, w1] = [cage(0.1), cage(-0.34), win(0.1), win(-0.34)];
      const ph = r();
      c0.forEach((g, i) => A.add(g, c1[i], 0, 0, ph));
      w0.forEach((g, i) => A.add(g, w1[i], 0, 1, ph));
    }
    // heat exchangers on concrete pads: banded domed shells with a glowing sight-band, a relief stack, flanged pipes on supports to the collar
    for (const [x, z] of hx) {
      K.box('std', 0x77746e, x, -0.004, z, 0.13, 0.01, 0.13, 0.2);
      K.add('metal', lathe([[0.001, 0], [0.05, 0], [0.05, 0.1], [0.045, 0.118], [0.03, 0.13], [0.001, 0.133]], 24), 0x9aa2aa, [x, 0, z]);
      for (const y of [0.018, 0.082]) K.add('metal', new THREE.TorusGeometry(0.0505, 0.0035, 4, 24).rotateX(Math.PI / 2), 0x6a727a, [x, y, z]);
      K.add('glow', new THREE.TorusGeometry(0.0508, 0.0028, 4, 24).rotateX(Math.PI / 2), 0xff9a3a, [x, 0.05, z]);
      K.cyl('metal', 0x7a828a, x + 0.014, 0.125, z - 0.01, 0.006, 0.005, 0.03, 8);
      K.cyl('metal', 0xc83a22, x + 0.014, 0.153, z - 0.01, 0.0075, 0.0075, 0.005, 8);
      const dxv = cx - x, dzv = cz - z, D = Math.hypot(dxv, dzv), ux = dxv / D, uz = dzv / D, L = D - HR - 0.02;
      K.add('metal', new THREE.CylinderGeometry(0.011, 0.011, L, 10).rotateZ(Math.PI / 2), rust, [x + ux * L / 2, 0.022, z + uz * L / 2], [0, -Math.atan2(dzv, dxv), 0]);
      for (const t of [0.12, 0.5, 0.88]) {
        const px = x + ux * L * t, pz = z + uz * L * t;
        K.add('metal', new THREE.TorusGeometry(0.0125, 0.0028, 4, 12).rotateY(Math.PI / 2), 0x6a4a34, [px, 0.022, pz], [0, -Math.atan2(dzv, dxv), 0]);
        if (t === 0.5) K.box('std', 0x4a4a48, px, hf(px, pz) - 0.002, pz, 0.012, 0.014, 0.02, -Math.atan2(dzv, dxv));
      }
    }
    // control block: lit windows, a door, roof plant, an antenna; the cable reel with its cable run to the collar
    K.box('std', 0x6c6c68, 0.02, 0, 0.3, 0.13, 0.05, 0.07);
    K.box('std', 0x5a5a56, 0.02, 0.05, 0.3, 0.135, 0.004, 0.075);
    K.box('glow', 0x9fe3ff, 0.02, 0.022, 0.336, 0.11, 0.012, 0.002);
    K.box('std', 0xd8741a, 0.02, 0.041, 0.336, 0.13, 0.004, 0.002);
    K.box('std', 0x2a2c30, 0.087, 0, 0.29, 0.002, 0.034, 0.018);
    K.box('metal', 0x70767e, -0.02, 0.054, 0.29, 0.024, 0.01, 0.02); K.box('metal', 0x70767e, 0.012, 0.054, 0.286, 0.016, 0.008, 0.016);
    for (let i = 0; i < 3; i++) K.box('std', 0x2a2c30, -0.02 + (i - 1) * 0.0075, 0.064, 0.29, 0.004, 0.0008, 0.016);
    K.cyl('metal', 0xa8acb2, 0.07, 0.054, 0.285, 0.0014, 0.0014, 0.06, 5);
    K.add('blinkA', BALL, 0xffffff, [0.07, 0.116, 0.285], [0, 0, 0], 0.004);
    K.add('std', new THREE.CylinderGeometry(0.035, 0.035, 0.04, 20).rotateX(Math.PI / 2), 0x3a4452, [-0.13, 0.036, 0.3]);
    K.add('std', new THREE.CylinderGeometry(0.028, 0.028, 0.042, 20).rotateX(Math.PI / 2), 0x1e1f22, [-0.13, 0.036, 0.3]);
    K.box('std', 0x4a4e54, -0.13, -0.002, 0.3, 0.05, 0.012, 0.05);
    { const [ex, ez] = [cx + Math.cos(2.05) * (HR + 0.035), cz + Math.sin(2.05) * (HR + 0.035)]; this.strut(K, 'std', 0x2a2b2e, [-0.12, 0.014, 0.275], [ex, top + 0.004, ez], 0.0016, 5); }
    // floodlights on the apron's edge (behind the bore, out of the view into it), turned on the bore
    for (const a of [-2.35, -0.2]) {
      const x = cx + Math.cos(a) * 0.3, z = cz + Math.sin(a) * 0.3, y = hf(x, z);
      K.cyl('metal', 0x8a9098, x, y, z, 0.0028, 0.0022, 0.16, 6);
      K.add('std', BOX, 0x2a2c30, [x - Math.cos(a) * 0.004, y + 0.162, z - Math.sin(a) * 0.004], [0, -a, 0.55, 'YXZ'], [0.012, 0.016, 0.03]);
      K.add('glow', BOX, 0xfff2d8, [x - Math.cos(a) * 0.0105, y + 0.158, z - Math.sin(a) * 0.0105], [0, -a, 0.55, 'YXZ'], [0.0015, 0.013, 0.026]);
    }
    this.emit(K, ctx);
    A.done(ctx);
    // steam: the bore breathes a tall plume; the exchangers' relief stacks vent
    this.puffs(ctx, [{ x: cx, z: cz, y: top + 0.02, n: 9, life: 6, rise: 0.55, size: 0.16, col: [0.95, 0.93, 0.9, 0.34], drift: [0.1, -0.08], jit: 0.1 },
      ...hx.map(([x, z]) => ({ x: x + 0.014, z: z - 0.01, y: 0.155, n: 4, life: 3.5, rise: 0.2, size: 0.07, col: [0.95, 0.95, 0.95, 0.4], drift: [0.05, -0.04] }))]);
    this.emblem(ctx, 'mohole_area', -0.24, 0.24, 0.26, 0.28);
  }
  // the Mohole's moving parts (moAnimMat): add(rest, posed, kind, glow, phase) takes two part()s of one shape, at
  // rest and at the far end of its travel; done(ctx) drapes both and keeps the difference as a per-vertex offset
  // the shader eases in and out (kind 0: the headframe's cage, 1: the travelling block). Low: the rest pose, still
  moAnim(K) {
    const R = [], P = [];
    return {
      add: (rest, posed, kind, glow = 0, ph = 0) => {
        if (gfx.low) { K.raw(glow ? 'glow' : 'metal', rest); return; }
        const n = rest.attributes.position.count, a = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) { a[i * 3] = ph; a[i * 3 + 1] = kind; a[i * 3 + 2] = glow; }
        rest.setAttribute('aMoP', new THREE.BufferAttribute(a, 3)); R.push(tagPart(rest)); P.push(posed);      // (tagged: it grows in with the rest when placed)
      },
      done: (ctx) => {
        if (!R.length) return;
        const G = mergeGeometries(R), Q = mergeGeometries(P);
        this.drape(G, ctx.cell, ctx.H); this.drape(Q, ctx.cell, ctx.H);
        const p0 = G.attributes.position.array, q = Q.attributes.position.array, d = new Float32Array(p0.length);
        for (let i = 0; i < p0.length; i++) d[i] = q[i] - p0[i];
        G.setAttribute('aMoD', new THREE.BufferAttribute(d, 3)); Q.dispose();
        const m = new THREE.Mesh(G, this.moAnimMat()); m.receiveShadow = true;      // (no cast: the shadow pass would not move)
        ctx.g.add(m);
      },
    };
  }
  moAnimMat() {
    if (this.mats.moAnim) return this.mats.moAnim;
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.45 });
    m.onBeforeCompile = (s) => {
      s.uniforms.uTime = this.time;
      s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aMoD, aMoP; uniform float uTime; varying float vMoG;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
{
  float c = fract(uTime / 22.0 + aMoP.x), w;
  if (aMoP.y < 0.5) w = smoothstep(0.04, 0.4, c) - smoothstep(0.56, 0.92, c);   // the cage: down the bore, a spell below, back up, a spell at the top
  else w = 0.5 + 0.5 * sin(uTime * 0.4 + aMoP.x * 6.2832);                      // the travelling block, slowly up and down
  transformed += aMoD * w; vMoG = aMoP.z;
}`);
      s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vMoG;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vMoG * 1.6;');
    };
    m.customProgramCacheKey = () => 'moAnim';
    return this.mats.moAnim = this.own(m, 1);
  }
  // the Mohole's ground (uv = the board position): the concrete apron round the bore -- radial slabs with
  // recessed joints, a crisp diagonal hazard ring, oil stains and heat soot toward the lip -- and grey-brown
  // basalt grit beyond it, darker near the apron. Detail fades where it would be under a pixel.
  moholeGroundMat() {
    if (this.mats.moGround) return this.mats.moGround;
    const R0 = this.HEX_R * 0.95;
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0 });
    m.onBeforeCompile = (s) => {
      s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vMo;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvMo = uv;');
      s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>
varying vec2 vMo;
float moH(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float moN(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(moH(i), moH(i + vec2(1.0, 0.0)), f.x), mix(moH(i + vec2(0.0, 1.0)), moH(i + vec2(1.0, 1.0)), f.x), f.y); }
float moF(vec2 p){ return moN(p) * 0.5 + moN(p * 2.03 + 3.1) * 0.3 + moN(p * 4.1 + 7.7) * 0.2; }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
float moJ = 0.0;
{
  vec2 p = vec2((vMo.x - 0.5) * ${(Math.sqrt(3) * R0).toFixed(5)}, (0.5 - vMo.y) * ${(2 * R0).toFixed(5)});
  vec2 dp = p - vec2(-0.04, -0.06); float d = length(dp), a = atan(dp.y, dp.x), px = max(length(fwidth(p)), 1e-5);
  float n = moF(p * 20.0), g = moH(floor(p * 700.0)) * clamp(1.0 - px * 600.0, 0.0, 1.0);
  vec3 bas = vec3(0.3 + n * 0.12, 0.2 + n * 0.08, 0.16 + n * 0.06) * (0.9 + 0.2 * g);
  bas = mix(bas, vec3(0.18, 0.14, 0.13), (1.0 - smoothstep(0.27, 0.39, d)) * 0.6);
  float cn = moF(p * 9.0 + 5.0), sl = floor(a * 1.9099), rg = step(0.245, d) + step(0.215, d);
  vec3 con = vec3(0.42, 0.41, 0.4) * (0.9 + 0.16 * n + 0.08 * (moH(vec2(sl, rg)) - 0.5)) * (0.94 + 0.08 * g);
  con *= 1.0 - 0.28 * smoothstep(0.55, 0.85, cn) - 0.12 * smoothstep(0.6, 0.9, moN(p * 60.0 + 11.0)) * clamp(1.0 - px * 90.0, 0.0, 1.0);
  con *= mix(0.55, 1.0, smoothstep(0.165, 0.2, d));
  float jw = max(px * 0.8, 0.0012);
  moJ = max(max(1.0 - smoothstep(0.0, jw, abs(d - 0.245)), 1.0 - smoothstep(0.0, jw, abs(d - 0.19))), (1.0 - smoothstep(0.0, jw, (0.5 - abs(fract(a * 1.9099) - 0.5)) * 0.5236 * d)) * step(0.19, d));
  moJ *= clamp(1.0 - px * 120.0, 0.0, 1.0);
  con *= 1.0 - 0.45 * moJ;
  float hz = smoothstep(0.19 - px, 0.19 + px, d) * (1.0 - smoothstep(0.215 - px, 0.215 + px, d));
  float st = fract(a * 2.8648 + d * 28.0), sw = clamp(px * 28.0, 0.02, 0.5);
  vec3 haz = mix(vec3(0.02, 0.02, 0.02), vec3(0.85, 0.6, 0.03), smoothstep(0.5 - sw, 0.5 + sw, st) - smoothstep(1.0 - sw, 1.0, st) + 1.0 - smoothstep(0.0, sw, st)) * (0.85 + 0.15 * n);
  con = mix(con, haz * mix(0.55, 1.0, smoothstep(0.165, 0.2, d)) * (1.0 - 0.3 * smoothstep(0.55, 0.85, cn)), hz);
  diffuseColor.rgb = mix(bas, con, 1.0 - smoothstep(0.27 - px, 0.27 + px, d));
}`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  vec3 dx = dFdx(-vViewPosition), dy = dFdy(-vViewPosition), r1 = cross(dy, normal), r2 = cross(normal, dx);
  float det = dot(dx, r1), H = -0.0015 * moJ;
  normal = normalize(abs(det) * normal - sign(det) * (dFdx(H) * r1 + dFdy(H) * r2));
}`);
    };
    m.customProgramCacheKey = () => 'moGround';
    return this.mats.moGround = this.own(m, 0.55);
  }
  // the bore: a disc at (x, z) whose fragment shader intersects the view ray
  // with a cylinder of radius rad and depth dep (board units) below it
  shaft(ctx, x, z, y, rad, dep, kind = 'mohole') {
    const k = this.kOf(ctx.cell), cell = ctx.cell;
    const disc = new THREE.CircleGeometry(rad * 1.001, 40).rotateX(-Math.PI / 2).translate(x, y, z);
    disc.deleteAttribute('uv');
    this.drape(disc, cell, ctx.H);
    const C = cell.proj(x, z, ctx.H + y * k).sub(cell.center), ax = cell.proj(x, z, 1).sub(cell.proj(x, z, 0)).normalize();
    const n = disc.attributes.position.count, rep = (v) => { const a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set([v.x, v.y, v.z], i * 3); return new THREE.BufferAttribute(a, 3); };
    disc.setAttribute('aC', rep(C)); disc.setAttribute('aAx', rep(ax)); disc.setAttribute('aRef', rep(cell.east));
    disc.setAttribute('aRD', rep(new V3(rad * k, dep * k, kind === 'ucity' ? 0.034 * k : 0)));      // (z: the Underground City's floor height)
    const m = new THREE.Mesh(disc, this.mats['shaft' + kind] ||= Object.assign(new THREE.ShaderMaterial({
      uniforms: { uTime: this.time },
      defines: { ATRIUM: kind === 'atrium' || kind === 'ucity' ? 1 : 0, UC: kind === 'ucity' ? 1 : 0 },
      vertexShader: /* glsl */`
        attribute vec3 aC, aAx, aRef, aRD;
        varying vec3 vP, vCam, vC, vAx, vRef, vRD;
        void main(){
          vP = position; vC = aC; vAx = aAx; vRef = aRef; vRD = aRD;
          vCam = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform float uTime;
        varying vec3 vP, vCam, vC, vAx, vRef, vRD;
        void main(){
          vec3 d = normalize(vP - vCam), ax = normalize(vAx);
          vec3 q = vP - vC; q -= ax * dot(q, ax);
          vec3 v = d - ax * dot(d, ax);
          float a = max(dot(v, v), 1e-6), b = dot(q, v), c = dot(q, q) - vRD.x * vRD.x;
          float t = (-b + sqrt(max(b * b - a * c, 0.0))) / a;
          vec3 h = vP + d * t - vC; float y = dot(h, ax);
          vec3 col;
          vec3 side = normalize(cross(ax, vRef));
          if (y < -vRD.y) {                                         // the bottom
            float tb = (-vRD.y - dot(vP - vC, ax)) / dot(d, ax);
            vec3 hb = vP + d * tb - vC; hb -= ax * dot(hb, ax);
            float rr = length(hb) / vRD.x, an = atan(dot(hb, side), dot(hb, vRef));
            #if UC
            float A2 = an + 3.1416;                                 // the Underground City's floor: a plaza, lawns in six sectors, a pond, lamps
            vec3 fc = mix(vec3(0.52, 0.44, 0.36), vec3(0.2, 0.42, 0.14), step(0.3, rr) * step(rr, 0.8) * step(0.2, fract(A2 * 0.9549)));
            fc = mix(fc, vec3(0.16, 0.4, 0.54), step(rr, 0.2));
            float lamp = step(0.88, fract(A2 * 1.91)) * step(abs(rr - 0.88), 0.035) + step(abs(rr - 0.235), 0.025) * step(0.72, fract(A2 * 2.55));
            col = fc * (0.6 + 0.5 * (1.0 - rr)) + vec3(1.3, 0.9, 0.5) * lamp + vec3(0.2, 0.11, 0.04);
            #elif ATRIUM
            float lamp = step(0.8, fract(an * 1.91)) * step(abs(rr - 0.6), 0.05);
            col = mix(vec3(0.12, 0.3, 0.1), vec3(0.2, 0.18, 0.16), step(0.75, rr)) + vec3(1.0, 0.8, 0.5) * lamp + vec3(0.25, 0.2, 0.1) * (1.0 - rr);
            #else
            float fl = 0.5 + 0.5 * sin(an * 5.0 + uTime * 1.3 + rr * 9.0) * sin(rr * 13.0 - uTime * 2.1);
            col = mix(vec3(1.6, 1.2, 0.55), vec3(1.2, 0.3, 0.04), smoothstep(0.0, 1.0, rr)) * (0.8 + 0.4 * fl);
            #endif
          } else {
            #if UC
            // the Underground City's shaft: floors of balconies (a lit rail, planters), windows lit more
            // the deeper they are, warm light rising from below, glass lifts running up and down
            float depth = -y / vRD.y, fl = -y / vRD.z, fi = floor(fl), ff = fract(fl);
            vec3 hp = h - ax * y; float an = atan(dot(hp, side), dot(hp, vRef)), A = (an + 3.1416) / 6.2832;
            float NC = floor(6.2832 * vRD.x / (vRD.z * 0.42)), ca = A * NC, ci = floor(ca), fa = fract(ca);
            float rnd = fract(sin(ci * 12.9898 + fi * 78.233) * 43758.5453);
            float sun = mix(0.75, 0.08, smoothstep(0.0, 0.3, depth)) * (0.7 + 0.3 * max(0.0, dot(normalize(hp), vRef)));
            vec3 lt = vec3(sun) + vec3(1.0, 0.55, 0.25) * (0.1 + 1.1 * depth * depth);
            col = vec3(0.62, 0.56, 0.5) * lt;
            float win = step(0.3, ff) * step(ff, 0.74) * step(0.14, fa) * step(fa, 0.86);
            col = mix(col, vec3(0.09, 0.08, 0.09), win);
            col += mix(vec3(1.3, 0.72, 0.32), vec3(0.75, 0.95, 1.15), step(0.9, rnd)) * win * step(0.45 - 0.3 * depth, rnd);
            col = mix(col, vec3(0.42, 0.4, 0.38) * lt, step(0.88, ff));
            col += vec3(1.1, 0.75, 0.4) * step(0.955, ff) * 0.8;
            col = mix(col, vec3(0.18, 0.4, 0.14) * (lt + 0.2), step(0.8, ff) * step(ff, 0.88) * step(0.45, fract(sin(ci * 3.71 + fi * 11.13) * 9123.1)));
            float E = A * 3.0 + 0.08, ec = step(abs(fract(E) - 0.5), 0.8 / NC) * step(20.0, NC);
            float car = step(abs(depth - fract(uTime * 0.035 + floor(E) * 0.37)), 0.03);
            col = mix(col, vec3(0.1, 0.16, 0.2) * (lt + 0.3) + vec3(1.3, 1.1, 0.7) * car, ec);
            #elif ATRIUM
            float depth = -y / vRD.y;
            vec3 hp = h - ax * y; float an = atan(dot(hp, side), dot(hp, vRef));
            float fl = depth * 9.0, fi = floor(fl), ff = fract(fl);
            float cell = floor((an + 3.1416) * 7.0);
            float lit = step(0.45, fract(sin(cell * 12.9898 + fi * 78.233) * 43758.5453));
            float win = step(0.3, ff) * step(ff, 0.75) * step(0.2, fract((an + 3.1416) * 7.0)) * step(fract((an + 3.1416) * 7.0), 0.85);
            float sun = mix(1.0, 0.25, smoothstep(0.0, 0.4, depth)) * (0.7 + 0.3 * max(0.0, dot(normalize(hp), vRef)));
            col = vec3(0.62, 0.62, 0.64) * sun * (1.0 - 0.5 * step(0.88, ff));
            col = mix(col, vec3(0.08, 0.1, 0.14), win);
            col += vec3(1.1, 0.78, 0.42) * win * lit;
            #else
            float depth = -y / vRD.y;                               // 0 at the lip .. 1 at the bottom
            vec3 hp = h - ax * y; float an = atan(dot(hp, side), dot(hp, vRef));
            float rib = 0.5 + 0.5 * sin(an * 28.0);
            float ring = smoothstep(0.3, 0.5, abs(fract(depth * 16.0) - 0.5));
            float lit = mix(1.0, 0.18, smoothstep(0.0, 0.35, depth)) * (0.75 + 0.25 * max(0.0, dot(normalize(hp), vRef)));
            col = vec3(0.17, 0.15, 0.145) * (0.72 + 0.28 * rib) * (1.0 - 0.35 * ring) * lit;
            col += vec3(1.4, 0.45, 0.08) * pow(depth, 1.8) * 1.2;
            float lamp = step(0.955, fract(depth * 6.0)) * step(0.72, fract(an * 1.2732));
            col += vec3(0.45, 0.9, 1.0) * lamp * (1.0 - depth * 0.6);
            // service platforms every quarter of the way down (a dark ledge, a dashed warm rail light), three lift
            // rails from the headframe's side round (their cars riding up and down), steam haze over the heat below
            float an0 = an - 1.05, rA = mod(an0 + 3.1416, 2.0944) - 1.0472, ri = floor((an0 + 3.1416) / 2.0944);
            float pl = abs(fract(depth * 4.0 + 0.5) - 0.5) / 4.0 * vRD.y / vRD.x;
            float ledge = (1.0 - smoothstep(0.1, 0.16, pl)) * step(0.05, depth);
            col = mix(col, vec3(0.06, 0.055, 0.055) * (lit + 0.2), ledge * 0.7);
            col += vec3(1.2, 0.75, 0.35) * (1.0 - smoothstep(0.02, 0.04, pl)) * step(0.45, fract(an * 6.0)) * step(0.1, depth) * (1.0 - 0.5 * depth);
            col = mix(col, vec3(0.04, 0.04, 0.045) * (lit + 0.3), (1.0 - smoothstep(0.07, 0.1, abs(rA))) * 0.85);
            float cd = 0.04 + 0.9 * (0.5 - 0.5 * cos(uTime * 0.21 + ri * 2.3));
            float car = (1.0 - smoothstep(0.18, 0.26, abs(depth - cd) * vRD.y / vRD.x)) * (1.0 - smoothstep(0.1, 0.14, abs(rA)));
            col = mix(col, vec3(1.35, 1.1, 0.72) * (1.0 - 0.4 * depth), car);
            float haze = smoothstep(0.3, 1.0, depth) * (0.6 + 0.4 * sin(an * 3.0 + depth * 14.0 - uTime * 1.2) * sin(an * 5.0 - depth * 9.0 - uTime * 0.8));
            col = mix(col, vec3(1.05, 0.5, 0.2), haze * 0.3);
            #endif
          }
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }), { userData: { shared: true } }));
    ctx.g.add(m);
    return m;
  }
}
