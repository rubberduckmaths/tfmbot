// offboard.js -- Board3D mixin: the spaces off Mars -- Ganymede and its colony, Phobos and its space haven,
// and Jupiter.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from '../../vendor/BufferGeometryUtils.js';
import { SUN } from './layout.js';
import { disposeTree, kitGeo, navLightMaterial, navPoints, solarTex, srand, stationRingTex, xform } from './model_kit.js';
import { noiseGLSL } from './planet.js';

export class OffBoardArt {
  // Ganymede: icy moon; its surface and its four looks (colony x Terraforming
  // Ganymede) are moons.js's ganymedeMaterial
  makeGanymede(rad) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(rad, 64, 48), this.moonFx.ganymedeMaterial());
    m.userData.spin = 0.03;                          // (moons.js sets the rate)
    return m;
  }

  // Ganymede Colony once a city is placed: settlement lights in the owner's
  // colour come on (moons.js adds the domes and built-up ground, and the
  // terraforming, halo included, which is its own card), and a swarm of small
  // ships works the moon -- orbiting, and shuttling to and from Jupiter's side.
  // Extra draw calls: halo, lights, ships (one instanced mesh), engine glows.
  makeGanymedeHaven(cell, W, moon) {
    cell.haven = true;
    const rad = moon.geometry.parameters.radius, mat = moon.material, r = srand(311);
    // atmosphere halo: a slightly bigger back-faced shell, additive, only past the limb
    const halo = new THREE.Mesh(new THREE.SphereGeometry(rad * 1.06, 48, 32), new THREE.ShaderMaterial({
      uniforms: { uSun: { value: SUN.clone() }, uK: { value: 0 } },
      side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: 'varying vec3 vN; varying vec3 vW; void main(){ vN=normalize(mat3(modelMatrix)*normal); vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }',
      fragmentShader: `uniform vec3 uSun; uniform float uK; varying vec3 vN; varying vec3 vW;
        void main(){
          vec3 N=normalize(vN), V=normalize(cameraPosition-vW);
          float e=1.0-abs(dot(N,V));
          float g=pow(smoothstep(1.0,0.66,e),1.6)*(0.15+0.85*smoothstep(-0.3,0.5,dot(N,uSun)));   // brightest at the moon's limb, fading outward
          gl_FragColor=vec4(vec3(0.35,0.6,1.0)*g*uK*0.9,1.0);
        }`,
    }));
    halo.visible = false;
    moon.add(halo);

    // settlement lights: clusters spread round the moon (so some always face us), on its surface
    const L = [], mixes = [];
    const fib = 14;
    for (let i = 0; i < fib; i++) {
      const y = 1 - (i + 0.5) / fib * 2, a = i * 2.4 + 0.4, rr = Math.sqrt(1 - y * y);
      const c = new THREE.Vector3(Math.cos(a) * rr, y * 0.85, Math.sin(a) * rr).normalize();
      const k = 4 + Math.floor(r() * 6), sp = 0.1 + r() * 0.08;
      for (let j = 0; j < k; j++) {
        const d = c.clone().add(new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).multiplyScalar(sp * (j < 2 ? 0.3 : 1))).normalize();
        L.push({ p: d.multiplyScalar(rad * 1.012).toArray(), c: 0xffffff, s: rad * (j < 2 ? 0.065 : 0.035 + r() * 0.02) });
        mixes.push(j < 2 ? 0.2 : r() < 0.5 ? 0.85 : 0.45);        // how much owner colour vs warm white
      }
    }
    const lmat = navLightMaterial(1, 1);
    const lights = navPoints(lmat, L);
    lights.visible = false;
    moon.add(lights);

    // the fleet: its own group at the moon (it doesn't spin with the surface)
    const fleet = new THREE.Group();
    fleet.position.copy(moon.position);
    this.scene.add(fleet);
    const B = (x, y, z) => new THREE.BoxGeometry(x, y, z);
    const shipGeo = kitGeo([                         // nose along -z
      [B(0.02, 0.012, 0.055), 0xe8ecf0, [0, 0, 0]],
      [new THREE.ConeGeometry(0.01, 0.026, 6), 0xe8ecf0, [0, 0, -0.04], [-Math.PI / 2, 0, 0]],
      [B(0.064, 0.003, 0.02), 0x9aa3ae, [0, -0.002, 0.012]],
      [B(0.003, 0.016, 0.016), 0xc8502a, [0, 0.012, 0.02]],
      [B(0.016, 0.01, 0.008), 0x3a404a, [0, 0, 0.03]],
    ]);
    const N = 3, ships = [];                        // just a couple: more read as flies
    const toJ = this.jupiter ? this.jupiter.position.clone().sub(moon.position).normalize() : new THREE.Vector3(-1, 0, -0.5).normalize();
    for (let i = 0; i < N; i++) {
      if (i < 2) {                                  // two orbiters, one shuttle to Jupiter
        const tilt = i % 4 === 0 ? 0.5 + r() * 0.7 : r() * 0.25;
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, r() * 6.28, (r() - 0.5) * 0.4));
        ships.push({ kind: 0, u: new THREE.Vector3(1, 0, 0).applyQuaternion(q), v: new THREE.Vector3(0, 0, 1).applyQuaternion(q),
          R: rad * (1.22 + r() * 0.6), w: (i % 5 === 0 ? -1 : 1) * (0.35 + r() * 0.3), ph: r() * 6.28, s: 0.8 + r() * 0.5 });
      } else {                                      // transfers: out toward Jupiter's side and back in
        const side = new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).cross(toJ).normalize();
        const a = toJ.clone().addScaledVector(side, 0.5).normalize().multiplyScalar(rad * 1.1);
        const b = toJ.clone().multiplyScalar(rad * (3.2 + r() * 1.2)).addScaledVector(side, rad * (0.4 + r() * 0.8));
        ships.push({ kind: 1, a, b, out: i % 2 === 0, T: 7 + r() * 5, ph: r() * 10, s: 1 + r() * 0.4 });
      }
    }
    const hull = new THREE.InstancedMesh(shipGeo, this.fleetMat ||= Object.assign(new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.4, roughness: 0.45 }), { userData: { shared: true } }), N);
    hull.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    hull.frustumCulled = false;
    const gmat = navLightMaterial(1);
    const glows = navPoints(gmat, ships.map((sh) => ({ p: [0, 0, 0], c: sh.kind ? 0xffc27a : 0x9fd8ff, s: rad * 0.08 * sh.s })));
    glows.geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
    fleet.add(hull, glows);
    fleet.visible = false;

    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), Fw = new THREE.Vector3(), Z = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), back = new THREE.Vector3();
    const g = this.gany = {
      space: cell.i, moon, fleet, halo, lights, k: 0,
      setK: (k) => {
        g.k = k;
        lmat.uniforms.uFade.value = Math.max(0, k * 1.4 - 0.4);      // lights come on once the domes are up
        gmat.uniforms.uFade.value = k;
        // the settlements, and what shows (colony vs Terraforming Ganymede): moons.js
        if (g.fx) g.fx.colony(); else lights.visible = fleet.visible = k > 0.001;
      },
      setOwner: (pc, animate) => {
        if (pc != null) {
          const c = new THREE.Color(pc), wm = new THREE.Color(0xffd89a), col = lights.geometry.attributes.aCol, t = new THREE.Color();
          mixes.forEach((m, i) => { t.copy(wm).lerp(c, m); col.setXYZ(i, t.r, t.g, t.b); });
          col.needsUpdate = true;
          if (g.k === 0) {                          // green from the settlement facing the viewer
            moon.updateMatrixWorld();
            mat.uniforms.uOrigin.value.copy(moon.worldToLocal(this.camera.position.clone())).normalize();
          }
        }
        const to = pc == null ? 0 : 1, from = g.k;
        if (to === from) return;
        const tok = g.tok = {};
        if (!animate) { g.setK(to); return; }
        this.tween(to ? 1400 : 800, (k) => { if (g.tok === tok) g.setK(from + (to - from) * k); });
      },
      tick: (t) => {
        mat.uniforms.uTime.value = t;
        if (!fleet.visible) return;
        const H = this.renderer.domElement.height, pr = this.renderer.getPixelRatio();
        lmat.uniforms.uTime.value = t; lmat.uniforms.uH.value = H; lmat.uniforms.uMin.value = 2.6 * pr;
        gmat.uniforms.uH.value = H; gmat.uniforms.uMin.value = 3.2 * pr;
        const gp = glows.geometry.attributes.position;
        ships.forEach((sh, i) => {
          let sc = sh.s * rad * 1.05 * g.k;
          if (sh.kind === 0) {
            const a = sh.ph + t * sh.w * (rad * 1.5 / sh.R) ** 1.5;
            P.copy(sh.u).multiplyScalar(Math.cos(a) * sh.R).addScaledVector(sh.v, Math.sin(a) * sh.R);
            Fw.copy(sh.u).multiplyScalar(-Math.sin(a)).addScaledVector(sh.v, Math.cos(a)).multiplyScalar(Math.sign(sh.w));
          } else {
            const f = ((t + sh.ph) / sh.T) % 1, e = sh.out ? f * f : 1 - (1 - f) * (1 - f);   // out: speeding up; in: slowing down
            const [p0, p1] = sh.out ? [sh.a, sh.b] : [sh.b, sh.a];
            P.lerpVectors(p0, p1, e);
            Fw.subVectors(p1, p0).normalize();
            sc *= Math.min(1, f / 0.12, (1 - f) / 0.12);
          }
          M.lookAt(Z, Fw, UP);                     // -z along the heading
          Q.setFromRotationMatrix(M);
          M.compose(P, Q, S.setScalar(Math.max(sc, 1e-5)));
          hull.setMatrixAt(i, M);
          back.copy(P).addScaledVector(Fw, -sc * 0.04);
          gp.setXYZ(i, back.x, back.y, sc > 1e-4 ? back.z : 1e6);
        });
        hull.instanceMatrix.needsUpdate = true;
        gp.needsUpdate = true;
      },
    };
    g.setK(0);
    this.moonFx.attachGanymede(g);
  }

  // Phobos: a smooth, lumpy, dark body with Stickney and its grooves
  makePhobos(rad) {
    let g = new THREE.IcosahedronGeometry(1, 24);
    g.deleteAttribute('normal'); g.deleteAttribute('uv');
    g = mergeVertices(g);                       // shared vertices -> smooth normals
    const p = g.attributes.position, v = new THREE.Vector3();
    const stick = new THREE.Vector3(0.8, 0.2, 0.55).normalize();
    const r = srand(23), craters = [];
    for (let i = 0; i < 60; i++) craters.push([new THREE.Vector3().randomDirection(), 0.05 + r() * r() * 0.3]);
    const lump = (x, y, z) => 0.06 * Math.sin(x * 3.1 + 1) * Math.cos(y * 2.7) + 0.04 * Math.sin(z * 4.3 + x * 2.1) + 0.02 * Math.sin(y * 7.9 + z * 5.3);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).normalize();
      let h = 1 + lump(v.x, v.y, v.z);
      const ds = v.angleTo(stick);
      if (ds < 0.5) h -= 0.13 * Math.cos(ds / 0.5 * Math.PI / 2) ** 2; else if (ds < 0.66) h += 0.025 * Math.sin((ds - 0.5) / 0.16 * Math.PI);
      for (const [c, cr] of craters) { const d = v.angleTo(c); if (d < cr) h -= 0.035 * (1 - (d / cr) ** 2) * (cr / 0.2); else if (d < cr * 1.25) h += 0.006 * (cr / 0.2); }
      p.setXYZ(i, v.x * h * 1.3, v.y * h * 0.95, v.z * h * 1.1);
    }
    g.computeVertexNormals();
    const mat = new THREE.ShaderMaterial({
      uniforms: { uSun: { value: SUN.clone() } },
      vertexShader: 'varying vec3 vN; varying vec3 vO; void main(){ vO=normalize(position); vN=normalize(mat3(modelMatrix)*normal); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: `uniform vec3 uSun; varying vec3 vN; varying vec3 vO;
        ${noiseGLSL}
        void main(){
          vec3 n=vO;
          float a=fbm(n*3.0,5)*0.5+0.5;
          vec3 col=mix(vec3(0.24,0.21,0.19),vec3(0.46,0.40,0.35),a);
          float grooves=smoothstep(0.85,1.0,abs(sin(dot(n,vec3(0.2,1.0,0.3))*38.0+fbm(n*2.0,2)*3.0)));
          col*=1.0-0.08*grooves;
          vec2 cr=craters(n*9.0); col=mix(col,col*0.75,clamp(-cr.x,0.0,1.0)); col=mix(col,col*1.25,cr.y*0.5);
          float d=smoothstep(-0.12,0.75,dot(normalize(vN),uSun));   // soft terminator
          gl_FragColor=vec4(col*(0.05+1.4*d),1.0);
          #include <colorspace_fragment>
        }`,
    });
    const m = new THREE.Mesh(g, mat);
    m.scale.setScalar(rad);
    m.rotation.set(0.3, 0.8, 0.1);
    m.userData.spin = 0.05;
    return m;
  }

  // Phobos Space Haven. Empty: just Phobos, lumpy and sunlit, filling the hex
  // window. With a city on it (stationModules): an orbital station arrives in
  // front (spinning habitat ring, spine, solar wings, nav lights, a docking
  // shuttle) and Phobos lights up -- a settlement in Stickney, outposts linked
  // by lit roads, an owner-coloured landing pad -- while it eases back a little
  // to make room. Everything is in units of the hex circumradius W, in a frame
  // facing the home camera (x right, y up, z toward the camera).
  makeStation(cell, W, at) {
    const F = cell.center.clone().sub(this.home).normalize();
    const right = F.clone().cross(new THREE.Vector3(0, 1, 0)).normalize(), upv = right.clone().cross(F);
    if (this.station) { this.scene.remove(this.station.root); disposeTree(this.station.root); this.moons = this.moons.filter((m) => m !== this.station.phobos); this.station = null; }   // a new map
    const root = new THREE.Group();
    root.position.copy(at);
    root.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, upv, F.clone().negate()));
    this.scene.add(root);
    cell.station = true;

    // Phobos: hero of the empty cell (pose 0), shifted back and aside once inhabited (pose 1)
    const phobos = this.makePhobos(1);
    const pose = [{ p: new THREE.Vector3(0, -0.02, 0), s: 0.56 }, { p: new THREE.Vector3(-0.3, -0.25, -0.9), s: 0.38 }];
    root.add(phobos);
    (this.moons ||= []).push(phobos);
    const lights = this.phobosLights(phobos.geometry);
    // its own raking light from the upper left, so a night side (where the settlement lights read) faces the viewer
    const sun = new THREE.Vector3(-0.85, 0.42, 0.1).normalize().applyQuaternion(root.quaternion);
    phobos.material.uniforms.uSun.value.copy(sun);
    lights.material.uniforms.uSun.value.copy(sun);
    lights.visible = false;
    phobos.add(lights);

    // the station's frame (the station itself is built by the city tile)
    const frame = new THREE.Group();
    frame.position.set(0.2 * W, 0.2 * W, 0.15 * W);
    frame.rotation.set(0.8, 0, -0.4, 'ZYX');
    frame.scale.setScalar(W * 0.92);
    root.add(frame);

    const st = this.station = {
      space: cell.i, root, phobos, lights, frame, W, k: 0, live: null,
      // k: 0 plain moon .. 1 inhabited (lights on, moon moved aside)
      setK: (k) => {
        st.k = k;
        const e = k * k * (3 - 2 * k);
        phobos.position.lerpVectors(pose[0].p, pose[1].p, e).multiplyScalar(W);
        phobos.scale.setScalar(W * (pose[0].s + (pose[1].s - pose[0].s) * e));
        lights.material.uniforms.uFade.value = k;
        lights.visible = k > 0.001;
      },
      setOwner: (pc, animate) => {
        if (pc == null) st.live = null;
        else {                                          // landing pad + beacon in the owner's colour
          const c = new THREE.Color(pc), col = lights.geometry.attributes.aCol;
          for (const i of lights.userData.owner) col.setXYZ(i, c.r, c.g, c.b);
          col.needsUpdate = true;
        }
        const to = pc == null ? 0 : 1, from = st.k;
        if (to === from) return;
        const tok = st.tok = {};
        if (!animate) { st.setK(to); return; }
        this.tween(1000, (k) => { if (st.tok === tok) st.setK(from + (to - from) * k); });
      },
      tick: (t) => {
        const H = this.renderer.domElement.height, pr = this.renderer.getPixelRatio();
        const lu = lights.material.uniforms;
        lu.uTime.value = t; lu.uH.value = H; lu.uMin.value = 2.2 * pr; lu.uW.value = phobos.scale.x;
        const L = st.live;
        if (!L) return;
        L.ring.rotation.y = t * 0.14;
        const nu = L.nav.uniforms;
        nu.uTime.value = t; nu.uH.value = H; nu.uMin.value = 3.5 * pr;
        // 18 s docking loop: approach (ease out), docked, back out (ease in)
        const T = 18, ph = t % T, D = 0.42;
        let d, burn = 0;
        if (ph < 8) { const k = ph / 8; d = D * Math.pow(1 - k, 3); burn = 1 - k; }
        else if (ph < 12) d = 0;
        else { const k = (ph - 12) / 6; d = D * k * k; }
        L.shuttle.position.set(0.165 + d, 0.48 + d * 0.18, d * 0.35);
        L.shuttle.scale.setScalar(Math.min(1, ph / 1.2, (T - ph) / 1.2));
        L.engine.visible = burn > 0.08;
      },
    };
    st.setK(0);
    this.moonFx.attachPhobos(st);
    return root;
  }

  // Phobos' settlement lights, on its (displaced) surface in the moon's own
  // units: one Points draw. A town in Stickney, a few outposts, lit roads
  // between them, and a landing pad ring + beacon whose colour is the owner's.
  phobosLights(geo) {
    const P = geo.attributes.position, n = P.count, v = new THREE.Vector3(), r = srand(58);
    const dirs = [];
    for (let i = 0; i < n; i++) dirs.push(v.fromBufferAttribute(P, i).clone());
    const at = (d) => {                      // surface point nearest direction d, lifted a touch
      let best = 0, bd = -2;
      for (let i = 0; i < n; i++) { const q = dirs[i], k = (q.x * d.x + q.y * d.y + q.z * d.z) / q.length(); if (k > bd) { bd = k; best = i; } }
      return dirs[best].clone().multiplyScalar(1.025).toArray();
    };
    const L = [], owner = [];
    const jitter = (c, spread) => c.clone().add(new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).multiplyScalar(spread)).normalize();
    const warm = () => (r() < 0.2 ? 0xdfeeff : r() < 0.5 ? 0xffd08a : 0xffb45a);
    const stick = new THREE.Vector3(0.8, 0.2, 0.55).normalize();
    // a town in Stickney and outposts spread all round, so some always face the viewer as Phobos turns
    const towns = [[stick, 24, 0.34]];
    for (let i = 0; i < 9; i++) {
      const y = 1 - (i + 0.5) / 9 * 2, a = i * 2.4 + 0.7, rr = Math.sqrt(1 - y * y);
      const c = new THREE.Vector3(Math.cos(a) * rr, y * 0.8, Math.sin(a) * rr).normalize();
      if (c.angleTo(stick) > 0.6) towns.push([c, 6 + Math.floor(r() * 5), 0.16 + r() * 0.06]);
    }
    for (const [c, k, sp] of towns) {
      for (let i = 0; i < k; i++) L.push({ p: at(jitter(c, sp * (i < 3 ? 0.3 : 1))), c: warm(), s: i < 3 ? 0.1 : 0.05 + r() * 0.03 });
    }
    // lit roads: each outpost to its nearest neighbour nearer Stickney -- a string of faint lamps
    for (const [c] of towns.slice(1)) {
      let to = stick;
      for (const [o] of towns) if (o !== c && o.angleTo(stick) < c.angleTo(stick) && o.angleTo(c) < to.angleTo(c)) to = o;
      const steps = Math.round(to.angleTo(c) / 0.08);
      for (let i = 2; i < steps - 1; i++) L.push({ p: at(to.clone().lerp(c, i / steps).normalize()), c: 0xffc878, s: 0.035 });
    }
    // landing pad on the Stickney rim: a chase of owner-coloured lamps round a centre, and a beacon
    const pad = jitter(stick.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.55), 0.05);
    const t1 = new THREE.Vector3(0, 1, 0).cross(pad).normalize(), t2 = pad.clone().cross(t1);
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2;
      owner.push(L.length);
      L.push({ p: at(pad.clone().addScaledVector(t1, Math.cos(a) * 0.1).addScaledVector(t2, Math.sin(a) * 0.1).normalize()), c: 0xffffff, rate: 0.9, ph: -i / 8, s: 0.045 });
    }
    owner.push(L.length);
    L.push({ p: at(stick), c: 0xffffff, rate: -0.5, s: 0.16 });
    const mat = navLightMaterial(1, 1);
    const pts = navPoints(mat, L);
    pts.userData.owner = owner;
    return pts;
  }

  // Jupiter far in the background, with Ganymede on its orbit
  makeJupiter(cell, W) {
    const J = new THREE.Mesh(new THREE.SphereGeometry(20, 96, 64), new THREE.ShaderMaterial({
      uniforms: { uSun: { value: SUN.clone() }, uTime: { value: 0 } },
      vertexShader: 'varying vec3 vN; varying vec3 vO; varying vec3 vW; void main(){ vO=normalize(position); vN=normalize(mat3(modelMatrix)*normal); vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }',
      fragmentShader: `uniform vec3 uSun; uniform float uTime; varying vec3 vN; varying vec3 vO; varying vec3 vW;
        ${noiseGLSL}
        // zone/belt colour by latitude: cream zones, tan/rust belts, grey-blue poles
        vec3 band(float y){
          float t=y*0.5+0.5;
          vec3 zone=vec3(0.93,0.85,0.70), belt=vec3(0.60,0.38,0.24), dark=vec3(0.47,0.30,0.20);
          vec3 c=zone;
          // belts: t centre, half-width, strength
          c=mix(c,belt,smoothstep(0.045,0.02,abs(t-0.585))*0.95);   // North Equatorial Belt
          c=mix(c,dark,smoothstep(0.012,0.0,abs(t-0.605))*0.5);
          c=mix(c,belt,smoothstep(0.05,0.025,abs(t-0.425))*0.9);    // South Equatorial Belt
          c=mix(c,dark,smoothstep(0.012,0.0,abs(t-0.44))*0.45);
          c=mix(c,mix(belt,zone,0.4),smoothstep(0.025,0.01,abs(t-0.67))*0.8);  // NTB
          c=mix(c,mix(belt,zone,0.45),smoothstep(0.025,0.01,abs(t-0.34))*0.8); // STB
          c=mix(c,mix(belt,zone,0.55),smoothstep(0.02,0.008,abs(t-0.74))*0.7);
          c=mix(c,mix(belt,zone,0.55),smoothstep(0.02,0.008,abs(t-0.27))*0.7);
          c=mix(c,vec3(0.97,0.92,0.80),smoothstep(0.035,0.0,abs(t-0.51))*0.6);  // Equatorial Zone
          c=mix(c,vec3(0.55,0.52,0.50),smoothstep(0.8,0.97,abs(y)));             // grey-blue poles
          c*=0.95+0.05*sin(t*170.0);
          return c;
        }
        void main(){
          vec3 n=vO;
          float lon=atan(n.x,n.z)+uTime*0.004;
          // turbulence stretched along longitude, strongest at belt edges
          vec3 q=vec3(cos(lon)*3.0,n.y*18.0,sin(lon)*3.0);
          float warp=fbm(q+vec3(0.0,0.0,uTime*0.01),5);
          float y=n.y+0.022*warp+0.008*fbm(q*3.0,3);
          vec3 col=band(y);
          // festoons / white ovals
          float ov=smoothstep(0.62,0.9,fbm(vec3(cos(lon)*9.0,n.y*30.0,sin(lon)*9.0),4)*0.5+0.5);
          col=mix(col,vec3(0.95,0.93,0.9),ov*0.35);
          // Great Red Spot in the south equatorial belt
          vec2 g=vec2(lon-0.9,(n.y+0.36)*2.4);
          float e=length(g*vec2(1.0,1.8));
          float sw=fbm(vec3(g*6.0,uTime*0.02),3)*0.04;
          col=mix(col,vec3(0.76,0.42,0.30),smoothstep(0.16+sw,0.09,e)*0.9);
          col=mix(col,vec3(0.85,0.66,0.52),smoothstep(0.2,0.16,e)*smoothstep(0.12,0.16,e)*0.5);
          vec3 N=normalize(vN), V=normalize(cameraPosition-vW);
          float d=max(dot(N,uSun),0.0);
          float limb=pow(max(dot(N,V),0.0),0.35);
          float lit=smoothstep(-0.08,0.55,dot(N,uSun));
          gl_FragColor=vec4(col*(0.05+0.82*lit)*limb,1.0);
          #include <colorspace_fragment>
        }`,
    }));
    // far out beyond Mars' left limb, low, partly behind the player boards (placed by moons.js)
    this.moonFx.placeJupiter(J);
    J.rotation.z = 0.05;
    this.jupiter = J;
    this.scene.add(J);
    this.moonFx.attachJupiter(J, W, cell);           // Io, Europa, Callisto
  }

  // { ganymedeColony, ganymedeTerraformed, callisto, io, europa } -> the moons' looks (moons.js)
  setMoonState(s, animate = false) { this.moonFx.setState(s || {}, animate); }

  // the Space Haven once a player's city is placed on it: the orbital station,
  // built in the station frame but parented to the tile, so it flies in with
  // the placement and goes with an undo. Owner colour: ring windows tint, a
  // light band round the ring and a beacon strobe on the mast.
  // Draw calls: ring+spokes, hull, solar wings, nav lights, shuttle, shuttle
  // engine, owner band.
  stationModules(g, cell, pc) {
    const st = this.station, K = this.stationKit(), tint = new THREE.Color(pc);
    const sb = new THREE.Group();
    st.frame.updateWorldMatrix(true, false);
    st.frame.matrixWorld.decompose(sb.position, sb.quaternion, sb.scale);
    sb.position.sub(cell.center);
    g.add(sb);
    const skin = this.stationSkin;
    const ringMat = new THREE.MeshStandardMaterial({ map: skin.map, emissiveMap: skin.glow, emissive: new THREE.Color(0xffffff).lerp(tint, 0.35), emissiveIntensity: 2.4, metalness: 0.45, roughness: 0.42 });
    const ring = new THREE.Mesh(K.ring, ringMat);
    sb.add(ring, new THREE.Mesh(K.hull, K.hullMat), new THREE.Mesh(K.solar, K.solarMat));
    sb.add(new THREE.Mesh(K.band, new THREE.MeshBasicMaterial({ color: tint.clone().multiplyScalar(1.5) })));
    const nav = navLightMaterial(st.W);
    sb.add(navPoints(nav, [
      { p: [-0.55, -0.56, 0.01], c: 0xff2a2a, rate: 0.7, s: 0.09 },
      { p: [0.55, -0.56, 0.01], c: 0x2aff6a, rate: 0.7, ph: 0.5, s: 0.09 },
      { p: [0, 0.77, 0], c: pc, rate: -0.55, s: 0.16 },
      { p: [0, -0.62, 0], c: 0xffffff, rate: -0.55, ph: 0.5, s: 0.1 },
      { p: [0.13, 0.48, 0], c: 0xffb640, s: 0.035 },
      { p: [0.13, 0.51, 0], c: 0xffb640, rate: 1.4, s: 0.025 },
      { p: [0.13, 0.45, 0], c: 0xffb640, rate: 1.4, ph: 0.5, s: 0.025 },
      { p: [0, -0.4, 0.3], c: 0xff2a2a, rate: 0.5, ph: 0.25, s: 0.03 },
      { p: [0, -0.4, -0.3], c: 0xff2a2a, rate: 0.5, ph: 0.75, s: 0.03 },
    ]));
    const shuttle = new THREE.Mesh(K.shuttle, K.hullMat);
    const engine = navPoints(nav, [{ p: [0.055, 0, 0], c: 0x7fc8ff, s: 0.05 }]);
    shuttle.add(engine);
    sb.add(shuttle);
    st.live = { ring, nav, shuttle, engine };
  }

  // shared station geometry (built once)
  stationKit() {
    if (this._stationKit) return this._stationKit;
    this.stationSkin ||= { map: stationRingTex(false), glow: stationRingTex(true) };
    // rotating habitat ring + spokes + hub: one mesh on the ring skin (plain parts pin their uvs to bare hull)
    const ringGeo = (rad, tube, spokes, hub, uvp = [0.53, 0.4]) => {
      const parts = [xform(new THREE.TorusGeometry(rad, tube, 12, 128), [0, 0, 0], [Math.PI / 2, 0, 0], [1, 1, 0.62])];
      for (let k = 0; k < spokes; k++) {
        const a = k / spokes * Math.PI * 2 + 0.3;
        const len = rad - tube * 0.8 - hub;
        parts.push(xform(new THREE.CylinderGeometry(0.011, 0.011, len, 6, 1, true), [Math.cos(a) * (hub + len / 2), 0, Math.sin(a) * (hub + len / 2)], [0, -a, Math.PI / 2], [1, 1, 1], uvp));
        // a lift car part-way up each spoke
        parts.push(xform(new THREE.BoxGeometry(0.03, 0.026, 0.026), [Math.cos(a) * (hub + len * 0.62), 0, Math.sin(a) * (hub + len * 0.62)], [0, -a, 0], [1, 1, 1], uvp));
      }
      for (let k = 0; k < 8; k++) {   // bulkhead pods on the outer face
        const a = k / 8 * Math.PI * 2 + 0.1;
        parts.push(xform(new THREE.BoxGeometry(0.03, 0.05, 0.075), [Math.cos(a) * (rad + tube * 0.9), 0, Math.sin(a) * (rad + tube * 0.9)], [0, -a, 0], [1, 1, 1], uvp));
      }
      parts.push(xform(new THREE.CylinderGeometry(hub, hub, 0.1, 20), [0, 0, 0], [0, 0, 0], [1, 1, 1], uvp));
      parts.push(xform(new THREE.TorusGeometry(hub, 0.012, 6, 24), [0, 0.05, 0], [Math.PI / 2, 0, 0], [1, 1, 1], [0.53, 0.25]));
      parts.push(xform(new THREE.TorusGeometry(hub, 0.012, 6, 24), [0, -0.05, 0], [Math.PI / 2, 0, 0], [1, 1, 1], [0.53, 0.25]));
      return mergeGeometries(parts);
    };
    // static hull: spine, modules, docking node, radiators, truss, mast, dish
    const B = (x, y, z) => new THREE.BoxGeometry(x, y, z), Cy = (a, b, h, n = 16) => new THREE.CylinderGeometry(a, b, h, n);
    const white = 0xe9edf2, grey = 0xaab2bd, dark = 0x4a525e, gold = 0xc99a45, rad = 0xf2f4f6;
    const hull = kitGeo([
      [Cy(0.022, 0.022, 1.32, 10), grey, [0, 0.08, 0]],                        // spine
      [Cy(0.04, 0.04, 0.03), dark, [0, 0.075, 0]], [Cy(0.04, 0.04, 0.03), dark, [0, -0.075, 0]],   // ring bearings
      [Cy(0.056, 0.056, 0.17), white, [0, 0.21, 0]], [Cy(0.058, 0.058, 0.05), gold, [0, 0.21, 0]],   // upper habitat module
      [Cy(0.03, 0.056, 0.04), grey, [0, 0.315, 0]], [Cy(0.042, 0.042, 0.08), white, [0, 0.38, 0]], [Cy(0.044, 0.044, 0.02), dark, [0, 0.38, 0]],
      [new THREE.SphereGeometry(0.062, 16, 12), white, [0, 0.48, 0]],             // docking node
      [Cy(0.026, 0.026, 0.07), grey, [0.085, 0.48, 0], [0, 0, Math.PI / 2]], [Cy(0.032, 0.032, 0.012), dark, [0.12, 0.48, 0], [0, 0, Math.PI / 2]],
      [Cy(0.026, 0.026, 0.07), grey, [-0.085, 0.48, 0], [0, 0, Math.PI / 2]], [Cy(0.032, 0.032, 0.012), dark, [-0.12, 0.48, 0], [0, 0, Math.PI / 2]],
      [Cy(0.026, 0.026, 0.07), grey, [0, 0.48, 0.085], [Math.PI / 2, 0, 0]], [Cy(0.032, 0.032, 0.012), dark, [0, 0.48, 0.12], [Math.PI / 2, 0, 0]],
      [Cy(0.04, 0.04, 0.12), white, [0, 0.58, 0]], [Cy(0.042, 0.042, 0.02), dark, [0, 0.62, 0]],        // top module + mast
      [Cy(0.006, 0.006, 0.14, 5), grey, [0, 0.7, 0]],
      [new THREE.SphereGeometry(0.06, 16, 6, 0, Math.PI * 2, 0, 0.75), white, [0.05, 0.68, 0.02], [0.3, 0, -0.9]],   // comms dish
      [Cy(0.004, 0.004, 0.06, 4), grey, [0.07, 0.7, 0.02], [0.3, 0, -0.9]],
      [Cy(0.05, 0.05, 0.16), grey, [0, -0.24, 0]], [Cy(0.052, 0.052, 0.04), gold, [0, -0.2, 0]],   // lower module
      [Cy(0.034, 0.05, 0.04), grey, [0, -0.34, 0]],
      [B(0.05, 0.005, 0.24), rad, [0, -0.4, 0.16]], [B(0.05, 0.005, 0.24), rad, [0, -0.4, -0.16]],   // radiator fins
      [B(0.012, 0.012, 0.1), dark, [0, -0.4, 0.06]], [B(0.012, 0.012, 0.1), dark, [0, -0.4, -0.06]],
      [B(1.04, 0.026, 0.026), grey, [0, -0.56, 0]], [B(0.07, 0.05, 0.05), dark, [0, -0.56, 0]],     // solar truss
      [B(0.03, 0.04, 0.04), dark, [0.345, -0.56, 0]], [B(0.03, 0.04, 0.04), dark, [-0.345, -0.56, 0]],
    ]);
    // solar wings: two either side of the truss, facing the viewer
    const wings = [];
    for (const sx of [-1, 1]) for (const x of [0.26, 0.43]) wings.push(xform(new THREE.PlaneGeometry(0.15, 0.34), [sx * x, -0.553, 0]));
    // shuttle: flies in to the +x port, docks, backs out (animated in tick)
    const shuttle = kitGeo([
      [B(0.075, 0.026, 0.032), white, [0, 0, 0]],
      [new THREE.ConeGeometry(0.018, 0.035, 8), white, [-0.054, 0, 0], [0, 0, Math.PI / 2]],
      [B(0.035, 0.004, 0.09), grey, [0.015, -0.008, 0]],
      [B(0.02, 0.028, 0.004), 0xc8502a, [0.03, 0.02, 0]],
      [B(0.05, 0.028, 0.034), 0xc8502a, [0.0, 0, 0], [0, 0, 0], [0.25, 1.02, 1.02]],
      [Cy(0.012, 0.016, 0.014, 8), dark, [0.043, 0, 0], [0, 0, Math.PI / 2]],
    ]);
    return this._stationKit = {
      ring: ringGeo(0.44, 0.05, 4, 0.085), hull, solar: mergeGeometries(wings), shuttle,
      band: xform(new THREE.TorusGeometry(0.494, 0.009, 5, 160), [0, 0, 0], [Math.PI / 2, 0, 0]),
      hullMat: new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.4, roughness: 0.45 }),
      solarMat: new THREE.MeshStandardMaterial({ map: solarTex(), metalness: 0.6, roughness: 0.3, emissive: 0x2a58c8, emissiveIntensity: 0.28, side: THREE.DoubleSide }),
    };
  }
}
