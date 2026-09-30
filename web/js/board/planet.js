// planet.js -- Mars itself: baking the terrain (colour, relief, shadow, oceans' basins) into textures, and the
// planet, atmosphere, water and cloud shaders; the stars and nebula behind it.
import { D_HOME, EXP, R, RHO_SIL, SUN, THETA_MAX } from './layout.js';
import * as THREE from 'three';
import { bakeHeightGLSL, dustGLSL, nightLightsGLSL, reliefGLSL, seaIceGLSL, surfaceFxGLSL } from './terrain_fx.js';

// ---------------------------------------------------------------- noise (GLSL)
export const noiseGLSL = /* glsl */`
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.0-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;vec3 ns=n_*D.wyz-D.xzx;vec4 j=p-49.0*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.0*x_);vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);vec4 s0=floor(b0)*2.0+1.0;vec4 s1=floor(b1)*2.0+1.0;vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));}
float fbm(vec3 p,int oct){float f=0.0,a=0.5;for(int i=0;i<8;i++){if(i>=oct)break;f+=a*snoise(p);p*=2.02;a*=0.5;}return f;}
vec3 hash3(vec3 p){p=vec3(dot(p,vec3(127.1,311.7,74.7)),dot(p,vec3(269.5,183.3,246.1)),dot(p,vec3(113.5,271.9,124.6)));return fract(sin(p)*43758.5453123);}
// crater field: (bowl depth <= 0, rim 0..1) for one frequency
vec2 craters(vec3 p){
  vec3 c=floor(p); float best=1e9;
  for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++)for(int z=-1;z<=1;z++){
    vec3 g=c+vec3(float(x),float(y),float(z)); vec3 h=hash3(g);
    if(h.y<0.5) continue;
    float r=0.12+0.33*h.x*h.x; float d=length(p-(g+h));
    best=min(best,d/r);
  }
  if(best>1.4) return vec2(0.0);
  float bowl=best<1.0?(best*best-1.0):0.0;
  float rim=exp(-pow((best-1.0)*6.0,2.0));
  return vec2(bowl,rim);
}
`;

// Ocean basins: every placed ocean presses a rounded-hexagon dip into the
// planet (vertex shader) that fills with water. Shared by planet + water.
// shoreline helpers shared by the planet (wet sand, swash, caustics on the
// basin floor) and the water (foam bands)
export const shoreGLSL = /* glsl */`
// light focused by the waves onto a shallow bed (iterated-sine caustics)
float caustic(vec2 p, float t){
  vec2 i=p; float c=1.0; const float inten=0.005;
  for(int k=0;k<4;k++){
    float tt=t*(1.0-(3.5/float(k+1)));
    i=p+vec2(cos(tt-i.x)+sin(tt+i.y), sin(tt-i.y)+cos(tt+i.x));
    c+=1.0/length(vec2(p.x/(sin(i.x+tt)/inten), p.y/(cos(i.y+tt)/inten)));
  }
  c/=4.0; c=clamp(1.17-pow(c,1.4),0.0,1.0);
  return pow(c,8.0);
}
// how far up the beach the swash reaches now (edge units past the waterline)
float swashReach(vec2 b, float t){ return 0.014+0.022*(0.5+0.5*sin(t*0.42+dot(b,vec2(0.9,0.6))*1.7)); }
`;
export const BASIN_DEPTH = 0.075;              // world units below the surface at the centre
export const WATER_LEVEL = -0.032;             // water plane lift
export const basinGLSL = /* glsl */`
uniform vec2 uHoles[16]; uniform float uHoleT[16]; uniform int uHoleN; uniform float uScale; uniform float uHexR;
uniform vec4 uCh[64]; uniform int uChN;
// pointy-top hexagon SDF (apothem a), rounded by rr
float sdHexP(vec2 p, float a, float rr){
  p = abs(p.yx);
  const vec3 k = vec3(-0.866025404, 0.5, 0.577350269);
  a -= rr;
  p -= 2.0*min(dot(k.xy, p), 0.0)*k.xy;
  p -= vec2(clamp(p.x, -k.z*a, k.z*a), a);
  return length(p)*sign(p.y) - rr;
}
vec2 boardOf(vec3 n){
  float th = acos(clamp(n.z, -1.0, 1.0)); float st = max(sin(th), 1e-5);
  return vec2(n.x, -n.y)/st*(th/uScale);
}
// 0 = untouched, 1 = full depth; also returns the signed distance to the nearest ocean edge
float bChan = 0.0;                      // (set by basinAt: 1 where a valley channel, not an ocean, makes the water)
float bEst = 0.0;                       // (and 1 up a river's estuary, away from the open sea: its surf and swash fade out)
float basinAt(vec3 n, out float edge){
  edge = 1e3; bChan = 0.0; bEst = 0.0;
  // (every ocean is on the board: a quarter past its rim no basin reaches -- e > 1 hex there --
  // so the rest of the globe, most of the planet's vertices, skips the loop)
  if (uHoleN == 0 || n.z < ${Math.cos(THETA_MAX * 1.25).toFixed(4)}) return 0.0;
  vec2 b = boardOf(n);
  // smooth union of all basins (weighted by their fill), so neighbouring
  // oceans join into one body of water instead of leaving a sand ridge
  float e = 1e3;
  for (int i = 0; i < 16; i++){
    if (i >= uHoleN) break;
    // rounder, slightly narrower basins + a wide blend: a row of oceans reads as
    // one winding river rather than a chain of hexagons
    float ei = sdHexP(b - uHoles[i], 0.83*uHexR, uHexR*0.45) + (1.0 - uHoleT[i])*0.6;
    const float K = 0.8;                        // blend radius: neighbours flow together (no outward margin, so nothing spills past the rim)
    float h = clamp(0.5 + 0.5*(e - ei)/K, 0.0, 1.0);
    e = mix(e, ei, h) - K*h*(1.0 - h);
  }
  // Protected Valleys' water (TileArt valleyWater, board/tiles/valley.js): chains of tapered capsules, board
  // units (x, y, radius, fill; a negative radius starts a chain) -- the inlet up to each dam,
  // the rivers between its oceans, its creek; an Ecological Zone's or a Natural Preserve's
  // river mouth -- joined on with a tight blend: one water surface.
  // Inside the valley (fill + 2) a channel runs in a bed carved into the tile: there the ground
  // dips a good way wider than the water, so the coarse planet mesh stays under the bed
  // An inlet (fill + 4) is the ocean's own water run up to a dam: open water, its shore and surf the
  // ocean's (bChan counts only the channels, against the oceans and inlets together). An estuary (fill + 12:
  // an inlet, + 8) is the sea's water run up a river's mouth: as an inlet, but its surf and swash fade out
  // up it, away from the open sea (bEst)
  float ed = e, eO = e;
  if (uChN > 1) {
    float c = 1e3, cd = 1e3, cc = 1e3, ci = 1e3, ce = 1e3;
    for (int i = 1; i < 64; i++){
      if (i >= uChN) break;
      vec4 q = uCh[i];
      if (q.z < 0.0) continue;
      vec4 p = uCh[i - 1];
      vec2 pa = b - p.xy, ba = q.xy - p.xy;
      float t = clamp(dot(pa, ba)/max(dot(ba, ba), 1e-8), 0.0, 1.0);
      // (each end's flags decoded on its own, then blended: where a chain turns carved part way along a
      // segment -- a river's mouth over a tile's rim -- the ground dips smoothly, no step under its water)
      float ep = step(7.5, p.w), eq = step(7.5, q.w), pw = p.w - 8.0*ep, qw = q.w - 8.0*eq;
      float ip = step(3.5, pw), iq = step(3.5, qw), wp = pw - 4.0*ip, wq = qw - 4.0*iq, kp = step(1.5, wp), kq = step(1.5, wq);
      float ki = step(0.5, mix(ip, iq, t)), k = mix(kp, kq, t);
      float d = length(pa - ba*t) - mix(abs(p.z), q.z, t) + (1.0 - mix(wp - 2.0*kp, wq - 2.0*kq, t))*0.15;
      c = min(c, d); cd = min(cd, d - 0.14*k);
      if (ki > 0.5) { ci = min(ci, d); if (ep + eq > 0.5) ce = min(ce, d); } else cc = min(cc, d);
    }
    const float KC = 0.05;
    float h = clamp(0.5 + 0.5*(e - c)/KC, 0.0, 1.0), hd = clamp(0.5 + 0.5*(e - cd)/KC, 0.0, 1.0), hi = clamp(0.5 + 0.5*(e - ci)/KC, 0.0, 1.0);
    float eo = mix(e, ci, hi) - KC*hi*(1.0 - hi);
    ed = mix(e, cd, hd) - KC*hd*(1.0 - hd);
    e = mix(e, c, h) - KC*h*(1.0 - h);
    bChan = clamp(0.5 + 0.5*(eo - cc)/KC, 0.0, 1.0);
    bEst = smoothstep(-0.1, 0.12, eO)*smoothstep(0.12, -0.02, ce);
  }
  edge = e;
  return smoothstep(0.0, -0.13, ed);
}
`;

