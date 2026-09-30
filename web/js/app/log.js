// log.js -- App's game log: a sentence per move (what it did, what it cost, what it revealed), the feed
// under the player boards and the full ☰ log, and the short texts that name a legal action.
import { has as tHas, isEnglish, t, tj, tw } from '../i18n.js';
import { cardOrTitles } from '../cards/cards.js';
import { $, h, esc } from '../dom.js';
import { D, AK } from '../protocol.js';
import { ATTACK_RE } from './content.js';
import { PCOL, REPLAY, cresName, maName, report, resName, signed, spName, spaceName } from './shared.js';

export class AppLog {
  // ---------------------------------------------------------------- log
  // where a space is, for people: its name if it has one, else "row 4, hex 3" (rows 1-9 from the top, hexes from
  // the left within the row; kind 2 = the off-board colonies) -- the engine's space ids mean nothing to a player
  rowCol(s) {
    const m = this.map;
    if (!m?.spaces?.[s]) return null;
    if (m._rc?.key !== m.key) {
      const board = m.spaces.filter((x) => x.kind !== 2), ys = [...new Set(board.map((x) => x.y))].sort((a, b) => a - b);
      const rc = {};
      for (const [r, y] of ys.entries()) board.filter((x) => x.y === y).sort((a, b) => a.x - b.x).forEach((x, c) => { rc[x.i] = [r + 1, c + 1]; });
      m._rc = { key: m.key, rc };
    }
    return m._rc.rc[s] || null;
  }
  spaceWhere(s) {
    const sp = this.map?.spaces?.[s];
    if (sp?.name) return spaceName(sp.name);
    const rc = this.rowCol(s);
    return rc ? t('hex.rc', { r: rc[0], c: rc[1] }) : t('act.hex', { n: s });
  }

