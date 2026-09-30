// moons.js -- the moons' life around the board.
//
//  * every moon turns slowly on its axis (the board's frame loop applies
//    userData.spin; the rates live here);
//  * Io, Europa and Callisto: small, unlabelled background moons strung along
//    Jupiter's equator, each with its own procedural surface;
//  * the Jovian cards change them for good once anyone plays them:
//      Callisto Penal Mines      -> a lit penal compound (domes, cell blocks,
//                                   fenced perimeter with red blinkers)
//      Io Mining Industries      -> glowing mining rigs + two ore haulers in orbit
//      Water Import From Europa  -> ice-extraction plants + a faint convoy trail
//                                   of water tankers heading for the inner system
//  * Ganymede has four looks from two facts -- a city on the Ganymede Colony
//    space (settlements: domes, built-up ground, lights, a few ships) and
//    Terraforming Ganymede (seas, green land, cloud and a thin blue haze).
//
// Board3D owns the bodies' placement (Jupiter, Ganymede, Phobos); this module
// is handed them as they are built (attachJupiter / attachGanymede /
// attachPhobos) and owns everything that changes with the game.
// board.setMoonState({ ganymedeColony, ganymedeTerraformed, callisto, io, europa }, animate)
// drives it; moonStateOf(view, db, map) derives that from a game view.
// For screenshots: ?moons=colony,terra,callisto,io,europa (any subset) forces
// those on, or call window.app.board.setMoonState({...}, true).
//
// Cost: three small spheres (48x32), one merged structure mesh per moon, one
// Points draw per moon for lights, a couple of tiny instanced ships and one
// line. No lights, no textures; everything is compiled up front (see prewarm)
// so neither the spinning nor a state change ever compiles a shader.
import * as THREE from 'three';
import { SpaceFx } from './space_fx.js';

export const MOON_CARDS = { callisto: 'Callisto Penal Mines', io: 'Io Mining Industries', europa: 'Water Import From Europa', ganymedeTerraformed: 'Terraforming Ganymede' };
const SPIN = { ganymede: 0.06, phobos: 0.085, io: 0.07, europa: 0.05, callisto: 0.04 };   // rad/s: gentle, but you can see it turn
// [x, y (Mars radii from its centre, home view), radius (Mars radii), distance from the home camera]
const LAYOUT = {
  jupiter: [-2.15, 0.964, 0.38, 75],                   // behind the players panel, its equator level with Ganymede Colony
  io: [0, 0, 0.032, 75],
  europa: [0, 0, 0.028, 75],
  callisto: [0, 0, 0.034, 75],
};
// the Galilean moons circle Jupiter in its equatorial plane, seen nearly edge-on:
// [orbit radius (Jupiter radii), period (s), phase (rad; pi/2 = in front of Jupiter's centre)]
const ORBIT = { io: [1.5, 420, Math.PI / 2], europa: [2.05, 900, 2.6], callisto: [2.75, 1800, 5.3] };   // slow: minutes per lap
const KEYS = ['ganymedeColony', 'ganymedeTerraformed', 'callisto', 'io', 'europa'];

// the moon flags of a game view: cards played by either player, and the tile on the Ganymede space
export function moonStateOf(view, db, map) {
  const lower = db._moonIds ||= new Map(db.cards.map((c) => [String(c.name).toLowerCase(), c.id]));
  const played = (name) => {
    const id = lower.get(name.toLowerCase());
    return id != null && view.players.some((p) => (p.played || []).includes(id) || (p.events || []).includes(id));
  };
  const gs = map?.spaces.find((s) => s.kind === 2 && /ganymede/i.test(s.name || ''))?.i;
  const ps = map?.spaces.find((s) => s.kind === 2 && /phobos/i.test(s.name || ''))?.i;
  const off = new Set((map?.spaces || []).filter((s) => s.kind === 2).map((s) => s.i));
  const tiles = view.tiles || [];
  const st = { ganymedeColony: gs != null && tiles.some(([s]) => s === gs) };
  for (const [k, name] of Object.entries(MOON_CARDS)) st[k] = played(name);
  // for the traffic round Mars (space_fx.js): cities on Mars (city / capital tiles), and the Phobos Space Haven
  st.cities = tiles.filter(([s, t]) => (t === 2 || t === 3) && !off.has(s)).length;
  st.phobosHaven = ps != null && tiles.some(([s]) => s === ps);
  // the small moons' lights and ship blinkers wait for the mid game (fade in over generations 4-6)
  st.mid = Math.max(0, Math.min(1, ((view.gen || 1) - 3) / 3));
  return st;
}

// ---------------------------------------------------------------- shaders
const bodyVert = 'varying vec3 vN; varying vec3 vO; varying vec3 vW; void main(){ vO=normalize(position); vN=normalize(mat3(modelMatrix)*normal); vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }';

// settlements: 0..1 "built-up" coverage near the site directions, grown by uK
const SITES_GLSL = (n) => /* glsl */`
uniform vec3 uSites[${n}]; uniform float uSiteR[${n}];
float siteCover(vec3 n, float k, out float ring){
  float t=0.0; ring=0.0;
  if(k<0.001) return 0.0;
  for(int i=0;i<${n};i++){
    float a=acos(clamp(dot(n,uSites[i]),-1.0,1.0));
    float r=uSiteR[i]*k;
    t=max(t,smoothstep(r,r*0.55,a));
    ring=max(ring,smoothstep(r*0.1,0.0,abs(a-r*1.12)));
  }
  return t;
}
// blocky "buildings" at scale s: 0 ground .. 1 roof
float blocks(vec3 n, float s){ vec3 c=floor(n*s); vec3 h=hash3(c); return step(0.45,h.x)*(0.6+0.4*h.y); }
`;

