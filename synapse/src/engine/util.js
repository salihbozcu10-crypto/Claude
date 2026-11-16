// Ortak matematik ve animasyon yardımcıları. Her şey deterministiktir:
// zaman (t, saniye) dışında hiçbir girdi kullanılmaz, Math.random yoktur.
import * as THREE from 'three';

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;
export const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, k) => a + (b - a) * k;
export const invLerp = (a, b, x) => clamp((x - a) / (b - a));
export const remap = (x, a, b, c, d) => lerp(c, d, invLerp(a, b, x));
export const smoothstep = (a, b, x) => { const k = invLerp(a, b, x); return k * k * (3 - 2 * k); };
export const smootherstep = (a, b, x) => { const k = invLerp(a, b, x); return k * k * k * (k * (k * 6 - 15) + 10); };

export const ease = {
  linear: (k) => k,
  inQuad: (k) => k * k,
  outQuad: (k) => k * (2 - k),
  inOutQuad: (k) => (k < 0.5 ? 2 * k * k : -1 + (4 - 2 * k) * k),
  inCubic: (k) => k * k * k,
  outCubic: (k) => 1 - Math.pow(1 - k, 3),
  inOutCubic: (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
  inOutSine: (k) => -(Math.cos(Math.PI * k) - 1) / 2,
  outBack: (k) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); },
  outElastic: (k) => (k === 0 ? 0 : k === 1 ? 1 : Math.pow(2, -10 * k) * Math.sin((k * 10 - 0.75) * (TAU / 3)) + 1),
  outExpo: (k) => (k === 1 ? 1 : 1 - Math.pow(2, -10 * k)),
  inExpo: (k) => (k === 0 ? 0 : Math.pow(2, 10 * k - 10)),
};

// Seeded PRNG (mulberry32)
export function rng(seed = 1) {
  let a = seed >>> 0;
  const f = () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.range = (lo, hi) => lo + (hi - lo) * f();
  f.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * f());
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  f.sign = () => (f() < 0.5 ? -1 : 1);
  return f;
}

// Hash tabanlı değer gürültüsü (1B, 2B, 3B) — deterministik
function hash1(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123; return s - Math.floor(s); }
function hash3(x, y, z) { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453123; return s - Math.floor(s); }
export function noise1(x) {
  const i = Math.floor(x), f = x - i; const u = f * f * (3 - 2 * f);
  return lerp(hash1(i), hash1(i + 1), u) * 2 - 1;
}
export function noise3(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy), uz = fz * fz * (3 - 2 * fz);
  const n = (a, b, c) => hash3(ix + a, iy + b, iz + c);
  const x00 = lerp(n(0, 0, 0), n(1, 0, 0), ux), x10 = lerp(n(0, 1, 0), n(1, 1, 0), ux);
  const x01 = lerp(n(0, 0, 1), n(1, 0, 1), ux), x11 = lerp(n(0, 1, 1), n(1, 1, 1), ux);
  return lerp(lerp(x00, x10, uy), lerp(x01, x11, uy), uz) * 2 - 1;
}
export function fbm1(x, oct = 3) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < oct; i++) { s += a * noise1(x * f + i * 17.3); f *= 2; a *= 0.5; } return s; }
export function fbm3(x, y, z, oct = 4) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < oct; i++) { s += a * noise3(x * f, y * f, z * f); f *= 2.03; a *= 0.5; } return s; }

// Anahtar kare izi: [[t, value], ...] — value sayı, dizi ya da THREE.Vector3 olabilir.
// Her anahtar isteğe bağlı üçüncü eleman olarak bir easing adı/fonksiyonu alabilir
// (o anahtara GİDEN geçişte kullanılır).
export function track(keys, defEase = 'inOutCubic') {
  const ks = keys.map((k) => ({ t: k[0], v: k[1], e: k[2] || defEase }));
  const isVec = ks[0].v && ks[0].v.isVector3;
  const isArr = Array.isArray(ks[0].v);
  return (t) => {
    if (t <= ks[0].t) return clone(ks[0].v);
    for (let i = 1; i < ks.length; i++) {
      if (t <= ks[i].t) {
        const a = ks[i - 1], b = ks[i];
        const ef = typeof b.e === 'function' ? b.e : ease[b.e] || ease.inOutCubic;
        const k = ef((t - a.t) / Math.max(1e-6, b.t - a.t));
        if (isVec) return a.v.clone().lerp(b.v, k);
        if (isArr) return a.v.map((x, j) => lerp(x, b.v[j], k));
        return lerp(a.v, b.v, k);
      }
    }
    return clone(ks[ks.length - 1].v);
  };
  function clone(v) { return isVec ? v.clone() : isArr ? v.slice() : v; }
}

export const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// Kritik sönümlü yay — anahtar kareler arasında "takip eden" hareket üretmek için,
// t'nin fonksiyonu olarak kapalı formda değil; bunun yerine örneklenmiş izi gecikmeli izler.
export function lagged(fn, lag = 0.12, samples = 6) {
  return (t) => {
    let s = 0, w = 0;
    for (let i = 0; i < samples; i++) {
      const tt = t - (lag * i) / samples; const ww = Math.exp(-i * 0.6);
      const v = fn(tt); s = typeof v === 'number' ? s + v * ww : s; w += ww;
    }
    return s / w;
  };
}

// Pencere: t, [a,b] aralığında 0→1→0 (kenar yumuşatmalı)
export const pulse = (t, a, b, fadeIn = 0.2, fadeOut = 0.2) => Math.min(smoothstep(a, a + fadeIn, t), 1 - smoothstep(b - fadeOut, b, t));

// Basit sanal "el kamerası" titreşimi (konum/rotasyon), amp birimleri: metre / radyan
export function handheld(t, amp = 1, seed = 0) {
  return {
    x: fbm1(t * 0.7 + seed) * 0.012 * amp,
    y: fbm1(t * 0.6 + seed + 40) * 0.009 * amp,
    rx: fbm1(t * 0.9 + seed + 80) * 0.004 * amp,
    ry: fbm1(t * 0.8 + seed + 120) * 0.005 * amp,
    rz: fbm1(t * 0.5 + seed + 160) * 0.003 * amp,
  };
}
