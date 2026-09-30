// replay_codec.js -- the data side of game replays (no DOM): a compact JSON
// diff between consecutive views, the hidden-information filter, and the
// replay file format. Shared by the recorder / viewer (replay.js) and the
// node tests.
//
// A diff node is an object with exactly one of:
//   {$v: value}                       replace with value
//   {$o: {key: node}, $d: [keys]}     object: changed keys, deleted keys
//   {$a: {index: node}, $n: length}   array: changed indexes, new length
// Unchanged values have no node. jpatch never mutates its input: unchanged
// subtrees are shared with the previous view (so every view of a game costs
// only what changed).
import { D, AK } from '../protocol.js';

export const REPLAY_FMT = 'tfmweb-replay';
export const REPLAY_VERSION = 1;

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

export function jequal(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!jequal(a[i], b[i])) return false;
    return true;
  }
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (!(k in b) || !jequal(a[k], b[k])) return false;
  return true;
}

// the node that turns a into b (undefined: no change)
export function jdiff(a, b) {
  if (jequal(a, b)) return undefined;
  if (isObj(a) && isObj(b)) {
    const o = {}, d = [];
    for (const k of Object.keys(b)) { const n = k in a ? jdiff(a[k], b[k]) : { $v: b[k] }; if (n) o[k] = n; }
    for (const k of Object.keys(a)) if (!(k in b)) d.push(k);
    const r = { $o: o };
    if (d.length) r.$d = d;
    return small(r, b);
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    const o = {};
    for (let i = 0; i < b.length; i++) { const n = i < a.length ? jdiff(a[i], b[i]) : { $v: b[i] }; if (n) o[i] = n; }
    const r = { $a: o };
    if (b.length !== a.length) r.$n = b.length;
    return small(r, b);
  }
  return { $v: b };
}
// a structural node that is no smaller than the value itself: just replace
function small(node, b) {
  const s = JSON.stringify(node);
  return s.length >= JSON.stringify(b).length + 6 ? { $v: b } : node;
}

// A replay file is untrusted (anyone can upload one; whoever opens its link runs
// the viewer on it): a patch never writes a prototype key, never makes an array
// longer than PATCH_MAX_LEN, only writes indexes inside the array, and counts its
// copying work against budget.n (decodeViews: a small diff cannot fan out into
// gigabytes of copies)
const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const PATCH_MAX_LEN = 1024, PATCH_MAX_DEPTH = 24;
const badDiff = () => new Error('bad replay diff node');
export function jpatch(a, n, budget = { n: Infinity }, depth = 0) {
  if (n === undefined || n === null) return a;
  if (!isObj(n) || depth > PATCH_MAX_DEPTH) throw badDiff();
  if (Object.prototype.hasOwnProperty.call(n, '$v')) return n.$v;
  if (isObj(n.$o)) {
    const r = isObj(a) ? { ...a } : {};
    const keys = Object.keys(n.$o), del = n.$d ?? [];
    if (!Array.isArray(del)) throw badDiff();
    if ((budget.n -= Object.keys(r).length + keys.length + del.length) < 0) throw badDiff();
    for (const k of keys) { if (BAD_KEYS.has(k)) throw badDiff(); r[k] = jpatch(r[k], n.$o[k], budget, depth + 1); }
    for (const k of del) { if (typeof k !== 'string' || BAD_KEYS.has(k)) throw badDiff(); delete r[k]; }
    return r;
  }
  if (isObj(n.$a)) {
    const len = n.$n ?? (Array.isArray(a) ? a.length : 0);
    if (!Number.isInteger(len) || len < 0 || len > PATCH_MAX_LEN) throw badDiff();
    const r = Array.isArray(a) ? a.slice(0, len) : [];
    while (r.length < len) r.push(undefined);
    const keys = Object.keys(n.$a);
    if ((budget.n -= len + keys.length) < 0) throw badDiff();
    for (const k of keys) {
      if (!/^\d{1,4}$/.test(k) || +k >= len) throw badDiff();
      r[+k] = jpatch(r[+k], n.$a[k], budget, depth + 1);
    }
    return r;
  }
  throw badDiff();
}

// A stable hash of a view (tests compare the live views with the replayed ones)
export function vhash(v) {
  const s = JSON.stringify(sortKeys(v));
  let h1 = 0x811c9dc5, h2 = 0x9e3779b1;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619); h2 = Math.imul(h2 ^ c, 2246822507); }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0') + ':' + s.length;
}
function sortKeys(x) {
  if (Array.isArray(x)) return x.map(sortKeys);
  if (!isObj(x)) return x;
  const r = {};
  for (const k of Object.keys(x).sort()) r[k] = sortKeys(x[k]);
  return r;
}