function ganymedeFrag(noise, nSites) {
  return /* glsl */`uniform vec3 uSun; uniform float uTerra; uniform float uColony; uniform float uTime; uniform vec3 uOrigin;
    varying vec3 vN; varying vec3 vO; varying vec3 vW;
    ${noise}
    ${SITES_GLSL(nSites)}
    void main(){
      vec3 n=vO;
      // ice: dark ancient regions crossed by bright grooved terrain
      float dark=smoothstep(-0.05,0.3,fbm(n*1.4+vec3(1.7),6));
      vec3 w=n*4.0+vec3(fbm(n*2.0,3),fbm(n*2.0+3.1,3),0.0)*1.5;
      float grooves=0.5+0.5*sin(dot(w,vec3(3.0,1.0,2.0))*5.0);
      vec3 old=vec3(0.33,0.29,0.25), young=vec3(0.80,0.78,0.74);
      vec3 col=mix(young*(0.82+0.18*grooves),old*(0.9+0.2*fbm(n*9.0,3)),dark);
      vec2 cr=craters(n*7.0); col=mix(col,vec3(0.95,0.95,0.97),cr.y*0.55);
      vec2 cr2=craters(n*19.0+2.0); col=mix(col,col*1.12,cr2.y*0.4);
      col=mix(col,vec3(0.9,0.92,0.96),smoothstep(0.72,0.95,abs(n.y))*0.45);
      vec3 N=normalize(vN); float sd=dot(N,uSun);
      float d=max(sd,0.0);
      float night=1.0-smoothstep(-0.2,0.2,sd);
      // settlements (a city on the colony space): excavated grey ground,
      // blocks of buildings, a ring road, and a warm glow that owns the night side
      float ring, town=0.0, blk=0.0;
      if(uColony>0.001){
        town=siteCover(n,uColony,ring);
        blk=blocks(n,70.0)*town;
        float blk2=blocks(n+vec3(0.37),150.0)*town;
        col=mix(col,vec3(0.16,0.16,0.17)+vec3(0.5,0.52,0.56)*max(blk,blk2*0.7),town*0.9);
        col=mix(col,vec3(0.55,0.55,0.52),ring*0.6);
      }
      vec3 ice=col*(0.12+1.1*d);
      vec3 outc=ice;
      if(uTerra>0.001){
        // terraformed: seas in the lowlands, green land with the grooves as dry ridges,
        // polar caps, drifting cloud and a blue rim -- spreading outward from uOrigin
        float front=smoothstep(0.0,0.3,uTerra*2.3-(1.0-dot(n,uOrigin)));
        float h=fbm(n*1.6+vec3(4.0),6);
        float sea=smoothstep(0.03,-0.02,h)*(1.0-town);
        vec3 land=mix(vec3(0.24,0.45,0.15),vec3(0.11,0.29,0.10),dark);
        land=mix(land,vec3(0.52,0.50,0.32),smoothstep(0.6,0.95,grooves)*0.5*(1.0-dark));
        land=mix(land,vec3(0.55,0.62,0.30),smoothstep(0.1,0.03,h)*0.4);
        land*=0.85+0.3*fbm(n*9.0,3);
        vec3 water=mix(vec3(0.03,0.11,0.30),vec3(0.07,0.33,0.48),smoothstep(-0.16,0.0,h));
        vec3 tc=mix(land,water,sea);
        tc=mix(tc,vec3(0.92,0.95,0.98),smoothstep(0.8,0.93,abs(n.y)));
        tc=mix(tc,vec3(0.30,0.30,0.30)+vec3(0.45)*blk,town*0.85);                 // cities in the green
        float cl=smoothstep(0.18,0.62,fbm(n*2.6+vec3(uTime*0.012,0.0,uTime*0.008),5))*0.75;
        vec3 V=normalize(cameraPosition-vW);
        float spec=pow(max(dot(reflect(-uSun,N),V),0.0),28.0)*sea*(1.0-cl)*0.6;
        vec3 terra=tc*(0.02+1.1*d)+vec3(0.9,0.85,0.7)*spec;
        terra=mix(terra,vec3(0.96)*(0.02+1.05*d),cl*smoothstep(-0.3,0.1,sd));        // cloud fades out into the night
        float rim=pow(1.0-max(dot(N,V),0.0),2.6);
        terra+=vec3(0.3,0.55,1.0)*rim*(0.1+0.9*smoothstep(-0.25,0.5,sd))*0.8;
        outc=mix(ice,terra,front);
      }
      // settlement light: warm windows, strongest at night
      outc+=vec3(1.0,0.6,0.25)*town*(blk*0.9+0.15)*(0.3+1.1*night)*uColony;
      gl_FragColor=vec4(outc,1.0);
      #include <colorspace_fragment>
    }`;
}

// Io: sulphur yellows and oranges, white SO2 frost, black paterae ringed in red
// plume deposits, lava glowing in them on the night side. uK: the mines.
function ioFrag(noise) {
  return /* glsl */`uniform vec3 uSun; uniform float uK; uniform float uTime; varying vec3 vN; varying vec3 vO; varying vec3 vW;
    ${noise}
    ${SITES_GLSL(4)}
    void main(){
      vec3 n=vO;
      float f1=fbm(n*2.1+vec3(3.1),5), f2=fbm(n*4.6+vec3(7.0),4), f3=fbm(n*9.0,3);
      vec3 yel=vec3(0.78,0.60,0.13), ora=vec3(0.66,0.28,0.05), wht=vec3(0.82,0.80,0.58), brn=vec3(0.24,0.10,0.035);
      vec3 col=mix(yel,ora,smoothstep(-0.25,0.4,f1));
      col=mix(col,wht,smoothstep(0.18,0.5,f2)*0.65);
      col*=0.88+0.24*f3;
      col=mix(col,brn,smoothstep(0.5,0.92,abs(n.y+0.08*f1))*0.8);         // dusky red-brown poles
      vec2 p1=craters(n*4.0+vec3(1.3)), p2=craters(n*9.0+vec3(5.1));
      float pat=smoothstep(0.25,0.8,-p1.x)+smoothstep(0.4,0.9,-p2.x)*0.8;
      col=mix(col,vec3(0.6,0.16,0.04),smoothstep(0.0,1.0,p1.y)*0.55);    // red plume rings
      col=mix(col,vec3(0.025,0.018,0.012),clamp(pat,0.0,1.0));             // black paterae
      vec3 N=normalize(vN); float sd=dot(N,uSun);
      float lit=smoothstep(-0.1,0.7,sd), night=1.0-smoothstep(-0.25,0.15,sd);
      vec3 c=col*(0.05+1.25*lit);
      float lava=smoothstep(0.75,0.98,-p1.x)+smoothstep(0.85,1.0,-p2.x)*0.7;
      c+=vec3(1.0,0.32,0.04)*lava*(0.04+0.95*night)*(0.8+0.2*sin(uTime*1.3+f2*9.0));
      // the mines: grey terraced pits, haul roads, smelter glow
      float ring, pit=siteCover(n,uK,ring);
      float b=blocks(n,55.0)*pit;
      c=mix(c,(vec3(0.20,0.19,0.17)+vec3(0.3)*b)*(0.1+1.1*lit),pit*0.85);
      c+=vec3(1.0,0.5,0.12)*pit*(0.2+0.6*b)*(0.5+1.0*night)*uK;
      gl_FragColor=vec4(c,1.0);
      #include <colorspace_fragment>
    }`;
}

