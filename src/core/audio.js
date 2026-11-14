// Ses motoru: tüm sesler WebAudio ile sentezlenir (dış dosya yok).
// Konumsal ses, mesafeye göre boğulma, ses hızı gecikmesi, açık hava / iç mekân yankısı.
import { makeRng, clamp, rr } from './utils.js';

let SR = 44100;
const rng = makeRng(777);
const N = (sec) => Math.floor(sec * SR);
const buf = (sec) => new Float32Array(N(sec));
const noise = (a) => { for (let i = 0; i < a.length; i++) a[i] = rng() * 2 - 1; return a; };
function lp(a, fc) { const k = 1 - Math.exp(-2 * Math.PI * fc / SR); let y = 0; for (let i = 0; i < a.length; i++) { y += (a[i] - y) * k; a[i] = y; } return a; }
function hp(a, fc) { const k = 1 - Math.exp(-2 * Math.PI * fc / SR); let y = 0; for (let i = 0; i < a.length; i++) { y += (a[i] - y) * k; a[i] -= y; } return a; }
function bp(a, f, q) {
  const w = 2 * Math.PI * f / SR, al = Math.sin(w) / (2 * q), c = Math.cos(w); const b0 = al, b2 = -al, a0 = 1 + al, a1 = -2 * c, a2 = 1 - al;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < a.length; i++) { const x = a[i]; const y = (b0 * x + b2 * x2 - a1 * y1 - a2 * y2) / a0; x2 = x1; x1 = x; y2 = y1; y1 = y; a[i] = y; }
  return a;
}
function decay(a, tau, attack = 0.0005) { for (let i = 0; i < a.length; i++) { const t = i / SR; a[i] *= Math.min(1, t / attack) * Math.exp(-t / tau); } return a; }
function mix(dst, src, at = 0, g = 1) { const o = N(at); for (let i = 0; i < src.length && i + o < dst.length; i++) dst[i + o] += src[i] * g; return dst; }
function norm(a, peak = 0.9) { let m = 1e-6; for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i])); const s = peak / m; for (let i = 0; i < a.length; i++) a[i] *= s; return a; }
function sat(a, drive) { for (let i = 0; i < a.length; i++) a[i] = Math.tanh(a[i] * drive); return a; }
function sweep(sec, f0, f1, tau, curve = 1) { const a = buf(sec); let ph = 0; for (let i = 0; i < a.length; i++) { const t = i / a.length; const f = f1 + (f0 - f1) * Math.pow(1 - t, curve * 3); ph += 2 * Math.PI * f / SR; a[i] = Math.sin(ph) * Math.exp(-(i / SR) / tau); } return a; }
function tone(sec, f, tau) { const a = buf(sec); for (let i = 0; i < a.length; i++) a[i] = Math.sin(2 * Math.PI * f * i / SR) * Math.exp(-(i / SR) / tau); return a; }
function click(f, q, tau, sec = 0.05) { return decay(bp(noise(buf(sec)), f, q), tau, 0.0002); }
function fadeEnds(a, t = 0.004) { const n = N(t); for (let i = 0; i < n && i < a.length; i++) { a[i] *= i / n; a[a.length - 1 - i] *= i / n; } return a; }

