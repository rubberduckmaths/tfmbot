// shared.js -- what the App modules share: URL options and settings, player colours, the animation
// pacing (pace / sleep / dur), display-name helpers, the anomaly report and the loading screen.
import { has as tHas, isEnglish, t, tName } from '../i18n.js';
import { bootMessages } from './bootmsgs.js';
import { $ } from '../dom.js';
import { CRIT } from './content.js';

// player colours by ROLE: the human is always blue, TFMBot always orange
export const BLUE = '#3fb6ff', ORANGE = '#ff6a3d';
export const PCOL = [BLUE, ORANGE];     // (reordered in place when the human takes the second seat: present)

export const Q = new URLSearchParams(location.search);
export const FAST = Q.has('fast');
// ?replay=<id>: watch a recorded game (replay/replay.js); no game worker, nothing saved
export const REPLAY = Q.has('replay') ? (Q.get('replay') || '') : null;
// Settings > Tiles: the standard tileset (the default: grown forests, the classic skyline -- Domed Crater, Tharsis Republic and
// the special tiles keep their looks) or the varied one (a look per placing card, forests by terraforming stage); ?tiles= overrides
export const VARIED_TILES = (() => { const q = Q.get('tiles'); if (q === 'varied' || q === 'standard') return q === 'varied'; if (Q.has('gallery')) return true; try { return localStorage.getItem('tileset') === 'varied'; } catch { return false; } })();
// Settings > Board view: the flat 2D map (board/board2d.js) or the 3D globe; ?board=2d|3d overrides for this page. Until the
// player picks one: phones get the 2D map (touch-first, small screen), everything else the globe. (A browser that cannot
// create a WebGL2 context gets the 2D map whatever this says: App's constructor)
export const BOARD_2D_PREF = (() => { const q = Q.get('board'); if (q === '2d' || q === '3d') return q === '2d'; let s = null; try { s = localStorage.getItem('boardView'); } catch {} if (s === '2d' || s === '3d') return s === '2d'; return matchMedia('(pointer: coarse)').matches && Math.min(innerWidth, innerHeight) <= 600; })();
// Settings > Animation speed: live play's waits, fly-bys, reveal trays and counters
// run at this fraction of their normal time (0: instant). A replay keeps its own speed control (pace.scale there)
export const ANIM_SPEEDS = { slow: 1.6, normal: 1, fast: 0.6, vfast: 0.35, instant: 0 };
export const lsPick = (key, table, dflt) => { let s = null; try { s = localStorage.getItem(key); } catch {} return s != null && Object.hasOwn(table, s) ? s : dflt; };
// Settings > Card size: the hand's cards [hand scale, dialog / zoom / reveal scale]
export const CARD_SIZES = { xs: [0.68, 0.8], small: [0.82, 0.9], normal: [1, 1], large: [1.2, 1.12], xl: [1.42, 1.25] };
// the tableau's view: full cards, a stack per column showing each card's top strip, or a dense list of
// names (to see it all at once) -- the header's switch, remembered
export const TB_VIEWS = { cards: 'tab.viewCards', stack: 'tab.viewStack', names: 'tab.viewNames' };
export const STACK_N = 6;   // cards per stacked column (a colour with more gets more, balanced, columns)
// animation waits. pace (replays): scale = 1 / playback speed; flush() ends every wait in
// flight at once (a seek finishes the step being shown without showing it); epoch counts flushes.
// Live play: scale = anim, the animation speed setting
export const pace = { scale: 1, skip: false, epoch: 0, wake: new Set(), anim: REPLAY == null ? ANIM_SPEEDS[lsPick('animSpeed', ANIM_SPEEDS, 'normal')] : 1 };
pace.scale = pace.anim;
// a CSS / Web Animations duration at the live animation speed (?fast keeps its own timings)
export const dur = (ms) => (FAST ? ms : ms * pace.anim);
export const sleep = (ms) => new Promise((r) => {
  if (pace.skip) return r();
  const done = () => { pace.wake.delete(done); clearTimeout(id); r(); };
  const id = setTimeout(done, FAST ? ms * 0.02 : ms * pace.scale);
  pace.wake.add(done);
});
pace.sleep = sleep;
pace.flush = () => { pace.skip = true; pace.epoch++; for (const f of [...pace.wake]) f(); };
// shown names (the English ones stay the keys the game logic compares)
export const spName = (i) => t(`sp.${i}.name`);
export const maName = (n) => tName('ma.', n);                  // milestone / award
export const critName = (c) => (tHas('crit.' + c) ? t('crit.' + c) : CRIT[c] || c);
export const spaceName = (n) => tName('space.', n);
export const resName = (r) => t('res.' + r);                   // 0..5: M€ steel titanium plants energy heat
export const cresName = (key, n) => t('cres.' + key, { n });   // a card resource word, by count
export const signed = (d) => `${d > 0 ? '+' : '−'}${Math.abs(d)}`;
// status lines the worker sends, by their English text
export const WORKER_MSG = { 'TFMBot is unreachable — retrying…': 'status.unreachable', 'TFMBot is considering your options…': 'status.considering', 'TFMBot is thinking…': 'status.thinking' };

