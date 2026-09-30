// dialogs.js -- App's decision dialogs: setup, draft, research, keeps and buys, triggers, attack targets and
// other choices, plus the modal / card-picker machinery they share. setupDecision() opens the one the view asks for.
import { has as tHas, t, tj, tw } from '../i18n.js';
import { cardActions, cardDesc, cardEl, cardName, cardOrTitles } from '../cards/cards.js';
import { $, h, esc } from '../dom.js';
import { D, AK } from '../protocol.js';
import { PCOL, REPLAY, cresName, critName, maName, resName } from './shared.js';

export class AppDialogs {
  // "Remove 5 plants from TFMBot (has 7)" / "Remove 2 animals from TFMBot's Small Animals"
  // What the opponent has OF WHAT THIS PLAY TAKES (and nothing else): the
  // attack clause of the card text names the resources / production removed.
  takenBits(a, cd, tgt) {
    if (!cd || !tgt) return [];
    const text = a.k === AK.BLUE ? (cd.actions || [])[a.ai || 0] || '' : cd.description || '';    // (the English rules text: parsed, not shown)
    const clause = (text.match(/\b(remove|decrease|steal|reduce)\b[^.]*/i) || [''])[0];
    const R = { 'M€': 0, megacredit: 0, steel: 1, titanium: 2, plant: 3, energy: 4, heat: 5 };
    const bits = [];
    for (const m of clause.matchAll(/any (M€|steel|titanium|plant|energy|heat) production|(\d+) (M€|steel|titanium|plants?|energy|heat)\b/gi)) {
      if (m[1]) { const r = R[m[1]]; bits.push(t('take.prod', { n: tgt.prod[r], res: resName(r) })); }
      else { const r = R[m[3].replace(/s$/, '')]; bits.push(t('take.res', { n: tgt.res[r], res: resName(r) })); }
    }
    return [...new Set(bits)];
  }
  takenText(a, cd, tgt) {
    const bits = this.takenBits(a, cd, tgt);
    return bits.length ? tw('take.has', { who: esc(this.pname(tgt.id)), list: tj(bits) }, tgt.id === this.view.human) : '';
  }
  stealText(a) {
    if (!a || !a.steal) return t('steal.nothing');
    const tgt = a.atp != null ? this.view.players[a.atp] : null, mine = tgt && tgt.id === this.view.human;
    const who = tgt ? (mine ? t('steal.yourself') : this.pname(tgt.id)) : '';
    const stock = ['megacredits', 'steel', 'titanium', 'plants', 'energy', 'heat'].indexOf(a.steal);
    const has = tgt && stock >= 0 ? t('steal.has', { n: tgt.res[stock] }) : '';
    const from = a.atc != null ? (mine ? t('steal.yourCard', { card: this.db.lname(a.atc) }) : t('steal.theirCard', { who, card: this.db.lname(a.atc) })) : who;
    return t('steal.upTo', { n: a.stealn, res: tHas('rn.' + a.steal) ? t('rn.' + a.steal) : a.steal, from, has });
  }
  // one attack target as a choice: who / which card, and what it loses
  // (a.atk = [kind, res, n, upTo] from the session layer: 1 production steps,
  // 2 stock removal, 3 steal, 4 resources off a card)
  targetText(a) {
    const me = this.view.human, db = this.db, [kind, r0, n0] = a.atk || [0, -1, 0];
    if (a.atp == null && a.rfc == null) return t('atk.skip');
    const RN = ['megacredits', 'steel', 'titanium', 'plants', 'energy', 'heat', 'animal', 'fighter', 'microbe', 'science', 'floater'];
    const r = r0 >= 0 ? r0 : RN.indexOf(a.steal ?? ''), n = a.stealn || n0;
    const vc = a.atc ?? a.rfc;
    if (vc != null) {
      const own = this.view.players.find((pl) => pl.played.includes(vc) || pl.corp === vc);
      const from = own?.id === me ? t('steal.yourCard', { card: db.lname(vc) }) : t('steal.theirCard', { who: this.pname(own ? own.id : a.atp), card: db.lname(vc) });
      const res = r > 5 ? cresName(RN[r], n) : resName(r), has = t('steal.has', { n: own?.cres?.[vc] ?? 0 });
      return a.atk?.[3] ? t('steal.upTo', { n, res, from, has }) : `${from.charAt(0).toLocaleUpperCase()}${from.slice(1)} — −${n} ${res}${has}`;     // Predators / Ants: exactly one
    }
    const pl = this.view.players[a.atp], mine = a.atp === me;
    if (kind === 1) return `${this.pname(a.atp)}${mine ? t('choice.yourselfSuffix') : ''}: ${t('atk.prodLoss', { n, res: resName(r) })} — ${t('take.hasShort', { list: t('take.prod', { n: pl.prod[r], res: resName(r) }) })}`;
    const who = mine ? t('steal.yourself') : this.pname(a.atp);
    if (kind === 3) return t('atk.take', { n, res: resName(r), who, has: pl.res[r] });
    const s = t('steal.upTo', { n, res: resName(r), from: who, has: t('steal.has', { n: pl.res[r] }) });
    // counted after the card's own tiles (Giant Ice Asteroid's oceans feed Arctic Algae)
    return a.rm && a.rm[1] !== Math.min(n, pl.res[r]) ? `${s} — ${t('choice.loses', { n: a.rm[1], res: resName(r) })} ${t('choice.afterTiles')}` : s;
  }
  targetModal(groups) {
    const f = this.flow, L = this.legal, me = this.view.human;
    const opts = [...groups.values()].map((idxs) => ({ idxs, a: L[idxs[0]] }));
    const a0 = opts[0].a, cd = a0.card != null ? this.db.get(a0.card) : null;
    const hits = opts.filter((o) => o.a.atp != null || o.a.rfc != null);
    const onCards = hits.every((o) => o.a.atc != null || o.a.rfc != null);
    const upTo = opts.some((o) => o.a.atk?.[3]);
    // the only victim is you (Asteroid Mining Consortium with nobody else holding titanium production)
    const selfOnly = hits.length && hits.every((o) => o.a.atp === me && o.a.rfc == null && o.a.atc == null) && !upTo;
    const note = selfOnly ? t('atk.selfSub', { hit: esc(t('atk.prodLoss', { n: a0.atk[2], res: resName(a0.atk[1]) })) }) : esc(t(upTo ? 'atk.optional' : 'atk.mandatory'));
    this.flowModalOpen = true;
    this.modal((box) => {
      box.appendChild(h('h2', '', `${esc(cd ? cardName(cd) : t('atk.attack'))} — ${esc(t(onCards ? 'choice.t.atc' : 'choice.t.atp'))}`));
      const text = cd ? (a0.k === AK.BLUE ? cardActions(cd)[a0.ai ?? 0] : cardDesc(cd)) || '' : '';
      box.appendChild(h('div', 'sub', `${text ? `<span style="color:var(--faint)">${esc(text)}</span><br>` : ''}${note}`));
      const el = h('div', 'opts');
      for (const { idxs, a } of opts) {
        const b = h('button', 'abtn opt', `<span class="nm">${esc(this.targetText(a))}</span>`);
        const vp = a.atp ?? (a.rfc != null ? this.view.players.find((pl) => pl.played.includes(a.rfc) || pl.corp === a.rfc)?.id : null);
        if (vp != null) b.style.borderColor = PCOL[vp];
        b.onclick = () => { f.cands = idxs; f.targetOk = true; this.closeModal(); this.resolve(); };
        el.appendChild(b);
      }
      box.appendChild(el);
      const c = h('button', 'ghost', esc(t('btn.cancel')));
      c.onclick = () => this.cancelFlow();
      const foot = h('div', 'foot'); foot.appendChild(h('div', 'info', '')); foot.appendChild(c); box.appendChild(foot);
    });
  }

