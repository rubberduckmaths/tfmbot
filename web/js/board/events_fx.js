// events_fx.js -- small moments that make plays feel alive. All subtle, all
// pooled and compiled once at start (prewarm), no lights, and the camera is
// never touched:
//
//  * launch: a card with a space tag (not an asteroid/comet strike, which has
//    its own) sends a small rocket up from one of that player's cities -- or
//    from just off the board if they have none -- in a gravity turn out to
//    orbit: pad flash, exhaust, a drifting smoke puff;
//  * arc: a card that raises energy production (or has a power tag) flickers
//    a few blue-white arcs over one of that player's cities;
//  * terraforming moments: 0 °C, oxygen maxed, the last ocean -- a soft
//    atmospheric shimmer sweeps across the globe (amber / green / blue);
//  * the finale: when all three globals are maxed, a slow golden glow round
//    the limb with fine sparkles rising off the planet.
//
// app/anim.js animateDiff() calls onDiff(prevView, view, { hitCards, db }),
// and app.js calls prewarm() once the board exists.
import * as THREE from 'three';

const TAG_SPACE = 1, TAG_POWER = 2, PROD_ENERGY = 4;
const LAUNCHES = 3, ARCS = 2, SPARKS = 260;

let _tex = null;
function glowTex() {
  if (_tex) return _tex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.2, 'rgba(255,255,255,0.75)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.18)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return (_tex = new THREE.CanvasTexture(c));
}
let _smoke = null;
function smokeTex() {
  if (_smoke) return _smoke;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  for (let i = 0; i < 9; i++) {                                  // a lumpy puff
    const x = 32 + (Math.sin(i * 2.4) * 10), y = 32 + Math.cos(i * 1.7) * 9, r = 12 + (i % 3) * 4;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  }
  return (_smoke = new THREE.CanvasTexture(c));
}
const add = (color, opacity = 0) => new THREE.SpriteMaterial({ map: glowTex(), color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending });

export class EventsFx {
  constructor(board) {
    this.b = board;
    this.R = board.planet.geometry.parameters.radius;
    this.root = new THREE.Group();
    board.scene.add(this.root);
    this.launches = Array.from({ length: LAUNCHES }, () => this.makeLaunch());
    this.arcs = Array.from({ length: ARCS }, () => this.makeArc());
    this.makeShell();
    this.makeSparks();
  }

  // ---------------------------------------------------------------- warm-up
  // draw every pooled object once (far out of sight is not needed: they are
  // all at zero opacity), so no program is ever built mid-game
  prewarm() {
    if (this.warmed) return;
    this.warmed = true;
    const all = [...this.launches.map((l) => l.g), ...this.arcs.map((a) => a.g), this.shell, this.sparks];
    all.forEach((o) => { o.visible = true; });
    try { this.b.renderer.compile(this.b.scene, this.b.camera); } catch { /* best effort */ }
    all.forEach((o) => { o.visible = false; });
  }

