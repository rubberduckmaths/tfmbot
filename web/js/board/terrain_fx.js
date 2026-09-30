// terrain_fx.js -- relief lighting for the planet (board3d.js planetMaterial).
//
// The relief is the real MOLA topography (baked into web/assets/maps/: cleaned of the
// source poster's graticule and print noise), lit from the sun: crater rims,
// volcano flanks, canyon walls and the polar layered terrain catch the light
// and, near the terminator, cast short soft shadows. Everything is computed
// from the height textures the planet already loads (no extra download):
// the regional height (uRH, around the board) and the globe relief baked
// into the terrain texture's alpha (bakeReal).
//
// Relief units: reliefOf() in board3d.js (2 per 31 km of height, plus a
// little image luminance for the fine detail MOLA lacks). A normal tilt of
// RELIEF_K * (relief difference per D) makes the vertical exaggeration
// about x10: planet-scale relief is invisible at true scale.

export const RELIEF_K = 16.0;

// helpers used inside the planet fragment shader; expects regUv(), reliefOf(),
// iceOf(), uRH, uRC, uSun to be declared before it
export const reliefGLSL = /* glsl */`
uniform float uShadowN;                          // shadow march steps around the board (0 = off: phones, Low quality); run once per map by board3d bakeShadow()
const float RELIEF_K=${RELIEF_K.toFixed(2)};
const float RELIEF_D=3.14159265/1024.0;          // gradient step (rad): ~1.5 texels of the 1024 regional height
// a gradient smaller than about a third of an 8-bit height step (2/255 relief) per D is
// quantisation or compression noise, not terrain: fade it out so the plains don't band
vec2 reliefDeadzone(vec2 g){ float m=length(g); return g*smoothstep(0.0015,0.005,m); }
float regH(vec3 q){ return texture2D(uRH,regUv(q)).r*2.0; }
float lumOf(vec3 c){ return dot(c,vec3(0.3,0.59,0.11)); }
// relief gradient (east, north) per RELIEF_D around the board. The 8-bit height is read with
// a Sobel stencil 2.5 texels wide (on bilinear taps): it averages out the height's 121 m steps
// and the WebP blocks, which a narrow difference turns into contour lines and dashes. The
// image-luminance detail (and the ice's layered troughs) take a plain central difference.
vec2 regGrad(vec3 n, vec3 e, vec3 no, vec3 im){
  const float S=2.5*2.0*1.0821/1024.0;            // 2.5 texels of the 1024 regional height (rad)
  vec2 c=regUv(n), ue=regUv(normalize(n+e*S))-c, un=regUv(normalize(n+no*S))-c;
  #define RH(o) texture2D(uRH,c+(o)).r
  float gx=RH(ue+un)+2.0*RH(ue)+RH(ue-un)-RH(-ue+un)-2.0*RH(-ue)-RH(-ue-un);
  float gy=RH(un+ue)+2.0*RH(un)+RH(un-ue)-RH(-un+ue)-2.0*RH(-un)-RH(-un-ue);
  #undef RH
  vec2 g=vec2(gx,gy)*(2.0/8.0);                    // Sobel sum (weights 4, across 2S) -> per S (/8), height -> relief (x2)
  float kl=0.06+0.3*iceOf(im);                    // reliefOf's luminance term
  g+=kl*0.5*vec2(lumOf(texture2D(uRC,c+ue).rgb)-lumOf(texture2D(uRC,c-ue).rgb), lumOf(texture2D(uRC,c+un).rgb)-lumOf(texture2D(uRC,c-un).rgb));
  return g*(RELIEF_D/S);                          // per S -> per RELIEF_D
}
// soft cast shadow: march toward the sun over the regional height (heights exaggerated
// like the normals, so shadows agree with the shading); 1 = lit
float regShadow(vec3 n){
  float sinE=dot(uSun,n);
  if(uShadowN<0.5||sinE<=0.0) return 1.0;
  vec3 s=uSun-n*sinE; float cosE=length(s); s/=max(cosE,1e-4);
  float tanE=sinE/max(cosE,1e-4);
  float h0=regH(n), sh=1.0;
  // relief -> height (planet radii), exaggerated less than the shading: at the shading's x10 a
  // volcano would throw a mountain-range shadow; this keeps shadows to steep walls and rims
  const float HS=0.4*RELIEF_K*RELIEF_D;
  for(int i=1;i<=10;i++){
    if(float(i)>uShadowN) break;
    float fi=float(i), t=0.003*fi+0.00045*fi*fi;  // 0.0035 .. 0.075 rad: crater walls out to a volcano's flank
    float over=(regH(normalize(n+s*t))-h0)*HS-t*tanE;
    sh=min(sh,1.0-smoothstep(0.0,0.0008+0.12*t,over));   // penumbra widens with distance
  }
  return sh;
}
`;

