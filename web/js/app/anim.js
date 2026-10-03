// anim.js -- App's move animations: the difference between two views played out as card fly-bys,
// floating resource and production changes, drawn / revealed card trays and asteroid strikes.
import { t, tj, tw } from '../i18n.js';
import { moodForCard, moodForTile } from '../audio/audio.js';
import { CARD_RES_ICON, RES, cardEl, cardName } from '../cards/cards.js';
import { asteroidStrike, deimosOrigin } from '../board/impact.js';
import { $, h, esc } from '../dom.js';
import { D, AK } from '../protocol.js';
import { MOOD_RANK, SP } from './content.js';
import { FAST, PCOL, PMARK_MS, REPLAY, cresName, dur, maName, pace, signed, sleep, spName } from './shared.js';

// fly-bys (cards, moves, resources placed on cards) linger this much longer than their base timings
const FLY_PACE = 1.35;

export class AppAnim {
  // Which card placed each city, so the board can dress it to match (Domed
  // Crater's dome, Research Outpost's base... board/tiles/): a new city is
  // credited to the move that made it -- a card play, or the prelude being
  // resolved for a setup tile. Kept with the save; rebuilt from the saved
  // decision log for a save that has no record of it.
  noteTileSources(prev, v, fresh) {
    if (fresh) { this.tileSrc = {}; this.preludeSrc = null; }
    const src = this.tileSrc ||= {}, L = v.last || {}, a = L.act || {};
    const city = new Set(v.tiles.filter(([, t]) => t === 2 || t === 1).map(([s]) => s));   // cities, and greeneries (Protected Valley, Mangrove)
    for (const s of Object.keys(src)) if (!city.has(+s)) delete src[s];           // undone / replaced
    if (!prev && this.savedLog?.length) {
      for (const e of this.savedLog) { const x = e.last?.act; if (x && x.k === AK.PLAY && x.card >= 0 && city.has(x.space) && !src[x.space]) src[x.space] = this.db.name(x.card); }
      this.savedLog = null;
    }
    if (L.kind === D.PLAY_PRELUDE && L.card >= 0) this.preludeSrc = { player: L.player, card: L.card };
    if (prev) for (const s of city) {
      if (src[s] || prev.tiles.some(([s2]) => s2 === s)) continue;
      const card = a.k === AK.PLAY && a.card >= 0 && (L.kind === D.ACTION || L.kind === D.PRELUDE_PLAY || L.kind === D.FG) ? a.card
        : L.kind === D.TILE && this.preludeSrc?.player === L.player ? this.preludeSrc.card : -1;
      if (card >= 0) src[s] = this.db.name(card);
    }
    // Tharsis Republic's founding city (its first action, no card): credited to the corporation --
    // the first Mars city of a Tharsis player that no card placed (loaded games: the first such in tile order)
    const onMars = (s) => this.map.spaces[s]?.kind !== 2;
    for (const [s, t, o] of v.tiles) {
      if (t !== 2 || src[s] || !onMars(s) || this.db.name(v.players[o]?.corp) !== 'Tharsis Republic') continue;
      if (v.tiles.some(([s2, t2, o2]) => t2 === 2 && o2 === o && src[s2] === 'Tharsis Republic')) continue;
      if (prev && prev.tiles.some(([s2, t2, o2]) => t2 === 2 && o2 === o && onMars(s2) && s2 !== s)) continue;   // (in play: only if it had no city on Mars yet)
      src[s] = 'Tharsis Republic';
    }
    this.board.tileSrc = src;
    this.board.stageGen = v.gen;
  }

