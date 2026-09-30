// worker.js -- hosts the WASM engine (engine + session only, ~60 KB gzipped).
// TFMBot itself runs on the bot server (/api/bot, native code): the worker sends
// the session snapshot and restores the snapshot that comes back.
//
// The C session (compiled into web/wasm/) is one POD struct; undo = restoring a byte
// snapshot of it, and the same bytes are what travels to the bot server
// (layout checked with tw_layout_hash on both sides).
//
// Commit model (the UI never talks to the engine directly):
//   - every human answer is preceded by a snapshot on the undo stack;
//   - an answer that REVEALS information (deck or discard pile changed:
//     cards drawn, research dealt, a card revealed) commits at once;
//   - when the next decision belongs to the bot during the action /
//     final-greenery phase, the turn is HELD ("awaiting confirm") until
//     the human confirms, so the whole turn can still be undone;
//   - bot decisions are always committed.
import createModule from '../wasm/tfmweb.mjs';
import { D, AK } from './protocol.js';

let M, api;
let undoStack = [];
let awaitingConfirm = false;
let settings = { sims: 4096, apiBase: '../api/bot' };
let log = [];            // decision log for the server (training/review data)
let gameMeta = {};
let busy = false;
let layout = 0;
let staticMap = -1;      // the map the client has static data for
// replays (replay.js Recorder records the views): every view carries a sequence
// number, and each undo snapshot the number of the first view after it, so an
// undo can say exactly which recorded views it took back (dropFrom)
let seq = 0;
const mark = (snap) => { snap.seq = seq; return snap; };
const MAPS = { 0: 'tharsis', 1: 'hellas', 2: 'elysium', 7: 'vastitas' };   // the maps the bot plays
const mapOk = (m) => (m in MAPS ? +m : 0);
// the client needs the cards + THIS map's spaces/milestones/awards before the first view of a game on it
function sendStatic(map) {
  if (map === staticMap) return;
  staticMap = map;
  post({ t: 'static', data: JSON.parse(api.stat(map)), map });
}
const curMap = () => JSON.parse(api.view()).map;

const post = (m) => self.postMessage(m);

function wrap() {
  const c = (n, r, a) => M.cwrap(n, r, a);
  api = {
    newGame: c('tw_new_game', null, ['number', 'number', 'number']),
    view: c('tw_view_json', 'string', []),
    legal: c('tw_legal_json', 'string', []),
    stat: c('tw_static_json', 'string', ['number']),
    kind: c('tw_pending_kind', 'number', []),
    player: c('tw_pending_player', 'number', []),
    human: c('tw_human', 'number', []),
    deckN: c('tw_deck_n', 'number', []),
    discN: c('tw_discard_n', 'number', []),
    ansSpace: c('tw_answer_space', 'number', ['number']),
    ansCard: c('tw_answer_card', 'number', ['number']),
    ansAction: c('tw_answer_action', 'number', ['number']),
    sessPtr: c('tw_session_ptr', 'number', []),
    sessSize: c('tw_session_size', 'number', []),
    restored: c('tw_session_restored', null, []),
    payOpts: c('tw_pay_options', 'string', ['number']),
    ansPay: c('tw_answer_action_pay', 'number', ['number', 'number', 'number', 'number', 'number']),
    layout: c('tw_layout_hash', 'number', []),
  };
}

function withU16(arr, fn) {
  const p = M._malloc(Math.max(2, arr.length * 2));
  for (let i = 0; i < arr.length; i++) M.HEAPU8.set([arr[i] & 255, arr[i] >> 8], p + i * 2);
  try { return fn(p); } finally { M._free(p); }
}
const ansSetup = (corp, p0, p1, buys) => withU16(buys, (p) => M.ccall('tw_answer_setup', 'number', ['number', 'number', 'number', 'number', 'number'], [corp, p0, p1, p, buys.length]));
const ansSell = (cards) => withU16(cards, (p) => M.ccall('tw_answer_sell', 'number', ['number', 'number'], [p, cards.length]));
const ansKeep = (cards) => withU16(cards, (p) => M.ccall('tw_answer_keep', 'number', ['number', 'number'], [p, cards.length]));
const ansResearch = (cards) => withU16(cards, (p) => M.ccall('tw_answer_research', 'number', ['number', 'number'], [p, cards.length]));

function snapshot() {
  const p = api.sessPtr(), n = api.sessSize();
  return M.HEAPU8.slice(p, p + n);
}
function restore(bytes) {
  // the session struct only ever grows at the END: an older, shorter save
  // restores with the new tail zeroed
  M.HEAPU8.fill(0, api.sessPtr(), api.sessPtr() + api.sessSize());
  M.HEAPU8.set(bytes, api.sessPtr());
  api.restored();
}

