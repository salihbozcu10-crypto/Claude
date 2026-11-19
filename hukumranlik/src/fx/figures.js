// Haritadaki küçük figürler (2B tuval): yürüyen askerler, sancaktar, gemi, savaş sahnesi, yapı simgeleri
// Ölçek s = 1 iken bir asker ≈ 19 px boyundadır. Koordinatlar ekran pikseli; (x, y) ayak noktasıdır.
const FONT_NUM = '"IBM Plex Mono", ui-monospace, Menlo, monospace';
const rgb = (c, k = 1, a = 1) => `rgba(${Math.min(255, c[0] * k) | 0},${Math.min(255, c[1] * k) | 0},${Math.min(255, c[2] * k) | 0},${a})`;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const easeOut = (t) => 1 - (1 - t) * (1 - t);

// Asker. pose: 'march' (tüfek omuzda) | 'aim' (nişan) | 'flag' (sancak taşır). walk: yürüme evresi (radyan) ya da null.
// fall: 0..1 yere düşüş. Geri döndürür: namlu ucunun ekran konumu (nişan pozunda).
export function soldier(g, x, y, s, col, dir, walk, pose = 'march', fall = 0, alpha = 1, time = 0) {
  if (alpha <= 0.01) return null;
  g.save(); g.globalAlpha = alpha; g.translate(x, y);
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(0, 0.3 * s, 4.6 * s, 1.5 * s, 0, 0, 6.283); g.fill();
  if (fall > 0) g.rotate(-dir * easeOut(fall) * 1.5);
  g.scale(dir, 1);
  const lo = walk == null ? 0 : Math.sin(walk) * 2.8 * s; const bob = walk == null ? 0 : -Math.abs(Math.sin(walk)) * 0.9 * s;
  g.translate(0, bob); g.lineCap = 'round'; g.lineJoin = 'round';
  const hip = -6.2 * s;
  g.strokeStyle = '#26221d'; g.lineWidth = 2 * s;
  g.beginPath(); g.moveTo(0.4 * s, hip); g.lineTo(0.4 * s + lo, -0.3 * s); g.moveTo(-0.4 * s, hip); g.lineTo(-0.4 * s - lo, -0.3 * s); g.stroke();
  g.fillStyle = rgb(col); g.strokeStyle = 'rgba(12,10,8,0.85)'; g.lineWidth = 0.7 * s;
  g.beginPath(); g.moveTo(-2.5 * s, hip + 1 * s); g.lineTo(2.6 * s, hip + 1 * s); g.lineTo(2.2 * s, -12.3 * s); g.lineTo(-2.1 * s, -12.3 * s); g.closePath(); g.fill(); g.stroke();
  g.strokeStyle = 'rgba(245,240,225,0.9)'; g.lineWidth = 0.65 * s; g.beginPath(); g.moveTo(-1.9 * s, -11.8 * s); g.lineTo(2.2 * s, hip + 1.3 * s); g.stroke();
  g.fillStyle = '#e6bf94'; g.beginPath(); g.arc(0.4 * s, -14.3 * s, 2 * s, 0, 6.283); g.fill();
  g.fillStyle = '#1c1916'; g.fillRect(-1.7 * s, -18.6 * s, 4.1 * s, 3.4 * s); g.fillRect(-0.4 * s, -15.6 * s, 3.4 * s, 0.8 * s);
  g.fillStyle = '#d9b15c'; g.fillRect(-0.2 * s, -18.2 * s, 1.2 * s, 1.2 * s);
  const arm = rgb(col, 0.68);
  let tip = null;
  if (pose === 'aim') {
    g.strokeStyle = '#4a3420'; g.lineWidth = 1.2 * s; g.beginPath(); g.moveTo(-0.5 * s, -10.4 * s); g.lineTo(9.5 * s, -11.6 * s); g.stroke();
    g.strokeStyle = '#c3cad2'; g.lineWidth = 0.6 * s; g.beginPath(); g.moveTo(9.5 * s, -11.6 * s); g.lineTo(12 * s, -11.9 * s); g.stroke();
    g.strokeStyle = arm; g.lineWidth = 1.5 * s; g.beginPath(); g.moveTo(0.5 * s, -11 * s); g.lineTo(5 * s, -10.8 * s); g.stroke();
    tip = { x: x + dir * 12 * s, y: y + bob - 11.9 * s };
  } else if (pose === 'flag') {
    const top = -29 * s; g.strokeStyle = '#3b2a1a'; g.lineWidth = 1.1 * s; g.beginPath(); g.moveTo(2 * s, -4 * s); g.lineTo(1.4 * s, top); g.stroke();
    g.fillStyle = '#e8c76a'; g.beginPath(); g.arc(1.4 * s, top - 0.6 * s, 0.9 * s, 0, 6.283); g.fill();
    // dalgalanan sancak (rüzgâr arkaya doğru)
    const wv = Math.sin(time * 7 + x * 0.05) * 1.6 * s, wv2 = Math.sin(time * 7 + 1.7 + x * 0.05) * 1.6 * s;
    g.fillStyle = rgb(col, 1.05); g.strokeStyle = 'rgba(10,8,6,0.7)'; g.lineWidth = 0.6 * s;
    g.beginPath(); g.moveTo(1.4 * s, top + 0.5 * s); g.quadraticCurveTo(-4 * s, top - 1 * s + wv, -10 * s, top + 0.5 * s + wv2); g.lineTo(-10 * s, top + 7.5 * s + wv2); g.quadraticCurveTo(-4 * s, top + 6 * s + wv, 1.4 * s, top + 7.5 * s); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = 'rgba(255,248,230,0.85)'; g.beginPath(); g.arc(-4.4 * s, top + 4 * s + (wv + wv2) * 0.3, 1.4 * s, 0, 6.283); g.fill();
    g.strokeStyle = arm; g.lineWidth = 1.5 * s; g.beginPath(); g.moveTo(0.6 * s, -11.2 * s); g.lineTo(2 * s, -7.6 * s); g.stroke();
  } else {
    g.strokeStyle = '#4a3420'; g.lineWidth = 1.2 * s; g.beginPath(); g.moveTo(2 * s, -6 * s); g.lineTo(-1.8 * s, -19.8 * s); g.stroke();
    g.strokeStyle = '#c3cad2'; g.lineWidth = 0.6 * s; g.beginPath(); g.moveTo(-1.8 * s, -19.8 * s); g.lineTo(-2.4 * s, -22.2 * s); g.stroke();
    g.strokeStyle = arm; g.lineWidth = 1.5 * s; g.beginPath(); g.moveTo(0.6 * s, -11.2 * s); g.lineTo(1.8 * s - lo * 0.25, -7.4 * s); g.stroke();
  }
  g.restore();
  return tip;
}

