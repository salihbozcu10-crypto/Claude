// Harita üretecini Node'da çalıştırır: süre, istatistik ve PNG önizleme
import { build } from 'esbuild';
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
const out = process.argv[2] || '/tmp/gen';
const r = await build({ entryPoints: ['src/map/generate.js'], bundle: true, platform: 'node', format: 'esm', write: false, loader: { '.json': 'json' } });
const mod = await import('data:text/javascript;base64,' + Buffer.from(r.outputFiles[0].text).toString('base64'));
const t0 = Date.now(); let last = t0;
const w = await mod.generateWorld((p, t) => { const now = Date.now(); process.stdout.write(`${(p * 100).toFixed(0)}% ${t} (+${now - last} ms)\n`); last = now; });
console.log('toplam', Date.now() - t0, 'ms; eyalet', w.P, 'ülke', w.countries.length);
const deg = w.provinces.slice(1).map((p) => p.nb.length); const iso = w.provinces.slice(1).filter((p) => !p.nb.length).length;
console.log('ort. komşu', (deg.reduce((a, b) => a + b, 0) / deg.length).toFixed(2), 'komşusuz', iso, 'deniz kenarı', w.provinces.slice(1).reduce((a, p) => a + p.nb.filter((e) => e.sea).length, 0) / 2, 'uzun yol', w.provinces.slice(1).reduce((a, p) => a + p.nb.filter((e) => e.long).length, 0) / 2);
const top = [...w.countries].sort((a, b) => b.provinces.length - a.provinces.length).slice(0, 14).map((c) => `${c.name}:${c.provinces.length}`).join(' ');
console.log(top);
const tr = w.countries.find((c) => c.ne === 'Turkey'); console.log('Türkiye eyaletleri:', tr.provinces.map((p) => `${w.provinces[p].city || '?'}(${w.provinces[p].dev},${w.provinces[p].terrain})`).join(' '));
const devs = new Array(11).fill(0); for (const p of w.provinces.slice(1)) devs[p.dev]++; console.log('gelişmişlik dağılımı', devs.join(' '));
// PNG yazıcı
function png(path, wd, ht, rgba) {
  const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
  const crc = (buf) => { let c = -1; for (const b of buf) c = crcT[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const chunk = (type, data) => { const b = Buffer.alloc(12 + data.length); b.writeUInt32BE(data.length, 0); b.write(type, 4); data.copy(b, 8); b.writeUInt32BE(crc(b.subarray(4, 8 + data.length)), 8 + data.length); return b; };
  const raw = Buffer.alloc((wd * 4 + 1) * ht); for (let y = 0; y < ht; y++) { raw[y * (wd * 4 + 1)] = 0; Buffer.from(rgba.buffer, rgba.byteOffset + y * wd * 4, wd * 4).copy(raw, y * (wd * 4 + 1) + 1); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(wd, 0); ihdr.writeUInt32BE(ht, 4); ihdr[8] = 8; ihdr[9] = 6;
  writeFileSync(path, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}
// önizleme: yarım çözünürlükte eyalet renkleri + ülke sınırları + arazi
const S = 2, pw = w.W / S, ph = w.H / S; const img = new Uint8Array(pw * ph * 4);
const pc = (a) => { const h = (a * 2654435761) >>> 0; return [80 + (h & 127), 80 + ((h >> 8) & 127), 80 + ((h >> 16) & 127)]; };
for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) {
  const i = (y * S) * w.W + x * S; const a = w.prov[i]; const o = (y * pw + x) * 4;
  if (!a) { img[o] = 22; img[o + 1] = 52; img[o + 2] = 86; img[o + 3] = 255; continue; }
  const ti = (y * S >> 1) * w.TW + (x * S >> 1); const t = [w.terrainRGBA[ti * 4], w.terrainRGBA[ti * 4 + 1], w.terrainRGBA[ti * 4 + 2]];
  const c = pc(w.provinces[a].country * 7 + 3); const pr = w.prov[i + 1] !== a || w.prov[i + w.W] !== a; const cb = (w.prov[i + 1] && w.provinces[w.prov[i + 1]].country !== w.provinces[a].country) || (w.prov[i + w.W] && w.provinces[w.prov[i + w.W]].country !== w.provinces[a].country);
  for (let k = 0; k < 3; k++) img[o + k] = cb ? 20 : pr ? t[k] * 0.55 + c[k] * 0.2 : t[k] * 0.6 + c[k] * 0.4; img[o + 3] = 255;
}
png(out + '-prov.png', pw, ph, img);
const tex = new Uint8Array(w.TW * w.TH * 4); for (let i = 0; i < w.TW * w.TH; i++) { const land = w.terrainRGBA[i * 4 + 3]; for (let k = 0; k < 3; k++) tex[i * 4 + k] = land ? w.terrainRGBA[i * 4 + k] : [24, 60, 96][k]; tex[i * 4 + 3] = 255; }
png(out + '-terrain.png', w.TW, w.TH, tex);
// Avrupa yakın çekim (tam çözünürlük)
const [ex0, ey0] = mod.proj(-12, 62), [ex1, ey1] = mod.proj(48, 33); const ew = Math.round(ex1 - ex0), eh = Math.round(ey1 - ey0); const eu = new Uint8Array(ew * eh * 4);
for (let y = 0; y < eh; y++) for (let x = 0; x < ew; x++) { const gx = Math.round(ex0) + x, gy = Math.round(ey0) + y; const i = gy * w.W + gx; const a = w.prov[i]; const o = (y * ew + x) * 4; if (!a) { eu[o] = 22; eu[o + 1] = 52; eu[o + 2] = 86; eu[o + 3] = 255; continue; } const c = pc(w.provinces[a].country * 7 + 3); const pb = w.prov[i + 1] !== a || w.prov[i + w.W] !== a; const cb = (w.prov[i + 1] && w.provinces[w.prov[i + 1]].country !== w.provinces[a].country) || (w.prov[i + w.W] && w.provinces[w.prov[i + w.W]].country !== w.provinces[a].country); for (let k = 0; k < 3; k++) eu[o + k] = cb ? 15 : pb ? c[k] * 0.7 : c[k]; eu[o + 3] = 255; }
for (let a = 1; a <= w.P; a++) { const p = w.provinces[a]; const x = Math.round(p.ax - ex0), y = Math.round(p.ay - ey0); if (x < 1 || y < 1 || x >= ew - 1 || y >= eh - 1) continue; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const o = ((y + dy) * ew + x + dx) * 4; eu[o] = 255; eu[o + 1] = p.capital ? 40 : 255; eu[o + 2] = p.city ? 40 : 255; } }
png(out + '-europe.png', ew, eh, eu);
console.log('png yazıldı');
