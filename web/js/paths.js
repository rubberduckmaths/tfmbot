// paths.js -- URLs resolved against this folder (js/). Kept at the top level on purpose: in development
// every module is its own file, in production they are all one bundle beside worker.js, and only a
// module in this folder resolves the same way in both.
export const WORKER_URL = new URL('./worker.js', import.meta.url);

// where TFMBot answers: the page's <meta name="tfmbot-api"> (index.html), relative to the page. The default
// "api/" is the same site; a copy of the client hosted elsewhere can point it at https://tfmbot.com/api/
// (the bot and the win-chance meter accept other sites)
export const API_BASE = new URL(document.querySelector('meta[name="tfmbot-api"]')?.content || 'api/', location.href);
export const apiUrl = (path) => new URL(path, API_BASE).href;