  async animateDiff(a, b, step) {
    const who = b.last.player;
    const botMove = step && step.who === 'bot';
    let wait = 0;
    // generation change
    if (b.gen !== a.gen) {
      this.audio.coin();
      if (!this.uiFx.genBanner(b.gen)) this.toast(t('gen.banner', { n: b.gen }));
      this.flashResources(a, b, true);
      this.uiFx.pour(a, b);                           // production pours into the stocks
      wait = Math.max(wait, 900);
    }
    // fly-bys queue (queueFly) and never hold the game up; the first one to start floats the move's cost
    const flights = [];
    let spent = false;
    const costFirst = () => { if (!spent) { spent = true; if (b.gen === a.gen && b.moves !== a.moves) this.floatSpent(a, b); } };
    const fly = (fn) => flights.push(this.queueFly(fn, costFirst));
    // cards entering tableaus (and the music follows what was played)
    let mood = null;
    for (const pb of b.players) {
      const pa = a.players[pb.id];
      const newCards = [...pb.played.filter((c) => !pa.played.includes(c)), ...pb.events.filter((c) => !pa.events.includes(c)), ...pb.preludes.filter((c) => !pa.preludes.includes(c))];
      if (pb.corp >= 0 && pa.corp !== pb.corp) newCards.unshift(pb.corp);
      // the corporation is also in the played list: animate each card once
      const uniq = [...new Set(newCards)].filter((c) => c !== pa.corp);
      newCards.length = 0; newCards.push(...uniq);
      for (const c of newCards) {
        const cd = this.db.get(c);
        let md = moodForCard(cd);
        if (md === 'impact' && !(cd.type === 3 && cd.cost > 20)) md = null;      // only the big events (Deimos Down, Giant Ice Asteroid...)
        if (md && MOOD_RANK[md] > MOOD_RANK[mood ?? 'none']) mood = md;
      }
      if (pb.id === b.human && REPLAY == null) { if (newCards.length) { this.audio.card(); this.uiFx.handToBoard(newCards, pb.id, this.db, PCOL[pb.id]); } continue; }   // you know what you played: it just flies from your hand to your board (a replay shows both players' cards large)
      for (const c of newCards) fly(() => this.flyCard(c, pb.id));
    }
    // the bot's moves that bring no card into a tableau get a fly-by of their own (a replay: both players'); your own
    // card action too, as a card in use (a move of yours that brings a card needs none: it is on your board already)
    let usedId = null;
    const ownUse = step?.who === 'human' && REPLAY == null && b.last.act?.k === AK.BLUE;
    if ((botMove || ownUse || (REPLAY != null && step)) && (step.kind === D.ACTION || step.kind === D.FG)) {
      const ac = b.last.act, nm = this.pname(who), bare = (k) => t(k).replace(/^[^\p{L}]+/u, '');
      // a card's action: the card pops up beside its player's board with its Action box lit (any reveal tray -- the card
      // Restricted Area drew, Search For Life's -- follows it), so the move can't slip by as just a "drew a card"
      if (ac.k === AK.BLUE) {
        const now = b.players[who].cres?.[ac.card] ?? 0, d = now - (a.players[who].cres?.[ac.card] ?? 0);
        usedId = ac.card;
        fly(() => this.flyUse(ac.card, who, { used: true, now, d }));
      }
      else if (ac.k === AK.PLAY && ac.free && ac.card === b.players[who].corp)   // (Inventrix's first action: a draw, no card into the tableau)
        fly(() => this.flyMove(who, 'assets/res/card.png', this.db.lname(ac.card), t('log.faDraw', { who: esc(nm), card: esc(this.db.lname(ac.card)) })));
      else if (ac.k === AK.SP) {
        const icon = ['assets/res/card.png', 'assets/res/power.png', 'assets/temperature.png', 'assets/tiles/ocean.png', 'assets/tiles/greenery.png', 'assets/tiles/city.png'][ac.sp] || 'assets/tiles/special.png';
        const corp = b.players[who].corp, firstCity = ac.free && corp >= 0;   // (Tharsis Republic's free first city)
        if (firstCity) fly(() => this.flyMove(who, icon, this.db.lname(corp), t('log.firstCity', { who: esc(nm), card: esc(this.db.lname(corp)), extra: '' })));
        else fly(() => this.flyMove(who, icon, spName(ac.sp), esc(ac.sp === 0 ? t('toast.botSell', { who: nm, sp: spName(0), n: ac.disc.length }) : t('toast.botSp', { who: nm, sp: spName(ac.sp) }))));
        this.audio.coin();
      }
      else if (ac.k === AK.PLANTS) fly(() => this.flyMove(who, 'assets/tiles/greenery.png', bare('act.plants'), esc(t('toast.botPlants', { who: nm }))));
      else if (ac.k === AK.HEAT) fly(() => this.flyMove(who, 'assets/temperature.png', bare('act.heat'), esc(t('toast.botHeat', { who: nm }))));
      else if (ac.k === AK.PASS) fly(() => this.flyMove(who, '', bare('act.passGenShort'), esc(t('toast.botPassed', { who: nm }))));
    }
    // resources put on (or taken off) a card without a card of their own on screen -- the one possible target
    // chosen for you, a trigger (Decomposers, Ecological Zone...), a Predators / Ants raid: that card pops up beside
    // its owner's board and the token flies on (or off), "+1 animal on Birds (now 3)", so every automatic placement is visible
    if (b.gen === a.gen && b.moves !== a.moves && b.stage === 2) {
      for (const pb of b.players) {
        const pa = a.players[pb.id];
        const fresh = new Set([...pb.played.filter((c) => !pa.played.includes(c)), ...pb.events.filter((c) => !pa.events.includes(c))]);
        const ids = [...new Set([...Object.keys(pb.cres || {}), ...Object.keys(pa.cres || {})])].map(Number)
          .filter((id) => !fresh.has(id) && (pb.cres?.[id] ?? 0) !== (pa.cres?.[id] ?? 0) && !(pb.id === who && id === usedId));   // (the card used: its own pop-up shows it)
        for (const id of ids.slice(0, 3)) {
          const now = pb.cres?.[id] ?? 0;
          fly(() => this.flyUse(id, pb.id, { now, d: now - (pa.cres?.[id] ?? 0) }));
        }
      }
    }
    // 1. what the move cost rises off the payer's board first (with a fly-by: as it starts)
    if (!flights.length && b.gen === a.gen && b.moves !== a.moves && this.floatSpent(a, b)) await sleep(450);
    // cards drawn / revealed by this move
    // (the bot's setup reveals -- e.g. Acquired Space Agency -- happen while
    // its choices are still secret: hold them until the human has chosen too)
    if (b.reveal && b.moves !== a.moves) {
      if (b.stage === 0 && b.reveal.player !== b.human) this.heldReveals = [...(this.heldReveals || []), { reveal: b.reveal, last: b.last, human: b.human }];
      else { if (flights.length) await this.flyQ; await this.showReveal(b); wait = Math.max(wait, 200); }
    }
    if (b.stage !== 0 && this.heldReveals?.length) {
      const held = this.heldReveals; this.heldReveals = [];
      for (const r of held) await this.showReveal(r);
    }
    // asteroids hit the planet (before the tile they bring appears)
    const hitCards = b.players.flatMap((pb) => [...pb.events.filter((c) => !a.players[pb.id].events.includes(c)), ...pb.played.filter((c) => !a.players[pb.id].played.includes(c))])
      // only space EVENTS that actually strike Mars (not Beam From A Thorium Asteroid, Asteroid Mining...)
      .filter((c) => { const cd = this.db.get(c); return cd.type === 3 && (cd.tags || []).includes(1) && /asteroid|comet|deimos/i.test(cd.name); });
    const spAsteroid = b.last?.act?.k === AK.SP && SP[b.last.act.sp]?.name === 'Asteroid' && b.moves !== a.moves;
    if ((hitCards.length || spAsteroid) && b.stage === 2 && !document.hidden && !pace.skip) {
      const newOceans = b.tiles.filter(([s, t]) => t === 0 && !a.tiles.some(([s2]) => s2 === s)).map(([s]) => s);
      const big = hitCards.some((c) => this.db.get(c).cost > 20);
      const deimos = hitCards.some((c) => this.db.name(c) === 'Deimos Down');
      // one strike per ocean it brings (Ice / Giant Ice Asteroid, Comet); Deimos
      // Down pounds the whole board with ten at once; anything else hits Mars
      // just off the board
      const cells = [];
      if (deimos) {
        const land = this.map.spaces.filter((sp) => sp.kind !== 2 && this.board.cells[sp.i]);
        for (let i = 0; i < 10 && land.length; i++) cells.push(this.board.cells[land.splice(Math.floor(Math.random() * land.length), 1)[0].i]);
      } else if (newOceans.length) newOceans.forEach((sp) => cells.push(this.board.cells[sp]));
      else {
        // it took something from a player who has tiles: it hits one of theirs
        const act = b.last?.act || {}, vic = act.atp;
        const lost = vic != null && vic !== b.last.player && b.players[vic] && a.players[vic] && b.players[vic].res.some((x, r) => x < a.players[vic].res[r]);
        // (any of their tiles, never the one struck last time, so strikes don't pile onto one tile; a player
        // with only a tile or two also has the land round them struck)
        const onMars = (s2) => this.board.cells[s2] && !this.board.cells[s2].colony;
        let pool = lost ? b.tiles.filter(([s2, t, o]) => o === vic && t !== 0 && onMars(s2)).map(([s2]) => s2) : [];
        if (pool.length && pool.length < 3) {
          const water = new Set(b.tiles.filter(([, t]) => t === 0).map(([s2]) => s2));
          const near = pool.flatMap((s2) => this.map.spaces[s2]?.adj || []).filter((n) => onMars(n) && !water.has(n) && this.map.spaces[n]?.kind !== 1);
          pool = [...new Set([...pool, ...near])];
        }
        if (pool.length > 1) pool = pool.filter((s2) => s2 !== this.lastStrike);
        const s2 = pool.length ? pool[Math.floor(Math.random() * pool.length)] : -1;
        if (s2 >= 0) this.lastStrike = s2;
        const c = s2 >= 0 ? this.board.cells[s2] : this.offBoardSpot();
        if (c) cells.push(c);
      }
      const ep = pace.epoch;
      const origin = deimos && !this.board.strike ? deimosOrigin(this.board) : null;   // (one breakup point for all ten: 3D board)
      cells.forEach((cell, i) => {
        const delay = deimos ? Math.random() * 450 : i * 320;
        setTimeout(() => ep === pace.epoch && (this.board.strike ? this.board.strike(cell, { big: big && !deimos }) : asteroidStrike(this.board, cell, { big: big && !deimos, from: origin?.(), slow: origin ? 1.25 : 1 })), delay);
      });
      if (cells.length) {
        this.audio.boom?.();
        if (deimos) setTimeout(() => this.audio.boom?.(), 380);
        await sleep(760 + (deimos ? 450 : (cells.length - 1) * 320));
        wait = Math.max(wait, 900);
      }
    }
    // small moments: rocket launches, power arcs, planet-wide terraforming pulses (events_fx.js)
    if (!pace.skip) this.eventsFx?.onDiff(a, b, { hitCards, db: this.db });
    // tiles
    const placed = this.board.syncTiles(b.tiles, true);
    // 2. tiles land, 3. then what they gave rises from them, 4. then production
    if (placed.length) this.floatBonuses(placed, b, a);
    const prodDelay = placed.length ? 1900 : 300;
    if (!mood && placed.length) mood = moodForTile(b.tiles.find(([s]) => s === placed[0])?.[1]);
    // the music changes rarely: a big event always, anything else at most every ~5 min
    const nowS = performance.now() / 1000;
    if (mood && b.stage === 2 && (mood === 'impact' || nowS - (this.lastMoodAt || -1e9) > 300)) { this.audio.mood(mood); this.lastMoodAt = nowS; }
    if (placed.length) {
      const water = b.tiles.some(([s, t]) => t === 0 && placed.includes(s)), nuke = b.tiles.some(([s, t]) => t === 12 && placed.includes(s));   // (12: a Nuclear Zone -- its test shot booms, board/tiles/anim_jobs.js blastFx)
      water ? this.audio.water() : nuke ? this.audio.boom?.() : this.audio.place();
      placed.forEach((s) => this.board.flashSpace(s, PCOL[who] ? parseInt(PCOL[who].slice(1), 16) : 0xffffff));
      if (botMove || REPLAY != null) this.board.ensureVisible(placed[0]);
      wait = Math.max(wait, 800);
    }
    // globals
    let raised = 0;
    if (b.temp !== a.temp) { raised++; this.bump('#t-temp'); }
    if (b.oxy !== a.oxy) { raised++; this.bump('#t-oxy'); }
    if (b.oceans !== a.oceans) { raised++; this.bump('#t-ocean'); }
    if (raised) {
      this.board.setGlobals(b.temp, b.oxy, b.oceans); this.audio.setTerraform(b.temp, b.oxy, b.oceans); this.audio.chime(raised);
      const mxd = (x) => x.temp >= 8 && x.oxy >= 14 && x.oceans >= 9;
      for (const [k, lim, key] of [['temp', 8, 'toast.tempMaxed'], ['oxy', 14, 'toast.oxyMaxed'], ['oceans', 9, 'toast.oceansMaxed']]) if (b[k] >= lim && a[k] < lim) this.toast(t(key));
      if (mxd(b) && !mxd(a)) { this.toast(t('toast.tfComplete')); this.audio.fanfare(); wait = Math.max(wait, 1600); }
    }
    else if (b.players.some((p, i) => p.tr > a.players[i].tr)) this.audio.chime(1);
    // milestones / awards
    const fliesFor = (p) => p !== b.human || REPLAY != null;
    b.ms.forEach((m, i) => { if (m.owner >= 0 && a.ms[i].owner < 0 && fliesFor(m.owner)) { fly(() => this.flyMove(m.owner, '🏆', maName(m.name), tw('toast.claimed', { who: this.pname(m.owner), ms: maName(m.name) }, this.isYou(m.owner, b)))); this.audio.fanfare(); } });
    b.aw.forEach((w, i) => { if (w.funder >= 0 && a.aw[i].funder < 0 && fliesFor(w.funder)) { fly(() => this.flyMove(w.funder, '🏅', maName(w.name), tw('toast.funded', { who: this.pname(w.funder), aw: maName(w.name) }, this.isYou(w.funder, b)))); this.audio.coin(); } });
    b.ms.forEach((m, i) => { if (m.owner >= 0 && a.ms[i].owner < 0 && !fliesFor(m.owner)) { this.toast(tw('toast.claimed', { who: this.pname(m.owner), ms: maName(m.name) }, this.isYou(m.owner, b)), PCOL[m.owner]); this.audio.fanfare(); wait = Math.max(wait, 1200); } });
    b.aw.forEach((w, i) => { if (w.funder >= 0 && a.aw[i].funder < 0 && !fliesFor(w.funder)) { this.toast(tw('toast.funded', { who: this.pname(w.funder), aw: maName(w.name) }, this.isYou(w.funder, b)), PCOL[w.funder]); this.audio.coin(); wait = Math.max(wait, 1000); } });
    // what the move did to the stocks and production shows as its fly-by lands (with the counters: present), not before
    const landed = (fn) => (flights.length ? Promise.all(flights).then(fn) : fn());
    if (b.gen === a.gen) landed(() => this.flashResources(a, b, false));
    if (b.gen === a.gen && b.moves !== a.moves) landed(() => this.floatProd(a, b, flights.length ? 0 : prodDelay));
    if (REPLAY == null && b.pending.player === b.human && b.pending.kind === D.ACTION && a.pending.player !== b.human) { this.audio.turn(); this.toast(t('turn.yours'), PCOL[b.human]); }
    if (botMove) wait = Math.max(wait, 550);
    if (wait) await sleep(wait);
    return { land: flights.length ? Promise.all(flights) : null };   // (wrapped: an async function returning the promise would wait for it) -- present: the counters change as the fly-bys land
  }