// ---- the bot server -----------------------------------------------------------
function b64bytes(s) { const bin = atob(s); const b = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i); return b; }
// the engine build (production bundles only): the server asks an outdated tab to reload
const WASM_HASH = typeof __WASM_HASH__ !== 'undefined' ? __WASM_HASH__ : '';
async function botCall(op) {
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await fetch(`${settings.apiBase}?op=${op}&sims=${settings.sims}`, {
        method: 'POST', body: snapshot(), headers: { 'content-type': 'application/octet-stream', 'x-tw-layout': String(layout), ...(WASM_HASH ? { 'x-tw-wasm': WASM_HASH } : {}) },
      });
      if (r.status === 409) {
        // a new build was deployed: save the game and let the page reload
        // itself onto the new engine (older saves restore into newer builds)
        autosave();
        post({ t: 'reload' });
        return new Promise(() => {});
      }
      if (!r.ok) throw new Error('bot server ' + r.status);
      return await r.json();
    } catch (e) {
      if (e.fatal || attempt >= 5) throw e;
      post({ t: 'thinking', on: true, msg: 'TFMBot is unreachable — retrying…' });
      await new Promise((res) => setTimeout(res, 1000 * (attempt + 1)));
    }
  }
}

function state(extra = {}) {
  const view = JSON.parse(api.view());
  const k = view.pending.kind, pl = view.pending.player;
  const humanTurn = pl === view.human && k !== D.OVER && k !== D.NONE;
  return {
    t: 'view', view, seq: seq++, gid: gameMeta.started ? `${gameMeta.seed}:${gameMeta.started}` : 'legacy',
    legal: humanTurn && (k === D.ACTION || k === D.FG || k === D.PRELUDE_PLAY) ? JSON.parse(api.legal()) : null,
    canUndo: undoStack.length > 0, undoN: undoStack.length, awaitingConfirm, ...extra,
  };
}

function autosave() { post({ t: 'save', bytes: snapshot(), meta: gameMeta, log }); }
function logDecision(who, kind, payload) { log.push({ who, kind, ...payload }); }

// Run bot decisions until the human must act (or the game ends).
async function runBot() {
  if (busy) return;
  busy = true;
  try {
    for (;;) {
      const k = api.kind(), p = api.player();
      if (k === D.OVER) {
        post(state({ over: true }));
        post({ t: 'gamelog', meta: gameMeta, log, final: JSON.parse(api.view()) });
        break;
      }
      if (p === api.human() || k === D.NONE || awaitingConfirm) break;
      post({ t: 'thinking', on: true, kind: k });
      const t0 = performance.now();
      const pre = (k === D.ACTION || k === D.FG || k === D.PRELUDE_PLAY) ? JSON.parse(api.view()).pending.n : undefined;
      let r;
      try { r = await botCall('step'); } catch (e) { post({ t: 'error', msg: String(e.message || e), sticky: true }); break; }
      if (r.rc !== 0 || !r.snap) { post({ t: 'error', msg: 'bot step failed rc=' + r.rc + ' kind=' + k }); break; }
      restore(b64bytes(r.snap));
      if (r.legal_ok === 0) post({ t: 'warn', msg: 'engine cross-check mismatch (reported)' });
      const dt = performance.now() - t0;
      const v = JSON.parse(api.view());
      logDecision('bot', k, { last: v.last, ms: Math.round(dt), server_ms: r.ms, n: pre, think: r.think });
      undoStack = []; // bot moves are committed
      post({ ...state(), step: { who: 'bot', kind: k, ms: dt, think: r.think } });
    }
  } finally {
    busy = false;
    post({ t: 'thinking', on: false });
    autosave();
  }
}

function afterHumanAnswer(rc, beforeDeck, beforeDisc, kind) {
  if (rc !== 0) {
    undoStack.pop();
    post({ t: 'error', msg: 'move refused (' + rc + ')' });
    post(state());
    return;
  }
  const revealed = api.deckN() !== beforeDeck || api.discN() !== beforeDisc;
  if (revealed) undoStack = [];
  const k = api.kind(), p = api.player();
  const handsOff = p !== api.human() && k !== D.OVER;
  // hold the hand-over only when the turn ended by itself (second action);
  // an explicit End turn / Pass is already the confirmation, and setup never holds
  const v0 = JSON.parse(api.view());
  const explicit = v0.last && v0.last.act && (v0.last.act.k === AK.PASS || v0.last.act.k === AK.END);
  const mainPhase = (kind === D.ACTION || kind === D.FG || kind === D.KEEP || kind === D.TRIGGER || kind === D.BUY) && v0.stage === 2;
  awaitingConfirm = handsOff && undoStack.length > 0 && mainPhase && !explicit && !settings.autoConfirm;
  if (!awaitingConfirm && handsOff) undoStack = [];
  const v = JSON.parse(api.view());
  logDecision('human', kind, { last: v.last });
  post({ ...state(), step: { who: 'human', kind, revealed } });
  if (!awaitingConfirm) runBot();
  else autosave();
}

