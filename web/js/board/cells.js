// cells.js -- Board3D mixin: the board's hex cells -- their shapes, textures, labels and owner rims.
import * as THREE from 'three';
import { tName } from '../i18n.js';
import { BONUS_COST, BONUS_ICON, HEX_R, bonusIconUrl } from './layout.js';
import { canvasTex, disposeTree, hexPath } from './model_kit.js';

export class BoardCells {
  // curved hex cap hugging the sphere; uv = the pointy-top hex image box
  capGeo(cell, lift, inset = 1, sub = 4) {
    const pts2 = [];
    for (let k = 0; k < 6; k++) { const a = Math.PI / 2 + k * Math.PI / 3; pts2.push([Math.cos(a) * HEX_R * inset, -Math.sin(a) * HEX_R * inset]); }
    const pos = [], uvs = [], idx = [];
    const add = (x, y) => { const p = cell.proj(x, y, lift); pos.push(p.x, p.y, p.z); uvs.push(0.5 + x / (Math.sqrt(3) * HEX_R * inset), 0.5 - y / (2 * HEX_R * inset)); return pos.length / 3 - 1; };
    for (let k = 0; k < 6; k++) {
      const B = pts2[k], Cc = pts2[(k + 1) % 6];
      const grid = [];
      for (let i = 0; i <= sub; i++) {
        grid.push([]);
        for (let j = 0; j <= sub - i; j++) { const a = i / sub, b = j / sub; grid[i].push(add(B[0] * a + Cc[0] * b, B[1] * a + Cc[1] * b)); }
      }
      for (let i = 0; i < sub; i++) for (let j = 0; j < sub - i; j++) {
        idx.push(grid[i][j], grid[i + 1][j], grid[i][j + 1]);
        if (j < sub - i - 1) idx.push(grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    // outward normals even where the triangle winding flips
    const nrm = g.attributes.normal;
    for (let i = 0; i < nrm.count; i++) {
      const p = new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
      const out = cell.colony ? cell.up : p.normalize();
      const nv = new THREE.Vector3().fromBufferAttribute(nrm, i);
      if (nv.dot(out) < 0) nrm.setXYZ(i, -nv.x, -nv.y, -nv.z);
    }
    return g;
  }
  wallGeo(cell, lo, hi, inset = 1, sub = 4, keep = null) {
    const pos = [], idx = [];
    for (let k = 0; k < 6; k++) {
      const a0 = Math.PI / 2 + k * Math.PI / 3, a1 = a0 + Math.PI / 3;
      for (let i = 0; i < sub; i++) {
        const P = (t) => [(Math.cos(a0) * (1 - t) + Math.cos(a1) * t) * HEX_R * inset, -(Math.sin(a0) * (1 - t) + Math.sin(a1) * t) * HEX_R * inset];
        const [x0, y0] = P(i / sub), [x1, y1] = P((i + 1) / sub);
        if (keep && !keep((x0 + x1) / 2, (y0 + y1) / 2)) continue;             // (a gap: ownerRim's stripe over an estuary)
        const base = pos.length / 3;
        for (const [x, y, l] of [[x0, y0, lo], [x1, y1, lo], [x1, y1, hi], [x0, y0, hi]]) { const p = cell.proj(x, y, l); pos.push(p.x, p.y, p.z); }
        idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  cellTex(kind, bonuses, name = '', volc = false) {
    const key = `cell:${kind}:${bonuses.join(',')}:${name}:${volc}`;
    this.cellKeys?.add(key);
    const list = bonuses.filter((b) => BONUS_ICON[b]), icons = list.map((b) => BONUS_ICON[b]);
    const cost = bonuses.reduce((a, b) => a + (BONUS_COST[b] || 0), 0);
    return this.lazyTex(key, 256, 296, (g, w, h, ims) => {
      const mc = cost ? ims.pop() : null;
      hexPath(g, w, h, 3);
      g.fillStyle = kind === 1 ? 'rgba(135,200,255,0.34)' : kind === 2 ? 'rgba(120,200,255,0.05)' : 'rgba(30,14,6,0.06)'; g.fill();
      g.lineWidth = kind === 2 ? 9 : 4; if (kind === 2) { g.shadowColor = 'rgba(120,210,255,0.9)'; g.shadowBlur = 14; } g.strokeStyle = kind === 1 ? 'rgba(14,44,110,0.95)' : kind === 2 ? 'rgba(150,220,255,0.9)' : 'rgba(255,240,225,0.6)'; g.stroke();
      hexPath(g, w, h, 12); g.lineWidth = 2; g.strokeStyle = 'rgba(0,0,0,0.22)'; g.stroke();
      const n = ims.length, sz = n > 2 ? 70 : 92;
      // the resource icons fill a square; a paid bonus's ocean / thermometer keeps its own
      // shape at the resources' visual size, with the M€ cost badge beside it
      const box = ims.map((im, k) => {
        if (!BONUS_COST[list[k]] || !im) return { w: sz, h: sz, paid: false };
        const asp = im.width / im.height, hh = sz * (asp < 0.5 ? 0.88 : 0.8); return { w: hh * asp, h: hh, paid: true };   // a slim thermometer stands a little taller
      });
      const bs = cost ? Math.round(sz * 0.58) : 0;
      const step = (k) => (box[k - 1].paid || box[k].paid ? box[k - 1].w + 4 : sz * 0.9);
      let span = box.length ? box[box.length - 1].w : 0;
      for (let k = 1; k < box.length; k++) span += step(k);
      let x = w / 2 - (span + (cost ? 5 + bs : 0)) / 2;
      ims.forEach((im, k) => {
        if (k) x += step(k);
        if (!im) return;
        g.shadowColor = 'rgba(0,0,0,0.75)'; g.shadowBlur = 10;
        g.drawImage(im, x, h / 2 - box[k].h / 2, box[k].w, box[k].h);
        g.shadowBlur = 0;
      });
      if (cost) {
        const bx = x + (box.length ? box[box.length - 1].w + 5 : 0), by = h / 2 - bs / 2 + sz * 0.06;
        g.shadowColor = 'rgba(0,0,0,0.75)'; g.shadowBlur = 8;
        if (mc) g.drawImage(mc, bx, by, bs, bs);
        else { g.fillStyle = '#f2c81e'; g.beginPath(); g.roundRect(bx, by, bs, bs, bs * 0.18); g.fill(); }
        g.shadowBlur = 0;
        g.font = `700 ${Math.round(bs * 0.64)}px Rajdhani, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillStyle = '#2a1a06'; g.fillText(`-${cost}`, bx + bs / 2 - bs * 0.03, by + bs * 0.54);
      }
      if (volc) {                       // volcano glyph, top of the hex
        g.fillStyle = 'rgba(120,40,20,0.85)'; g.strokeStyle = 'rgba(255,190,150,0.9)'; g.lineWidth = 3;
        g.beginPath(); g.moveTo(w / 2 - 26, 78); g.lineTo(w / 2 - 8, 52); g.lineTo(w / 2 + 8, 52); g.lineTo(w / 2 + 26, 78); g.closePath(); g.fill(); g.stroke();
        g.fillStyle = '#ff7a3a'; g.beginPath(); g.arc(w / 2, 46, 6, 0, 7); g.fill();
      }
      if (name) {
        g.font = '700 25px Rajdhani, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        const words = name.split(' '), lines = words.length > 1 ? [words.slice(0, -1).join(' '), words[words.length - 1]] : [name];
        lines.forEach((ln, k) => {
          const y = h - 78 + k * 26;
          g.lineWidth = 5; g.strokeStyle = 'rgba(0,0,0,0.75)'; g.strokeText(ln.toUpperCase(), w / 2, y);
          g.fillStyle = '#ffe9d2'; g.fillText(ln.toUpperCase(), w / 2, y);
        });
      }
    }, [...icons.map(bonusIconUrl), ...(cost ? ['assets/res/megacredit.png'] : [])]);
  }

  buildCell(cell) {
    const lift = cell.colony ? 0 : 0.01;
    const cap = new THREE.Mesh(this.capGeo(cell, lift, 0.985, cell.colony ? 1 : 4), new THREE.MeshBasicMaterial({ map: this.cellTex(cell.kind, cell.b, cell.colony ? '' : tName('space.', cell.name), cell.volc), transparent: true, depthWrite: false }));
    cap.renderOrder = 2;
    cap.userData.space = cell.i;
    this.board.add(cap);
    cell.cap = cap;
    const hlTex = this.hlTex ||= canvasTex(256, 296, (g, w, h) => {
      hexPath(g, w, h, 8); g.fillStyle = 'rgba(255,150,50,0.38)'; g.fill();
      g.lineWidth = 16; g.strokeStyle = 'rgba(255,190,90,1)'; g.stroke();
      hexPath(g, w, h, 20); g.lineWidth = 4; g.strokeStyle = 'rgba(255,255,255,0.8)'; g.stroke();
    });
    const hl = new THREE.Mesh(this.capGeo(cell, lift + 0.006, 0.97, cell.colony ? 1 : 3), new THREE.MeshBasicMaterial({ map: hlTex, transparent: true, opacity: 0, depthWrite: false }));
    hl.renderOrder = 3; hl.visible = false;
    this.board.add(hl);
    cell.hl = hl;
    if (cell.colony) {
      // the real body behind its (much bigger) game hex
      const isGanymede = /ganymede/i.test(cell.name || '');
      const W = cell.proj(0, HEX_R, 0).distanceTo(cell.proj(0, -HEX_R, 0)) / 2;
      // framed by its hex: the body sits just behind the hex window
      // on the home view's line of sight through the hex centre, so it sits centred in the frame
      const at = cell.center.clone().addScaledVector(cell.center.clone().sub(this.home).normalize(), W * 0.8);
      if (isGanymede) {
        if (this.gany) { this.scene.remove(this.gany.moon, this.gany.fleet); disposeTree(this.gany.moon); disposeTree(this.gany.fleet); this.moons = this.moons.filter((m) => m !== this.gany.moon); this.gany = null; }   // a new map
        const body = this.makeGanymede(W * 0.62);
        body.position.copy(at);
        this.scene.add(body);
        (this.moons ||= []).push(body);
      } else this.makeStation(cell, W, at);
      if (isGanymede && !this.jupiter) this.makeJupiter(cell, W);
      if (isGanymede) this.makeGanymedeHaven(cell, W, this.moons[this.moons.length - 1]);
      const lbl = cell.lbl = this.label(tName('space.', cell.name) || 'Colony');
      lbl.position.copy(cell.proj(0, 1.02, 0.1));
      // the moon cells sit behind the planet's limb: their names always draw on top
      if (lbl.material) { lbl.material.depthTest = false; lbl.material.depthWrite = false; }
      lbl.renderOrder = 20;
      this.board.add(lbl);
    }
  }

  // the language changed: hex names and moon-cell labels in the new language
  relabel() {
    for (const cell of this.cells || []) {
      if (!cell) continue;
      if (cell.cap && !cell.colony) { cell.cap.material.map = this.cellTex(cell.kind, cell.b, tName('space.', cell.name), cell.volc); cell.cap.material.needsUpdate = true; }
      if (cell.lbl) { const nl = this.label(tName('space.', cell.name) || 'Colony'); cell.lbl.material.map?.dispose(); cell.lbl.material.map = nl.material.map; cell.lbl.material.needsUpdate = true; nl.material.dispose(); }
    }
  }

  label(text) {
    const t = canvasTex(512, 96, (g) => {
      g.font = '700 50px Rajdhani, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      const w = g.measureText(text).width + 40;
      g.fillStyle = 'rgba(8,10,16,0.6)'; g.beginPath(); g.roundRect(256 - w / 2, 14, w, 68, 20); g.fill();
      g.fillStyle = '#cfe8ff'; g.fillText(text, 256, 50);
    });
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
    sp.material.userData.own = true;                 // disposed with the board (clearBoard)
    sp.scale.set(4.2, 0.79, 1);
    return sp;
  }

  // a hex band draped over the cell: rings = [[inset, alpha], ...] from the
  // outside in; vertex colours carry alpha so the band can fade inward
  hexBand(cell, lift, rings, color, sub = 6, dash = 0, fade = null) {
    const pos = [], col = [], idx = [], c = new THREE.Color(color);
    const nR = rings.length, per = 6 * sub;
    for (const [inset, a] of rings) for (let k = 0; k < 6; k++) for (let i = 0; i < sub; i++) {
      const a0 = Math.PI / 2 + k * Math.PI / 3, a1 = a0 + Math.PI / 3, t = i / sub;
      const x = (Math.cos(a0) * (1 - t) + Math.cos(a1) * t) * HEX_R * inset, y = -(Math.sin(a0) * (1 - t) + Math.sin(a1) * t) * HEX_R * inset;
      const p = cell.proj(x, y, lift);
      pos.push(p.x, p.y, p.z); col.push(c.r, c.g, c.b, a * (dash && i % 2 ? dash : 1) * (fade ? fade(x, y) : 1));
    }
    for (let r = 0; r < nR - 1; r++) for (let i = 0; i < per; i++) {
      const a = r * per + i, b = r * per + (i + 1) % per, d = a + per, e = b + per;
      idx.push(a, d, b, b, d, e);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
    g.setIndex(idx);
    // face outward (up) whatever the projection's handedness
    const A = new THREE.Vector3().fromArray(pos, 0), Bv = new THREE.Vector3().fromArray(pos, 3), Cv = new THREE.Vector3().fromArray(pos, per * 3);
    if (Bv.sub(A).cross(Cv.sub(A)).dot(cell.up) < 0) for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
    g.setIndex(idx);
    return g;
  }

  // the owner's colour round the whole tile, so a busy board reads as two
  // territories at a glance: a glowing band on the tile's top edge fading
  // inward, and a coloured stripe along the top of its side wall
  // (TileArt's userData.rimGap: [[x, y, r], ...] where the tile opens to the sea -- a river's estuary: the
  // band fades out and the stripe breaks off there)
  ownerRim(g, cell, pc, H) {
    const gap = g.userData.rimGap, gd = gap && ((x, y) => Math.min(...gap.map(([gx, gy, r]) => Math.hypot(x - gx, y - gy) / r)));
    const fade = gap && ((x, y) => { const t = Math.max(0, Math.min(1, (gd(x, y) - 0.55) / 0.45)); return t * t * (3 - 2 * t); });
    const band = new THREE.Mesh(this.hexBand(cell, H + 0.004, [[0.968, 1], [0.928, 1], [0.88, 0.5], [0.76, 0]], pc, gap ? 24 : 6, 0, fade),
      (this.rimMats ||= {})[pc] ||= new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3 }));
    band.renderOrder = 3;
    band.position.sub(cell.center);
    g.add(band);
    const stripe = new THREE.Mesh(this.wallGeo(cell, H * 0.52, H + 0.004, 0.953, gap ? 24 : 4, gap && ((x, y) => gd(x, y) > 0.8)),
      (this.stripeMats ||= {})[pc] ||= new THREE.MeshStandardMaterial({ color: pc, emissive: pc, emissiveIntensity: 0.55, roughness: 0.5 }));
    stripe.position.sub(cell.center);
    g.add(stripe);
  }
}
