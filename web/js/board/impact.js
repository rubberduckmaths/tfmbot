// impact.js -- an asteroid strike on the globe: a glowing rock streaks in with
// a tail, flashes on impact, throws out a shock ring, and the crater glows
// hot for a few seconds before fading. Board-agnostic: needs the board's
// scene, a cell ({center, up, east, north}) and its tween(ms, fn, done).
import * as THREE from 'three';

let glowTex = null;
function glow() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d'), grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,240,1)');
  grd.addColorStop(0.18, 'rgba(255,214,140,0.95)');
  grd.addColorStop(0.45, 'rgba(255,120,40,0.45)');
  grd.addColorStop(1, 'rgba(255,60,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}
const additive = (color, opacity = 1) => new THREE.SpriteMaterial({ map: glow(), color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending });

export function asteroidStrike(board, cell, { big = false, slow = 1 } = {}) {
  const scene = board.scene, k = big ? 1.5 : 1;
  const target = cell.center.clone().addScaledVector(cell.up, 0.02);
  // come in steeply from the upper right, as seen from the default view
  const from = target.clone().addScaledVector(cell.up, 7).addScaledVector(cell.east, 4.5).addScaledVector(cell.north, 2.5);
  const group = new THREE.Group();
  scene.add(group);
  const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1 * k, 1), new THREE.MeshStandardMaterial({ color: 0x4a3b30, emissive: 0xff6a1a, emissiveIntensity: 1.6, roughness: 0.9, flatShading: true }));
  const head = new THREE.Sprite(additive(0xffc080));
  head.scale.setScalar(0.55 * k);
  group.add(rock, head);
  const TAIL = 14, tail = [];
  for (let i = 0; i < TAIL; i++) {
    const s = new THREE.Sprite(additive(i < 4 ? 0xffd9a0 : 0xff7a30, 0.9 * (1 - i / TAIL)));
    s.scale.setScalar(0.42 * k * (1 - i / TAIL * 0.7));
    group.add(s);
    tail.push(s);
  }
  const path = [];
  const cleanup = (...objs) => objs.forEach((o) => { o.traverse?.((m) => { m.geometry?.dispose(); if (m.material && m.material.map !== glowTex) m.material.map?.dispose(); m.material?.dispose?.(); }); scene.remove(o); });

  const FALL = 700 * slow;
  board.tween(FALL, (t) => {
    const e = t * t;                                   // accelerating in
    const p = from.clone().lerp(target, e);
    rock.position.copy(p); head.position.copy(p);
    rock.rotation.x += 0.3; rock.rotation.y += 0.2;
    path.unshift(p.clone());
    tail.forEach((s, i) => s.position.copy(path[Math.min(path.length - 1, i)]));
  }, () => {
    cleanup(group);
    boom();
  });

  function boom() {
    const fx = new THREE.Group();
    scene.add(fx);
    const flash = new THREE.Sprite(additive(0xfff1d0));
    flash.position.copy(target.clone().addScaledVector(cell.up, 0.45));
    fx.add(flash);
    const crater = new THREE.Sprite(additive(0xff6420, 0.9));
    crater.position.copy(target.clone().addScaledVector(cell.up, 0.12));
    fx.add(crater);
    // the shock ring lies on the ground
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 64), new THREE.MeshBasicMaterial({ color: 0xff8a3a, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    ring.position.copy(target.clone().addScaledVector(cell.up, 0.03));
    ring.lookAt(target.clone().add(cell.up));
    fx.add(ring);
    // (no real light: adding/removing lights recompiles every material -- a
    // stutter, and a big one for Deimos Down's ten strikes; the additive
    // sprites carry the glow)
    board.tween(3200 * slow, (t) => {
      // flash: pops in 0.1 s, gone by ~0.8 s
      const f = t < 0.03 ? t / 0.03 : Math.max(0, 1 - (t - 0.03) / 0.22);
      flash.scale.setScalar((0.6 + 2.6 * Math.min(1, t / 0.08)) * k);
      flash.material.opacity = f;
      // ring: expands over ~1.2 s and fades
      const r = Math.min(1, t / 0.3);
      ring.scale.setScalar((0.15 + 1.9 * (1 - Math.pow(1 - r, 3))) * k);
      ring.material.opacity = 0.55 * Math.pow(1 - r, 2);
      // crater: hot glow that cools slowly
      crater.scale.setScalar(0.9 * k * (1 - 0.35 * t));
      crater.material.opacity = 0.95 * Math.pow(1 - t, 1.6);
      crater.material.color.setHSL(0.06 - 0.04 * t, 1, 0.55 - 0.2 * t);
    }, () => cleanup(fx));
  }
}

// Compile the strike's shaders up front (once), so the first asteroid of a
// session doesn't stall the frame while WebGL builds its programs.
export function prewarmStrike(board) {
  if (!board?.renderer || board.__strikeWarm) return;
  board.__strikeWarm = true;
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 1), new THREE.MeshStandardMaterial({ color: 0x4a3b30, emissive: 0xff6a1a, emissiveIntensity: 1.6, roughness: 0.9, flatShading: true })));
  g.add(new THREE.Sprite(additive(0xffc080)));
  g.add(new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 64), new THREE.MeshBasicMaterial({ color: 0xff8a3a, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })));
  g.position.set(0, 0, -1e4);                                  // far out of view
  board.scene.add(g);
  try { board.renderer.compile(board.scene, board.camera); } catch { /* best effort */ }
  board.scene.remove(g);
  g.traverse((m) => m.geometry?.dispose());      // (the materials are kept: disposing them would release the programs just compiled)
}
