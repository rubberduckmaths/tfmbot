// main.js -- the page's entry point: error reporting, the UI language and the loading screen, then the
// App (app/app.js), which runs the game.
import { initLang } from './i18n.js';
import { boot, report } from './app/shared.js';
import { App } from './app/app.js';

// problems worth a human look go to the server's anomaly log
addEventListener('error', (e) => report('js-error', `${e.message} @ ${e.filename}:${e.lineno}`));
addEventListener('unhandledrejection', (e) => report('js-rejection', e.reason && (e.reason.stack || e.reason)));

// the UI language first (English is built in; any other bundle is one small fetch)
await initLang();
boot.start();
window.app = new App();