// What the human saw, and nothing more: a replay is a shareable link, so the
// other seats' secrets (the bot's hand, its draft packs, its private draws,
// its dealt setup cards, the patents it sold) are blanked (-1) -- counts stay.
// Takes a view already masked for the setup stage (app.js mask) and returns
// a new object; the input is not changed.
export function redact(view) {
  const v = JSON.parse(JSON.stringify(view)), me = v.human;
  const hide = (arr) => (Array.isArray(arr) ? arr.map(() => -1) : arr);
  for (const p of v.players || []) {
    if (p.id === me) continue;
    p.hand = hide(p.hand);
    if (Array.isArray(p.hdisc)) p.hdisc = p.hdisc.map(() => 0);
    delete p.dcorps; delete p.dpre; delete p.dproj;
  }
  const pd = v.pending;
  if (pd && pd.player !== me) {
    if (pd.cards) pd.cards = hide(pd.cards);
    if (pd.drafted) pd.drafted = hide(pd.drafted);
    if (pd.buy) pd.buy.card = -1;
  }
  const R = v.reveal;
  if (R && !R.pub && R.player !== me && Array.isArray(R.cards)) R.cards = R.cards.map(([c, d]) => [d === me ? c : -1, d]);
  const L = v.last;
  if (L && L.player >= 0 && L.player !== me) {
    // (log.js describe: the bot's draft pick and, during setup, its corporation are not shown)
    if (L.kind === D.DRAFT || (L.kind === D.SETUP && v.stage === 0)) L.card = -1;
    if (L.act && Array.isArray(L.act.disc) && L.act.k === AK.SP && L.act.sp === 0) L.act.disc = hide(L.act.disc);   // sold patents
    if (L.bcard != null) L.bcard = -1;
    if (L.tdisc != null) L.tdisc = -1;
  }
  return v;
}

// Rebuild every view of a replay (steps[i].v = a full view, steps[i].d = a diff
// against the view before it). Views share unchanged subtrees: treat as read-only.
export function decodeViews(steps, budget = { n: 4e6 }) {
  const out = [];
  let prev = null;
  for (const s of steps) {
    if (!isObj(s)) throw badDiff();
    const v = s.v !== undefined ? s.v : jpatch(prev, s.d, budget);
    out.push(v);
    prev = v;
  }
  return out;
}

// checks a parsed replay; returns an error key (i18n) or null
export const REPLAY_MAX_STEPS = 20000;
export function checkReplay(r) {
  if (!isObj(r) || r.fmt !== REPLAY_FMT) return 'rp.err.format';
  if (r.v !== REPLAY_VERSION) return 'rp.err.version';
  if (!isObj(r.static) || !Array.isArray(r.static.cards) || !isObj(r.static.map) || !Array.isArray(r.steps) || !r.steps.length
    || r.steps.length > REPLAY_MAX_STEPS || !isObj(r.steps[0]) || !isObj(r.steps[0].v)) return 'rp.err.format';
  return null;
}

// ---------------------------------------------------------------- untrusted replays
// The viewer draws a replay with ITS OWN cards and map (this build's engine: replay.js
// localStatic), never the file's; the file's card list only has to agree with them
// (the same card ids), else the replay is from an incompatible build.
export function staticMatches(fileStatic, local) {
  const fc = fileStatic?.cards, lc = local?.cards;
  if (!Array.isArray(fc) || !Array.isArray(lc) || !fc.length || fc.length > lc.length) return false;
  for (let i = 0; i < fc.length; i++) if (!isObj(fc[i]) || fc[i].name !== lc[i].name) return false;
  return !isObj(fileStatic.map) || fileStatic.map.key === local.map?.key;
}