// the globe relief baked into the terrain texture (bakeReal): the 1024x512 height is
// sampled with a small tent filter so the 2048x1024 bake has no bilinear creases
export const bakeHeightGLSL = /* glsl */`
float smoothHeight(sampler2D h, vec2 uv){
  vec2 t=vec2(1.0/1024.0,1.0/512.0)*0.75;
  return 0.25*(texture2D(h,uv+vec2(t.x,t.y)).r+texture2D(h,uv+vec2(-t.x,t.y)).r+texture2D(h,uv+vec2(t.x,-t.y)).r+texture2D(h,uv-t).r);
}
`;

// ---------------------------------------------------------------- the planet changing with the game
// Tied to the global parameters (board3d.js setGlobals: uHeat 0..1 = -30..+8 C, uLife = oxygen,
// uOcean = oceans). Expects snoise()/fbm() (noiseGLSL), iceOf(), regUv(), uRH, uReg, uRegA, uSun.
export const surfaceFxGLSL = /* glsl */`
float capIce(vec3 c){          // the ice in a graded terrain colour: pale, and grey to bluish where dust is red
  float l=dot(c,vec3(0.3,0.59,0.11)), mx=max(c.r,max(c.g,c.b)), red=(c.r-c.b)/max(mx,1e-3);
  return smoothstep(0.3,0.4,l)*(1.0-smoothstep(0.26,0.38,red));
}
// Frost: at the start (-30 C) a thin hoarfrost sits in crater floors and low pockets, patchy
// and brightest in the deepest hollows; it sublimates as the temperature rises (gone by ~-10 C).
// Low pockets: the regional height against its own blurred (mip) version.
vec3 frostFx(vec3 col, vec3 n, float off){
  float cold=1.0-smoothstep(0.08,0.5,uHeat);
  if(cold<=0.0||uReg<0.5) return col;
  float wr=smoothstep(uRegA,uRegA*0.88,acos(clamp(n.z,-1.0,1.0)));
  if(wr<=0.0) return col;
  vec2 ru=regUv(n);
  float h=texture2D(uRH,ru).r, hb=texture2D(uRH,ru,3.5).r;          // ~12-texel neighbourhood
  float pocket=smoothstep(0.006,0.03,hb-h);                          // >~200 m below the surroundings: crater floors
  float patchy=smoothstep(-0.25,0.45,snoise(n*260.0)+0.5*snoise(n*61.0));
  float f=pocket*patchy*cold*wr*mix(0.2,1.0,off)*(1.0-capIce(col));    // faint under the board: the hexes keep their relief
  return max(col, mix(col, vec3(0.83,0.85,0.9)*(0.9+0.2*dot(col,vec3(0.3,0.59,0.11))), f*0.6));   // frost only ever brightens
}
// The polar caps retreat as the planet warms: from their margins inward (how deep in the cap a
// point is = the ice fraction around it, 8 taps of the globe colour ~2.5 deg out), in noisy lobes,
// down to a lasting core at the warmest; the ground left behind is the dark reddish layered
// deposits, damp-dark along the retreating edge.
vec3 capMelt(vec3 col, vec3 n, vec2 uv){
  float ice=capIce(col);
  if(ice<=0.0||uHeat<=0.02) return col;
  float cl=max(sqrt(1.0-n.y*n.y),0.08), r=0.045, deep=0.0;
  for(int i=0;i<8;i++){
    float a=float(i)*0.785398;
    deep+=capIce(texture2D(uT,uv+vec2(cos(a)*r/(6.2832*cl),sin(a)*r/3.14159)).rgb);
  }
  deep=smoothstep(0.08,0.5,deep/8.0);                // the cap is streaked with dark troughs: ~half ice even deep inside
  float lobes=0.6*snoise(n*9.0)+0.4*snoise(n*27.0);
  float thick=deep+0.22*lobes;                       // ~0 at the margins, ~1 deep in the cap
  float m=max(uHeat-0.12,0.0)*0.7;                   // melt line (0 .. 0.62): the margins go first, the core stays
  float gone=ice*(1.0-smoothstep(m-0.05,m+0.05,thick));
  vec3 ground=vec3(0.47,0.27,0.17)*(0.55+0.6*dot(col,vec3(0.3,0.59,0.11)));   // keeps the ice's own relief detail
  ground*=mix(1.0,0.78,smoothstep(0.12,0.0,thick-m));  // freshly exposed: damp, darker
  return mix(col,ground,gone);
}
// shadows of the clouds (the cloud layer's own density, cloudMaterial in board3d.js, sampled
// where the sun ray through this point crosses the layer): off the board only, as the clouds
float cloudShadow(vec3 n, float off){
  if(off<=0.01) return 1.0;
  float sz=dot(n,uSun);
  if(sz<=0.02) return 1.0;
  vec3 q=normalize(n+(uSun-n*sz)*(0.012/max(sz,0.25)));             // the layer is 1.2% of R up
  float a=uTime*0.012;
  vec3 p=vec3(q.x*cos(a)-q.z*sin(a), q.y, q.x*sin(a)+q.z*cos(a));
  float c=smoothstep(0.52,0.8,fbm(p*3.0+vec3(0.0,uTime*0.004,0.0),3)*0.5+0.5);
  return 1.0-c*off*(0.28+uLife*0.25)*0.75;
}
`;

