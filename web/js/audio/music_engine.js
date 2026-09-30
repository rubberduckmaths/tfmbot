// music_engine.js -- the orchestral music player. It runs layers against a look-ahead scheduler: one base track
// (music_score.js: written themes played through an arc) and at most one mood (music_moods.js: a short colour
// layer in the track's key, over the ducked track). Voices are recorded VSCO 2 CE samples (music_bank.js) plus a
// few synthesized ambience voices (wind / surf / stream noise, distant birds, a low rumble).
// Every source gets a stop time and is tracked on its layer; a voice budget sheds ornaments first; stop()
// silences and stops everything within ~1 s. Until the first samples are decoded the music is silent, and the
// first track fades in once they are.

export const rnd = Math.random;
export const pick = (a) => a[(rnd() * a.length) | 0];
export const chance = (p) => rnd() < p;
export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
export const ftom = (f) => Math.round(69 + 12 * Math.log2(f / 440));
export const SC = {
  ionian: [0, 2, 4, 5, 7, 9, 11], lydian: [0, 2, 4, 6, 7, 9, 11], mixolydian: [0, 2, 4, 5, 7, 9, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10], aeolian: [0, 2, 3, 5, 7, 8, 10], phrygian: [0, 1, 3, 5, 7, 8, 10],
  harmonic: [0, 2, 3, 5, 7, 8, 11], penta: [0, 2, 4, 7, 9],
};
// scale degree d (any integer) of scale sc on midi root -> midi note
export const deg = (sc, root, d) => { const n = sc.length, o = Math.floor(d / n); return root + sc[d - o * n] + 12 * o; };
// fold a midi note into [lo, lo + 11]
export const fold = (m, lo) => lo + ((((m - lo) % 12) + 12) % 12);
export const pc = (m) => ((m % 12) + 12) % 12;
// degrees whose triad is plain major/minor (perfect fifth) in this scale
export function goodDegs(sc) {
  const r = [];
  for (let d = 0; d < sc.length; d++) {
    const a = deg(sc, 0, d), th = deg(sc, 0, d + 2) - a, fi = deg(sc, 0, d + 4) - a;
    if (fi === 7 && (th === 3 || th === 4)) r.push(d);
  }
  return r;
}
// choose the inversion / octave of `notes` inside [lo, hi] closest to the previous voicing
export function voiceLead(notes, prev, lo, hi, spread) {
  const pcs = notes.map(pc), n = pcs.length;
  let best = null, bs = Infinity;
  for (let inv = 0; inv < n; inv++) {
    const rot = pcs.slice(inv).concat(pcs.slice(0, inv));
    for (let oct = 0; oct < 2; oct++) {
      const v = [fold(rot[0], lo) + 12 * oct];
      for (let k = 1; k < n; k++) { let x = v[k - 1] + 1; while (pc(x) !== rot[k]) x++; v.push(x); }
      if (spread && n >= 4) { v[1] += 12; v.sort((a, b) => a - b); }
      if (v[n - 1] > hi) continue;
      let sc = rnd() * 3;
      if (prev) for (let k = 0; k < n; k++) sc += Math.abs(v[k] - prev[Math.min(k, prev.length - 1)]);
      else sc += Math.abs(v[0] - lo - 4);
      if (sc < bs) { bs = sc; best = v; }
    }
  }
  if (best) return best;
  const lo0 = Math.min(...notes), sh = fold(lo0, lo) - lo0;
  return notes.map((m) => m + sh);
}
// short motifs from a scale, varied on repeat (moods' melodies)
function makeMotif(rhythms) {
  const r = pick(rhythms), m = []; let d = 0;
  for (let k = 0; k < r.length; k++) {
    m.push({ d, dur: r[k], rest: k > 0 && chance(0.12) });
    d = clamp(d + pick([1, 1, 2, -1, -1, -2, 0, 3, -3, 4]), -4, 7);
  }
  return m;
}
function vary(m) {
  const r = rnd();
  if (r < 0.2) return m.map((n) => ({ ...n, d: -n.d }));                       // inversion
  if (r < 0.35) { const ds = m.map((n) => n.d).reverse(); return m.map((n, k) => ({ ...n, d: ds[k] })); } // retrograde
  if (r < 0.6) { const c = m.map((n) => ({ ...n })); c[(rnd() * c.length) | 0].d += pick([-1, 1, 2]); return c; }
  return m;
}

