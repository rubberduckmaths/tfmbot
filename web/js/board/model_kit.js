// model_kit.js -- helpers for the board's own 3D models (the classic tiles, Ganymede, the Phobos station, the
// Ecological Zone park): canvas textures, geometry kits, seeded randomness.
import { BLANK_TEX } from './planet.js';
import * as THREE from 'three';
import { mergeGeometries } from '../../vendor/BufferGeometryUtils.js';
import { HEX_R, SUN } from './layout.js';

 BLANK_TEX.needsUpdate = true;

// free the GPU side of a subtree we built (shared/cached materials are marked userData.shared)
export function disposeTree(o) {
  o.traverse((c) => { c.geometry?.dispose(); const ms = Array.isArray(c.material) ? c.material : c.material ? [c.material] : []; for (const m of ms) if (!m.userData.shared) m.dispose(); });
}
export function srand(seed) { let s = (seed * 2654435761 + 1) >>> 0; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

// ---------------------------------------------------------------- station kit
// one part of a merged prop: non-indexed, moved into place, optionally with all
// its uvs pinned to one texel (so plain parts can share a textured material)
export function xform(geo, t = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1], uv = null) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const E = new THREE.Euler(r[0], r[1], r[2], r[3] || 'XYZ');
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...t), new THREE.Quaternion().setFromEuler(E), new THREE.Vector3(...s)));
  if (uv && g.attributes.uv) { const a = g.attributes.uv; for (let i = 0; i < a.count; i++) a.setXY(i, uv[0], uv[1]); }
  return g;
}
// [geometry, colour, translate, euler, scale] parts -> one vertex-coloured geometry
export function kitGeo(parts) {
  const c = new THREE.Color();
  const gs = parts.map(([geo, color, t, r, s]) => {
    const g = xform(geo, t, r, s);
    g.deleteAttribute('uv');
    c.set(color);
    const col = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < col.length; i += 3) { col[i] = c.r; col[i + 1] = c.g; col[i + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  });
  return mergeGeometries(gs);
}
// habitat ring skin: u runs around the ring (16 hull segments), v around the
// tube (outer face at the edges, top face at 1/4, inner at 1/2, bottom at 3/4
// of the canvas height). The emissive twin lights a scatter of windows.
export function stationRingTex(emissive) {
  return canvasTex(1024, 64, (g, w, h) => {
    const r = srand(41);
    g.fillStyle = emissive ? '#000' : '#c3cad3'; g.fillRect(0, 0, w, h);
    const rows = [[0, 3], [61, 3], [11, 3], [18, 3], [30, 4]];      // outer (wraps), top, top, inner
    for (let s = 0; s < 16; s++) {
      const x0 = s * 64;
      if (!emissive) {
        g.fillStyle = `rgba(40,50,64,${0.04 + r() * 0.1})`; g.fillRect(x0 + 3, 0, 61, h);
        g.fillStyle = '#5b636f'; g.fillRect(x0, 0, 3, h);
        g.fillStyle = '#b08a3e'; g.fillRect(x0 + 3, 44, 61, 8);         // gold foil band on the underside
      }
      for (const [y, hh] of rows) for (let x = x0 + 7; x < x0 + 60; x += 5) {
        if (x > x0 + 29 && x < x0 + 36) continue;                        // hatch between window runs
        const lit = r() < 0.62;
        if (emissive) { if (lit) { g.fillStyle = r() < 0.18 ? '#dff0ff' : `hsl(${34 + r() * 14},100%,${58 + r() * 16}%)`; g.fillRect(x, y, 3, hh); } }
        else { g.fillStyle = '#18212c'; g.fillRect(x, y, 3, hh); }
      }
    }
  });
}
export function solarTex() {
  return canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = '#c7ad6c'; g.fillRect(0, 0, w, h);
    const r = srand(9);
    for (let y = 4; y < h - 4; y += 12) for (let x = 4; x < w - 4; x += 12) {
      const l = 20 + r() * 9;
      g.fillStyle = `hsl(224,62%,${l}%)`; g.fillRect(x, y, 11, 11);
      g.fillStyle = `hsla(210,80%,70%,0.18)`; g.fillRect(x, y, 11, 2);
    }
    g.fillStyle = '#20283a'; g.fillRect(w / 2 - 2, 0, 4, h);             // centre boom
  });
}
// blinking navigation lights as screen-facing points: aBlink = (rate, phase, size);
// rate > 0 slow blink, rate < 0 short strobe, rate 0 steady. Additive, never
// smaller than a few pixels so they read at the home view too.
export function navLightMaterial(W, night = 0) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uH: { value: 900 }, uMin: { value: 3 }, uW: { value: W }, uFade: { value: 1 }, uNight: { value: night }, uSun: { value: SUN.clone() } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute vec3 aCol; attribute vec3 aBlink; uniform float uTime; uniform float uH; uniform float uMin; uniform float uW;
      uniform float uFade; uniform float uNight; uniform vec3 uSun;
      varying vec3 vC; varying float vA;
      void main(){
        vec4 mv=modelViewMatrix*vec4(position,1.0); gl_Position=projectionMatrix*mv;
        float ph=fract(uTime*abs(aBlink.x)+aBlink.y);
        float on = aBlink.x>0.0 ? mix(0.25,1.0,step(ph,0.5)) : aBlink.x<0.0 ? (ph<0.05||(ph>0.12&&ph<0.16) ? 1.0 : 0.0) : 1.0;
        // surface lights (uNight=1) glow hardest on the night side of their body
        float dark=1.0-smoothstep(-0.1,0.5,dot(normalize(mat3(modelMatrix)*position),uSun));
        vA=on*uFade*mix(1.0,mix(0.55,1.0,dark),uNight);
        vC=aCol;
        gl_PointSize=max(uMin, aBlink.z*uW*projectionMatrix[1][1]*uH*0.5/-mv.z)*(0.55+0.45*on)*(0.3+0.7*uFade);
      }`,
    fragmentShader: `varying vec3 vC; varying float vA;
      void main(){
        float d=length(gl_PointCoord-0.5)*2.0;
        float core=smoothstep(0.42,0.0,d), halo=smoothstep(1.0,0.1,d);
        float a=(core+halo*halo*0.5)*vA;
        if(a<0.004) discard;
        gl_FragColor=vec4(mix(vC,vec3(1.0),core*0.55)*a,1.0);
      }`,
  });
}
export function navPoints(mat, lights) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(lights.flatMap((l) => l.p), 3));
  g.setAttribute('aCol', new THREE.Float32BufferAttribute(lights.flatMap((l) => { const c = new THREE.Color(l.c); return [c.r, c.g, c.b]; }), 3));
  g.setAttribute('aBlink', new THREE.Float32BufferAttribute(lights.flatMap((l) => [l.rate ?? 0, l.ph ?? 0, l.s ?? 0.03]), 3));
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  return pts;
}

// ---------------------------------------------------------------- canvas textures
export function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
export function hexPath(g, w, h, inset = 0) {
  const cx = w / 2, cy = h / 2, r = h / 2 - inset;
  g.beginPath();
  for (let k = 0; k < 6; k++) { const a = Math.PI / 2 + k * Math.PI / 3; const x = cx + Math.cos(a) * r, y = cy - Math.sin(a) * r; k ? g.lineTo(x, y) : g.moveTo(x, y); }
  g.closePath();
}
// The city's street plan: ONE lattice shared by the ground texture (streets,
// sidewalks, lamps) and the buildings (one per block), in hex-local units
// (column pitch 1). capGeo maps u = 0.5 + x/(sqrt3*HEX_R*0.95),
// v = 0.5 - y/(2*HEX_R*0.95); canvas textures flip v.
export const CITY = { sx: 0.125, sy: 0.1125, street: 0.03, inset: 0.95 };
export function cityGroundTex() {
  return canvasTex(256, 296, (g, w, h) => {
    const r = srand(5);
    const px = (x) => (0.5 + x / (Math.sqrt(3) * HEX_R * CITY.inset)) * w;
    const py = (y) => (0.5 + y / (2 * HEX_R * CITY.inset)) * h;
    g.fillStyle = '#2f343e'; g.fillRect(0, 0, w, h);                       // asphalt
    const bw = CITY.sx - CITY.street, bh = CITY.sy - CITY.street, kerb = 0.008;
    for (let gx = -5; gx <= 5; gx++) for (let gy = -6; gy <= 6; gy++) {
      const x = gx * CITY.sx, y = gy * CITY.sy;
      g.fillStyle = '#6a7180';                                              // sidewalk / block
      g.fillRect(px(x - bw / 2 - kerb), py(y - bh / 2 - kerb), px(x + bw / 2 + kerb) - px(x - bw / 2 - kerb), py(y + bh / 2 + kerb) - py(y - bh / 2 - kerb));
      g.fillStyle = '#555c69';
      g.fillRect(px(x - bw / 2), py(y - bh / 2), px(x + bw / 2) - px(x - bw / 2), py(y + bh / 2) - py(y - bh / 2));
    }
    // lane markings and street lights along the street centres
    g.strokeStyle = 'rgba(255,214,120,0.55)'; g.lineWidth = 1; g.setLineDash([3, 4]);
    for (let gx = -5; gx <= 5; gx++) { const x = px((gx + 0.5) * CITY.sx); g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (let gy = -6; gy <= 6; gy++) { const y = py((gy + 0.5) * CITY.sy); g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    g.setLineDash([]);
    for (let gx = -5; gx <= 5; gx++) for (let gy = -6; gy <= 6; gy++) {
      if (r() < 0.5) continue;
      g.fillStyle = `rgba(255,${225 + r() * 30},${170 + r() * 60},0.85)`;
      g.fillRect(px((gx + 0.5) * CITY.sx) - 1, py(gy * CITY.sy) - 1, 2, 2);
    }
    hexPath(g, w, h, 4); g.lineWidth = 8; g.strokeStyle = 'rgba(18,22,30,0.9)'; g.stroke();
  });
}
// The owner's marker spot (board units, hex-local) -- the same on every tile;
// forests and cities keep a clearing / plaza round it so it is never hidden.
export const MARK = { x: 0.32, y: 0.22 };
export const MARK_CLEAR = 0.105;                       // radius kept free of trees / buildings
// inside the marker clearing, or in the corridor between it and the viewer's edge of the hex
export function inClearing(x, y, pad = 0) {
  const dx = x - MARK.x, dy = y - MARK.y;
  return Math.hypot(dx, dy) < MARK_CLEAR + pad || (dy > 0 && Math.abs(dx) < 0.07 + pad + dy * 0.5);   // the corridor widens toward the edge
}
// owner cube skin: white, so the owner colour stays dominant; a bright rim,
// a bevel line and an embossed hexagon emblem
export function markerTex() {
  return canvasTex(128, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#dcdcdc');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#ffffff'; g.lineWidth = 12; g.strokeRect(6, 6, w - 12, h - 12);
    g.strokeStyle = 'rgba(0,0,0,0.26)'; g.lineWidth = 3; g.strokeRect(14, 14, w - 28, h - 28);
    const hexp = (cx, cy, rr) => { g.beginPath(); for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr; k ? g.lineTo(x, y) : g.moveTo(x, y); } g.closePath(); };
    hexp(w / 2 + 2, h / 2 + 2, 28); g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,0.22)'; g.stroke();
    hexp(w / 2, h / 2, 28); g.lineWidth = 4; g.strokeStyle = 'rgba(255,255,255,0.95)'; g.stroke();
    hexp(w / 2, h / 2, 11); g.fillStyle = 'rgba(0,0,0,0.16)'; g.fill();
  });
}
// ground decals under the marker: a grass clearing with a path out to the
// front edge (forest) or a paved plaza ringed with lawn (city). Canvas covers
// board rect [MARK.x±DEC, MARK.y-DEC .. MARK.y+DEC*1.9], clipped to the hex.
export const DEC = 0.15;
export function clearingTex(kind) {
  return canvasTex(256, 368, (g, w, h) => {
    const x0 = MARK.x - DEC, x1 = MARK.x + DEC, y0 = MARK.y - DEC, y1 = MARK.y + DEC * 1.9;
    const px = (x) => (x - x0) / (x1 - x0) * w, py = (y) => (y - y0) / (y1 - y0) * h, k = w / (x1 - x0);
    g.beginPath();
    for (let i = 0; i < 6; i++) { const a = Math.PI / 2 + i * Math.PI / 3, rr = HEX_R * 0.93; const x = px(Math.cos(a) * rr), y = py(-Math.sin(a) * rr); i ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.closePath(); g.clip();
    const cx = px(MARK.x), cy = py(MARK.y), R0 = MARK_CLEAR * k;
    const r = srand(kind === 'forest' ? 17 : 19);
    if (kind === 'forest') {
      // path to the front edge, then the clearing
      g.strokeStyle = 'rgba(128,98,62,0.95)'; g.lineWidth = 0.045 * k; g.lineCap = 'round';
      g.beginPath(); g.moveTo(cx, cy); g.bezierCurveTo(cx - 0.03 * k, cy + 0.1 * k, cx + 0.03 * k, cy + 0.16 * k, cx - 0.01 * k, h + 10); g.stroke();
      const gr = g.createRadialGradient(cx, cy, 0, cx, cy, R0 * 1.15);
      gr.addColorStop(0, 'rgba(112,150,62,1)'); gr.addColorStop(0.75, 'rgba(92,134,52,0.95)'); gr.addColorStop(1, 'rgba(70,110,42,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, R0 * 1.15, 0, 7); g.fill();
      for (let i = 0; i < 160; i++) { const a = r() * 6.28, d = Math.sqrt(r()) * R0; g.fillStyle = `hsla(${80 + r() * 40},45%,${30 + r() * 22}%,0.8)`; g.fillRect(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 2, 2); }
      for (let i = 0; i < 14; i++) { const a = r() * 6.28, d = (0.4 + r() * 0.6) * R0; g.fillStyle = ['#f4e36b', '#ffffff', '#e98bb8'][i % 3]; g.fillRect(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 2, 2); }
      g.fillStyle = 'rgba(120,96,64,0.9)'; g.beginPath(); g.ellipse(cx, cy, R0 * 0.5, R0 * 0.44, 0, 0, 7); g.fill();     // trodden ground under the marker
    } else {
      g.fillStyle = '#4c7a34'; g.beginPath(); g.arc(cx, cy, R0 * 1.08, 0, 7); g.fill();                                  // lawn ring
      g.fillStyle = '#bdb6a6'; g.beginPath(); g.arc(cx, cy, R0 * 0.82, 0, 7); g.fill();                                  // paving
      g.strokeStyle = 'rgba(90,84,74,0.45)'; g.lineWidth = 1.2;
      for (let i = 1; i <= 4; i++) { g.beginPath(); g.arc(cx, cy, R0 * 0.82 * i / 4.4, 0, 7); g.stroke(); }
      for (let i = 0; i < 16; i++) { const a = i / 16 * 6.28; g.beginPath(); g.moveTo(cx + Math.cos(a) * R0 * 0.2, cy + Math.sin(a) * R0 * 0.2); g.lineTo(cx + Math.cos(a) * R0 * 0.82, cy + Math.sin(a) * R0 * 0.82); g.stroke(); }
      g.fillStyle = '#d8d2c2'; g.beginPath(); g.arc(cx, cy, R0 * 0.36, 0, 7); g.fill();
      for (let i = 0; i < 4; i++) {                                                                                     // paths through the lawn to the streets
        const a = Math.PI / 4 + i * Math.PI / 2;
        g.strokeStyle = '#bdb6a6'; g.lineWidth = 0.02 * k; g.beginPath(); g.moveTo(cx + Math.cos(a) * R0 * 0.7, cy + Math.sin(a) * R0 * 0.7); g.lineTo(cx + Math.cos(a) * R0 * 1.12, cy + Math.sin(a) * R0 * 1.12); g.stroke();
      }
    }
  });
}
// building skins, tiled by world size (repeat wrapping): masonry facade with
// windows, and a blue glass curtain wall; the emissive twins light windows
export function facadeTex(emissive) {
  const t = canvasTex(64, 128, (g, w, h) => {
    const r = srand(8);
    g.fillStyle = emissive ? '#000' : '#c9ced6'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) {
      if (!emissive) { g.fillStyle = 'rgba(60,66,80,0.35)'; g.fillRect(0, y + 14, w, 2); }       // floor slab line
      for (let x = 2; x < w; x += 8) {
        const lit = r() < 0.3;
        if (emissive) { if (lit) { g.fillStyle = r() < 0.2 ? '#dff0ff' : `hsl(${34 + r() * 16},100%,${58 + r() * 18}%)`; g.fillRect(x, y + 4, 5, 8); } }
        else { g.fillStyle = `hsl(${208 + r() * 12},${25 + r() * 20}%,${26 + r() * 16}%)`; g.fillRect(x, y + 4, 5, 8); }
      }
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
export function glassTex(emissive) {
  const t = canvasTex(64, 128, (g, w, h) => {
    const r = srand(12);
    if (emissive) { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); }
    else { const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#5b86b8'); gr.addColorStop(0.5, '#9cc2e8'); gr.addColorStop(1, '#4d76a8'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }
    for (let y = 0; y < h; y += 8) for (let x = 0; x < w; x += 8) {
      if (emissive) { if (r() < 0.16) { g.fillStyle = r() < 0.5 ? '#cfe4ff' : '#ffe2b0'; g.fillRect(x + 1, y + 1, 6, 5); } }
      else { g.fillStyle = `rgba(20,40,70,${0.1 + r() * 0.25})`; g.fillRect(x + 1, y + 1, 6, 6); }
    }
    if (!emissive) { g.fillStyle = 'rgba(210,225,240,0.55)'; for (let x = 0; x < w; x += 8) g.fillRect(x, 0, 1, h); for (let y = 0; y < h; y += 8) g.fillRect(0, y, w, 1); }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
// per-vertex hash in [0,1): same position -> same value (no cracks when displacing)
export function vhash(x, y, z) { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); }
// shade a geometry by height (darker underneath) with a little per-vertex jitter, into a colour attribute
export function shadeByHeight(g, lo, hi, dark = 0.55, jit = 0.12, tint = [1, 1, 1]) {
  const P = g.attributes.position, col = new Float32Array(P.count * 3);
  for (let i = 0; i < P.count; i++) {
    const y = P.getY(i), t = Math.min(1, Math.max(0, (y - lo) / (hi - lo)));
    const k = (dark + (1 - dark) * t) * (1 - jit + 2 * jit * vhash(P.getX(i), y, P.getZ(i)));
    col[i * 3] = k * tint[0]; col[i * 3 + 1] = k * tint[1]; col[i * 3 + 2] = k * tint[2];
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
// displace vertices along their direction from `c` by a hashed amount
export function lumpy(g, amt, c = new THREE.Vector3()) {
  const P = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < P.count; i++) {
    v.fromBufferAttribute(P, i);
    const k = 1 + (vhash(v.x, v.y, v.z) - 0.5) * 2 * amt;
    v.sub(c).multiplyScalar(k).add(c);
    P.setXYZ(i, v.x, v.y, v.z);
  }
  return g;
}

export function groundTex(kind) {
  return canvasTex(256, 296, (g, w, h) => {
    const r = srand(kind === 'forest' ? 3 : 5);
    if (kind === 'forest') {
      g.fillStyle = '#28501f'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 1100; i++) { g.fillStyle = `hsl(${90 + r() * 35},${35 + r() * 30}%,${12 + r() * 20}%)`; g.beginPath(); g.arc(r() * w, r() * h, 2 + r() * 7, 0, 7); g.fill(); }
    } else {
      g.fillStyle = '#5a6170'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#2b303a'; g.lineWidth = 9;
      for (let i = 1; i < 6; i++) { g.beginPath(); g.moveTo(i * w / 6, 0); g.lineTo(i * w / 6 + 10, h); g.stroke(); g.beginPath(); g.moveTo(0, i * h / 6); g.lineTo(w, i * h / 6 - 8); g.stroke(); }
      for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(255,${235 + r() * 20},${200 + r() * 55},${0.25 + r() * 0.45})`; g.fillRect(r() * w, r() * h, 2, 2); }
    }
    hexPath(g, w, h, 4); g.lineWidth = 8; g.strokeStyle = kind === 'forest' ? 'rgba(18,36,12,0.9)' : 'rgba(18,22,30,0.9)'; g.stroke();
  });
}