  describe(v) {
    const L = v.last, p = L.player, a = L.act, db = this.db;
    const who = `<b style="color:${PCOL[p]}">${esc(this.pname(p))}</b>`;
    const card = (id) => `<b>${esc(db.lname(id))}</b>`;
    const sp = (s) => (s >= 0 && this.map.spaces[s]) ? t('log.at', { space: esc(this.spaceWhere(s)) }) : '';
    const t = (k, q) => tw(k, q, this.isYou(p, v));            // (the log's sentences: "you" forms where a language has them)
    switch (L.kind) {
      case D.SETUP: return v.stage === 0 && p !== v.human ? t('log.chosenCorp', { who }) : t('log.chose', { who, card: card(L.card) });
      case D.TILE: return t('log.placedTile', { who, at: sp(L.space) });
      case D.BONUS: return t('log.bonusPrelude', { who, card: card(L.card) });
      case D.DRAFT: return p === v.human ? t('log.drafted', { who, card: card(L.card) }) : t('log.draftedHidden', { who });
      case D.RESEARCH: return t('log.research', { who });
      case D.KEEP: return t('log.keep', { who });
      case D.BUY: {
        const mine = L.player === this.view.human && L.bcard >= 0;
        return t(L.bought ? 'log.bought' : 'log.discarded', { who, card: mine ? card(L.bcard) : esc(t('log.theCard')), src: card(L.card) });
      }
      case D.TRIGGER: {
        const src = this.db.name(L.card), alt = L.topt;
        const nm2 = esc(this.db.lname(L.card));
        if (src === 'Olympus Conference') return t(alt ? 'log.ocDraw' : 'log.ocAdd', { who, card: nm2 });
        if (src === 'Mars University') return alt ? t('log.muUsed', { who, card: nm2, what: L.tdisc >= 0 && L.player === this.view.human ? esc(this.db.lname(L.tdisc)) : esc(t('log.aCard')) }) : t('log.muKept', { who, card: nm2 });
        if (src === 'Viral Enhancers') return t(alt ? 'log.vePlant' : 'log.veAdd', { who, card: nm2 });
        return t('log.resolved', { who, card: nm2 });
      }
      case D.PLAY_PRELUDE: return t('log.playedPrelude', { who, card: card(L.card) });
      case D.PRELUDE_PLAY:
      case D.ACTION:
      case D.FG:
        switch (a.k) {
          case AK.PLAY: {
            // the card it targets: Robotic Workforce's copied building, where resources went...
            const tgt = a.rtc != null ? (/robotic workforce/i.test(db.name(a.card)) ? t('log.copying', { card: card(a.rtc) }) : ` → ${card(a.rtc)}`) : '';
            return t('log.played', { who, card: card(a.card), extra: `${tgt}${a.space != null ? sp(a.space) : ''}${this.paidText(a)}` });
          }
          case AK.SP: return a.sp === 0 ? t('log.sold', { who, card: p === v.human ? card(a.disc[0]) : esc(t('log.aPatent')) }) : t('log.sp', { who, sp: esc(spName(a.sp)), extra: `${a.space != null ? sp(a.space) : ''}${this.paidText(a)}` });
          case AK.MS: return t('log.claimed', { who, ms: esc(maName(v.ms[a.ma % 5].name)), extra: this.paidText(a) });
          case AK.AW: return t('log.funded', { who, aw: esc(maName(v.aw[a.ma % 5].name)), extra: this.paidText(a) });
          case AK.BLUE:
            // Business Network / Inventors' Guild in one move (the bot's): what became of the card it looked at
            // (bought or not). Yours has its own buy step (log.bought / log.discarded)
            if (a.buy != null && !(v.pending.kind === D.BUY && v.pending.player === p)) return t(a.buy ? 'log.lookBought' : 'log.lookDiscarded', { who, card: card(a.card) });
            return t('log.used', { who, card: card(a.card) });
          case AK.PLANTS: return t('log.planted', { who, at: sp(a.space) });
          case AK.HEAT: return t('log.heat', { who });
          case AK.PASS: return t('log.passed', { who });
          case AK.END: return t('log.ended', { who });
        }
    }
    return '';
  }
  // A "remove/decrease ... any player" play that changed nothing for the
  // opponent: say why (protected / nothing to take); report it if neither.
  attackNote(a, b) {
    const L = b.last, act = L.act || {};
    if (!(act.k === AK.PLAY || act.k === AK.BLUE) || act.card == null) return '';
    const cd = this.db.get(act.card), text = act.k === AK.BLUE ? (cd.actions || [])[act.ai || 0] || '' : cd.description || '';
    if (!ATTACK_RE.test(text)) return '';
    const victim = b.players.find((p) => p.id !== L.player), was = a.players[victim.id];
    const changed = victim.res.some((x, r) => x !== was.res[r]) || victim.prod.some((x, r) => x !== was.prod[r]) || JSON.stringify(victim.cres) !== JSON.stringify(was.cres);
    if (changed || act.atp === L.player) return '';
    const nm = esc(this.pname(victim.id)), note = (x) => `<span style="color:var(--faint)">${x}</span>`;
    const prot = this.db.byName.get('Protected Habitats')?.id;
    if (victim.played.includes(prot) && /plant|animal|microbe/i.test(text)) return note(tw('atk.protected', { who: nm, card: esc(this.db.lname(prot)) }, this.isYou(victim.id, b)));
    // Arctic Algae: the card's own oceans gave the victim plants back (+2 each), which can cancel the removal exactly
    const algae = this.db.byName.get('Arctic Algae')?.id;
    if (victim.played.includes(algae) && b.oceans > a.oceans && /plant/i.test(text)) return note(tw('atk.offset', { who: nm, card: esc(this.db.lname(algae)) }, this.isYou(victim.id, b)));
    // what the card would take, and whether the victim had any of it
    const R = { 'M€': 0, megacredit: 0, steel: 1, titanium: 2, plant: 3, energy: 4, heat: 5 };
    // only what the attack clause takes ("gain 2 titanium" is not taken)
    const clause = (text.match(/\b(remove|decrease|steal|reduce)\b[^.]*/i) || [''])[0];
    const hits = [...clause.matchAll(/any (M€|steel|titanium|plant|energy|heat) production|(\d+) (M€|steel|titanium|plants?|energy|heat)\b/gi)];
    const empty = hits.length && hits.every((m) => (m[1] ? was.prod[R[m[1]]] <= (m[1] === 'M€' ? -5 : 0) : was.res[R[m[3].replace(/s$/, '')]] <= 0));
    if (empty) return note(tw('atk.nothing', { who: nm }, this.isYou(victim.id, b)));
    if (act.atp == null && act.atk?.[3]) return '';     // "up to": the player chose to take nothing
    report('attack-no-effect', `${cd.name}: no effect on the opponent and no visible reason`, { victim: { res: was.res, prod: was.prod }, act });
    return note(t('atk.noEffect', { who: nm }));
  }