  // Vitor's first action: fund one award free -- front and centre
  freeAwardModal(keys) {
    const v = this.view;
    this.flowModalOpen = true;
    this.modal((box) => {
      box.appendChild(h('h2', '', esc(t('vitor.title'))));
      box.appendChild(h('div', 'sub', esc(t('vitor.sub'))));
      const row = h('div', 'opts awpick');
      v.aw.forEach((w, i) => {
        const key = 'aw:' + (v.map * 5 + i);
        if (!keys.includes(key)) return;
        const vals = w.v.map((x, p) => `<span style="color:${PCOL[p]}">${esc(this.pname(p))} ${x}</span>`).join(' · ');
        const b = h('button', 'abtn opt', `<span class="nm">${esc(maName(w.name))}</span><small>${esc(critName(w.crit))}</small><small>${vals}</small>`);
        b.onclick = () => { this.closeModal(); this.startFlow(key); };
        row.appendChild(b);
      });
      box.appendChild(row);
    });
  }

  // ---------------------------------------------------------------- decisions
  setupDecision() {
    if (this.choosingMap) return;             // the map menu stays up until a map is picked
    const v = this.view;
    this.board.clearHighlight();
    $('#prompt').classList.add('hidden');
    if (REPLAY != null) return;               // a replay shows what was offered and chosen (replay/replay.js), never a live prompt
    if (v.pending.player !== v.human || this.awaitingConfirm) { if (!this.flowModalOpen) this.closeModal(); return; }
    switch (v.pending.kind) {
      case D.SETUP: return this.setupModal();
      case D.TILE: return this.tilePrompt();
      case D.PRELUDE_PLAY: return this.preludePlayModal();
      case D.BONUS: this.infoFn = null; this.okFn = null; return this.pickModal(esc(t('vt.title')), esc(t('vt.sub')), v.pending.cards, 1, 1, (sel) => this.answer({ a: 'card', card: sel[0] }), null, true);
      case D.DRAFT: return this.draftModal();
      case D.RESEARCH: return this.researchModal();
      case D.PLAY_PRELUDE: {
        this.infoFn = null; this.okFn = null;
        const n = v.pending.cards.length;
        return this.pickModal(esc(t(n > 1 ? 'pp.title' : 'pp.titleLast')), esc(t(n > 1 ? 'pp.sub' : 'pp.subLast')), v.pending.cards, 1, 1, (sel) => this.answer({ a: 'card', card: sel[0] }));
      }
      case D.KEEP: {
        const k = v.pending.keep;
        this.infoFn = (sel) => esc(t('keep.info', { n: sel.size, k }));
        this.okFn = (sel) => sel.size === k;
        return this.pickModal(esc(t('keep.title', { n: k })), esc(t('keep.sub', { card: this.db.lname(v.last.card) })), v.pending.cards, k, k, (sel) => this.answer({ a: 'keep', cards: sel }), null, true);
      }
      case D.TRIGGER: return this.triggerModal();
      case D.BUY: {
        const b = v.pending.buy, src = this.db.lname(b.src);
        this.flowModalOpen = true;
        return this.modal((box) => {
          box.appendChild(h('h2', '', esc(t('buy.title', { card: src }))));
          box.appendChild(h('div', 'sub', esc(t(b.can ? 'buy.sub' : 'buy.cant'))));
          const row = h('div', 'cards'); row.appendChild(cardEl(this.db.get(b.card), { big: true })); box.appendChild(row);
          const foot = h('div', 'foot'); foot.appendChild(h('div', 'info', ''));
          const no = h('button', 'ghost', esc(t('btn.discard'))); no.onclick = () => this.answer({ a: 'buy', yes: 0 });
          const yes = h('button', 'primary', esc(t('buy.btn'))); yes.disabled = !b.can; yes.onclick = () => this.answer({ a: 'buy', yes: 1 });
          foot.append(no, yes); box.appendChild(foot);
        });
      }
      case D.ACTION: case D.FG: {
        this.closeModal();
        // a forced move (Tharsis Republic's first city, ...): no menu, go
        // straight to it
        const keys = [...this.entries().keys()];
        if (v.pending.kind === D.ACTION && keys.length && keys.every((k) => k.startsWith('aw:'))) return this.freeAwardModal(keys);
        if (v.pending.kind === D.ACTION && keys.length === 1 && !['pass', 'end'].includes(keys[0]) && !this.flow) { this.forced = true; this.startFlow(keys[0]); }
        // final greenery: straight to the board (Cancel on the prompt skips it)
        if (v.pending.kind === D.FG && keys.includes('plants') && !this.flow && this.fgSkip !== v.moves) { this.fgAuto = v.moves; this.startFlow('plants'); }
        return;
      }
    }
  }

