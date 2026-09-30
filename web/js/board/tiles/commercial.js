// commercial.js -- TileArt mixin: the Commercial District, a dense downtown at night: towers of lit windows packed
// on a grid of street canyons, billboards, blade signs and lit shop canopies on their facades and roofs, car light
// trails in the streets, and in the middle a small plaza under the district's emblem -- with its street, facade,
// sign, traffic and hologram materials.
import { gfx } from '../quality.js';
import * as THREE from 'three';
import { BALL, BOX, Kit, TAU, _c, hash2 } from './kit.js';

// the street grid (board units): avenues every P each way through the plaza (centre PCX, PCZ; radius PR), SW half a
// street's width, KW a sidewalk's
const PCX = -0.04, PCZ = 0.02, P = 0.12, SW = 0.016, KW = 0.007, PR = 0.085;
const NEON = [0xff2d6f, 0xff9a1f, 0x28d8ff, 0xffe14a, 0xb44cff, 0x3cff9a, 0xff4a2a];
const NEON_CSS = ['#ff2d6f', '#ff9a1f', '#28d8ff', '#ffe14a', '#b44cff', '#3cff9a', '#ff4a2a'];
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]], RY = [Math.PI / 2, -Math.PI / 2, 0, Math.PI];   // a lot's four sides: outward, and the turn that faces a plane (+z) that way
// the sign atlas (comSignMat): 8 wide billboards (256 x 80 px, two columns) over 16 blade signs (32 x 192 px)
const ADS = [['CREDICOR', '#10204a', '#ffd23c'], ['THORGATE', '#c81e28', '#ffffff'], ['TERACTOR', '#ff8c1a', '#2a1000'], ['HELION', '#ffd84a', '#8a1a00'],
  ['ECOLINE', '#1e9a4a', '#ffffff'], ['MARS COLA', '#e8102a', '#ffffff'], ['SATURN', '#1a3ac8', '#ffffff'], ['PHOBOLOG', '#6a1aa8', '#9ff4ff']];
const BLADES = [['HOTEL', '#c81e28', '#ffffff'], ['SUSHI', '#f4f0e6', '#c81e28'], ['RAMEN', '#ffd23c', '#1a1a1a'], ['BAR', '#1a1a2a', '#ff3c8c'], ['CAFE', '#1e7a4a', '#ffffff'],
  ['CLUB', '#2a0a4a', '#28d8ff'], ['24H', '#1a3ac8', '#ffffff'], ['KTV', '#ff2d6f', '#ffffff'], ['PUB', '#6a3a1a', '#ffd23c'], ['SPA', '#f4f0e6', '#1a6ac8'], ['DELI', '#ff9a1f', '#1a1a1a'],
  ['GYM', '#1a1a1a', '#3cff9a'], ['INN', '#8a1a2a', '#ffe8c0'], ['PHARMA', '#ffffff', '#1e9a4a'], ['ARCADE', '#1a0a2a', '#ffe14a'], ['NOODLE', '#c81e28', '#ffe14a']];