// Every view of a replay rebuilt through a strict schema (the engine's view JSON,
// tw_view_json): only known keys are kept, every number is an integer
// in range (card ids, spaces and players inside this build's tables), the only
// strings are fixed names (milestones and awards must be this map's, resources from
// a fixed list, player names plain words), array sizes are bounded. Anything else
// rejects the whole replay (throws; err.key = the i18n message). Views that share a
// subtree keep sharing it (a WeakMap memo per schema node).
// Returns { views, steps: [{who, kind, ans, cut}], partial }.
const RES_NAMES = ['megacredits', 'steel', 'titanium', 'plants', 'energy', 'heat', 'animal', 'fighter', 'microbe', 'science', 'floater', '?'];
const ANS_KINDS = ['setup', 'space', 'card', 'research', 'action', 'sell', 'keep', 'buy', 'trigger', 'pay'];
const PLAYER_NAME = /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,23}$/;
const NPLAYERS = 2;                                   // (the UI is two-player: app/shared.js PCOL)
export function sanitizeReplay(r, local, mapId) {
  const C = local.cards.length, S = local.map.spaces.length, lm = local.map;
  const fail = (why) => { const e = new Error('replay rejected: ' + why); e.key = 'rp.err.format'; throw e; };
  // schema nodes: [kind, ...]; ranges are inclusive
  const int = (lo, hi) => ({ t: 'i', lo, hi });
  const N = int(-1e6, 1e6), BIT = int(0, 1), SMALL = int(-1, 64);
  const CARD = int(-1, C - 1), SPACE = int(0, S - 1), PL = int(-1, NPLAYERS - 1), PL0 = int(0, NPLAYERS - 1);
  const arr = (of, max, len) => ({ t: 'a', of, max, len });
  const obj = (req, opt = {}) => ({ t: 'o', req, opt });
  const tuple = (...of) => ({ t: 't', of });
  const oneOf = (vals) => ({ t: 'e', vals });
  const cards = (max = 300) => arr(CARD, max);
  const action = obj({ k: int(0, 32) }, {
    card: CARD, sp: int(0, 16), ma: int(0, 255), space: SPACE, xs: arr(SPACE, 16), bocean: SPACE, or: SMALL, rtc: CARD, rtc2: CARD,
    atp: PL, rm: tuple(N, N), bpay: SMALL, steal: oneOf(RES_NAMES), stealn: N, atc: CARD, pss: N, disc: cards(), ai: SMALL,
    spend: SMALL, rfc: CARD, buy: N, var: N, pt: oneOf(RES_NAMES), free: BIT, burn: BIT,
    pay: obj({}, { mc: N, steel: N, ti: N, heat: N, crp: arr(obj({}, { card: CARD, res: oneOf(RES_NAMES), n: N, v: N }), 16) }),
  });
  const standing = arr(N, 8);
  const player = obj({
    id: PL0, name: { t: 's', re: PLAYER_NAME }, corp: CARD, tr: N, res: arr(N, 6, 6), prod: arr(N, 6, 6), tags: arr(N, 16),
    hand: cards(), hdisc: arr(N, 300), played: cards(), events: cards(), preludes: cards(50), cres: { t: 'm', val: N }, act: cards(),
    steelv: N, tiv: N, cities: N, greens: N, vp: obj({ total: N, tr: N, cards: N, green: N, city: N, ms: N, aw: N }),
  }, { dcorps: cards(20), dpre: cards(20), dproj: cards(50) });
  const view = obj({
    gen: int(0, 999), phase: int(0, 16), active: PL, an: SMALL, passed: int(0, 255), first: PL, human: PL0, map: int(mapId, mapId),
    deck: N, discard: N, temp: int(-99, 99), oxy: int(-99, 99), oceans: int(-99, 99), stage: int(0, 8), moves: N,
    claims: arr(tuple(SPACE, PL), 128), order: arr(PL0, 8), tiles: arr(tuple(SPACE, int(0, 32), PL), 256),
    ms: arr(obj({ name: { t: 'fixed', of: 'ms', f: 'name' }, crit: { t: 'fixed', of: 'ms', f: 'crit' }, thr: N, owner: PL, v: standing }), lm.ms.length, lm.ms.length),
    aw: arr(obj({ name: { t: 'fixed', of: 'aw', f: 'name' }, crit: { t: 'fixed', of: 'aw', f: 'crit' }, funder: PL, v: standing }), lm.aw.length, lm.aw.length),
    msn: SMALL, awn: SMALL, winner: PL, tie: BIT, players: arr(player, NPLAYERS, NPLAYERS),
    pending: obj({ kind: int(0, 32), player: PL }, {
      tile: SMALL, spaces: arr(SPACE, 256), cards: cards(), keep: SMALL, drafted: cards(), n: N,
      buy: obj({}, { card: CARD, src: N, can: BIT }),
      trig: obj({}, { e: N, src: N, card: N, i: N, n: N, res: N, order: arr(N, 64) }),
    }),
    last: obj({ kind: int(0, 32), player: PL, space: int(-1, 255), card: CARD, act: action }, { bought: N, bcard: CARD, topt: N, tdisc: CARD }),
  }, { bought: arr(N, 8), reveal: obj({ player: PL, pub: BIT, src: CARD, cards: arr(tuple(CARD, PL), 600) }, { trig: arr(tuple(CARD, SMALL), 8) }), fizzle: CARD });
  const ans = obj({ a: oneOf(ANS_KINDS) }, {
    card: CARD, cards: cards(), corp: CARD, pre: cards(8), buys: cards(), space: SPACE, idx: int(0, 99999), yes: BIT, opt: SMALL,
    pay: obj({}, { mc: N, steel: N, ti: N, heat: N, k: N }),
  });

  const memo = new WeakMap();
  // k: the index of the nearest list item (a milestone's / award's slot)
  const walk = (s, x, at, k = -1) => {
    switch (s.t) {
      case 'i': if (!Number.isInteger(x) || x < s.lo || x > s.hi) fail(`${at}: ${JSON.stringify(x)?.slice(0, 40)} not in [${s.lo}, ${s.hi}]`); return x;
      case 'e': if (!s.vals.includes(x)) fail(`${at}: unexpected value`); return x;
      case 's': if (typeof x !== 'string' || !s.re.test(x)) fail(`${at}: bad text`); return x;
      case 'fixed':                                           // this map's milestone / award names, by position
        if (typeof x !== 'string' || x !== lm[s.of][k]?.[s.f]) fail(`${at}: not this map's`); return x;
    }
    if (x === null || typeof x !== 'object') fail(`${at}: expected ${s.t === 'a' || s.t === 't' ? 'a list' : 'an object'}`);
    let m = memo.get(x);
    const hit = m?.get(s);
    if (hit && hit.k === k) return hit.out;
    let out;
    if (s.t === 'a' || s.t === 't') {
      if (!Array.isArray(x)) fail(`${at}: expected a list`);
      const len = s.t === 't' ? s.of.length : s.len;
      if ((len != null && x.length !== len) || (s.max != null && x.length > s.max)) fail(`${at}: ${x.length} items`);
      out = new Array(x.length);
      for (let i = 0; i < x.length; i++) out[i] = walk(s.t === 't' ? s.of[i] : s.of, x[i], at + '.' + i, i);
    } else if (s.t === 'o') {
      if (Array.isArray(x)) fail(`${at}: expected an object`);
      out = {};
      for (const key of Object.keys(s.req)) {
        if (!Object.prototype.hasOwnProperty.call(x, key)) fail(`${at}.${key}: missing`);
        out[key] = walk(s.req[key], x[key], at + '.' + key, k);
      }
      for (const key of Object.keys(s.opt)) if (Object.prototype.hasOwnProperty.call(x, key) && x[key] !== undefined) out[key] = walk(s.opt[key], x[key], at + '.' + key, k);
    } else if (s.t === 'm') {                                   // {"<card id>": count}
      if (Array.isArray(x)) fail(`${at}: expected an object`);
      out = {};
      const keys = Object.keys(x);
      if (keys.length > 64) fail(`${at}: too many keys`);
      for (const key of keys) {
        if (!/^\d{1,4}$/.test(key) || +key >= C) fail(`${at}: bad key`);
        out[key] = walk(s.val, x[key], at + '.' + key, k);
      }
    } else fail('schema');
    if (!m) memo.set(x, (m = new Map()));
    m.set(s, { k, out });
    return out;
  };

  // decoded and checked a view at a time (a bad one stops the work at once); the copying
  // budget: a real game's views take ~200 per step
  const budget = { n: 4e6 }, views = [];
  let prev = null;
  r.steps.forEach((st, i) => {
    if (!isObj(st)) fail(`step ${i}`);
    let v;
    try { v = st.v !== undefined ? st.v : jpatch(prev, st.d, budget); } catch { fail(`step ${i}: bad diff`); }
    views.push(walk(view, v, `step ${i}`));
    prev = v;
  });
  const human = views[0].human;
  if (views.some((v) => v.human !== human)) fail('the human seat changes');
  const steps = r.steps.map((st, i) => {
    const o = {};
    if (st.who === 'human' || st.who === 'bot') o.who = st.who;
    if (st.kind != null) o.kind = walk(int(0, 32), st.kind, `step ${i}.kind`);
    if (st.ans != null) o.ans = walk(ans, st.ans, `step ${i}.ans`);
    if (st.cut) o.cut = 1;
    return o;
  });
  // a whole recording (both seats' secrets kept: the recorder's `full`, or seen in the views themselves)
  const full = r.full === 1 || views.some((v) => v.players.some((p) => p.id !== v.human && p.hand.some((c) => c >= 0)));
  return { views, steps, partial: !!r.partial, full };
}
