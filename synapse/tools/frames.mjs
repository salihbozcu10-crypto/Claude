// Başsız Chromium ile kareleri render eder ve dosyaya yazar.
//   node tools/frames.mjs --from 0 --to 100 --out frames/ [--w 1920 --h 1080] [--step 1] [--fmt jpg|png] [--times 1.5,20,33]
//   --times verilirse yalnızca o saniyelerdeki kareler (inceleme için) <out>/t_<sn>.jpg olarak yazılır.
import { createRequire } from 'module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const a = process.argv.slice(2); const opt = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : d; };
const W = +opt('w', 1920), H = +opt('h', 1080);
const out = resolve(opt('out', 'frames')); mkdirSync(out, { recursive: true });
const fmt = opt('fmt', 'jpg'); const q = +opt('q', 0.95);
const skip = a.includes('--resume');
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--disable-gpu-watchdog', '--disable-hang-monitor', '--js-flags=--max-old-space-size=4096'] });
const page = await (await browser.newContext({ viewport: { width: Math.min(W, 1920), height: Math.min(H, 1080) } })).newPage();
const logs = [];
page.on('console', (m) => { const t = m.text(); if (!/GPU stall|GL Driver Message|swiftshader|Automatic fallback/i.test(t)) logs.push(`[${m.type()}] ${t}`); });
page.on('pageerror', (e) => logs.push('[pageerror] ' + (e.stack || e.message)));
const distDir = resolve(opt('dist', process.env.SYN_DIST ? resolve(root, process.env.SYN_DIST) : resolve(root, 'dist')));
await page.goto('file://' + resolve(distDir, 'index.html') + `?w=${W}&h=${H}&msaa=${opt('msaa', 4)}&render=1` + (opt('q') ? '&' + opt('q') : ''));
try { await page.waitForFunction(() => window.SYN && window.SYN.ready, null, { timeout: 300000 }); }
catch (e) { console.log(logs.join('\n')); throw e; }
const info = await page.evaluate(() => ({ fps: window.SYN.fps, duration: window.SYN.duration, frames: window.SYN.frames }));
const grab = async (i, file) => {
  const t0 = Date.now();
  const data = await page.evaluate(([i, fmt, q]) => { window.SYN.renderFrame(i); return document.getElementById('c').toDataURL(fmt === 'png' ? 'image/png' : 'image/jpeg', q); }, [i, fmt, q]);
  writeFileSync(file, Buffer.from(data.split(',')[1], 'base64'));
  return Date.now() - t0;
};
if (opt('times')) {
  for (const s of opt('times').split(',')) {
    const i = Math.round(parseFloat(s) * info.fps);
    const ms = await grab(i, resolve(out, `t_${parseFloat(s).toFixed(2)}.${fmt}`));
    console.log(`t=${s}s frame ${i} ${ms}ms`);
  }
} else {
  const from = +opt('from', 0), to = Math.min(+opt('to', info.frames - 1), info.frames - 1), step = +opt('step', 1);
  let tot = 0, n = 0;
  for (let i = from; i <= to; i += step) {
    const f = resolve(out, `f_${String(i).padStart(5, '0')}.${fmt}`);
    if (skip && existsSync(f)) continue;
    tot += await grab(i, f); n++;
    if (n % 24 === 0) console.log(`frame ${i}/${to}  avg ${(tot / n).toFixed(0)}ms`);
  }
  console.log(`done ${n} frames avg ${(tot / Math.max(1, n)).toFixed(0)}ms`);
}
if (logs.length) console.log(logs.slice(0, 40).join('\n'));
await browser.close();
