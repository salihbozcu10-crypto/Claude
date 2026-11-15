// Efekt denemesi: yürüyüş, çarpışma ve fetih dalgasını dondurup görüntüler (başsız Chromium)
import { createRequire } from 'module';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const OUT = resolve(process.argv[2] || '.');
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--disable-gpu-watchdog', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 760 } })).newPage();
page.on('pageerror', (e) => console.log('[HATA]', e.message));
await page.goto('file://' + resolve('index.html'));
await page.waitForFunction(() => window.__ready && window.__app?.state === 'title', null, { timeout: 300000 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await page.click('#btn-new'); await wait(800); await page.click('#sel-chips .chip'); await wait(800); await page.click('#btn-start'); await wait(1500);
// güçlü bir saldırı hazırla: üç komşu eyalete aynı anda
const info = await page.evaluate(() => {
  const a = window.__app, st = a.st, P = st.player; const targets = []; const used = new Set();
  for (const p of st.provsOf[P]) for (const e of a.world.provinces[p].nb) { const o = st.owner[e.p]; if (o !== P && !e.sea && !e.long && !used.has(e.p) && targets.length < 3) { used.add(e.p); targets.push({ from: p, to: e.p, o }); } }
  for (const t of targets) { if (!st.atWar(P, t.o)) st.declareWar(P, t.o); st.troops[t.from] += 60000; st.orders.push({ from: t.from, to: t.to, n: 60000, owner: P, sea: false }); }
  a.flushNews(); a.refresh(); a.updateTop();
  const pr = a.world.provinces[targets[0].to]; a.view.flyTo(pr.ax, pr.ay, a.view.minDist * 1.6, 0.01); return targets;
});
console.log('hedefler', JSON.stringify(info)); await wait(1500);
await page.screenshot({ path: `${OUT}/fx-1-emirler.jpg`, type: 'jpeg', quality: 85 });
await page.evaluate(() => { window.__app.endTurn(); });
await page.waitForFunction(() => { const a = window.__app; if (a.ovl.marches.some((m) => m.player && m.t - m.delay > m.dur * 0.5)) { a.timeScale = 0; return true; } return false; }, null, { timeout: 120000, polling: 'raf' });
await page.screenshot({ path: `${OUT}/fx-2-yuruyus.jpg`, type: 'jpeg', quality: 85 });
await page.evaluate(() => { window.__app.timeScale = 1; });
await page.waitForFunction(() => { const a = window.__app; if (a.ovl.markers.some((m) => m.kind === 'swords' && m.t > 0.3)) { a.timeScale = 0; return true; } return false; }, null, { timeout: 120000, polling: 'raf' });
await page.screenshot({ path: `${OUT}/fx-3-carpisma.jpg`, type: 'jpeg', quality: 85 });
await page.evaluate(() => { window.__app.timeScale = 1; });
await page.waitForFunction(() => { const a = window.__app; if (a.ovl.markers.some((m) => m.kind === 'flag' && m.t > 0.9)) { a.timeScale = 0; return true; } return false; }, null, { timeout: 120000, polling: 'raf' });
await page.screenshot({ path: `${OUT}/fx-4-fetih.jpg`, type: 'jpeg', quality: 85 });
await page.evaluate(() => { window.__app.timeScale = 1; });
await page.waitForFunction(() => !window.__app.busy || !document.getElementById('modal').hidden, null, { timeout: 120000 });
await wait(800); await page.screenshot({ path: `${OUT}/fx-5-sonra.jpg`, type: 'jpeg', quality: 85 });
console.log('sahip', JSON.stringify(await page.evaluate((t) => t.map((x) => window.__app.st.owner[x.to] === window.__app.st.player), info)));
await browser.close();