// Fit out the baked lighting of the board image: least-squares a cubic
// polynomial in (x, y) to luminance over the disc and divide it out.
export async function flattenMarsImage(url, cx, cy, rad) {
  const img = new Image();
  img.src = url;
  await img.decode();
  const W = img.naturalWidth, H = img.naturalHeight;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0);
  const id = g.getImageData(0, 0, W, H), d = id.data;
  const terms = (x, y) => [1, x, y, x * x, x * y, y * y, x * x * x, x * x * y, x * y * y, y * y * y];
  const K = 10, A = Array.from({ length: K }, () => new Float64Array(K)), b = new Float64Array(K);
  for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
    const nx = (x - cx) / rad, ny = (y - cy) / rad;
    if (nx * nx + ny * ny > 0.9) continue;
    const i = (y * W + x) * 4, L = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2];
    const t = terms(nx, ny);
    for (let r = 0; r < K; r++) { b[r] += t[r] * L; for (let q = 0; q < K; q++) A[r][q] += t[r] * t[q]; }
  }
  for (let i = 0; i < K; i++) {
    let p = i; for (let r = i + 1; r < K; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
    [A[i], A[p]] = [A[p], A[i]]; [b[i], b[p]] = [b[p], b[i]];
    for (let r = i + 1; r < K; r++) { const f = A[r][i] / A[i][i]; for (let q = i; q < K; q++) A[r][q] -= f * A[i][q]; b[r] -= f * b[i]; }
  }
  const w = new Float64Array(K);
  for (let i = K - 1; i >= 0; i--) { let s = b[i]; for (let q = i + 1; q < K; q++) s -= A[i][q] * w[q]; w[i] = s / A[i][i]; }
  const shadeAt = (nx, ny) => Math.max(20, terms(nx, ny).reduce((s, v, k) => s + v * w[k], 0));
  let mean = 0, n = 0;
  for (let y = 0; y < H; y += 4) for (let x = 0; x < W; x += 4) { const nx = (x - cx) / rad, ny = (y - cy) / rad; if (nx * nx + ny * ny < 0.5) { mean += shadeAt(nx, ny); n++; } }
  mean /= n;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const nx = (x - cx) / rad, ny = (y - cy) / rad, rr = nx * nx + ny * ny;
    const i = (y * W + x) * 4;
    if (rr > 1.0) { d[i + 3] = 0; continue; }
    const k = Math.min(1, 0.94 / Math.sqrt(Math.max(rr, 1e-6)));  // clamp the fit inside its support
    const f = Math.min(2.4, mean / shadeAt(nx * Math.min(1, k), ny * Math.min(1, k)));
    d[i] = Math.min(255, d[i] * f); d[i + 1] = Math.min(255, d[i + 1] * f); d[i + 2] = Math.min(255, d[i + 2] * f); d[i + 3] = 255;
  }
  g.putImageData(id, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

export const BAKE_W = 2048, BAKE_H = 1024;
// Real-map globes (Hellas, Elysium, Vastitas Borealis Novus): baked offline
// (web/assets/maps/README.md) from the Viking colour mosaic + MOLA heights, already
// rotated into the planet frame. The colour goes through the same grading as
// the Tharsis board image; relief = MOLA height + image detail.
export const REG_A = 62 * Math.PI / 180;         // regional texture radius (the baked regional texture's radius: web/assets/maps/README.md)
export const realGLSL = /* glsl */`
uniform float uRaw;                     // 1: the texture is already graded (the Tharsis look, baked into the texture)
vec3 gradeMars(vec3 im){
  if(uRaw>0.5) return im;
  float lum=dot(im,vec3(0.3,0.59,0.11));
  // onto the Tharsis palette (basalt -> dust -> bright), keeping some of the mosaic's own tint
  float t=smoothstep(0.24,0.54,lum);
  vec3 pal=t<0.5?mix(vec3(0.33,0.16,0.10),vec3(0.74,0.40,0.22),t*2.0):mix(vec3(0.74,0.40,0.22),vec3(0.87,0.56,0.35),t*2.0-1.0);
  vec3 tint=im/max(lum,0.05)-vec3(1.2,0.92,0.88);                  // the mosaic's deviation from its typical ochre (dark blue-grey basalt, etc.)
  vec3 w=max(pal+tint*pal*0.5,vec3(0.0));
  float mx=max(im.r,max(im.g,im.b)), sat=(mx-min(im.r,min(im.g,im.b)))/max(mx,1e-3);
  float ice=smoothstep(0.58,0.76,lum)*(1.0-smoothstep(0.1,0.25,sat));      // polar ice stays white
  return mix(w,im*vec3(0.98,1.0,1.04),ice);
}
float iceOf(vec3 im){ float lum=dot(im,vec3(0.3,0.59,0.11)); float mx=max(im.r,max(im.g,im.b)), sat=(mx-min(im.r,min(im.g,im.b)))/max(mx,1e-3); return smoothstep(0.58,0.76,lum)*(1.0-smoothstep(0.1,0.25,sat)); }
float reliefOf(float hk, vec3 im){ return (hk-0.3)*2.0+(dot(im,vec3(0.3,0.59,0.11))-0.45)*(0.06+0.3*iceOf(im)); }   // hk: 0..1 = -9..22 km; in the ice, the dark troughs of the layered terrain read as relief
`;
export function bakeReal(renderer, col, hgt, raw = 0) {
  const rt = new THREE.WebGLRenderTarget(BAKE_W, BAKE_H, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.RepeatWrapping, depthBuffer: false, generateMipmaps: false });
  const mat = new THREE.ShaderMaterial({
    uniforms: { uC: { value: col }, uH: { value: hgt }, uRaw: { value: raw } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }',
    fragmentShader: `uniform sampler2D uC; uniform sampler2D uH; varying vec2 vUv;
      ${realGLSL}
      ${bakeHeightGLSL}
      void main(){ vec3 im=texture2D(uC,vUv).rgb; gl_FragColor=vec4(gradeMars(im), reliefOf(smoothHeight(uH,vUv), im)); }`,
  });
  const scene = new THREE.Scene();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); scene.add(quad);
  renderer.setRenderTarget(rt);
  renderer.render(scene, new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1));
  renderer.setRenderTarget(null);
  mat.dispose(); quad.geometry.dispose();
  return rt;
}
export function bakeTerrain(renderer, marsTex) {
  const rt = new THREE.WebGLRenderTarget(BAKE_W, BAKE_H, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.RepeatWrapping, depthBuffer: false, generateMipmaps: false });
  const mat = new THREE.ShaderMaterial({
    uniforms: { uMars: { value: marsTex }, uHas: { value: marsTex ? 1 : 0 }, uD: { value: D_HOME / R }, uSil: { value: RHO_SIL / R }, uImg: { value: new THREE.Vector4(317 / 620, 1 - 309 / 600, 224 / 620, 224 / 600) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }',
    fragmentShader: /* glsl */`
      uniform sampler2D uMars; uniform float uHas; uniform float uD; uniform float uSil; uniform vec4 uImg;
      varying vec2 vUv;
      ${noiseGLSL}
      void main(){
        float lon=(vUv.x-0.5)*6.28318530718, lat=(vUv.y-0.5)*3.14159265359;
        vec3 n=vec3(cos(lat)*sin(lon),sin(lat),cos(lat)*cos(lon));
        float h=fbm(n*1.6,6)*0.45;
        vec2 c1=craters(n*7.0), c2=craters(n*17.0+3.0), c3=craters(n*41.0+7.0);
        h+=c1.x*0.22+c1.y*0.12+c2.x*0.1+c2.y*0.06+c3.x*0.04+c3.y*0.025;
        float alb=fbm(n*2.3+vec3(9.0),5);
        vec3 dust=vec3(0.80,0.46,0.27), basalt=vec3(0.45,0.23,0.14), bright=vec3(0.88,0.60,0.39);
        vec3 col=mix(basalt,dust,smoothstep(-0.35,0.25,alb));
        col=mix(col,bright,smoothstep(0.3,0.7,alb)*0.5);
        col*=0.86+0.28*(snoise(n*23.0)*0.5+0.5);
        col=mix(col,col*0.82,clamp(-c2.x,0.0,1.0)*0.5); col=mix(col,col*1.1,c2.y*0.4);
        if(uHas>0.5){
          vec3 C=vec3(0.0,0.0,uD);
          float vis=dot(n,normalize(C-n));
          if(vis>0.0){
            vec3 Q=C+(n-C)*(uD/(uD-n.z));
            vec2 q=Q.xy/uSil;
            vec3 im=texture2D(uMars,vec2(uImg.x+q.x*uImg.z, uImg.y+q.y*uImg.w)).rgb;
            float w=smoothstep(0.1,0.42,vis)*smoothstep(1.0,0.86,length(q));
            float lum=dot(im,vec3(0.3,0.59,0.11));
            vec3 imw=mix(vec3(lum),im,1.3)*vec3(1.08,0.97,0.9);
            imw.g=min(imw.g,imw.r*0.74); imw.b=min(imw.b,imw.g*0.8);
            col=mix(col,imw,w);
            h=mix(h,h*0.3+(lum-0.45)*0.8,w);
          }
        }
        gl_FragColor=vec4(col,h);
      }`,
  });
  const scene = new THREE.Scene();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); scene.add(quad);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  renderer.setRenderTarget(rt);
  renderer.render(scene, cam);
  renderer.setRenderTarget(null);
  mat.dispose(); quad.geometry.dispose();
  return rt;
}

