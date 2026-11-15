// Uçtan uca oyun denemesi (başsız Chromium): menü, ülke seçimi, asker, savaş ilanı, saldırı, turlar, telefon görünümü
//   node tools/playtest.mjs <çıktı-klasörü> [desktop|phone|both]
import { createRequire } from 'module';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const OUT = resolve(process.argv[2] || '.'); const which = process.argv[3] || 'both';
const url = 'file://' + resolve('index.html');
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--disable-gpu-watchdog', '--ignore-gpu-blocklist'] });
const errors = [];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function open(opts, tag) {
  const ctx = await browser.newContext(opts); const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(`[${tag} ${m.type()}]`, m.text().slice(0, 300)); });
  page.on('pageerror', (e) => { errors.push(`${tag}: ${e.message}`); console.log(`[${tag} HATA]`, e.message, e.stack?.split('\n').slice(0, 3).join(' | ')); });
  const t0 = Date.now(); await page.goto(url);
  await page.waitForFunction(() => window.__ready && window.__app?.state === 'title', null, { timeout: 300000 });
  console.log(tag, 'hazır', Date.now() - t0, 'ms');
  let n = 0; const shot = async (name) => { await page.screenshot({ path: `${OUT}/${tag}-${String(++n).padStart(2, '0')}-${name}.jpg`, type: 'jpeg', quality: 82, timeout: 120000 }); console.log(tag, 'görüntü', name); };
  return { ctx, page, shot };
}
// harita noktasını ekrana çevir
const screenOf = (page, p) => page.evaluate((p) => { const a = window.__app; const pr = a.world.provinces[p]; const s = a.view.project(pr.ax, pr.ay); return { x: s.x, y: s.y }; }, p);
const closePopups = async (page) => { for (let i = 0; i < 6; i++) { const b = await page.$('#modal:not([hidden]) #pu-ok, #modal:not([hidden]) #tm-ok, #modal:not([hidden]) #go-cont, #modal:not([hidden]) #go-new'); if (!b) break; await b.click(); await wait(300); } };

async function desktop() {
  const { ctx, page, shot } = await open({ viewport: { width: 1280, height: 760 } }, 'pc');
  await wait(1500); await shot('baslik');
  await page.click('#btn-new'); await wait(2200); await shot('secim');
  await page.click('#sel-chips .chip'); await wait(2200); await shot('kart');
  await page.click('#btn-start'); await wait(2600); await shot('oyun');
  // başkenti seç, asker topla
  const info = await page.evaluate(() => { const a = window.__app, st = a.st; const c = st.countries[st.player]; return { cap: c.capital, name: c.name }; });
  let s = await screenOf(page, info.cap); await page.mouse.click(s.x, s.y); await wait(900); await shot('panel');
  await page.click('[data-rec="5000"]'); await wait(400);
  // komşu yabancı eyalet bul: kendi eyaletimiz + karşı ülke
  const pair = await page.evaluate(() => { const a = window.__app, st = a.st, P = st.player; let best = null; for (const p of st.provsOf[P]) for (const e of a.world.provinces[p].nb) { const o = st.owner[e.p]; if (o !== P && !e.sea && !e.long) { const sc = st.troops[p] - st.troops[e.p] * st.defenseMod(e.p); if (!best || sc > best.sc) best = { from: p, to: e.p, o, sc }; } } return best; });
  console.log('hedef', JSON.stringify(pair));
  // hedefe odaklan
  await page.evaluate((p) => { const a = window.__app, pr = a.world.provinces[p]; a.view.flyTo(pr.ax, pr.ay, a.view.minDist * 2.6, 0.01); }, pair.to); await wait(700);
  s = await screenOf(page, pair.to); await page.mouse.click(s.x, s.y); await wait(700); await shot('yabanci');
  await page.click('[data-dip="war"]'); await wait(500); await shot('savas-onay');
  await page.click('#cf-ok'); await wait(900); await shot('savas-ilan');
  // kendi eyaletinden saldır
  s = await screenOf(page, pair.from); await page.mouse.click(s.x, s.y); await wait(500);
  await page.click('[data-rec="5000"]').catch(() => {}); await wait(300);
  s = await screenOf(page, pair.to); await page.mouse.click(s.x, s.y); await wait(700); await shot('saldiri-penceresi');
  await page.click('#mv-q [data-q="1"]'); await page.click('#mv-ok'); await wait(500); await shot('emir');
  // tur sonu animasyonu
  await page.click('#endturn');
  await page.waitForFunction(() => window.__app.ovl.marches.some((m) => m.player && m.t - m.delay > m.dur * 0.55), null, { timeout: 60000 }).catch(() => console.log('yürüyüş yakalanamadı')); await shot('yuruyus');
  await page.waitForFunction(() => window.__app.ovl.markers.length > 0, null, { timeout: 60000 }).catch(() => console.log('çarpışma yakalanamadı')); await page.waitForFunction(() => window.__app.ovl.markers.some((m) => m.t > 0.35), null, { timeout: 30000 }).catch(() => {}); await shot('carpisma');
  await page.waitForFunction(() => !window.__app.busy, null, { timeout: 60000 }).catch(() => {}); await shot('sonuc');
  await page.waitForFunction(() => !window.__app.busy || document.querySelector('#modal:not([hidden])'), null, { timeout: 60000 }); await closePopups(page);
  // birkaç tur daha (otomatik)
  const t0 = Date.now();
  for (let i = 0; i < 12; i++) {
    await page.evaluate(() => { window.__app.endTurn(); });
    for (let k = 0; k < 200; k++) { await wait(150); await closePopups(page); const busy = await page.evaluate(() => window.__app.busy); if (!busy) break; }
  }
  console.log('12 tur', Date.now() - t0, 'ms');
  await shot('12-tur-sonra');
  await page.click('#btn-world'); await wait(800); console.log('dünya penceresi açık mı', await page.evaluate(() => !document.getElementById('modal').hidden), await page.evaluate(() => document.getElementById('modal-body').textContent.slice(0, 80))); await shot('dunya'); await page.click('#w-ok');
  await page.click('#btn-mode'); await wait(400); await page.click('#btn-mode'); await wait(500); await shot('diplomasi-modu'); await page.click('#btn-mode');
  // uzak görünüm ve yakın görünüm
  await page.evaluate(() => { const a = window.__app; a.select(0); a.view.flyTo(1500, 600, a.view.maxDist, 0.01); }); await wait(900); await shot('uzak');
  const st = await page.evaluate(() => { const a = window.__app, st = a.st; return { turn: st.turn, date: st.dateText, mine: st.provsOf[st.player].length, gold: Math.round(st.countries[st.player].gold), wars: st.enemiesOf(st.player).length, saved: !!localStorage.getItem('hukumranlik-kayit') }; });
  console.log('durum', JSON.stringify(st));
  // kayıttan devam
  await page.reload(); await page.waitForFunction(() => window.__ready && window.__app?.state === 'title', null, { timeout: 300000 }); await wait(500);
  const cont = await page.isVisible('#btn-continue'); console.log('devam düğmesi', cont);
  if (cont) { await page.click('#btn-continue'); await wait(2000); await shot('devam'); console.log('devam turu', await page.evaluate(() => window.__app.st.turn)); }
  await ctx.close();
}

