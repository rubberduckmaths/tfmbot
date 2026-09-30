// nature_kit.js -- TileArt mixin: shared nature pieces -- tree, animal and bird templates, the Ecological Zone's
// water, falls and ground materials (also used by the Natural Preserve and the Capital), and river mouths into the sea.
import { mergeGeometries } from '../../../vendor/BufferGeometryUtils.js';
import * as THREE from 'three';
import { gfx } from '../quality.js';
import { BOX, Kit, TAU, V3, _c, _c2, clamp01, hash2, part, smooth, smoothGeo, tagPart, vnoise } from './kit.js';

export class NatureKit {
  // ---------------------------------------------------------------- nature kit
  // smooth-shaded templates in board units (y up, facing +x), cached
  natureKit() {
    if (this._nk) return this._nk;
    const weld = (parts) => smoothGeo(mergeGeometries(parts.map((p) => { const q = p.index ? p.toNonIndexed() : p; q.deleteAttribute('uv'); q.deleteAttribute('normal'); return q; })), 1e-4);
    // conifer: five drooping tiers, welded; height ~0.12
    const tiers = [];
    for (let k = 0; k < 5; k++) { const rr = 0.032 * (1 - k * 0.16), hh = 0.04 - k * 0.003, y = 0.022 + k * 0.019; tiers.push(new THREE.ConeGeometry(rr, hh, 12, 2).translate(0, y + hh / 2, 0)); }
    const conifer = weld(tiers);
    const trunk = new THREE.CylinderGeometry(0.0035, 0.006, 0.03, 7).translate(0, 0.015, 0);
    // broadleaf crown: lumpy welded blobs
    const bl = [[0, 0.07, 0, 0.026], [0.018, 0.06, 0.008, 0.02], [-0.016, 0.062, -0.008, 0.021], [0.004, 0.058, -0.019, 0.019], [-0.006, 0.086, 0.004, 0.017]];
    const broad = weld(bl.map(([x, y, z, r]) => new THREE.IcosahedronGeometry(r, 2).translate(x, y, z)));
    // quadrupeds: capsules and ellipsoids (all smooth)
    const cap = (r, L, seg = 10) => new THREE.CapsuleGeometry(r, L, 5, seg);
    const deer = (stag) => {
      const g = [
        [cap(0.0075, 0.02).rotateZ(Math.PI / 2), 0xa0683a, [0, 0.03, 0]],
        [cap(0.0042, 0.013).rotateZ(-0.55), 0xa0683a, [0.014, 0.043, 0]],
        [new THREE.SphereGeometry(0.0052, 12, 8).scale(1.5, 0.95, 0.9), 0x9a6034, [0.021, 0.052, 0]],
        [new THREE.SphereGeometry(0.0022, 8, 6), 0x2a1a10, [0.028, 0.051, 0]],
        [cap(0.0026, 0.004).rotateZ(-0.3), 0xf0e6d6, [-0.017, 0.035, 0]],
        [new THREE.SphereGeometry(0.0062, 10, 8).scale(1.4, 0.8, 1.2), 0xe8dcc8, [0, 0.025, 0]],
      ];
      for (const [x, z] of [[-0.009, 0.004], [-0.009, -0.004], [0.009, 0.004], [0.009, -0.004]]) g.push([cap(0.0017, 0.02, 6), 0x7a4a28, [x, 0.013, z]]);
      for (const s of [-1, 1]) g.push([new THREE.SphereGeometry(0.0025, 8, 6).scale(0.6, 1.4, 0.4), 0x8a5430, [0.018, 0.058, s * 0.004]]);
      if (stag) for (const s of [-1, 1]) {
        g.push([new THREE.CylinderGeometry(0.0007, 0.001, 0.014, 5).rotateX(s * 0.35).rotateZ(-0.3), 0xd8c8a8, [0.019, 0.063, s * 0.004]]);
        g.push([new THREE.CylinderGeometry(0.0006, 0.0008, 0.007, 5).rotateX(s * 0.9), 0xd8c8a8, [0.022, 0.066, s * 0.007]]);
      }
      return g;
    };
    const bear = [
      [new THREE.SphereGeometry(0.016, 16, 12).scale(1.5, 1, 1), 0x4a3222, [0, 0.021, 0]],
      [new THREE.SphereGeometry(0.011, 14, 10), 0x4a3222, [0.012, 0.03, 0]],
      [new THREE.SphereGeometry(0.009, 14, 10).scale(1.1, 1, 1), 0x523826, [0.026, 0.027, 0]],
      [new THREE.SphereGeometry(0.005, 10, 8).scale(1.3, 0.9, 0.9), 0x7a5a42, [0.035, 0.025, 0]],
      [new THREE.SphereGeometry(0.0016, 6, 5), 0x111111, [0.041, 0.026, 0]],
      ...[-1, 1].map((s) => [new THREE.SphereGeometry(0.003, 8, 6), 0x3a2618, [0.024, 0.036, s * 0.006]]),
      ...[[-0.012, 0.007], [-0.012, -0.007], [0.012, 0.007], [0.012, -0.007]].map(([x, z]) => [cap(0.0045, 0.008, 8), 0x3e2a1c, [x, 0.008, z]]),
    ];
    const toGeo = (list) => mergeGeometries(list.map(([geo, col, t]) => part(geo, col, t)));
    const eagle = toGeo([
      [new THREE.SphereGeometry(0.004, 10, 8).scale(2.2, 0.8, 0.9), 0x4a3526, [0, 0, 0]],
      [new THREE.SphereGeometry(0.0028, 8, 6), 0xf4f0e8, [0.009, 0.001, 0]],
      [new THREE.SphereGeometry(0.004, 10, 6).scale(0.9, 0.18, 3.6), 0x3e2c20, [0, 0.001, 0.012]],
      [new THREE.SphereGeometry(0.004, 10, 6).scale(0.9, 0.18, 3.6), 0x3e2c20, [0, 0.001, -0.012]],
      [new THREE.SphereGeometry(0.003, 8, 6).scale(1.6, 0.3, 1.2), 0xf4f0e8, [-0.009, 0, 0]],
    ]);
    const rock = smoothGeo(new THREE.IcosahedronGeometry(1, 2));
    { const P = rock.attributes.position; for (let i = 0; i < P.count; i++) { const x = P.getX(i), y = P.getY(i), z = P.getZ(i), n = 0.8 + 0.4 * vnoise(x * 2 + 5, z * 2 + y * 3); P.setXYZ(i, x * n, y * n, z * n); } rock.computeVertexNormals(); }
    return this._nk = { conifer, trunk, broad, deer: toGeo(deer(false)), stag: toGeo(deer(true)), bear: toGeo(bear), eagle, rock };
  }
  // a flock of birds wheeling round a point (one mesh, turned in tick)
  flock(ctx, geo, n, x, z, y, rad, speed, seed) {
    if (gfx.low) return null;                         // (no birds at Low quality)
    const r = this.env.srand(seed), parts = [];
    for (let i = 0; i < n; i++) { const a = i / n * TAU + r() * 0.8, rr = rad * (0.7 + r() * 0.5), h = (r() - 0.5) * 0.04; parts.push(part(geo, null, [Math.sin(a) * rr, h, Math.cos(a) * rr], [-0.3 * Math.sign(speed) + 0.1 * (r() - 0.5), a + (speed < 0 ? Math.PI : 0), 0, 'YXZ'])); }   // (the birds face +x: beak along the way round, banked into the turn)
    const m = new THREE.Mesh(mergeGeometries(parts), this.mat('std'));
    m.castShadow = true;
    return this.spin(this.place(m, ctx, x, z, y), speed, r() * 6);
  }

