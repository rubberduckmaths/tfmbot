// cards.js -- card metadata (engine ids + rules text) and card DOM rendering.
import { watchArt } from './card_art.js';
import { t, tj, tagName, cardText as cardTr } from '../i18n.js';
import { esc } from '../dom.js';
// Card texts by language (i18n.js loads web/i18n/cards/<lang>.json): the card
// objects keep their English name/description (the game logic and art read
// those); what is SHOWN comes from these helpers.
const TR = (card) => (card && cardTr()?.[card.name]) || null;
export const cardName = (card) => TR(card)?.name || card?.name || '?';
// (a translated card without "desc" has nothing but its requirement sentence, which the requirement line says)
export const cardDesc = (card) => { const x = TR(card); return x ? x.desc || '' : card?.description || ''; };
const arr = (card, k) => { const en = card?.[k] || [], x = TR(card)?.[k]; return Array.isArray(x) && x.length === en.length ? x : en; };
export const cardActions = (card) => arr(card, 'actions');
export const cardEffects = (card) => arr(card, 'effects');
export const cardOrTitles = (card) => arr(card, 'orTitles');
export const TAGS = ['building', 'space', 'power', 'science', 'jovian', 'earth', 'plant', 'microbe', 'animal', 'city', 'event', 'wild'];
export const RES = ['megacredit', 'steel', 'titanium', 'plant', 'power', 'heat'];
export const RES_LABEL = ['M€', 'steel', 'titanium', 'plants', 'energy', 'heat'];
const RES_KEY = { megacredits: 'megacredit', steel: 'steel', titanium: 'titanium', plants: 'plant', energy: 'power', heat: 'heat' };
export const CARD_RES_ICON = { 6: 'animal', 7: 'wild', 8: 'microbe', 9: 'science', 10: 'floater' };
export const TYPE_NAME = ['Corporation', 'Automated', 'Active', 'Event', 'Prelude'];

export class CardDB {
  constructor(engineCards, text) {
    this.cards = engineCards.map((c, id) => ({ id, ...c, ...(text[c.name] || {}) }));
    this.byName = new Map(this.cards.map((c) => [c.name, c]));
  }
  get(id) { return this.cards[id]; }
  name(id) { return this.cards[id]?.name ?? '?'; }        // English: the game logic compares these
  lname(id) { return cardName(this.cards[id]); }          // shown to the player
  // English and localized names -> card (the log's card chips; English names stay searchable)
  byAnyName(n) { return this.byName.get(n) || this.cards.find((c) => cardName(c) === n); }
}