// ---------------------------------------------------------------- ecological zone
// A wildlife park: a Y of sand paths from a central plaza (the owner's cube)
// splits the hex into three fenced enclosures -- savanna at the back
// (giraffes, elephant, acacias), a wetland with a pond (flamingos, reeds) on
// the left and a flower meadow (zebras, antelope) on the right; entrance gate
// at the front vertex, watchtower and a visitor biodome at the back corners,
// visitors on the paths and a few birds circling the pond.
// Layout in board units (x right, y toward the viewer), shared by the ground
// texture and the 3D props so paths, pond and fences line up.
export const ECO_R = HEX_R * 0.95;                                     // cap circumradius
export const ECO_V = [0, 1, 2, 3, 4, 5].map((k) => { const a = Math.PI / 2 + k * Math.PI / 3; return [Math.cos(a) * ECO_R, -Math.sin(a) * ECO_R]; });
export const ECO_SPOKES = [1, 3, 5];                                  // path to UL, front, UR vertices
export const ECO_PLAZA = 0.1, ECO_PATH = 0.05, ECO_FEAT = 0.73;   // features sit at ECO_FEAT of the way to their vertex
export const ECO_DOME_S = 1.25;
export const ECO_Y = new THREE.Vector3(0, 1, 0), ECO_TURN = new THREE.Quaternion();
export const ECO_POND = { x: -0.235, y: 0.155, rx: 0.135, ry: 0.1 };
export function ecoPondPts(grow = 0, n = 28) {
  const p = ECO_POND, pts = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2, w = 1 + 0.1 * Math.sin(3 * a + 0.7) + 0.06 * Math.cos(5 * a);
    pts.push([p.x + Math.cos(a) * (p.rx * w + grow), p.y + Math.sin(a) * (p.ry * w + grow)]);
  }
  return pts;
}
export function ecoGroundTex() {
  const w = 512, h = 592;
  return canvasTex(w, h, (g) => {
    const r = srand(15);
    const k = h / (2 * ECO_R);
    const X = (x) => w / 2 + x * k, Y = (y) => h / 2 + y * k;
    const poly = (pts) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y)))); g.closePath(); };
    const V = ECO_V, O = [0, 0];
    const sector = (a, b, c) => [O, V[a], V[b], V[c]];
    const zones = [
      { pts: sector(5, 0, 1), base: '#c7ae62', hue: [40, 58], sat: [38, 58], lit: [42, 62] },      // savanna
      { pts: sector(1, 2, 3), base: '#56a444', hue: [100, 140], sat: [40, 62], lit: [30, 46] },      // wetland
      { pts: sector(3, 4, 5), base: '#7db847', hue: [78, 105], sat: [45, 62], lit: [36, 52] },      // meadow
    ];
    for (const z of zones) {
      g.save(); poly(z.pts); g.clip();
      g.fillStyle = z.base; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 900; i++) {
        g.fillStyle = `hsla(${z.hue[0] + r() * (z.hue[1] - z.hue[0])},${z.sat[0] + r() * (z.sat[1] - z.sat[0])}%,${z.lit[0] + r() * (z.lit[1] - z.lit[0])}%,0.55)`;
        g.beginPath(); g.arc(r() * w, r() * h, 2 + r() * 7, 0, 7); g.fill();
      }
      g.restore();
    }
    // savanna: dry grass strokes
    g.save(); poly(zones[0].pts); g.clip();
    g.lineWidth = 1.5;
    for (let i = 0; i < 500; i++) { const x = r() * w, y = r() * h, a = -1.2 - r() * 0.7; g.strokeStyle = `hsla(${38 + r() * 18},${40 + r() * 25}%,${r() < 0.5 ? 30 + r() * 10 : 68 + r() * 12}%,0.6)`; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 7, y + Math.sin(a) * 7); g.stroke(); }
    g.restore();
    // meadow: wildflowers
    g.save(); poly(zones[2].pts); g.clip();
    const fl = ['#fff6d8', '#ffd84a', '#ff8fb8', '#b98cff', '#ffffff'];
    for (let i = 0; i < 420; i++) { g.fillStyle = fl[i % fl.length]; g.beginPath(); g.arc(r() * w, r() * h, 1.2 + r() * 1.6, 0, 7); g.fill(); }
    g.restore();
    // pond: sandy shore, muddy rim, deep water (the water mesh sits on top)
    const pond = (grow, fill) => { poly(ecoPondPts(grow)); g.fillStyle = fill; g.fill(); };
    pond(0.035, '#cdb98a'); pond(0.018, '#8a7a4e'); pond(0.004, '#1d4f6e');
    // paths: dark edge, then sand, from the plaza out along the spokes
    const path = (width, col) => {
      g.strokeStyle = col; g.lineWidth = width * k; g.lineCap = 'round';
      for (const s of ECO_SPOKES) { const f = s === 3 ? 1 : ECO_FEAT; g.beginPath(); g.moveTo(X(0), Y(0)); g.lineTo(X(V[s][0] * f), Y(V[s][1] * f)); g.stroke(); }
      g.fillStyle = col; g.beginPath(); g.arc(X(0), Y(0), (ECO_PLAZA + (width - ECO_PATH) / 2) * k, 0, 7); g.fill();
    };
    path(ECO_PATH + 0.014, '#8c7446');
    path(ECO_PATH, '#dcc592');
    for (let i = 0; i < 260; i++) { const a = r() * 7, d = Math.sqrt(r()) * ECO_PLAZA * k; g.fillStyle = `rgba(120,95,55,${0.15 + r() * 0.25})`; g.fillRect(X(0) + Math.cos(a) * d, Y(0) + Math.sin(a) * d, 2, 2); }
    // plaza paving ring
    g.strokeStyle = 'rgba(150,122,78,0.8)'; g.lineWidth = 3; g.beginPath(); g.arc(X(0), Y(0), ECO_PLAZA * 0.7 * k, 0, 7); g.stroke();
    hexPath(g, w, h, 5); g.lineWidth = 10; g.strokeStyle = 'rgba(52,44,20,0.9)'; g.stroke();
  });
}

// drop the items failing keep() from an array, in place
export function compact(a, keep) {
  let j = 0;
  for (let i = 0; i < a.length; i++) if (keep(a[i])) a[j++] = a[i];
  a.length = j;
  return a;
}