  // ---------------------------------------------------------------- deciding what happens
  onDiff(a, b, { hitCards = [], db, board = this.b } = {}) {
    if (!a || !b || b.stage !== 2 || document.hidden) return;
    const strikes = new Set(hitCards);
    let launches = 0;
    for (const pb of b.players) {
      const pa = a.players[pb.id];
      const fresh = [...pb.played.filter((c) => !pa.played.includes(c)), ...pb.events.filter((c) => !pa.events.includes(c))].filter((c) => c !== pb.corp);
      const cards = [...new Set(fresh)].map((c) => db.get(c)).filter(Boolean);
      const space = cards.filter((cd) => (cd.tags || []).includes(TAG_SPACE) && !strikes.has(cd.id) && !board.spaceCards?.ownsLaunch(cd.name));   // (those launch their own: space_cards.js)
      for (let i = 0; i < Math.min(space.length, 2); i++) { const cell = this.cityOf(b, pb.id, true); setTimeout(() => this.launch(cell), 250 + launches++ * 700); }
      const power = cards.some((cd) => (cd.tags || []).includes(TAG_POWER)) || (pb.prod?.[PROD_ENERGY] > pa.prod?.[PROD_ENERGY] && cards.length > 0);
      if (power) { const cell = this.cityOf(b, pb.id, false); if (cell) setTimeout(() => this.arc(cell), 400); }
    }
    // the planet's own moments
    const maxed = (x) => x.temp >= 8 && x.oxy >= 14 && x.oceans >= 9;
    if (maxed(b) && !maxed(a)) setTimeout(() => this.finale(), 600);
    else {
      const m = [];
      if (a.temp < 0 && b.temp >= 0) m.push('temp');
      if (a.oxy < 14 && b.oxy >= 14) m.push('oxy');
      if (a.oceans < 9 && b.oceans >= 9) m.push('ocean');
      m.forEach((k, i) => setTimeout(() => this.pulse(k), 700 + i * 2600));
    }
  }
  // one of the player's cities on Mars (else, for a launch, a spot just off the board)
  cityOf(v, pid, offBoard) {
    const cells = this.b.cells;
    const mine = (v.tiles || []).filter(([s, t, o]) => o === pid && (t === 2 || t === 3) && cells[s] && !cells[s].colony);
    if (mine.length) return cells[mine[Math.floor(Math.random() * mine.length)][0]];
    if (!offBoard) {
      const any = (v.tiles || []).filter(([s, t, o]) => o === pid && t !== 0 && cells[s] && !cells[s].colony);
      return any.length ? cells[any[Math.floor(Math.random() * any.length)][0]] : null;
    }
    // just outside the board's rim, beside one of its edge hexes
    const land = cells.filter((c) => c && !c.colony);
    const rim = land.slice().sort((p, q) => q.center.clone().normalize().angleTo(this.b.home) - p.center.clone().normalize().angleTo(this.b.home)).slice(0, 10);
    const c = rim[Math.floor(Math.random() * rim.length)];
    if (!c) return null;
    const out = c.center.clone().sub(this.b.home.clone().setLength(c.center.dot(this.b.home.clone().normalize()))).normalize();
    const p = c.center.clone().addScaledVector(out, 2.2).setLength(this.R);
    const up = p.clone().normalize(), east = new THREE.Vector3(0, 1, 0).cross(up).normalize();
    return { center: p, up, east, north: up.clone().cross(east) };
  }

