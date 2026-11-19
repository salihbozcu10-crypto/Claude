// Tek tarayıcı oturumunda birden çok önizleme sorgusunu render edip yan yana birleştirir.
//   node tools/sheet.mjs --out sheet.jpg --w 640 --h 360 --cols 2 "mode=char&name=defne&view=face" "mode=char&name=defne&view=back" ...
//   Sorgu sonuna @t=<sn> eklenebilir (zaman).
import { createRequire } from 'module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const a = process.argv.slice(2); const opt = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : d; };
const qs = a.filter((x, i) => !x.startsWith('--') && !(i > 0 && a[i - 1].startsWith('--')));
const W = +opt('w', 640), H = +opt('h', 360), cols = +opt('cols', 2);
const distDir = resolve(process.env.SYN_DIST ? resolve(root, process.env.SYN_DIST) : resolve(root, 'dist'));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--disable-gpu-watchdog'] });
const page = await (await browser.newContext({ viewport: { width: W * cols, height: H * Math.ceil(qs.length / cols) + 10 } })).newPage();
const logs = [];
page.on('console', (m) => { const t = m.text(); if (!/GPU stall|GL Driver|swiftshader|Automatic fallback/i.test(t)) logs.push(`[${m.type()}] ${t}`); });
page.on('pageerror', (e) => logs.push('[pageerror] ' + (e.stack || e.message)));
const first = qs[0].split('@')[0];
const t0 = Date.now();
await page.goto('file://' + resolve(distDir, 'index.html') + `?w=${W}&h=${H}&msaa=${opt('msaa', 4)}&render=1&` + first);
await page.waitForFunction(() => window.SYN && window.SYN.ready, null, { timeout: 300000 }).catch((e) => { console.log(logs.join('\n')); throw e; });
console.log('load', Date.now() - t0, 'ms');
const imgs = [];
for (const full of qs) {
  const [qq, tt] = full.split('@t=');
  const t1 = Date.now();
  const data = await page.evaluate(([qq, tt]) => { window.SYN.setQuery(qq); window.SYN.renderTime(+(tt || 0)); return document.getElementById('c').toDataURL('image/jpeg', 0.92); }, [qq, tt]);
  imgs.push(data); console.log(full, Date.now() - t1, 'ms');
}
const out = await page.evaluate(async ([imgs, W, H, cols]) => {
  const c = document.createElement('canvas'); c.width = W * cols; c.height = H * Math.ceil(imgs.length / cols);
  const g = c.getContext('2d');
  for (let i = 0; i < imgs.length; i++) { const im = new Image(); im.src = imgs[i]; await im.decode(); g.drawImage(im, (i % cols) * W, Math.floor(i / cols) * H, W, H); }
  return c.toDataURL('image/jpeg', 0.9);
}, [imgs, W, H, cols]);
(await import('node:fs')).writeFileSync(resolve(opt('out', 'sheet.jpg')), Buffer.from(out.split(',')[1], 'base64'));
if (logs.length) console.log(logs.slice(0, 30).join('\n'));
await browser.close();
