// hud.js -- App's always-on screen: the global parameter tracks, the player boards, a player's tableau,
// the action panel and turn rows, the status line and toasts, and layout() (the globe's insets).
import { t, tagName } from '../i18n.js';
import { CARD_RES_ICON, RES, TAGS, cardActions, cardEl, cardName } from '../cards/cards.js';
import { $, h, esc } from '../dom.js';
import { D, AK } from '../protocol.js';
import { SP } from './content.js';
import { PCOL, PMARK_MS, STACK_N, TB_VIEWS, critName, lsPick, maName, resName, spName } from './shared.js';

// where the action panel is a drawer behind the Actions button (style: @media in app.css, #actions-toggle)
const PHONE_DRAWER = '(max-width: 640px) and (orientation: portrait)';

export class AppHud {
  toastLong(title, body) {
    let hb = $('#hintbox');
    if (!hb) { hb = h('div', 'panel hintbox'); hb.id = 'hintbox'; $('#ui').appendChild(hb); hb.onclick = () => hb.remove(); }
    hb.innerHTML = `<b>${title}</b><div class="hb">${body}</div><small>${esc(t('hint.footer'))}</small>`;
    clearTimeout(this.hbT); this.hbT = setTimeout(() => hb.remove(), 9000);
  }

  toast(msg, color) {
    const t = $('#toast');
    t.textContent = msg; t.style.color = color || '#fff';
    t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
  }

  // ---------------------------------------------------------------- rendering
  renderAll() {
    const v = this.view;
    if (!v) return;
    $('#gen').textContent = v.gen;
    this.renderTracks(v);
    $('#deckn').textContent = v.deck;
    $('#discn').textContent = `/ ${v.discard}`;
    this.renderPlayers();
    this.renderActions();
    this.renderHand();
    this.renderTurnCtl();
    this.renderStatus();
  }

  // Stepped tracks: one cell per step, bonus steps marked with their reward.
  buildTracks() {
    if (this.tracksBuilt) return;
    this.tracksBuilt = true;
    const mk = (sel, vals, bonus, label) => {
      const box = $(sel + ' .cells');
      vals.forEach((val, k) => {
        const c = h('div', 'c');
        c.dataset.v = val;
        c.style.setProperty('--k', k);
        const b = bonus[val];
        if (b) { const i = b.ocean ? h('span', 'bn ocean') : h('img', 'bn' + (b.prod ? ' prod' : '')); if (!b.ocean) i.src = b.img; c.appendChild(i); c.classList.add('bonus'); }
        if (label && label(val)) { c.classList.add('major'); c.dataset.l = label(val); }
        const what = sel === '#t-temp' ? val + ' °C' : sel === '#t-oxy' ? val + ' % O₂' : t('track.ocean', { n: val });
        c.title = b ? t('track.bonus', { what, bonus: t(b.t) }) : what;
        box.appendChild(c);
      });
    };
    const temps = []; for (let t = -28; t <= 8; t += 2) temps.push(t);
    mk('#t-temp', temps, { [-24]: { img: 'assets/res/heat.png', prod: 1, t: 'track.heatProd' }, [-20]: { img: 'assets/res/heat.png', prod: 1, t: 'track.heatProd' }, 0: { ocean: 1, t: 'track.placeOcean' } }, (x) => (x % 10 === 0 || x === 8 ? (x > 0 ? '+' : '') + x : ''));
    const oxy = []; for (let o = 1; o <= 14; o++) oxy.push(o);
    mk('#t-oxy', oxy, { 8: { img: 'assets/temperature.png', t: 'track.raiseTemp' } }, (o) => (o % 2 === 0 ? String(o) : ''));
    mk('#t-ocean', [1, 2, 3, 4, 5, 6, 7, 8, 9], {}, null);
  }
  renderTracks(v) {
    this.buildTracks();
    const set = (sel, cur, txt) => {
      $(sel + ' .val').textContent = txt;
      let last = null;
      $(sel + ' .cells').querySelectorAll('.c').forEach((c) => { const on = +c.dataset.v <= cur; c.classList.toggle('on', on); c.classList.remove('cur'); if (on) last = c; });
      if (last) last.classList.add('cur');
    };
    const mx = { temp: v.temp >= 8, oxy: v.oxy >= 14, ocean: v.oceans >= 9 };
    set('#t-temp', v.temp, `${v.temp > 0 ? '+' : ''}${v.temp}°${mx.temp ? ' ✓' : ''}`);
    set('#t-oxy', v.oxy, `${v.oxy}%${mx.oxy ? ' ✓' : ''}`);
    set('#t-ocean', v.oceans, `${v.oceans}/9${mx.ocean ? ' ✓' : ''}`);
    for (const k of ['temp', 'oxy', 'ocean']) $('#t-' + k).classList.toggle('maxed', mx[k]);
    const done = mx.temp && mx.oxy && mx.ocean;
    $('#top').classList.toggle('tfdone', done);
    let ban = $('#tf-done');
    if (done && !ban) { ban = h('div', 'tfdone-b', t('top.tfDone')); ban.id = 'tf-done'; $('#top .deck').before(ban); }
    if (!done && ban) ban.remove();
  }

