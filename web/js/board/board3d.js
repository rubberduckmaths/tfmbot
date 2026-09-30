// board3d.js -- the 3D Mars.
//
// Layout: like the physical board, the hex grid FILLS THE PLANET DISC. Every
// board-plane point is projected onto the sphere along the ray from the home
// camera, so from the home view the grid looks exactly like the flat board
// and wraps the globe when you orbit. The planet is the real Mars (Viking colour
// + MOLA heights, baked per map (web/assets/maps/README.md) with each named volcano
// warped onto its hex), graded and baked once into one half-float texture.
//
// Tiles are 3D: dense conifer forests on greenery, lit skylines under a dome
// for cities, animated water for oceans, and the game's tan special-tile face
// with its icon (plus a small prop) for special tiles.
//
// Board3D is split by topic across this folder (mixins): cells.js (the hexes), tile_meshes.js (placing
// tiles), offboard.js (Ganymede, Phobos, Jupiter) and marks.js (highlights, picks, Land Claim flags);
// the tiles' own art is in tiles/. The shared pieces: layout.js, planet.js, model_kit.js.
import * as THREE from 'three';
import { gfx } from './quality.js';
import { MoonFx } from './moons.js';
import { SpaceCards } from './space_cards.js';
import { TileArt } from './tiles/tile_art.js';
import { TileBadges } from './tile_badges.js';
import { GlobeControls } from './globectl.js';
import { BLANK_TEX, WATER_LEVEL, atmosphereMaterial, bakeFields, bakeReal, bakeShadow, bakeTerrain, cloudMaterial, flattenMarsImage, makeStars, nebula, noiseGLSL, planetMaterial, waterMaterial } from './planet.js';
import { D_HOME, EXPOSURE, HEX_R, MAP_KEYS, MAP_LABELS, MAP_TEX_V, R, SPECIAL_ICON, SUN, THETA_MAX, TILE, TILT } from './layout.js';
import { ECO_TURN, ECO_Y, MARK, MARK_CLEAR, canvasTex, compact, disposeTree, inClearing, navLightMaterial, navPoints, srand } from './model_kit.js';
import { mixin } from '../mixin.js';
import { BoardCells } from './cells.js';
import { OffBoardArt } from './offboard.js';
import { BoardTiles } from './tile_meshes.js';
import { BoardMarks } from './marks.js';
export { MAP_KEYS, MAP_LABELS } from './layout.js';

export class Board3D {
  constructor(canvas) {
    this.canvas = canvas;
    const mobile = matchMedia('(pointer: coarse)').matches;
    this.mobile = mobile;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(this.prCap());
    gfx.renderer = this.renderer;                     // quality.js: auto level + ?stats
    this.renderer.toneMapping = THREE.NeutralToneMapping;          // hue-true: ACES pushed Mars' reds toward orange
    this.renderer.toneMappingExposure = 1.1;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.05, 3000);
    this.last = performance.now();
    this.tweens = [];
    this.tiles = new Map();
    this.cells = [];
    this.highlighted = new Set();
    this.hoverSpace = -1;
    this.playerColors = [0x3fb6ff, 0xff6a3d];
    this.texCache = new Map();
    this.animated = [];

    this.scene.add(nebula(), makeStars());
    const sun = new THREE.DirectionalLight(0xfff0dc, 2.6 * EXPOSURE);
    sun.position.copy(SUN).multiplyScalar(40);
    // shadows over the board region only: they make tile heights readable from above
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    sun.castShadow = true;
    sun.shadow.mapSize.setScalar(this.shadowSize());
    const sc = sun.shadow.camera; sc.left = -12; sc.right = 12; sc.top = 12; sc.bottom = -12; sc.near = 10; sc.far = 70;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
    this.sun = sun;
    const fillLight = new THREE.DirectionalLight(0xb8c8ff, 0.55 * EXPOSURE);          // lower-right fill, no shadows
    fillLight.position.set(6, -5, 6.2);
    this.scene.add(sun, sun.target, fillLight, new THREE.HemisphereLight(0xa9bde0, 0x5a3424, 0.85 * EXPOSURE));
    const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex('#fff3d6'), color: 0xffe2b0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    sunSprite.position.copy(SUN).multiplyScalar(420); sunSprite.scale.set(70, 70, 1);
    this.scene.add(sunSprite);

    this.terrainRT = bakeTerrain(this.renderer, null);
    this.pmat = planetMaterial(this.terrainRT.texture);
    this.fieldsRT = bakeFields(this.renderer);
    this.pmat.uniforms.uF.value = this.fieldsRT.texture;
    this.pmat.uniforms.uShadowN.value = this.terrainShadowN();   // terrain_fx.js relief shadows: desktop only (baked per map: bakeShadow)
    this.planet = new THREE.Mesh(new THREE.SphereGeometry(R, ...this.planetSegs()), this.pmat);
    this.scene.add(this.planet);
    this.cmat = cloudMaterial(this.cloudOct());
    this.clouds = new THREE.Mesh(new THREE.SphereGeometry(R * 1.012, 128, 96), this.cmat);
    this.scene.add(this.clouds);
    this.amat = atmosphereMaterial();
    this.scene.add(new THREE.Mesh(new THREE.SphereGeometry(R * 1.09, 96, 64), this.amat));
    this.planet.visible = this.clouds.visible = false;   // until the first map's terrain is baked (setMap -> setTerrain)
    this.terrainReady = Promise.resolve();
    // the moons' states, spin and the small Galilean moons (moons.js)
    this.moonFx = new MoonFx(this, { SUN, noiseGLSL, navLightMaterial, navPoints, srand, disposeTree, EXPOSURE });
    // what the space cards leave in the sky: stations, sails, shuttles (space_cards.js; app.js feeds it the view)
    this.spaceCards = new SpaceCards(this, { SUN, srand, EXPOSURE });
    // the placed tiles' art: special tiles, city archetypes, game-stage looks (board/tiles/)
    this.tileArt = new TileArt(this, { HEX_R, MARK, MARK_CLEAR, TILE, SPECIAL_ICON, srand, inClearing, treeKit: () => this.treeKit() });
    // the city / greenery type emblems over the tiles, in the owner's colour (tile_badges.js)
    this.badges = new TileBadges(this);