  // ---------------------------------------------------------------- Ecological Zone parts
  // The valley's own kit (built once, shared by every Ecological Zone): three
  // conifers -- a spire fir, a Jeffrey pine with a clumpy crown on a tall bare
  // trunk, a lumpy incense cedar -- a dead snag, a birch clump, deer (standing,
  // grazing, a stag), a black bear with a fish, an eagle with fingered wing
  // tips, grass tufts, a wildflower, talus rocks and a ranger's log cabin.
  yosemiteKit() {
    if (this._yk) return this._yk;
    const weld = (parts, tol = 1e-4) => smoothGeo(mergeGeometries(parts.map((p) => { const q = p.index ? p.toNonIndexed() : p; q.deleteAttribute('uv'); q.deleteAttribute('normal'); return q; })), tol);
    const lumpy = (g, amp, f, seed) => {             // radial noise on a welded shape: organic, uneven crowns
      const P = g.attributes.position;
      for (let i = 0; i < P.count; i++) { const x = P.getX(i), y = P.getY(i), z = P.getZ(i), k = 1 + amp * (vnoise(x * f + seed, z * f + y * f * 0.8 + seed) - 0.5) * 2; P.setXYZ(i, x * k, y, z * k); }
      g.computeVertexNormals();
      return g;
    };
    const toGeo = (list) => mergeGeometries(list.map(([geo, col, t, rr]) => part(geo, col, t, rr || [0, 0, 0])));
    // an animal that moves a little (ecoAnimMat): the rest pose plus two posed copies, one per
    // channel (bit 1 / bit 2 of a part's ch); each channel turns its parts about a pivot (ch[i] =
    // [pivot, euler]; a part's own [pivot, euler] overrides channel 2's). eco() turns the poses into
    // per-vertex offsets once the animal is placed and draped.
    const animGeo = (list, ch) => {
      const M = new THREE.Matrix4(), T = new THREE.Matrix4(), mOf = ([pv, eu]) => M.makeTranslation(pv[0], pv[1], pv[2]).multiply(T.makeRotationFromEuler(new THREE.Euler(eu[0], eu[1], eu[2]))).multiply(T.makeTranslation(-pv[0], -pv[1], -pv[2]));
      const pose = (c) => mergeGeometries(list.map(([geo, col, t, rr, m = 0, own]) => { const g = part(geo, col, t, rr || [0, 0, 0]); if (m & (1 << c)) g.applyMatrix4(mOf(c && own ? own : ch[c])); return g; }));
      return { rest: toGeo(list), p1: pose(0), p2: pose(1) };
    };
    const cap = (rad, L, seg = 8) => new THREE.CapsuleGeometry(rad, L, 2, seg);
    const S = (rad, w = 10, h = 8) => new THREE.SphereGeometry(rad, w, h);
    // ---- trees (template y = 0 at the foot; coloured per tree when placed)
    const fir = lumpy(weld(Array.from({ length: 7 }, (_, k) => { const f = k / 6, rr = 0.027 * (1 - f * 0.78), hh = 0.03 - f * 0.009; return new THREE.ConeGeometry(rr, hh, 9, 1).translate(0, 0.016 + k * 0.0165 + hh / 2, 0); })), 0.14, 90, 3);
    const trunk = new THREE.CylinderGeometry(0.0028, 0.0048, 0.03, 6).translate(0, 0.015, 0);
    const pineCrown = lumpy(weld([[0, 0.1, 0, 0.02, 0.011], [0.013, 0.086, 0.006, 0.015, 0.009], [-0.012, 0.09, -0.006, 0.016, 0.009], [0.004, 0.077, -0.013, 0.014, 0.008], [-0.006, 0.073, 0.012, 0.013, 0.008], [0.001, 0.115, 0.001, 0.012, 0.009]]
      .map(([x, y, z, rr, ry]) => new THREE.IcosahedronGeometry(1, 1).scale(rr, ry, rr).translate(x, y, z))), 0.2, 120, 7);
    const pineTrunk = mergeGeometries([part(new THREE.CylinderGeometry(0.0021, 0.0042, 0.1, 6).translate(0, 0.05, 0), 0xffffff),
      ...[[0.05, 0.9, 0.5], [0.06, 1.0, 2.6], [0.066, 0.8, 4.4]].map(([y, tl, a]) => part(new THREE.CylinderGeometry(0.0005, 0.0009, 0.012, 4).translate(0, 0.006, 0), 0xffffff, [0, y, 0], [0, a, -tl, 'YXZ']))]);
    const cedar = lumpy(weld(Array.from({ length: 6 }, (_, k) => { const f = k / 5, rr = 0.025 * (1 - f * 0.7); return new THREE.IcosahedronGeometry(1, 1).scale(rr, 0.019, rr).translate(0, 0.031 + k * 0.0136, 0); })), 0.16, 110, 11);   // a column of lumpy tiers
    const cedarTrunk = new THREE.CylinderGeometry(0.003, 0.0058, 0.03, 6).translate(0, 0.015, 0);
    const snag = mergeGeometries([part(new THREE.CylinderGeometry(0.0012, 0.0042, 0.095, 6, 3).translate(0, 0.0475, 0), 0xffffff),
      ...[[0.045, 1.0, 0.3], [0.058, 0.8, 2.2], [0.07, 1.1, 4.1], [0.036, 0.9, 5.3]].map(([y, tl, a]) => part(new THREE.CylinderGeometry(0.0005, 0.001, 0.016, 4).translate(0, 0.008, 0), 0xffffff, [0, y, 0], [0, a, -tl, 'YXZ']))]);
    const birchTrunks = mergeGeometries([[0, 0, 0.1, 0.07], [0.004, 0.003, -0.15, 0.062], [-0.003, 0.004, 0.05, 0.055]]
      .map(([x, z, lean, L]) => part(new THREE.CylinderGeometry(0.001, 0.0018, L, 5, 7).translate(0, L / 2, 0), 0xffffff, [x, 0, z], [lean, 0, lean * 0.7])));
    const birchCrown = lumpy(weld([[0, 0.068, 0, 0.013], [0.009, 0.058, 0.006, 0.011], [-0.008, 0.06, -0.004, 0.011], [0.002, 0.052, -0.01, 0.01], [-0.002, 0.078, 0.003, 0.009]]
      .map(([x, y, z, rr]) => new THREE.IcosahedronGeometry(rr, 1).translate(x, y, z))), 0.22, 150, 5);
    // ---- animals (they face +x)
    const deer = (stag, graze) => {
      const B = 0x9b6b42, M = 0x7a5234;
      const g = [
        [S(0.01, 12, 8).scale(1.55, 0.82, 0.72), B, [0, 0.034, 0]],                        // barrel
        [S(0.0085, 10, 6).scale(1.3, 0.55, 0.62), 0xe2d4bc, [0.001, 0.029, 0]],               // pale belly
        [S(0.0058, 10, 8).scale(0.55, 0.85, 0.85), 0xe4d8c4, [-0.0142, 0.0345, 0]],           // pale rump patch
        [S(0.0017, 6, 5).scale(0.7, 1.7, 0.7), 0xc8b294, [-0.0172, 0.0385, 0], [0, 0, 0.5], 2, [[-0.0165, 0.041, 0], [0.9, 0, 0]]],   // short tail (it swishes)
      ];
      const hx = graze ? 0.025 : 0.021, hy = graze ? 0.019 : 0.0575;
      g.push([cap(0.0036, 0.014).rotateZ(graze ? -2.2 : -0.65), B, [graze ? 0.018 : 0.0145, graze ? 0.028 : 0.046, 0], 0, 1]);   // neck
      g.push([S(0.0052, 10, 7).scale(1.25, 0.9, 0.85), B, [hx, hy, 0], [0, 0, graze ? -0.9 : 0], 1]);                          // head
      g.push([S(0.0034, 10, 6).scale(1.5, 0.8, 0.8), M, [hx + (graze ? 0.0035 : 0.0055), hy - (graze ? 0.0045 : 0.002), 0], [0, 0, graze ? -0.9 : 0], 1]);   // muzzle
      g.push([S(0.0014, 6, 4), 0x111111, [hx + (graze ? 0.0055 : 0.0102), hy - (graze ? 0.0085 : 0.0018), 0], 0, 1]);            // nose
      for (const s of [-1, 1]) g.push([S(0.0032, 8, 6).scale(0.35, 1.5, 0.85), 0x8a5a36, [hx - 0.0025, hy + 0.006, s * 0.0048], [s * 0.55, 0, 0], 3, [[hx - 0.0025, hy + 0.002, s * 0.0035], [s * 0.7, 0, 0.35]]]);   // big mule-deer ears (they flick)
      for (const [x, z] of [[-0.0105, 0.0042], [-0.0105, -0.0042], [0.0105, 0.0042], [0.0105, -0.0042]]) {
        g.push([cap(0.0021, 0.011, 6), B, [x, 0.0215, z]]);                                  // upper leg
        g.push([cap(0.0012, 0.013, 5), M, [x + (x < 0 ? -0.001 : 0.0005), 0.0085, z]]);     // slim lower leg
        g.push([S(0.0014, 5, 4), 0x2a1a10, [x, 0.0012, z]]);                                  // hoof
      }
      if (stag) for (const s of [-1, 1]) {                                                    // antlers: a beam swept back, three tines forward
        const base = new V3(hx - 0.0015, hy + 0.004, s * 0.003), eu = new THREE.Euler(s * 0.5, 0, 0.5), dir = new V3(0, 1, 0).applyEuler(eu), bl = 0.017;
        g.push([new THREE.CylinderGeometry(0.00055, 0.0008, bl, 5).translate(0, bl / 2, 0), 0xd8c8a8, base.toArray(), [eu.x, eu.y, eu.z], 1]);
        for (const [f, tl, tz] of [[0.35, 0.007, -0.5], [0.65, 0.0065, -0.3], [0.95, 0.005, 0.1]]) g.push([new THREE.CylinderGeometry(0.0004, 0.0006, tl, 4).translate(0, tl / 2, 0), 0xd8c8a8, base.clone().addScaledVector(dir, bl * f).toArray(), [s * 0.2, 0, tz], 1]);
      }
      // channel 1: a grazer lifts its head to look up; a standing deer turns its head to look round
      return animGeo(g, [graze ? [[0.012, 0.036, 0], [0, 0, 0.75]] : [[0.011, 0.04, 0], [0, 0.55, -0.12]], null]);
    };
    const BR = 0x4e3322, BD = 0x35231a;
    const bear = animGeo([
      [S(0.0155, 14, 10).scale(1.5, 0.92, 0.95), BR, [-0.002, 0.024, 0]],                    // body
      [S(0.0105, 10, 8), BR, [0.011, 0.034, 0]],                                              // the shoulder hump
      [S(0.0082, 10, 8).scale(1.1, 0.95, 1), BR, [0.026, 0.022, 0], 0, 1],                    // head, low over the water
      [S(0.0046, 10, 8).scale(1.5, 0.85, 0.9), 0x9a7a58, [0.0345, 0.0185, 0], 0, 1],          // tan snout
      [S(0.0016, 6, 5), 0x111111, [0.041, 0.019, 0], 0, 1],                                    // nose
      ...[-1, 1].map((s) => [S(0.0028, 8, 6), BD, [0.023, 0.0305, s * 0.0052], 0, 1]),        // round ears
      ...[[-0.013, 0.0072], [-0.013, -0.0072], [0.013, 0.0072], [0.013, -0.0072]].map(([x, z], i) => [cap(0.0048, 0.01, 6), BD, [x, 0.009, z], 0, i === 2 ? 2 : 0]),
      [S(0.0032, 8, 6).scale(2.4, 0.7, 0.45), 0xc4d0d8, [0.0405, 0.0135, 0], [0.2, 1.3, 0], 1],   // a silver trout in its jaws
    ], [[[0.017, 0.028, 0], [0, 0, -0.38]], [[0.013, 0.02, 0.0072], [0, 0, 1.05]]]);   // 1: the head dips to the water; 2: a front paw swipes
    const EB = 0x3a2a1c, EW = 0xf4f0e8;
    const eagle = [
      [S(0.004).scale(2.3, 0.8, 0.95), EB, [0, 0, 0]],
      [S(0.0029, 8, 6), EW, [0.0092, 0.0012, 0]],                                            // white head
      [new THREE.ConeGeometry(0.0012, 0.0035, 6).rotateZ(-Math.PI / 2), 0xf0b820, [0.0125, 0.0008, 0]],   // yellow beak
      [S(0.003, 8, 6).scale(1.7, 0.25, 1.35), EW, [-0.0105, 0, 0]],                          // white tail fan
    ];
    for (const s of [-1, 1]) {
      eagle.push([S(0.0042, 10, 6).scale(1.15, 0.16, 3.0), EB, [-0.0005, 0.0012, s * 0.0115], [-s * 0.12, 0, 0]]);        // broad wing, a slight dihedral
      for (let f = 0; f < 4; f++) eagle.push([S(0.0011, 5, 3).scale(1.3, 0.35, 3.6), 0x241a12, [0.0025 - f * 0.0022, 0.0022, s * (0.0232 + f * 0.0006)], [0, s * (0.25 - f * 0.17), 0]]);   // fingered primaries
    }
    // ---- ground cover
    const tuft = mergeGeometries(Array.from({ length: 6 }, (_, i) => part(new THREE.ConeGeometry(0.0011, 0.011 + 0.003 * (i % 3), 3, 1, true).translate(0, 0.0055 + 0.0015 * (i % 3), 0), 0xffffff,
      [Math.cos(i * 2.4) * 0.0018, 0, Math.sin(i * 2.4) * 0.0018], [Math.sin(i * 2.4) * 0.35, 0, -Math.cos(i * 2.4) * 0.35])));
    const flower = mergeGeometries([part(new THREE.CylinderGeometry(0.0003, 0.0003, 0.008, 3).translate(0, 0.004, 0), 0xffffff), part(new THREE.OctahedronGeometry(0.0022, 0), 0xffffff, [0, 0.0085, 0], [0, 0, 0], [1, 0.6, 1])]);
    const rockOf = (det, seed) => { const g = smoothGeo(new THREE.IcosahedronGeometry(1, det)); const P = g.attributes.position; for (let i = 0; i < P.count; i++) { const x = P.getX(i), y = P.getY(i), z = P.getZ(i), n = 0.72 + 0.5 * vnoise(x * 1.8 + seed, z * 1.8 + y * 2.6 + seed); P.setXYZ(i, x * n, y * n * 0.85, z * n); } g.computeVertexNormals(); return g; };
    // ---- the ranger's cabin: stone footing, log walls, gables, a green roof, a stone chimney, a porch (door on +x)
    const logs = (X, Yy) => (Math.floor(Yy / 0.0032) % 2 ? _c.setRGB(0.4, 0.26, 0.15) : _c.setRGB(0.52, 0.35, 0.21));
    const gable = new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(-0.015, 0), new THREE.Vector2(0.015, 0), new THREE.Vector2(0, 0.011)]), { depth: 0.044, bevelEnabled: false }).translate(0, 0.025, -0.022);
    const cabin = mergeGeometries([
      part(BOX, 0x7e7a72, [0, -0.002, 0], [0, 0, 0], [0.038, 0.008, 0.052]),                          // footing
      part(new THREE.BoxGeometry(1, 1, 1, 1, 7, 1), logs, [0, 0.0125, 0], [0, 0, 0], [0.03, 0.021, 0.044]),   // log walls
      part(gable, logs),
      ...[-1, 1].map((s) => part(BOX, 0x3f5a3a, [s * 0.0085, 0.0317, 0], [0, 0, -s * 0.63], [0.0215, 0.0022, 0.052])),   // roof
      part(BOX, 0x8a847a, [-0.005, 0.024, -0.017], [0, 0, 0], [0.0065, 0.034, 0.0065]),              // chimney
      part(BOX, 0x2a1a10, [0.0152, 0.0115, 0.007], [0, 0, 0], [0.0012, 0.013, 0.0075]),              // door
      ...[-0.011, 0.018].map((z) => part(BOX, 0xf2dc9a, [0.0152, 0.0145, z], [0, 0, 0], [0.0012, 0.0055, 0.0065])),   // lit windows
      part(BOX, 0x7a5a3a, [0.0205, 0.0025, 0.002], [0, 0, 0], [0.011, 0.0018, 0.034]),               // porch deck
      ...[-0.013, 0.017].map((z) => part(new THREE.CylinderGeometry(0.0009, 0.0009, 0.016, 5), 0x6a4a30, [0.025, 0.011, z])),
      part(BOX, 0x4a3a2c, [0.02, 0.0195, 0.002], [0, 0, -0.25], [0.013, 0.0016, 0.038]),             // porch roof
    ]);
    return this._yk = { fir, trunk, pineCrown, pineTrunk, cedar, cedarTrunk, snag, birchTrunks, birchCrown,
      deer: deer(false, false), graze: deer(false, true), stag: deer(true, false), bear, tuft, flower,
      eagle: ((g) => { const P = g.attributes.position, w = new Float32Array(P.count); for (let i = 0; i < P.count; i++) w[i] = Math.max(0, Math.abs(P.getZ(i)) - 0.004); g.setAttribute('aWing', new THREE.BufferAttribute(w, 1)); return g; })(toGeo(eagle)),   // (aWing: how far out along a wing, for the flap)
      rockA: rockOf(1, 3), rockB: rockOf(1, 11), rockC: rockOf(2, 5), cabin, chimney: [-0.005, 0.041, -0.017], animGeo, toGeo };
  }
  // the valley's water: board3d's ocean look (waterMaterial -- depth-tinted body
  // from clear shallows to deep blue, Fresnel sky, the sun's sheen and glints,
  // foam; the same sun, sky and exposure) on moving water: ripples advected along
  // a per-vertex flow (a two-phase flow map), whitewater where aW.y asks for it.
  //   aB board xz, aFlow board units / s, aW = (depth 0..1, whitewater 0..1, fade)
  ecoWaterMat() {
    if (this.mats.ecoWater) return this.mats.ecoWater;
    const wu = this.b.water?.uniforms;
    const m = new THREE.ShaderMaterial({
      uniforms: { uTime: this.time, uSun: wu?.uSun || { value: new V3(-0.62, 0.52, 0.58).normalize() }, uLife: wu?.uLife || { value: 0.5 }, uRip: { value: this.ecoRipTex() } },
      transparent: true, depthWrite: false,
      vertexShader: /* glsl */`
        attribute vec2 aB; attribute vec2 aFlow; attribute vec3 aW;
        varying vec3 vW; varying vec3 vN; varying vec2 vB; varying vec2 vFlow; varying vec3 vWt;
        void main(){ vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; vN=normalize(mat3(modelMatrix)*normal); vB=aB; vFlow=aFlow; vWt=aW; gl_Position=projectionMatrix*viewMatrix*w; }`,
      fragmentShader: /* glsl */`
        uniform float uTime; uniform vec3 uSun; uniform float uLife; uniform sampler2D uRip;
        varying vec3 vW; varying vec3 vN; varying vec2 vB; varying vec2 vFlow; varying vec3 vWt;
        void main(){
          vec3 n=normalize(vN);
          // the board's x / z on the surface (cotangent frame from the screen derivatives)
          vec3 dp1=dFdx(vW), dp2=dFdy(vW); vec2 du1=dFdx(vB), du2=dFdy(vB);
          vec3 q2=cross(dp2,n), q1=cross(n,dp1);
          vec3 T=q2*du1.x+q1*du2.x, B=q2*du1.y+q1*du2.y;
          float im=inversesqrt(max(max(dot(T,T),dot(B,B)),1e-24)); T*=im; B*=im;
          // flow map: two copies of the ripples dragged along the flow, half a cycle apart, crossfaded
          const float CYC=1.8;
          float ph0=fract(uTime/CYC), ph1=fract(uTime/CYC+0.5), w0=1.0-abs(2.0*ph0-1.0), w1=1.0-w0;
          vec2 fl=vFlow*CYC;
          vec2 uv=vB*11.0;
          vec3 a0=texture2D(uRip,uv-fl*11.0*ph0).rgb, a1=texture2D(uRip,uv-fl*11.0*ph1+vec2(0.43,0.27)).rgb;
          vec3 b0=texture2D(uRip,uv*2.7-fl*29.7*ph0+0.31).rgb, b1=texture2D(uRip,uv*2.7-fl*29.7*ph1+vec2(0.61,0.13)).rgb;
          float nv=inversesqrt(w0*w0+w1*w1);                                  // variance-preserving blend
          vec2 g=((a0.rg*2.0-1.0)*w0+(a1.rg*2.0-1.0)*w1)*nv*0.5+((b0.rg*2.0-1.0)*w0+(b1.rg*2.0-1.0)*w1)*nv*0.28;
          float fz=(a0.b*w0+a1.b*w1)*0.62+(b0.b*w0+b1.b*w1)*0.38;
          float sp=length(vFlow);
          g*=0.45+0.9*clamp(sp*14.0,0.0,1.0)+0.6*vWt.y;                        // choppier where it runs fast
          float fine=smoothstep(0.02,0.004,length(fwidth(vB))*3.0);            // (no sub-pixel sparkle from afar)
          g*=mix(0.4,1.0,fine);
          vec3 N=normalize(n-(T*g.x+B*g.y)*0.55);
          vec3 V=normalize(cameraPosition-vW);
          float NV=max(dot(N,V),0.0), fres=0.02+0.98*pow(1.0-NV,5.0);
          float diff=max(dot(n,uSun),0.0), dN=max(dot(N,uSun),0.0);
          // body colour by depth (the ocean's palette, a little clearer): shallows -> teal -> deep blue
          float d=vWt.x;
          vec3 shallow=vec3(0.30,0.62,0.56), mid=vec3(0.05,0.40,0.52), deep=vec3(0.03,0.19,0.38);
          vec3 body=d<0.4?mix(shallow,mid,d/0.4):mix(mid,deep,(d-0.4)/0.6);
          vec3 col=body*(0.3+0.85*dN);
          vec3 sky=mix(vec3(0.80,0.66,0.58),vec3(0.62,0.80,1.0),0.35+0.65*uLife);
          vec3 R=reflect(-V,N);
          vec3 skyR=sky*(0.35+0.6*diff)*(1.25-0.6*clamp(dot(R,n),0.0,1.0));
          col=mix(col,skyR,clamp(0.07+fres*0.8,0.0,0.85));
          float rs=max(dot(R,uSun),0.0);
          col+=vec3(1.0,0.96,0.86)*(pow(rs,40.0)*0.2+pow(rs,10.0)*0.06+pow(rs,500.0)*2.5*fine)*diff;
          // whitewater: the ripple noise over a threshold that drops as aW.y rises; a thin lace along the banks
          float wa=vWt.y;
          float foam=smoothstep(0.78-0.62*wa,0.9-0.55*wa,fz+0.2*wa)*smoothstep(0.02,0.18,wa);
          foam=max(foam,smoothstep(0.1,0.02,d)*smoothstep(0.55,0.75,fz)*0.55);
          col=mix(col,vec3(0.93,0.96,0.97)*(0.6+0.5*diff),foam*0.92);
          // clear over the gravel at the edges, deep water opaque
          float alpha=mix(0.28,0.95,smoothstep(0.0,0.5,d))+fres*0.2;
          alpha=max(alpha,foam*0.95)*vWt.z;
          gl_FragColor=vec4(col*0.700,clamp(alpha,0.0,1.0));                 // (0.700: board3d's EXPOSURE, as the ocean)
          #include <colorspace_fragment>
        }`,
    });
    m.userData.shared = true; m.userData.anim = 'fill';
    return this.mats.ecoWater = m;
  }
  // the falls: a sheet of streaks that speed up on the way down, ragged at the
  // sides, thinning into the spray at the foot; two layers for depth.  aF = (across 0..1, down 0..1, layer)
  ecoFallsMat() {
    if (this.mats.ecoFalls) return this.mats.ecoFalls;
    const wu = this.b.water?.uniforms;
    const m = new THREE.ShaderMaterial({
      uniforms: { uTime: this.time, uSun: wu?.uSun || { value: new V3(-0.62, 0.52, 0.58).normalize() }, uRip: { value: this.ecoRipTex() } },
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: /* glsl */`attribute vec3 aF; varying vec3 vF; varying vec3 vN;
        void main(){ vF=aF; vN=normalize(mat3(modelMatrix)*normal); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: /* glsl */`
        uniform float uTime; uniform vec3 uSun; uniform sampler2D uRip; varying vec3 vF; varying vec3 vN;
        void main(){
          float u=vF.x, t=vF.y, L=vF.z;
          float q=sqrt(t)*2.4-uTime*(0.8+0.2*L);                            // free fall: the pattern speeds up lower down
          float s1=texture2D(uRip,vec2(u*(1.3+0.5*L)+L*0.37,q*0.3)).b;
          float s2=texture2D(uRip,vec2(u*2.9+0.21,q*0.75+0.5)).b;
          float st=s1*0.62+s2*0.38;
          float edge=smoothstep(0.0,0.2+0.14*s2,u)*smoothstep(1.0,0.8-0.14*s1,u);
          float a=(0.28+0.85*smoothstep(0.3,0.7,st))*edge;
          a*=smoothstep(0.0,0.05,t)*(1.0-0.6*smoothstep(0.8,1.0,t));
          a*=L>0.5?0.5:1.0;
          float lit=abs(dot(normalize(vN),uSun))*0.4+0.62;
          vec3 col=mix(vec3(0.62,0.76,0.86),vec3(1.0),smoothstep(0.35,0.8,st))*lit;
          gl_FragColor=vec4(col*0.8,clamp(a,0.0,1.0));
          #include <colorspace_fragment>
        }`,
    });
    m.userData.shared = true; m.userData.anim = 'pour';
    return this.mats.ecoFalls = m;
  }
  // frozen falls: a still ice curtain (its own texture, never scrolled)
  ecoIcefallMat() {
    if (this.mats.ecoIcefall) return this.mats.ecoIcefall;
    const t = this.canvas('ecoIce', 32, 128, (g, w, h) => {
      g.fillStyle = 'rgb(228,240,250)'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 60; i++) { const x = hash2(i, 1) * w, L = 20 + hash2(i, 2) * 100, y = hash2(i, 3) * (h - L); g.fillStyle = `rgba(${hash2(i, 4) < 0.5 ? '255,255,255' : '150,185,215'},${0.35 + hash2(i, 5) * 0.5})`; g.fillRect(x, y, 1 + hash2(i, 6) * 2.5, L); }
    });
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    const m = new THREE.MeshStandardMaterial({ map: t, color: 0xeef6ff, roughness: 0.25, metalness: 0.05, transparent: true, opacity: 0.94, side: THREE.DoubleSide, emissive: 0x6a7a88, emissiveIntensity: 0.25 });
    this.own(m, 0.8); m.userData.anim = 'pour';
    return this.mats.ecoIcefall = m;
  }
  // the valley's animals and eagles, moving a little in the vertex shader off the shared clock
  // (no per-frame CPU work). aD1 / aD2 = the offsets to channel 1's / 2's pose (yosemiteKit
  // animGeo), aPh = (phase, kind): 0 a deer looking round, 1 a grazer (a chewing bob, now and
  // then its head comes up), 2 the bear (its head dips to the water, now and then a paw swipes);
  // ears and tails flick. 3 an eagle: aD1 = its wings' lift -- a few beats, then a glide on raised wings.
  ecoAnimMat() {
    if (this.mats.ecoAnim) return this.mats.ecoAnim;
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.08 });
    m.onBeforeCompile = (s) => {
      s.uniforms.uTime = this.time;
      s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aD1; attribute vec3 aD2; attribute vec2 aPh; uniform float uTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
{
  float t = uTime + aPh.x * 37.0, k = aPh.y, w1 = 0.0, w2 = 0.0;
  float flick = pow(max(sin(t * 2.3), 0.0), 16.0) * step(0.2, sin(t * 0.31 + 1.0));
  if (k < 0.5) { w1 = sin(t * 0.35) * smoothstep(0.1, 0.5, sin(t * 0.13)); w2 = flick; }
  else if (k < 1.5) { float up = smoothstep(0.55, 0.85, sin(t * 0.19)); w1 = up + (1.0 - up) * 0.08 * (0.5 + 0.5 * sin(t * 6.0)); w2 = flick; }
  else if (k < 2.5) { w1 = smoothstep(-0.6, 0.6, sin(t * 0.55)); w2 = pow(max(sin(t * 1.4), 0.0), 6.0) * step(0.5, sin(t * 0.23)); }
  else { w1 = mix(0.3, sin(t * 7.0), smoothstep(-0.2, 0.3, sin(t * 0.4))); }
  transformed += aD1 * w1 + aD2 * w2;
}`);
    };
    m.customProgramCacheKey = () => 'ecoAnim';
    this.own(m, 0.55);
    return this.mats.ecoAnim = m;
  }
  // eagles wheeling round a point (one mesh, turned in tick like flock): each flies beak first,
  // banked into the turn, and flaps (ecoAnimMat kind 3). None at Low quality.
  ecoEagles(ctx, geo, n, x, z, y, rad, speed, seed) {
    if (gfx.low) return null;
    const r = this.env.srand(seed), parts = [], sg = Math.sign(speed);
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU + r() * 0.8, rr = rad * (0.7 + r() * 0.5), h = (r() - 0.5) * 0.04, p = r();
      const g = part(geo, null, [Math.sin(a) * rr, h, Math.cos(a) * rr], [-sg * 0.3 * rad / rr, a + (sg < 0 ? Math.PI : 0), 0.08 * (p - 0.5), 'YXZ']);   // (+x, the beak, along the way round)
      const W = g.attributes.aWing, c = W.count, d1 = new Float32Array(c * 3), ph = new Float32Array(c * 2);
      for (let j = 0; j < c; j++) { d1[j * 3 + 1] = W.getX(j) * 0.5; ph[j * 2] = p; ph[j * 2 + 1] = 3; }
      g.deleteAttribute('aWing');
      g.setAttribute('aD1', new THREE.BufferAttribute(d1, 3)); g.setAttribute('aD2', new THREE.BufferAttribute(new Float32Array(c * 3), 3)); g.setAttribute('aPh', new THREE.BufferAttribute(ph, 2));
      parts.push(g);
    }
    const m = new THREE.Mesh(mergeGeometries(parts), this.ecoAnimMat());
    m.castShadow = true;
    return this.spin(this.place(m, ctx, x, z, y), speed, r() * 6);
  }
  // a tileable 128^2 data texture: rg = the slope of a periodic ripple field
  // (integer wave vectors + a little noise), b = periodic fbm (foam / streaks)
  ecoRipTex() {
    if (this.tex.ecoRip) return this.tex.ecoRip;
    const N = 128, d = new Uint8Array(N * N * 4), G = new Float32Array(N * N * 2), F = new Float32Array(N * N);
    const K = [[2, 1], [1, 3], [3, -2], [4, 1], [-1, 5], [5, 3], [6, -1], [3, 7], [-7, 4], [8, 5], [-9, 2]], ph = K.map((_, i) => hash2(i, 7) * TAU);
    const pn = (u, v, p) => {                               // periodic value noise, p cells across the tile
      const x = u * p, y = v * p, xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, w = (a) => ((a % p) + p) % p, h = (i, j) => hash2(w(i) + p * 17, w(j) + p * 5);
      const uu = xf * xf * (3 - 2 * xf), vv = yf * yf * (3 - 2 * yf), a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), e = h(xi + 1, yi + 1);
      return a + (b - a) * uu + (c - a) * vv + (a - b - c + e) * uu * vv;
    };
    let gmax = 1e-6;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const u = i / N, v = j / N, k = j * N + i, e = 1 / N;
      let gx = 0, gy = 0;
      for (let q = 0; q < K.length; q++) { const [kx, ky] = K[q], a = Math.pow(Math.hypot(kx, ky), -1.3), c = Math.cos(TAU * (kx * u + ky * v) + ph[q]) * a * TAU; gx += c * kx; gy += c * ky; }
      const n0 = pn(u, v, 16); gx += (pn(u + e, v, 16) - n0) / e * 0.1; gy += (pn(u, v + e, 16) - n0) / e * 0.1;
      G[k * 2] = gx; G[k * 2 + 1] = gy; gmax = Math.max(gmax, Math.abs(gx), Math.abs(gy));
      F[k] = clamp01((pn(u, v, 8) * 0.55 + pn(u, v, 16) * 0.3 + pn(u, v, 32) * 0.15 - 0.5) * 2.3 + 0.5);
    }
    for (let k = 0; k < N * N; k++) { d[k * 4] = 128 + 127 * G[k * 2] / gmax; d[k * 4 + 1] = 128 + 127 * G[k * 2 + 1] / gmax; d[k * 4 + 2] = 255 * F[k]; d[k * 4 + 3] = 255; }
    const t = new THREE.DataTexture(d, N, N, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true;
    return this.tex.ecoRip = t;
  }
  // the valley's ground: vertex colours plus per-pixel detail from the board
  // position (aEco = x, y, z, rock weight; aEco2 = grass weight, wildflowers):
  // granite strata, broken vertical joints and dark water streaks down the wall;
  // grass texture and flecks of lupine, mariposa and daisy in the meadow. Every
  // detail fades out where it would be smaller than a pixel.
  ecoGroundMat() {
    if (this.mats.ecoGround) return this.mats.ecoGround;
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
    m.onBeforeCompile = (s) => {
      s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aEco; attribute vec2 aEco2; varying vec4 vEco; varying vec2 vEco2;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEco = aEco; vEco2 = aEco2;');
      s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>
varying vec4 vEco; varying vec2 vEco2;
float ecoH(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float ecoN(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(ecoH(i), ecoH(i + vec2(1.0, 0.0)), f.x), mix(ecoH(i + vec2(0.0, 1.0)), ecoH(i + vec2(1.0, 1.0)), f.x), f.y); }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec3 p = vEco.xyz; float px = length(fwidth(p));
  float rock = vEco.w, grass = vEco2.x, flw = vEco2.y;
  if (rock > 0.02) {
    float wob = ecoN(p.xz * 40.0) * 0.01 + ecoN(p.xz * 11.0) * 0.018;
    float yb = p.y + wob + p.x * 0.06;
    float strata = sin(yb * 320.0) * clamp(1.0 - px * 160.0, 0.0, 1.0);
    float sheet = ecoN(vec2(p.x * 7.0, yb * 70.0));
    float jx = (p.x + (ecoN(vec2(p.y * 45.0, p.z * 30.0)) - 0.5) * 0.014) * 32.0;
    float joint = smoothstep(0.455, 0.495, abs(fract(jx) - 0.5)) * step(0.45, ecoN(vec2(floor(jx) * 3.1, p.y * 22.0))) * clamp(1.0 - px * 90.0, 0.0, 1.0);
    float streak = smoothstep(0.55, 0.9, ecoN(vec2(p.x * 150.0, p.y * 9.0))) * smoothstep(0.03, 0.12, p.y);
    float grain = ecoH(floor(p.xz * 700.0 + p.y * 500.0)) * clamp(1.0 - px * 500.0, 0.0, 1.0);
    vec3 c = diffuseColor.rgb * (0.92 + 0.1 * strata + (sheet - 0.5) * 0.34) * (1.0 - 0.3 * joint) * (1.0 - 0.3 * streak) * (0.95 + 0.1 * grain);
    diffuseColor.rgb = mix(diffuseColor.rgb, c, rock);
  }
  if (grass > 0.02) {
    float g1 = ecoN(p.xz * 160.0), g2 = ecoN(p.xz * 480.0 + 7.0);
    vec3 c = diffuseColor.rgb * (0.86 + 0.28 * g1) * (0.93 + 0.14 * g2 * clamp(1.0 - px * 480.0, 0.0, 1.0));
    if (flw > 0.05) {
      vec2 fp = p.xz * 300.0, fc = floor(fp); float h = ecoH(fc + 3.7);
      float fd = smoothstep(0.33, 0.15, length(fract(fp) - 0.5 + (vec2(ecoH(fc + 1.3), ecoH(fc + 9.1)) - 0.5) * 0.3)) * step(1.0 - 0.12 * flw, h) * clamp(1.0 - px * 210.0, 0.0, 1.0);
      vec3 fcol = h > 0.985 ? vec3(0.96, 0.95, 0.9) : h > 0.955 ? vec3(0.98, 0.8, 0.2) : vec3(0.62, 0.42, 0.9);
      c = mix(c, fcol, fd);
    }
    diffuseColor.rgb = mix(diffuseColor.rgb, c, grass);
  }
}`);
    };
    m.customProgramCacheKey = () => 'ecoGround';
    this.own(m, 0.55);
    return this.mats.ecoGround = m;
  }
  // animals that move a little (ecoAnimMat) -- the Ecological Zone's and the Natural Preserve's: add(T, kind, at,
  // ry, s) places a kit animal (T = { rest, p1, p2 }: yosemiteKit animGeo) with its idle kind; done(ctx) merges
  // them into one draped mesh, the posed copies turned into per-vertex offsets. Low: they stand still, in K's batch
  herd(K) {
    const AR = [], A1 = [], A2 = [];
    return {
      add: (T, kind, at, ry, s) => {
        if (gfx.low) { K.add('std', T.rest, null, at, [0, ry, 0], s); return; }
        const g = tagPart(part(T.rest, null, at, [0, ry, 0], s)), n = g.attributes.position.count, ph = new Float32Array(n * 2), p = hash2(at[0] * 91 + 3, at[2] * 57 + 1);
        for (let j = 0; j < n; j++) { ph[j * 2] = p; ph[j * 2 + 1] = kind; }
        g.setAttribute('aPh', new THREE.BufferAttribute(ph, 2));
        AR.push(g); A1.push(part(T.p1, null, at, [0, ry, 0], s)); A2.push(part(T.p2, null, at, [0, ry, 0], s));
      },
      done: (ctx) => {
        if (!AR.length) return;
        const R = mergeGeometries(AR), P1 = mergeGeometries(A1), P2 = mergeGeometries(A2);
        for (const g of [R, P1, P2]) this.drape(g, ctx.cell, ctx.H);
        const p0 = R.attributes.position.array, q1 = P1.attributes.position.array, q2 = P2.attributes.position.array, d1 = new Float32Array(p0.length), d2 = new Float32Array(p0.length);
        for (let i = 0; i < p0.length; i++) { d1[i] = q1[i] - p0[i]; d2[i] = q2[i] - p0[i]; }
        R.setAttribute('aD1', new THREE.BufferAttribute(d1, 3)); R.setAttribute('aD2', new THREE.BufferAttribute(d2, 3));
        P1.dispose(); P2.dispose();
        const m = new THREE.Mesh(R, this.ecoAnimMat());
        m.castShadow = m.receiveShadow = true;
        ctx.g.add(m);
      },
    };
  }
  // ---------------------------------------------------------------- river endings
  // (the Ecological Zone's river, the Natural Preserve's outlet) Where a river runs out to the sea: of the sides
  // that face an ocean (side i: the neighbour at i * 60deg, as valleyPlan) the first in the tile's own order of
  // preference -- or null (then it ends inside the tile). at(s, t): s out through that side, t along it; t: the
  // mouth's place on the rim (the tile's pick, moved along the side till the river clears the owner's marker);
  // yw the oceans' water level, yP the planet's surface round the tile (tile-local, as valleyPlan's).
  // The river runs out through its estuary (estuary): the ocean's own water is run up into it through the board's
  // basin (board3d basinGLSL uCh, as a Protected Valley's channels: userData.pvChains, valleyWater uploads them)
  riverMouth(ctx, order, tPref = () => 0) {
    const cell = ctx.cell, S = Math.PI / 3, ocean = new Array(6).fill(false);
    for (const c of this.neighbours(cell)) ocean[((Math.round(Math.atan2(c.by - cell.by, c.bx - cell.bx) / S) % 6) + 6) % 6] = !!this.b.tiles.get(c.i)?.userData.key?.startsWith('0:');
    const i = order.find((j) => ocean[j]);
    if (i == null) return null;
    const cs = Math.cos(i * S), sn = Math.sin(i * S), at = (s, t) => [cs * s - sn * t, sn * s + cs * t], t0 = tPref(i);
    let t = t0;
    for (let q = 0; q <= 14; q++) {
      const tt = t0 + (q % 2 ? 1 : -1) * Math.ceil(q / 2) * 0.03;
      if (Math.abs(tt) <= 0.2 && [0.3, 0.38, 0.45].every((s) => !this.env.inClearing(...at(s, tt), 0.035)) && [-1, 1].every((sg) => !this.env.inClearing(...at(0.43, tt + sg * 0.08), 0.015))) { t = tt; break; }   // (the river, and its estuary's flanks)
    }
    const k = this.kOf(cell);
    return { i, ocean, at, t, yw: (-0.032 - ctx.H) / k, yP: -ctx.H / k };
  }
  // A river's estuary, where it runs out into the sea (MO: riverMouth; hw: the river's half width where it opens).
  // In the mouth side's frame -- s out through the side, u along it from the mouth -- the river opens from its head
  // (s = sH: the tile's river has come down to the sea's level there) into a flared fan a third of the side wide at
  // the rim; the sea's own water runs up it (the board's basin, board3d basinGLSL: an estuary chain -- the ocean's
  // water, its surf and swash fading out up it), braided over sandbars, its bed shelving as the ocean's basin does
  // over the chain (a hair above it: the planet's coarse dip stays under), so at the rim it runs straight on into
  // the sea's floor; the whole side comes down to a beach at the planet's level (its corners stay up), an apron
  // carries the ground on over the gap to the hex's edge, and the owner's rim breaks off there (userData.rimGap).
  //   at(x, z) -> E: c the signed distance to the fan's water (< 0 in it: a ragged edge, inside the chain's), s out,
  //   f 0 at the head .. 1 at the rim, u across (-1..1 of its half width), fx / fz its flow, bed the bed's level, bar
  //   0..1 a sandbar there; fl 0..1 how far the land round the fan comes down to the flats, co the same along the
  //   side (the beach: callers keep high rock out of it), y their level;
  //   sheet(f): how much of the tile's own water still shows over the sea's (it fades out up the fan);
  //   sand(x, z, h, col): the flats' and the bed's colours into col (the planet's own beach and basin floor at the
  //   rim); chain(ctx): the board's water up the fan and the rim's gap; wall(ctx, hf, color, sub): the side walls
  estuary(ctx, MO, hw) {
    const S = Math.PI / 3, i = MO.i, cs = Math.cos(i * S), sn = Math.sin(i * S), t0 = MO.t, yw = MO.yw, yP = MO.yP, BD = 0.075 / this.kOf(ctx.cell);
    const sR = this.HEX_R * Math.sqrt(3) / 2 * 0.95, sH = 0.31, wR = Math.max(0.045, Math.min(0.1, 0.274 - Math.abs(t0) - 0.1));   // (clear of the side's corners)
    const OC = [0, 1, 2, 3, 4, 5].filter((j) => j !== i).map((j) => [Math.cos(j * S), Math.sin(j * S)]);
    const others = (x, z) => { let e = 1; for (const [c, q] of OC) e = Math.min(e, sR - x * c - z * q); return e; };   // (how far in from the other sides' rims)
    const wf = (s) => (s <= sH ? hw : s <= sR ? hw + (wR - hw) * ((s - sH) / (sR - sH)) ** 1.5 : wR + (s - sR) * 0.35);
    const rrOf = (s) => wf(Math.max(s, sH)) + 0.064;                                          // the chain's capsule there (its water: 0.058 in)
    const prof = (e) => yP + 0.005 - BD * smooth(0, -0.13, e);                                 // the planet's floor over a chain (basinAt), a hair above
    const at2 = (s, u) => [cs * s - sn * (t0 + u), sn * s + cs * (t0 + u)];
    const E = { sH, sR, wR, c: 1, s: 0, f: 0, u: 0, fx: 0, fz: 0, bed: 0, bar: 0, fl: 0, co: 0, y: 0 };
    E.sOf = (x, z) => x * cs + z * sn;
    let lx = NaN, lz = NaN;
    E.at = (x, z) => {
      if (x === lx && z === lz) return E;                                                        // (asked again for the same point: the ground's height, then its colour)
      lx = x; lz = z;
      const s = x * cs + z * sn, u = -x * sn + z * cs - t0;
      E.s = s; E.fl = E.co = E.bar = 0;
      if (s < sH - 0.15) { E.f = 0; E.u = u / hw; E.c = Math.hypot(u, s - sH) - hw; return E; }   // (well inland: nothing of it here)
      const w = wf(s), au = Math.abs(u);
      E.u = u / Math.max(w, 1e-3);
      if (s < sR - 0.12 && au > w + 0.17) { E.f = 0; E.c = s < sH ? Math.hypot(u, s - sH) - hw : au - w; return E; }   // (off to the side)
      const f = clamp01((s - sH) / (sR - sH)), inl = 1 - smooth(0.62, 0.97, f), near = au < w + 0.06;   // (inl: inland -- at the rim it is the sea's floor alone)
      const rag = near && f > 0 ? 1 - (0.2 * vnoise(s * 17 + (u > 0 ? 3.1 : 8.7), 1.3) + 0.14 * vnoise(s * 43 + (u > 0 ? 5.1 : 1.7), 4.4)) * smooth(0, 0.2, f) * inl : 1;
      E.f = f; E.c = s < sH ? Math.hypot(u, s - sH) - hw : au - w * rag;
      const p = prof(au - rrOf(s)), oth = others(x, z);
      if (au < w) {                                                                              // in the fan: the sea's shelf, the thalweg swinging across it, sandbars just breaking the surface
        const th = 0.36 * Math.sin(s * 23 + t0 * 40 + i) * smooth(0.1, 0.6, f), dth = (E.u - th) / 0.36, ch = Math.exp(-dth * dth), bed = p - (0.006 * ch + 0.004 * (1 - smooth(0, 0.3, f))) * inl;
        E.bar = f > 0.22 && inl > 0 ? smooth(0.52, 0.72, vnoise(u * 32 + 5.3, s * 11 + t0 * 9 + i)) * smooth(0.22, 0.5, f) * (1 - ch) * (1 - smooth(0.62, 0.9, Math.abs(E.u))) * inl : 0;
        E.bed = bed + (yw + 0.0032 - bed) * E.bar;
      } else E.bed = p - 0.004 * (1 - smooth(0, 0.3, f)) * inl;
      E.fl = (1 - smooth(0.012, 0.15, E.c)) * smooth(sH - 0.14, sH + 0.03, s) * smooth(0, 0.05, oth);
      E.co = smooth(sR - 0.12, sR - 0.005, s) * smooth(0.01, 0.12, oth);
      E.y = p + Math.max(0, yw + 0.0035 - p) * inl + (near ? 0.0015 * (vnoise(x * 90, z * 90) - 0.5) * smooth(0, 0.02, E.c) : 0);   // banks above the water inland; the sea's own beach at the rim
      const sp = 0.022 * (1 - 0.6 * f); E.fx = (cs - sn * E.u * 0.35) * sp; E.fz = (sn + cs * E.u * 0.35) * sp;
      return E;
    };
    E.sheet = (f) => 1 - smooth(0.04, 0.55, f);
    const cSand = new THREE.Color(), cWet = new THREE.Color();
    E.sand = (x, z, h, col) => {
      const n = 0.9 + 0.2 * vnoise(x * 80 + 3, z * 80), rip = 0.96 + 0.04 * Math.sin((x * sn - z * cs) * 260 + vnoise(x * 30, z * 30) * 6);   // (faint ripple marks)
      cSand.setRGB(0.72, 0.56, 0.42).multiplyScalar(n * rip);                                   // (the planet's basin sand: 0.70, 0.56, 0.40)
      cSand.lerp(cWet.setRGB(0.44, 0.34, 0.27).multiplyScalar(n), 0.7 * (1 - smooth(yw + 0.001, yw + 0.014, h)));   // damp toward the waterline
      if (h < yw) cSand.lerp(cWet.setRGB(0.29, 0.18, 0.13).multiplyScalar(n), smooth(yw - 0.002, yw - 0.015, h));     // darker silt out in the deep (as the sea's own floor)
      return col.copy(cSand);
    };
    E.chain = (ctx) => {
      const pts = [];
      for (const s of [0.585, sR + 0.045, sR - 0.01, sH + 0.13, sH + 0.09, sH + 0.04, sH - 0.02, sH - 0.07]) { const [x, z] = at2(s, 0); pts.push([x, z, rrOf(s), this.edgeDist(x, z) > 0.02]); }   // (from the sea in: the water runs in from there)
      ctx.g.userData.pvChains = [{ key: 'e' + i, pts }];
      ctx.g.userData.rimGap = [-0.13, 0, 0.13].map((t) => { const q = MO.at(sR, t); return [q[0], q[1], 0.16]; });   // (the beach, all along the side)
    };
    // the side walls: as any tile's (valleyWall), but on the mouth's side its top follows the ground's rim (hf, as
    // ground() lays its edge: sub) and, where the ground has come down to the beach and the fan, it turns into an
    // apron over the gap to the hex's edge on the sea's own floor profile, then tucks under the planet
    E.wall = (ctx, hf, color, sub) => {
      this.valleyWall(ctx, { ocean: MO.ocean.map((_, j) => j === i) }, color);
      const R0 = this.HEX_R * 0.95, yb = -(ctx.H + 0.08) / this.kOf(ctx.cell), a0 = i * S - S / 2, a1 = i * S + S / 2, NR = 3;
      const C0 = new THREE.Color(color), c = new THREE.Color(), pos = [], col = [], idx = [];
      for (let j = 0; j <= sub; j++) {
        const u = j / sub, x = R0 * (Math.cos(a0) * (1 - u) + Math.cos(a1) * u), z = R0 * (Math.sin(a0) * (1 - u) + Math.sin(a1) * u), y = hf(x, z);
        const g = smooth(0.15, 0.85, y / yP), row = (o, yy, cc) => { pos.push(x * o, yy, z * o); col.push(cc.r, cc.g, cc.b); };
        const o1 = 1 + 0.05 * g, o2 = 1 + 0.085 * g, e1 = E.at(x * o1, z * o1), y1 = e1.c < 0 ? e1.bed : e1.y;
        row(1, y, c.copy(C0).lerp(E.sand(x, z, y, _c2), g));
        row(o1, y + (y1 - 0.007 - y) * g, c.copy(C0).multiplyScalar(0.8).lerp(E.sand(x * o1, z * o1, y1, _c2), g));   // (just under the planet's own beach: no lip)
        row(o2, yb + (y1 - 0.03 - yb) * g, c.copy(C0).multiplyScalar(0.6).lerp(E.sand(x * o2, z * o2, y1, _c2), g));
        if (j) for (let q = 0; q < NR - 1; q++) { const a = (j - 1) * NR + q, b = j * NR + q; idx.push(a, b, b + 1, a, b + 1, a + 1); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
      { const N = g.attributes.normal; let o = 0; for (let q = 0; q < N.count; q++) o += N.getX(q) * Math.cos(i * S) + N.getY(q) * 2 + N.getZ(q) * Math.sin(i * S); if (o < 0) { g.index.array.reverse(); g.computeVertexNormals(); } }   // (outward, and up where it is an apron)
      this.emit(new Kit().raw('matte', g), ctx);
    };
    return E;
  }
  // a river's or a lake's water (ecoWaterMat): a fine grid over box [X0, X1, Z0, Z1] clipped to the wetted area
  // -- clip(x, z): the signed distance to its edge (< 0 in the water; 1: nothing here), its ragged edge sinking
  // under the banks; vert(x, z) -> [level, flow x, flow z, depth 0..1, whitewater 0..1, fade] per vertex
  waterSheet(K, mat, [X0, X1, Z0, Z1], gs, clip, vert) {
    const nx = Math.ceil((X1 - X0) / gs), nz = Math.ceil((Z1 - Z0) / gs), NX = nx + 1;
    const cc = new Float32Array(NX * (nz + 1)), V = new Int32Array(NX * (nz + 1)).fill(-1);
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) cc[j * NX + i] = clip(X0 + i * gs, Z0 + j * gs);
    const pos = [], aB = [], aFl = [], aW = [], idx = [];
    const vt = (i, j) => {
      const k = j * NX + i; if (V[k] >= 0) return V[k];
      const x = X0 + i * gs, z = Z0 + j * gs, v = vert(x, z);
      pos.push(x, v[0], z); aB.push(x, z); aFl.push(v[1], v[2]); aW.push(v[3], v[4], v[5]);
      return V[k] = pos.length / 3 - 1;
    };
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const k = j * NX + i;
      if (Math.min(cc[k], cc[k + 1], cc[k + NX], cc[k + NX + 1]) > 0.004 || Math.max(cc[k], cc[k + 1], cc[k + NX], cc[k + NX + 1]) >= 1) continue;
      const a = vt(i, j), b = vt(i + 1, j), c = vt(i, j + 1), d = vt(i + 1, j + 1);
      idx.push(a, c, b, b, c, d);
    }
    if (!idx.length) return;
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); wg.setIndex(idx); wg.computeVertexNormals();
    { const N = wg.attributes.normal; let up = 0; for (let i = 0; i < N.count; i++) up += N.getY(i); if (up < 0) { const ix = wg.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } wg.computeVertexNormals(); } }
    wg.setAttribute('aB', new THREE.Float32BufferAttribute(aB, 2)); wg.setAttribute('aFlow', new THREE.Float32BufferAttribute(aFl, 2)); wg.setAttribute('aW', new THREE.Float32BufferAttribute(aW, 3));
    K.raw(mat, wg);
  }
}
