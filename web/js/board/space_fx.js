// space_fx.js -- ambience in the space round Mars. Subtle, cheap, no lights:
//
//  * a Milky Way: a band of faint stars (some twinkling) along the backdrop
//    nebula's band;
//  * a soft warm glare from the sun, off the upper-left corner;
//  * traffic in low Mars orbit -- a lone satellite at the start, more ships
//    as cities appear -- on orbits seen nearly face-on, so they circle the
//    globe instead of crossing the board;
//  * tugs shuttling between Mars orbit and the Phobos Space Haven once a
//    city is on it;
//  * now and then a shooting star, and rarely a slow comet, always in open
//    sky (never across the globe).
//
// Driven by MoonFx (moons.js): setState({ cities, phobosHaven }) from the game
// view, reset() on a new map, tick() every frame. Draw calls: stars, glare,
// ship hulls (instanced), ship lights (one Points), wakes (one LineSegments),
// streak (one Line), comet (one quad).
// Everything is drawn from the start (idle parts at zero alpha / size), so
// nothing compiles mid-game. Quality (quality.js): Medium / Low draw a subset
// of the Milky Way (draw range: the stars are in random order), cap the
// orbit traffic, and make comets rarer / none.
import * as THREE from 'three';
import { gfx } from './quality.js';

const MAX_ORBIT = 8, TUGS = 2, SHIPS = MAX_ORBIT + TUGS, TRAIL = 14;   // TRAIL: points in each ship's fading wake

export class SpaceFx {
  constructor(board, H) {
    this.b = board;
    this.H = H;                 // moons.js helpers: SUN, navLightMaterial, navPoints, srand, shipGeo, shipMaterial, dim
    this.state = { cities: 0, phobosHaven: false };
    this.built = false;
    this.fade = new Float32Array(SHIPS);       // per-ship visibility 0..1, eased toward its target
    this.nextStreak = 25 + Math.random() * 30;
    this.nextComet = 150 + Math.random() * 150;
    this.streak = null;
    try { this.off = new URLSearchParams(location.search).get('space') === '0'; } catch {}   // ?space=0: none of it (A/B checks)
  }

  // the number of ships in Mars orbit for a number of cities on Mars
  static orbitCount(cities) { return Math.min(MAX_ORBIT, 1 + Math.ceil(cities * 0.6)); }

  setState(s) {
    if (s.cities != null) this.state.cities = s.cities;
    if (s.phobosHaven != null) this.state.phobosHaven = !!s.phobosHaven;
  }
  reset() { this.state.cities = 0; this.state.phobosHaven = false; this.fade.fill(0); }

  build() {
    this.built = true;
    const b = this.b;
    this.R = b.planet.geometry.parameters.radius;
    this.milkyWay();
    // (no Deimos: an unlabelled second moon near Mars would read as a duplicate Phobos)
    this.glare();
    this.traffic();
    this.streakLine();
  }

