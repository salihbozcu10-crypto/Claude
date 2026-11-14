// Prosedürel PBR doku kütüphanesi: her yüzey için renk (albedo), normal ve ORM
// (AO / pürüzlülük / metal) haritaları çalışma anında üretilir — dış dosya yok.
import * as THREE from 'three';
import { fbm, worley, blur, warp, heightToNormal, normalize } from './noise.js';
import { makeRng, sat, smoothstep, lerp } from '../core/utils.js';

class Tex {
  constructor(size) {
    this.size = size; const n = size * size; this.n = n;
    this.r = new Float32Array(n); this.g = new Float32Array(n); this.b = new Float32Array(n);
    this.h = new Float32Array(n).fill(0.5);
    this.ro = new Float32Array(n).fill(0.85);
    this.me = new Float32Array(n);
    this.a = null; // isteğe bağlı alfa
  }
  mix(i, cr, cg, cb, t) { this.r[i] += (cr - this.r[i]) * t; this.g[i] += (cg - this.g[i]) * t; this.b[i] += (cb - this.b[i]) * t; }
  mul(i, k) { this.r[i] *= k; this.g[i] *= k; this.b[i] *= k; }
}

let ANISO = 8;

function dataTex(data, size, srgb) {
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.anisotropy = ANISO; t.needsUpdate = true;
  return t;
}

function finish(T, normalStrength = 2, aoFromHeight = 0.5) {
  const { size, n } = T;
  const alb = new Uint8Array(n * 4), orm = new Uint8Array(n * 4);
  // Yükseklikten kaba oyuk gölgesi (AO): bulanık yükseklik ile farktan
  let ao = null;
  if (aoFromHeight > 0) { ao = Float32Array.from(T.h); blur(ao, size, Math.max(2, size >> 7)); }
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    alb[o] = sat(T.r[i]) * 255; alb[o + 1] = sat(T.g[i]) * 255; alb[o + 2] = sat(T.b[i]) * 255; alb[o + 3] = T.a ? sat(T.a[i]) * 255 : 255;
    const occ = ao ? sat(1 - (ao[i] - T.h[i]) * 2.2 * aoFromHeight) : 1;
    orm[o] = occ * 255; orm[o + 1] = sat(T.ro[i]) * 255; orm[o + 2] = sat(T.me[i]) * 255; orm[o + 3] = 255;
  }
  const nrm = heightToNormal(T.h, size, normalStrength * (size / 512));
  return { map: dataTex(alb, size, true), normalMap: dataTex(nrm, size, false), ormMap: dataTex(orm, size, false) };
}

// ---------------------------------------------------------------- tarifler