// Yelkenli gemi (deniz aşırı hareketler); hafif yalpalar, arkasında köpük izi bırakır
export function ship(g, x, y, s, col, dir, time, alpha = 1) {
  if (alpha <= 0.01) return;
  g.save(); g.globalAlpha = alpha; g.translate(x, y);
  for (let k = 1; k <= 3; k++) { g.strokeStyle = `rgba(225,238,245,${0.42 - k * 0.11})`; g.lineWidth = 1 * s; g.beginPath(); g.ellipse(-dir * (5 + k * 5.2) * s, 1.2 * s, (3 + k * 2.4) * s, (0.8 + k * 0.4) * s, 0, 0, 6.283); g.stroke(); }
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.ellipse(0, 1.6 * s, 10 * s, 2 * s, 0, 0, 6.283); g.fill();
  g.rotate(Math.sin(time * 2.4) * 0.06); g.scale(dir, 1); g.lineJoin = 'round';
  g.fillStyle = '#5c3c22'; g.strokeStyle = 'rgba(10,8,6,0.85)'; g.lineWidth = 0.8 * s;
  g.beginPath(); g.moveTo(-9.5 * s, -3.6 * s); g.lineTo(10.5 * s, -3.6 * s); g.quadraticCurveTo(8.4 * s, 1.4 * s, 5.2 * s, 1.8 * s); g.lineTo(-6.6 * s, 1.8 * s); g.quadraticCurveTo(-8.8 * s, 0.2 * s, -9.5 * s, -3.6 * s); g.closePath(); g.fill(); g.stroke();
  g.strokeStyle = '#d9b15c'; g.lineWidth = 0.6 * s; g.beginPath(); g.moveTo(-8.6 * s, -2.3 * s); g.lineTo(9.6 * s, -2.3 * s); g.stroke();
  g.strokeStyle = '#3b2a1a'; g.lineWidth = 0.9 * s; g.beginPath(); g.moveTo(0.5 * s, -3.6 * s); g.lineTo(0.5 * s, -21 * s); g.moveTo(-5.2 * s, -3.6 * s); g.lineTo(-5.2 * s, -15.5 * s); g.stroke();
  const b = 1.6 + Math.sin(time * 3.1) * 0.5;
  const sail = (cx, top, w, h, band) => {
    g.fillStyle = '#efe7d3'; g.strokeStyle = 'rgba(40,30,20,0.6)'; g.lineWidth = 0.5 * s;
    g.beginPath(); g.moveTo(cx - w / 2, top); g.lineTo(cx + w / 2, top); g.quadraticCurveTo(cx + w / 2 + b * s, top + h / 2, cx + w / 2, top + h); g.lineTo(cx - w / 2, top + h); g.quadraticCurveTo(cx - w / 2 + b * s, top + h / 2, cx - w / 2, top); g.closePath(); g.fill(); g.stroke();
    if (band) { g.fillStyle = rgb(col); g.fillRect(cx - w / 2 + 0.4 * s, top + h * 0.38, w - 0.8 * s + b * 0.6 * s, h * 0.24); }
  };
  sail(0.5 * s, -19.5 * s, 9 * s, 7.5 * s, false); sail(0.5 * s, -11.6 * s, 10 * s, 7 * s, true); sail(-5.2 * s, -14.6 * s, 6.6 * s, 9.5 * s, false);
  const wv = Math.sin(time * 8) * 1.2 * s; g.fillStyle = rgb(col, 1.1); g.beginPath(); g.moveTo(0.5 * s, -21 * s); g.quadraticCurveTo(-3 * s, -22 * s + wv, -6.5 * s, -20.4 * s + wv); g.lineTo(0.5 * s, -18.6 * s); g.closePath(); g.fill();
  g.restore();
}