  // ---------------------------------------------------------------- Milky Way
  milkyWay() {
    const r = this.H.srand(1234), n = this.b.mobile ? 3500 : 6500;
    // the band runs diagonally across the home view, upper left to lower right, passing behind Mars a little off-centre
    const f = this.b.home.clone().normalize(), hr = new THREE.Vector3(1, 0, 0), hu = f.clone().cross(hr).normalize();
    const ang = -0.6, dg = hr.clone().multiplyScalar(Math.cos(ang)).addScaledVector(hu, Math.sin(ang));
    const A = f.clone().negate().cross(dg).normalize().addScaledVector(f, -0.12).normalize();
    const e1 = f.clone().negate().addScaledVector(A, f.dot(A)).normalize(), e2 = A.clone().cross(e1);
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), tw = new Float32Array(n * 3);
    const clump = (a) => 0.55 + 0.45 * Math.sin(a * 3.0 + 1.3) * Math.sin(a * 7.1 + 0.4) * Math.cos(a * 1.7);   // denser star clouds along the band
    const c = new THREE.Color(), v = new THREE.Vector3();
    for (let i = 0; i < n;) {
      const a = r() * Math.PI * 2;
      if (r() > clump(a)) continue;
      const g = (r() + r() + r() - 1.5) * (r() < 0.8 ? 0.11 : 0.3) + 0.03 * Math.sin(a * 5.0);   // most hug the (gently wavy) band, a few stray wider
      v.copy(e1).multiplyScalar(Math.cos(a)).addScaledVector(e2, Math.sin(a)).multiplyScalar(Math.cos(g)).addScaledVector(A, Math.sin(g)).normalize().multiplyScalar(820);
      pos.set([v.x, v.y, v.z], i * 3);
      const warm = r();
      c.setHSL(warm < 0.6 ? 0.6 : 0.09, warm < 0.6 ? 0.25 : 0.35, 0.72 + r() * 0.2);
      const bright = r() < 0.04 ? 1 : 0.25 + 0.5 * r() * r();
      col.set([c.r * bright, c.g * bright, c.b * bright], i * 3);
      tw.set([r() * 6.28, bright > 0.9 ? 1.6 + r() : 0.6 + r() * 0.7, bright > 0.9 ? 1 : r() < 0.15 ? 0.6 : 0], i * 3);   // phase, px size, twinkle
      i++;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aTw', new THREE.BufferAttribute(tw, 3));
    const mat = this.mwMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uPr: { value: 1 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `attribute vec3 aCol; attribute vec3 aTw; uniform float uTime; uniform float uPr; varying vec3 vC;
        void main(){
          gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
          float tw=1.0-aTw.z*0.55*(0.5+0.5*sin(uTime*(1.3+aTw.x*0.3)+aTw.x*7.0));
          vC=aCol*tw;
          gl_PointSize=aTw.y*uPr;
        }`,
      fragmentShader: `varying vec3 vC;
        void main(){ float d=length(gl_PointCoord-0.5)*2.0; float a=smoothstep(1.0,0.0,d); gl_FragColor=vec4(vC*a*a,1.0); }`,
    });
    const pts = this.mwStars = new THREE.Points(g, mat);
    pts.frustumCulled = false;
    pts.renderOrder = -10;
    this.b.scene.add(pts);
    // the unresolved glow of the band: a few hundred big, very faint soft blobs, warmer at its heart
    const m = this.b.mobile ? 90 : 200, bp = new Float32Array(m * 3), bc = new Float32Array(m * 3), bt = new Float32Array(m * 3);
    for (let i = 0; i < m;) {
      const a = r() * Math.PI * 2;
      if (r() > clump(a)) continue;
      const g2 = (r() + r() - 1) * 0.08 + 0.03 * Math.sin(a * 5.0);
      v.copy(e1).multiplyScalar(Math.cos(a)).addScaledVector(e2, Math.sin(a)).multiplyScalar(Math.cos(g2)).addScaledVector(A, Math.sin(g2)).normalize().multiplyScalar(850);
      bp.set([v.x, v.y, v.z], i * 3);
      c.setHSL(0.62 - 0.5 * r() * r(), 0.35, 0.5);
      const k = 0.03 + 0.03 * r();
      bc.set([c.r * k, c.g * k, c.b * k], i * 3);
      bt.set([0, (this.b.mobile ? 30 : 40) + r() * (this.b.mobile ? 40 : 60), 0], i * 3);
      i++;
    }
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.BufferAttribute(bp, 3));
    bg.setAttribute('aCol', new THREE.BufferAttribute(bc, 3));
    bg.setAttribute('aTw', new THREE.BufferAttribute(bt, 3));
    const glow = this.mwGlow = new THREE.Points(bg, mat);
    glow.frustumCulled = false;
    glow.renderOrder = -11;
    this.b.scene.add(glow);
  }

  // ---------------------------------------------------------------- sun glare
  // the sun is behind the viewer's left shoulder: a faint warm bloom spilling
  // in from the upper-left corner, plus a fainter ghost further in
  glare() {
    const cv = document.createElement('canvas'); cv.width = cv.height = 256;
    const g = cv.getContext('2d'), gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    for (const [o, a] of [[0, 1], [0.08, 0.7], [0.25, 0.3], [0.5, 0.1], [0.75, 0.03], [1, 0]]) gr.addColorStop(o, `rgba(255,255,255,${a})`);
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    const tex = new THREE.CanvasTexture(cv);
    const mk = (op, col) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: col, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, toneMapped: false }));
      sp.renderOrder = 30;
      sp.frustumCulled = false;
      this.b.scene.add(sp);
      return sp;
    };
    this.glares = [
      { sp: mk(0.3, 0xffcf96), ndc: [-1.05, 1.1], size: 1.2 },
      { sp: mk(0.05, 0xffe2bd), ndc: [-0.6, 0.62], size: 0.16 },
    ];
  }
  placeGlare() {
    const cam = this.b.camera, v = this.tmpG ||= new THREE.Vector3();
    const D = 200, h = 2 * D * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);   // world height of the view at depth D
    for (const g of this.glares) {
      v.set(g.ndc[0], g.ndc[1], 0.5).unproject(cam).sub(cam.position).normalize().multiplyScalar(D).add(cam.position);
      g.sp.position.copy(v);
      g.sp.scale.setScalar(h * g.size);
    }
  }

  // ---------------------------------------------------------------- traffic
  traffic() {
    const { navLightMaterial, navPoints, srand } = this.H, r = srand(808), R = this.R;
    const home = this.b.home, f = home.clone().normalize(), hr = new THREE.Vector3(1, 0, 0), hu = f.clone().cross(hr).normalize();
    // Mars orbits seen nearly face-on: a circle round the globe, tipped a little so it passes in front at one side and behind at the other
    this.orbits = Array.from({ length: MAX_ORBIT }, (_, i) => {
      const q = new THREE.Quaternion().setFromAxisAngle(f, r() * Math.PI * 2).multiply(new THREE.Quaternion().setFromAxisAngle(hr, (0.2 + r() * 0.35) * (r() < 0.5 ? -1 : 1)));
      return { u: hr.clone().applyQuaternion(q), v: hu.clone().applyQuaternion(q), R: R * (1.1 + r() * 0.16 + i * 0.01), w: (0.05 + r() * 0.05) * (r() < 0.35 ? -1 : 1), ph: r() * 6.28, s: 0.8 + r() * 0.5 };
    });
    this.tugs = Array.from({ length: TUGS }, (_, i) => ({ ph: i * 0.5, T: 26 + i * 3 }));
    const ships = this.ships = new THREE.InstancedMesh(this.H.shipGeo(), this.H.dim(this.H.shipMaterial(this.H.SUN)), SHIPS);
    ships.frustumCulled = false;
    ships.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const gm = this.glowMat = navLightMaterial(1);
    const L = [];
    for (let i = 0; i < SHIPS; i++) L.push({ p: [0, 0, 0], c: 0x000000, s: i < MAX_ORBIT ? 0.07 : 0.1, rate: i < MAX_ORBIT && i % 2 === 1 ? -0.7 : 0, ph: r() });
    this.glows = navPoints(gm, L);
    this.glows.geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
    this.glowCol = Array.from({ length: SHIPS }, (_, i) => new THREE.Color(i >= MAX_ORBIT ? 0xffb060 : i % 2 === 1 ? 0xffffff : i % 4 === 0 ? 0xffe2b0 : 0xbfe0ff));
    // wakes: each ship drags a faint, fading arc of its own path (reads as a ship, not a star, even when still)
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SHIPS * (TRAIL - 1) * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage));
    tg.setAttribute('aCol', new THREE.BufferAttribute(new Float32Array(SHIPS * (TRAIL - 1) * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage));
    this.trails = new THREE.LineSegments(tg, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: 'attribute vec3 aCol; varying vec3 vC; void main(){ vC=aCol; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: 'varying vec3 vC; void main(){ gl_FragColor=vec4(vC,1.0); }',
    }));
    this.trails.frustumCulled = false;
    this.b.scene.add(ships, this.glows, this.trails);
    this.tmp = { M: new THREE.Matrix4(), Q: new THREE.Quaternion(), P: new THREE.Vector3(), F: new THREE.Vector3(), Z: new THREE.Vector3(), UP: new THREE.Vector3(0, 1, 0), S: new THREE.Vector3(), B: new THREE.Vector3() };
    this.f = f;
  }
  // the tug run for the current Phobos: from low orbit just off Mars' limb (on Phobos' side) out to the station and back
  tugPath() {
    const st = this.b.station;
    if (!st) return null;
    if (this.path && this.path.st === st) return this.path;
    const R = this.R, f = this.f, end = st.root.position.clone();
    const d = end.clone().normalize(), limb = d.clone().addScaledVector(f, -d.dot(f)).normalize();
    const P0 = limb.clone().multiplyScalar(R * 1.16);
    const P3 = end.clone().addScaledVector(end.clone().sub(this.b.home).normalize(), -st.W * 0.35);   // just in front of the station
    const P1 = P0.clone().addScaledVector(limb, R * 0.25).addScaledVector(f, R * 0.1);
    const P2 = P3.clone().addScaledVector(limb, -R * 0.1).addScaledVector(f, R * 0.12);
    return (this.path = { st, curve: new THREE.CubicBezierCurve3(P0, P1, P2, P3) });
  }

  // ---------------------------------------------------------------- shooting stars / comets
  streakLine() {
    const N = 24, g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    g.setAttribute('aT', new THREE.BufferAttribute(new Float32Array(Array.from({ length: N }, (_, i) => i / (N - 1))), 1));
    g.attributes.position.setUsage(THREE.DynamicDrawUsage);
    const mat = this.streakMat = new THREE.ShaderMaterial({
      uniforms: { uA: { value: 0 }, uCol: { value: new THREE.Color(1, 1, 1) } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: 'attribute float aT; varying float vT; void main(){ vT=aT; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: 'uniform float uA; uniform vec3 uCol; varying float vT; void main(){ float a=pow(vT,2.2)*uA; gl_FragColor=vec4(uCol*a,1.0); }',
    });
    const line = this.streakMesh = new THREE.Line(g, mat);
    line.frustumCulled = false;
    line.renderOrder = -5;
    this.b.scene.add(line);
    this.streakN = N;
    // a comet: one camera-facing quad along its tail -- a fuzzy head at x=0, the tail widening and fading to x=1
    const cm = this.cometMat = new THREE.ShaderMaterial({
      uniforms: { uA: { value: 0 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: `uniform float uA; varying vec2 vUv;
        void main(){
          float x=vUv.x*1.1-0.1, y=(vUv.y-0.5)*2.0;
          float w=0.08+0.9*x;                                             // the tail fans out
          float tail=exp(-pow(y/w,2.0)*3.0)*pow(1.0-clamp(x,0.0,1.0),1.6)*smoothstep(-0.01,0.03,x);
          float head=exp(-(pow(x*9.0,2.0)+pow(y*1.3,2.0))*2.2);
          vec3 c=vec3(0.7,0.85,1.0)*tail*0.55+vec3(1.0,0.97,0.9)*head*1.2;
          gl_FragColor=vec4(c*uA,1.0);
        }`,
    });
    const g2 = new THREE.PlaneGeometry(1.1, 1).translate(0.45, 0, 0);        // x: a margin, the head, .. the tail end
    this.comet = new THREE.Mesh(g2, cm);
    this.comet.frustumCulled = false;
    this.comet.renderOrder = -5;
    this.b.scene.add(this.comet);
  }
  // a path in open sky: NDC start/end kept well clear of the globe
  spawnStreak(comet) {
    const cam = this.b.camera, asp = cam.aspect;
    const c = new THREE.Vector3(0, 0, 0).project(cam);
    const edge = new THREE.Vector3(this.R, 0, 0).applyQuaternion(cam.quaternion).project(cam);
    const marsR = Math.abs(edge.x - c.x) * asp;                        // Mars' radius in NDC-y units
    const blocked = (x, y) => Math.hypot((x - c.x) * asp, y - c.y) < marsR * 1.3;
    for (let k = 0; k < 24; k++) {
      const x0 = Math.random() * 1.8 - 0.9, y0 = Math.random() * 1.8 - 0.9, a = Math.random() * Math.PI * 2, len = comet ? 0.25 + Math.random() * 0.2 : 0.3 + Math.random() * 0.35;
      const x1 = x0 + Math.cos(a) * len / asp, y1 = y0 + Math.sin(a) * len;
      if (Math.abs(x1) > 0.95 || Math.abs(y1) > 0.95) continue;
      let clear = true;
      for (let i = 0; i <= 8 && clear; i++) if (blocked(x0 + (x1 - x0) * i / 8, y0 + (y1 - y0) * i / 8)) clear = false;
      if (!clear) continue;
      const D = comet ? 700 : 500;
      const w = (x, y) => new THREE.Vector3(x, y, 0.5).unproject(cam).sub(cam.position).normalize().multiplyScalar(D).add(cam.position);
      return { p0: w(x0, y0), p1: w(x1, y1), t0: this.now, dur: comet ? 12 + Math.random() * 6 : 0.7 + Math.random() * 0.5, comet, tail: comet ? 0.35 : 0.5 };
    }
    return null;
  }
  tickStreak(t) {
    if (!this.streak && t > this.nextComet) { this.streak = gfx.low ? null : this.spawnStreak(true); this.nextComet = t + (200 + Math.random() * 200) * gfx.pick(1, 2, 1); }   // none at Low, half as often at Medium
    if (!this.streak && t > this.nextStreak) { this.streak = this.spawnStreak(false); this.nextStreak = t + (35 + Math.random() * 55) * gfx.pick(2, 1, 1); }
    const S = this.streak, mat = this.streakMat;
    if (!S) { mat.uniforms.uA.value = 0; this.cometMat.uniforms.uA.value = 0; return; }
    const k = (t - S.t0) / S.dur;
    if (k >= 1 || k < 0) { this.streak = null; mat.uniforms.uA.value = 0; this.cometMat.uniforms.uA.value = 0; return; }
    if (S.comet) {
      // drifts a little along its path; the tail streams away from the sun
      const c = this.tmpC ||= { head: new THREE.Vector3(), X: new THREE.Vector3(), Y: new THREE.Vector3(), Z: new THREE.Vector3(), M: new THREE.Matrix4() };
      const head = c.head.lerpVectors(S.p0, S.p1, 0.3 + 0.4 * k), cam = this.b.camera.position;
      const X = c.X.copy(this.H.SUN).negate(), Z = c.Z.copy(cam).sub(head).normalize();
      X.addScaledVector(Z, -X.dot(Z)).normalize();
      const Y = c.Y.copy(Z).cross(X);
      const len = S.p0.distanceTo(S.p1) * 0.45;
      this.comet.position.copy(head);
      this.comet.quaternion.setFromRotationMatrix(c.M.makeBasis(X, Y, Z));
      this.comet.scale.set(len, len * 0.22, 1);
      this.cometMat.uniforms.uA.value = Math.min(1, k / 0.2, (1 - k) / 0.25) * 0.8;
      mat.uniforms.uA.value = 0;
      return;
    }
    const tv = this.tmpS ||= [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    const P = this.streakMesh.geometry.attributes.position, N = this.streakN, head = tv[0], q = tv[1];
    // a shooting star runs its whole path, its tail growing in behind it
    head.lerpVectors(S.p0, S.p1, k);
    const dir = tv[2].copy(S.p1).sub(S.p0).normalize().negate();
    const len = S.p0.distanceTo(S.p1) * S.tail;
    for (let i = 0; i < N; i++) { q.copy(head).addScaledVector(dir, len * (1 - i / (N - 1)) * Math.min(1, k * 4)); P.setXYZ(i, q.x, q.y, q.z); }
    P.needsUpdate = true;
    mat.uniforms.uA.value = Math.min(1, k / 0.1, (1 - k) / 0.3) * 0.9;
    mat.uniforms.uCol.value.setRGB(1, 0.95, 1);
  }

  // ---------------------------------------------------------------- frame
  tick(t, dt) {
    if (this.off) return;
    if (!this.built) { if (!this.b.planet || !this.b.home || !this.b.camera) return; this.build(); }
    this.now = t;
    const pr = this.b.renderer.getPixelRatio(), H = this.b.renderer.domElement.height;
    this.mwMat.uniforms.uTime.value = t; this.mwMat.uniforms.uPr.value = pr;
    if (this.mwLevel !== gfx.level) {                   // quality: a (random) subset of the stars / glow blobs
      this.mwLevel = gfx.level;
      const f = gfx.pick(0.3, 0.6, 1);
      for (const o of [this.mwStars, this.mwGlow]) o.geometry.setDrawRange(0, Math.ceil(o.geometry.attributes.position.count * f));
    }
    this.placeGlare();
    this.tickStreak(t);

    // traffic: ease each ship toward shown/hidden, then fly the shown ones
    const n = Math.min(gfx.pick(3, 5, MAX_ORBIT), SpaceFx.orbitCount(this.state.cities)), phobos = this.state.phobosHaven && this.b.station?.k > 0.5;
    const ease = Math.min(1, dt * 0.8);
    for (let i = 0; i < SHIPS; i++) {
      const want = i < MAX_ORBIT ? (i < n ? 1 : 0) : phobos ? 1 : 0;
      this.fade[i] += (want - this.fade[i]) * ease;
    }
    const gm = this.glowMat.uniforms;
    gm.uTime.value = t; gm.uH.value = H; gm.uMin.value = 2.6 * pr;
    const { M, Q, P, F, Z, UP, S, B } = this.tmp, gp = this.glows.geometry.attributes.position, gc = this.glows.geometry.attributes.aCol;
    const path = phobos || this.fade[MAX_ORBIT] > 0.01 ? this.tugPath() : null;
    const tp = this.trails.geometry.attributes.position, tc = this.trails.geometry.attributes.aCol, W = this.tmpW ||= Array.from({ length: TRAIL }, () => new THREE.Vector3());
    for (let i = 0; i < SHIPS; i++) {
      let a = this.fade[i], sc = 0.1, wake = 0;
      if (i < MAX_ORBIT) {
        const o = this.orbits[i], ang = o.ph + t * o.w;
        P.copy(o.u).multiplyScalar(Math.cos(ang) * o.R).addScaledVector(o.v, Math.sin(ang) * o.R);
        F.copy(o.u).multiplyScalar(-Math.sin(ang)).addScaledVector(o.v, Math.cos(ang)).multiplyScalar(Math.sign(o.w));
        sc *= o.s;
        for (let k = 0; k < TRAIL; k++) { const b2 = ang - Math.sign(o.w) * 0.3 * k / (TRAIL - 1); W[k].copy(o.u).multiplyScalar(Math.cos(b2) * o.R).addScaledVector(o.v, Math.sin(b2) * o.R); }
        wake = 0.32;
      } else if (path) {
        // out (ease in-out), docked, back, a rest at Mars -- then again
        const tg = this.tugs[i - MAX_ORBIT], f = ((t / tg.T) + tg.ph) % 1;
        let e, dir = 1;
        if (f < 0.4) e = f / 0.4;
        else if (f < 0.5) { e = 1; a = 0; }
        else if (f < 0.9) { e = 1 - (f - 0.5) / 0.4; dir = -1; }
        else { e = 0; a = 0; }
        const s = e * e * (3 - 2 * e);
        path.curve.getPoint(s, P);
        for (let k = 0; k < TRAIL; k++) path.curve.getPoint(Math.min(1, Math.max(0, s - dir * 0.12 * k / (TRAIL - 1))), W[k]);
        wake = 0.4 * Math.min(1, Math.abs(s - (dir > 0 ? 0 : 1)) / 0.12);
        path.curve.getTangent(Math.min(0.999, Math.max(0.001, s)), F).multiplyScalar(dir);
        a *= Math.min(1, e / 0.06, (1 - e) / 0.06 + (f < 0.5 && f > 0.4 ? 1 : 0));
        sc = 0.12;
      } else a = 0;
      M.lookAt(Z, F, UP); Q.setFromRotationMatrix(M);
      M.compose(P, Q, S.setScalar(Math.max(1e-4, sc * a)));
      this.ships.setMatrixAt(i, M);
      B.copy(P).addScaledVector(F, -sc * 0.7);
      gp.setXYZ(i, B.x, B.y, B.z);
      const c = this.glowCol[i];
      gc.setXYZ(i, c.r * a, c.g * a, c.b * a);
      // the wake: head bright, tail gone (a white-ish tint of the ship's light)
      for (let k = 0; k < TRAIL - 1; k++) {
        const j = (i * (TRAIL - 1) + k) * 2, w0 = wake * a * (1 - k / (TRAIL - 1)) ** 2, w1 = wake * a * (1 - (k + 1) / (TRAIL - 1)) ** 2;
        tp.setXYZ(j, W[k].x, W[k].y, W[k].z); tp.setXYZ(j + 1, W[k + 1].x, W[k + 1].y, W[k + 1].z);
        tc.setXYZ(j, (0.5 + 0.5 * c.r) * w0, (0.5 + 0.5 * c.g) * w0, (0.5 + 0.5 * c.b) * w0);
        tc.setXYZ(j + 1, (0.5 + 0.5 * c.r) * w1, (0.5 + 0.5 * c.g) * w1, (0.5 + 0.5 * c.b) * w1);
      }
    }
    this.ships.instanceMatrix.needsUpdate = true; gp.needsUpdate = true; gc.needsUpdate = true; tp.needsUpdate = true; tc.needsUpdate = true;
  }
}
