// app.js -- App, the UI controller. The engine runs in a worker (worker.js); App renders the views it
// sends, animates the difference between consecutive views and turns the player's clicks into answers.
// The class is split by topic across this folder (mixins); this file holds the message loop: saves,
// the worker's messages, and present(), which shows each new view.
import { Audio } from '../audio/audio.js';
import { Board3D, MAP_KEYS, MAP_LABELS } from '../board/board3d.js';
import { Board2D } from '../board/board2d.js';
import { UiFx } from './ui_fx.js';
import { WORKER_URL, apiUrl } from '../paths.js';
import { Recorder, ReplayViewer } from '../replay/replay.js';
import { t } from '../i18n.js';
import CARD_TEXT from '../../data/cards.json' with { type: 'json' };
import { CardDB } from '../cards/cards.js';
import { prewarmStrike } from '../board/impact.js';
import { EventsFx } from '../board/events_fx.js';
import { gfx } from '../board/quality.js';
import { moonStateOf } from '../board/moons.js';
import { $, h, esc } from '../dom.js';
import { D } from '../protocol.js';
import { THARSIS_NAMES } from './content.js';
import { ANIM_SPEEDS, BLUE, BOARD_2D_PREF, CARD_SIZES, FAST, ORANGE, PCOL, Q, REPLAY, RES_BEAT, VARIED_TILES, WORKER_MSG, boot, lsPick, pace, report, sleep } from './shared.js';
import { mixin } from '../mixin.js';
import { AppAnim } from './anim.js';
import { AppHud } from './hud.js';
import { AppHand } from './hand.js';
import { AppLog } from './log.js';
import { AppDialogs } from './dialogs.js';
import { AppFlows } from './flows.js';
import { AppChrome } from './chrome.js';