  // A tag trigger with a real choice (the engine applied the default: the
  // first button). Olympus Conference / Mars University / Viral Enhancers.
  triggerModal() {
    const v = this.view, tg = v.pending.trig, db = this.db;
    const src = db.get(tg.src), played = db.get(tg.card), E = { VE: 1, OC: 2, MU: 3 };
    const kind = src.name === 'Olympus Conference' ? E.OC : src.name === 'Mars University' ? E.MU : E.VE;
    const of = tg.n > 1 ? ` <span style="color:var(--faint)">${esc(t('trig.of', { i: tg.i + 1, n: tg.n }))}</span>` : '';
    const sn = cardName(src), pn = cardName(played);
    if (kind === E.MU) {
      const me = v.players[v.human];
      this.infoFn = (sel) => esc(sel.size ? t('mu.info', { card: db.lname([...sel][0]) }) : t('mu.pick'));
      this.okFn = () => true;
      // the no-swap choice, said outright (not a cancel: the card is already played);
      // lit up when TFMBot's pick is to keep the hand
      this.footFn = (foot, sel, recd) => {
        const kb = h('button', 'ghost', esc(t('mu.keep')));
        if (recd && !recd.length) kb.style.cssText = 'outline:2px solid #fff27a;outline-offset:1px';
        kb.onclick = () => { this.infoFn = this.okFn = null; this.answer({ a: 'trigger', opt: 0 }); };
        foot.appendChild(kb);
      };
      return this.pickModal(`${esc(sn)}${of}`, esc(t('mu.sub', { card: pn })), me.hand, 0, 1,
        (sel) => this.answer(sel.length ? { a: 'trigger', opt: 1, card: sel[0] } : { a: 'trigger', opt: 0 }), (box) => this.trigOrderNote(box, tg), 'mu.recKeep');
    }
    const opts = kind === E.OC
      // tg.res already includes the resource this trigger added; say where the card ends up
      ? [[t('oc.add'), t('oc.addSub', { card: sn, n: tg.res })], [t('oc.draw'), t('oc.drawSub', { card: sn, n: tg.res - 2 })]]
      : [[t('ve.add', { card: pn }), t('ve.addSub', { card: pn, n: tg.res })], [t('ve.plant'), t('ve.plantSub', { card: pn })]];
    this.flowModalOpen = true;
    this.modal((box) => {
      box.appendChild(h('h2', '', `${esc(sn)}${of}`));
      box.appendChild(h('div', 'sub', esc(t('trig.by', { card: pn, text: cardDesc(src) }))));
      this.trigOrderNote(box, tg);
      const row = h('div', 'opts'), btns = [];
      opts.forEach(([title, sub], opt) => {
        const b = h('button', 'abtn opt', `<span class="nm">${esc(title)}</span><small>${esc(sub)}</small>`);
        b.onclick = () => this.answer({ a: 'trigger', opt });
        row.appendChild(b); btns.push(b);
      });
      box.appendChild(row);
      // TFMBot's pick: the bot's own trigger rule, lit up -- the choice stays the player's
      const foot = h('div', 'foot'); foot.appendChild(h('div', 'info', ''));
      const rb = h('button', 'ghost', esc(t('rec.pick')));
      rb.title = t('rec.pickTitle');
      rb.onclick = () => { this.recPending = true; rb.disabled = true; rb.textContent = t('rec.thinking'); this.worker.postMessage({ t: 'hint' }); };
      foot.appendChild(rb); box.appendChild(foot);
      this.applyPickRec = (pick, think) => {
        this.recPending = false; rb.disabled = false; rb.textContent = t('rec.pick');
        const o = think?.opt;
        btns.forEach((b, i) => { b.style.outline = i === o ? '2px solid #fff27a' : ''; b.style.outlineOffset = i === o ? '1px' : ''; });
      };
    });
  }

