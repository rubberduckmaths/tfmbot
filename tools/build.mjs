// build.mjs -- production build of web/ into dist/ (serve dist/ from any static host).
//
//   dist/index.html            no-cache (tiny); points into the versioned tree
//   dist/v/<hash>/js/main.js   esbuild bundle (three.js tree-shaken, minified)
//   dist/v/<hash>/js/worker.js esbuild bundle of the engine worker
//   dist/v/<hash>/wasm/...     engine (.wasm renamed .bin: a CDN-cacheable extension)
//   dist/v/<hash>/css, data    everything code-like lives under the hash
//   dist/assets/...            images/icons (stable names, week-long cache)
//
// Everything under v/<hash>/ is immutable: a new build gets a new hash, so it
// can be cached forever by browsers and Cloudflare.
import { build } from 'esbuild';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const WEB = path.join(ROOT, 'web'), DIST = path.join(ROOT, 'dist');
const tmp = path.join(DIST, '.tmp');
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(tmp, { recursive: true });

const WASM_OUT = 'tfmweb.wasm.bin';
// the engine's own version: sent with every bot request, so a tab still running an older engine (the session
// layout can stay the same across engine changes) is told to reload (server.mjs: 409)
const WASM_HASH = crypto.createHash('sha256').update(fs.readFileSync(path.join(WEB, 'wasm/tfmweb.wasm'))).digest('hex').slice(0, 12);
const common = { bundle: true, format: 'esm', minify: true, target: 'es2022', legalComments: 'none', define: { __WASM_FILE__: JSON.stringify(WASM_OUT), __WASM_HASH__: JSON.stringify(WASM_HASH) }, logLevel: 'warning' };
await build({ ...common, entryPoints: [path.join(WEB, 'js/main.js')], outfile: path.join(tmp, 'js/main.js') });
await build({ ...common, entryPoints: [path.join(WEB, 'js/worker.js')], outfile: path.join(tmp, 'js/worker.js') });

const copy = (from, to) => { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to); };
copy(path.join(WEB, 'css/app.css'), path.join(tmp, 'css/app.css'));
copy(path.join(WEB, 'wasm/tfmweb.wasm'), path.join(tmp, 'wasm', WASM_OUT));
// language bundles (UI + card texts), fetched on demand by i18n.js relative to js/main.js
// (../i18n/<lang>.json); English is bundled into main.js, so en.json is not needed here
const i18nFiles = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? i18nFiles(path.join(d, e.name)) : e.name.endsWith('.json') ? [path.join(d, e.name)] : []));
for (const f of i18nFiles(path.join(WEB, 'i18n'))) {
  const rel = path.relative(path.join(WEB, 'i18n'), f);
  if (rel === 'en.json') continue;
  const to = path.join(tmp, 'i18n', rel);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.writeFileSync(to, JSON.stringify(JSON.parse(fs.readFileSync(f, 'utf8'))));   // minified (and a broken bundle fails the build)
}
// the emscripten glue is bundled into worker.js; nothing else needed from wasm/

// content hash of the whole versioned tree
const h = crypto.createHash('sha256');
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
for (const f of walk(tmp)) { h.update(path.relative(tmp, f)); h.update(fs.readFileSync(f)); }
const hash = h.digest('hex').slice(0, 12);
fs.mkdirSync(path.join(DIST, 'v'), { recursive: true });
fs.renameSync(tmp, path.join(DIST, 'v', hash));

// stable assets
fs.cpSync(path.join(WEB, 'assets'), path.join(DIST, 'assets'), { recursive: true });
copy(path.join(WEB, 'manifest.json'), path.join(DIST, 'manifest.json'));

// index.html
let html = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8');
const V = `v/${hash}`;
html = html
  .replace(/\s*<script type="importmap">[\s\S]*?<\/script>/, '')
  .replace('href="css/app.css"', `href="${V}/css/app.css"`)
  .replace('<script type="module" src="js/main.js"></script>', `<script type="module" src="${V}/js/main.js"></script>`)
  .replace('</head>', `<link rel="modulepreload" href="${V}/js/main.js">\n<link rel="modulepreload" href="${V}/js/worker.js">\n</head>`);
fs.writeFileSync(path.join(DIST, 'index.html'), html);
fs.writeFileSync(path.join(DIST, 'BUILD'), hash + '\n');
fs.writeFileSync(path.join(DIST, 'WASM'), WASM_HASH + '\n');

const size = (f) => fs.statSync(f).size;
const vt = path.join(DIST, V);
for (const f of walk(vt)) console.log(path.relative(DIST, f).padEnd(48), (size(f) / 1024).toFixed(1).padStart(8), 'KB');
console.log('build', hash);