export class App {
  constructor() {
    this.audio = new Audio();
    // no WebGL2 (a blocklisted GPU, a driver without it): the 2D map instead of a dead page, and a note
    // saying why (shown once the loading screen is gone)
    this.map2d = BOARD_2D_PREF;
    if (!this.map2d) {
      let why = null;
      try { const c = document.createElement('canvas'), g = c.getContext('webgl2'); if (!g) why = 'no WebGL2 context'; else g.getExtension('WEBGL_lose_context')?.loseContext(); } catch (e) { why = String(e?.message || e); }
      if (!why) try { this.board = new Board3D($('#gl')); } catch (e) { why = String(e?.message || e); }
      if (why) { this.map2d = true; this.webglFailed = true; report('webgl-fallback', why, { ua: navigator.userAgent }); }
    }
    this.board ||= new Board2D($('#gl'));
    this.board.variedTiles = VARIED_TILES;
    if (this.board.flat) this.eventsFx = { prewarm() {}, onDiff() {} };   // (launches / arcs / planet pulses are globe scenery)
    this.uiFx = new UiFx({ fast: FAST });            // counters, card flights, production, score screen (ui_fx.js)
    boot.set(0.35);                                           // the 3D scene is built
    this.pace = pace;
    this.setAnimSpeed(lsPick('animSpeed', ANIM_SPEEDS, 'normal'));
    this.setCardSize(lsPick('cardSize', CARD_SIZES, 'normal'));
    // a replay needs no game worker (the recorded views carry the game); postMessage goes nowhere
    this.worker = REPLAY != null ? { postMessage() {}, terminate() {} } : new Worker(WORKER_URL, { type: 'module' });
    this.worker.onmessage = (e) => this.onMsg(e.data);
    // a card named in the log (feed or full log) opens it large
    document.addEventListener('click', (e) => {
      const chip = e.target.closest?.('#feed .lc[data-card], #log-list .lc[data-card], #rp-cap .lc[data-card]');
      if (!chip || !this.db) return;
      const card = this.db.get(+chip.dataset.card);
      if (card) { e.stopPropagation(); this.zoomCard(card); }
    });
    this.worker.onerror = (e) => {
      // an Event with no message = the worker script failed to LOAD. That happens to a page left
      // open across a deploy (its versioned v/<hash>/ bundle is gone): reload onto the current
      // build -- the game is autosaved -- at most once per minute so it can never loop
      const what = e.message || `${e.type || 'error'}${e.filename ? ` ${e.filename}:${e.lineno}` : ''} (worker failed to load)`;
      report('worker-error', what, { stale: !e.message });
      if (!e.message) {
        let last = 0; try { last = +sessionStorage.getItem('tfm.staleReload') || 0; } catch {}
        if (Date.now() - last > 60000) {
          try { sessionStorage.setItem('tfm.staleReload', String(Date.now())); } catch {}
          this.toast?.('Updating to the latest version…');
          setTimeout(() => location.reload(), 1200);
          return;
        }
      }
      this.fatal('Worker error: ' + what);
    };
    this.queue = [];
    this.presenting = false;
    this.view = null;
    this.legal = null;
    this.flow = null;         // active action-resolution flow
    this.sel = new Set();
    this.bindChrome();
    this.bindHandPan();
    const saved = Q.has('new') || REPLAY != null ? null : this.loadSave();
    this.tileSrc = saved?.src || {}; this.savedLog = saved?.log || [];   // which card placed each city (noteTileSources)
    if (saved) this.lastSaveBytes = new Uint8Array(saved.bytes.slice(0));   // the win-chance meter can evaluate right after a reload
    this.resumed = !!saved;
    this.firstRunPending = !saved && !Q.has('new') && !Q.has('map') && !Q.has('gallery') && REPLAY == null;   // first visit: offer the map menu
    if (!saved && REPLAY == null) try { localStorage.removeItem('tfmweb.feed'); } catch {}
    const sims = +(Q.get('sims') || localStorage.getItem('sims') || 4096);
    if (![...$('#set-sims').options].some((o) => +o.value === sims)) $('#set-sims').insertAdjacentHTML('afterbegin', `<option value="${sims}">${sims}</option>`);
    $('#set-sims').value = String(sims);
    $('#set-autoconf').checked = localStorage.getItem('autoConfirm') === '1';
    this.showThink = localStorage.getItem('showThink') === '1';
    $('#set-think').checked = this.showThink;
    // ?map=N (0 Tharsis, 1 Hellas, 2 Elysium, 7 Vastitas Borealis) for a NEW game; a saved game keeps its own map
    const map = Q.has('map') ? +Q.get('map') : +(localStorage.getItem('map') || 0);
    if (REPLAY != null) {
      this.replay = new ReplayViewer(this, REPLAY, { bootDone: () => { boot.finish(); setTimeout(() => { $('#boot')?.classList.add('gone'); setTimeout(() => $('#boot')?.remove(), 1500); }, 450); } });
      this.replay.boot();
    } else {
      this.recorder = new Recorder(this);             // the replay of this game (uploaded at the end)
      this.worker.postMessage({ t: 'init', settings: { sims, map, autoConfirm: $('#set-autoconf').checked, apiBase: apiUrl('bot') }, restore: saved });
    }
    this.layout();
    addEventListener('resize', () => this.layout());
    // re-fit whenever the visible area or a panel's size changes (a phone's URL bar, a rotation
    // -- iOS reports the new size late --, the players strip growing): stale insets = off-centre globe
    const relayout = () => { cancelAnimationFrame(this.layoutRaf); this.layoutRaf = requestAnimationFrame(() => this.layout()); };
    addEventListener('orientationchange', () => { relayout(); setTimeout(relayout, 350); });
    window.visualViewport?.addEventListener('resize', relayout);
    if (window.ResizeObserver) { const ro = new ResizeObserver(relayout); for (const s of ['#players', '#handbar', '#top', '#actions']) if ($(s)) ro.observe($(s)); }
    if (this.webglFailed) {
      // why the board is flat: said once the loading screen is gone, until dismissed (or 20 s)
      const note = () => {
        if (!boot.gone) return setTimeout(note, 400);
        const nb = h('div', 'panel hintbox', `<b>${esc(t('webgl.title'))}</b><div class="hb">${esc(t('webgl.body'))}</div>`);
        const ok = h('button', 'ghost', esc(t('btn.ok'))); nb.appendChild(ok);
        nb.id = 'webglnote'; nb.style.zIndex = '70'; nb.onclick = () => nb.remove();   // (over the setup dialog of a new game)
        $('#ui').appendChild(nb);
        setTimeout(() => nb.remove(), 20000);
      };
      setTimeout(note, 400);
    }
  }

  fatal(msg) { console.error(msg); this.setStatus(msg, false); }

  // ---------------------------------------------------------------- persistence
  loadSave() {
    try {
      const s = JSON.parse(localStorage.getItem('tfmweb.save') || 'null');
      if (!s || s.over) return null;
      const bin = atob(s.b64); const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return { bytes: bytes.buffer, meta: s.meta, log: s.log, src: s.src };
    } catch { return null; }
  }
  save(m) {
    this.lastSaveBytes = m.bytes;
    this.evalIfTurnStart();
    try {
      let bin = ''; const b = m.bytes; const CH = 0x8000;
      for (let i = 0; i < b.length; i += CH) bin += String.fromCharCode.apply(null, b.subarray(i, i + CH));
      localStorage.setItem('tfmweb.save', JSON.stringify({ b64: btoa(bin), meta: m.meta, log: m.log.slice(-400), src: this.tileSrc, over: this.view?.pending.kind === D.OVER }));
    } catch (e) { console.warn('save failed', e); }
  }

