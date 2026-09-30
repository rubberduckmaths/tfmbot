// marks.js -- Board3D mixin: what the board marks -- spaces to pick, the placement ghost, picked spaces and
// Land Claim flags.
import * as THREE from 'three';
import { mergeGeometries } from '../../vendor/BufferGeometryUtils.js';
import { HEX_R } from './layout.js';

export class BoardMarks {
  // Land Claim: a surveyor's claim on an empty hex -- stakes at the six
  // corners with a rope between them hung with pennants, a tall flag in the
  // middle and a faint outline on the ground, all in the claimant's colour.
  // claims = [[space, owner], ...]; hexes that already have a tile are skipped.
  syncClaims(claims = []) {
    this.claimMarks ||= new Map();
    const want = new Map();
    for (const [sp, owner] of claims) if (this.cells[sp] && !this.cells[sp].colony && !this.tiles.has(sp)) want.set(sp, owner);
    for (const [sp, m] of this.claimMarks) if (want.get(sp) !== m.userData.owner) { this.board.remove(m); m.traverse((o) => o.geometry?.dispose()); this.claimMarks.delete(sp); }
    for (const [sp, owner] of want) {
      if (this.claimMarks.has(sp)) continue;
      const m = this.makeClaim(this.cells[sp], owner);
      m.userData.owner = owner;
      this.claimMarks.set(sp, m);
      this.board.add(m);
    }
  }
  makeClaim(cell, owner) {
    const pc = this.playerColors[owner] ?? 0xffffff, g = new THREE.Group();
    const W = cell.proj(0, HEX_R, 0).distanceTo(cell.proj(0, -HEX_R, 0)) / 2, L0 = 0.012;
    const Y = new THREE.Vector3(0, 1, 0), M = new THREE.Matrix4(), Q = new THREE.Quaternion(), c = new THREE.Color();
    const wood = [], cloth = [];
    // a part: geometry (unit units of W) placed at world point p with quaternion q
    const put = (list, geo, color, p, q, s = [1, 1, 1]) => {
      const gg = (geo.index ? geo.toNonIndexed() : geo);
      gg.deleteAttribute('uv');
      gg.applyMatrix4(M.compose(p.clone().sub(cell.center), q, new THREE.Vector3(s[0] * W, s[1] * W, s[2] * W)));
      c.set(color);
      const col = new Float32Array(gg.attributes.position.count * 3);
      for (let i = 0; i < col.length; i += 3) { col[i] = c.r; col[i + 1] = c.g; col[i + 2] = c.b; }
      gg.setAttribute('color', new THREE.BufferAttribute(col, 3));
      list.push(gg);
    };
    const stakeH = 0.13, inset = 0.86, tops = [];
    for (let k = 0; k < 6; k++) {
      const a = Math.PI / 2 + k * Math.PI / 3, x = Math.cos(a) * HEX_R * inset, y = -Math.sin(a) * HEX_R * inset;
      const { p, q } = this.frameAt(cell, x, y, L0);
      put(wood, new THREE.CylinderGeometry(0.009, 0.011, stakeH, 6).translate(0, stakeH / 2, 0), 0xc9a36a, p, q);
      put(cloth, new THREE.CylinderGeometry(0.0115, 0.0115, 0.025, 6).translate(0, stakeH - 0.02, 0), pc, p, q);        // painted tip
      tops.push(p.clone().addScaledVector(cell.proj(x, y, 1).sub(p).normalize(), (stakeH - 0.015) * W));
    }
    // the rope, sagging a little, with pennants hanging from it
    for (let k = 0; k < 6; k++) {
      const a = tops[k], b = tops[(k + 1) % 6], N = 6;
      let prev = a;
      for (let i = 1; i <= N; i++) {
        const t = i / N, pt = a.clone().lerp(b, t).addScaledVector(cell.up, -Math.sin(t * Math.PI) * 0.018 * W);
        const d = pt.clone().sub(prev), len = d.length();
        put(wood, new THREE.CylinderGeometry(0.005, 0.005, 1, 4), 0xf2ead8, prev.clone().add(pt).multiplyScalar(0.5), Q.setFromUnitVectors(Y, d.normalize()).clone(), [1, len / W, 1]);
        if (i < N) {                                    // pennant: a small triangle hanging under the rope
          const tq = new THREE.Quaternion().setFromUnitVectors(Y, cell.up), side = b.clone().sub(a).normalize();
          const tri = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([-0.026, 0, 0, 0.026, 0, 0, 0, -0.048, 0], 3));
          tri.computeVertexNormals();
          const ang = Math.atan2(side.clone().applyQuaternion(tq.clone().invert()).z, side.clone().applyQuaternion(tq.clone().invert()).x);
          put(cloth, tri, pc, pt, tq.clone().multiply(new THREE.Quaternion().setFromAxisAngle(Y, -ang)));
        }
        prev = pt;
      }
    }
    // the claim flag: pole, finial and a big pennant flag
    const fx = -0.05, fy = 0.04, poleH = 0.78;
    const { p: fp, q: fq } = this.frameAt(cell, fx, fy, L0);
    put(wood, new THREE.CylinderGeometry(0.008, 0.011, poleH, 8).translate(0, poleH / 2, 0), 0xe8e8ea, fp, fq);
    put(wood, new THREE.SphereGeometry(0.016, 10, 8).translate(0, poleH + 0.01, 0), 0xf2c64a, fp, fq);
    put(wood, new THREE.CylinderGeometry(0.035, 0.045, 0.02, 10).translate(0, 0.01, 0), 0x8a7a64, fp, fq);          // cairn at the foot
    const staticGeo = mergeGeometries(wood), clothGeo = mergeGeometries(cloth);
    const woodM = new THREE.Mesh(staticGeo, this.claimWood ||= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }));
    woodM.castShadow = true;
    const clothMat = (this.claimCloth ||= {})[pc] ||= new THREE.MeshStandardMaterial({ vertexColors: true, emissive: pc, emissiveIntensity: 0.45, roughness: 0.6, side: THREE.DoubleSide });
    g.add(woodM, new THREE.Mesh(clothGeo, clothMat));
    // the flag cloth: a rippled plane off the pole, waving (userData.wave in frame())
    const fg = new THREE.PlaneGeometry(0.4, 0.26, 12, 4).translate(0.2, 0, 0);
    const flag = new THREE.Mesh(fg, clothMat.clone());
    flag.material.vertexColors = false; flag.material.color.set(pc);
    fg.userData.base = fg.attributes.position.array.slice();
    flag.position.copy(fp).sub(cell.center).addScaledVector(cell.proj(fx, fy, 1).sub(fp).normalize(), (poleH - 0.14) * W);
    // turn the flag broadside to the home view
    const toCam = this.home.clone().sub(fp).applyQuaternion(fq.clone().invert());
    flag.quaternion.copy(fq); flag.rotateY(Math.atan2(toCam.x, toCam.z) - 0.35);
    flag.scale.setScalar(W);
    flag.userData.wave = true; flag.castShadow = true;
    this.animated.push(flag);
    g.add(flag);
    // faint outline on the ground, fading inward
    const ring = new THREE.Mesh(this.hexBand(cell, L0 + 0.003, [[0.95, 1], [0.91, 0.85], [0.84, 0.22], [0.7, 0]], pc, 12, 0.15),   // dashed: reserved, not yet owned
      (this.claimRing ||= {})[pc] ||= new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3 }));
    ring.position.sub(cell.center); ring.renderOrder = 3;
    g.add(ring);
    g.position.copy(cell.center);
    return g;
  }

  highlight(spaces, onPick, ghost) {
    this.clearHighlight();
    this.highlighted = new Set(spaces);
    this.onPick = onPick;
    this.ghostKind = ghost || null;
    document.body.classList.toggle('placing', spaces.length > 0);     // (app.css: the action rows fade and let clicks through to the hexes)
    for (const s of spaces) this.cells[s].hl.visible = true;
    // never move the camera for the player: they can see the whole board
  }
  // a floating image of the tile being placed, over the hovered candidate
  showGhost(space) {
    if (this.ghost) { this.board.remove(this.ghost); this.ghost = null; }
    if (space < 0 || !this.ghostKind || !this.highlighted.has(space)) return;
    const art = { city: 'city', greenery: 'greenery', ocean: 'ocean' }[this.ghostKind] || 'special';
    const t = this.lazyTex('ghost:' + art, 256, 296, (g, w, h, [im]) => { if (im) g.drawImage(im, 0, 0, w, h); }, [`assets/tiles/${art}.png`]);
    const cell = this.cells[space];
    const W = cell.proj(0, HEX_R, 0).distanceTo(cell.proj(0, -HEX_R, 0)) / 2;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, opacity: 0.92, depthTest: false }));
    sp.scale.set(W * 1.5, W * 1.73, 1);
    sp.position.copy(cell.proj(0, 0, W * 1.3));
    sp.renderOrder = 10;
    sp.userData.bob = cell.proj(0, 0, W * 1.3);
    sp.userData.up = cell.up.clone();
    this.ghost = sp;
    this.board.add(sp);
  }

  clearHighlight() {
    this.ghostKind = null;
    if (this.ghost) { this.board.remove(this.ghost); this.ghost = null; }
    for (const s of this.highlighted) { const c = this.cells[s]; if (c) { c.hl.visible = false; c.hl.material.opacity = 0; } }
    this.highlighted = new Set();
    this.onPick = null;
    document.body.classList.remove('placing');
  }

  // a pick inside a multi-tile placement (Giant Ice Asteroid's 2 oceans...):
  // the tile's image rests on the hex with a bright ring until the tiles land
  markPicked(space, kind) {
    const cell = this.cells[space];
    if (!cell) return;
    const art = { city: 'city', greenery: 'greenery', ocean: 'ocean' }[kind] || 'special';
    const t = this.lazyTex('ghost:' + art, 256, 296, (g, w, h, [im]) => { if (im) g.drawImage(im, 0, 0, w, h); }, [`assets/tiles/${art}.png`]);
    const W = cell.proj(0, HEX_R, 0).distanceTo(cell.proj(0, -HEX_R, 0)) / 2;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, opacity: 0.95, depthTest: false }));
    sp.scale.set(W * 1.2, W * 1.38, 1);
    sp.position.copy(cell.proj(0, 0, W * 0.55));
    sp.renderOrder = 10;
    const ring = new THREE.Mesh(this.capGeo(cell, 0.12, 1.05, 2), new THREE.MeshBasicMaterial({ color: 0xfff27a, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
    ring.renderOrder = 5;
    this.picked ||= [];
    this.picked.push(sp, ring);
    this.board.add(sp, ring);
  }
  clearPicked() {
    for (const o of this.picked || []) { this.board.remove(o); if (o.isMesh) o.geometry.dispose(); o.material.dispose(); }
    this.picked = [];
  }
}
