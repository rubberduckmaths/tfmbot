// serve.mjs -- development server: serves web/ as it is (no build step) and forwards the bot's API to
// tfmbot.com, so a local copy plays the same TFMBot as the site.
//   node tools/serve.mjs [port]          (default 8080; env API=https://tfmbot.com/api/ to change the bot's host)
// Only the bot and the win-chance meter are forwarded; the site's other endpoints (feedback, game logs,
// replays, error reports) answer 204 here and store nothing.
import http from 'http';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'web');
const PORT = +(process.argv[2] || process.env.PORT || 8080);
const API = new URL(process.env.API || 'https://tfmbot.com/api/');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.wasm': 'application/wasm', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.flac': 'audio/flac',
};

async function forward(req, res, rest) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try {
    const r = await fetch(new URL(rest, API), {
      method: req.method, body: req.method === 'POST' ? Buffer.concat(chunks) : undefined,
      headers: { 'content-type': req.headers['content-type'] || 'application/octet-stream', ...(req.headers['x-tw-layout'] ? { 'x-tw-layout': req.headers['x-tw-layout'] } : {}) },
    });
    res.writeHead(r.status, { 'content-type': r.headers.get('content-type') || 'application/json', 'cache-control': 'no-store' });
    res.end(Buffer.from(await r.arrayBuffer()));
  } catch (e) {
    res.writeHead(502).end(String(e.message || e));
  }
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    const rest = url.pathname.slice(5) + url.search;
    if (/^(bot|eval)\b/.test(rest)) return forward(req, res, rest);
    return res.writeHead(204).end();
  }
  const file = path.join(ROOT, path.normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, ''));
  const target = file.endsWith(path.sep) || !path.extname(file) ? path.join(file, 'index.html') : file;
  if (!target.startsWith(ROOT)) return res.writeHead(403).end();
  fs.readFile(target, (err, data) => {
    if (err) return res.writeHead(404).end('not found');
    res.writeHead(200, { 'content-type': TYPES[path.extname(target)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(data);
  });
}).listen(PORT, '127.0.0.1', () => console.log(`TFMBot client on http://127.0.0.1:${PORT}/  (bot: ${API.href})`));