  // several triggers fired together: the order they are offered in is the player's choice made for them -- say it
  trigOrderNote(box, tg) {
    const ids = tg?.order || [];
    if (new Set(ids).size < 2) return;
    const names = ids.map((c) => cardName(this.db.get(c)));
    const why = ids.some((c) => this.db.get(c)?.name === 'Mars University') ? ' ' + t('trig.orderWhy') : '';
    box.appendChild(h('div', 'sub', `<b>${esc(t('trig.order', { list: names.join(' → ') }))}</b>${esc(why)}`));
  }

  tilePrompt() {
    const v = this.view;
    const kind = ['city', 'greenery', 'ocean'][v.pending.tile];
    this.prompt(t('prompt.place', { tile: esc(t('tilew.' + kind)) }));
    this.board.highlight(v.pending.spaces, (s) => this.answer({ a: 'space', space: s }), kind);
    this.placing = kind;
  }

  prompt(html, cancel) {
    const p = $('#prompt');
    p.innerHTML = `<span>${html}</span>`;
    if (cancel) { const b = h('button', 'ghost', esc(t('btn.cancel'))); b.onclick = cancel; p.appendChild(b); }
    p.classList.remove('hidden');
  }

  modal(build) {
    const m = $('#modal');
    m.innerHTML = '';
    m.classList.remove('peek');
    const box = h('div', 'box');
    m.appendChild(box);
    build(box);
    // hide the dialog to study the board / hand; a big button up top brings it back
    const title = () => box.querySelector('h2')?.textContent?.trim() || t('peek.yourChoice');   // read late: some dialogs fill in after this
    const pk = h('button', 'ghost peekbtn', esc(t('peek.hide')));
    pk.title = t('peek.title');
    // it sits in the dialog's bottom row, just left of the confirm button (dialogs
    // that redraw their contents get it back); while hidden it's the big
    // "Back to …" button up top
    const place = () => {
      if (m.classList.contains('peek')) { if (pk.parentNode !== m) m.appendChild(pk); return; }
      const foot = [...box.querySelectorAll('.foot')].pop();
      if (!foot) { if (pk.parentNode !== m) m.appendChild(pk); return; }
      const primary = [...foot.querySelectorAll('button.primary')].pop();
      if (pk.parentNode !== foot || (primary && pk.nextSibling !== primary)) foot.insertBefore(pk, primary || null);
    };
    pk.onclick = (e) => { e.stopPropagation(); const on = m.classList.toggle('peek'); pk.textContent = on ? t('peek.back', { title: title() }) : t('peek.hide'); place(); };
    new MutationObserver(place).observe(box, { childList: true, subtree: true });
    place();
    m.classList.remove('hidden');
    return box;
  }

