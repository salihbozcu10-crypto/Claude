// Başsız Chromium ile oyunu açıp ekran görüntüsü alır (geliştirme aracı).
//   node tools/shot.mjs --out a.png [--hash dbg] [--w 1280 --h 720] [--eval "js"] [--wait 1000] [--ready "__ready"]
import { createRequire } from 'module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const a = process.argv.slice(2); const opt = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : d; };
const W = +opt('w', 1280), H = +opt('h', 720);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--autoplay-policy=no-user-gesture-required', '--disable-gpu-watchdog', '--disable-hang-monitor'] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: +opt('dpr', 1), hasTouch: a.includes('--touch'), isMobile: a.includes('--touch') });
const page = await ctx.newPage();
const logs = [];
page.on('console', (m) => { const t = m.text(); if (!/GPU stall|GL Driver Message/.test(t)) logs.push(`[${m.type()}] ${t}`); });
page.on('pageerror', (e) => logs.push('[pageerror] ' + (e.stack || e.message)));
const hash = opt('hash', '');
await page.goto('file://' + resolve(root, 'index.html') + (hash ? '#' + hash : ''));
const ready = opt('ready', '__ready');
try { await page.waitForFunction((r) => !!window[r], ready, { timeout: +opt('timeout', 180000) }); } catch (e) { logs.push('[shot] hazır sinyali gelmedi: ' + e.message.split('\n')[0]); }
await page.evaluate(() => window.__sv && window.__sv.testPause && window.__sv.testPause(true));
await page.waitForTimeout(400);
const evals = []; a.forEach((v, i) => { if (v === '--eval') evals.push(a[i + 1]); });
const outs = []; a.forEach((v, i) => { if (v === '--out') outs.push(a[i + 1]); });
// Her --eval sonrasında sıradaki --out dosyasına görüntü alınır
const n = Math.max(evals.length, outs.length, 1);
for (let i = 0; i < n; i++) {
  if (evals[i]) { try { const r = await page.evaluate(evals[i]); if (r !== undefined) console.log('eval>', typeof r === 'string' ? r : JSON.stringify(r)); } catch (e) { logs.push('[eval error] ' + e.message); } }
  if (!a.includes('--norender')) { try { const ms = await page.evaluate((n) => window.__sv && window.__sv.renderOnce ? window.__sv.renderOnce(n) : -1, +opt('frames', 1)); if (ms >= 0) console.log('render ms', ms); } catch (e) { logs.push('[render error] ' + e.message); } }
  await page.waitForTimeout(+opt('wait', 300));
  if (outs[i]) await page.screenshot({ timeout: 240000, path: outs[i], type: outs[i].endsWith('.jpg') ? 'jpeg' : 'png', quality: outs[i].endsWith('.jpg') ? 88 : undefined });
}
if (logs.length) console.log(logs.slice(0, +opt('logs', 40)).join('\n'));
await browser.close();
