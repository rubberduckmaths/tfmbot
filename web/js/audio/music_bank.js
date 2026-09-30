// music_bank.js -- the orchestral samples: VSCO 2: Community Edition (Versilian Studios, CC0 1.0), prepared
// into assets/music/ (16-bit FLAC, 22.05 kHz mono, ~9.7 MB; see its README; manifest.json lists each
// note's pitch, tuning and loop points). Loading never competes with the game's boot: it starts once the page
// has loaded and gone idle (4 s after the load event, then an idle slot), only while the music is on (pause() /
// resume()), strings and the solo instruments first. Files are decoded at 22.05 kHz (half the memory of decoding at the output rate). Any failure is
// silent: that note, or the whole orchestra, is simply missing and the music stays quiet.
export const MUSIC_V = 1;   // bump whenever the samples change (assets/ is browser / edge cached)
const BASE = 'assets/music/';
// load order: [instrument, every nth sample]; the first group is what the opening of any track needs
const CORE = [['vln', 3], ['vc', 3], ['vla', 3], ['hn', 2], ['fl', 2]];
const REST = [['hp', 1], ['cb', 1], ['vln', 1], ['vc', 1], ['vla', 1], ['hn', 1], ['fl', 1], ['csp', 1], ['tbn', 1], ['tba', 1], ['tmp', 1], ['vsp', 1]];
// stand-ins while an instrument (or the note range) is not loaded yet
const FAMILY = { vln: ['vla', 'vc'], vla: ['vln', 'vc'], vc: ['vla', 'cb'], cb: ['vc'], fl: ['vln'], hn: ['vla', 'vc'],
  tbn: ['hn', 'vc'], tba: ['cb', 'vc'], csp: ['vc'], vsp: ['vln'] };

export class SampleBank {
  constructor() {
    this.buf = {}; this.ready = false; this.active = false;
    this._started = false; this._waiting = [];
  }
  resume() {
    this.active = true;
    if (!this._started) { this._started = true; this._load().catch(() => {}); }
    for (const w of this._waiting.splice(0)) w();
  }
  pause() { this.active = false; }
  // nearest loaded sample of the instrument (or a stand-in) to midi; a little down-shift is kinder than a lot up
  nearest(inst, midi) {
    for (const k of [inst, ...(FAMILY[inst] || [])]) {
      const a = this.buf[k];
      if (!a || !a.length) continue;
      let best = a[0], bs = Infinity;
      for (const s of a) { const d = midi - s.m, sc = d >= 0 ? d : -d * 1.3; if (sc < bs) { bs = sc; best = s; } }
      if (bs <= 9) return best;
    }
    return null;
  }
  async _idle() {
    if (document.readyState !== 'complete') await new Promise((r) => addEventListener('load', r, { once: true }));
    await new Promise((r) => setTimeout(r, 4000));
    await new Promise((r) => (window.requestIdleCallback ? requestIdleCallback(r, { timeout: 3000 }) : setTimeout(r, 200)));
  }
  async _gate() { while (!this.active) await new Promise((r) => this._waiting.push(r)); }
  async _load() {
    await this._idle();
    await this._gate();
    const url = (f) => new URL(BASE + f + '?v=' + MUSIC_V, document.baseURI).href;
    const man = await (await fetch(url('manifest.json'))).json();
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    let dec = null;
    try { dec = new OAC(1, 1, 22050); } catch (e) { return; }
    const decode = (ab) => new Promise((res, rej) => { const p = dec.decodeAudioData(ab, res, rej); if (p && p.catch) p.catch(rej); });
    const pickList = (groups) => {
      const out = [];
      for (const [inst, every] of groups) (man[inst] || []).forEach((e, k) => { if (every === 1 || k % every === 1 % every) out.push([inst, e]); });
      return out;
    };
    const seen = new Set(), queue = [];
    for (const [inst, e] of [...pickList(CORE), ...pickList(REST)]) if (!seen.has(e.f)) { seen.add(e.f); queue.push([inst, e, queue.length]); }
    const nCore = pickList(CORE).length;
    let done = 0, coreDone = 0;
    const worker = async () => {
      while (queue.length) {
        await this._gate();
        const job = queue.shift();
        if (!job) break;
        const [inst, e, idx] = job;
        try {
          const ab = await (await fetch(url(e.f))).arrayBuffer();
          const b = await decode(ab);
          (this.buf[inst] || (this.buf[inst] = [])).push({ m: e.m, c: e.c, ls: e.ls, le: e.le, buf: b });
          this.buf[inst].sort((x, y) => x.m - y.m);
        } catch (err) { /* this note stays missing */ }
        done++;
        if (idx < nCore && ++coreDone === nCore) this.ready = true;
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    this.ready = done > 0 && Object.keys(this.buf).length > 0;
  }
}