// The requirement, said once, in brackets at the end of the card's text
// ("(Requires 1 plant, 1 microbe, 1 animal tag)"), built per language from
// req.* strings; the printed text's own leading requirement sentence is
// dropped so it isn't said twice (translated texts come without it).
const REQ_LEAD = /^\s*(Requires|It must be|Oxygen must be|Temperature must be)\b[^.]*\.\s*/;
const temp = (x) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x)} °C`;
function reqPart(r) {
  if ('temperature' in r) return t(r.max ? 'req.tempMax' : 'req.tempMin', { t: temp(r.temperature) });
  if ('oxygen' in r) return t(r.max ? 'req.oxyMax' : 'req.oxyMin', { n: r.oxygen });
  if ('oceans' in r) return t(r.max ? 'req.oceansMax' : 'req.oceansMin', { n: r.oceans });
  if ('production' in r) return t('req.prod', { res: t('req.res.' + r.production) });
  if ('greeneries' in r) return t('req.greeneries', { n: r.count });
  if ('cities' in r) return t(r.all ? 'req.citiesAll' : 'req.citiesOwn', { n: r.count });
  if ('tag' in r) return t('req.tags', { list: t('req.tagItem', { n: r.count || 1, tag: t('tag.' + r.tag) }), n: r.count || 1 });
  return '';
}
function reqLine(reqs) {
  const tags = reqs.filter((r) => 'tag' in r), parts = reqs.filter((r) => !('tag' in r)).map(reqPart).filter(Boolean);
  if (tags.length) {
    const one = tags.every((r) => (r.count || 1) === 1);
    parts.unshift(t('req.tags', { list: tj(tags.map((r) => t('req.tagItem', { n: r.count || 1, tag: t('tag.' + r.tag) }))), n: one ? 1 : 2 }));
  }
  return parts.length ? t('req.wrap', { list: tj(parts) }) : '';
}
function cardText(card) {
  const tr = TR(card);
  let d = tr ? tr.desc || '' : card.description || '';
  if (!(card.req || []).length) return d;
  if (!tr) {
    const lose = d.match(/^\s*Requires [^.]*? and that you lose (\d+) plants?\.\s*/);     // Kelp Farming-style: keep the cost
    d = lose ? t('req.lose', { n: lose[1] }) + ' ' + d.slice(lose[0].length) : d.replace(REQ_LEAD, '');
  }
  return `${d.trim()} ${reqLine(card.req)}`.trim();
}

const RES_ICON = { megacredits: 'megacredit', megacredit: 'megacredit', steel: 'steel', titanium: 'titanium', plants: 'plant', plant: 'plant', energy: 'power', heat: 'heat' };
function reqChip(r) {
  const mx = r.max ? `<i>${esc(t('card.max'))}</i>` : '';
  const img = (src, alt, cls) => `<img${cls ? ` class="${cls}"` : ''} src="${src}" alt="${alt}">`;
  if ('tag' in r) {
    const n = r.count || 1, ic = img(`assets/tags/${r.tag}.png`, r.tag);
    return n <= 3 ? ic.repeat(n) : `${n}${ic}`;
  }
  if ('temperature' in r) return `${mx}${img('assets/temperature.png', 'temperature', 'thermo')}${r.temperature}°`;
  if ('oxygen' in r) return `${mx}${img('assets/oxygen.png', 'oxygen')}${r.oxygen}%`;
  if ('oceans' in r) return `${mx}${img('assets/tiles/ocean.png', 'oceans')}${r.oceans}`;
  if ('greeneries' in r) return `${mx}${img('assets/tiles/greenery.png', 'greeneries')}${r.count}`;
  if ('cities' in r) return `${mx}${img('assets/tiles/city.png', 'cities')}${r.count}${r.all ? `<i>${esc(t('card.all'))}</i>` : ''}`;
  if ('production' in r) return `<span class="rprod">${img('assets/res/' + (RES_ICON[r.production] || r.production) + '.png', r.production)}</span>`;
  return esc(reqPart(r));
}

// "decrease ANY player's production" (Herbivores, Heat Trappers...): the
// board game's red-bordered box, from the engine's own card rules (card.atk)
function atkBox(atk) {
  if (!atk || !atk.length) return '';
  const parts = atk.map(([r, n]) => `<span style="color:#ff8a8a">−${n}</span><img src="assets/res/${RES[r]}.png" alt="">`);
  return `<div class="prodbox atk" title="${esc(t('card.atk'))}">${parts.join('')}</div>`;
}
// resources the card GIVES (not production), from the engine rules: resources
// added to cards and every alternative of an either/or -- a strip at the
// bottom of the card, "+3 plants / +3 microbes / +2 animals"
const GAIN_ICON = { 0: 'megacredit', 1: 'steel', 2: 'titanium', 3: 'plant', 4: 'power', 5: 'heat', 6: 'animal', 7: 'wild', 8: 'microbe', 9: 'science', 10: 'floater' };
function gainRow(gain) {
  if (!gain || !gain.length) return '';
  const item = ([r, n, , onCard]) => `<span class="gi${onCard ? ' oncard' : ''}" title="${esc(t(onCard === 2 ? 'card.toAny' : onCard === 1 ? 'card.toThis' : 'card.gain'))}">+${n}<img src="assets/res/${GAIN_ICON[r] || 'wild'}.png" alt=""></span>`;
  const plain = gain.filter((g) => !g[2]).map(item);
  const opts = {};
  for (const g of gain) if (g[2]) (opts[g[2]] ||= []).push(g);
  const choice = Object.values(opts).map((grp) => grp.map(item).join('')).join('<i>/</i>');
  return `<div class="gainrow" title="${esc(t('card.gains'))}">${[...plain, choice].filter(Boolean).join('<i>·</i>')}</div>`;
}
// own production straight from the engine rules when the card text has none
function ipProd(ip) {
  if (!ip || !ip.length) return null;
  const K = ['megacredits', 'steel', 'titanium', 'plants', 'energy', 'heat'];
  return Object.fromEntries(ip.map(([r, n]) => [K[r], n]));
}

function prodBox(prod) {
  if (!prod) return '';
  const parts = Object.entries(prod).filter(([k]) => RES_KEY[k]).map(([k, v]) =>
    typeof v === 'object'
      ? `<span title="${esc(JSON.stringify(v))}">+X</span><img src="assets/res/${RES_KEY[k]}.png" alt="">`
      : `<span style="color:${v < 0 ? '#ff8a8a' : '#fff'}">${v > 0 ? '+' : ''}${v}</span><img src="assets/res/${RES_KEY[k]}.png" alt="">`);
  return parts.length ? `<div class="prodbox" title="${esc(t('card.prod'))}">${parts.join('')}</div>` : '';
}

// Icon row for immediate effects, the way the physical cards print them.
const n1 = (v) => (typeof v === 'object' || v == null ? 'X' : v);
function effectRow(card) {
  const out = [];
  const chip = (html, cls = '') => out.push(`<span class="fxi ${cls}">${html}</span>`);
  if (card.tr) chip(`+${n1(card.tr)}<img src="assets/res/tr.png" alt="TR">`, 'tr');
  for (const [k, v] of Object.entries(card.stock || {})) if (RES_KEY[k]) chip(`${typeof v === 'number' && v < 0 ? '' : '+'}${n1(v)}<img src="assets/res/${RES_KEY[k]}.png" alt="">`);
  const g = card.global || {};
  if (g.temperature) chip(`${g.temperature > 1 ? g.temperature + '×' : ''}<img src="assets/temperature.png" alt="temperature">`, 'glob');
  if (g.oxygen) chip(`${g.oxygen > 1 ? g.oxygen + '×' : ''}<img src="assets/oxygen.png" alt="oxygen">`, 'glob');
  if (card.ocean) { const c = card.ocean.count || 1; chip(`${c > 1 ? c + '×' : ''}<img class="hex" src="assets/tiles/ocean.png" alt="ocean">`); }
  if (card.greenery) chip('<img class="hex" src="assets/tiles/greenery.png" alt="greenery">');
  if (card.city) chip('<img class="hex" src="assets/tiles/city.png" alt="city">');
  if (card.draw) chip(`${n1(card.draw) !== 1 ? n1(card.draw) + '×' : ''}<img src="assets/res/card.png" alt="card">`);
  return out.length ? `<div class="fxrow">${out.join('')}</div>` : '';
}

// opts: { big, resCount, used, discount, onClick }
// Text that would run past the card's bottom (Search For Life, Immigrant City on the small face) or under
// its VP badge shrinks just enough to fit -- only on the cards that need it, down to 60% (the phone hand). It needs layout to
// measure, so it runs once the card is on the page (a card shown later, e.g. in a hidden panel, is measured
// when it is first seen: fitText can be called again).
const FIT_MIN = 0.6;
function fitWhenShown(el, tries = 4) {
  requestAnimationFrame(() => {
    if (el.isConnected && el.offsetHeight) fitText(el);
    else if (tries > 0) setTimeout(() => fitWhenShown(el, tries - 1), 250);
  });
}
export function fitText(el) {
  const body = el.querySelector('.body');
  if (!body || !body.clientHeight) return;
  body.style.fontSize = '';
  const vp = el.querySelector('.vp');
  const reserve = vp ? vp.offsetHeight * 0.8 : 0;     // (the last line stays clear of the VP badge)
  // the text blocks' bottom (offsets: unaffected by the hand's scale transform); the art panel only fills spare room
  const kids = [...body.children].filter((k) => !k.classList.contains('art'));
  const over = () => Math.max(0, ...kids.map((k) => k.offsetTop + k.offsetHeight)) - body.offsetTop > body.clientHeight - reserve + 1;
  if (!over()) return;
  const base = parseFloat(getComputedStyle(body).fontSize);
  for (let k = 0.95; k >= FIT_MIN - 1e-6 && over(); k -= 0.05) body.style.fontSize = `${(base * k).toFixed(2)}px`;
}

export function cardEl(card, opts = {}) {
  const el = document.createElement('div');
  // crowded top strip (Advanced Ecosystems: 3 tag requirements + 3 tags): requirements drop to a row of their own
  const reqIcons = (card.req || []).reduce((n, r) => n + ('tag' in r ? Math.min(3, r.count || 1) : 2), 0);
  const crowd = reqIcons + (card.tags || []).length > 5;
  el.className = `card t${card.type}` + (opts.big ? ' big' : '') + (card.type === 0 ? ' corpc' : '') + (crowd ? ' crowd' : '');
  el.dataset.id = card.id;
  const tags = (card.tags || []).map((g) => `<img src="assets/tags/${TAGS[g]}.png" alt="${TAGS[g]}" title="${esc(tagName(TAGS[g]))}">`).join('');
  // requirements as small red-bordered icon chips (one chip per requirement)
  const reqs = (card.req || []).length ? `<div class="reqs">${card.req.map((r) => `<span class="req${r.max ? ' max' : ''}" title="${esc(t('card.requires', { what: reqPart(r) }))}">${reqChip(r)}</span>`).join('')}</div>` : '';
  let cost = '';
  if (card.type === 1 || card.type === 2 || card.type === 3) {
    const c = opts.discount ? Math.max(0, card.cost - opts.discount) : card.cost;
    cost = `<div class="cost${opts.discount ? ' disc' : ''}" title="${esc(t('card.cost'))}">${c}</div>`;
  } else if (card.type === 0) {
    cost = `<div class="cost" title="${esc(t('card.startMc'))}">${card.mc0}</div>`;
  }
  const fx = [
    ...cardActions(card).map((a) => `<div class="fx act"><b>${esc(t('card.action'))}</b> ${esc(a)}</div>`),
    ...cardEffects(card).map((a) => `<div class="fx"><b>${esc(t('card.effect'))}</b> ${esc(a)}</div>`),
  ].join('');
  let vp = '';
  if (card.hasvp && card.vp) vp = `<div class="vp" title="${esc(t('card.vp'))}">${card.vp}</div>`;
  else if (card.hasvp || card.vpText) vp = `<div class="vp var" title="${esc(arr(card, 'vpText').join(' '))}">VP*</div>`;
  const resn = opts.resCount != null ? `<div class="resn"><img src="assets/res/${CARD_RES_ICON[card.res] || 'wild'}.png" alt="">${opts.resCount}</div>` : '';
  el.innerHTML = `
    <div class="top">${cost}${reqs}<div class="ctags">${tags}</div></div>
    <div class="title">${esc(cardName(card))}</div>
    <div class="body"><div class="icons">${prodBox(card.prod || ipProd(card.ip))}${atkBox(card.atk)}${effectRow(card)}</div>${cardText(card) ? `<div class="desc">${esc(cardText(card))}</div>` : ''}${fx}${card.vpText && !card.description?.includes(card.vpText[0]) ? `<div class="desc"><i>${esc(arr(card, 'vpText').join(' '))}</i></div>` : ''}<div class="art"><i></i></div></div>
    ${gainRow(card.gain)}${vp}${resn}${opts.used ? `<div class="used">${esc(t('card.used'))}</div>` : ''}`;
  el.title = cardName(card) === card.name ? card.name : `${cardName(card)} · ${card.name}`;   // the English name stays findable
  el.dataset.name = card.name;
  watchArt(el.querySelector('.art'), card);            // a painted vignette in the spare space, where cards are shown large (card_art.js)
  fitWhenShown(el);
  if (opts.onClick) el.addEventListener('click', (e) => { e.stopPropagation(); opts.onClick(card, el); });
  return el;
}
