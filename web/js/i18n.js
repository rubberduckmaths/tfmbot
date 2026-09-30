// i18n.js -- UI language: t(key, params), plurals, numbers.
//
// English is built in (web/i18n/en.json, bundled); every other language is a
// JSON bundle fetched on demand next to it (web/i18n/<lang>.json, plus the
// card texts in web/i18n/cards/<lang>.json), so only the active language
// ever loads. Keys missing from a bundle fall back to English.
//
//   t('log.played', { who, card })      "{who} played {card}"
//   t('hand.count', { n: 3 })           plural: { "one": "{n} card", "other": "{n} cards" }
//                                       (categories from Intl.PluralRules: zero one two few many other)
//   tl('boot.msgs')                     an array value
//
// The language comes from ?lang=xx (testing; not stored), else the stored
// choice, else the browser's navigator.languages, else English.
import EN from '../i18n/en.json' with { type: 'json' };

export const LANGS = [
  ['en', 'English'], ['es', 'Español'], ['fr', 'Français'], ['de', 'Deutsch'], ['it', 'Italiano'],
  ['pt-BR', 'Português (Brasil)'], ['nl', 'Nederlands'], ['pl', 'Polski'], ['tr', 'Türkçe'], ['ru', 'Русский'],
  ['uk', 'Українська'], ['zh-CN', '简体中文'], ['ja', '日本語'], ['ko', '한국어'], ['id', 'Bahasa Indonesia'],
  ['ms', 'Bahasa Melayu'], ['fil', 'Filipino'], ['vi', 'Tiếng Việt'], ['th', 'ไทย'], ['hi', 'हिन्दी'], ['bn', 'বাংলা'],
  ['zh-TW', '繁體中文'], ['pt-PT', 'Português (Portugal)'], ['cs', 'Čeština'], ['sk', 'Slovenčina'], ['hu', 'Magyar'],
  ['ro', 'Română'], ['el', 'Ελληνικά'], ['bg', 'Български'], ['sv', 'Svenska'], ['da', 'Dansk'],
  ['nb', 'Norsk bokmål'], ['fi', 'Suomi'], ['ca', 'Català'], ['hr', 'Hrvatski'], ['ar', 'العربية'], ['he', 'עברית'],
  ['fa', 'فارسی'], ['ur', 'اردو'], ['sw', 'Kiswahili'], ['am', 'አማርኛ'], ['ha', 'Hausa'], ['yo', 'Yorùbá'],
  ['zu', 'isiZulu'], ['af', 'Afrikaans'], ['ta', 'தமிழ்'], ['te', 'తెలుగు'], ['mr', 'मराठी'], ['gu', 'ગુજરાતી'],
  ['kn', 'ಕನ್ನಡ'], ['ml', 'മലയാളം'], ['pa', 'ਪੰਜਾਬੀ'], ['ne', 'नेपाली'], ['si', 'සිංහල'], ['my', 'မြန်မာ'],
  ['km', 'ខ្មែរ'], ['lo', 'ລາວ'], ['lt', 'Lietuvių'], ['lv', 'Latviešu'], ['et', 'Eesti'], ['sl', 'Slovenščina'],
  ['sr', 'Српски'], ['sq', 'Shqip'], ['mk', 'Македонски'], ['is', 'Íslenska'], ['eu', 'Euskara'], ['gl', 'Galego'],
  ['cy', 'Cymraeg'], ['ga', 'Gaeilge'], ['ka', 'ქართული'], ['hy', 'Հայերեն'], ['az', 'Azərbaycanca'],
  ['kk', 'Қазақша'], ['uz', 'Oʻzbekcha'], ['mn', 'Монгол'],
];
const CODES = LANGS.map(([c]) => c);
// per-script fonts, loaded only while that language is active (Rajdhani has no Cyrillic or CJK;
// Inter has Cyrillic but no CJK)
const FONTS = {
  ru: { css: 'Roboto+Condensed:wght@500;600;700', fd: "'Roboto Condensed'" },
  uk: { css: 'Roboto+Condensed:wght@500;600;700', fd: "'Roboto Condensed'" },
  'zh-CN': { css: 'Noto+Sans+SC:wght@400;500;700', fd: "'Noto Sans SC'", fb: "'Noto Sans SC'" },
  ja: { css: 'Noto+Sans+JP:wght@400;500;700', fd: "'Noto Sans JP'", fb: "'Noto Sans JP'" },
  ko: { css: 'Noto+Sans+KR:wght@400;500;700', fd: "'Noto Sans KR'", fb: "'Noto Sans KR'" },
  'zh-TW': { css: 'Noto+Sans+TC:wght@400;500;700', fd: "'Noto Sans TC'", fb: "'Noto Sans TC'" },
  bg: { css: 'Roboto+Condensed:wght@500;600;700', fd: "'Roboto Condensed'" },
  el: { css: 'Roboto+Condensed:wght@500;600;700', fd: "'Roboto Condensed'" },
  vi: { css: 'Roboto+Condensed:wght@500;600;700', fd: "'Roboto Condensed'" },
  th: { css: 'Noto+Sans+Thai:wght@400;500;700', fd: "'Noto Sans Thai'", fb: "'Noto Sans Thai'" },
  hi: { css: 'Noto+Sans+Devanagari:wght@400;500;700', fd: "'Noto Sans Devanagari'", fb: "'Noto Sans Devanagari'" },
  bn: { css: 'Noto+Sans+Bengali:wght@400;500;700', fd: "'Noto Sans Bengali'", fb: "'Noto Sans Bengali'" },
  ar: { css: 'Noto+Sans+Arabic:wght@400;500;700', fd: "'Noto Sans Arabic'", fb: "'Noto Sans Arabic'" },
  fa: { css: 'Noto+Sans+Arabic:wght@400;500;700', fd: "'Noto Sans Arabic'", fb: "'Noto Sans Arabic'" },
  he: { css: 'Noto+Sans+Hebrew:wght@400;500;700', fd: "'Noto Sans Hebrew'", fb: "'Noto Sans Hebrew'" },
  ur: { css: 'Noto+Nastaliq+Urdu:wght@400;500;700', fd: "'Noto Nastaliq Urdu'", fb: "'Noto Nastaliq Urdu'" },
  am: { css: 'Noto+Sans+Ethiopic:wght@400;500;700', fd: "'Noto Sans Ethiopic'", fb: "'Noto Sans Ethiopic'" },
  ta: { css: 'Noto+Sans+Tamil:wght@400;500;700', fd: "'Noto Sans Tamil'", fb: "'Noto Sans Tamil'" },
  te: { css: 'Noto+Sans+Telugu:wght@400;500;700', fd: "'Noto Sans Telugu'", fb: "'Noto Sans Telugu'" },
  mr: { css: 'Noto+Sans+Devanagari:wght@400;500;700', fd: "'Noto Sans Devanagari'", fb: "'Noto Sans Devanagari'" },
  ne: { css: 'Noto+Sans+Devanagari:wght@400;500;700', fd: "'Noto Sans Devanagari'", fb: "'Noto Sans Devanagari'" },
  gu: { css: 'Noto+Sans+Gujarati:wght@400;500;700', fd: "'Noto Sans Gujarati'", fb: "'Noto Sans Gujarati'" },
  kn: { css: 'Noto+Sans+Kannada:wght@400;500;700', fd: "'Noto Sans Kannada'", fb: "'Noto Sans Kannada'" },
  ml: { css: 'Noto+Sans+Malayalam:wght@400;500;700', fd: "'Noto Sans Malayalam'", fb: "'Noto Sans Malayalam'" },
  pa: { css: 'Noto+Sans+Gurmukhi:wght@400;500;700', fd: "'Noto Sans Gurmukhi'", fb: "'Noto Sans Gurmukhi'" },
  si: { css: 'Noto+Sans+Sinhala:wght@400;500;700', fd: "'Noto Sans Sinhala'", fb: "'Noto Sans Sinhala'" },
  my: { css: 'Noto+Sans+Myanmar:wght@400;500;700', fd: "'Noto Sans Myanmar'", fb: "'Noto Sans Myanmar'" },
  km: { css: 'Noto+Sans+Khmer:wght@400;500;700', fd: "'Noto Sans Khmer'", fb: "'Noto Sans Khmer'" },
  lo: { css: 'Noto+Sans+Lao:wght@400;500;700', fd: "'Noto Sans Lao'", fb: "'Noto Sans Lao'" },
  ka: { css: 'Noto+Sans+Georgian:wght@400;500;700', fd: "'Noto Sans Georgian'", fb: "'Noto Sans Georgian'" },
  hy: { css: 'Noto+Sans+Armenian:wght@400;500;700', fd: "'Noto Sans Armenian'", fb: "'Noto Sans Armenian'" },
  sr: { css: 'Roboto+Condensed:wght@500;600;700', fd: "'Roboto Condensed'" },
  mk: { css: 'Roboto+Condensed:wght@500;600;700', fd: "'Roboto Condensed'" },
  kk: { css: 'Roboto+Condensed:wght@500;600;700', fd: "'Roboto Condensed'" },
  mn: { css: 'Roboto+Condensed:wght@500;600;700', fd: "'Roboto Condensed'" },
  az: { css: 'Roboto+Condensed:wght@500;600;700', fd: "'Roboto Condensed'" },
  yo: { css: 'Roboto+Condensed:wght@500;600;700', fd: "'Roboto Condensed'" },
  ha: { css: 'Roboto+Condensed:wght@500;600;700', fd: "'Roboto Condensed'" },
};
// legacy / sibling tags that should land on a supported language
const ALIAS = { in: 'id', iw: 'he', tl: 'fil', no: 'nb', nn: 'nb', zsm: 'ms' };
// right-to-left scripts: <html dir=rtl> (app.css mirrors the HTML chrome, never the canvas / card art)
const RTL = new Set(['ar', 'he', 'fa', 'ur']);