// static noise fields for the planet shader: r basin, g vegetation mask, b ice
// real maps (hgt = MOLA height, 0..1 = -9..13 km): the seas fill the real lowlands
export function bakeFields(renderer, hgt = null) {
  const rt = new THREE.WebGLRenderTarget(1024, 512, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.RepeatWrapping, depthBuffer: false, generateMipmaps: false });
  const mat = new THREE.ShaderMaterial({
    uniforms: { uH: { value: hgt }, uReal: { value: hgt ? 1 : 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }',
    fragmentShader: `uniform sampler2D uH; uniform float uReal; varying vec2 vUv;
      ${noiseGLSL}
      void main(){
        float lon=(vUv.x-0.5)*6.28318530718, lat=(vUv.y-0.5)*3.14159265359;
        vec3 n=vec3(cos(lat)*sin(lon),sin(lat),cos(lat)*cos(lon));
        float basin=snoise(n*1.15+vec3(3.1))*0.65+snoise(n*2.6+vec3(7.7))*0.3+snoise(n*6.0)*0.05;
        // full oceans (level -0.23) reach about -2.7 km: the northern plains, Hellas, Argyre
        // (a 3x3 tent of the 8-bit height: its 121 m steps would show as terraced blocks in the sea's depth tint)
        if(uReal>0.5){ float hh=0.0; for(int i=-1;i<=1;i++) for(int j=-1;j<=1;j++) hh+=texture2D(uH,vUv+vec2(float(i)/1024.0,float(j)/512.0)*1.2).r*(2.0-abs(float(i)))*(2.0-abs(float(j)));
          basin=-1.0+(hh/16.0*31.0-9.0+8.0)/6.9+snoise(n*6.0)*0.03; }
        gl_FragColor=vec4(basin, snoise(n*5.0+vec3(2.0))*0.5+0.5, snoise(n*14.0), 1.0);
      }`,
  });
  const scene = new THREE.Scene();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); scene.add(quad);
  renderer.setRenderTarget(rt);
  renderer.render(scene, new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1));
  renderer.setRenderTarget(null);
  mat.dispose(); quad.geometry.dispose();
  return rt;
}

