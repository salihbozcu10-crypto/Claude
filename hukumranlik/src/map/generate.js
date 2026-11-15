// Harita üreteci: Natural Earth ülke sınırlarından eyaletli, iklimli bir dünya üretir.
// DOM kullanmaz; tarayıcıda ve Node'da aynı sonucu verir (tohumlu rastgele).
import { feature } from 'topojson-client';
import world from 'world-atlas/countries-50m.json';
import { COUNTRIES, MERGE, DROP, UNOWNED, CITIES, RANGES } from '../data/geo.js';

export const W = 3072, H = 1536;
export const MAP_VERSION = 4;
const N = W * H;
const LAT_MAX = 84, LAT_MIN = -58, D2R = Math.PI / 180;
const millerY = (lat) => 1.25 * Math.log(Math.tan(Math.PI / 4 + 0.4 * lat * D2R));
const Y0 = millerY(LAT_MAX), Y1 = millerY(LAT_MIN);
export const proj = (lon, lat) => [(lon + 180) / 360 * W, (Y0 - millerY(Math.max(LAT_MIN - 2, Math.min(LAT_MAX + 2, lat)))) / (Y0 - Y1) * H];
export const unproj = (x, y) => { const my = Y0 - (y / H) * (Y0 - Y1); return [x / W * 360 - 180, (2.5 * Math.atan(Math.exp(0.8 * my)) - 0.625 * Math.PI) / D2R]; };
export function kmBetween(x1, y1, x2, y2) {
  const [lo1, la1] = unproj(x1, y1), [lo2, la2] = unproj(x2, y2);
  const dla = (la2 - la1) * D2R, dlo = (lo2 - lo1) * D2R;
  const a = Math.sin(dla / 2) ** 2 + Math.cos(la1 * D2R) * Math.cos(la2 * D2R) * Math.sin(dlo / 2) ** 2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(a)));
}
const kmPerPx = (lat) => 40075 * Math.max(0.12, Math.cos(lat * D2R)) / W;

export function rng(seed) { let s = seed | 0; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
// Tablo tabanlı, döşenebilir değer gürültüsü (hızlı)
const NT = new Float32Array(256 * 256); { const r = rng(777); for (let i = 0; i < NT.length; i++) NT[i] = r(); }
function tnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const x0 = xi & 255, y0 = (yi & 255) << 8, x1 = (x0 + 1) & 255, y1 = ((yi + 1) & 255) << 8;
  const a = NT[y0 + x0], b = NT[y0 + x1], c = NT[y1 + x0], d = NT[y1 + x1]; const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, s, oct) { let a = 0.5, f = 1, t = 0, n = 0; for (let i = 0; i < oct; i++) { t += tnoise(x * f + s * 37.1 + i * 91.7, y * f + s * 19.3 - i * 53.3) * a; n += a; a *= 0.5; f *= 2.03; } return t / n; }
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Çokgen doldurma (çift-tek kuralı, kenar yumuşatmasız)
function fillPolygon(rings, val, out) {
  let ymin = Infinity, ymax = -Infinity; const edges = [];
  for (const r of rings) for (let i = 0; i < r.length - 1; i++) {
    const x0 = r[i][0], y0 = r[i][1], x1 = r[i + 1][0], y1 = r[i + 1][1]; if (y0 === y1) continue;
    edges.push(x0, y0, x1, y1); if (y0 < ymin) ymin = y0; if (y1 < ymin) ymin = y1; if (y0 > ymax) ymax = y0; if (y1 > ymax) ymax = y1;
  }
  const r0 = Math.max(0, Math.ceil(ymin - 0.5)), r1 = Math.min(H - 1, Math.ceil(ymax - 0.5) - 1); if (r1 < r0) return;
  const rows = new Array(r1 - r0 + 1); for (let i = 0; i < rows.length; i++) rows[i] = [];
  for (let e = 0; e < edges.length; e += 4) {
    const x0 = edges[e], y0 = edges[e + 1], x1 = edges[e + 2], y1 = edges[e + 3];
    const ya = Math.min(y0, y1), yb = Math.max(y0, y1); const k = (x1 - x0) / (y1 - y0);
    const ra = Math.max(r0, Math.ceil(ya - 0.5)), rb = Math.min(r1, Math.ceil(yb - 0.5) - 1);
    for (let r = ra; r <= rb; r++) rows[r - r0].push(x0 + (r + 0.5 - y0) * k);
  }
  for (let i = 0; i < rows.length; i++) {
    const xs = rows[i]; if (xs.length < 2) continue; xs.sort((a, b) => a - b); const row = (r0 + i) * W;
    for (let j = 0; j + 1 < xs.length; j += 2) { const a = Math.max(0, Math.ceil(xs[j] - 0.5)), b = Math.min(W - 1, Math.ceil(xs[j + 1] - 0.5) - 1); for (let x = a; x <= b; x++) out[row + x] = val; }
  }
}

const tick = () => new Promise((r) => setTimeout(r, 0));
// 4-komşular (yatayda sarmal)
const L = (p) => (p % W ? p - 1 : p + W - 1), Rr = (p) => ((p + 1) % W ? p + 1 : p - W + 1);

