// anim_jobs.js -- TileArt mixin: the placement animation. A tile placed during play grows in part by part
// (animateIn) with its own touches: city cranes, the Mohole drill, the Nuclear Zone's test shot, lava flooding.
import * as THREE from 'three';
import { gfx } from '../quality.js';
import { Kit, TAU, V3, backOut, clamp01, hash2, smooth } from './kit.js';

export class TileAnimJobs {
  // board3d prewarmTiles(): things built later than the tiles themselves (a flock of birds)
  prewarmExtras(grp) {
    const m = this.birdMesh(1);
    m.geometry = m.geometry.clone();            // (the prewarm disposes what it built; the shared bird geometry stays)
    grp.add(m);
  }

  // ---------------------------------------------------------------- placement animation
  // A tile placed during play comes to life instead of popping in (~1.3 s):
  // its parts grow up from their feet in a staggered cascade from the centre,
  // placed props and board3d's trees grow in with a little overshoot, and each
  // kind adds its own touch (city cranes and dust, the Mohole drill boring
  // down, lava flooding the channels, the Nuclear Zone's test shot and cooling
  // scorch, the Ecological Zone's falls pouring). Everything is moved on the
  // CPU for this one tile only and restored exactly at the end; materials are
  // the tile's own (or same-program clones), so nothing compiles.
  // o.only(mesh): animate just those meshes (the Capital's canals filling);
  // o.from: 0..1 progress to resume at (a tile rebuilt mid-animation).
  animateIn(g, o = {}) {
    const space = g.userData.space, cell = this.b.cells[space];
    if (!cell || cell.colony) return false;
    const T = this.env.TILE, type = +String(g.userData.key || '').split(':')[0], k = this.kOf(cell);
    const up = cell.up.clone(), jobs = [], M = this.mats;
    const modeOf = (m) => (m.material === M.falls || m.material === M.icefall || m.material.userData.anim === 'pour' ? 'pour' : m.material === M.water || m.material === M.ice || m.material.userData.anim === 'fill' ? 'fill' : 'grow');   // (userData.anim: the Ecological Zone's own water / falls)
    g.traverse((m) => {
      if (m === g || (o.only && !o.only(m))) return;
      if (m.isInstancedMesh) jobs.push(this.instJob(m));
      else if (m.isMesh && m.geometry.userData.anim) jobs.push(this.vertJob(m, up, modeOf(m), k, o.dir));
      else if (m.isMesh && m.userData.open) jobs.push(this.openJob(m));
      else if (m.isSprite && m.userData.s0) jobs.push(this.popJob(m, 'emblem'));
      else if (m.userData.q0 && !m.isSprite) jobs.push(this.popJob(m));
    });
    if (!o.only) {
      const city = type === T.CITY || type === T.CAPITAL || type === T.COMMERCIAL;
      if (city) jobs.push(this.cranesJob(g, cell));
      if (type === T.MOHOLE) jobs.push(this.drillJob(g, cell, -0.04, -0.06));
      if (type === T.NUCLEAR) { jobs.push(this.heatJob(g, cell, -0.04, -0.05)); if (!o.from) this.blastFx(g, cell, -0.04, -0.05); }
      if (type === T.LAVA) jobs.push(this.lavaJob(g, cell));
      if (type !== T.GREENERY && type !== T.OCEAN && !o.from) { this.b.dust(cell); if (city) setTimeout(() => g.parent && this.b.dust(cell), 450); }
    }
    if (!jobs.length) return true;
    const from = o.from || 0, t0 = performance.now() - from * 1300;
    g.userData.animating = { t0 };
    this.b.tween(1300 * (1 - from), (kk) => {
      const K = from + (1 - from) * kk;
      for (const j of jobs) j.f(K);
    }, () => { for (const j of jobs) j.end(); delete g.userData.animating; });
    return true;
  }
  // merged parts: each grows from its foot (the falls pour from the top, the water rises into its bed)
  // dir (tile-local vector): only the parts out that way move, filling from its far end in (a new canal)
  vertJob(m, up, mode, k, dir) {
    const geo = m.geometry, A = geo.userData.anim, P = geo.attributes.position, orig = P.array.slice(), a = P.array, n = P.count;
    const ux = up.x, uy = up.y, uz = up.z, depth = 0.03 * k;
    if (dir) {
      const L = dir.length(), dx = dir.x / L, dy = dir.y / L, dz = dir.z / L;
      A.st = A.st.slice();
      for (let i = 0; i < n; i++) { const t = (A.foot[i * 3] * dx + A.foot[i * 3 + 1] * dy + A.foot[i * 3 + 2] * dz) / (L * 0.5); A.st[i] = t < 0.12 ? -9 : clamp01(1 - t); }
    }
    geo.userData.animating = true;
    const done = new Uint8Array(n);                               // parts that have settled are left alone
    return {
      f: (K) => {
        for (let i = 0; i < n; i++) {
          if (done[i]) continue;
          const x = clamp01((K - A.st[i] * 0.5) / 0.5), e = 1 - (1 - x) * (1 - x) * (1 - x), i3 = i * 3;
          if (x >= 1) { a[i3] = orig[i3]; a[i3 + 1] = orig[i3 + 1]; a[i3 + 2] = orig[i3 + 2]; done[i] = 1; continue; }
          if (mode === 'grow') {                                  // grows from its own foot, with a little overshoot (reads from above too)
            const sc = Math.max(1e-3, backOut(x)), fx = A.foot[i3], fy = A.foot[i3 + 1], fz = A.foot[i3 + 2];
            a[i3] = fx + (orig[i3] - fx) * sc; a[i3 + 1] = fy + (orig[i3 + 1] - fy) * sc; a[i3 + 2] = fz + (orig[i3 + 2] - fz) * sc;
          }
          else if (mode === 'fill') { const d = depth * (1 - e); a[i3] = orig[i3] - ux * d; a[i3 + 1] = orig[i3 + 1] - uy * d; a[i3 + 2] = orig[i3 + 2] - uz * d; }
          else {                                                  // pour: squeezed up to the top of its part, then let down
            const tx = A.foot[i3] + ux * A.h[i], ty = A.foot[i3 + 1] + uy * A.h[i], tz = A.foot[i3 + 2] + uz * A.h[i];
            const dd = ((tx - orig[i3]) * ux + (ty - orig[i3 + 1]) * uy + (tz - orig[i3 + 2]) * uz) * (1 - e);
            a[i3] = orig[i3] + ux * dd; a[i3 + 1] = orig[i3 + 1] + uy * dd; a[i3 + 2] = orig[i3 + 2] + uz * dd;
          }
        }
        P.needsUpdate = true;
      },
      end: () => { a.set(orig); P.needsUpdate = true; geo.userData.animating = false; delete geo.userData.anim; },
    };
  }
  // board3d's instanced trees and bushes: each grows from its base with a little overshoot, rippling out from the centre
  instJob(im) {
    const n = im.count, orig = im.instanceMatrix.array.slice(), a = im.instanceMatrix.array, delay = new Float32Array(n);
    let dmax = 1e-6;
    for (let i = 0; i < n; i++) { delay[i] = Math.hypot(orig[i * 16 + 12], orig[i * 16 + 13], orig[i * 16 + 14]); dmax = Math.max(dmax, delay[i]); }
    for (let i = 0; i < n; i++) delay[i] = delay[i] / dmax * 0.55 + hash2(i, 3.7) * 0.08;
    return {
      f: (K) => {
        for (let i = 0; i < n; i++) {
          const s = Math.max(1e-4, backOut(clamp01((K - delay[i]) / 0.4))), o16 = i * 16;
          for (const j of [0, 1, 2, 4, 5, 6, 8, 9, 10]) a[o16 + j] = orig[o16 + j] * s;
        }
        im.instanceMatrix.needsUpdate = true;
      },
      end: () => { a.set(orig); im.instanceMatrix.needsUpdate = true; },
    };
  }
  // a separately placed prop (dish, radar, emblem): pops in with an overshoot, later the farther out it is
  popJob(m, kind) {
    const emb = kind === 'emblem', s0 = (emb ? m.userData.s0 : m.scale).clone(), d = emb ? 0.62 : clamp01(m.position.length() / (this.HEX_R * 2)) * 0.45 + 0.1;
    const set = (s) => { if (emb) m.userData.s0.copy(s0).multiplyScalar(s); else m.scale.copy(s0).multiplyScalar(s); };
    set(1e-4);
    return { f: (K) => set(Math.max(1e-4, backOut(clamp01((K - d) / 0.35)))), end: () => set(1) };
  }
  // the Mohole's bore: opens from its centre
  openJob(m) {
    const P = m.geometry.attributes.position, orig = P.array.slice(), a = P.array, n = P.count;
    m.geometry.computeBoundingBox();
    const c = m.geometry.boundingBox.getCenter(new V3());
    return {
      f: (K) => { const e = smooth(0.05, 0.6, K); for (let i = 0; i < n; i++) { const i3 = i * 3; a[i3] = c.x + (orig[i3] - c.x) * e; a[i3 + 1] = c.y + (orig[i3 + 1] - c.y) * e; a[i3 + 2] = c.z + (orig[i3 + 2] - c.z) * e; } P.needsUpdate = true; },
      end: () => { a.set(orig); P.needsUpdate = true; },
    };
  }
  // a temporary object stood on the tile at board (x, z), in the tile's local frame
  temp(g, cell, geoKit, x, z) {
    const grp = new THREE.Group();
    const ctx = { cell, g: grp, H: 0.07 };
    this.emit(geoKit, ctx, { shadow: false });
    g.add(grp);
    return grp;
  }
  // construction cranes: up at the start, down again as the city completes
  cranesJob(g, cell) {
    const K = new Kit();
    this.crane(K, 0.27, -0.2, 0.34, 0.6);
    this.crane(K, -0.3, 0.02, 0.28, 2.4);
    const grp = this.temp(g, cell, K), h = 0.4 * this.kOf(cell), up = cell.up;
    return {
      f: (K) => { const s = K < 0.12 ? smooth(0, 0.12, K) : K < 0.72 ? 1 : 1 - smooth(0.72, 1, K); grp.position.copy(up).multiplyScalar(-h * (1 - s)); },
      end: () => { g.remove(grp); grp.traverse((o) => o.geometry?.dispose()); },
    };
  }
  // the Mohole drill: a spinning string and bit bore down into the shaft
  drillJob(g, cell, x, z) {
    const K = new Kit();
    K.cyl('metal', 0x8a9098, x, 0, z, 0.011, 0.011, 0.5, 12);
    K.add('metal', new THREE.ConeGeometry(0.03, 0.07, 16).rotateX(Math.PI), 0xc8a040, [x, -0.035, z]);
    K.cyl('metal', 0xd09a2a, x, 0.47, z, 0.03, 0.03, 0.03, 16);
    const grp = this.temp(g, cell, K), up = cell.up, k = this.kOf(cell);
    const { p } = this.b.frameAt(cell, x, z, 0, true), base = p.sub(cell.center);
    const inner = grp.children.slice();
    const pivot = new THREE.Group(); grp.add(pivot);
    for (const c of inner) { c.geometry.translate(-base.x, -base.y, -base.z); pivot.add(c); }   // turn about the bore's axis
    pivot.position.copy(base);
    const heat = this.flashSprite(g, cell, x, z, 0xff9040, 0.01);           // the bit's glow at the bottom of the bore (reads from above)
    return {
      f: (K) => {
        heat.material.opacity = 0.75 * smooth(0.15, 0.3, K) * (1 - smooth(0.75, 1, K)) * (0.75 + 0.25 * Math.sin(K * 60));
        heat.scale.setScalar(k * 0.2);
        const y = (0.42 - 1.05 * smooth(0.08, 0.85, K)) * k;
        grp.position.copy(up).multiplyScalar(y);
        pivot.quaternion.setFromAxisAngle(up, K * 40);
        grp.visible = K < 0.95;
      },
      end: () => { g.remove(grp); grp.traverse((o) => o.geometry?.dispose()); g.remove(heat); heat.material.dispose(); },
    };
  }
  // the Nuclear Zone: the test shot's flash (white going yellow: ~0.15 s up, ~0.6 s down) lights the ground,
  // then the scorched ground glows and cools. Reduced motion: a soft, slow glow in place of the flash.
  heatJob(g, cell, x, z) {
    const ground = []; g.traverse((m) => { if (m.isMesh && (m.material === this.mats.ground || m.material === this.mats.nucGround)) ground.push([m, m.material]); });
    const src = ground[0]?.[1] || this.mat('ground'), hot = src.clone(); hot.onBeforeCompile = src.onBeforeCompile; hot.customProgramCacheKey = src.customProgramCacheKey; hot.emissive = new THREE.Color(0xe8420c);   // (same program: nothing compiles)
    for (const [m] of ground) m.material = hot;
    const calm = this.calmMotion(), k = this.kOf(cell);
    const flash = this.flashSprite(g, cell, x, z, 0xfffaf0, 0.1), core = calm ? null : this.flashSprite(g, cell, x, z, 0xffffff, 0.03);
    const cW = new THREE.Color(0xfffaf0), cY = new THREE.Color(0xffc23a), eHot = new THREE.Color(0xe8420c), eFlash = new THREE.Color(0xffa850);
    const [rise, fall, peak] = calm ? [0.35, 0.9, 0.35] : [0.15, 0.6, 0.9];
    return {
      f: (K) => {
        const s = K * 1.3, u = s < rise ? s / rise : clamp01(1 - (s - rise) / fall), f = peak * (s < rise ? u * u * (3 - 2 * u) : u * u);   // (seconds into it)
        hot.emissive.lerpColors(eHot, eFlash, calm ? 0 : f);                                     // the flash lights the ground round zero
        hot.emissiveIntensity = 1.0 * (1 - smooth(0.05, 0.95, K)) + (calm ? 0 : 0.4 * f);
        flash.material.opacity = f; flash.material.color.lerpColors(cW, cY, smooth(rise * 0.6, rise + fall * 0.6, s));
        flash.scale.setScalar(k * (calm ? 0.7 : 0.3 + 0.6 * smooth(0, rise, s)));
        if (core) { core.material.opacity = f; core.scale.setScalar(k * 0.3 * (0.5 + 0.5 * smooth(0, rise, s))); }
      },
      end: () => { for (const [m, mat] of ground) m.material = mat; hot.dispose(); g.remove(flash); flash.material.dispose(); if (core) { g.remove(core); core.material.dispose(); } },
    };
  }
  // the Nuclear Zone's test shot, on a new placement only (animateIn; ~2.6 s, its own tween): a thin shock ring
  // races out over the ground to about the hex edge, a skirt of dust rolls out behind it, rises and settles, and a
  // small mushroom of dust climbs from zero and thins away. All on this tile, in its own group; the sprites share
  // the flash's program and the ring the asteroid shock ring's (impact.js prewarms it), so nothing compiles, and
  // no light (adding one recompiles every material: heatJob lights the ground instead). Reduced motion: none of
  // it (heatJob's soft glow only); Low: the ring only.
  blastFx(g, cell, x, z) {
    if (this.calmMotion()) return;
    const k = this.kOf(cell), up = cell.up, E = cell.east, N = cell.north, low = gfx.low;
    const grp = new THREE.Group(); grp.position.copy(this.b.frameAt(cell, x, z, 0.07, true).p).sub(cell.center); g.add(grp);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 64), new THREE.MeshBasicMaterial({ color: 0xffe2a8, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    ring.quaternion.setFromUnitVectors(new V3(0, 0, 1), up); ring.position.copy(up).multiplyScalar(0.022 * k); ring.renderOrder = 5;
    grp.add(ring);
    const puff = (color, add) => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.flashTex ||= this.b.glowTex('#ffffff'), color, transparent: true, opacity: 0, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: false })); grp.add(sp); return sp; };
    const at = (sp, a, r, h) => sp.position.copy(E).multiplyScalar(Math.cos(a) * r).addScaledVector(N, Math.sin(a) * r).addScaledVector(up, h);
    const nS = gfx.pick(0, 12, 18), skirt = [], stem = [], cap = [];
    for (let i = 0; i < nS; i++) skirt.push([puff(0xd2b494), i / nS * TAU + hash2(i, 1.3) * 0.4, 0.85 + hash2(i, 2.9) * 0.3]);
    if (!low) {
      for (let j = 0; j < 4; j++) stem.push(puff(0xcdbfb2));
      for (let i = 0; i < 7; i++) cap.push([puff(0xcdbfb2), i / 7 * TAU + hash2(i, 5.1) * 0.5, i === 6]);
    }
    const fire = low ? null : puff(0xff9a40, true);                      // the fireball's glow inside the cap, early
    const hotC = new THREE.Color(0xffd49a), smokeC = new THREE.Color(0xcdbfb2), cc = new THREE.Color();
    this.b.tween(2600, (kk) => {
      const s = kk * 2.6, r = 1 - (1 - clamp01(s / 0.6)) ** 3;               // (seconds in; the ring's run out)
      ring.scale.setScalar(k * (0.04 + 0.46 * r));
      ring.material.opacity = 0.9 * smooth(0, 0.04, s) * (1 - r) ** 1.4;
      for (const [sp, a, v] of skirt) {                                       // the dust skirt: rolls out behind the ring, lifts, settles
        const e = 1 - (1 - clamp01(s / 1.4)) ** 2;
        at(sp, a, k * (0.05 + 0.36 * v * e), k * (0.012 + 0.05 * smooth(0.05, 0.5, s) * (1 - 0.7 * smooth(0.7, 2.4, s))));
        sp.scale.setScalar(k * (0.12 + 0.18 * smooth(0, 1.6, s)));
        sp.material.opacity = 0.5 * smooth(0.04, 0.25, s) * (1 - smooth(1.0, 2.6, s));
      }
      const hc = k * 0.34 * (1 - (1 - smooth(0.05, 1.5, s)) ** 2), fade = 1 - smooth(1.1, 2.6, s);   // the plume: climbs, the cap spreads, thins away
      cc.lerpColors(hotC, smokeC, smooth(0.1, 0.8, s));
      stem.forEach((sp, j) => {
        at(sp, 0, 0, hc * (0.15 + 0.22 * j)); sp.scale.setScalar(k * (0.08 + 0.025 * j) * (1 + 0.5 * smooth(0.5, 2.6, s)));
        sp.material.color.copy(cc); sp.material.opacity = 0.8 * smooth(0.05, 0.25, s) * fade * (1 - 0.4 * smooth(0.6, 1.6, s));
      });
      for (const [sp, a, mid] of cap) {
        at(sp, a, mid ? 0 : k * 0.075 * (0.3 + smooth(0.2, 1.8, s)), hc * (mid ? 1.05 : 0.95));
        sp.scale.setScalar(k * (mid ? 0.2 : 0.15) * (0.4 + 0.8 * smooth(0.1, 1.8, s)));
        sp.material.color.copy(cc); sp.material.opacity = 0.85 * smooth(0.08, 0.3, s) * fade;
      }
      if (fire) { at(fire, 0, 0, hc); fire.scale.setScalar(k * 0.3); fire.material.opacity = 0.8 * smooth(0.05, 0.2, s) * (1 - smooth(0.25, 0.9, s)); }
    }, () => { g.remove(grp); ring.geometry.dispose(); grp.traverse((o) => o.material?.dispose()); });
  }
  // prefers-reduced-motion: the placement moments stay gentle
  calmMotion() { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } }
  // Lava Flows: the channels flood with light, the vent spits
  lavaJob(g, cell) {
    const pairs = [];
    g.traverse((m) => { if (m.isMesh && m.material === this.mats.lavaG) { const o = m.material, c = Object.assign(o.clone(), { onBeforeCompile: o.onBeforeCompile, customProgramCacheKey: o.customProgramCacheKey }); pairs.push([m, o, c]); m.material = c; } });   // (same program: the shader's hooks go with the clone)
    const vent = this.flashSprite(g, cell, -0.05, -0.33, 0xffa040, 0.1);
    return {
      f: (K) => {
        const e = smooth(0.05, 0.85, K);
        for (const [, o, c] of pairs) { if (c.emissiveIntensity !== undefined && o.emissiveIntensity !== undefined) c.emissiveIntensity = o.emissiveIntensity * e * (0.85 + 0.15 * Math.sin(K * 40)); if (o.transparent) c.opacity = e; }
        vent.material.opacity = 0.9 * Math.sin(Math.PI * clamp01(K / 0.5)); vent.scale.setScalar(this.kOf(cell) * (0.18 + 0.1 * Math.sin(K * 30)));
      },
      end: () => { for (const [m, o, c] of pairs) { m.material = o; c.dispose(); } g.remove(vent); vent.material.dispose(); },
    };
  }
  flashSprite(g, cell, x, z, color, y) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.flashTex ||= this.b.glowTex('#ffffff'), color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    sp.position.copy(this.b.frameAt(cell, x, z, 0.07 + y * this.kOf(cell), true).p).sub(cell.center);
    sp.renderOrder = 5;
    g.add(sp);
    return sp;
  }
}