// terrain_fx.js regShadow() for every point of the regional texture (its regUv space),
// once per map: a one-channel texture the planet shader reads instead of marching
export function bakeShadow(renderer, rh, size, steps) {
  const rt = new THREE.WebGLRenderTarget(size, size, { format: THREE.RedFormat, type: THREE.UnsignedByteType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, generateMipmaps: false });
  const mat = new THREE.ShaderMaterial({
    uniforms: { uRH: { value: rh }, uRC: { value: BLANK_TEX }, uRegA: { value: REG_A }, uSun: { value: SUN.clone() }, uShadowN: { value: steps }, uRaw: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }',
    fragmentShader: `uniform sampler2D uRH; uniform sampler2D uRC; uniform float uRegA; uniform vec3 uSun; varying vec2 vUv;
      ${realGLSL}
      vec2 regUv(vec3 q){ float th=acos(clamp(q.z,-1.0,1.0)); return 0.5+0.5*q.xy/max(length(q.xy),1e-6)*(th/uRegA); }
      ${reliefGLSL}
      void main(){
        vec2 d=(vUv-0.5)*2.0; float r=length(d), th=r*uRegA;              // regUv inverted: the direction of this texel
        vec3 n=vec3(sin(th)*d/max(r,1e-6), cos(th));
        gl_FragColor=vec4(regShadow(n),0.0,0.0,1.0);
      }`,
  });
  const scene = new THREE.Scene();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); scene.add(quad);
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(rt);
  renderer.render(scene, new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1));
  renderer.setRenderTarget(prev);
  mat.dispose(); quad.geometry.dispose();
  return rt;
}

