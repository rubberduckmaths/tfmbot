// music_moods.js -- moods: short colour layers the game plays over the base track (card / tile events), keyed
// to the current track's tonic and scale so they stay in harmony with it. mood(name) crossfades one in over the
// ducked track, holds it ~12 s and hands back over ~5 s: a colour change, not a new song.
//   nature (plants, microbes, animals, greenery)  water (oceans)  city (cities)  space (space / Jovian cards)
//   science (science cards)  impact (the two big asteroid events)
// They are played calmly by the orchestra: slower tempos (x0.88, busy ones x0.7), more reverb, a softer echo,
// per-step figures thinned to sparse chimes (music_engine.js voices read _inStep), no percussion.
import { rnd, pick, chance, clamp, mtof, SC, deg, fold, goodDegs, voiceLead } from './music_engine.js';

const euclid = (k, n) => Array.from({ length: n }, (_, s) => Math.floor((s * k) / n) !== Math.floor(((s - 1) * k) / n));
function bird() {
  return { f: 2000 + rnd() * 2600, n: 2 + ((rnd() * 4) | 0), syl: 0.04 + rnd() * 0.07, gap: 0.03 + rnd() * 0.08,
    dir: pick([1, -1, 0]), trill: chance(0.4) ? 25 + rnd() * 30 : 0, gain: 0.012 + rnd() * 0.01, pan: rnd() * 1.6 - 0.8 };
}
function kalPattern() {
  const p = []; let d = pick([0, 2, 4]);
  for (let k = 0; k < 8; k++) {
    if (k > 0 && chance(0.35)) { p.push(null); continue; }
    p.push(d); d = clamp(d + pick([-2, -1, 1, 2, 3]), 0, 7);
  }
  return p;
}
function arpPattern() {
  const shape = pick(['up', 'updown', 'jump', 'mod']), hits = euclid(pick([7, 9, 10, 11, 12, 16]), 16), p = [];
  for (let s = 0; s < 16; s++) {
    if (!hits[s]) { p.push(null); continue; }
    const n = shape === 'up' ? s % 6 : shape === 'updown' ? [0, 1, 2, 3, 4, 3, 2, 1][s % 8]
      : shape === 'jump' ? [0, 4, 1, 5, 2, 6, 3, 5][s % 8] : (s * 3) % 7;
    p.push({ n, acc: s % 4 === 0 || chance(0.15) });
  }
  return p;
}
function mutateArp(p) {
  const c = p.slice(), s = (rnd() * 16) | 0;
  c[s] = c[s] ? null : { n: (rnd() * 7) | 0, acc: chance(0.3) };
  return c;
}
const _ = null;
const CITY_BASS = [
  [0, _, 0, _, 12, _, 0, _, 0, _, 0, _, 12, _, 7, _],
  [0, _, _, 0, _, _, 12, _, 0, _, _, 0, _, 7, _, _],
  [0, _, 12, _, 0, _, 12, _, 0, _, 12, _, 7, _, 12, _],
];
function moodKey(A, L, lo) {
  const k = A._key();
  L.sc = k.scale; L.root = fold(k.root, lo); L.minor = k.minor; L.maj = fold(k.majRoot, lo);
  return k;
}
function altDegs(sc, prefs) { const g = goodDegs(sc), r = prefs.filter((d) => g.includes(d)); return r.length ? r : [0]; }
function impactHit(A, L, t) {
  L.lastHit = t; const r = L.root;
  // ambience: a soft distant rumble and a dark low pad, no stinger
  A.vThump(L, t, 90, 26, 3.5, { gain: 0.16, drop: 1.8, prio: 2, fx: 0.7 });
  A.vNoise(L, t, 4, { type: 'lowpass', f0: 700, f1: 60, q: 0.8, gain: 0.09, prio: 2, fx: 0.9 });
  A.vPad(L, t, [r + 12, r + 15, r + 19], 6, { cut: 380, open: 1.6, att: 1.2, rel: 3, gain: 0.06, prio: 2, fx: 0.5, type: 'triangle' });
}
const NAT_RH = [[8, 4, 4], [4, 4, 8], [6, 2, 8], [4, 2, 2, 8], [12, 4]];
const BASE = {
  // relative-major pentatonic: open 6/9 pads, breathy flute, wooden kalimba ostinato, birds, leaves
  nature: {
    bpm: 72, steps: 16, rv: 0.6, dl: 0.3, fx: 0.7, hold: 12, fadeIn: 2.5,
    init(A, L) {
      moodKey(A, L, 55);
      L.birds = [bird(), bird(), bird()];
      L.chords = [[0, 7, 14, 16, 21], [9, 16, 19, 24, 26], [2, 9, 14, 19, 21], [0, 7, 14, 19, 26]];
    },
    step(A, L, t, i, s) {
      const b = L.bar, base = L.maj - 12;
      if (s === 0) {
        if (b % 2 === 0) A.vPad(L, t, (b === 0 ? L.chords[0] : pick(L.chords)).map((x) => base + x), L.sd * 32 + 1, { type: 'triangle', cut: 1800, att: 2.2, rel: 3, gain: 0.1, fx: 0.2 });
        if (b % 4 === 0) L.kal = kalPattern();
        if (b >= 1) A._phrase(L, t, i, { sc: SC.penta, root: L.maj, start: pick([0, 2, 4]), lo: 72, rhythms: NAT_RH,
          voice: (tt, m, d) => A.vFlute(L, tt, mtof(m), d, { gain: 0.045, fx: 0.5 }) }, 0.65);
        if (chance(0.4)) A.vNoise(L, t + rnd() * 1.5, 1.5 + rnd() * 2, { f0: 2500 + rnd() * 3000, q: 0.7, gain: 0.018, shape: 'rustle', pan: rnd() * 1.4 - 0.7 });
      }
      if (s % 2 === 0 && L.kal && (b > 0 || s >= 8)) {
        const k = L.kal[s >> 1];
        if (k != null) A.vFm(L, t, mtof(deg(SC.penta, L.maj + 12, k)), 0.9, { ratio: 4, idx: 0.9, dec: 0.08, gain: 0.03, fx: 0.4, pan: (k - 3) * 0.12, prio: 1 });
      }
      if (chance(0.07)) A.vChirp(L, t + rnd() * L.sd, pick(L.birds));
    },
  },
  // home scale, 108 bpm: euclidean square-wave arp, saw bass, hats -> kick/clap build over 2 bars
  city: {
    bpm: 108, steps: 16, rv: 0.3, dl: 0.18, fx: 0.5, hold: 12, fadeIn: 2,
    init(A, L) {
      moodKey(A, L, 45);
      const a = altDegs(L.sc, [5, 3, 6, 4, 2, 1]).slice(0, 4).sort(() => rnd() - 0.5);
      L.prog = [0, a[0], a[1] ?? 0, a[2] ?? a[0]];
      L.arp = arpPattern(); L.bp = pick(CITY_BASS); L.ch = null;
    },
    step(A, L, t, i, s) {
      const b = L.bar;
      if (s === 0) {
        const d = L.prog[b % 4];
        L.ch = voiceLead([0, 2, 4, 6].map((x) => deg(L.sc, L.root + 12, d + x)), L.ch, 57, 76);
        L.br = fold(deg(L.sc, L.root, d), 33);
        if (b % 4 === 3) L.arp = mutateArp(L.arp);
        A.vPad(L, t, L.ch, L.sd * 14, { cut: 900, att: 0.05, rel: 0.4, gain: 0.05, dual: false, open: 2 });
      }
      const a = L.arp[s], n = L.ch.length;
      if (a && s % 2 === 0) A.vPluck(L, t, mtof(L.ch[a.n % n] + 12 * ((a.n / n) | 0)), L.sd * 2, { type: 'triangle', cut: a.acc ? 1800 : 1200, gain: a.acc ? 0.016 : 0.011, fx: 0.6, pan: (a.n - 2) * 0.15 });
      const bv = L.bp[s];
      if (bv != null && s % 4 === 0) A.vBass(L, t, mtof(L.br + bv), L.sd * 3, { cut: 300, gain: 0.04 });
    },
  },
  // home scale, 50 bpm: wide quartal pads, sub drone, stereo noise sweeps, sparse high bells + twinkles
  space: {
    bpm: 50, steps: 16, rv: 1, dl: 0.5, fx: 1, hold: 12, fadeIn: 3,
    init(A, L) { moodKey(A, L, 48); L.degs = [0, pick(altDegs(L.sc, [5, 3, 6, 2]))]; },
    step(A, L, t, i, s) {
      const b = L.bar;
      if (s === 0 && b % 2 === 0) {
        const d = L.degs[(b / 2) % 2], shape = pick([[0, 3, 6, 9, 12], [0, 4, 8, 11, 14], [0, 4, 7, 9, 13]]);
        L.ch = shape.map((x) => deg(L.sc, L.root, d + x));
        A.vPad(L, t, L.ch, L.sd * 32 + 1.5, { type: 'triangle', cut: 2600, att: 3.5, rel: 4, gain: 0.1, det: 10, open: 1.7, fx: 0.5 });
        A.vSub(L, t, mtof(fold(deg(L.sc, L.root, d), 28)), L.sd * 32, { att: 3, rel: 4, gain: 0.08 });
      }
      if (s === 8 && b % 3 === 1) {
        const side = chance(0.5) ? -0.8 : 0.8;
        A.vNoise(L, t, 7 + rnd() * 3, { f0: 220 + rnd() * 200, f1: 2400 + rnd() * 2000, fAt: 0.6, fBack: true, q: 5, gain: 0.03, shape: 'swell', peakAt: 0.6, pan: side, pan1: -side, fx: 1 });
      }
      if (!L.ch) return;
      if (chance(0.035)) A.vFm(L, t, mtof(fold(pick(L.ch), 81) + (chance(0.3) ? 12 : 0)), 5 + rnd() * 3, { ratio: pick([3.5, 5.01, 2.76]), idx: 0.8, gain: 0.022, pan: rnd() * 1.8 - 0.9, att: 0.01 });
      if (chance(0.02)) {
        const m = fold(pick(L.ch), 84);
        A.vFm(L, t, mtof(m), 1.2, { ratio: 1, idx: 0.2, gain: 0.015, pan: -0.5 });
        A.vFm(L, t + L.sd, mtof(m + 12), 1.2, { ratio: 1, idx: 0.2, gain: 0.012, pan: 0.5 });
      }
    },
  },
  // tonic minor: boom + m2/tritone cluster, 3+3+2 timpani, brass stabs i -> bVI -> bII,
  // V-sus swell with snare crescendo, then a major (picardy) brass resolution with bells
  impact: {
    bpm: 100, steps: 16, rv: 0.55, dl: 0.1, fx: 0.8, hold: 11, fadeIn: 0.25,
    init(A, L, t) { moodKey(A, L, 40); L.b0 = 0; impactHit(A, L, t); },
    retrigger(A, L, t) { if (t - (L.lastHit || 0) > 1.5) impactHit(A, L, t); L.b0 = L.bar + 1; },
    step() {},   // the hit in init / retrigger is the whole event
  },
  // home scale, 84 bpm: rolling 2-octave arpeggio through an LFO-wobbled resonant lowpass, droplets, stream
  water: {
    bpm: 84, steps: 16, rv: 0.6, dl: 0.35, fx: 0.7, hold: 12, fadeIn: 2.5,
    init(A, L, t) {
      moodKey(A, L, 48);
      L.degs = [0, pick(altDegs(L.sc, [5, 3, 2, 4]))]; L.ph = (rnd() * 12) | 0;
      const lp = A._f('lowpass', 1600, 5), lfo = A.ctx.createOscillator(), lg = A._g(1000);
      lfo.frequency.value = 0.18 + rnd() * 0.2; lfo.connect(lg); lg.connect(lp.frequency); lfo.start(t);
      lp.connect(L.xf); L.in = lp; L.persist.push(lfo); L.nodes.push(lp, lg);
    },
    step(A, L, t, i, s) {
      const b = L.bar;
      if (s === 0 && b % 2 === 0) {
        const d = L.degs[(b / 2) % 2];
        L.ch = [0, 2, 4, 7, 9, 11, 14].map((x) => deg(L.sc, L.root, d + x));
        A.vPad(L, t, [0, 2, 4, 8].map((x) => deg(L.sc, L.root, d + x)), L.sd * 32 + 1, { type: 'triangle', cut: 1400, att: 1.5, rel: 2.5, gain: 0.07 });
        A.vSub(L, t, mtof(fold(deg(L.sc, L.root, d), 36)), L.sd * 32, { att: 1.5, rel: 2.5, gain: 0.055 });
      }
      if (L.ch) {
        const n = L.ch.length, per = 2 * n - 2, k = (i + L.ph) % per, idx = k < n ? k : per - k;
        if (s % 2 === 0) A.vPluck(L, t, mtof(L.ch[idx] + 12), 1.6, { gain: 0.02, fx: 0.7, pan: (idx / (n - 1) - 0.5) * 1.2 });
      }
      if (chance(0.06)) A.vDrop(L, t + rnd() * L.sd, mtof(fold(deg(L.sc, L.root, (rnd() * 7) | 0), 84)), { gain: 0.025, pan: rnd() * 1.6 - 0.8 });
      if (s === 0 && b % 2 === 1) A.vNoise(L, t, 3.5, { f0: 700 + rnd() * 400, q: 1.2, gain: 0.012, shape: 'rustle', pan: rnd() - 0.5 });
    },
  },
  // home scale, 120 bpm: two glassy FM arps of different lengths phasing (6 vs 5/7/4), tick-tock clock, sine pulse
  science: {
    bpm: 120, steps: 16, rv: 0.4, dl: 0.3, fx: 0.6, hold: 12, fadeIn: 2,
    init(A, L) {
      moodKey(A, L, 57);
      const g = altDegs(L.sc, [3, 5, 4, 1, 2, 6]);
      L.prog = [0, pick(g), 0, pick(g)]; L.pa = [0, 1, 2, 3, 2, 1];
      L.pb = pick([[0, 2, 4, 1, 3], [4, 2, 0, 3, 1, 2, 0], [0, 3, 1, 4]]);
    },
    step(A, L, t, i, s) {
      const b = L.bar;
      if (s === 0 && b % 2 === 0) {
        const d = L.prog[(b / 2) % 4];
        L.ch = [0, 2, 4, 6, 8].map((x) => deg(L.sc, L.root, d + x)); L.bass = fold(deg(L.sc, L.root, d), 38);
        A.vPad(L, t, L.ch.slice(0, 4).map((m) => m - 12), L.sd * 32, { type: 'sine', cut: 3000, att: 1, rel: 1.5, gain: 0.07, dual: false });
      }
      if (!L.ch) return;
      if (s % 2 === 0) A.vFm(L, t, mtof(L.ch[L.pa[(i >> 1) % 6]] + 12), 0.8, { ratio: 7, idx: 0.3, dec: 0.15, gain: 0.011, fx: 0.7, pan: -0.35, prio: 1 });
      if (b >= 1 && s % 4 === 0) A.vFm(L, t, mtof(L.ch[L.pb[(i / 4) % L.pb.length]] + 24), 0.9, { ratio: 2, idx: 0.5, dec: 0.12, gain: 0.009, fx: 0.8, pan: 0.35 });
      if (s % 8 === 0) A.vNoise(L, t, 0.025, { f0: s % 16 ? 2200 : 3400, q: 9, gain: 0.02, prio: 1 });
      if (s === 0) A.vPluck(L, t, mtof(L.bass), 0.6, { type: 'sine', gain: 0.04 });
    },
  },
};