  // What a move changed, per player (resources, production, TR), with the
  // mover's own payment for the card left out: "TFMBot −3 M€ · You +3 M€".
  effectsOf(a, b) {
    if (!a || !b || a.gen !== b.gen || b.last.player < 0 || a.phase !== b.phase) return '';
    const act = b.last.act || {}, pay = act.pay || {};
    const parts = [];
    for (const pb of b.players) {
      const pa = a.players[pb.id]; if (!pa) continue;
      const bits = [];
      pb.res.forEach((x, r) => {
        let d = x - pa.res[r];
        if (pb.id === b.last.player) d += [pay.mc || 0, pay.steel || 0, pay.ti || 0, 0, 0, pay.heat || 0][r];
        if (d) bits.push(t('fx.res', { d: signed(d), res: resName(r) }));
      });
      pb.prod.forEach((x, r) => { const d = x - pa.prod[r]; if (d) bits.push(t('fx.prod', { d: signed(d), res: resName(r) })); });
      if (pb.tr !== pa.tr) bits.push(t('fx.tr', { d: signed(pb.tr - pa.tr) }));
      // resources on cards: "+1 microbe on Decomposers (now 4)"
      const CR = { 6: 'animal', 8: 'microbe', 9: 'science', 10: 'floater', 7: 'fighter' };
      for (const id of new Set([...Object.keys(pb.cres || {}), ...Object.keys(pa.cres || {})])) {
        const now = pb.cres?.[id] ?? 0, d = now - (pa.cres?.[id] ?? 0);
        if (!d) continue;
        const r = CR[this.db.get(+id)?.res] || 'resource';
        bits.push(t('fx.cres', { d: signed(d), res: cresName(r, Math.abs(d)), card: esc(this.db.lname(+id)), now, n: Math.abs(d) }));
      }
      if (bits.length) parts.push(`<b style="color:${PCOL[pb.id]}">${esc(this.pname(pb.id))}</b> ${tj(bits)}`);
    }
    // the global parameters, with the track bonuses they crossed (so 8 % oxygen's extra temperature step
    // is logged, not only the TR it gives)
    const deg = (x) => (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x);
    const bon = (txt, what) => t('track.bonus', { what: txt, bonus: tj(what.map((k) => t(k))) });
    if (b.oxy !== a.oxy) {
      const txt = t('fx.oxy', { a: a.oxy, b: b.oxy });
      parts.push(a.oxy < 8 && b.oxy >= 8 && a.temp < 8 ? bon(txt, ['track.raiseTemp']) : txt);
    }
    if (b.temp !== a.temp) {
      const txt = t('fx.temp', { a: deg(a.temp), b: deg(b.temp) }), got = [];
      for (const [at, k] of [[-24, 'track.heatProd'], [-20, 'track.heatProd'], [0, 'track.placeOcean']]) if (a.temp < at && b.temp >= at) got.push(k);
      parts.push(got.length ? bon(txt, got) : txt);
    }
    if (b.oceans !== a.oceans) parts.push(t('fx.oceans', { a: a.oceans, b: b.oceans }));
    return parts.join(' · ');
  }