export const BLANK_TEX = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1);
export function planetMaterial(terrain) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uT: { value: terrain }, uF: { value: null }, uSun: { value: SUN.clone() }, uBoard: { value: 0.4 },
      uOcean: { value: 0 }, uLife: { value: 0 }, uHeat: { value: 0 }, uTime: { value: 0 },
      uHoles: { value: Array.from({ length: 16 }, () => new THREE.Vector2(1e3, 1e3)) }, uHoleT: { value: new Array(16).fill(0) }, uHoleN: { value: 0 }, uScale: { value: 1 }, uHexR: { value: 0.55 },
      uCh: { value: Array.from({ length: 64 }, () => new THREE.Vector4()) }, uChN: { value: 0 },
      uHoleAge: { value: new Array(16).fill(99) }, uReg: { value: 0 }, uRC: { value: BLANK_TEX }, uRH: { value: BLANK_TEX }, uRegA: { value: REG_A }, uCapK: { value: 1 }, uIce: { value: 0 }, uRaw: { value: 0 }, uShadowN: { value: 8 }, uSH: { value: BLANK_TEX }, uCities: { value: 0 },
    },
    vertexShader: /* glsl */`
      varying vec3 vObj; varying vec3 vW; varying float vBasin;
      ${basinGLSL}
      void main(){
        vObj=normalize(position);
        float e; float b=basinAt(vObj, e); vBasin=b;
        vec3 p=position*(1.0-${BASIN_DEPTH.toFixed(4)}*b/${R.toFixed(1)});
        vec4 w=modelMatrix*vec4(p,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uT; uniform sampler2D uF; uniform vec3 uSun; uniform float uBoard; uniform float uOcean; uniform float uLife; uniform float uHeat; uniform float uTime;
      uniform float uHoleAge[16];
      ${shoreGLSL}
      uniform float uReg; uniform sampler2D uRC; uniform sampler2D uRH; uniform float uRegA; uniform float uCapK; uniform float uIce;
      uniform sampler2D uSH;                            // the relief's cast shadows, baked per map (bakeShadow)
      varying vec3 vObj; varying vec3 vW; varying float vBasin;
      ${realGLSL}
      // the sharper regional texture under the board (real maps), azimuthal about +Z
      vec2 regUv(vec3 q){ float th=acos(clamp(q.z,-1.0,1.0)); return 0.5+0.5*q.xy/max(length(q.xy),1e-6)*(th/uRegA); }
      float regRelief(vec3 q){ vec2 u=regUv(q); return reliefOf(texture2D(uRH,u).r, texture2D(uRC,u).rgb); }
      ${reliefGLSL}
      ${basinGLSL}
      const float PI=3.14159265359;
      vec2 uvOf(vec3 n){ return vec2(atan(n.x,n.z)/(2.0*PI)+0.5, asin(clamp(n.y,-1.0,1.0))/PI+0.5); }
      ${noiseGLSL}
      ${surfaceFxGLSL}
      ${nightLightsGLSL}
      ${dustGLSL}
      ${seaIceGLSL}
      void main(){
        vec3 n=normalize(vObj);
        vec2 uv=uvOf(n);
        vec4 T=texture2D(uT,uv);
        float h=T.a;
        vec2 du=vec2(1.0/${BAKE_W}.0,0.0), dv=vec2(0.0,1.0/${BAKE_H}.0);
        float hx=texture2D(uT,uv+2.0*du).a-texture2D(uT,uv-2.0*du).a, hy=texture2D(uT,uv+2.0*dv).a-texture2D(uT,uv-2.0*dv).a;
        vec3 east=normalize(cross(vec3(0.0,1.0,0.0),n)+vec3(1e-5,0.0,0.0));
        vec3 north=cross(n,east);
        float cl=max(cos(asin(clamp(n.y,-1.0,1.0))),0.05);
        float g1=snoise(n*170.0), g2=snoise(n*430.0);
        vec4 F=texture2D(uF,uv);
        float gE=0.25*hx/cl, gN=0.25*hy, shadow=1.0;   // per texel of the bake (~RELIEF_D)
        if(uReg>0.5){
          float wr=smoothstep(uRegA,uRegA*0.88,acos(clamp(n.z,-1.0,1.0)));
          if(wr>0.0){
            vec2 ru=regUv(n); vec3 im=texture2D(uRC,ru).rgb;
            T.rgb=mix(T.rgb,gradeMars(im)*(1.0+uIce*iceOf(im)),wr);        // uIce: brighter polar ice (Hellas' South Pole)
            vec2 rg=regGrad(n,east,north,im);                 // terrain_fx.js: the sharper regional relief + cast shadows
            gE=mix(gE,rg.x,wr); gN=mix(gN,rg.y,wr); if(uShadowN>0.5) shadow=mix(1.0,texture2D(uSH,ru).r,wr);
          }
        }
        vec2 gg=reliefDeadzone(vec2(gE,gN));
        vec3 N=normalize(n-(east*gg.x+north*gg.y)*RELIEF_K + (east*g1+north*g2)*0.01);
        vec3 col=T.rgb*(0.94+0.06*g1+0.04*g2);
        // terraforming shows on the planet AROUND the board (the board shows the tiles)
        float off=1.0-smoothstep(uBoard-0.12,uBoard+0.03,n.z);
        col=frostFx(capMelt(col,n,uv),n,off);                                // terrain_fx.js: caps retreat, early frost
        // seas gather in broad basins (low-frequency field), never in craters.
        // The field is a texture: a hard threshold shows its texels as faceted
        // coastlines when zoomed in, so the shore width follows the screen-space
        // rate of change, and a little noise makes the coast natural
        float basin=F.r;
        if(off>0.0) basin+=snoise(n*70.0)*0.010;                        // (only the off-board seas / plants / coasts read it)
        float level=-0.95+uOcean*0.72;
        float sw=max(0.012,fwidth(basin)*1.5);
        float sea=off*smoothstep(level+sw,level-sw,basin)*step(0.001,uOcean);
        float veg=off*uLife*smoothstep(0.1,0.45,F.g)*smoothstep(level+0.45,level+0.03,basin)*(1.0-sea);
        col=mix(col,vec3(0.16,0.30,0.12),veg*0.75);
        vec3 water=mix(vec3(0.02,0.08,0.22),vec3(0.06,0.25,0.45),smoothstep(level-0.25,level,basin));
        float seaFrozen=sea>0.0?seaIce(water,n,basin,level):0.0;            // terrain_fx.js: cold seas freeze over
        col=mix(col,water,sea);
        float cap=uCapK*smoothstep(0.86,0.93,abs(n.y)+0.03*F.b)*(1.0-uHeat*0.7);
        col=mix(col,vec3(0.92,0.94,0.98),cap);
        // ocean basins: wet dark sand toward the water, true slope normals
        float edge; float bs=basinAt(n, edge);
        if (bs > 0.001) {
          vec3 gN=normalize(cross(dFdx(vW), dFdy(vW)));
          if (dot(gN,n)<0.0) gN=-gN;
          N=normalize(mix(N,gN,smoothstep(0.02,0.4,bs)));
          // the basin floor: pale sand in the shallows, dark silt deeper down
          col=mix(col, mix(vec3(0.70,0.56,0.40), col*vec3(0.45,0.42,0.42), smoothstep(0.45,0.95,bs)), smoothstep(0.05,0.4,bs));
        }
        // ---- shoreline: water line at edge ~ -0.06 (where the water shell meets the basin)
        float wetSpec=0.0;
        if (uHoleN>0 && edge<0.16) {
          vec2 bb=boardOf(n);
          float up=edge+0.058;                                      // distance up the beach from the waterline
          float reach=swashReach(bb,uTime);
          float nz=snoise(vec3(bb*16.0,uTime*0.05));
          // a freshly placed ocean soaks a wider band that dries back over ~20 s
          float fresh=0.0;
          for (int i=0;i<16;i++){ if(i>=uHoleN) break; float a=uHoleAge[i]; if(a<30.0) fresh=max(fresh,exp(-a*0.12)*smoothstep(1.4,0.6,length(bb-uHoles[i]))); }
          float wetW=0.05+0.07*fresh;
          float wet=smoothstep(wetW,0.0,up-reach*0.6)*step(-0.02,up);
          col=mix(col,col*vec3(0.52,0.47,0.44),wet*0.85);            // damp dark sand
          wetSpec=wet;
          // the swash: a thin broken line of foam that runs up the sand and slides back
          float line=smoothstep(0.006,0.0,abs(up-reach))*smoothstep(-0.2,0.5,nz)*(1.0-bEst);
          float film=smoothstep(reach,reach-0.012,up)*step(-0.01,up)*0.22*(1.0-bEst);   // a sheet of water behind it (neither up an estuary)
          col=mix(col,vec3(0.92,0.95,0.96),line*0.6);
          col=mix(col,vec3(0.35,0.55,0.58)*0.9,film*(1.0-line));
        }
        vec3 Nw=normalize(mix(N,n,sea));
        float offS=1.0-smoothstep(uBoard-0.1,uBoard-0.03,n.z);           // strictly off the board: nothing time-varying or darkening touches a hex
        float diff=max(dot(Nw,uSun),0.0)*mix(shadow,1.0,sea)*cloudShadow(n,offS);
        float wrap=max(dot(n,uSun)*0.5+0.5,0.0);
        vec3 V=normalize(cameraPosition-vW);
        float spec=sea*(1.0-0.85*seaFrozen)*pow(max(dot(reflect(-uSun,n),V),0.0),60.0)*0.9+wetSpec*pow(max(dot(reflect(-uSun,N),V),0.0),30.0)*0.35;
        // soft cool fill from the lower right (sky bounce) so the far limb
        // never drops to black
        float fill=max(dot(Nw,normalize(vec3(0.6,-0.5,0.62))),0.0);
        vec3 lit=col*(0.2*wrap+diff*1.15+fill*vec3(0.34,0.36,0.42))+vec3(spec);
        float rim=pow(1.0-max(dot(n,V),0.0),4.0);
        float atm=clamp(0.15+0.45*uHeat+0.55*uLife,0.0,1.0);
        lit=dustFx(lit,n,offS);                                           // terrain_fx.js: early dust veil + a drifting storm
        lit*=nightDim(n,offS);
        lit+=nightLights(n,sea,step(0.001,uOcean)*smoothstep(level+0.3,level+0.02,basin),capIce(col),offS);   // terrain_fx.js
        lit+=rim*mix(vec3(0.95,0.5,0.28),vec3(0.35,0.6,1.0),uLife)*(0.2+0.6*atm)*smoothstep(-0.3,0.4,dot(n,uSun));
        lit=mix(lit,mix(vec3(0.75,0.55,0.45),vec3(0.55,0.72,0.95),uLife)*max(dot(n,uSun),0.0),atm*0.06);
        gl_FragColor=vec4(lit*${EXP},1.0);
        #include <colorspace_fragment>
      }`,
  });
}