// Europa: pale water ice, brownish chaos terrain, criss-crossed by long
// reddish lineae (dark double ridges with a pale medial line). uK: the plants.
function europaFrag(noise) {
  return /* glsl */`uniform vec3 uSun; uniform float uK; uniform float uTime; varying vec3 vN; varying vec3 vO; varying vec3 vW;
    ${noise}
    ${SITES_GLSL(4)}
    void main(){
      vec3 n=vO;
      float m=fbm(n*2.6+vec3(2.0),5);
      vec3 col=mix(vec3(0.80,0.77,0.70),vec3(0.52,0.38,0.25),smoothstep(0.05,0.55,m)*0.75);   // chaos terrain
      col*=0.92+0.12*fbm(n*11.0,3);
      col=mix(col,vec3(0.86,0.86,0.86),smoothstep(0.6,0.95,abs(n.y))*0.35);
      float L=0.0;
      for(int i=0;i<11;i++){
        vec3 h=hash3(vec3(float(i)*7.13,1.7,3.9));
        vec3 ax=normalize(h*2.0-1.0);
        float off=(h.z-0.5)*0.9;
        float wob=fbm(n*2.3+ax*4.0,2)*0.06;
        float dd=abs(dot(n,ax)-off+wob);
        float wdt=0.006+0.012*h.y;
        float band=smoothstep(wdt,wdt*0.3,dd)*(0.45+0.55*h.x);
        band*=smoothstep(-0.2,0.35,fbm(n*1.7+ax*9.0,2)+0.15);               // lineae fade in and out along their length
        L=max(L,band*(1.0-0.55*smoothstep(wdt*0.35,0.0,dd)));               // dark double ridge, paler centre
      }
      col=mix(col,vec3(0.30,0.11,0.045),L*0.9);
      vec2 cr=craters(n*6.0+vec3(3.0)); col=mix(col,vec3(0.9,0.88,0.84),cr.y*0.25);
      vec3 N=normalize(vN); float sd=dot(N,uSun);
      float lit=smoothstep(-0.1,0.7,sd), night=1.0-smoothstep(-0.25,0.15,sd);
      vec3 V=normalize(cameraPosition-vW);
      float spec=pow(max(dot(reflect(-uSun,N),V),0.0),18.0)*0.15;
      vec3 c=col*(0.05+1.2*lit)+vec3(spec);
      // the ice plants: cleared pads, pipelines, blue-white work lights
      float ring, pad=siteCover(n,uK,ring);
      float b=blocks(n,60.0)*pad;
      c=mix(c,(vec3(0.42,0.46,0.50)+vec3(0.35)*b)*(0.08+1.1*lit),pad*0.8);
      c+=vec3(0.55,0.8,1.0)*pad*(0.15+0.55*b)*(0.45+1.0*night)*uK;
      gl_FragColor=vec4(c,1.0);
      #include <colorspace_fragment>
    }`;
}

// Callisto: dark, the most cratered body there is, bright fresh craters and
// the Valhalla ring basin. uK: the penal colony (a fenced compound).
function callistoFrag(noise) {
  return /* glsl */`uniform vec3 uSun; uniform float uK; uniform float uTime; varying vec3 vN; varying vec3 vO; varying vec3 vW;
    ${noise}
    ${SITES_GLSL(4)}
    void main(){
      vec3 n=vO;
      float g=fbm(n*2.4,5);
      vec3 col=mix(vec3(0.045,0.038,0.031),vec3(0.12,0.10,0.082),smoothstep(-0.3,0.45,g));
      col*=0.85+0.3*fbm(n*14.0,3);
      vec2 c1=craters(n*5.0), c2=craters(n*11.0+vec3(2.0)), c3=craters(n*26.0+vec3(5.0));
      col*=1.0+0.25*(c1.x+c2.x*0.6);                                            // shallow, degraded bowls
      col=mix(col,vec3(0.42,0.40,0.37),c1.y*0.18+c2.y*0.16);
      // bright spots: fresh craters and their ejecta, many small, a few large
      float sp=smoothstep(0.6,0.0,-c3.x-0.2)*step(0.0001,-c3.x)*step(0.7,hash3(floor(n*26.0+vec3(5.0))).z);
      float sp2=smoothstep(0.9,0.2,-c2.x)*step(0.0001,-c2.x)*step(0.8,hash3(floor(n*11.0+vec3(2.0))).z);
      col=mix(col,vec3(0.62,0.60,0.56),clamp(sp*0.7+sp2*0.5+c3.y*0.25,0.0,1.0));
      vec3 vh=normalize(vec3(0.35,0.3,0.88));                                  // Valhalla
      float a=acos(clamp(dot(n,vh),-1.0,1.0));
      col=mix(col,vec3(0.42,0.40,0.36),smoothstep(0.28,0.0,a)*0.6);
      col=mix(col,vec3(0.36,0.34,0.30),(0.5+0.5*cos(a*55.0))*smoothstep(0.85,0.25,a)*smoothstep(0.15,0.3,a)*0.35);
      vec3 N=normalize(vN); float sd=dot(N,uSun);
      float lit=smoothstep(-0.1,0.7,sd), night=1.0-smoothstep(-0.25,0.15,sd);
      vec3 c=col*(0.06+1.35*lit);
      // the penal compound: cleared ground, cell blocks, a lit perimeter fence
      float ring, yard=siteCover(n,uK,ring);
      float b=blocks(n,70.0)*yard;
      c=mix(c,(vec3(0.24,0.23,0.22)+vec3(0.4)*b)*(0.1+1.1*lit),yard*0.85);
      c+=vec3(1.0,0.78,0.45)*yard*(0.15+0.6*b)*(0.5+1.0*night)*uK;
      c+=vec3(1.0,0.85,0.6)*ring*0.5*(0.3+night)*uK;
      gl_FragColor=vec4(c,1.0);
      #include <colorspace_fragment>
    }`;
}

// structures on a moon's surface: parts rise out of the ground (uGrow), lit
// by the sun, with warm windows that glow hardest on the night side
function kitMaterial(SUN, glow) {
  return new THREE.ShaderMaterial({
    uniforms: { uSun: { value: SUN.clone() }, uGrow: { value: 0 }, uGlowCol: { value: new THREE.Color(glow) } },
    vertexShader: `attribute vec3 aBase; attribute vec3 aCol; attribute float aGlow; uniform float uGrow;
      varying vec3 vN; varying vec3 vC; varying float vG; varying vec3 vW; varying vec3 vUp;
      void main(){
        vec3 p=aBase+(position-aBase)*uGrow;
        vN=normalize(mat3(modelMatrix)*normal); vUp=normalize(mat3(modelMatrix)*aBase); vC=aCol; vG=aGlow;
        vec4 w=modelMatrix*vec4(p,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w;
      }`,
    fragmentShader: `uniform vec3 uSun; uniform vec3 uGlowCol; varying vec3 vN; varying vec3 vC; varying float vG; varying vec3 vW; varying vec3 vUp;
      void main(){
        vec3 N=normalize(vN), V=normalize(cameraPosition-vW);
        float d=max(dot(N,uSun),0.0);
        float night=1.0-smoothstep(-0.15,0.35,dot(vUp,uSun));
        float spec=pow(max(dot(reflect(-uSun,N),V),0.0),30.0);
        float fr=pow(1.0-max(dot(N,V),0.0),3.0);
        vec3 col=vC*(0.1+1.0*d)+vec3(spec*0.45)+vC*fr*0.15;
        col+=uGlowCol*vG*(0.3+1.0*night);
        gl_FragColor=vec4(col,1.0);
        #include <colorspace_fragment>
      }`,
  });
}

