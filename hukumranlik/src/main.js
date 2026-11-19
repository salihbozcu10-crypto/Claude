// Hükümranlık — ana denetleyici: açılış, girdi, arayüz, tur animasyonu
import { generateWorld, MAP_VERSION } from './map/generate.js';
import { MapView } from './map/view.js';
import { Overlay } from './map/overlay.js';
import { Particles } from './fx/particles.js';
import { Sound } from './fx/audio.js';
import { assignColors } from './game/colors.js';
import { GameState, BUILD, TERRAIN, DIFF, fmt } from './game/state.js';
import { resolveTurn } from './game/turn.js';
import { BATTLE_RESOLVE } from './fx/figures.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SAVE_KEY = 'hukumranlik-kayit', SET_KEY = 'hukumranlik-ayarlar';
const loadJSON = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
const saveRaw = (k, v) => { try { localStorage.setItem(k, v); return true; } catch { return false; } };
const isTouch = (() => { try { return matchMedia('(pointer: coarse)').matches; } catch { return false; } })();
const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));
const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const tl = (n) => Math.round(n).toLocaleString('tr-TR');
// mevsimler: ay başına kuzey/güney kar sınırı ve deniz buzu enlemi (derece)
const SNOW_N = [46, 47, 51, 57, 63, 69, 72, 71, 65, 58, 52, 47], SNOW_S = [-70, -70, -66, -60, -54, -49, -47, -48, -52, -58, -64, -68];
const ICE_N = [61, 60, 62, 66, 70, 74, 77, 78, 75, 70, 66, 63], ICE_S = [-70, -72, -70, -66, -62, -60, -58, -57, -58, -60, -63, -67];
const easeOut3 = (t) => 1 - (1 - t) ** 3;
// yıl için doğru yönelme eki: 2026'ya, 2027'ye, 2028'e, 2030'a
const yearDat = (y) => { const o = y % 10, t = Math.floor(y / 10) % 10; if (o) return ["'e", "'e", "'ye", "'e", "'e", "'e", "'ya", "'ye", "'e", "'a"][o]; if (t) return ["", "'a", "'ye", "'a", "'a", "'ye", "'a", "'e", "'e", "'a"][t]; return "'e"; };

