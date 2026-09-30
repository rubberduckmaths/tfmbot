// city_parts.js -- TileArt mixin: city building blocks (towers, roofs, domes, streets, parks, cranes, beacons),
// the choice of city look per space, and the classic city and seeded dome city built from them.
import * as THREE from 'three';
import { gfx } from '../quality.js';
import { BALL, BOX, Kit, STRUT, TAU, V3, Y, _c, capsuleX, fbm2, hash2, smooth } from './kit.js';

export class CityParts {
  // ================================================================ cities
  // which look a city gets: the placing card where the log knows it, else a
  // seeded pick among the generic archetypes (stable per space)
  cityStyle(space) {
    const src = this.b.tileSrc?.[space] || '';
    const byCard = { 'Domed Crater': 'crater', 'Cupola City': 'cupola', 'Research Outpost': 'outpost', 'Noctis City': 'noctis', 'Underground City': 'underground',
      'Immigrant City': 'immigrant', 'Urbanized Area': 'urban', 'Open City': 'open', 'Lava Tube Settlement': 'lavatube', 'Corporate Stronghold': 'stronghold',
      'Early Settlement': 'settlement', 'Self-Sufficient Settlement': 'settlement', 'Tharsis Republic': 'coruscant' };
    // the standard tileset (the default): the classic skyline everywhere, bar Domed Crater's and Tharsis Republic's own looks
    if (!this.b.variedTiles) return byCard[src] === 'crater' || byCard[src] === 'coruscant' ? byCard[src] : 'metro';
    if (byCard[src]) return byCard[src];
    return ['metro', 'dome', 'arcology', 'spires', 'metro', 'dome', 'arcology'][Math.floor(this.env.srand(space * 131 + 7)() * 7)];
  }
  city(ctx) {
    const style = this.cityStyle(ctx.space);
    const name = { crater: 'domeCity', dome: 'domeCity', cupola: 'cupolaCity', outpost: 'outpostCity', noctis: 'noctisCity', underground: 'undergroundCity', immigrant: 'immigrantCity',
      urban: 'urbanCity', open: 'openCity', lavatube: 'lavaTubeCity', stronghold: 'strongholdCity', settlement: 'settlementCity', arcology: 'arcologyCity', spires: 'spireCity', coruscant: 'coruscantCity' }[style];
    const fn = name && this[name] && (() => this[name](ctx, style === 'crater'));
    if (!fn) {                                       // the classic skyline (board3d's own city), taller as the game goes on
      ctx.city(ctx.space * 7 + 2, 24, 0.82 + 0.14 * this.grow, false);
      return;
    }
    fn();
  }