// small ships: instanced, lit by the sun like the kit
function shipMaterial(SUN) {
  return new THREE.ShaderMaterial({
    uniforms: { uSun: { value: SUN.clone() } },
    vertexShader: `attribute vec3 aCol; varying vec3 vN; varying vec3 vC;
      void main(){
        mat4 m=modelMatrix;
        #ifdef USE_INSTANCING
        m=m*instanceMatrix;
        #endif
        vN=normalize(mat3(m)*normal); vC=aCol; gl_Position=projectionMatrix*viewMatrix*m*vec4(position,1.0);
      }`,
    fragmentShader: `uniform vec3 uSun; varying vec3 vN; varying vec3 vC;
      void main(){ float d=max(dot(normalize(vN),uSun),0.0); gl_FragColor=vec4(vC*(0.18+1.0*d),1.0);
        #include <colorspace_fragment>
      }`,
  });
}

// the global exposure (board3d EXPOSURE) on a lit body's shader: scale its
// linear colour just before the colour-space conversion (or at the very end)
function dimShader(mat, k) {
  if (!mat || mat.userData.dimmed || k == null || k === 1) return mat;
  const line = `gl_FragColor.rgb*=${k.toFixed(3)};\n`, fs = mat.fragmentShader;
  mat.fragmentShader = fs.includes('#include <colorspace_fragment>') ? fs.replace('#include <colorspace_fragment>', line + '#include <colorspace_fragment>') : fs.replace(/\}\s*$/, line + '}');
  mat.userData.dimmed = true;
  mat.needsUpdate = true;
  return mat;
}

// ---------------------------------------------------------------- geometry kit
const HEMI = () => new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
const BOX = () => new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
const CYL = (n = 8) => new THREE.CylinderGeometry(0.5, 0.5, 1, n).translate(0, 0.5, 0);

// a local frame on the sphere at unit direction d: x east, y out, z north
function frameAt(d) {
  const up = d.clone().normalize();
  const ref = Math.abs(up.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const east = ref.clone().cross(up).normalize(), north = up.clone().cross(east);
  return { up, east, north };
}
// merge surface parts: {geo, d (unit dir of the part's base), rad (sphere radius),
// s [sx,sy,sz], yaw, col, glow, sink}. aBase = the part's own foot, so it rises from the ground.
function surfaceKit(parts) {
  const gs = [], M = new THREE.Matrix4(), Q = new THREE.Quaternion(), c = new THREE.Color();
  for (const p of parts) {
    const { up, east, north } = frameAt(p.d);
    const base = up.clone().multiplyScalar(p.rad * (1 - (p.sink ?? 0.004)));
    M.makeBasis(east, up, north);
    Q.setFromRotationMatrix(M).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.yaw || 0));
    let g = p.geo.index ? p.geo.toNonIndexed() : p.geo;
    g.deleteAttribute('uv');
    g.applyMatrix4(new THREE.Matrix4().compose(base, Q, new THREE.Vector3(...p.s)));
    const n = g.attributes.position.count;
    c.set(p.col);
    const col = new Float32Array(n * 3), bs = new Float32Array(n * 3), gl = new Float32Array(n);
    for (let i = 0; i < n; i++) { col.set([c.r, c.g, c.b], i * 3); bs.set([base.x, base.y, base.z], i * 3); gl[i] = p.glow || 0; }
    g.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aBase', new THREE.BufferAttribute(bs, 3));
    g.setAttribute('aGlow', new THREE.BufferAttribute(gl, 1));
    gs.push(g);
  }
  return mergeAttrs(gs, ['position', 'normal', 'aCol', 'aBase', 'aGlow']);
}
// hand-merge non-indexed geometries that share an attribute set
function mergeAttrs(gs, names) {
  const out = new THREE.BufferGeometry();
  for (const nm of names) {
    const size = gs[0].attributes[nm].itemSize, total = gs.reduce((s, g) => s + g.attributes[nm].count, 0);
    const arr = new Float32Array(total * size);
    let o = 0;
    for (const g of gs) { arr.set(g.attributes[nm].array, o); o += g.attributes[nm].array.length; }
    out.setAttribute(nm, new THREE.BufferAttribute(arr, size));
  }
  for (const g of gs) g.dispose();
  return out;
}
// a small freighter, nose along -z: hull, ore pod, cab
function shipGeo() {
  const parts = [[[0.5, 0.35, 1.0], [0, 0, 0], 0x8d8f93], [[0.66, 0.32, 0.55], [0, 0, 0.18], 0xb07a3a], [[0.3, 0.2, 0.25], [0, 0.18, -0.42], 0xdfe3e8]];
  return mergeAttrs(parts.map(([s, t, col]) => {
    const g = new THREE.BoxGeometry(...s).translate(...t).toNonIndexed();
    g.deleteAttribute('uv');
    const c = new THREE.Color(col), a = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < a.length; i += 3) { a[i] = c.r; a[i + 1] = c.g; a[i + 2] = c.b; }
    g.setAttribute('aCol', new THREE.BufferAttribute(a, 3));
    return g;
  }), ['position', 'normal', 'aCol']);
}
// a point `ang` radians from d toward heading `hd` (radians round d)
function offsetDir(d, ang, hd) {
  const { up, east, north } = frameAt(d);
  const t = east.clone().multiplyScalar(Math.cos(hd)).addScaledVector(north, Math.sin(hd));
  return up.clone().multiplyScalar(Math.cos(ang)).addScaledVector(t, Math.sin(ang)).normalize();
}
// sites spread round a moon so one always faces the viewer as it turns
function ringSites(n, lat0, seed, rnd) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const lon = seed + i * Math.PI * 2 / n + (rnd() - 0.5) * 0.5, lat = lat0 + (rnd() - 0.5) * 0.5;
    out.push(new THREE.Vector3(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)));
  }
  return out;
}

// ---------------------------------------------------------------- the system
export class MoonFx {
  constructor(board, H) {
    this.b = board;
    this.H = H;                     // { SUN, noiseGLSL, navLightMaterial, navPoints, srand, disposeTree }
    this.state = Object.fromEntries(KEYS.map((k) => [k, false]));
    this.small = null;              // { io, europa, callisto } once Jupiter exists
    this.gany = null;
    this.warm = 0;                  // frames left to draw every state object (see tick)
    this.force = null;
    try {
      const q = new URLSearchParams(location.search).get('moons');
      if (q != null) { const on = q.split(',').map((s) => s.trim().toLowerCase()); this.force = { ganymedeColony: on.includes('colony'), ganymedeTerraformed: on.includes('terra'), callisto: on.includes('callisto'), io: on.includes('io'), europa: on.includes('europa') }; }
    } catch {}
    // the space round Mars: traffic, stars, glare, streaks
    this.space = new SpaceFx(board, { ...H, shipGeo, shipMaterial, dim: (m) => this.dim(m) });
  }

  // a new map: every moon back to untouched, instantly (the view that follows re-applies the game's state)
  reset() {
    this.space.reset();
    for (const k of KEYS) this.state[k] = false;
    if (this.small) for (const m of Object.values(this.small)) m.set(false, false);
    this.gany = null;               // rebuilt by the new map's Ganymede cell
    this.applyForce();
  }
  applyForce() { if (this.force) this.setState({}, false); }