    this.board = new THREE.Group();
    this.scene.add(this.board);
    const pu = this.pmat.uniforms;
    this.water = waterMaterial({ uHoleAge: pu.uHoleAge, uHoles: pu.uHoles, uHoleT: pu.uHoleT, uHoleN: pu.uHoleN, uScale: pu.uScale, uHexR: pu.uHexR, uCh: pu.uCh, uChN: pu.uChN });
    // one water surface over the whole board: visible only where the terrain
    // has sunk below it, so neighbouring oceans are one body of water
    const shell = new THREE.SphereGeometry(R + WATER_LEVEL, 320, 110, 0, Math.PI * 2, 0, THETA_MAX * 1.3);
    shell.rotateX(Math.PI / 2);                     // cap around +Z, the board centre
    this.waterShell = new THREE.Mesh(shell, this.water);
    this.waterShell.renderOrder = 4;
    this.scene.add(this.waterShell);

    this.home = new THREE.Vector3(0, -Math.sin(TILT), Math.cos(TILT)).multiplyScalar(D_HOME);
    this.slide = { x: 0, y: 0 };
    this.controls = new GlobeControls(this.camera, canvas, {
      R, home: this.home, dMin: R * 1.12, dMax: D_HOME * 1.2, aFar: 0.36, aNear: THETA_MAX * 1.05,
      onChange: (sl) => { this.slide = sl; this.applyOffset(); },
    });
    this.controls.cancelTween = () => { this.camTween = null; };