// Asker sayısı etiketi (yürüyen ordunun üstünde)
export function pill(g, x, y, text, col, attack, alpha = 1) {
  if (alpha <= 0.01) return;
  g.save(); g.globalAlpha = alpha; g.font = `700 11px ${FONT_NUM}`; const tw = g.measureText(text).width; const w = tw + 14, h = 16;
  g.fillStyle = 'rgba(14,16,20,0.86)'; rr(g, x - w / 2, y - h / 2, w, h, 4); g.fill();
  g.fillStyle = rgb(col); rr(g, x - w / 2, y - h / 2, 4, h, 2); g.fill();
  g.lineWidth = 1.2; g.strokeStyle = attack ? '#ff6b4a' : 'rgba(240,232,212,0.5)'; rr(g, x - w / 2, y - h / 2, w, h, 4); g.stroke();
  g.fillStyle = '#f6efdc'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, x + 2, y + 0.5);
  g.restore();
}

// Savaş sahnesi: saldıranlar yaklaşır, iki hat karşılıklı ateş eder, kaybedenler düşer ya da kaçar
// B: { t, delay, life, att, def (renkler), won, dir (saldırının ekran yönü ±1), nA, nD, seed }
export const BATTLE_RESOLVE = 1.25;
export function battleScene(g, B, x, y, s, time) {
  const t = B.t - B.delay; if (t < 0 || t > B.life) return;
  const k = t / B.life; const fadeAll = t < 0.12 ? t / 0.12 : k > 0.86 ? (1 - k) / 0.14 : 1;
  const side = B.dir; const gap = 7.5 * s; const app = easeOut(clamp01(t / 0.32));
  const R = (i) => { const v = Math.sin((B.seed + i) * 127.1) * 43758.5453; return v - Math.floor(v); };
  const figs = [];
  const nA = B.nA, nD = B.nD;
  for (let i = 0; i < nA; i++) {
    const row = i - (nA - 1) / 2; const depth = (i % 2) * 2.2 * s;
    // kaybeden taraf: iki asker çatışmada düşer, kalanlar sonunda geri kaçar
    const lose = !B.won; const fallAt = lose ? (i === 0 ? 0.62 : i === 2 ? 0.95 : 99) : (i === 1 && R(i) < 0.6 ? 0.85 : 99);
    let px = x - side * (gap + depth + (1 - app) * 26 * s), py = y + row * 5.2 * s;
    let dir = side, pose = t > 0.3 && t < BATTLE_RESOLVE ? 'aim' : 'march', walk = t < 0.32 ? t * 16 + i : null, fall = 0, a = fadeAll;
    if (t > fallAt) fall = clamp01((t - fallAt) / 0.35);
    if (lose && t > BATTLE_RESOLVE && fall === 0) { const r = t - BATTLE_RESOLVE; dir = -side; walk = r * 18 + i; pose = 'march'; px -= side * r * 34 * s; a *= clamp01(1 - r / 0.55); }
    if (fall > 0 && t > BATTLE_RESOLVE + 0.3) a *= clamp01(1 - (t - BATTLE_RESOLVE - 0.3) / 0.4);
    figs.push({ x: px, y: py, dir, pose, walk, fall, a, col: B.att, i, side: 0 });
  }
  for (let i = 0; i < nD; i++) {
    const row = i - (nD - 1) / 2; const depth = (i % 2) * 2.2 * s;
    const lose = B.won; const fallAt = lose ? (i === 1 ? 0.7 : i === 0 ? 1.0 : 99) : (i === 2 && R(i + 9) < 0.5 ? 0.9 : 99);
    let px = x + side * (gap + depth), py = y + row * 5.2 * s + 1.2 * s;
    let dir = -side, pose = t > 0.22 && t < BATTLE_RESOLVE ? 'aim' : 'march', walk = null, fall = 0, a = fadeAll;
    if (t > fallAt) fall = clamp01((t - fallAt) / 0.35);
    if (lose && t > BATTLE_RESOLVE && fall === 0) fall = clamp01((t - BATTLE_RESOLVE - R(i) * 0.15) / 0.35);
    if (fall > 0 && t > BATTLE_RESOLVE + 0.3) a *= clamp01(1 - (t - BATTLE_RESOLVE - 0.3) / 0.45);
    figs.push({ x: px, y: py, dir, pose, walk, fall, a, col: B.def, i, side: 1 });
  }
  figs.sort((p, q) => p.y - q.y);
  const flashes = [];
  for (const f of figs) {
    const tip = soldier(g, f.x, f.y, s, f.col, f.dir, f.walk, f.fall > 0 ? 'march' : f.pose, f.fall, f.a, time);
    if (tip && f.fall === 0) { const ph = (t * 5.3 + R(f.i + f.side * 17) * 1.0) % 1; if (ph < 0.16) flashes.push({ x: tip.x, y: tip.y, k: ph / 0.16, a: f.a, dir: f.dir }); }
  }
  // namlu alevi ve barut dumanı
  for (const fl of flashes) {
    g.save(); g.globalAlpha = fl.a; g.globalCompositeOperation = 'lighter';
    const r = (1 - fl.k) * 4.2 * s + 1.2 * s; const gr = g.createRadialGradient(fl.x, fl.y, 0, fl.x, fl.y, r * 1.8);
    gr.addColorStop(0, 'rgba(255,255,235,1)'); gr.addColorStop(0.35, 'rgba(255,214,120,0.9)'); gr.addColorStop(1, 'rgba(255,140,40,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(fl.x + fl.dir * r * 0.6, fl.y, r * 1.8, 0, 6.283); g.fill();
    g.globalCompositeOperation = 'source-over'; g.fillStyle = `rgba(215,212,205,${0.4 * (1 - fl.k) * fl.a})`; g.beginPath(); g.arc(fl.x + fl.dir * (3 + fl.k * 6) * s, fl.y - fl.k * 3 * s, (2 + fl.k * 4) * s, 0, 6.283); g.fill();
    g.restore();
  }
  // sonuç: kazananın sancağı yükselir
  if (t > BATTLE_RESOLVE) {
    const r = clamp01((t - BATTLE_RESOLVE) / 0.45); const wx = B.won ? x : x - side * gap * 0.6;
    soldier(g, wx, y + 6 * s, s * 1.08, B.won ? B.att : B.def, B.won ? side : -side, null, 'flag', 0, fadeAll * r, time);
  }
}

// Yapı simgeleri (kale, pazar, kışla) — eyalet rozetinin yanında
export function buildingIcon(g, kind, x, y, s, lvl = 1, alpha = 1) {
  g.save(); g.globalAlpha = alpha; g.translate(x, y); g.lineJoin = 'round';
  g.fillStyle = 'rgba(14,16,20,0.82)'; g.beginPath(); g.arc(0, 0, 7.2 * s, 0, 6.283); g.fill();
  g.strokeStyle = 'rgba(217,177,92,0.8)'; g.lineWidth = 1; g.stroke();
  if (kind === 'fort') {
    g.fillStyle = '#d8cfbb'; const tower = (cx) => { g.beginPath(); g.moveTo(cx - 2.2 * s, 4 * s); g.lineTo(cx - 2.2 * s, -2.6 * s); for (let i = 0; i < 3; i++) { const bx = cx - 2.2 * s + i * 1.6 * s; g.lineTo(bx, -4 * s); g.lineTo(bx + 0.8 * s, -4 * s); g.lineTo(bx + 0.8 * s, -2.6 * s); g.lineTo(bx + 1.6 * s, -2.6 * s); } g.lineTo(cx + 2.2 * s, 4 * s); g.closePath(); g.fill(); };
    if (lvl >= 2) { tower(-2.4 * s); tower(2.4 * s); } else tower(0);
    g.fillStyle = '#2a241c'; g.fillRect(-0.8 * s, 1.4 * s, 1.6 * s, 2.6 * s);
  } else if (kind === 'market') {
    g.fillStyle = '#f2c14e'; g.beginPath(); g.arc(0, 0.3 * s, 4 * s, 0, 6.283); g.fill(); g.strokeStyle = '#8a6a1e'; g.lineWidth = 0.9 * s; g.stroke();
    g.beginPath(); g.arc(0, 0.3 * s, 2.3 * s, 0, 6.283); g.stroke(); g.fillStyle = '#fff3c4'; g.beginPath(); g.arc(-1.3 * s, -1 * s, 0.8 * s, 0, 6.283); g.fill();
  } else {
    g.fillStyle = '#c9b48a'; g.beginPath(); g.moveTo(0, -4.4 * s); g.lineTo(4.6 * s, 3.6 * s); g.lineTo(-4.6 * s, 3.6 * s); g.closePath(); g.fill();
    g.fillStyle = '#3a2f22'; g.beginPath(); g.moveTo(0, -0.6 * s); g.lineTo(1.6 * s, 3.6 * s); g.lineTo(-1.6 * s, 3.6 * s); g.closePath(); g.fill();
    g.strokeStyle = '#7a1f17'; g.lineWidth = 0.8 * s; g.beginPath(); g.moveTo(0, -4.4 * s); g.lineTo(0, -6.6 * s); g.stroke();
  }
  g.restore();
}

export function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