  setState(s, animate) {
    this.space.setState(s);
    if (s.mid != null) this.midK = s.mid;
    for (const k of KEYS) if (s[k] != null) this.state[k] = !!s[k];
    const st = this.force ? { ...this.state, ...this.force } : this.state;
    if (this.small) for (const k of ['io', 'europa', 'callisto']) this.small[k].set(st[k], animate);
    const g = this.gany;
    if (g) {
      if ((s.ganymedeColony != null || this.force) && !!st.ganymedeColony !== !!g.target) g.setOwner(st.ganymedeColony ? this.colonyColor(g) : null, animate);
      g.fx.terra(st.ganymedeTerraformed, animate);
    }
  }
  colonyColor(g) {
    const t = this.b.tiles?.get(g.space);
    return t ? this.b.playerColors[+t.userData.key.split(':')[1]] ?? 0xffffff : this.b.playerColors?.[0] ?? 0xffffff;
  }

  // prewarm: after anything is built, every state object renders (invisibly: faded or
  // grown to 0) for a few frames, so its shader compiles now and not when a card is played
  get warming() { return this.warm > 0; }
  tick(t, dt) {
    this.space.tick(t, dt);
    if (this.warm > 0 && --this.warm === 0) this.syncVisibility();
    const H = this.b.renderer.domElement.height, pr = this.b.renderer.getPixelRatio();
    if (this.small) { this.moveMoons(t); for (const m of (this.smallList ||= Object.values(this.small))) { m.mesh.rotation.y += dt * m.mesh.userData.spin; m.tick(t, dt, H, pr); } }
  }
  syncVisibility() {
    if (this.small) for (const m of Object.values(this.small)) m.vis();
    this.gany?.fx?.vis();
  }

  // ---------------------------------------------------------------- Phobos
  attachPhobos(st) { st.phobos.userData.spin = SPIN.phobos; this.dim(st.phobos.material); }
  dim(mat) { return dimShader(mat, this.H.EXPOSURE); }

  // ---------------------------------------------------------------- Ganymede
  ganymedeMaterial() {
    const { SUN, noiseGLSL } = this.H;
    const sites = this.ganySites();
    return this.dim(new THREE.ShaderMaterial({
      uniforms: {
        uSun: { value: SUN.clone() }, uTerra: { value: 0 }, uColony: { value: 0 }, uTime: { value: 0 }, uOrigin: { value: new THREE.Vector3(0, 0, 1) },
        uSites: { value: sites.map((s) => s.d) }, uSiteR: { value: sites.map((s) => s.r) },
      },
      vertexShader: bodyVert,
      fragmentShader: ganymedeFrag(noiseGLSL, sites.length),
    }));
  }
  // the settlement clusters: the same centres board3d's colony lights use (makeGanymedeHaven)
  ganySites() {
    if (this._gs) return this._gs;
    const out = [], fib = 14, r = this.H.srand(77);
    for (let i = 0; i < fib; i++) {
      const y = 1 - (i + 0.5) / fib * 2, a = i * 2.4 + 0.4, rr = Math.sqrt(1 - y * y);
      out.push({ d: new THREE.Vector3(Math.cos(a) * rr, y * 0.85, Math.sin(a) * rr).normalize(), r: 0.11 + r() * 0.06 });
    }
    return (this._gs = out);
  }

  // g: board3d's Ganymede haven ({ moon, halo, lights, fleet, setK, setOwner, k, space })
  attachGanymede(g) {
    const fx = this, moon = g.moon, mat = moon.material, rad = moon.geometry.parameters.radius;
    moon.userData.spin = SPIN.ganymede;
    // domes: a big one and a few small round each settlement, with a mast or two
    const r = this.H.srand(911), parts = [];
    const glass = 0xbcd6e6, hull = 0x9aa0a8;
    for (const { d, r: sr } of this.ganySites()) {
      parts.push({ geo: HEMI(), d, rad, s: [0.05 * rad, 0.034 * rad, 0.05 * rad], col: glass, glow: 0.55 });
      const n = 3 + Math.floor(r() * 3);
      for (let i = 0; i < n; i++) {
        const dd = offsetDir(d, sr * (0.35 + r() * 0.5), r() * 6.28), s = (0.014 + r() * 0.014) * rad;
        parts.push({ geo: HEMI(), d: dd, rad, s: [s, s * 0.75, s], col: glass, glow: 0.45 });
      }
      parts.push({ geo: CYL(6), d: offsetDir(d, sr * 0.3, r() * 6.28), rad, s: [0.006 * rad, 0.06 * rad, 0.006 * rad], col: hull, glow: 0.2 });
      parts.push({ geo: BOX(), d: offsetDir(d, sr * 0.55, r() * 6.28), rad, yaw: r() * 3, s: [0.03 * rad, 0.012 * rad, 0.016 * rad], col: hull, glow: 0.35 });
    }
    const kmat = this.dim(kitMaterial(this.H.SUN, 0xffb866));
    this.dim(g.halo.material);
    const kit = new THREE.Mesh(surfaceKit(parts), kmat);
    kit.frustumCulled = false;
    moon.add(kit);

    // the owner's tile drives the colony (board3d setOwner -> setK); remember what it asked for,
    // and let a forced state (?moons=) win over the tiles
    const so = g.setOwner;
    g.setOwner = (pc, animate) => {
      if (fx.force && fx.force.ganymedeColony != null) pc = fx.force.ganymedeColony ? (pc ?? fx.colonyColor(g)) : null;
      g.target = pc != null;
      so(pc, animate);
    };
    let T = 0, tok = null;
    const apply = () => {
      mat.uniforms.uColony.value = g.k;
      mat.uniforms.uTerra.value = T;
      kmat.uniforms.uGrow.value = g.k;
      g.halo.material.uniforms.uK.value = T;
      if (!fx.warming) { kit.visible = g.lights.visible = g.fleet.visible = g.k > 0.001; g.halo.visible = T > 0.001; }
    };
    g.fx = {
      colony: apply,            // board3d setK calls this as the colony comes and goes
      vis: apply,
      terra: (on, animate) => {
        const to = on ? 1 : 0;
        if (tok ? tok.to === to : T === to) return;
        if (to && T === 0 && !g.target) {        // no settlement to spread from: green outward from the face we see
          moon.updateMatrixWorld();
          mat.uniforms.uOrigin.value.copy(moon.worldToLocal(fx.b.camera.position.clone())).normalize();
        }
        const from = T, me = tok = { to };
        if (!animate) { T = to; tok = null; apply(); return; }
        fx.b.tween(to ? 2600 : 900, (k) => { if (tok !== me) return; T = from + (to - from) * k; apply(); }, () => { if (tok === me) tok = null; });
      },
    };
    this.gany = g;
    g.target = false;
    this.warm = 4;
    kit.visible = g.halo.visible = g.lights.visible = g.fleet.visible = true;
    this.setState({}, false);
  }

