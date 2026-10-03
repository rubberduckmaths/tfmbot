// E2E: headless browser plays the HUMAN seat through the real UI, randomly,
// against TFMBot until the game ends. Usage: node tools/e2e.mjs [sims] [maxMinutes]
import { chromium } from 'playwright-core';
import zlib from 'zlib';
import { redact, vhash, decodeViews } from '../web/js/replay/replay_codec.js';
const sims = process.argv[2] || 64, maxMin = +(process.argv[3] || 30);
// REPLAY_CHECK=1: every view the game showed is captured; at game over the uploaded replay
// (/api/replay) must hold exactly the committed ones (undone steps dropped), hash for hash
const REPLAY_CHECK = !!process.env.REPLAY_CHECK;
// RELOAD_GEN=n: reload the page once at generation n (the saved game and its recording carry on);
// RELOAD_CLEAR=1 also wipes the recording first (a game that was running before replays shipped: partial)
// WANT="Business Contacts,Invention Contest": draft / buy / play these whenever offered (look-and-keep choices)
const RELOAD_GEN = +(process.env.RELOAD_GEN || 0), WANT = (process.env.WANT || '').split(',').filter(Boolean);
let reloaded = false, shownBefore = [];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/usr/bin/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const VP = process.env.VIEWPORT ? process.env.VIEWPORT.split('x').map(Number) : [1440, 900];
const page = await browser.newPage({ viewport: { width: VP[0], height: VP[1] }, ...(process.env.MOBILE ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
if (REPLAY_CHECK) await page.addInitScript(() => {
  window.__shown = [];
  let app;
  Object.defineProperty(window, 'app', { configurable: true, get: () => app, set: (a) => {
    app = a;
    const present = a.present.bind(a);
    a.present = async (m) => { const r = await present(m); window.__shown.push({ view: JSON.parse(JSON.stringify(a.view)), undone: !!m.undone }); return r; };
  } });
});
page.setDefaultTimeout(300000); page.setDefaultNavigationTimeout(300000);   // SwiftShader: load + shader prewarm can pass 30 s
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ' ' + m.text()); });
// LANG_UI=de etc.: play through the UI in that language (?lang=); BOARD=2d: the flat map (?board=2d), its hexes clicked with the mouse
const URL0 = `${process.env.URL || 'http://127.0.0.1:8080/'}?fast&new&sims=${sims}&map=${process.env.MAP || 0}${process.env.LANG_UI ? '&lang=' + process.env.LANG_UI : ''}${process.env.BOARD ? '&board=' + process.env.BOARD : ''}`;
await page.goto(URL0);
const t0 = Date.now();
const covers = {};
let acts = 0, hexClicks = 0, hexApi = 0, undos = 0, stuck = 0, lastSig = '';
const stats = {};
while (Date.now() - t0 < maxMin * 60e3) {
  await page.waitForTimeout(150);
  const st = await page.evaluate(() => {
    const a = window.app; if (!a || !a.view) return null;
    const v = a.view;
    return { k: v.pending.kind, p: v.pending.player, human: v.human, gen: v.gen, confirm: a.awaitingConfirm, presenting: a.presenting, q: a.queue.length, flow: !!a.flow, modal: !document.querySelector('#modal').classList.contains('hidden'), hl: [...a.board.highlighted], canUndo: a.canUndo, moves: v.moves, vp: v.players.map((p) => p.vp.total) };
  });
  if (!st) continue;
  if (st.k === 9) { console.log('GAME OVER gen', st.gen, 'vp', st.vp, 'human', st.human); if (REPLAY_CHECK) await replayCheck(); break; }
  if (st.presenting || st.q) continue;
  if (RELOAD_GEN && !reloaded && st.gen >= RELOAD_GEN && st.p === st.human && !st.confirm && !st.modal && !st.flow) {
    reloaded = true;
    if (REPLAY_CHECK) shownBefore = await page.evaluate(() => window.__shown);
    if (process.env.RELOAD_CLEAR) await page.evaluate(() => new Promise((res) => { const r = indexedDB.open('tfmweb-replay', 1); r.onsuccess = () => { const tx = r.result.transaction(['steps', 'meta'], 'readwrite'); tx.objectStore('steps').clear(); tx.objectStore('meta').clear(); tx.oncomplete = tx.onerror = () => res(); }; r.onerror = () => res(); }));
    console.log('RELOAD at gen', st.gen, process.env.RELOAD_CLEAR ? '(recording wiped)' : '');
    await page.goto(URL0.replace('&new', ''));
    await page.waitForFunction(() => window.app && window.app.view, null, { timeout: 240000 });
    continue;
  }
  const sig = JSON.stringify([st.k, st.p, st.moves, st.confirm, st.flow, st.modal, st.hl.length]);
  if (sig === lastSig) { if (++stuck > 400) { console.log('STUCK', sig); break; } } else { stuck = 0; lastSig = sig; }
  if (st.confirm) {
    // DOM clicks: playwright's actionability wait ("stable") trips on the bar's re-layout at SwiftShader frame rates
    const dom = (sel) => page.evaluate((s) => document.querySelector(s)?.click(), sel);
    if (st.canUndo && Math.random() < +(process.env.UNDO || 0.15)) { undos++; await dom('#btn-undo'); }
    else await dom('#btn-confirm');
    continue;
  }
  if (st.p !== st.human) continue;
  stats[st.k] = (stats[st.k] || 0) + 1;
  // an open board pick
  if (st.hl.length) {
    // 2D map: a real mouse click on the hex's centre, when nothing covers it (the pick must map exactly)
    const s = st.hl[Math.floor(Math.random() * st.hl.length)];
    const hit = process.env.BOARD === '2d' && await page.evaluate((s) => { const p = window.app.board.screenOf(s), e = p && document.elementFromPoint(p.x, p.y); return e?.closest('#board2d') ? { p } : { cover: e && `${e.closest('[id]')?.id || ''} .${e.className?.baseVal ?? e.className}` }; }, s);
    const at = hit?.p;
    if (hit?.cover) (covers[hit.cover] = (covers[hit.cover] || 0) + 1);
    if (at) { hexClicks++; await page.mouse.click(at.x, at.y); await page.waitForTimeout(60); if (await page.evaluate((s) => window.app.board.highlighted.has(s), s)) { const v = await page.evaluate(() => window.app.view.moves); console.log('hex click did not pick', s, v); } }
    else { if (process.env.BOARD === '2d') hexApi++; await page.evaluate((s) => window.app.board.onPick(s), s); }
    continue;
  }
  if (st.modal) {
    // modal: choices or card picks
    const done = await page.evaluate((W) => {
      const m = document.querySelector('#modal');
      const wanted = (row) => [...(row?.children || [])].filter((c) => W.includes(window.app.db.get(+c.dataset.id)?.name));
      const opts = [...m.querySelectorAll('.opt')];
      if (opts.length) { opts[Math.floor(Math.random() * opts.length)].click(); return 'opt'; }
      const rows = [...m.querySelectorAll('.cards')];
      const v = window.app.view;
      if (v.pending.kind === 1) {
        rows[0].children[Math.floor(Math.random() * rows[0].children.length)].click();
        const pr = [...rows[1].children]; pr.sort(() => Math.random() - 0.5); pr[0].click(); pr[1].click();
        const r3 = [...document.querySelector('#modal').querySelectorAll('.cards')][2];
        [...r3.children].slice(0, 2).forEach((c) => c.click());
        wanted([...document.querySelector('#modal').querySelectorAll('.cards')][2]).forEach((c) => c.click());
      } else if (v.pending.kind === 10) {
        [...rows[0].children].slice(0, v.pending.keep).forEach((c) => c.click());
      } else if (rows.length && rows[0].children.length) {
        const cs = [...rows[0].children], w = wanted(rows[0]);
        (w.length ? w[0] : cs[Math.floor(Math.random() * cs.length)]).click();
      }
      const ok = [...document.querySelectorAll('#modal button.primary')][0];
      if (ok && !ok.disabled) { ok.click(); return 'ok'; }
      return 'none';
    }, WANT);
    if (done === 'none') { await page.evaluate(() => { const b = [...document.querySelectorAll('#modal button:not(.peekbtn)')].filter((x) => !x.disabled).pop(); b && b.click(); }); }
    continue;
  }
  if (st.k === 7 || st.k === 8) {
    if (st.flow) continue;
    await page.evaluate((W) => {
      const a = window.app; const keys = [...a.entries().keys()];
      const want = keys.filter((k) => k.startsWith('card:') && W.includes(a.db.get(+k.slice(5))?.name));
      if (want.length) return a.startFlow(want[0]);
      // prefer real moves over pass so games progress like games
      const pool = keys.filter((k) => k !== 'pass' || Math.random() < 0.08);
      const k = (pool.length ? pool : keys)[Math.floor(Math.random() * (pool.length || keys.length))];
      a.startFlow(k);
    }, WANT);
    acts++;
  }
}
async function replayCheck() {
  const id = await page.evaluate(() => Promise.race([window.app.recorder.result, new Promise((r) => setTimeout(() => r('timeout'), 30000))]).catch((e) => 'ERR ' + e.message));
  if (!/^\d{4}[0-9A-Za-z]{10}$/.test(id)) { console.log('REPLAY FAIL: no upload:', id); process.exitCode = 1; return; }
  const base = process.env.URL || 'http://127.0.0.1:8080/';
  const res = await fetch(new URL('api/replay/' + id, base));
  const r = await res.json();
  const views = decodeViews(r.steps);
  // the expected list, built independently: the views shown, minus consecutive repeats, and an
  // undo takes the list back to the last copy of the view it restored
  const shown = [...shownBefore, ...(reloaded ? [{ reload: true }] : []), ...await page.evaluate(() => window.__shown)];
  const exp = [];
  let afterReload = false;
  for (const s of shown) {
    if (s.reload) { afterReload = true; if (process.env.RELOAD_CLEAR) exp.length = 0; continue; }
    const hsh = vhash(redact(s.view));
    // after a reload: the restored position continues the recording from where it matches (else a cut)
    if (afterReload) { afterReload = false; const k = exp.lastIndexOf(hsh); if (k >= 0) exp.length = k + 1; else exp.push(hsh); continue; }
    if (s.undone) { const k = exp.lastIndexOf(hsh); if (k >= 0) { exp.length = k + 1; continue; } }
    if (exp[exp.length - 1] !== hsh) exp.push(hsh);
  }
  // a whole recording (r.full) holds both seats' secrets: compare what the viewer shows from the human's seat
  // (app.js mask + redact; secret-only changes collapse into one step there)
  const blank = (v, list) => (list || []).map((x) => ({ ...x, v: x.v.map((n, p) => (p === v.human ? n : x.crit === 'tr' ? 20 : 0)) }));   // (app.js mask)
  const mask = (v) => (v.stage !== 0 ? v : { ...v, temp: -30, oxy: 0, discard: 0, ms: blank(v, v.ms), aw: blank(v, v.aw), players: v.players.map((p) => p.id === v.human ? p : { ...p, corp: -1, preludes: [], played: [], hand: [], res: [0, 0, 0, 0, 0, 0], prod: [0, 0, 0, 0, 0, 0], tags: p.tags.map(() => 0), cres: {}, events: [], tr: 20, vp: { ...p.vp, total: 20, cards: 0 } }) });
  const full = r.full === 1 || views.some((v) => v.players.some((p) => p.id !== v.human && p.hand.some((c) => c >= 0)));
  const got = full ? views.map((v) => vhash(redact(mask(JSON.parse(JSON.stringify(v)))))).filter((x, i, a) => !i || x !== a[i - 1]) : views.map(vhash);
  if (!full) console.log('REPLAY: not a whole recording (full) -- only the human seat can be watched');
  let bad = got.length === exp.length ? -1 : Math.min(got.length, exp.length);
  for (let i = 0; i < Math.min(got.length, exp.length); i++) if (got[i] !== exp[i]) { bad = i; break; }
  const gz = zlib.gzipSync(JSON.stringify(r)).length;
  console.log(`REPLAY ${id}: ${r.steps.length} steps, ${shown.length} views shown, partial=${r.partial}, full=${full} (flag ${r.full}), ${(gz / 1024).toFixed(1)} KB gz, human ${r.human}`);
  const keeps = views.filter((v, i) => i && views[i - 1].pending.kind === 10 && views[i - 1].pending.player === views[i - 1].human).length;
  console.log(`  human look-and-keep choices: ${keeps}; research buys: ${views.filter((v, i) => i && views[i - 1].pending.kind === 6 && views[i - 1].pending.player === views[i - 1].human).length}; reloaded: ${reloaded}`);
  if (reloaded && !!process.env.RELOAD_CLEAR !== !!r.partial) { console.log('REPLAY CHECK FAIL: partial flag', r.partial); process.exitCode = 1; }
  console.log(bad < 0 ? 'REPLAY CHECK OK: every recorded view equals the view the game showed' : `REPLAY CHECK FAIL at step ${bad} (got ${got.length}, expected ${exp.length})`);
  if (bad >= 0) process.exitCode = 1;
  console.log('REPLAY_ID=' + id);
}
console.log('human actions', acts, 'hex clicks', hexClicks, 'covered picks (API)', hexApi, JSON.stringify(covers), 'undos', undos, 'decisions by kind', JSON.stringify(stats), 'minutes', ((Date.now() - t0) / 60e3).toFixed(1));
console.log([...new Set(errs)].filter((e) => !e.includes('GPU stall') && !e.includes('THREE.Clock')).slice(0, 30).join('\n'));
await page.screenshot({ path: 'build/e2e_end.png' });
await browser.close();
