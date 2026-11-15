// Ülke renkleri: haritada komşular birbirinden ayırt edilsin
const hsl = (h, s, l) => { h = ((h % 360) + 360) % 360 / 360; const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q; const f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; }; return [Math.round(f(h + 1 / 3) * 255), Math.round(f(h) * 255), Math.round(f(h - 1 / 3) * 255)]; };
// tanıdık ülkeler için tercih edilen renkler
const PREF = { Turkey: hsl(356, 0.72, 0.5), Russia: hsl(140, 0.42, 0.42), 'United States of America': hsl(214, 0.55, 0.52), 'United Kingdom': hsl(340, 0.5, 0.55), France: hsl(222, 0.6, 0.58), Germany: hsl(30, 0.12, 0.46), China: hsl(42, 0.78, 0.52), Japan: hsl(0, 0.0, 0.88), India: hsl(28, 0.75, 0.55), Brazil: hsl(110, 0.5, 0.45), Canada: hsl(352, 0.45, 0.62), Australia: hsl(24, 0.55, 0.6), Iran: hsl(160, 0.45, 0.42), Egypt: hsl(48, 0.55, 0.6), Italy: hsl(120, 0.35, 0.58), Spain: hsl(50, 0.8, 0.5), 'Saudi Arabia': hsl(96, 0.45, 0.4), Mexico: hsl(150, 0.4, 0.4), Argentina: hsl(196, 0.55, 0.62), Poland: hsl(345, 0.45, 0.48), Ukraine: hsl(52, 0.7, 0.55), Kazakhstan: hsl(186, 0.5, 0.48), Indonesia: hsl(0, 0.55, 0.44), Pakistan: hsl(128, 0.5, 0.32), Greece: hsl(204, 0.6, 0.66), Sweden: hsl(212, 0.6, 0.42), Norway: hsl(8, 0.55, 0.45), Denmark: hsl(0, 0.5, 0.6) };
export function assignColors(world) {
  const cs = world.countries; const pal = [];
  for (let i = 0; i < 72; i++) { const h = (i * 137.508) % 360; const s = 0.3 + ((i * 7) % 5) * 0.065; const l = 0.44 + ((i * 3) % 4) * 0.055; pal.push(hsl(h, s, l)); }
  const idx = new Map(cs.map((c, i) => [c.id, i])); const adj = cs.map(() => new Set());
  for (let p = 1; p <= world.P; p++) { const a = idx.get(world.provinces[p].country); for (const e of world.provinces[p].nb) { const b = idx.get(world.provinces[e.p].country); if (a !== b && !e.long) { adj[a].add(b); adj[b].add(a); } } }
  const dist = (a, b) => { const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2]; return 2 * dr * dr + 4 * dg * dg + 3 * db * db; };
  const order = cs.map((c, i) => i).sort((a, b) => cs[b].provinces.length - cs[a].provinces.length);
  for (const i of order) { const c = cs[i]; if (PREF[c.ne]) { c.color = PREF[c.ne]; continue; } }
  for (const i of order) {
    const c = cs[i]; if (c.color) continue; let best = null, bs = -1;
    for (const col of pal) { let m = 1e9; for (const j of adj[i]) if (cs[j].color) m = Math.min(m, dist(col, cs[j].color)); const used = cs.filter((o) => o.color && dist(o.color, col) < 1200).length; const sc = m - used * 2000 + ((col[0] * 7 + col[2]) % 97); if (sc > bs) { bs = sc; best = col; } }
    c.color = best;
  }
}
