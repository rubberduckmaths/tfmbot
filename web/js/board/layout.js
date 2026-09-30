// layout.js -- the globe's dimensions and the tables the board draws from: tile types, bonus icons, the maps'
// keys and named spaces, the light.
import * as THREE from 'three';

export const R = 10;
export const D_HOME = R * 3.3;                 // home camera distance
export const RHO_SIL = R * D_HOME / Math.sqrt(D_HOME * D_HOME - R * R); // silhouette radius on the z=0 plane
export const THETA_MAX = 50 * Math.PI / 180;   // board edge: angle from the board centre (azimuthal equidistant)
export const HEX_R = 1 / Math.sqrt(3);         // pointy-top hex circumradius, column pitch = 1
export const TILE = { OCEAN: 0, GREENERY: 1, CITY: 2, CAPITAL: 3, COMMERCIAL: 4, LAVA: 7, MOHOLE: 10, PRESERVE: 11, NUCLEAR: 12, RESTRICTED: 13, INDUSTRIAL: 14, ECO: 15, MINING_RIGHTS: 16, MINING_AREA: 17 };
export const SPECIAL_ICON = { 4: 'commerical_district', 7: 'lava_flows', 10: 'mohole_area', 11: 'natural_preserve', 12: 'nuclear_zone', 13: 'restricted_area', 14: 'industrial_center', 15: 'ecological_zone', 16: 'mining_area', 17: 'mining_area' };
// (9 = Turmoil delegate: not shown, Turmoil is not in the ruleset)
export const BONUS_ICON = { 0: 'steel', 1: 'titanium', 2: 'plant', 3: 'card', 4: 'heat', 5: 'power', 11: '../tiles/ocean', 12: '../temperature', 14: '../temperature' };
// paid space bonuses: M€ the player pays to place there (shown as a small M€ badge beside the icon)
export const BONUS_COST = { 11: 6, 12: 3, 14: 4 };
export function bonusIconUrl(ic) { return `assets/res/${ic}.png`; }
// Engine map ids -> asset keys, and the named spaces we are sure of per map
// (keyed by engine space index; the engine's own space names are merged
// across maps, so they are not used for maps 1/2/7).
export const MAP_KEYS = { 0: 'tharsis', 1: 'hellas', 2: 'elysium', 7: 'vastitas-borealis-novus' };
// the baked map textures' version: assets/ is cached for a week by browsers and the CDN, so BUMP THIS whenever
// the textures in web/assets/maps/ change, or returning players keep the old globe
export const MAP_TEX_V = '2026-09-28c';
export const MAP_LABELS = {
  1: { 60: 'South Pole' },
  2: { 7: 'Hecates Tholus', 13: 'Elysium Mons', 19: 'Olympus Mons', 36: 'Arsia Mons' },
  7: { 4: 'Hecates Tholus', 12: 'Elysium Mons', 20: 'Alba Mons', 27: 'Viking 2', 32: 'North Pole', 45: 'Uranius Tholus', 58: 'Viking 1' },
};
export const SUN = new THREE.Vector3(-0.62, 0.52, 0.58).normalize();
// Mars exposure: ONE knob for how bright the lit world is. It scales the scene
// lights (tiles, props) and the planet's own lit shaders (terrain, water,
// clouds, haze) alike, so the colour balance never shifts; the board's unlit
// icon caps, labels and the starfield keep theirs; the moons, Jupiter and Phobos
// follow it too (moons.js dims their lit shaders by the same factor).
export const EXPOSURE = 0.70;
export const EXP = EXPOSURE.toFixed(3);
export const TILT = 0;                          // home view tilt (rad): 0 = straight down on the board's middle hex