function concrete(size, seed, o = {}) {
  const T = new Tex(size), S = size;
  const big = fbm(S, 3, 5, seed + 1), mid = fbm(S, 12, 4, seed + 2), fine = fbm(S, 72, 3, seed + 3, 0.65);
  const streak = fbm(S, 56, 3, seed + 4, 0.5, 1 / 18);
  const pores = worley(S, 60, seed + 5);
  const base = o.base || [0.585, 0.565, 0.53];
  for (let i = 0; i < T.n; i++) {
    let v = 1 + (big[i] - 0.5) * 0.26 + (mid[i] - 0.5) * 0.16 + (fine[i] - 0.5) * 0.12;
    v -= smoothstep(0.55, 0.95, streak[i]) * 0.14;
    const stain = smoothstep(0.6, 0.82, big[i] * 0.7 + mid[i] * 0.3) * 0.3;
    T.r[i] = base[0] * v * (1 - stain * 0.85); T.g[i] = base[1] * v * (1 - stain); T.b[i] = base[2] * v * (1 - stain * 1.2);
    const pore = pores.ID[i] > 0.5 ? 1 - smoothstep(0.04, 0.17, pores.F1[i]) : 0;
    T.mul(i, 1 - pore * 0.45);
    T.h[i] = 0.55 + (fine[i] - 0.5) * 0.22 + (mid[i] - 0.5) * 0.14 - pore * 0.5;
    T.ro[i] = 0.9 + (fine[i] - 0.5) * 0.12 - stain * 0.12;
  }
  if (!o.smooth) {
    // Kalıp derzleri ve tij delikleri
    const lw = Math.max(1, S >> 8);
    for (let x = 0; x < S; x++) for (let k = -lw; k <= lw; k++) {
      for (const yy of [0, S >> 1]) { const i = (((yy + k) + S) % S) * S + x; T.mul(i, 0.74); T.h[i] -= 0.3; }
    }
    for (let y = 0; y < S; y++) for (let k = -lw; k <= lw; k++) { const i = y * S + ((k + S) % S); T.mul(i, 0.78); T.h[i] -= 0.3; }
    const rad = S * 0.013;
    for (const [hx, hy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
      const cx = hx * S, cy = hy * S;
      for (let y = -Math.ceil(rad * 9); y <= rad * 2; y++) for (let x = -Math.ceil(rad * 2); x <= rad * 2; x++) {
        const i = ((Math.round(cy + y) + S) % S) * S + ((Math.round(cx + x) + S) % S);
        const d = Math.hypot(x, y) / rad;
        if (d < 1) { T.mul(i, 0.35 + d * 0.3); T.h[i] -= 0.5 * (1 - d); }
        else if (y < 0 && Math.abs(x) < rad * (1 - (-y) / (rad * 9))) { // pas akıntısı
          const k = (1 - (-y) / (rad * 9)) * 0.3; T.mix(i, 0.36, 0.25, 0.17, k);
        }
      }
    }
  }
  return finish(T, 2.2, 0.6);
}

function plaster(size, seed) {
  const T = new Tex(size), S = size;
  const big = fbm(S, 3, 5, seed + 1), mid = fbm(S, 10, 4, seed + 2), bump = fbm(S, 56, 3, seed + 3, 0.7), fine = fbm(S, 128, 2, seed + 4, 0.7);
  const w = worley(S, 6, seed + 5);
  let crackF = new Float32Array(T.n);
  for (let i = 0; i < T.n; i++) crackF[i] = w.F2[i] - w.F1[i];
  crackF = warp(crackF, S, fbm(S, 8, 3, seed + 6), fbm(S, 8, 3, seed + 7), S * 0.09);
  const chipN = fbm(S, 5, 5, seed + 9, 0.55);
  for (let i = 0; i < T.n; i++) {
    let v = 0.86 + (big[i] - 0.5) * 0.13 + (mid[i] - 0.5) * 0.09 + (bump[i] - 0.5) * 0.06;
    const dirt = smoothstep(0.5, 0.9, mid[i] * 0.5 + big[i] * 0.5);
    v *= 1 - dirt * 0.22;
    T.r[i] = v; T.g[i] = v * 0.985; T.b[i] = v * 0.95 - dirt * 0.03;
    const crack = (1 - smoothstep(0.0, 0.022, crackF[i])) * smoothstep(0.38, 0.55, big[i]);
    T.mul(i, 1 - crack * 0.55);
    const chip = smoothstep(0.685, 0.7, chipN[i]);
    const edge = smoothstep(0.655, 0.685, chipN[i]) * (1 - chip);
    if (chip > 0) { const cv = 0.72 + fine[i] * 0.4; T.mix(i, 0.52 * cv, 0.47 * cv, 0.40 * cv, chip); }
    T.mul(i, 1 - edge * 0.25);
    T.h[i] = 0.6 + (bump[i] - 0.5) * 0.3 + (fine[i] - 0.5) * 0.1 - crack * 0.45 - chip * 0.28 + (chip > 0 ? (fine[i] - 0.5) * 0.3 : 0);
    T.ro[i] = 0.9 + chip * 0.06;
  }
  return finish(T, 2.0, 0.6);
}

function cmu(size, seed) {
  const T = new Tex(size), S = size, rng = makeRng(seed);
  const cols = 4, rows = 8, bw = S / cols, bh = S / rows;
  const tone = new Float32Array(cols * rows); for (let i = 0; i < tone.length; i++) tone[i] = rng();
  const big = fbm(S, 3, 4, seed + 1), fine = fbm(S, 96, 3, seed + 2, 0.7), mid = fbm(S, 20, 3, seed + 6);
  const pores = worley(S, 70, seed + 3);
  const mpx = S / 150;
  for (let y = 0; y < S; y++) {
    const row = Math.floor(y / bh), ly = (y % bh);
    const off = (row & 1) * bw * 0.5;
    for (let x = 0; x < S; x++) {
      const xo = (x + off) % S, col = Math.floor(xo / bw), lx = xo % bw;
      const m = Math.min(Math.min(lx, bw - lx), Math.min(ly, bh - ly));
      const i = y * S + x;
      const mortar = 1 - smoothstep(mpx, mpx * 2.2, m);
      const t = tone[row * cols + col];
      const pore = 1 - smoothstep(0.06, 0.2, pores.F1[i]);
      let v = (0.50 + t * 0.14) * (1 + (big[i] - 0.5) * 0.22 + (fine[i] - 0.5) * 0.2 + (mid[i] - 0.5) * 0.12) * (1 - pore * 0.3);
      T.r[i] = v * 1.02; T.g[i] = v; T.b[i] = v * 0.955;
      const mv = 0.6 + (fine[i] - 0.5) * 0.14;
      T.mix(i, mv, mv * 0.97, mv * 0.92, mortar);
      const stain = smoothstep(0.62, 0.85, big[i]) * 0.22; T.mul(i, 1 - stain);
      T.h[i] = lerp(0.62 + (fine[i] - 0.5) * 0.25 - pore * 0.3, 0.3 + (fine[i] - 0.5) * 0.1, mortar);
      T.ro[i] = 0.93;
    }
  }
  return finish(T, 2.6, 0.8);
}

function corrugated(size, seed, o = {}) {
  const T = new Tex(size), S = size;
  const N = o.ridges || 8, trap = !!o.trapezoid, galv = !!o.galvanized;
  const big = fbm(S, 3, 5, seed + 1), mid = fbm(S, 18, 3, seed + 2), fine = fbm(S, 110, 2, seed + 3, 0.7);
  const streak = fbm(S, 64, 3, seed + 4, 0.5, 1 / 22);
  const rustN = fbm(S, 5, 5, seed + 5, 0.58);
  const sp = galv ? worley(S, 26, seed + 8) : null;
  const rustAmt = o.rust ?? 0.5;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x; const p = (x / S * N) % 1;
    const hgt = trap ? smoothstep(0.08, 0.22, p) - smoothstep(0.58, 0.72, p) : 0.5 + 0.5 * Math.cos(p * 6.2831853);
    let v = (galv ? 0.66 : 0.84) * (1 + (big[i] - 0.5) * 0.14 + (mid[i] - 0.5) * 0.08);
    v *= 1 - smoothstep(0.5, 0.95, streak[i]) * 0.22;
    v *= 0.9 + 0.1 * hgt;
    if (galv) { const s = 0.9 + sp.ID[i] * 0.2; T.r[i] = v * s * 0.97; T.g[i] = v * s; T.b[i] = v * s * 1.03; }
    else { T.r[i] = v; T.g[i] = v; T.b[i] = v * 0.985; }
    const rust = smoothstep(1 - rustAmt * 0.55, 1 - rustAmt * 0.55 + 0.1, rustN[i] * 0.72 + mid[i] * 0.28);
    const rv = 0.7 + fine[i] * 0.6;
    T.mix(i, 0.40 * rv, 0.215 * rv, 0.11 * rv, rust);
    const halo = smoothstep(1 - rustAmt * 0.55 - 0.12, 1 - rustAmt * 0.55, rustN[i] * 0.72 + mid[i] * 0.28) * (1 - rust);
    T.mix(i, 0.5, 0.33, 0.2, halo * 0.35);
    T.h[i] = 0.2 + hgt * 0.62 + (fine[i] - 0.5) * 0.04 + rust * (fine[i] - 0.5) * 0.12;
    T.ro[i] = galv ? lerp(0.42 + mid[i] * 0.16, 0.95, rust) : lerp(0.52 + mid[i] * 0.14, 0.95, rust);
    T.me[i] = galv ? lerp(0.9, 0.05, rust) : 0;
  }
  // Panel bindirme derzi + vida başları
  const lw = Math.max(1, S >> 8);
  for (let x = 0; x < S; x++) for (let k = -lw; k <= lw; k++) { const i = ((k + S) % S) * S + x; T.mul(i, 0.6); T.h[i] -= 0.12; }
  const sr = S * 0.008;
  for (let k = 0; k < N; k += trap ? 1 : 2) {
    const cx = (k + (trap ? 0.4 : 0)) / N * S, cy = S * 0.035;
    for (let y = -sr * 2; y <= sr * 2; y++) for (let x = -sr * 2; x <= sr * 2; x++) {
      const d = Math.hypot(x, y) / sr; if (d > 1.6) continue;
      const i = ((Math.round(cy + y) + S) % S) * S + ((Math.round(cx + x) + S) % S);
      if (d < 1) { T.mix(i, 0.3, 0.3, 0.32, 0.8); T.h[i] += 0.15 * (1 - d); } else T.mul(i, 0.8);
    }
  }
  return finish(T, trap ? 3.2 : 3.6, 0.35);
}