  renderPlayers() {
    const v = this.view, box = $('#players');
    const feed = $('#feed');
    box.innerHTML = '';
    // the human first
    const order = [v.human, ...v.players.map((p) => p.id).filter((i) => i !== v.human)];
    for (const pid of order) {
      const p = v.players[pid];
      const el = h('div', 'pb');
      el.dataset.p = pid;
      el.style.setProperty('--pc', PCOL[pid]);
      const active = (v.phase === 2 || v.phase === 4) && v.active === pid && v.pending.kind !== D.OVER;
      const passed = (v.passed >> pid) & 1;
      if (active) el.classList.add('active');
      if (passed && v.phase === 2) el.classList.add('passed');
      const corp = p.corp >= 0 ? this.db.lname(p.corp) : t('pb.choosing');
      const first = v.first === pid ? `<span class="badge first" title="${esc(t('pb.firstTitle'))}"><img src="assets/first-player.png" alt="">${esc(t('pb.first'))}</span>` : '';
      // only what is this player's own (whose action, who passed) -- the game phase is in the status bar
      let state = '';
      if (v.phase === 2 && passed) state = `<span class="badge st">${esc(t('pb.passed'))}</span>`;
      else if (v.phase === 2 && active) state = `<span class="badge st on" title="${esc(t('pb.actionOf', { n: v.an + 1 }))}">●${v.an + 1}/2</span>`;
      else if (v.phase === 4 && active) state = `<span class="badge st on" title="${esc(t('pb.finalGreeneryOn'))}">●<img class="hx" src="assets/tiles/greenery.png" alt=""></span>`;
      const res = p.res.map((x, r) => {
        const pr = p.prod[r];
        const extra = r === 1 ? ` <b>×${p.steelv}</b>` : r === 2 ? ` <b>×${p.tiv}</b>` : '';
        const pm = this.prodMarks?.[pid + ':' + r], age = pm ? performance.now() - pm.t : Infinity;
        const mark = pm && pm.d && age >= 0 && age < PMARK_MS ? `<span class="pmark${pm.d < 0 ? ' neg' : ''}" style="animation-delay:${(-age).toFixed(0)}ms">${pm.d > 0 ? '+' : '−'}${Math.abs(pm.d)}</span>` : '';
        return `<div class="rc" title="${esc(t('pb.resTitle', { res: resName(r), n: x, p: (pr >= 0 ? '+' : '') + pr }))}"><img src="assets/res/${RES[r]}.png" alt=""><span class="amt">${x}</span><span class="pr${pr < 0 ? ' neg' : ''}${mark ? ' pchg' : ''}"><span class="pbx">${pr >= 0 ? '+' : ''}${pr}</span>${extra}${mark}</span></div>`;
      }).join('');
      // the event slot counts EVENTS PLAYED (what awards/milestones and players
      // read), not event tags; an event's other tags never count
      const tagN = (i) => (TAGS[i] === 'event' ? (p.events || []).length : p.tags[i]);
      const tags = TAGS.map((g, i) => `<span class="tg${tagN(i) ? '' : ' zero'}" title="${esc(g === 'event' ? t('pb.eventsPlayed') : tagName(g))}"><img src="assets/tags/${g}.png" alt="">${tagN(i)}</span>`).join('');
      const cardsInHand = p.hand.length;
      el.innerHTML = `
        <div class="hd"><span class="nm" style="color:${PCOL[pid]}">${esc(this.pname(pid))}</span>${first}<span class="corp" title="${esc(corp)}">${esc(corp)}</span>
          <span class="badge tr" title="${esc(t('pb.trTitle'))}"><img src="assets/res/tr.png" alt="">${esc(t('pb.tr', { n: p.tr }))}</span><span class="badge vp" title="${esc(t('pb.vpTitle'))}">${esc(t('pb.vp', { n: p.vp.total }))}</span>${state}</div>
        <div class="res">${res}</div>
        <div class="tags">${tags}</div>
        <div class="foot"><span class="fc" title="${esc(t('pb.inHand'))}"><img src="assets/res/card.png" alt=""><b>${cardsInHand}</b></span><span class="fc" title="${esc(t('pb.played'))}"><span class="played-ico"></span><b>${p.played.filter((c) => c !== p.corp).length + p.events.length}</b></span><span class="fc" title="${esc(t('pb.cities'))}"><img class="hx" src="assets/tiles/city.png" alt=""><b>${p.cities}</b></span><span class="fc" title="${esc(t('pb.greeneries'))}"><img class="hx" src="assets/tiles/greenery.png" alt=""><b>${p.greens}</b></span><span class="peek">${esc(t(matchMedia('(pointer:coarse)').matches ? 'pb.peekTap' : 'pb.peekHover'))}</span></div>`;
      this.uiFx.panel(el, pid, p);
      this.bindPeek(el, pid);
      box.appendChild(el);
    }
    if (feed) box.appendChild(feed);
  }