const GEN = {
  rifleSup() {
    const o = buf(0.5);
    mix(o, decay(lp(hp(noise(buf(0.12)), 900), 5200), 0.022), 0, 1.0);
    mix(o, decay(hp(noise(buf(0.01)), 3500), 0.0012, 0.0001), 0, 0.9);
    mix(o, sweep(0.1, 190, 70, 0.03), 0, 0.8);
    mix(o, click(2600, 3, 0.006), 0.004, 0.7); mix(o, click(3900, 4, 0.005), 0.052, 0.45); mix(o, click(1500, 2.5, 0.012), 0.06, 0.3);
    mix(o, decay(lp(noise(buf(0.45)), 900), 0.11), 0.01, 0.3);
    return norm(sat(o, 1.6), 0.85);
  },
  pistolSup() {
    const o = buf(0.35);
    mix(o, decay(lp(hp(noise(buf(0.08)), 1200), 6000), 0.015), 0, 1.0); mix(o, sweep(0.07, 240, 100, 0.02), 0, 0.6);
    mix(o, click(3200, 3, 0.005), 0.003, 0.8); mix(o, click(4600, 4, 0.004), 0.04, 0.5); mix(o, decay(lp(noise(buf(0.3)), 1100), 0.07), 0.01, 0.2);
    return norm(sat(o, 1.5), 0.8);
  },
  rifleAK() {
    const o = buf(1.3);
    mix(o, decay(noise(buf(0.012)), 0.002, 0.0001), 0, 1.4);
    mix(o, decay(lp(noise(buf(0.3)), 2600), 0.05), 0, 1.3);
    mix(o, sweep(0.35, 150, 42, 0.085), 0, 1.5);
    mix(o, decay(bp(noise(buf(0.2)), 700, 1.2), 0.06), 0.005, 0.9);
    mix(o, decay(lp(noise(buf(1.2)), 1100), 0.3), 0.03, 0.42);
    mix(o, click(2200, 3, 0.008), 0.07, 0.25);
    return norm(sat(o, 2.6), 0.95);
  },
  mg() { const o = buf(1.4); mix(o, decay(noise(buf(0.014)), 0.003, 0.0001), 0, 1.4); mix(o, decay(lp(noise(buf(0.4)), 2000), 0.07), 0, 1.4); mix(o, sweep(0.45, 120, 36, 0.11), 0, 1.7); mix(o, decay(lp(noise(buf(1.3)), 900), 0.36), 0.03, 0.5); return norm(sat(o, 3), 0.95); },
  dry() { const o = buf(0.08); mix(o, click(2800, 5, 0.004), 0, 1); mix(o, click(900, 3, 0.01), 0.002, 0.5); return norm(o, 0.5); },
  magOut() { const o = buf(0.35); mix(o, click(1800, 3, 0.008), 0, 1); mix(o, decay(bp(noise(buf(0.2)), 2500, 1.5), 0.05, 0.03), 0.03, 0.5); mix(o, click(700, 2, 0.02), 0.12, 0.6); return norm(o, 0.6); },
  magIn() { const o = buf(0.3); mix(o, decay(bp(noise(buf(0.12)), 2200, 1.2), 0.03, 0.04), 0, 0.4); mix(o, click(520, 2, 0.022), 0.1, 1); mix(o, click(2400, 4, 0.007), 0.105, 0.9); mix(o, tone(0.1, 1900, 0.02), 0.105, 0.15); return norm(o, 0.7); },
  bolt() { const o = buf(0.4); mix(o, click(1500, 3, 0.01), 0, 0.8); mix(o, decay(bp(noise(buf(0.1)), 3000, 2), 0.03, 0.02), 0.02, 0.4); mix(o, click(2300, 5, 0.008), 0.14, 1); mix(o, tone(0.2, 2750, 0.035), 0.14, 0.22); mix(o, tone(0.2, 4100, 0.02), 0.14, 0.12); return norm(o, 0.75); },
  selector() { const o = buf(0.06); mix(o, click(3600, 6, 0.003), 0, 1); return norm(o, 0.35); },
  cloth() { const o = buf(0.3); mix(o, decay(bp(noise(buf(0.3)), 1400, 0.7), 0.09, 0.05), 0, 1); return norm(lp(o, 3000), 0.3); },
  impDirt() { const o = buf(0.3); mix(o, decay(lp(noise(buf(0.1)), 700), 0.03), 0, 1); mix(o, decay(bp(noise(buf(0.25)), 2600, 0.8), 0.07, 0.01), 0.01, 0.35); return norm(o, 0.7); },
  impConcrete() { const o = buf(0.35); mix(o, decay(bp(noise(buf(0.06)), 2800, 1), 0.012), 0, 1); mix(o, decay(lp(noise(buf(0.08)), 900), 0.02), 0, 0.7); for (let i = 0; i < 6; i++) mix(o, click(rr(2500, 6000), 6, 0.004, 0.03), rr(0.03, 0.28), rr(0.08, 0.25)); return norm(o, 0.75); },
  impMetal() { const o = buf(0.5); mix(o, click(3000, 2, 0.004), 0, 1); for (const [f, t, g] of [[1850, 0.09, 0.5], [3120, 0.12, 0.45], [4770, 0.07, 0.3], [6900, 0.05, 0.2]]) mix(o, tone(0.5, f, t), 0, g); return norm(o, 0.7); },
  impWood() { const o = buf(0.25); mix(o, tone(0.15, 380, 0.018), 0, 1); mix(o, tone(0.1, 760, 0.012), 0, 0.5); mix(o, decay(bp(noise(buf(0.1)), 1800, 1), 0.015), 0, 0.7); return norm(o, 0.7); },
  impGlass() { const o = buf(0.5); mix(o, decay(hp(noise(buf(0.05)), 4000), 0.01), 0, 1); for (let i = 0; i < 12; i++) mix(o, tone(0.2, rr(3000, 9000), rr(0.02, 0.06)), rr(0, 0.3), rr(0.05, 0.2)); return norm(o, 0.6); },
  hitFlesh() { const o = buf(0.2); mix(o, decay(lp(noise(buf(0.1)), 480), 0.022), 0, 1); mix(o, sweep(0.08, 160, 70, 0.02), 0, 0.8); mix(o, decay(bp(noise(buf(0.05)), 1700, 1), 0.01), 0, 0.3); return norm(o, 0.8); },
  ricochet() { const o = buf(0.6); mix(o, click(3200, 2, 0.004), 0, 0.9); const w = buf(0.55); let ph = 0; for (let i = 0; i < w.length; i++) { const t = i / w.length; const f = 2600 * Math.pow(0.32, t) * (1 + 0.035 * Math.sin(t * 60)); ph += 2 * Math.PI * f / SR; w[i] = (Math.sin(ph) + 0.3 * Math.sin(ph * 2.01)) * Math.exp(-t * 4.2) * Math.min(1, t * 60); } mix(o, w, 0.004, 0.5); return norm(o, 0.6); },
  whiz() { const o = buf(0.22); const n = noise(buf(0.2)); const w = buf(0.2); let y1 = 0, y2 = 0, x1 = 0, x2 = 0; for (let i = 0; i < n.length; i++) { const t = i / n.length; const f = 5200 * Math.pow(0.24, t); const wv = 2 * Math.PI * f / SR, al = Math.sin(wv) / 5, c = Math.cos(wv); const y = (al * n[i] - al * x2 + 2 * c * y1 - (1 - al) * y2) / (1 + al); x2 = x1; x1 = n[i]; y2 = y1; y1 = y; w[i] = y * Math.sin(Math.PI * Math.min(1, t * 1.15)) ** 1.5; } mix(o, w, 0, 1); return norm(o, 0.7); },
  crack() { const o = buf(0.12); mix(o, decay(noise(buf(0.004)), 0.0006, 0.00005), 0, 1.2); mix(o, decay(hp(noise(buf(0.06)), 2500), 0.008), 0, 0.8); mix(o, decay(lp(noise(buf(0.1)), 1500), 0.03), 0.002, 0.3); return norm(o, 0.9); },
  explosion() {
    const o = buf(3.2);
    mix(o, decay(noise(buf(0.02)), 0.004, 0.0001), 0, 1.5);
    mix(o, sweep(1.6, 95, 24, 0.42, 0.7), 0, 2.2);
    const n = noise(buf(2.2)); let y = 0; for (let i = 0; i < n.length; i++) { const t = i / SR; const fc = 5200 * Math.exp(-t * 3.2) + 160; const k = 1 - Math.exp(-2 * Math.PI * fc / SR); y += (n[i] - y) * k; n[i] = y * Math.exp(-t / 0.55); }
    mix(o, n, 0, 1.6);
    for (let i = 0; i < 24; i++) mix(o, click(rr(900, 4500), 3, 0.008, 0.05), rr(0.25, 2.4), rr(0.03, 0.14));
    mix(o, decay(lp(noise(buf(3.0)), 420), 0.9), 0.05, 0.6);
    return norm(sat(o, 2.4), 0.98);
  },
  flashbang() { const o = buf(1.2); mix(o, decay(noise(buf(0.03)), 0.006, 0.0001), 0, 1.6); mix(o, decay(hp(noise(buf(0.4)), 1500), 0.07), 0, 1.0); mix(o, sweep(0.3, 220, 60, 0.06), 0, 1.0); mix(o, decay(lp(noise(buf(1.1)), 2000), 0.25), 0.02, 0.4); return norm(sat(o, 3), 0.98); },
  casing() { const o = buf(0.3); for (const [at, g] of [[0, 1], [0.09, 0.5], [0.15, 0.25]]) for (const [f, t] of [[4300, 0.02], [6350, 0.014], [9100, 0.008]]) mix(o, tone(0.1, f * rr(0.97, 1.03), t), at, g * 0.4); return norm(o, 0.35); },
  beep() { const o = buf(0.3); mix(o, fadeEnds(tone(0.07, 1250, 9)), 0, 0.6); mix(o, fadeEnds(tone(0.07, 1650, 9)), 0.11, 0.6); mix(o, decay(bp(noise(buf(0.28)), 2400, 1.2), 0.5), 0, 0.12); return norm(o, 0.35); },
  staticOut() { const o = buf(0.25); mix(o, fadeEnds(bp(noise(buf(0.2)), 2100, 0.9), 0.01), 0, 1); mix(o, click(1800, 3, 0.006), 0.2, 0.8); return norm(o, 0.22); },
  objective() { const o = buf(0.9); for (const [f, at] of [[660, 0], [880, 0.14], [1320, 0.28]]) { mix(o, decay(tone(0.6, f, 0.22), 1, 0.01), at, 0.5); mix(o, decay(tone(0.6, f * 2, 0.12), 1, 0.01), at, 0.12); } return norm(o, 0.35); },
  uiClick() { const o = buf(0.05); mix(o, click(2200, 4, 0.006), 0, 1); return norm(o, 0.25); },
  pin() { const o = buf(0.35); mix(o, click(4200, 6, 0.004), 0, 1); mix(o, tone(0.3, 5200, 0.05), 0.01, 0.3); mix(o, tone(0.3, 7600, 0.03), 0.01, 0.2); mix(o, click(2600, 5, 0.006), 0.16, 0.7); return norm(o, 0.5); },
  bounce() { const o = buf(0.2); mix(o, tone(0.15, 620, 0.02), 0, 1); mix(o, tone(0.15, 1480, 0.015), 0, 0.6); mix(o, click(2400, 2, 0.006), 0, 0.8); return norm(o, 0.6); },
  nvg() { const o = buf(0.9); mix(o, click(3000, 5, 0.004), 0, 0.8); const w = buf(0.85); let ph = 0; for (let i = 0; i < w.length; i++) { const t = i / w.length; const f = 2200 + 7800 * (1 - Math.exp(-t * 4)); ph += 2 * Math.PI * f / SR; w[i] = Math.sin(ph) * 0.3 * Math.sin(Math.PI * t) ** 0.6; } mix(o, w, 0.02, 0.5); return norm(o, 0.22); },
  grunt() { const o = buf(0.28); const w = buf(0.26); for (let i = 0; i < w.length; i++) { const t = i / SR; const f = 128 - t * 110; let s = 0; for (let h = 1; h < 14; h++) s += Math.sin(2 * Math.PI * f * h * t + h) / h; w[i] = s; } const a = bp(Float32Array.from(w), 620, 3), b = bp(Float32Array.from(w), 1150, 4); for (let i = 0; i < w.length; i++) { const t = i / w.length; w[i] = (a[i] + b[i] * 0.6) * Math.sin(Math.PI * Math.pow(t, 0.6)); } mix(o, w, 0, 1); mix(o, decay(bp(noise(buf(0.2)), 1500, 1), 0.06, 0.02), 0, 0.15); return norm(o, 0.5); },
  c4() { const o = buf(0.12); mix(o, fadeEnds(tone(0.09, 2900, 9), 0.003), 0, 1); return norm(o, 0.3); },
  rope() { const o = buf(0.5); mix(o, decay(bp(noise(buf(0.5)), 900, 0.8), 0.2, 0.1), 0, 1); return norm(o, 0.3); },
};

