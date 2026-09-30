// flows.js -- App's action flows: a move from its first click to the answer sent, narrowing the legal moves
// one choice at a time (hexes on the board, targets, options), then payment.
import { has as tHas, t, tj } from '../i18n.js';
import { cardDesc, cardName } from '../cards/cards.js';
import { $, h, esc } from '../dom.js';
import { AK } from '../protocol.js';
import { PCOL, cresName, report, resName, spName } from './shared.js';

export class AppFlows {
  // ---------------------------------------------------------------- action flows
  sellFlow() {
    const ent = this.entries();
    const ids = [...ent.keys()].filter((k) => k.startsWith('sell:')).map((k) => +k.slice(5));
    this.infoFn = (sel) => t('sell.info', { n: sel.size, gain: `<b style="color:#7dffb0">+${sel.size} M€</b>` });
    this.okFn = null;
    this.nextRecOp = 'sellhint';                      // TFMBot picks: the cards it sees no future in (the bot server's sell hint)
    this.pickModal(esc(spName(0)), esc(t('sell.sub')), ids, 1, ids.length, (sel) => this.answer({ a: 'sell', cards: sel }), null, true, true);
  }

  // auto: the client opened this flow itself (the final greenery), so even a single legal hex waits for the player's tap
  startFlow(key, auto = false) {
    if ($('#actions').classList.contains('open')) { $('#actions').classList.remove('open'); const tog = $('#actions-toggle'); if (tog) tog.textContent = t('btn.actions'); }
    const ent = this.entries();
    const idxs = ent.get(key);
    if (!idxs) return;
    this.closeModal();
    this.flow = { key, cands: idxs.slice(), auto };
    this.audio.tick();
    this.resolve();
  }

  // does this move open the pay dialog (metal, Helion heat, card resources)?
  needsPayDialog(a) {
    if (!a || (!a.pay && a.bpay == null) || a.k === AK.SP) return false;
    const me = this.view.players[this.view.human];
    const cd = a.card != null ? this.db.get(a.card) : null;
    if (a.bpay != null) return (a.bpay < 2 && me.res[a.bpay === 0 ? 1 : 2] > 0) || (me.res[5] > 0 && this.db.name(me.corp) === 'Helion');   // card action paid with steel / titanium (Aquifer Pumping, Water Import From Europa)
    return !!((a.k === AK.PLAY && ((me.res[1] > 0 && cd?.tags.includes(0)) || (me.res[2] > 0 && cd?.tags.includes(1)))) || (me.res[5] > 0 && this.db.name(me.corp) === 'Helion') || a.pay?.crp?.length);
  }
  payChosen(idx, o) {
    const f = this.flow;
    if (f?.payFirst) { f.paid = o; f.payFirst = false; this.closeModal(); return this.resolve(); }
    this.flow = null;
    this.answer({ a: 'pay', idx, pay: o });
  }