  cardRow(box, ids, cls, sel, onToggle, opts = {}) {
    const row = h('div', 'cards');
    for (const id of ids) {
      const el = cardEl(this.db.get(id), { big: !!opts.big });
      if (!opts.big) el.style.cssText += 'width:150px;height:212px;font-size:10.5px';
      el.classList.toggle('on', sel.has(id));
      el.addEventListener('click', () => { onToggle(id); this.audio.card(); });
      el.addEventListener('contextmenu', (e) => { e.preventDefault(); this.zoomCard(this.db.get(id)); });
      row.appendChild(el);
    }
    box.appendChild(row);
    return row;
  }

  setupModal() {
    const v = this.view, me = v.players[v.human];
    const st = { corp: null, pre: new Set(), buy: new Set() };
    const box = this.modal(() => {});
    const draw = () => {
      box.innerHTML = '';
      box.appendChild(h('h2', '', esc(t('setup.title'))));
      box.appendChild(h('div', 'sub', esc(t('setup.sub'))));
      box.appendChild(h('div', 'sect', esc(t('setup.corp'))));
      this.cardRow(box, me.dcorps, '', new Set([st.corp]), (id) => { st.corp = id; draw(); }, {});
      box.appendChild(h('div', 'sect', esc(t('setup.pre'))));
      this.cardRow(box, me.dpre, '', st.pre, (id) => { st.pre.has(id) ? st.pre.delete(id) : st.pre.size < 2 && st.pre.add(id); draw(); });
      box.appendChild(h('div', 'sect', esc(t('setup.proj'))));
      this.cardRow(box, me.dproj, '', st.buy, (id) => { st.buy.has(id) ? st.buy.delete(id) : st.buy.add(id); draw(); });
      const mc0 = st.corp != null ? this.db.get(st.corp).mc0 : null;
      // the chosen preludes' own fixed M€ (Donation +21, Business Empire -6...: the engine's "imc") count too
      const pmc = [...st.pre].reduce((n, id) => n + (this.db.get(id).imc || 0), 0);
      const left = mc0 != null ? mc0 + pmc - st.buy.size * 3 : null;
      const mcTxt = pmc ? `${mc0} ${pmc > 0 ? '+' : '−'} ${Math.abs(pmc)}` : mc0;
      const foot = h('div', 'foot');
      foot.appendChild(h('div', 'info', st.corp == null ? esc(t('setup.chooseCorp')) : t('setup.info', { corp: esc(this.db.lname(st.corp)), mc: mcTxt, spent: st.buy.size * 3, left: `<b style="color:${left < 0 ? '#ff6b6b' : '#7dffb0'}">${left} M€</b>`, n: st.pre.size })));
      // newcomers: TFMBot fills in the picks it would make (they stay editable)
      const rec = h('button', 'ghost', esc(t(this.recPending ? 'status.thinking' : 'setup.rec')));
      rec.title = t('setup.recTitle');
      rec.disabled = !!this.recPending;
      rec.onclick = () => { this.recPending = true; draw(); this.worker.postMessage({ t: 'hint' }); };
      foot.appendChild(rec);
      const ok = h('button', 'primary', esc(t('setup.confirm')));
      ok.disabled = st.corp == null || st.pre.size !== 2 || mc0 - st.buy.size * 3 < 0;   // (cards are bought from the corporation's M€, before any prelude is played)
      ok.onclick = () => this.answer({ a: 'setup', corp: st.corp, pre: [...st.pre], buys: [...st.buy] });
      foot.appendChild(ok);
      box.appendChild(foot);
    };
    this.applySetupRec = (r) => {
      this.recPending = false;
      if (r) {
        const has = (arr, id) => (arr || []).includes(id);
        if (has(me.dcorps, r.corp)) st.corp = r.corp;
        st.pre = new Set((r.pre || []).filter((id) => has(me.dpre, id)));
        st.buy = new Set((r.buys || []).filter((id) => has(me.dproj, id)));
        this.toast(t('setup.recToast'));
      }
      draw();
    };
    draw();
  }

