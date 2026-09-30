// replay.js -- game replays: the recorder (live play) and the viewer (?replay=<id>).
//
// RECORDING. A replay is the ordered list of the views the human saw after
// each COMMITTED step -- states, never a re-simulation, so rewinds and card
// draws cannot diverge and a replay stays valid across engine releases. The
// recorder takes a copy of every 'view' message as it arrives from the worker
// (whole: both players' hands, packs and draws -- the file is uploaded only once
// the game is over, and the viewer shows it from either player's seat, redacted
// to what that player could see; recordings begun before that are redacted to the
// human's view at recording time and play from the human's seat only), drops consecutive duplicates, and on an undo drops
// exactly the views the undo took back (the worker tags each view with a
// sequence number and each undo with the first number it took back). Steps are
// kept as JSON diffs against the view before, and mirrored step by step into
// IndexedDB so a reload (a deploy reloads every open game) carries on the same
// recording; a reload that restored a different position than the last one
// recorded is marked as a cut. Thinking time is never recorded. At game over
// the replay is gzipped (CompressionStream) and posted once to /api/replay.
//
// PARTIAL RECORDINGS. A game whose recording was lost (or whose engine build
// changed mid-game) is recorded from the point this page first saw it; the upload says partial: true and the
// viewer starts there, with a note.
//
// VIEWING. ?replay=<id> boots the app without a game worker: the replay's own
// static data (cards + map) builds the board, and its views go through the
// same present() live play uses, so tiles land, cards fly, counters tick and
// the log fills. On top: a caption per move, the choices the human was offered
// with the chosen ones lit, the hexes on offer before a placement, a banner for
// milestones / awards, the victim of an attack marked, measured pacing, and a
// transport bar (previous / play / next, a scrubber with generation ticks, a
// speed control; keys: space, ←/→, shift+←/→). A seek renders the target view
// directly, after finishing (without showing) any step in flight.
import { REPLAY_FMT, REPLAY_VERSION, jdiff, jequal, redact, decodeViews, checkReplay, vhash, staticMatches, sanitizeReplay } from './replay_codec.js';
import { cardEl } from '../cards/cards.js';
import { t, tName, has as tHas } from '../i18n.js';
import { moonStateOf } from '../board/moons.js';
import { WORKER_URL } from '../paths.js';
import { $, h, esc } from '../dom.js';
import { D } from '../protocol.js';

