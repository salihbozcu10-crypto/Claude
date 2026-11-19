// Bölümün ses/altyazı ipuçlarını ve çekim listesini out/ klasörüne yazar.
import { createRequire } from 'module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
mkdirSync(resolve(root, 'out'), { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl'] });
const page = await (await browser.newContext({ viewport: { width: 64, height: 36 } })).newPage();
await page.goto('file://' + resolve(root, process.env.SYN_DIST || 'dist', 'index.html') + '?w=64&h=36&render=1&mode=episode');
await page.waitForFunction(() => window.SYN && window.SYN.ready, null, { timeout: 300000 });
const r = await page.evaluate(() => ({ cues: window.SYN.cues(), shots: window.SYN.shots(), duration: window.SYN.duration, fps: window.SYN.fps }));
writeFileSync(resolve(root, 'out/cues.json'), JSON.stringify(r.cues, null, 1));
writeFileSync(resolve(root, 'out/shots.json'), JSON.stringify({ duration: r.duration, fps: r.fps, shots: r.shots }, null, 1));
console.log('cues', r.cues.length, 'shots', r.shots.length, 'duration', r.duration);
await browser.close();