// ---------------------------------------------------------------- harita önbelleği (IndexedDB)
function idb() { return new Promise((res, rej) => { const r = indexedDB.open('hukumranlik', 1); r.onupgradeneeded = () => r.result.createObjectStore('w'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
async function cacheGet(key) { try { const db = await idb(); return await new Promise((res) => { const t = db.transaction('w').objectStore('w').get(key); t.onsuccess = () => res(t.result || null); t.onerror = () => res(null); }); } catch { return null; } }
async function cachePut(key, val) { try { const db = await idb(); await new Promise((res) => { const tx = db.transaction('w', 'readwrite'); tx.objectStore('w').clear(); tx.objectStore('w').put(val, key); tx.oncomplete = res; tx.onerror = res; tx.onabort = res; }); } catch { /* yoksay */ } }
async function getWorld(onProgress) {
  const key = 'dunya-' + MAP_VERSION;
  if (!/nocache/.test(location.hash)) { const c = await cacheGet(key); if (c && c.prov && c.meta) { onProgress(0.9, 'Harita yükleniyor'); return { ...c.meta, prov: c.prov, idTex: c.idTex, fieldTex: c.fieldTex, terrainRGBA: c.terrainRGBA }; } }
  const w = await generateWorld(onProgress);
  const meta = { version: w.version, W: w.W, H: w.H, P: w.P, TW: w.TW, TH: w.TH, provinces: w.provinces, countries: w.countries.map((c) => ({ id: c.id, ne: c.ne, name: c.name, short: c.short, capital: c.capital, provinces: c.provinces })) };
  cachePut(key, { meta, prov: w.prov, idTex: w.idTex, fieldTex: w.fieldTex, terrainRGBA: w.terrainRGBA });
  return w;
}

class App {
  constructor() {
    this.settings = { volume: 0.8, sfx: 0.9, music: 0.45, clouds: true, hq: !isTouch, ...(loadJSON(SET_KEY) || {}) };
    this.state = 'loading'; this.sel = 0; this.hover = 0; this.selCountry = -1; this.mode = 'political'; this.busy = false; this.time = 0; this.newsSeen = 0;
    this.pointers = new Map(); this.diffChoice = 'normal'; this.waiters = []; this.timeScale = 1; this.tweens = {}; this.season = null; this.needRefresh = false;
  }
  // animasyon saatine göre bekle (yavaş cihazda da yürüyüş ile çarpışma senkron kalır)
  animWait(sec) { return new Promise((r) => this.waiters.push({ t: this.time + sec, r })); }

  async boot() {
    const prog = (p, t) => { $('ld-bar').style.width = Math.round(p * 100) + '%'; if (t) $('ld-text').textContent = t + '…'; };
    let world;
    try { world = await getWorld(prog); } catch (e) { $('ld-text').textContent = 'Harita oluşturulamadı: ' + e.message; throw e; }
    prog(0.95, 'Grafik hazırlanıyor'); await wait(0.02);
    assignColors(world); this.world = world;
    try { this.view = new MapView($('map'), world); } catch (e) { $('ld-text').textContent = 'Bu cihazda WebGL 2 başlatılamadı. Güncel bir tarayıcıyla dene.'; throw e; }
    this.view.maxDpr = this.settings.hq ? 2 : 1.25; this.view.cloudsOn = this.settings.clouds; this.view.resize();
    this.st = new GameState(world); this.st.setup(0, 'normal');
    this.ovl = new Overlay($('ovl'), $('fxc'), this.view, this.st, { lite: isTouch }); this.ovl.computeLabels();
    // başlık harfleri tek tek belirsin
    for (const el of document.querySelectorAll('.logo')) { const txt = el.textContent; el.setAttribute('aria-label', txt); el.innerHTML = [...txt].map((ch, i) => `<span aria-hidden="true" style="--i:${i}">${ch}</span>`).join(''); }
    this.fx = new Particles(this.view, isTouch ? 0.6 : 1);
    this.snd = new Sound(this.settings);
    this.bindInput(); this.bindUI();
    this.refresh();
    addEventListener('resize', () => { this.view.resize(); this.ovl.resize(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.snd.suspend(); else this.snd.resume(); });
    this.showTitle();
    this.last = performance.now(); requestAnimationFrame((t) => this.loop(t));
    window.__app = this; window.__ready = true;
  }

  loop(t) {
    const raw = (t - this.last) / 1000, dt = Math.min(0.1, raw) * this.timeScale; this.last = t; this.time += dt;
    const v = this.view;
    if (this.waiters.length) this.waiters = this.waiters.filter((w) => { if (this.time >= w.t) { w.r(); return false; } return true; });
    if (this.state === 'title') { v.target.x += dt * 14; }
    // uyarlanır çözünürlük: kareler sürekli yavaşsa piksel yoğunluğu düşer (telefonda takılmayı önler)
    if (!navigator.webdriver && !document.hidden && raw < 0.25) {
      this.slow = raw > 0.026 ? (this.slow || 0) + 1 : Math.max(0, (this.slow || 0) - 3);
      if (this.slow > 75 && v.maxDpr > 0.7) { v.maxDpr = Math.max(0.7, Math.min(v.maxDpr, devicePixelRatio || 1) - 0.25); v.resize(); this.slow = 0; }
    }
    this.fx.update(dt);
    // mevsim: kar ve deniz buzu sınırları yeni aya doğru yavaşça kayar
    { const m = this.st.month, tgt = [SNOW_N[m], SNOW_S[m], ICE_N[m], ICE_S[m]]; if (!this.season) this.season = tgt.slice(); const k = 1 - Math.exp(-dt * 0.8); for (let i = 0; i < 4; i++) this.season[i] += (tgt[i] - this.season[i]) * k;
      v.uniforms.uSnow.value.set(this.season[0], this.season[1]); v.uniforms.uIce.value.set(this.season[2], this.season[3]); }
    if (this.needRefresh) { this.needRefresh = false; this.refresh(this.ovl.dispOwner || undefined); }
    this.stepTweens(dt);
    v.render(dt, this.time);
    // sabit katman yalnız bir şey değiştiğinde, hareketli katman yalnız canlandırma varken çizilir
    const camKey = v.target.x + v.target.y * 7.31 + v.dist * 13.7 + v.shake * 101; const moved = camKey !== this.camKey; this.camKey = camKey;
    const o = this.ovl; let ui = null;
    if (o.dirty || moved) { ui = this.uiState(); o.drawStatic(ui); o.dirty = false; }
    const dyn = o.hasDynamic() || (this.state === 'play' && (this.st.orders.length || this.preview));
    if (dyn || (o.dynShown && (moved || !dyn))) { o.drawDynamic(dt, this.time, ui || this.uiState()); o.dynShown = !!dyn; }
    if (this.state === 'play' && this.busy && this.marchDust) this.marchDust(dt);
    requestAnimationFrame((tt) => this.loop(tt));
  }

  uiState() {
    const st = this.st, P = st.player; const enemies = new Set(P >= 0 ? st.enemiesOf(P) : []);
    const committed = {}; for (const o of st.orders) committed[o.from] = (committed[o.from] || 0) + o.n;
    const playing = this.state === 'play' || this.state === 'over';
    const near = playing && this.sel && st.owner[this.sel] === P && !this.busy ? new Set(this.world.provinces[this.sel].nb.map((e) => e.p)) : null;
    return { mode: this.mode, sel: this.sel, selCountry: this.selCountry, counters: playing, near, orders: this.state === 'play' ? st.orders.map((o) => ({ ...o, attack: st.owner[o.to] !== o.owner })) : [], committed, enemies: playing ? enemies : null, preview: this.preview };
  }

  // ---------------------------------------------------------------- harita görsel durumu
  refresh(owner) {
    const st = this.st, v = this.view; owner = owner || st.owner; const P = st.player; const playing = this.state === 'play' || this.state === 'over';
    const targets = new Map(); if (this.sel && playing && owner[this.sel] === P && !this.busy) for (const e of this.world.provinces[this.sel].nb) { const o = owner[e.p]; if (o === P) targets.set(e.p, 4); else if (st.atWar(P, o)) targets.set(e.p, 8); }
    for (let p = 1; p <= st.P; p++) {
      const o = owner[p]; let col = st.countries[o].color;
      if (this.mode === 'diplomacy' && playing) col = o === P ? [214, 170, 72] : st.atWar(P, o) ? [196, 64, 48] : st.allied(P, o) ? [86, 170, 104] : st.truce[P * st.C + o] > 0 ? [96, 150, 180] : (() => { const r = st.relation(P, o); const k = (r + 100) / 200; return [Math.round(110 + 40 * k), Math.round(108 + 30 * k), Math.round(104 + 10 * k)]; })();
      let f = 0; if (p === this.sel) f |= 1; if (p === this.hover) f |= 2; f |= targets.get(p) || 0;
      if (playing) { if (o === P) f |= 16; else if (P >= 0 && st.atWar(P, o)) f |= 32; }
      if (this.state === 'select' && o === this.selCountry) f |= 1;
      v.setProvince(p, col, o, f);
    }
    if (this.ovl) this.ovl.dirty = true;
    v.uniforms.uPolitical.value = this.mode === 'terrain' ? 0.1 : this.mode === 'diplomacy' ? 0.78 : 0.62;
    v.commit();
  }

  // ---------------------------------------------------------------- girdi
  bindInput() {
    const cv = $('map'); const v = this.view;
    cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture?.(e.pointerId); this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t0: performance.now() }); v.fly = null; v.vel.set(0, 0); this.dragMoved = false; if (this.pointers.size === 2) this.pinch = this.pinchInfo(); this.snd.init(); });
    cv.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) { if (e.pointerType === 'mouse') this.onHover(e.clientX, e.clientY); return; }
      if (this.pointers.size === 1) {
        const a = v.screenToMap(p.x, p.y), b = v.screenToMap(e.clientX, e.clientY);
        if (Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > 7) this.dragMoved = true;
        if (a && b && this.dragMoved) { const dx = a.rawX - b.rawX, dy = a.y - b.y; v.target.x += dx; v.target.y += dy; const now = performance.now(); const dtm = Math.max(1, now - (p.lt || now - 16)) / 1000; v.vel.set(dx / dtm * 0.6, dy / dtm * 0.6); p.lt = now; }
      }
      p.x = e.clientX; p.y = e.clientY;
      if (this.pointers.size === 2 && this.pinch) { const q = this.pinchInfo(); v.distGoal = v.dist = Math.max(v.minDist, Math.min(v.maxDist, this.pinch.dist0 * this.pinch.d / q.d)); const a = v.screenToMap(this.pinch.mx, this.pinch.my), b = v.screenToMap(q.mx, q.my); if (a && b) { v.target.x += a.rawX - b.rawX; v.target.y += a.y - b.y; } this.pinch.mx = q.mx; this.pinch.my = q.my; this.dragMoved = true; }
    });
    const up = (e) => {
      const p = this.pointers.get(e.pointerId); if (!p) return; this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinch = null;
      if (!this.dragMoved && performance.now() - p.t0 < 450 && this.pointers.size === 0) this.onTap(e.clientX, e.clientY);
      if (this.dragMoved && performance.now() - (p.lt || 0) > 90) v.vel.set(0, 0);
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', (e) => { this.pointers.delete(e.pointerId); this.pinch = null; });
    cv.addEventListener('wheel', (e) => { e.preventDefault(); const k = Math.exp(Math.max(-60, Math.min(60, e.deltaY)) * 0.0028); const before = v.screenToMap(e.clientX, e.clientY); v.distGoal = Math.max(v.minDist, Math.min(v.maxDist, v.distGoal * k)); if (before) { const s = 1 - Math.min(1.6, 1 / k); v.target.x += (before.rawX - v.target.x) * s * 0.9; v.target.y += (before.y - v.target.y) * s * 0.9; } }, { passive: false });
    addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (e.key === 'Escape') { if (!$('modal').hidden && this.modalClosable) this.closeModal(); else this.select(0); }
      if ((e.key === 'Enter' || e.key === ' ') && this.state === 'play' && $('modal').hidden) { e.preventDefault(); this.endTurn(); }
      const k = v.dist * 0.08; if (e.key === 'ArrowLeft' || e.key === 'a') v.target.x -= k; if (e.key === 'ArrowRight' || e.key === 'd') v.target.x += k; if (e.key === 'ArrowUp' || e.key === 'w') v.target.y -= k; if (e.key === 'ArrowDown' || e.key === 's') v.target.y += k;
      if (e.key === '+' || e.key === '=') v.distGoal = Math.max(v.minDist, v.distGoal / 1.3); if (e.key === '-') v.distGoal = Math.min(v.maxDist, v.distGoal * 1.3);
      if (e.key === 'm' && this.state === 'play') this.cycleMode();
    });
  }
  pinchInfo() { const [a, b] = [...this.pointers.values()]; return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, dist0: this.view.dist }; }
  onHover(x, y) { if (this.busy) return; const p = this.view.pick(x, y); if (p !== this.hover) { this.hover = p; this.refresh(); $('map').style.cursor = p ? 'pointer' : 'grab'; } }

  onTap(x, y) {
    const p = this.view.pick(x, y); const st = this.st;
    if (this.state === 'select') { if (p) { this.selCountry = st.owner[p]; this.snd.play('select'); this.showSelCard(); this.refresh(); } return; }
    if (this.state !== 'play' || this.busy || !$('modal').hidden) return;
    const P = st.player;
    if (p && p === this.sel) { this.select(0); return; }
    if (this.sel && p && st.owner[this.sel] === P && st.edge(this.sel, p)) {
      const o = st.owner[p]; const avail = st.troops[this.sel] - st.committed(this.sel);
      if ((o === P || st.atWar(P, o)) && avail >= 100) { this.openMove(this.sel, p); return; }
    }
    this.select(p);
  }
  select(p, pan = true) { this.sel = p; this.selCountry = p ? this.st.owner[p] : -1; if (p) { this.snd.play('select'); const pr = this.world.provinces[p]; this.fx.ripple(pr.ax, pr.ay, this.st.countries[this.st.owner[p]].color); } this.refresh(); this.showPanel(); if (p && pan) this.ensureVisible(p); }
  // seçili eyalet panelin altında kaldıysa haritayı boş alana kaydır
  ensureVisible(p) {
    const panel = $('panel'); if (panel.hidden) return; const r = panel.getBoundingClientRect(); const v = this.view;
    const pr = this.world.provinces[p]; const s = v.project(pr.ax, pr.ay); const m = 36;
    if (!(s.x > r.left - m && s.x < r.right + m && s.y > r.top - m && s.y < r.bottom + m)) return;
    const wide = r.width > v.sw * 0.6; const tx = wide ? v.sw / 2 : (r.right + v.sw) / 2, ty = wide ? Math.max(120, r.top * 0.55) : v.sh / 2;
    const a = v.screenToMap(s.x, s.y), b = v.screenToMap(tx, ty); if (!a || !b) return;
    v.flyTo(v.target.x + (a.rawX - b.rawX), v.target.y + (a.y - b.y), v.dist, 0.45);
  }

  // ---------------------------------------------------------------- arayüz bağlama
  bindUI() {
    const click = (id, fn) => $(id).addEventListener('click', () => { this.snd.init(); this.snd.play('click'); fn(); });
    click('btn-new', () => this.startSelect());
    click('btn-continue', () => this.continueGame());
    click('btn-help', () => this.showHelp());
    click('btn-settings', () => this.showSettings());
    click('sel-back', () => this.showTitle());
    click('endturn', () => this.endTurn());
    click('btn-mode', () => this.cycleMode());
    click('btn-world', () => this.showWorld());
    click('btn-menu', () => this.showMenu());
    click('tb-country', () => { const c = this.st.countries[this.st.player]; this.view.flyTo(this.world.provinces[c.capital].ax, this.world.provinces[c.capital].ay, this.view.minDist * 3.2); this.select(c.capital); });
    $('sel-search').addEventListener('input', (e) => this.searchCountries(e.target.value));
    $('modal').addEventListener('click', (e) => { if (e.target.id === 'modal' && this.modalClosable) this.closeModal(); });
  }

  // ---------------------------------------------------------------- ekranlar
  hideScreens() { for (const id of ['loading', 'title', 'select']) $(id).hidden = true; $('hud').hidden = true; }
  showTitle() {
    this.state = 'title'; this.hideScreens(); $('title').hidden = false; this.closeModal(); this.select(0);
    $('btn-continue').hidden = !loadJSON(SAVE_KEY);
    this.view.flyTo(1450, 560, this.view.maxDist * 0.85, 2.2); this.view.cloudsOn = this.settings.clouds; this.refresh();
  }
  startSelect() {
    this.state = 'select'; this.hideScreens(); $('select').hidden = false; $('sel-card').hidden = true; $('sel-results').hidden = true; $('sel-search').value = '';
    // yeni dünya
    this.season = null; this.st = new GameState(this.world); this.ovl.st = this.st; this.st.rng.set((Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0 || 7); this.st.setup(0, 'normal'); this.ovl.computeLabels(); this.selCountry = -1; this.refresh();
    const picks = ['Turkey', 'United States of America', 'Russia', 'China', 'Germany', 'France', 'United Kingdom', 'Japan', 'Brazil', 'India', 'Egypt', 'Iran', 'Saudi Arabia', 'Mexico'];
    $('sel-chips').innerHTML = picks.map((ne) => { const c = this.st.countries.find((x) => x.ne === ne); return c ? `<button class="chip" data-c="${c.idx}"><i style="background:${rgb(c.color)}"></i>${esc(c.name)}</button>` : ''; }).join('');
    $('sel-chips').querySelectorAll('.chip').forEach((b) => b.addEventListener('click', () => { this.snd.init(); this.snd.play('select'); this.selCountry = +b.dataset.c; this.focusCountry(this.selCountry); this.showSelCard(); this.refresh(); }));
    this.view.flyTo(1550, 560, this.view.maxDist * 0.75, 1.6);
  }
  focusCountry(ci, zoom) {
    const c = this.st.countries[ci], W = this.world; const ps = this.st.provsOf[ci]; if (!ps.length) return;
    // ülkenin alan ağırlıklı merkezi (başkente yakın parça)
    const ref = W.provinces[c.capital]; let sx = 0, sy = 0, sa = 0; for (const p of ps) { const pr = W.provinces[p]; let x = pr.ax; if (x - ref.ax > W.W / 2) x -= W.W; else if (ref.ax - x > W.W / 2) x += W.W; if (Math.abs(x - ref.ax) + Math.abs(pr.ay - ref.ay) > 260) continue; sx += x * pr.area; sy += pr.ay * pr.area; sa += pr.area; }
    const n = ps.length; this.view.flyTo(sa ? sx / sa : ref.ax, sa ? sy / sa : ref.ay, zoom ?? Math.min(this.view.maxDist * 0.6, this.view.minDist * (1.1 + Math.sqrt(n) * 0.45)), 1.3);
  }
  searchCountries(q) {
    const box = $('sel-results'); q = q.trim().toLocaleLowerCase('tr-TR'); if (!q) { box.hidden = true; return; }
    const list = this.st.countries.filter((c) => c.alive && c.name.toLocaleLowerCase('tr-TR').includes(q)).slice(0, 12);
    box.innerHTML = list.length ? list.map((c) => `<button data-c="${c.idx}"><span class="cname"><i style="background:${rgb(c.color)}"></i>${esc(c.name)}</span></button>`).join('') : '<p class="mono" style="padding:10px">Bulunamadı</p>'; box.hidden = false;
    box.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { this.selCountry = +b.dataset.c; box.hidden = true; this.focusCountry(this.selCountry); this.showSelCard(); this.refresh(); }));
  }
  showSelCard() {
    const st = this.st, c = st.countries[this.selCountry]; if (!c) return; this.pulseCountry(c.idx, [255, 236, 190], c.capital, 0.15); const card = $('sel-card'); const n = st.provsOf[c.idx].length; const inc = st.income(c.idx);
    const hard = n <= 3 ? 'Çok zor' : n <= 8 ? 'Zor' : n <= 25 ? 'Orta' : 'Kolay';
    card.innerHTML = `<div class="p-head"><i class="flag" style="background:${rgb(c.color)}"></i><h2>${esc(c.name)}</h2><span></span></div>
      <p class="p-sub">Başkent <b>${esc(st.provNames[c.capital])}</b> · zorluk tahmini <b>${hard}</b></p>
      <dl class="stats"><div><dt>Eyalet</dt><dd>${n}</dd></div><div><dt>Ordu</dt><dd>${fmt(st.totalTroops(c.idx))}</dd></div><div><dt>Gelir</dt><dd>${inc.gross.toFixed(0)}</dd></div></dl>
      <div class="sec"><h3>Oyun zorluğu</h3><div class="seg" id="seg-diff">${Object.entries(DIFF).map(([k, d]) => `<button data-d="${k}" class="${k === this.diffChoice ? 'on' : ''}">${d.label}</button>`).join('')}</div></div>
      <button class="btn primary" id="btn-start">Bu ülkeyle başla</button>`;
    card.hidden = false;
    card.querySelectorAll('[data-d]').forEach((b) => b.addEventListener('click', () => { this.diffChoice = b.dataset.d; card.querySelectorAll('[data-d]').forEach((x) => x.classList.toggle('on', x === b)); this.snd.play('click'); }));
    $('btn-start').addEventListener('click', () => { this.snd.init(); this.snd.play('capture'); this.startGame(c.idx); });
  }

  startGame(ci) {
    const st = this.st; st.player = ci; st.diff = this.diffChoice; // setup zaten yapıldı; yalnız oyuncu ve zorluk
    this.state = 'play'; this.hideScreens(); $('hud').hidden = false; this.newsSeen = st.news.length; this.select(0);
    this.focusCountry(ci); this.snapNums = true; this.updateTop(); this.snapNums = false; this.refresh();
    const cap = this.world.provinces[st.countries[ci].capital];
    this.pulseCountry(ci, [255, 222, 140], st.countries[ci].capital, 0.9);
    this.fx.fireworks(cap.ax, cap.ay, [st.countries[ci].color, [255, 220, 120], [255, 255, 255]], 1.2); this.snd.play('ally', { delay: 1.1, vol: 0.6 });
    this.banner(st.dateText, `Hükümranlığın başlıyor`, `${st.countries[ci].name} senin ellerinde`);
    this.hint('Bir eyaletine dokun, sonra komşu bir eyalete dokunarak ordu gönder.');
    this.autosave();
  }
  continueGame() {
    const d = loadJSON(SAVE_KEY); const st = new GameState(this.world);
    if (!d || !st.load(d)) { this.toastModal('Kayıt açılamadı', 'Kayıtlı oyun bu harita sürümüyle uyumlu değil. Yeni bir oyun başlat.'); return; }
    this.st = st; this.ovl.st = st; this.ovl.computeLabels(); this.state = 'play'; this.hideScreens(); $('hud').hidden = false; this.newsSeen = st.news.length; this.select(0);
    this.season = null; this.focusCountry(st.player); this.snapNums = true; this.updateTop(); this.snapNums = false; this.refresh(); this.pulseCountry(st.player, [255, 222, 140], st.countries[st.player].capital, 0.8); this.banner(st.dateText, 'Kaldığın yerden', st.countries[st.player].name);
  }
  autosave() { if (this.state === 'play' && this.st.countries[this.st.player]?.alive) saveRaw(SAVE_KEY, this.st.serialize()); }

  // ---------------------------------------------------------------- üst şerit
  updateTop() {
    const st = this.st, c = st.countries[st.player]; if (!c) return; const inc = st.income(st.player); this.ovl.dirty = true;
    $('tb-swatch').style.background = rgb(c.color); $('tb-name').textContent = c.name;
    this.tweenNum('tb-gold', c.gold, tl); const s = $('tb-inc'); s.textContent = (inc.net >= 0 ? '+' : '') + inc.net.toFixed(0); s.classList.toggle('neg', inc.net < 0);
    this.tweenNum('tb-man', c.manpower, fmt); this.tweenNum('tb-army', st.totalTroops(st.player), fmt); this.tweenNum('tb-prov', st.provsOf[st.player].length, (x) => String(Math.round(x)));
    const dEl = $('tb-date'); if (dEl.textContent !== st.dateText) { const first = !this.dateShown; dEl.textContent = st.dateText; this.dateShown = true; if (!first) { dEl.classList.remove('flip'); void dEl.offsetWidth; dEl.classList.add('flip'); } }
    $('tb-turn').textContent = 'Tur ' + (st.turn + 1);
    const next = new Date(st.year, st.month + 1, 1); $('et-sub').textContent = `${['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'][next.getMonth()]} ${next.getFullYear()}${yearDat(next.getFullYear())} geç`;
    const et = $('endturn'); let chip = et.querySelector('.badge'); if (st.orders.length) { if (!chip) { chip = document.createElement('span'); chip.className = 'badge'; et.appendChild(chip); } chip.textContent = st.orders.length; } else if (chip) chip.remove();
    $('btn-mode').textContent = { political: 'Siyasi', terrain: 'Arazi', diplomacy: 'Diplomasi' }[this.mode];
  }
  // üst şeritteki sayılar yeni değere akarak döner; artışta yeşil, azalışta kırmızı parlar
  tweenNum(id, val, f) {
    const el = $(id); let tw = this.tweens[id];
    if (!tw || this.snapNums) { this.tweens[id] = { el, from: val, to: val, cur: val, t: 1, f }; el.textContent = f(val); return; }
    tw.f = f; if (Math.abs(val - tw.to) < 0.5) return;
    const up = val > tw.cur; tw.from = tw.cur; tw.to = val; tw.t = 0;
    el.classList.remove('up', 'down'); void el.offsetWidth; el.classList.add(up ? 'up' : 'down');
  }
  stepTweens(dt) { for (const id in this.tweens) { const tw = this.tweens[id]; if (tw.t >= 1) continue; tw.t = Math.min(1, tw.t + dt / 0.9); tw.cur = tw.from + (tw.to - tw.from) * easeOut3(tw.t); tw.el.textContent = tw.f(tw.cur); } }
  cycleMode() { this.mode = { political: 'terrain', terrain: 'diplomacy', diplomacy: 'political' }[this.mode]; this.refresh(); this.updateTop(); }
  hint(text, sec = 6) { const h = $('hint'); h.textContent = text; h.hidden = false; clearTimeout(this.hintT); this.hintT = setTimeout(() => { h.hidden = true; }, sec * 1000); }

  // ---------------------------------------------------------------- eyalet / ülke paneli
  showPanel() {
    const panel = $('panel'); const st = this.st, p = this.sel; if (!p || this.state !== 'play') { panel.hidden = true; return; }
    const pr = this.world.provinces[p], o = st.owner[p], c = st.countries[o], P = st.player, mine = o === P;
    const inc = st.dev[p] * (st.market[p] ? 1.5 : 1) * (st.core[p] === o ? 1 : 0.55);
    const devHtml = `<span class="dev" title="Gelişmişlik ${st.dev[p]}/10">${Array.from({ length: 10 }, (_, i) => `<i class="${i < st.dev[p] ? 'on' : ''}"></i>`).join('')}</span>`;
    const tags = []; if (p === c.capital) tags.push('<span class="tag you">Başkent</span>'); if (st.core[p] !== o) tags.push(`<span class="tag truce">${esc(st.countries[st.core[p]].short)} toprağı</span>`);
    let html = `<div class="p-head"><i class="flag" style="background:${rgb(c.color)}"></i><h2>${esc(st.provNames[p])}</h2><button class="p-close" id="p-close" aria-label="Kapat">×</button></div>
      <p class="p-sub">${mine ? '<b>Senin eyaletin</b>' : `<b>${esc(c.name)}</b>`} · ${TERRAIN[pr.terrain]?.name || ''} ${tags.join(' ')}</p>
      <dl class="stats"><div><dt>Asker</dt><dd>${fmt(st.troops[p] - (st.committed(p) || 0))}</dd></div><div><dt>Savunma</dt><dd>×${st.defenseMod(p).toFixed(2)}</dd></div><div><dt>Gelir</dt><dd>${inc.toFixed(1)}</dd></div></dl>
      <div class="row">${devHtml}</div>`;
    if (mine) {
      const cc = st.countries[P]; const left = st.maxRecruit(p) - (st.recruitedThisTurn?.[p] || 0); const maxN = Math.max(0, Math.min(left, cc.manpower, Math.floor(cc.gold / st.recruitCost(1000) * 1000)));
      const rb = (n, label) => `<button class="rbtn" data-rec="${n}" ${maxN < 100 || n > maxN ? 'disabled' : ''}>${label}<small>${Math.ceil(st.recruitCost(n))} altın</small></button>`;
      html += `<div class="sec"><h3>Asker topla</h3><div class="row">${rb(1000, '+1.000')}${rb(5000, '+5.000')}<button class="rbtn" data-rec="${maxN}" ${maxN < 100 ? 'disabled' : ''}>Azami<small>${fmt(maxN)}</small></button></div>
        <p class="mono">Bu tur bu eyalette en çok ${fmt(Math.max(0, left))} · kaynak ${fmt(cc.manpower)}</p></div>
        <div class="sec"><h3>Yapılar</h3><div class="row">${Object.entries(BUILD).map(([k, B]) => { const lvl = st[k][p]; const full = lvl >= B.max; const cost = B.cost(lvl); return `<button class="rbtn ${full ? 'done' : ''}" data-build="${k}" title="${B.desc}" ${full || cc.gold < cost ? 'disabled' : ''}>${B.name}${B.max > 1 ? ` ${lvl}/${B.max}` : full ? ' ✓' : ''}<small>${full ? 'tamam' : cost + ' altın'}</small></button>`; }).join('')}</div></div>`;
      const ords = st.orders.filter((x) => x.from === p);
      html += `<div class="sec"><h3>Ordu gönder</h3><p class="mono">Komşu bir eyalete dokun: yeşil kendi toprağın, kırmızı savaştığın ülke.</p>${ords.length ? `<div class="orders">${ords.map((x) => `<div class="order"><span>${st.owner[x.to] === P ? '→' : '⚔'} ${esc(st.provNames[x.to])} · <b class="num">${fmt(x.n)}</b></span><button data-cancel="${st.orders.indexOf(x)}" aria-label="Emri iptal et">×</button></div>`).join('')}</div>` : ''}</div>`;
    } else {
      const C = st.C; const rel = st.relation(P, o); const war = st.atWar(P, o), ally = st.allied(P, o), truce = st.truce[P * C + o];
      const status = war ? '<span class="tag war">Savaşta</span>' : ally ? '<span class="tag ally">Müttefik</span>' : truce > 0 ? `<span class="tag truce">Ateşkes · ${truce} tur</span>` : '';
      html += `<div class="sec"><h3>${esc(c.name)} ${status}</h3><div class="row" style="justify-content:space-between"><span class="mono">İlişki</span><b class="num">${rel > 0 ? '+' : ''}${Math.round(rel)}</b></div>
        <div class="relbar"><i style="${rel >= 0 ? `left:50%;width:${rel / 2}%;background:var(--ally)` : `left:${50 + rel / 2}%;width:${-rel / 2}%;background:var(--war)`}"></i></div>
        <dl class="stats"><div><dt>Eyalet</dt><dd>${st.provsOf[o].length}</dd></div><div><dt>Ordu</dt><dd>${fmt(st.totalTroops(o))}</dd></div><div><dt>Müttefik</dt><dd>${st.alliesOf(o).length}</dd></div></dl>
        <div class="row">${war ? '<button class="rbtn" data-dip="peace">Barış teklif et</button>' : `<button class="rbtn war" data-dip="war" ${ally || truce > 0 ? 'disabled' : ''}>Savaş ilan et${truce > 0 ? '<small>ateşkes sürüyor</small>' : ''}</button>`}
        ${ally ? '<button class="rbtn" data-dip="break">İttifakı boz</button>' : `<button class="rbtn" data-dip="ally" ${war ? 'disabled' : ''}>İttifak teklif et</button>`}
        <button class="rbtn" data-dip="rel" ${st.countries[P].gold < 25 ? 'disabled' : ''}>İlişkileri geliştir<small>25 altın</small></button></div></div>`;
      if (war) html += `<p class="mono">Savaş skoru: ${st.score(P, o) >= 0 ? '+' : ''}${st.score(P, o).toFixed(0)}. Kendi eyaletine dokunup bu eyalete saldır.</p>`;
    }
    panel.innerHTML = html; panel.hidden = false; if (innerWidth <= 600) $('hint').hidden = true;
    $('p-close').addEventListener('click', () => this.select(0));
    panel.querySelectorAll('[data-rec]').forEach((b) => b.addEventListener('click', () => { const n = st.recruit(p, +b.dataset.rec); if (n) { this.snd.play('coin'); this.snd.play('march', { vol: 0.35 }); this.ovl.addFloater(pr.ax, pr.ay, '+' + fmt(n), '#f2c14e'); this.ovl.addPop(pr.ax, pr.ay, 'recruit', st.countries[P].color); this.fx.sparkle(pr.ax, pr.ay, st.countries[P].color); } this.updateTop(); this.showPanel(); }));
    panel.querySelectorAll('[data-build]').forEach((b) => b.addEventListener('click', () => { if (st.build(p, b.dataset.build)) { const kind = b.dataset.build; this.snd.play('build'); this.ovl.addFloater(pr.ax, pr.ay - 10, BUILD[kind].name, '#efe6d0', { delay: 0.25 }); this.ovl.addPop(pr.ax, pr.ay, kind, null, { lvl: st[kind][p], life: 1.3 }); this.fx.capture(pr.ax, pr.ay, [217, 177, 92]); for (let i = 0; i < 4; i++) this.fx.dust(pr.ax + (Math.random() - 0.5) * 8, pr.ay + (Math.random() - 0.5) * 5); } this.updateTop(); this.showPanel(); }));
    panel.querySelectorAll('[data-cancel]').forEach((b) => b.addEventListener('click', () => { st.orders.splice(+b.dataset.cancel, 1); this.snd.play('click'); this.updateTop(); this.showPanel(); }));
    panel.querySelectorAll('[data-dip]').forEach((b) => b.addEventListener('click', () => this.diplomacy(o, b.dataset.dip)));
  }

  // ülke genelinde yayılan renk dalgası (savaş kırmızı, ittifak yeşil, barış açık mavi, taç giyme altın)
  pulseCountry(ci, col, fromP, base = 0) {
    const W = this.world, o = W.provinces[fromP]; const ps = this.st.provsOf[ci]; if (!ps?.length || !o) return;
    let maxD = 0; for (const p of ps) { const pr = W.provinces[p]; let dx = pr.cx - o.ax; dx -= W.W * Math.round(dx / W.W); const d = Math.hypot(dx, pr.cy - o.ay) + Math.sqrt(pr.area) * 0.6; if (d > maxD) maxD = d; }
    const radius = Math.max(50, maxD / 2.6); for (const p of ps) this.view.wave(p, col, o.ax, o.ay, radius, base);
  }
  // ci ülkesinin verilen eyalete en yakın eyaleti
  nearestProv(ci, toP) { const W = this.world, t = W.provinces[toP]; let best = this.st.countries[ci].capital, bd = Infinity; for (const p of this.st.provsOf[ci]) { const pr = W.provinces[p]; let dx = pr.ax - t.ax; if (dx > W.W / 2) dx -= W.W; else if (dx < -W.W / 2) dx += W.W; const d = dx * dx + (pr.ay - t.ay) ** 2; if (d < bd) { bd = d; best = p; } } return best; }
  // diplomasi anı: karşı ülkede renk dalgası, başkentler arasında ışıklı yay
  diploFx(kind, other, toMe = false) {
    const st = this.st, P = st.player; if (!st.countries[other]?.alive || !st.countries[P]?.alive) return;
    const myCap = st.countries[P].capital, oc = st.countries[other].capital;
    const col = kind === 'war' ? [226, 64, 44] : kind === 'ally' ? [96, 214, 130] : kind === 'peace' ? [200, 228, 245] : [255, 214, 120];
    this.pulseCountry(other, col, this.nearestProv(other, myCap));
    if (toMe) this.ovl.addArc(oc, myCap, col, kind); else this.ovl.addArc(myCap, oc, col, kind);
    if (kind === 'war') this.snd.play('whoosh', { vol: 0.7, delay: 0.1 });
  }
  diplomacy(o, kind) {
    const st = this.st, P = st.player, c = st.countries[o];
    if (kind === 'war') {
      this.confirm('Savaş ilanı', `${c.name} ülkesine savaş ilan etmek üzeresin. Müttefikleri de sana karşı savaşa girer${st.alliesOf(o).length ? ` (${st.alliesOf(o).map((a) => st.countries[a].name).join(', ')})` : ''}.`, 'Savaş ilan et', 'war', () => {
        const joined = st.declareWar(P, o, true); this.snd.play('war'); this.diploFx('war', o); joined.forEach(([x], i) => { if (x !== P) this.pulseCountry(x, [226, 64, 44], this.nearestProv(x, st.countries[P].capital), 0.6 + i * 0.25); }); this.banner('Savaş ilanı', `${c.name}`, joined.length ? `Savaşa katılanlar: ${joined.map(([x]) => st.countries[x].name).join(', ')}` : 'Ordular sınıra!', 'war'); this.view.shake = 0.6; this.flushNews(); this.refresh(); this.showPanel(); this.updateTop();
      });
    } else if (kind === 'peace') {
      if (st.acceptsPeace(o, P)) { st.makePeace(P, o); this.snd.play('peace'); this.diploFx('peace', o); this.banner('Barış', `${c.name} ile barış`, '12 tur ateşkes', 'peace'); }
      else { this.snd.play('click'); this.toastModal('Teklif reddedildi', `${c.name} barışa yanaşmıyor: savaşın gidişatı onların lehine. Önce birkaç eyalet al ya da ordularını yıprat.`); }
      this.flushNews(); this.refresh(); this.showPanel();
    } else if (kind === 'ally') {
      if (st.acceptsAlliance(o, P)) { st.makeAlliance(P, o); this.snd.play('ally'); this.diploFx('ally', o); this.banner('İttifak', `${c.name} ile ittifak`, 'Biri saldırıya uğrarsa diğeri savaşa girer', 'ally'); }
      else { this.snd.play('click'); this.toastModal('Teklif reddedildi', `${c.name} ittifak için yeterince güvenmiyor (ilişki en az +45 olmalı). İlişkileri geliştirmeyi dene.`); }
      this.flushNews(); this.refresh(); this.showPanel();
    } else if (kind === 'break') { st.breakAlliance(P, o); this.snd.play('click'); this.refresh(); this.showPanel(); }
    else if (kind === 'rel') { if (st.improveRelations(P, o)) { this.snd.play('coin'); } this.updateTop(); this.showPanel(); }
  }

  // ---------------------------------------------------------------- ordu gönderme penceresi
  openMove(from, to) {
    const st = this.st, P = st.player; const avail = st.troops[from] - st.committed(from); const attack = st.owner[to] !== P; const e = st.edge(from, to);
    if (avail < 100) { this.hint('Bu eyalette gönderilecek asker yok. Önce asker topla.'); return; }
    const o = st.owner[to], c = st.countries[o];
    const chance = (n) => { if (!attack) return 1; const D = st.troops[to]; if (D <= 0) return 1; const A = n * st.discipline(P) * (e.sea ? 0.78 : 1), B = D * st.discipline(o) * st.defenseMod(to); let w = 0; for (let i = 0; i < 300; i++) if (A * (0.85 + Math.random() * 0.3) > B * (0.85 + Math.random() * 0.3)) w++; return w / 300; };
    let n = Math.floor(avail * (attack ? 0.9 : 0.5) / 100) * 100 || 100;
    this.preview = { from, to, n, attack };
    const body = () => { const ch = chance(n); return `<p class="kicker">${attack ? 'Saldırı' : 'Ordu kaydırma'}${e.sea ? ' · deniz aşırı' : ''}</p><h2>${esc(st.provNames[from])} → ${esc(st.provNames[to])}</h2>
      ${attack ? `<p>${esc(c.name)} savunması: <b class="num">${fmt(st.troops[to])}</b> asker, savunma çarpanı <b class="num">×${st.defenseMod(to).toFixed(2)}</b>${e.sea ? ', deniz çıkarması −%22' : ''}.</p>` : `<p>Askerler kendi toprağında yer değiştirir.</p>`}
      <div class="slider"><input type="range" id="mv-n" min="100" max="${avail}" step="10" value="${n}" aria-label="Asker sayısı"><div class="slider-row"><span>100</span><b id="mv-v">${tl(n)}</b><span>${tl(avail)}</span></div></div>
      <div class="seg q4" id="mv-q"><button data-q="0.25">%25</button><button data-q="0.5">%50</button><button data-q="0.75">%75</button><button data-q="1">Tümü</button></div>
      ${attack ? `<p class="mono">Kazanma olasılığı: <b id="mv-ch" style="color:${ch > 0.66 ? 'var(--ally)' : ch > 0.4 ? 'var(--brass2)' : 'var(--war)'}">%${Math.round(ch * 100)}</b></p>` : ''}
      <div class="actions"><button class="btn ghost small" id="mv-sel" style="margin-right:auto">Hedefi incele</button><button class="btn ghost" id="mv-cancel">Vazgeç</button><button class="btn ${attack ? 'war' : 'primary'}" id="mv-ok">${attack ? 'Saldır' : 'Gönder'}</button></div>`; };
    this.openModal(body(), true);
    const bind = () => {
      const upd = () => { $('mv-v').textContent = tl(n); this.preview.n = n; if (attack) { const ch = chance(n); const el = $('mv-ch'); el.textContent = '%' + Math.round(ch * 100); el.style.color = ch > 0.66 ? 'var(--ally)' : ch > 0.4 ? 'var(--brass2)' : 'var(--war)'; } };
      $('mv-n').addEventListener('input', (ev) => { n = +ev.target.value; upd(); });
      $('mv-q').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { const q = +b.dataset.q; n = q >= 1 ? avail : Math.max(100, Math.round(avail * q / 10) * 10); $('mv-n').value = n; this.snd.play('click', { vol: 0.5 }); upd(); }));
      $('mv-cancel').addEventListener('click', () => { this.preview = null; this.closeModal(); });
      $('mv-sel').addEventListener('click', () => { this.preview = null; this.closeModal(); this.select(to); });
      $('mv-ok').addEventListener('click', () => { st.orders.push({ from, to, n, owner: P, sea: !!e.sea }); this.preview = null; this.closeModal(); this.snd.play('order'); this.updateTop(); this.showPanel(); });
    };
    bind();
  }

  // ---------------------------------------------------------------- tur sonu ve animasyon
  async endTurn() {
    if (this.busy || this.state !== 'play') return; const st = this.st; const P = st.player;
    this.busy = true; $('endturn').classList.add('busy'); $('hud').classList.add('busy'); this.timeScale = this.settings.fast ? 1.9 : 1; $('hint').hidden = true; this.preview = null; this.closeModal();
    const keepSel = this.sel; this.sel = 0; $('panel').hidden = true; this.refresh();
    this.snd.play('turn');
    const beforeOwner = Int16Array.from(st.owner), beforeTroops = Int32Array.from(st.troops); const goldBefore = st.countries[P].gold;
    const ev = resolveTurn(st);
    const dOwner = Int16Array.from(beforeOwner), dTroops = Int32Array.from(beforeTroops);
    for (const m of ev.moves) dTroops[m.from] = Math.max(0, dTroops[m.from] - m.n);
    // yalnız askere alma sonrası farkı göstermek için: kalan farkları sonradan eşitle
    this.ovl.dispOwner = dOwner; this.ovl.dispTroops = dTroops; this.refresh(dOwner);
    // görünür hareketler canlandırılır
    const W = this.world; const onScreen = (p) => { const s = this.view.project(W.provinces[p].ax, W.provinces[p].ay); return s.z > 0 && s.x > -60 && s.x < this.view.sw + 60 && s.y > -60 && s.y < this.view.sh + 60; };
    const vis = ev.moves.filter((m) => m.player || onScreen(m.from) || onScreen(m.to)).slice(0, 160);
    const DUR = vis.length ? 1.25 : 0;
    if (vis.length) this.snd.play('march', { vol: vis.some((m) => m.player) ? 1 : 0.6 });
    for (const m of vis) this.ovl.marches.push({ ...m, attack: m.result !== 'join' && m.result !== 'cancel', t: 0, delay: Math.random() * 0.12, dur: DUR });
    this.marchDust = (dt) => { for (const m of this.ovl.marches) { if (m.arrived || Math.random() > dt * 14) continue; const k = Math.max(0, Math.min(1, (m.t - m.delay) / m.dur)); const a = W.provinces[m.from], b = W.provinces[m.to]; let bx = b.ax; if (bx - a.ax > W.W / 2) bx -= W.W; else if (a.ax - bx > W.W / 2) bx += W.W; this.fx.dust(a.ax + (bx - a.ax) * k, a.ay + (b.ay - a.ay) * k); } };
    await this.animWait(DUR + 0.15);
    this.marchDust = null;
    // varışlar: takviye, savaş sahnesi, fetih (sonuç sahnenin doruğunda uygulanır)
    let clashes = 0, captureSfx = 0, volleys = 0, staggered = 0; const seenBattle = new Set(); const pending = [];
    for (const m of ev.moves) {
      const pr = W.provinces[m.to]; const visible = onScreen(m.to);
      if (m.result === 'join') dTroops[m.to] += m.n;
      else if (m.result === 'cancel') dTroops[m.from] += m.n;
      else if (m.battle) {
        const r = m.battle; const mineInvolved = m.player || beforeOwner[m.to] === P; const big = (r.n + r.D) > 15000;
        if (visible && !seenBattle.has(m.to)) {
          seenBattle.add(m.to); const fr = W.provinces[m.from];
          this.ovl.addBattle(pr.ax, pr.ay, st.countries[r.att].color, st.countries[r.def].color, r.won, fr.ax, fr.ay, big);
          if (this.view.pxScale < 0.7) this.ovl.addMarker(pr.ax, pr.ay, 'swords', 1.7);
          this.fx.battle(pr.ax, pr.ay, Math.min(1.5, (r.n + r.D) / 12000), 0.3);
          for (const d of [0.38, 0.7, 1.02]) this.fx.volley(pr.ax + (Math.random() - 0.5) * 6, pr.ay + (Math.random() - 0.5) * 4, d);
          if (clashes++ < 5) { const vol = mineInvolved ? 1 : 0.5; this.snd.play('clash', { big, vol, delay: 0.3 }); if (volleys++ < 3) { this.snd.play('volley', { delay: 0.4, vol }); this.snd.play('volley', { delay: 0.78, vol: vol * 0.8 }); } if (big && mineInvolved) this.snd.play('cannon', { delay: 0.55, vol }); }
          if (mineInvolved) this.view.shake = Math.max(this.view.shake, big ? 0.5 : 0.25);
        }
        const resolve = () => {
          if (visible) { if (r.attLoss > 0) this.ovl.addFloater(pr.ax - 10, pr.ay, '−' + fmt(r.attLoss), rgb(st.countries[r.att].color.map((x) => Math.min(255, x + 60)))); if (r.defLoss > 0) this.ovl.addFloater(pr.ax + 14, pr.ay + 4, '−' + fmt(r.defLoss), '#ff8a70', { delay: 0.12 }); }
          if (r.won) {
            const prevCol = st.countries[dOwner[m.to]].color; dOwner[m.to] = m.owner; dTroops[m.to] = r.survivors;
            this.view.capture(m.to, prevCol, 0); this.needRefresh = true;
            if (visible) { this.fx.capture(pr.ax, pr.ay, st.countries[m.owner].color, 0.05); this.ovl.addMarker(pr.ax, pr.ay, 'flag', 2.2, st.countries[m.owner].color); }
            if (mineInvolved && captureSfx++ < 3) this.snd.play('capture', { vol: m.player ? 1 : 0.7 });
          } else { dTroops[m.to] = r.survD; if (r.back) dTroops[m.from] += r.back; }
          this.ovl.dirty = true;
        };
        if (visible) pending.push(this.animWait(BATTLE_RESOLVE + 0.02).then(resolve)); else resolve();
        if (visible && staggered++ < 14) await this.animWait(0.07);
      }
    }
    await Promise.all(pending);
    await this.animWait(seenBattle.size ? 0.55 : 0.2);
    // durum eşitlenir
    this.ovl.dispOwner = null; this.ovl.dispTroops = null; this.ovl.computeLabels(); this.refresh(); this.updateTop();
    const gained = st.countries[P].gold - goldBefore; if (st.countries[P].alive) { const cap = W.provinces[st.countries[P].capital]; this.ovl.addFloater(cap.ax, cap.ay - 6, (gained >= 0 ? '+' : '') + gained.toFixed(0) + ' altın', gained >= 0 ? '#f2c14e' : '#ff8a70', { delay: 0.1 }); }
    for (const e of ev.eliminated) { if (e === P) continue; if (st.atWar(P, e) || beforeOwner.some((o, p) => o === e && st.owner[p] === P)) this.snd.play('eliminate', { vol: 0.7 }); }
    // başkent düşüşleri: oyuncuyu ilgilendiriyorsa büyük duyuru, fethedilen başkentte havai fişek
    const capWin = ev.captures.find((c) => c.capital && c.to === P), capLost = ev.captures.find((c) => c.capital && c.from === P);
    if (capLost) { this.banner('Başkent düştü', `${st.provNames[capLost.p]} kaybedildi`, `Yeni başkent: ${st.provNames[st.countries[P].capital] || '—'}`, 'war'); this.view.shake = 0.8; }
    else if (capWin) { const pr = W.provinces[capWin.p]; this.banner('Zafer', `${st.provNames[capWin.p]} fethedildi`, `${st.countries[capWin.from].name} başkentini kaybetti`, 'ally'); this.fx.fireworks(pr.ax, pr.ay, [st.countries[P].color, [255, 220, 120], [255, 255, 255]], 0); this.fx.fireworks(pr.ax + 8, pr.ay - 6, [[255, 230, 160], st.countries[P].color], 0.5); this.snd.play('victory', { vol: 0.5 }); }
    const elimByMe = ev.eliminated.find((e) => e !== P && beforeOwner.some((o, p) => o === e && st.owner[p] === P));
    if (elimByMe !== undefined && !capWin) this.banner('Fetih', `${st.countries[elimByMe].name} haritadan silindi`, 'Toprakları artık senin', 'ally');
    this.flushNews();
    // oyuncuya gelen kararlar ve olaylar
    this.timeScale = 1;
    for (const pu of ev.popups) await this.popup(pu);
    // sonuç
    const mine = st.provsOf[P]?.length || 0;
    if (!st.countries[P].alive || mine === 0) { this.gameOver(false); }
    else if (mine >= Math.ceil(st.P * 0.5) && !st.victoryShown) { st.victoryShown = true; this.gameOver(true); }
    this.autosave();
    this.timeScale = 1; this.busy = false; $('endturn').classList.remove('busy'); $('hud').classList.remove('busy'); if (keepSel && st.owner[keepSel] === P) this.select(keepSel, false);
  }

  popup(pu) {
    const st = this.st, P = st.player;
    return new Promise((done) => {
      if (pu.type === 'event') { this.snd.play('event'); this.openModal(`<p class="kicker">Olay · ${st.dateText}</p><h2>${esc(pu.title)}</h2><p>${esc(pu.text)}</p><p class="result">${esc(pu.result)}</p><div class="actions"><button class="btn primary" id="pu-ok">Tamam</button></div>`); $('pu-ok').addEventListener('click', () => { this.closeModal(); this.updateTop(); done(); }); return; }
      const c = st.countries[pu.from]; if (!c?.alive) { done(); return; }
      if (pu.type === 'war') {
        const vsMe = pu.to === P || st.atWar(pu.from, P); if (!vsMe) { done(); return; }
        const helpers = st.alliesOf(P).filter((a) => st.atWar(a, pu.from)).map((a) => st.countries[a].name).join(', ');
        this.snd.play('war'); this.view.shake = 0.7;
        this.diploFx('war', pu.from, true);
        if (pu.to === P) this.banner('Savaş', `${c.name} sana savaş açtı`, helpers ? `Müttefiklerin yanında: ${helpers}` : 'Sınırlarını savun!', 'war');
        else this.banner('Savaş', `${c.name}, ${st.countries[pu.to].name} ülkesine saldırdı`, 'İttifak gereği sen de savaştasın', 'war');
        this.refresh(); this.animWait(1.6).then(done); return;
      }
      if (pu.type === 'peaceOffer') {
        if (!st.atWar(pu.from, P)) { done(); return; }
        this.snd.play('event'); this.openModal(`<p class="kicker">Diplomasi</p><h2>${esc(c.name)} barış istiyor</h2><p>Savaş skoru: ${st.score(P, pu.from) >= 0 ? '+' : ''}${st.score(P, pu.from).toFixed(0)}. Kabul edersen bugünkü sınırlar geçerli olur ve 12 tur ateşkes başlar.</p><div class="actions"><button class="btn ghost" id="pu-no">Reddet</button><button class="btn primary" id="pu-ok">Barışı kabul et</button></div>`);
        $('pu-no').addEventListener('click', () => { this.closeModal(); done(); }); $('pu-ok').addEventListener('click', () => { st.makePeace(P, pu.from); this.snd.play('peace'); this.diploFx('peace', pu.from, true); this.closeModal(); this.flushNews(); this.refresh(); this.banner('Barış', `${c.name} ile barış`, '12 tur ateşkes', 'peace'); done(); }); return;
      }
      if (pu.type === 'allyOffer') {
        if (st.atWar(pu.from, P) || st.allied(pu.from, P)) { done(); return; }
        this.snd.play('event'); this.openModal(`<p class="kicker">Diplomasi</p><h2>${esc(c.name)} ittifak öneriyor</h2><p>İttifakta biri saldırıya uğrarsa diğeri savaşa girer. ${st.enemiesOf(pu.from).length ? `Şu an savaştıkları: ${st.enemiesOf(pu.from).map((e) => st.countries[e].name).join(', ')}.` : ''}</p><div class="actions"><button class="btn ghost" id="pu-no">Reddet</button><button class="btn primary" id="pu-ok">İttifakı kabul et</button></div>`);
        $('pu-no').addEventListener('click', () => { this.closeModal(); done(); }); $('pu-ok').addEventListener('click', () => { st.makeAlliance(P, pu.from); this.snd.play('ally'); this.diploFx('ally', pu.from, true); this.closeModal(); this.flushNews(); this.refresh(); done(); }); return;
      }
      done();
    });
  }

  // haber akışı: oyuncuyu ilgilendirenler ve büyük olaylar
  flushNews() {
    const st = this.st, P = st.player; const box = $('news');
    const items = st.news.slice(this.newsSeen); this.newsSeen = st.news.length;
    const relevant = items.filter((n) => n.who.includes(P) || n.kind === 'elim' || (n.kind === 'war' && n.who.some((w) => st.provsOf[w]?.length > 25)) || n.who.some((w) => st.allied(P, w) || st.atWar(P, w))).slice(-4);
    for (const n of relevant) {
      const el = document.createElement('div'); el.className = 'news ' + n.kind; el.textContent = n.text; box.appendChild(el);
      setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 450); }, 7000);
      while (box.children.length > 4) box.firstChild.remove();
    }
  }

  banner(kicker, title, sub = '', kind = '') {
    const b = $('banner'); b.className = kind; $('banner-kicker').textContent = kicker; $('banner-title').textContent = title; $('banner-sub').textContent = sub; b.hidden = false; void b.offsetWidth; b.classList.add('show');
    clearTimeout(this.bannerT); this.bannerT = setTimeout(() => { b.hidden = true; b.classList.remove('show'); }, 2700);
  }

  gameOver(win) {
    const st = this.st, P = st.player, c = st.countries[P]; const s = st.stats || { provinces: [] };
    const spark = (() => { const v = s.provinces; if (v.length < 2) return ''; const mx = Math.max(...v, 1); const pts = v.map((y, i) => `${(i / (v.length - 1)) * 300},${58 - (y / mx) * 54}`).join(' '); return `<svg class="spark" viewBox="0 0 300 60" preserveAspectRatio="none" aria-label="Eyalet sayısının seyri"><polyline points="${pts}" fill="none" stroke="#d9b15c" stroke-width="2"/></svg>`; })();
    if (win) { this.snd.play('victory'); const cap = this.world.provinces[c.capital]; this.pulseCountry(P, [255, 222, 140], c.capital, 0.3); this.view.flyTo(cap.ax, cap.ay, this.view.maxDist * 0.5); for (let i = 0; i < 5; i++) this.fx.fireworks(cap.ax + (Math.random() - 0.5) * 120, cap.ay + (Math.random() - 0.5) * 80, [c.color, [255, 220, 120], [255, 255, 255]], i * 0.6); }
    else this.snd.play('defeat');
    this.openModal(`<p class="kicker">${win ? 'Zafer' : 'Yenilgi'} · ${st.dateText}</p><h2>${win ? `${esc(c.name)} dünyanın yarısına hükmediyor` : `${esc(c.name)} tarihe karıştı`}</h2>
      <p>${win ? 'Haritanın yarısı senin renginde. İstersen fethe devam edebilirsin.' : 'Son eyaletin de düştü. Başka bir ülkeyle yeniden dene.'}</p>
      <dl class="big-stats"><div><dt>Süre</dt><dd>${st.turn} tur</dd></div><div><dt>Eyalet</dt><dd>${st.provsOf[P]?.length || 0}</dd></div><div><dt>Kazanılan savaş</dt><dd>${c.battlesWon}</dd></div><div><dt>Alınan eyalet</dt><dd>${c.gained}</dd></div></dl>${spark}
      <div class="actions">${win ? '<button class="btn ghost" id="go-cont">Fethe devam</button>' : ''}<button class="btn primary" id="go-new">Yeni oyun</button></div>`);
    if (win) $('go-cont').addEventListener('click', () => this.closeModal());
    $('go-new').addEventListener('click', () => { try { localStorage.removeItem(SAVE_KEY); } catch { /* yoksay */ } this.closeModal(); this.startSelect(); });
    if (!win) try { localStorage.removeItem(SAVE_KEY); } catch { /* yoksay */ }
  }

  // ---------------------------------------------------------------- pencereler
  openModal(html, closable = false) { $('modal-body').innerHTML = html; $('modal').hidden = false; this.modalClosable = closable; this.snd.play('open', { vol: 0.6 }); }
  closeModal() { $('modal').hidden = true; this.preview = null; }
  toastModal(title, text) { this.openModal(`<h2>${esc(title)}</h2><p>${esc(text)}</p><div class="actions"><button class="btn primary" id="tm-ok">Tamam</button></div>`, true); $('tm-ok').addEventListener('click', () => this.closeModal()); }
  confirm(title, text, okLabel, kind, fn) { this.openModal(`<h2>${esc(title)}</h2><p>${esc(text)}</p><div class="actions"><button class="btn ghost" id="cf-no">Vazgeç</button><button class="btn ${kind || 'primary'}" id="cf-ok">${esc(okLabel)}</button></div>`, true); $('cf-no').addEventListener('click', () => this.closeModal()); $('cf-ok').addEventListener('click', () => { this.closeModal(); fn(); }); }
  showMenu() {
    this.openModal(`<p class="kicker">Menü</p><h2>Hükümranlık</h2><nav class="stack" style="width:100%"><button class="btn" id="m-save">Kaydet</button><button class="btn" id="m-set">Ayarlar</button><button class="btn" id="m-help">Nasıl oynanır</button><button class="btn ghost" id="m-title">Ana menü</button></nav>`, true);
    $('m-save').addEventListener('click', () => { this.autosave(); this.toastModal('Kaydedildi', `${this.st.dateText} tarihli oyun bu tarayıcıya kaydedildi.`); });
    $('m-set').addEventListener('click', () => this.showSettings()); $('m-help').addEventListener('click', () => this.showHelp());
    $('m-title').addEventListener('click', () => { this.autosave(); this.closeModal(); this.showTitle(); });
  }
  showSettings() {
    const s = this.settings;
    this.openModal(`<p class="kicker">Ayarlar</p><h2>Ses ve görüntü</h2>
      <label class="field" for="s-vol">Ana ses<input id="s-vol" type="range" min="0" max="1" step="0.05" value="${s.volume}"></label>
      <label class="field" for="s-mus">Müzik<input id="s-mus" type="range" min="0" max="1" step="0.05" value="${s.music}"></label>
      <label class="field" for="s-sfx">Efektler<input id="s-sfx" type="range" min="0" max="1" step="0.05" value="${s.sfx}"></label>
      <label class="field check" for="s-cloud"><input id="s-cloud" type="checkbox" ${s.clouds ? 'checked' : ''}> Bulutlar (uzak görünümde)</label>
      <label class="field check" for="s-hq"><input id="s-hq" type="checkbox" ${s.hq ? 'checked' : ''}> Yüksek çözünürlük (pil ve performans için kapat)</label>
      <label class="field check" for="s-fast"><input id="s-fast" type="checkbox" ${s.fast ? 'checked' : ''}> Hızlı tur animasyonu</label>
      <div class="actions"><button class="btn primary" id="s-ok">Tamam</button></div>`, true);
    const save = () => { try { localStorage.setItem(SET_KEY, JSON.stringify(s)); } catch { /* yoksay */ } };
    const bind = (id, key, fn) => $(id).addEventListener('input', (e) => { s[key] = e.target.type === 'checkbox' ? e.target.checked : +e.target.value; save(); fn && fn(); });
    bind('s-vol', 'volume', () => this.snd.apply()); bind('s-mus', 'music', () => { this.snd.apply(); if (s.music <= 0) this.snd.stopMusic(); }); bind('s-sfx', 'sfx', () => this.snd.apply());
    bind('s-cloud', 'clouds', () => { this.view.cloudsOn = s.clouds; }); bind('s-hq', 'hq', () => { this.view.maxDpr = s.hq ? 2 : 1.25; this.view.resize(); this.ovl.resize(); }); bind('s-fast', 'fast');
    $('s-ok').addEventListener('click', () => this.closeModal());
  }
  showHelp() {
    this.openModal(`<p class="kicker">Nasıl oynanır</p><h2>Hükümranlık</h2><div class="help"><dl>
      <dt>Amaç</dt><dd>Dünyadaki eyaletlerin yarısını ele geçir. Tüm eyaletlerini kaybedersen oyun biter.</dd>
      <dt>Tur</dt><dd>Her tur bir ay. Emirlerini ver, sonra <b>Turu bitir</b>. Tüm ülkelerin orduları aynı anda yürür.</dd>
      <dt>Asker ve altın</dt><dd>Eyaletlerin gelir ve asker kaynağı üretir. Ordunun bakımı altın yer; hazine eksiye düşerse askerler dağılır.</dd>
      <dt>Ordu gönder</dt><dd>Kendi eyaletine dokun, sonra komşu bir eyalete dokun. Yeşil: kendi toprağın. Kırmızı: savaştığın ülke. Kıyılar arasında deniz yolları da vardır.</dd>
      <dt>Savaş</dt><dd>Saldıran, savunanın askerini arazi (dağ ×1,55), kale ve başkent çarpanlarıyla birlikte yenmeli. Pencere kazanma olasılığını gösterir.</dd>
      <dt>Diplomasi</dt><dd>Yabancı bir eyalete dokun: savaş ilan et, barış ya da ittifak teklif et. Savunanın müttefikleri savaşa girer.</dd>
      <dt>Kısayollar</dt><dd>Fare tekerleği ya da iki parmakla yakınlaş, sürükleyerek kaydır. Enter: turu bitir · M: harita modu · Esc: seçimi bırak.</dd></dl></div>
      <div class="actions"><button class="btn primary" id="h-ok">Anladım</button></div>`, true);
    $('h-ok').addEventListener('click', () => this.closeModal());
  }
  showWorld(tab = 'rank') {
    const st = this.st, P = st.player;
    const alive = st.countries.filter((c) => c.alive);
    let body = '';
    if (tab === 'rank') {
      const rows = alive.map((c) => ({ c, n: st.provsOf[c.idx].length, t: st.totalTroops(c.idx), g: st.income(c.idx).gross })).sort((a, b) => b.n - a.n);
      const top = rows.slice(0, 15); const me = rows.findIndex((r) => r.c.idx === P); if (me >= 15) top.push(rows[me]);
      body = `<table><thead><tr><th>#</th><th>Ülke</th><th class="n">Eyalet</th><th class="n">Ordu</th><th class="n">Gelir</th></tr></thead><tbody>${top.map((r) => `<tr class="${r.c.idx === P ? 'me' : ''}"><td>${rows.indexOf(r) + 1}</td><td><span class="cname"><i style="background:${rgb(r.c.color)}"></i>${esc(r.c.name)}</span></td><td class="n">${r.n}</td><td class="n">${fmt(r.t)}</td><td class="n">${r.g.toFixed(0)}</td></tr>`).join('')}</tbody></table><p class="mono">Yaşayan ülke: ${alive.length} · Zafer için ${Math.ceil(st.P * 0.5)} eyalet gerekir (sende ${st.provsOf[P]?.length || 0}).</p>`;
    } else if (tab === 'wars') {
      const wars = []; for (let a = 0; a < st.C; a++) for (let b = a + 1; b < st.C; b++) if (st.war[a * st.C + b]) wars.push([a, b]);
      wars.sort((x, y) => (y.includes(P) ? 1 : 0) - (x.includes(P) ? 1 : 0));
      body = wars.length ? `<table><tbody>${wars.slice(0, 30).map(([a, b]) => `<tr class="${a === P || b === P ? 'me' : ''}"><td><span class="cname"><i style="background:${rgb(st.countries[a].color)}"></i>${esc(st.countries[a].name)}</span></td><td>⚔</td><td><span class="cname"><i style="background:${rgb(st.countries[b].color)}"></i>${esc(st.countries[b].name)}</span></td><td class="n">${st.turn - st.warStart[a * st.C + b]} tur</td></tr>`).join('')}</tbody></table>` : '<p>Dünyada şu an savaş yok.</p>';
    } else {
      const al = st.alliesOf(P), en = st.enemiesOf(P); const tr = st.countries.filter((c) => c.alive && st.truce[P * st.C + c.idx] > 0);
      const li = (arr) => arr.length ? arr.map((x) => `<span class="cname" style="margin-right:12px"><i style="background:${rgb(st.countries[x].color)}"></i>${esc(st.countries[x].name)}</span>`).join('') : '<span class="mono">yok</span>';
      body = `<p><b>Müttefikler:</b> ${li(al)}</p><p><b>Savaştığın ülkeler:</b> ${li(en)}</p><p><b>Ateşkes:</b> ${li(tr.map((c) => c.idx))}</p>`;
    }
    this.openModal(`<p class="kicker">Dünya · ${st.dateText}</p><h2>Dünyanın durumu</h2><div class="tabs"><button data-t="rank" class="${tab === 'rank' ? 'on' : ''}">Sıralama</button><button data-t="wars" class="${tab === 'wars' ? 'on' : ''}">Savaşlar</button><button data-t="mine" class="${tab === 'mine' ? 'on' : ''}">İlişkilerim</button></div>${body}<div class="actions"><button class="btn primary" id="w-ok">Kapat</button></div>`, true);
    document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => { this.snd.play('click'); this.showWorld(b.dataset.t); }));
    $('w-ok').addEventListener('click', () => this.closeModal());
  }
}

const app = new App();
const start = () => app.boot().catch((e) => { console.error(e); window.__ready = true; });
if (window.claude?.hot?.ready) window.claude.hot.ready(start); else start();