// glow from the ray's closest approach to the planet: bright right at the
// limb, fading outward (no dark gap between surface and haze)
export function atmosphereMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uSun: { value: SUN.clone() }, uLife: { value: 0 }, uHeat: { value: 0 }, uR: { value: R } },
    vertexShader: `varying vec3 vW; void main(){ vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `uniform vec3 uSun; uniform float uLife; uniform float uHeat; uniform float uR; varying vec3 vW;
      void main(){
        vec3 dir=normalize(vW-cameraPosition);
        float t=-dot(cameraPosition,dir);
        vec3 cp=cameraPosition+dir*t;
        float d=length(cp);
        float atm=clamp(0.15+0.45*uHeat+0.55*uLife,0.0,1.0);       // thin at the start, thick when terraformed
        // early on the thin air is dusty: a butterscotch haze on the limb (as in the rovers' skies)
        // that fades as the planet warms, while the blue scattering layer thickens with oxygen
        float dusty=1.0-smoothstep(0.05,0.55,max(uHeat,uLife*0.8));
        float g=exp(-max(d-uR,0.0)/(uR*(0.012+0.03*atm+0.008*dusty)));
        float lit=smoothstep(-0.35,0.5,dot(normalize(cp),uSun));
        vec3 c=mix(mix(vec3(1.0,0.58,0.36),vec3(1.0,0.74,0.5),dusty),vec3(0.38,0.66,1.0),uLife);
        float a=g*lit*(0.3+0.7*atm+0.35*dusty);
        gl_FragColor=vec4(c*a*${EXP},a); }`,
    side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
  });
}

// Water: translucent, depth-tinted (clear turquoise over the shallows, deep
// blue in the middle), several directional wave trains + fine ripples for the
// normal, Fresnel sky reflection, sun glints, and foam along the shore.
export function waterMaterial(shared) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uSun: { value: SUN.clone() }, uLife: { value: 0 }, uOpacity: { value: 1 },
      uHoleAge: { value: new Array(16).fill(99) }, ...shared },
    transparent: true, depthWrite: false,
    vertexShader: `varying vec3 vW; void main(){ vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
    // Calm "water on a plate": slow low swells, a soft sun sheen, clear
    // shallows over the sand, faint moving caustics, a thin wet shoreline.
    // A newly placed ocean sends one soft ring outward for a few seconds.
    fragmentShader: `uniform float uTime; uniform vec3 uSun; uniform float uLife; uniform float uOpacity; uniform float uHoleAge[16]; varying vec3 vW;
      ${noiseGLSL}
      ${basinGLSL}
      ${shoreGLSL}
      // periodic wave tile on [0,1)^2: integer wave vectors, deep-water
      // dispersion (w = sqrt(g k)); returns the height gradient, h = height
      vec2 waveTile(vec2 u, float t, out float h){
        const vec2 K[7] = vec2[7](vec2(2.,1.),vec2(1.,2.),vec2(3.,2.),vec2(3.,1.),vec2(5.,3.),vec2(4.,5.),vec2(7.,4.));
        const float PH[7] = float[7](0.3,1.7,4.1,2.2,5.3,0.9,3.6);
        vec2 g=vec2(0.0); h=0.0;
        for(int j=0;j<7;j++){
          vec2 k=K[j]*6.2831853; float kl=length(k);
          float a=1.0/pow(kl,1.35);
          float ph=dot(k,u)+PH[j]-sqrt(9.8*kl)*t;
          h+=a*sin(ph); g+=a*k*cos(ph);
        }
        return g/5.0;
      }
      vec2 hash22(vec2 p){ p=vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3))); return fract(sin(p)*43758.5453); }
      vec2 rot(vec2 v,float a){ float c=cos(a),s=sin(a); return vec2(c*v.x-s*v.y,s*v.x+c*v.y); }
      // hex-tiling (Mikkelsen): the 3 hex vertices around st, their weights
      vec2 oceanTB(vec2 st, float t, out float hOut){
        vec2 sk=vec2(st.x-0.57735027*st.y, 1.15470054*st.y)*1.2;
        vec2 base=floor(sk); vec3 f=vec3(fract(sk),0.0); f.z=1.0-f.x-f.y;
        vec2 v1,v2,v3; vec3 w;
        if(f.z>0.0){ w=vec3(f.z,f.y,f.x); v1=base; v2=base+vec2(0.,1.); v3=base+vec2(1.,0.); }
        else { w=vec3(-f.z,1.0-f.y,1.0-f.x); v1=base+vec2(1.,1.); v2=base+vec2(1.,0.); v3=base+vec2(0.,1.); }
        w=w*w*w; w/=dot(w,vec3(1.0));
        vec2 V[3]=vec2[3](v1,v2,v3); float W[3]=float[3](w.x,w.y,w.z);
        vec2 g=vec2(0.0); float h=0.0;
        for(int i=0;i<3;i++){
          vec2 r=hash22(V[i]);
          float ang=0.7854+(r.x-0.5)*0.7;                 // flow: diagonal, +-20 deg per hex
          float hh; vec2 gi=waveTile(rot(st,-ang)+r*7.0, t, hh);
          g+=W[i]*rot(gi,ang); h+=W[i]*hh;
        }
        float nv=inversesqrt(max(dot(w,w),1e-4));       // variance-preserving blend
        hOut=h*nv; return g*nv;
      }
      void main(){
        vec3 n=normalize(vW);
        float edge; float bs=basinAt(n, edge);
        const float BD=${BASIN_DEPTH.toFixed(4)}, WL=${WATER_LEVEL.toFixed(4)};
        if (bs*BD < -WL) discard;                                    // dry land
        float depth=clamp((smoothstep(0.0,-0.13,edge)*BD+WL)/(BD+WL),0.0,1.0);   // (the true water edge: a valley bed dips wider than its water)
        vec3 t1=normalize(cross(n,vec3(0.0,1.0,0.0)+1e-4)); vec3 t2=cross(n,t1);
        // ocean waves by TILING AND BLENDING (Heitz-Neyret; the La Forge ocean
        // technique): a periodic wave tile, laid on a hex grid with a random
        // offset and a flow-aligned (diagonal) rotation per hex, three hexes
        // blended per pixel with variance-preserving weights. Two octaves on a
        // slow clock: a clear swell plus a finer chop riding on it.
        vec2 b=boardOf(n);
        // distance out from the shore (board units): the basin walls are steep, so
        // colour and foam follow this rather than the water depth
        // (only trustworthy near the shore: inside a chain of oceans the smooth union
        // reads ~0.14 at the seams between hexes, so everything saturates before that)
        float dist=max(-edge-0.058,0.0);
        dist=mix(dist,0.05+dist*1.5,bChan);                           // a valley channel: narrow, but deep water (its colour, little surf)
        float wh; vec2 g=oceanTB(b*2.4, uTime*0.085, wh)*0.3;
        float wh2; g+=oceanTB(b*6.9+vec2(3.1,1.7), uTime*0.15, wh2)*0.1;
        g*=mix(0.4,1.0,smoothstep(0.0,0.12,dist));                   // calmer in the shallows
        // the settle ring of a freshly placed ocean
        for (int i=0;i<16;i++){
          if (i>=uHoleN) break;
          float age=uHoleAge[i];
          if (age>5.0) continue;
          vec2 d=b-uHoles[i]; float r=length(d)+1e-4;
          float ring=sin(r*12.0-age*4.0)*exp(-age*0.9)*smoothstep(age*0.8+0.35,age*0.8,r);
          g+=d/r*ring*0.03;
        }
        // fine ripples on the swell (visible up close; they also break up the sun path)
        // (faded out where they would be smaller than a pixel: no sparkle noise from afar)
        float fine=smoothstep(0.03,0.008,length(fwidth(b*26.0))/26.0*8.0);
        vec2 rp=vec2(snoise(vec3(b*26.0,uTime*0.35)),snoise(vec3(b*26.0+vec2(7.3,2.1),uTime*0.35)))*0.22*fine;
        vec3 N=normalize(n-(t1*(g.x+rp.x*0.55)+t2*(g.y+rp.y*0.55)));
        vec3 V=normalize(cameraPosition-vW);
        float NV=max(dot(N,V),0.0);
        float fres=0.02+0.98*pow(1.0-NV,5.0);
        float diff=max(dot(n,uSun),0.0);
        float dN=max(dot(N,uSun),0.0);
        // body colour by depth: turquoise shallows -> teal -> deep navy
        float dd=smoothstep(0.0,0.12,dist);
        vec3 shallow=vec3(0.22,0.62,0.60), mid=vec3(0.04,0.42,0.58), deep=vec3(0.02,0.17,0.42);
        vec3 body=dd<0.35?mix(shallow,mid,dd/0.35):mix(mid,deep,(dd-0.35)/0.65);
        vec3 col=body*(0.3+0.85*dN)*(0.75+0.65*clamp(wh+wh2*0.4,-0.6,0.6));   // lit crests, dark troughs
        // light through the thin crests (subsurface): green-teal glow where the swell faces the sun
        col+=vec3(0.03,0.22,0.18)*smoothstep(0.0,0.6,wh+wh2*0.5)*diff*(0.4+0.6*dd);
        // sky reflection, strongest toward the horizon (Fresnel)
        vec3 sky=mix(vec3(0.80,0.66,0.58),vec3(0.62,0.80,1.0),0.35+0.65*uLife);
        // (a stylised floor of 0.14 so the wave pattern shows from straight above too;
        // the sky is brighter toward its horizon, so tilted facets catch more of it)
        vec3 Rv=reflect(-V,N);
        vec3 skyR=sky*(0.35+0.6*diff)*(1.25-0.6*clamp(dot(Rv,n),0.0,1.0));
        col=mix(col, skyR, clamp(0.07+fres*0.8,0.0,0.85));
        // the sun on the water: a broad sheen plus a glitter path of moving glints
        vec3 R=reflect(-V,N);
        float rs=max(dot(R,uSun),0.0);
        // the glitter: the same reflection off a finer, faster ripple, so inside the
        // sun's path it breaks into many small moving glints
        float rg=max(dot(reflect(-V,normalize(N-(t1*rp.x+t2*rp.y))),uSun),0.0);
        float path=pow(rs,40.0);                                         // where the sun path lies
        col+=vec3(1.0,0.96,0.86)*(pow(rg,900.0)*5.0*fine*smoothstep(0.02,0.3,path)+path*0.18+pow(rs,10.0)*0.06)*diff;
        // foam: bands that roll in toward the shore and fade, broken by noise
        float nz=snoise(vec3(b*11.0,uTime*0.12))*0.5+0.5;
        float foam=0.0;
        for (int k=0;k<3;k++){
          float ph=fract(uTime*0.055+float(k)/3.0+nz*0.08);
          float at=mix(0.08,0.006,ph);                               // distance from shore of this band now
          float band=smoothstep(0.007,0.0,abs(dist-at))*sin(ph*3.14159)*smoothstep(0.35,0.75,nz+ph*0.35);
          foam=max(foam,band);
        }
        foam=max(foam,smoothstep(0.014,0.003,dist)*smoothstep(0.2,0.55,nz)*0.8);   // the surf line itself
        foam*=(1.0-0.85*bChan)*(1.0-0.9*bEst);
        col=mix(col,vec3(0.93,0.96,0.97)*(0.55+0.5*diff),foam*0.85);
        // caustics: light focused by the ripples onto the sandy bed of the shallows
        float cz=smoothstep(0.0,0.012,dist)*smoothstep(0.11,0.035,dist);
        float cst=cz>0.0?caustic(b*15.0+vec2(19.0,7.0),uTime*0.3)*cz:0.0;
        col+=vec3(0.85,1.0,0.9)*cst*0.35*(0.3+0.7*diff);
        // clear in the shallows (the sandy floor and its caustics show), opaque deep down;
        // it still fades out across the very edge, where the water meets the basin wall
        // at a grazing depth (a hard edge would z-fight / flicker)
        float alpha=mix(0.2,1.0,smoothstep(0.0,0.1,dist))+fres*0.25;
        alpha=max(alpha,max(foam*0.9,cst*0.3));
        alpha*=smoothstep(0.015,0.07,depth);
        gl_FragColor=vec4(col*${EXP},clamp(alpha,0.0,1.0)*uOpacity);
        #include <colorspace_fragment>
      }`,
  });
}