// Night-side lights: once there are cities on the board, settlements spread over the rest of
// the planet too -- clusters of warm lights that only show on the night side, more of them with
// every city (uCities 0..1), drawn to coasts once there are seas, never on water or ice.
// Uses hash3() from noiseGLSL.
export const nightLightsGLSL = /* glsl */`
uniform float uCities;
// a real night side off the board: the sky fill keeps the far limb from going black, but past
// the terminator the ground dims to ~60% so the terminator reads (the board keeps its light)
float nightDim(vec3 n, float off){ return mix(1.0,0.6,smoothstep(0.0,-0.4,dot(n,uSun))*off); }
vec3 nightLights(vec3 n, float sea, float coast, float ice, float off){
  if(uCities<=0.0||off<=0.0) return vec3(0.0);                     // (the result is scaled by off: nothing on the board)
  float night=smoothstep(0.02,-0.18,dot(n,uSun));
  if(night<=0.0) return vec3(0.0);
  // settlements: a sparse set of cells switch on as cities are built -- towns (a fine grid,
  // many) and cities (a coarse grid, fewer, bigger, brighter)
  float glow=0.0;
  for(int o=0;o<2;o++){
    float sc=o==0?22.0:57.0, pr=o==0?0.3:0.22, sz=o==0?16.0:26.0, br=o==0?1.0:0.55;
    vec3 p=n*sc; vec3 c=floor(p); vec3 f=p-c;
    for(int i=0;i<2;i++){ for(int j=0;j<2;j++){ for(int k=0;k<2;k++){
      vec3 g=c+vec3(float(i),float(j),float(k))-1.0+step(0.5,f);     // the 2x2x2 cells nearest p
      vec3 h=hash3(g+vec3(3.7+float(o)*11.0));
      float on=step(h.x,uCities*pr*(0.5+1.2*coast));
      vec3 d=p-(g+0.25+0.5*h);
      glow+=on*br*exp(-dot(d,d)*sz*(1.0+2.0*h.y))*(0.5+0.8*h.z);
    }}}
  }
  // the fine street grain inside a settlement
  vec3 q=n*420.0; vec3 hq=hash3(floor(q));
  float grain=step(0.62,hq.x)*(0.6+0.4*hq.y);
  float l=min(glow,1.2)*(0.35+0.65*grain)*night*(1.0-sea)*(1.0-ice)*off;
  return vec3(1.0,0.72,0.38)*l*0.9;
}
`;