let lang = 'en', dict = EN, cards = null;
const subs = new Set();
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};

// the best supported language for a list of BCP 47 tags ("pt-PT" -> pt-BR, "zh-Hans-CN" -> zh-CN)
export function matchLang(list) {
  for (const raw of list || []) {
    const tag = String(raw || '').toLowerCase();
    if (!tag) continue;
    const exact = CODES.find((c) => c.toLowerCase() === tag);
    if (exact) return exact;
    const base = ALIAS[tag.split('-')[0]] || tag.split('-')[0];
    if (base === 'zh') return /hant|tw|hk|mo/.test(tag) ? 'zh-TW' : 'zh-CN';
    if (base === 'pt') return /-(pt|ao|mz|cv|gw|st|tl)\b/.test(tag) ? 'pt-PT' : 'pt-BR';
    const b = CODES.find((c) => c.split('-')[0] === base);
    if (b) return b;
  }
  return null;
}
export function detectLang() {
  let q = null;
  try { q = new URLSearchParams(location.search).get('lang'); } catch {}
  return matchLang([q]) || matchLang([store.get('lang')]) || matchLang(typeof navigator !== 'undefined' ? (navigator.languages?.length ? navigator.languages : [navigator.language]) : []) || 'en';
}

export const getLang = () => lang;
export const isEnglish = () => lang === 'en';