  // ---------------------------------------------------------------- worker msgs
  onMsg(m) {
    switch (m.t) {
      case 'static':
        boot.set(0.6);                                          // the engine is up
        this.recorder?.onStatic(m.data);
        Promise.resolve(CARD_TEXT).then((text) => {
          this.db = new CardDB(m.data.cards, text);
          this.map = m.data.map;
          // the rules data merges space names across maps; use the real Tharsis ones
          if (this.map.key === 'tharsis') for (const sp of this.map.spaces) sp.name = THARSIS_NAMES[sp.i] || '';
          else {
            const labels = MAP_LABELS[+Object.entries(MAP_KEYS).find(([, v]) => v === this.map.key)?.[0]] || {};
            for (const sp of this.map.spaces) if (sp.kind !== 2) sp.name = labels[sp.i] || '';
          }
          this.board.setMap(this.map);
          this.board.onHover = (s, e) => this.hexTip(s, e);
          this.board.onInspect = (s, e) => this.hexTip(s, e, true);
          if (Q.has('gallery')) return this.gallery();
          this.pump();
        });
        break;
      case 'view': if (Q.has('gallery')) break; this.recorder?.onView(m); this.queue.push(m); this.pump(); break;
      case 'progress': this.progress(m); break;
      case 'thinking': this.thinking(m); break;
      case 'hint': if (m.think?.pick) { this.applyPickRec?.(m.think.pick, m.think); break; } if (m.think?.setup || this.recPending) { this.applySetupRec?.(m.think?.setup); this.applyPickRec?.(null); break; } this.showHint(m.idx, m.think); break;
      case 'payopts': this.payModal(m.idx, m.opts); break;
      case 'save': this.save(m); break;
      case 'reload': this.toast(t('toast.reloading')); setTimeout(() => location.reload(), 900); break;
      case 'gamelog': fetch('api/gamelog', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(m) }).catch(() => {}); break;
      case 'error': this.answerSent = false; console.warn(m.msg); if (this.recPending) { this.applySetupRec?.(null); this.applyPickRec?.(null); } report('engine-error', m.msg, { view: this.view && { gen: this.view.gen, pending: this.view.pending, moves: this.view.moves } }); this.toast(m.msg.slice(0, 80), '#ff8a8a'); break;
      case 'warn': console.warn(m.msg); break;
    }
  }

  progress(m) {
    boot.set(Math.min(0.95, 0.35 + m.frac * 0.6));
    if (m.frac >= 1) { this.botReady = true; if (this.view) this.renderStatus(); }
    else if (this.view) this.setStatus(t('status.loadingBot', { pct: Math.round(m.frac * 100) }), true);
  }

  thinking(m) {
    this.botThinking = m.on;
    if (m.on) this.setStatus(m.msg ? (WORKER_MSG[m.msg] ? t(WORKER_MSG[m.msg]) : m.msg) : t('status.thinking'), true);
    else if (!this.presenting) this.renderStatus();
  }

  async pump() {
    if (this.presenting || !this.db) return;
    this.presenting = true;
    try {
      while (this.queue.length) {
        const m = this.queue.shift();
        await this.present(m);
      }
    } finally { this.presenting = false; }
  }

  // ---------------------------------------------------------------- presenting
  // Setup choices are simultaneous and secret: until the human has chosen,
  // show the opponent as still choosing (the engine applies the bot's pick
  // first so the human never waits on it).
  mask(v) {
    if (v.stage !== 0) return v;
    v.players = v.players.map((p) => p.id === v.human ? p : { ...p, corp: -1, preludes: [], played: [], hand: [], res: [0, 0, 0, 0, 0, 0], prod: [0, 0, 0, 0, 0, 0], tags: p.tags.map(() => 0), cres: {}, events: [], tr: 20, vp: { ...p.vp, total: 20, cards: 0 } });
    // (preludes resolve in turn order once both have chosen, so the globals
    // are still at their start values here; pinned for safety)
    v.temp = -30; v.oxy = 0;
    return v;
  }

  async present(m) {
    const prev = this.view, v = this.mask(m.view);
    this.view = v;
    this.noteTileSources(prev, v, m.fresh);
    this.history ||= [];
    if (v.stage === 2 && (!this.history.length || this.history[this.history.length - 1].gen !== v.gen)) this.history.push({ gen: v.gen, vp: v.players.map((p) => p.vp.total) });
    else if (this.history.length) this.history[this.history.length - 1].vp = v.players.map((p) => p.vp.total);
    this.legal = m.legal;
    this.answerSent = false;                          // a new game state: answers are accepted again
    this.canUndo = m.canUndo;
    // undo also takes the undone moves out of the log: feedMarks[d] = the log
    // length when the answer that took the worker's undo stack from depth d to
    // d+1 was sent; marks the worker can no longer undo to are dropped
    if (m.undoN != null) {
      this.feedMarks ||= [];
      if (m.undone && this.feedMarks[m.undoN] != null) this.truncateFeed(this.feedMarks[m.undoN]);
      this.feedMarks.length = Math.min(this.feedMarks.length, m.undoN);
      this.undoN = m.undoN;
    }
    this.awaitingConfirm = m.awaitingConfirm;
    const first = !prev || m.fresh;
    this.uiFx.quiet = first || !!m.undone;            // counters jump (no ticking) on a load, a new game or an undo
    // a move's resource changes show a beat AFTER its card flies / its cost rises off the board
    // (at the same moment, the eye misses the numbers changing); a new generation's production pours at once
    const holdRes = !first && !m.undone && prev.gen === v.gen && v.moves !== prev.moves;
    if (holdRes) this.uiFx.hold();
    if (first) {
      PCOL.splice(0, 2, ...(v.human === 0 ? [BLUE, ORANGE] : [ORANGE, BLUE]));
      this.board.playerColors = PCOL.map((c) => parseInt(c.slice(1), 16));
      // the loading screen stays up for the map's terrain, then the tiles' shaders (board/board3d.js
      // prewarmTiles: a few per frame, the bar moving); the other game stages compile in idle time after
      Promise.resolve(this.board.terrainReady).catch(() => {}).then(async () => {
        // a NEW game opens on the setup dialog: no tile can be placed for a while, so the
        // loading screen drops right after the terrain and the tile shaders compile behind the
        // dialog (Windows/ANGLE compiles are slow: they are most of the wait). A restored game
        // with tiles on the board still compiles first. Auto quality starts measuring after.
        if (!boot.gone && v.stage === 0 && !(v.tiles || []).length) {
          boot.finish();
          setTimeout(async () => {
            $('#boot')?.classList.add('gone'); setTimeout(() => $('#boot')?.remove(), 1500);
            prewarmStrike(this.board); (this.eventsFx ||= new EventsFx(this.board)).prewarm();
            await this.board.prewarmTiles('now').catch(() => {});
            gfx.begin();
            setTimeout(() => this.board.prewarmTiles('rest').finally(() => gfx.markWarm()), 1000);
          }, 450);
          return;
        }
        if (!boot.gone) {
          const f0 = boot.frac;                          // (the whimsical lines keep rotating meanwhile)
          this.board.hold = true;                       // (no globe frames behind the loading screen: the compiles get the time)
          prewarmStrike(this.board); (this.eventsFx ||= new EventsFx(this.board)).prewarm();   // (else on the timers below)
          await this.board.prewarmTiles('now', (f) => boot.set(f0 + (0.97 - f0) * f)).catch(() => {});
          this.board.hold = false;
        }
        boot.finish(); setTimeout(() => { $('#boot')?.classList.add('gone'); setTimeout(() => $('#boot')?.remove(), 1500); gfx.begin(); setTimeout(() => this.board.prewarmTiles('rest').finally(() => gfx.markWarm()), 1000); }, 450);
      });
      this.board.syncTiles(v.tiles, false);
      setTimeout(() => prewarmStrike(this.board), 1500);      // asteroid shaders compiled before the first strike
      setTimeout(() => (this.eventsFx ||= new EventsFx(this.board)).prewarm(), 1700);   // launches, arcs, planet pulses (events_fx.js)
      this.board.setGlobals(v.temp, v.oxy, v.oceans); this.audio.setTerraform(v.temp, v.oxy, v.oceans);
      if (m.fresh) { $('#log-list').innerHTML = ''; this.feedEl().innerHTML = ''; this.feedItems = []; try { localStorage.removeItem('tfmweb.feed'); } catch {} this.closeModal(); this.history = []; }
      else if (this.resumed) this.restoreFeed();
    }
    this.renderAll();
    if (first) this.layout();
    if (first && this.firstRunPending) { this.firstRunPending = false; setTimeout(() => this.mapChooser(true), 350); }
    const land = !first && !m.undone ? (await this.animateDiff(prev, v, m.step)).land : null;
    if (holdRes) {
      // ... as its fly-by lands, or RES_BEAT after the move's own animations; in move order
      const snap = this.uiFx.take(), beat = land || sleep(FAST || pace.skip ? 0 : RES_BEAT);   // (sleep scales it: pace.scale)
      this.resChain = Promise.all([this.resChain, beat]).then(() => this.uiFx.tickTo(snap));
    }
    if (v.fizzle != null && v.fizzle >= 0 && v.moves !== prev?.moves && !first && !m.undone && v.last.player === v.human) this.showFizzle(v.fizzle);
    if (m.undone) { this.board.syncTiles(v.tiles, false); this.board.setGlobals(v.temp, v.oxy, v.oceans); this.audio.setTerraform(v.temp, v.oxy, v.oceans); this.toast(t('toast.undone')); }
    // the moons follow the Jovian cards and the Ganymede tile (eased in once the play has landed)
    this.board.setMoonState(moonStateOf(v, this.db, this.map), !first && !m.undone);
    this.board.spaceCards?.setState(v, this.db, !first && !m.undone);   // space cards' scenery round Mars (space_cards.js)
    if (m.step && prev && !m.undone) {
      m.step.effects = this.effectsOf(prev, v);
      const note = this.attackNote(prev, v);
      if (note) m.step.effects = (m.step.effects ? m.step.effects + ' · ' : '') + note;
      const victim = v.players.find((p) => p.id !== v.last.player);
      const vn = victim && this.pname(victim.id);
      if (victim && m.step.effects && m.step.effects.includes(`${esc(vn)}</b> −`)) this.toast(m.step.effects.replace(/<[^>]+>/g, '').split(' · ').find((x) => x.startsWith(vn)), PCOL[victim.id]);
    }
    if (m.step) this.logStep(v, m.step);
    this.renderAll();
    // a dialog of yours after other moves (the next generation's draft, research, a prelude pick...; the final score)
    // waits for those moves' fly-bys and counters to finish -- they queue and never hold the game up, so without
    // this the draft would open over TFMBot's last moves still flying. Your normal turns don't wait, nor does a
    // dialog that follows your own move (Business Contacts' keep, a trigger...) unless fly-bys are still up
    if (REPLAY == null && !first && !m.undone && (m.over || (v.pending.player === v.human && v.pending.kind !== D.ACTION && v.pending.kind !== D.OVER))
      && (m.step?.who === 'bot' || this.flyN > 0)) await this.fxDrained();
    this.setupDecision();
    if (m.over) this.gameOver();
    this.board.syncClaims?.(this.view?.claims || []);          // Land Claim reservations
    setTimeout(() => this.evalIfTurnStart(), 0);
  }

  bump(sel) { const el = $(sel); el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }

  pcolor(p) { return PCOL[p] || '#ffffff'; }
  // the engine names the human seat "You": shown in the UI language
  pname(p) { const pl = this.view?.players[p]; return !pl ? '?' : p === this.view.human && pl.name === 'You' ? t('player.you') : pl.name; }
  hideTableau() { $('#tableau').classList.add('hidden'); }

  myTurn() { const v = this.view; return v && v.pending.player === v.human && !this.awaitingConfirm; }
  setStatus(txt, busy) { $('#status-text').textContent = txt; $('#status').classList.toggle('think', !!busy); }

  answer(msg) {
    this.flow = null;
    this.forced = false;
    this.closeModal();
    this.board.clearHighlight();
    $('#prompt').classList.add('hidden');
    this.audio.tick();
    (this.feedMarks ||= [])[this.undoN || 0] = (this.feedItems || []).length;   // for undo (see present)
    if (!this.answerSent) this.recorder?.noteAnswer(msg);
    // one answer per game state: a double click / double tap sent a second answer with an index
    // into the previous legal list ("move refused (-1)"); the next view re-opens the gate
    if (this.answerSent) return;
    this.answerSent = true;
    clearTimeout(this.answerT); this.answerT = setTimeout(() => { this.answerSent = false; }, 2500);   // never a lock-out if no view follows
    this.worker.postMessage({ t: 'answer', ...msg });
  }
  closeModal() { $('#modal').classList.add('hidden'); $('#modal').innerHTML = ''; this.flowModalOpen = false; }
  closeZoom() { $('#zoom').classList.add('hidden'); }
}
mixin(App, AppAnim, AppHud, AppHand, AppLog, AppDialogs, AppFlows, AppChrome);
