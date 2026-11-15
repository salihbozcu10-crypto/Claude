// Haritayı başsız tarayıcıda çizer ve ekran görüntüsü alır (geliştirme aracı)
import { build } from 'esbuild';
import { writeFileSync } from 'node:fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const S = process.argv[2]; const shots = JSON.parse(process.argv[3] || '[]');
const r = await build({ entryPoints: ['tools/viewtest-entry.js'], bundle: true, format: 'iife', write: false, loader: { '.json': 'json' } });
writeFileSync(S + '/viewtest.html', `<!doctype html><meta charset=utf-8><style>html,body{margin:0;height:100%;overflow:hidden;background:#000}canvas{display:block;width:100vw;height:100vh}</style><canvas id=c></canvas><script>${r.outputFiles[0].text.replace(/<\/script/g, '<\\/script')}</script>`);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--disable-gpu-watchdog'] });
const page = await (await browser.newContext({ viewport: { width: +(process.argv[4] || 1280), height: +(process.argv[5] || 720) } })).newPage();
page.on('console', (m) => console.log('[c]', m.text().slice(0, 300))); page.on('pageerror', (e) => console.log('[pe]', e.message));
const t0 = Date.now(); await page.goto('file://' + S + '/viewtest.html'); await page.waitForFunction(() => window.__ready, null, { timeout: 240000 }); console.log('hazır', Date.now() - t0, 'ms');
for (const [i, s] of shots.entries()) { await page.evaluate((s) => window.__shot(s), s); await page.waitForTimeout(200); await page.screenshot({ path: `${S}/v${i}.jpg`, type: 'jpeg', quality: 86, timeout: 120000 }); console.log('görüntü', i); }
await browser.close();