  flashResources(a, b, gen) {
    for (const pb of b.players) {
      const pa = a.players[pb.id];
      const panel = $(`.pb[data-p="${pb.id}"]`);
      if (!panel) continue;
      pb.res.forEach((x, r) => {
        const d = x - pa.res[r];
        if (!d) return;
        const cell = panel.querySelectorAll('.rc')[r];
        if (!cell) return;
        cell.classList.remove('flash'); void cell.offsetWidth; cell.classList.add('flash');
        const dl = h('span', 'delta', (d > 0 ? '+' : '') + d);
        dl.style.color = d > 0 ? '#7dffb0' : '#ff8a8a';
        cell.appendChild(dl);
        setTimeout(() => dl.remove(), dur(1700));
      });
    }
  }

  // resources spent rise off the player's board ("−12 M€"), one icon per resource
  floatSpent(a, b) {
    let shown = 0;
    for (const pb of b.players) {
      const pa = a.players[pb.id]; if (!pa) continue;
      const panel = $(`.pb[data-p="${pb.id}"]`);
      if (!panel) continue;
      const cellsEls = panel.querySelectorAll('.res .rc');
      let k = 0;
      pb.res.forEach((x, r) => {
        const d = x - pa.res[r];
        if (d >= 0 || !cellsEls[r]) return;
        const rc = cellsEls[r].getBoundingClientRect();
        const el = h('div', 'floatres spent', `<span>−${-d}</span><img src="assets/res/${RES[r]}.png" alt="">`);
        el.style.left = `${rc.left + rc.width / 2}px`; el.style.top = `${rc.top + rc.height / 2 - 12}px`;
        $('#flyer').appendChild(el);
        el.animate([
          { transform: 'translate(-50%, 0) scale(.8)', opacity: 0 },
          { transform: 'translate(-50%, -18px) scale(1.05)', opacity: 1, offset: 0.2 },
          { transform: 'translate(-50%, -64px) scale(.95)', opacity: 0 },
        ], { duration: dur(1500), delay: dur(k++ * 120), easing: 'ease-out', fill: 'both' }).finished.then(() => el.remove());
        shown++;
      });
    }
    return shown;
  }