  // ---------------------------------------------------------------- launch
  makeLaunch() {
    const g = new THREE.Group(); g.visible = false;
    const head = new THREE.Sprite(add(0xfff4e0));
    const pad = new THREE.Sprite(add(0xffc070));
    const smoke = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex(), color: 0xc8c0b8, transparent: true, opacity: 0, depthWrite: false }));
    const tail = Array.from({ length: 10 }, (_, i) => new THREE.Sprite(add(i < 3 ? 0xffe0a0 : 0xff8a40)));
    g.add(smoke, pad, head, ...tail);
    this.root.add(g);
    return { g, head, pad, smoke, tail, busy: false };
  }
  launch(cell) {
    if (!cell) return;
    const L = this.launches.find((l) => !l.busy);
    if (!L) return;
    L.busy = true; L.g.visible = true;
    const up = cell.up.clone(), base = cell.center.clone().addScaledVector(up, 0.25);
    // turn toward the nearer limb (away from the board's centre), so the climb reads on screen
    const hf = this.b.home.clone().normalize();
    let out = up.clone().sub(hf.clone().multiplyScalar(up.dot(hf)));
    if (out.lengthSq() < 1e-4) out = cell.east.clone();
    out.addScaledVector(up, -out.dot(up)).normalize();
    const curve = new THREE.CubicBezierCurve3(base, base.clone().addScaledVector(up, 1.6), base.clone().addScaledVector(up, 3.2).addScaledVector(out, 1.2), base.clone().addScaledVector(up, 4.6).addScaledVector(out, 5.5));
    const trail = [], p = new THREE.Vector3();
    L.smoke.position.copy(base).addScaledVector(up, 0.25);
    L.pad.position.copy(base).addScaledVector(up, 0.1);
    this.b.tween(3000, (k) => {
      // lift-off slow, then accelerating; gone as it reaches orbit
      const e = Math.min(1, Math.pow(Math.max(0, k - 0.06) / 0.94, 1.7));
      curve.getPoint(e, p);
      trail.unshift(p.clone()); if (trail.length > 24) trail.pop();
      const fade = Math.min(1, k / 0.05) * (1 - Math.max(0, (k - 0.72) / 0.28));
      L.head.position.copy(p); L.head.scale.setScalar(0.55); L.head.material.opacity = 0.95 * fade;
      L.tail.forEach((s, i) => {
        s.position.copy(trail[Math.min(trail.length - 1, i * 2)]);
        s.scale.setScalar(0.42 * (1 - i / 12));
        s.material.opacity = 0.7 * fade * (1 - i / 10) * (0.8 + 0.2 * Math.random());
      });
      const f = Math.max(0, 1 - k / 0.25);
      L.pad.scale.setScalar(0.9 + 0.8 * (1 - f)); L.pad.material.opacity = 0.8 * f * (0.85 + 0.15 * Math.random());
      L.smoke.scale.setScalar(0.6 + 1.9 * Math.sqrt(k)); L.smoke.material.opacity = 0.32 * Math.min(1, k / 0.08) * Math.pow(1 - k, 1.4);
      L.smoke.position.addScaledVector(up, 0.005);
    }, () => { L.g.visible = false; L.busy = false; });
  }

  // ---------------------------------------------------------------- power arc
  makeArc() {
    const g = new THREE.Group(); g.visible = false;
    const N = 3, P = 7, S = N * (P - 1);                           // bolts, points per bolt, segments
    // each segment a camera-facing ribbon (WebGL lines are 1px): 4 verts, aU across -1..1
    const geo = new THREE.BufferGeometry(), idx = [];
    for (let i = 0; i < S; i++) { const o = i * 4; idx.push(o, o + 1, o + 2, o + 2, o + 1, o + 3); }
    geo.setIndex(idx);
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(S * 4 * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aU', new THREE.BufferAttribute(new Float32Array(Array.from({ length: S * 4 }, (_, i) => (i % 2 ? 1 : -1))), 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uA: { value: 0 } },
      transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: 'attribute float aU; varying float vU; void main(){ vU=aU; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: 'uniform float uA; varying float vU; void main(){ float c=1.0-abs(vU); float a=(pow(c,6.0)*1.2+c*c*0.35)*uA; gl_FragColor=vec4(mix(vec3(0.55,0.75,1.0),vec3(1.0),pow(c,6.0))*a,1.0); }',
    });
    const bolts = new THREE.Mesh(geo, mat);
    bolts.frustumCulled = false;
    bolts.renderOrder = 6;                                           // a brief flash: drawn over the city's glass and towers
    const glow = new THREE.Sprite(add(0x9fd0ff));
    glow.material.depthTest = false;                                 // a flash of light: over the city's glass and towers
    glow.renderOrder = 6;
    g.add(glow, bolts);
    this.root.add(g);
    return { g, bolts, mat, glow, N, P, busy: false };
  }
  arc(cell) {
    const A = this.arcs.find((x) => !x.busy);
    if (!A || !cell) return;
    A.busy = true; A.g.visible = true;
    // from a point over the city down to the ground round it (above any dome or tower)
    const up = cell.up, c0 = cell.center.clone().addScaledVector(up, 0.95), pos = A.bolts.geometry.attributes.position;
    A.glow.position.copy(c0);
    const cam = this.b.camera.position, d = new THREE.Vector3(), side = new THREE.Vector3(), v = new THREE.Vector3();
    const W = 0.1;
    let last = -1;
    const bolt = () => {
      let j = 0;
      for (let b = 0; b < A.N; b++) {
        const a = (b / A.N + Math.random() * 0.25) * Math.PI * 2, r = 0.85 + Math.random() * 0.2;   // spread round, landing past any dome
        const end = cell.center.clone().addScaledVector(cell.east, Math.cos(a) * r).addScaledVector(cell.north, Math.sin(a) * r).addScaledVector(up, 0.1);
        let prev = c0.clone();
        for (let i = 1; i < A.P; i++) {
          const k = i / (A.P - 1), q = c0.clone().lerp(end, k);
          if (i < A.P - 1) q.addScaledVector(cell.east, (Math.random() - 0.5) * 0.3).addScaledVector(cell.north, (Math.random() - 0.5) * 0.3).addScaledVector(up, (Math.random() - 0.5) * 0.2);
          d.subVectors(q, prev); v.subVectors(cam, prev);
          side.crossVectors(d, v).normalize().multiplyScalar(W * (1 - 0.5 * k));
          pos.setXYZ(j++, prev.x - side.x, prev.y - side.y, prev.z - side.z); pos.setXYZ(j++, prev.x + side.x, prev.y + side.y, prev.z + side.z);
          pos.setXYZ(j++, q.x - side.x, q.y - side.y, q.z - side.z); pos.setXYZ(j++, q.x + side.x, q.y + side.y, q.z + side.z);
          prev = q;
        }
      }
      pos.needsUpdate = true;
    };
    this.b.tween(1100, (k) => {
      const step = Math.floor(k * 16);
      if (step !== last) { last = step; bolt(); }
      // crackles in bursts, dies away
      const on = (step * 7) % 5 === 3 ? 0.15 : 1, env = Math.min(1, k / 0.05) * Math.pow(1 - k, 1.3);
      A.mat.uniforms.uA.value = on * env;
      A.glow.scale.setScalar(2.2 + 0.6 * on); A.glow.material.opacity = 0.85 * env * (0.4 + 0.6 * on);
    }, () => { A.g.visible = false; A.busy = false; });
  }

  // ---------------------------------------------------------------- planet-wide moments
  makeShell() {
    const mat = this.shellMat = new THREE.ShaderMaterial({
      uniforms: { uT: { value: 0 }, uA: { value: 0 }, uCol: { value: new THREE.Color() }, uDir: { value: new THREE.Vector3(1, 0, 0) }, uRim: { value: 0.5 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: 'varying vec3 vN; varying vec3 vW; varying vec3 vO; void main(){ vO=normalize(position); vN=normalize(mat3(modelMatrix)*normal); vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }',
      fragmentShader: `uniform float uT; uniform float uA; uniform vec3 uCol; uniform vec3 uDir; uniform float uRim; varying vec3 vN; varying vec3 vW; varying vec3 vO;
        void main(){
          vec3 N=normalize(vN), V=normalize(cameraPosition-vW);
          float rim=pow(1.0-max(dot(N,V),0.0),2.4);
          float s=dot(vO,uDir), front=mix(-1.35,1.35,uT);
          float band=exp(-pow((s-front)*7.0,2.0));
          float wake=smoothstep(front+0.05,front-0.9,s)*smoothstep(-1.4,front-0.2,s);
          float shim=0.7+0.3*sin(vO.x*47.0+vO.y*39.0-vO.z*43.0+uT*25.0);
          float a=(rim*uRim*(0.6+0.8*band)+band*0.11*shim+wake*0.025)*uA;
          gl_FragColor=vec4(uCol*a,1.0);
        }`,
    });
    this.shell = new THREE.Mesh(new THREE.SphereGeometry(this.R * 1.015, 96, 64), mat);   // (a sphere: smooth normals)
    this.shell.visible = false;
    this.shell.renderOrder = 4;
    this.root.add(this.shell);
  }
  // the sweep runs across the face we see, from the sun's side
  sweepDir(jitter = 0) {
    const f = this.b.camera.position.clone().normalize(), s = new THREE.Vector3(-0.62, 0.52, 0.58).normalize();
    const d = s.addScaledVector(f, -s.dot(f)).normalize().negate();
    return d.applyAxisAngle(f, jitter);
  }
  pulse(kind) {
    const col = { temp: 0xffa04a, oxy: 0x5fd39c, ocean: 0x5aa8ff }[kind] || 0xffffff;
    const u = this.shellMat.uniforms, tok = this.shellTok = {};
    u.uCol.value.set(col); u.uDir.value.copy(this.sweepDir()); u.uRim.value = 0.55;
    this.shell.visible = true;
    this.b.tween(3400, (k) => {
      if (this.shellTok !== tok) return;
      u.uT.value = k;
      u.uA.value = Math.min(1, k / 0.12) * Math.pow(1 - k, 0.8) * 0.85;
    }, () => { if (this.shellTok === tok) this.shell.visible = false; });
  }

  // ---------------------------------------------------------------- the finale
  makeSparks() {
    const n = SPARKS, pos = new Float32Array(n * 3), dir = new Float32Array(n * 3), ph = new Float32Array(n);
    const v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      v.randomDirection();
      dir.set([v.x, v.y, v.z], i * 3);
      pos.set([v.x * this.R, v.y * this.R, v.z * this.R], i * 3);
      ph[i] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aDir', new THREE.BufferAttribute(dir, 3));
    g.setAttribute('aPh', new THREE.BufferAttribute(ph, 1));
    this.sparkMat = new THREE.ShaderMaterial({
      uniforms: { uT: { value: 0 }, uA: { value: 0 }, uR: { value: this.R }, uPr: { value: 1 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `attribute vec3 aDir; attribute float aPh; uniform float uT; uniform float uA; uniform float uR; uniform float uPr; varying float vA;
        void main(){
          float k=fract(uT*1.6+aPh);                                   // each spark rises, fades, and rises again
          vec3 p=aDir*(uR*(1.02+0.16*k));
          vec4 mv=modelViewMatrix*vec4(p,1.0);
          gl_Position=projectionMatrix*mv;
          vA=uA*sin(k*3.14159)*(0.6+0.4*aPh);
          gl_PointSize=(2.4+2.8*aPh)*uPr;
        }`,
      fragmentShader: `varying float vA;
        void main(){ float d=length(gl_PointCoord-0.5)*2.0; float a=smoothstep(1.0,0.0,d)*vA; if(a<0.004) discard; gl_FragColor=vec4(vec3(1.0,0.86,0.5)*a,1.0); }`,
    });
    this.sparks = new THREE.Points(g, this.sparkMat);
    this.sparks.frustumCulled = false;
    this.sparks.visible = false;
    this.root.add(this.sparks);
  }
  finale() {
    const u = this.shellMat.uniforms, su = this.sparkMat.uniforms, tok = this.shellTok = {};
    u.uCol.value.set(0xffd27a); u.uRim.value = 0.9;
    this.shell.visible = this.sparks.visible = true;
    su.uPr.value = this.b.renderer.getPixelRatio();
    const d0 = this.sweepDir(-0.5), d1 = this.sweepDir(0.6);
    this.b.tween(7000, (k) => {
      if (this.shellTok !== tok) return;
      // two slow golden sweeps; the rim glow swells and settles
      const s = k < 0.5 ? k / 0.5 : (k - 0.5) / 0.5;
      u.uDir.value.copy(k < 0.5 ? d0 : d1);
      u.uT.value = s;
      u.uA.value = Math.min(1, k / 0.08) * Math.pow(1 - k, 0.7) * 0.8;
      su.uT.value = k * 3.0;
      su.uA.value = Math.min(1, k / 0.1) * Math.pow(1 - k, 1.2) * 0.9;
    }, () => { if (this.shellTok === tok) this.shell.visible = this.sparks.visible = false; });
  }
}