// water: a slow, broad wobbling low-pass (not a resonant one)
BASE.water.init = function (A, L, t) {
  moodKey(A, L, 48);
  L.degs = [0, pick(altDegs(L.sc, [5, 3, 2, 4]))]; L.ph = (rnd() * 12) | 0;
  const lp = A._f('lowpass', 1100, 1.1), lfo = A.ctx.createOscillator(), lg = A._g(420);
  lfo.frequency.value = 0.07 + rnd() * 0.08; lfo.connect(lg); lg.connect(lp.frequency); lfo.start(t);
  lp.connect(L.xf); L.in = lp; L.persist.push(lfo); L.nodes.push(lp, lg);
};
export const MOODS = {};
for (const [n, d] of Object.entries(BASE)) {
  MOODS[n] = { ...d, bpm: Math.round(d.bpm * (d.bpm > 90 ? 0.7 : 0.88)), rv: Math.min(1, d.rv + 0.15), dl: d.dl * 0.6,
    step(A, L, t, i, s) { A._inStep = true; try { d.step(A, L, t, i, s); } finally { A._inStep = false; } } };
}

// ---- card / tile -> mood ------------------------------------------------------------------
const TAG_IDX = { building: 0, space: 1, power: 2, science: 3, jovian: 4, earth: 5, plant: 6, microbe: 7, animal: 8, city: 9, event: 10, wild: 11 };
export function moodForCard(card) {
  if (!card) return null;
  const name = card.name || '', desc = card.description || '';
  const tags = (card.tags || []).map((x) => (typeof x === 'string' ? TAG_IDX[x.toLowerCase()] : x));
  const has = (x) => tags.includes(x);
  // the full impact score interrupts the music, so only the two biggest strikes get it
  if (/^(deimos down|giant ice asteroid)$/i.test(name.trim())) return 'impact';
  if (/ocean tile/i.test(desc)) return 'water';
  if (has(6) || has(7) || has(8) || /greenery/i.test(desc) || /greenery/i.test(name)) return 'nature';
  if (has(9) || /city tile/i.test(desc)) return 'city';
  if (has(1) || has(4)) return 'space';
  if (has(3)) return 'science';
  return null;
}
export function moodForTile(tileType) {
  return tileType === 0 ? 'water' : tileType === 1 ? 'nature' : tileType === 2 ? 'city' : null;
}
