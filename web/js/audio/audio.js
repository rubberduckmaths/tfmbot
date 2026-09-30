// audio.js -- the game's sound. SFX are synthesized with WebAudio (card swish, tile thump, TR chime, UI tick...).
// The music is an orchestral score played from recorded samples (VSCO 2: Community Edition, CC0):
//   music_score.js   thirteen tracks, each with its own written theme, played through an arc from a solo instrument
//                    to full strings, brass chorale and a key lift and back; terraforming (setTerraform) picks the
//                    tracks (barren / green) and shapes each arc as it plays
//   music_moods.js   short colour layers over the track for card / tile events (mood(name), moodForCard/Tile)
//   music_engine.js  the scheduler, layers, voice budget and voices
//   music_bank.js    the samples (assets/music/*.flac), fetched in the background only once the page is idle and
//                    only while the music is on; the music stays silent until the first ones are decoded
// The music sits under the SFX (MUS_GAIN); stopMusic() silences and stops everything within ~1 s.
import { MusicEngine, clamp } from './music_engine.js';
import { TRACKS } from './music_score.js';
import { MOODS } from './music_moods.js';
import { SampleBank } from './music_bank.js';
export { moodForCard, moodForTile } from './music_moods.js';

const MUS_GAIN = 0.9;       // music bus gain per unit of the volume slider (ambience sits under the SFX)
const ORCH_TRIM = 1.18;     // the orchestra's level relative to the music bus (set by in-game mean loudness)
// phones and low-core machines: a smaller voice budget, shorter reverb, thinner climaxes
const LITE = typeof navigator !== 'undefined' && ((navigator.hardwareConcurrency || 8) <= 4 || !!(typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches));
const bank = new SampleBank();

export class Audio {
  constructor() {
    this.ctx = null;
    this.musicVol = +(localStorage.getItem('musicVol') ?? 35) / 100;
    this.sfxVol = +(localStorage.getItem('sfxVol') ?? 70) / 100;
    this.musicOn = localStorage.getItem('musicOn') !== '0';
    this.musicRunning = false;
    this.music = null; this._tf = 0;
    if (this.musicOn) bank.resume();   // background: waits for the page to load and go idle; decoding needs no gesture
  }

