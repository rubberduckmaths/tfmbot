// chrome.js -- App's surroundings of the game: the menus and settings, the map chooser, the ?gallery view,
// hints, the win-chance meter and the end-of-game screen.
import { LANGS, fmtNum, getLang, has as tHas, onLangChange, setLang, t } from '../i18n.js';
import { gfx } from '../board/quality.js';
import { replayUrl } from '../replay/replay.js';
import { $, h, esc } from '../dom.js';
import { D } from '../protocol.js';
import { MAPS } from './content.js';
import { ANIM_SPEEDS, CARD_SIZES, PCOL, Q, REPLAY, boot, maName, pace } from './shared.js';
import { apiUrl } from '../paths.js';

export class AppChrome {
  // Settings > Animation speed: live play's waits (sleep), fly-bys, reveal trays, floats and counters
  setAnimSpeed(key) {
    const k = Object.hasOwn(ANIM_SPEEDS, key) ? key : 'normal';
    this.animSpeed = k;
    if (REPLAY != null) return;                       // (a replay has its own speed control)
    pace.anim = pace.scale = ANIM_SPEEDS[k];
    this.uiFx.speed = pace.anim;
    document.documentElement.style.setProperty('--as', String(pace.anim));   // app.css: the #flyer transitions
  }
  // Settings > Card size: the hand (app.css --cz: its scale, peek and bar height; the globe refits above it) and,
  // a little less, the cards in dialogs, the zoomed card and the reveal tray (--czm)
  setCardSize(key) {
    const k = Object.hasOwn(CARD_SIZES, key) ? key : 'normal';
    const [hz, dz] = CARD_SIZES[k], st = document.documentElement.style;
    this.cardSize = k; this.cardZoom = hz; this.dlgZoom = dz;
    st.setProperty('--cz', String(hz)); st.setProperty('--czm', String(dz));
    if (this.view) { this.renderHand(); this.layout(); }
  }

  // ?gallery: every tile type on the board, no game -- for judging the art
  gallery() {
    boot.finish(); $('#boot')?.classList.add('gone'); setTimeout(() => $('#boot')?.remove(), 1500);
    const types = [0, 1, 2, 3, 4, 7, 10, 11, 12, 13, 14, 15, 16, 17];
    const spaces = [22, 23, 24, 25, 26, 30, 31, 32, 33, 34, 35, 39, 40, 41];
    // ?gallery=<layout>&stage=early|mid|late: the tile-art debug layouts (board/tiles/tile_art.js galleryTiles)
    const art = Q.get('gallery') && this.board.tileArt?.galleryTiles(Q.get('gallery'), Q.get('stage'));
    this.board.syncTiles(art || types.map((t, i) => [spaces[i], t, i % 2]), false);
    window.galleryReady = true;
    gfx.begin();
  }
  // The win-chance meter: the server's evaluator (api/eval) gives a calibrated win probability for
  // your side -- the bot's value network's win estimate, averaged over 8 guesses of the bot's hidden cards -- at
  // one fixed moment, the start of each of your turns. It is not read off the bot's move search: that
  // blends win and margin, takes the best move's optimistic score and resamples hidden cards every
  // move, so it jumps around.
  evalIfTurnStart() {
    if (REPLAY != null) return;
    const v = this.view;
    if (!v || !this.lastSaveBytes || (this.queue && this.queue.length) || v.stage !== 2) return;
    if (v.pending.kind !== D.ACTION || v.pending.player !== v.human || v.an !== 0) return;
    const key = `${v.gen}:${v.moves}`;
    if (this.evalKey === key) return;
    this.evalKey = key;
    // (g, mv: which game and move, so the server's meter log can be joined with the game's result -- calibration)
    fetch(apiUrl(`eval?pid=${v.human}&g=${encodeURIComponent(this.recorder?.gid || '')}&mv=${v.moves}`), { method: 'POST', body: this.lastSaveBytes, headers: { 'content-type': 'application/octet-stream' } })
      .then((r) => (r.ok ? r.json() : null)).then((r) => { if (r && !r.err && this.evalKey === key) this.showOdds(r.p, r.sd, v.gen); }).catch(() => {});
  }
  showOdds(p, sd, gen) {
    const v = this.view, pYou = Math.max(0, Math.min(1, p));
    // the ▲/▼ change only between two readings from generation 2 on (gen 1 swings a lot)
    const prev = this.oddsGen >= 2 && gen >= 2 ? this.odds : null;
    this.odds = pYou; this.oddsGen = gen;
    let el = $('#odds');
    if (!el) { el = h('div', 'odds'); el.id = 'odds'; $('#top').insertBefore(el, $('#top .spacer')); }
    el.title = t('odds.title', { sd: Math.round((sd || 0) * 100) });
    const d = prev != null ? Math.round((pYou - prev) * 100) : 0;
    const delta = d ? `<small style="color:${d > 0 ? '#7dffb0' : '#ff9b9b'}">${d > 0 ? '▲' : '▼'}${Math.abs(d)}</small>` : '';
    el.innerHTML = `<span class="ol">${esc(t('odds.label'))}</span><div class="ob"><div style="width:${Math.round(pYou * 100)}%;background:${PCOL[v.human]}"></div><div style="flex:1;background:${PCOL[1 - v.human]}"></div></div><b>${Math.round(pYou * 100)}%</b>${delta}`;
  }