async function phone() {
  const { ctx, page, shot } = await open({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true }, 'tel');
  await wait(1200); await shot('baslik');
  await page.tap('#btn-new'); await wait(2200); await shot('secim');
  await page.tap('#sel-chips .chip'); await wait(2200); await shot('kart');
  await page.tap('#btn-start'); await wait(2600); await shot('oyun');
  const cap = await page.evaluate(() => window.__app.st.countries[window.__app.st.player].capital);
  const s = await screenOf(page, cap); await page.touchscreen.tap(s.x, s.y); await wait(900); await shot('panel');
  await page.evaluate(() => { const a = window.__app, st = a.st, P = st.player; const p = st.countries[P].capital; for (const e of a.world.provinces[p].nb) if (st.owner[e.p] === P) { a.openMove(p, e.p); return; } }); await wait(600); await shot('pencere');
  await page.tap('#mv-cancel').catch(() => {}); await wait(300);
  await page.tap('#btn-world'); await wait(500); await shot('dunya'); await page.tap('#w-ok');
  await page.tap('#btn-menu'); await wait(400); await shot('menu'); await page.tap('#m-help'); await wait(400); await shot('yardim'); await page.tap('#h-ok');
  // telefonda tur sonu
  await page.tap('#endturn'); await page.waitForFunction(() => window.__app.ovl.marches.some((m) => m.t - m.delay > m.dur * 0.5), null, { timeout: 60000 }).catch(() => console.log('yürüyüş yok')); await shot('yuruyus');
  await page.waitForFunction(() => !window.__app.busy || !document.getElementById('modal').hidden, null, { timeout: 90000 }); await shot('tur-sonu');
  const off = await page.evaluate(() => [...document.querySelectorAll('#topbar > *')].filter((e) => { const r = e.getBoundingClientRect(); return r.right > innerWidth + 1 || r.left < -1; }).map((e) => e.id || e.className));
  console.log('ekran dışı üst şerit öğeleri', JSON.stringify(off));
  await ctx.close();
}

try { if (which !== 'phone') await desktop(); if (which !== 'desktop') await phone(); }
catch (e) { console.log('TEST HATASI', e.message); errors.push('test: ' + e.message); }
await browser.close();
console.log(errors.length ? `HATALAR (${errors.length}):\n` + errors.join('\n') : 'Sayfa hatası yok');