  pickModal(title, sub, ids, min, max, done, extra, rec = false, cancel = false) {
    const recOp = this.nextRecOp || 'hint'; this.nextRecOp = null;     // (Sell patents asks the bot its own question)
    const sel = new Set();
    // one-shot, like infoFn/okFn: extra foot buttons for this dialog only; gets
    // (foot, sel, recd) -- recd = TFMBot's pick once asked for (an empty pick = "none")
    const footFn = this.footFn; this.footFn = null;
    let recd = null, lastTap = null;
    const box = this.modal(() => {});
    const draw = () => {
      box.innerHTML = '';
      box.appendChild(h('h2', '', title));
      box.appendChild(h('div', 'sub', sub));
      this.cardRow(box, ids, '', sel, (id) => {
        // a one-card pick (the draft...): double-click / double-tap a card to pick it at once (no confirm needed)
        const now = performance.now();
        if (min === 1 && max === 1 && lastTap?.id === id && now - lastTap.t < 450 && (!this.okFn || this.okFn(new Set([id])))) { lastTap = null; this.infoFn = this.okFn = null; done([id]); return; }
        lastTap = { id, t: now };
        if (sel.has(id)) sel.delete(id);
        else { if (max === 1) sel.clear(); if (sel.size < max) sel.add(id); }
        draw();
      });
      if (extra) extra(box, sel);
      const foot = h('div', 'foot');
      const info = h('div', 'info', '');
      foot.appendChild(info);
      if (this.infoFn) info.innerHTML = this.infoFn(sel);
      if (footFn) footFn(foot, sel, recd);
      if (rec) {                                    // draft / research / triggers / keeps: the bot's own nets pick
        const rb = h('button', 'ghost', esc(this.recPending ? t('rec.thinking') : t('rec.pick')));
        rb.title = t('rec.pickTitle'); rb.disabled = !!this.recPending;
        rb.onclick = () => { this.recPending = true; draw(); this.worker.postMessage({ t: 'hint', op: recOp }); };
        foot.appendChild(rb);
      }
      if (cancel) {                                 // a move you only started (Sell patents): back out, nothing done
        const cb = h('button', 'ghost', esc(t('btn.cancel')));
        cb.onclick = () => { this.infoFn = this.okFn = null; this.closeModal(); };
        foot.appendChild(cb);
      }
      const ok = h('button', 'primary', esc(t('btn.confirm')));
      ok.disabled = sel.size < min || (this.okFn && !this.okFn(sel));
      ok.onclick = () => { this.infoFn = this.okFn = null; done([...sel]); };
      foot.appendChild(ok);
      box.appendChild(foot);
    };
    this.applyPickRec = rec ? (pick) => { this.recPending = false; if (pick) { recd = pick; sel.clear(); for (const id of pick) if (ids.includes(id) && sel.size < max) sel.add(id); if (!sel.size && typeof rec === 'string') this.toast(t(rec), '#fff27a'); } draw(); } : null;
    draw();
  }