  // ---------------------------------------------------------------- Jupiter's small moons
  // The Jovian system is laid out on screen, in Mars radii from Mars' centre
  // at the home view (x right, y up), at distance d from the home camera, so
  // it keeps its place relative to the globe on every screen shape: Jupiter
  // low and far out left (partly behind the player boards on a laptop, clear
  // of them on a big screen or a phone held sideways), its moons in the free
  // sky below and to the right of it.
  screenAt(sx, sy, d) {
    const home = this.b.home, D = home.length(), R = this.b.planet.geometry.parameters.radius;
    const f = home.clone().normalize(), hr = new THREE.Vector3(1, 0, 0), hu = f.clone().cross(hr).normalize();
    const k = R * d / D;
    return home.clone().addScaledVector(f, -d).addScaledVector(hr, sx * k).addScaledVector(hu, sy * k);
  }
  sizeAt(s, d) { return s * this.b.planet.geometry.parameters.radius * d / this.b.home.length(); }
  placeJupiter(J) {
    const [sx, sy, s, d] = LAYOUT.jupiter;
    J.position.copy(this.screenAt(sx, sy, d));
    this.dim(J.material);
    // the moons' shadows on the cloud tops (a transit): up to three dark spots, object-space centres + angular radii
    const m = J.material;
    m.uniforms.uShd = { value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] };
    m.uniforms.uShdR = { value: [0, 0, 0] };
    m.fragmentShader = 'uniform vec3 uShd[3]; uniform float uShdR[3];\n' + m.fragmentShader.replace('#include <colorspace_fragment>',
      'for(int i=0;i<3;i++){ if(uShdR[i]>0.0){ float dd=acos(clamp(dot(normalize(vO),uShd[i]),-1.0,1.0)); gl_FragColor.rgb*=1.0-0.82*smoothstep(uShdR[i],uShdR[i]*0.55,dd); } }\n#include <colorspace_fragment>');
    m.needsUpdate = true;
    J.scale.setScalar(this.sizeAt(s, d) / J.geometry.parameters.radius);
  }
  attachJupiter(J) {
    if (this.small) return;
    // the orbit plane: Jupiter's equator (screen-right, tipped with Jupiter's own roll), seen nearly edge-on from a little above
    const RJ = this.sizeAt(LAYOUT.jupiter[2], LAYOUT.jupiter[3]), toCam = this.b.home.clone().sub(J.position).normalize();
    // exactly Jupiter's equatorial plane: perpendicular to its pole (local Y -- the axis its bands are drawn around)
    const pole = new THREE.Vector3(0, 1, 0).applyQuaternion(J.quaternion).normalize();
    const u = pole.clone().cross(toCam).normalize();                   // across the screen, in the equator
    const w = u.clone().cross(pole).normalize();                       // in the equator, toward the viewer
    this.orbit = { J, RJ, u, w, P: new THREE.Vector3(), hit: new THREE.Vector3() };
    const P = (k) => { const [, , s, d] = LAYOUT[k]; return [this.orbitPos(k, 0, new THREE.Vector3()), this.sizeAt(s, d)]; };
    this.small = {
      io: this.makeIo(...P('io')),
      europa: this.makeEuropa(...P('europa')),
      callisto: this.makeCallisto(...P('callisto')),
    };
    this.warm = 4;
    this.setState({}, false);
  }
  orbitPos(k, t, out) {
    const o = this.orbit, [R, T, ph] = ORBIT[k], a = ph + t * Math.PI * 2 / T;
    return out.copy(o.J.position).addScaledVector(o.u, Math.cos(a) * R * o.RJ).addScaledVector(o.w, Math.sin(a) * R * o.RJ);
  }
  // each moon on its orbit (and whatever travels with it), and its shadow on Jupiter
  moveMoons(t) {
    const o = this.orbit, J = o.J, sun = this.H.SUN, sh = J.material.uniforms.uShd.value, shr = J.material.uniforms.uShdR.value;
    let i = 0;
    for (const k of ['io', 'europa', 'callisto']) {
      const m = this.small[k];
      this.orbitPos(k, t, m.mesh.position);
      for (const g of m.follow || []) g.position.copy(m.mesh.position);
      // its shadow (faked): where the moon sits over Jupiter's disc as seen from
      // the camera, nudged a little away from the sun -- only while the moon is in front of the planet
      const cam = this.b.camera.position, dir = o.P.copy(m.mesh.position).sub(cam), dl = dir.length(); dir.divideScalar(dl);
      const c = o.hit.copy(cam).sub(J.position), bb = c.dot(dir), disc = bb * bb - (c.lengthSq() - o.RJ * o.RJ);
      const front = m.mesh.position.distanceTo(cam) < J.position.distanceTo(cam);
      if (front && disc > 0) {
        o.hit.copy(cam).addScaledVector(dir, -bb - Math.sqrt(disc));                 // the front of Jupiter, behind the moon
        o.hit.addScaledVector(sun, -o.RJ * 0.2).sub(J.position).setLength(o.RJ).add(J.position);
        sh[i].copy(J.worldToLocal(o.hit)).normalize();
        shr[i] = m.rad / o.RJ * 1.25;
      } else shr[i] = 0;
      i++;
    }
  }

  // a small moon: body + surface kit + lights, and a per-moon state tween
  smallMoon(name, pos, rad, frag, tilt, kitParts, lightList, glowCol, sites) {
    const { SUN, navLightMaterial, navPoints } = this.H;
    const mat = this.dim(new THREE.ShaderMaterial({
      uniforms: { uSun: { value: SUN.clone() }, uK: { value: 0 }, uTime: { value: 0 }, uSites: { value: sites.map((s) => s.d) }, uSiteR: { value: sites.map((s) => s.r) } },
      vertexShader: bodyVert, fragmentShader: frag,
    }));
    const mesh = new THREE.Mesh(this.sphere ||= new THREE.SphereGeometry(1, 48, 32), mat);
    mesh.geometry.userData.shared = true;
    mesh.position.copy(pos);
    mesh.scale.setScalar(rad);
    mesh.rotation.set(tilt[0], tilt[1], tilt[2]);
    mesh.userData.spin = SPIN[name];
    this.b.scene.add(mesh);                // (spun here, not via board.moons: the board reads its last entry as Ganymede)
    const kmat = this.dim(kitMaterial(SUN, glowCol));
    const kit = new THREE.Mesh(surfaceKit(kitParts), kmat);
    kit.frustumCulled = false;
    mesh.add(kit);
    const lmat = navLightMaterial(1, 1);
    const lights = navPoints(lmat, lightList);
    mesh.add(lights);
    const m = {
      name, mesh, mat, kit, kmat, lights, lmat, rad, k: 0, tok: null, extras: [],
      set: (on, animate) => {
        const to = on ? 1 : 0;
        if (m.tok ? m.tok.to === to : m.k === to) return;
        const from = m.k, me = m.tok = { to };
        if (!animate) { m.tok = null; m.setK(to); return; }
        this.b.tween(to ? 2400 : 800, (k) => { if (m.tok === me) m.setK(from + (to - from) * k); }, () => { if (m.tok === me) m.tok = null; });
      },
      setK: (k) => {
        m.k = k;
        mat.uniforms.uK.value = k;
        kmat.uniforms.uGrow.value = Math.min(1, k * 1.25);
        lmat.uniforms.uFade.value = Math.max(0, k * 1.5 - 0.5);          // lights once the ground is built
        m.vis();
      },
      vis: () => {
        if (this.warming) return;
        const on = m.k > 0.001;
        kit.visible = lights.visible = on;
        for (const e of m.extras) e.visible = on;
      },
      tick: (t, dt, H, pr) => {
        mat.uniforms.uTime.value = t;
        if (m.k <= 0.001 && !this.warming) return;
        lmat.uniforms.uTime.value = t; lmat.uniforms.uH.value = H; lmat.uniforms.uMin.value = 2.0 * pr;
        lmat.uniforms.uFade.value = Math.max(0, m.k * 1.5 - 0.5) * (this.midK ?? 1);   // lights: built ground AND mid game
        m.onTick?.(t, H, pr);
      },
    };
    m.setK(0);
    return m;
  }

  makeIo(pos, rad) {
    const r = this.H.srand(401);
    const sites = ringSites(4, 0.15, 0.6, r).map((d) => ({ d, r: 0.24 + r() * 0.05 }));
    const parts = [], L = [];
    for (const { d, r: sr } of sites) {
      // rigs: lattice derricks with a crane arm, a squat smelter with stacks, ore bins
      for (let i = 0; i < 3; i++) {
        const dd = offsetDir(d, sr * (0.15 + 0.5 * r()), r() * 6.28);
        parts.push({ geo: CYL(4), d: dd, rad: 1, s: [0.025, 0.16, 0.025], col: 0x8a8f96, glow: 0.15 });
        parts.push({ geo: BOX(), d: offsetDir(dd, 0.03, r() * 6.28), rad: 1, yaw: r() * 3, s: [0.1, 0.018, 0.018], col: 0xd9a441, glow: 0 });
        L.push({ p: dd.clone().multiplyScalar(1.17).toArray(), c: 0xff4a2a, rate: 0.7, ph: r(), s: 0.035 });       // derrick-top beacon
      }
      const sm = offsetDir(d, sr * 0.1, r() * 6.28);
      parts.push({ geo: BOX(), d: sm, rad: 1, yaw: r() * 3, s: [0.12, 0.05, 0.08], col: 0x6c6f74, glow: 0.6 });
      parts.push({ geo: CYL(6), d: offsetDir(sm, 0.04, 0), rad: 1, s: [0.02, 0.1, 0.02], col: 0x55585d, glow: 0.3 });
      for (let i = 0; i < 7; i++) L.push({ p: offsetDir(d, sr * 0.6 * Math.sqrt(r()), r() * 6.28).multiplyScalar(1.025).toArray(), c: r() < 0.6 ? 0xffa040 : 0xfff0d0, s: 0.03 + r() * 0.025 });
    }
    const m = this.smallMoon('io', pos, rad, ioFrag(this.H.noiseGLSL), [0.1, 0.4, 0.05], parts, L, 0xff8a2a, sites);
    // ore haulers: two stubby freighters on inclined orbits, engines burning orange
    this.orbiters(m, pos, rad, [
      { tilt: [0.35, 0, 0.2], R: 1.5, w: 0.32, ph: 0, glow: 0xffa040 },
      { tilt: [0.85, 2.1, -0.2], R: 1.85, w: -0.25, ph: 2.6, glow: 0xffa040 },
    ]);
    return m;
  }

  // small ships circling a moon (instanced hulls + engine glows), shown with its state
  orbiters(m, pos, rad, list) {
    const N = list.length, ships = new THREE.InstancedMesh(this.shipGeo ||= shipGeo(), this.dim(shipMaterial(this.H.SUN)), N);
    ships.geometry.userData.shared = true;
    ships.frustumCulled = false;
    ships.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const gmat = this.H.navLightMaterial(1);
    gmat.uniforms.uFade.value = 0;
    const glows = this.H.navPoints(gmat, list.map((o) => ({ p: [0, 0, 0], c: o.glow, s: 0.09 * rad })));
    glows.geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
    const grp = new THREE.Group();
    grp.position.copy(pos);
    grp.add(ships, glows);
    this.b.scene.add(grp);
    m.extras.push(grp);
    (m.follow ||= []).push(grp);
    const orb = list.map((o) => {
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...o.tilt));
      return { u: new THREE.Vector3(1, 0, 0).applyQuaternion(q), v: new THREE.Vector3(0, 0, 1).applyQuaternion(q), R: rad * o.R, w: o.w, ph: o.ph };
    });
    const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), F = new THREE.Vector3(), Z = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), SC = new THREE.Vector3(), back = new THREE.Vector3();
    const prev = m.onTick;
    m.onTick = (t, H, pr) => {
      prev?.(t, H, pr);
      gmat.uniforms.uH.value = H; gmat.uniforms.uMin.value = 2.4 * pr; gmat.uniforms.uFade.value = m.k * (this.midK ?? 1);
      const gp = glows.geometry.attributes.position;
      for (let i = 0; i < orb.length; i++) {
        const o = orb[i], a = o.ph + t * o.w;
        P.copy(o.u).multiplyScalar(Math.cos(a) * o.R).addScaledVector(o.v, Math.sin(a) * o.R);
        F.copy(o.u).multiplyScalar(-Math.sin(a)).addScaledVector(o.v, Math.cos(a)).multiplyScalar(Math.sign(o.w));
        M4.lookAt(Z, F, UP); Q.setFromRotationMatrix(M4);
        M4.compose(P, Q, SC.setScalar(rad * 0.12 * Math.max(m.k, 1e-4)));
        ships.setMatrixAt(i, M4);
        back.copy(P).addScaledVector(F, -rad * 0.11);                     // the engine plume, behind the ship
        gp.setXYZ(i, back.x, back.y, back.z);
      }
      ships.instanceMatrix.needsUpdate = true; gp.needsUpdate = true;
    };
  }

  makeEuropa(pos, rad) {
    const r = this.H.srand(523);
    const sites = ringSites(4, -0.1, 2.0, r).map((d) => ({ d, r: 0.22 + r() * 0.04 }));
    const parts = [], L = [];
    for (const { d, r: sr } of sites) {
      // an ice plant: drill towers over the bore holes, melt tanks, a pipeline, a pad
      for (let i = 0; i < 2; i++) {
        const dd = offsetDir(d, sr * (0.2 + 0.45 * r()), r() * 6.28);
        parts.push({ geo: CYL(6), d: dd, rad: 1, s: [0.03, 0.2, 0.03], col: 0xc7ccd2, glow: 0.1 });
        L.push({ p: dd.clone().multiplyScalar(1.21).toArray(), c: 0xff5040, rate: 0.6, ph: r(), s: 0.03 });
      }
      for (let i = 0; i < 3; i++) parts.push({ geo: CYL(10), d: offsetDir(d, sr * 0.25 * r(), r() * 6.28), rad: 1, s: [0.07, 0.05, 0.07], col: 0xe4e8ec, glow: 0.35 });
      parts.push({ geo: BOX(), d: offsetDir(d, sr * 0.4, r() * 6.28), rad: 1, yaw: r() * 3, s: [0.26, 0.012, 0.02], col: 0x9aa2ab, glow: 0.2 });
      parts.push({ geo: CYL(12), d: offsetDir(d, sr * 0.55, r() * 6.28), rad: 1, s: [0.13, 0.008, 0.13], col: 0x5a626c, glow: 0.4 });
      for (let i = 0; i < 7; i++) L.push({ p: offsetDir(d, sr * 0.6 * Math.sqrt(r()), r() * 6.28).multiplyScalar(1.025).toArray(), c: r() < 0.6 ? 0xbfe4ff : 0xffffff, s: 0.03 + r() * 0.02 });
    }
    const m = this.smallMoon('europa', pos, rad, europaFrag(this.H.noiseGLSL), [-0.15, 1.2, 0.08], parts, L, 0x9fd4ff, sites);

    // the water run: a faint lane from Europa toward the inner system (down and
    // right, passing under Jupiter toward Mars), with tankers riding it outward
    const d0 = LAYOUT.europa[3];
    const P0 = pos.clone().add(this.screenAt(1, 0.6, d0).sub(this.screenAt(0, 0, d0)).setLength(rad * 1.1));
    const P1 = this.screenAt(-1.05, -1.1, d0 - 4);
    const P2 = this.screenAt(-0.8, -0.98, d0 - 14);
    const P3 = this.screenAt(-0.55, -0.8, d0 - 26);
    const curve = new THREE.CubicBezierCurve3(P0, P1, P2, P3);
    const NP = 64, pts = curve.getSpacedPoints(NP - 1);
    const lg = new THREE.BufferGeometry().setFromPoints(pts);
    lg.setAttribute('aT', new THREE.Float32BufferAttribute(pts.map((_, i) => i / (NP - 1)), 1));
    const lmat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uFade: { value: 0 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: 'attribute float aT; varying float vT; void main(){ vT=aT; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: `uniform float uTime; uniform float uFade; varying float vT;
        void main(){
          float a=smoothstep(0.0,0.06,vT)*pow(1.0-vT,1.6)*0.32;
          a*=0.55+0.45*smoothstep(0.3,0.9,fract(vT*14.0-uTime*0.35));
          gl_FragColor=vec4(vec3(0.55,0.8,1.0)*a*uFade,1.0);
        }`,
    });
    const lane = new THREE.Line(lg, lmat);
    lane.frustumCulled = false;
    const NT = 3, tmat = this.H.navLightMaterial(1);
    tmat.uniforms.uFade.value = 0;
    const tankers = this.H.navPoints(tmat, Array.from({ length: NT }, () => ({ p: [0, 0, 0], c: 0xd8f0ff, s: 0.075 * rad })));
    tankers.geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
    this.b.scene.add(lane, tankers);
    m.extras.push(lane, tankers);
    const T = 16, tmp = new THREE.Vector3(), off = P0.clone().sub(pos), lp = lg.attributes.position;
    m.onTick = (t, H, pr) => {
      // the lane starts at Europa wherever it is on its orbit
      curve.v0.copy(m.mesh.position).add(off); curve.needsUpdate = true;
      for (let i = 0; i < NP; i++) { curve.getPoint(i / (NP - 1), tmp); lp.setXYZ(i, tmp.x, tmp.y, tmp.z); }
      lp.needsUpdate = true;
      lmat.uniforms.uTime.value = t; lmat.uniforms.uFade.value = m.k; tmat.uniforms.uFade.value = m.k; tmat.uniforms.uTime.value = t;
      tmat.uniforms.uH.value = H; tmat.uniforms.uMin.value = 2.0 * pr;
      const tp = tankers.geometry.attributes.position, tc = tankers.geometry.attributes.aCol;
      for (let i = 0; i < NT; i++) {
        const f = ((t / T) + i / NT) % 1, e = f * f * (3 - 2 * f) * 0.75;      // ease out from Europa, gone by 3/4 of the lane
        curve.getPointAt(Math.min(0.999, e), tmp);
        tp.setXYZ(i, tmp.x, tmp.y, tmp.z);
        const a = Math.max(0, Math.min(1, f / 0.08, (1 - f) / 0.4));
        tc.setXYZ(i, 0.85 * a, 0.94 * a, a);
      }
      tp.needsUpdate = true; tc.needsUpdate = true;
    };
    return m;
  }

  makeCallisto(pos, rad) {
    const r = this.H.srand(617);
    const sites = ringSites(4, 0.25, 4.0, r).map((d, i) => ({ d, r: i === 0 ? 0.28 : 0.21 }));
    const parts = [], L = [];
    sites.forEach(({ d, r: sr }, si) => {
      // the compound: a main dome, cell blocks in rows, watchtowers at the fence
      parts.push({ geo: HEMI(), d, rad: 1, s: [0.1, 0.07, 0.1], col: 0xb9cfdc, glow: 0.6 });
      const nb = si === 0 ? 5 : 3;
      for (let i = 0; i < nb; i++) {
        const hd = (i / nb) * 6.28 + r() * 0.4;
        parts.push({ geo: BOX(), d: offsetDir(d, sr * 0.55, hd), rad: 1, yaw: hd, s: [0.1, 0.035, 0.035], col: 0x80858c, glow: 0.5 });
      }
      for (let i = 0; i < 4; i++) {
        const hd = i / 4 * 6.28 + 0.4, dd = offsetDir(d, sr * 1.12, hd);
        parts.push({ geo: BOX(), d: dd, rad: 1, s: [0.018, 0.1, 0.018], col: 0x5c6066, glow: 0.2 });
        L.push({ p: dd.clone().multiplyScalar(1.105).toArray(), c: 0xff3020, rate: 0.55, ph: i / 4, s: 0.03 });   // red fence blinkers
      }
      for (let i = 0; i < 12; i++) L.push({ p: offsetDir(d, sr * 1.12, i / 12 * 6.28).multiplyScalar(1.02).toArray(), c: 0xffe0a8, s: 0.018 });   // fence lamps
      for (let i = 0; i < (si === 0 ? 7 : 4); i++) L.push({ p: offsetDir(d, sr * 0.6 * Math.sqrt(r()), r() * 6.28).multiplyScalar(1.03).toArray(), c: r() < 0.7 ? 0xffd08a : 0xeaf4ff, s: 0.03 + r() * 0.02 });
    });
    L.push({ p: sites[0].d.clone().multiplyScalar(1.09).toArray(), c: 0xffffff, rate: -0.45, s: 0.05 });           // strobe on the main dome
    const m = this.smallMoon('callisto', pos, rad, callistoFrag(this.H.noiseGLSL), [0.2, 2.2, -0.1], parts, L, 0xffc070, sites);
    this.orbiters(m, pos, rad, [{ tilt: [0.5, 1.0, 0.3], R: 1.6, w: 0.22, ph: 1.0, glow: 0xcfe6ff }]);     // the prison transport
    return m;
  }
}
