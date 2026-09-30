// hand.js -- App's hand of cards: the fanned row (a swipeable strip on phones), drag-to-play onto the board,
// panning, the zoomed card, why a card cannot be played, and the hex tooltip.
import { TAGS, cardEl, cardName } from '../cards/cards.js';
import { has as tHas, t, tj } from '../i18n.js';
import { $, h, esc } from '../dom.js';
import { D } from '../protocol.js';
import { BONUS_NAME, LORE, TILE_NAME } from './content.js';
import { PCOL, REPLAY, spaceName } from './shared.js';

export class AppHand {
  // The hand: a tidy row of card headers peeking up from the bottom edge
  // (cost, tags, name, production box readable); hover / tap lifts a card.
  renderHand() {
    const v = this.view, hand = $('#hand');
    this.uiFx.noteHand(hand);                         // where each card sat (a played one flies from there)
    hand.innerHTML = '';
    const me = v.players[v.human];
    const ent = this.myTurn() && (v.pending.kind === D.ACTION || v.pending.kind === D.PRELUDE_PLAY) ? this.entries() : new Map();
    // while choosing which revealed cards to keep (Business Contacts...), the engine's
    // provisional picks already sit in the hand: hide them until the choice is made
    const pend = v.pending.kind === D.KEEP && v.pending.player === v.human ? [...(v.pending.cards || [])] : [];
    const shown = me.hand.map((c, i) => [c, i]).filter(([c]) => { const j = pend.indexOf(c); if (j < 0) return true; pend.splice(j, 1); return false; });
    const cards = shown.map(([c, i]) => ({ c, card: this.db.get(c), playable: ent.has('card:' + c), disc: (me.hdisc || [])[i] || 0 })).filter((x) => x.card);
    if (ent.size) cards.sort((x, y) => (y.playable - x.playable) || (x.card.cost - y.card.cost));
    const n = cards.length;
    // narrow portrait: a swipeable strip of non-overlapping cards instead
    const strip = innerWidth <= 640 && innerHeight > innerWidth;
    hand.classList.toggle('strip', strip);
    if (strip) {
      cards.forEach(({ card, playable, disc }) => {
        const el = cardEl(card, { discount: disc, onClick: (cd) => { if (this.dragged) return; this.audio.tick(); this.zoomCard(cd, REPLAY == null); } });
        if (REPLAY == null) this.bindCardDrag(el, card, playable);
        if (ent.size && !playable) el.classList.add('dim');
        if (playable) el.classList.add('pick');
        el.querySelectorAll('.req').forEach((chip, k) => { const ok = this.reqMet(card.req[k]); if (ok !== null) chip.classList.add(ok ? 'ok' : 'bad'); });
        hand.appendChild(el);
      });
      return;
    }
    const cs = getComputedStyle(hand);
    const hs = (parseFloat(cs.getPropertyValue('--hs')) || 1) * (this.cardZoom || 1);   // (app.css scales the cards by --cz: Settings > Card size)
    const avail = Math.max(200, innerWidth - 24);
    const cw = 118 * hs;
    // spacing never drops below this (headers stay readable); past that the
    // hand becomes a row you pan by resting on its left / right end
    // (a big hand overlaps tighter -- cost and the start of the name still show, and hovering a card lifts it whole --
    // before it turns into a row you pan, where cards are easy to lose track of)
    const minSp = cw * (n > 14 ? 0.46 : 0.72);
    const fitSp = n > 1 ? (avail - cw) / (n - 1) : 0;
    const spacing = n > 1 ? Math.min(cw + 6, Math.max(minSp, fitSp)) : 0;
    const total = (n - 1) * spacing + cw;
    this.handMax = Math.max(0, total - avail);
    this.handScroll = Math.min(this.handScroll || 0, this.handMax);
    const scrolling = this.handMax > 0;
    cards.forEach(({ card, playable, disc }, i) => {
      const el = cardEl(card, { discount: disc, onClick: (cd) => { if (this.handPanned || this.dragged) return; this.audio.tick(); this.zoomCard(cd, REPLAY == null); } });
      if (REPLAY == null) this.bindCardDrag(el, card, playable);
      if (ent.size && !playable) el.classList.add('dim');
      if (playable) el.classList.add('pick');
      el.querySelectorAll('.req').forEach((chip, k) => { const ok = this.reqMet(card.req[k]); if (ok !== null) chip.classList.add(ok ? 'ok' : 'bad'); });
      const off = i - (n - 1) / 2;
      if (scrolling) el.style.left = `${12 + i * spacing - (118 - cw) / 2}px`;
      else el.style.left = `calc(50% + ${off * spacing - 59}px)`;
      el.style.setProperty('--rot', scrolling ? '0deg' : `${off * (spacing < cw * 0.6 ? 0.6 : 1.2)}deg`);
      el.style.setProperty('--lift', scrolling ? '0px' : `${Math.abs(off) * Math.abs(off) * 0.25}px`);
      el.style.zIndex = String(10 + i);
      hand.appendChild(el);
    });
    hand.style.transform = scrolling ? `translateX(${-this.handScroll}px)` : '';
    $('#handbar').classList.toggle('scrolls', scrolling);
    this.updateHandArrows();
    if (n) { const badge = h('div', 'hand-n', esc(t('hand.count', { n }) + (ent.size ? t('hand.playable', { n: cards.filter((x) => x.playable).length }) : ''))); hand.appendChild(badge); }
  }

