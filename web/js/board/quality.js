// quality.js -- graphics quality (High / Medium / Low, default Auto) and the
// ?stats overlay.
//
// Levels only thin the decoration: tile icons, owner markers, labels, card
// text and every game fact are drawn the same at all three. What each level
// changes is read where it is used (board3d.js, space_fx.js, board/tiles/,
// cards/card_art.js, app.css via <html data-gfx>):
//   high    the full look
//   medium  pixel ratio <= 1.5, 2048 tile shadow map updated every other
//           frame, fewer Milky Way stars / orbit ships / comets, card art
//           painted when the browser is idle, softer UI blur
//   low     pixel ratio <= 1.25, no terrain cast shadows, 1024 tile shadow
//           map updated only when something moves, a sparse Milky Way, 3 ships,
//           no comets, forests without undergrowth, no mist or birds, no card
//           art, no UI glass blur / sheen
//
// Auto (the default) starts from a device guess (coarse pointer, deviceMemory,
// hardwareConcurrency), then watches the real frames once the board is on
// screen and its shaders are compiled (begin(), called from app/): a first 3 s window after a 2.5 s settle (the warm-up benchmark),
// then every 5 s -- whenever the median frame time of a window is above 28 ms
// it steps down one level (and remembers that for this device). It never steps up by itself;
// picking a level in the settings (or ?quality=high|medium|low|auto, not
// saved) overrides it.
//
// ?stats: a small overlay with renderer.info (draw calls, triangles, points,
// programs, geometries, textures), fps and frame times, plus a console note
// whenever a shader program is compiled after start-up (markWarm(), called
// once the prewarms have run): a lazy compile mid-game is a hitch.
export const LEVELS = ['low', 'medium', 'high'];
const RANK = { low: 0, medium: 1, high: 2 };
const KEY = 'gfx', AUTO_KEY = 'gfxAuto';
const SLOW_MS = 28;                  // median frame time that counts as "not smooth"
const WINDOW_MS = 5000;              // ... over this long
const WARM_MS = 2500;                // frames right after start are compile / upload hitches: ignored
const FIRST_MS = 3000;               // the first window (the warm-up benchmark) is shorter

const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* private mode */ } };

// what the device suggests before any frame has been timed
export function deviceGuess() {
  let coarse = false;
  try { coarse = matchMedia('(pointer: coarse)').matches; } catch { /* old browsers */ }
  const mem = navigator.deviceMemory || 0, cores = navigator.hardwareConcurrency || 0;
  if ((mem && mem <= 2) || (cores && cores <= 2)) return 'low';
  if ((mem && mem <= 4) || (cores && cores <= 4)) return 'medium';
  if (coarse && !(mem >= 6 && cores >= 8)) return 'medium';
  return 'high';
}
// a learned auto level is only reused on the same kind of screen
function deviceSig() { return `${screen.width}x${screen.height}@${devicePixelRatio}`; }

class Quality {
  constructor() {
    let q = null;
    try { q = new URLSearchParams(location.search).get('quality'); } catch { /* no location */ }
    this.forced = LEVELS.includes(q) || q === 'auto' ? q : null;          // URL override, never saved
    const saved = lsGet(KEY);
    this.setting = this.forced || (LEVELS.includes(saved) ? saved : 'auto');
    this.listeners = [];
    this.times = [];                 // [t, ms] frame intervals of the current window
    this.t0 = performance.now();
    this.started = false;            // begin(): the game is on screen (loading-screen frames say nothing)
    this.level = this.setting === 'auto' ? this.autoStart() : this.setting;
    this.applyDom();
    try { document.addEventListener('visibilitychange', () => { this.skip = true; }); } catch { /* no DOM */ }
    try { this.stats = new URLSearchParams(location.search).has('stats'); } catch { this.stats = false; }
  }
  autoStart() {
    const guess = deviceGuess();
    const [lv, sig] = String(lsGet(AUTO_KEY) || '').split('|');
    if (!this.forced && LEVELS.includes(lv) && sig === deviceSig() && RANK[lv] < RANK[guess]) return lv;
    return guess;
  }
  // the board is on screen -- the warm-up benchmark starts now
  begin() {
    if (this.started) return;
    this.started = true;
    this.t1 = performance.now();
    this.times = [];
    this.nextCheck = this.t1 + WARM_MS + FIRST_MS;
  }
  get rank() { return RANK[this.level]; }
  get high() { return this.level === 'high'; }
  get low() { return this.level === 'low'; }
  // pick a value per level: pick(low, medium, high)
  pick(lo, mid, hi) { return this.level === 'low' ? lo : this.level === 'medium' ? mid : hi; }
  onChange(fn) { this.listeners.push(fn); }

