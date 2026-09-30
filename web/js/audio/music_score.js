// music_score.js -- the music: thirteen tracks, each with its own written theme (an 8-bar A phrase -- antecedent +
// consequent -- and an 8-bar B phrase built on sequences), played through an arc by the orchestra:
//   opening pad -> theme on a solo horn / flute / violas -> theme in the cellos (octaves) -> bridge in the violins ->
//   theme with full strings + horn countermelody + soft spiccato ostinato -> build -> climax (violins in octaves with
//   horns, a soft brass chorale, timpani swells, a whole-step key lift) -> Picardy / Lydian lift -> coda (solo, fading)
// then once more, re-orchestrated (the instruments rotate), and after two arcs (~8 min) it hands over to another track.
// Terraforming shapes every section as it starts: barren = low registers, no brass chorale, no key lift, mysterious;
// green = the full bloom (chorale, key lift, flute descant, a major ending). Barren / green also pick the tracks.
// E is the MusicEngine (music_engine.js); lite engines (phones, low-core machines) drop the doublings and big brass.
// The six later tracks (Valles Marineris .. Terraformers' Hymn, auditioned in the music lab as variant E) add, only
// for themselves: new solo voices (cello, harp, flute + harp, soft trombone), their own second-arc lead (`alt`),
// 6/8 (beats: 6, bpm counts eighths; harp and spiccato move in eighths), and an opening pedal that yields to the
// chord's own root under a chord that would rub against it (pedal: 'agree'). The first seven play exactly as before.
import { SC, voiceLead, chance } from './music_engine.js';