export class CommercialArt {
  // Commercial District: a dense downtown at night -- blocks of towers of lit
  // windows between street canyons, their facades and roofs hung with
  // billboards, blade signs and lit shop canopies, car lights streaming down
  // the streets; the avenues meet at a small plaza under the district's emblem.
  commercial(ctx) {
    const r = this.env.srand(ctx.space * 61 + 3), g = this.grow, low = gfx.low, hs = (i, j) => hash2(i * 7.3 + ctx.space * 0.37, j + 1.9);
    ctx.wall(0x1c1b20);
    this.groundMesh(ctx, () => 0, () => _c.setRGB(1, 1, 1), { sub: 6, uv: true, mat: this.comStreetMat() });
    const K = new Kit(), GL = low ? this.cityMat('cfac') : this.comGlassMat(), SG = this.comSignMat(), HM = this.comHoloMat();
    const hol = (slot, ph, rep = 0) => new THREE.Color().setRGB(slot / 8, ph, rep / 8);          // (comHoloMat: which ad, its phase, a scroll's repeats)
    // the blocks between the streets, each cut into one, two or four lots (the four round the plaza: only their
    // outer lots are built, the rest is the plaza)
    const lots = [];
    for (let i = -4; i < 4; i++) for (let j = -4; j < 4; j++) {
      const bx = PCX + (i + 0.5) * P, bz = PCZ + (j + 0.5) * P, hb = P / 2 - SW - KW, mid = i >= -1 && i <= 0 && j >= -1 && j <= 0, s = r();
      const cut = mid || s > 0.62 ? [[-0.5, -0.5, 0.5, 0.5], [0.5, -0.5, 0.5, 0.5], [-0.5, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]]
        : s > 0.46 ? [[-0.5, 0, 0.5, 1], [0.5, 0, 0.5, 1]] : s > 0.3 ? [[0, -0.5, 1, 0.5], [0, 0.5, 1, 0.5]] : [[0, 0, 1, 1]];
      for (const [ox, oz, fw, fd] of cut) {
        let x = bx + ox * hb, z = bz + oz * hb, w = 2 * hb * fw - (fw < 1 ? 0.003 : 0), d = 2 * hb * fd - (fd < 1 ? 0.003 : 0);
        const out = () => [[-1, -1], [1, -1], [-1, 1], [1, 1]].some(([a, b]) => this.edgeDist(x + a * w / 2, z + b * d / 2) < 0.012);
        if (out()) { w *= 0.55; d *= 0.55; if (out()) continue; }                     // at the rim: a smaller building, or none
        if (this.env.inClearing(x, z, Math.max(w, d) * 0.5)) continue;
        if (Math.hypot(Math.max(Math.abs(x - PCX) - w / 2, 0), Math.max(Math.abs(z - PCZ) - d / 2, 0)) < PR + 0.004) continue;
        const st = [x + w / 2 > bx + hb - 0.004, x - w / 2 < bx - hb + 0.004, z + d / 2 > bz + hb - 0.004, z - d / 2 < bz - hb + 0.004];   // the sides on a street (DIRS)
        lots.push({ x, z, w, d, st });
      }
    }
    // the buildings: towers taller toward the back, low round the plaza; glass or concrete, dark at night but for
    // their windows (comGlassMat; the lit facade texture at Low)
    const signs = (b, k, fw) => ({ dx: DIRS[k][0], dz: DIRS[k][1], ry: RY[k], fx: b.x + DIRS[k][0] * b.w / 2, fz: b.z + DIRS[k][1] * b.d / 2, tx: Math.abs(DIRS[k][1]), tz: Math.abs(DIRS[k][0]), fw });
    for (const b of lots) {
      const { x, z, w, d, st } = b, dC = Math.hypot(x - PCX, z - PCZ), back = Math.min(1, Math.max(0, (PCZ - z) / 0.4));
      const tower = r() < 0.3 + 0.3 * back - (dC < 0.2 ? 0.2 : 0);
      let h = (tower ? 0.12 + r() * 0.1 + 0.05 * back : r() < 0.55 ? 0.03 + r() * 0.035 : 0.065 + r() * 0.045) * (0.82 + 0.08 * g);
      if (dC < 0.18) h = Math.min(h, 0.1);
      if (this.env.inClearing(x, z, 0.08)) h = Math.min(h, 0.05);
      const glass = r() < (tower ? 0.6 : 0.2), col = glass ? new THREE.Color().setHSL(0.56 + r() * 0.08, 0.3, 0.07 + r() * 0.05) : new THREE.Color().setHSL(0.6 + r() * 0.12, 0.06, 0.06 + r() * 0.06);
      let tw = w, td = d, hb = h;
      if (tower && r() < 0.6) { hb = h * 0.62; tw = w * 0.72; td = d * 0.72; this.comBlock(K, GL, col, x, hb, z, tw, h - hb, td); }   // a setback
      this.comBlock(K, GL, col, x, 0, z, w, hb, d);
      const roofC = new THREE.Color().setHSL(0.66, 0.06, 0.12 + r() * 0.1);
      K.box('std', roofC, x, h, z, tw - 0.002, 0.0016, td - 0.002);                                    // the roof
      if (Math.min(tw, td) > 0.026 && r() < (tower ? 0.35 : 0.65)) {                                        // a sky-ad: a lit screen on the roof, for the air traffic
        K.add(SG, this.comSignGeo(Math.floor(r() * ADS.length)), 0xffffff, [x, h + 0.0022, z], [-Math.PI / 2, tw >= td ? 0 : Math.PI / 2, 0, 'YXZ'], [Math.max(tw, td) * 0.88, Math.min(Math.max(tw, td) * 0.88 / 2.2, Math.min(tw, td) * 0.8), 1], { uv: true });
      } else if (!low) {
        if (tower) { K.cyl('metal', 0x8a8e96, x + tw * 0.2, h, z - td * 0.2, 0.0014, 0.0008, 0.03, 5); K.add('glow', BALL, 0xff3a2a, [x + tw * 0.2, h + 0.031, z - td * 0.2], [0, 0, 0], 0.0024); }
        else if (r() < 0.6) K.box('std', 0x7a7a82, x - tw * 0.2, h, z + td * 0.15, Math.min(tw, td) * 0.35, 0.006, Math.min(tw, td) * 0.25);   // plant on the roof
      }
      b.h = h; b.tower = tower; b.hb = hb;
      const sides = st.map((on, k) => (on ? k : -1)).filter((k) => k >= 0);
      // street level: lit shopfronts, and over the sidewalk a lit canopy or sign fascia
      for (const k of sides) {
        const S = signs(b, k, DIRS[k][0] ? d : w);
        K.add('glow', BOX, r() < 0.7 ? 0xffd9a8 : 0xe8f0ff, [S.fx + S.dx * 0.0006, 0.0065, S.fz + S.dz * 0.0006], [0, S.ry, 0], [S.fw * 0.9, 0.009, 0.001]);
        if (r() < 0.5) {
          const L = S.fw * (0.25 + r() * 0.35), o = (r() - 0.5) * (S.fw - L);
          K.add('glow', BOX, NEON[Math.floor(r() * NEON.length)], [S.fx + S.dx * 0.0035 + S.tx * o, 0.0125, S.fz + S.dz * 0.0035 + S.tz * o], [0, S.ry, 0], [L, 0.0016, 0.007]);
        }
      }
      if (!sides.length) continue;
      // a blade sign standing out from a corner, over the canopies (not on the towers)
      if (!tower && h > 0.05 && r() < 0.6) {
        const k = sides[Math.floor(r() * sides.length)], S = signs(b, k, DIRS[k][0] ? d : w), e = r() < 0.5 ? -1 : 1, bh = Math.min(0.046, h - 0.024), cell = Math.floor(r() * BLADES.length);
        const bx = S.fx + S.dx * 0.0048 + S.tx * e * (S.fw / 2 - 0.006), bz = S.fz + S.dz * 0.0048 + S.tz * e * (S.fw / 2 - 0.006), ry = S.dx ? 0 : Math.PI / 2;
        for (const q of [0, Math.PI]) K.add(SG, this.comSignGeo(8 + cell), 0xffffff, [bx, 0.018 + bh / 2, bz], [0, ry + q, 0], [0.0078, bh, 1], { uv: true });
      }
      // billboards on the upper floors of the taller buildings, one or two sides
      if (h > 0.075) for (const k of sides) {
        if (r() > (tower ? 0.55 : 0.4)) continue;
        const S = signs(b, k, DIRS[k][0] ? d : w), sw = Math.min(S.fw * 0.85, 0.07), sh = sw / 3.2, y = Math.min(hb - sh / 2 - 0.006, h * (0.45 + r() * 0.3));
        if (y < 0.03 + sh / 2) continue;
        K.add(SG, this.comSignGeo(Math.floor(r() * ADS.length)), 0xffffff, [S.fx + S.dx * 0.0008, y, S.fz + S.dz * 0.0008], [0, S.ry, 0], [sw, sh, 1], { uv: true });
      }
      // a billboard on the roof of a lower building, on legs, facing the street
      if (!low && !tower && r() < 0.35) {
        const k = sides[Math.floor(r() * sides.length)], S = signs(b, k, DIRS[k][0] ? d : w), sw = Math.min(S.fw * 0.85, 0.06), sh = sw / 3.2, px = S.fx - S.dx * 0.006, pz = S.fz - S.dz * 0.006;
        K.add(SG, this.comSignGeo(Math.floor(r() * ADS.length)), 0xffffff, [px + S.dx * 0.0009, h + 0.005 + sh / 2, pz + S.dz * 0.0009], [0, S.ry, 0], [sw, sh, 1], { uv: true });
        K.add('std', BOX, 0x2a2a30, [px, h + 0.005 + sh / 2, pz], [0, S.ry, 0], [sw + 0.002, sh + 0.002, 0.0014]);
        for (const e of [-1, 1]) K.cyl('metal', 0x5a5e66, px + S.tx * e * sw * 0.3, h, pz + S.tz * e * sw * 0.3, 0.0008, 0.0008, 0.006, 4);
      }
    }
    // holographic ads on the three tallest towers' upper floors (comHoloMat)
    lots.filter((b) => b.tower).sort((a, b) => b.h - a.h).slice(0, 3).forEach((b, i) => {
      const k = b.st.findIndex((on) => on), S = signs(b, Math.max(k, 0), DIRS[Math.max(k, 0)][0] ? b.d : b.w);
      K.add(HM, new THREE.PlaneGeometry(0.05, 0.033), hol(i % 3, hs(i, 2)), [S.fx + S.dx * 0.005, b.hb * 0.8, S.fz + S.dz * 0.005], [0, S.ry, 0], 1, { uv: true });
    });
    // the plaza: a stone podium with the emblem's projector, trees in planters, lamps round it
    K.cyl('std', 0x8a8276, PCX, 0, PCZ, 0.036, 0.034, 0.006, 24);
    K.add('glow', new THREE.TorusGeometry(0.0345, 0.0016, 6, 32).rotateX(Math.PI / 2), 0xffd9a0, [PCX, 0.006, PCZ]);
    K.cyl('metal', 0x5a5e66, PCX, 0.006, PCZ, 0.014, 0.012, 0.006, 16);
    K.add('glow', new THREE.TorusGeometry(0.011, 0.0022, 6, 20).rotateX(Math.PI / 2), 0x9fe8ff, [PCX, 0.0125, PCZ]);
    K.add('beam', new THREE.CylinderGeometry(0.06, 0.012, 0.2, 20, 1, true).translate(0, 0.112, 0), (X, Yy) => _c.setRGB(0.55, 0.85, 1).multiplyScalar(0.3 * (1 - Yy / 0.24)), [PCX, 0, PCZ]);
    for (let k = 0; k < 4; k++) {
      const a = (k + 0.5) / 4 * TAU, tx = PCX + Math.cos(a) * 0.058, tz = PCZ + Math.sin(a) * 0.058;
      K.cyl('std', 0x5a5660, tx, 0, tz, 0.01, 0.01, 0.004, 12);
      K.ball('std', 0x3f7a3a, tx, 0.016, tz, 0.0095, 0.85);
      for (const e of [-1, 1]) { const la = a + e * 0.42, lx = PCX + Math.cos(la) * 0.074, lz = PCZ + Math.sin(la) * 0.074; K.cyl('metal', 0x3a3e48, lx, 0, lz, 0.0012, 0.0009, 0.026, 5); K.add('glow', BALL, 0xffe7b0, [lx, 0.027, lz], [0, 0, 0], 0.0032); }
    }
    // car lights down the streets: tail lights one way, headlights the other (comCarMat; not at Low -- the
    // street canvas has faint streaks)
    if (!low) {
      const pos = [], uv = [], cl = [], idx = [], red = new THREE.Color(0xff2a18), wht = new THREE.Color(0xfff0d0);
      const flush = (run, tx, tz, col, dir, ph) => {
        if (run.length < 3) return;
        const b0 = pos.length / 3, nx = -tz * 0.0017, nz = tx * 0.0017;
        for (const [x, z, s] of run) { pos.push(x - nx, 0.0012, z - nz, x + nx, 0.0012, z + nz); uv.push(s * dir + ph, 0, s * dir + ph, 1); cl.push(col.r, col.g, col.b, col.r, col.g, col.b); }
        for (let i = 0; i < run.length - 1; i++) { const q = b0 + i * 2; idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
      };
      const lane = (ax, az, tx, tz, col, dir, ph) => {
        let run = [];
        for (let s = -0.6; s <= 0.6; s += 0.006) {
          const x = ax + tx * s, z = az + tz * s;
          if (this.edgeDist(x, z) > 0.014 && Math.hypot(x - PCX, z - PCZ) > PR + 0.004) run.push([x, z, s]); else { flush(run, tx, tz, col, dir, ph); run = []; }
        }
        flush(run, tx, tz, col, dir, ph);
      };
      for (let i = -4; i <= 4; i++) {
        lane(PCX + i * P - 0.0065, 0, 0, 1, red, 1, hs(i, 7)); lane(PCX + i * P + 0.0065, 0, 0, 1, wht, -1, hs(i, 8));
        lane(0, PCZ + i * P - 0.0065, 1, 0, wht, 1, hs(i, 9)); lane(0, PCZ + i * P + 0.0065, 1, 0, red, -1, hs(i, 10));
      }
      const cg = new THREE.BufferGeometry();
      cg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); cg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); cg.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3)); cg.setIndex(idx);
      K.raw(this.comCarMat(), cg);
    }
    if (!low) for (const gm of K.by.get(GL) || []) gm.setAttribute('aL', gm.attributes.position.clone());   // (comGlassMat's windows: board position)
    this.emit(K, ctx);
    this.emblem(ctx, 'commerical_district', PCX, PCZ, 0.27, 0.3, false);
  }
  // ---- Commercial District parts
  // a building block (x, z: its foot's centre; y: its base) in the facade material: at Low the city's lit facade
  // texture, its uv scaled to the block's size (as city_parts' tower), else comGlassMat's windows
  comBlock(K, GL, col, x, y, z, w, h, d) {
    const g = new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0), uv = g.attributes.uv, sizes = [[d, h], [d, h], [0, 0], [0, 0], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) {
      const j = f * 4 + i, [a, b] = sizes[f];
      if (!a) uv.setXY(j, 0.005, 0.995); else uv.setXY(j, uv.getX(j) * a / 0.045 + (x * 7 % 1), uv.getY(j) * b / 0.09 + y / 0.09);
    }
    K.add(GL, g, col, [x, y, z], [0, 0, 0], 1, { uv: true });
  }
  // a sign's quad (1 x 1, facing +z) with its uv on one cell of the sign atlas: 0-7 the billboards, 8-23 the
  // blade signs
  comSignGeo(cell) {
    const c = (this._comSG ||= [])[cell];
    if (c) return c;
    const [x0, y0, w, h] = cell < 8 ? [(cell % 2) * 256, Math.floor(cell / 2) * 80, 256, 80] : [(cell - 8) * 32, 320, 32, 192];
    const geo = new THREE.PlaneGeometry(1, 1), uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (x0 + 1 + uv.getX(i) * (w - 2)) / 512, 1 - (y0 + 1 + (1 - uv.getY(i)) * (h - 2)) / 512);
    return this._comSG[cell] = geo;
  }
  // the signs: one atlas -- the corporations' billboards (a mark and the name), the shops' blade signs (letters
  // stacked down them) -- lit, unshaded
  comSignMat() {
    if (this.mats.comSign) return this.mats.comSign;
    const tex = this.canvas('comSigns', 512, 512, (cg) => {
      cg.fillStyle = '#101014'; cg.fillRect(0, 0, 512, 512);
      cg.textAlign = 'center'; cg.textBaseline = 'middle';
      ADS.forEach(([name, bg, fg], k) => {
        const x0 = (k % 2) * 256, y0 = Math.floor(k / 2) * 80;
        cg.save(); cg.translate(x0, y0);
        cg.fillStyle = bg; cg.fillRect(2, 2, 252, 76);
        cg.strokeStyle = fg; cg.globalAlpha = 0.6; cg.lineWidth = 3; cg.strokeRect(7, 7, 242, 66); cg.globalAlpha = 1;
        cg.fillStyle = fg; cg.beginPath(); cg.arc(40, 40, 20, 0, TAU); cg.fill();                        // the mark
        cg.fillStyle = bg; cg.beginPath(); cg.arc(40 + (k % 3 - 1) * 7, 40 - (k % 2) * 6, 11, 0, TAU); cg.fill();
        cg.fillStyle = fg; cg.font = '700 40px Rajdhani, Arial, sans-serif';
        const tw = cg.measureText(name).width, sx = Math.min(1, 176 / tw);
        cg.translate(152, 42); cg.scale(sx, 1); cg.fillText(name, 0, 0);
        cg.restore();
      });
      BLADES.forEach(([name, bg, fg], k) => {
        const x0 = k * 32, y0 = 320;
        cg.fillStyle = bg; cg.fillRect(x0 + 1, y0 + 1, 30, 190);
        cg.strokeStyle = fg; cg.lineWidth = 2; cg.strokeRect(x0 + 3, y0 + 3, 26, 186);
        cg.fillStyle = fg; cg.font = '700 24px Rajdhani, Arial, sans-serif';
        const step = Math.min(30, 170 / name.length);
        [...name].forEach((ch, i) => cg.fillText(ch, x0 + 16, y0 + 96 + (i - (name.length - 1) / 2) * step));
      });
    });
    const m = this.own(new THREE.MeshBasicMaterial({ map: tex, vertexColors: true, toneMapped: false }));
    return this.mats.comSign = m;
  }
  // the streets: dark asphalt with a dashed centre line and zebra crossings, pale sidewalks, the blocks' concrete,
  // the plaza's paving (a canvas), lit by an emissive canvas: warm street light, soft pools of sign light in their
  // colours along the kerbs, the plaza's lamps, faint car-light streaks down the lanes
  comStreetMat() {
    if (this.mats.comStreet) return this.mats.comStreet;
    const W = Math.sqrt(3) * this.HEX_R * 0.95, H = 2 * this.HEX_R * 0.95, lines = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5];
    const frame = (w, h) => ({ px: (x) => (0.5 + x / W) * w, py: (z) => (0.5 + z / H) * h, S: w / W });
    const map = this.canvas('comStreet', 512, 592, (cg, w, h) => {
      const { px, py, S } = frame(w, h);
      cg.fillStyle = '#2a2830'; cg.fillRect(0, 0, w, h);
      for (let i = 0; i < 1500; i++) { cg.fillStyle = `rgba(0,0,0,${0.05 + hash2(i, 7) * 0.08})`; cg.fillRect(hash2(i, 8) * w, hash2(i, 9) * h, 2, 2); }
      const band = (a, half, col, vert) => { cg.fillStyle = col; if (vert) cg.fillRect(px(a - half), 0, 2 * half * S, h); else cg.fillRect(0, py(a - half), w, 2 * half * S); };
      for (const i of lines) { band(PCX + i * P, SW + KW, '#403d46', true); band(PCZ + i * P, SW + KW, '#403d46', false); }
      for (const i of lines) { band(PCX + i * P, SW + 0.0012, '#5a5760', true); band(PCZ + i * P, SW + 0.0012, '#5a5760', false); }   // the kerbs
      for (const i of lines) { band(PCX + i * P, SW, '#1d1c21', true); band(PCZ + i * P, SW, '#1d1c21', false); }
      // the markings: each stretch between two crossings gets a dashed centre line and a zebra crossing at each end
      const rect = (x, z, rw, rh) => cg.fillRect(px(x), py(z), rw * S, rh * S);
      for (const i of lines) for (const j of lines) for (const vert of [true, false]) {
        const a = (vert ? PCX : PCZ) + i * P, s0 = (vert ? PCZ : PCX) + j * P + SW, s1 = s0 + P - 2 * SW;
        cg.fillStyle = '#c8a850';
        for (let s = s0 + 0.014; s < s1 - 0.018; s += 0.018) vert ? rect(a - 0.0007, s, 0.0014, 0.01) : rect(s, a - 0.0007, 0.01, 0.0014);
        cg.fillStyle = '#b8b6b0';
        for (const e of [s0 + 0.002, s1 - 0.009]) for (let q = -SW + 0.002; q < SW - 0.002; q += 0.0045) vert ? rect(a + q, e, 0.0024, 0.007) : rect(e, a + q, 0.007, 0.0024);
      }
      // the plaza: paving in rings round the podium
      cg.fillStyle = '#6e665e'; cg.beginPath(); cg.arc(px(PCX), py(PCZ), PR * S, 0, TAU); cg.fill();
      cg.strokeStyle = 'rgba(30,24,20,0.45)'; cg.lineWidth = 1;
      for (let rr = 0.045; rr < PR; rr += 0.012) { cg.beginPath(); cg.arc(px(PCX), py(PCZ), rr * S, 0, TAU); cg.stroke(); }
      cg.strokeStyle = '#8a8278'; cg.lineWidth = 2; cg.beginPath(); cg.arc(px(PCX), py(PCZ), PR * S, 0, TAU); cg.stroke();
    });
    const em = this.canvas('comStreetE', 512, 592, (cg, w, h) => {
      const { px, py, S } = frame(w, h);
      cg.fillStyle = '#000'; cg.fillRect(0, 0, w, h);
      // the streets washed in warm street light; soft pools of sign light in their colours along the kerbs
      cg.fillStyle = 'rgba(255,170,100,0.11)';
      for (const i of lines) { cg.fillRect(px(PCX + i * P - SW - KW), 0, 2 * (SW + KW) * S, h); cg.fillRect(0, py(PCZ + i * P - SW - KW), w, 2 * (SW + KW) * S); }
      let n = 0;
      for (const i of lines) for (const j of lines) for (const vert of [true, false]) for (const e of [-1, 1]) for (let q = 0; q < 2; q++) {
        const hh = hash2(n++ * 1.7, 3.3); if (hh > 0.6) continue;
        const a = (vert ? PCX : PCZ) + i * P + e * (SW + KW * 0.3), s = (vert ? PCZ : PCX) + j * P + SW + 0.01 + hash2(n, 8.8) * (P - 2 * SW - 0.02);
        const [x, z] = vert ? [a, s] : [s, a], R0 = (0.008 + hash2(n, 4.4) * 0.005) * S, col = NEON_CSS[Math.floor(hash2(n, 5.1) * NEON_CSS.length)];
        cg.save(); cg.translate(px(x), py(z)); cg.scale(vert ? 1 : 2.4, vert ? 2.4 : 1);                // (drawn out along the kerb)
        const gr = cg.createRadialGradient(0, 0, 0, 0, 0, R0);
        gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
        cg.fillStyle = gr; cg.globalAlpha = 0.75; cg.beginPath(); cg.arc(0, 0, R0, 0, TAU); cg.fill(); cg.restore();
      }
      cg.globalAlpha = 0.22; cg.lineWidth = 1;
      for (const i of lines) for (const [e, c] of [[-1, '#ff3020'], [1, '#fff0d0']]) {
        cg.strokeStyle = c; cg.beginPath(); cg.moveTo(px(PCX + i * P + e * 0.0065), 0); cg.lineTo(px(PCX + i * P + e * 0.0065), h); cg.moveTo(0, py(PCZ + i * P - e * 0.0065)); cg.lineTo(w, py(PCZ + i * P - e * 0.0065)); cg.stroke();
      }
      cg.globalAlpha = 1;
      const gr = cg.createRadialGradient(px(PCX), py(PCZ), 0, px(PCX), py(PCZ), PR * S);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, 'rgba(255,200,140,0.18)'); gr.addColorStop(0.95, 'rgba(255,200,140,0.3)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      cg.fillStyle = gr; cg.beginPath(); cg.arc(px(PCX), py(PCZ), PR * S, 0, TAU); cg.fill();
    });
    const m = new THREE.MeshStandardMaterial({ map, emissiveMap: em, emissive: 0xffffff, emissiveIntensity: 0.9, roughness: 0.6, metalness: 0.1 });
    this.own(m, 0.4);
    return this.mats.comStreet = m;
  }
  // the car lights: streaks along each lane (uv.x = board distance along it, signed with its way), a car every
  // so often, bright at its head and trailing off behind; additive
  comCarMat() {
    if (this.mats.comCar) return this.mats.comCar;
    const m = new THREE.ShaderMaterial({
      uniforms: { uTime: this.time },
      vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: /* glsl */`varying vec2 vUv; varying vec3 vC;
        void main(){ vUv = uv; vC = color; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`
        uniform float uTime; varying vec2 vUv; varying vec3 vC;
        float hh(float x){ return fract(sin(x * 91.7) * 43758.5453); }
        void main(){
          float u = vUv.x * 16.0 - uTime * 0.8, id = floor(u), f = fract(u);
          float car = step(0.4, hh(id));
          float streak = smoothstep(0.35, 0.95, f) * (1.0 - smoothstep(0.96, 1.0, f));
          float across = 1.0 - abs(vUv.y * 2.0 - 1.0);
          gl_FragColor = vec4(vC * car * streak * streak * across * 1.5, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    m.userData.shared = true;
    return this.mats.comCar = m;
  }
  // the buildings' facades: vertex colours (glass or concrete), and per pixel (aL = board position) a grid of
  // windows on the walls, about a third of them lit -- warm amber, some cool white, the odd one coloured (as the
  // city's lit facade texture, crisp); from afar their even glow
  comGlassMat() {
    if (this.mats.comGlass) return this.mats.comGlass;
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.25 });
    m.onBeforeCompile = (s) => {
      s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aL; varying vec3 vL;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvL = aL;');
      s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vL;
float comH(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  vec3 p = vL; float px = max(length(fwidth(p)), 1e-6);
  vec3 nL = normalize(cross(dFdx(p), dFdy(p)));
  if (abs(nL.y) < 0.5) {
    float h = dot(p.xz, normalize(vec2(-nL.z, nL.x)));
    vec2 w = vec2(h / 0.0056, p.y / 0.011), id = floor(w), f = abs(fract(w) - 0.5);
    float win = (1.0 - smoothstep(0.3, 0.3 + fwidth(w.x), f.x)) * (1.0 - smoothstep(0.24, 0.24 + fwidth(w.y), f.y));
    vec2 side = vec2(floor(nL.x * 1.5 + 0.5) * 7.1, floor(nL.z * 1.5 + 0.5) * 3.7);   // (rounded: a wall's normal is noisy about 0)
    float hs = comH(id + side + floor(vColor.r * 97.0)), h2 = comH(id.yx + side * 2.3);
    float lit = step(0.64, hs);                                            // about a third of the windows lit
    vec3 wc = h2 < 0.2 ? vec3(0.85, 0.92, 1.0) : h2 > 0.985 ? vec3(1.0, 0.35, 0.6) : vec3(1.0, 0.56 + 0.26 * h2, 0.22 + 0.3 * h2);
    vec2 dw = fwidth(w);                                                   // (windows per pixel each way: a wall seen edge-on from above squeezes the rows)
    float fine = clamp(2.0 - max(dw.x, dw.y) * 4.0, 0.0, 1.0);
    totalEmissiveRadiance += mix(vec3(0.105, 0.072, 0.039), wc * lit * win, fine);
  }
}`);
    };
    m.customProgramCacheKey = () => 'comGlass2';
    this.own(m, 1);
    return this.mats.comGlass = m;
  }
  // the holograms (the towers' holo ads): one shader over an atlas of five ads; the
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