  // Resolve one dimension at a time until a single legal action remains.
  resolve() {
    const f = this.flow;
    if (!f) return;
    if (!this.legal) return this.cancelFlow();       // the turn moved on under the flow (a slow pay dialog, a stale tap): nothing to resolve
    const L = this.legal;
    // pay FIRST (rules: you pay, then the card's effects -- tiles and their
    // bonuses -- happen), so a placement can't look like it funds the card
    if (!f.payAsked) {
      const a0 = L[f.cands[0]];
      const placesTile = f.cands.some((i) => L[i].space !== a0.space || L[i].bocean !== a0.bocean || JSON.stringify(L[i].xs) !== JSON.stringify(a0.xs));
      if (this.needsPayDialog(a0) && placesTile) { f.payAsked = true; f.payFirst = true; this.askPayOpts(f.cands[0]); return; }
    }
    const dims = ['space', 'bocean', 'xs', 'or', 'ai', 'spend', 'var', 'buy', 'atp', 'atc', 'steal', 'rtc', 'rtc2', 'rfc', 'pt', 'pss', 'free', 'burn', 'pay'];
    for (const d of dims) {
      const vals = new Map();
      for (const i of f.cands) { const key = JSON.stringify(L[i][d] ?? null); if (!vals.has(key)) vals.set(key, []); vals.get(key).push(i); }
      // an attack (remove / steal / decrease production): the victim is always
      // chosen explicitly, even a single one, with what it loses -- and "take
      // nothing" where the card says "up to" (the session layer adds that move)
      if (d === 'atp' && !f.targetOk && f.cands.some((i) => L[i].atk)) {
        // Robotic Workforce: first which card to copy, then -- for a "decrease any production" box -- whom
        if (!f.cands.every((i) => L[i].atk)) {
          const rv = new Map();
          for (const i of f.cands) { const k = JSON.stringify(L[i].rtc ?? null); if (!rv.has(k)) rv.set(k, []); rv.get(k).push(i); }
          if (rv.size > 1) return this.choiceModal('rtc', rv);
        }
        const groups = new Map();
        for (const i of f.cands) { const a = L[i], key = JSON.stringify([a.atp ?? null, a.atc ?? null, a.steal ?? null, a.stealn ?? null, a.rfc ?? null]); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(i); }
        const g0 = L[[...groups.values()][0][0]];
        if (groups.size > 1 || g0.atp != null || g0.rfc != null) return this.targetModal(groups);
        f.targetOk = true;          // nobody holds anything it could take: nothing to choose
      }
      if (vals.size <= 1 && !(f.auto && d === 'space' && JSON.parse([...vals.keys()][0]) != null)) continue;
      if (d === 'buy') { f.cands = vals.get('0') || vals.get('null') || [...vals.values()][0]; continue; }
      if (d === 'atp' && f.cands.every((i) => L[i].atc != null)) continue;      // the victim card names its owner
      // Virus-style cards: first WHAT to remove (plants vs animals), then from which card
      if (d === 'atc' && new Set(f.cands.map((i) => L[i].steal ?? null)).size > 1) continue;
      // several tiles at once (Giant Ice Asteroid's 2 oceans...): pick each on
      // the board, in any order, until one legal combination remains
      if ((d === 'space' || d === 'xs') && f.cands.every((i) => (L[i].xs || []).length && L[i].space != null)) {
        const setOf = (i) => [L[i].space, ...L[i].xs];
        const need = setOf(f.cands[0]).length;
        f.picks ||= [];
        const fits = (i) => { const s0 = setOf(i).slice(); return f.picks.every((p) => { const j = s0.indexOf(p); if (j < 0) return false; s0.splice(j, 1); return true; }); };
        f.cands = f.cands.filter(fits);
        if (f.picks.length >= need || !f.cands.length) {
          if (f.cands.length) f.cands = [f.cands[0]];
          f.picks = null;
          continue;
        }
        const next = new Set();
        for (const i of f.cands) { const s0 = setOf(i).slice(); for (const p of f.picks) s0.splice(s0.indexOf(p), 1); s0.forEach((x) => next.add(x)); }
        const a0 = L[f.cands[0]], cd = a0.card != null ? this.db.get(a0.card) : null;
        const what = cd?.ocean || a0.bocean != null || /ocean/i.test(cd?.description || '') ? 'ocean' : 'tile';
        this.prompt(t('prompt.placeN', { what: esc(t('what.' + what)), i: f.picks.length + 1, n: need, card: cd ? ` — ${esc(cardName(cd))}` : '' }), () => this.cancelFlow());
        this.board.highlight([...next], (sp) => { f.picks.push(sp); this.board.markPicked(sp, what === 'ocean' ? 'ocean' : 'special'); this.board.clearHighlight(); $('#prompt').classList.add('hidden'); this.resolve(); }, what === 'ocean' ? 'ocean' : 'special');
        this.placing = what;
        return;
      }
      if (d === 'space' || d === 'bocean') {
        const spaces = [...vals.keys()].map((k) => JSON.parse(k)).filter((s) => s != null);
        const a0 = L[f.cands[0]];
        const cd = a0.card != null ? this.db.get(a0.card) : null;
        const what = a0.k === AK.PLANTS || (a0.k === AK.SP && a0.sp === 4) ? 'greenery' : a0.k === AK.SP && a0.sp === 3 ? 'ocean' : a0.k === AK.SP && a0.sp === 5 ? 'city'
          : d === 'bocean' ? 'bonus ocean' : cd?.city ? 'city' : cd?.greenery ? 'greenery' : cd?.ocean ? 'ocean' : cd ? `${esc(cd.name)} tile` : 'tile';
        const me0 = this.view.players[this.view.human];
        const tharsis = this.forced && what === 'city' && this.db.name(me0.corp) === 'Tharsis Republic';
        const whatL = cd && what === `${esc(cd.name)} tile` ? t('what.cardTile', { card: esc(cardName(cd)) }) : esc(t({ greenery: 'what.greenery', ocean: 'what.ocean', city: 'what.city', 'bonus ocean': 'what.bonusOcean' }[what] || 'what.tile'));
        this.prompt(tharsis ? t('prompt.tharsis', { card: esc(this.db.lname(me0.corp)) }) : t('prompt.where', { what: whatL }), this.forced ? null : () => this.cancelFlow());
        // (the tap is the player's choice: an auto-started flow must not ask for the same single hex again)
        this.board.highlight(spaces, (s) => { f.cands = vals.get(JSON.stringify(s)); f.auto = false; this.board.clearHighlight(); $('#prompt').classList.add('hidden'); this.resolve(); }, what.includes('city') ? 'city' : what.includes('greenery') ? 'greenery' : what.includes('ocean') ? 'ocean' : 'special');
        this.placing = what;
        return;
      }
      this.choiceModal(d, vals);
      return;
    }
    // one action left
    const a = L[f.cands[0]];
    // it hits the opponent: say so and let the player confirm
    // an attack always asks -- including when the only legal target is YOU
    // (Asteroid Mining Consortium with nobody else holding titanium production)
    const atkCard = a.card != null ? this.db.get(a.card) : null;
    const selfHit = a.atp === this.view.human && !!(atkCard?.atk?.length);
    if (a.atp != null && (a.atp !== this.view.human || selfHit) && !f.targetOk) {
      const tgt = this.view.players[a.atp], cd = atkCard;
      if (selfHit) {
        const hit = esc(tj(cd.atk.map(([r, n]) => t('atk.prodLoss', { n, res: resName(r) }))));
        this.flowModalOpen = true;
        this.modal((box) => {
          box.appendChild(h('h2', '', `${esc(cardName(cd))} → <span style="color:${PCOL[a.atp]}">${esc(t('atk.yourself'))}</span>`));
          box.appendChild(h('div', 'sub', `${t('atk.selfSub', { hit })}<br><span style="color:var(--faint)">${esc(cardDesc(cd))}</span>`));
          const foot = h('div', 'foot'); foot.appendChild(h('div', 'info', ''));
          const c = h('button', 'ghost', esc(t('btn.cancel'))); c.onclick = () => this.cancelFlow();
          const ok = h('button', 'primary', esc(t('btn.playAnyway'))); ok.onclick = () => { f.targetOk = true; this.closeModal(); this.resolve(); };
          foot.append(c, ok); box.appendChild(foot);
        });
        return;
      }
      const what = a.steal ? esc(t('atk.take', { n: a.stealn, res: tHas('rn.' + a.steal) ? t('rn.' + a.steal) : a.steal, who: this.pname(tgt.id), has: tgt.res[['megacredits', 'steel', 'titanium', 'plants', 'energy', 'heat'].indexOf(a.steal)] })) : esc(cd ? cardDesc(cd) || t('atk.targets') : t('atk.targets'));
      this.flowModalOpen = true;
      this.modal((box) => {
        box.appendChild(h('h2', '', `${esc(cd ? cardName(cd) : t('atk.attack'))} → <span style="color:${PCOL[a.atp]}">${esc(this.pname(tgt.id))}</span>`));
        const takes = a.steal ? '' : this.takenText(a, cd, tgt);
        box.appendChild(h('div', 'sub', `${what}${takes ? `<br><span style="color:var(--faint)">${takes}</span>` : ''}`));
        const foot = h('div', 'foot'); foot.appendChild(h('div', 'info', ''));
        const c = h('button', 'ghost', esc(t('btn.cancel'))); c.onclick = () => this.cancelFlow();
        const ok = h('button', 'primary', esc(t('btn.play'))); ok.onclick = () => { f.targetOk = true; this.closeModal(); this.resolve(); };
        foot.append(c, ok); box.appendChild(foot);
      });
      return;
    }
    const me = this.view.players[this.view.human];
    const cd = a.card != null ? this.db.get(a.card) : null;
    const canMetal = (a.bpay != null && ((a.bpay < 2 && me.res[a.bpay === 0 ? 1 : 2] > 0) || (me.res[5] > 0 && this.db.name(me.corp) === 'Helion'))) || a.pay && ((a.k === AK.PLAY && ((me.res[1] > 0 && cd?.tags.includes(0)) || (me.res[2] > 0 && cd?.tags.includes(1)))) || (me.res[5] > 0 && this.db.name(me.corp) === 'Helion'));   // steel/titanium only pay for playing a card
    const canCardRes = !!(a.pay?.crp?.length);          // microbes / floaters that can pay
    if (f.paid) return this.answer({ a: 'pay', idx: f.cands[0], pay: f.paid });    // paid before placing
    if (f.payAsked) return this.answer({ a: 'action', idx: f.cands[0] });
    if ((canMetal || canCardRes) && a.k !== AK.SP) return this.askPayOpts(f.cands[0]);
    this.answer({ a: 'action', idx: f.cands[0] });
  }