function paintedMetal(size, seed) {
  const T = new Tex(size), S = size, rng = makeRng(seed);
  const big = fbm(S, 3, 5, seed + 1), mid = fbm(S, 14, 4, seed + 2), fine = fbm(S, 120, 2, seed + 3, 0.7);
  const w = worley(S, 44, seed + 4); const chipMask = fbm(S, 6, 4, seed + 5);
  const dustN = fbm(S, 4, 5, seed + 6, 0.55);
  const scratch = new Float32Array(T.n);
  for (let k = 0; k < 90; k++) {
    let x = rng() * S, y = rng() * S; const a = rng() * 6.283, len = S * (0.03 + rng() * 0.2), al = 0.25 + rng() * 0.6;
    const dx = Math.cos(a), dy = Math.sin(a);
    for (let s = 0; s < len; s++) { const i = ((Math.round(y) + S * 4) % S) * S + ((Math.round(x) + S * 4) % S); scratch[i] = Math.max(scratch[i], al); x += dx; y += dy + (rng() - 0.5) * 0.3; }
  }
  for (let i = 0; i < T.n; i++) {
    let v = 0.86 * (1 + (big[i] - 0.5) * 0.08 + (mid[i] - 0.5) * 0.05);
    T.r[i] = v; T.g[i] = v; T.b[i] = v;
    const chip = (1 - smoothstep(0.12, 0.2, w.F1[i] * (1.6 - chipMask[i]))) * smoothstep(0.52, 0.7, chipMask[i]);
    const cv = 0.6 + fine[i] * 0.7;
    T.mix(i, 0.33 * cv, 0.2 * cv, 0.12 * cv, chip);
    T.mix(i, 0.62, 0.62, 0.64, scratch[i] * 0.55 * (1 - chip));
    const dust = smoothstep(0.42, 0.85, dustN[i]) * 0.5;
    T.mix(i, 0.62, 0.54, 0.43, dust * 0.5);
    T.h[i] = 0.55 + (fine[i] - 0.5) * 0.03 - chip * 0.16 - scratch[i] * 0.06;
    T.ro[i] = lerp(lerp(0.38 + mid[i] * 0.14, 0.9, chip), 0.86, dust);
    T.me[i] = scratch[i] * 0.6 * (1 - chip);
  }
  return finish(T, 1.4, 0.3);
}

function gunmetal(size, seed, o = {}) {
  const T = new Tex(size), S = size, rng = makeRng(seed);
  const mid = fbm(S, 10, 4, seed + 1), fine = fbm(S, 128, 2, seed + 2, 0.75), big = fbm(S, 3, 4, seed + 7);
  const scratch = new Float32Array(T.n);
  for (let k = 0; k < 140; k++) {
    let x = rng() * S, y = rng() * S; const a = (rng() < 0.7 ? 0 : 1.57) + (rng() - 0.5) * 0.5, len = S * (0.02 + rng() * 0.12), al = 0.2 + rng() * 0.6;
    const dx = Math.cos(a), dy = Math.sin(a);
    for (let s = 0; s < len; s++) { const i = ((Math.round(y) + S * 4) % S) * S + ((Math.round(x) + S * 4) % S); scratch[i] = Math.max(scratch[i], al); x += dx; y += dy; }
  }
  const base = o.base || [0.17, 0.172, 0.18];
  const st = o.stipple ? worley(S, 90, seed + 9) : null;
  for (let i = 0; i < T.n; i++) {
    const v = 1 + (mid[i] - 0.5) * 0.3 + (fine[i] - 0.5) * 0.25;
    T.r[i] = base[0] * v; T.g[i] = base[1] * v; T.b[i] = base[2] * v;
    const wear = scratch[i] * (o.wear ?? 0.6);
    T.mix(i, 0.42, 0.42, 0.44, wear * 0.5);
    const dust = smoothstep(0.55, 0.9, big[i]) * 0.2; T.mix(i, 0.35, 0.3, 0.24, dust * (o.dust ?? 0.5));
    T.h[i] = 0.5 + (fine[i] - 0.5) * 0.06 - wear * 0.05 + (st ? (1 - smoothstep(0.1, 0.5, st.F1[i])) * 0.3 : 0);
    T.ro[i] = (o.rough ?? 0.46) + (mid[i] - 0.5) * 0.2 - wear * 0.14 + dust * 0.3;
    T.me[i] = (o.metal ?? 0.8) + wear * 0.2;
  }
  return finish(T, o.stipple ? 2.5 : 1.0, 0.2);
}

function wood(size, seed, o = {}) {
  const T = new Tex(size), S = size, rng = makeRng(seed);
  const planks = o.planks || 4; const weather = o.weather ?? 0.35;
  const grain = fbm(S, 48, 4, seed + 1, 0.55, 1 / 24), big = fbm(S, 3, 4, seed + 2), fine = fbm(S, 128, 2, seed + 3, 0.7);
  const wav = fbm(S, 6, 3, seed + 4, 0.5, 1 / 3);
  const kn = worley(S, 3, seed + 5);
  const tone = []; const shift = [];
  for (let i = 0; i < planks; i++) { tone.push(rng()); shift.push(rng() * 7); }
  const base = o.base || [0.52, 0.385, 0.24];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x; const px = x / S * planks; const pi = Math.floor(px) % planks; const lx = px - Math.floor(px);
    const gl = 0.5 + 0.5 * Math.sin((grain[i] * 9 + wav[i] * 3 + shift[pi] + lx * 1.2) * 6.2831853);
    const knot = kn.ID[i] > 0.62 ? 1 - smoothstep(0.03, 0.13, kn.F1[i]) : 0;
    const ring = knot > 0 ? 0.5 + 0.5 * Math.sin(kn.F1[i] * 150) : 0;
    let v = (0.78 + tone[pi] * 0.4) * (0.8 + 0.2 * gl) * (1 + (big[i] - 0.5) * 0.2 + (fine[i] - 0.5) * 0.12);
    v *= 1 - knot * (0.45 + ring * 0.2);
    let r = base[0] * v, g = base[1] * v, b = base[2] * v;
    const grey = (r + g + b) / 3 * 1.02; const wk = weather * (0.7 + big[i] * 0.6);
    r = lerp(r, grey * 1.0, wk); g = lerp(g, grey * 0.985, wk); b = lerp(b, grey * 0.95, wk);
    const gap = 1 - smoothstep(0.0, 0.022, Math.min(lx, 1 - lx));
    T.r[i] = r * (1 - gap * 0.8); T.g[i] = g * (1 - gap * 0.8); T.b[i] = b * (1 - gap * 0.8);
    T.h[i] = 0.6 + (gl - 0.5) * 0.14 + (fine[i] - 0.5) * 0.06 - gap * 0.55 - knot * 0.1;
    T.ro[i] = 0.8 + (gl - 0.5) * 0.1;
  }
  // Çivi başları
  const nr = S * 0.007;
  for (let p = 0; p < planks; p++) for (const ny of [0.04, 0.96]) for (const nx of [0.25, 0.75]) {
    const cx = (p + nx) / planks * S, cy = ny * S;
    for (let y = -nr * 2; y <= nr * 2; y++) for (let x = -nr * 2; x <= nr * 2; x++) {
      const d = Math.hypot(x, y) / nr; if (d > 1.8) continue;
      const i = ((Math.round(cy + y) + S) % S) * S + ((Math.round(cx + x) + S) % S);
      if (d < 1) { T.mix(i, 0.22, 0.2, 0.19, 0.9); T.h[i] -= 0.08; T.me[i] = 0.5; T.ro[i] = 0.6; } else T.mix(i, 0.3, 0.2, 0.13, 0.3);
    }
  }
  return finish(T, 2.2, 0.6);
}