    this.ray = new THREE.Raycaster();
    this.ptr = new THREE.Vector2();
    this.bindPointer();
    this.resize();
    // the canvas's own CSS box is the frame for rendering, picking and centring: re-measure
    // whenever it (or the visible viewport: a phone's URL bar, a rotation) changes
    const again = () => { cancelAnimationFrame(this.rsRaf); this.rsRaf = requestAnimationFrame(() => this.resize()); };
    addEventListener('resize', () => this.resize());
    addEventListener('orientationchange', () => { again(); setTimeout(again, 350); });
    window.visualViewport?.addEventListener('resize', again);
    if (window.ResizeObserver) new ResizeObserver(again).observe(canvas);
    this.renderer.setAnimationLoop(() => this.frame());
    this.gfxLow = gfx.low;
    gfx.onChange(() => this.applyQuality());
  }

  // ---------------------------------------------------------------- quality (quality.js)
  // High = the full look; Medium / Low thin the decoration only (never a tile icon,
  // owner marker, label or anything the game shows)
  prCap() { return Math.min(devicePixelRatio, gfx.pick(1.25, 1.5, 2)); }
  shadowSize() { return gfx.pick(1024, 2048, this.mobile ? 2048 : 4096); }
  terrainShadowN() { return this.mobile || gfx.low ? 0 : 8; }
  planetSegs() { return gfx.pick([320, 240], [360, 270], this.mobile ? [360, 270] : [560, 420]); }
  cloudOct() { return this.mobile ? 3 : gfx.pick(3, 4, 5); }
  applyQuality() {
    this.renderer.setPixelRatio(this.prCap()); this.resize();
    const sz = this.shadowSize(), sh = this.sun.shadow;
    if (sh.mapSize.x !== sz) { sh.mapSize.setScalar(sz); sh.map?.dispose(); sh.map = null; }
    this.shadowDirty = true;
    const n = this.terrainShadowN();
    if (this.pmat.uniforms.uShadowN.value !== n || this.shadowRT?.width !== this.shadowBakeSize()) { this.pmat.uniforms.uShadowN.value = n; this.bakeShadow(); }
    const [ws, hs] = this.planetSegs(), pg = this.planet.geometry;
    if (pg.parameters.widthSegments !== ws) { this.planet.geometry = new THREE.SphereGeometry(R, ws, hs); pg.dispose(); }
    if (this.cmat.defines.COCT !== this.cloudOct()) {
      const old = this.cmat, m = cloudMaterial(this.cloudOct());
      for (const k in m.uniforms) m.uniforms[k].value = old.uniforms[k].value;
      this.clouds.material = this.cmat = m; old.dispose();
    }
    // tiles: Low builds forests without undergrowth, no mist (a rebuild in place, never animated)
    if (this.gfxLow !== gfx.low) { this.gfxLow = gfx.low; this.rebuildTiles(); }
  }
  rebuildTiles() {
    for (const [space, t] of this.tiles) {
      if (this.cells[space]?.colony || t.userData.animating) continue;
      const [type, owner] = t.userData.key.split(':').map(Number);
      const n = this.makeTile(space, type, owner);
      n.userData.key = t.userData.key; n.userData.xkey = t.userData.xkey;
      n.position.copy(t.position);
      this.board.remove(t); t.traverse((o) => o.geometry?.dispose());
      this.board.add(n); this.tiles.set(space, n);
    }
    this.shadowDirty = true;
  }
  // Compile every tile's shader programs before they are needed: without this
  // the first city / forest / special tile of a game compiles ~40 programs at
  // the moment it is placed -- a visible hitch, long on phones. Each tile type
  // and city style is built hidden, its materials compiled, and thrown away
  // (the materials are kept, so the programs stay cached). Never one long
  // block: the builds and compiles run a few per frame (parallel compile
  // where the browser has KHR_parallel_shader_compile), so the loading
  // screen keeps moving.
  //   prewarmTiles('now')   during the loading screen (app.js): the game's
  //                         current stage, plus the birds, dust, claim flag,
  //                         pick ring, Space Haven station, and one 1x1 draw
  //                         for the shadow-depth variants -- what the first
  //                         placements need
  //   prewarmTiles('rest')  after load, in idle time: the other stages (a cold
  //                         start's thawed / grown-up looks, and back)
  // onProgress(0..1) for the loading bar.
  async prewarmTiles(phase = 'now', onProgress = null) {
    const land = this.cells.filter((c) => c && !c.colony);
    if (!land.length || (this.prewarmed ||= new Set()).has(phase)) return;          // (programs do not depend on the map: once per page)
    this.prewarmed.add(phase);
    const t0 = performance.now(), art = this.tileArt, r = this.renderer;
    const parallel = r.extensions.has('KHR_parallel_shader_compile');
    const TYPES = [TILE.CITY, TILE.GREENERY, TILE.OCEAN, TILE.CAPITAL, TILE.COMMERCIAL, TILE.LAVA, TILE.MOHOLE, TILE.PRESERVE, TILE.NUCLEAR, TILE.RESTRICTED, TILE.INDUSTRIAL, TILE.ECO, TILE.MINING_RIGHTS, TILE.MINING_AREA];
    const CITIES = ['Domed Crater', 'Cupola City', 'Research Outpost', 'Noctis City', 'Underground City', 'Immigrant City', 'Urbanized Area', 'Open City', 'Lava Tube Settlement', 'Corporate Stronghold', 'Early Settlement'];
    const now = { ...art.st }, cold = { gen: 1, temp: -30, oxy: 0, oceans: 0 }, warm = { gen: 11, temp: 6, oxy: 13, oceans: 8 };
    const same = (a, b) => a.temp === b.temp && a.oxy === b.oxy && a.oceans === b.oceans;
    const stages = phase === 'now' ? [now] : [cold, warm].filter((st) => !same(st, now));
    // the jobs: [stage, type, card name | null, cell]
    const jobs = [];
    for (const st of stages) {
      const free = land.filter((c) => !this.tiles.has(c.i)), used = new Set();
      const take = (ok = () => true) => { const c = free.find((x) => !used.has(x.i) && ok(x)); if (c) used.add(c.i); return c; };
      for (const ty of TYPES) jobs.push([st, ty, null, take()]);
      for (const n of CITIES) if (this.variedTiles || /Domed Crater|Tharsis/.test(n)) jobs.push([st, TILE.CITY, n, take()]);   // (the standard tileset: only these keep their own looks)
      for (const n of ['Mangrove', 'Protected Valley']) jobs.push([st, TILE.GREENERY, n, take()]);   // (TileArt: tidal roots in shallow water; the dam)
      for (const sty of this.variedTiles ? ['metro', 'dome', 'arcology', 'spires'] : ['metro']) jobs.push([st, TILE.CITY, null, take((c) => { const s0 = this.tileSrc; this.tileSrc = {}; const ok = art.cityStyle(c.i) === sty; this.tileSrc = s0; return ok; })]);
    }
    const todo = jobs.filter((j) => j[3]);
    const keep = new Set();
    const wait = phase === 'now' ? () => new Promise((res) => requestAnimationFrame(() => res()))
      : () => new Promise((res) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(() => res(), { timeout: 2000 }) : setTimeout(res, 120)));
    const budget = phase === 'now' ? 10 : 6;              // ms of tile building per slice
    // Compiling a slice: in parallel where the browser can (compileAsync), else linked
    // right here (getUniforms), inside this slice, not in some later frame. And in
    // 'now' (behind the loading screen, globe frames on hold): each slice is drawn once for
    // real -- to the canvas, scissored to one pixel, shadow pass into a tiny map -- because
    // some drivers (ANGLE on Vulkan / Metal, SwiftShader) only finish a program when it is
    // first drawn to the real framebuffer; a compile() alone would leave that to the first
    // frame after the loading screen. 'rest' (in play) only compiles.
    const sh = this.sun.shadow, size = sh.mapSize.x;
    const warmDraw = (grp) => {
      const sm = r.shadowMap;
      if (grp) grp.visible = true;
      sm.needsUpdate = true;
      r.setScissor(0, 0, 1, 1); r.setScissorTest(true);
      try { r.render(this.scene, this.camera); } finally { r.setScissorTest(false); if (grp) grp.visible = false; }
    };
    const compile = async (grp) => {                      // (compile() walks hidden objects too)
      if (parallel) await r.compileAsync(grp, this.camera, this.scene);
      else if (phase === 'now') r.compile(grp, this.camera, this.scene);     // (every material, hidden ones too; the draw below waits for them)
      else for (const m of r.compile(grp, this.camera, this.scene)) r.properties.get(m).currentProgram?.getUniforms();
      if (phase === 'now') warmDraw(grp === this.scene ? null : grp);
    };
    if (phase === 'now') { sh.map?.dispose(); sh.map = null; sh.mapSize.setScalar(64); }   // (the size is not part of any program)
    const dispose = (grp) => { this.board.remove(grp); grp.traverse((o) => { if (o.geometry && !keep.has(o.geometry)) o.geometry.dispose(); }); };
    let done = 0;
    const progs0 = r.info.programs.length;
    try {
      if (phase === 'now') {
        // the scene itself first (the planet's is the biggest shader): until now the globe was hidden
        await wait();
        await compile(this.scene);
      }
      while (done < todo.length) {
        await wait();
        if (!this.cells.length) break;
        const grp = new THREE.Group(); grp.visible = false;
        // build (synchronously: the game never sees the borrowed stage / card names)
        const st0 = { ...art.st }, src0 = this.tileSrc, ts = performance.now();
        try {
          while (done < todo.length && (performance.now() - ts < budget || !grp.children.length)) {
            const [st, ty, name, cell] = todo[done++];
            Object.assign(art.st, st);
            this.tileSrc = name ? { [cell.i]: name } : {};
            grp.add(this.makeTile(cell.i, ty, done % 2));
          }
        } finally { Object.assign(art.st, st0); this.tileSrc = src0; }
        this.board.add(grp);
        const tb = performance.now() - ts;
        await wait();
        const tc = performance.now();
        await compile(grp);
        if (gfx.stats && performance.now() - tc + tb > 150) console.info(`[gfx] prewarm ${phase} slice: build ${tb.toFixed(0)} ms, compile ${(performance.now() - tc).toFixed(0)} ms (${grp.children.length} tiles)`);
        dispose(grp);
        onProgress?.(done / (todo.length + 2));
      }
      if (phase === 'now') {
        // the odds and ends built later in play
        await wait();
        const grp = new THREE.Group(); grp.visible = false;
        grp.add(this.makeClaim(land[0], 0));
        art.prewarmExtras?.(grp);
        grp.add(new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, R], 3)), new THREE.PointsMaterial({ color: 0xd8a070, size: 0.05, transparent: true, opacity: 0.9, depthWrite: false })));
        grp.add(new THREE.Mesh(this.capGeo(land[0], 0.12, 1.05, 2), new THREE.MeshBasicMaterial({ color: 0xfff27a, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide })));
        // the Space Haven's station (stationModules), whose shared kit must survive the clean-up
        const K = this.stationKit(), skin = this.stationSkin;
        keep.add(K.solar).add(K.hull).add(K.ring).add(K.band);
        grp.add(new THREE.Mesh(K.solar, K.solarMat), new THREE.Mesh(K.hull, K.hullMat), new THREE.Mesh(K.band, new THREE.MeshBasicMaterial({ color: 0xffffff })),
          new THREE.Mesh(K.ring, new THREE.MeshStandardMaterial({ map: skin.map, emissiveMap: skin.glow, emissive: 0xffffff, emissiveIntensity: 2.4, metalness: 0.45, roughness: 0.42 })));
        this.board.add(grp);
        await compile(grp);
        dispose(grp);
        onProgress?.(1);
      }
    } catch (e) { console.warn('prewarm tiles', e); }
    if (phase === 'now') { sh.map?.dispose(); sh.map = null; sh.mapSize.setScalar(size); }   // (the full-size map is made on the next frame)
    art.applyStage();
    this.shadowDirty = true;
    if (gfx.stats) console.info(`[gfx] tiles prewarmed (${phase}: ${todo.length} tiles, ${r.info.programs.length - progs0} programs${parallel ? ', parallel compile' : ''}) in ${(performance.now() - t0).toFixed(0)} ms`);
  }
  // the regional relief's cast shadows (terrain_fx.js regShadow): the sun never moves
  // relative to the planet, so the march runs once per map into a texture instead of
  // for every pixel of every frame
  shadowBakeSize() { return this.terrainShadowN() > 0 ? gfx.pick(0, 1024, 2048) : 0; }
  bakeShadow() {
    const u = this.pmat.uniforms, size = this.shadowBakeSize(), rh = this.regTex?.[1];
    this.shadowRT?.dispose(); this.shadowRT = null; u.uSH.value = BLANK_TEX;
    if (!size || !rh || u.uReg.value < 0.5) return;
    this.shadowRT = bakeShadow(this.renderer, rh, size, u.uShadowN.value);
    u.uSH.value = this.shadowRT.texture;
  }

  glowTex(color) {
    return canvasTex(128, 128, (g) => { const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, color); gr.addColorStop(0.2, color + 'aa'); gr.addColorStop(1, 'transparent'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); });
  }
  img(url) {
    if (!this.texCache.has(url)) this.texCache.set(url, new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = url; }));
    return this.texCache.get(url);
  }
  // a canvas texture that paints itself once its images arrive
  lazyTex(key, w, h, draw, urls) {
    if (this.texCache.has(key)) return this.texCache.get(key);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    this.texCache.set(key, t);
    Promise.all(urls.map((u) => this.img(u))).then((ims) => { draw(c.getContext('2d'), w, h, ims); t.needsUpdate = true; });
    return t;
  }

  // insets: the HUD panels' reach into the canvas, in CSS px from the canvas's own edges
  setInsets(ins) { this.insets = ins; this.resize(); }
  // the canvas's CSS size: what the drawing buffer is stretched over (100vh on a phone can be
  // taller than innerHeight while the URL bar shows), so never innerWidth / innerHeight
  viewSize() { const c = this.canvas; return { w: c.clientWidth || innerWidth, h: c.clientHeight || innerHeight }; }
  resize() {
    const { w, h } = this.viewSize();
    if (this.renderer.domElement.width !== Math.floor(w * this.renderer.getPixelRatio()) || this.renderer.domElement.height !== Math.floor(h * this.renderer.getPixelRatio())) this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    const ins = this.insets || { l: 0, r: 0, t: 0, b: 0 };
    // fit the globe into the free area between the HUD panels (at the home distance)
    const fw = Math.max(160, w - ins.l - ins.r), fh = Math.max(160, h - ins.t - ins.b);
    const half = Math.tan(Math.asin(R / D_HOME) * 1.06);
    const tv = Math.max(half * h / fh, half * w / fw / (w / h));
    this.camera.fov = Math.min(85, 2 * Math.atan(tv) * 180 / Math.PI);
    this.applyOffset();
  }
  // keep the globe centred in the free area, plus the controls' pan slide
  applyOffset() {
    const { w, h } = this.viewSize(), ins = this.insets || { l: 0, r: 0, t: 0, b: 0 };
    const fw = Math.max(160, w - ins.l - ins.r), fh = Math.max(160, h - ins.t - ins.b);
    const sl = this.slide || { x: 0, y: 0 };
    this.camera.setViewOffset(w, h, -(ins.l - ins.r) / 2 - sl.x * fw, -(ins.t - ins.b) / 2 - sl.y * fh, w, h);
    this.camera.updateProjectionMatrix();
  }

  // ---------------------------------------------------------------- projection
  // board-plane point (hex units, y down) -> the sphere. Azimuthal
  // equidistant about +Z: distances from the board centre are kept, so edge
  // hexes keep their true shape on the sphere (only ~9% narrower at the rim)
  // instead of being stretched to look flat from one camera.
  project(bx, by, lift = 0) {
    const r = Math.hypot(bx, by), th = r * this.scale;
    const k = r > 1e-9 ? Math.sin(th) / r : this.scale;
    return new THREE.Vector3(bx * k, -by * k, Math.cos(th)).normalize().multiplyScalar(R + lift);
  }

  // The planet under the board: every map = the real Mars region, baked offline
  // (web/assets/maps/<key>/) with its named volcanoes and
  // landmarks warped onto their hexes; an unknown key falls back to the
  // board image (assets/mars_disc.jpg) over procedural terrain. Switching disposes the previous bake.
  setTerrain(key) {
    const real = key && Object.values(MAP_KEYS).includes(key);
    const k = real ? key : 'board-image';
    if (this.terrainKey === k) return this.terrainReady;
    this.terrainKey = k;
    const tok = this.terrainTok = {};
    let ready; this.terrainReady = new Promise((r) => { ready = r; });
    // the globe stays hidden until this map's terrain is baked: never a flash of the
    // previous (or a placeholder) Mars under the new board
    const parts = [this.planet, this.clouds, this.waterShell, this.board];
    for (const o of parts) if (o) o.visible = false;
    const done = () => { for (const o of parts) if (o) o.visible = true; ready(); };
    const u = this.pmat.uniforms;
    const swap = (rt, fields) => {
      u.uT.value = rt.texture; this.terrainRT?.dispose(); this.terrainRT = rt;
      if (fields) { u.uF.value = fields.texture; this.fieldsRT?.dispose(); this.fieldsRT = fields; }
    };
    const clearReg = () => { for (const t of this.regTex || []) t.dispose(); this.regTex = null; u.uReg.value = 0; u.uIce.value = 0; u.uRC.value = BLANK_TEX; u.uRH.value = BLANK_TEX; this.bakeShadow(); };
    if (!real) {
      flattenMarsImage('assets/mars_disc.jpg', 317, 309, 224).then((tex) => {
        if (this.terrainTok !== tok) return;
        clearReg(); u.uCapK.value = 1;
        swap(bakeTerrain(this.renderer, tex), this.fieldsReal ? bakeFields(this.renderer) : null);
        this.fieldsReal = false;
        tex.dispose();
        done();
      }).catch((e) => { console.warn('mars image', e); done(); });
      return this.terrainReady;
    }
    // only this map's textures, and the light set on phones / small screens
    const light = innerWidth * devicePixelRatio < 1400 || this.renderer.capabilities.maxTextureSize < 4096;
    const sfx = light ? '_1k' : '';
    const L = new THREE.TextureLoader(), base = `assets/maps/${k}/`;
    const load = (f, mip) => new Promise((res, rej) => L.load(`${base}${f}?v=${MAP_TEX_V}`, (t) => { t.colorSpace = THREE.NoColorSpace; if (!mip) t.generateMipmaps = false, t.minFilter = THREE.LinearFilter; else t.anisotropy = 4; res(t); }, undefined, rej));
    Promise.all([load(`globe${sfx}.webp`), load('globe_h.webp'), load(`region${sfx}.webp`, true), load(`region_h${sfx}.webp`, true)]).then(([gc, gh, rc, rh]) => {
      if (this.terrainTok !== tok) { for (const t of [gc, gh, rc, rh]) t.dispose(); return; }
      gh.wrapS = THREE.RepeatWrapping; gh.needsUpdate = true;
      clearReg();
      const raw = k === 'tharsis' ? 1 : 0;           // Tharsis' textures are already graded (the board image's look)
      swap(bakeReal(this.renderer, gc, gh, raw), bakeFields(this.renderer, gh));
      u.uRaw.value = raw;
      this.fieldsReal = true;
      gc.dispose(); gh.dispose();
      this.regTex = [rc, rh];
      u.uRC.value = rc; u.uRH.value = rh; u.uReg.value = 1; u.uCapK.value = 0; u.uIce.value = k === 'hellas' ? 0.4 : 0;
      this.bakeShadow();
      done();
    }).catch((e) => { console.warn('map terrain', k, e); done(); });
    return this.terrainReady;
  }

  // free everything on the board group (per-cell geometry etc.) before a rebuild
  clearBoard() {
    this.boardGen = (this.boardGen || 0) + 1;
    if (this.ghost) this.ghost = null;
    this.board.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material?.userData?.own) { o.material.map?.dispose(); o.material.dispose(); }
    });
    this.board.clear();
    this.tiles = new Map();
    this.claimMarks = new Map();
    this.highlighted = new Set();
    this.holeT = new Map(); this.holeBorn = new Map(); this.holeOrder = []; this.holeFilling = new Set();
    const hu = this.pmat.uniforms; hu.uHoleN.value = 0; hu.uChN.value = 0; this.tileArt?.pvFill?.clear();
    this.badges?.clear();
    this.animated = this.animated.filter((m) => !m.parent || m.parent.parent !== this.board);
  }

  setMap(map, mapId) {
    this.map = map;
    const key = map.key || MAP_KEYS[mapId] || 'tharsis';
    this.mapId = mapId ?? +(Object.entries(MAP_KEYS).find(([, v]) => v === key)?.[0] ?? 0);
    const labels = MAP_LABELS[this.mapId];
    this.clearBoard();
    this.moonFx.reset();
    this.spaceCards.reset();
    this.cells = [];
    this.setTerrain(key);
    const land = map.spaces.filter((s) => s.kind !== 2);
    const uv = (s) => [s.x + (s.y % 2 ? 0.5 : 0), s.y * 1.5 * HEX_R];
    const us = land.map((s) => uv(s)[0]), vs = land.map((s) => uv(s)[1]);
    this.u0 = (Math.min(...us) + Math.max(...us)) / 2;
    this.v0 = (Math.min(...vs) + Math.max(...vs)) / 2;
    let rmax = 0;
    for (const s of land) {
      const [u, v] = uv(s);
      for (let k = 0; k < 6; k++) { const a = Math.PI / 2 + k * Math.PI / 3; rmax = Math.max(rmax, Math.hypot(u - this.u0 + Math.cos(a) * HEX_R, v - this.v0 - Math.sin(a) * HEX_R)); }
    }
    this.scale = THETA_MAX / rmax;
    this.pmat.uniforms.uBoard.value = this.project(rmax * 1.02, 0).normalize().z;
    this.pmat.uniforms.uScale.value = this.scale;
    this.pmat.uniforms.uHexR.value = HEX_R * 0.95;
    this.cmat.uniforms.uBoard.value = this.pmat.uniforms.uBoard.value;

    this.cellKeys = new Set();                       // the hex textures this map uses (cellTex)
    let colonyIdx = 0;
    for (const s of map.spaces) {
      let cell;
      if (s.kind === 2) {
        const side = colonyIdx++ === 0 ? -1 : 1;
        // just outside the rim, diagonally up-left / up-right in the home view
        const hf = this.home.clone().normalize(), hr = new THREE.Vector3(1, 0, 0), hu = hf.clone().cross(hr).normalize();
        let center = hf.clone().multiplyScalar(0.3).addScaledVector(hr, side * 0.78).addScaledVector(hu, 0.74).normalize().multiplyScalar(R * 1.3);
        const up = hf.clone().multiplyScalar(1).addScaledVector(hr, side * 0.15).normalize();
        const east = new THREE.Vector3(0, 1, 0).cross(up).normalize();
        const north = up.clone().cross(east);
        let sz = R * this.scale * 0.95;
        // Ganymede Colony: Phobos' mirror image across the board's centre line, at the same depth -- so the
        // two stay symmetric however the view turns. A little larger: it's a big moon
        if (/ganymede/i.test(s.name || '')) sz *= 1.15;
        const c0 = center, s0 = sz;
        cell = { i: s.i, colony: true, center: c0, up, east, north, proj: (dx, dy, lift = 0) => c0.clone().addScaledVector(east, dx * s0).addScaledVector(north, -dy * s0).addScaledVector(up, lift) };
      } else {
        const [u, v] = uv(s);
        const bx = u - this.u0, by = v - this.v0;
        const proj = (dx, dy, lift = 0) => this.project(bx + dx, by + dy, lift);
        const center = proj(0, 0, 0);
        const up = center.clone().normalize();
        const e2 = proj(0.2, 0, 0).sub(center).normalize();
        const north = up.clone().cross(e2).normalize();
        const east = north.clone().cross(up).normalize();
        cell = { i: s.i, colony: false, center, up, east, north, proj, bx, by };
      }
      Object.assign(cell, { kind: s.kind, name: s.kind === 2 || !labels ? s.name : labels[s.i] || '', b: s.b, volc: !!s.volc });
      this.cells[s.i] = cell;
      this.buildCell(cell);
    }
    // the previous maps' hex textures (their space names, bonuses): free them, or every map switch keeps ~10-20 more on the GPU
    for (const [k, tex] of this.texCache) if (k.startsWith('cell:') && !this.cellKeys.has(k)) { tex.dispose(); this.texCache.delete(k); }
    this.shadowDirty = true;
    this.controls.set(0, 0, D_HOME);
  }

  setGlobals(temp, oxy, oceans) {
    this.tileArt.setGlobals(temp, oxy, oceans);
    const target = { o: oceans / 9, l: oxy / 14, h: (temp + 30) / 38 };
    const u = this.pmat.uniforms, from = { o: u.uOcean.value, l: u.uLife.value, h: u.uHeat.value };
    this.tween(1500, (k) => {
      u.uOcean.value = from.o + (target.o - from.o) * k;
      u.uLife.value = from.l + (target.l - from.l) * k;
      u.uHeat.value = from.h + (target.h - from.h) * k;
      this.amat.uniforms.uLife.value = u.uLife.value;
      this.amat.uniforms.uHeat.value = u.uHeat.value;
      this.cmat.uniforms.uLife.value = u.uLife.value;
      this.water.uniforms.uLife.value = u.uLife.value;
    });
  }

  // ---------------------------------------------------------------- picking
  get slots() { return this.cells; }

  lookToward(dir, dist) {
    const c = this.controls, to = c.anglesOf(dir);
    const d1 = THREE.MathUtils.clamp(dist ?? c.dist, c.dMin, c.dMax);
    const lim = c.limit(d1), m = Math.hypot(to.yaw, to.pitch);
    if (m > lim) { to.yaw *= lim / m; to.pitch *= lim / m; }
    const from = { yaw: c.yaw, pitch: c.pitch, dist: c.dist };
    if (Math.abs(from.yaw - to.yaw) + Math.abs(from.pitch - to.pitch) < 0.01 && Math.abs(from.dist - d1) < 0.05) return;
    const tw = { t0: performance.now() };
    this.camTween = tw;
    this.tween(900, (k) => {
      if (this.camTween !== tw) return;                  // the player took over
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      c.yaw = from.yaw + (to.yaw - from.yaw) * e;
      c.pitch = from.pitch + (to.pitch - from.pitch) * e;
      c.dist = from.dist + (d1 - from.dist) * e;
      c.update();
    });
  }
  // The camera is the player's: nothing moves it automatically (the whole
  // board is visible from the home view). A no-op here (board2d.js pans to it).
  ensureVisible(space) { }
  ensureVisibleAuto(space) {
    const p = this.screenOf(space);
    const ins = this.insets || { l: 0, r: 0, t: 0, b: 0 }, rc = this.canvas.getBoundingClientRect();
    const x0 = rc.left + ins.l, x1 = rc.right - ins.r, y0 = rc.top + ins.t, y1 = rc.bottom - ins.b;
    const mx = (x1 - x0) * 0.06, my = (y1 - y0) * 0.06;
    const facing = this.cells[space].colony || this.cells[space].up.dot(this.camera.position.clone().normalize()) > 0.3;
    if (p && facing && p.x > x0 + mx && p.x < x1 - mx && p.y > y0 + my && p.y < y1 - my) return;
    this.lookToward(this.cells[space].colony ? this.home.clone() : this.cells[space].up.clone().lerp(this.home.clone().normalize(), 0.4), this.controls.dist);
  }
  resetView() { this.lookToward(this.home.clone(), D_HOME); }

  bindPointer() {
    const el = this.canvas;
    let down = null;
    el.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
    el.addEventListener('pointerup', (e) => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      const touch = e.pointerType !== 'mouse';
      if (moved > (touch ? 14 : 8)) return;
      let s = this.pick(e);
      // a fingertip covers more than a hex on a phone: snap to the nearest candidate nearby
      if (touch && this.onPick && !this.highlighted.has(s)) { const n = this.nearestCandidate(e.clientX, e.clientY); if (n >= 0) s = n; }
      if (s >= 0 && this.onPick && this.highlighted.has(s)) this.onPick(s);
      else if (s >= 0 && this.onInspect) this.onInspect(s, e);
    });
    el.addEventListener('dblclick', () => this.resetView());
    el.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      const s = this.pick(e);
      if (s !== this.hoverSpace) { this.hoverSpace = s; el.style.cursor = s >= 0 && this.highlighted.has(s) ? 'pointer' : ''; this.showGhost(s); }
      if (this.onHover) this.onHover(s, e);
    });
  }
  // the highlighted candidate whose centre is nearest (x, y) (client px), within a fingertip's
  // reach: ~7 mm, or a little over a hex when zoomed in far enough that hexes are bigger
  nearestCandidate(x, y) {
    const camDir = this.camera.position.clone().normalize();
    let best = -1, bd = Infinity, hexPx = 0;
    for (const s of this.highlighted) {
      const c = this.cells[s];
      if (!c || (!c.colony && c.up.dot(camDir) < 0.15)) continue;          // the far side of the planet
      const p = this.screenOf(s), d = Math.hypot(p.x - x, p.y - y);
      if (d < bd) { bd = d; best = s; if (!c.colony) { const q = this.screenOf(s, c.proj(HEX_R, 0, 0)); hexPx = Math.hypot(q.x - p.x, q.y - p.y); } else hexPx = 0; }
    }
    return bd <= Math.max(28, hexPx * 1.25) ? best : -1;
  }
  // client px -> normalized device coords over the canvas's own box (not the window's)
  toNdc(x, y, out = this.ptr) {
    const rc = this.canvas.getBoundingClientRect();
    return out.set(((x - rc.left) / (rc.width || 1)) * 2 - 1, -((y - rc.top) / (rc.height || 1)) * 2 + 1);
  }
  pick(e) {
    this.toNdc(e.clientX, e.clientY);
    this.ray.setFromCamera(this.ptr, this.camera);
    const hit = this.ray.intersectObjects(this.cells.filter(Boolean).map((c) => c.cap), false)[0];
    if (!hit) return -1;
    const s = hit.object.userData.space;
    if (!this.cells[s].colony) {
      const ph = this.ray.ray.intersectSphere(new THREE.Sphere(new THREE.Vector3(), R * 0.99), new THREE.Vector3());
      if (ph && ph.distanceTo(this.ray.ray.origin) < hit.distance - 0.05) return -1;
    }
    return s;
  }
  screenOf(space, at) {
    const c = this.cells[space];
    if (!c) return null;
    const p = (at || c.center).clone().project(this.camera), rc = this.canvas.getBoundingClientRect();
    return { x: rc.left + (p.x + 1) / 2 * rc.width, y: rc.top + (1 - p.y) / 2 * rc.height };
  }

  // ---------------------------------------------------------------- loop
  tween(ms, fn, done) { this.tweens.push({ t0: performance.now(), ms, fn, done }); }
  frame() {
    const now = performance.now();
    const ms = now - this.last, dt = Math.min(0.1, ms / 1000);
    this.last = now;
    // quality.js: Auto steps the level down while frames stay slow (never up)
    // a hand card being dragged (hand.js bindCardDrag sets dragAt as it moves): no scene
    // renders meanwhile -- the canvas keeps its last frame -- so a slow machine's main thread
    // and GPU keep up with the pointer; the scene resumes on the drop, or after 1.5 s held still
    const dragging = now - (this.dragAt || 0) < 1500;
    if (!dragging && gfx.frame(now, ms)) this.nextAdapt = now + 6000;
    // adaptive resolution: if frames stay slow (and Auto has no lower level left, or
    // a level was chosen), render fewer pixels
    this.dtAvg = (this.dtAvg ?? 0.016) * 0.97 + dt * 0.03;
    if (!document.hidden && now > (this.nextAdapt ??= now + 4000)) {
      this.nextAdapt = now + 3000;
      const pr = this.renderer.getPixelRatio();
      if (this.dtAvg > 0.034 && pr > 1 && (gfx.setting !== 'auto' || gfx.low)) { this.renderer.setPixelRatio(Math.max(1, pr * 0.75)); this.resize(); }
    }
    const prof = gfx.stats ? performance.now() : 0;
    // (a done() may start new tweens: keep those too). In place: no garbage per frame
    if (this.tweens.length) {
      const running = this.tweens; this.tweens = [];
      let j = 0;
      for (const tw of running) { const k = Math.min(1, (now - tw.t0) / tw.ms); tw.fn(k); if (k >= 1) { if (tw.done) tw.done(); } else running[j++] = tw; }
      running.length = j;
      this.tweens = this.tweens.length ? running.concat(this.tweens) : running;
    }
    const t = now / 1000;
    this.pmat.uniforms.uTime.value = t;
    if (!(this.cityCheck > now)) {                    // night-side lights grow with the cities on the board (terrain_fx.js)
      this.cityCheck = now + 1000;
      let nc = 0; for (const tl of this.tiles.values()) if (/^(2|3):/.test(tl.userData.key || '')) nc++;
      const cu = this.pmat.uniforms.uCities, want = Math.min(1, nc / 10);
      if (Math.abs(cu.value - want) > 1e-3) { const from = cu.value; this.tween(4000, (k) => { cu.value = from + (want - from) * k; }); }
    }
    this.water.uniforms.uTime.value = t;
    if (this.holeOrder) {
      const ages = this.water.uniforms.uHoleAge.value, ho = this.holeOrder;
      for (let i = 0; i < ho.length; i++) { const b = this.holeBorn.get(ho[i]); ages[i] = b == null ? 99 : t - b; }
    }
    this.cmat.uniforms.uTime.value = t;
    if (this.moons) for (const m of this.moons) m.rotation.y += dt * m.userData.spin;
    if (this.jupiter) this.jupiter.material.uniforms.uTime.value = t;
    if (this.station) this.station.tick(t);
    if (this.gany) this.gany.tick(t);
    const p1 = gfx.stats ? performance.now() : 0;
    this.moonFx.tick(t, dt);
    this.spaceCards.tick(t, dt);
    const p2 = gfx.stats ? performance.now() : 0;
    this.tileArt.tick(t, dt);
    this.badges.tick(t);
    if (gfx.stats) { const p3 = performance.now(); gfx.cpu('tween', p1 - prof); gfx.cpu('moons', p2 - p1); gfx.cpu('tiles', p3 - p2); }
    const pulse = 0.6 + 0.3 * (0.5 + 0.5 * Math.sin(t * 5));
    for (const s of this.highlighted) { const c = this.cells[s]; if (c) c.hl.material.opacity = s === this.hoverSpace ? 1 : pulse; }
    if (this.ghost) this.ghost.position.copy(this.ghost.userData.bob).addScaledVector(this.ghost.userData.up, 0.06 * Math.sin(t * 3));
    compact(this.animated, (m) => m.parent && m.parent.parent);
    for (const m of this.animated) {
      if (m.userData.blink) m.visible = (t * 1.3 + m.id * 0.37) % 1 < 0.55;
      if (m.userData.wave) {                       // a claim flag rippling in the (thin) wind
        const P = m.geometry.attributes.position, b0 = m.geometry.userData.base;
        for (let i = 0; i < P.count; i++) { const x = b0[i * 3]; P.setZ(i, Math.sin(x * 20 - t * 4 + m.id) * 0.022 * (x / 0.4)); }
        P.needsUpdate = true; m.geometry.computeVertexNormals();
      }
      if (m.userData.circle) m.quaternion.copy(m.userData.q0).multiply(ECO_TURN.setFromAxisAngle(ECO_Y, t * m.userData.circle));
      if (m.userData.pulse) m.material.opacity = 0.1 + 0.08 * (0.5 + 0.5 * Math.sin(t * 2.5 + m.id));
      if (m.userData.puff) { const k = (t * 0.4 + m.id * 0.13) % 1; m.scale.setScalar(m.userData.s0 ||= m.scale.x); m.scale.multiplyScalar(0.6 + k * 1.2); m.material.opacity = 0.16 * (1 - k); }   // nuclear steam: a faint, see-through pulse
    }
    // the tile shadow map: every frame at High; below, only while something is
    // placed / animating, after a board change, and every few frames for the
    // small moving parts (radar dishes, flags)
    const sm = this.renderer.shadowMap;
    this.frameNo = (this.frameNo || 0) + 1;
    if (gfx.high) sm.autoUpdate = true;
    else {
      sm.autoUpdate = false;
      if (this.tweens.length || this.shadowDirty || this.frameNo % gfx.pick(8, 2, 1) === 0) { sm.needsUpdate = true; this.shadowDirty = false; }
    }
    const p4 = gfx.stats ? performance.now() : 0;
    if (this.hold) return;                            // (the loading screen covers the canvas: app.js, while the shaders compile)
    if (dragging) return;                               // (a hand card is being dragged: app/hand.js)
    this.renderer.render(this.scene, this.camera);
    if (gfx.stats) gfx.cpu('render', performance.now() - p4);
  }
}
mixin(Board3D, BoardCells, OffBoardArt, BoardTiles, BoardMarks);