  draftModal() {
    const v = this.view;
    this.infoFn = null; this.okFn = null;
    this.pickModal(esc(t('draft.title', { n: v.gen })), esc(t('draft.sub')), v.pending.cards, 1, 1,
      (sel) => this.answer({ a: 'card', card: sel[0] }),
      (box) => {
        if (v.pending.drafted?.length) {
          box.appendChild(h('div', 'sect', esc(t('draft.sofar'))));
          const row = this.cardRow(box, v.pending.drafted, '', new Set(), () => {});
          row.style.opacity = '.75';
        }
      }, true);
  }

  researchModal() {
    const v = this.view, me = v.players[v.human];
    this.infoFn = (sel) => `${me.res[0]} M€ − ${sel.size * 3} = <b style="color:${me.res[0] - sel.size * 3 < 0 ? '#ff6b6b' : '#7dffb0'}">${me.res[0] - sel.size * 3} M€</b>`;
    this.okFn = (sel) => sel.size * 3 <= me.res[0];
    this.pickModal(esc(t('research.title', { n: v.gen })), esc(t('research.sub')), v.pending.cards, 0, 4,
      (sel) => this.answer({ a: 'research', cards: sel }), null, true);
  }

  preludePlayModal() {
    const ent = this.entries();
    const ids = [...ent.keys()].filter((k) => k.startsWith('card:')).map((k) => +k.slice(5));
    this.pickModal(esc(t('ppc.title')), esc(t('ppc.sub')), ids, 1, 1, (sel) => this.startFlow('card:' + sel[0]), null, true);
  }