function stepGen(kind, seed) {
  const o = buf(0.3);
  if (kind === 'sand' || kind === 'dirt' || kind === 'rock') { for (let i = 0; i < 7; i++) mix(o, decay(bp(noise(buf(0.04)), rr(700, 2600), 0.8), rr(0.008, 0.02), 0.002), rr(0, 0.11), rr(0.3, 1)); mix(o, decay(lp(noise(buf(0.1)), 260), 0.03), 0, 0.9); if (kind === 'rock') mix(o, click(3200, 3, 0.004), 0.02, 0.4); }
  else if (kind === 'concrete') { mix(o, decay(lp(noise(buf(0.08)), 420), 0.022), 0, 1); mix(o, sweep(0.06, 150, 80, 0.016), 0, 0.8); mix(o, decay(bp(noise(buf(0.08)), 3200, 1), 0.02, 0.004), 0.008, 0.25); }
  else if (kind === 'metal') { mix(o, decay(lp(noise(buf(0.06)), 500), 0.02), 0, 0.8); for (const [f, t, g] of [[310, 0.07, 0.6], [742, 0.05, 0.35], [1260, 0.035, 0.25], [2140, 0.02, 0.12]]) mix(o, tone(0.28, f * rr(0.96, 1.04), t), 0, g); }
  else if (kind === 'wood') { mix(o, tone(0.2, 170 * rr(0.9, 1.1), 0.03), 0, 1); mix(o, tone(0.2, 410, 0.018), 0, 0.4); mix(o, decay(bp(noise(buf(0.06)), 1300, 1), 0.012), 0, 0.5); }
  else { mix(o, decay(lp(noise(buf(0.1)), 600), 0.03), 0, 1); }
  return norm(o, 0.6);
}