  bindPeek(el, pid) {
    let t = null;
    el.addEventListener('mouseenter', (e) => { if (e.pointerType === 'touch') return; t = setTimeout(() => this.showTableau(pid), 250); });
    el.addEventListener('mouseleave', () => { clearTimeout(t); setTimeout(() => { if (!$('#tableau:hover')) this.hideTableau(); }, 120); });
    el.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') t = setTimeout(() => this.showTableau(pid), 320); });
    el.addEventListener('pointerup', () => clearTimeout(t));
    el.addEventListener('pointercancel', () => clearTimeout(t));
    el.addEventListener('click', () => { this.audio.tick(); this.tableauPid === pid && !$('#tableau').classList.contains('hidden') ? this.hideTableau() : this.showTableau(pid); });
  }

  showTableau(pid) {
    const p = this.view.players[pid], tb = $('#tableau');
    this.tableauPid = pid;
    tb.innerHTML = '';
    // an explicit close: a press inside the panel never closes it (on phones that press is how you scroll it)
    const x = tb.appendChild(h('button', 'tbclose', '✕'));
    x.type = 'button'; x.title = t('btn.close'); x.setAttribute('aria-label', t('btn.close'));
    x.onclick = (e) => { e.stopPropagation(); this.audio.tick(); this.hideTableau(); };
    const vp = p.vp;
    const mode = (this.tbView ||= lsPick('tableauView', TB_VIEWS, 'cards'));
    tb.dataset.view = mode;
    const hd2 = tb.appendChild(h('h2', '', `<span style="color:${PCOL[pid]}">${esc(this.pname(pid))}</span> <small>${p.corp >= 0 ? esc(this.db.lname(p.corp)) : ''} · ${esc(t('pb.tr', { n: p.tr }))} · ${esc(t('pb.vp', { n: vp.total }))}</small>`));
    // the view switch (Cards / Stacked / Names): every player's tableau, remembered
    const sw = hd2.appendChild(h('span', 'tbview', Object.entries(TB_VIEWS).map(([k, key]) => `<button type="button" data-v="${k}" class="${k === mode ? 'on' : ''}" aria-pressed="${k === mode}">${esc(t(key))}</button>`).join('')));
    sw.setAttribute('role', 'group');
    sw.title = t('tab.viewTip');
    sw.onclick = (e) => {
      const b = e.target.closest('button[data-v]');
      if (!b || b.dataset.v === this.tbView) return;
      e.stopPropagation();
      this.audio.tick();
      this.tbView = b.dataset.v;
      try { localStorage.setItem('tableauView', this.tbView); } catch {}
      this.showTableau(pid);
    };
    // the VP breakdown reads as points ("Milestones: 5 VP", not "Milestones 5" -- a count it isn't)
    tb.appendChild(h('div', 'vpb', ['tr', 'cards', 'green', 'city', 'ms', 'aw'].map((k) => `<span>${esc(t('vp.' + k))}: <b>${esc(t('pb.vp', { n: vp[k] }))}</b></span>`).join('')));
    // the player's tags in play (phones hide them on the boards): the board's own tag row
    const tagN = (i) => (TAGS[i] === 'event' ? (p.events || []).length : p.tags[i]);
    tb.appendChild(h('div', 'tags tbtags', TAGS.map((g, i) => `<span class="tg${tagN(i) ? '' : ' zero'}" title="${esc(g === 'event' ? t('pb.eventsPlayed') : tagName(g))}"><img src="assets/tags/${g}.png" alt="">${tagN(i)}</span>`).join('')));
    const resOf = (c) => p.cres[c.id] ?? (c.res >= 0 && c.res != null && c.type === 2 ? 0 : undefined);
    const cardOf = (id) => { const c = this.db.get(id); return cardEl(c, { resCount: resOf(c), used: p.act.includes(id), onClick: (card) => this.zoomCard(card) }); };
    // Names: one line per card -- its colour, name, tags, resources on it, printed VP, "used"
    const nameRow = (id) => {
      const c = this.db.get(id), res = resOf(c), r = h('div', `tbn t${c.type}`);
      r.innerHTML = `<span class="nm">${esc(cardName(c))}</span><span class="ntags">${(c.tags || []).map((g) => `<img src="assets/tags/${TAGS[g]}.png" alt="" title="${esc(tagName(TAGS[g]))}">`).join('')}</span>`
        + (res != null ? `<span class="nres"><img src="assets/res/${CARD_RES_ICON[c.res] || 'wild'}.png" alt="">${res}</span>` : '')
        + (c.hasvp && c.vp ? `<span class="nvp" title="${esc(t('card.vp'))}">${c.vp}</span>` : '')
        + (p.act.includes(id) ? `<span class="nused">${esc(t('card.used'))}</span>` : '');
      r.title = cardName(c) === c.name ? c.name : `${cardName(c)} · ${c.name}`;
      r.onclick = (e) => { e.stopPropagation(); this.zoomCard(c); };
      return r;
    };
    let wrap = null;   // Stacked / Names: the colours sit side by side in one box
    const sect = (title, ids, opts = {}) => {
      if (!ids.length) return;
      const hd = h('div', 'sect', `${title} (${ids.length})`);
      if (opts.color) hd.style.color = opts.color;
      if (mode === 'stack') {
        // each colour: columns of overlapping cards, only the top strip (cost, tags, name, resources, used) showing
        wrap ||= tb.appendChild(h('div', 'tbstacks'));
        const grp = wrap.appendChild(h('div', 'stkgrp'));
        grp.appendChild(hd);
        const cols = grp.appendChild(h('div', 'stkcols'));
        const per = Math.ceil(ids.length / Math.ceil(ids.length / STACK_N));
        for (let i = 0; i < ids.length; i += per) {
          const col = cols.appendChild(h('div', 'stk'));
          for (const id of ids.slice(i, i + per)) col.appendChild(cardOf(id));
        }
        return;
      }
      if (mode === 'names') {
        wrap ||= tb.appendChild(h('div', 'tbnames'));
        const grp = wrap.appendChild(h('div', 'ngrp'));
        grp.appendChild(hd);
        for (const id of ids) grp.appendChild(nameRow(id));
        return;
      }
      tb.appendChild(hd);
      const g = h('div', 'grid' + (opts.row ? ' row' : ''));
      for (const id of ids) g.appendChild(cardOf(id));
      tb.appendChild(g);
    };
    const blue = p.played.filter((c) => this.db.get(c).type === 2 && c !== p.corp);
    const hasAct = (c) => (this.db.get(c).actions || []).length > 0 || this.db.get(c).nact;
    // one row per card colour (each row scrolls sideways)
    sect(t('tab.corp'), p.corp >= 0 ? [p.corp] : [], { row: true, color: '#c9ced8' });
    sect(t('tab.preludes'), p.preludes, { row: true, color: '#e29ac8' });
    sect(t('tab.blue'), [...blue.filter(hasAct), ...blue.filter((c) => !hasAct(c))], { row: true, color: '#6cb6ff' });
    sect(t('tab.green'), p.played.filter((c) => this.db.get(c).type === 1), { row: true, color: '#7fdc8a' });
    sect(t('tab.red'), p.events, { row: true, color: '#ff8a7a' });
    if (pid === this.view.human && p.hand.length) sect(t('tab.hand'), p.hand);
    if (!tb.querySelector('.grid, .stk, .tbn')) tb.appendChild(h('div', 'sect', t('tab.none')));
    tb.classList.remove('hidden');
    tb.onmouseleave = (e) => { if (e.buttons) return; this.hideTableau(); };   // (not while dragging a row's scrollbar)
    // a mouse wheel scrolls a card row sideways (otherwise only trackpads / shift+wheel can)
    tb.querySelectorAll('.grid.row').forEach((row) => row.addEventListener('wheel', (e) => {
      if (row.scrollWidth <= row.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      row.scrollLeft += document.documentElement.dir === 'rtl' ? -e.deltaY : e.deltaY; e.preventDefault();   // (RTL rows start at the right: scrollLeft runs 0 .. negative)
    }, { passive: false }));
    // a press outside it closes it (the player boards keep their own toggle; a zoomed card stays open over it).
    // Inside, nothing closes it but the ✕: on a phone every scroll starts as a press on the panel
    if (!this.tableauOutside) {
      this.tableauOutside = (e) => {
        if ($('#tableau').classList.contains('hidden')) return;
        if (e.target.closest('#tableau') || e.target.closest('.pb') || e.target.closest('#zoom, .zoom')) return;
        this.hideTableau();
      };
      document.addEventListener('pointerdown', this.tableauOutside, true);
    }
  }

  // legal entries grouped by what the player clicks first
  entries() {
    const m = new Map();
    (this.legal || []).forEach((a, i) => {
      let key;
      switch (a.k) {
        case AK.PLAY: key = 'card:' + a.card; break;
        case AK.SP: key = a.sp === 0 ? 'sell:' + a.disc[0] : 'sp:' + a.sp; break;
        case AK.MS: key = 'ms:' + a.ma; break;
        case AK.AW: key = 'aw:' + a.ma; break;
        case AK.BLUE: key = 'blue:' + a.card; break;
        case AK.PLANTS: key = 'plants'; break;
        case AK.HEAT: key = 'heat'; break;
        case AK.PASS: key = 'pass'; break;
        case AK.END: key = 'end'; break;
        default: key = 'k' + a.k;
      }
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(i);
    });
    return m;
  }

  // open the Actions drawer (phones) scrolled to one of its sections
  openDrawerAt(sel) {
    const a = $('#actions');
    a.classList.add('open');
    const tog = $('#actions-toggle'); if (tog) tog.textContent = t('btn.closeDrawer');
    const blk = $(sel);
    if (blk) setTimeout(() => a.scrollTo({ top: blk.offsetTop - 6, behavior: 'smooth' }), 60);
  }

  renderActions() {
    const v = this.view, ent = this.myTurn() && (v.pending.kind === D.ACTION || v.pending.kind === D.FG) ? this.entries() : new Map();
    // turn box
    const tb = $('#turnbox');
    const pk = v.pending.kind;
    let who, sub = '';
    if (pk === D.OVER) { who = esc(t('turn.gameOver')); sub = esc(v.winner === v.human ? t('turn.youWin') : t('turn.wins', { who: this.pname(v.winner) })); }
    else if (this.awaitingConfirm) { who = esc(t('turn.confirm')); sub = esc(t('turn.confirmSub')); }
    else if (v.pending.player === v.human) { who = '<span style="color:' + PCOL[v.human] + '">' + esc(t('turn.yours')) + '</span>'; sub = this.decisionText(); }
    else { who = `<span style="color:${PCOL[v.pending.player] || '#fff'}">${esc(this.pname(v.pending.player))}</span>`; sub = esc(t(this.botThinking ? 'turn.thinking' : 'turn.toMove')); }
    tb.innerHTML = `<div class="who">${who}</div><div class="sub">${sub}</div><div class="row"></div>`;
    const row = tb.querySelector('.row');
    const btn = (label, key, cls = 'ghost') => { if (!ent.has(key)) return; const b = h('button', cls, label); b.onclick = () => this.startFlow(key); row.appendChild(b); };
    btn(esc(t('act.plants')), 'plants');
    btn(esc(t('act.heat')), 'heat');
    btn(esc(t('act.endTurn')), 'end');
    btn(esc(t(pk === D.FG ? 'act.done' : 'act.passGen')), 'pass');
    // the one thing to do next, lit the same way in both places
    tb.classList.toggle('confirm', !!this.awaitingConfirm);
    if (this.awaitingConfirm) { const b = h('button', 'primary confirmbtn', esc(t('btn.confirmTurn'))); b.onclick = () => $('#btn-confirm').click(); row.appendChild(b); }
    if (!row.children.length) row.remove();

    // standard projects
    const sps = $('#sps'); sps.innerHTML = '';
    SP.forEach((sp, i) => {
      const key = i === 0 ? null : 'sp:' + i;
      const enabled = i === 0 ? [...ent.keys()].some((k) => k.startsWith('sell:')) : ent.has(key);
      const b = h('button', 'abtn', `<span class="nm">${esc(spName(i))}<span class="prog">${esc(t(`sp.${i}.what`))}</span></span><span class="cost">${typeof sp.cost === 'number' ? sp.cost + ' M€' : esc(t('sp.0.cost'))}</span>`);
      b.disabled = !enabled;
      b.onclick = () => (i === 0 ? this.sellFlow() : this.startFlow(key));
      sps.appendChild(b);
    });
    // blue actions
    const blues = $('#blues'); blues.innerHTML = '';
    const me = v.players[v.human];
    const actCards = [...new Set([...(me.corp >= 0 && this.db.get(me.corp).nact ? [me.corp] : []), ...me.played.filter((c) => (this.db.get(c).actions || []).length || this.db.get(c).nact)])];
    for (const c of actCards) {
      const card = this.db.get(c);
      const used = me.act.includes(c);
      // cards that collect resources show how many they hold (GHG Bacteria, Regolith Eaters, NRB, Psychrophiles...)
      const RICON = { 6: 'animal', 8: 'microbe', 9: 'science', 10: 'floater', 7: 'wild' };
      const held = card.res != null && card.res >= 0 && RICON[card.res] ? `<span class="resbadge" title="${esc(t('blue.onCard', { n: me.cres[c] ?? 0 }))}"><img src="assets/res/${RICON[card.res]}.png" alt="">${me.cres[c] ?? 0}</span>` : '';
      const b = h('button', 'abtn', `<span class="nm">${esc(cardName(card))}<span class="prog">${esc(cardActions(card)[0] || t('blue.action'))}</span></span>${held}<span class="cost">${used ? esc(t('blue.used')) : ''}</span>`);
      b.disabled = !ent.has('blue:' + c);
      b.onclick = () => this.startFlow('blue:' + c);
      blues.appendChild(b);
    }
    $('#blue-blk').classList.toggle('hidden', !actCards.length);
    // the same actions in the turn row, so an unused card action is never forgotten:
    // one button per action card not yet used this generation, lit when it is legal now
    // three rows: card actions + conversions + claimable milestones / standard projects / undo + confirm + turn enders
    const strip = $('#turnacts'), spRow = $('#turnsp'), endRow = $('#turnend'), msRow = $('#turnms');
    strip.innerHTML = ''; spRow.innerHTML = ''; endRow.innerHTML = ''; msRow.innerHTML = '';
    const chip = (label, enabled, onclick, cls = 'ghost cact', title = '', into = strip) => {
      const b = h('button', cls, label); b.disabled = !enabled; b.title = title;
      b.onclick = () => { this.audio.tick(); onclick(); }; into.appendChild(b); return b;
    };
    const inAction = pk === D.ACTION || pk === D.FG;
    if (ent.has('plants')) chip(esc(t('chip.plants', { n: this.db.name(me.corp) === 'EcoLine' ? 7 : 8 })), true, () => this.startFlow('plants'));
    if (ent.has('heat')) chip(esc(t('chip.heat')), true, () => this.startFlow('heat'));
    if (pk !== D.OVER) for (const c of actCards) {
      if (me.act.includes(c)) continue;
      const card = this.db.get(c);
      chip(`⚡ ${esc(cardName(card))}`, ent.has('blue:' + c), () => this.startFlow('blue:' + c), 'ghost cact', cardActions(card)[0] || t('blue.action'));
    }
    // the standard projects and the turn enders, while it is anyone's action phase
    if (inAction) {
      SP.forEach((sp, i) => {
        const key = i === 0 ? null : 'sp:' + i;
        const enabled = i === 0 ? [...ent.keys()].some((k) => k.startsWith('sell:')) : ent.has(key);
        chip(`${esc(spName(i))}${typeof sp.cost === 'number' ? ` <span class="cost">${sp.cost}</span>` : ''}`, enabled, () => (i === 0 ? this.sellFlow() : this.startFlow(key)), 'ghost cact sp', t(`sp.${i}.what`), spRow);
      });
      // milestones you can claim right now (only those), on the card actions' row: one row fewer to read
      v.ms.forEach((m, i) => {
        const key = 'ms:' + (v.map * 5 + i);
        if (ent.has(key)) chip(`🏆 ${esc(maName(m.name))} <span class="cost">8</span>`, true, () => this.startFlow(key), 'ghost cact ms', t('chip.claimTitle', { ms: maName(m.name) }), strip);
      });
      if (ent.has('end')) chip(esc(t('act.endTurn')), true, () => this.startFlow('end'), 'ghost cact turn', '', endRow);
      if (ent.has('pass')) chip(esc(t(pk === D.FG ? 'act.done' : 'act.passGenShort')), true, () => this.startFlow('pass'), 'ghost cact turn', t('act.passTitle'), endRow);
    }
    // phones: milestones and awards live in the Actions drawer, which isn't obvious -- a chip for each at the end of
    // the standard projects row opens the drawer at that section (also outside the action phase: the draft, research)
    if (pk !== D.OVER && matchMedia(PHONE_DRAWER).matches) {
      for (const [k, sel, icon] of [['panel.ms', '#ms-blk', '🏆'], ['panel.aw', '#aw-blk', '🏅']]) chip(`${icon} ${esc(t(k))} ▸`, true, () => this.openDrawerAt(sel), 'ghost cact drawerlink', '', spRow);
    }
    strip.classList.toggle('hidden', !strip.children.length);
    spRow.classList.toggle('hidden', !spRow.children.length);
    msRow.classList.toggle('hidden', !msRow.children.length);
    // "Hide actions" (on a small screen a long list of card actions covers the board): the action
    // rows fold away until shown again; remembered
    const nActs = [strip, spRow, msRow].reduce((n, r) => n + r.children.length, 0), ba = $('#btn-acts');
    let hid = false; try { hid = localStorage.getItem('actsHidden') === '1'; } catch {}
    document.body.classList.toggle('acts-hidden', hid);
    ba.classList.toggle('hidden', !nActs);
    ba.textContent = hid ? t('act.showActs', { n: nActs }) : t('act.hideActs');
    ba.onclick = () => { this.audio.tick(); try { localStorage.setItem('actsHidden', hid ? '0' : '1'); } catch {} this.renderActions(); };
    // milestones
    const mss = $('#mss'); mss.innerHTML = '';
    v.ms.forEach((m, i) => {
      const key = 'ms:' + (v.map * 5 + i);
      const vals = m.v.map((x, p) => `<span style="color:${PCOL[p]}" class="${x >= m.thr ? 'lead' : ''}">${x}</span>`).join('');
      const b = h('button', 'abtn' + (m.owner >= 0 ? ' claimed' : ''), `<span class="nm">${esc(maName(m.name))}<span class="prog">${esc(critName(m.crit))} ≥ ${m.thr}</span></span><span class="mini">${vals}</span>`);
      if (m.owner >= 0) b.style.setProperty('--oc', PCOL[m.owner]);
      // the full text (the row truncates it): name, criterion, everyone's count, status -- a tooltip, and a tap on
      // one you can't claim shows it (touch screens have no hover; a disabled button shows no tooltip everywhere)
      const full = `${maName(m.name)} — ${critName(m.crit)} ≥ ${m.thr}\n${m.v.map((x, p) => `${this.pname(p)}: ${x}`).join(' · ')}\n`
        + (m.owner >= 0 ? t('ms.claimedBy', { who: this.pname(m.owner) }) : t(v.msn >= 3 ? 'ms.allClaimed' : 'ms.claimFor'));
      b.title = full;
      if (!ent.has(key)) b.classList.add('off');
      b.onclick = () => (ent.has(key) ? this.startFlow(key) : this.toast(full.replace(/\n/g, ' · ')));
      mss.appendChild(b);
    });
    // awards
    const awCost = [8, 14, 20][v.awn] ?? '—';
    $('#awcost').textContent = v.awn < 3 ? t('aw.cost', { n: awCost }) : t('aw.allFunded');
    const aws = $('#aws'); aws.innerHTML = '';
    v.aw.forEach((w, i) => {
      const key = 'aw:' + (v.map * 5 + i);
      const best = Math.max(...w.v);
      const vals = w.v.map((x, p) => `<span style="color:${PCOL[p]}" class="${x === best && w.funder >= 0 ? 'lead' : ''}">${x}</span>`).join('');
      const b = h('button', 'abtn' + (w.funder >= 0 ? ' claimed' : ''), `<span class="nm">${esc(maName(w.name))}<span class="prog">${esc(critName(w.crit))}</span></span><span class="mini">${vals}</span>`);
      if (w.funder >= 0) b.style.setProperty('--oc', PCOL[w.funder]);
      const full = `${maName(w.name)} — ${critName(w.crit)}\n${w.v.map((x, p) => `${this.pname(p)}: ${x}`).join(' · ')}\n`
        + (w.funder >= 0 ? t('aw.fundedBy', { who: this.pname(w.funder) }) : t('aw.fundFor', { n: awCost }));
      b.title = full;
      if (!ent.has(key)) b.classList.add('off');
      b.onclick = () => (ent.has(key) ? this.startFlow(key) : this.toast(full.replace(/\n/g, ' · ')));
      aws.appendChild(b);
    });
  }

  decisionText() {
    const v = this.view, k = v.pending.kind;
    const key = { [D.SETUP]: 'dec.setup', [D.TILE]: 'dec.tile', [D.PRELUDE_PLAY]: 'dec.preludePlay', [D.BONUS]: 'dec.bonus', [D.DRAFT]: 'dec.draft', [D.RESEARCH]: 'dec.research',
      [D.ACTION]: 'dec.action', [D.FG]: 'dec.fg', [D.KEEP]: 'dec.keep', [D.TRIGGER]: 'dec.trigger', [D.BUY]: 'dec.buy', [D.PLAY_PRELUDE]: 'dec.playPrelude' }[k];
    return key ? t(key, { tile: t('tilew.' + ['city', 'greenery', 'ocean'][v.pending.tile]), n: v.an + 1 }) : '';
  }

  renderTurnCtl() {
    $('#btn-undo').disabled = !this.canUndo || this.botThinking;
    $('#btn-confirm').classList.toggle('hidden', !this.awaitingConfirm);
    $('#btn-hint').classList.toggle('hidden', !(this.myTurn() && (this.view.pending.kind === D.ACTION || this.view.pending.kind === D.FG)));
  }

  renderStatus() {
    const v = this.view;
    if (!v) return;
    if (this.botThinking) return this.setStatus(t('status.thinking'), true);
    if (v.pending.kind === D.OVER) return this.setStatus(t('turn.gameOver'), false);
    if (this.awaitingConfirm) return this.setStatus(t('status.confirm'), false);
    if (v.pending.player === v.human) return this.setStatus(this.decisionText(), false);
    this.setStatus(t(this.botReady ? 'status.toMove' : 'status.botLoading', { who: this.pname(v.pending.player) }), true);
  }

  layout() {
    const r = (sel) => $(sel).getBoundingClientRect();
    // the canvas fills the VISIBLE viewport: app.css's 100vh is a phone's tallest viewport (URL
    // bar hidden), taller than the HUD's box while the bar shows -> a stretched, off-centre globe
    const gl = this.board.canvas || $('#gl');
    gl.style.height = CSS.supports?.('height', '100dvh') ? '100dvh' : innerHeight + 'px';
    const portrait = innerWidth <= 640 && innerHeight > innerWidth;
    // insets: how far the panels reach into the canvas, from the canvas's own edges; a phone
    // held sideways centres the globe between the panels exactly (no overlap with the hand)
    // the turn controls (undo / confirm row + one strip of standard projects / actions) sit just above the
    // hand: reserve that band too, so a centred globe is centred in the space you can see (not low, its
    // bottom behind the strip). A fixed band (not the live strip) so the globe doesn't jump per turn
    const g = gl.getBoundingClientRect(), ctlH = $('#turnctl .ctl')?.getBoundingClientRect().height || 40;
    const band = innerHeight <= 500 ? 0 : portrait ? 4 + ctlH + 36 : 14 + ctlH + 44;
    const ins = portrait ? { l: 0, r: 0, t: r('#players').bottom - g.top, b: g.bottom - r('#handbar').top + band }
      : { l: r('#players').right - g.left, r: g.right - r('#actions').left, t: r('#top').bottom - g.top, b: g.bottom - r('#handbar').top + band };
    this.board.setInsets(ins);
    // a short free area (a phone held sideways): the hand and HUDs hide part
    // of the globe, so allow a wider turn to bring the board's edges into view
    const ctl = this.board.controls;
    if (ctl) {
      const freeH = g.height - ins.t - ins.b;
      const tight = Math.max(0, Math.min(1, (520 - freeH) / 300));
      ctl.aFar = 0.38 + 0.2 * tight;           // board edge is ~0.87 rad from its centre
      ctl.aNear = 0.85 + 0.1 * tight;
      ctl.slideFrac = 0.09 + 0.08 * tight;
      ctl.clamp(); ctl.update();
    }
  }
}