  choiceModal(dim, vals) {
    const f = this.flow, L = this.legal, db = this.db;
    const a0 = L[f.cands[0]];
    const label = (d, v) => {
      if (v == null) return t(d === 'atp' ? 'choice.nobody' : d === 'rtc' || d === 'rfc' ? 'choice.noCard' : 'choice.none');
      switch (d) {
        case 'pay': { const p = []; if (v.mc) p.push(`${v.mc} M€`); if (v.steel) p.push(t('take.res', { n: v.steel, res: resName(1) })); if (v.ti) p.push(t('take.res', { n: v.ti, res: resName(2) })); if (v.heat) p.push(t('take.res', { n: v.heat, res: resName(5) })); (v.crp || []).forEach((c) => p.push(t('choice.crpFrom', { n: c.n, res: tHas('cres.' + c.res) ? cresName(c.res, c.n) : c.res, card: db.lname(c.card) }))); return p.join(' + ') || t('pay.free'); }
        case 'atp': {
          // a stock removal counted after the card's own tiles (Giant Ice Asteroid's oceans feed Arctic Algae): say what it really takes
          const av = f.cands.map((i) => L[i]).find((x) => x.atp === v && x.rm);
          if (av && v !== this.view.human) {
            const [r, n] = av.rm, pl = this.view.players[v];
            return `${this.pname(v)} — ${t('choice.loses', { n, res: resName(r) })}${n > pl.res[r] ? ' ' + t('choice.afterTiles') : ''}`;
          }
          // only what THIS card takes (Flooding: M€; Heat Trappers: heat production...)
          const pl = this.view.players[v], cd0 = a0.card != null ? db.get(a0.card) : null;
          const bits = this.takenBits(a0, cd0, pl), has = bits.length ? t('take.hasShort', { list: tj(bits) }) : '';
          return `${this.pname(v)}${v === this.view.human ? t('choice.yourselfSuffix') : ''}${has ? ' — ' + has : ''}`;
        }
        case 'atc': {
          const own = this.view.players.find((pl) => pl.played.includes(v) || pl.corp === v);
          const n = own?.cres?.[v];
          return `${db.lname(v)} — ${own ? (own.id === this.view.human ? t('choice.yours') : t('choice.theirs', { who: this.pname(own.id) })) : ''}${n != null ? t('choice.onIt', { n }) : ''}`;
        }
        case 'rtc': case 'rtc2': case 'rfc': {
          // "Decomposers — 3 microbes now" (whose card, and how many it holds)
          const own = this.view.players.find((pl) => pl.played.includes(v) || pl.corp === v);
          const n = own?.cres?.[v] ?? 0;
          const RN = { 6: 'animal', 8: 'microbe', 9: 'science', 10: 'floater', 7: 'fighter' };
          const r = RN[db.get(v)?.res] || 'resource';
          const whose = own && own.id !== this.view.human ? t('choice.whose', { who: this.pname(own.id) }) : '';
          return `${db.lname(v)}${whose} — ${t('choice.resNow', { n, res: cresName(r, n) })}`;
        }
        case 'or': return (a0.card != null && cardOrTitles(db.get(a0.card))[v]) || t('choice.option', { n: v + 1 });
        case 'ai': return t('choice.action', { n: v + 1, text: cardActions(db.get(a0.card))[v] || '' });
        case 'buy': return t(v ? 'choice.yesBuy' : 'choice.no');
        case 'spend': {
          const sc = db.get(a0.card).sc?.[a0.ai ?? 0]?.[v];
          return sc ? t('choice.spend', { n: sc[1], res: this.anyResName(sc[0], sc[1]) }) : t('choice.option', { n: v + 1 });
        }
        case 'var': return String(v);
        case 'xs': return tj(v.map((s) => this.spaceWhere(s)));
        default: return typeof v === 'object' ? JSON.stringify(v) : String(v);
      }
    };
    this.flowModalOpen = true;
    this.modal((box) => {
      const src = a0.card != null ? db.get(a0.card) : null;
      box.appendChild(h('h2', '', esc(tHas('choice.t.' + dim) ? t('choice.t.' + dim) : t('choice.choose'))));
      box.appendChild(h('div', 'sub', src ? esc(cardName(src)) + (cardDesc(src) ? ' — ' + esc(cardDesc(src)) : '') : ''));
      const opts = h('div', 'opts');
      for (const [k, idxs] of vals) {
        const v = JSON.parse(k);
        const b = h('button', 'abtn opt', `<span class="nm">${esc(dim === 'steal' ? this.stealText(L[idxs[0]]) : label(dim, v))}</span>`);
        if (dim === 'atp' && v != null) b.style.borderColor = PCOL[v];
        b.onclick = () => { f.cands = idxs; this.closeModal(); this.resolve(); };
        opts.appendChild(b);
      }
      const c = h('button', 'ghost', esc(t('btn.cancel')));
      c.onclick = () => this.cancelFlow();
      box.appendChild(opts);
      const foot = h('div', 'foot'); foot.appendChild(h('div', 'info', '')); foot.appendChild(c); box.appendChild(foot);
    });
  }
}