  // the settings menu: 'auto' | 'high' | 'medium' | 'low' (saved)
  choose(setting) {
    if (setting !== 'auto' && !LEVELS.includes(setting)) return;
    this.setting = setting;
    this.forced = null;
    lsSet(KEY, setting === 'auto' ? null : setting);
    if (setting === 'auto') { lsSet(AUTO_KEY, null); this.setLevel(deviceGuess()); }
    else this.setLevel(setting);
    this.times = []; this.nextCheck = performance.now() + WARM_MS + WINDOW_MS;
    this.t1 = performance.now();
  }
  setLevel(lv) {
    if (lv === this.level) return;
    this.level = lv;
    this.applyDom();
    for (const f of this.listeners) { try { f(lv); } catch (e) { console.warn('gfx listener', e); } }
  }
  applyDom() { try { document.documentElement.dataset.gfx = this.level; } catch { /* no DOM */ } }

  // every rendered frame (board3d.js frame()): ms since the previous one.
  // Returns true when auto just stepped down.
  frame(now, ms) {
    if (this.stats) this.statFrame(now, ms);
    if (!this.started) { if (now - this.t0 > 30000) this.begin(); return false; }   // (in case nobody calls begin)
    if (document.hidden || this.skip) { this.skip = false; this.times = []; this.nextCheck = Math.max(this.nextCheck, now + WINDOW_MS); return false; }   // back from a hidden tab: start the window over
    if (now - this.t1 < WARM_MS) return false;
    this.times.push(ms);
    if (now < this.nextCheck || this.times.length < 5) return false;
    const med = median(this.times);
    this.times = [];
    this.nextCheck = now + WINDOW_MS;
    if (this.setting !== 'auto' || med <= SLOW_MS || this.level === 'low') return false;
    const to = LEVELS[this.rank - 1];
    lsSet(AUTO_KEY, `${to}|${deviceSig()}`);
    console.info(`[gfx] auto: median frame ${med.toFixed(1)} ms over ${WINDOW_MS / 1000} s -> ${to}`);
    this.setLevel(to);
    return true;
  }

  // ---------------------------------------------------------------- ?stats
  statFrame(now, ms) {
    const s = this.st ||= { ring: new Float32Array(120), n: 0, next: 0, el: null, progs: 0, cpu: {} };
    s.ring[s.n++ % s.ring.length] = ms;
    const progs = this.renderer?.info.programs?.length || 0;
    if (this.warmAt != null && s.n > this.warmAt && progs > s.progs) {
      const fresh = this.renderer.info.programs.slice(s.progs);
      console.info('[gfx] program compiled after warm-up:', fresh.map((p) => p.name || p.cacheKey?.slice(0, 60)).join(' | '));
    }
    if (this.renderer) s.progs = progs;
    if (now < s.next || !this.renderer) return;
    s.next = now + 500;
    const r = this.renderer, info = r.info, cnt = Math.min(s.n, s.ring.length);
    const arr = Array.from(s.ring.subarray(0, cnt));
    const med = median(arr), fps = cnt ? 1000 / (arr.reduce((a, b) => a + b, 0) / cnt) : 0;
    const cpu = Object.entries(s.cpu).map(([k, v]) => `${k} ${v.toFixed(2)}`).join('  ');
    if (!s.el) {
      s.el = document.createElement('div');
      s.el.id = 'gfx-stats';
      s.el.style.cssText = 'position:fixed;left:6px;bottom:6px;z-index:9999;pointer-events:none;font:11px/1.35 ui-monospace,monospace;color:#cfe;background:rgba(0,0,0,.66);padding:4px 7px;border-radius:5px;white-space:pre';
      document.body.appendChild(s.el);
    }
    const k = (x) => (x >= 1e6 ? (x / 1e6).toFixed(2) + 'M' : x >= 1e3 ? (x / 1e3).toFixed(1) + 'k' : String(x));
    s.el.textContent = `${this.setting === 'auto' ? 'auto→' : ''}${this.level}  ${fps.toFixed(0)} fps  ${med.toFixed(1)} ms  pr ${r.getPixelRatio().toFixed(2)}\n`
      + `calls ${info.render.calls}  tris ${k(info.render.triangles)}  pts ${k(info.render.points)}  lines ${info.render.lines}\n`
      + `prog ${progs}  geo ${info.memory.geometries}  tex ${info.memory.textures}` + (cpu ? `\ncpu ms  ${cpu}` : '');
  }
  // start-up is over (the prewarms ran): later program compiles are reported (?stats)
  markWarm() { this.warmAt = (this.st?.n || 0) + 3; }
  // ?stats: time a part of the frame (exponentially smoothed ms)
  cpu(name, ms) { if (this.st) this.st.cpu[name] = (this.st.cpu[name] ?? ms) * 0.9 + ms * 0.1; }
}

function median(a) {
  if (!a.length) return 0;
  const s = Array.from(a).sort((x, y) => x - y);
  return s[s.length >> 1];
}

export const gfx = new Quality();