function soil(size, seed, o = {}) {
  const T = new Tex(size), S = size;
  const big = fbm(S, 3, 5, seed + 1), mid = fbm(S, 14, 4, seed + 2), fine = fbm(S, 128, 2, seed + 3, 0.75), mid2 = fbm(S, 40, 3, seed + 4, 0.6);
  const peb = worley(S, o.pebbleCells || 34, seed + 5);
  const base = o.base || [0.63, 0.53, 0.395]; const pa = o.pebbles ?? 0.8;
  const cr = o.cracks ? worley(S, 9, seed + 8) : null;
  for (let i = 0; i < T.n; i++) {
    const v = 1 + (big[i] - 0.5) * 0.2 + (mid[i] - 0.5) * 0.14 + (fine[i] - 0.5) * 0.1 + (mid2[i] - 0.5) * 0.08;
    T.r[i] = base[0] * v * (1 + (mid[i] - 0.5) * 0.06); T.g[i] = base[1] * v; T.b[i] = base[2] * v * (1 - (mid[i] - 0.5) * 0.08);
    const p = peb.ID[i] > 1 - pa * 0.45 ? 1 - smoothstep(0.1, 0.24, peb.F1[i]) : 0;
    if (p > 0) { const pv = 0.8 + peb.ID[i] * 0.34; T.mix(i, 0.6 * pv, 0.55 * pv, 0.48 * pv, p * 0.75); }
    let crack = 0;
    if (cr) { crack = (1 - smoothstep(0.0, 0.035, cr.F2[i] - cr.F1[i])) * o.cracks * smoothstep(0.35, 0.7, big[i]) * 2.2; T.mul(i, 1 - crack * 0.5); }
    T.h[i] = 0.42 + (mid[i] - 0.5) * 0.22 + (fine[i] - 0.5) * 0.1 + (mid2[i] - 0.5) * 0.16 + p * 0.3 - crack * 0.3;
    T.ro[i] = 0.96 - p * 0.12;
  }
  return finish(T, o.normal ?? 2.4, 0.7);
}

function gravel(size, seed) {
  const T = new Tex(size), S = size;
  const w1 = worley(S, 20, seed + 1), w2 = worley(S, 46, seed + 2), fine = fbm(S, 128, 2, seed + 3, 0.7), big = fbm(S, 3, 4, seed + 4);
  for (let i = 0; i < T.n; i++) {
    const h1 = 1 - smoothstep(0.0, 0.6, w1.F1[i]), h2 = (1 - smoothstep(0.0, 0.6, w2.F1[i])) * 0.55;
    const top = h1 > h2; const id = top ? w1.ID[i] : w2.ID[i]; const h = Math.max(h1, h2);
    const gapv = top ? w1.F2[i] - w1.F1[i] : w2.F2[i] - w2.F1[i];
    const pv = (0.6 + id * 0.6) * (0.85 + fine[i] * 0.3) * (0.85 + big[i] * 0.3);
    let r = 0.5 * pv, g = 0.465 * pv, b = 0.42 * pv;
    if (id > 0.8) { r *= 1.12; b *= 0.86; } else if (id < 0.2) { r *= 0.9; b *= 1.04; }
    const gap = 1 - smoothstep(0.0, 0.1, gapv);
    T.r[i] = lerp(r, 0.3, gap * 0.8); T.g[i] = lerp(g, 0.25, gap * 0.8); T.b[i] = lerp(b, 0.2, gap * 0.8);
    T.h[i] = 0.15 + Math.sqrt(h) * 0.7 + (fine[i] - 0.5) * 0.06;
    T.ro[i] = 0.9;
  }
  return finish(T, 3.0, 0.9);
}

function rock(size, seed) {
  const T = new Tex(size), S = size;
  const big = fbm(S, 2, 6, seed + 1, 0.56), strata = fbm(S, 3, 4, seed + 2, 0.5, 5), fine = fbm(S, 96, 3, seed + 3, 0.7), mid = fbm(S, 12, 4, seed + 4);
  const w = worley(S, 6, seed + 5);
  let cf = new Float32Array(T.n); for (let i = 0; i < T.n; i++) cf[i] = w.F2[i] - w.F1[i];
  cf = warp(cf, S, fbm(S, 9, 3, seed + 6), fbm(S, 9, 3, seed + 7), S * 0.1);
  for (let i = 0; i < T.n; i++) {
    const band = 0.5 + 0.5 * Math.sin(strata[i] * 34 + big[i] * 7);
    const crack = 1 - smoothstep(0.0, 0.035, cf[i]);
    const v = (0.72 + big[i] * 0.5) * (1 + (band - 0.5) * 0.14 + (fine[i] - 0.5) * 0.22 + (mid[i] - 0.5) * 0.14) * (1 - crack * 0.55);
    T.r[i] = 0.52 * v; T.g[i] = 0.455 * v; T.b[i] = 0.375 * v;
    T.h[i] = 0.3 + big[i] * 0.4 + (band - 0.5) * 0.12 + (fine[i] - 0.5) * 0.16 + (mid[i] - 0.5) * 0.2 - crack * 0.4;
    T.ro[i] = 0.93;
  }
  return finish(T, 3.0, 0.8);
}