// Dust: the thin, cold early atmosphere carries dust -- a faint ochre veil over the rest of the
// planet, and one regional dust storm drifting slowly across it. Both clear as the planet
// warms and its air thickens (gone by about half-way). Off the board only (offS).
export const dustGLSL = /* glsl */`
vec3 dustFx(vec3 lit, vec3 n, float offS){
  float dusty=1.0-smoothstep(0.05,0.55,max(uHeat,uLife*0.8));
  if(dusty<=0.0||offS<=0.0) return lit;
  float sunL=max(dot(n,uSun),0.0)*0.9+0.1;
  // the storm: a big soft blob wandering round the planet (one lap in ~17 min), billowy inside
  float a=uTime*0.006;
  vec3 c=normalize(vec3(cos(a), 0.8*sin(a), 0.12+0.1*sin(a*2.3)));      // circling the board ~80 deg out: on the limb, never over the hexes
  vec3 q=n+0.18*vec3(snoise(n*2.2+uTime*0.01), snoise(n*2.2+7.0), snoise(n*2.2+13.0));
  float storm=smoothstep(0.935,0.975,dot(normalize(q),c));
  float bill=fbm(n*8.0+vec3(0.0,uTime*0.02,0.0),3)*0.5+0.5;         // billows: brighter tops, darker gaps
  float veil=0.1+0.05*snoise(n*3.0+vec3(uTime*0.005));
  lit=mix(lit, vec3(0.8,0.55,0.36)*sunL, veil*dusty*offS);
  float st=storm*dusty*offS*smoothstep(0.25,0.55,bill+0.25*storm);
  return mix(lit, vec3(0.92,0.66,0.43)*sunL*(0.85+0.4*bill), st*0.8);
}
`;

// Frozen seas: oceans that arrive while the planet is still cold carry pack ice (off the board:
// the board's own oceans are the animated water). They always read as seas: at -30 C about half
// the surface is grey-blue floes with dark leads and polynyas between them; the ice breaks up into
// scattered floes by about -18 C and is gone by about -10 C. The thin ice goes first -- the floes'
// edges (translucent, the water showing through) and the deep water -- the thick floe cores and the
// shallows last. Returns the ice cover (0..1) so the caller can take the glint off.
export const seaIceGLSL = /* glsl */`
float seaIce(inout vec3 water, vec3 n, float basin, float level){
  // uHeat 0..1 = -30..+8 C: -30 -> 0, -18 -> 0.32, -10 -> 0.53
  float h=uHeat;
  if(h>=0.53) return 0.0;
  float depth=clamp((level-basin)/0.25,0.0,1.0);                     // 0 at the shore .. 1 deep
  // floe field: big floes, broken by smaller cracks, pulled apart into leads
  float f=0.6*(snoise(n*16.0)*0.5+0.5)+0.4*(snoise(n*47.0+3.0)*0.5+0.5);
  float lead=smoothstep(0.035,0.0,abs(snoise(n*9.0+11.0)))*0.35;     // long open leads
  f-=lead;
  // threshold: ~50-60% cover at -30, only floes (~15%) at -18, none at -10
  float t=h<0.32?mix(0.495,0.675,h/0.32):mix(0.675,0.95,(h-0.32)/0.21);
  t+=depth*0.05-(1.0-depth)*0.03;                                     // the deep water opens first
  float core=smoothstep(t,t+0.07,f);                                  // 0 at the floe edge .. 1 in the thick core
  float cover=smoothstep(t-0.005,t+0.02,f);
  float ridge=snoise(n*90.0+7.0)*0.5+0.5;
  vec3 ice=vec3(0.36,0.46,0.56)*(0.9+0.2*ridge);                     // grey-blue pack ice, ridged
  float op=cover*mix(0.45,0.92,core);                                 // translucent thin edges, near-opaque cores
  water=mix(water,ice,op);
  return op;
}
`;