  // production changes: the resource icon in a production frame rises off the
  // player's board ("+1" / "−2")
  floatProd(a, b, base = 250) {
    for (const pb of b.players) {
      const pa = a.players[pb.id]; if (!pa) continue;
      const cellsEls = $(`.pb[data-p="${pb.id}"]`)?.querySelectorAll('.res .rc');
      if (!cellsEls) continue;
      let k = 0;
      pb.prod.forEach((x, r) => {
        const d = x - pa.prod[r];
        if (!d || !cellsEls[r]) return;
        // ... and a small badge then lingers on that production box for a while (the float is over in under
        // two seconds, easy to miss); renderPlayers draws it, so it survives the boards redrawing
        const key = pb.id + ':' + r, now = performance.now(), old = (this.prodMarks ||= {})[key];
        this.prodMarks[key] = { d: (old && now - old.t < PMARK_MS ? old.d : 0) + d, t: now + dur(base) };
        setTimeout(() => this.renderPlayers(), dur(base + 200));
        const rc = cellsEls[r].getBoundingClientRect();
        const el = h('div', 'floatres prodchg' + (d < 0 ? ' neg' : ''), `<span>${d > 0 ? '+' : '−'}${Math.abs(d)}</span><span class="pfr"><img src="assets/res/${RES[r]}.png" alt=""></span>`);
        el.style.left = `${rc.left + rc.width / 2}px`; el.style.top = `${rc.top + rc.height / 2 + 4}px`;
        $('#flyer').appendChild(el);
        el.animate([
          { transform: 'translate(-50%, 0) scale(.8)', opacity: 0 },
          { transform: 'translate(-50%, -16px) scale(1.08)', opacity: 1, offset: 0.2 },
          { transform: 'translate(-50%, -58px) scale(.95)', opacity: 0 },
        ], { duration: dur(1700), delay: dur(base + k++ * 140), easing: 'ease-out', fill: 'both' }).finished.then(() => el.remove());
      });
    }
  }