self.onmessage = async (e) => {
  const m = e.data;
  try {
    if (m.t === 'init') {
      Object.assign(settings, m.settings || {});
      await loadEngine();
      if (m.restore && m.restore.bytes.byteLength <= api.sessSize() && m.restore.bytes.byteLength > api.sessSize() - 128) {
        restore(new Uint8Array(m.restore.bytes));
        gameMeta = m.restore.meta || {};
        log = m.restore.log || [];
        sendStatic(curMap());                       // the saved game's own map
      } else {
        newGame(m.seed, m.map ?? settings.map);
      }
      post({ t: 'progress', frac: 1, msg: 'ready' });
      post(state());
      runBot();
    } else if (m.t === 'static') {
      // (the replay viewer, replay.js localStatic) this build's cards + one map, nothing else
      if (!M) await loadEngine();
      staticMap = -1;
      sendStatic(mapOk(m.map));
    } else if (m.t === 'new') {
      newGame(m.seed, m.map ?? settings.map);
      post(state({ fresh: true }));
      runBot();
    } else if (m.t === 'settings') {
      Object.assign(settings, m.settings);
    } else if (m.t === 'answer') {
      if (busy) return;
      const kind = api.kind();
      if (api.player() !== api.human()) return;
      const bd = api.deckN(), bc = api.discN();
      undoStack.push(mark(snapshot()));
      let rc = -99;
      if (m.a === 'setup') rc = ansSetup(m.corp, m.pre[0], m.pre[1], m.buys);
      else if (m.a === 'space') rc = api.ansSpace(m.space);
      else if (m.a === 'card') rc = api.ansCard(m.card);
      else if (m.a === 'research') rc = ansResearch(m.cards);
      else if (m.a === 'action') rc = api.ansAction(m.idx);
      else if (m.a === 'sell') rc = ansSell(m.cards);
      else if (m.a === 'keep') rc = ansKeep(m.cards);
      else if (m.a === 'buy') rc = M.ccall('tw_answer_buy', 'number', ['number'], [m.yes ? 1 : 0]);
      else if (m.a === 'trigger') rc = M.ccall('tw_answer_trigger', 'number', ['number', 'number'], [m.opt, m.card ?? -1]);
      else if (m.a === 'pay') rc = M.ccall('tw_answer_action_pay2', 'number', ['number', 'number', 'number', 'number', 'number', 'number'], [m.idx, m.pay.mc, m.pay.steel, m.pay.ti, m.pay.heat, m.pay.k || 0]);
      afterHumanAnswer(rc, bd, bc, kind);
    } else if (m.t === 'payopts') {
      post({ t: 'payopts', idx: m.idx, opts: JSON.parse(api.payOpts(m.idx)) });
    } else if (m.t === 'undo') {
      if (busy || !undoStack.length) return;
      const snap = undoStack.pop();
      restore(snap);
      awaitingConfirm = false;
      log.push({ who: 'human', kind: 'undo' });
      post({ ...state(), undone: true, dropFrom: snap.seq });
    } else if (m.t === 'confirm') {
      if (!awaitingConfirm) return;
      awaitingConfirm = false;
      undoStack = [];
      post(state());
      runBot();
    } else if (m.t === 'hint') {
      if (busy) return;
      busy = true;
      gameMeta.hints = (gameMeta.hints || 0) + 1;       // (the game log says how much help the player took: the win stats can split them out)
      post({ t: 'thinking', on: true, msg: 'TFMBot is considering your options…' });
      try {
        const r = await botCall(m.op === 'sellhint' ? 'sellhint' : 'hint');   // (sellhint: the Sell patents dialog's pick)
        post({ t: 'hint', idx: r.rc, think: r.think });
      } catch (err) { post({ t: 'error', msg: String(err.message || err) }); }
      busy = false;
      post({ t: 'thinking', on: false });
    } else if (m.t === 'autoplay') {
      // let the bot answer the human's pending decision ("play for me" / tests)
      if (busy) return;
      busy = true;
      gameMeta.autoplays = (gameMeta.autoplays || 0) + 1;
      const kind = api.kind();
      const bd = api.deckN(), bc = api.discN();
      undoStack.push(mark(snapshot()));
      let rc = -1;
      try {
        const r = await botCall('auto');
        if (r.rc === 0 && r.snap) { restore(b64bytes(r.snap)); rc = 0; } else rc = r.rc;
      } catch (err) { post({ t: 'error', msg: String(err.message || err) }); }
      busy = false;
      afterHumanAnswer(rc, bd, bc, kind);
    }
  } catch (err) {
    post({ t: 'error', msg: String(err && err.stack || err) });
  }
};

async function loadEngine() {
  // the production build renames the binary (CDN-cacheable extension)
  const WASM = typeof __WASM_FILE__ !== 'undefined' ? __WASM_FILE__ : null;
  M = await createModule({ locateFile: (f) => new URL('../wasm/' + (WASM && f.endsWith('.wasm') ? WASM : f), import.meta.url).href });
  wrap();
  layout = api.layout() >>> 0;
}

function newGame(seed, map) {
  seed = seed ?? ((Math.random() * 2 ** 31) >>> 0);
  map = mapOk(map ?? 0);
  const humanFirst = settings.humanFirst ?? (Math.random() < 0.5 ? 1 : 0);
  api.newGame(seed, humanFirst, map);
  undoStack = [];
  awaitingConfirm = false;
  gameMeta = { seed, humanFirst, map: MAPS[map], mapId: map, started: new Date().toISOString(), sims: settings.sims, bot: 'server' };
  log = [];
  sendStatic(map);
}