// problems worth a human look go to the server's anomaly log
const reported = new Set();
// crawlers that execute the page (Bingbot, link previews, '(compatible; ...)' agents) file no anomaly reports
const CRAWLER = /bot|crawl|spider|slurp|preview|headless|compatible;/i.test(navigator.userAgent || '');
export function report(kind, detail, extra = {}) {
  if (REPLAY != null) return;                          // (a replay re-shows a finished game: nothing new to report)
  if (CRAWLER) return;                                 // (search / preview bots run the app without a GPU or a full POST: noise)
  const key = kind + ':' + String(detail).slice(0, 120);
  if (reported.has(key)) return;
  reported.add(key);
  try { fetch(new URL('api/report', location.href), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind, detail: String(detail).slice(0, 2000), build: document.querySelector('script[type=module]')?.src, ...extra }) }).catch(() => {}); } catch {}
}

// The loading screen: a bar that always moves (eases toward ~90% over the
// usual load time, jumps at real milestones, then fills) and a rotating line
// of whimsy.
export const boot = {
  t0: performance.now(), frac: 0.03, floor: 0.03, done: false,
  set(f) { this.floor = Math.max(this.floor, f); },
  tick() {
    const bar = $('.boot-bar div');
    if (!bar || this.gone) return;
    const t = (performance.now() - this.t0) / 1000;
    const drift = 0.9 * (1 - Math.exp(-t / 3.5));
    this.frac += (Math.max(drift, this.floor) - this.frac) * (this.floor >= 1 ? 0.3 : 0.1);   // fills quickly once loaded
    bar.style.width = `${(Math.min(1, this.frac) * 100).toFixed(1)}%`;
    requestAnimationFrame(() => this.tick());
  },
  start() {
    const msg = $('.boot-msg');
    const lines = bootMessages();
    const order = lines.map((m, i) => [Math.random(), i]).sort((a, b) => a[0] - b[0]).map(([, i]) => lines[i]);
    let i = 0;
    if (msg && (!msg.textContent.trim() || msg.textContent.trim() === '…' || !isEnglish())) msg.textContent = order[0];     // the page already picked a first line (English only)
    // a new line every ~5 s. The text is swapped FIRST and then faded in by a CSS animation
    // (compositor-driven): a fade-out -> setTimeout -> swap would leave the line invisible for
    // seconds whenever shader compiles block the main thread
    this.timer = setInterval(() => {
      if (!msg || this.gone) return clearInterval(this.timer);
      msg.textContent = order[++i % order.length];
      msg.classList.remove('in'); void msg.offsetWidth; msg.classList.add('in');
    }, 5200);
    requestAnimationFrame(() => this.tick());
  },
  finish() { this.set(1); setTimeout(() => { this.gone = true; clearInterval(this.timer); }, 1200); },
};

export const RES_BEAT = 1500;      // ms from a move's card fly-by / cost float to its resource counters changing (so the change is seen)
export const PMARK_MS = 8000;      // how long a production change's badge lingers on the player's production box