const prCache = new Map();
function pluralCat(n) {
  let pr = prCache.get(lang);
  if (!pr) { try { pr = new Intl.PluralRules(lang); } catch { pr = new Intl.PluralRules('en'); } prCache.set(lang, pr); }
  return pr.select(Math.abs(+n || 0));
}
const nfCache = new Map();
export function fmtNum(n) {
  let nf = nfCache.get(lang);
  if (!nf) { try { nf = new Intl.NumberFormat(lang); } catch { nf = new Intl.NumberFormat('en'); } nfCache.set(lang, nf); }
  return nf.format(n);
}

function pick(v, p) {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const n = p?.n ?? p?.count ?? 0;
    return v[+n === 0 && 'zero' in v ? 'zero' : pluralCat(n)] ?? v.other ?? v.one ?? '';
  }
  return v;
}
// numbers are inserted as they are ("4096", "-3"): locale grouping only through fmtNum where wanted
function fill(s, p) {
  if (!p || typeof s !== 'string') return s;
  return s.replace(/\{(\w+)\}/g, (m, k) => (p[k] != null ? String(p[k]) : m));
}
export function t(key, p) {
  let v = dict[key];
  if (v == null || (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length)) v = EN[key];
  if (v == null) return key;
  return fill(pick(v, p), p);
}
// a sentence about a player: languages whose verbs agree with the subject may give a
// "<key>.you" form for when {who} is the human ("Tú jugaste" / "TFMBot jugó")
export const tw = (key, p, you) => t(you && dict[key + '.you'] != null ? key + '.you' : key, p);
// does the key exist (in this language or English)?
export const has = (key) => dict[key] != null || EN[key] != null;
// a translated name for a proper noun kept in English elsewhere (milestones, awards, spaces...), else the name itself
export const tName = (prefix, name) => (name != null && has(prefix + name) ? t(prefix + name) : name);
// a tag's name on its own (icon tooltips): "tagn.<tag>" where a language inflects "tag.<tag>" for use inside phrases
export const tagName = (g) => (dict['tagn.' + g] != null ? t('tagn.' + g) : t('tag.' + g));
export function tl(key) { const v = dict[key]; return Array.isArray(v) && v.length ? v : (EN[key] || []); }
// "a, b and c"-style joins are not needed; items are joined with the language's list separator
export const tj = (arr) => arr.join(t('list.sep'));