  // placement bonuses rise from the tile: the hex's printed bonuses and +2 M€
  // per adjacent ocean (the engine's rule), as little icons that float up and fade.
  // Tiles of one move land one at a time (the move's hex, its extra hexes, then a bonus ocean): each counts the
  // oceans already there -- of two new neighbouring oceans only the second gets the +2
  floatBonuses(spaces, v, prev) {
    const ICON = { 0: 'steel', 1: 'titanium', 2: 'plant', 3: 'card', 4: 'heat', 5: 'power' };
    const act = v.last?.act || {}, seq = [act.space, ...(act.xs || []), act.bocean].filter((s) => s != null && spaces.includes(s));
    spaces = [...seq, ...spaces.filter((s) => !seq.includes(s))];
    const isOcean = (n) => v.tiles.some(([s2, t]) => s2 === n && t === 0);
    const before = new Set((prev?.tiles || []).filter(([, t]) => t === 0).map(([s2]) => s2));
    spaces.forEach((sp, k) => {
      const S = this.map.spaces[sp];
      if (!S || S.kind === 2) return;                       // colonies (Ganymede / Phobos) have no hex bonus
      const counts = {};
      for (const b of S.b || []) if (ICON[b]) counts[ICON[b]] = (counts[ICON[b]] || 0) + 1;
      const oceansNext = (S.adj || []).filter((n) => before.has(n)).length;
      if (isOcean(sp)) before.add(sp);                      // (the next tile of this move sees it)
      if (oceansNext) counts.megacredit = 2 * oceansNext;
      const items = Object.entries(counts);
      if (!items.length) return;
      const p = this.board.screenOf(sp);
      if (!p) return;
      items.forEach(([icon, n], i) => {
        const el = h('div', 'floatres', `<span>+${n}</span><img src="assets/res/${icon}.png" alt="">`);
        el.style.left = `${p.x + (i - (items.length - 1) / 2) * 46}px`; el.style.top = `${p.y}px`;
        $('#flyer').appendChild(el);
        el.animate([
          { transform: 'translate(-50%, 0) scale(.6)', opacity: 0 },
          { transform: 'translate(-50%, -26px) scale(1.1)', opacity: 1, offset: 0.25 },
          { transform: 'translate(-50%, -78px) scale(1)', opacity: 0 },
        ], { duration: 1700, delay: 1000 + k * 250 + i * 140, easing: 'ease-out', fill: 'both' }).finished.then(() => el.remove());   // once the tile has landed
      });
    });
  }

  // n face-down cards fly from the deck to a player's board
  async flyBacks(n, pid) {
    const deck = $('.deck')?.getBoundingClientRect() || { left: 40, top: 20, width: 20, height: 20 };
    const pr = $(`.pb[data-p="${pid}"]`)?.getBoundingClientRect() || { left: 60, top: innerHeight / 2, width: 0, height: 0 };
    this.audio.deal(n);
    for (let i = 0; i < n; i++) {
      const el = h('div', 'card back flyback', '<div class="bk">TFM</div>');
      el.style.left = `${deck.left}px`; el.style.top = `${deck.top}px`;
      $('#flyer').appendChild(el);
      el.animate([
        { transform: 'translate(0,0) scale(.35) rotate(0deg)', opacity: 0 },
        { transform: `translate(${(pr.left + pr.width / 2 - deck.left) * 0.5}px, ${(pr.top + pr.height / 2 - deck.top) * 0.4}px) scale(.6) rotate(-8deg)`, opacity: 1, offset: 0.45 },
        { transform: `translate(${pr.left + pr.width / 2 - deck.left - 40}px, ${pr.top + pr.height / 2 - deck.top - 60}px) scale(.3) rotate(4deg)`, opacity: 0 },
      ], { duration: dur(900), delay: dur(i * 160), easing: 'ease-in-out', fill: 'forwards' }).finished.then(() => el.remove());
    }
    await sleep(900 + (n - 1) * 160);
  }

  // a prelude the player could not afford: discarded, +15 M€ (rules) -- a tray that stays until dismissed
  showFizzle(id) {
    const tray = h('div', 'rvtray sticky');
    tray.innerHTML = `<div class="rvt">${t('fizzle.text', { card: esc(this.db.lname(id)) })}</div><div class="rvg"></div>`;
    const el = cardEl(this.db.get(id)); el.classList.add('rvc'); el.style.filter = 'grayscale(.6) brightness(.8)';
    const slot = h('div', 'rvs'); slot.appendChild(el); tray.querySelector('.rvg').appendChild(slot);
    const btn = h('button', 'primary rvdismiss', t('btn.ok'));
    btn.onclick = (e) => { e.stopPropagation(); tray.classList.remove('in'); setTimeout(() => tray.remove(), 400); };
    tray.appendChild(btn);
    $('#flyer').appendChild(tray);
    requestAnimationFrame(() => tray.classList.add('in'));
    this.audio.tick?.();
  }