  revealText(v) {
    if (!(v.reveal && v.reveal.cards?.length)) return '';
    if (this.lookBuy(v)) return '';                    // (the move's own line says it: "… and bought it")
    const R = v.reveal, vis = (d) => R.pub || d === v.human || R.player === v.human;
    const kept = R.cards.filter(([, d]) => d >= 0), disc = R.cards.filter(([, d]) => d < 0);
    const names = (arr) => {
      const seen = arr.filter(([, d]) => vis(d)).map(([c]) => `<b>${esc(this.db.lname(c))}</b>`), hid = arr.length - seen.length;
      return tj([...seen, ...(hid ? [esc(hid === 1 ? t('rv.aCard') : t('rv.nCards', { n: hid }))] : [])]);
    };
    const bits = [];
    // draws a tag trigger made (Point Luna...): "Point Luna: drew …"
    const trg = (R.trig || []).filter(([c, n]) => c >= 0 && n > 0), trgN = trg.reduce((s, [, n]) => s + n, 0);
    const trgName = tj(trg.map(([c]) => esc(this.db.lname(c))));
    if (kept.length && trgN && !R.pub) bits.push(trgN >= kept.length ? t('reveal.from', { src: trgName, what: t('rv.drew', { names: names(kept) }) })
      : `${t('rv.drew', { names: names(kept) })} · ${t('reveal.from', { src: trgName, what: '+' + trgN })}`);
    else if (kept.length) bits.push(t(R.pub ? 'rv.kept' : 'rv.drew', { names: names(kept) }));
    if (disc.length) bits.push(t('rv.discarded', { names: names(disc) }));
    return bits.length ? `<span class="rvlog">${R.pub ? esc(t('rv.revealed')) : ''}${bits.join(' · ')}</span>` : '';
  }
  // the reveal is a look-then-buy card's one card (Business Network, Inventors' Guild: bought or discarded in the same move)
  lookBuy(v) {
    const R = v.reveal, a = v.last?.act;
    return !!(R && a && a.k === AK.BLUE && a.buy != null && R.player === v.last.player && !R.pub && R.cards?.length === 1);
  }
  // The move history: every move, newest first, scrollable back to the start
  // of the game in the feed under the player boards (and oldest-first in the
  // ☰ log). Persisted with the autosave so a reload keeps it.
  pushFeed(t, alt, c, g) {
    const it = { t, alt, c, g };
    (this.feedItems ||= []).push(it);
    this.addFeedItem(it, true);
  }

