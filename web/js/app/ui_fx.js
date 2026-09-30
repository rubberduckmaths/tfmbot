// ui_fx.js -- UiFx, small motion for the 2D layer. Nothing here blocks input or
// holds up the game flow: every effect runs on its own on the #flyer layer
// (pointer-events: none) or on the element's text, and the game carries on.
// Off under ?fast and when the system asks for reduced motion.
//
//  * counters (TR, VP, resource stocks) tick from what was shown to the new
//    value, with a pulse, and TR / VP float a small "+N";
//  * a card you play flies from its place in your hand to your board; the
//    bot's played cards (already shown by anim.js flyCard) glow in its colour and the
//    receiving board pulses as they land;
//  * production: at a new generation energy slides over into heat and each
//    production box pours its icons into its stock; a "Generation N" banner
//    sweeps across;
//  * game over: the score table counts up row by row, the winner's column
//    lights up, and a little gold confetti falls.
// The bot's hand is never shown: only cards it has played reach this module.
import { cardEl, RES } from '../cards/cards.js';
import { t, isEnglish } from '../i18n.js';
import { $, h } from '../dom.js';

export class UiFx {
  constructor({ fast = false } = {}) {
    let reduced = false;
    try { reduced = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch {}
    this.off = fast || reduced;
    this.quiet = true;           // set by app.js present(): no ticking on the first view, a new game, an undo
    this.shown = new Map();      // key -> value currently displayed (may be mid-tick)
    this.target = new Map();     // key -> latest value asked for
    this.els = new Map();        // key -> [element, format]
    this.ticks = new Map();      // key -> { from, to, t0, dur }
    this.holding = false;        // app.js present(): a move's resource changes wait for its card / cost animations
    this.held = new Set();
    this.kgen = new Map();       // key -> bumped whenever its counter moves NOT held (a snapshot taken before is then stale)
    this.handRects = new Map();  // card id -> its last on-screen rect in your hand
    this.raf = 0;
    this.speed = 1;              // chrome.js setAnimSpeed: Settings > Animation speed (a fraction of the normal durations; 0 = instant)
  }
  get layer() { return $('#flyer'); }
  d(ms) { return ms * this.speed; }

  // ---------------------------------------------------------------- counters
  // after a player panel is (re)drawn: bind its counters and tick any that changed
  panel(el, pid, p) {
    const list = [[el.querySelector('.badge.tr'), 'tr', p.tr, (v) => t('pb.tr', { n: v }), true], [el.querySelector('.badge.vp'), 'vp', p.vp.total, (v) => t('pb.vp', { n: v }), true]];
    el.querySelectorAll('.res .rc .amt').forEach((a, r) => list.push([a, 'r' + r, p.res[r], (v) => String(v), false]));
    el.querySelectorAll('.res .rc .pbx').forEach((a, r) => list.push([a, 'p' + r, p.prod[r], (v) => (v >= 0 ? '+' : '') + v, false]));   // production too (Energy Tapping...)
    for (const [e, name, val, fmt, float] of list) {
      if (!e) continue;
      const key = pid + ':' + name;
      this.els.set(key, [e, fmt]);
      const cur = this.shown.get(key), was = this.target.get(key);
      this.target.set(key, val);
      if (cur == null || this.quiet || this.off) { if (cur !== val) this.kgen.set(key, (this.kgen.get(key) || 0) + 1); this.shown.set(key, val); this.ticks.delete(key); continue; }
      if (was !== val && this.holding && /^[rp]\d/.test(name)) { this.held.add(key); e.textContent = fmt(Math.round(cur)); continue; }
      if (was !== val) {
        this.kgen.set(key, (this.kgen.get(key) || 0) + 1);
        // a new target: tick from what is on screen now
        this.ticks.set(key, { from: cur, to: val, t0: performance.now(), dur: Math.max(1, this.d(name.startsWith('r') ? 520 : 700)) });
        e.classList.remove('tick'); void e.offsetWidth; e.classList.add('tick');
        if (float && val !== was) queueMicrotask(() => this.floatDelta(e, val - was));   // (once the panel is in the page)
        this.loop();
      }
      e.textContent = fmt(Math.round(this.shown.get(key)));
    }
  }
  // app.js present(): a move's resource counters are held (they keep showing the old values) ...
  hold() { this.holding = true; }
  // ... and taken as a snapshot of their new values ...
  take() {
    this.holding = false;
    const snap = new Map();
    for (const key of this.held) snap.set(key, [this.target.get(key), this.kgen.get(key) || 0]);
    this.held.clear();
    return snap;
  }
  // ... which they tick to later (unless they have moved on unheld since: an undo, a new generation)
  tickTo(snap) {
    const t0 = performance.now();
    for (const [key, [to, g]] of snap) {
      if ((this.kgen.get(key) || 0) !== g) continue;
      const from = this.shown.get(key);
      if (from == null || from === to) continue;
      this.ticks.set(key, { from, to, t0, dur: Math.max(1, this.d(520)) });
      const [e] = this.els.get(key) || [];
      if (e?.isConnected) { e.classList.remove('tick'); void e.offsetWidth; e.classList.add('tick'); }
    }
    this.loop();
  }
  loop() {
    if (this.raf) return;
    const step = () => {
      const now = performance.now();
      for (const [key, t] of this.ticks) {
        const k = Math.max(0, Math.min(1, (now - t.t0) / t.dur)), e = 1 - Math.pow(1 - k, 3);
        const v = t.from + (t.to - t.from) * e;
        this.shown.set(key, k >= 1 ? t.to : v);
        const [el, fmt] = this.els.get(key) || [];
        if (el && el.isConnected) el.textContent = fmt(Math.round(this.shown.get(key)));
        if (k >= 1) this.ticks.delete(key);
      }
      this.raf = this.ticks.size ? requestAnimationFrame(step) : 0;
    };
    this.raf = requestAnimationFrame(step);
  }
  floatDelta(el, d) {
    if (!d || !this.layer || !el.isConnected) return;
    const r = el.getBoundingClientRect(), f = h('div', 'uifloat' + (d < 0 ? ' neg' : ''), (d > 0 ? '+' : '−') + Math.abs(d));
    f.style.left = `${r.left + r.width / 2}px`; f.style.top = `${r.top}px`;
    this.layer.appendChild(f);
    f.animate([{ transform: 'translate(-50%, 0) scale(.7)', opacity: 0 }, { transform: 'translate(-50%, -14px) scale(1.1)', opacity: 1, offset: 0.25 }, { transform: 'translate(-50%, -34px) scale(1)', opacity: 0 }],
      { duration: this.d(1100), easing: 'ease-out', fill: 'both' }).finished.then(() => f.remove());
  }

  // ---------------------------------------------------------------- card plays
  // renderHand calls this before it clears the hand: remember where each card was
  noteHand(hand) {
    if (!hand) return;
    for (const c of hand.querySelectorAll('.card[data-id]')) { const r = c.getBoundingClientRect(); if (r.width) this.handRects.set(+c.dataset.id, r); }
  }
  // your played cards fly from where they sat in your hand to your board
  handToBoard(ids, pid, db, color) {
    if (this.off || !this.layer) return;
    const panel = $(`.pb[data-p="${pid}"]`);
    if (!panel) return;
    const to = panel.getBoundingClientRect();
    ids.forEach((id, i) => {
      const from = this.handRects.get(id), card = db.get(id);
      this.handRects.delete(id);
      if (!from || !card) return;
      const el = cardEl(card);
      el.classList.add('uifly');
      el.style.setProperty('--pc', color);
      el.style.left = `${from.left}px`; el.style.top = `${from.top}px`; el.style.width = `${from.width}px`;
      this.layer.appendChild(el);
      const dx = to.left + to.width / 2 - (from.left + from.width / 2), dy = to.top + to.height / 2 - (from.top + from.height / 2);
      el.animate([
        { transform: 'translate(0,0) scale(1) rotate(0deg)', opacity: 1 },
        { transform: `translate(${dx * 0.45}px, ${dy * 0.35 - 60}px) scale(.8) rotate(-6deg)`, opacity: 1, offset: 0.45 },
        { transform: `translate(${dx}px, ${dy}px) scale(.18) rotate(2deg)`, opacity: 0.2 },
      ], { duration: this.d(760), delay: this.d(i * 120), easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'both' }).finished.then(() => { el.remove(); this.settle(pid); });
    });
  }
  // a card has landed on a board: the board glows softly, its played-cards count bumps
  settle(pid) {
    if (this.off) return;
    const panel = $(`.pb[data-p="${pid}"]`);
    if (!panel) return;
    panel.classList.remove('receive'); void panel.offsetWidth; panel.classList.add('receive');
    const n = panel.querySelectorAll('.foot .fc b')[1];
    if (n) { n.classList.remove('tick'); void n.offsetWidth; n.classList.add('tick'); }
  }

  // ---------------------------------------------------------------- production
  genBanner(gen) {
    if (this.off || !this.layer) return false;
    const b = h('div', 'genbanner', `<span>${t('gen.word')}</span><b>${gen}</b>`);
    this.layer.appendChild(b);
    b.animate([
      { transform: 'translate(-50%, -50%) scaleX(.2)', opacity: 0, clipPath: 'inset(0 50% 0 50%)' },
      { transform: 'translate(-50%, -50%) scaleX(1)', opacity: 1, clipPath: 'inset(0 0 0 0)', offset: 0.18 },
      { transform: 'translate(-50%, -50%) scaleX(1)', opacity: 1, clipPath: 'inset(0 0 0 0)', offset: 0.75 },
      { transform: 'translate(-50%, -50%) scaleX(1.04)', opacity: 0, clipPath: 'inset(0 0 0 0)' },
    ], { duration: this.d(1500), easing: 'ease-out', fill: 'both' }).finished.then(() => b.remove());
    return true;
  }
  // at a generation change: energy slides over into heat, then each production box pours into its stock
  pour(a, b) {
    if (this.off || !this.layer) return;
    for (const pb of b.players) {
      const pa = a.players[pb.id], panel = $(`.pb[data-p="${pb.id}"]`);
      if (!pa || !panel) continue;
      const cells = panel.querySelectorAll('.res .rc');
      const at = (el) => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
      const fly = (r, from, to, delay) => {
        const f = h('img', 'uipour'); f.src = `assets/res/${RES[r]}.png`;
        f.style.left = `${from[0]}px`; f.style.top = `${from[1]}px`;
        this.layer.appendChild(f);
        const dx = to[0] - from[0], dy = to[1] - from[1];
        f.animate([
          { transform: 'translate(-50%,-50%) scale(.4)', opacity: 0 },
          { transform: `translate(calc(-50% + ${dx * 0.5}px), calc(-50% + ${dy * 0.5 - 12}px)) scale(1)`, opacity: 1, offset: 0.4 },
          { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.6)`, opacity: 0 },
        ], { duration: this.d(560), delay: this.d(delay), easing: 'ease-in-out', fill: 'both' }).finished.then(() => f.remove());
      };
      // leftover energy becomes heat
      const en = Math.min(4, pa.res[4] || 0);
      if (en > 0 && cells[4] && cells[5]) for (let i = 0; i < en; i++) fly(4, at(cells[4].querySelector('.amt') || cells[4]), at(cells[5].querySelector('.amt') || cells[5]), i * 90);
      // production pours in (M€ production counts the TR too, as the engine pays it)
      pb.res.forEach((x, r) => {
        const gain = x - pa.res[r] + (r === 5 ? -(pa.res[4] || 0) : 0);
        if (gain <= 0 || !cells[r]) return;
        const src = cells[r].querySelector('.pbx') || cells[r], dst = cells[r].querySelector('.amt') || cells[r];
        for (let i = 0; i < Math.min(4, gain); i++) fly(r, at(src), at(dst), 380 + r * 70 + i * 110);
      });
    }
  }

  // ---------------------------------------------------------------- game over
  // the score table (cells tagged data-v) counts up row by row; then the winner's column lights, and a little gold falls
  gameOver(box, winnerId) {
    if (this.off) return;
    const cells = [...box.querySelectorAll('td[data-v]')];
    const rows = [...new Set(cells.map((c) => c.dataset.r))].filter((r) => r !== 'total');
    const order = [...rows, 'total'];
    cells.forEach((c) => { c.textContent = '0'; });
    order.forEach((r, i) => {
      setTimeout(() => {
        for (const c of cells.filter((x) => x.dataset.r === r)) {
          const to = +c.dataset.v, t0 = performance.now(), dur = Math.max(1, this.d(r === 'total' ? 900 : 500));
          const step = () => { const k = Math.min(1, (performance.now() - t0) / dur); c.textContent = String(Math.round(to * (1 - Math.pow(1 - k, 3)))); if (k < 1) requestAnimationFrame(step); };
          requestAnimationFrame(step);
          c.classList.add('tallied');
        }
        if (r === 'total') setTimeout(() => {
          for (const c of box.querySelectorAll(`[data-p="${winnerId}"]`)) c.classList.add('winner');
          this.confetti();
        }, this.d(950));
      }, this.d(250 + i * 260));
    });
  }
  confetti() {
    if (!this.layer) return;
    const cv = h('canvas', 'uiconfetti'), dpr = Math.min(2, devicePixelRatio || 1);
    cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
    this.layer.appendChild(cv);
    const g = cv.getContext('2d'), N = Math.min(90, Math.round(innerWidth / 14)), P = [];
    const cols = ['#f7d774', '#ffcf6a', '#fff1c1', '#e8b34a', '#ffffff'];
    for (let i = 0; i < N; i++) P.push({ x: Math.random() * innerWidth, y: -20 - Math.random() * innerHeight * 0.4, vy: 60 + Math.random() * 90, vx: (Math.random() - 0.5) * 40, r: Math.random() * 6.28, vr: (Math.random() - 0.5) * 8, s: 3 + Math.random() * 4, c: cols[i % cols.length] });
    const t0 = performance.now();
    let last = t0;
    const step = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000), age = (now - t0) / 1000; last = now;
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, innerWidth, innerHeight);
      g.globalAlpha = Math.max(0, Math.min(1, 3.2 - age));
      for (const p of P) {
        p.x += p.vx * dt + Math.sin(age * 2 + p.r) * 12 * dt; p.y += p.vy * dt; p.r += p.vr * dt;
        g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c; g.fillRect(-p.s / 2, -p.s * 0.3, p.s, p.s * 0.6); g.restore();
      }
      if (age < 3.3) requestAnimationFrame(step); else cv.remove();
    };
    requestAnimationFrame(step);
  }

  // ---------------------------------------------------------------- the game log
  // small icons inline, from the text itself (nothing the text doesn't already
  // say): resource amounts get their icon, tiles their hex, and a card name a
  // chip in its card colour
  decorateLog(html, db) {
    if (!html) return html;
    const RI = { 'M€': 'megacredit', steel: 'steel', titanium: 'titanium', plant: 'plant', plants: 'plant', energy: 'power', heat: 'heat', card: 'card', cards: 'card' };
    const TI = { city: 'city', greenery: 'greenery', ocean: 'ocean' };
    const byName = db?.byName;
    if (!isEnglish()) return this.decorateLogL(html, db);
    let inB = false;
    return html.split(/(<[^>]+>)/).map((part) => {
      if (part.startsWith('<')) {
        if (/^<b[\s>]/.test(part)) inB = true;
        else if (/^<\/b>/.test(part)) inB = false;
        return part;
      }
      if (inB) return part;
      return part
        .replace(/(\d+)\s?(M€|steel|titanium|plants?|energy|heat|cards?)(?![\w-])/g, (m, n, w) => `${n}<img class="li" src="assets/res/${RI[w]}.png" alt="${w}" title="${w}">`)
        .replace(/\b(city|greenery|ocean)(?= tile|\b)/g, (m, w) => `<img class="li hex" src="assets/tiles/${TI[w]}.png" alt="">${w}`);
    }).join('').replace(/<b>([^<]{2,60})<\/b>/g, (m, name) => {
      const c = byName?.get(name.replace(/&amp;/g, '&'));
      return c ? `<b class="lc t${c.type}" data-card="${c.id}" title="${name}">${name}</b>` : m;
    });
  }
  // the same in other languages: resource words from the language's own res.* strings
  // ("5 acier" / "5 Stahl"), card chips by localized or English name; tiles keep their words
  decorateLogL(html, db) {
    const RI = new Map([['m€', 'megacredit']]);
    ['megacredit', 'steel', 'titanium', 'plant', 'power', 'heat'].forEach((ic, r) => { if (r) RI.set(t('res.' + r).toLowerCase(), ic); });
    [['rn.steel', 'steel'], ['rn.titanium', 'titanium'], ['rn.plants', 'plant'], ['rn.energy', 'power'], ['rn.heat', 'heat']].forEach(([k, ic]) => RI.set(t(k).toLowerCase(), ic));
    const words = [...RI.keys()].filter(Boolean).sort((a, b) => b.length - a.length).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const re = new RegExp(`(\\d+)\\s?(${words.join('|')})(?![\\p{L}\\p{N}-])`, 'giu');
    let inB = false;
    return html.split(/(<[^>]+>)/).map((part) => {
      if (part.startsWith('<')) { if (/^<b[\s>]/.test(part)) inB = true; else if (/^<\/b>/.test(part)) inB = false; return part; }
      if (inB) return part;
      return part.replace(re, (m, n, w) => { const ic = RI.get(w.toLowerCase()); return ic ? `${n}<img class="li" src="assets/res/${ic}.png" alt="${w}" title="${w}">` : m; });
    }).join('').replace(/<b>([^<]{1,60})<\/b>/g, (m, name) => {
      const c = db?.byAnyName?.(name.replace(/&amp;/g, '&'));
      return c ? `<b class="lc t${c.type}" data-card="${c.id}" title="${name}">${name}</b>` : m;
    });
  }
}
