// tile_badges.js -- a small type emblem on the city / greenery tiles whose art does not say it.
//
// The varied 3D art (card cities, stage looks, valleys...) is unique per tile, which
// can make the tile TYPE hard to read at a glance. The tiles whose look does not
// say it (the varied tileset's early greeneries and odd city archetypes: see
// want()) get the game's own hex icon (assets/tiles/city.png, greenery.png) in
// a thin hex ring of the owner's colour, floating over the tile's upper-left corner.
//
// One draw call for the whole board: an instanced quad, billboarded in the
// vertex shader, one shared atlas (city icon | greenery icon | ring mask).
//  * always readable: no depth test (the tile's own buildings / trees never
//    bury it), drawn just under the placement ghost (renderOrder 9 < 10);
//  * hidden behind the planet's limb by an exact horizon test (the anchor's
//    surface normal against the eye), not by the depth buffer;
//  * screen size follows the hex but is clamped to [minPx, maxPx] CSS px, so it
//    stays legible on a phone at the home view and never dominates when
//    zoomed in; zoomed in close (the art reads by itself then) it fades a little;
//  * pops in after a placement's drop / build-up animation; an undo, a load or
//    a replay jump shows it at once.
// Board3D drives it: sync() from syncTiles, clear() from clearBoard, tick() per frame.
import * as THREE from 'three';

const HEX_R = 1 / Math.sqrt(3);          // (board3d.js) pointy-top hex circumradius, hex units
const CW = 176, CH = 200;                 // atlas cell (a pointy-top hex fits with padding)
const R_RING = 94, R_EDGE = 89, R_ICON = 76;   // hex circumradii in atlas px: dark edge, owner ring, icon
const KIND = { 1: 1, 2: 0 };              // TILE type -> atlas cell: greenery 1, city 0
const OBVIOUS_CITY = new Set(['metro', 'dome', 'crater', 'coruscant']);   // TileArt cityStyle() looks that read as a city by themselves
const AT = { x: -0.3, y: -0.17 };         // anchor, hex units (y down): toward the upper-left corner (the owner cube sits lower-right)
const POP = 0.35;                         // s: pop-in
const DELAY = 0.9;                        // s: after the tile's drop / build-up