  showHint(idx, think) {
    if (idx < 0 || !this.legal) return;
    const a = this.legal[idx];
    let txt = this.actText(a);
    if (think?.top?.length > 1) {
      // each suggestion can be played from here: its legal move, through the normal flow (payment, targets, confirm)
      const L = this.legal, key = (x) => JSON.stringify({ ...x, fz: undefined });   // (fz rides only on the live move list)
      const rows = think.top.slice(0, 3).map((x) => {
        const j = L.findIndex((y) => key(y) === key(x.act));
        return { html: `${esc(this.actText(x.act))} · ${Math.round(100 * x.visits / think.total)}%`,
          play: j >= 0 ? () => { if (this.legal !== L || !this.myTurn()) return; this.closeModal(); this.flow = { key: 'hint', cands: [j], auto: false, legal: L }; this.resolve(); } : null };
      });
      this.toastLong(esc(t('hint.would', { act: txt })), '', rows);
    }
    if (a.space != null) { txt += ' ' + t('act.at', { space: this.spaceWhere(a.space) }); this.board.flashSpace(a.space, 0xfff27a); this.board.ensureVisible(a.space); }
    if (!(think?.top?.length > 1)) this.toast(t('hint.would', { act: txt }), '#fff27a');
    this.renderStatus();
  }