  // ---- city parts
  facadeTex(emissive) {
    const t = this.canvas('fac' + (emissive ? 'E' : ''), 64, 128, (g, w, h) => {
      const r = this.env.srand(8);
      g.fillStyle = emissive ? '#000' : '#d4d8de'; g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 16) {
        if (!emissive) { g.fillStyle = 'rgba(60,66,80,0.35)'; g.fillRect(0, y + 14, w, 2); }
        for (let x = 2; x < w; x += 8) {
          const lit = r() < 0.34;
          if (emissive) { if (lit) { g.fillStyle = r() < 0.2 ? '#dff0ff' : `hsl(${34 + r() * 16},100%,${58 + r() * 18}%)`; g.fillRect(x, y + 4, 5, 8); } }
          else { g.fillStyle = `hsl(${208 + r() * 12},${25 + r() * 20}%,${24 + r() * 16}%)`; g.fillRect(x, y + 4, 5, 8); }
        }
      }
      g.fillStyle = emissive ? '#000' : '#8a9098'; g.fillRect(0, 0, 2, 2);                 // the roof texel
    });
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }
  cityMat(key) {
    if (this.mats[key]) return this.mats[key];
    const glass = key === 'cglass';
    const m = new THREE.MeshStandardMaterial({ map: this.facadeTex(false), emissiveMap: this.facadeTex(true), emissive: glass ? 0xcfe6ff : 0xffd49a, emissiveIntensity: 0.5, roughness: glass ? 0.2 : 0.55, metalness: glass ? 0.6 : 0.2, vertexColors: true });
    this.own(m, glass ? 0.9 : 0.5);
    this.applyStage();
    return this.mats[key] = m;
  }
  // a box building with window-tiled facades (uv scaled to its size); the
  // roof/bottom pinned to the plain roof texel. mat: 'cfac' | 'cglass'
  tower(K, mat, color, x, y, z, w, h, d, ry = 0) {
    const g = new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0), uv = g.attributes.uv;
    const sizes = [[d, h], [d, h], [0, 0], [0, 0], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) {
      const j = f * 4 + i, [a, b] = sizes[f];
      if (!a) uv.setXY(j, 0.005, 0.995); else uv.setXY(j, uv.getX(j) * a / 0.045 + (x * 7 % 1), uv.getY(j) * b / 0.09 + y / 0.09);
    }
    K.add(this.cityMat(mat), g, color, [x, y, z], [0, ry, 0], 1, { uv: true });
    if (!this.noRoof) this.roofTop(K, mat, color, x, y + h, z, w, d, ry, h);
  }
  // a round tower with window-tiled walls
  rtower(K, mat, color, x, y, z, rad, h, seg = 18) {
    const g = new THREE.CylinderGeometry(rad, rad, h, seg, 1, false).translate(0, h / 2, 0), uv = g.attributes.uv;
    const circ = TAU * rad;
    for (let i = 0; i < uv.count; i++) { const Yv = g.attributes.position.getY(i); if (Math.abs(g.attributes.normal.getY(i)) > 0.5) uv.setXY(i, 0.005, 0.995); else uv.setXY(i, uv.getX(i) * circ / 0.045, Yv / 0.09); }
    K.add(this.cityMat(mat), g, color, [x, y, z], [0, 0, 0], 1, { uv: true });
    if (this.noRoof) return;
    // a round tower's crown: a parapet ring, a stepped drum, a mast or a cone
    const yt = y + h, s = hash2(x * 71.3 + h * 9.1, z * 43.7);
    K.add('std', new THREE.TorusGeometry(rad * 0.97, rad * 0.06, 6, seg * 2).rotateX(Math.PI / 2), 0xc8ccd2, [x, yt + 0.001, z]);
    if (gfx.low) return;
    if (s < 0.5) { K.cyl('std', 0x9aa2ac, x, yt, z, rad * 0.62, rad * 0.55, h * 0.06 + 0.006, seg); K.cyl('metal', 0xc0c6ce, x, yt + h * 0.06 + 0.006, z, 0.0022, 0.0012, 0.03 + h * 0.2, 6); K.add('blink', BALL, 0xffffff, [x, yt + h * 0.26 + 0.036, z], [0, 0, 0], 0.0035); }
    else K.add('metal', new THREE.ConeGeometry(rad * 0.9, rad * 1.4, seg).translate(0, rad * 0.7, 0), 0x8e9cb0, [x, yt, z]);
  }
  // rooftop character for a box building (top at y, footprint w x d, turned ry; h its height):
  // a parapet; on towers a setback crown with a mast, a sloped/pyramid cap or a helipad; on
  // lower blocks HVAC units with fans, a water tank, solar rows or a roof garden, the odd
  // antenna with its red light. Seeded by position; at Low only the parapet and masts.
  roofTop(K, mat, color, x, y, z, w, d, ry, h) {
    if (w < 0.018 || d < 0.018) return;
    const c = Math.cos(ry), sn = Math.sin(ry), L = (lx, lz) => [x + c * lx + sn * lz, z - sn * lx + c * lz];
    const s = hash2(x * 91.7 + y * 13.1, z * 57.3), s2 = hash2(z * 33.1 + 0.7, x * 71.9 + h * 5.3), low = gfx.low, rim = 0xb8bcc2;
    // the parapet: four low walls round the roof edge
    const pt = 0.0022, ph = 0.0045;
    for (const [lx, lz, bw, bd] of [[0, d / 2 - pt / 2, w, pt], [0, -d / 2 + pt / 2, w, pt], [w / 2 - pt / 2, 0, pt, d], [-w / 2 + pt / 2, 0, pt, d]]) { const [px, pz] = L(lx, lz); K.box('std', rim, px, y, pz, bw, ph, bd, ry); }
    if (h > 0.11) {                                                      // a tower: a crown
      if (s2 < 0.4) {                                                    // setbacks and a mast with its beacon
        this.noRoof = true; this.tower(K, mat, color, x, y, z, w * 0.7, h * 0.07, d * 0.7, ry); this.tower(K, mat, color, x, y + h * 0.07, z, w * 0.45, h * 0.05, d * 0.45, ry); this.noRoof = false;
        const top = y + h * 0.12;
        K.cyl('metal', 0xc0c6ce, x, top, z, 0.0022, 0.001, 0.035 + h * 0.18, 6);
        K.add('blink', BALL, 0xffffff, [x, top + 0.037 + h * 0.18, z], [0, 0, 0], 0.0035);
      } else if (s2 < 0.7 && !low) {                                     // a sloped crown
        K.add('std', new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1).rotateY(Math.PI / 4).translate(0, 0.5, 0), 0x74849a, [x, y, z], [0, ry, 0], [w * 0.98, Math.min(w, d) * 0.9, d * 0.98]);
        K.add('blink', BALL, 0xffffff, [x, y + Math.min(w, d) * 0.9 + 0.003, z], [0, 0, 0], 0.003);
      } else if (!low && Math.min(w, d) > 0.03) {                        // a helipad, lit at the corners
        const pr = Math.min(w, d) * 0.4;
        K.cyl('std', 0x3a3e46, x, y, z, pr, pr, 0.003, 24);
        K.add('std', new THREE.TorusGeometry(pr * 0.8, pr * 0.06, 4, 32).rotateX(Math.PI / 2), 0xf2c21c, [x, y + 0.0032, z]);
        K.box('std', 0xf2f2ee, x, y + 0.0031, z, pr * 0.6, 0.0006, pr * 0.1, ry); for (const e of [-1, 1]) { const [hx, hz] = L(e * pr * 0.25, 0); K.box('std', 0xf2f2ee, hx, y + 0.0031, hz, pr * 0.1, 0.0006, pr * 0.62, ry); }
        for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { const [lx2, lz2] = L(a * pr * 0.72, b * pr * 0.72); K.add('glow', BALL, 0x7fe8ff, [lx2, y + 0.004, lz2], [0, 0, 0], 0.0018); }
      } else { K.cyl('metal', 0xc0c6ce, x, y, z, 0.002, 0.001, 0.03, 6); K.add('blink', BALL, 0xffffff, [x, y + 0.031, z], [0, 0, 0], 0.003); }
      return;
    }
    if (low) return;
    // a lower block: plant on the roof
    if (s2 < 0.25 && w > 0.03 && d > 0.03) {                             // solar rows
      for (let i = 0; i < 3; i++) { const [px, pz] = L(0, (i - 1) * d * 0.26); K.add('std', BOX, 0x243a78, [px, y + 0.004, pz], [0.45, ry, 0, 'YXZ'], [w * 0.72, 0.0012, d * 0.18]); }
    } else if (s2 < 0.4) {                                               // a roof garden
      K.box('std', 0x4a8a3a, x, y, z, w * 0.78, 0.0035, d * 0.78, ry);
      for (let i = 0; i < 3; i++) { const [px, pz] = L((hash2(x + i, z) - 0.5) * w * 0.5, (hash2(z + i, x) - 0.5) * d * 0.5); K.add('matte', BALL, 0x3a7a30, [px, y + 0.005, pz], [0, 0, 0], [0.005, 0.004, 0.005]); }
    } else {                                                             // HVAC units with fans
      const n = 1 + Math.floor(s * 3);
      for (let i = 0; i < n; i++) {
        const [px, pz] = L((hash2(i * 3.1 + x, z) - 0.5) * w * 0.45, (hash2(z * 2 + i, x) - 0.5) * d * 0.45), bw = Math.min(w, d) * (0.18 + 0.1 * hash2(i, x));
        K.box('std', 0x9aa0a8, px, y, pz, bw, 0.007, bw * 0.8, ry);
        K.cyl('metal', 0x3a3e44, px, y + 0.007, pz, bw * 0.3, bw * 0.3, 0.0012, 12);
      }
    }
    if (s > 0.62 && s2 > 0.25) {                                         // a water tank on legs
      const [px, pz] = L(w * 0.24, -d * 0.22), tr = Math.min(w, d) * 0.14;
      K.cyl('std', 0x7a5a3a, px, y + 0.006, pz, tr, tr, 0.011, 12); K.add('std', new THREE.ConeGeometry(tr * 1.08, tr * 0.8, 12).translate(0, tr * 0.4, 0), 0x5a4a3a, [px, y + 0.017, pz]);
      for (const [a, b] of [[1, 1], [-1, -1]]) K.cyl('metal', 0x5a5e66, px + a * tr * 0.6, y, pz + b * tr * 0.6, 0.0008, 0.0008, 0.006, 4);
    }
    if (s > 0.86) { const [px, pz] = L(-w * 0.3, d * 0.3); K.cyl('metal', 0xc0c6ce, px, y, pz, 0.0012, 0.0008, 0.028, 5); K.add('blink', BALL, 0xffffff, [px, y + 0.029, pz], [0, 0, 0], 0.0026); }
  }
  // street-grid ground: asphalt, pale blocks, lamps; spacing sp
  streetGround(ctx, o = {}) {
    const HR = this.HEX_R, sp = o.sp ?? 0.1;
    const tex = this.canvas('streets' + sp + (o.tint || ''), 256, 296, (g, w, h) => {
      const px = (x) => (0.5 + x / (Math.sqrt(3) * HR * 0.95)) * w, py = (z) => (0.5 + z / (2 * HR * 0.95)) * h, S = w / (Math.sqrt(3) * HR * 0.95);
      g.fillStyle = o.tint || '#2e333c'; g.fillRect(0, 0, w, h);
      const bw = sp * 0.74;
      for (let gx = -6; gx <= 6; gx++) for (let gz = -7; gz <= 7; gz++) {
        const x = gx * sp, z = gz * sp;
        g.fillStyle = '#707786'; g.fillRect(px(x - bw / 2 - 0.006), py(z - bw / 2 - 0.006), (bw + 0.012) * S, (bw + 0.012) * S);
        g.fillStyle = '#5a616e'; g.fillRect(px(x - bw / 2), py(z - bw / 2), bw * S, bw * S);
      }
      g.fillStyle = 'rgba(255,220,150,0.85)';
      for (let gx = -6; gx <= 6; gx++) for (let gz = -7; gz <= 7; gz++) if ((gx + gz) % 2 === 0) g.fillRect(px((gx + 0.5) * sp) - 1, py(gz * sp) - 1, 2, 2);
    });
    const m = this.mats['sg' + sp + (o.tint || '')] ||= this.own(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
    return this.groundMesh(ctx, o.hf || (() => 0), () => _c.setRGB(1, 1, 1), { sub: o.sub ?? 8, uv: true, mat: m });
  }
  // lattice blocks inside the hex: calls put(x, z, core) for each free block
  lattice(sp, margin, skip, put) {
    for (let gx = -6; gx <= 6; gx++) for (let gz = -7; gz <= 7; gz++) {
      const x = gx * sp, z = gz * sp;
      if (this.edgeDist(x, z) < margin || this.env.inClearing(x, z, 0.03) || (skip && skip(x, z))) continue;
      put(x, z, Math.max(0, 1 - Math.hypot(x, z) / 0.42));
    }
  }
  // the dome glass: fresnel rim, sun glint, faint tint (shared shader)
  domeGlass() {
    if (this.mats.domeGlass) return this.mats.domeGlass;
    const m = new THREE.ShaderMaterial({
      uniforms: { uSun: { value: this.b.sun.position.clone().normalize() }, uTint: { value: new THREE.Color(0.6, 0.85, 1.0) } },
      vertexShader: /* glsl */`
        varying vec3 vN, vW;
        void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */`
        uniform vec3 uSun, uTint; varying vec3 vN, vW;
        void main(){
          vec3 n = normalize(vN), v = normalize(cameraPosition - vW);
          if (!gl_FrontFacing) n = -n;
          float f = pow(1.0 - abs(dot(n, v)), 2.4);
          float spec = pow(max(dot(reflect(-uSun, n), v), 0.0), 90.0) * 2.2 + pow(max(dot(reflect(-uSun, n), v), 0.0), 12.0) * 0.18;
          vec3 col = uTint * (0.35 + 1.4 * f) + vec3(1.0, 0.97, 0.9) * spec;
          gl_FragColor = vec4(col, clamp(0.07 + 0.62 * f + spec, 0.0, 0.95));
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    m.userData.shared = true;
    return this.mats.domeGlass = m;
  }
  // a geodesic dome: glass shell + lattice of struts + a lit base ring
  dome(K, x, z, y, rad, hs = 1, o = {}) {
    K.add(this.domeGlass(), new THREE.SphereGeometry(rad, 40, 16, 0, TAU, 0, Math.PI / 2), 0xffffff, [x, y, z], [0, 0, 0], [1, hs, 1]);
    const ico = new THREE.IcosahedronGeometry(1, o.detail ?? 2), P = ico.attributes.position, seen = new Set(), strut = o.strut ?? 0.0022;
    for (let i = 0; i < P.count; i += 3) for (let e = 0; e < 3; e++) {
      const a = new V3().fromBufferAttribute(P, i + e), b = new V3().fromBufferAttribute(P, i + (e + 1) % 3);
      if (a.y < -0.02 || b.y < -0.02) continue;
      const key = [a, b].map((v) => v.toArray().map((c) => c.toFixed(3)).join(',')).sort().join('|');
      if (seen.has(key)) continue; seen.add(key);
      a.y = Math.max(0, a.y); b.y = Math.max(0, b.y);
      const A = new V3(a.x * rad, a.y * rad * hs, a.z * rad), Bv = new V3(b.x * rad, b.y * rad * hs, b.z * rad), L = A.distanceTo(Bv);
      const q = new THREE.Quaternion().setFromUnitVectors(Y, Bv.clone().sub(A).normalize()), eu = new THREE.Euler().setFromQuaternion(q);
      K.add('metal', STRUT, o.frame ?? 0xe8eef4, [x + (A.x + Bv.x) / 2, y + (A.y + Bv.y) / 2, z + (A.z + Bv.z) / 2], [eu.x, eu.y, eu.z], [strut, L, strut]);
    }
    K.add('metal', new THREE.TorusGeometry(rad, strut * 3, 8, 64).rotateX(Math.PI / 2), 0xd8dee6, [x, y + strut * 2, z]);
    K.add('glow', new THREE.TorusGeometry(rad * 1.004, strut * 1.4, 6, 64).rotateX(Math.PI / 2), o.ring ?? 0x9fe8ff, [x, y + strut * 5, z]);
  }
  // generic downtown on a lattice, heights from core, grow and a tall factor
  downtown(K, r, o) {
    const sp = o.sp ?? 0.085, g = this.grow, tall = (o.tall ?? 1) * (0.75 + 0.15 * g), tint = o.tint || (() => new THREE.Color().setHSL(0.58 + r() * 0.1, 0.12, 0.72 + r() * 0.2));
    let tallest = { h: 0, x: 0, z: 0 };
    this.lattice(sp, o.margin ?? 0.05, o.skip, (x, z, core) => {
      if (o.inside && !o.inside(x, z)) return;
      if (r() < (o.parks ?? 0.1) + (3 - g) * 0.06) { if (o.park) o.park(x, z); else this.tinyPark(K, x, z, sp, r, o.base ? o.base(x, z) : 0); return; }        // empty lots early, parks
      const bw = sp * (0.55 + r() * 0.2), bd = sp * (0.55 + r() * 0.2), y0 = o.base ? o.base(x, z) : 0;
      const tower = r() < 0.2 + core * 0.55;
      let h = (tower ? 0.1 + core * 0.16 + r() * 0.08 : 0.035 + r() * 0.05) * tall * (o.hmul ? o.hmul(x, z) : 1);
      if (this.env.inClearing(x, z, 0.08)) h = Math.min(h, 0.05);
      const glass = tower && r() < 0.45;
      if (tower && glass && r() < 0.4) this.rtower(K, 'cglass', o.glassTint ? o.glassTint() : new THREE.Color().setHSL(0.56 + r() * 0.06, 0.4, 0.75), x, y0, z, Math.min(bw, bd) * 0.5, h);
      else this.tower(K, glass ? 'cglass' : 'cfac', glass ? (o.glassTint ? o.glassTint() : new THREE.Color().setHSL(0.56 + r() * 0.06, 0.35, 0.78)) : tint(), x, y0, z, bw, h, bd, 0);          // (square to the streets)
      if (tower) r(); else { r(); r(); }                                     // (the roof plant is roofTop's now; keep the sequence)
      if (y0 + h > tallest.h) tallest = { h: y0 + h, x, z };
    });
    return tallest;
  }
  // a tiny park on one block: lawn, a cross of paths, a pond or a tree clump, benches and lamps
  tinyPark(K, x, z, sp, r, y0 = 0) {
    const b = sp * 0.7;
    K.box('std', 0x4f9a3e, x, y0, z, b, 0.003, b);
    K.box('std', 0xc8b89a, x, y0 + 0.003, z, b, 0.0015, b * 0.12); K.box('std', 0xc8b89a, x, y0 + 0.003, z, b * 0.12, 0.0015, b);
    const q = b * 0.25;
    if (r() < 0.5) K.add('water', new THREE.CircleGeometry(b * 0.16, 16).rotateX(-Math.PI / 2), 0xffffff, [x + q, y0 + 0.004, z - q]);
    else K.add('matte', this.natureKit().broad, (X, Yy) => _c.setHSL(0.28, 0.5, 0.26 + Yy * 2), [x + q, y0, z - q], [0, r() * 6, 0], 0.32);
    K.add('matte', this.natureKit().broad, (X, Yy) => _c.setHSL(0.26, 0.5, 0.28 + Yy * 2), [x - q, y0, z + q], [0, r() * 6, 0], 0.28);
    for (const [dx, dz] of [[-q, -q], [q, q]]) { K.cyl('metal', 0x3a3a3a, x + dx * 0.4, y0, z + dz * 1.6, 0.0008, 0.0008, 0.014, 4); K.add('glow', BALL, 0xffe2a8, [x + dx * 0.4, y0 + 0.015, z + dz * 1.6], [0, 0, 0], 0.0022); }
    K.box('std', 0x7a5a3a, x - q * 1.2, y0 + 0.003, z - q * 0.5, 0.012, 0.003, 0.004);     // a bench
  }
  beacon(ctx, K, t) { K.add('blink', BALL, 0xffffff, [t.x, t.h + 0.034, t.z], [0, 0, 0], 0.006); }
  // construction cranes early in the game (grow 0..1): a tower crane at (x, z)
  crane(K, x, z, h, ry) {
    const yel = 0xf0b418;
    K.box('metal', yel, x, 0, z, 0.012, h, 0.012);
    K.box('metal', yel, x + Math.cos(ry) * 0.04, h, z - Math.sin(ry) * 0.04, 0.12, 0.008, 0.008, ry);
    K.box('std', 0x6a6a6a, x - Math.cos(ry) * 0.02, h - 0.012, z + Math.sin(ry) * 0.02, 0.018, 0.012, 0.014, ry);
    K.add('blink', BALL, 0xffffff, [x, h + 0.012, z], [0, 0, 0], 0.004);
  }

  // Domed city: a big geodesic glass dome over a skyline -- the Domed Crater
  // sits in a crater's rim wall; the seeded variant stands on a plinth with
  // airlock tunnels. Lights come up and the skyline rises as the game goes on.
  domeCity(ctx, crater) {
    const r = this.env.srand(ctx.space * 83 + (crater ? 1 : 2)), g = this.grow, DR = crater ? 0.35 : 0.31, cx = -0.035, cz = -0.04;
    ctx.wall(0x2c2e34);
    const hf = crater ? (x, z) => { const d = Math.hypot(x - cx, z - cz); return (0.035 * Math.exp(-(((d - DR - 0.03) / 0.035) ** 2)) - 0.008 * (d < DR ? 1 : 0)) * smooth(0, 0.04, this.edgeDist(x, z)) + 0.003 * fbm2(x * 30, z * 30, 2); } : () => 0;
    const cf = (x, z, h) => {
      const d = Math.hypot(x - cx, z - cz), n = fbm2(x * 24, z * 24, 3);
      if (d < DR - 0.005) { const st = (Math.abs((x / 0.07) % 1) < 0.12 || Math.abs((z / 0.07) % 1) < 0.12); return st ? _c.setRGB(0.18, 0.19, 0.22) : _c.setRGB(0.36, 0.4, 0.36).multiplyScalar(0.9 + 0.2 * n); }
      return _c.setRGB(0.58 + n * 0.1, 0.38 + n * 0.07, 0.26 + n * 0.05);
    };
    this.groundMesh(ctx, hf, cf, { sub: 34 });
    const K = new Kit(), y0 = crater ? -0.008 : 0;
    if (!crater) K.cyl('std', 0x8a8e96, cx, 0, cz, DR + 0.02, DR + 0.012, 0.012, 48);
    const base = y0 + (crater ? 0 : 0.012);
    // parks and a lake under the dome
    const tl = this.downtown(K, r, { sp: 0.075, inside: (x, z) => Math.hypot(x - cx, z - cz) < DR - 0.05, base: () => base, tall: crater ? 1.25 : 1.1, hmul: (x, z) => 1 - 0.6 * (Math.hypot(x - cx, z - cz) / DR) ** 2, parks: 0.16,
      park: (x, z) => { K.box('std', 0x3f8a3a, x, base, z, 0.06, 0.003, 0.06); K.add('std', this.natureKit().broad, (X, Yy) => _c.setHSL(0.28, 0.5, 0.18 + Yy * 2), [x, base, z], [0, r() * 6, 0], 0.6); } });
    this.beacon(ctx, K, tl);
    const dh = Math.max(0.3, tl.h + 0.06) / DR;
    this.dome(K, cx, cz, base, DR, dh, { detail: crater ? 3 : 2 });
    ctx.g.userData.domes = [{ x: cx, z: cz, r: DR, y: base, hs: dh, hf }];     // (edgeBlend: a glass tube to an early forest's dome next door)
    // airlock tunnels and a landing pad outside
    for (const a of crater ? [2.3] : [0.5, 2.6, 4.1]) {
      const x0 = cx + Math.cos(a) * DR, z0 = cz + Math.sin(a) * DR, L = 0.1;
      if (this.env.inClearing(x0 + Math.cos(a) * 0.05, z0 + Math.sin(a) * 0.05, 0.02)) continue;
      K.add('std', capsuleX(0.016, L, 12), 0xdfe4ea, [x0 + Math.cos(a) * L * 0.5, (crater ? 0.03 : 0.016), z0 + Math.sin(a) * L * 0.5], [0, -a, 0], 1, { smooth: true });
      K.add('glow', new THREE.TorusGeometry(0.0165, 0.002, 6, 16).rotateY(Math.PI / 2), 0x9fe8ff, [x0 + Math.cos(a) * L, (crater ? 0.03 : 0.016), z0 + Math.sin(a) * L], [0, -a, 0]);
    }
    if (g < 2) this.crane(K, -0.1, 0.12, 0.18 + 0.03 * g, 0.7);
    this.emit(K, ctx);
  }

  // the city face (grey hex, domed skyline) as a small holo-sign, for the
  // archetypes that do not read as a city at a glance
  cityEmblem(ctx, x, z, y = 0.24, size = 0.22) { return this.emblem(ctx, 'city', x, z, y, size, true, 'assets/tiles/city.png'); }
}