function loopGen(kind) {
  if (kind === 'wind') {
    const sec = 6, o = lp(noise(buf(sec)), 520); const m = lp(noise(buf(sec)), 0.7); let mx = 1e-6; for (let i = 0; i < m.length; i++) mx = Math.max(mx, Math.abs(m[i]));
    const g2 = bp(noise(buf(sec)), 900, 0.7);
    for (let i = 0; i < o.length; i++) { const e = 0.55 + 0.45 * m[i] / mx; o[i] = o[i] * e + g2[i] * 0.12 * e * e; }
    const x = N(0.8); for (let i = 0; i < x; i++) { const t = i / x; o[i] = o[i] * t + o[o.length - x + i] * (1 - t); }
    return norm(o.subarray(0, o.length - x), 0.5);
  }
  if (kind === 'heli') {
    const sec = 4 / 17.5 * 4; const o = buf(sec); const n = lp(noise(buf(sec)), 1400); const n2 = bp(noise(buf(sec)), 3200, 0.8);
    for (let i = 0; i < o.length; i++) { const t = i / SR; const ph = (t * 17.5) % 1; const thump = Math.exp(-ph * 7); o[i] = n[i] * (0.25 + 1.2 * thump) + Math.sin(2 * Math.PI * 52 * t) * thump * 0.9 + Math.sin(2 * Math.PI * 35 * t) * 0.3 + n2[i] * 0.12 + Math.sin(2 * Math.PI * 2380 * t) * 0.035 + Math.sin(2 * Math.PI * 3570 * t) * 0.02; }
    return norm(sat(o, 1.4), 0.8);
  }
  if (kind === 'generator') { const sec = 0.48, o = buf(sec); const n = bp(noise(buf(sec)), 1500, 0.8); for (let i = 0; i < o.length; i++) { const t = i / SR; const ph = (t * 25) % 1; o[i] = Math.sin(2 * Math.PI * 50 * t) * 0.6 + Math.sin(2 * Math.PI * 100 * t + 0.4) * 0.4 + Math.sin(2 * Math.PI * 150 * t) * 0.18 + n[i] * (0.15 + 0.6 * Math.exp(-ph * 9)); } return norm(sat(o, 1.5), 0.6); }
  if (kind === 'fire') { const sec = 3, o = lp(noise(buf(sec)), 900); for (let i = 0; i < o.length; i++) o[i] *= 0.4; for (let i = 0; i < 46; i++) mix(o, click(rr(900, 3600), 2, rr(0.002, 0.01), 0.04), rr(0, sec - 0.05), rr(0.2, 1)); return norm(fadeEnds(o, 0.05), 0.5); }
  if (kind === 'crickets') { const sec = 2.4, o = buf(sec); for (let v = 0; v < 3; v++) { const f = 4100 + v * 420, rate = 26 + v * 5, off = v * 0.37; for (let i = 0; i < o.length; i++) { const t = i / SR; const gate = ((t + off) % 0.8) < 0.5 ? 1 : 0; const p = Math.max(0, Math.sin(2 * Math.PI * rate * t)); o[i] += Math.sin(2 * Math.PI * f * t) * p * p * gate * (0.5 - v * 0.12); } } return norm(fadeEnds(o, 0.02), 0.25); }
  if (kind === 'tinnitus') { const sec = 1, o = buf(sec); for (let i = 0; i < o.length; i++) { const t = i / SR; o[i] = Math.sin(2 * Math.PI * 5200 * t) * 0.6 + Math.sin(2 * Math.PI * 7800 * t) * 0.25; } return o; }
  if (kind === 'heart') { const sec = 0.86, o = buf(sec); mix(o, sweep(0.12, 75, 42, 0.035), 0, 1); mix(o, sweep(0.12, 68, 38, 0.03), 0.24, 0.75); return norm(o, 0.8); }
  return buf(0.5);
}

