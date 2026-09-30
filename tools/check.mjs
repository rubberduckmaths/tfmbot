// Quick health check: gallery + a game start; fails on shader/page errors.
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/usr/bin/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let bad = 0;
const base = process.env.URL || 'http://127.0.0.1:8080/';
for (const url of [base + '?gallery', base + '?new&fast&sims=32']) {
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  p.on('console', (m) => { if (m.type() === 'error' || /Shader Error|ERROR: \d/.test(m.text())) errs.push(m.text().slice(0, 300)); });
  p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  await p.goto(url);
  await p.waitForTimeout(9000);
  console.log(url, errs.length ? 'FAIL' : 'ok');
  errs.slice(0, 6).forEach((e) => console.log('   ', e));
  bad += errs.length;
  await p.close();
}
await b.close();
process.exit(bad ? 1 : 0);
