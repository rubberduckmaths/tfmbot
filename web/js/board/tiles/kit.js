// kit.js -- geometry and noise helpers shared by the tile art (tile_art.js and its mixins).
import * as THREE from 'three';
import { mergeVertices } from '../../../vendor/BufferGeometryUtils.js';

export const TAU = Math.PI * 2;
export const V3 = THREE.Vector3;
export const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _c = new THREE.Color(), _c2 = new THREE.Color(), _v = new V3(), _n = new V3();
export const Y = new V3(0, 1, 0);
export const _bM = new THREE.Matrix4(), _bS = new V3(), _bP = new V3();       // birdTick's per-frame temporaries
// drop the items failing keep() from an array, in place (tick: no garbage per frame)
export function compact(a, keep) { let j = 0; for (let i = 0; i < a.length; i++) if (keep(a[i])) a[j++] = a[i]; a.length = j; return a; }
export const clamp01 = (x) => Math.max(0, Math.min(1, x));
export const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const backOut = (x) => { const c = 1.3; return x <= 0 ? 0 : 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };   // 0 -> 1 with a small overshoot

// value noise (2D), cheap and deterministic, for ground colour / heights
export function hash2(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
export function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm2(x, y, oct = 4) { let f = 0, a = 0.5; for (let i = 0; i < oct; i++) { f += a * vnoise(x, y); x *= 2.03; y *= 2.03; a *= 0.5; } return f; }

// ------------------------------------------------------------------ geometry
// prepare one part: clone, (weld + smooth), place, colour. t/r/s = translate,
// euler, scale (number or [x,y,z]); color = hex/Color or fn(x,y,z) -> Color
// (evaluated on the placed vertex).
export function part(geo, color, t = [0, 0, 0], r = [0, 0, 0], s = 1, o = {}) {
  let g = geo.clone();
  if (!o.uv) g.deleteAttribute('uv');
  if (o.smooth) { g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = mergeVertices(g, o.tol ?? 1e-5); }
  const S = typeof s === 'number' ? [s, s, s] : s;
  g.applyMatrix4(_m.compose(_v.set(t[0], t[1], t[2]), _q.setFromEuler(_e.set(r[0], r[1], r[2], r[3] || 'XYZ')), _n.set(S[0], S[1], S[2])));
  if (o.smooth || !g.attributes.normal) g.computeVertexNormals();
  if (!g.index) { const n = g.attributes.position.count, ix = new Uint32Array(n); for (let i = 0; i < n; i++) ix[i] = i; g.setIndex(new THREE.BufferAttribute(ix, 1)); }
  if (color == null && g.attributes.color) return g;             // pre-coloured template: keep its colours
  const P = g.attributes.position, col = new Float32Array(P.count * 3);
  if (typeof color === 'function') for (let i = 0; i < P.count; i++) { const c = color(P.getX(i), P.getY(i), P.getZ(i)); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  else { _c.set(color); for (let i = 0; i < P.count; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; } }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
// weld + smooth normals of a finished geometry (for custom organic shapes)
export function smoothGeo(g, tol = 1e-5) { g.deleteAttribute('normal'); g.deleteAttribute('uv'); const w = mergeVertices(g, tol); w.computeVertexNormals(); return w; }
// a lathe (profile [[r, y], ...]) with welded, smooth normals
export function lathe(profile, seg = 20) { return smoothGeo(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg)); }
// a shallow parabolic dish opening up (+y), rim radius rad, depth dep
export function dish(rad, dep, seg = 20) {
  const pr = []; for (let i = 0; i <= 6; i++) { const r = rad * i / 6; pr.push([Math.max(r, 1e-4), dep * (r / rad) * (r / rad)]); }
  const g = new THREE.LatheGeometry(pr.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  return smoothGeo(g);
}
// an organic blob: sphere with welded normals, scaled
export const blobGeo = (d = 2) => smoothGeo(new THREE.IcosahedronGeometry(1, d));
// a capsule along +x of length L (between centres), radius r
export function capsuleX(r, L, seg = 10) { return new THREE.CapsuleGeometry(r, L, 4, seg).rotateZ(Math.PI / 2); }

// placement animation (animateIn): every part remembers its foot (bottom
// centre, board units), its height and a stagger 0..1 (centre first, a little
// shuffled), as two temporary attributes that drape() turns into CPU-side
// data -- they never reach the GPU
export function tagPart(g) {
  const P = g.attributes.position, n = P.count;
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (let i = 0; i < n; i++) { const x = P.getX(i), y = P.getY(i), z = P.getZ(i); if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z; }
  const fx = (x0 + x1) / 2, fz = (z0 + z1) / 2, h = Math.max(0, y1 - y0);
  const st = clamp01(Math.hypot(fx, fz) / 0.5 * 0.7 + hash2(fx * 13.1 + 0.3, fz * 7.7 + 0.1) * 0.3);
  const foot = new Float32Array(n * 4), stg = new Float32Array(n);
  for (let i = 0; i < n; i++) { foot[i * 4] = fx; foot[i * 4 + 1] = y0; foot[i * 4 + 2] = fz; foot[i * 4 + 3] = h; stg[i] = st; }
  g.setAttribute('aFoot', new THREE.BufferAttribute(foot, 4));
  g.setAttribute('aStag', new THREE.BufferAttribute(stg, 1));
  return g;
}

// Parts grouped by material key, merged and draped at the end
export class Kit {
  constructor() { this.by = new Map(); }
  add(mat, geo, color, t, r, s, o) { const g = tagPart(part(geo, color, t, r, s, o)); (this.by.get(mat) || this.by.set(mat, []).get(mat)).push(g); return this; }
  raw(mat, g) { tagPart(g); (this.by.get(mat) || this.by.set(mat, []).get(mat)).push(g); return this; }
  box(mat, color, x, y, z, w, h, d, ry = 0) { return this.add(mat, BOX, color, [x, y + h / 2, z], [0, ry, 0], [w, h, d]); }
  cyl(mat, color, x, y, z, r0, r1, h, seg = 12, rot = [0, 0, 0]) { return this.add(mat, new THREE.CylinderGeometry(r1, r0, h, seg).translate(0, h / 2, 0), color, [x, y, z], rot); }
  ball(mat, color, x, y, z, r, sy = 1, seg = 1) { return this.add(mat, seg === 1 ? BALL : BALL2, color, [x, y, z], [0, 0, 0], [r, r * sy, r]); }
}
export const BOX = new THREE.BoxGeometry(1, 1, 1);
export const BALL = smoothGeo(new THREE.IcosahedronGeometry(1, 2));
export const BALL2 = smoothGeo(new THREE.IcosahedronGeometry(1, 3));
export const STRUT = new THREE.CylinderGeometry(1, 1, 1, 5, 1, true);
// an ice floe: a flattened, noise-warped smooth disc
export const FLOE = (() => { const g = smoothGeo(new THREE.CylinderGeometry(1, 1, 1, 14, 1)); const P = g.attributes.position; for (let i = 0; i < P.count; i++) { const a = Math.atan2(P.getZ(i), P.getX(i)), f = 0.75 + 0.35 * vnoise(Math.cos(a) * 2 + 5, Math.sin(a) * 2 + 5); P.setX(i, P.getX(i) * f); P.setZ(i, P.getZ(i) * f); } g.computeVertexNormals(); return g; })();

// a pointy-top hexagon's corners (board units), k = 0 at the back (-z), going
// counter-clockwise on screen: 1 back-left, 2 front-left, 3 front, 4 front-right, 5 back-right
export function hexCorner(k, rad) { const a = Math.PI / 2 + k * Math.PI / 3; return [Math.cos(a) * rad, -Math.sin(a) * rad]; }
export function inHex(x, z, rad) { const ax = Math.abs(x), az = Math.abs(z); return ax <= Math.sqrt(3) / 2 * rad && az <= rad - ax / Math.sqrt(3); }
// a river's centre line ([x, z] points evenly spaced along it): F.d(x, z) = the distance to it (the nearest
// of every 4th point, then the segments round it), setting F.s (0..1 along it) and F.tx, F.tz (its way
// there); F.box = its bounds [x0, x1, z0, z1]. Far outside them (by pad) it answers pad at once
export function lineField(pts, pad = 0.12) {
  const N = pts.length - 1, B = [Infinity, -Infinity, Infinity, -Infinity];
  for (const [x, z] of pts) { B[0] = Math.min(B[0], x); B[1] = Math.max(B[1], x); B[2] = Math.min(B[2], z); B[3] = Math.max(B[3], z); }
  const F = { s: 0, tx: 0, tz: 1, box: B };
  F.d = (x, z) => {
    if (x < B[0] - pad || x > B[1] + pad || z < B[2] - pad || z > B[3] + pad) return pad;
    let best = 1e9, bi = 0;
    for (let i = 0; i <= N; i += 4) { const ex = pts[i][0] - x, ez = pts[i][1] - z, d2 = ex * ex + ez * ez; if (d2 < best) { best = d2; bi = i; } }
    best = 1e9;
    for (let i = Math.max(0, bi - 6), i1 = Math.min(N - 1, bi + 5); i <= i1; i++) {
      const a = pts[i], b = pts[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1e-9, t = clamp01(((x - a[0]) * dx + (z - a[1]) * dz) / L2);
      const ex = a[0] + dx * t - x, ez = a[1] + dz * t - z, d2 = ex * ex + ez * ez;
      if (d2 < best) { best = d2; F.s = (i + t) / N; const L = Math.sqrt(L2); F.tx = dx / L; F.tz = dz / L; }
    }
    return Math.sqrt(best);
  };
  return F;
}
// evenly spaced [x, z] points along a smooth curve through the control points
export function spacedPts(ctrl, n) { return new THREE.CatmullRomCurve3(ctrl.map(([x, z]) => new V3(x, 0, z)), false, 'centripetal').getSpacedPoints(n).map((v) => [v.x, v.z]); }
// a smooth minimum (the union of two signed distances, blended over k)
export function smin(a, b, k) { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; }
