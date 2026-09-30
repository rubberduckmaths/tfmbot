// dom.js -- the small DOM helpers the UI modules share.
export const $ = (s, el = document) => el.querySelector(s);
// an element with a class and inner HTML (callers escape any text they put in it: esc)
export const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