const DUCK = 0.7;                                   // base-track level under a mood (a colour shift, not a switch)
const CAP = { full: [34, 50, 66], lite: [22, 34, 46] };   // live-source budget by priority: 0 ornament, 1 normal, 2 essential
const STR_CUT = { vln: 1700, vla: 1900, vc: 1500 };

export class MusicEngine {
  // ctx: AudioContext; out: node the music bus feeds; bank: SampleBank; tracks / moods: definitions; noiseBuf: 2 s of noise;
  // lite: phones / low-core machines (smaller voice budget, shorter reverb, thinner climaxes)
  constructor(ctx, out, bank, tracks, moods, noiseBuf, lite) {
    this.ctx = ctx; this.bank = bank; this.T = tracks; this.M = moods; this.noiseBuf = noiseBuf; this.lite = lite;
    this.cap = lite ? CAP.lite : CAP.full;
    this.running = false; this._layers = []; this._mood = null; this._track = null; this._nv = 0; this._hist = []; this._tf = 0;
    this._pumpT = null; this._offT = null; this._offList = []; this._inStep = false; this._swapAt = Infinity;
    // bus: level -> two gentle low-passes, a presence dip and an air cut (soft, never bright) -> out
    this.vol = this._g(0);
    const lp1 = this._f('lowpass', 3000, 0.5), lp2 = this._f('lowpass', 3800, 0.5), dip = this._f('peaking', 2600, 0.9), shelf = this._f('highshelf', 3800, 0.7);
    dip.gain.value = -3; shelf.gain.value = -10;
    this.vol.connect(lp1); lp1.connect(lp2); lp2.connect(dip); dip.connect(shelf); shelf.connect(out);
    this.reverb = ctx.createConvolver(); this.reverb.buffer = this._impulse(lite ? 3.2 : 4.5, 5000, 600);
    const revOut = this._g(0.9); this.reverb.connect(revOut); revOut.connect(this.vol);
    this.delay = ctx.createDelay(2); this.delay.delayTime.value = 0.62;
    const fb = this._g(0.3), dl = this._f('lowpass', 1500, 0.5), dOut = this._g(0.6);
    this.delay.connect(dl); dl.connect(fb); fb.connect(this.delay); dl.connect(this.reverb); dl.connect(dOut); dOut.connect(this.vol);
    const mk = (dest) => { const g = this._g(1); g.connect(dest); return g; };
    this._bb = { dry: mk(this.vol), rev: mk(this.reverb), dly: mk(this.delay) };   // base tracks (duckable)
    this._mb = { dry: this.vol, rev: this.reverb, dly: this.delay };               // moods
  }
  // stereo impulse: independent noise per channel, -60 dB at `sec`, a one-pole low-pass falling from f0 to f1
  // over the tail (darker as it decays), 25 ms pre-delay, soft onset
  _impulse(sec, f0, f1) {
    const sr = this.ctx.sampleRate, len = Math.floor(sr * sec), pre = Math.floor(sr * 0.025), b = this.ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      let y = 0;
      for (let i = pre; i < len; i++) {
        const x = (i - pre) / (len - pre), a = 1 - Math.exp((-2 * Math.PI * f0 * Math.pow(f1 / f0, x)) / sr);
        y += a * ((Math.random() * 2 - 1) - y);
        d[i] = y * Math.exp(-6.9 * x) * Math.min(1, (i - pre) / (sr * 0.06));
      }
    }
    return b;
  }

  // ---- public ------------------------------------------------------------------------------------
  get currentMood() { return this._mood ? this._mood.name : null; }
  get currentTrack() { return this._track ? this._track.name : null; }
  start() {
    if (this.running) return;
    this.running = true;
    this._layers = []; this._mood = null; this._track = null; this._nv = 0;
    const now = this.ctx.currentTime;
    for (const k of ['dry', 'rev', 'dly']) this._ramp(this._bb[k].gain, 1, 0.05, now);
    this.bank.resume();
    this._pump();
  }
  // silence within ~1 s, stop every source and all scheduling; sample loading pauses too
  stop() {
    clearTimeout(this._pumpT); this._pumpT = null;
    this.bank.pause();
    if (!this.running) return;
    this.running = false;
    const now = this.ctx.currentTime, old = this._layers;
    this._layers = []; this._mood = null; this._track = null; this._nv = 0;
    for (const L of old) {
      for (const v of L.v) this._stopSrc(v, now + 1);
      for (const o of L.persist) try { o.stop(now + 1); } catch (e) { /* already stopped */ }
      L.v = []; L.persist = []; L.ev = {};
    }
    this._offList.push(...old);
    clearTimeout(this._offT);
    this._offT = setTimeout(() => {
      this._offT = null;
      for (const L of this._offList) this._unplug(L);
      this._offList = [];
    }, 1100);
  }
  // reactive mood layer (see music_moods.js); same mood again = extend it
  mood(name, opts = {}) {
    const def = name && this.M[name];
    if (!def || !this.running || !this._track) return false;
    const now = this.ctx.currentTime, hold = clamp(opts.hold ?? def.hold ?? 20, 1, 90);
    const cur = this._mood;
    if (cur && cur.name === name) {
      cur.until = Math.max(cur.until, now + hold);
      if (def.retrigger) def.retrigger(this, cur, now + 0.02);
      return true;
    }
    const fin = opts.fadeIn ?? def.fadeIn ?? 2.5;
    for (const L of this._layers) {   // at most one mood fading out besides the incoming one
      if (L.kind === 'mood' && L !== cur && L.stopAt != null) { this._fade(L, 0, 0.15, now); L.stopAt = Math.min(L.stopAt, now + 0.2); }
    }
    if (cur) { const fo = Math.min(1.5, Math.max(0.3, fin)); this._fade(cur, 0, fo, now); cur.stopAt = now + fo + 0.05; }
    const L = this._newLayer(def, 'mood', now + 0.03);
    L.name = name; L.until = now + fin + hold;
    this._layers.push(L); this._mood = L;
    if (def.init) def.init(this, L, now + 0.03);
    this._fade(L, 1, fin, now);
    this._duckTo(DUCK, fin, now);
    this._run(L, now + 0.4);
    return true;
  }
  endMood(fade = 5) { if (this._mood) this._endMood(this.ctx.currentTime, fade); }
  setTerraform(tf) { this._tf = clamp(tf, 0, 1); }
  // crossfade to another track now (by terraforming stage if name is omitted / unknown)
  nextTrack(name, fade = 8) {
    if (!this.running || !this._track) return;
    this._swapTrack(this.ctx.currentTime, fade, this.T[name] ? name : null);
  }

  // ---- scheduling --------------------------------------------------------------------------------
  _pickTrack() {
    const tf = this._tf, opts = [];
    for (const [n, d] of Object.entries(this.T)) {
      if (this._hist.includes(n)) continue;
      const w = (d.w ?? 1) * (d.stage === 'green' ? (tf < 0.3 ? 0 : 0.3 + 3 * tf) : d.stage === 'barren' ? 0.3 + 3 * (1 - tf) : 1.4);
      if (w > 0) opts.push([n, w]);
    }
    if (!opts.length) return pick(Object.keys(this.T).filter((n) => n !== this._hist[this._hist.length - 1]));
    let s = 0; for (const o of opts) s += o[1];
    let r = rnd() * s; for (const o of opts) if ((r -= o[1]) <= 0) return o[0];
    return opts[0][0];
  }
  _newLayer(def, kind, t) {
    const bus = kind === 'track' ? this._bb : this._mb;
    const L = { def, kind, name: '', i: 0, sd: 60 / def.bpm / 4, next: t, v: [], persist: [], ev: {},
      stopAt: null, bar: 0, dens: 0.5, dt: 0.5, phr: 0, mBusy: 0, motif: null, cuts: {} };
    const xf = L.xf = this._g(0), xfx = L.xfx = this._g(0), rs = this._g(def.rv), ds = this._g(def.dl), fx = L.fx = this._g(def.fx);
    xf.connect(bus.dry); xf.connect(rs); rs.connect(bus.rev); xf.connect(ds); ds.connect(bus.dly);
    fx.connect(xfx); xfx.connect(bus.rev); xfx.connect(bus.dly);
    L.in = xf; L.nodes = [xf, xfx, rs, ds, fx];
    return L;
  }
  // the arc decides when to hand over (the score sets _swapAt), so no timer here
  _startTrack(name, t, fade) {
    const def = this.T[name], L = this._newLayer(def, 'track', t);
    L.name = name;
    this._fade(L, 1, fade, t);
    const dt = this.delay.delayTime; dt.cancelScheduledValues(t); dt.setTargetAtTime(Math.min(1.5, 45 / def.bpm), t, 2);
    this._track = L; this._layers.push(L);
    this._hist.push(name); if (this._hist.length > 4) this._hist.shift();
    this._swapAt = Infinity;
  }
  _swapTrack(now, dur = 8, name = null) {
    const old = this._track;
    if (old) { this._fade(old, 0, dur, now); old.stopAt = now + dur + 0.05; }
    this._startTrack(name || this._pickTrack(), now + 0.05, dur);
  }
  _endMood(now, dur) {
    const m = this._mood; if (!m) return;
    this._mood = null;
    this._fade(m, 0, dur, now); m.stopAt = now + dur + 0.05;
    this._duckTo(1, dur, now);
  }
  _key() {
    const d = (this._track && this._track.def) || Object.values(this.T)[0], minor = d.scale[2] === 3;
    return { root: d.root, scale: d.scale, minor, majRoot: minor ? d.root + 3 : d.root };
  }
  _pump() {
    this._pumpT = null;
    if (!this.running) return;
    const now = this.ctx.currentTime;
    const la = typeof document !== 'undefined' && document.hidden ? 1.5 : 0.5;
    if (!this._track) {                    // silent until the first samples are in, then the first track fades in
      if (this.bank.ready) this._startTrack(this._pickTrack(), now + 0.1, 6);
      else { this._pumpT = setTimeout(() => this._pump(), 400); return; }
    }
    let nv = 0;
    for (const L of this._layers) { if (L.v.length) L.v = L.v.filter((v) => v.e > now); nv += L.v.length; }
    this._nv = nv;
    if (this._mood && now >= this._mood.until) this._endMood(now, 5);
    if (now >= this._swapAt) { if (this._mood) this._swapAt = now + 8; else this._swapTrack(now, 8); }
    for (const L of this._layers) this._run(L, now + la);
    const keep = [];
    for (const L of this._layers) { if (L.stopAt != null && now >= L.stopAt) this._dispose(L, now); else keep.push(L); }
    this._layers = keep;
    this._pumpT = setTimeout(() => this._pump(), 150);
  }
  _run(L, until) {
    const now = this.ctx.currentTime;
    if (L.next < now - 0.25) L.next = now + 0.03;   // timers were throttled: skip, don't burst
    while (L.next < until && (L.stopAt == null || L.next < L.stopAt)) { this._step(L, L.next, L.i); L.i++; L.next += L.sd; }
  }
  _step(L, t, i) {
    const d = L.def, s = i % d.steps;
    if (s === 0) L.bar = (i / d.steps) | 0;
    const e = L.ev[i];
    if (e) { delete L.ev[i]; for (const f of e) f(t); }
    d.step(this, L, t, i, s);
  }
  // run fn at step i + off (off in steps; 0 = now)
  _at(L, i, t, off, fn) {
    off = Math.round(off);
    if (off <= 0) return fn(t);
    (L.ev[i + off] || (L.ev[i + off] = [])).push(fn);
  }
  _dispose(L, now) {
    for (const v of L.v) this._stopSrc(v, now + 0.05);
    for (const o of L.persist) try { o.stop(now + 0.05); } catch (e) { /* already stopped */ }
    L.v = []; L.persist = []; L.ev = {};
    this._unplug(L);
  }
  _unplug(L) { for (const n of L.nodes) try { n.disconnect(); } catch (e) { /* ok */ } L.nodes = []; L.cuts = {}; }
  _stopSrc(v, at) { try { v.s.stop(Math.min(v.e, at)); } catch (e) { /* ok */ } }
  _fade(L, to, dur, t) { for (const g of [L.xf, L.xfx]) this._ramp(g.gain, to, dur, t); }
  _duckTo(v, dur, t) { for (const k of ['dry', 'rev', 'dly']) this._ramp(this._bb[k].gain, v, dur, t); }
  _ramp(p, v, dur, t) {
    const cur = p.value;
    p.cancelScheduledValues(t); p.setValueAtTime(cur, t); p.linearRampToValueAtTime(v, t + Math.max(0.01, dur));
  }
  _room(n, prio = 1) { return this._nv + n <= this.cap[prio]; }
  // a motif-based phrase (moods): notes from the scale, placed around o.lo, varied on repeat
  _phrase(L, t, i, o, prob) {
    if (i < L.mBusy || !chance(prob * 0.75)) return;
    if (!L.motif || ++L.phr % (3 + ((rnd() * 3) | 0)) === 0) L.motif = makeMotif(o.rhythms);
    const m = vary(L.motif), aug = chance(0.18) ? 2 : 1, lo = clamp(o.lo - 7, 55, 64);
    const base = deg(o.sc, o.root, o.start), shift = fold(base, lo) - base;
    let off = 0;
    for (const n of m) {
      const dur = n.dur * aug;
      if (!n.rest) { const midi = deg(o.sc, o.root, o.start + n.d) + shift; this._at(L, i, t, off, (tt) => o.voice(tt, midi, dur * L.sd)); }
      off += dur;
    }
    L.mBusy = i + off;
  }

  // ---- node helpers ------------------------------------------------------------------------------
  _g(v) { const g = this.ctx.createGain(); g.gain.value = v; return g; }
  _f(type, f, q = 1) { const b = this.ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; }
  _o(L, type, f, t, end) {
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
    o.start(t); o.stop(end); L.v.push({ s: o, e: end }); this._nv++;
    return o;
  }
  _n(L, t, end) {
    const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    s.start(t, rnd() * 1.5); s.stop(end); L.v.push({ s, e: end }); this._nv++;
    return s;
  }
  _pan(node, pan) {
    if (!pan || !this.ctx.createStereoPanner) return node;
    const p = this.ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); node.connect(p); return p;
  }
  _out(L, node, fx = 0, pan = 0) {
    const n = this._pan(node, pan);
    n.connect(L.in);
    if (fx > 0) { if (fx >= 1) n.connect(L.fx); else { const s = this._g(fx); n.connect(s); s.connect(L.fx); } }
  }
  // low-passes shared by every voice of a layer with the same cutoff (one filter per timbre, not per note):
  // the dry path into the layer, and the reverb send at a given level (fx) or reverb-only (wet)
  _cut(L, f, send) {
    const k = f + ':' + send;
    if (!L.cuts[k]) {
      const b = this._f('lowpass', f, 0.5);
      if (send === 'dry') b.connect(L.in);
      else if (send === 'wet') b.connect(L.fx);
      else { const g = this._g(send); b.connect(g); g.connect(L.fx); L.nodes.push(g); }
      L.cuts[k] = b; L.nodes.push(b);
    }
    return L.cuts[k];
  }
  _adsr(g, t, a, pk, dur, rel) {
    const p = g.gain, h = Math.max(dur, a);
    p.setValueAtTime(0, t); p.linearRampToValueAtTime(pk, t + a); p.setValueAtTime(pk, t + h); p.linearRampToValueAtTime(0, t + h + rel);
    return t + h + rel;
  }
  _perc(g, t, pk, dec, a = 0.004) {
    const p = g.gain; p.setValueAtTime(0, t); p.linearRampToValueAtTime(pk, t + a); p.exponentialRampToValueAtTime(0.0001, t + a + dec);
    return t + a + dec;
  }

  // ---- sample voices -----------------------------------------------------------------------------
  // one recorded note: pitch-shifted from the nearest sample, looped between its crossfaded loop points when it
  // is a sustain, enveloped, low-passed (shared per layer), panned, with a reverb send; tracked like every source
  _smp(L, inst, midi, t, dur, o = {}) {
    const s = this.bank.nearest(inst, midi);
    if (!s || !this._room(1, o.prio ?? 1)) return null;
    const rate = Math.pow(2, (midi - s.m - s.c / 100) / 12);
    const src = this.ctx.createBufferSource(); src.buffer = s.buf; src.playbackRate.value = rate;
    const att = o.att ?? 0.01, rel = o.rel ?? 1, pk = o.gain ?? 0.1, g = this._g(0), p = g.gain;
    let end;
    if (s.ls != null) {
      src.loop = true; src.loopStart = s.ls; src.loopEnd = s.le;
      end = this._adsr(g, t, att, pk, dur, rel) + 0.05;
    } else {
      const natural = (s.buf.duration - (o.offset || 0)) / rate, hold = Math.max(att + 0.05, dur);
      end = Math.min(t + natural, t + hold + rel) + 0.02;
      p.setValueAtTime(0, t); p.linearRampToValueAtTime(pk, t + att); p.setValueAtTime(pk, Math.max(t + att, Math.min(t + hold, end - 0.3))); p.linearRampToValueAtTime(0, end);
    }
    src.connect(g);
    src.start(t, o.offset || 0); src.stop(end);
    L.v.push({ s: src, e: end }); this._nv++;
    const n = this._pan(g, o.pan ?? 0), cut = o.cut || 2400;
    if (o.wet) { n.connect(this._cut(L, cut, 'wet')); return src; }
    n.connect(this._cut(L, cut, 'dry'));
    const fx = Math.round((o.fx ?? 0.3) * 100) / 100;
    if (fx > 0) n.connect(this._cut(L, cut, fx));
    return src;
  }
  _strings(m) { return m >= 57 ? 'vln' : m >= 48 ? 'vla' : 'vc'; }
  // the voices the moods call (the calm orchestral palette)
  vPad(L, t, notes, dur, o = {}) {
    const melodic = notes.length === 1 && (o.att ?? 1) < 1;
    const att = melodic ? Math.max(0.4, (o.att ?? 0.3) * 1.6) : Math.max(1.8, (o.att ?? Math.min(3, dur * 0.35)) * 1.3);
    const rel = melodic ? Math.max(1.0, (o.rel ?? 0.5) * 2) : Math.max(3, (o.rel ?? 2.5) * 1.4);
    if (!this._room(notes.length, o.prio ?? 2)) return;
    const each = (o.gain ?? 0.09) * (melodic ? 2.6 : 2.2) / Math.sqrt(notes.length);
    notes.forEach((m, k) => {
      const inst = melodic ? (m < 55 ? 'vc' : 'vla') : this._strings(m);
      const pan = notes.length > 1 ? (k / (notes.length - 1) - 0.5) * 0.8 : (o.pan ?? 0);
      this._smp(L, inst, m, t + k * 0.03, dur, { att, rel, gain: each, pan, fx: o.fx ?? 0.35, cut: STR_CUT[inst], offset: 0.12, prio: o.prio ?? 2 });
    });
  }
  vSub(L, t, f, dur, o = {}) {
    const m = ftom(f);
    this._smp(L, m < 36 ? 'cb' : 'vc', m, t, dur, { att: Math.max(1.5, (o.att ?? 2) * 1.2), rel: Math.max(2.5, (o.rel ?? 3) * 1.2),
      gain: (o.gain ?? 0.07) * 2.2, cut: 900, fx: 0.2, offset: 0.15, prio: 2 });
  }
  vBass(L, t, f, dur, o = {}) {
    const m = ftom(f);
    this._smp(L, m < 36 ? 'cb' : 'vc', m, t, dur, { att: 0.12, rel: 0.6, gain: (o.gain ?? 0.08) * 1.4, cut: 900, fx: 0.2, prio: 2 });
  }
  // bells, marimba, glass, e-piano figures -> harp (sparser inside per-step figures)
  vFm(L, t, f, dur, o = {}) {
    if (this._inStep && !chance(0.35)) return;
    if ((o.prio ?? 0) === 0 && !chance(0.7)) return;
    let m = ftom(f); while (m > 84) m -= 12;
    this._smp(L, 'hp', m, t, dur * 1.3 + 1, { att: 0.004, rel: 1.5, gain: (o.gain ?? 0.03) * 3.2, cut: 2200, fx: 0.6, pan: o.pan ?? 0, prio: o.prio ?? 0 });
  }
  vPluck(L, t, f, dur, o = {}) {
    if (this._inStep && !chance(0.35)) return;
    let m = ftom(f); while (m > 81) m -= 12;
    this._smp(L, 'hp', m, t, dur * 1.3 + 1, { att: 0.004, rel: 1.5, gain: (o.gain ?? 0.04) * 3.2, cut: 2200, fx: o.fx ?? 0.5, pan: o.pan ?? 0, prio: o.prio ?? 1 });
  }
  vFlute(L, t, f, dur, o = {}) {
    let m = ftom(f); while (m > 84) m -= 12; while (m < 60) m += 12;
    this._smp(L, 'fl', m, t, Math.max(0.3, dur), { att: Math.max(0.15, o.att ?? 0.08), rel: Math.max(0.8, o.rel ?? 0.35), gain: (o.gain ?? 0.04) * 3,
      cut: 2400, fx: (o.fx ?? 0.4) + 0.1, pan: o.pan ?? 0, offset: 0.05, prio: o.prio ?? 1 });
  }
  vBrass(L, t, notes, dur, o = {}) {
    if (!this._room(notes.length, 2)) return;
    for (const m0 of notes) {
      let m = m0; while (m > 65) m -= 12; while (m < 43) m += 12;
      this._smp(L, 'hn', m, t, dur, { att: Math.max(1, o.att ?? 0.035), rel: Math.max(1.5, o.rel ?? 0.3), gain: (o.gain ?? 0.15) * 1.3 / Math.sqrt(notes.length),
        cut: 1400, fx: (o.fx ?? 0.4) + 0.2, offset: 0.1, prio: 2 });
    }
  }
  vChoir(L, t, notes, dur, o = {}) {
    if (o.solo) return this.vFlute(L, t, mtof(notes[0]), dur, { att: 0.4, rel: 1.2, gain: (o.gain ?? 0.05) * 0.8, fx: 0.6 });
    this.vPad(L, t, notes, dur, { att: o.att ?? 3, rel: o.rel ?? 3, gain: (o.gain ?? 0.1) * 0.9, fx: o.fx ?? 0.5 });
  }
  vDrop(L, t, f, o = {}) {
    if (this._inStep && !chance(0.4)) return;
    this._smp(L, 'hp', fold(ftom(f), 72), t, 1.5, { att: 0.004, rel: 1, gain: (o.gain ?? 0.03) * 1.6, cut: 2200, fx: 0.8, pan: o.pan ?? 0, prio: 0 });
  }
  // shimmer: very quiet high violins (root + fifth) swelling into the reverb only
  vShimmer(L, t, dur) {
    if (!chance(0.5) || !this._room(2, 0)) return;
    for (const m of [fold(L.h.root, 79), fold(L.h.root + 7, 79)]) {
      this._smp(L, 'vln', m, t, dur * 0.5, { att: dur * 0.35, rel: dur * 0.4, gain: 0.02, cut: 2400, wet: true, offset: 0.2, prio: 0 });
    }
  }

  // ---- synthesized ambience voices ---------------------------------------------------------------
  // filtered noise swells / rustles (wind, surf, stream, rain); percussive noise is not used
  vNoise(L, t, dur, o = {}) {
    if (!o.shape) return;
    let type = o.type || 'bandpass', f0 = o.f0 ?? 1000, q = Math.min(o.q ?? 1, 1.5), pk = (o.gain ?? 0.03) * 0.42;
    if (type === 'highpass') { type = 'bandpass'; f0 = 1100; q = 0.5; pk *= 0.8; }
    f0 = Math.min(f0, 1800);
    const f1 = o.f1 ? Math.min(o.f1, 1600) : null;
    if (o.shape === 'rustle') pk *= 0.7;
    if (!this._room(1, o.prio ?? 0)) return;
    const g = this._g(0), p = g.gain;
    p.setValueAtTime(0, t);
    if (o.shape === 'swell') { p.linearRampToValueAtTime(pk, t + dur * (o.peakAt ?? 0.5)); p.linearRampToValueAtTime(0, t + dur); }
    else {
      let x = t;
      for (;;) { const nx = x + 0.04 + rnd() * 0.18; if (nx >= t + dur - 0.05) break; x = nx; p.linearRampToValueAtTime(pk * (0.15 + rnd() * 0.85), x); }
      p.linearRampToValueAtTime(0, t + dur);
    }
    const end = t + dur + 0.05, s = this._n(L, t, end), fl = this._f(type, f0, q);
    if (f1) {
      fl.frequency.setValueAtTime(f0, t); fl.frequency.exponentialRampToValueAtTime(f1, t + dur * (o.fAt ?? 1));
      if (o.fBack && (o.fAt ?? 1) < 1) fl.frequency.exponentialRampToValueAtTime(f0, t + dur);
    }
    s.connect(fl); fl.connect(g);
    if (o.pan1 != null && this.ctx.createStereoPanner) {
      const pn = this.ctx.createStereoPanner(); pn.pan.setValueAtTime(o.pan ?? 0, t); pn.pan.linearRampToValueAtTime(o.pan1, t + dur);
      g.connect(pn); this._out(L, pn, o.fx ?? 0, 0);
    } else this._out(L, g, o.fx ?? 0, o.pan ?? 0);
  }
  // distant birdsong: soft sine glides, no trill
  vChirp(L, t, sp) {
    if (this._inStep && !chance(0.4)) return;
    if (!this._room(1, 0)) return;
    const f = Math.min(sp.f, 2400) * 0.8, gain = sp.gain * 0.28;
    const n = sp.n + (chance(0.3) ? 1 : 0), per = sp.syl + sp.gap, end = t + n * per + 0.05;
    const o = this._o(L, 'sine', f, t, end), g = this._g(0), fr = o.frequency, p = g.gain;
    p.setValueAtTime(0, t);
    for (let k = 0; k < n; k++) {
      const ts = t + k * per, up = sp.dir > 0 || (sp.dir === 0 && k % 2 === 0), f0 = f * (0.94 + rnd() * 0.12) * (up ? 0.8 : 1.3);
      fr.setValueAtTime(f0, ts); fr.exponentialRampToValueAtTime(f0 * (up ? 1.55 : 0.62), ts + sp.syl);
      p.setValueAtTime(0, ts); p.linearRampToValueAtTime(gain, ts + sp.syl * 0.3); p.linearRampToValueAtTime(0, ts + sp.syl);
    }
    o.connect(g); this._out(L, g, 0.6, sp.pan + (rnd() - 0.5) * 0.3);
  }
  // a long impact becomes a soft low swell (short thumps are not used)
  vThump(L, t, f0, f1, dec, o = {}) {
    if (dec < 2 || !this._room(1, o.prio ?? 1)) return;
    const g = this._g(0), end = this._adsr(g, t, 0.8, (o.gain ?? 0.2) * 0.4, dec * 0.4, dec) + 0.05;
    this._o(L, 'sine', Math.max(40, f1 * 1.5), t, end).connect(g); this._out(L, g, 0.6, 0);
  }
}