  // drag a hand card up into the middle of the screen to play it
  bindCardDrag(el, card, playable) {
    let st = null;
    el.addEventListener('pointerdown', (e) => {
      if (e.button > 0) return;
      st = { x: e.clientX, y: e.clientY, id: e.pointerId, ghost: null };
      this.dragged = false;
      // moves are followed from the window: on a slow frame the first (coalesced) move
      // can already be off the card. The hand can also re-render mid-drag (a bot move
      // lands): the drag is finished from the window, whatever happens to this element
      addEventListener('pointermove', move); addEventListener('pointerup', end); addEventListener('pointercancel', end);
    });
    // the ghost is moved once per frame, by transform only (its own compositor layer: no
    // layout, no repaint), to the latest pointer position however the events bunch up
    const paint = () => {
      if (!st?.ghost) return;
      st.raf = 0;
      const dx = st.cx - st.x, dy = st.cy - st.y, zone = st.cy < innerHeight * 0.66;
      // a tile card over one of its candidate hexes: that hex lights up with the tile over it,
      // and the card shrinks up off the fingertip so the hex can be seen
      if (st.drop) {
        const hx = this.dropHex(st.drop, st.cx, st.cy, st.touch);
        if (hx !== st.hx) { st.hx = hx; this.boardHover(hx); st.ghost.classList.toggle('onhex', hx >= 0); }
      }
      st.ghost.style.transform = st.hx >= 0 ? `translate3d(${st.cx - st.gl - st.gw / 2}px, ${st.cy - 26 - st.gt - st.gh}px, 0) scale(.5)`
        : `translate3d(${dx}px, ${dy}px, 0) rotate(${Math.max(-8, Math.min(8, dx / 30))}deg) scale(${zone ? 1.15 : 1})`;
      if (zone !== st.zone) { st.zone = zone; st.ghost.classList.toggle('armed', zone && playable); st.ghost.classList.toggle('nope', zone && !playable); }
    };
    const move = (e) => {
      if (!st || e.pointerId !== st.id) return;
      if (!e.buttons) return end({ pointerId: e.pointerId, type: 'pointercancel', clientY: innerHeight });   // the release was missed (outside the window)
      const dx = e.clientX - st.x, dy = e.clientY - st.y;
      if (!st.ghost) {
        if (dy > -14 || Math.abs(dy) < Math.abs(dx)) return;     // must be an upward drag
        try { el.setPointerCapture?.(e.pointerId); } catch {}   // (throws if the pointer was already released)
        const r = el.getBoundingClientRect();
        const g = cardEl(card);
        g.classList.add('dragghost');
        g.style.left = `${r.left + r.width / 2 - 59}px`; g.style.top = `${r.top}px`;
        $('#flyer').appendChild(g);
        st.ghost = g; st.r = r;
        st.gl = r.left + r.width / 2 - 59; st.gt = r.top; st.gw = g.offsetWidth || 118; st.gh = g.offsetHeight || 165;
        st.touch = e.pointerType !== 'mouse'; st.hx = -1;
        // the drag is on: a card that places a tile shows where it can go, and can be dropped right there
        st.drop = playable && !this.flow ? this.dropTargets(card) : null;
        if (st.drop) { this.board.highlight(st.drop.spaces, null, st.drop.kind); this.board.dragDirty = true; $('#ui').classList.add('drophex'); }
        el.classList.add('dragging');
        $('#ui').classList.add('dropping');
        this.dragged = true;
        this.audio.card();
      }
      st.cx = e.clientX; st.cy = e.clientY;
      this.board.dragAt = performance.now();          // board/board3d.js: no scene renders while a card is moving
      if (!st.raf) st.raf = requestAnimationFrame(paint);
    };
    const end = (e) => {
      if (!st || e.pointerId !== st.id) return;
      const g = st.ghost, drop = st.drop; st = null;
      removeEventListener('pointermove', move); removeEventListener('pointerup', end); removeEventListener('pointercancel', end);
      if (!g) return;
      this.board.dragAt = 0;
      $('#ui').classList.remove('dropping');
      el.classList.remove('dragging');
      const zone = e.type === 'pointerup' && e.clientY < innerHeight * 0.66;
      const hx = drop && e.type === 'pointerup' ? this.dropHex(drop, e.clientX, e.clientY, e.pointerType !== 'mouse') : -1;
      if (drop) { this.boardHover(-1); this.board.clearHighlight(); this.board.dragDirty = true; $('#ui').classList.remove('drophex'); }
      g.remove();
      document.querySelectorAll('#flyer .dragghost').forEach((x) => x.remove());   // never leave one behind
      if (hx >= 0) this.startFlow('card:' + card.id, hx);                // dropped on a hex: the tile goes there (payment still asked first)
      else if (zone && playable) this.startFlow('card:' + card.id);
      else if (zone) { this.audio.bad(); this.toast(this.whyNot(card, true), '#ff9b9b'); }
      setTimeout(() => { this.dragged = false; }, 50);
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('lostpointercapture', (e) => { if (st?.ghost && !el.isConnected) end(Object.assign({}, { pointerId: e.pointerId, type: 'pointercancel', clientY: innerHeight })); });
  }

  // the hexes a hand card's tile can go on right now (from its legal plays), or null if it places none
  dropTargets(card) {
    const idxs = this.entries().get('card:' + card.id);
    if (!idxs) return null;
    const set = new Set();
    for (const i of idxs) { const a = this.legal[i]; if (a.space == null) continue; set.add(a.space); for (const x of a.xs || []) set.add(x); }
    if (!set.size) return null;
    const cd = this.db.get(card.id);
    return { set, spaces: [...set], kind: cd?.city ? 'city' : cd?.greenery ? 'greenery' : cd?.ocean ? 'ocean' : 'special' };
  }
  // the candidate hex under a point, or -1 (not through a panel over the board)
  dropHex(drop, x, y, touch) {
    const b = this.board;
    let s = b.pickAt ? b.pickAt(x, y, touch) : b.pick({ clientX: x, clientY: y });
    if (touch && !drop.set.has(s) && b.nearestCandidate) { const n = b.nearestCandidate(x, y); if (n >= 0) s = n; }
    if (!drop.set.has(s)) return -1;
    const top = document.elementsFromPoint(x, y).find((e) => !e.closest('#flyer'));     // (under the dragged card)
    return top?.closest('#gl') ? s : -1;
  }
  boardHover(s) {
    const b = this.board;
    if (b.setHover) b.setHover(s); else { b.hoverSpace = s; b.showGhost(s); }
    b.dragDirty = true;
  }

  updateHandArrows() {
    const bar = $('#handbar');
    bar.classList.toggle('can-left', this.handMax > 0 && this.handScroll > 1);
    bar.classList.toggle('can-right', this.handMax > 0 && this.handScroll < this.handMax - 1);
  }
  // rest the pointer (or hold a finger) on the hand's left / right end to pan it
  bindHandPan() {
    const EDGE = 110;
    let dir = 0, raf = 0, holdT = 0;
    const inHand = (e) => e.clientY > innerHeight - ($('#handbar').getBoundingClientRect().height || 124) - 30;   // (--hand-h is a calc(): Settings > Card size)
    const zoneDir = (e) => (!this.handMax || !inHand(e)) ? 0 : e.clientX < EDGE ? -1 : e.clientX > innerWidth - EDGE ? 1 : 0;
    let last = 0;
    const step = (t) => {
      if (!dir) { raf = 0; last = 0; return; }
      const dt = last ? Math.min(0.1, (t - last) / 1000) : 0.016;
      last = t;
      const v = this.handScroll + dir * 650 * dt;     // px per second
      this.handScroll = Math.max(0, Math.min(this.handMax, v));
      $('#hand').style.transform = `translateX(${-this.handScroll}px)`;
      this.updateHandArrows();
      this.handPanned = true;
      raf = requestAnimationFrame(step);
    };
    const start = (d) => { dir = d; if (d && !raf) raf = requestAnimationFrame(step); };
    addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse') start(zoneDir(e));
      else if (holdT && !zoneDir(e)) start(0);
    });
    addEventListener('pointerdown', (e) => {
      this.handPanned = false;
      if (e.pointerType === 'mouse') return;
      const d = zoneDir(e);
      if (d) holdT = setTimeout(() => start(d), 220);
    });
    const stop = () => { clearTimeout(holdT); holdT = 0; if (dir) { start(0); setTimeout(() => { this.handPanned = false; }, 60); } };
    addEventListener('pointerup', stop);
    addEventListener('pointercancel', stop);
    document.addEventListener('mouseleave', () => start(0));
    // wheel over the hand also pans it
    $('#handbar').addEventListener('wheel', (e) => {
      if (!this.handMax) return;
      e.preventDefault(); e.stopPropagation();
      this.handScroll = Math.max(0, Math.min(this.handMax, this.handScroll + (e.deltaX || e.deltaY)));
      $('#hand').style.transform = `translateX(${-this.handScroll}px)`;
      this.updateHandArrows();
    }, { passive: false });
  }

  zoomCard(card, fromHand) {
    const z = $('#zoom');
    z.innerHTML = '';
    const me = this.view.players[this.view.human];
    // (the resources on it are its owner's: an opponent's card zoomed from their tableau shows theirs)
    const own = this.view.players.find((q) => q.cres?.[card.id] != null) || me;
    z.appendChild(cardEl(card, { big: true, resCount: own.cres[card.id] }));
    const side = h('div', 'side');
    if (fromHand) {
      const ent = this.entries();
      const key = 'card:' + card.id;
      if (ent.has(key)) {
        const b = h('button', 'primary', esc(t('zoom.play', { card: cardName(card) })));
        b.onclick = () => { this.closeZoom(); this.startFlow(key); };
        side.appendChild(b);
      } else if (this.myTurn() && this.view.pending.kind === D.ACTION) {
        side.appendChild(h('div', 'why', this.whyNot(card)));
      }
      if (ent.has('sell:' + card.id)) {
        const b = h('button', 'ghost', esc(t('zoom.sell')));
        b.onclick = () => { this.closeZoom(); this.answer({ a: 'sell', cards: [card.id] }); };
        side.appendChild(b);
      }
    }
    const close = h('button', 'ghost', esc(t('btn.close')));
    close.onclick = () => this.closeZoom();
    side.appendChild(close);
    z.appendChild(side);
    z.onclick = (e) => { if (e.target === z) this.closeZoom(); };
    z.classList.remove('hidden');
  }

  // is one printed requirement met right now? (null = can't tell from the view)
  reqMet(q) {
    const v = this.view, me = v.players[v.human], mx = q.max;
    const cmp = (have, need) => (mx ? have <= need : have >= need);
    if ('temperature' in q) return cmp(v.temp, q.temperature);
    if ('oxygen' in q) return cmp(v.oxy, q.oxygen);
    if ('oceans' in q) return cmp(v.oceans, q.oceans);
    if ('tag' in q) { const i = TAGS.indexOf(q.tag); return i >= 0 ? me.tags[i] >= (q.count || 1) : null; }
    if ('production' in q) { const i = ['megacredits', 'steel', 'titanium', 'plants', 'energy', 'heat'].indexOf(q.production); return i >= 0 ? me.prod[i] >= 1 : null; }
    if ('greeneries' in q) return me.greens >= q.count;
    return null;
  }

  whyNot(card, bare) {
    const v = this.view, me = v.players[v.human];
    const r = [];
    for (const q of card.req || []) {
      const mx = q.max, op = mx ? '≤' : '≥';
      if ('temperature' in q && (mx ? v.temp > q.temperature : v.temp < q.temperature)) r.push(t('why.temp', { op, n: q.temperature }));
      if ('oxygen' in q && (mx ? v.oxy > q.oxygen : v.oxy < q.oxygen)) r.push(t('why.oxy', { op, n: q.oxygen }));
      if ('oceans' in q && (mx ? v.oceans > q.oceans : v.oceans < q.oceans)) r.push(t('why.oceans', { op, n: q.oceans }));
      if ('tag' in q) { const i = TAGS.indexOf(q.tag); if (i >= 0 && me.tags[i] < (q.count || 1)) r.push(t('why.tags', { n: q.count || 1, tag: t('tag.' + q.tag) })); }
    }
    if (!r.length) r.push(t('why.cost', { cost: card.cost, have: me.res[0], extra: (me.res[1] ? t('why.steel', { n: me.res[1] }) : '') + (me.res[2] ? t('why.ti', { n: me.res[2] }) : '') }));
    return bare ? r.join('; ') : t('why.prefix', { list: r.join('; ') });
  }

  hexTip(s, e, sticky) {
    let tip = $('#hextip');
    if (!tip) { tip = h('div', 'panel'); tip.id = 'hextip'; tip.style.cssText = 'position:absolute;pointer-events:none;padding:6px 9px;font-size:12px;z-index:45;max-width:280px'; $('#ui').appendChild(tip); }
    if (s < 0 || !this.map) { tip.style.display = 'none'; return; }
    const sp = this.map.spaces[s];
    const tile = this.view?.tiles.find((x) => x[0] === s);
    const kind = t('hex.' + sp.kind) + (sp.volc ? t('hex.volcanic') : '');
    const bname = (b) => (BONUS_NAME[b] ? t('bonus.' + b) : null);
    const bonus = tj(sp.b.map(bname).filter(Boolean));
    let gain = '';
    if (this.board.highlighted.has(s)) {
      const parts = sp.b.map(bname).filter(Boolean);
      const oceans = (sp.adj || []).filter((n) => this.view.tiles.some((x) => x[0] === n && x[1] === 0)).length;
      if (oceans) parts.push(t('hex.adjOceans', { m: oceans * 2, n: oceans }));
      gain = parts.length ? `<br><span style="color:#7dffb0">${esc(t('hex.gives', { list: parts.join(' + ') }))}</span>` : `<br><span style="color:#9aa3b5">${esc(t('hex.noBonus'))}</span>`;
    }
    const loreKey = 'lore.' + sp.name;
    const lore = sp.name && LORE[sp.name] ? `<div class="lore">${esc(tHas(loreKey) ? t(loreKey) : LORE[sp.name])}</div>` : '';
    const rc = this.rowCol(s), where = rc ? `<br><span style="color:#9aa3b5">${esc(t('hex.rcTitle', { r: rc[0], c: rc[1] }))}</span>` : '';
    tip.innerHTML = `<b>${esc(sp.name ? spaceName(sp.name) : kind)}</b>${where}${gain}${sp.name ? `<br><span style="color:#9aa3b5">${esc(kind)}</span>` : ''}${bonus && !gain ? `<br>${esc(t('hex.bonus', { list: bonus }))}` : ''}${tile ? `<br>${esc(TILE_NAME[tile[1]] ? t('tile.' + tile[1]) : t('hex.tile'))}${tile[2] >= 0 ? ` · <span style="color:${PCOL[tile[2]]}">${esc(this.pname(tile[2]))}</span>` : ''}` : ''}${lore}`;
    tip.style.display = 'block';
    tip.style.left = Math.min(innerWidth - 250, e.clientX + 14) + 'px';
    tip.style.top = (e.clientY + 14) + 'px';
    if (sticky) setTimeout(() => { tip.style.display = 'none'; }, 1800);
  }
}