// card texts for the active language (null in English): { "<English name>": { name, desc, actions, effects, vpText, orTitles } }
export const cardText = () => cards;

async function fetchJson(rel) {
  const r = await fetch(new URL(rel, import.meta.url));
  if (!r.ok) throw new Error(`${rel}: HTTP ${r.status}`);
  return r.json();
}

function applyFonts(code) {
  const f = FONTS[code], root = document.documentElement;
  root.style.setProperty('--fd', f?.fd ? `Rajdhani, ${f.fd}, sans-serif` : 'Rajdhani, sans-serif');
  root.style.setProperty('--fb', f?.fb ? `Inter, ${f.fb}, system-ui, sans-serif` : 'Inter, system-ui, sans-serif');
  if (!f) return;
  const id = 'font-' + code.toLowerCase();
  if (document.getElementById(id)) return;
  const l = document.createElement('link');
  l.id = id; l.rel = 'stylesheet'; l.href = `https://fonts.googleapis.com/css2?family=${f.css}&display=swap`;
  document.head.appendChild(l);
}

// the static page text: data-i18n (text), data-i18n-html, data-i18n-title, data-i18n-alt, data-i18n-ph (placeholder)
export function applyDom(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-html]')) el.innerHTML = t(el.dataset.i18nHtml);
  for (const el of root.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
  for (const el of root.querySelectorAll('[data-i18n-alt]')) el.alt = t(el.dataset.i18nAlt);
  for (const el of root.querySelectorAll('[data-i18n-ph]')) el.placeholder = t(el.dataset.i18nPh);
}

// load a language (UI + card bundles) and make it current; English needs no fetch.
// A bundle that fails to load leaves English in place.
export async function setLang(code, { persist = true } = {}) {
  code = matchLang([code]) || 'en';
  let d = EN, c = null;
  if (code !== 'en') {
    try { [d, c] = await Promise.all([fetchJson(`../i18n/${code}.json`), fetchJson(`../i18n/cards/${code}.json`).catch(() => null)]); }
    catch (e) { console.warn('i18n: could not load', code, e); code = 'en'; d = EN; c = null; }
  }
  lang = code; dict = d; cards = c;
  if (persist) store.set('lang', code);
  if (typeof document !== 'undefined') {
    document.documentElement.lang = code;
    document.documentElement.dir = RTL.has(code) ? 'rtl' : 'ltr';
    applyFonts(code);
    applyDom();
  }
  for (const f of subs) { try { f(code); } catch (e) { console.error(e); } }
  return code;
}
export const onLangChange = (f) => subs.add(f);

// first load: ?lang / stored choice / browser languages (the ?lang override is not stored)
export function initLang() {
  const q = (() => { try { return new URLSearchParams(location.search).get('lang'); } catch { return null; } })();
  return setLang(detectLang(), { persist: !q && !!store.get('lang') });
}