function weave(size, seed, o = {}) {
  const T = new Tex(size), S = size;
  const N = o.threads || 72; const base = o.base || [0.61, 0.52, 0.365];
  const big = fbm(S, 3, 5, seed + 1), mid = fbm(S, 16, 3, seed + 2), fine = fbm(S, 128, 2, seed + 3, 0.7);
  const folds = o.folds ? fbm(S, 5, 3, seed + 4, 0.5, o.foldAspect || 1) : null;
  const k = 6.2831853 * N / S;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x;
    const wu = 0.5 + 0.5 * Math.sin(x * k), wv = 0.5 + 0.5 * Math.sin(y * k);
    const cu = (Math.floor(y * N / S) & 1) ? 1 : 0.55, cv = (Math.floor(x * N / S) & 1) ? 0.55 : 1;
    const h = Math.max(wu * cu, wv * cv);
    const v = (0.74 + 0.3 * h) * (1 + (big[i] - 0.5) * 0.22 + (mid[i] - 0.5) * 0.12 + (fine[i] - 0.5) * 0.1);
    const dirt = o.dirt ? smoothstep(0.5, 0.9, big[i]) * o.dirt : 0;
    T.r[i] = base[0] * v * (1 - dirt); T.g[i] = base[1] * v * (1 - dirt); T.b[i] = base[2] * v * (1 - dirt * 1.1);
    T.h[i] = 0.35 + h * (o.depth ?? 0.3) + (folds ? (folds[i] - 0.5) * (o.folds) : 0);
    T.ro[i] = o.rough ?? 0.94;
  }
  return finish(T, o.normal ?? 2.0, 0.4);
}

function camo(size, seed, pal, o = {}) {
  const T = new Tex(size), S = size;
  const f1 = fbm(S, 4, 4, seed + 1, 0.5), f2 = fbm(S, 6, 4, seed + 2, 0.5), f3 = fbm(S, 11, 3, seed + 3, 0.5), f4 = fbm(S, 5, 4, seed + 5, 0.5);
  const fine = fbm(S, 128, 2, seed + 4, 0.7), folds = fbm(S, 5, 3, seed + 6, 0.5, 2);
  const N = 150, k = 6.2831853 * N / S;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x;
    let c = pal[0];
    let r = c[0], g = c[1], b = c[2];
    const a1 = smoothstep(0.53, 0.55, f1[i]), a2 = smoothstep(0.58, 0.6, f2[i]), a3 = smoothstep(0.66, 0.68, f3[i]), a4 = smoothstep(0.62, 0.64, f4[i]);
    c = pal[1]; r = lerp(r, c[0], a1); g = lerp(g, c[1], a1); b = lerp(b, c[2], a1);
    c = pal[2]; r = lerp(r, c[0], a2); g = lerp(g, c[1], a2); b = lerp(b, c[2], a2);
    c = pal[3 % pal.length]; r = lerp(r, c[0], a4 * (pal.length > 3 ? 1 : 0)); g = lerp(g, c[1], a4 * (pal.length > 3 ? 1 : 0)); b = lerp(b, c[2], a4 * (pal.length > 3 ? 1 : 0));
    c = pal[(4) % pal.length]; r = lerp(r, c[0], a3 * 0.9); g = lerp(g, c[1], a3 * 0.9); b = lerp(b, c[2], a3 * 0.9);
    const wv = 0.5 + 0.25 * (Math.sin(x * k) + Math.sin(y * k));
    const v = (0.86 + 0.16 * wv) * (0.94 + fine[i] * 0.12) * (0.9 + folds[i] * 0.2);
    T.r[i] = r * v; T.g[i] = g * v; T.b[i] = b * v;
    T.h[i] = 0.4 + wv * 0.12 + (folds[i] - 0.5) * (o.folds ?? 0.7);
    T.ro[i] = 0.92;
  }
  return finish(T, 2.2, 0.3);
}

function tire(size, seed) {
  const T = new Tex(size), S = size;
  const big = fbm(S, 3, 4, seed + 1), fine = fbm(S, 128, 2, seed + 2, 0.7);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x; const u = x / S, v = y / S;
    const chev = Math.abs(((u * 2) % 1) - 0.5);
    const p = (v * 14 + chev * 1.6) % 1;
    const tread = smoothstep(0.0, 0.1, p) - smoothstep(0.62, 0.72, p);
    const groove = 1 - smoothstep(0.0, 0.03, Math.abs(((u * 2 + 0.5) % 1) - 0.5));
    const h = tread * (1 - groove);
    const dust = smoothstep(0.35, 0.8, big[i]) * 0.55 * (1 - h * 0.5);
    const c = 0.05 + fine[i] * 0.03;
    T.r[i] = lerp(c, 0.42, dust); T.g[i] = lerp(c, 0.36, dust); T.b[i] = lerp(c * 1.05, 0.28, dust);
    T.h[i] = 0.25 + h * 0.6; T.ro[i] = 0.88 + dust * 0.08;
  }
  return finish(T, 3.0, 0.6);
}

function rustHeavy(size, seed) {
  const T = new Tex(size), S = size;
  const f = fbm(S, 4, 6, seed + 1, 0.6), fine = fbm(S, 110, 3, seed + 2, 0.7), mid = fbm(S, 16, 4, seed + 3);
  const w = worley(S, 30, seed + 4);
  for (let i = 0; i < T.n; i++) {
    const t = f[i] * 0.75 + mid[i] * 0.25; const fv = 0.7 + fine[i] * 0.6;
    let r, g, b;
    if (t < 0.38) { const k = smoothstep(0.2, 0.38, t); r = lerp(0.07, 0.24, k); g = lerp(0.065, 0.12, k); b = lerp(0.065, 0.075, k); }
    else { const k = smoothstep(0.38, 0.75, t); r = lerp(0.24, 0.5, k); g = lerp(0.12, 0.27, k); b = lerp(0.075, 0.13, k); }
    const flake = (1 - smoothstep(0.1, 0.3, w.F1[i])) * (w.ID[i] > 0.6 ? 1 : 0);
    T.r[i] = r * fv * (1 - flake * 0.3); T.g[i] = g * fv * (1 - flake * 0.3); T.b[i] = b * fv * (1 - flake * 0.3);
    T.h[i] = 0.5 + (fine[i] - 0.5) * 0.3 + (mid[i] - 0.5) * 0.2 - flake * 0.25;
    T.ro[i] = 0.95; T.me[i] = 0.1;
  }
  return finish(T, 2.6, 0.6);
}