  // Drawn / revealed cards: deal from the deck into a tray, mark each one's
  // fate, then send it to its hand or the discard pile. Private draws show
  // their faces only to their owner.
  async showReveal(v) {
    const R = v.reveal, me = v.human, sc = R.src >= 0 ? R.src : v.last.card, src = sc >= 0 ? this.db.lname(sc) : '';
    const visible = (dest) => R.pub || dest === me || R.player === me;   // you saw your own look-and-discard cards
    const cards = R.cards;
    const nKept = cards.filter(([, d]) => d >= 0).length, nDisc = cards.length - nKept;
    const who = this.pname(R.player);
    const looked = nKept === 0 && !R.pub;     // looked at and discarded (Business Network, ...)
    // draws a tag trigger made (Point Luna on an Earth tag, its own included; Mars University...): named by their source
    const trg = (R.trig || []).filter(([c, n]) => c >= 0 && n > 0), trgN = trg.reduce((s, [, n]) => s + n, 0);
    const trgName = tj(trg.map(([c]) => esc(this.db.lname(c))));
    // a small private draw by the other player: a quick card-back fly-by, no tray
    // (a trigger's draw gets its tray: "Point Luna: TFMBot drew 1 card", backs only)
    // (Business Network / Inventors' Guild: its tray says whether the card was bought or discarded)
    const lookBuy = this.lookBuy(v);
    if (!lookBuy && !R.pub && R.player !== me && nDisc === 0 && cards.length <= 3 && !trgN) return this.flyBacks(cards.length, R.player);
    // "look at N, keep K" plus trigger draws (Business Contacts + Point Luna): say which is which
    const look = (this.db.get(sc)?.description || '').match(/look at the top (\d+) cards?.*?(?:take|keep|add) (\d+)/i);
    let split = '';
    if (look && cards.length > +look[1]) {
      const extra = cards.length - +look[1];
      const trig = this.view.players[R.player]?.played.map((c) => this.db.get(c)).find((c) => /when you play .*draw a card|draw a card.*when you play/i.test(`${c.description || ''} ${(c.effects || []).join(' ')}`));
      split = t('reveal.split', { src: esc(src), look: look[1], keep: look[2], trig: trgN ? trgName : trig ? esc(cardName(trig)) : t('reveal.anotherEffect'), extra });
    }
    let title = lookBuy && nKept ? tw('reveal.lookBought', { who: esc(who) }, R.player === me) : split ? tw('reveal.withSplit', { who: esc(who), split }, R.player === me) : looked ? tw('reveal.looked', { who: esc(who), n: cards.length }, R.player === me)
      : R.pub ? t('reveal.revealed', { who: esc(src || who), n: cards.length })
      : R.player === me ? t('reveal.youDrew', { n: nKept }) + (nDisc ? t('reveal.youDiscarded', { n: nDisc }) : '')
      : t('reveal.drew', { who: esc(who), n: nKept }) + (nDisc ? t('reveal.andDiscarded', { n: nDisc }) : '');
    if (trgN && !split && !looked && !R.pub) title = trgN >= nKept ? t('reveal.from', { src: trgName, what: title }) : `${title} · ${t('reveal.from', { src: trgName, what: '+' + trgN })}`;
    const srcNote = src && !R.pub && !(trg.length === 1 && trg[0][0] === sc);   // (not "Point Luna: … · Point Luna")
    const tray = h('div', 'rvtray');
    // the same size as a hovered card in your hand (it scales with the screen);
    // a long dig (Acquired Space Agency...) steps down so it still fits
    const hs = parseFloat(getComputedStyle($('#hand')).getPropertyValue('--hs')) || 1;
    const rz = Math.max(1, hs * 1.32) * (this.dlgZoom || 1) * (cards.length > 10 ? 0.66 : cards.length > 6 ? 0.8 : 1);   // (Settings > Card size)
    tray.style.setProperty('--rz', rz.toFixed(3));
    tray.innerHTML = `<div class="rvt">${title}${srcNote ? ` <small>· ${esc(src)}</small>` : ''}</div><div class="rvg"></div>`;
    $('#flyer').appendChild(tray);
    const grid = tray.querySelector('.rvg');
    const deck = $('.deck')?.getBoundingClientRect() || { left: 40, top: 20, width: 20, height: 20 };
    const els = [];
    this.audio.deal(Math.min(6, cards.length));
    for (const [id, dest] of cards) {
      const slot = h('div', 'rvs');
      const el = visible(dest) ? cardEl(this.db.get(id)) : h('div', 'card back', '<div class="bk">TFM</div>');
      el.classList.add('rvc');
      slot.appendChild(el);
      const tag = h('div', 'rvtag ' + (dest >= 0 ? 'kept' : 'disc'), dest >= 0 ? `→ ${esc(this.pname(dest))}` : t('reveal.discarded'));
      tag.style.borderColor = dest >= 0 ? PCOL[dest] : '';
      slot.appendChild(tag);
      grid.appendChild(slot);
      els.push([slot, el, dest]);
    }
    // scroll only if the rows really overflow (slot sizes ignore the deal-in transforms)
    if (els.length) {
      const sw = els[0][0].offsetWidth + 6, sh = els[0][0].offsetHeight + 8;
      const perRow = Math.max(1, Math.floor((grid.clientWidth + 6) / sw));
      if (Math.ceil(els.length / perRow) * sh > innerHeight * 0.7 + 4) grid.classList.add('scroll');
    }
    // deal in from the deck
    for (const [i, [slot]] of els.entries()) {
      const r = slot.getBoundingClientRect();
      slot.style.transform = `translate(${deck.left - r.left}px, ${deck.top - r.top}px) scale(.2)`;
      slot.style.opacity = '0';
      slot.style.transitionDelay = `${dur(Math.min(i * 45, 900))}ms`;
    }
    await sleep(30);
    tray.classList.add('in');
    for (const [slot] of els) { slot.style.transform = ''; slot.style.opacity = '1'; }
    await sleep(Math.min(els.length * 45, 900) + 500);
    for (const [slot, , dest] of els) slot.classList.add(dest >= 0 ? 'is-kept' : 'is-disc');
    // out: kept cards to their owner, discards to the pile
    const out = async () => {
      if (tray.dataset.out) return;
      tray.dataset.out = '1';
      if (this.stickyTray === tray) this.stickyTray = null;
    const target = (dest) => {
      if (dest === me) return { x: innerWidth / 2, y: innerHeight - 40 };
      if (dest >= 0) { const pr = $(`.pb[data-p="${dest}"]`)?.getBoundingClientRect(); return pr ? { x: pr.left + pr.width / 2, y: pr.top + pr.height / 2 } : { x: 100, y: 200 }; }
      return { x: deck.left + deck.width, y: deck.top };
    };
    for (const [i, [slot, , dest]] of els.entries()) {
      const r = slot.getBoundingClientRect(), t = target(dest);
      slot.style.transitionDelay = `${dur(Math.min(i * 25, 500))}ms`;
      slot.style.transform = `translate(${t.x - r.left - r.width / 2}px, ${t.y - r.top - r.height / 2}px) scale(.25)`;
      slot.style.opacity = '0';
    }
    tray.classList.remove('in');
    await sleep(Math.min(els.length * 25, 500) + 650);
    tray.remove();
    };
    // a PUBLIC reveal (Experimental Forest, Acquired Space Agency, Search For
    // Life...) stays up to be studied until dismissed; the game goes on behind it
    if (R.pub) {
      if (this.stickyTray) this.stickyTray.__out?.();
      tray.__out = out;
      this.stickyTray = tray;
      tray.classList.add('sticky');
      const btn = h('button', 'primary rvdismiss', t('btn.dismiss'));
      btn.onclick = (e) => { e.stopPropagation(); out(); };
      tray.appendChild(btn);
      return;
    }
    await sleep(Math.min(2600, 1100 + cards.length * 70));
    await out();
  }

