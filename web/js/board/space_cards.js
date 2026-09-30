// space_cards.js -- the space cards leave something behind in the sky round
// Mars. Tiny, dim, never labelled, never hoverable or clickable: scenery, not
// game pieces. The owner's colour appears only as one faint nav light.
//
// Design table (card -> touch). Orbits are inclined ~50-70 deg to the home view
// so they read as ellipses hugging the limb: the near half passes just outside
// the globe's edge (perspective bulges it out), mostly below the globe in the
// open sky under the board (the colony hexes and the HUD are above), and the
// far half slips behind Mars -- real 3D positions, depth-tested against the planet -- so nothing
// crosses the hexes (checked numerically for every orbit below: 0 % over the
// board, 25-43 % hidden behind the globe).
//
//   card                        touch                                                   tier
//   Space Station               tiny station (habitat ring + spine + two solar          L M H
//                               panels) in a low inclined orbit; a small rocket
//                               lifts it from one of the owner's cities when played
//   Toll Station                a small beacon platform in a higher orbit, an amber      L M H
//                               light blinking slowly
//   Space Hotels                a tiny spun hotel: drum + wide ring, warm windows        L M H
//   Orbital Construction Yard   an open truss frame round a half-built hull; a welding   L M H
//     (prelude)                 spark flickers now and then
//   Space Elevator              anchored on Mars' EQUATOR well off the board, right on   L M H
//                               the limb, so it leaves the planet sideways and hangs
//                               radially outward (see anchorElevator): a big anchor base
//                               (buried foundation ring, deck, tapered tower with
//                               buttresses, support buildings, radiators, a raised
//                               landing pad, beacons) and climber cars that creep up the
//                               (unseen) cable out of view and back (M: 2, H: 3, L: none).
//                               The cable and its counterweight asteroid are far out of
//                               view: not drawn. Played: the base rises and lights up,
//                               then the climbers start
//   Satellites                  three tiny glints strung along a polar orbit               M H
//   Security Fleet              three tiny patrol craft in a V, retrograde                 M H
//   Giant Space Mirror          a faint thin mirror sail in a high orbit that catches      M H
//                               the sun now and then (a slow wobble brings the glint)
//   Soletta                     THE big one: a segmented orbital mirror (19 hex facets  L M H
//                               in a spoked rim, hub, service boom; ~1/8 of Mars' radius)
//                               on an orbit whose near half swings through the open sky
//                               under the globe; soft sun glint as it rocks; rocket-launched
//                               when played, unfolds in orbit
//   Space Mirrors               three small mirror panels in a row                         M H
//   Solar Wind Power            a small collector satellite with long panels               M H
//   Asteroid Mining             a tiny captured asteroid in orbit with a tug light         M H
//   Lagrange Observatory        a tiny telescope parked far out beyond the lower right    M H
//                               (Mars' L2 side), a faint slow blue-white blink
//   Vesta Shipyard              a faint distant dock: three amber pinpricks in deep sky    M H
//   Earth Office                a comms relay (dish) in a high orbit; a green pulse        M H
//                               every few seconds, data for Earth
//   Shuttles                    every ~20-40 s a small shuttle lifts off one of the        M H
//                               owner's cities, arcs toward the limb and fades         (Medium: half as often)
//   Immigration Shuttles        every ~30-60 s a shuttle comes down from orbit onto one    M H
//                               of the owner's cities, retro-burn glowing
//   Optimal Aerobraking         every ~45-90 s a faint orange plasma streak skims the      M H
//                               upper atmosphere just outside the limb
//   Interstellar Colony Ship    once, when played: a starship leaves Mars orbit, a long  L M H
//                               faint streak dwindling into deep space
//   Trans-Neptune Probe         once, when played: a tiny probe is launched and dwindles L M H
//                               away outward
//   Phobos Space Haven, Ganymede Colony, the Jovian moons (Io Mining Industries,
//   Callisto Penal Mines, Water Import From Europa, Terraforming Ganymede)
//                               -> none here: board3d.js / moons.js / space_fx.js show them
//   Asteroid / Comet / Big Asteroid / Deimos Down / Ice Asteroid / Giant Ice Asteroid /
//   Towing A Comet / Nitrogen-Rich / Aerobraked Ammonia Asteroid (events)
//                               -> none: the impact effects cover them (impact.js)
//   Imported GHG / Import of Advanced GHG / Imported Hydrogen / Imported Nitrogen /
//   Large Convoy / Convoy From Europa / Technology Demonstration (events)
//                               -> none: the generic launch (events_fx.js) covers them
//   Asteroid Mining Consortium, Beam From A Thorium Asteroid, Methane From Titan,
//   Miranda Resort, Lunar Beam, Io Research Outpost,
//   Galilean Mining, Acquired Space Agency, corporations (PhoboLog, Point Luna,
//   Helion, Saturn Systems)    -> none: nothing orbital that would read at this scale
//                                 (Research Outpost is a surface city: its tile art)
//
// Tiers (quality.js): Low keeps the structures (stations, hotel, yard, elevator, Soletta)
// and the one-shot departures, no periodic traffic; Medium everything, the
// periodic traffic half as often; High everything.
//
// Hooked from board3d.js (constructed next to MoonFx, reset() on a new map,
// tick() every frame) and app.js / replay.js (setState(view, db, animate) on every
// present: persistent objects appear instantly on a load / new game / undo; a
// card played live launches its object on a small rocket, or grows / fires
// its first flight). events_fx.js skips its generic launch for cards that
// launch here (ownsLaunch).
//
// Cost: one sun-lit vertex-colour material for every hull (all InstancedMesh,
// so one program), one Points draw for every light, one LineSegments draw for
// trails + streaks. No lights, no textures; the three programs are
// compiled at start (prewarm), and the frame loop creates no objects. Animations
// run on their own clock (sum of the frame dt, capped at 0.1 s), so a slow or
// stalled frame never skips a launch.
//
// Debug / screenshots: ?spacecards=all (or a comma list of touch keys) forces
// touches on (owners alternating); ?spacecards=0 turns the module off.
import * as THREE from 'three';
import { gfx } from './quality.js';

const CARD_TOUCH = {
  'Space Station': 'station', 'Toll Station': 'toll', 'Space Hotels': 'hotel', 'Orbital Construction Yard': 'yard',
  'Space Elevator': 'elevator', 'Satellites': 'sats', 'Security Fleet': 'fleet', 'Giant Space Mirror': 'giant',
  'Soletta': 'soletta', 'Space Mirrors': 'mirrors', 'Solar Wind Power': 'windsat', 'Asteroid Mining': 'rock',
  'Lagrange Observatory': 'lagrange', 'Vesta Shipyard': 'vesta', 'Earth Office': 'relay',
  'Shuttles': 'shuttles', 'Immigration Shuttles': 'immigration', 'Optimal Aerobraking': 'aerobrake',
  'Interstellar Colony Ship': 'starship', 'Trans-Neptune Probe': 'probe',
};
const LOW = new Set(['station', 'toll', 'hotel', 'yard', 'elevator', 'soletta', 'starship', 'probe']);
const PERIODIC = { shuttles: [20, 40], immigration: [30, 60], aerobrake: [45, 90] };
const ONESHOT = new Set(['starship', 'probe']);
// orbiters: [radius (Mars radii), line-of-nodes screen angle (deg), tilt (deg; < 0: the near half is below), rad/s, count, spacing (rad), phase]
const ORBIT = {
  station: [1.22, 16, -50, 0.027, 1, 0, 0.4],
  toll: [1.5, -14, -60, 0.0144, 1, 0, 2.3],
  hotel: [1.17, -28, -47, 0.03, 1, 0, 4.1],
  yard: [1.3, 34, -52, -0.021, 1, 0, 1.2],
  sats: [1.12, 84, 48, 0.048, 3, 0.42, 5.0],
  fleet: [1.27, 6, -50, -0.03, 3, 0.035, 3.3],
  giant: [1.85, -20, -68, 0.0072, 1, 0, 0.9],
  soletta: [1.6, 8, -62, 0.008, 1, 0, 3.9],          // (big: its near half swings through the open sky under the globe)
  mirrors: [1.36, -40, -55, 0.018, 3, 0.07, 2.7],
  windsat: [1.42, 50, -58, 0.0168, 1, 0, 5.6],
  rock: [1.34, -6, -56, 0.018, 1, 0, 1.7],
  relay: [1.7, 22, -66, 0.0108, 1, 0, 4.6],
};
// parked far out: [x, y (Mars radii from its centre, home view), distance from the home camera (Mars radii)]
const FIXED = { lagrange: [1.28, -0.98, 4.6], vesta: [1.78, 0.18, 30] };
const MIRROR = new Set(['giant', 'soletta', 'mirrors']);
// Space Elevator (world units; Mars' radius is 10). ring: the anchor's angle from the home view
// axis (deg; the silhouette is at 72.4, so 70 = right on the limb, ~20 deg off the board's edge);
// H: tower top above the ground (the tether's foot); hub: the tether's end below the asteroid's
// centre; ext: the asteroid assembly's reach beyond its centre; minT / prefT: the shortest / a good
// free tether; maxOut: the asteroid's centre at most this far above the ground
const ELEV = { ring: 70, H: 0.78, hub: 0.34, ext: 0.36, minT: 1.2, prefT: 2.4, maxOut: 7.5, dur: 8, climbers: 3 };
const CK = Array.from({ length: ELEV.climbers }, (_, i) => 'c' + i);   // the climbers' light groups
const SEGS = { rocket: 14, flight: 10, aero: 18, star: 22, probe: 14 };
const ROCKETS = 2, FLIGHTS = 3;