function impulse(sec, tau, echoes) {
  const L = buf(sec), Rr = buf(sec);
  for (const a of [L, Rr]) { noise(a); for (let i = 0; i < a.length; i++) { const t = i / SR; a[i] *= Math.exp(-t / tau) * (t < 0.004 ? t / 0.004 : 1); } lp(a, 4200); for (const [at, g] of echoes) { const o = N(at + rr(-0.008, 0.008)); for (let i = 0; i < N(0.25) && i + o < a.length; i++) a[i + o] += (rng() * 2 - 1) * g * Math.exp(-(i / SR) / 0.07); } }
  return [L, Rr];
}

const SURF_STEP = { sand: 'sand', dirt: 'sand', rock: 'rock', concrete: 'concrete', metal: 'metal', wood: 'wood', fabric: 'sand', glass: 'concrete', flesh: 'sand', rubber: 'concrete' };

export class AudioEngine {
  constructor(game) { this.g = game; this.ctx = null; this.ready = false; this.buffers = {}; this.voices = 0; this.loops = {}; this.volume = game.settings.volume; }

  init() {
    if (this.ctx) { this.resume(); return; }
    if (this.g.testMode) return;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    try { this.ctx = new AC({ latencyHint: 'interactive' }); } catch { return; }
    const ctx = this.ctx; SR = ctx.sampleRate;
    this.master = ctx.createGain(); this.master.gain.value = this.volume;
    this.deafLP = ctx.createBiquadFilter(); this.deafLP.type = 'lowpass'; this.deafLP.frequency.value = 20000;
    this.comp = ctx.createDynamicsCompressor(); this.comp.threshold.value = -16; this.comp.knee.value = 12; this.comp.ratio.value = 7; this.comp.attack.value = 0.003; this.comp.release.value = 0.2;
    this.bus = ctx.createGain(); this.bus.connect(this.deafLP); this.deafLP.connect(this.comp); this.comp.connect(this.master); this.master.connect(ctx.destination);
    this.uiBus = ctx.createGain(); this.uiBus.connect(this.master);
    const mkBuf = (arr) => { const b = ctx.createBuffer(1, arr.length, SR); b.copyToChannel(arr, 0); return b; };
    for (const k in GEN) this.buffers[k] = mkBuf(GEN[k]());
    for (const s of ['sand', 'rock', 'concrete', 'metal', 'wood']) for (let v = 0; v < 3; v++) this.buffers[`step_${s}${v}`] = mkBuf(stepGen(s, v));
    for (const k of ['wind', 'heli', 'generator', 'fire', 'crickets', 'tinnitus', 'heart']) this.buffers['loop_' + k] = mkBuf(loopGen(k));
    const mkIR = (sec, tau, echoes) => { const [L, Rr] = impulse(sec, tau, echoes); const b = ctx.createBuffer(2, L.length, SR); b.copyToChannel(L, 0); b.copyToChannel(Rr, 1); return b; };
    this.revOut = ctx.createConvolver(); this.revOut.buffer = mkIR(2.6, 0.5, [[0.21, 0.5], [0.36, 0.34], [0.62, 0.22], [0.95, 0.12]]);
    this.revIn = ctx.createConvolver(); this.revIn.buffer = mkIR(0.9, 0.16, []);
    this.revOutG = ctx.createGain(); this.revInG = ctx.createGain(); this.revInG.gain.value = 0;
    this.revSend = ctx.createGain(); this.revSend.connect(this.revOut); this.revSend.connect(this.revIn);
    this.revOut.connect(this.revOutG); this.revIn.connect(this.revInG); this.revOutG.connect(this.bus); this.revInG.connect(this.bus);
    this.ready = true;
    this.loop('wind', { vol: 0.0 }); this.loop('tinnitus', { vol: 0 }); this.loop('heart', { vol: 0 });
    this.resume();
  }
  resume() { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume().catch(() => {}); }
  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {}); }
  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }

  _src(name, pitch) { const b = this.buffers[name]; if (!b) return null; const s = this.ctx.createBufferSource(); s.buffer = b; s.playbackRate.value = pitch || 1; return s; }

  // Konumsuz (oyuncunun kendi sesleri, arayüz)
  play(name, o = {}) {
    if (!this.ready) return; const s = this._src(name, o.pitch ?? rr(0.97, 1.03)); if (!s) return;
    const g = this.ctx.createGain(); g.gain.value = o.vol ?? 1; s.connect(g);
    if (o.pan) { const p = this.ctx.createStereoPanner(); p.pan.value = o.pan; g.connect(p); p.connect(o.ui ? this.uiBus : this.bus); } else g.connect(o.ui ? this.uiBus : this.bus);
    if (o.reverb) { const r = this.ctx.createGain(); r.gain.value = o.reverb; g.connect(r); r.connect(this.revSend); }
    s.start(this.ctx.currentTime + (o.delay || 0));
  }

  // Konumsal: mesafe zayıflaması, hava emilimi (alçak geçiren), engel arkası boğulma, ses hızı gecikmesi
  playAt(name, pos, o = {}) {
    if (!this.ready) return; const cam = this.g.camera.position; const dx = pos.x - cam.x, dy = pos.y - cam.y, dz = pos.z - cam.z; const dist = Math.hypot(dx, dy, dz);
    const max = o.max ?? 120; if (dist > max * 1.6) return; if (this.voices > 26 && (o.prio ?? 0) < 1) return;
    const s = this._src(name, o.pitch ?? rr(0.96, 1.04)); if (!s) return; const ctx = this.ctx;
    const ref = o.ref ?? 3; let gain = (o.vol ?? 1) * ref / (ref + Math.max(0, dist - ref) * (o.roll ?? 1));
    let cutoff = 20000 / (1 + dist * (o.absorb ?? 0.03));
    if (o.occlude !== false && dist > 2 && dist < 150) { if (this.g.lineBlocked && this.g.lineBlocked(cam, pos)) { cutoff = Math.min(cutoff, 1100); gain *= 0.55; } }
    const g = ctx.createGain(); g.gain.value = gain; const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = clamp(cutoff, 300, 20000);
    const p = ctx.createPanner(); p.panningModel = 'equalpower'; p.distanceModel = 'linear'; p.refDistance = 1; p.maxDistance = 10000; p.rolloffFactor = 0;
    p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z;
    s.connect(f); f.connect(g); g.connect(p); p.connect(this.bus);
    if (o.reverb) { const r = ctx.createGain(); r.gain.value = o.reverb * Math.min(1, 0.3 + dist / 60); g.connect(r); r.connect(this.revSend); }
    this.voices++; s.onended = () => { this.voices--; };
    s.start(ctx.currentTime + (o.sonic === false ? 0 : dist / 343) + (o.delay || 0));
  }

  footstep(surface, vol, pos) {
    const k = SURF_STEP[surface] || 'sand'; const name = `step_${k}${(Math.random() * 3) | 0}`;
    if (pos) this.playAt(name, pos, { vol: vol * 1.1, ref: 2, max: 28, sonic: false }); else this.play(name, { vol: vol * 0.55, pitch: rr(0.9, 1.1), pan: rr(-0.15, 0.15) });
  }

  impact(surfName, pos) {
    const map = { concrete: 'impConcrete', rock: 'impConcrete', metal: 'impMetal', wood: 'impWood', dirt: 'impDirt', sand: 'impDirt', fabric: 'impDirt', glass: 'impGlass', flesh: 'hitFlesh', rubber: 'impDirt' };
    this.playAt(map[surfName] || 'impDirt', pos, { vol: 0.8, ref: 4, max: 70 });
    if ((surfName === 'metal' || surfName === 'concrete' || surfName === 'rock') && Math.random() < 0.22) this.playAt('ricochet', pos, { vol: 0.5, ref: 5, max: 80 });
  }

  // Döngüsel sesler
  loop(name, o = {}) {
    if (!this.ready) return null; if (this.loops[name]) return this.loops[name];
    const ctx = this.ctx; const s = this._src('loop_' + name, 1); if (!s) return null; s.loop = true;
    const g = ctx.createGain(); g.gain.value = o.vol ?? 0; s.connect(g);
    const L = { src: s, gain: g, pos: o.pos || null };
    if (o.pos) { const p = ctx.createPanner(); p.panningModel = 'equalpower'; p.distanceModel = 'inverse'; p.refDistance = o.ref ?? 4; p.rolloffFactor = o.roll ?? 1; p.maxDistance = 2000; p.positionX.value = o.pos.x; p.positionY.value = o.pos.y; p.positionZ.value = o.pos.z; g.connect(p); p.connect(this.bus); L.panner = p; }
    else g.connect(name === 'tinnitus' ? this.master : this.bus);
    s.start(); this.loops[name] = L; return L;
  }
  loopVol(name, v, t = 0.2) { const L = this.loops[name]; if (L) L.gain.gain.setTargetAtTime(v, this.ctx.currentTime, t); }
  loopPos(name, pos) { const L = this.loops[name]; if (L && L.panner) { L.panner.positionX.value = pos.x; L.panner.positionY.value = pos.y; L.panner.positionZ.value = pos.z; } }
  loopRate(name, r) { const L = this.loops[name]; if (L) L.src.playbackRate.setTargetAtTime(r, this.ctx.currentTime, 0.2); }
  stopLoop(name) { const L = this.loops[name]; if (L) { try { L.src.stop(); } catch { /* yoksay */ } delete this.loops[name]; } }

  // Şafak kuşları: anlık FM cıvıltıları
  chirp() {
    if (!this.ready) return; const ctx = this.ctx, t0 = ctx.currentTime + 0.02; const o = ctx.createOscillator(), g = ctx.createGain(), p = ctx.createStereoPanner();
    const f = rr(2600, 4800); const n = (Math.random() * 4 | 0) + 2; let t = t0; g.gain.value = 0;
    for (let i = 0; i < n; i++) { const d = rr(0.05, 0.11); o.frequency.setValueAtTime(f * rr(0.9, 1.15), t); o.frequency.exponentialRampToValueAtTime(f * rr(1.1, 1.5), t + d); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(rr(0.012, 0.03), t + d * 0.3); g.gain.linearRampToValueAtTime(0, t + d); t += d + rr(0.03, 0.09); }
    p.pan.value = rr(-0.8, 0.8); o.connect(g); g.connect(p); p.connect(this.bus); const rv = ctx.createGain(); rv.gain.value = 0.5; g.connect(rv); rv.connect(this.revSend); o.start(t0); o.stop(t + 0.05);
  }

  update(dt, st) {
    if (!this.ready) return; const ctx = this.ctx, cam = this.g.camera; const L = ctx.listener;
    const e = cam.matrixWorld.elements; const fx = -e[8], fy = -e[9], fz = -e[10];
    if (L.positionX) { L.positionX.value = cam.position.x; L.positionY.value = cam.position.y; L.positionZ.value = cam.position.z; L.forwardX.value = fx; L.forwardY.value = fy; L.forwardZ.value = fz; L.upX.value = e[4]; L.upY.value = e[5]; L.upZ.value = e[6]; }
    else { L.setPosition(cam.position.x, cam.position.y, cam.position.z); L.setOrientation(fx, fy, fz, e[4], e[5], e[6]); }
    const inside = st.inside || 0;
    this.revInG.gain.setTargetAtTime(inside * 0.9, ctx.currentTime, 0.2); this.revOutG.gain.setTargetAtTime(1 - inside * 0.75, ctx.currentTime, 0.2);
    this.loopVol('wind', (0.2 + 0.1 * Math.sin(this.g.time * 0.21)) * (1 - inside * 0.65) * (st.menu ? 0.6 : 1), 0.5);
    const deaf = st.deaf || 0; this.deafLP.frequency.setTargetAtTime(deaf > 0.02 ? 20000 * Math.pow(0.02, Math.min(1, deaf)) + 350 : 20000, ctx.currentTime, 0.08);
    this.loopVol('tinnitus', Math.min(0.09, deaf * 0.1), 0.1);
    const hurt = st.hurt || 0; this.loopVol('heart', hurt * 0.75, 0.3); this.loopRate('heart', 1 + hurt * 0.35);
    if (st.birds && Math.random() < dt * 0.45) this.chirp();
  }
}