export function cloudMaterial(oct = 5) {
  return new THREE.ShaderMaterial({
    defines: { COCT: oct },
    uniforms: { uTime: { value: 0 }, uSun: { value: SUN.clone() }, uBoard: { value: 0.4 }, uLife: { value: 0 } },
    transparent: true, depthWrite: false,
    vertexShader: 'varying vec3 vN; void main(){ vN=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `uniform float uTime; uniform vec3 uSun; uniform float uBoard; uniform float uLife; varying vec3 vN;
      ${noiseGLSL}
      void main(){
        vec3 n=normalize(vN);
        float a=uTime*0.012;
        vec3 p=vec3(n.x*cos(a)-n.z*sin(a), n.y, n.x*sin(a)+n.z*cos(a));
        float c=fbm(p*3.0+vec3(0.0,uTime*0.004,0.0),COCT)*0.5+0.5;
        c=smoothstep(0.52,0.8,c);
        float off=1.0-smoothstep(uBoard-0.12,uBoard-0.02,n.z);
        float lit=max(dot(n,uSun),0.0)*0.9+0.1;
        vec3 col=mix(vec3(0.85,0.62,0.45),vec3(0.95,0.96,1.0),uLife)*lit;
        gl_FragColor=vec4(col*${EXP},c*off*(0.28+uLife*0.25));
      }`,
  });
}

export function makeStars() {
  const g = new THREE.BufferGeometry();
  const n = 5000, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(400 + Math.random() * 200);
    pos.set([v.x, v.y, v.z], i * 3);
    const c = new THREE.Color().setHSL(0.58 + (Math.random() - 0.5) * 0.3, 0.35, 0.5 + Math.random() * 0.45);
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return new THREE.Points(g, new THREE.PointsMaterial({ size: 1.4, vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false }));
}

export function nebula() {
  return new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    vertexShader: 'varying vec3 vD; void main(){ vD=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `varying vec3 vD;
      ${noiseGLSL}
      void main(){
        vec3 d=normalize(vD);
        float band=exp(-pow(dot(d,normalize(vec3(0.3,0.9,-0.3)))*3.2,2.0));
        float n=fbm(d*2.2,5)*0.5+0.5, m=fbm(d*5.0+vec3(3.0),4)*0.5+0.5;
        vec3 c=mix(vec3(0.10,0.05,0.16),vec3(0.05,0.10,0.20),m)*pow(n,2.2)*(0.35+band*1.2);
        c+=vec3(0.16,0.09,0.05)*band*pow(m,3.0)*0.6;
        gl_FragColor=vec4(c,1.0);
      }`,
  }));
}
