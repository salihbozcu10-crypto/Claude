// Döşenebilir (tileable) gürültü alanları — prosedürel dokuların temeli.
// Tüm fonksiyonlar size*size uzunlukta Float32Array üzerinde çalışır.
import { makeRng } from '../core/utils.js';

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

// Periyodik Perlin gürültüsü: out += amp * noise  (noise ~ [-1,1])
export function perlinAdd(out, size, px, py, rng, amp) {
  const gx = new Float32Array(px * py), gy = new Float32Array(px * py);
  for (let i = 0; i < px * py; i++) { const a = rng() * 6.2831853; gx[i] = Math.cos(a); gy[i] = Math.sin(a); }
  const sx = px / size, sy = py / size;
  for (let y = 0; y < size; y++) {
    const fy = y * sy; const y0 = Math.floor(fy); const ty = fy - y0; const y1 = (y0 + 1) % py; const v = fade(ty);
    const r0 = y0 * px, r1 = y1 * px;
    for (let x = 0; x < size; x++) {
      const fx = x * sx; const x0 = Math.floor(fx); const tx = fx - x0; const x1 = (x0 + 1) % px; const u = fade(tx);
      const a = gx[r0 + x0] * tx + gy[r0 + x0] * ty;
      const b = gx[r0 + x1] * (tx - 1) + gy[r0 + x1] * ty;
      const c = gx[r1 + x0] * tx + gy[r1 + x0] * (ty - 1);
      const d = gx[r1 + x1] * (tx - 1) + gy[r1 + x1] * (ty - 1);
      const top = a + (b - a) * u, bot = c + (d - c) * u;
      out[y * size + x] += amp * 1.5 * (top + (bot - top) * v);
    }
  }
  return out;
}

// Kesirli Brown hareketi (fbm), [0,1] aralığına normalize edilmiş
export function fbm(size, period, octaves, seed, gain = 0.5, aspect = 1) {
  const rng = makeRng(seed);
  const out = new Float32Array(size * size);
  let amp = 1, p = period;
  for (let o = 0; o < octaves; o++) {
    const px = Math.max(1, Math.min(size >> 1, Math.round(p)));
    const py = Math.max(1, Math.min(size >> 1, Math.round(p * aspect)));
    perlinAdd(out, size, px, py, rng, amp);
    amp *= gain; p *= 2;
  }
  return normalize(out);
}

export function normalize(a) {
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i < a.length; i++) { const v = a[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
  const s = mx > mn ? 1 / (mx - mn) : 1;
  for (let i = 0; i < a.length; i++) a[i] = (a[i] - mn) * s;
  return a;
}

// Periyodik Worley (hücresel) gürültü: F1, F2 uzaklıkları ve hücre kimliği
export function worley(size, cells, seed, jitter = 1) {
  const rng = makeRng(seed);
  const n = cells * cells;
  const fx = new Float32Array(n), fy = new Float32Array(n), id = new Float32Array(n);
  for (let i = 0; i < n; i++) { fx[i] = 0.5 + (rng() - 0.5) * jitter; fy[i] = 0.5 + (rng() - 0.5) * jitter; id[i] = rng(); }
  const F1 = new Float32Array(size * size), F2 = new Float32Array(size * size), ID = new Float32Array(size * size);
  const s = cells / size;
  for (let y = 0; y < size; y++) {
    const py = y * s; const cy = Math.floor(py);
    for (let x = 0; x < size; x++) {
      const px = x * s; const cx = Math.floor(px);
      let d1 = 9, d2 = 9, best = 0;
      for (let j = -1; j <= 1; j++) {
        const yy = cy + j; const wy = ((yy % cells) + cells) % cells;
        for (let i = -1; i <= 1; i++) {
          const xx = cx + i; const wx = ((xx % cells) + cells) % cells;
          const k = wy * cells + wx;
          const dx = xx + fx[k] - px, dy = yy + fy[k] - py;
          const d = dx * dx + dy * dy;
          if (d < d1) { d2 = d1; d1 = d; best = id[k]; } else if (d < d2) d2 = d;
        }
      }
      const o = y * size + x;
      F1[o] = Math.sqrt(d1); F2[o] = Math.sqrt(d2); ID[o] = best;
    }
  }
  return { F1, F2, ID };
}

// Sarmalı (wrap) kutu bulanıklığı
export function blur(a, size, r) {
  if (r < 1) return a;
  const tmp = new Float32Array(a.length); const w = 1 / (2 * r + 1); const m = size - 1;
  for (let y = 0; y < size; y++) {
    const row = y * size; let acc = 0;
    for (let k = -r; k <= r; k++) acc += a[row + ((k + size) & m)];
    for (let x = 0; x < size; x++) { tmp[row + x] = acc * w; acc += a[row + ((x + r + 1) & m)] - a[row + ((x - r + size) & m)]; }
  }
  for (let x = 0; x < size; x++) {
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += tmp[((k + size) & m) * size + x];
    for (let y = 0; y < size; y++) { a[y * size + x] = acc * w; acc += tmp[((y + r + 1) & m) * size + x] - tmp[((y - r + size) & m) * size + x]; }
  }
  return a;
}

// Alanı başka iki alanla büker (domain warp), sarmalı çift doğrusal örnekleme
export function warp(a, size, wx, wy, strength) {
  const out = new Float32Array(a.length); const m = size - 1;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const o = y * size + x;
    const sx = x + (wx[o] - 0.5) * strength, sy = y + (wy[o] - 0.5) * strength;
    const x0 = Math.floor(sx), y0 = Math.floor(sy); const tx = sx - x0, ty = sy - y0;
    const xa = x0 & m, xb = (x0 + 1) & m, ya = (y0 & m) * size, yb = ((y0 + 1) & m) * size;
    out[o] = (a[ya + xa] * (1 - tx) + a[ya + xb] * tx) * (1 - ty) + (a[yb + xa] * (1 - tx) + a[yb + xb] * tx) * ty;
  }
  return out;
}

// Yükseklik alanından teğet-uzayı normal haritası (RGBA8)
export function heightToNormal(h, size, strength) {
  const out = new Uint8Array(size * size * 4); const m = size - 1;
  for (let y = 0; y < size; y++) {
    const ym = ((y - 1) & m) * size, yp = ((y + 1) & m) * size, yc = y * size;
    for (let x = 0; x < size; x++) {
      const xm = (x - 1) & m, xp = (x + 1) & m;
      const dx = (h[ym + xp] + 2 * h[yc + xp] + h[yp + xp]) - (h[ym + xm] + 2 * h[yc + xm] + h[yp + xm]);
      const dy = (h[yp + xm] + 2 * h[yp + x] + h[yp + xp]) - (h[ym + xm] + 2 * h[ym + x] + h[ym + xp]);
      let nx = -dx * strength, ny = -dy * strength, nz = 1;
      const il = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
      nx *= il; ny *= il; nz *= il;
      const o = (yc + x) * 4;
      out[o] = (nx * 0.5 + 0.5) * 255; out[o + 1] = (ny * 0.5 + 0.5) * 255; out[o + 2] = (nz * 0.5 + 0.5) * 255; out[o + 3] = 255;
    }
  }
  return out;
}