  // the worker's payment options for legal move idx; the reply is matched to the very move asked about
  askPayOpts(idx) {
    this.flow.payIdx = idx; this.flow.payAct = JSON.stringify(this.legal[idx]);
    this.worker.postMessage({ t: 'payopts', idx });
  }
  payModal(idx, po) {
    if (!this.flow || this.flow.payIdx !== idx || !this.legal?.[idx]) return;
    // the move list changed while the options were on their way (a new view): idx may now be another move --
    // never answer it; the player starts the move again
    if (JSON.stringify(this.legal[idx]) !== this.flow.payAct) {
      report('pay-stale', 'the legal list changed under a pending payment', { k: this.legal[idx].k, was: this.flow.payAct?.slice(0, 200) });
      this.cancelFlow();
      return;
    }
    const opts = po.opts || [];
    const a = this.legal[idx], canon = a.pay || {};
    // cross-check: the executor's full price must be the printed cost less the engine's discounts
    if (po.base >= 0 && po.cost !== Math.max(0, po.base - po.disc)) report('pay-cost-mismatch', `${this.db.name(a.card)}: executor min ${po.cost}, printed ${po.base} - discount ${po.disc}`);
    if (!opts.length) report('pay-no-options', `${this.db.name(a.card)}: no payment option passed the executor`, { po, k: a.k, pay: a.pay, idx, snapshot: this.snapB64() });   // (the position, to reproduce it)
    if (opts.length <= 1) {
      if (this.flow?.payFirst) { this.flow.payFirst = false; this.flow.paid = opts[0] || null; return this.resolve(); }
      return opts.length ? this.answer({ a: 'pay', idx, pay: opts[0] }) : this.answer({ a: 'action', idx });
    }
    const me = this.view.players[this.view.human];
    const src = po.src;                              // card resources that can pay (Psychrophiles microbes...)
    const RICON = { microbe: 'microbe', floater: 'floater', animal: 'animal', science: 'science' };
    const val = { mc: 1, steel: me.steelv ?? 2, ti: me.tiv ?? 3, heat: 1, k: src?.v || 0 };
    const worthOf = (o) => o.mc + o.steel * val.steel + o.ti * val.ti + o.heat + (o.k || 0) * val.k;
    const canonK = (canon.crp || []).reduce((n, c) => n + (c.n || 0), 0);
    const same = (o) => o.mc === (canon.mc || 0) && o.steel === (canon.steel || 0) && o.ti === (canon.ti || 0) && o.heat === (canon.heat || 0) && (o.k || 0) === canonK;
    opts.sort((x, y) => (y.mc - x.mc) || ((x.steel + x.ti + (x.k || 0)) - (y.steel + y.ti + (y.k || 0))));
    const icon = { mc: 'megacredit', steel: 'steel', ti: 'titanium', heat: 'heat', k: RICON[src?.res] || 'microbe' };
    this.flowModalOpen = true;
    this.modal((box) => {
      box.appendChild(h('h2', '', esc(t('pay.title', { cost: po.cost, card: this.db.lname(a.card) }))));
      const why = po.base >= 0 && po.disc ? t('pay.why', { base: po.base, disc: po.disc, cost: po.cost }) : '';
      const metals = tj([(po.have?.steel ? t('pay.steelWorth', { n: val.steel }) : ''), (po.have?.ti ? t('pay.tiWorth', { n: val.ti }) : ''), (src ? t('pay.resWorth', { res: tHas('cres.' + src.res) ? cresName(src.res, 2) : src.res, card: this.db.lname(src.card), n: val.k }) : '')].filter(Boolean));
      box.appendChild(h('div', 'sub', `${why}${metals ? esc(metals[0].toLocaleUpperCase() + metals.slice(1)) + '. ' : ''}${esc(t('pay.choose'))}`));
      // three ways to pay: the suggested one (the engine's own rule, which is what TFMBot pays), keeping the other
      // resources (the most M€) and spending them (the least M€). Every other split: Custom amounts, below
      const minMc = Math.min(...opts.map((o) => o.mc));
      const shown = [opts.find(same), opts[0], opts.find((o) => o.mc === minMc)].filter((o, i, all) => o && all.indexOf(o) === i);
      const row = h('div', 'payopts');
      for (const o of shown) {
        const parts = [];
        if (o.mc) parts.push(`<span class="pp"><img src="assets/res/megacredit.png">${o.mc}</span>`);
        if (o.steel) parts.push(`<span class="pp"><img src="assets/res/steel.png">${o.steel}</span>`);
        if (o.ti) parts.push(`<span class="pp"><img src="assets/res/titanium.png">${o.ti}</span>`);
        if (o.heat) parts.push(`<span class="pp"><img src="assets/res/heat.png">${o.heat}</span>`);
        if (o.k) parts.push(`<span class="pp"><img src="assets/res/${icon.k}.png">${o.k}</span>`);
        if (!parts.length) parts.push(`<span class="pp">${esc(t('pay.free'))}</span>`);
        const worth = worthOf(o);
        const b = h('button', 'abtn opt' + (same(o) ? ' rec' : ''), parts.join('') + `<small>${same(o) ? esc(t('pay.suggested')) : ''}${esc(t('pay.worth', { n: worth }))}${worth > po.cost ? ` (${esc(t('pay.overpays', { n: worth - po.cost }))})` : ''}</small>`);
        b.onclick = () => this.payChosen(idx, o);
        row.appendChild(b);
      }
      box.appendChild(row);
      // or set the amounts yourself; the engine checks them when you pay
      const hv = po.have || {};
      const keys = ['steel', 'ti', 'heat', 'k'].filter((k) => hv[k] > 0);
      const cur = { mc: 0, steel: 0, ti: 0, heat: 0, k: 0, ...(opts.find(same) || opts[0]) };
      const custom = h('div', 'paycustom');
      const payBtn = h('button', 'primary', esc(t('btn.pay')));
      const status = h('span', 'pcs', '');
      const refresh = () => {
        custom.querySelectorAll('[data-k]').forEach((e) => { e.textContent = cur[e.dataset.k]; });
        const worth = worthOf(cur);
        const short = po.cost - worth;
        status.innerHTML = short > 0 ? `<b style="color:#ff8a8a">${esc(t('pay.short', { n: short }))}</b>` : worth > po.cost ? `${esc(t('pay.worth', { n: worth }))} · <span style="color:#ffc46b">${esc(t('pay.overpays', { n: worth - po.cost }))}</span>` : `${esc(t('pay.worth', { n: worth }))} ✓`;
        payBtn.disabled = short > 0 || cur.mc > (hv.mc ?? 0);
      };
      const autoMc = () => { cur.mc = Math.max(0, po.cost - (worthOf(cur) - cur.mc)); };
      custom.appendChild(h('div', 'pch', esc(t('pay.custom'))));
      for (const k of ['mc', ...keys]) {
        const cell = h('div', 'pcell', `<img src="assets/res/${icon[k]}.png" alt="" title="${esc(k === 'k' ? this.db.lname(src.card) : resName({ mc: 0, steel: 1, ti: 2, heat: 5 }[k]))}">`);
        const dn = h('button', 'ghost', '−'), up = h('button', 'ghost', '+');
        const max = k === 'mc' ? hv.mc : hv[k];
        dn.onclick = () => { if (cur[k] > 0) { cur[k]--; if (k !== 'mc') autoMc(); refresh(); } };
        up.onclick = () => { if (cur[k] < max) { cur[k]++; if (k !== 'mc') autoMc(); refresh(); } };
        const n = h('span', 'pn', ''); n.dataset.k = k;
        cell.append(dn, n, up, h('small', '', `/ ${max}`));
        custom.appendChild(cell);
      }
      payBtn.onclick = () => this.payChosen(idx, { mc: cur.mc, steel: cur.steel, ti: cur.ti, heat: cur.heat, k: cur.k });
      custom.append(status, payBtn);
      box.appendChild(custom);
      refresh();
      const foot = h('div', 'foot'); foot.appendChild(h('div', 'info', ''));
      const c = h('button', 'ghost', esc(t('btn.cancel'))); c.onclick = () => this.cancelFlow(); foot.appendChild(c);
      box.appendChild(foot);
    });
  }

  cancelFlow() {
    if (this.view && this.fgAuto === this.view.moves) this.fgSkip = this.view.moves;   // declined the auto-started final greenery
    this.flow = null; this.board.clearHighlight(); this.board.clearPicked(); $('#prompt').classList.add('hidden'); this.closeModal(); this.setupDecision();
  }
}