  logStep(v, step) {
    // research purchases, told only once every player has chosen
    const pv = this.prevLogView; this.prevLogView = v;
    // the bot's setup, one row per choice, once its choices are no longer secret
    if (pv && pv.stage === 0 && v.stage !== 0) {
      for (const pl of v.players) {
        if (pl.id === v.human) continue;
        const nm = `<b style="color:${PCOL[pl.id]}">${esc(this.pname(pl.id))}</b>`, card = (id) => `<b>${esc(this.db.lname(id))}</b>`;
        if (pl.corp >= 0) this.pushFeed(t('log.chose', { who: nm, card: card(pl.corp) }), '', PCOL[pl.id], v.gen);
        if (this.heldRevealLog) { this.pushFeed(`${nm}: ${this.heldRevealLog}`, '', PCOL[pl.id], v.gen); this.heldRevealLog = null; }
      }
    }
    // the bot's preludes resolve in turn order (one engine step may resolve
    // both): a row per prelude that appeared, except the one this move describes
    if (pv && v.stage !== 0) {
      for (const pl of v.players) {
        if (pl.id === v.human) continue;
        const was = pv.players[pl.id]?.preludes || [];
        const nm = `<b style="color:${PCOL[pl.id]}">${esc(this.pname(pl.id))}</b>`, card = (id) => `<b>${esc(this.db.lname(id))}</b>`;
        for (const pre of pl.preludes) {
          if (was.includes(pre) || (v.last.kind === D.PLAY_PRELUDE && v.last.player === pl.id && v.last.card === pre)) continue;
          this.pushFeed(t('log.playedPrelude', { who: nm, card: card(pre) }), '', PCOL[pl.id], v.gen);
        }
      }
    }
    if (pv && pv.phase === 1 && v.phase !== 1 && v.bought) {
      const t2 = t('log.researchAll', { list: v.bought.map((n, i) => tw('log.boughtN', { who: `<b style="color:${PCOL[i]}">${esc(this.pname(i))}</b>`, n }, this.isYou(i, v))).join(' · ') });
      const it2 = { t: t2, alt: '', c: '#8aa', g: v.gen };
      (this.feedItems ||= []).push(it2); this.addFeedItem(it2, true);
    }
    const t1 = this.describe(v);
    if (!t1) return;
    let alt = '';
    const think = step?.think;
    if (think?.top?.length > 1 && think.total > 0) {
      const alts = tj(think.top.slice(1, 3).map((x) => `${this.actText(x.act, true)} ${Math.round(100 * x.visits / think.total)}%`));
      alt = t('log.think', { pct: Math.round(100 * think.top[0].visits / think.total), alts: esc(alts) });
    }
    // the bot's search stats are kept apart: shown only if the player opts in
    const th = alt; alt = '';
    if (step?.effects) alt = step.effects;
    // what this move revealed / drew, by name where the viewer may see it
    // (the bot's secret setup: held until its choices are shown)
    const rv = this.revealText(v);
    if (rv && v.stage === 0 && v.last.player !== v.human) this.heldRevealLog = rv;
    else if (rv) alt = rv + (alt ? `<br>${alt}` : '');
    const it = { t: t1, alt, th, c: PCOL[v.last.player] || '#666', g: v.gen };
    (this.feedItems ||= []).push(it);
    this.addFeedItem(it, true);
    if (REPLAY == null) try { localStorage.setItem('tfmweb.feed', JSON.stringify(this.feedItems.slice(-4000))); } catch {}
    if (v.last.player !== v.human && v.pending.player !== v.human && !this.rpCollect) this.setStatus(t1.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&'), true);
  }
  feedEl() {
    let feed = $('#feed');
    if (!feed) { feed = h('div', 'feed'); feed.id = 'feed'; $('#players').appendChild(feed); }
    return feed;
  }
  addFeedItem(it, live) {
    if (this.rpCollect) return;                      // (replay/replay.js precompute: the items only)
    const txt = this.uiFx.decorateLog(it.t, this.db);   // inline icons (display only; the stored text is unchanged)
    const alt0 = this.showThink ? it.alt : (it.alt || '').replace(/(<br>)?chose with [^<]*/g, '');   // (feed entries saved by older versions carry the search stats in alt)
    const extra = [alt0, this.showThink ? it.th : ''].filter(Boolean).join('<br>');
    // the full log shows what each move did too ("TFMBot +3 M€ · You −3 M€" for Hired Raiders...)
    const li = h('li', '', `<small>G${it.g}</small> ${txt}${extra ? `<div class="alt">${this.uiFx.decorateLog(extra, this.db)}</div>` : ''}`);
    $('#log-list').appendChild(li);
    if (live) li.scrollIntoView({ block: 'end' });
    const feed = this.feedEl();
    const item = h('div', 'fi', txt + (extra ? `<div class="alt">${this.uiFx.decorateLog(extra, this.db)}</div>` : ''));
    item.style.borderColor = it.c;
    item.style.setProperty('--pc', it.c);
    if (!live) item.style.animation = 'none';
    const atTop = this.rpBulk || feed.scrollTop < 8;   // (a replay's bulk rebuild reads no layout)
    feed.prepend(item);
    if (!atTop) feed.scrollTop += item.offsetHeight + 3;    // don't yank a reader
    // generation dividers
    const prev = item.nextElementSibling;
    if (prev && prev.dataset.g && +prev.dataset.g !== it.g) item.insertAdjacentHTML('afterend', `<div class="gdiv">${esc(t('gen.banner', { n: prev.dataset.g }))}</div>`);
    item.dataset.g = it.g;
  }
  truncateFeed(n) {
    if (!this.feedItems || this.feedItems.length <= n) return;
    this.feedItems.length = n;
    $('#log-list').innerHTML = ''; this.feedEl().innerHTML = '';
    for (const it of this.feedItems) this.addFeedItem(it, false);
    try { localStorage.setItem('tfmweb.feed', JSON.stringify(this.feedItems.slice(-4000))); } catch {}
  }
  restoreFeed() {
    try { this.feedItems = JSON.parse(localStorage.getItem('tfmweb.feed') || '[]'); } catch { this.feedItems = []; }
    for (const it of this.feedItems) this.addFeedItem(it, false);
  }

  // "for 12 M€ + 2 steel + 3 microbes"
  paidText(a) {
    const p = a.pay; if (!p) return '';
    const parts = [];
    if (p.mc) parts.push(`${p.mc} M€`);
    if (p.steel) parts.push(t('take.res', { n: p.steel, res: resName(1) }));
    if (p.ti) parts.push(t('take.res', { n: p.ti, res: resName(2) }));
    if (p.heat) parts.push(t('take.res', { n: p.heat, res: resName(5) }));
    for (const c of p.crp || []) if (c.n) parts.push(`${t('take.res', { n: c.n, res: tHas('cres.' + c.res) ? cresName(c.res, c.n) : c.res })} (${esc(this.db.lname(c.card))})`);
    return ` <span class="paid">${t('log.paid', { list: parts.length ? parts.join(' + ') : t('pay.free') })}</span>`;
  }
  // a resource by the engine's index: 0-5 stock resources, 6+ card resources
  anyResName(i, n = 2) {
    if (i >= 0 && i <= 5) return resName(i);
    return cresName({ 6: 'animal', 7: 'fighter', 8: 'microbe', 9: 'science', 10: 'floater' }[i] || 'resource', n);
  }

  actText(a, hideCards) {
    const db = this.db;
    let s;
    switch (a.k) {
      case AK.PLAY: s = t('act.play', { card: db.lname(a.card) }); break;
      case AK.SP: s = a.sp === 0 ? (hideCards ? t('act.sellN', { n: a.disc.length }) : t('act.sell', { cards: tj(a.disc.map((c) => db.lname(c))) })) : t('act.sp', { sp: spName(a.sp) }); break;
      case AK.MS: s = t('act.claim', { ms: maName(this.view.ms[a.ma % 5].name) }); break;
      case AK.AW: s = t('act.fund', { aw: maName(this.view.aw[a.ma % 5].name) }); break;
      case AK.BLUE: s = t('act.use', { card: db.lname(a.card) }); break;
      case AK.PLANTS: s = t('act.plantsGreen'); break;
      case AK.HEAT: s = t('act.heatTemp'); break;
      case AK.PASS: return t('act.pass');
      case AK.END: return t('act.end');
      default: return '?';
    }
    // the detail that tells two variants of the same action apart
    const extra = [];
    if (a.spend != null) { const sc = db.get(a.card)?.sc?.[a.ai ?? 0]?.[a.spend]; if (sc) extra.push(t('act.spend', { res: this.anyResName(sc[0]) })); }
    if (a.or != null) { const tt = cardOrTitles(db.get(a.card))[a.or]; extra.push(tt ? (isEnglish() ? tt.toLowerCase() : tt) : t('act.option', { n: a.or + 1 })); }
    if (a.space != null) extra.push(t('act.at', { space: this.spaceWhere(a.space) }));
    if (a.rtc != null) extra.push(`→ ${db.lname(a.rtc)}`);
    if (a.atp != null && a.k !== AK.SP) extra.push(t('act.vs', { who: this.pname(a.atp) }));
    return extra.length ? `${s} (${tj(extra)})` : s;
  }
}