  // the fly-by queue and the resource-counter chain have both run out (at most 15 s: never a stuck dialog)
  fxDrained() {
    const q = this.flyQ, rc = this.resChain;
    if (!q && !rc) return Promise.resolve();
    return Promise.race([Promise.all([q, rc]).catch(() => {}), new Promise((r) => setTimeout(r, 15000))]).then(() => (this.flyQ !== q || this.resChain !== rc ? this.fxDrained() : null));
  }
  // fly-bys play one after another on a queue of their own: the game never waits for them
  queueFly(fn, onStart) {
    const run = () => { onStart?.(); return fn(); };
    this.flyN = (this.flyN || 0) + 1;                 // (fly-bys queued or flying: present's dialog wait)
    const p = (this.flyQ || Promise.resolve()).then(run, run).catch(() => {}).finally(() => { this.flyN--; });
    this.flyQ = p;
    return p;
  }
  async flyCard(cardId, pid) {
    const card = this.db.get(cardId);
    if (!card) return;
    const label = tw('fly.' + (card.type === 0 ? 'chose' : 'played'), { who: esc(this.pname(pid)) }, this.isYou(pid));
    await this.flyEl(cardEl(card, { big: true }), card.type === 0 ? 300 : 250, 348, pid, label, pid === this.view.human && REPLAY == null ? 700 : 1500);
  }
  // A card IN USE (its action, or resources put on / taken off it): unlike a card being played, which flies through the
  // middle of the screen, it pops up beside its owner's board -- the card on that tableau did something. It shows
  // what it holds; the tokens fly onto it (or off it) and its count follows as each lands. d: change, now: count after
  async flyUse(cardId, pid, { used, now = 0, d = 0 }) {
    const card = this.db.get(cardId), icon = CARD_RES_ICON[card?.res];
    if (!card) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let n = icon ? now - d : 0;
    const W = card.type === 0 ? 300 : 250, H = 348, s = Math.min(0.8, (innerHeight - 70) / H);
    const el = cardEl(card, { big: true, used, resCount: icon ? n : null });
    el.classList.add('inuse', 'glowfly');
    if (used) el.classList.add('actused');
    el.style.setProperty('--pc', PCOL[pid]);
    const pile = h('div', 'restoks');
    el.appendChild(pile);
    const cnt = el.querySelector('.resn');
    const show = () => {                              // the tokens on the card (up to 8), and the count
      pile.innerHTML = `<img src="assets/res/${icon}.png" alt="">`.repeat(Math.min(n, 8)) + (n > 8 ? `<b>+${n - 8}</b>` : '');
      if (cnt) cnt.innerHTML = `<img src="assets/res/${icon}.png" alt="">${n}`;
    };
    if (icon) show();
    // beside the board: to its right on a wide screen (the boards are in a column at the left), below it on a phone
    // held upright (the boards run across the top)
    const panel = $(`.pb[data-p="${pid}"]`), pr = panel ? panel.getBoundingClientRect() : { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 };
    const wide = innerWidth > innerHeight, cw = W * s, ch = H * s, pad = 8;
    const x = wide ? (pr.right + 16 + cw > innerWidth - pad ? Math.max(pad, pr.left - 16 - cw) : pr.right + 16) : Math.min(Math.max(pad, pr.left + pr.width / 2 - cw / 2), innerWidth - cw - pad);
    const y = Math.min(Math.max(pad + 34, wide ? pr.top + 34 : pr.bottom + 46), innerHeight - ch - pad);
    const at = (px, py, k) => `translate(${px + cw / 2 - W / 2}px, ${py + ch / 2 - H / 2}px) scale(${k})`;
    const label = h('div', 'who', used ? tw('fly.used', { who: esc(this.pname(pid)) }, this.isYou(pid)) : '');
    if (!used) label.innerHTML = `${esc(this.pname(pid))} ${t('fx.cres', { d: signed(d), res: cresName(icon === 'wild' ? 'resource' : icon, Math.abs(d)), card: esc(this.db.lname(cardId)), now, n: Math.abs(d) })}`;
    label.style.color = PCOL[pid];
    label.style.whiteSpace = 'nowrap'; label.style.opacity = '0'; label.style.transition = `opacity ${dur(300)}ms`;
    label.style.top = `${y - 40}px`; label.style.left = '0'; label.style.maxWidth = `${innerWidth - 2 * pad}px`;
    const fl = $('#flyer');
    this.audio.card();
    el.style.left = '0px'; el.style.top = '0px';
    el.style.transform = at(x, y + 30, s * 0.6);
    el.style.opacity = '0';
    fl.append(el, label);
    label.style.transform = `translateX(${Math.min(Math.max(pad, x + cw / 2 - label.offsetWidth / 2), innerWidth - label.offsetWidth - pad)}px)`;
    await sleep(20);
    el.style.opacity = '1'; label.style.opacity = '1';
    el.style.transform = at(x, y, s);
    await sleep(750 * FLY_PACE);
    // a token per unit (at most 5): from the board onto the card, or off the card and away
    if (icon && d && !reduced) {
      const k = Math.min(Math.abs(d), 5), gone = d < 0, step = dur(260);
      const slot = (i) => { const r = pile.getBoundingClientRect(); return { x: r.left + (Math.min(i, 7) + 0.5) * 24 * s, y: r.top + r.height / 2 }; };
      const home = { x: pr.left + pr.width / 2, y: pr.top + pr.height / 2 };
      const away = { x: home.x < x ? x + cw + 90 : x + cw / 2, y: home.x < x ? y + ch / 2 : y + ch + 90 };
      const flights = [];
      for (let i = 0; i < k; i++) {
        const tok = h('img', 'restokfly'); tok.src = `assets/res/${icon}.png`;
        const from = gone ? slot(n - 1) : home, to = gone ? away : slot(n);
        const m = (p, sc) => `translate(${p.x - 16}px, ${p.y - 16}px) scale(${sc})`;
        tok.style.transform = m(from, gone ? 1 : 0.6);
        fl.appendChild(tok);
        if (gone) { n--; show(); } else tok.style.opacity = '1';
        await sleep(20);
        tok.style.transform = m(to, gone ? 0.5 : 1);
        if (gone) tok.style.opacity = '0'; else tok.style.opacity = '1';
        flights.push(sleep(700).then(() => { tok.remove(); if (!gone) { n++; show(); cnt?.classList.remove('tick'); void cnt?.offsetWidth; cnt?.classList.add('tick'); } }));
        await sleep(step);
      }
      await Promise.all(flights);
      n = now; show();                                // (more than 5: the rest at once)
    } else if (icon) { n = now; show(); }
    await sleep(700 * FLY_PACE);
    label.style.opacity = '0'; el.style.opacity = '0';
    el.style.transform = at(x, y + 20, s * 0.9);
    await sleep(600);
    el.remove(); label.remove();
    this.uiFx.settle(pid);
  }
  // a move that brings no card (a standard project, plants into greenery, a milestone...): a small card of its own, briefly
  flyMove(pid, icon, title, label) {
    const art = !icon ? '' : icon.startsWith('assets/') ? `<img src="${icon}" alt="">` : `<span class="mi">${icon}</span>`;
    return this.flyEl(h('div', 'movefly', `${art}<div class="mt">${esc(title)}</div>`), 210, 250, pid, label, 900);
  }
  // (hold: ms in the middle of the screen, at Normal speed; FLY_PACE stretches every fly-by so a move can be read)
  async flyEl(el, W, H, pid, labelHtml, hold) {
    this.audio.card();
    const fl = $('#flyer');
    if (!FAST) { el.classList.add('glowfly'); el.style.setProperty('--pc', PCOL[pid]); }
    const panel = $(`.pb[data-p="${pid}"]`);
    const pr = panel ? panel.getBoundingClientRect() : { left: 0, top: innerHeight / 2, width: 0, height: 0 };
    const human = pid === this.view.human;
    const sx = human ? innerWidth / 2 : pr.left + pr.width / 2, sy = human ? innerHeight - 80 : pr.top + pr.height / 2;
    el.style.left = '0px'; el.style.top = '0px';
    const cx = innerWidth / 2 - W / 2, cy = innerHeight / 2 - H / 2;
    el.style.transform = `translate(${sx - W / 2}px, ${sy - H / 2}px) scale(.25)`;
    el.style.opacity = '0';
    const label = h('div', 'who', labelHtml);
    label.style.color = PCOL[pid];
    label.style.left = '50%'; label.style.transform = 'translateX(-50%)'; label.style.whiteSpace = 'nowrap';
    label.style.top = (innerHeight / 2 - H * Math.min(1, (innerHeight - 160) / H) / 2 - 44) + 'px'; label.style.opacity = '0'; label.style.transition = `opacity ${dur(300)}ms`;
    fl.append(el, label);
    await sleep(20);
    el.style.opacity = '1';
    const scale = Math.min(1, (innerHeight - 160) / H);
    el.style.transform = `translate(${cx}px, ${cy}px) scale(${scale})`;
    label.style.opacity = '1';
    await sleep(hold * FLY_PACE);
    label.style.opacity = '0';
    el.style.transform = `translate(${pr.left + pr.width / 2 - W / 2}px, ${pr.top + pr.height / 2 - H / 2}px) scale(.15)`;
    el.style.opacity = '0';
    await sleep(800);
    el.remove(); label.remove();
    this.uiFx.settle(pid);                            // the board it landed on glows
  }