  gameOver() {
    this.stickyTray?.__out?.();          // a public reveal still up (Search For Life...) would be left behind the score screen
    const v = this.view;
    this.audio.fanfare();
    this.modal((box) => {
      const win = v.winner === v.human;
      box.appendChild(h('h2', '', esc(win ? t('go.youBeat') : t('turn.wins', { who: this.pname(v.winner) }))));
      const rows = ['total', 'tr', 'cards', 'green', 'city', 'ms', 'aw'];
      let tb = '<table style="border-collapse:collapse;font-size:14px;margin:8px 0 14px">';
      tb += '<tr><td></td>' + v.players.map((p) => `<th data-p="${p.id}" style="padding:4px 14px;color:${PCOL[p.id]}">${esc(this.pname(p.id))}</th>`).join('') + '</tr>';
      for (const r of rows) tb += `<tr><td style="color:#9aa3b5;padding:3px 10px 3px 0">${esc(t('go.' + r))}</td>` + v.players.map((p) => `<td data-p="${p.id}" data-r="${r}" data-v="${p.vp[r]}" style="text-align:center;font-family:var(--fd);font-size:${r === 'total' ? 22 : 16}px;font-weight:700">${p.vp[r]}</td>`).join('') + '</tr>';
      box.insertAdjacentHTML('beforeend', tb + '</table>');
      setTimeout(() => this.uiFx.gameOver(box, v.winner), 0);   // tallies count up, the winner lights up (ui_fx.js)
      box.insertAdjacentHTML('beforeend', this.vpChart());
      if (REPLAY != null) {
        // the end of a replay: watch it again, or play
        box.appendChild(h('div', 'sub', esc(t('rp.endSub', { n: v.gen }))));
        const foot = h('div', 'foot');
        foot.appendChild(h('div', 'info', ''));
        const again = h('button', 'ghost', esc(t('rp.again'))); again.onclick = () => this.replay.restart();
        const b = h('button', 'primary', esc(t('rp.play'))); b.onclick = () => { location.href = location.href.split('?')[0]; };
        foot.append(again, b);   // (the dialog's own Hide shows the board, with a way back)
        box.appendChild(foot);
        return;
      }
      box.appendChild(h('div', 'sub', esc(t('go.sub', { n: v.gen }))));
      // the replay of this game: its link once uploaded (replay/replay.js Recorder)
      const rl = h('div', 'rplink', `<span class="rpl-wait">${esc(t('rp.saving'))}</span>`);
      box.appendChild(rl);
      (this.recorder?.result || Promise.reject(new Error('no recorder'))).then((id) => {
        const url = replayUrl(id);
        rl.innerHTML = '';
        const watch = h('a', 'primary rpl-watch', esc(t('rp.watch')));
        watch.href = url; watch.target = '_blank'; watch.rel = 'noopener';
        const copy = h('button', 'ghost', esc(t('rp.copy')));
        copy.onclick = () => {
          const done = () => this.toast(t('rp.copied'), '#7dffb0');
          (navigator.clipboard?.writeText(url) || Promise.reject()).then(done, () => { const i = rl.querySelector('input'); i?.select(); try { document.execCommand('copy'); done(); } catch {} });
        };
        const inp = h('input', 'rpl-url'); inp.readOnly = true; inp.value = url; inp.onclick = () => inp.select();
        rl.append(watch, copy, inp);
      }, () => { rl.innerHTML = `<small class="rpl-fail">${esc(t('rp.unavailable'))}</small>`; });
      const foot = h('div', 'foot');
      foot.appendChild(h('div', 'info', ''));
      const b = h('button', 'primary', esc(t('btn.newGame')));
      b.onclick = () => this.mapChooser();
      foot.append(b);   // (the dialog's own Hide shows the board, with a way back)
      box.appendChild(foot);
    });
  }

  // VP by generation for both players (SVG line chart)
  vpChart() {
    const hs = this.history || [];
    if (hs.length < 2) return '';
    const W = 420, H = 150, P = 26;
    const gens = hs.map((x) => x.gen), maxV = Math.max(10, ...hs.flatMap((x) => x.vp));
    const X = (g) => P + (g - gens[0]) / Math.max(1, gens[gens.length - 1] - gens[0]) * (W - P * 1.5);
    const Y = (v) => H - P + 4 - v / maxV * (H - P - 10);
    let svg = `<svg class="vpchart" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`;
    for (let t = 0; t <= maxV; t += maxV > 100 ? 25 : 10) svg += `<line x1="${P}" x2="${W - 4}" y1="${Y(t)}" y2="${Y(t)}" stroke="#ffffff14"/><text x="${P - 4}" y="${Y(t) + 3}" text-anchor="end">${t}</text>`;
    for (const g of gens) svg += `<text x="${X(g)}" y="${H - 6}" text-anchor="middle">${g}</text>`;
    this.view.players.forEach((p) => {
      const pts = hs.map((x) => `${X(x.gen).toFixed(1)},${Y(x.vp[p.id]).toFixed(1)}`).join(' ');
      svg += `<polyline points="${pts}" fill="none" stroke="${PCOL[p.id]}" stroke-width="2.5" stroke-linejoin="round"/>`;
      const last = hs[hs.length - 1];
      svg += `<circle cx="${X(last.gen)}" cy="${Y(last.vp[p.id])}" r="3.5" fill="${PCOL[p.id]}"/>`;
    });
    return svg + `<text x="${W - 4}" y="12" text-anchor="end">${esc(t('go.chart'))}</text></svg>`;
  }