  // must be called from a user gesture
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    const ctx = this.ctx = new C();
    this.master = ctx.createGain(); this.master.gain.value = 0.9; this.master.connect(ctx.destination);
    this.comp = ctx.createDynamicsCompressor(); this.comp.threshold.value = -18; this.comp.connect(this.master);
    this.sfx = ctx.createGain(); this.sfx.gain.value = this.sfxVol; this.sfx.connect(this.comp);
    // the SFX reverb returns through this (music-level) bus
    this.mus = ctx.createGain(); this.mus.gain.value = 0;
    this.musLp = ctx.createBiquadFilter(); this.musLp.type = 'lowpass'; this.musLp.frequency.value = 3500; this.musLp.Q.value = 0.5;
    this.mus.connect(this.musLp); this.musLp.connect(this.comp);
    this.reverb = ctx.createConvolver(); this.reverb.buffer = this.impulse(6.5, 2.2);
    this.revOut = ctx.createGain(); this.revOut.gain.value = 0.9;
    this.reverb.connect(this.revOut); this.revOut.connect(this.mus);
    this.sfxRev = ctx.createGain(); this.sfxRev.gain.value = 0.25; this.sfxRev.connect(this.reverb);
    this.noiseBuf = this.makeNoise();
    this.music = new MusicEngine(ctx, this.comp, bank, TRACKS, MOODS, this.noiseBuf, LITE);
    if (this.musicOn) this.startMusic();
  }

  impulse(sec, decay) {
    const ctx = this.ctx, len = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return b;
  }
  makeNoise() {
    const b = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  setSfx(v) { this.sfxVol = v; localStorage.setItem('sfxVol', Math.round(v * 100)); if (this.sfx) this.sfx.gain.value = v; }
  setMusic(v) {
    this.musicVol = v; localStorage.setItem('musicVol', Math.round(v * 100));
    if (this.mus && this.musicOn && this.musicRunning) this._musicLevel(v * MUS_GAIN, 0.3);
  }
  toggleMusic() {
    this.musicOn = !this.musicOn;
    localStorage.setItem('musicOn', this.musicOn ? '1' : '0');
    if (!this.ctx) { if (this.musicOn) bank.resume(); else bank.pause(); return this.musicOn; }
    if (this.musicOn) this.startMusic(); else this.stopMusic();
    return this.musicOn;
  }

  // ---- sfx --------------------------------------------------------------------
  noise(dur, f0, f1, q, gain, when = 0, dest = this.sfx) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = q;
    bp.frequency.setValueAtTime(f0, t); bp.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + dur * 0.25); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(bp); bp.connect(g); g.connect(dest);
    src.start(t, Math.random()); src.stop(t + dur + 0.05);
  }
  tone(freq, dur, type = 'sine', gain = 0.2, when = 0, dest = this.sfx, attack = 0.005) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
    return o;
  }
  card() { this.noise(0.22, 5200, 1400, 0.9, 0.35); this.noise(0.06, 3000, 2500, 2, 0.15, 0.17); }
  deal(n = 3) { for (let i = 0; i < n; i++) this.noise(0.16, 4800, 1600, 1, 0.22, i * 0.09); }
  tick() { this.tone(1800, 0.05, 'triangle', 0.06); }
  place() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.35);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.55, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    o.connect(g); g.connect(this.sfx); o.start(t); o.stop(t + 0.5);
    this.noise(0.5, 900, 200, 0.7, 0.3, 0.02);
    this.noise(0.9, 600, 150, 0.5, 0.12, 0.05, this.sfxRev);
  }
  water() { this.noise(0.9, 800, 2600, 0.6, 0.18); this.noise(1.2, 400, 1200, 0.5, 0.12, 0.2, this.sfxRev); }
  chime(n = 1) {
    const base = [659.25, 783.99, 987.77, 1318.5];
    for (let i = 0; i < Math.min(n, 4); i++) {
      this.tone(base[i], 1.6, 'sine', 0.12, i * 0.09);
      this.tone(base[i] * 2.01, 0.9, 'sine', 0.04, i * 0.09);
      this.tone(base[i], 1.8, 'sine', 0.05, i * 0.09, this.sfxRev);
    }
  }
  coin() { this.tone(1567, 0.12, 'square', 0.03); this.tone(2093, 0.25, 'square', 0.03, 0.06); }
  turn() { this.tone(440, 0.4, 'sine', 0.08); this.tone(660, 0.6, 'sine', 0.07, 0.12); this.tone(660, 0.8, 'sine', 0.05, 0.12, this.sfxRev); }
  bad() { this.tone(180, 0.25, 'sawtooth', 0.05); }
  boom() { this.noise(1.4, 1400, 50, 0.7, 0.45); this.tone(62, 1.1, 'sine', 0.3); this.tone(41, 1.6, 'sine', 0.22, 0.05); }
  fanfare() { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => { this.tone(f, 2.2, 'triangle', 0.1, i * 0.14); this.tone(f, 2.5, 'sine', 0.06, i * 0.14, this.sfxRev); }); }

  // ---- music ---------------------------------------------------------------------------------
  get currentMood() { return this.music ? this.music.currentMood : null; }
  get currentTrack() { return this.music ? this.music.currentTrack : null; }
  // both music buses follow the volume: the orchestra's, and the one the SFX reverb returns through
  _musicLevel(v, tc) {
    const now = this.ctx.currentTime;
    for (const [p, x] of [[this.mus.gain, v], [this.music.vol.gain, v * ORCH_TRIM]]) { p.cancelScheduledValues(now); p.setValueAtTime(p.value, now); p.setTargetAtTime(x, now, tc); }
  }
  startMusic() {
    if (!this.ctx) return;
    this._musicLevel(this.musicVol * MUS_GAIN, 1.5);
    if (this.musicRunning) return;
    this.musicRunning = true;
    this.music.setTerraform(this._tf);
    this.music.start();
  }
  // silence within ~1 s, stop every source and all scheduling (and pause sample loading)
  stopMusic() {
    if (!this.ctx) return;
    this._musicLevel(0, 0.18);
    if (!this.musicRunning) return;
    this.musicRunning = false;
    this.music.stop();
  }
  // reactive mood layer: nature|city|space|impact|water|science (falsy = no-op); opts.hold / opts.fadeIn
  mood(name, opts = {}) {
    if (!this.ctx || !this.musicOn || !this.musicRunning) return false;
    return this.music.mood(name, opts);
  }
  // hand back to the base track early
  endMood(fade = 5) { if (this.music) this.music.endMood(fade); }
  // terraforming progress 0..1 from the raw globals: picks the tracks and shapes each arc
  setTerraform(temp, oxy, oceans) {
    this._tf = clamp(((temp + 30) / 38 + oxy / 14 + oceans / 9) / 3, 0, 1);
    if (this.music) this.music.setTerraform(this._tf);
  }
  // crossfade to another track now (by terraforming stage if name is omitted / unknown)
  nextTrack(name, fade = 8) { if (this.music && this.musicRunning) this.music.nextTrack(name, fade); }
}