  // a spot on Mars just beyond the board's rim, on the side facing the camera
  offBoardSpot() {
    if (this.board.offBoardSpot) return this.board.offBoardSpot();   // (the 2D map)
    const cells = this.board.cells.filter((c) => c && !c.colony);
    if (!cells.length) return null;
    const R = cells[0].center.length(), V = cells[0].center.constructor;
    const dirs = cells.map((c) => c.center.clone().normalize());
    const cam = this.board.camera, camDir = cam.position.clone().normalize();
    const rc = this.board.canvas.getBoundingClientRect();
    // anywhere on the planet's visible face that is off the board (a random spot, so strikes don't all land
    // in one place): facing the camera, clear of every hex, on screen and not under a panel
    const ok = (up) => {
      if (up.dot(camDir) < 0.3) return false;
      for (const d of dirs) if (up.dot(d) > 0.9935) return false;               // (within ~0.11 rad of a hex centre: on the board)
      const p = up.clone().multiplyScalar(R).project(cam);
      if (Math.abs(p.x) > 0.85 || Math.abs(p.y) > 0.85) return false;
      const x = rc.left + (p.x + 1) / 2 * rc.width, y = rc.top + (1 - p.y) / 2 * rc.height;
      const top = document.elementsFromPoint(x, y).find((e) => !e.closest('#flyer'));
      return !!top?.closest('#gl');
    };
    let up = null;
    for (let k = 0; k < 300 && !up; k++) {
      const u = new V(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1);
      const L = u.length();
      if (L < 0.05 || L > 1) continue;
      u.divideScalar(L);
      if (ok(u)) up = u;
    }
    if (!up) {                                        // (nothing visible off the board: just beyond its rim, facing the camera)
      const C = dirs.reduce((acc, d) => acc.add(d), new V()).normalize();
      const e = dirs.slice().sort((x, y) => x.dot(C) - y.dot(C))[Math.floor(Math.random() * Math.min(18, dirs.length))];
      up = e.clone().applyAxisAngle(C.clone().cross(e).normalize(), 0.12 + Math.random() * 0.12).normalize();
    }
    const east = new V(0, 1, 0).cross(up).normalize();
    const north = up.clone().cross(east).normalize();
    return { center: up.clone().multiplyScalar(R), up, east, north };
  }
}
