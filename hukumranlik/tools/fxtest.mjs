// Efekt denemesi: yürüyüş, çarpışma, savaş sonucu, diplomasi yayı ve mevsimleri dondurup görüntüler (başsız Chromium)
//   node tools/fxtest.mjs <çıktı-klasörü>
import { createRequire } from 'module';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const OUT = resolve(process.argv[2] || '.');
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--disable-gpu-watchdog', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 760 } })).newPage();
const errs = []; page.on('pageerror', (e) => { errs.push(e.message); console.log('[HATA]', e.message); });
await page.goto('file://' + resolve('index.html'));
await page.waitForFunction(() => window.__ready && window.__app?.state === 'title', null, { timeout: 300000 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = (n) => page.screenshot({ path: `${OUT}/fx-${n}.jpg`, type: 'jpeg', quality: 85, timeout: 120000 });
const freeze = (fn) => page.waitForFunction(`(() => { const a = window.__app; if ((${fn})(a)) { a.timeScale = 0; return true; } return false; })()`, null, { timeout: 120000, polling: 'raf' });
const thaw = () => page.evaluate(() => { window.__app.timeScale = 1; });
await wait(1200); await shot('0-baslik');
await page.click('#btn-new'); await wait(800); await page.click('#sel-chips .chip'); await wait(800); await page.click('#btn-start'); await wait(1500);
// güçlü saldırılar hazırla (üç komşu eyalete)
const info = await page.evaluate(() => {
  const a = window.__app, st = a.st, P = st.player; const targets = []; const used = new Set();
  for (const p of st.provsOf[P]) for (const e of a.world.provinces[p].nb) { const o = st.owner[e.p]; if (o !== P && !e.sea && !e.long && !used.has(e.p) && targets.length < 3) { used.add(e.p); targets.push({ from: p, to: e.p, o }); } }
  for (const t of targets) { if (!st.atWar(P, t.o)) st.declareWar(P, t.o); st.troops[t.from] += 60000; st.orders.push({ from: t.from, to: t.to, n: 60000, owner: P, sea: false }); }
  // bir saldırı da kaybedilsin (az asker)
  const t0 = targets[2]; st.orders[2].n = 300; st.troops[t0.to] += 20000;
  a.flushNews(); a.refresh(); a.updateTop();
  const pr = a.world.provinces[targets[0].to]; a.view.flyTo(pr.ax, pr.ay, a.view.minDist * 1.25, 0.01); return targets;
});
console.log('hedefler', JSON.stringify(info)); await wait(1500);
await page.evaluate(() => { window.__app.endTurn(); });
await freeze((a) => a.ovl.marches.some((m) => m.player && m.t - m.delay > m.dur * 0.55)); await shot('1-yuruyus'); await thaw();
await freeze((a) => a.ovl.battles.some((B) => B.t - B.delay > 0.8)); await shot('2-catisma'); await thaw();
await freeze((a) => a.ovl.battles.some((B) => B.t - B.delay > 1.6)); await shot('3-sonuc'); await thaw();
await page.waitForFunction(() => !window.__app.busy || !document.getElementById('modal').hidden, null, { timeout: 120000 });
await page.evaluate(() => { const a = window.__app; a.closeModal(); });
// diplomasi yayı
await page.evaluate(() => { const a = window.__app, st = a.st, P = st.player; const o = st.neighborsOf(P).find((x) => !st.atWar(P, x)) ?? 0; a.diploFx('ally', o); const pr = a.world.provinces[st.countries[P].capital]; a.view.flyTo(pr.ax, pr.ay, a.view.maxDist * 0.42, 0.01); });
await freeze((a) => a.ovl.arcs.some((A) => A.t > 1.1)); await shot('4-ittifak'); await thaw();
// mevsimler: ocak ve temmuz (arazi kipi, uzak)
await page.evaluate(() => { const a = window.__app; a.mode = 'terrain'; a.select(0); a.refresh(); a.st.month = 0; a.season = null; a.view.flyTo(1700, 420, a.view.maxDist * 0.62, 0.01); });
await wait(1500); await shot('5-ocak');
await page.evaluate(() => { const a = window.__app; a.st.month = 6; a.season = null; });
await wait(1500); await shot('6-temmuz');
console.log(errs.length ? 'HATALAR: ' + errs.join(' | ') : 'Sayfa hatası yok');
await browser.close();