  // map: 0 Tharsis, 1 Hellas, 2 Elysium, 7 Vastitas Borealis; omitted = last used
  newGame(map) {
    localStorage.removeItem('tfmweb.save');
    localStorage.removeItem('tfmweb.feed');
    if (map != null) try { localStorage.setItem('map', String(map)); } catch {}
    this.closeModal();
    $('#menu').classList.add('hidden');
    this.queue = [];
    this.worker.postMessage({ t: 'new', map: map ?? +(localStorage.getItem('map') || 0) });
  }

  // choose the map for a new game (first start and New game)
  mapChooser(firstRun = false) {
    let last = 0;
    try { last = +(localStorage.getItem('map') || 0); } catch {}
    const inGame = !firstRun && this.view && this.view.pending.kind !== D.OVER && this.view.stage === 2;
    this.choosingMap = true; this.mapFirstRun = firstRun;
    this.flowModalOpen = true;
    this.modal((box) => {
      box.classList.add('mapbox');
      box.appendChild(h('h2', '', esc(t(firstRun ? 'maps.titleFirst' : 'maps.title'))));
      box.appendChild(h('div', 'sub', esc(t(inGame ? 'maps.abandon' : 'maps.sub'))));
      const grid = h('div', 'maps');
      for (const m of MAPS) {
        const b = h('button', 'mapcard' + (m.id === last ? ' last' : ''), `
          <div class="mthumb"><img src="assets/maps/${m.key}/thumb.jpg" alt="" onerror="this.remove()"><span data-last="${esc(t('map.lastPlayed'))}">${esc(t(`map.${m.key}.name`))}</span></div>
          <div class="mtext"><p>${esc(t(`map.${m.key}.blurb`))}</p>
          <div class="mlist"><b>${esc(t('maps.ms'))}</b> ${m.ms.map((n) => esc(maName(n))).join(' · ')}</div>
          <div class="mlist"><b>${esc(t('maps.aw'))}</b> ${m.aw.map((n) => esc(maName(n))).join(' · ')}</div></div>`);
        // first start: the default game is already dealt on the stored map -- keep it if that's the pick
        b.onclick = () => { this.audio.tick(); this.choosingMap = false; if (firstRun && m.id === (this.view?.map ?? 0)) { try { localStorage.setItem('map', String(m.id)); } catch {} this.closeModal(); this.setupDecision(); } else this.newGame(m.id); };
        grid.appendChild(b);
      }
      // a surprise: any map, picked at random
      const rb = h('button', 'mapcard random', `
          <div class="mthumb rnd"><b>🎲</b><span>${esc(t('map.random.name'))}</span></div>
          <div class="mtext"><p>${esc(t('map.random.blurb'))}</p></div>`);
      rb.onclick = () => {
        this.audio.tick(); this.choosingMap = false;
        const m = MAPS[Math.floor(Math.random() * MAPS.length)];
        if (firstRun && m.id === (this.view?.map ?? 0)) { try { localStorage.setItem('map', String(m.id)); } catch {} this.closeModal(); this.setupDecision(); } else this.newGame(m.id);
      };
      grid.appendChild(rb);
      box.appendChild(grid);
      box.appendChild(h('div', 'mapfoot', t('foot.html')));
      if (!firstRun) {
        const foot = h('div', 'foot'); foot.appendChild(h('div', 'info', ''));
        const c = h('button', 'ghost', esc(t('btn.cancel'))); c.onclick = () => { this.choosingMap = false; this.closeModal(); this.setupDecision(); }; foot.appendChild(c);
        box.appendChild(foot);
      }
    });
  }