// ---------------------------------------------------------------- geometry kit
const _M = new THREE.Matrix4(), _Q = new THREE.Quaternion(), _E = new THREE.Euler(), _V = new THREE.Vector3(), _S = new THREE.Vector3();
// [geometry, colour, translate, euler, scale, spec 0..1] parts -> one non-indexed geometry (position, normal, aCol, aSpec)
function kit(parts) {
  const gs = parts.map(([geo, col, t = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1], spec = 0]) => {
    const g = geo.index ? geo.toNonIndexed() : geo;
    g.deleteAttribute('uv');
    g.applyMatrix4(_M.compose(_V.set(t[0], t[1], t[2]), _Q.setFromEuler(_E.set(r[0], r[1], r[2])), _S.set(s[0], s[1], s[2])));
    const n = g.attributes.position.count, c = new THREE.Color(col), ca = new Float32Array(n * 3), sa = new Float32Array(n).fill(spec);
    for (let i = 0; i < n; i++) { ca[i * 3] = c.r; ca[i * 3 + 1] = c.g; ca[i * 3 + 2] = c.b; }
    g.setAttribute('aCol', new THREE.BufferAttribute(ca, 3));
    g.setAttribute('aSpec', new THREE.BufferAttribute(sa, 1));
    return g;
  });
  const out = new THREE.BufferGeometry();
  for (const [nm, size] of [['position', 3], ['normal', 3], ['aCol', 3], ['aSpec', 1]]) {
    const arr = new Float32Array(gs.reduce((s, g) => s + g.attributes[nm].count, 0) * size);
    let o = 0;
    for (const g of gs) { arr.set(g.attributes[nm].array, o); o += g.attributes[nm].array.length; }
    out.setAttribute(nm, new THREE.BufferAttribute(arr, size));
  }
  for (const g of gs) g.dispose();
  return out;
}
const BOX = () => new THREE.BoxGeometry(1, 1, 1);
const CYL = (n = 8) => new THREE.CylinderGeometry(0.5, 0.5, 1, n);
const PI2 = Math.PI / 2;
// a lumpy unit rock (the geometry is non-indexed: the same push for the same corner, so no cracks)
let lumps = 0;
function lumpy() {
  const g = new THREE.IcosahedronGeometry(1, 2), p = g.attributes.position, sd = ++lumps * 7.13;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), h = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + sd) * 43758.5453;
    const k = 0.8 + 0.3 * (h - Math.floor(h)) + 0.12 * Math.sin(x * 3.1 + sd) * Math.cos(z * 2.7 - y);
    p.setXYZ(i, x * k, y * k, z * k);
  }
  g.computeVertexNormals();
  return g;
}
const GREY = 0xb9bec6, DARK = 0x4a5059, PANEL = 0x1f2d52, GOLD = 0xa88a4a, SAIL = 0x1c2129, SOL = 0x4a5262;
const GEO = {
  // ring (axis Y) + spine along Y + two panel wings off the spine's ends
  station: () => kit([
    [new THREE.TorusGeometry(0.11, 0.017, 5, 18), GREY, [0, 0, 0], [PI2, 0, 0]],
    [CYL(6), DARK, [0, 0, 0], [0, 0, 0], [0.022, 0.34, 0.022]],
    [BOX(), GREY, [0, 0, 0], [0, 0, 0], [0.05, 0.05, 0.05]],
    [BOX(), DARK, [0.11, 0, 0], [0, 0, 0], [0.22, 0.008, 0.008]],
    [BOX(), DARK, [-0.11, 0, 0], [0, 0, 0], [0.22, 0.008, 0.008]],
    [BOX(), PANEL, [0, 0.15, 0], [0, 0, 0], [0.16, 0.004, 0.06], 0.7],
    [BOX(), PANEL, [0, -0.15, 0], [0, 0, 0], [0.16, 0.004, 0.06], 0.7],
  ]),
  toll: () => kit([
    [CYL(6), DARK, [0, 0, 0], [0, 0, 0], [0.13, 0.022, 0.13]],
    [CYL(6), GREY, [0, 0.016, 0], [0, 0, 0], [0.09, 0.012, 0.09]],
    [CYL(4), GREY, [0, 0.07, 0], [0, 0, 0], [0.008, 0.11, 0.008]],
    [BOX(), PANEL, [0.12, 0, 0], [0, 0, 0], [0.1, 0.004, 0.04], 0.7],
  ]),
  hotel: () => kit([
    [CYL(10), GREY, [0, 0, 0], [0, 0, 0], [0.07, 0.16, 0.07]],
    [new THREE.TorusGeometry(0.1, 0.02, 5, 20), 0xd8d2c4, [0, 0.02, 0], [PI2, 0, 0]],
    [BOX(), DARK, [0, 0.02, 0], [0, 0, 0], [0.2, 0.008, 0.008]],
    [BOX(), DARK, [0, 0.02, 0], [0, PI2, 0], [0.2, 0.008, 0.008]],
    [BOX(), PANEL, [0, 0.11, 0], [0, 0, 0], [0.12, 0.004, 0.05], 0.7],
  ]),
  // an open truss box round a half-built hull
  yard: () => {
    const L = 0.34, W2 = 0.07, t = 0.008, P = [];
    for (const [y, z] of [[W2, W2], [W2, -W2], [-W2, W2], [-W2, -W2]]) P.push([BOX(), GOLD, [0, y, z], [0, 0, 0], [L, t, t]]);
    for (const x of [-L / 2, -L / 6, L / 6, L / 2]) for (const [y, z, sy, sz] of [[W2, 0, t, 2 * W2], [-W2, 0, t, 2 * W2], [0, W2, 2 * W2, t], [0, -W2, 2 * W2, t]]) P.push([BOX(), GOLD, [x, y, z], [0, 0, 0], [t, sy, sz]]);
    P.push([BOX(), GREY, [-0.04, 0, 0], [0, 0, 0], [0.16, 0.06, 0.06]]);
    P.push([new THREE.ConeGeometry(0.03, 0.06, 6), GREY, [-0.15, 0, 0], [0, 0, PI2]]);
    return kit(P);
  },
  // Space Elevator anchor. Local Y = up the tether (radial), Z = toward the home camera (so, on
  // the limb, the skyline spreads along X), ground at y = 0 (the foundation goes well under it)
  elevBase: () => {
    const H = ELEV.H, P = [], TW = 0x9ba1a9, BLD = 0xa9aeb5, h = H - 0.27;
    P.push([CYL(14), DARK, [0, -0.12, 0], [0, 0, 0], [1.12, 0.3, 1.12]]);                  // foundation ring (mostly buried)
    P.push([CYL(14), 0x7d838b, [0, 0.04, 0], [0, 0, 0], [1.08, 0.06, 1.08]]);              // deck
    P.push([new THREE.TorusGeometry(0.54, 0.016, 4, 28), GOLD, [0, 0.07, 0], [PI2, 0, 0]]); // deck rim
    P.push([CYL(8), GREY, [0, 0.12, 0], [0, 0, 0], [0.68, 0.1, 0.68]]);                    // stepped tiers
    P.push([new THREE.TorusGeometry(0.345, 0.012, 4, 24), 0xffe2b0, [0, 0.13, 0], [PI2, 0, 0], [1, 1, 1], 2]);   // a lit window band round the tier
    P.push([CYL(8), 0x8f959d, [0, 0.21, 0], [0, 0, 0], [0.4, 0.08, 0.4]]);
    P.push([new THREE.CylinderGeometry(0.04, 0.13, h, 8), TW, [0, 0.25 + h / 2, 0], [0, 0, 0], [1, 1, 1], 0.35]);   // tapered tower
    for (const [y, r] of [[0.4, 0.105], [0.58, 0.075]]) P.push([CYL(8), GOLD, [0, y, 0], [0, 0, 0], [2 * r, 0.024, 2 * r]]);   // bands
    P.push([CYL(8), GREY, [0, H - 0.04, 0], [0, 0, 0], [0.17, 0.05, 0.17]]);               // tether head
    P.push([new THREE.TorusGeometry(0.095, 0.013, 4, 16), DARK, [0, H - 0.02, 0], [PI2, 0, 0]]);
    for (let i = 0; i < 4; i++) {                                                           // buttresses: deck edge -> tower
      const az = i * PI2 + Math.PI / 4, ax = 0.46, ay = 0.08, bx = 0.08, by = 0.5, L = Math.hypot(ax - bx, by - ay);
      P.push([BOX(), DARK, [Math.cos(az) * (ax + bx) / 2, (ay + by) / 2, -Math.sin(az) * (ax + bx) / 2], [0, az, Math.atan2(ax - bx, by - ay)], [0.035, L, 0.035]]);
    }
    P.push([BOX(), BLD, [0.36, 0.13, 0.12], [0, 0, 0], [0.18, 0.12, 0.14]]);               // support buildings
    for (const y of [0.11, 0.155]) P.push([BOX(), 0xffd08a, [0.36, y, 0.192], [0, 0, 0], [0.15, 0.014, 0.004], 2]);   // lit windows
    P.push([BOX(), 0xffd08a, [-0.36, 0.19, -0.018], [0, 0, 0], [0.11, 0.014, 0.004], 2]);
    P.push([BOX(), 0xcfe4ff, [0, 0.47, 0.094], [-0.174, 0, 0], [0.014, 0.3, 0.004], 2]);   // a lit service strip up the tower's face (follows its taper)
    P.push([BOX(), 0x959ba3, [-0.36, 0.15, -0.08], [0, 0, 0], [0.14, 0.16, 0.12]]);
    P.push([BOX(), BLD, [0.05, 0.1, -0.4], [0, 0, 0], [0.12, 0.07, 0.16]]);
    P.push([BOX(), 0xb3b8bf, [0.12, 0.11, 0.4], [0, 0, 0], [0.1, 0.09, 0.1]]);
    P.push([new THREE.SphereGeometry(0.08, 10, 5, 0, Math.PI * 2, 0, PI2), 0xdadde1, [-0.26, 0.07, 0.3]]);   // dome
    for (const x of [0.3, 0.44]) P.push([BOX(), 0xe2e5e9, [x, 0.27, 0.12], [0, 0, 0], [0.13, 0.15, 0.006], 0.45]);   // radiators (face the camera)
    P.push([CYL(4), DARK, [0.28, 0.3, -0.14], [0, 0, 0], [0.014, 0.36, 0.014]]);            // comms mast + dish
    P.push([new THREE.ConeGeometry(0.045, 0.028, 10, 1, true), 0xdfe2e6, [0.28, 0.48, -0.14], [Math.PI, 0, 0]]);
    // a raised landing pad along the skyline, on a pylon, a lander parked on it, a walkway to the deck
    P.push([CYL(6), DARK, [-0.8, -0.02, 0.05], [0, 0, 0], [0.1, 0.3, 0.1]]);
    P.push([CYL(12), 0x8a9098, [-0.8, 0.14, 0.05], [0, 0, 0], [0.34, 0.03, 0.34]]);
    P.push([new THREE.TorusGeometry(0.12, 0.009, 4, 16), GOLD, [-0.8, 0.157, 0.05], [PI2, 0, 0]]);
    P.push([BOX(), DARK, [-0.6, 0.11, 0.05], [0, 0, 0], [0.2, 0.025, 0.05]]);
    P.push([new THREE.ConeGeometry(0.032, 0.09, 6), 0xe4e6ea, [-0.8, 0.2, 0.05]]);
    return kit(P);
  },

  // the counterweight: a captured asteroid (local Y out along the tether), a small station bolted
  // onto its planet side; the tether ends at y = -ELEV.hub
  elevRock: () => kit([
    [lumpy(), 0x86705c, [0, 0, 0], [0, 0, 0], [0.3, 0.25, 0.26]],
    [lumpy(), 0x6d5c4e, [0.17, 0.11, -0.05], [0.7, 0.3, 0], [0.15, 0.13, 0.14]],
    [lumpy(), 0x7a6755, [-0.19, 0.06, 0.05], [0.2, 1.1, 0.4], [0.11, 0.1, 0.1]],
    [CYL(8), DARK, [0, -0.27, 0], [0, 0, 0], [0.12, 0.14, 0.12]],                          // docking hub (the tether's end)
    [new THREE.TorusGeometry(0.08, 0.013, 4, 16), GREY, [0, -0.3, 0], [PI2, 0, 0]],
    [BOX(), GOLD, [0, -0.2, 0.08], [0, 0, 0], [0.5, 0.018, 0.018]],                        // truss
    [CYL(8), 0xc9cdd3, [0.12, -0.19, 0.09], [0, 0, PI2], [0.09, 0.24, 0.09]],              // module
    [CYL(6), 0xdcdfe4, [-0.12, -0.23, 0.1], [0, 0, 0], [0.06, 0.08, 0.06]],                // tank
    [BOX(), PANEL, [0.35, -0.2, 0.08], [0.35, 0, 0], [0.18, 0.1, 0.004], 0.7],             // solar panels (face the camera)
    [BOX(), PANEL, [-0.35, -0.2, 0.08], [0.35, 0, 0], [0.18, 0.1, 0.004], 0.7],
    [CYL(4), DARK, [0.06, 0.3, 0], [0, 0, 0], [0.01, 0.12, 0.01]],                         // mast + dish on the far side
    [new THREE.ConeGeometry(0.05, 0.025, 10, 1, true), 0xdfe2e6, [0.06, 0.36, 0], [Math.PI, 0, 0]],
  ]),
  // a climber car, along Y
  elevClimber: () => kit([
    [CYL(8), 0xe2e5e9, [0, 0, 0], [0, 0, 0], [0.06, 0.08, 0.06], 0.4],
    [new THREE.ConeGeometry(0.03, 0.028, 8), 0xe2e5e9, [0, 0.054, 0]],
    [new THREE.ConeGeometry(0.03, 0.028, 8), 0xe2e5e9, [0, -0.054, 0], [Math.PI, 0, 0]],
    [CYL(8), GOLD, [0, 0, 0], [0, 0, 0], [0.066, 0.014, 0.066]],
  ]),
  // the tether ribbon: a unit box, scaled per frame (width, length, thickness)
  elevRibbon: () => kit([[BOX(), 0xb4bcc6, [0, 0.5, 0], [0, 0, 0], [1, 1, 1], 0.95]]),
  sats: () => kit([
    [BOX(), GOLD, [0, 0, 0], [0, 0, 0], [0.028, 0.028, 0.036]],
    [BOX(), PANEL, [0.055, 0, 0], [0, 0, 0], [0.08, 0.003, 0.028], 0.9],
    [BOX(), PANEL, [-0.055, 0, 0], [0, 0, 0], [0.08, 0.003, 0.028], 0.9],
  ]),
  // a small patrol wedge, nose +Z
  fleet: () => kit([
    [new THREE.ConeGeometry(0.03, 0.1, 4), DARK, [0, 0, 0], [PI2, 0, 0], [1, 1, 0.45]],
    [BOX(), GREY, [0, 0.008, -0.02], [0, 0, 0], [0.02, 0.012, 0.04]],
  ]),
  giant: () => kit([[CYL(16), SAIL, [0, 0, 0], [0, 0, 0], [0.34, 0.003, 0.34], 1], [BOX(), DARK, [0, -0.01, 0], [0, 0, 0], [0.03, 0.02, 0.03]]]),
  // Soletta: the big one -- a segmented mirror (19 hex facets, ~1.2 across) in a spoked rim, a hub and a short service boom
  soletta: () => {
    const a = 0.128, P = [], d = Math.sqrt(3) * a;
    for (let q = -2; q <= 2; q++) for (let r2 = -2; r2 <= 2; r2++) {
      if (Math.abs(q + r2) > 2) continue;
      const x = d * (q + r2 / 2), z = d * r2 * Math.sqrt(3) / 2;
      P.push([CYL(6), [SOL, 0x5c6577, 0x434a59][((q - r2) % 3 + 3) % 3], [x, 0, z], [0, Math.PI / 6, 0], [2 * a * 0.97, 0.004, 2 * a * 0.97], 0.5]);   // (facets a touch uneven: segments)
    }
    P.push([new THREE.TorusGeometry(0.6, 0.009, 4, 36), GREY, [0, -0.004, 0], [PI2, 0, 0]]);
    for (let i = 0; i < 6; i++) { const t = i * Math.PI / 3; P.push([BOX(), DARK, [Math.cos(t) * 0.3, -0.008, Math.sin(t) * 0.3], [0, -t, 0], [0.6, 0.008, 0.012]]); }
    P.push([CYL(8), GREY, [0, -0.03, 0], [0, 0, 0], [0.09, 0.05, 0.09]]);
    P.push([CYL(4), DARK, [0, -0.12, 0], [0, 0, 0], [0.012, 0.18, 0.012]]);
    P.push([BOX(), GOLD, [0, -0.22, 0], [0, 0, 0], [0.06, 0.04, 0.05]]);
    return kit(P);
  },
  mirrors: () => kit([[BOX(), SAIL, [0, 0, 0], [0, 0, 0], [0.12, 0.003, 0.12], 1], [BOX(), DARK, [0, -0.008, 0], [0, 0, 0], [0.02, 0.012, 0.02]]]),
  windsat: () => kit([
    [BOX(), GREY, [0, 0, 0], [0, 0, 0], [0.035, 0.035, 0.05]],
    [BOX(), DARK, [0, 0, 0], [0, 0, 0], [0.4, 0.006, 0.006]],
    [BOX(), PANEL, [0.13, 0, 0], [0, 0, 0], [0.13, 0.003, 0.05], 0.8],
    [BOX(), PANEL, [-0.13, 0, 0], [0, 0, 0], [0.13, 0.003, 0.05], 0.8],
  ]),
  rock: () => {
    const g = new THREE.IcosahedronGeometry(1, 1), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {                     // lumpy: the same push for the same corner (the geometry is non-indexed)
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), h = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
      const k = 0.75 + 0.45 * (h - Math.floor(h));
      p.setXYZ(i, x * k * 1.3, y * k * 0.85, z * k);
    }
    g.computeVertexNormals();
    return kit([[g, 0x6e5c4c, [0, 0, 0], [0, 0, 0], [0.07, 0.07, 0.07]], [BOX(), GREY, [0.12, 0.02, 0], [0, 0, 0], [0.03, 0.02, 0.04]]]);
  },
  lagrange: () => kit([
    [CYL(8), 0xd6d9de, [0, 0, 0], [PI2, 0, 0], [0.05, 0.14, 0.05]],
    [BOX(), GOLD, [0, -0.04, -0.03], [0.3, 0, 0], [0.13, 0.004, 0.12], 0.3],
  ]),
  relay: () => kit([
    [BOX(), GREY, [0, 0, 0], [0, 0, 0], [0.04, 0.04, 0.04]],
    [new THREE.ConeGeometry(0.05, 0.03, 10, 1, true), 0xdfe2e6, [0, 0.035, 0], [Math.PI, 0, 0]],
    [BOX(), PANEL, [0.08, 0, 0], [0, 0, 0], [0.1, 0.003, 0.035], 0.8],
    [BOX(), PANEL, [-0.08, 0, 0], [0, 0, 0], [0.1, 0.003, 0.035], 0.8],
  ]),
  // shuttle, nose +Z
  shuttle: () => kit([
    [BOX(), 0xdcdfe4, [0, 0, 0], [0, 0, 0], [0.022, 0.018, 0.07]],
    [new THREE.ConeGeometry(0.011, 0.022, 6), 0xdcdfe4, [0, 0, 0.046], [PI2, 0, 0]],
    [BOX(), DARK, [0, -0.004, -0.012], [0, 0, 0], [0.06, 0.004, 0.03]],
  ]),
};