export async function generateWorld(onProgress = () => {}) {
  const step = async (p, t) => { onProgress(p, t); await tick(); };
  await step(0.02, 'Kıtalar çiziliyor');

  // ---------------------------------------------------------------- 1) ülkeler
  const geo = feature(world, world.objects.countries);
  const countries = []; const byName = new Map();
  const getC = (ne) => { let c = byName.get(ne); if (!c) { const d = COUNTRIES[ne] || [ne, '', ne, 0, 0]; c = { id: countries.length + 1, ne, name: d[0], short: d[1] || d[0], capName: d[2], capLat: d[3], capLon: d[4], px: 0, wpx: 0 }; countries.push(c); byName.set(ne, c); } return c; };
  const UNOWNED_ID = 0xFFFF; const cmap = new Uint16Array(N);
  const polyOf = (geom) => (geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : []);
  for (const f of geo.features) {
    const ne = f.properties.name; if (DROP.includes(ne)) continue;
    const c = UNOWNED.includes(ne) ? null : getC(MERGE[ne] || ne);
    for (const poly of polyOf(f.geometry)) {
      let minX = Infinity, maxX = -Infinity;
      const rings = poly.map((ring) => { let prev = null; return ring.map(([lon, lat]) => { if (prev !== null) { while (lon - prev > 180) lon -= 360; while (lon - prev < -180) lon += 360; } prev = lon; const p = proj(lon, lat); if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0]; return p; }); });
      const val = c ? c.id : UNOWNED_ID;
      fillPolygon(rings, val, cmap);
      if (minX < 0) fillPolygon(rings.map((r) => r.map(([x, y]) => [x + W, y])), val, cmap);
      if (maxX >= W) fillPolygon(rings.map((r) => r.map(([x, y]) => [x - W, y])), val, cmap);
      if (c) { let a = 0, cx = 0, cy = 0; const r = rings[0]; for (let i = 0; i < r.length - 1; i++) { const k = r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; a += k; cx += (r[i][0] + r[i + 1][0]) * k; cy += (r[i][1] + r[i + 1][1]) * k; } a /= 2; if (Math.abs(a) > (c.bigA || 0)) { c.bigA = Math.abs(a); c.cx = a ? cx / (6 * a) : r[0][0]; c.cy = a ? cy / (6 * a) : r[0][1]; } }
    }
  }
  // satır başına enlem ağırlığı: kutup bölgeleri daha az eyalet alır
  const rowW = new Float32Array(H); const rowLat = new Float32Array(H);
  for (let y = 0; y < H; y++) { const lat = unproj(0, y + 0.5)[1]; rowLat[y] = lat; const al = Math.abs(lat); rowW[y] = al < 50 ? 1 : al < 72 ? 1 - (al - 50) / 22 * 0.8 : 0.2; }
  for (let y = 0; y < H; y++) { const w = rowW[y]; for (let i = y * W, e = i + W; i < e; i++) { const v = cmap[i]; if (v && v !== UNOWNED_ID) { const c = countries[v - 1]; c.px++; c.wpx += w; } } }
  for (const c of countries) { // küçük ada ülkeleri görünür kalsın
    if (c.px >= 14 || c.cx === undefined) continue;
    const cx = Math.round(((c.cx % W) + W) % W), cy = Math.round(c.cy);
    for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) { if (x * x + y * y > 7) continue; const px = (cx + x + W) % W, py = cy + y; if (py < 0 || py >= H) continue; const i = py * W + px; if (cmap[i] === 0) { cmap[i] = c.id; c.px++; c.wpx++; } }
  }
  await step(0.1, 'Ülke toprakları ayrıştırılıyor');

  // ---------------------------------------------------------------- 2) bağlı bileşenler
  const comp = new Int32Array(N).fill(-1); const order = new Int32Array(N); const comps = []; let oPos = 0;
  for (let i = 0; i < N; i++) {
    const v = cmap[i]; if (!v || v === UNOWNED_ID || comp[i] >= 0) continue;
    const id = comps.length; const start = oPos; comp[i] = id; order[oPos++] = i; let head = start; let wsum = 0;
    while (head < oPos) {
      const p = order[head++]; wsum += rowW[(p / W) | 0]; let q;
      q = L(p); if (comp[q] < 0 && cmap[q] === v) { comp[q] = id; order[oPos++] = q; }
      q = Rr(p); if (comp[q] < 0 && cmap[q] === v) { comp[q] = id; order[oPos++] = q; }
      if (p >= W) { q = p - W; if (comp[q] < 0 && cmap[q] === v) { comp[q] = id; order[oPos++] = q; } }
      if (p < N - W) { q = p + W; if (comp[q] < 0 && cmap[q] === v) { comp[q] = id; order[oPos++] = q; } }
    }
    comps.push({ id, country: v, start, size: oPos - start, wsize: wsum, seeds: [] });
  }
  await step(0.16, 'Eyalet merkezleri seçiliyor');

  // ---------------------------------------------------------------- 3) eyalet tohumları
  const R = rng(1453);
  const cityList = CITIES.split(';').map((s) => s.trim()).filter(Boolean).map((s) => { const [n, la, lo, sz] = s.split('|'); const [x, y] = proj(+lo, +la); return { name: n, x, y, size: +sz }; });
  const nearestLand = (x, y, country) => { const xi = Math.round(x), yi = Math.round(y); let best = -1, bd = 1e9; for (let r = 0; r <= 4 && best < 0; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const px = (xi + dx + W) % W, py = yi + dy; if (py < 0 || py >= H) continue; const i = py * W + px; const v = cmap[i]; if (!v || v === UNOWNED_ID || (country && v !== country)) continue; const d = dx * dx + dy * dy; if (d < bd) { bd = d; best = i; } } return best; };
  for (const c of countries) { c.comps = []; c.target = Math.max(1, Math.min(110, Math.round(Math.pow(c.wpx / 380, 0.8)))); }
  for (const k of comps) countries[k.country - 1].comps.push(k);
  const seeds = [];
  const cityAt = []; for (const ct of cityList) { const i = nearestLand(ct.x, ct.y); if (i >= 0) cityAt.push({ ...ct, i, comp: comp[i], country: cmap[i] }); }
  for (const c of countries) {
    if (!c.comps.length) continue;
    const big = c.comps.filter((k) => k.size >= 80); const bigTot = big.reduce((a, k) => a + k.wsize, 0);
    const list = big.length ? big : [c.comps.reduce((a, k) => (k.size > a.size ? k : a))];
    const capI = nearestLand(...proj(c.capLon, c.capLat), c.id);
    for (const k of list) {
      const n = big.length ? Math.max(1, Math.round(c.target * k.wsize / bigTot)) : 1;
      const minSp = 0.72 * Math.sqrt(k.size / n);
      const add = (x, y, extra = {}) => { const s = { x, y, comp: k.id, country: c.id, ...extra }; k.seeds.push(s); seeds.push(s); return s; };
      const farEnough = (x, y, sp) => k.seeds.every((s) => (s.x - x) ** 2 + (s.y - y) ** 2 >= sp * sp);
      if (capI >= 0 && comp[capI] === k.id) add(capI % W, (capI / W) | 0, { capital: true, city: c.capName, size: 3 });
      const cs = cityAt.filter((ct) => ct.comp === k.id).sort((a, b) => b.size - a.size);
      for (const ct of cs) { if (k.seeds.length >= n) break; const x = ct.i % W, y = (ct.i / W) | 0; if (farEnough(x, y, minSp * (ct.size >= 3 ? 0.6 : 0.85))) add(x, y, { city: ct.name, size: ct.size }); }
      while (k.seeds.length < n) {
        let bx = 0, by = 0, bd = -1;
        for (let t = 0; t < 14; t++) { const p = order[k.start + ((R() * k.size) | 0)]; const x = p % W, y = (p / W) | 0; let d = 1e12; for (const s of k.seeds) d = Math.min(d, (s.x - x) ** 2 + (s.y - y) ** 2); if (!k.seeds.length) d = 1e9 + R(); d *= 0.6 + 0.4 * rowW[y]; if (d > bd) { bd = d; bx = x; by = y; } }
        add(bx, by);
      }
    }
  }
  seeds.forEach((s, i) => { s.id = i + 1; });
  const P = seeds.length;
  await step(0.22, 'Eyaletler oluşturuluyor');

  // ---------------------------------------------------------------- 4) eyalet ataması (kıvrımlı sınırlar)
  const prov = new Uint16Array(N);
  const countrySeeds = new Map(); for (const s of seeds) { if (!countrySeeds.has(s.country)) countrySeeds.set(s.country, []); countrySeeds.get(s.country).push(s); }
  for (const k of comps) {
    const ss = k.seeds.length ? k.seeds : (countrySeeds.get(k.country) || []); if (!ss.length) continue;
    const ns = ss.length; const sx = Float64Array.from(ss, (s) => s.x), sy = Float64Array.from(ss, (s) => s.y), sid = Uint16Array.from(ss, (s) => s.id);
    if (ns === 1) { for (let j = k.start, e = k.start + k.size; j < e; j++) prov[order[j]] = sid[0]; continue; }
    // çok tohumlu bileşenlerde ızgara: yalnız yakın hücrelerdeki tohumlara bak
    const cell = ns > 10 ? Math.max(24, Math.sqrt(k.size / ns) * 1.6) : 1e9; const gcols = Math.ceil(W / cell) + 1; const gmap = new Map();
    if (ns > 10) for (let s = 0; s < ns; s++) { const key = Math.floor(sy[s] / cell) * gcols + Math.floor(sx[s] / cell); if (!gmap.has(key)) gmap.set(key, []); gmap.get(key).push(s); }
    for (let j = k.start, e = k.start + k.size; j < e; j++) {
      const p = order[j]; const x0 = p % W, y0 = (p / W) | 0;
      const x = x0 + (fbm(x0 * 0.035, y0 * 0.035, 1, 3) - 0.5) * 24, y = y0 + (fbm(x0 * 0.035, y0 * 0.035, 2, 3) - 0.5) * 24;
      let best = -1, bd = Infinity;
      if (ns > 10) { const gx = Math.floor(x / cell), gy = Math.floor(y / cell);
        for (let r = 1; r <= 3 && best < 0; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const list = gmap.get((gy + dy) * gcols + gx + dx); if (!list) continue; for (const s of list) { const ddx = sx[s] - x, ddy = sy[s] - y; const d = ddx * ddx + ddy * ddy; if (d < bd) { bd = d; best = s; } } } }
      if (best < 0) for (let s = 0; s < ns; s++) { let dx = sx[s] - x; if (dx > W / 2) dx -= W; else if (dx < -W / 2) dx += W; const dy = sy[s] - y; const d = dx * dx + dy * dy; if (d < bd) { bd = d; best = s; } }
      prov[p] = sid[best];
    }
  }
  await step(0.32, 'Eyalet sınırları düzeltiliyor');
  // kopuk parçaları (aynı ülkeden bir komşuya değiyorsa) o komşuya kat
  for (let pass = 0; pass < 2; pass++) {
    const lab = comp; lab.fill(-1); const parts = []; let qp = 0;
    for (let i = 0; i < N; i++) {
      const v = prov[i]; if (!v || lab[i] >= 0) continue; const id = parts.length; const start = qp; lab[i] = id; order[qp++] = i; let head = start;
      while (head < qp) { const p = order[head++]; let q;
        q = L(p); if (lab[q] < 0 && prov[q] === v) { lab[q] = id; order[qp++] = q; }
        q = Rr(p); if (lab[q] < 0 && prov[q] === v) { lab[q] = id; order[qp++] = q; }
        if (p >= W) { q = p - W; if (lab[q] < 0 && prov[q] === v) { lab[q] = id; order[qp++] = q; } }
        if (p < N - W) { q = p + W; if (lab[q] < 0 && prov[q] === v) { lab[q] = id; order[qp++] = q; } } }
      parts.push({ v, start, size: qp - start });
    }
    const biggest = new Int32Array(P + 1).fill(-1); for (let i = 0; i < parts.length; i++) { const pr = parts[i]; if (biggest[pr.v] < 0 || pr.size > parts[biggest[pr.v]].size) biggest[pr.v] = i; }
    let changed = 0;
    for (let i = 0; i < parts.length; i++) {
      const pr = parts[i]; if (biggest[pr.v] === i) continue; const country = seeds[pr.v - 1].country; const cnt = new Map();
      for (let j = pr.start; j < pr.start + pr.size; j++) { const p = order[j]; for (const q of [L(p), Rr(p), p - W, p + W]) { if (q < 0 || q >= N) continue; const u = prov[q]; if (u && u !== pr.v && seeds[u - 1].country === country) cnt.set(u, (cnt.get(u) || 0) + 1); } }
      if (!cnt.size) continue; let bu = 0, bc = -1; for (const [u, c] of cnt) if (c > bc) { bc = c; bu = u; }
      for (let j = pr.start; j < pr.start + pr.size; j++) prov[order[j]] = bu; changed++;
    }
    if (!changed) break;
  }
  { // sahipsiz kara: komşu eyaletlerden doldur
    let q = []; for (let i = 0; i < N; i++) if (cmap[i] === UNOWNED_ID) q.push(i);
    for (let guard = 0; guard < 300 && q.length; guard++) { const nq = []; for (const i of q) { if (prov[i]) continue; for (const n of [L(i), Rr(i), i - W, i + W]) if (n >= 0 && n < N && prov[n]) { prov[i] = prov[n]; break; } if (!prov[i]) nq.push(i); } if (nq.length === q.length) break; q = nq; }
  }
  await step(0.4, 'Komşuluklar hesaplanıyor');

  // ---------------------------------------------------------------- 5) istatistik ve komşuluk
  const area = new Int32Array(P + 1), sumX = new Float64Array(P + 1), sumY = new Float64Array(P + 1), coastPx = new Int32Array(P + 1);
  const pairs = new Map();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; const a = prov[i]; if (!a) continue;
    area[a]++; const s = seeds[a - 1]; let xx = x; if (xx - s.x > W / 2) xx -= W; else if (s.x - xx > W / 2) xx += W; sumX[a] += xx; sumY[a] += y;
    const r = Rr(i), d = i + W;
    if (!prov[L(i)] || !prov[r] || (i >= W && !prov[i - W]) || (d < N && !prov[d])) coastPx[a]++;
    let b = prov[r]; if (b && b !== a) { const key = a < b ? a * 65536 + b : b * 65536 + a; pairs.set(key, (pairs.get(key) || 0) + 1); }
    if (d < N) { b = prov[d]; if (b && b !== a) { const key = a < b ? a * 65536 + b : b * 65536 + a; pairs.set(key, (pairs.get(key) || 0) + 1); } }
  }
  await step(0.46, 'Kıyılar ve sınırlar ölçülüyor');

  // ---------------------------------------------------------------- 6) mesafe alanları (her piksel bir kez ziyaret edilir)
  const src = comp; const queue = order; const across = new Uint16Array(N);
  const bDist = new Uint8Array(N).fill(255), cDist = new Uint8Array(N).fill(255); // bDist: ×20 (≤12 px), cDist: piksel (≤127)
  const spread = (isLand, dist, scale, maxD) => {
    let qh = 0, qt = 0; src.fill(-1);
    for (let i = 0; i < N; i++) {
      const a = prov[i]; if (isLand && !a) continue;
      const n0 = L(i), n1 = Rr(i), n2 = i - W, n3 = i + W; let hit = -1;
      if (isLand) { let b = prov[n0]; if (b && b !== a) hit = b; else { b = prov[n1]; if (b && b !== a) hit = b; else if (n2 >= 0 && prov[n2] && prov[n2] !== a) hit = prov[n2]; else if (n3 < N && prov[n3] && prov[n3] !== a) hit = prov[n3]; } }
      else { const al = a > 0; if ((prov[n0] > 0) !== al || (prov[n1] > 0) !== al || (n2 >= 0 && (prov[n2] > 0) !== al) || (n3 < N && (prov[n3] > 0) !== al)) hit = 1; }
      if (hit > 0) { dist[i] = Math.round(0.5 * scale); src[i] = i; if (isLand) across[i] = hit; queue[qt++] = i; }
    }
    while (qh < qt) {
      const p = queue[qh++]; const x = p % W, y = (p / W) | 0; const s0 = src[p]; const sx = s0 % W, sy = (s0 / W) | 0; const land = prov[p] > 0;
      for (let dy = -1; dy <= 1; dy++) { const ny = y + dy; if (ny < 0 || ny >= H) continue;
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue; let nx = x + dx; if (nx < 0) nx += W; else if (nx >= W) nx -= W; const n = ny * W + nx;
          if (src[n] >= 0) continue; const nl = prov[n] > 0; if (isLand ? !nl : nl !== land) continue;
          let ddx = Math.abs(nx - sx); if (ddx > W / 2) ddx = W - ddx; const d = Math.sqrt(ddx * ddx + (ny - sy) ** 2) + 0.5; if (d > maxD) continue;
          src[n] = s0; dist[n] = d * scale > 254 ? 254 : Math.round(d * scale); if (isLand) across[n] = across[s0]; queue[qt++] = n;
        } }
    }
  };
  spread(true, bDist, 20, 12);
  spread(false, cDist, 1, 127);
  await step(0.54, 'Dağlar yükseltiliyor');

  // ---------------------------------------------------------------- 7) yükseklik ve iklim (yarım çözünürlük)
  const TW = W >> 1, TH = H >> 1, TN = TW * TH;
  const height = new Float32Array(TN);
  const landT = new Uint8Array(TN); for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) { const fi = (y * 2) * W + x * 2; landT[y * TW + x] = (prov[fi] || prov[fi + 1] || prov[fi + W] || prov[fi + W + 1]) ? 1 : 0; }
  for (const rg of RANGES) {
    const h = rg[0], wkm = rg[1], pts = rg.slice(2).map(([la, lo]) => { const [x, y] = proj(lo, la); return [x / 2, y / 2, la]; });
    const segs = pts.length > 1 ? pts.slice(0, -1).map((p, i) => [p, pts[i + 1]]) : [[pts[0], pts[0]]];
    for (const [a, b] of segs) {
      const wpx = wkm / kmPerPx((a[2] + b[2]) / 2) / 2; const ext = wpx * 1.9;
      const x0 = Math.floor(Math.min(a[0], b[0]) - ext), x1 = Math.ceil(Math.max(a[0], b[0]) + ext), y0 = Math.max(0, Math.floor(Math.min(a[1], b[1]) - ext)), y1 = Math.min(TH - 1, Math.ceil(Math.max(a[1], b[1]) + ext));
      const abx = b[0] - a[0], aby = b[1] - a[1], ab2 = abx * abx + aby * aby;
      for (let y = y0; y <= y1; y++) for (let xx = x0; xx <= x1; xx++) {
        const x = ((xx % TW) + TW) % TW; const ti = y * TW + x; if (!landT[ti]) continue;
        // bükülmüş uzaklık: sırtlar düzensiz görünsün
        const wx = xx + (fbm(xx * 0.06, y * 0.06, 3, 3) - 0.5) * wpx * 0.9, wy = y + (fbm(xx * 0.06, y * 0.06, 4, 3) - 0.5) * wpx * 0.9;
        const t = ab2 > 0 ? Math.max(0, Math.min(1, ((wx - a[0]) * abx + (wy - a[1]) * aby) / ab2)) : 0;
        const d = Math.hypot(wx - a[0] - abx * t, wy - a[1] - aby * t) / wpx; if (d >= 1.9) continue;
        const along = 0.62 + 0.38 * fbm(xx * 0.018, y * 0.018, 5, 3);
        const ridge = 1 - Math.abs(fbm(xx * 0.11, y * 0.11, 6, 4) * 2 - 1);
        const core = d < 1 ? (1 - d * d) ** 2 : 0, foot = (1 - Math.min(1, d / 1.9)) ** 2 * 0.28;
        const v = h * along * Math.max(core * (0.45 + 0.7 * ridge * ridge), foot);
        if (v > height[ti]) height[ti] = v;
      }
    }
  }
  const terrainRGBA = new Uint8Array(TN * 4); const biomeAt = new Uint8Array(TN);
  const lerp = (a, b, t) => a + (b - a) * t; const mix3 = (c1, c2, t) => { t = Math.max(0, Math.min(1, t)); return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)]; };
  const C = { ice: [234, 239, 244], tundra: [146, 142, 116], taiga: [58, 84, 60], forest: [76, 108, 58], grass: [142, 156, 88], steppe: [188, 174, 118], desert: [226, 198, 140], cdesert: [184, 166, 130], savanna: [172, 158, 90], jungle: [40, 90, 48], rock: [124, 110, 96], snow: [246, 248, 252] };
  // yumuşak kenarlı bölge maskesi (derece cinsinden geçiş)
  const box = (lo, la, lo0, lo1, la0, la1, f = 5) => smooth(-f, f, Math.min(lo - lo0, lo1 - lo, la - la0, la1 - la));
  const colLon = new Float32Array(TW); for (let x = 0; x < TW; x++) colLon[x] = (x * 2 + 1) / W * 360 - 180;
  const MW = (TW >> 3) + 2, MH = (TH >> 3) + 2, madj = new Float32Array(MW * MH);
  for (let gy = 0; gy < MH; gy++) for (let gx = 0; gx < MW; gx++) {
    const lat = rowLat[Math.min(H - 1, gy * 16)], lon = Math.min(180, gx * 16 / W * 360 - 180);
    let m = 0.38 * box(lon, lat, 68, 125, 5, 35) + 0.32 * box(lon, lat, -76, -44, -16, 6) + 0.3 * box(lon, lat, 8, 31, -7, 6) + 0.42 * box(lon, lat, 94, 152, -11, 9)
      + 0.3 * box(lon, lat, -100, -66, 25, 50) + 0.18 * box(lon, lat, -10, 30, 43, 60) + 0.25 * box(lon, lat, 105, 145, 28, 46) + 0.28 * box(lon, lat, -66, -48, -38, -20)
      + 0.2 * box(lon, lat, 25, 41, -32, -8) + 0.16 * box(lon, lat, 20, 62, 45, 62) + 0.2 * box(lon, lat, -125, -115, 40, 50, 3) + 0.15 * box(lon, lat, 135, 154, -40, -25, 3);
    m -= 0.32 * box(lon, lat, -17, 35, 15, 33) + 0.34 * box(lon, lat, 34, 61, 14, 33) + 0.26 * box(lon, lat, 116, 146, -32, -18) + 0.26 * box(lon, lat, 50, 106, 36, 49)
      + 0.7 * box(lon, lat, -72, -67.5, -28, -15, 2) + 0.55 * box(lon, lat, 11, 16, -28, -17, 2) + 0.28 * box(lon, lat, -71, -63, -50, -38, 3) + 0.34 * box(lon, lat, -118, -104, 28, 38, 3)
      + 0.34 * box(lon, lat, 68, 75, 24, 30, 3) + 0.3 * box(lon, lat, 50, 63, 27, 37, 3) + 0.32 * box(lon, lat, 40, 52, 1, 12, 3) + 0.22 * box(lon, lat, 18, 26, -27, -19, 3) + 0.36 * box(lon, lat, 76, 92, 36, 42, 3);
    madj[gy * MW + gx] = m;
  }
  const madjAt = (x, y) => { const fx = x / 8, fy = y / 8; const ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy; const i = iy * MW + ix; return (madj[i] * (1 - tx) + madj[i + 1] * tx) * (1 - ty) + (madj[i + MW] * (1 - tx) + madj[i + MW + 1] * tx) * ty; };
  for (let y = 0; y < TH; y++) {
    const lat = rowLat[Math.min(H - 1, y * 2 + 1)], al = Math.abs(lat);
    const mBase = al < 10 ? 0.92 : al < 20 ? lerp(0.92, 0.42, (al - 10) / 10) : al < 32 ? lerp(0.42, 0.2, (al - 20) / 12) : al < 45 ? lerp(0.25, 0.62, (al - 32) / 13) : al < 62 ? 0.62 : 0.5;
    const snowLine = 0.76 - Math.max(0, al - 25) / 125;
    for (let x = 0; x < TW; x++) {
      const ti = y * TW + x; if (!landT[ti]) continue; const lon = colLon[x];
      const n1 = fbm(x * 0.02, y * 0.02, 7, 4), n2 = fbm(x * 0.07, y * 0.07, 8, 3);
      const coast = Math.min(127, cDist[(y * 2) * W + x * 2]);
      height[ti] = Math.max(height[ti], (n1 - 0.4) * 0.1 + Math.min(1, coast / 90) * 0.05);
      const hgt = height[ti];
      let m = mBase - Math.min(1, coast / 110) * 0.3 + madjAt(x, y);
      const t = 1 - al / 90 * 1.12 - hgt * 0.5 + (n1 - 0.5) * 0.08;
      if (t < 0.46) m += (0.46 - t) * 1.4; // soğuk iklimde buharlaşma az: tayga
      m += (n2 - 0.5) * 0.2; m = Math.max(0, Math.min(1, m));
      let col; let bi;
      if (t < 0.13 || (lat > 59 && lon > -75 && lon < -10 && hgt > 0.3)) { col = C.ice; bi = 6; }
      else if (t < 0.24) { col = mix3(C.tundra, C.taiga, (t - 0.18) / 0.06 * Math.min(1, m * 1.5)); bi = 5; }
      else {
        const hot = smooth(0.5, 0.66, t);
        const dry = mix3(C.cdesert, C.desert, hot), semi = mix3(C.steppe, C.savanna, smooth(0.6, 0.72, t)), green = t < 0.42 ? mix3(C.grass, C.taiga, (0.42 - t) / 0.15) : C.grass;
        const wood = t > 0.7 ? mix3(C.forest, C.jungle, (m - 0.62) * 3) : t < 0.42 ? C.taiga : C.forest;
        col = mix3(dry, semi, smooth(0.1, 0.26, m)); col = mix3(col, green, smooth(0.26, 0.42, m)); col = mix3(col, wood, smooth(0.48, 0.72, m));
        bi = m < 0.18 ? 2 : m < 0.34 ? (t > 0.64 ? 7 : 1) : m > 0.6 ? (t > 0.7 && m > 0.75 ? 4 : 3) : (t > 0.66 ? 7 : 0);
      }
      col = mix3(col, C.rock, (hgt - 0.32) * 2.2);
      if (hgt > snowLine) col = mix3(col, C.snow, (hgt - snowLine) * 6);
      const g = 0.93 + n2 * 0.14;
      const o = ti * 4; terrainRGBA[o] = Math.min(255, col[0] * g); terrainRGBA[o + 1] = Math.min(255, col[1] * g); terrainRGBA[o + 2] = Math.min(255, col[2] * g); terrainRGBA[o + 3] = 255; biomeAt[ti] = bi;
    }
  }
  for (let y = 1; y < TH - 1; y++) for (let x = 0; x < TW; x++) { // tepe gölgelemesi
    const ti = y * TW + x; if (!landT[ti]) continue;
    const hx = height[y * TW + ((x + 1) % TW)] - height[y * TW + ((x - 1 + TW) % TW)], hy = height[ti + TW] - height[ti - TW];
    const s = Math.max(0.68, Math.min(1.28, 1 + (-hx * 0.8 - hy * 0.9) * 6));
    for (let k = 0; k < 3; k++) terrainRGBA[ti * 4 + k] = Math.min(255, terrainRGBA[ti * 4 + k] * s);
  }
  await step(0.68, 'Eyalet bilgileri hazırlanıyor');

  // ---------------------------------------------------------------- 8) eyalet nesneleri
  const provinces = new Array(P + 1);
  for (let a = 1; a <= P; a++) { const s = seeds[a - 1]; provinces[a] = { id: a, country: s.country, area: area[a], cx: area[a] ? sumX[a] / area[a] : s.x, cy: area[a] ? sumY[a] / area[a] : s.y, ax: s.x, ay: s.y, coastal: coastPx[a] > 0, city: s.city || null, capital: !!s.capital, citySize: s.size || 0, nb: [] }; }
  { const best = new Float32Array(P + 1).fill(-1e9); // etiket noktası: sınırdan uzak, merkeze yakın
    for (let i = 0; i < N; i++) { const a = prov[i]; if (!a) continue; const d = Math.min(bDist[i] / 20, cDist[i]); const x = i % W, y = (i / W) | 0; const pr = provinces[a]; const dc = Math.hypot(x - pr.cx, y - pr.cy); const sc = Math.min(d, 9) - dc * 0.02; if (sc > best[a]) { best[a] = sc; pr.ax = x; pr.ay = y; } } }
  for (const pr of provinces) if (pr && pr.city) { const s = seeds[pr.id - 1]; if (prov[s.y * W + s.x] === pr.id && Math.min(bDist[s.y * W + s.x] / 20, cDist[s.y * W + s.x]) > 2.5) { pr.ax = s.x; pr.ay = s.y; } }
  for (const ct of cityAt) { const a = prov[ct.i]; if (!a) continue; const pr = provinces[a]; if (!pr.city) { pr.city = ct.name; pr.citySize = ct.size; } else if (pr.city !== ct.name) pr.citySize = Math.min(3.5, pr.citySize + ct.size * 0.25); }
  for (let a = 1; a <= P; a++) {
    const pr = provinces[a]; const tx = Math.min(TW - 1, Math.round(pr.ax / 2)), ty = Math.min(TH - 1, Math.round(pr.ay / 2)); let hs = 0, n = 0; const bc = new Int32Array(8);
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const yy = ty + dy, xx = (tx + dx + TW) % TW; if (yy < 0 || yy >= TH) continue; const ti = yy * TW + xx; if (!landT[ti]) continue; hs += height[ti]; n++; bc[biomeAt[ti]]++; }
    const hAvg = n ? hs / n : 0; let biome = 0, bm = -1; for (let k = 0; k < 8; k++) if (bc[k] > bm) { bm = bc[k]; biome = k; }
    pr.terrain = hAvg > 0.4 ? 'mountain' : hAvg > 0.24 ? 'hills' : ['plains', 'plains', 'desert', 'forest', 'jungle', 'tundra', 'ice', 'savanna'][biome];
    const habit = { plains: 1, hills: 0.78, mountain: 0.38, desert: 0.22, forest: 0.72, jungle: 0.46, tundra: 0.12, ice: 0.02, savanna: 0.6 }[pr.terrain];
    pr.dev = Math.max(1, Math.min(10, Math.round(1 + habit * 3.2 + (pr.citySize || 0) * 1.0 + (pr.capital ? 1.5 : 0) + (pr.coastal ? 0.3 : 0))));
  }
  for (const [key, len] of pairs) { const a = Math.floor(key / 65536), b = key % 65536; if (len < 2) continue; provinces[a].nb.push({ p: b, sea: false, len }); provinces[b].nb.push({ p: a, sea: false, len }); }
  await step(0.76, 'Deniz yolları çiziliyor');

  // ---------------------------------------------------------------- 9) deniz geçişleri
  const ports = [];
  { const stride = new Int32Array(P + 1); for (let a = 1; a <= P; a++) stride[a] = Math.max(1, Math.round(coastPx[a] / 30)); const cnt = new Int32Array(P + 1), per = new Int32Array(P + 1);
    for (let i = 0; i < N; i++) { const a = prov[i]; if (!a || cDist[i] > 1) continue; if ((cnt[a]++ % stride[a]) !== 0) continue; if (per[a]++ > 34) continue; ports.push([i % W, (i / W) | 0, a]); } }
  const CELL = 48, GW = Math.ceil(W / CELL), GH = Math.ceil(H / CELL); const grid = Array.from({ length: GW * GH }, () => []);
  ports.forEach((p, i) => grid[Math.floor(p[1] / CELL) * GW + Math.floor(p[0] / CELL)].push(i));
  const seaBest = new Map();
  for (let i = 0; i < ports.length; i++) {
    const [x, y, a] = ports[i]; const gx = Math.floor(x / CELL), gy = Math.floor(y / CELL);
    for (let dy = -1; dy <= 1; dy++) { const yy = gy + dy; if (yy < 0 || yy >= GH) continue; for (let dx = -1; dx <= 1; dx++) { const xx = (gx + dx + GW) % GW;
      for (const j of grid[yy * GW + xx]) { const [x2, y2, b] = ports[j]; if (b <= a) continue; const key = a * 65536 + b; if (pairs.has(key)) continue; let ddx = Math.abs(x2 - x); if (ddx > W / 2) ddx = W - ddx; const pd2 = ddx * ddx + (y2 - y) ** 2; if (pd2 > 48 * 48) continue; const kmA = Math.sqrt(pd2) * kmPerPx(rowLat[(y + y2) >> 1]); if (kmA > 470) continue; const km = kmA; const cur = seaBest.get(key); if (!cur || km < cur.km) seaBest.set(key, { km, x, y, x2, y2 }); } } }
  }
  const seaList = [...seaBest.entries()].map(([key, v]) => ({ a: Math.floor(key / 65536), b: key % 65536, ...v })).sort((u, v) => u.km - v.km);
  const seaDeg = new Int32Array(P + 1);
  for (const e of seaList) { if (seaDeg[e.a] >= 4 && seaDeg[e.b] >= 4) continue; seaDeg[e.a]++; seaDeg[e.b]++; provinces[e.a].nb.push({ p: e.b, sea: true, km: Math.round(e.km) }); provinces[e.b].nb.push({ p: e.a, sea: true, km: Math.round(e.km) }); }
  for (let guard = 0; guard < 220; guard++) { // dünya tek ağ olsun
    const compOf = new Int32Array(P + 1).fill(-1); let nc = 0; const sizes = [];
    for (let a = 1; a <= P; a++) { if (compOf[a] >= 0) continue; const st = [a]; compOf[a] = nc; let sz = 0; while (st.length) { const u = st.pop(); sz++; for (const e of provinces[u].nb) if (compOf[e.p] < 0) { compOf[e.p] = nc; st.push(e.p); } } sizes.push(sz); nc++; }
    if (nc <= 1) break;
    let main = 0; for (let k = 1; k < nc; k++) if (sizes[k] > sizes[main]) main = k;
    const small = main === 0 ? 1 : 0;
    let bd = Infinity, bi = -1, bj = -1;
    for (let i = 0; i < ports.length; i++) { if (compOf[ports[i][2]] !== small) continue; for (let j = 0; j < ports.length; j += 3) { if (compOf[ports[j][2]] === small) continue; const [x, y] = ports[i], [x2, y2] = ports[j]; let ddx = Math.abs(x2 - x); if (ddx > W / 2) ddx = W - ddx; const d = ddx * ddx + (y2 - y) ** 2; if (d < bd) { bd = d; bi = i; bj = j; } } }
    if (bi < 0) { const a = provinces.findIndex((p, k) => k > 0 && compOf[k] === small); const b = provinces.findIndex((p, k) => k > 0 && compOf[k] === main); provinces[a].nb.push({ p: b, sea: true, km: 999, long: true }); provinces[b].nb.push({ p: a, sea: true, km: 999, long: true }); continue; }
    const a = ports[bi][2], b = ports[bj][2]; const km = Math.round(kmBetween(ports[bi][0], ports[bi][1], ports[bj][0], ports[bj][1]));
    provinces[a].nb.push({ p: b, sea: true, km, long: true }); provinces[b].nb.push({ p: a, sea: true, km, long: true });
  }
  await step(0.86, 'Dokular paketleniyor');

  // ---------------------------------------------------------------- 10) gölgelendirici dokuları
  const idTex = new Uint8Array(N * 4), fieldTex = new Uint8Array(N * 4);
  // deniz tarafındaki kıyı uzaklığını yumuşat (derinlik renginde hücre deseni olmasın); kara tarafı kesin kalır
  const seaD = new Float32Array(N); for (let i = 0; i < N; i++) seaD[i] = prov[i] ? 0 : Math.min(127, cDist[i]);
  { const tmp = new Float32Array(N); const rad = 5, inv = 1 / (2 * rad + 1);
    for (let y = 0; y < H; y++) { const row = y * W; let acc = 0; for (let k = -rad; k <= rad; k++) acc += seaD[row + ((k + W) % W)]; for (let x = 0; x < W; x++) { tmp[row + x] = acc * inv; acc += seaD[row + ((x + rad + 1) % W)] - seaD[row + ((x - rad + W) % W)]; } }
    for (let x = 0; x < W; x++) { let acc = 0; for (let k = -rad; k <= rad; k++) acc += tmp[Math.min(H - 1, Math.max(0, k)) * W + x]; for (let y = 0; y < H; y++) { const i = y * W + x; if (!prov[i]) seaD[i] = Math.max(Math.min(cDist[i], 3), acc * inv); acc += tmp[Math.min(H - 1, y + rad + 1) * W + x] - tmp[Math.max(0, y - rad) * W + x]; } } }
  for (let y = 0; y < H; y++) { const hy = Math.min(TH - 1, y >> 1) * TW; for (let x = 0; x < W; x++) {
    const i = y * W + x, o = i * 4; const a = prov[i], b = across[i];
    idTex[o] = a & 255; idTex[o + 1] = a >> 8; idTex[o + 2] = b & 255; idTex[o + 3] = b >> 8;
    // uzaklıklar sınır çizgisine göre (kenar pikseli 0.5 piksel uzakta): bDist ×20, kıyı: kara 128+d, deniz 127-d
    fieldTex[o] = bDist[i]; const cd = a ? Math.min(127, cDist[i] - 1) : Math.min(127, Math.round(seaD[i]) - 1); fieldTex[o + 1] = a ? 128 + cd : 127 - cd;
    fieldTex[o + 2] = Math.min(255, (height[hy + (x >> 1)] * 255) | 0); fieldTex[o + 3] = 255;
  } }
  for (let i = 0; i < TN; i++) if (!landT[i]) { terrainRGBA[i * 4] = 150; terrainRGBA[i * 4 + 1] = 158; terrainRGBA[i * 4 + 2] = 122; }

  for (const c of countries) { c.provinces = []; c.capital = 0; }
  for (let a = 1; a <= P; a++) { const c = countries[provinces[a].country - 1]; c.provinces.push(a); if (provinces[a].capital) c.capital = a; }
  for (const c of countries) if (c.provinces.length && !c.capital) c.capital = c.provinces.reduce((m, p) => (provinces[p].dev > provinces[m].dev ? p : m), c.provinces[0]);
  await step(1, 'Hazır');
  return { version: MAP_VERSION, W, H, P, prov, idTex, fieldTex, terrainRGBA, TW, TH, provinces, countries: countries.filter((c) => c.provinces.length) };
}