// ---- the themes ---------------------------------------------------------------------------------
// chords: absolute names per bar ('Bb:2 C:2' splits a bar in beats). melody: semitones above the tonic
// ('7/1.5' = 7 semitones for 1.5 beats, default 1 beat, 'r' = rest), bars separated by '|'.
const PCN = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
// tp(chords, n): a chord line transposed by n semitones (so a theme can be written in a convenient key)
function tp(line, n, flats = false) {
  return line.replace(/([A-G])([b#]?)/g, (_, l, acc) => (flats ? FLAT : SHARP)[(((PCN[l] + (acc === 'b' ? -1 : acc === '#' ? 1 : 0) + n) % 12) + 12) % 12]);
}
const TD_SRC = {
  'red-horizon': { title: 'Red Horizon', root: 62, scale: SC.aeolian, bpm: 64, beats: 4, stage: 'barren', solo: 'hn', w: 1.3,
    A: ['Dm | Bb | F | C | Dm | C | Gm | Dm',
      '7/1.5 5/.5 7 12 | 10/3 8 | 8/1.5 7/.5 5 3 | 5/3 r | 7/1.5 5/.5 7 12 | 14/2 12 10 | 10/1.5 8/.5 5/2 | 5/.5 3/.5 2 0/2'],
    B: ['Bb | C | Dm | C:2 Dm:2 | Bb | C | F | A',
      '5 7 8/2 | 7 8 10/2 | 8 10 12/2 | 14/2 12/2 | 12/1.5 10/.5 8 10 | 12/1.5 10/.5 7/2 | 8 7 5 3 | 2/4'] },
  'dust-and-stars': { title: 'Dust and Stars', root: 57, scale: SC.dorian, bpm: 66, beats: 3, stage: 'barren', solo: 'fl', w: 1.3,
    A: ['Am | D | Am | Em | F | G | E | Am',
      '0 3 7 | 9/2 7 | 7/1.5 5/.5 3 | 2/3 | 0 3 7 | 14/2 12 | 11/2 14 | 12/3'],
    B: ['F | G | Am | Am | F | G | C | E',
      '12 10 8 | 7 5 2 | 3/3 | 2 3 7 | 15 14 12 | 14/2 10 | 12 10 7 | 11/3'] },
  'deep-survey': { title: 'Deep Survey', root: 60, scale: SC.aeolian, bpm: 58, beats: 4, stage: 'barren', solo: 'vla', w: 1.1,
    A: ['Cm | Ab | Eb | Bb | Cm | Ab | Fm:2 G:2 | Cm',
      '0 3 7/2 | 8/2 7 3 | 5/1.5 2/.5 3/2 | 2/3 r | 0 3 7 12 | 12/2 10 8 | 8 5 7 11 | 12/4'],
    B: ['Ab | Bb | Cm | Cm | Ab | Bb | Eb | G',
      '12 10 8/2 | 10 14 17/2 | 15/1.5 14/.5 12/2 | 7/4 | 12 15 20/2 | 19/1.5 17/.5 14/2 | 15 14 10 7 | 11/2 14/2'] },
  'orbital-dawn': { title: 'Orbital Dawn', root: 65, scale: SC.lydian, bpm: 68, beats: 4, stage: 'any', solo: 'hn', w: 1.4,
    A: ['F | C | Dm | Bb | F | G | Bb:2 C:2 | F',
      '0 7 12/2 | 11/1.5 9/.5 7/2 | 9 12 16/2 | 14/3 12 | 7 12 16/2 | 18/2 16 14 | 14 12 11 9 | 12/4'],
    B: ['Dm | Bb | F | C | Dm | Bb | Gm | Csus4:2 C:2',
      '9 7 9 12 | 14/2 9/2 | 7 4 7 12 | 11/3 7 | 9 12 16 14 | 17/2 14/2 | 14 12 9/2 | 12/2 11/2'] },
  'pioneers': { title: 'Pioneers', root: 64, scale: SC.aeolian, bpm: 60, beats: 4, stage: 'any', solo: 'hn', w: 1.4,
    A: ['Em | C | G | D | Em | C | Am:2 B:2 | Em',
      '7/2 12 10 | 12/1.5 10/.5 8/2 | 7 3 7 10 | 14/3 12 | 7/2 12 15 | 15/1.5 14/.5 12/2 | 12 8 11/2 | 12/4'],
    B: ['C | D | Bm | Em | C | D | G | B',
      '8 12 15/2 | 14 12 10/2 | 7 10 14/2 | 12/3 r | 15 17 15/2 | 14 12 10/2 | 10 7 3/2 | 11/2 7/2'] },
  'first-rain': { title: 'First Rain', root: 67, scale: SC.ionian, bpm: 60, beats: 3, stage: 'green', solo: 'fl', w: 1.3,
    A: ['G | D | Em | G | G | D | C:2 D:1 | G',
      '4 7 12 | 11/2 9 | 7/1.5 9/.5 7 | 4/3 | 4 7 12 | 14/2 11 | 12 9 11 | 12/3'],
    B: ['Em | C | G | D | Em | G | Am | D',
      '7 9 11 | 12/2 9 | 7/1.5 4/.5 7 | 2/3 | 11 12 14 | 16/2 12 | 12 9 5 | 11/2 7'] },
  'new-oceans': { title: 'New Oceans', root: 63, scale: SC.ionian, bpm: 56, beats: 4, stage: 'green', solo: 'hn', w: 1.3,
    A: ['Eb | Cm | Ab | Bb | Eb | F | Ab:2 Abm:2 | Eb',
      '7/2 4 7 | 12/2 11 9 | 9/1.5 7/.5 5/2 | 7/4 | 7 12 16/2 | 18/2 14/2 | 12 9 8 7 | 12/4'],
    B: ['Cm | Ab | Eb | Bb | Cm | Ab | F | Bb',
      '9 12 16/2 | 17/1.5 16/.5 12/2 | 14 12 7/2 | 11/3 r | 9 12 16/2 | 17 19 17 16 | 14/2 18/2 | 14/2 11/2'] },
  // the canyon: a long, low cello line that climbs a fifth and an octave and sighs back down; the bridge rises
  // in sequence (G - D - Em) and turns through the harmonic-minor F-sharp major back home
  'valles-marineris': { title: 'Valles Marineris', root: 59, scale: SC.aeolian, bpm: 54, beats: 4, stage: 'barren', solo: 'vc', alt: 'hn', w: 1.3, pedal: 'agree',
    A: ['Bm | G | D | A | Bm | Em | G:2 F#:2 | Bm',
      '0/2 7 12 | 12/1.5 10/.5 8/2 | 7 5 3/2 | 5/1.5 3/.5 2/2 | 0/2 7 12 | 17/2 15 12 | 15 12 11/2 | 12/4'],
    B: ['G | D | Em | Bm | G | A | Em:2 G:2 | F#',
      '8 10 12/2 | 10 12 15/2 | 12 15 17/2 | 15/3 r | 17/1.5 15/.5 12/2 | 14/1.5 12/.5 10/2 | 12 10 8/2 | 7/2 11/2'] },
  // the two small moons: a lilting 6/8 harp tune, falling by steps onto the phrygian half-step (D -> C-sharp minor)
  'twin-moons': { title: 'Twin Moons', root: 61, scale: SC.phrygian, bpm: 100, beats: 6, stage: 'barren', solo: 'hp', alt: 'vla', w: 1.2, pedal: 'agree',
    A: [tp('Em | F | Em | Dm | C | F | Dm:3 F:3 | Em', -3),
      '7/2 5 3/3 | 5/2 3 1/3 | 3 5 7 12/3 | 13/2 12 10/3 | 15/2 13 12/3 | 13/2 12 8/3 | 10/2 8 5/2 1 | 0/6'],
    B: [tp('Am | G | F | Em | Am | G | Dm | F', -3),
      '12/3 8 10 12 | 10/3 7 8 10 | 8/3 5/3 | 7/6 | 12/2 10 8/3 | 10/2 8 7/3 | 10/3 5/3 | 8/2 5 1/3'] },
  // the mountain: a slow trombone call in mixolydian (the flat seventh, A-flat, is the colour), stepping up by fourths
  'olympus-mons': { title: 'Olympus Mons', root: 58, scale: SC.mixolydian, bpm: 62, beats: 4, stage: 'any', solo: 'tbn', alt: 'hn', w: 1.3, pedal: 'agree',
    A: [tp('A | G | D | A | F#m | D | Bm:2 G:2 | A', 1, true),
      '7/2 12/2 | 14/1.5 12/.5 10/2 | 9 12 17/2 | 16/3 r | 16/1.5 14/.5 12 9 | 12/2 14 17 | 17 14 10/2 | 12/4'],
    B: [tp('D | A | G | D | Bm | F#m | G | E', 1, true),
      '12/1.5 14/.5 17/2 | 16/1.5 14/.5 12/2 | 10/1.5 12/.5 14/2 | 12/3 r | 14/1.5 17/.5 21/2 | 19/1.5 17/.5 16/2 | 14 12 10 14 | 14/2 11/2'] },
  // the crossing: a rolling 6/8 tune for the violins, dorian (the bright IV chord, B major), like a sea song
  'long-voyage': { title: 'The Long Voyage', root: 66, scale: SC.dorian, bpm: 102, beats: 6, stage: 'any', solo: 'vln', alt: 'fl', w: 1.3, pedal: 'agree',
    A: [tp('Dm | C | F | G | Dm | C | Am:3 G:3 | Dm', 4),
      '0/2 3 7/3 | 10/2 7 5/3 | 3/2 5 7/2 10 | 9/3 5/3 | 0/2 3 7/2 12 | 14/2 12 10/3 | 14/2 12 9/3 | 12/6'],
    B: [tp('F | C | G | Dm | F | C | Em:3 Am:3 | A', 4),
      '15/2 12 10/3 | 14/2 10 5/3 | 9/2 12 17/3 | 15/3 14 12 10 | 7/2 10 15/3 | 14/2 12 10/3 | 9/2 5 7/3 | 11/3 7/3'] },
  // the first grass: a slow waltz, flute doubled by harp; the second phrase is the same tune over the relative minor
  'tharsis-meadows': { title: 'Tharsis Meadows', root: 62, scale: SC.ionian, bpm: 58, beats: 3, stage: 'green', solo: 'hpfl', alt: 'vln', w: 1.3, pedal: 'agree',
    A: ['D | G | D | A | Bm | G | Em:2 A:1 | D',
      '4 7 12 | 14/2 12 | 12/1.5 9/.5 7 | 4/3 | 4 7 12 | 12/2 14 | 17 14 11 | 12/3'],
    B: ['Bm | F#m | G | D | Em | Bm | G | A',
      '9 12 16 | 16/2 11 | 5 9 12 | 12/2 7 | 14 17 21 | 21/2 16 | 17 14 12 | 11/3'] },
  // the anthem: a stepwise hymn for the horn with plagal ("amen") colour; the bridge descends in thirds, then climbs
  'terraformers-hymn': { title: "Terraformers' Hymn", root: 68, scale: SC.ionian, bpm: 58, beats: 4, stage: 'green', solo: 'hn', alt: 'vc', w: 1.3, pedal: 'agree',
    A: [tp('C | F | C | G | Am | F | F:2 G:2 | C', 8, true),
      '4/2 7/2 | 9/2 5/2 | 4 2 0 4 | 2/4 | 9/2 12/2 | 12/1.5 14/.5 12 9 | 9/2 7 2 | 0/4'],
    B: [tp('Am | Em | F | C | Dm | Am | F | G', 8, true),
      '12/2 16/2 | 11/2 7/2 | 9/2 12/2 | 7/2 4/2 | 5/2 9/2 | 12/1.5 14/.5 16/2 | 17/2 14 12 | 11/2 14/2'] },
};

const QUAL = { '': [0, 4, 7], m: [0, 3, 7], sus4: [0, 5, 7], sus2: [0, 2, 7] };
function parseChord(sym) {
  const m = /^([A-G])([b#]?)(m|sus4|sus2)?$/.exec(sym);
  if (!m) throw new Error('bad chord ' + sym);
  return { pc: (PCN[m[1]] + (m[2] === 'b' ? 11 : m[2] === '#' ? 1 : 0)) % 12, iv: QUAL[m[3] || ''], minor: m[3] === 'm' };
}
function parsePhrase([ch, mel], beats) {
  const cb = ch.split('|').map((b) => {
    const segs = b.trim().split(/\s+/).map((tok) => { const [s, d] = tok.split(':'); return { c: parseChord(s), beats: d ? +d : null }; });
    if (segs.length === 1) segs[0].beats = beats;
    return segs;
  });
  const mb = mel.split('|').map((b) => b.trim().split(/\s+/).map((tok) => {
    const [n, d] = tok.split('/');
    return { o: n === 'r' ? null : +n, beats: d ? +d : 1 };
  }));
  return { ch: cb, mel: mb };
}
export const TRACKS = {};
for (const [name, d] of Object.entries(TD_SRC)) {
  TRACKS[name] = { ...d, name, steps: d.beats * 4, rv: 0.85, dl: 0.1, fx: 0.6, compound: d.beats === 6,
    A: parsePhrase(d.A, d.beats), B: parsePhrase(d.B, d.beats), step: (E, L, t, i, s) => { if (s === 0) epicBar(E, L, t, i); } };
}

// ---- the arc --------------------------------------------------------------------------------------------------
// instrument ranges for placing a whole phrase (keeps the contour, picks the octave)
const RANGE = { hn: [50, 74], fl: [64, 86], vla: [52, 72], vln: [62, 84], vln8: [60, 76], vc8: [45, 62], full: [62, 79],
  vc: [43, 64], hp: [55, 79], hpfl: [64, 84], tbn: [46, 65] };

function plan(L) {
  const k = ['A1', 'A2', 'B1', 'A3', 'B2', 'A4', 'tag', 'coda'];
  return L.cycle === 0 ? ['pre', ...k] : k;
}
// build the next section from the plan, reading the terraforming level now
function nextSection(E, L) {
  const d = L.def;
  if (!L.plan || L.pi >= L.plan.length) {
    if (L.plan) { L.cycle++; if (L.cycle >= 2) E._swapAt = E.ctx.currentTime; }   // two arcs, then hand over
    L.plan = plan(L); L.pi = 0;
  }
  const kind = L.plan[L.pi++], tf = E._tf, barren = tf < 0.3, bloom = tf >= 0.6, rot = L.cycle % 2;
  const alt = d.alt || (d.solo === 'hn' ? 'fl' : 'hn');
  const S = { kind, bars: 8, trans: 0, counter: null, ost: 0, chorale: 0, flute: false, timpEnd: false, melBars: 8 };
  switch (kind) {
    case 'pre': Object.assign(S, { lvl: 0, bars: 4, phrase: 'A', voice: null }); break;
    case 'A1': Object.assign(S, { lvl: 0, phrase: 'A', voice: rot ? alt : d.solo }); break;
    case 'A2': Object.assign(S, { lvl: 1, phrase: 'A', voice: rot ? (barren ? 'vla' : 'vln') : 'vc8' }); break;
    case 'B1': Object.assign(S, { lvl: 2, phrase: 'B', voice: rot ? 'vc8' : (barren ? 'vla' : 'vln') }); break;
    case 'A3': Object.assign(S, { lvl: barren ? 2 : 3, phrase: 'A', voice: rot ? 'hn' : (barren ? 'vln' : 'vln8'), counter: rot ? 'vla' : 'hn', ost: barren ? 0 : 1, timpEnd: !barren }); break;
    case 'B2': Object.assign(S, { lvl: barren ? 2 : 3, phrase: 'B', voice: barren ? 'vc8' : 'vln8', counter: 'hn', ost: 1, flute: bloom, timpEnd: true }); break;
    case 'A4': Object.assign(S, { lvl: barren ? 3 : bloom ? 4 : 3, phrase: 'A', voice: barren ? 'vln' : 'full', counter: barren ? 'hn' : null, ost: barren ? 1 : 2,
      chorale: barren ? 0 : bloom ? 2 : 1, flute: bloom, trans: bloom ? 2 : 0 }); break;
    case 'tag': Object.assign(S, { lvl: bloom ? 4 : 3, bars: 4, phrase: 'tag', voice: 'full', chorale: bloom ? 2 : 1, ost: 0, trans: bloom ? 2 : 0 }); break;
    case 'coda': Object.assign(S, { lvl: 0, phrase: 'A', voice: rot ? alt : d.solo, picardy: bloom }); break;
  }
  if (kind === 'tag' && tf < 0.3) return nextSection(E, L);   // barren: no lift
  S.ph = S.phrase === 'tag' ? tagPhrase(d) : S.phrase === 'B' ? d.B : d.A;
  if (kind === 'coda') S.ph = codaPhrase(d, S.picardy);
  if (S.voice) S.shift = fit(d, S.ph, S.voice, S.trans, barren);
  return S;
}
// Picardy lift for minor tracks (bVI - bVII - I - I), Lydian lift for major ones (IV - II - iv - I)
function tagPhrase(d) {
  const minor = d.scale[2] === 3, nm = (pc) => ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'][((pc % 12) + 12) % 12];
  const r = d.root, b = d.beats;
  const ch = minor ? [nm(r + 8), nm(r + 10), nm(r), nm(r)] : [nm(r + 5), nm(r + 2), nm(r + 5) + 'm', nm(r)];
  const mel = minor ? [12, 14, 16, 16] : [21, 18, 17, 16];
  return parsePhrase([ch.join(' | '), mel.map((o) => o + '/' + b).join(' | ')], b);
}
// coda: the antecedent again, then a quiet cadence to the tonic (major if the planet is green)
function codaPhrase(d, picardy) {
  const ph = d.A, minor = d.scale[2] === 3, last = ph.ch[7][ph.ch[7].length - 1].c;
  const ton = { pc: last.pc, iv: minor && picardy ? [0, 4, 7] : last.iv, minor: minor && !picardy };
  const ch = [ph.ch[0], ph.ch[1], ph.ch[2], ph.ch[3], ph.ch[4], ph.ch[5], [{ c: ton, beats: d.beats }], [{ c: ton, beats: d.beats }]];
  const mel = [ph.mel[0], ph.mel[1], ph.mel[2], ph.mel[3], [{ o: null, beats: d.beats }], [{ o: null, beats: d.beats }],
    [{ o: 12, beats: d.beats }], [{ o: 12, beats: d.beats }]];
  return { ch, mel };
}
function fit(d, ph, voice, trans, barren) {
  let lo = Infinity, hi = -Infinity;
  for (const bar of ph.mel) for (const n of bar) if (n.o != null) { lo = Math.min(lo, n.o); hi = Math.max(hi, n.o); }
  const [rl, rh] = RANGE[voice] || [55, 79], base = d.root + trans;
  let best = 0, bs = Infinity;
  for (let k = -3; k <= 3; k++) {
    const a = base + lo + 12 * k, b = base + hi + 12 * k, over = Math.max(0, rl - a) + Math.max(0, b - rh);
    const sc = over * 10 + Math.abs((a + b) / 2 - (rl + rh) / 2) * (barren ? 0.5 : 1) + (barren ? (a + b) / 2 * 0.05 : 0);
    if (sc < bs) { bs = sc; best = 12 * k; }
  }
  return best;
}

// ---- one bar ------------------------------------------------------------------------------------
function epicBar(E, L, t, i) {
  const d = L.def;
  if (L.cycle == null) { L.cycle = 0; L.pv = null; L.cv = null; }
  if (!L.sec || L.sb >= L.sec.bars) { L.sec = nextSection(E, L); L.sb = 0; }
  const S = L.sec, b = L.sb++, beat = 60 / d.bpm, spb = 4;
  const bar = S.ph.ch[b % S.ph.ch.length], mel = S.ph.mel[b % S.ph.mel.length];
  const base = d.root + S.trans;
  // chords
  let off = 0;
  for (const seg of bar) {
    const segDur = seg.beats * beat, c = seg.c;
    E._at(L, i, t, off * spb, (tt) => chord(E, L, S, tt, c, segDur, base, b, seg.beats));
    off += seg.beats;
  }
  // melody
  if (S.voice && b < S.melBars) {
    let o = 0;
    for (const n of mel) {
      if (n.o != null) {
        const m = base + n.o + S.shift, dur = n.beats * beat;
        E._at(L, i, t, o * spb, (tt) => melody(E, L, S, tt + (Math.random() - 0.5) * 0.02, m, dur, b));
      }
      o += n.beats;
    }
  }
  // timpani swell over the last two bars into the next section
  if (S.timpEnd && b === S.bars - 2) {
    const r = d.root % 12, m = [36, 48].map((x) => x + r).find((x) => x >= 40 && x <= 55) || 45;
    E._at(L, i, t, 0, (tt) => E._smp(L, 'tmp', m, tt, beat * d.beats * 2 - 0.2, { att: beat * d.beats * 1.8, rel: 0.5, gain: 0.05 + 0.03 * S.lvl, cut: 900, fx: 0.5, prio: 1 }));
  }
  // a soft roll under the first bar of the climax / lift
  if ((S.kind === 'A4' || S.kind === 'tag') && b === 0 && S.lvl >= 3) {
    const m = 43 + ((d.root + S.trans - 43) % 12 + 12) % 12;
    E._at(L, i, t, 0, (tt) => E._smp(L, 'tmp', m > 55 ? m - 12 : m, tt, beat * d.beats * 1.2, { att: 0.3, rel: 1.5, gain: 0.07, cut: 900, fx: 0.5, prio: 1 }));
  }
}
function chord(E, L, S, t, c, dur, base, b, beats) {
  const d = L.def, lvl = S.lvl, tpc = (c.pc + S.trans) % 12;
  const tones = c.iv.map((x) => tpc + x);
  const lo = [48, 50, 52, 53, 53][lvl], hi = [64, 69, 72, 76, 77][lvl];
  const v = voiceLead(tones.map((p) => lo + ((p - lo) % 12 + 12) % 12), L.pv, lo, hi, false);
  L.pv = v;
  const root = 36 + ((tpc - 36) % 12 + 12) % 12;   // C2..B2
  L.h = { root: root + 24, v, d: 0, scale: d.scale };
  const padG = [0.03, 0.045, 0.065, 0.09, 0.13][lvl], att = [2.2, 1.4, 1.0, 0.8, 0.7][lvl], rel = [2.8, 2.2, 1.8, 1.6, 1.6][lvl];
  const sus = lvl >= 1 && beats >= 2 && c.iv[1] !== 5 && chance(0.3);   // a 4-3 suspension
  v.forEach((m, k) => {
    const inst = E._strings(m), pan = (k / Math.max(1, v.length - 1) - 0.5) * 0.7;
    const third = (((m - tpc) % 12) + 12) % 12 === c.iv[1];
    const o = { att, rel, gain: padG, pan, fx: 0.4, cut: { vln: 2000, vla: 2100, vc: 1700 }[inst], offset: 0.12, prio: 2 };
    if (sus && third) {
      const s4 = m + (5 - c.iv[1]);
      E._smp(L, E._strings(s4), s4, t, dur * 0.4, { ...o, rel: 0.5 });
      E._smp(L, inst, m, t + dur * 0.4 - 0.1, dur * 0.6 + 0.1, { ...o, att: 0.35 });
    } else E._smp(L, inst, m, t, dur, o);
  });
  if (lvl >= 3 && !E.lite) {   // violins double the top voice an octave up
    const top = v[v.length - 1] + 12;
    if (top <= 88) E._smp(L, 'vln', top, t, dur, { att, rel, gain: padG * 0.7, pan: 0.3, fx: 0.45, cut: 2200, offset: 0.12, prio: 2 });
  }
  // bass: a tonic pedal at the opening, the root from the first statement on, contrabass once the arc opens up
  if (lvl === 0 && d.pedal === 'agree') agreeingPedal(E, L, S, t, c, dur, root, b, beats);
  else if (lvl === 0) {
    if (b % 2 === 0) { const ped = 36 + ((d.root + S.trans - 36) % 12 + 12) % 12; E._smp(L, 'vc', ped + (ped < 40 ? 12 : 0), t, dur * 2, { att: 2, rel: 2.5, gain: 0.055, cut: 1200, fx: 0.3, offset: 0.15, prio: 2 }); }
  } else {
    L.pedUntil = null;
    E._smp(L, 'vc', root + (root < 40 ? 12 : 0), t, dur, { att: 0.6, rel: 1.5, gain: 0.09, cut: 1400, fx: 0.3, offset: 0.12, prio: 2 });
    if (lvl >= 2) E._smp(L, 'cb', root - 12 < 28 ? root : root - 12, t, dur, { att: 0.6, rel: 1.5, gain: 0.08 + 0.01 * lvl, cut: 800, fx: 0.25, offset: 0.12, prio: 2 });
  }
  if (S.chorale) chorale(E, L, S, t, v, root, dur);
  motion(E, L, S, t, v, root, dur, beats);
  if (S.counter) counter(E, L, S, t, tones, dur);
  if (lvl <= 1 && b % 2 === 0) E.vShimmer(L, t, dur * 2);
}
// the opening pedal of the later tracks: the tonic held over two bars where both chords agree with it (no semitone
// or tritone against it), else that chord's own root, so nothing grinds (the phrygian D major over C-sharp)
function agreeingPedal(E, L, S, t, c, dur, root, b, beats) {
  const d = L.def, tonic = (d.root + S.trans) % 12, ped = 36 + ((tonic - 36) % 12 + 12) % 12;
  const agrees = (cc) => cc.iv.every((x) => { const ic = ((((cc.pc + S.trans + x) - tonic) % 12) + 12) % 12; return ic !== 1 && ic !== 6; });
  const o = { att: 2, rel: 2.5, gain: 0.055, cut: 1200, fx: 0.3, offset: 0.15, prio: 2 };
  if (L.pedUntil != null && t < L.pedUntil - 0.05) return;   // still held from the bar before
  if (agrees(c)) {
    const nxt = S.ph.ch[(b + 1) % S.ph.ch.length], hold = b % 2 === 0 && beats === d.beats && nxt.every((sg) => agrees(sg.c));
    E._smp(L, 'vc', ped + (ped < 40 ? 12 : 0), t, hold ? dur * 2 : dur, o); L.pedUntil = t + (hold ? dur * 2 : dur);
  } else {
    E._smp(L, 'vc', root + (root < 40 ? 12 : 0), t, dur, { ...o, att: 1.2 }); L.pedUntil = t + dur;
  }
}
// soft brass chorale: horns on the upper chord tones, trombones below, tuba on the root
function chorale(E, L, S, t, v, root, dur) {
  const g = S.chorale === 2 ? 1 : 0.6, o = { att: 0.6, rel: 1.4, fx: 0.55, offset: 0.08, prio: 2 };
  const pcs = [...new Set(v.map((m) => ((m % 12) + 12) % 12))];
  const hn = voiceLead(pcs.map((p) => 55 + ((p - 55) % 12 + 12) % 12), L.hv, 55, 70, false).slice(-2);
  const tb = voiceLead(pcs.map((p) => 46 + ((p - 46) % 12 + 12) % 12), L.tv, 46, 60, false).slice(0, 2);
  L.hv = hn; L.tv = tb;
  hn.forEach((m, k) => E._smp(L, 'hn', m, t, dur, { ...o, gain: 0.085 * g, cut: 1500, pan: 0.25 + k * 0.1 }));
  if (S.chorale === 2 && !E.lite) {
    tb.forEach((m, k) => E._smp(L, 'tbn', m, t, dur, { ...o, gain: 0.075 * g, cut: 1200, pan: -0.25 - k * 0.1 }));
    E._smp(L, 'tba', root < 34 ? root + 12 : root, t, dur, { ...o, gain: 0.07, cut: 600, pan: 0 });
  }
}
// gentle forward motion: harp arpeggios, then a soft spiccato ostinato in the cellos (and violins at the climax)
function motion(E, L, S, t, v, root, dur, beats) {
  if (L.def.compound) return motion68(E, L, S, t, v, root, dur, beats);
  const lvl = S.lvl, beat = dur / beats, tf = E._tf;
  if (lvl >= 1) {
    const tones = [...v, ...v.map((m) => m + 12)].filter((m) => m >= 55 && m <= 84);
    const eighths = lvl >= 2 && lvl < 4 && tf >= 0.3, step = eighths ? beat / 2 : beat, n = Math.round(dur / step);
    const updown = L.sb % 2 === 0;
    if (lvl > 1 || L.sb % 2 === 1) for (let k = 0; k < n; k++) {
      const per = Math.max(1, 2 * tones.length - 2), u = k % per, idx = updown ? (u < tones.length ? u : per - u) : k % tones.length;
      const m = tones[idx]; if (m == null) continue;
      E._smp(L, 'hp', m, t + k * step, 2.5, { att: 0.004, rel: 1.2, gain: 0.07 + 0.01 * lvl, cut: 2200, fx: 0.6, pan: (idx / tones.length - 0.5) * 0.8, prio: 1 });
    }
  }
  if (S.ost) {
    const pat = [0, 7, 12, 7], n = Math.round(dur / (beat / 2));
    for (let k = 0; k < n; k++) {
      const m = root + 12 + pat[k % 4];
      E._smp(L, 'csp', m > 62 ? m - 12 : m, t + k * beat / 2, 0.5, { att: 0.01, rel: 0.25, gain: k % 2 ? 0.055 : 0.07, cut: 1600, fx: 0.35, pan: -0.2, prio: 1 });
      if (S.ost === 2 && !E.lite && k % 2 === 1) {
        const top = v[(k >> 1) % v.length] + 12;
        E._smp(L, 'vsp', top > 79 ? top - 12 : top, t + k * beat / 2, 0.4, { att: 0.01, rel: 0.2, gain: 0.04, cut: 2000, fx: 0.45, pan: 0.3, prio: 1 });
      }
    }
  }
}
// 6/8: the harp moves in eighths (a lilting 1 . 3 4 . 6 while the arc is quiet), the spiccato in root-fifth-octave
function motion68(E, L, S, t, v, root, dur, beats) {
  const lvl = S.lvl, beat = dur / beats, tf = E._tf;
  if (lvl >= 1 && (lvl > 1 || L.sb % 2 === 1)) {
    const tones = [...v, ...v.map((m) => m + 12)].filter((m) => m >= 55 && m <= 84);
    const every = lvl >= 2 && lvl < 4 && tf >= 0.3, updown = L.sb % 2 === 0, n = Math.round(dur / beat);
    let j = 0;
    for (let k = 0; k < n; k++) {
      if (!every && k % 3 === 1) continue;
      const per = Math.max(1, 2 * tones.length - 2), u = j % per, idx = updown ? (u < tones.length ? u : per - u) : j % tones.length;
      j++;
      const m = tones[idx]; if (m == null) continue;
      E._smp(L, 'hp', m, t + k * beat, 2.5, { att: 0.004, rel: 1.2, gain: 0.07 + 0.01 * lvl, cut: 2200, fx: 0.6, pan: (idx / tones.length - 0.5) * 0.8, prio: 1 });
    }
  }
  if (S.ost) {
    const pat = [0, 7, 12, 7, 12, 7], n = Math.round(dur / beat);
    for (let k = 0; k < n; k++) {
      const m = root + 12 + pat[k % 6];
      E._smp(L, 'csp', m > 62 ? m - 12 : m, t + k * beat, 0.5, { att: 0.01, rel: 0.25, gain: k % 3 ? 0.05 : 0.07, cut: 1600, fx: 0.35, pan: -0.2, prio: 1 });
      if (S.ost === 2 && !E.lite && k % 3 !== 0) {
        const top = v[k % v.length] + 12;
        E._smp(L, 'vsp', top > 79 ? top - 12 : top, t + k * beat, 0.4, { att: 0.01, rel: 0.2, gain: 0.035, cut: 2000, fx: 0.45, pan: 0.3, prio: 1 });
      }
    }
  }
}
// countermelody: guide tones (the nearest 3rd / 5th of each chord), moving in half-bars under the tune
function counter(E, L, S, t, tones, dur) {
  const inst = S.counter, lo = 55, hi = 67;
  const cand = [];
  for (const p of [tones[1], tones[2], tones[0]]) for (let m = lo; m <= hi; m++) if ((((m - p) % 12) + 12) % 12 === 0) cand.push(m);
  const prev = L.cv ?? 60, a = cand.reduce((x, y) => (Math.abs(y - prev) < Math.abs(x - prev) ? y : x), cand[0]);
  const other = cand.filter((m) => m !== a).reduce((x, y) => (Math.abs(y - a) < Math.abs(x - a) ? y : x), a);
  const g = inst === 'hn' ? 0.09 : 0.08, o = { att: 0.35, rel: 0.8, fx: 0.5, offset: 0.08, cut: 1600, pan: 0.35, prio: 2 };
  if (dur > 3 && chance(0.6)) {
    E._smp(L, inst, a, t + 0.05, dur / 2, { ...o, gain: g });
    E._smp(L, inst, other, t + dur / 2, dur / 2, { ...o, gain: g, att: 0.25 });
    L.cv = other;
  } else { E._smp(L, inst, a, t + 0.05, dur, { ...o, gain: g }); L.cv = a; }
}
function melody(E, L, S, t, m, dur, b) {
  const legato = dur + 0.12, long = dur >= 1.8, o = { rel: 0.45, fx: 0.5, prio: 2, pan: 0.05 };
  const k = [0.45, 0.6, 0.75, 0.9, 1.15][S.lvl];   // the tune grows with the arc: intimate solo -> full statement
  const hn = (mm, g) => E._smp(L, 'hn', mm, t, legato, { ...o, att: long ? 0.25 : 0.08, gain: g, cut: 1800, offset: 0.02 });
  const harp = (mm, g) => E._smp(L, 'hp', mm, t, dur + 0.3, { att: 0.004, rel: 1.0, gain: g, cut: 2400, fx: 0.6, pan: 0.05, prio: 2 });
  const str = (inst, mm, g, pan = 0) => E._smp(L, inst, mm, t, legato, { ...o, att: long ? 0.3 : 0.12, gain: g, cut: inst === 'vc' ? 1700 : 2300, offset: 0.1, pan });
  switch (S.voice) {
    case 'hn': hn(m, 0.2 * k); break;
    case 'fl': E._smp(L, 'fl', m, t, legato, { ...o, att: long ? 0.2 : 0.07, gain: 0.17 * k, cut: 2600, offset: 0.03 }); break;
    case 'vla': str('vla', m, 0.2 * k); break;
    case 'vln': str('vln', m, 0.18 * k); break;
    case 'vln8': str('vln', m, 0.16 * k, 0.1); if (m + 12 <= 88) str('vln', m + 12, 0.09 * k, -0.1); break;
    case 'vc8': str('vc', m, 0.19 * k, -0.15); str('vla', m + 12, 0.1 * k, 0.15); break;
    case 'full':
      str('vln', m, 0.16 * k, 0.1); if (m + 12 <= 88) str('vln', m + 12, 0.08 * k, -0.1);
      hn(m - 12 >= 50 ? m - 12 : m, 0.12 * k);
      break;
    // the later tracks' solo voices
    case 'vc':   // solo cello; the violas take anything above D4, where the cello samples would be stretched
      E._smp(L, m > 62 ? 'vla' : 'vc', m, t, legato, { ...o, att: long ? 0.3 : 0.12, gain: 0.21 * k, cut: m > 62 ? 2100 : 1800, offset: 0.1, pan: -0.05 });
      break;
    case 'hp': harp(m, 0.24 * k); break;
    case 'hpfl':
      E._smp(L, 'fl', m, t, legato, { ...o, att: long ? 0.2 : 0.08, gain: 0.14 * k, cut: 2600, offset: 0.03 });
      harp(m, 0.13 * k);
      break;
    case 'tbn': E._smp(L, 'tbn', m, t, legato, { ...o, att: long ? 0.3 : 0.12, gain: 0.17 * k, cut: 1100, offset: 0.06 }); break;
  }
  if (S.flute && m + 12 <= 88 && b % 2 === 0) E._smp(L, 'fl', m + 12 > 86 ? m : m + 12, t, legato, { ...o, att: 0.1, gain: 0.07, cut: 2600, offset: 0.03, pan: -0.3 });
}