  // ---------------------------------------------------------------- chrome
  bindChrome() {
    const unlock = () => { this.audio.unlock(); $('#btn-music').classList.toggle('off', !this.audio.musicOn); };
    addEventListener('pointerdown', unlock, { once: false, capture: true });
    $('#btn-undo').onclick = () => { this.lastUndoAt = Date.now(); this.audio.tick(); this.flow = null; this.board.clearHighlight(); this.worker.postMessage({ t: 'undo' }); };
    $('#btn-confirm').onclick = () => { this.audio.turn(); this.worker.postMessage({ t: 'confirm' }); };
    $('#btn-hint').onclick = () => this.worker.postMessage({ t: 'hint' });
    $('#btn-log').onclick = () => $('#log').classList.toggle('hidden');
    // the log as a text file (a player's request): one line per entry, as shown, with what TFMBot considered
    $('#log-dl').onclick = () => {
      const v = this.view, lines = [...document.querySelectorAll('#log-list li')].map((li) => li.innerText.replace(/\s*\n\s*/g, ' · ').trim());
      const head = `TFMBot game log -- ${new Date().toISOString().slice(0, 16).replace('T', ' ')}${v ? ` -- ${this.map?.key || ''}, generation ${v.gen}` : ''}\n\n`;
      const a = h('a'); a.href = URL.createObjectURL(new Blob([head + lines.join('\n') + '\n'], { type: 'text/plain' }));
      a.download = `tfmbot-log-${new Date().toISOString().slice(0, 10)}.txt`; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };
    $('#btn-help').onclick = () => $('#help').classList.toggle('hidden');
    // free-form feedback -> the server's feedback log, with the current position attached
    $('#btn-feedback').onclick = () => { $('#feedback').classList.toggle('hidden'); if (!$('#feedback').classList.contains('hidden')) $('#fb-text').focus(); };
    $('#menu-feedback').onclick = () => { $('#menu').classList.add('hidden'); $('#feedback').classList.remove('hidden'); $('#fb-text').focus(); };   // (phones: from the settings menu)
    $('#fb-send').onclick = () => {
      const text = $('#fb-text').value.trim(), btn = $('#fb-send');
      if (!text || btn.disabled) return;
      btn.disabled = true;
      const v = this.view;
      const body = { text, contact: $('#fb-contact').value.trim(), lang: getLang(), build: document.querySelector('script[type=module]')?.src,
        screen: `${innerWidth}x${innerHeight}@${devicePixelRatio}`, game: v && { gen: v.gen, map: v.map, pending: v.pending?.kind, moves: v.moves, human: v.human }, save: this.lastSaveBytes && (() => { const u = this.lastSaveBytes; let bin = ''; for (let i = 0; i < u.length; i += 0x8000) bin += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(bin); })() };
      fetch(new URL('api/feedback', location.href), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
        .then((r) => { if (!r.ok) throw new Error(r.status); $('#fb-text').value = ''; $('#feedback').classList.add('hidden'); this.toast(t('fb.thanks'), '#7dffb0'); })
        .catch(() => this.toast(t('fb.failed'), '#ff8a8a'))
        .finally(() => { btn.disabled = false; });
    };
    $('#btn-menu').onclick = () => $('#menu').classList.toggle('hidden');
    $('#btn-music').onclick = () => { this.audio.unlock(); const on = this.audio.toggleMusic(); $('#btn-music').classList.toggle('off', !on); };
    document.querySelectorAll('[data-close]').forEach((b) => (b.onclick = () => $('#' + b.dataset.close).classList.add('hidden')));
    $('#btn-new').onclick = () => (REPLAY != null ? (location.href = location.href.split('?')[0]) : this.mapChooser());   // (a replay: back to your own game)
    $('#btn-auto').onclick = () => { $('#menu').classList.add('hidden'); this.closeModal(); this.worker.postMessage({ t: 'autoplay' }); };
    $('#set-sims').onchange = (e) => { localStorage.setItem('sims', e.target.value); this.toast(t('toast.sims', { n: fmtNum(+e.target.value) })); this.worker.postMessage({ t: 'settings', settings: { sims: +e.target.value } }); };
    $('#set-think').onchange = (e) => {
      this.showThink = e.target.checked;
      try { localStorage.setItem('showThink', this.showThink ? '1' : '0'); } catch {}
      $('#log-list').innerHTML = ''; this.feedEl().innerHTML = '';
      for (const it of this.feedItems || []) this.addFeedItem(it, false);
    };
    // graphics quality (board/quality.js): Auto shows the level it is on
    const gfxLabel = () => { const o = $('#set-gfx').options[0]; o.textContent = gfx.setting === 'auto' ? t('gfx.autoLevel', { level: tHas('gfx.' + gfx.level) ? t('gfx.' + gfx.level) : gfx.level }) : t('gfx.auto'); $('#set-gfx').value = gfx.setting; };
    this.gfxLabel = gfxLabel;
    gfxLabel();
    gfx.onChange(gfxLabel);
    // language: the picker lists every language in its own name; switching re-renders in place (the game carries on)
    const ls = $('#set-lang');
    if (ls) {
      ls.innerHTML = LANGS.map(([c, n]) => `<option value="${c}" lang="${c}">${esc(n)}</option>`).join('');
      ls.value = getLang();
      ls.onchange = async (e) => { ls.disabled = true; try { await setLang(e.target.value); } finally { ls.disabled = false; ls.value = getLang(); } };
    }
    onLangChange(() => this.relocalize());
    $('#set-gfx').onchange = (e) => { gfx.choose(e.target.value); gfxLabel(); };
    // board view: 3D globe / 2D map (board/board2d.js). Switching reloads the page -- the game is autosaved
    const bv = h('label', '', `<span data-i18n="menu.board">${esc(t('menu.board'))}</span>
      <select id="set-board"><option value="3d" data-i18n="board.3d">${esc(t('board.3d'))}</option><option value="2d" data-i18n="board.2d">${esc(t('board.2d'))}</option></select>`);
    $('#set-gfx').closest('label').after(bv);
    const tl = h('label', '', `<span data-i18n="menu.tiles">${esc(t('menu.tiles'))}</span>
      <select id="set-tiles"><option value="standard" data-i18n="tiles.standard">${esc(t('tiles.standard'))}</option><option value="varied" data-i18n="tiles.varied">${esc(t('tiles.varied'))}</option></select>`);
    bv.after(tl);
    // card size and animation speed; both remembered
    const opt = (v, k) => `<option value="${v}" data-i18n="${k}">${esc(t(k))}</option>`;
    const cz = h('label', '', `<span data-i18n="menu.cards">${esc(t('menu.cards'))}</span>
      <select id="set-cards">${opt('xs', 'cards.xs')}${opt('small', 'cards.small')}${opt('normal', 'cards.normal')}${opt('large', 'cards.large')}${opt('xl', 'cards.xl')}</select>`);
    tl.after(cz);
    $('#set-cards').value = this.cardSize;
    $('#set-cards').onchange = (e) => { try { localStorage.setItem('cardSize', e.target.value); } catch {} this.setCardSize(e.target.value); };
    const an = h('label', '', `<span data-i18n="menu.anim">${esc(t('menu.anim'))}</span>
      <select id="set-anim">${opt('slow', 'anim.slow')}${opt('normal', 'anim.normal')}${opt('fast', 'anim.fast')}${opt('vfast', 'anim.vfast')}${opt('instant', 'anim.instant')}</select>`);
    cz.after(an);
    if (REPLAY != null) an.classList.add('hidden');          // (a replay has its own speed control)
    $('#set-anim').value = this.animSpeed;
    $('#set-anim').onchange = (e) => { try { localStorage.setItem('animSpeed', e.target.value); } catch {} this.setAnimSpeed(e.target.value); };
    if (this.map2d) tl.classList.add('hidden');                // (the globe's tile art)
    $('#set-tiles').value = this.board.variedTiles ? 'varied' : 'standard';
    $('#set-tiles').onchange = (e) => {
      try { localStorage.setItem('tileset', e.target.value); } catch {}
      this.board.variedTiles = e.target.value === 'varied';
      this.board.tileArt?.applyStage(); this.board.tileArt?.refresh();     // (the tiles whose look changes are rebuilt in place)
      this.board.syncBadges?.();
    };
    if (this.map2d) $('#set-gfx').closest('label').classList.add('hidden');   // (graphics quality is the globe's)
    $('#set-board').value = this.map2d ? '2d' : '3d';
    $('#set-board').onchange = (e) => {
      try { localStorage.setItem('boardView', e.target.value); } catch {}
      this.toast(t('toast.boardView'));
      const u = new URL(location.href); u.searchParams.delete('board'); u.searchParams.delete('new');
      setTimeout(() => location.replace(u.href), 400);
    };
    if (this.map2d) { const hg = document.querySelector('[data-i18n-html="help.globe"]'); if (hg) { hg.dataset.i18nHtml = 'help.map2d'; hg.innerHTML = t('help.map2d'); } }
    $('#set-autoconf').onchange = (e) => { localStorage.setItem('autoConfirm', e.target.checked ? '1' : '0'); this.worker.postMessage({ t: 'settings', settings: { autoConfirm: e.target.checked } }); };
    $('#set-music').value = Math.round(this.audio.musicVol * 100);
    $('#set-sfx').value = Math.round(this.audio.sfxVol * 100);
    $('#set-music').oninput = (e) => this.audio.setMusic(e.target.value / 100);
    $('#set-sfx').oninput = (e) => { this.audio.setSfx(e.target.value / 100); this.audio.tick(); };
    $('#btn-music').classList.toggle('off', !this.audio.musicOn);
    addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { this.closeZoom(); this.hideTableau(); $('#help').classList.add('hidden'); if (this.flow) this.cancelFlow(); }
      if (e.key === '?') $('#help').classList.toggle('hidden');
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') $('#btn-undo').click();
      if (e.key === 'Enter' && this.awaitingConfirm) $('#btn-confirm').click();
      if (e.key === 'h' && !e.ctrlKey) this.board.resetView();
    });
    document.addEventListener('pointerdown', (e) => {
      const tb = $('#tableau');
      if (!tb.classList.contains('hidden') && !tb.contains(e.target) && !e.target.closest('.pb')) this.hideTableau();
    });
    // phone portrait: actions drawer
    const tog = h('button', 'ghost', esc(t('btn.actions')));
    tog.id = 'actions-toggle';                      // (in the turn-control row, beside undo / pass / 💡 -- never over other content)
    tog.onclick = () => { const open = $('#actions').classList.toggle('open'); tog.textContent = t(open ? 'btn.closeDrawer' : 'btn.actions'); };
    $('#turnctl .ctl').insertBefore(tog, $('#btn-hint'));
    document.addEventListener('contextmenu', (e) => { if (e.target.closest('#gl')) e.preventDefault(); });
  }

  // the language changed (i18n.js has already re-applied the static page text): redraw
  // everything built from strings. The game, the open flow and the log carry on (log
  // lines already written stay in the language they were written in).
  relocalize() {
    this.gfxLabel?.();
    this.board.relabel?.();                         // hex names on the globe
    const tog = $('#actions-toggle'); if (tog) tog.textContent = t($('#actions').classList.contains('open') ? 'btn.closeDrawer' : 'btn.actions');
    for (const k of ['temp', 'oxy', 'ocean']) { const c = $(`#t-${k} .cells`); if (c) c.innerHTML = ''; }
    this.tracksBuilt = false;
    $('#tf-done')?.remove();
    $('#odds')?.remove(); this.evalKey = null;
    if (!this.view) return;
    this.renderAll();
    this.evalIfTurnStart();
    if (!$('#tableau').classList.contains('hidden') && this.tableauPid != null) this.showTableau(this.tableauPid);
    if (!$('#zoom').classList.contains('hidden')) this.closeZoom();
    const modalOpen = !$('#modal').classList.contains('hidden');
    if (this.choosingMap) this.mapChooser(this.mapFirstRun);
    else if (modalOpen && this.view.pending.kind === D.OVER) { this.closeModal(); this.gameOver(); }
    else if (!this.flow) this.setupDecision();
    else this.cancelFlow();   // a half-made move starts over in the new language
  }
}