function hexPath(g, cx, cy, r) {
  g.beginPath();
  for (let k = 0; k < 6; k++) { const a = Math.PI / 2 + k * Math.PI / 3; g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
  g.closePath();
}

const VS = /* glsl */`
attribute vec3 aPos;
attribute vec3 aCol;
attribute float aKind, aBorn, aFlags, aSize;
uniform float uTime, uMinPx, uMaxPx, uFadePx;
uniform vec2 uVP;
varying vec2 vUv;
varying vec3 vCol;
varying float vA, vKind;
void main() {
  vec4 clip = projectionMatrix * viewMatrix * vec4(aPos, 1.0);
  float px = aSize * projectionMatrix[1][1] * 0.5 * uVP.y / clip.w;   // the hex-sized width on screen, CSS px
  float fade = 1.0 - 0.3 * smoothstep(uFadePx, uFadePx * 1.8, px);    // zoomed in close: the art reads by itself
  px = clamp(px, uMinPx, uMaxPx);
  float k = clamp((uTime - aBorn) / ${POP.toFixed(2)}, 0.0, 1.0), q = k - 1.0;
  float pop = 1.0 + 2.70158 * q * q * q + 1.70158 * q * q;            // ease-out-back
  // behind the limb: the anchor's own horizon (colonies float off the planet: never hidden)
  float hz = aFlags > 0.5 ? 1.0 : smoothstep(0.0, 0.1, dot(normalize(aPos), normalize(cameraPosition - aPos)));
  clip.xy += position.xy * vec2(px, px * 1.1364) * pop * 2.0 / uVP * clip.w;
  gl_Position = clip;
  vUv = uv; vCol = aCol; vKind = aKind;
  vA = fade * hz * step(0.001, k);
}`;
const FS = /* glsl */`
uniform sampler2D uMap;
varying vec2 vUv;
varying vec3 vCol;
varying float vA, vKind;
void main() {
  vec4 ic = texture2D(uMap, vec2((vKind + vUv.x) / 3.0, vUv.y));      // premultiplied
  vec4 m = texture2D(uMap, vec2((2.0 + vUv.x) / 3.0, vUv.y));         // r: owner tint, a: coverage
  vec4 c = vec4(ic.rgb + vCol * m.r * (1.0 - ic.a), ic.a + m.a * (1.0 - ic.a));
  if (c.a * vA < 0.004) discard;
  gl_FragColor = c * vA;
}`;

export class TileBadges {
  constructor(b) {
    this.b = b;
    this.items = new Map();                // space -> { key, type, owner, born }
    this.seenGroups = new WeakMap();       // tile group -> has its own type sign (marked)
    this.pc = [];                          // the owner colours the attributes were written with
    this.cap = 0;
    const g = this.geo = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1);
    g.index = quad.index; g.setAttribute('position', quad.attributes.position); g.setAttribute('uv', quad.attributes.uv);
    g.instanceCount = 0;
    this.grow(96);
    const c = document.createElement('canvas'); c.width = CW * 3; c.height = CH;
    const tex = this.tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.NoColorSpace; tex.premultiplyAlpha = true; tex.anisotropy = 4;
    this.drawMask(c.getContext('2d'));
    Promise.all(['assets/tiles/city.png', 'assets/tiles/greenery.png'].map((u) => b.img(u))).then(([city, green]) => {
      const x = c.getContext('2d'), rw = Math.sqrt(3) * R_ICON, rh = 2 * R_ICON;
      // (greenery.png carries the oxygen bubble to its right: only its hex, the left 413 x 478)
      [[city, 0, city?.width], [green, 1, 413]].forEach(([im, i, sw]) => {
        if (!im) return;
        const x0 = i * CW + CW / 2 - rw / 2, y0 = CH / 2 - rh / 2;
        x.save(); hexPath(x, i * CW + CW / 2, CH / 2, R_ICON + 0.5); x.clip();
        x.drawImage(im, 0, 0, sw, im.height, x0, y0, rw, rh);
        // the bubble's edge still pokes into the hex's upper-right: cover it with the
        // mirrored upper-left (plain green and bevel there, clear of the tree)
        if (i === 1) { x.beginPath(); x.rect(x0 + rw * 0.79, y0, rw * 0.21, rh * 0.42); x.clip(); x.translate(x0 * 2 + rw, 0); x.scale(-1, 1); x.drawImage(im, 0, 0, sw, im.height, x0, y0, rw, rh); }
        x.restore();
      });
      tex.needsUpdate = true;
    });
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VS, fragmentShader: FS,
      uniforms: { uMap: { value: tex }, uTime: { value: 0 }, uVP: { value: new THREE.Vector2(1, 1) }, uMinPx: { value: 16 }, uMaxPx: { value: 38 }, uFadePx: { value: 90 } },
      transparent: true, premultipliedAlpha: true, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      depthTest: false, depthWrite: false, toneMapped: false,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 9; this.mesh.visible = false;
    b.scene.add(this.mesh);                // (not on b.board: clearBoard disposes its children's geometry)
    this.vp = new THREE.Vector2();
  }

  // the owner ring: a dark outer edge, the tint (r) inside it; the icon is drawn over the centre
  drawMask(x) {
    const cx = 2 * CW + CW / 2, cy = CH / 2;
    hexPath(x, cx, cy, R_RING); x.fillStyle = 'rgba(0,0,0,0.85)'; x.fill();
    hexPath(x, cx, cy, R_EDGE); x.fillStyle = '#fff'; x.fill();
  }

  grow(n) {
    this.cap = n;
    const g = this.geo, A = (k, s) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(n * s), s); a.setUsage(THREE.DynamicDrawUsage); g.setAttribute(k, a); };
    A('aPos', 3); A('aCol', 3); A('aKind', 1); A('aBorn', 1); A('aFlags', 1); A('aSize', 1);
  }

  // Which tiles get one: only those whose look does not say what they are. The standard
  // tileset (board.variedTiles off, the default) has none -- every greenery is the full
  // forest, every city the classic skyline (or Domed Crater's dome / Tharsis Republic's
  // capital city). With the varied tileset (board.variedTiles):
  //   greenery  the pioneer / shrubland looks (TileArt fstage < 2), Protected Valley
  //             included; the full forest and Mangrove (a forest) read by themselves
  //   city      the card / archetype looks (TileArt cityStyle()) but not the classic
  //             skyline ('metro'), the domes ('dome', 'crater') or Tharsis ('coruscant'),
  //             nor one whose art already carries a city sign (marked)
  //   never     the Capital (a skyline), the off-Mars cities (their space's label names them)
  want(space, type) {
    const b = this.b, art = b.tileArt, cell = b.cells[space];
    if (!b.variedTiles || !cell || cell.colony || !art) return false;
    if (type === 1) return art.fstage < 2 && !/mangrove/i.test(b.tileSrc?.[space] || '') && !this.marked(space);
    if (type === 2) return !OBVIOUS_CITY.has(art.cityStyle(space)) && !this.marked(space);
    return false;
  }
  // does the tile's own art already carry the type's sign? (TileArt cityEmblem(): a holo
  // city sign over Research Outpost, Underground City, Lava Tube Settlement, the early
  // settlements...) -- then no second one. Per tile group: a rebuilt tile is looked at again
  marked(space) {
    const g = this.b.tiles.get(space), M = this.b.tileArt.emblemMats;
    if (!g) return false;
    let v = this.seenGroups.get(g);
    if (v === undefined) {
      const signs = M ? [M.city, M.greenery].filter(Boolean) : [];
      v = false;
      if (signs.length) g.traverse((o) => { if (o.isSprite && signs.includes(o.material)) v = true; });
      this.seenGroups.set(g, v);
    }
    return v;
  }

  // tiles: [[space, type, owner], ...] as Board3D.syncTiles gets them. A new badge: after the
  // tile's drop / build-up when animated, at once on a load / undo / replay jump
  sync(tiles, animate) {
    this.src = tiles;
    this.update(animate ? 'delay' : 'now');
  }
  // the setting, the stage or a city's card changed: badges that come or go pop (tick polls this too)
  refresh() { this.update('pop'); }
  update(how) {
    const now = performance.now() / 1000, seen = new Set();
    let dirty = false;
    for (const [space, type, owner] of this.src || []) {
      if (!this.want(space, type)) continue;
      seen.add(space);
      const key = `${KIND[type]}:${owner}`, cur = this.items.get(space);
      if (cur && cur.key === key) continue;
      this.items.set(space, { key, type, owner, born: how === 'delay' ? now + DELAY : how === 'pop' ? now : -99 });
      dirty = true;
    }
    for (const sp of [...this.items.keys()]) if (!seen.has(sp)) { this.items.delete(sp); dirty = true; }
    if (dirty) this.write();
  }
  clear() { this.src = null; this.items.clear(); this.write(); }

  write() {
    const n = this.items.size, b = this.b;
    if (n > this.cap) this.grow(Math.ceil(n * 1.5));
    const at = this.geo.attributes, pc = this.pc = [...b.playerColors];
    let i = 0;
    for (const [space, it] of this.items) {
      const cell = b.cells[space];
      const W = cell.proj(0, HEX_R, 0).distanceTo(cell.proj(0, -HEX_R, 0)) / 2;   // this hex's circumradius, world units
      const p = cell.proj(AT.x, AT.y, cell.colony ? 0.02 * W : 0.12);
      at.aPos.setXYZ(i, p.x, p.y, p.z);
      const c = pc[it.owner] ?? 0xffffff;
      at.aCol.setXYZ(i, (c >> 16 & 255) / 255, (c >> 8 & 255) / 255, (c & 255) / 255);
      at.aKind.setX(i, KIND[it.type]); at.aBorn.setX(i, it.born); at.aFlags.setX(i, cell.colony ? 1 : 0);
      at.aSize.setX(i, W * 0.62);
      i++;
    }
    for (const k in at) if (k[0] === 'a') at[k].needsUpdate = true;
    this.geo.instanceCount = n;
  }

  tick(t) {
    const u = this.mat.uniforms, b = this.b;
    u.uTime.value = t;
    b.renderer.getSize(this.vp); u.uVP.value.copy(this.vp);
    u.uMinPx.value = b.mobile ? 15 : 18;
    // app.js sets the owner colours on a game's first view (a plain property): follow them
    const pc = b.playerColors;
    if (this.items.size && (pc.length !== this.pc.length || pc.some((c, i) => c !== this.pc[i]))) this.write();
    if (!(this.next > t)) { this.next = t + 0.5; this.update('pop'); }   // (the stage / the setting / tileSrc moved without a sync)
    this.mesh.visible = this.items.size > 0 && b.board.visible;
  }
}