const clone = (x) => JSON.parse(JSON.stringify(x));
export const REPLAY_ID = /^\d{4}[0-9A-Za-z]{10}$/;
export const replayUrl = (id) => new URL(`./?replay=${id}`, location.href.split('?')[0]).href;
const buildId = () => (document.querySelector('script[type=module]')?.src.match(/\/v\/([0-9a-f]{6,})\//) || [])[1] || 'dev';
const MAX_STEPS = 8000, MAX_BYTES = 24e6;          // in-memory bound (a real game is ~300 steps, ~150 KB)

// ---------------------------------------------------------------- IndexedDB
// one recording at a time: store 'steps' (key = step index), store 'meta' (key 'cur')
const store = {
  open() {
    if (this.p) return this.p;
    this.p = new Promise((res) => {
      try {
        const r = indexedDB.open('tfmweb-replay', 1);
        r.onupgradeneeded = () => { r.result.createObjectStore('steps'); r.result.createObjectStore('meta'); };
        r.onsuccess = () => res(r.result);
        r.onerror = r.onblocked = () => res(null);
      } catch { res(null); }
    });
    return this.p;
  },
  async run(mode, fn) {
    const db = await this.open();
    if (!db) return null;
    return new Promise((res) => {
      try {
        const tx = db.transaction(['steps', 'meta'], mode);
        const out = fn(tx.objectStore('steps'), tx.objectStore('meta'));
        tx.oncomplete = () => res(out && 'result' in out ? out.result : out ?? true);
        tx.onerror = tx.onabort = () => res(null);
      } catch { res(null); }
    });
  },
  async load() {
    const db = await this.open();
    if (!db) return null;
    return new Promise((res) => {
      try {
        const tx = db.transaction(['steps', 'meta'], 'readonly'), out = {};
        tx.objectStore('meta').get('cur').onsuccess = (e) => { out.meta = e.target.result; };
        tx.objectStore('steps').getAll().onsuccess = (e) => { out.steps = e.target.result; };
        tx.oncomplete = () => res(out);
        tx.onerror = tx.onabort = () => res(null);
      } catch { res(null); }
    });
  },
  reset(meta) { return this.run('readwrite', (s, m) => { s.clear(); m.put(meta, 'cur'); }); },
  meta(meta) { return this.run('readwrite', (s, m) => { m.put(meta, 'cur'); }); },
  put(i, step) { return this.run('readwrite', (s) => { s.put(step, i); }); },
  truncate(n) { return this.run('readwrite', (s) => { s.delete(IDBKeyRange.lowerBound(n)); }); },
};

// ---------------------------------------------------------------- recorder
const isStart = (v) => v.stage === 0 && v.gen <= 1 && !(v.tiles || []).length;

export class Recorder {
  constructor(app) {
    this.app = app;
    this.chain = Promise.resolve();
    this.gid = null;
    this.static = null;
    this.clear();
  }
  clear() {
    this.steps = []; this.views = []; this.seqs = [];
    this.partial = false; this.truncated = false; this.dead = false; this.bytes = 0;
    this.pendingAns = null; this.checkRestore = false; this.upP = null; this.full = true;
    this.result = new Promise((res, rej) => { this._res = res; this._rej = rej; });
    this.result.catch(() => {});
  }
  onStatic(data) { this.static = data; this.hs = vhash(data); }
  // every 'view' message from the worker, in arrival order (before present() shows it)
  onView(m) {
    if (!this.static || !m.view) return;
    let v;
    try { v = clone(m.view); } catch (e) { console.warn('replay: view not recorded', e); return; }
    const rec = { v, gid: m.gid || 'legacy', seq: m.seq, who: m.step?.who, kind: m.step?.kind, dropFrom: m.dropFrom, over: !!m.over || v.pending?.kind === D.OVER, fresh: !!m.fresh };
    this.chain = this.chain.then(() => this.handle(rec)).catch((e) => console.warn('replay recorder', e));
  }
  // the human's answer (what was chosen: setup picks, research buys...), for the next human step
  noteAnswer(msg) {
    let a = null;
    try { a = clone(msg); } catch {}
    this.chain = this.chain.then(() => { this.pendingAns = a; });
  }
  async handle(rec) {
    if (rec.gid !== this.gid) await this.begin(rec);
    if (!this.full) rec.v = redact(this.app.mask(rec.v));   // (a recording begun redacted stays redacted)
    if (rec.dropFrom != null) {
      const i = this.seqs.findIndex((q) => q != null && q >= rec.dropFrom);
      if (i >= 0) this.truncate(i);
    }
    if (rec.who !== 'human') this.pendingAns = null;
    if (this.checkRestore) {
      // a reload: the restored position should be one we recorded (normally the last)
      this.checkRestore = false;
      for (let k = this.views.length - 1; k >= Math.max(0, this.views.length - 80); k--) {
        if (!jequal(this.views[k], rec.v)) continue;
        if (k + 1 < this.views.length) this.truncate(k + 1);
        this.seqs[k] = rec.seq;
        if (rec.over) this.finish();
        return;
      }
      rec.cut = true;
      this.partial = true;
      this.saveMeta();
    }
    const last = this.views[this.views.length - 1];
    if (last && !rec.cut && jequal(last, rec.v)) { if (rec.over) this.finish(); return; }
    this.append(rec);
    if (rec.over) this.finish();
  }
  async begin(rec) {
    this.gid = rec.gid;
    this.clear();
    const saved = rec.fresh ? null : await store.load();
    if (saved?.meta?.gid === rec.gid && saved.meta.hs === this.hs && saved.steps?.length && !saved.meta.dead) {
      this.steps = saved.steps;
      this.views = decodeViews(this.steps);
      this.seqs = [];
      this.partial = !!saved.meta.partial; this.truncated = !!saved.meta.truncated; this.full = !!saved.meta.full;
      this.bytes = this.steps.reduce((n, s) => n + JSON.stringify(s).length, 0);
      this.checkRestore = true;
      if (saved.meta.uploaded) { this.upP = Promise.resolve(saved.meta.uploaded); this._res(saved.meta.uploaded); }
      return;
    }
    this.partial = !isStart(rec.v);
    await store.reset(this.meta());
  }
  meta() { return { gid: this.gid, hs: this.hs, partial: this.partial, truncated: this.truncated, dead: this.dead, full: this.full, uploaded: this.uploaded || null }; }
  saveMeta() { store.meta(this.meta()); }
  truncate(n) {
    this.steps.length = Math.min(this.steps.length, n); this.views.length = this.steps.length; this.seqs.length = Math.min(this.seqs.length, n);
    this.bytes = this.steps.reduce((s, x) => s + JSON.stringify(x).length, 0);
    store.truncate(n);
  }
  append(rec) {
    if (this.dead) return;
    const i = this.steps.length, prev = this.views[i - 1];
    const st = {};
    if (rec.who) st.who = rec.who;
    if (rec.kind != null) st.kind = rec.kind;
    if (rec.who === 'human' && this.pendingAns) st.ans = this.pendingAns;
    this.pendingAns = null;
    if (!prev || rec.cut) st.v = rec.v; else st.d = jdiff(prev, rec.v);
    if (rec.cut) st.cut = 1;
    const size = JSON.stringify(st).length;
    if (this.steps.length >= MAX_STEPS || this.bytes + size > MAX_BYTES) { this.truncated = true; this.dead = true; this.saveMeta(); return; }
    this.bytes += size;
    this.steps.push(st); this.views.push(rec.v); this.seqs[i] = rec.seq;
    store.put(i, st);
  }
  finish() {
    if (this.upP) return;
    this.upP = this.upload().then((id) => { this.uploaded = id; this.saveMeta(); this._res(id); return id; }, (e) => { console.warn('replay upload:', e.message || e); this._rej(e); });
  }
  payload() {
    const last = this.views[this.views.length - 1];
    return {
      fmt: REPLAY_FMT, v: REPLAY_VERSION, build: buildId(), created: new Date().toISOString(),
      partial: this.partial, truncated: this.truncated, human: last.human, map: last.map, ...(this.full ? { full: 1 } : {}),
      result: { winner: last.winner, tie: last.tie, gen: last.gen, vp: last.players.map((p) => p.vp.total) },
      static: this.static, steps: this.steps,
    };
  }
  async upload() {
    if (!this.steps.length || !this.static) throw new Error('nothing recorded');
    const json = JSON.stringify(this.payload());
    let body = json, type = 'application/json';
    try {
      if (typeof CompressionStream === 'function') { body = await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer(); type = 'application/octet-stream'; }
    } catch { body = json; type = 'application/json'; }
    for (let attempt = 0; attempt < 4; attempt++) {
      let r = null;
      try { r = await fetch(new URL('api/replay', location.href), { method: 'POST', headers: { 'content-type': type }, body }); } catch {}
      if (r?.ok) { const j = await r.json().catch(() => null); if (typeof j?.id === 'string' && REPLAY_ID.test(j.id)) return j.id; }
      if (r && r.status >= 400 && r.status < 500 && r.status !== 429) throw new Error('replay rejected ' + r.status);
      await new Promise((res) => setTimeout(res, 1500 * (attempt + 1)));
    }
    throw new Error('replay upload failed');
  }
}

// ---------------------------------------------------------------- viewer
const SPEEDS = [0.5, 1, 2, 4];

// this build's cards + one map, from its own engine in a worker of its own (only the
// 'static' request: no game, no bot, nothing saved) -> {data, map}
function localStatic(map) {
  return new Promise((res, rej) => {
    let w;
    try { w = new Worker(WORKER_URL, { type: 'module' }); } catch (e) { return rej(e); }
    const done = (f, x) => { clearTimeout(timer); w.terminate(); f(x); };
    const timer = setTimeout(() => done(rej, new Error('engine timeout')), 120000);
    w.onmessage = (e) => { const m = e.data; if (m?.t === 'static') done(res, m); else if (m?.t === 'error') done(rej, new Error(m.msg)); };
    w.onerror = (e) => done(rej, new Error(e.message || 'engine failed to load'));
    w.postMessage({ t: 'static', map: Number.isInteger(map) ? map : -1 });
  });
}

export class ReplayViewer {
  // hooks: { bootDone() } -- dismisses the loading screen (app.js owns it)
  constructor(app, id, hooks = {}) {
    this.app = app; this.id = id; this.hooks = hooks;
    this.i = 0; this.target = 0; this.playing = false; this.epoch = 0;
    this.lock = Promise.resolve(); this.running = 0;
    let sp = 1; try { sp = +localStorage.getItem('replaySpeed') || 1; } catch {}
    this.speed = SPEEDS.includes(sp) ? sp : 1;
  }
  get pace() { return this.app.pace; }
  sleep(ms) { return this.pace.sleep(ms); }

  async boot() {
    const A = this.app;
    document.body.classList.add('replay');
    let r = null;
    try {
      if (!REPLAY_ID.test(this.id)) throw Object.assign(new Error('bad id'), { nf: true });
      const res = await fetch(new URL('api/replay/' + encodeURIComponent(this.id), location.href));
      if (res.status === 404) throw Object.assign(new Error('not found'), { nf: true });
      if (!res.ok) throw new Error('http ' + res.status);
      r = await res.json();
    } catch (e) { return this.fail(e.nf ? 'rp.err.notFound' : 'rp.err.load'); }
    // A replay file is untrusted (anyone can upload one). The board is drawn with this
    // build's own cards and map (its engine: localStatic), never the file's; every view is
    // rebuilt through a strict schema (replay_codec.js sanitizeReplay) before anything shows it
    const bad = checkReplay(r);
    if (bad) return this.fail(bad);
    const mapId = r.steps[0].v.map;
    let local;
    try { local = await localStatic(mapId); } catch (e) { console.info('replay: engine', e?.message || e); return this.fail('rp.err.load'); }
    if (local.map !== mapId) return this.fail('rp.err.format');
    if (!staticMatches(r.static, local.data)) return this.fail('rp.err.version');
    let rp;
    try { rp = sanitizeReplay(r, local.data, mapId); } catch (e) { console.info(e?.message || e); return this.fail(e?.key || 'rp.err.format'); }
    this.r = { partial: rp.partial, full: rp.full }; this.steps = rp.steps; this.N = rp.views.length;
    // whose seat the replay is watched from: a whole recording (rp.full) can be watched from either
    // player's, each view redacted to what that player could see; an older one only from the human's
    this.raw = rp.views; this.human0 = rp.views[0].human;
    const pov = +new URLSearchParams(location.search).get('pov');
    this.setSeat(rp.full && Number.isInteger(pov) && rp.views[0].players[pov] ? pov : this.human0);
    window.tfmReplay = this;                                  // (tests)
    A.onMsg({ t: 'static', data: local.data, map: mapId });
    for (let k = 0; k < 600 && !(A.db && A.map); k++) await new Promise((res) => setTimeout(res, 20));
    if (!(A.db && A.map)) return this.fail('rp.err.load');
    this.pace.scale = 1 / this.speed;
    A.botReady = true;
    try {
      await A.present({ t: 'view', view: clone(this.views[0]) });   // the first view: the board, the boot screen's end
      this.precompute();
      this.buildBar();
      this.bindKeys();
      this.caption(0, false);
      this.updateBar();
      A.layout();
    } catch (e) { console.info('replay: cannot show', e?.message || e); return this.fail('rp.err.format'); }
    this.ready = true;
    if (!new URLSearchParams(location.search).has('paused')) setTimeout(() => { if (!this.touched) this.play(); }, 1600);
  }

  fail(key) {
    this.hooks.bootDone?.();
    const box = h('div', 'panel rp-err');
    box.innerHTML = `<h2>${esc(t(key))}</h2><p>${esc(t('rp.err.sub'))}</p>`;
    const b = h('button', 'primary', esc(t('rp.play')));
    b.onclick = () => { location.href = location.href.split('?')[0]; };
    box.appendChild(b);
    $('#ui').appendChild(box);
    this.failed = key;
    window.tfmReplay = this;
  }

  // One pass over the whole game with live play's own log code (no DOM): the
  // feed after every step, and each step's caption
  precompute() {
    const A = this.app, V = this.views, keep = A.view;
    A.rpCollect = true;
    A.feedItems = []; A.prevLogView = null; A.heldRevealLog = null;
    this.feedLen = [0]; this.held = [null]; this.heldRv = [[]]; this.caps = [this.startCaption()];
    this.gens = [0];
    let heldRv = [];
    try {
      for (let i = 1; i < this.N; i++) {
        const a = V[i - 1], b = V[i], st = this.steps[i], step = this.stepOf(i);
        A.view = b;
        if (b.gen !== a.gen) this.gens.push(i);
        if (!st.cut) {
          step.effects = A.effectsOf(a, b);
          const note = A.attackNote(a, b);
          if (note) step.effects = (step.effects ? step.effects + ' · ' : '') + note;
          A.logStep(b, step);
          if (b.reveal && b.moves !== a.moves && b.stage === 0 && b.reveal.player !== b.human) heldRv = [...heldRv, { reveal: b.reveal, last: b.last, human: b.human }];
          if (b.stage !== 0) heldRv = [];
        } else { A.prevLogView = b; heldRv = []; }
        this.feedLen[i] = A.feedItems.length; this.held[i] = A.heldRevealLog; this.heldRv[i] = heldRv;
        this.caps[i] = this.captionOf(a, b, st, step, i);
      }
    } finally {
      A.rpCollect = false;
      A.view = keep;
    }
    this.items = A.feedItems;
    A.feedItems = [];
    A.prevLogView = V[0];
  }
  stepOf(i) {
    const st = this.steps[i], a = this.views[i - 1], flip = this.seat !== this.human0;
    const who = st.who && flip ? { human: 'bot', bot: 'human' }[st.who] : st.who;   // ('human' = the seat watched from)
    return { who: who || (a.pending.player === a.human ? 'human' : 'bot'), kind: st.kind ?? a.pending.kind };
  }
  // the human's recorded answer at step i (only theirs is recorded: from the other seat, none)
  ansOf(i) { return (this.seat === this.human0 && this.steps[i].ans) || {}; }
  // the views as the player in `seat` saw them
  setSeat(seat) {
    this.seat = seat;
    const A = this.app;
    this.views = this.raw.map((v) => redact(A.mask(clone({ ...v, human: seat }))));   // (always: a no-op on an older, already redacted recording)
  }
  // watch from the other seat: the same step, redrawn (captions and log rebuilt for it)
  switchSeat() {
    if (!this.ready || !this.r.full) return;
    const playing = this.playing;
    this.pause();
    this.abort();
    return this.run(() => {
      this.pace.skip = false;
      this.cleanup();
      this.setSeat(this.views[0].players.find((p) => p.id !== this.seat).id);
      this.precompute();
      this.render(this.target);
      try { const u = new URL(location.href); u.searchParams.set('pov', this.seat); history.replaceState(null, '', u); } catch {}
    }).then(() => { if (playing) this.play(); });
  }
  startCaption() {
    const A = this.app, key = A.map?.key, v = this.views[0];
    const map = key && tHas(`map.${key}.name`) ? t(`map.${key}.name`) : key || '';
    return { html: esc(t(this.r.partial || !(v.stage === 0 && v.gen <= 1) ? 'rp.startPartial' : 'rp.start', { map, n: v.gen })), sub: '', c: '#c9ced8' };
  }
  captionOf(a, b, st, step, i) {
    const A = this.app;
    if (st.cut) return { html: esc(t('rp.cut')), sub: '', c: '#c9ced8' };
    const p = b.last?.player ?? -1, you = p === b.human, who = A.pname(p);
    let main = A.describe(b) || '';
    // a tile decision: say which tile ("You placed a greenery at row 4, hex 3")
    if (a.pending.kind === D.TILE && b.last?.kind === D.TILE && ['city', 'greenery', 'ocean'][a.pending.tile] && b.last.space >= 0) {
      main = t('rp.placed', { who: `<b style="color:${A.pcolor(p)}">${esc(who)}</b>`, tile: esc(t('tilew.' + ['city', 'greenery', 'ocean'][a.pending.tile])), at: t('log.at', { space: esc(A.spaceWhere(b.last.space)) }) });
    }
    if (a.pending.kind === D.RESEARCH && a.pending.player === a.human && you) main = t('rp.bought', { who: `<b style="color:${A.pcolor(p)}">${esc(who)}</b>`, n: this.chosenOf(i).chosen.length });
    const sub = [A.revealText(b), step.effects].filter(Boolean).join('<br>');
    return { html: main || esc(t('rp.move')), sub, c: p >= 0 ? A.pcolor(p) : '#c9ced8' };
  }

  // what the human was offered at step i, and what they chose
  chosenOf(i) {
    const a = this.views[i - 1], b = this.views[i], me = a.human, pd = a.pending, ans = this.ansOf(i);
    const hand = b.players[me].hand;
    const inHand = (ids) => { const left = hand.slice(); return ids.filter((c) => { const j = left.indexOf(c); if (j < 0) return false; left.splice(j, 1); return true; }); };
    switch (pd.kind) {
      case D.DRAFT: return { offered: pd.cards || [], chosen: [ans.card ?? b.last.card].filter((c) => c != null && c >= 0) };
      case D.RESEARCH: return { offered: pd.cards || [], chosen: ans.cards || inHand(pd.cards || []) };
      case D.KEEP: return { offered: pd.cards || [], chosen: ans.cards || inHand(pd.cards || []) };
      case D.PLAY_PRELUDE: case D.BONUS: return { offered: pd.cards || [], chosen: [ans.card ?? b.last.card].filter((c) => c != null && c >= 0) };
      case D.BUY: return { offered: pd.buy ? [pd.buy.card] : [], chosen: b.last.bought && pd.buy ? [pd.buy.card] : [] };
      case D.SETUP: {
        const P = a.players[me];
        let pre = ans.pre;
        if (!pre) {                                          // (recorded without the answer): the preludes that turn up later
          const seen = new Set();
          for (let k = i; k < Math.min(this.N, i + 60); k++) {
            const v = this.views[k];
            v.players[me].preludes.forEach((c) => seen.add(c));
            if (v.pending.player === me && v.pending.kind === D.PLAY_PRELUDE) (v.pending.cards || []).forEach((c) => seen.add(c));
            if (v.fizzle >= 0) seen.add(v.fizzle);
          }
          pre = (P.dpre || []).filter((c) => seen.has(c));
        }
        return { groups: [
          { label: t('tab.corp'), offered: P.dcorps || [], chosen: [ans.corp ?? b.players[me].corp] },
          { label: t('tab.preludes'), offered: P.dpre || [], chosen: pre },
          { label: t('rp.projects'), offered: P.dproj || [], chosen: ans.buys || inHand(P.dproj || []) },
        ], chosen: ans.buys || inHand(P.dproj || []) };
      }
    }
    return { offered: [], chosen: [] };
  }

  // ------------------------------------------------------------ transport
  run(fn) {
    const p = this.lock.then(async () => { this.running++; try { return await fn(); } finally { this.running--; } });
    this.lock = p.catch((e) => { console.warn('replay', e); });
    return p;
  }
  // finish the step in flight at once (its sleeps return immediately; the target is rendered after)
  abort() { this.epoch++; this.pace.flush(); }
  seek(to, keepPlaying = true) {
    if (!this.ready) return;
    to = Math.max(0, Math.min(this.N - 1, to | 0));
    this.touched = true;
    if (!keepPlaying) this.pause();
    this.target = to;
    this.abort();
    this.updateBar();
    return this.run(() => {
      this.pace.skip = false;
      if (this.target !== to) return;                    // a later seek is queued: it renders
      this.cleanup();
      this.render(to);
    });
  }
  next() {
    if (!this.ready) return;
    this.touched = true;
    this.pause();
    if (this.target >= this.N - 1) return;
    const to = ++this.target;
    if (this.running) this.abort();
    this.updateBar();
    return this.run(() => this.stepTo(to));
  }
  prev() { if (this.ready) this.seek(this.target - 1, false); }
  genStart(i) { let s = 0; for (const g of this.gens) if (g <= i) s = g; return s; }
  prevGen() { const s = this.genStart(this.target); this.seek(this.target > s ? s : this.genStart(s - 1)); }
  nextGen() { const n = this.gens.find((g) => g > this.target); this.seek(n ?? this.N - 1); }
  toggle() { this.playing ? this.pause() : this.play(); }
  pause() { if (this.playing) { this.playing = false; this.updateBar(); } }
  async play() {
    if (!this.ready || this.playing) return;
    this.touched = true;
    if (this.target >= this.N - 1) await this.seek(0);
    this.playing = true;
    this.updateBar();
    while (this.playing && this.target < this.N - 1) {
      const to = ++this.target;
      this.updateBar();
      await this.run(() => this.stepTo(to));
    }
    this.playing = false;
    this.updateBar();
  }
  setSpeed(s) {
    this.speed = s;
    this.pace.scale = 1 / s;
    try { localStorage.setItem('replaySpeed', String(s)); } catch {}
    this.updateBar();
  }

  // one animated step into view `to` (from the view before it)
  async stepTo(to) {
    this.pace.skip = false;
    const ep = this.epoch;
    if (this.i !== to - 1) { this.cleanup(); this.render(to - 1); }
    const A = this.app, a = this.views[to - 1], b = this.views[to], st = this.steps[to];
    const done = () => { if (ep === this.epoch) return false; this.pace.skip = false; this.cleanup(); this.render(to); return true; };
    if (st.cut) { this.cleanup(); this.render(to); return; }
    this.i = to;
    this.caption(to, true);
    await this.offer(to);
    if (done()) return;
    A.feedItems = this.items.slice(0, this.feedLen[to - 1]);
    A.prevLogView = a; A.heldRevealLog = this.held[to - 1]; A.heldReveals = this.heldRv[to - 1].slice();
    const last = to === this.N - 1;
    await A.present({ t: 'view', view: clone(b), step: this.stepOf(to), over: last && b.pending.kind === D.OVER, rpAnimated: true });
    if (done()) return;
    this.syncFeed(to);
    this.highlight(a, b);
    await this.dwell(a, b, to);
    done();
  }

  // the view at step i, drawn directly: no animation, nothing left over from before
  render(i) {
    const A = this.app, V = this.views, v = clone(V[i]);
    A.uiFx.quiet = true;
    A.tileSrc = {}; A.preludeSrc = null; A.savedLog = null;
    const hist = [];
    let prev = null;
    for (let k = 0; k <= i; k++) {
      const x = k === i ? v : V[k];
      A.noteTileSources(prev, x, k === 0);
      if (x.stage === 2 && (!hist.length || hist[hist.length - 1].gen !== x.gen)) hist.push({ gen: x.gen, vp: x.players.map((p) => p.vp.total) });
      else if (hist.length) hist[hist.length - 1].vp = x.players.map((p) => p.vp.total);
      prev = x;
    }
    A.history = hist;
    A.view = v; A.legal = null; A.awaitingConfirm = false; A.canUndo = false; A.flow = null;
    A.board.syncTiles(v.tiles, false);
    A.board.setGlobals(v.temp, v.oxy, v.oceans); A.audio.setTerraform(v.temp, v.oxy, v.oceans);
    A.renderAll();
    A.board.setMoonState(moonStateOf(v, A.db, A.map), false);
    A.board.spaceCards?.setState(v, A.db, false);
    A.board.syncClaims?.(v.claims || []);
    finishTweens(A.board);
    this.settleBoard();
    this.feed(i);
    A.prevLogView = V[i]; A.heldRevealLog = this.held[i]; A.heldReveals = this.heldRv[i].slice();
    this.i = i;
    this.caption(i, false);
    this.updateBar();
  }
  // the globe settles into the drawn view at once: the night-side city lights (a slow fade in
  // board/board3d.js) and the forests re-dressed for a new stage (board/tiles/, one per frame, animated)
  // are run to their end over the next frames, while nothing else is playing
  settleBoard() {
    const B = this.app.board, cu = B.pmat?.uniforms?.uCities;
    if (!Array.isArray(B.tweens)) return;
    if (cu) cu.value = Math.min(1, (this.app.view.tiles || []).filter(([, ty]) => ty === 2 || ty === 3).length / 10);
    const ep = this.epoch;
    let n = 0;
    const f = () => {
      if (ep !== this.epoch || this.running || n++ > 120) return;
      finishTweens(B);
      if (B.tileArt?.regrowQ?.size || B.tweens.length || n < 3) requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  }
  // the feed / log as they were after step i (appended when going forward, rebuilt otherwise)
  feed(i, rebuild = false) {
    const A = this.app, n = this.feedLen[i], cur = A.feedItems || [];
    A.rpBulk = true;
    try {
      if (!rebuild && cur.length <= n && cur.every((x, k) => x === this.items[k])) {
        for (let k = cur.length; k < n; k++) { cur.push(this.items[k]); A.addFeedItem(this.items[k], false); }
        A.feedItems = cur;
      } else {
        A.feedItems = this.items.slice(0, n);
        $('#log-list').innerHTML = ''; A.feedEl().innerHTML = '';
        for (const it of A.feedItems) A.addFeedItem(it, false);
      }
    } finally { A.rpBulk = false; }
  }
  // after an animated step: the live log code wrote the same lines; keep the precomputed ones (a rebuild if they differ)
  syncFeed(i) {
    const A = this.app;
    if ((A.feedItems || []).length !== this.feedLen[i]) this.feed(i, true); else A.feedItems = this.items.slice(0, this.feedLen[i]);
  }
  cleanup() {
    const A = this.app;
    $('#flyer')?.replaceChildren();
    A.stickyTray = null;
    $('#toast')?.classList.remove('show');
    A.closeModal(); A.closeZoom?.();
    A.board.clearHighlight(); A.board.clearPicked?.();
    $('#prompt')?.classList.add('hidden');
    $('#hintbox')?.remove();
    document.querySelectorAll('.rp-victim, .rp-hl').forEach((e) => e.classList.remove('rp-victim', 'rp-hl'));
    finishTweens(A.board);
    A.board.fxGen = (A.board.fxGen || 0) + 1;         // (board/board2d.js: delayed effects of the step in flight are dropped)
    const svg = A.board.svg;
    if (svg && document.getAnimations) for (const an of document.getAnimations()) { const tg = an.effect?.target; if (tg && svg.contains(tg)) { try { an.finish(); } catch { an.cancel(); } } }
  }

  // ------------------------------------------------------------ highlights
  // before the step: what the human was offered, the chosen cards lit (draft,
  // research, look-and-keep, setup, preludes, a card to buy); the hexes on offer
  // before a placement
  async offer(i) {
    const A = this.app, a = this.views[i - 1], pd = a.pending;
    if (pd.player !== a.human) return;
    if (pd.kind === D.TILE && (pd.spaces || []).length) {
      A.board.highlight(pd.spaces, () => {}, ['city', 'greenery', 'ocean'][pd.tile] || 'special');
      await this.sleep(1100);
      A.board.clearHighlight();
      return;
    }
    if (![D.SETUP, D.DRAFT, D.RESEARCH, D.KEEP, D.PLAY_PRELUDE, D.BONUS, D.BUY].includes(pd.kind)) return;
    const c = this.chosenOf(i), db = A.db;
    const groups = c.groups || [{ offered: c.offered, chosen: c.chosen }];
    const total = groups.reduce((n, g) => n + g.offered.length, 0);
    if (!total) return;
    const nm = (id) => esc(db.lname(id));
    const one = c.chosen?.[0];
    const title = pd.kind === D.SETUP ? t('rp.offer.setup')
      : pd.kind === D.DRAFT ? t('rp.offer.draft', { card: one != null ? nm(one) : '?' })
      : pd.kind === D.RESEARCH ? t('rp.offer.research', { n: c.chosen.length, m: c.offered.length })
      : pd.kind === D.KEEP ? t('rp.offer.keep', { n: c.chosen.length, m: c.offered.length })
      : pd.kind === D.BUY ? t(c.chosen.length ? 'rp.offer.buy' : 'rp.offer.noBuy', { card: nm(c.offered[0]) })
      : pd.kind === D.BONUS ? t('rp.offer.bonus', { card: one != null ? nm(one) : '?' })
      : t('rp.offer.prelude', { card: one != null ? nm(one) : '?' });
    const tray = h('div', 'rvtray rp-offer');
    // card size: as large as a hovered hand card, down to what fits the screen (rows of at most 5)
    const hs = parseFloat(getComputedStyle($('#hand')).getPropertyValue('--hs')) || 1;
    const shown = groups.filter((g) => g.offered.length), widest = Math.max(...shown.map((g) => g.offered.length));
    const perRow = Math.min(widest, 5), rows = shown.reduce((n, g) => n + Math.ceil(g.offered.length / perRow), 0);
    const fitW = (innerWidth * 0.92 - 36) / perRow / 124, fitH = (innerHeight * 0.86 - 60 - shown.length * 22) / rows / 184;
    const rz = Math.max(0.42, Math.min(Math.max(0.62, hs * 1.2) * (total > 12 ? 0.7 : 1), fitW, fitH));
    tray.style.setProperty('--rz', rz.toFixed(3));
    tray.style.setProperty('--rpw', `${Math.ceil(perRow * (118 * rz + 6) + 40)}px`);
    tray.innerHTML = `<div class="rvt">${title}</div>`;
    const slots = [];
    for (const g of groups) {
      if (!g.offered.length) continue;
      if (g.label) tray.appendChild(h('div', 'rp-sect', esc(g.label)));
      const grid = h('div', 'rvg'), left = g.chosen.slice();
      for (const id of g.offered) {
        const card = db.get(id);
        if (!card) continue;
        const slot = h('div', 'rvs'), el = cardEl(card);
        el.classList.add('rvc');
        slot.appendChild(el);
        const j = left.indexOf(id), on = j >= 0;
        if (on) { left.splice(j, 1); slot.appendChild(h('div', 'rvtag kept', esc(t('rp.chosen')))); }
        grid.appendChild(slot);
        slots.push([slot, on]);
      }
      tray.appendChild(grid);
    }
    $('#flyer').appendChild(tray);
    this.app.audio.deal?.(Math.min(5, total));
    await this.sleep(30);
    tray.classList.add('in');
    await this.sleep(700);
    for (const [slot, on] of slots) slot.classList.add(on ? 'is-kept' : 'is-disc', ...(on ? ['rp-pick'] : []));
    await this.sleep(pd.kind === D.SETUP ? 2600 : 2000);
    tray.classList.remove('in'); tray.classList.add('rp-out');
    await this.sleep(380);
    tray.remove();
  }
  // after the step: milestones / awards, the victim of an attack, the placed tiles once more
  highlight(a, b) {
    const A = this.app, ep = this.epoch;
    const banner = (html, color) => {
      const el = h('div', 'rp-banner', html);
      el.style.setProperty('--pc', color);
      $('#flyer').appendChild(el);
      el.animate([{ transform: 'translate(-50%,-50%) scale(.6)', opacity: 0 }, { transform: 'translate(-50%,-50%) scale(1.06)', opacity: 1, offset: 0.15 }, { transform: 'translate(-50%,-50%) scale(1)', opacity: 1, offset: 0.8 }, { transform: 'translate(-50%,-50%) scale(1)', opacity: 0 }],
        { duration: 2600 * this.pace.scale, easing: 'ease-out', fill: 'both' }).finished.then(() => el.remove(), () => el.remove());
    };
    b.ms.forEach((m, k) => {
      if (m.owner < 0 || a.ms[k].owner >= 0) return;
      banner(`<small>${esc(t('rp.msClaimed', { who: A.pname(m.owner) }))}</small><b>🏆 ${esc(tName('ma.', m.name))}</b>`, A.pcolor(m.owner));
      $('#mss')?.children[k]?.classList.add('rp-hl');
    });
    b.aw.forEach((w, k) => {
      if (w.funder < 0 || a.aw[k].funder >= 0) return;
      banner(`<small>${esc(t('rp.awFunded', { who: A.pname(w.funder) }))}</small><b>🎖 ${esc(tName('ma.', w.name))}</b>`, A.pcolor(w.funder));
      $('#aws')?.children[k]?.classList.add('rp-hl');
    });
    // the victim: whoever the move targeted, if they lost something
    const act = b.last?.act || {}, vic = act.atp;
    if (vic != null && vic >= 0 && vic !== b.last.player && b.players[vic] && a.players[vic]) {
      const pa = a.players[vic], pb = b.players[vic];
      const lost = pb.res.some((x, r) => x < pa.res[r]) || pb.prod.some((x, r) => x < pa.prod[r]) || Object.keys(pa.cres || {}).some((c) => (pb.cres?.[c] ?? 0) < pa.cres[c]);
      if (lost) { const el = $(`.pb[data-p="${vic}"]`); if (el) { el.classList.remove('rp-victim'); void el.offsetWidth; el.classList.add('rp-victim'); } }
    }
    const placed = b.tiles.filter(([s, ty, o]) => !a.tiles.some(([s2, t2, o2]) => s2 === s && t2 === ty && o2 === o)).map(([s]) => s);
    if (placed.length) {
      const who = b.last?.player ?? -1, col = parseInt((who >= 0 ? A.pcolor(who) : '#ffffff').slice(1), 16);
      A.board.ensureVisible?.(placed[0]);
      setTimeout(() => { if (ep === this.epoch) placed.forEach((s) => A.board.flashSpace(s, col)); }, 900 * this.pace.scale);
    }
  }
  // how long a step stays before the next one (1× speed; the speed control scales it)
  async dwell(a, b, i) {
    const k = a.pending.kind, human = a.pending.player === a.human;
    let ms = { [D.ACTION]: 1300, [D.FG]: 1300, [D.PRELUDE_PLAY]: 1300, [D.TILE]: 1000, [D.SETUP]: 1400, [D.DRAFT]: human ? 600 : 450, [D.RESEARCH]: 900 }[k] ?? 900;
    if (b.reveal && b.moves !== a.moves) ms += 1100;                    // cards drawn / revealed: time to read them
    if (b.gen !== a.gen) ms += 1600;                                     // a new generation
    if (b.ms.some((m, x) => m.owner >= 0 && a.ms[x].owner < 0) || b.aw.some((w, x) => w.funder >= 0 && a.aw[x].funder < 0)) ms += 1400;
    if (this.app.stickyTray) {                                           // a public reveal stays up a while, then goes
      await this.sleep(2800);
      this.app.stickyTray?.__out?.();
    }
    await this.sleep(ms);
    for (const s of document.querySelectorAll('#flyer .rvtray.sticky')) s.remove();   // (a fizzled prelude's note)
    if (i === this.N - 1) this.pause();
  }

  // ------------------------------------------------------------ chrome
  caption(i, animate) {
    const el = this.capEl || (this.capEl = Object.assign(h('div', ''), { id: 'rp-cap' }));
    if (!el.isConnected) $('#ui').appendChild(el);
    const c = this.caps[i] || this.startCaption(), fx = this.app.uiFx;
    el.style.setProperty('--pc', c.c);
    el.innerHTML = `<span class="rpc-dot"></span><div class="rpc-body"><div class="rpc-main">${fx.decorateLog(c.html, this.app.db)}</div>${c.sub ? `<div class="rpc-sub">${fx.decorateLog(c.sub, this.app.db)}</div>` : ''}</div>`;
    if (animate) { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
  }
  buildBar() {
    const bar = h('div', '');
    bar.id = 'rpbar';
    const btn = (a, txt, title) => { const b = h('button', 'rpb', txt); b.dataset.a = a; b.title = title; return b; };
    this.bPrev = btn('prev', '⏮', t('rp.prevTitle'));
    this.bPlay = btn('play', '▶', t('rp.playTitle'));
    this.bNext = btn('next', '⏭', t('rp.nextTitle'));
    this.bSpeed = btn('speed', '1×', t('rp.speedTitle'));
    this.bSeat = btn('seat', '', this.r.full ? t('rp.povTitle') : t('rp.povOld'));
    this.bSeat.classList.add('seat');
    this.bSeat.disabled = !this.r.full;
    this.bPlay.classList.add('play');
    const sc = h('div', 'rps');
    this.range = h('input', '');
    Object.assign(this.range, { type: 'range', min: 0, max: this.N - 1, step: 1, value: 0 });
    this.range.setAttribute('aria-label', t('rp.scrub'));
    const ticks = h('div', 'rpticks');
    const span = Math.max(1, this.N - 1);
    this.gens.forEach((g) => {
      if (!g) return;
      const tk = h('span', 'rptick', `<i>${this.views[g].gen}</i>`);
      tk.style.left = `${(g / span) * 100}%`;
      ticks.appendChild(tk);
    });
    sc.append(ticks, this.range);
    this.read = h('span', 'rpread', '');
    bar.append(this.bPrev, this.bPlay, this.bNext, sc, this.read, this.bSpeed, this.bSeat);
    bar.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-a]');
      if (!b) return;
      this.app.audio.tick?.();
      ({ prev: () => this.prev(), play: () => this.toggle(), next: () => this.next(), speed: () => this.setSpeed(SPEEDS[(SPEEDS.indexOf(this.speed) + 1) % SPEEDS.length]), seat: () => this.switchSeat() })[b.dataset.a]();
      b.blur();
    });
    this.range.addEventListener('input', () => {
      this.scrubTo = +this.range.value;
      this.target = this.scrubTo; this.updateBar(true);
      if (!this.scrubRaf) this.scrubRaf = requestAnimationFrame(() => { this.scrubRaf = 0; this.seek(this.scrubTo); });
    });
    // dragging the scrubber pauses playback; letting go resumes it
    this.range.addEventListener('pointerdown', () => { this.scrubPlaying = this.playing || this.scrubPlaying; this.pause(); });
    this.range.addEventListener('change', () => { this.range.blur(); if (this.scrubPlaying) { this.scrubPlaying = false; this.lock.then(() => this.play()); } });
    $('#ui').appendChild(bar);
    this.bar = bar;
  }
  updateBar(fromScrub) {
    if (!this.bar) return;
    const i = this.target, v = this.views[i];
    this.bPlay.textContent = this.playing ? '⏸' : '▶';
    this.bPlay.title = t(this.playing ? 'rp.pauseTitle' : 'rp.playTitle');
    this.bSpeed.textContent = `${this.speed}×`;
    this.bSeat.innerHTML = `👁 <span style="color:${this.app.pcolor(this.seat)}">${esc(this.app.pname(this.seat))}</span>`;
    this.bPrev.disabled = i <= 0; this.bNext.disabled = i >= this.N - 1;
    if (!fromScrub) this.range.value = String(i);
    this.range.style.setProperty('--pct', `${(i / Math.max(1, this.N - 1)) * 100}%`);
    this.read.textContent = t('rp.readout', { g: v.gen, i, n: this.N - 1 });
  }
  bindKeys() {
    addEventListener('keydown', (e) => {
      if (!this.ready || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target.closest?.('textarea, select, input:not([type=range])')) return;
      if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); this.toggle(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); e.shiftKey ? this.prevGen() : this.prev(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); e.shiftKey ? this.nextGen() : this.next(); }
      else if (e.key === 'Home') { e.preventDefault(); this.seek(0, false); }
      else if (e.key === 'End') { e.preventDefault(); this.seek(this.N - 1, false); }
    }, true);
  }
  // the end of the game (from its score screen)
  restart() { this.app.closeModal(); this.seek(0).then(() => this.play()); }
}

// board/board3d.js animates with its own tween list: run every one to its end (a seek shows the final state)
function finishTweens(board) {
  if (!Array.isArray(board?.tweens)) return;
  for (let guard = 0; guard < 6 && board.tweens.length; guard++) {
    const list = board.tweens; board.tweens = [];
    for (const tw of list) { try { tw.fn(1); tw.done?.(); } catch {} }
  }
}