// Küçük, döşenebilir gürültü dokusu (gökyüzü bulutları ve gölgelendiriciler için)
export function makeNoiseTexture(size = 256) {
  const a = fbm(size, 4, 6, 901, 0.55), b = fbm(size, 8, 5, 902, 0.5), c = fbm(size, 16, 4, 903, 0.5), d = fbm(size, 32, 3, 904, 0.5);
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) { data[i * 4] = a[i] * 255; data[i * 4 + 1] = b[i] * 255; data[i * 4 + 2] = c[i] * 255; data[i * 4 + 3] = d[i] * 255; }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true; t.needsUpdate = true;
  return t;
}

// ---------------------------------------------------------------- tuval (canvas) dokuları

function canvasTex(c, srgb = true, repeat = false) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = ANISO; if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }

// Kuru ot / çalı / yaprak kartları (alfa kesmeli)
function foliageAtlas() {
  const rng = makeRng(77);
  const [c, g] = mkCanvas(512, 512);
  g.clearRect(0, 0, 512, 512);
  // Sol üst: kuru ot öbeği
  const blade = (x0, y0, len, lean, w, col) => {
    g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(x0 + lean * 0.3, y0 - len * 0.6, x0 + lean, y0 - len); g.stroke();
  };
  for (let k = 0; k < 90; k++) {
    const x = 128 + (rng() - 0.5) * 150, len = 90 + rng() * 150, lean = (rng() - 0.5) * 110;
    const t = rng(); const col = `rgb(${150 + t * 60 | 0},${130 + t * 50 | 0},${70 + t * 30 | 0})`;
    blade(x, 254, len, lean, 1.6 + rng() * 2.4, col);
  }
  for (let k = 0; k < 30; k++) { // yeşilimsi dipler
    const x = 128 + (rng() - 0.5) * 120; blade(x, 254, 40 + rng() * 60, (rng() - 0.5) * 50, 2.5, `rgb(${95 + rng() * 30 | 0},${105 + rng() * 30 | 0},${55 + rng() * 20 | 0})`);
  }
  // Sağ üst: çalı (dallı)
  const twig = (x, y, a, len, w, depth) => {
    const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
    g.strokeStyle = `rgb(${70 + rng() * 25 | 0},${58 + rng() * 20 | 0},${40 + rng() * 14 | 0})`; g.lineWidth = w; g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke();
    if (depth > 0) { const n = 2 + (rng() * 2 | 0); for (let i = 0; i < n; i++) twig(x2, y2, a + (rng() - 0.5) * 1.3, len * (0.6 + rng() * 0.25), w * 0.68, depth - 1); }
    else for (let i = 0; i < 5; i++) { // küçük yapraklar
      g.fillStyle = `rgba(${92 + rng() * 45 | 0},${102 + rng() * 40 | 0},${52 + rng() * 25 | 0},1)`;
      g.beginPath(); g.ellipse(x2 + (rng() - 0.5) * 16, y2 + (rng() - 0.5) * 16, 5 + rng() * 5, 2.4 + rng() * 2, rng() * 3.14, 0, 6.3); g.fill();
    }
  };
  for (let k = 0; k < 7; k++) twig(384 + (rng() - 0.5) * 40, 254, -1.57 + (rng() - 0.5) * 1.5, 46 + rng() * 22, 4.2, 4);
  // Sol alt: yaprak kümesi (ağaç tacı kartı)
  for (let k = 0; k < 420; k++) {
    const a = rng() * 6.283, r = Math.sqrt(rng()) * 112; const x = 128 + Math.cos(a) * r, y = 384 + Math.sin(a) * r * 0.92;
    const t = rng(); const sh = 0.55 + 0.45 * (1 - (y - 272) / 224);
    g.fillStyle = `rgb(${(58 + t * 50) * sh | 0},${(80 + t * 52) * sh | 0},${(38 + t * 24) * sh | 0})`;
    g.beginPath(); g.ellipse(x, y, 7 + rng() * 9, 3 + rng() * 4, rng() * 3.14, 0, 6.3); g.fill();
  }
  // Sağ alt: kamuflaj ağı (delikli örgü + şerit bez parçaları)
  g.save(); g.beginPath(); g.rect(256, 256, 256, 256); g.clip();
  g.strokeStyle = 'rgb(58,60,42)'; g.lineWidth = 2;
  for (let k = -256; k < 512; k += 16) { g.beginPath(); g.moveTo(256 + k, 256); g.lineTo(256 + k + 256, 512); g.stroke(); g.beginPath(); g.moveTo(256 + k + 256, 256); g.lineTo(256 + k, 512); g.stroke(); }
  const cols = ['rgb(88,84,58)', 'rgb(70,78,48)', 'rgb(112,100,70)', 'rgb(56,52,38)'];
  for (let k = 0; k < 230; k++) {
    g.fillStyle = cols[rng() * cols.length | 0]; g.save(); g.translate(256 + rng() * 256, 256 + rng() * 256); g.rotate(rng() * 3.14);
    g.beginPath(); g.ellipse(0, 0, 9 + rng() * 14, 4 + rng() * 6, 0, 0, 6.3); g.fill(); g.restore();
  }
  g.restore();
  const t = canvasTex(c); t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

// Parçacık atlası: 4x4, yumuşak duman pufları / toz / kıvılcım / kan sisi / namlu alevi
function particleAtlas() {
  const rng = makeRng(31);
  const [c, g] = mkCanvas(512, 512); const cell = 128;
  const puff = (cx, cy, r, lobes, alpha) => {
    for (let k = 0; k < lobes; k++) {
      const a = rng() * 6.283, d = rng() * r * 0.45, rr2 = r * (0.35 + rng() * 0.4);
      const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
      const gr = g.createRadialGradient(x, y, 0, x, y, rr2);
      gr.addColorStop(0, `rgba(255,255,255,${alpha})`); gr.addColorStop(0.55, `rgba(255,255,255,${alpha * 0.45})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, rr2, 0, 6.3); g.fill();
    }
  };
  // 0-3: duman çeşitleri
  for (let i = 0; i < 4; i++) puff(i * cell + 64, 64, 58, 26, 0.16);
  // 4-5: ince toz / sis
  for (let i = 0; i < 2; i++) puff(i * cell + 64, cell + 64, 60, 44, 0.07);
  // 6: yumuşak nokta (kıvılcım / mote)
  { const x = 2 * cell + 64, y = cell + 64; const gr = g.createRadialGradient(x, y, 0, x, y, 56); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.2, 'rgba(255,255,255,0.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(2 * cell, cell, cell, cell); }
  // 7: sert kırıntı (moloz)
  { const x = 3 * cell + 64, y = cell + 64; g.fillStyle = '#fff'; g.beginPath(); g.moveTo(x - 30, y - 12); g.lineTo(x + 8, y - 34); g.lineTo(x + 34, y + 2); g.lineTo(x + 6, y + 30); g.lineTo(x - 26, y + 20); g.closePath(); g.fill(); }
  // 8-9: namlu alevi (yıldız biçimli)
  for (let i = 0; i < 2; i++) {
    const x = i * cell + 64, y = 2 * cell + 64;
    const gr = g.createRadialGradient(x, y, 0, x, y, 60); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,240,200,0.85)'); gr.addColorStop(1, 'rgba(255,200,120,0)');
    g.fillStyle = gr; g.beginPath();
    const spikes = 5 + i * 2;
    for (let k = 0; k < spikes * 2; k++) { const a = k / (spikes * 2) * 6.283 + i; const r2 = (k & 1) ? 12 + rng() * 10 : 40 + rng() * 22; g.lineTo(x + Math.cos(a) * r2, y + Math.sin(a) * r2); }
    g.closePath(); g.fill();
    const g2 = g.createRadialGradient(x, y, 0, x, y, 26); g2.addColorStop(0, 'rgba(255,255,255,1)'); g2.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = g2; g.beginPath(); g.arc(x, y, 26, 0, 6.3); g.fill();
  }
  // 10: patlama ateş topu
  { const x = 2 * cell + 64, y = 2 * cell + 64; puff(x, y, 56, 30, 0.3); }
  // 11: kan / sıvı sıçraması
  { const x = 3 * cell + 64, y = 2 * cell + 64; g.fillStyle = '#fff'; for (let k = 0; k < 26; k++) { const a = rng() * 6.283, d = Math.pow(rng(), 0.7) * 48; g.beginPath(); g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, 2 + rng() * 9 * (1 - d / 60), 0, 6.3); g.fill(); } }
  // 12: halka şok dalgası
  { const x = 64, y = 3 * cell + 64; const gr = g.createRadialGradient(x, y, 30, x, y, 60); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.75, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 3 * cell, cell, cell); }
  // 13: iz mermisi çizgisi (yatay yumuşak çubuk)
  { const y = 3 * cell + 64; const gr = g.createLinearGradient(cell, 0, 2 * cell, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.7, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,1)'); g.fillStyle = gr; g.fillRect(cell + 4, y - 7, cell - 8, 14);
    const gv = g.createLinearGradient(0, y - 20, 0, y + 20); gv.addColorStop(0, 'rgba(0,0,0,1)'); gv.addColorStop(0.5, 'rgba(0,0,0,0)'); gv.addColorStop(1, 'rgba(0,0,0,1)'); g.globalCompositeOperation = 'destination-out'; g.fillStyle = gv; g.fillRect(cell, y - 20, cell, 40); g.globalCompositeOperation = 'source-over'; }
  // 14-15: yaprak/toprak serpintisi
  for (let i = 2; i < 4; i++) { const x = i * cell + 64, y = 3 * cell + 64; g.fillStyle = '#fff'; for (let k = 0; k < 40; k++) { const a = rng() * 6.283, d = Math.sqrt(rng()) * 52; g.beginPath(); g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, 1 + rng() * 3.2, 0, 6.3); g.fill(); } }
  const t = canvasTex(c, false); t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

// Mermi deliği / iz atlası (2x2): beton krateri, metal deliği, ahşap yarığı, yanık izi
function decalAtlas() {
  const rng = makeRng(55);
  const [c, g] = mkCanvas(256, 256);
  const hole = (cx, cy, kind) => {
    if (kind === 0) { // beton/sıva: açık renkli kopma + koyu merkez
      g.fillStyle = 'rgba(196,188,172,0.9)'; g.beginPath();
      for (let k = 0; k < 14; k++) { const a = k / 14 * 6.283, r = 22 + rng() * 22; g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
      g.closePath(); g.fill();
      const gr = g.createRadialGradient(cx, cy, 0, cx, cy, 20); gr.addColorStop(0, 'rgba(18,16,14,1)'); gr.addColorStop(0.55, 'rgba(40,36,32,0.95)'); gr.addColorStop(1, 'rgba(90,84,76,0)'); g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, 20, 0, 6.3); g.fill();
    } else if (kind === 1) { // metal: koyu delik + parlak halka
      const gr = g.createRadialGradient(cx, cy, 0, cx, cy, 30); gr.addColorStop(0, 'rgba(4,4,4,1)'); gr.addColorStop(0.3, 'rgba(8,8,8,1)'); gr.addColorStop(0.38, 'rgba(190,190,196,0.95)'); gr.addColorStop(0.52, 'rgba(96,96,100,0.6)'); gr.addColorStop(1, 'rgba(60,60,60,0)'); g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, 30, 0, 6.3); g.fill();
    } else if (kind === 2) { // ahşap: kıymıklı yarık
      g.fillStyle = 'rgba(206,176,128,0.85)'; for (let k = 0; k < 9; k++) { const a = (rng() < 0.5 ? 1.57 : -1.57) + (rng() - 0.5) * 0.7, r = 16 + rng() * 34; g.beginPath(); g.moveTo(cx - 4, cy); g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); g.lineTo(cx + 4, cy); g.fill(); }
      const gr = g.createRadialGradient(cx, cy, 0, cx, cy, 13); gr.addColorStop(0, 'rgba(12,8,5,1)'); gr.addColorStop(0.7, 'rgba(30,20,12,0.9)'); gr.addColorStop(1, 'rgba(60,40,24,0)'); g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, 13, 0, 6.3); g.fill();
    } else { // yanık / patlama izi
      for (let k = 0; k < 40; k++) { const a = rng() * 6.283, d = Math.sqrt(rng()) * 34, r = 8 + rng() * 22; const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(8,7,6,0.5)'); gr.addColorStop(1, 'rgba(8,7,6,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 6.3); g.fill(); }
    }
  };
  hole(64, 64, 0); hole(192, 64, 1); hole(64, 192, 2); hole(192, 192, 3);
  const t = canvasTex(c); t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

// Şablon yazılı sandık yüzü (ahşap ya da boyalı)
function crateFace(woodTex, label, sub, painted) {
  const S = 256; const [c, g] = mkCanvas(S, S);
  const src = woodTex.map.image; const id = g.createImageData(S, S); const ss = src.width; const step = ss / S;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const si = ((Math.floor((S - 1 - y) * step)) * ss + Math.floor(x * step)) * 4, o = (y * S + x) * 4;
    let r = src.data[si], gg = src.data[si + 1], b = src.data[si + 2];
    if (painted) { const l = (r + gg + b) / 3 / 140; r = painted[0] * l; gg = painted[1] * l; b = painted[2] * l; }
    id.data[o] = r; id.data[o + 1] = gg; id.data[o + 2] = b; id.data[o + 3] = 255;
  }
  g.putImageData(id, 0, 0);
  // Çerçeve çıtaları
  g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(0, 0, S, 22); g.fillRect(0, S - 22, S, 22); g.fillRect(0, 0, 22, S); g.fillRect(S - 22, 0, 22, S);
  g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 2; g.strokeRect(22, 22, S - 44, S - 44); g.strokeRect(1, 1, S - 2, S - 2);
  g.fillStyle = painted ? 'rgba(226,200,96,0.82)' : 'rgba(22,20,18,0.78)';
  g.font = '700 34px "Saira Stencil One","Arial Narrow",Impact,sans-serif'; g.textAlign = 'center';
  g.fillText(label, S / 2, 118);
  g.font = '600 19px "Saira Condensed","Arial Narrow",sans-serif'; g.fillText(sub, S / 2, 150);
  g.font = '500 13px "IBM Plex Mono",monospace'; g.fillText('LOT 0' + (label.length * 37 % 90 + 10) + '-K   NET 24 KG', S / 2, 196);
  // Yıpranma: rastgele silikleştirme
  const rng = makeRng(label.length * 13 + 5); g.globalCompositeOperation = 'destination-over';
  g.globalCompositeOperation = 'source-over';
  for (let k = 0; k < 600; k++) { g.fillStyle = `rgba(${painted ? '70,74,50' : '120,96,62'},${rng() * 0.35})`; g.fillRect(rng() * S, rng() * S, 1 + rng() * 5, 1 + rng() * 2); }
  const t = canvasTex(c); t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

// Holografik nişangâh retikülü
function reticleTex() {
  const [c, g] = mkCanvas(256, 256);
  g.clearRect(0, 0, 256, 256); g.strokeStyle = 'rgba(255,60,40,1)'; g.fillStyle = 'rgba(255,70,45,1)';
  g.shadowColor = 'rgba(255,40,20,0.9)'; g.shadowBlur = 8;
  g.lineWidth = 9; g.beginPath(); g.arc(128, 128, 84, 0, 6.3); g.stroke();
  g.beginPath(); g.arc(128, 128, 10, 0, 6.3); g.fill();
  g.lineWidth = 9; for (const a of [0, 1.5708, 3.1416, 4.7124]) { g.beginPath(); g.moveTo(128 + Math.cos(a) * 84, 128 + Math.sin(a) * 84); g.lineTo(128 + Math.cos(a) * 104, 128 + Math.sin(a) * 104); g.stroke(); }
  const t = canvasTex(c, true); t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

// ---------------------------------------------------------------- dışa açılan üretici

export const TEXTURE_RECIPES = (S, lo) => [
  ['concrete', () => concrete(S, 11)],
  ['plaster', () => plaster(S, 23)],
  ['cmu', () => cmu(S, 37)],
  ['floor', () => concrete(lo, 41, { smooth: true, base: [0.46, 0.45, 0.43] })],
  ['corrugated', () => corrugated(S, 53, { ridges: 8, rust: 0.55 })],
  ['container', () => corrugated(lo, 59, { ridges: 6, trapezoid: true, rust: 0.42 })],
  ['galvanized', () => corrugated(lo, 67, { ridges: 10, galvanized: true, rust: 0.3 })],
  ['paint', () => paintedMetal(lo, 71)],
  ['gunmetal', () => gunmetal(lo, 83, {})],
  ['polymer', () => gunmetal(lo, 89, { base: [0.115, 0.115, 0.12], metal: 0.0, rough: 0.58, stipple: true, wear: 0.15, dust: 0.3 })],
  ['steel', () => gunmetal(lo, 91, { base: [0.5, 0.5, 0.52], metal: 1.0, rough: 0.4, wear: 0.5, dust: 0.6 })],
  ['polymerTan', () => gunmetal(lo, 93, { base: [0.5, 0.41, 0.3], metal: 0.0, rough: 0.64, stipple: true, wear: 0.12, dust: 0.25 })],
  ['wood', () => wood(S, 97, { planks: 4, weather: 0.35 })],
  ['woodOld', () => wood(lo, 101, { planks: 5, weather: 0.8 })],
  ['sand', () => soil(S, 109, { base: [0.66, 0.57, 0.44], normal: 1.7 })],
  ['dirt', () => soil(S, 113, { base: [0.57, 0.5, 0.4], pebbles: 0.3, cracks: 0.1, normal: 1.3 })],
  ['gravel', () => gravel(S, 127)],
  ['rock', () => rock(S, 131)],
  ['burlap', () => weave(lo, 139, { threads: 64, dirt: 0.25, depth: 0.4 })],
  ['canvas', () => weave(lo, 149, { threads: 128, base: [0.82, 0.82, 0.8], folds: 0.5, foldAspect: 3, dirt: 0.18, depth: 0.12, normal: 2.4 })],
  ['camo', () => camo(lo, 157, [[0.58, 0.53, 0.4], [0.37, 0.39, 0.25], [0.31, 0.25, 0.18], [0.46, 0.43, 0.3], [0.7, 0.66, 0.54]])],
  ['cloth', () => camo(lo, 163, [[0.82, 0.82, 0.82], [0.7, 0.7, 0.7], [0.9, 0.9, 0.9], [0.76, 0.76, 0.76], [0.86, 0.86, 0.86]], { folds: 0.9 })],
  ['tire', () => tire(lo, 167)],
  ['rust', () => rustHeavy(lo, 173)],
];

export async function generateTextures({ size = 512, anisotropy = 8, onProgress } = {}) {
  ANISO = anisotropy;
  const lo = Math.max(256, size >> 1);
  const out = {};
  const recipes = TEXTURE_RECIPES(size, lo);
  for (let i = 0; i < recipes.length; i++) {
    const [name, fn] = recipes[i];
    out[name] = fn();
    if (onProgress) { onProgress((i + 1) / recipes.length, name); await new Promise((r) => setTimeout(r, 0)); }
  }
  out.noise = makeNoiseTexture(256);
  out.foliage = foliageAtlas();
  out.particles = particleAtlas();
  out.decals = decalAtlas();
  out.reticle = reticleTex();
  out.crateAmmo = crateFace(out.wood, '7.62 × 39', 'CEPHANE · 1200 ADET', [86, 92, 60]);
  out.crateWood = crateFace(out.wood, 'K-07', 'KIRILIR · BU YÜZ YUKARI', null);
  out.crateExpl = crateFace(out.wood, 'PATLAYICI', 'SINIF 1.1D · DİKKAT', [92, 84, 56]);
  return out;
}
