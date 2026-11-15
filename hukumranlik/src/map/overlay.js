// Harita üstü katman (2B tuval): ülke adları, eyalet adları, asker rozetleri, emir okları, yürüyen ordular, yüzen yazılar
import { fmt } from '../game/state.js';

const FONT_MAP = '"IM Fell English SC", "Cormorant SC", Georgia, serif';
const FONT_UI = '"Alegreya Sans", "Segoe UI", system-ui, sans-serif';
const FONT_NUM = '"IBM Plex Mono", ui-monospace, Menlo, monospace';
const css = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export class Overlay {
  constructor(canvas, view, st) {
    this.c = canvas; this.g = canvas.getContext('2d'); this.view = view; this.st = st; this.world = st.world;
    this.labels = []; this.floaters = []; this.marches = []; this.markers = []; this.pt = { x: 0, y: 0, z: 0, s: 1 }; this.pt2 = { x: 0, y: 0, z: 0, s: 1 };
    this.dispOwner = null; this.dispTroops = null; this.showCounters = true;
    // yazı tipi yüklenince harf genişlikleri yeniden ölçülür
    this.fontGen = 0; try { document.fonts?.addEventListener?.('loadingdone', () => { this.fontGen++; this.dirty = true; }); } catch { /* yoksay */ }
    this.resize();
  }
  resize() { const d = Math.min(devicePixelRatio || 1, 2); this.dpr = d; this.c.width = Math.round(innerWidth * d); this.c.height = Math.round(innerHeight * d); this.dirty = true; }

  // Ülke etiketleri: en büyük bağlı toprak parçasına göre konum, yön ve boyut
  computeLabels(owner = this.st.owner) {
    const st = this.st, W = this.world; const out = [];
    const byC = new Map(); for (let p = 1; p <= st.P; p++) { const o = owner[p]; if (!byC.has(o)) byC.set(o, []); byC.get(o).push(p); }
    for (const [ci, ps] of byC) {
      const c = st.countries[ci]; const seen = new Set(); let bestComp = null, bestA = 0;
      for (const p of ps) {
        if (seen.has(p)) continue; const comp = [p]; seen.add(p); let area = 0;
        for (let h = 0; h < comp.length; h++) { const u = comp[h]; area += W.provinces[u].area; for (const e of W.provinces[u].nb) if (!e.sea && owner[e.p] === ci && !seen.has(e.p)) { seen.add(e.p); comp.push(e.p); } }
        if (area > bestA) { bestA = area; bestComp = comp; }
      }
      const ref = W.provinces[bestComp[0]].cx; let sx = 0, sy = 0, sa = 0; const pts = [];
      for (const p of bestComp) { const pr = W.provinces[p]; let x = pr.cx; if (x - ref > W.W / 2) x -= W.W; else if (ref - x > W.W / 2) x += W.W; sx += x * pr.area; sy += pr.cy * pr.area; sa += pr.area; pts.push([x, pr.cy, pr.area]); }
      const mx = sx / sa, my = sy / sa; let cxx = 0, cyy = 0, cxy = 0;
      for (const [x, y, a] of pts) { const dx = x - mx, dy = y - my; cxx += dx * dx * a; cyy += dy * dy * a; cxy += dx * dy * a; }
      let ang = 0.5 * Math.atan2(2 * cxy, cxx - cyy); if (bestComp.length < 3) ang = 0; ang = Math.max(-0.6, Math.min(0.6, ang));
      const spread = Math.sqrt(Math.max(cxx, cyy) / sa) * 2.4 + Math.sqrt(bestA) * 0.5;
      // etiket noktası komşu olmayan suya düşmesin: alana en yakın eyalet merkezine yaklaştır
      let lx = mx, ly = my; let bd = Infinity, bp = bestComp[0]; for (const p of bestComp) { const pr = W.provinces[p]; const d = (pr.cx - mx) ** 2 + (pr.cy - my) ** 2; if (d < bd) { bd = d; bp = p; } }
      if (bd > bestA * 0.15) { lx = (lx + W.provinces[bp].ax) / 2; ly = (ly + W.provinces[bp].ay) / 2; }
      out.push({ c: ci, x: lx, y: ly, ang, len: spread, area: bestA, text: (c.short || c.name).toLocaleUpperCase('tr-TR') });
    }
    this.labels = out;
  }

  addFloater(x, y, text, color, opts = {}) { this.floaters.push({ x, y, text, color, t: 0, life: opts.life || 1.8, size: opts.size || 15, rise: opts.rise ?? 34, delay: opts.delay || 0 }); }
  addMarker(x, y, kind, life = 1.4) { this.markers.push({ x, y, kind, t: 0, life }); }

  draw(dt, time, ui) {
    const g = this.g, d = this.dpr, v = this.view, st = this.st, W = this.world; const w = this.c.width / d, h = this.c.height / d;
    g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, w, h);
    const px = v.pxScale; const owner = this.dispOwner || st.owner, troops = this.dispTroops || st.troops;
    const P = this.pt;
    // ---------------------------------------------------------------- ülke adları
    const nameAlpha = 1 - sstep(1.4, 2.2, px);
    if (nameAlpha > 0.01 && ui.mode !== 'terrain') {
      g.textAlign = 'center'; g.textBaseline = 'middle';
      for (const L of this.labels) {
        const size = Math.max(8, Math.min(74, L.len * px * 0.11)); if (size < 9.5) continue;
        v.project(L.x, L.y, 0, P); if (P.z <= 0 || P.x < -300 || P.x > w + 300 || P.y < -80 || P.y > h + 80) continue;
        const fs = size * Math.min(1.25, Math.max(0.7, P.s)); let a = nameAlpha * sstep(9.5, 14, fs);
        if (ui.selCountry === L.c) a = Math.min(1, a + 0.2);
        // harf aralığı: uzun ülkede geniş
        const txt = L.text; const n = L.chars ? L.chars.length : txt.length; const spacing = Math.min(fs * 0.9, Math.max(fs * 0.08, (L.len * px * 0.5 - n * fs * 0.6) / Math.max(1, n - 1)));
        if (L.gen !== this.fontGen) { g.font = `100px ${FONT_MAP}`; L.chars = [...txt]; L.w100 = L.chars.map((ch) => g.measureText(ch).width); L.gen = this.fontGen; }
        g.save(); g.translate(P.x, P.y); g.rotate(L.ang * 0.85); g.font = `${fs.toFixed(1)}px ${FONT_MAP}`;
        const kf = fs / 100; let total = 0; const ws = L.w100.map((cw) => cw * kf); for (const cw of ws) total += cw; total += spacing * (n - 1);
        let x = -total / 2; g.lineJoin = 'round';
        g.lineWidth = Math.max(2, fs * 0.16); g.strokeStyle = `rgba(16,14,12,${a * 0.55})`; g.fillStyle = `rgba(250,244,228,${a * 0.92})`;
        let i = 0; for (const ch of L.chars) { g.strokeText(ch, x + ws[i] / 2, 0); x += ws[i] + spacing; i++; }
        x = -total / 2; i = 0; for (const ch of L.chars) { g.fillText(ch, x + ws[i] / 2, 0); x += ws[i] + spacing; i++; }
        g.restore();
      }
    }
    // ---------------------------------------------------------------- eyaletler: asker rozeti, ad, başkent (çakışanlar ayıklanır)
    const counters = ui.counters !== false && this.showCounters; const showProv = counters && px > 0.95; const showAll = px > 1.05;
    const GW = (w >> 3) + 2, GH = (h >> 3) + 2;
    if (!this.grid || this.grid.length < GW * GH) this.grid = new Uint8Array(GW * GH); else this.grid.fill(0, 0, GW * GH);
    const grid = this.grid;
    const free = (x0, y0, x1, y1) => { const a = Math.max(0, x0 >> 3), b = Math.min(GW - 1, x1 >> 3), c = Math.max(0, y0 >> 3), e = Math.min(GH - 1, y1 >> 3); for (let y = c; y <= e; y++) for (let x = a; x <= b; x++) if (grid[y * GW + x]) return false; return true; };
    const mark = (x0, y0, x1, y1) => { const a = Math.max(0, x0 >> 3), b = Math.min(GW - 1, x1 >> 3), c = Math.max(0, y0 >> 3), e = Math.min(GH - 1, y1 >> 3); for (let y = c; y <= e; y++) for (let x = a; x <= b; x++) grid[y * GW + x] = 1; };
    const pool = this.pool || (this.pool = []); let nc = 0;
    for (let p = 1; p <= st.P; p++) {
      const pr = W.provinces[p]; const o = owner[p];
      v.project(pr.ax, pr.ay, 0, P); if (P.z <= 0 || P.x < -40 || P.x > w + 40 || P.y < -30 || P.y > h + 30) continue;
      const mine = o === st.player; const size = Math.sqrt(pr.area) * px * P.s;
      const pri = p === ui.sel ? 5 : ui.near && ui.near.has(p) ? 4 : mine ? 3 : ui.enemies && ui.enemies.has(o) ? 2 : 1;
      const cap = p === st.countries[o]?.capital && (px > 0.45 || (mine && counters));
      if (pri === 1 && !cap && !(showAll && counters) && !(showProv && size > 46)) continue;
      const c = pool[nc] || (pool[nc] = {}); nc++;
      c.p = p; c.x = P.x; c.y = P.y; c.o = o; c.mine = mine; c.size = size; c.pri = pri; c.cap = cap; c.t = troops[p] - (ui.committed ? ui.committed[p] || 0 : 0);
    }
    const list = pool.slice(0, nc).sort((a, b) => b.pri - a.pri || b.size - a.size);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const cs = Math.min(1.15, 0.78 + px * 0.16);
    // başkent yıldızları önce yer kaplar (küçük, her zaman görünür)
    for (const c of list) if (c.cap) { const r = Math.max(4, Math.min(8, 3 + px * 2.2)); c.sy = c.t > 0 && counters && c.size > 18 ? c.y - 15 : c.y; mark(c.x - r, c.sy - r, c.x + r, c.sy + r); }
    for (const c of list) {
      c.drawn = false;
      if (!counters || c.t <= 0 || (c.pri === 1 && !(showAll && c.size > 15))) continue;
      const txt = fmt(c.t); const wpx = (txt.length * 7.1 + 14) * cs, hpx = 17 * cs;
      const x0 = c.x - wpx / 2 - 2, y0 = c.y - hpx / 2 - 2, x1 = c.x + wpx / 2 + 2, y1 = c.y + hpx / 2 + 2;
      if (c.pri < 5 && !free(x0, y0, x1, y1)) continue;
      mark(x0, y0, x1, y1); c.drawn = true; this.counter(g, c.x, c.y, c.t, st.countries[c.o].color, c.mine, c.pri === 5, cs);
    }
    if (showProv) {
      for (const c of list) {
        if (c.size <= 46) continue;
        const fsz = Math.min(15, 9 + c.size * 0.04); g.font = `italic ${fsz.toFixed(1)}px ${FONT_UI}`; const label = st.provNames[c.p];
        const tw = g.measureText(label).width; const yy = c.y + (c.drawn ? 15 * cs : 0);
        const x0 = c.x - tw / 2 - 2, y0 = yy - fsz / 2 - 1, x1 = c.x + tw / 2 + 2, y1 = yy + fsz / 2 + 1;
        if (!free(x0, y0, x1, y1)) continue; mark(x0, y0, x1, y1);
        g.lineWidth = 3; g.strokeStyle = 'rgba(12,12,14,0.55)'; g.fillStyle = c.pri === 5 ? 'rgba(255,226,150,0.98)' : 'rgba(245,240,226,0.9)';
        g.strokeText(label, c.x, yy); g.fillText(label, c.x, yy);
      }
    }
    for (const c of list) if (c.cap) this.star(g, c.x, c.sy, Math.max(4, Math.min(8, 3 + px * 2.2)), c.mine && counters ? '#f2c14e' : '#efe6cf');
    // ---------------------------------------------------------------- emir okları
    for (const o of ui.orders || []) this.arrow(g, o.from, o.to, o.n, o.attack, time, 1);
    if (ui.preview) this.arrow(g, ui.preview.from, ui.preview.to, ui.preview.n, ui.preview.attack, time, 0.55);
    // ---------------------------------------------------------------- yürüyen ordular
    for (const m of this.marches) {
      m.t += dt; const k = Math.max(0, Math.min(1, (m.t - m.delay) / m.dur)); if (k <= 0) continue;
      const a = W.provinces[m.from], b = W.provinces[m.to]; const pa = v.project(a.ax, a.ay, 0, this.pt), sx = pa.x, sy = pa.y; const pb = v.project(b.ax, b.ay, 0, this.pt2, pa.wx);
      const e = ease(k); const mx = (sx + pb.x) / 2, my = (sy + pb.y) / 2 - Math.hypot(pb.x - sx, pb.y - sy) * (m.sea ? 0.3 : 0.18);
      const x = (1 - e) * (1 - e) * sx + 2 * (1 - e) * e * mx + e * e * pb.x, y = (1 - e) * (1 - e) * sy + 2 * (1 - e) * e * my + e * e * pb.y;
      m.sx = x; m.sy = y; if (k >= 1 && !m.arrived) { m.arrived = true; m.onArrive && m.onArrive(m); }
      if (m.arrived && m.t > m.delay + m.dur + 0.25) continue;
      this.banner(g, x, y - 10 - Math.abs(Math.sin(m.t * 9)) * 3, m.n, st.countries[m.owner].color, m.attack, Math.min(1, k * 4) * (m.arrived ? 1 - Math.min(1, (m.t - m.delay - m.dur) / 0.25) : 1));
    }
    this.marches = this.marches.filter((m) => !(m.arrived && m.t > m.delay + m.dur + 0.25));
    // ---------------------------------------------------------------- savaş işaretleri
    for (const mk of this.markers) {
      mk.t += dt; const P2 = v.project(mk.x, mk.y, 0, this.pt); const k = mk.t / mk.life; const a = 1 - k;
      if (mk.kind === 'swords') this.swords(g, P2.x, P2.y - 6, 13 + 10 * Math.sin(Math.min(1, k * 4) * Math.PI), a);
      else if (mk.kind === 'flag') this.flag(g, P2.x, P2.y, mk.color, Math.min(1, k * 3), a);
    }
    this.markers = this.markers.filter((m) => m.t < m.life);
    // ---------------------------------------------------------------- yüzen yazılar
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const f of this.floaters) {
      f.t += dt; const k = (f.t - f.delay) / f.life; if (k < 0) continue; const P2 = v.project(f.x, f.y, 0, this.pt);
      const a = k < 0.15 ? k / 0.15 : 1 - Math.max(0, (k - 0.6) / 0.4); g.font = `700 ${f.size}px ${FONT_NUM}`;
      g.lineWidth = 3.5; g.strokeStyle = `rgba(10,10,12,${a * 0.75})`; g.fillStyle = f.color.startsWith('#') ? f.color : f.color; g.globalAlpha = Math.max(0, a);
      const yy = P2.y - 18 - ease(Math.min(1, k)) * f.rise; g.strokeText(f.text, P2.x, yy); g.fillText(f.text, P2.x, yy); g.globalAlpha = 1;
    }
    this.floaters = this.floaters.filter((f) => f.t < f.delay + f.life);
  }

  counter(g, x, y, n, col, mine, sel, s) {
    const txt = fmt(n); g.font = `600 ${(11.5 * s).toFixed(1)}px ${FONT_NUM}`; const tw = g.measureText(txt).width; const wpx = tw + 14 * s, hpx = 17 * s;
    g.fillStyle = 'rgba(14,16,20,0.82)'; this.rr(g, x - wpx / 2, y - hpx / 2, wpx, hpx, 4 * s); g.fill();
    g.fillStyle = css(col, 1); this.rr(g, x - wpx / 2, y - hpx / 2, 4 * s, hpx, 2 * s); g.fill();
    g.lineWidth = sel ? 2 : 1; g.strokeStyle = sel ? '#f2c14e' : mine ? 'rgba(242,193,78,0.75)' : 'rgba(240,232,212,0.35)'; this.rr(g, x - wpx / 2, y - hpx / 2, wpx, hpx, 4 * s); g.stroke();
    g.fillStyle = '#f3ecda'; g.fillText(txt, x + 2 * s, y + 0.5);
  }
  banner(g, x, y, n, col, attack, a) {
    g.globalAlpha = a; const txt = fmt(n); g.font = `700 12px ${FONT_NUM}`; const tw = g.measureText(txt).width;
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(x, y + 18, 12, 4, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#2a241c'; g.lineWidth = 2; g.beginPath(); g.moveTo(x - tw / 2 - 8, y + 16); g.lineTo(x - tw / 2 - 8, y - 12); g.stroke();
    g.fillStyle = css(col, 1); g.beginPath(); g.moveTo(x - tw / 2 - 7, y - 12); g.lineTo(x + tw / 2 + 8, y - 12); g.lineTo(x + tw / 2 + 3, y - 3); g.lineTo(x + tw / 2 + 8, y + 6); g.lineTo(x - tw / 2 - 7, y + 6); g.closePath(); g.fill();
    g.strokeStyle = attack ? '#ff6b4a' : 'rgba(255,255,255,0.6)'; g.lineWidth = 1.5; g.stroke();
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 3; g.strokeText(txt, x, y - 3); g.fillText(txt, x, y - 3); g.globalAlpha = 1;
  }
  arrow(g, from, to, n, attack, time, alpha) {
    const W = this.world, v = this.view; const a = v.project(W.provinces[from].ax, W.provinces[from].ay, 0, this.pt), sx = a.x, sy = a.y; const b = v.project(W.provinces[to].ax, W.provinces[to].ay, 0, this.pt2, a.wx);
    const len = Math.hypot(b.x - sx, b.y - sy); if (len < 4) return; const mx = (sx + b.x) / 2, my = (sy + b.y) / 2 - len * 0.2;
    const col = attack ? '232,74,52' : '96,206,128';
    g.save(); g.globalAlpha = alpha; g.lineCap = 'round';
    g.strokeStyle = 'rgba(10,10,10,0.55)'; g.lineWidth = 7; g.beginPath(); g.moveTo(sx, sy); g.quadraticCurveTo(mx, my, b.x, b.y); g.stroke();
    g.strokeStyle = `rgba(${col},0.95)`; g.lineWidth = 3.5; g.setLineDash([10, 7]); g.lineDashOffset = -time * 28; g.beginPath(); g.moveTo(sx, sy); g.quadraticCurveTo(mx, my, b.x, b.y); g.stroke(); g.setLineDash([]);
    const tx = b.x - mx, ty = b.y - my, tl = Math.hypot(tx, ty) || 1, ux = tx / tl, uy = ty / tl;
    g.fillStyle = `rgba(${col},1)`; g.strokeStyle = 'rgba(10,10,10,0.6)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(b.x + ux * 4, b.y + uy * 4); g.lineTo(b.x - ux * 13 - uy * 8, b.y - uy * 13 + ux * 8); g.lineTo(b.x - ux * 13 + uy * 8, b.y - uy * 13 - ux * 8); g.closePath(); g.fill(); g.stroke();
    if (n) { const qx = 0.25 * sx + 0.5 * mx + 0.25 * b.x, qy = 0.25 * sy + 0.5 * my + 0.25 * b.y; const txt = fmt(n); g.font = `700 11px ${FONT_NUM}`; const tw = g.measureText(txt).width; g.fillStyle = `rgba(${col},0.95)`; this.rr(g, qx - tw / 2 - 5, qy - 8, tw + 10, 16, 8); g.fill(); g.fillStyle = '#10100f'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, qx, qy + 0.5); }
    g.restore();
  }
  star(g, x, y, r, col) { g.save(); g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.closePath(); g.fillStyle = col; g.strokeStyle = 'rgba(20,16,10,0.8)'; g.lineWidth = 1.5; g.stroke(); g.fill(); g.restore(); }
  swords(g, x, y, s, a) {
    g.save(); g.globalAlpha = Math.max(0, a); g.translate(x, y); g.lineCap = 'round';
    for (const sg of [1, -1]) { g.save(); g.rotate(sg * 0.78); g.strokeStyle = 'rgba(12,10,8,0.8)'; g.lineWidth = 5; g.beginPath(); g.moveTo(0, -s); g.lineTo(0, s * 0.7); g.stroke(); g.strokeStyle = '#eee6d2'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(0, -s); g.lineTo(0, s * 0.45); g.stroke(); g.strokeStyle = '#c9a24a'; g.lineWidth = 3; g.beginPath(); g.moveTo(-s * 0.32, s * 0.45); g.lineTo(s * 0.32, s * 0.45); g.stroke(); g.beginPath(); g.moveTo(0, s * 0.45); g.lineTo(0, s * 0.75); g.stroke(); g.restore(); }
    g.restore();
  }
  flag(g, x, y, col, rise, a) {
    g.save(); g.globalAlpha = Math.max(0, a); const top = y - 30 * rise;
    g.strokeStyle = '#2a241c'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(x, y); g.lineTo(x, top); g.stroke();
    g.fillStyle = css(col); g.beginPath(); g.moveTo(x, top); const wv = Math.sin(performance.now() / 120) * 2; g.quadraticCurveTo(x + 9, top + 2 + wv, x + 18, top + wv); g.lineTo(x + 18, top + 11 + wv); g.quadraticCurveTo(x + 9, top + 13 - wv, x, top + 11); g.closePath(); g.fill(); g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 1; g.stroke();
    g.restore();
  }
  rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
}