// ---------------------------------------------------------------- materials
function hullMaterial(SUN, R, exposure) {
  return new THREE.ShaderMaterial({
    uniforms: { uSun: { value: SUN.clone() }, uR: { value: R }, uK: { value: exposure } },
    side: THREE.DoubleSide,
    vertexShader: `attribute vec3 aCol; attribute float aSpec; varying vec3 vN; varying vec3 vC; varying vec3 vW; varying float vS;
      void main(){
        mat4 m=modelMatrix;
        #ifdef USE_INSTANCING
        m=m*instanceMatrix;
        #endif
        vN=normalize(mat3(m)*normal); vC=aCol; vS=aSpec;
        vec4 w=m*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w;
      }`,
    fragmentShader: `uniform vec3 uSun; uniform float uR; uniform float uK; varying vec3 vN; varying vec3 vC; varying vec3 vW; varying float vS;
      void main(){
        vec3 N=normalize(vN); if(!gl_FrontFacing) N=-N;
        vec3 V=normalize(cameraPosition-vW);
        float sd=dot(vW,uSun);                                        // in Mars' shadow?
        float lit=sd>0.0 ? 1.0 : smoothstep(uR*0.97,uR*1.03,length(vW-sd*uSun));
        float d=max(dot(N,uSun),0.0)*lit;
        float ss=min(vS,1.0), em=step(1.5,vS);                          // aSpec >= 2: self-lit (windows, light strips)
        float sp=pow(max(dot(reflect(-uSun,N),V),0.0),mix(10.0,90.0,ss))*mix(0.12,0.85,ss)*lit;
        vec3 col=mix(vC*(0.1+0.95*d)+vec3(1.0,0.95,0.86)*sp, vC, em);
        gl_FragColor=vec4(col*uK,1.0);
        #include <colorspace_fragment>
      }`,
  });
}
// point lights: aCol already carries the light's fade; aBlink = (rate, phase, size):
// rate > 0 slow blink, < 0 double strobe, 0 steady
function lightMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uH: { value: 900 }, uMin: { value: 2 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute vec3 aCol; attribute vec3 aBlink; uniform float uTime; uniform float uH; uniform float uMin; varying vec3 vC;
      void main(){
        vec4 mv=modelViewMatrix*vec4(position,1.0); gl_Position=projectionMatrix*mv;
        float ph=fract(uTime*abs(aBlink.x)+aBlink.y);
        float on=aBlink.x>0.0 ? mix(0.15,1.0,smoothstep(0.0,0.06,ph)*smoothstep(0.5,0.4,ph)) : aBlink.x<0.0 ? ((ph<0.05||(ph>0.12&&ph<0.16)) ? 1.0 : 0.0) : 1.0;
        vC=aCol*on;
        gl_PointSize=max(uMin, aBlink.z*projectionMatrix[1][1]*uH*0.5/-mv.z);
      }`,
    fragmentShader: `varying vec3 vC;
      void main(){
        float d=length(gl_PointCoord-0.5)*2.0;
        float core=smoothstep(0.5,0.0,d), halo=smoothstep(1.0,0.1,d);
        float a=core+halo*halo*0.4, m=max(vC.r,max(vC.g,vC.b));
        if(m*a<0.003) discard;
        gl_FragColor=vec4(mix(vC,vec3(m),core*0.45)*a,1.0);
      }`,
  });
}
function lineMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: 'attribute vec3 aCol; varying vec3 vC; void main(){ vC=aCol; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'varying vec3 vC; void main(){ gl_FragColor=vec4(vC,1.0); }',
  });
}

const smooth = (e) => e * e * (3 - 2 * e);
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

export class SpaceCards {
  constructor(board, H) {
    this.b = board;
    this.H = H;                        // { SUN, srand, EXPOSURE }
    this.built = false;
    this.own = new Map();              // touch key -> owner id (the view's)
    this.cities = [[], []];            // per player: city cells on Mars
    this.flights = [];
    this.now = 0;
    this.force = null;
    try {
      const q = new URLSearchParams(location.search).get('spacecards');
      if (q === '0') this.off = true;
      else if (q) this.force = q === 'all' ? Object.values(CARD_TOUCH) : q.split(',').map((s) => s.trim());
    } catch { /* no location */ }
  }

  // ---------------------------------------------------------------- the game's state
  // does this card's play show its own launch here (so events_fx.js skips its generic rocket)?
  ownsLaunch(name) { const k = CARD_TOUCH[name]; return !this.off && !!k && this.allowed(k); }
  allowed(k) { return gfx.low ? LOW.has(k) : true; }

  setState(view, db, animate) {
    if (this.off || !view || !db) return;
    try { this.apply(view, db, animate); } catch (e) { this.off = true; if (this.root) this.root.visible = false; console.warn('space_cards off:', e); }
  }
  apply(view, db, animate) {
    const want = new Map();
    if (view.stage !== 0) {
      for (const p of view.players) for (const id of [...(p.played || []), ...(p.events || [])]) {
        const k = CARD_TOUCH[db.cards[id]?.name];
        if (k) want.set(k, p.id);
      }
    }
    if (this.force) this.force.forEach((k, i) => { if (!want.has(k)) want.set(k, i % 2); });
    const cells = this.b.cells || [];
    this.cities = [[], []];
    for (const [s, t, o] of view.tiles || []) if ((t === 2 || t === 3) && cells[s] && !cells[s].colony) (this.cities[o] ||= []).push(cells[s]);
    if (!this.ensure()) { this.own = want; this.pendingSync = true; return; }
    for (const [k, o] of want) {
      const T = this.T[k];
      if (!T || (this.own.has(k) && this.own.get(k) === o && T.on)) continue;
      T.owner = o;
      this.turnOn(T, animate);
    }
    for (const k of this.own.keys()) if (!want.has(k) && this.T[k]) this.turnOff(this.T[k]);
    this.own = want;
    if (this.T.elevator.on) this.anchorElevator(false);
  }
  reset() {
    this.own = new Map();
    this.cities = [[], []];
    if (!this.built) return;
    for (const T of Object.values(this.T)) this.turnOff(T);
    for (const L of this.rockets) L.T = null;
    for (const F of this.flights) F.kind = null;
    this.aero.t0 = -1e9; this.star.t0 = -1e9; this.probe.t0 = -1e9;
    this.T.elevator.anchor = null;
    if (this.force) this.setState({ players: [], tiles: [], stage: 2 }, { cards: [] }, false);
  }
  turnOn(T, animate) {
    const now = this.now;
    T.on = true;
    if (T.kind === 'periodic') { T.next = now + (animate ? 2.5 : this.interval(T.key) * (0.3 + 0.7 * Math.random())); return; }
    if (T.kind === 'oneshot') { if (animate && this.allowed(T.key)) this.fire(T.key); return; }
    if (!animate || !this.allowed(T.key)) { T.k = 1; T.deploy = null; return; }
    T.k = 0;
    if (T.kind === 'orbit') this.launch(T.key);
    else if (T.key === 'elevator') { this.anchorElevator(true); T.deploy = { t0: now + 0.3, dur: ELEV.dur }; }
    else T.deploy = { t0: now + 0.5, dur: 4 };          // far away: fades in
  }
  turnOff(T) { T.on = false; T.k = 0; T.deploy = null; if (T.mesh) T.mesh.visible = false; for (const m of T.extra || []) m.visible = false; for (const L of this.rockets || []) if (L.T === T) L.T = null; }
  interval(k) { const [a, b] = PERIODIC[k]; return (a + Math.random() * (b - a)) * gfx.pick(2, 2, 1); }   // (none at Low: allowed())

  // ---------------------------------------------------------------- build
  ensure() {
    if (this.built) return true;
    if (!this.b.planet || !this.b.home || !this.b.camera) return false;
    this.build();
    return true;
  }
  build() {
    const b = this.b, R = this.R = b.planet.geometry.parameters.radius, r = this.H.srand(4242);
    this.sizeK = b.mobile ? 1.5 : 1;                 // (a phone shows the globe much smaller)
    const f = this.f = b.home.clone().normalize(), hr = this.hr = new THREE.Vector3(1, 0, 0), hu = this.hu = f.clone().cross(hr).normalize();
    this.root = new THREE.Group();
    b.scene.add(this.root);
    this.hullMat = hullMaterial(this.H.SUN, R, this.H.EXPOSURE ?? 1);
    this.T = {};
    const deg = Math.PI / 180;
    const mk = (key, kind, geo, n = 1) => {
      const T = this.T[key] = { key, kind, on: false, k: 0, owner: 0, deploy: null, n, mats: Array.from({ length: n }, () => new THREE.Matrix4()), spin: 0, rot: new THREE.Matrix4() };
      if (geo) {
        const m = T.mesh = new THREE.InstancedMesh(GEO[geo](), this.hullMat, n);
        m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        m.frustumCulled = false; m.visible = false;
        this.root.add(m);
      }
      return T;
    };
    for (const [k, [rad, psi, tilt, w, n, gap, ph]] of Object.entries(ORBIT)) {
      const T = mk(k, 'orbit', k, n);
      const u = hr.clone().multiplyScalar(Math.cos(psi * deg)).addScaledVector(hu, Math.sin(psi * deg));
      const wv = f.clone().cross(u).normalize();
      const v = wv.multiplyScalar(Math.cos(tilt * deg)).addScaledVector(f, Math.sin(tilt * deg));
      T.o = { u, v, n: u.clone().cross(v).normalize(), r: rad * R, w, gap, ph, near: tilt > 0 ? PI2 : -PI2 };
      T.rot.makeRotationFromEuler(_E.set(r() * 6.28, r() * 6.28, r() * 6.28));
      T.spin = (0.05 + r() * 0.1) * (r() < 0.5 ? -1 : 1);
    }
    this.T.station.rot.identity(); this.T.station.spin = 0.12;          // ring axis along the orbit normal, turning
    this.T.fleet.rot.identity(); this.T.fleet.spin = 0;
    this.T.sats.spin = 0.4;
    for (const [k, [sx, sy, d]] of Object.entries(FIXED)) {
      const T = mk(k, 'fixed', k === 'lagrange' ? 'lagrange' : null);
      // screen spot (sx, sy) in Mars radii at Mars' distance, pushed back to d Mars radii from the home camera
      const D = b.home.length(), sc = R * d * R / D;
      T.pos = b.home.clone().addScaledVector(f, -d * R).addScaledVector(hr, sx * sc).addScaledVector(hu, sy * sc);
      T.rot.makeRotationFromEuler(_E.set(0.4, 2.2, 0.3));
    }
    // the elevator: anchor (T.mesh, mats[0]), asteroid (mats[1]), climbers (mats[2..]), ribbon; its own frame code (elevFrame)
    const E = mk('elevator', 'elevator', 'elevBase');
    E.mats = Array.from({ length: 2 + ELEV.climbers }, () => new THREE.Matrix4());
    const im = (geo, n) => { const m = new THREE.InstancedMesh(GEO[geo](), this.hullMat, n); m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; m.visible = false; this.root.add(m); return m; };
    E.rockMesh = im('elevRock', 1); E.climbMesh = im('elevClimber', ELEV.climbers); E.ribbonMesh = im('elevRibbon', 1);
    E.extra = [E.rockMesh, E.climbMesh, E.ribbonMesh];
    E.lk = { b: 0, r: 0, t: 0 };                       // per light group: base / rock / the tether's tip / climber i (c0, c1..)
    for (const k of CK) E.lk[k] = 0;
    E.tip = new THREE.Vector3(); E.kt = 0;
    this.homeCam = new THREE.PerspectiveCamera();
    for (const k of Object.keys(PERIODIC)) { const T = mk(k, 'periodic', null); T.next = 1e9; }
    for (const k of ONESHOT) mk(k, 'oneshot', null);
    this.shuttles = new THREE.InstancedMesh(GEO.shuttle(), this.hullMat, FLIGHTS);
    this.shuttles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.shuttles.frustumCulled = false;
    this.shuttles.count = 0;
    this.root.add(this.shuttles);
    this.flights = Array.from({ length: FLIGHTS }, () => ({ kind: null, curve: new THREE.CubicBezierCurve3(new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()), t0: 0, dur: 1 }));
    this.rockets = Array.from({ length: ROCKETS }, () => ({ T: null, curve: new THREE.CubicBezierCurve3(new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()), t0: 0, dur: 1 }));
    this.aero = { t0: -1e9, dur: 3.4, o: { u: new THREE.Vector3(), v: new THREE.Vector3(), r: R * 1.045 }, a0: 0 };
    this.star = { t0: -1e9, dur: 10, curve: new THREE.CubicBezierCurve3(new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()) };
    this.probe = { t0: -1e9, dur: 11, curve: new THREE.CubicBezierCurve3(new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()) };
    this.buildLights();
    this.buildLines();
    this.setDyn = this._setDyn.bind(this); this.seg = this._seg.bind(this); this.trail = this._trail.bind(this);
    this.c0 = [0, 0, 0]; this.c1 = [0, 0, 0];
    this.col = { hot: new THREE.Color(0xfff1dc), warm: new THREE.Color(0xffd9a0), blue: new THREE.Color(0xcfe4ff), orange: new THREE.Color(0xff9a50) };
    this.departures = [
      { X: this.star, seg2: this.segs.star, col: this.col.blue, size: 0.09, span: 0.3, w: 0.55 },
      { X: this.probe, seg2: this.segs.probe, col: this.col.warm, size: 0.045, span: 0.16, w: 0.4 },
    ];
    this.built = true;
    this.tmp = { P: new THREE.Vector3(), F: new THREE.Vector3(), U: new THREE.Vector3(), X: new THREE.Vector3(), Y: new THREE.Vector3(), Z: new THREE.Vector3(), A: new THREE.Vector3(), B: new THREE.Vector3(), C: new THREE.Vector3(), M: new THREE.Matrix4(), N: new THREE.Matrix4(), c: new THREE.Color() };
    if (this.pendingSync) { this.pendingSync = false; const want = this.own; this.own = new Map(); for (const [k, o] of want) if (this.T[k]) { this.T[k].owner = o; this.turnOn(this.T[k], false); } this.own = want; if (this.T.elevator.on) this.anchorElevator(false); }
  }

  // every light: a slot in one Points draw
  buildLights() {
    const S = this.slots = [];
    // [touch, instance, local xyz, colour, rate, phase, size (world), owner-tinted]
    const add = (key, inst, p, c, rate, ph, s, owner = false) => S.push({ T: this.T[key], inst, p: new THREE.Vector3(...p), c: new THREE.Color(c), rate, ph, s, owner, W: new THREE.Vector3() });
    add('station', 0, [0, 0.19, 0], 0xff5040, 0.5, 0.1, 0.022);
    add('station', 0, [0.11, 0, 0], 0xffffff, -0.45, 0.6, 0.02);
    add('station', 0, [-0.11, 0, 0.02], 0x000000, 0, 0, 0.018, true);
    add('toll', 0, [0, 0.13, 0], 0xffb040, 0.28, 0, 0.04);
    add('toll', 0, [0.06, 0.01, 0.05], 0x000000, 0, 0, 0.018, true);
    for (let i = 0; i < 3; i++) add('hotel', 0, [Math.cos(i * 2.1) * 0.1, 0.02, Math.sin(i * 2.1) * 0.1], 0xffc27a, 0, 0, 0.016);
    add('hotel', 0, [0, -0.09, 0], 0x000000, 0, 0, 0.018, true);
    add('yard', 0, [0.05, 0.03, 0.03], 0xbfe0ff, -0.33, 0.3, 0.03);
    add('yard', 0, [0.17, 0.07, 0.07], 0xff5040, 0.4, 0.5, 0.018);
    add('yard', 0, [-0.17, -0.07, 0.07], 0x000000, 0, 0, 0.018, true);
    // the elevator (g: light group, see elevFrame): anchor = instance 0, asteroid = 1, climbers = 2.., the tether's tip = -1
    const H = ELEV.H, gAdd = (g, ...a) => { add('elevator', ...a); S[S.length - 1].g = g; };
    gAdd('b', 0, [0, H + 0.04, 0], 0xff5040, 0.3, 0.2, 0.09);                 // tower top beacon
    gAdd('b', 0, [0, 0.55, 0.07], 0xff4030, 0, 0, 0.04);                       // aviation light, mid-tower
    gAdd('b', 0, [0.54, 0.09, 0], 0xffffff, -0.42, 0.1, 0.06);                 // deck strobes
    gAdd('b', 0, [-0.54, 0.09, 0], 0xffffff, -0.42, 0.6, 0.06);
    for (let i = 0; i < 3; i++) gAdd('b', 0, [-0.8 + Math.cos(i * 2.1) * 0.14, 0.17, 0.05 + Math.sin(i * 2.1) * 0.14], 0xffb45a, 0.5, i * 0.12, 0.04);   // pad lights, chasing
    gAdd('b', 0, [0.36, 0.14, 0.2], 0xffd08a, 0, 0, 0.032);                    // windows
    gAdd('b', 0, [-0.36, 0.17, -0.01], 0xffd08a, 0, 0, 0.03);
    gAdd('b', 0, [0.12, 0.12, 0.46], 0xffd08a, 0, 0, 0.028);
    gAdd('b', 0, [-0.1, 0.2, 0.36], 0x000000, 0, 0, 0.04, true);               // owner
    gAdd('r', 1, [0.06, 0.4, 0], 0xff5040, 0.26, 0.5, 0.065);                  // asteroid: beacon, panel-tip strobe, window, owner
    gAdd('r', 1, [0.44, -0.2, 0.09], 0xffffff, -0.5, 0.3, 0.05);
    gAdd('r', 1, [0.12, -0.19, 0.15], 0xffd08a, 0, 0, 0.032);
    gAdd('r', 1, [-0.12, -0.3, 0.1], 0x000000, 0, 0, 0.038, true);
    for (let i = 0; i < ELEV.climbers; i++) gAdd(CK[i], 2 + i, [0, 0, 0.04], 0xffe6b0, 0, 0, 0.045);
    gAdd('t', -1, [0, 0, 0], 0xfff1dc, 0, 0, 0.09);
    for (let i = 0; i < 3; i++) add('sats', i, [0, 0.02, 0], 0xffffff, -0.6, i * 0.31, 0.012);
    for (let i = 0; i < 3; i++) add('fleet', i, [0, 0, -0.055], 0x9fd0ff, 0, 0, 0.018);
    add('fleet', 0, [0, 0.02, 0], 0x000000, 0, 0, 0.016, true);
    add('windsat', 0, [0, 0.03, 0], 0x9fd8ff, 0.4, 0.7, 0.018);
    add('windsat', 0, [0, -0.03, 0], 0x000000, 0, 0, 0.016, true);
    add('rock', 0, [0.12, 0.04, 0], 0xffb060, -0.5, 0.2, 0.02);
    add('rock', 0, [0.12, 0.0, 0.03], 0x000000, 0, 0, 0.016, true);
    add('giant', 0, [0, -0.02, 0], 0x000000, 0, 0, 0.018, true);
    add('soletta', 0, [0, -0.06, 0], 0x000000, 0, 0, 0.022, true);
    add('soletta', 0, [0.6, 0.01, 0], 0xffffff, 0.3, 0, 0.022);
    add('soletta', 0, [-0.6, 0.01, 0], 0xffffff, 0.3, 0.5, 0.022);
    add('mirrors', 0, [0, -0.02, 0], 0x000000, 0, 0, 0.016, true);
    add('relay', 0, [0, 0.06, 0], 0x7dff9a, 0.22, 0, 0.03);
    add('relay', 0, [0, -0.03, 0], 0x000000, 0, 0, 0.016, true);
    add('lagrange', 0, [0, 0.03, 0.08], 0xbfdcff, 0.18, 0.4, 0.035);
    add('lagrange', 0, [0.02, -0.03, 0], 0x000000, 0, 0, 0.022, true);
    for (let i = 0; i < 3; i++) add('vesta', -1, [[0, 0, 0], [2.6, 1.0, 0], [1.2, -1.5, 0]][i], 0xffb870, 0.12 + i * 0.05, i * 0.37, 0.3);
    this.dynSlot = S.length;                                         // rocket heads, shuttle engines, starship, probe
    for (let i = 0; i < ROCKETS + FLIGHTS + 2; i++) S.push({ T: null, dyn: true, c: new THREE.Color(), rate: 0, ph: 0, s: 0.05 });
    const n = S.length, g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aCol', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aBlink', new THREE.BufferAttribute(new Float32Array(S.flatMap((l) => [l.rate, l.ph, l.s])), 3).setUsage(THREE.DynamicDrawUsage));
    this.lights = new THREE.Points(g, this.lightMat = lightMaterial());
    this.lights.frustumCulled = false;
    this.root.add(this.lights);
  }
  buildLines() {
    let o = 0;
    const take = (n) => { const r = [o, n]; o += n; return r; };
    this.segs = { rockets: Array.from({ length: ROCKETS }, () => take(SEGS.rocket)), flights: Array.from({ length: FLIGHTS }, () => take(SEGS.flight)), aero: take(SEGS.aero), star: take(SEGS.star), probe: take(SEGS.probe) };
    this.nSegs = o;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(o * 6), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aCol', new THREE.BufferAttribute(new Float32Array(o * 6), 3).setUsage(THREE.DynamicDrawUsage));
    this.lines = new THREE.LineSegments(g, lineMaterial());
    this.lines.frustumCulled = false;
    this.root.add(this.lines);
  }

  // frame helpers (bound in build): a dynamic light slot, a line segment, a fading trail along a curve
  _setDyn(p, col, a, size, rate = 0) {
    const d = this.dSlot++, g = this.lights.geometry.attributes, lb = g.aBlink;
    g.position.setXYZ(d, p.x, p.y, p.z); g.aCol.setXYZ(d, col.r * a, col.g * a, col.b * a);
    if (lb.getZ(d) !== size || lb.getX(d) !== rate) { lb.setXYZ(d, rate, 0, size); lb.needsUpdate = true; }
  }
  _seg(i, p, q, ca, cb) {
    const g = this.lines.geometry.attributes;
    g.position.setXYZ(i * 2, p.x, p.y, p.z); g.position.setXYZ(i * 2 + 1, q.x, q.y, q.z);
    g.aCol.setXYZ(i * 2, ca[0], ca[1], ca[2]); g.aCol.setXYZ(i * 2 + 1, cb[0], cb[1], cb[2]);
  }
  // from curve parameter e back by span, head brightness w, colour (r, g, bl)
  _trail(range, curve, e, span, w, r, g, bl) {
    const [o, n] = range, { A, B } = this.tmp, c0 = this.c0, c1 = this.c1;
    for (let k = 0; k < n; k++) {
      const e0 = Math.max(0, e - span * k / n), e1 = Math.max(0, e - span * (k + 1) / n);
      curve.getPoint(e0, A); curve.getPoint(e1, B);
      const w0 = w * (1 - k / n) ** 2, w1 = w * (1 - (k + 1) / n) ** 2;
      c0[0] = r * w0; c0[1] = g * w0; c0[2] = bl * w0; c1[0] = r * w1; c1[1] = g * w1; c1[2] = bl * w1;
      this._seg(o + k, A, B, c0, c1);
    }
  }

  // compile the three programs now (the way events_fx.prewarm does), not when a card is played
  prewarm() {
    if (this.warmed || !this.built) return;
    this.warmed = true;
    const ms = [...Object.values(this.T).flatMap((T) => [T.mesh, ...(T.extra || [])]).filter(Boolean), this.shuttles];
    const vis = ms.map((m) => m.visible), cnt = this.shuttles.count;
    ms.forEach((m) => { m.visible = true; }); this.shuttles.count = 1;
    try { this.b.renderer.compile(this.b.scene, this.b.camera); } catch { /* best effort */ }
    ms.forEach((m, i) => { m.visible = vis[i]; }); this.shuttles.count = cnt;
  }

  // ---------------------------------------------------------------- positions
  orbitPos(T, i, t, out, F) {
    const o = T.o, a = o.ph + t * o.w - i * o.gap * Math.sign(o.w);
    out.copy(o.u).multiplyScalar(Math.cos(a) * o.r).addScaledVector(o.v, Math.sin(a) * o.r);
    if (F) F.copy(o.u).multiplyScalar(-Math.sin(a)).addScaledVector(o.v, Math.cos(a)).multiplyScalar(Math.sign(o.w) || 1);
    return out;
  }
  // matrix: local Z along fwd, Y along up (orthogonalised), uniform scale s
  basis(M, pos, fwd, up, s) {
    const { X, Y, Z } = this.tmp;
    Z.copy(fwd).normalize();
    X.crossVectors(up, Z);
    if (X.lengthSq() < 1e-8) X.set(1, 0, 0).cross(Z);
    X.normalize(); Y.crossVectors(Z, X);
    M.makeBasis(X.multiplyScalar(s), Y.multiplyScalar(s), Z.multiplyScalar(s)).setPosition(pos);
    return M;
  }
  // a launch site: one of the owner's cities on Mars, else a spot just past the board's rim
  site(owner, pick = Math.random()) {
    const cs = this.cities[owner] || [];
    const R = this.R, P = new THREE.Vector3(), up = new THREE.Vector3();
    if (cs.length) { const c = cs[Math.floor(pick * cs.length) % cs.length]; up.copy(c.up); P.copy(c.center).addScaledVector(up, 0.6); return { P, up }; }   // (above the rooftops)
    const th = pick * Math.PI * 2;
    up.copy(this.f).multiplyScalar(0.42).addScaledVector(this.hr, Math.cos(th) * 0.9).addScaledVector(this.hu, Math.sin(th) * 0.9).normalize();
    P.copy(up).multiplyScalar(R * 1.01);
    return { P, up };
  }
  // The elevator's foot: on the equator as seen (the middle of the limb), right on the limb of the
  // home view (ELEV.ring), so the tether leaves the planet sideways and hangs radially outward in
  // the equatorial plane, never on or near the board (~20 deg past its edge). Not a board space:
  // there is no tile for it. Of the two crossings, the shadowed one (the right limb: the lit left
  // side has Jupiter and Ganymede) if the whole assembly with a good
  // tether (ELEV.prefT) fits between the limb and the HUD panels / the screen's edge in the home view
  // at 1.1x (a 16:9 desktop: yes; 1440x900: no, only ~70 px there); else the one with the most room.
  // The assembly is scaled to that room (0.8 .. 1.5x; a phone 0.7 .. 1.2x) and the asteroid sits as far out as it allows
  // (ELEV.minT .. maxOut): a long tether on a wide desktop, a short one where the globe fills the
  // screen's width -- a phone in portrait has only ~15-30 px beside the limb, so there it is at its
  // smallest and the asteroid sits at (partly past) the frame's edge.
  // Recomputed when the map or the viewport / HUD insets change (elevFrame checks).
  anchorElevator(force) {
    const E = this.T.elevator, b = this.b, cv = b.canvas, ins = b.insets || { l: 0, r: 0, t: 0, b: 0 }, key = b.terrainKey || '';
    const de = b.renderer.domElement, rw = de.width, rh = de.height, fov = b.camera.fov, old = E.anchor;
    if (!force && old && old.key === key && old.rw === rw && old.rh === rh && old.fov === fov && old.il === ins.l && old.ir === ins.r && old.it === ins.t && old.ib === ins.b) return;
    const vw = cv?.clientWidth || innerWidth, vh = cv?.clientHeight || innerHeight, R = this.R, f = this.f, hr = this.hr, hu = this.hu, deg = Math.PI / 180, A = ELEV.ring * deg;
    // the equator as the player sees it: the middle of the limb (screen angle 0 = right, 180 = left), not the baked map's
    // tilted equator (on Tharsis that crosses the limb well above the middle and does not read as equatorial)
    const ps = [0, 180];
    // the home view as board3d.js frames it: the globe centred in the free area between the HUD panels
    const C = this.homeCam;
    C.fov = fov; C.aspect = vw / vh; C.near = b.camera.near; C.far = b.camera.far;
    C.position.copy(b.home); C.up.set(0, 1, 0); C.lookAt(0, 0, 0);
    C.setViewOffset(vw, vh, -(ins.l - ins.r) / 2, -(ins.t - ins.b) / 2, vw, vh);
    C.updateMatrixWorld();
    const mg = 6, x0 = ins.l + mg, x1 = vw - ins.r - mg, y0 = ins.t + mg, y1 = vh - ins.b - mg, V = new THREE.Vector3();
    const inFrame = (dir, r) => { V.copy(dir).multiplyScalar(r).project(C); const x = (V.x + 1) / 2 * vw, y = (1 - V.y) / 2 * vh; return V.z < 1 && x > x0 && x < x1 && y > y0 && y < y1; };
    // room: how far above the ground the ray stays in the free area; the assembly (tower + a good
    // tether + the asteroid) is scaled to fit it, within [sMin, sMax] (a phone's pixels are smaller)
    const [sMin, sMax] = b.mobile ? [0.17, 0.25] : [0.18, 0.3], need = ELEV.H + ELEV.prefT + ELEV.hub + ELEV.ext;   // (small and subtle)
    const cands = ps.map((p) => {
      const up = f.clone().multiplyScalar(Math.cos(A)).addScaledVector(hr, Math.cos(p * deg) * Math.sin(A)).addScaledVector(hu, Math.sin(p * deg) * Math.sin(A)).normalize();
      let room = 0;
      while (room < ELEV.maxOut * sMax + ELEV.ext * sMax && inFrame(up, R + room + 0.05)) room += 0.05;
      return { up, room, sun: up.dot(this.H.SUN) };
    }).sort((a, c) => a.sun - c.sun);                  // the shadowed limb first: the lit (left) side is the busy one (Jupiter, Ganymede)
    const pick = cands.find((c) => c.room >= need * 1.1) || cands.reduce((a, c) => (c.room > a.room + 0.05 ? c : a));
    const s = Math.max(sMin, Math.min(sMax, pick.room / need));
    const rc = R + Math.max((ELEV.H + ELEV.minT + ELEV.hub) * s, Math.min(ELEV.maxOut * s, pick.room - ELEV.ext * s));   // the asteroid's centre
    const up = pick.up, P = up.clone().multiplyScalar(R);
    const z = b.home.clone().sub(P); z.addScaledVector(up, -z.dot(up)).normalize();   // toward the home camera, along the ground
    E.anchor = {
      key, rw, rh, fov, il: ins.l, ir: ins.r, it: ins.t, ib: ins.b,
      up, z, x: up.clone().cross(z), s, P,
      foot: P.clone().addScaledVector(up, ELEV.H * s),                  // the tether's foot (tower top)
      hub: up.clone().multiplyScalar(rc - ELEV.hub * s),                // its end, under the asteroid
      rock: up.clone().multiplyScalar(rc),                               // the asteroid's centre
    };
  }

  // the elevator, every frame. Deploy stages from E.k (0..1): the anchor rises out of the ground and
  // lights up (0 .. 0.25), the tether pays out from the tower top (0.25 .. 0.75) while the asteroid
  // swings in from further out and settles on its end (0.33 .. 0.75), then the climbers start (0.8 ..).
  // E.k = 1 (a load / undo / Low's instant path) is the finished elevator. Only the base and the
  // climbers are drawn (and lit): the cable and its counterweight are far out of view.
  elevFrame(E, show, T0) {
    const b = this.b, de = b.renderer.domElement, ins = b.insets;   // (the drawing buffer's size, not clientWidth: no layout reads per frame)
    let an = E.anchor;
    if (show && an && ((b.terrainKey || '') !== an.key || de.width !== an.rw || de.height !== an.rh || b.camera.fov !== an.fov || (ins && (ins.l !== an.il || ins.r !== an.ir || ins.t !== an.it || ins.b !== an.ib)))) { this.anchorElevator(false); an = E.anchor; }
    const vis = show && !!an, lk = E.lk, nc = vis ? gfx.pick(0, 2, ELEV.climbers) : 0;   // (Low: no climbers, no sheen)
    E.mesh.visible = vis; E.rockMesh.visible = E.ribbonMesh.visible = false;   // (only the base and its cars: see above)
    E.climbMesh.visible = nc > 0;
    lk.b = lk.r = lk.t = 0; for (let i = 0; i < ELEV.climbers; i++) lk[CK[i]] = 0;
    E.kt = 0;
    if (!vis) return;
    const e = E.k, s = an.s, { P, A, M, N } = this.tmp;
    const kb = smooth(clamp01(e / 0.25)), kt = smooth(clamp01((e - 0.25) / 0.5)), kr = smooth(clamp01((e - 0.33) / 0.42)), kc = clamp01((e - 0.8) / 0.2);
    // the anchor: up out of the ground (the globe hides what is still under it)
    P.copy(an.P).addScaledVector(an.up, -(1 - kb) * (ELEV.H + 0.14) * s);
    E.mesh.setMatrixAt(0, this.basis(E.mats[0], P, an.z, an.up, s));
    E.mesh.instanceMatrix.needsUpdate = true;
    // the asteroid: swings in from further out and sideways, turning, and settles; then only a slow sway
    const off = 1 - kr;
    P.copy(an.rock).addScaledVector(an.up, 2.8 * off * s).addScaledVector(an.x, 2.4 * off * off * s);
    this.basis(E.mats[1], P, an.z, an.up, s * Math.max(1e-3, clamp01(kr * 5))).multiply(N.makeRotationY(2.4 * off + 0.07 * Math.sin(T0 * 0.21)));
    E.rockMesh.setMatrixAt(0, E.mats[1]);
    E.rockMesh.instanceMatrix.needsUpdate = true;
    // the ribbon, tower top -> the tip paying out (broad face to the camera)
    E.tip.lerpVectors(an.foot, an.hub, kt);
    this.basis(M, an.foot, an.z, an.up, 1).scale(A.set(0.022 * s, Math.max(1e-4, an.foot.distanceTo(E.tip)), 0.008 * s));   // (a thin cable)
    E.ribbonMesh.setMatrixAt(0, M);
    E.ribbonMesh.instanceMatrix.needsUpdate = true;
    // climber cars: leave the tower top slowly, accelerate up the (invisible) cable and out of the
    // viewport, and later come back down and ease into the station -- a real elevator's cable runs
    // tens of thousands of km out, so nothing else of it is shown
    const far = 40 * s;                                              // well past the frame at any zoom
    for (let i = 0; i < nc; i++) {
      const ph = (T0 / 90 + i / nc + 0.11 * i) % 1, v = ph < 0.5 ? ph * 2 : 2 - ph * 2;   // 0 at the station .. 1 out of view
      P.copy(an.foot).addScaledVector(an.up, 0.02 * s + far * v * v * v);
      E.climbMesh.setMatrixAt(i, this.basis(E.mats[2 + i], P, an.z, an.up, s * Math.max(0.01, kc)));
      lk[CK[i]] = kc;
    }
    E.climbMesh.count = nc;
    if (nc) E.climbMesh.instanceMatrix.needsUpdate = true;
    lk.b = 0.5 * smooth(clamp01((e - 0.12) / 0.14));   // (dim base lights: subtle)
    lk.r = 0; lk.t = 0;                                   // (no asteroid, no cable tip)
    E.kt = kt;
  }

  // ---------------------------------------------------------------- launches and one-shots
  launch(key) {
    const T = this.T?.[key];
    if (!T || !T.o) return;
    const L = this.rockets.find((x) => !x.T) || this.rockets[0];
    const now = this.now, dur = 4.2, R = this.R, o = T.o;
    // arrive at the orbit point nearest the launch site that is in view (not behind the globe), so the
    // climb stays short and off the board's middle
    const s = this.site(T.owner), goal = s.P.clone().addScaledVector(s.up, R * 0.4), end = new THREE.Vector3(), tan = new THREE.Vector3();
    const cam = this.b.home, ray = new THREE.Vector3();
    let best = o.near, bd = Infinity;
    for (let i = 0; i < 72; i++) {
      const a = i / 72 * Math.PI * 2;
      end.copy(o.u).multiplyScalar(Math.cos(a) * o.r).addScaledVector(o.v, Math.sin(a) * o.r);
      ray.copy(end).sub(cam); const L2 = ray.length(); ray.divideScalar(L2);
      const b = cam.dot(ray), disc = b * b - (cam.lengthSq() - R * R * 1.1);
      if (disc > 0 && -b - Math.sqrt(disc) < L2) continue;             // behind (or grazing) the globe
      const d = end.distanceTo(goal);
      if (d < bd) { bd = d; best = a; }
    }
    o.ph = best - (now + dur) * o.w;
    T.k = 0; T.deploy = null;
    this.orbitPos(T, 0, now + dur, end, tan);
    const c = L.curve;
    c.v0.copy(s.P); c.v1.copy(s.P).addScaledVector(s.up, R * 0.35);
    c.v2.copy(end).addScaledVector(end, 0.12).addScaledVector(tan, -R * 0.3); c.v3.copy(end);
    L.T = T; L.t0 = this.now; L.dur = dur;
  }
  fire(key) {
    if (!this.ensure()) return;
    const now = this.now, R = this.R, f = this.f;
    if (key === 'shuttles' || key === 'immigration') {
      const F = this.flights.find((x) => !x.kind);
      if (!F) return;
      const T = this.T[key], s = this.site(T.owner);
      // arc out toward the nearer limb
      const out = s.up.clone().addScaledVector(f, -s.up.dot(f));
      if (out.lengthSq() < 1e-4) out.copy(this.hr);
      out.addScaledVector(s.up, -out.dot(s.up)).normalize();
      const c = F.curve, a = s.P, h = key === 'shuttles' ? 1 : 1.15;
      c.v0.copy(a); c.v1.copy(a).addScaledVector(s.up, 1.2 * h); c.v2.copy(a).addScaledVector(s.up, 2.2 * h).addScaledVector(out, 1.6 * h); c.v3.copy(a).addScaledVector(s.up, 3.2 * h).addScaledVector(out, 5.0 * h);
      F.kind = key; F.t0 = now; F.dur = key === 'shuttles' ? 7 : 8.5;
      return;
    }
    if (key === 'aerobrake') {
      const A = this.aero, psi = (1.1 + Math.random() * 0.8) * Math.PI,   // below the globe, in open sky
         tilt = (0.2 + Math.random() * 0.12) * (Math.random() < 0.5 ? 1 : -1);
      A.o.u.copy(this.hr).multiplyScalar(Math.cos(psi)).addScaledVector(this.hu, Math.sin(psi));
      A.o.v.copy(f).cross(A.o.u).normalize().multiplyScalar(Math.cos(tilt)).addScaledVector(f, Math.sin(tilt));
      A.dir = Math.sign(tilt);
      A.a0 = -A.dir * 0.35;                      // emerges from behind the limb at screen angle psi, skims into the near half
      A.t0 = now;
      return;
    }
    if (key === 'starship') {
      // from a parking orbit below the globe (open sky), out and away toward a lower corner, dwindling
      const S = this.star, c = S.curve, side = Math.random() < 0.5 ? -1 : 1;
      const lat = new THREE.Vector3().copy(this.hr).multiplyScalar(side * 0.55).addScaledVector(this.hu, -0.85).normalize();
      c.v0.copy(lat).multiplyScalar(R * 1.2).addScaledVector(f, R * 0.3);
      c.v1.copy(c.v0).addScaledVector(lat, R * 0.3).addScaledVector(this.hr, side * R * 0.2);
      c.v2.copy(c.v0).addScaledVector(lat, R * 1.6).addScaledVector(this.hr, side * R * 0.8).addScaledVector(f, -R * 2);
      c.v3.copy(c.v0).addScaledVector(lat, R * 3.5).addScaledVector(this.hr, side * R * 1.5).addScaledVector(f, -R * 8);
      S.t0 = now;
      return;
    }
    if (key === 'probe') {
      const P = this.probe, c = P.curve, s = this.site(this.T.probe.owner);
      const out = s.up.clone().addScaledVector(f, -s.up.dot(f)).normalize();
      c.v0.copy(s.P); c.v1.copy(s.P).addScaledVector(s.up, R * 0.3);
      c.v2.copy(s.P).addScaledVector(s.up, R * 0.6).addScaledVector(out, R * 1.2).addScaledVector(this.hu, R * 0.6);
      c.v3.copy(c.v2).addScaledVector(out, R * 3).addScaledVector(this.hu, R * 1.5).addScaledVector(f, -R * 6);   // (not too deep: far away projects onto the globe)
      P.t0 = now;
      return;
    }
    if (this.T?.[key]?.o) this.launch(key);
  }

  // ---------------------------------------------------------------- frame
  // (scenery must never take the frame down: any error switches the module off)
  tick(t, dt) {
    if (this.off) return;
    // own clock from the (board-clamped) frame dt: a stalled or very slow frame never skips a launch
    this.clock = (this.clock || 0) + Math.min(dt || 0, 0.1);
    try { this.frame(this.clock); } catch (e) { this.off = true; if (this.root) this.root.visible = false; console.warn('space_cards off:', e); }
  }
  frame(t) {
    if (!this.ensure()) return;
    if (!this.warmed) this.prewarm();
    this.now = t;
    const T0 = t, { P, F, U, A, B, M, N, c } = this.tmp;
    const cam = this.b.camera.position, pr = this.b.renderer.getPixelRatio();
    const lu = this.lightMat.uniforms;
    lu.uTime.value = t; lu.uH.value = this.b.renderer.domElement.height; lu.uMin.value = 3 * pr;
    const colors = this.b.playerColors || [0xffffff, 0xffffff];

    // periodic traffic
    for (const k in PERIODIC) {
      const Tp = this.T[k];
      if (!Tp.on || !this.allowed(k)) continue;
      if (t > Tp.next) { Tp.next = t + this.interval(k); if (!document.hidden) this.fire(k); }
    }

    // persistent objects
    for (const key in this.T) {
      const Tk = this.T[key];
      if (Tk.deploy) {
        const e = (t - Tk.deploy.t0) / Tk.deploy.dur;
        Tk.k = clamp01(e);
        if (e >= 1) Tk.deploy = null;
      }
      if (key === 'elevator' && Tk.on && !Tk.anchor) this.anchorElevator(true);
      const show = Tk.on && Tk.k > 0.001 && this.allowed(key) && (Tk.kind === 'orbit' || Tk.kind === 'fixed' || Tk.kind === 'elevator');
      Tk.shown = show;
      if (key === 'elevator') { this.elevFrame(Tk, show, T0); continue; }
      if (!Tk.mesh) continue;
      Tk.mesh.visible = show;
      if (!show) continue;
      const s = (Tk.kind === 'fixed' ? 1 : smooth(Tk.k)) * this.sizeK;
      for (let i = 0; i < Tk.n; i++) {
        const Mi = Tk.mats[i];
        if (Tk.kind === 'orbit') {
          this.orbitPos(Tk, i, T0, P, F);
          if (key === 'fleet' && i > 0) P.addScaledVector(Tk.o.n, (i === 1 ? 1 : -1) * 0.07).addScaledVector(F, 0.04);
          if (MIRROR.has(key)) {
            // the sail faces between the sun and the viewer, rocking slowly: it catches the sun now and then
            U.copy(this.H.SUN).add(A.copy(cam).sub(P).normalize()).normalize();
            U.addScaledVector(F, key === 'soletta' ? 0.4 * Math.sin(T0 * 0.09 + 1.3) : 0.3 + 0.55 * Math.sin(T0 * 0.13 + Tk.o.ph + i * 0.9)).normalize();   // (Soletta: a soft glint every ~35 s)
            this.basis(Mi, P, F.addScaledVector(U, -F.dot(U)), U, s);
          } else {
            this.basis(Mi, P, F, U.copy(Tk.o.n), s);
            Mi.multiply(Tk.rot).multiply(N.makeRotationY(T0 * Tk.spin));
          }
        } else if (Tk.kind === 'fixed') {
          Mi.makeRotationY(T0 * 0.05).premultiply(Tk.rot).scale(A.setScalar(this.sizeK)).setPosition(Tk.pos);
        }
        Tk.mesh.setMatrixAt(i, Mi);
      }
      Tk.mesh.instanceMatrix.needsUpdate = true;
    }

    // lights
    const S = this.slots, lp = this.lights.geometry.attributes.position, lc = this.lights.geometry.attributes.aCol;
    for (let j = 0; j < this.dynSlot; j++) {
      const L = S[j], Tk = L.T;
      let a = Tk.shown ? (Tk.kind === 'fixed' ? smooth(Tk.k) : Tk.k) : 0;
      if (L.g) a = Tk.shown && Tk.anchor ? Tk.lk[L.g] : 0;          // the elevator's lights come on in stages (elevFrame)
      if (a <= 0) { lp.setXYZ(j, 0, 0, 0); lc.setXYZ(j, 0, 0, 0); continue; }
      if (L.inst >= 0) P.copy(L.p).applyMatrix4(Tk.mats[L.inst]);
      else if (Tk.key === 'vesta') P.copy(Tk.pos).addScaledVector(this.hr, L.p.x).addScaledVector(this.hu, L.p.y).addScaledVector(this.f, L.p.z);
      else P.copy(Tk.tip);                                           // the elevator tether's tip, paying out
      P.addScaledVector(A.copy(cam).sub(P).normalize(), 0.03);      // in front of its own hull
      lp.setXYZ(j, P.x, P.y, P.z);
      if (L.owner) { c.set(colors[Tk.owner] ?? 0xffffff); a *= 0.55; } else c.copy(L.c);
      if (Tk.key === 'yard' && L.rate < 0) a *= (Math.sin(T0 * 0.7) > 0.3 ? 1 : 0);   // welding comes in bursts
      lc.setXYZ(j, c.r * a, c.g * a, c.b * a);
    }
    this.dSlot = this.dynSlot;
    const lcA = this.lines.geometry.attributes.aCol, lpA = this.lines.geometry.attributes.position;
    lcA.array.fill(0);
    const c0 = this.c0, c1 = this.c1, setDyn = this.setDyn, seg = this.seg, trail = this.trail;   // (bound once in build: no closures per frame)

    // rockets: a small launch carrying an object up to its orbit
    const { warm, orange } = this.col;
    for (let i = 0; i < ROCKETS; i++) {
      const L = this.rockets[i];
      if (!L.T) { setDyn(P.set(0, 0, 0), warm, 0, 0.05); continue; }
      const k = (t - L.t0) / L.dur;
      if (k >= 1) {                                                  // in orbit: the object unfolds
        L.T.deploy = { t0: t, dur: L.T.key === 'soletta' ? 4 : 1.6 }; L.T.k = 0.001; L.T = null;   // (the big mirror unfolds slowly)
        setDyn(P.set(0, 0, 0), warm, 0, 0.05); continue;
      }
      const e = Math.pow(clamp01(k), 1.5);
      L.curve.getPoint(e, P);
      const fade = Math.min(1, k / 0.05) * (k > 0.85 ? (1 - k) / 0.15 * 0.6 + 0.4 : 1);
      setDyn(P, this.col.hot, 1.4 * fade, 0.15);   // (white-hot: it must read over the lit board too)
      trail(this.segs.rockets[i], L.curve, e, 0.22, 0.85 * fade, 1, 0.85, 0.6);
    }

    // shuttle flights
    let ns = 0;
    for (let i = 0; i < FLIGHTS; i++) {
      const Fl = this.flights[i];
      if (!Fl.kind) { setDyn(P.set(0, 0, 0), warm, 0, 0.03); continue; }
      const k = (t - Fl.t0) / Fl.dur;
      if (k >= 1 || k < 0) { Fl.kind = null; setDyn(P.set(0, 0, 0), warm, 0, 0.03); continue; }
      const up = Fl.kind === 'shuttles';
      // lift-off slow then faster; a landing: fast in, slow at the end
      const e = up ? Math.pow(k, 1.35) : 1 - Math.pow(1 - k, 1.6);
      const pe = up ? e : 1 - e;                                   // position on the (upward) curve
      Fl.curve.getPoint(pe, P); Fl.curve.getPoint(Math.min(1, pe + 0.002), F); Fl.curve.getPoint(Math.max(0, pe - 0.002), A); F.sub(A).normalize();   // (getTangent allocates)
      const fade = up ? Math.min(1, k / 0.04) * clamp01((1 - k) / 0.3) : clamp01(k / 0.25) * Math.min(1, (1 - k) / 0.04);
      this.basis(M, P, F, A.copy(P).normalize(), 1.5 * this.sizeK * Math.max(0.05, Math.min(1, fade * 1.5)));   // (fades by shrinking)
      this.shuttles.setMatrixAt(ns++, M);
      B.copy(P).addScaledVector(F, -0.08);
      setDyn(B, up ? warm : orange, (up ? 1 : 0.7 + 0.25 * Math.sin(t * 23)) * fade, up ? 0.1 : 0.09);
      if (up) trail(this.segs.flights[i], Fl.curve, pe, 0.22, 0.55 * fade, 1, 0.85, 0.65);
      else { const [o, n] = this.segs.flights[i]; for (let q = 0; q < 3 && q < n; q++) { A.copy(B); B.copy(A).addScaledVector(F, -0.05); const w0 = 0.4 * fade * (1 - q / 3), w1 = 0.4 * fade * (1 - (q + 1) / 3); c0[0] = w0; c0[1] = 0.55 * w0; c0[2] = 0.25 * w0; c1[0] = w1; c1[1] = 0.55 * w1; c1[2] = 0.25 * w1; seg(o + q, A, B, c0, c1); } }
    }
    this.shuttles.count = ns;
    if (ns) this.shuttles.instanceMatrix.needsUpdate = true;

    // aerobraking: a plasma streak skimming the upper atmosphere at the limb
    const Ae = this.aero, ka = (t - Ae.t0) / Ae.dur;
    if (ka >= 0 && ka < 1) {
      const [o, n] = this.segs.aero, env = Math.min(1, ka / 0.2) * Math.pow(1 - ka, 1.2), head = Ae.a0 + Ae.dir * 1.3 * ka;
      for (let k = 0; k < n; k++) {
        const a0 = head - Ae.dir * 0.4 * k / n, a1 = head - Ae.dir * 0.4 * (k + 1) / n;
        A.copy(Ae.o.u).multiplyScalar(Math.cos(a0) * Ae.o.r).addScaledVector(Ae.o.v, Math.sin(a0) * Ae.o.r);
        B.copy(Ae.o.u).multiplyScalar(Math.cos(a1) * Ae.o.r).addScaledVector(Ae.o.v, Math.sin(a1) * Ae.o.r);
        const w0 = 0.9 * env * (1 - k / n) ** 1.5, w1 = 0.9 * env * (1 - (k + 1) / n) ** 1.5;
        c0[0] = w0; c0[1] = 0.55 * w0; c0[2] = 0.3 * w0; c1[0] = w1; c1[1] = 0.55 * w1; c1[2] = 0.3 * w1;
        seg(o + k, A, B, c0, c1);
      }
    }

    // the starship leaving, and the probe
    for (const { X, seg2, col, size, span, w } of this.departures) {
      const kx = (t - X.t0) / X.dur;
      if (kx < 0 || kx >= 1) { setDyn(P.set(0, 0, 0), col, 0, size); continue; }
      const e = X === this.star ? Math.pow(kx, 2.2) : Math.pow(kx, 1.4);
      X.curve.getPoint(e, P);
      const fade = Math.min(1, kx / 0.06) * Math.pow(1 - kx, 0.8);
      setDyn(P, col, fade, size);
      trail(seg2, X.curve, e, span, w * fade, col.r, col.g, col.b);
    }
    lp.needsUpdate = true; lc.needsUpdate = true; lpA.needsUpdate = true; lcA.needsUpdate = true;
  }
}
