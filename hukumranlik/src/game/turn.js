// Tur çözümü: oyuncu ve yapay zekâ emirleri aynı anda yürür; sonuç bir olay listesidir (animasyon için)
import { planAI, aiDiplomacy } from './ai.js';

const EVENTS = [
  { id: 'harvest', title: 'Bereketli hasat', text: 'Ambarlar doldu, vergiler beklenenden fazla toplandı.', apply: (st, a) => { const g = Math.round(st.income(a).gross * 2.5); st.countries[a].gold += g; return `+${g} altın`; } },
  { id: 'volunteers', title: 'Gönüllüler', text: 'Halk orduya akın ediyor.', apply: (st, a) => { const m = Math.round(st.manpowerGain(a) * 3); st.countries[a].manpower += m; return `+${m.toLocaleString('tr-TR')} asker kaynağı`; } },
  { id: 'gold', title: 'Maden bulundu', text: 'Bir eyalette zengin bir maden damarı keşfedildi.', apply: (st, a) => { const ps = st.provsOf[a]; const p = ps[Math.floor(st.rng() * ps.length)]; if (st.dev[p] < 10) st.dev[p]++; return `${st.provNames[p]}: gelişmişlik +1`; } },
  { id: 'plague', title: 'Salgın', text: 'Kışlalarda hastalık yayıldı.', apply: (st, a) => { let lost = 0; for (const p of st.provsOf[a]) { const d = Math.floor(st.troops[p] * 0.06); st.troops[p] -= d; lost += d; } return `${lost.toLocaleString('tr-TR')} asker kaybedildi`; } },
  { id: 'trade', title: 'Ticaret anlaşması', text: 'Tüccarlar yeni bir yol açtı.', apply: (st, a) => { const g = 40 + Math.round(st.rng() * 60); st.countries[a].gold += g; return `+${g} altın`; } },
  { id: 'reform', title: 'Ordu reformu', text: 'Subaylar yeni bir talimname hazırladı; birlikler daha disiplinli.', apply: (st, a) => { let n = 0; for (const p of st.provsOf[a]) { const d = Math.floor(st.troops[p] * 0.04); st.troops[p] += d; n += d; } return `+${n.toLocaleString('tr-TR')} asker`; } },
];

export function resolveTurn(st) {
  const ev = { moves: [], battles: [], captures: [], eliminated: [], popups: [], capitals: [] };
  const aliveBefore = st.countries.map((c) => c.alive);
  const playerOrders = st.orders; st.orders = [];
  const all = [...playerOrders, ...planAI(st)];
  // yola çıkış
  for (const o of all) {
    if (st.owner[o.from] !== o.owner) continue; const n = Math.min(o.n, st.troops[o.from]); if (n < 100) continue;
    st.troops[o.from] -= n; o.n = n; o.player = o.owner === st.player; ev.moves.push(o);
  }
  // varış sırası karışık (aynı anda yürüyen ordular)
  for (let i = ev.moves.length - 1; i > 0; i--) { const j = Math.floor(st.rng() * (i + 1)); [ev.moves[i], ev.moves[j]] = [ev.moves[j], ev.moves[i]]; }
  ev.moves.sort((x, y) => (st.owner[x.to] === x.owner ? 0 : 1) - (st.owner[y.to] === y.owner ? 0 : 1)); // önce takviyeler
  for (const o of ev.moves) {
    const to = o.to, tOwner = st.owner[to];
    if (tOwner === o.owner) { st.troops[to] += o.n; o.result = 'join'; continue; }
    if (!st.atWar(o.owner, tOwner)) { if (st.owner[o.from] === o.owner) st.troops[o.from] += o.n; o.result = 'cancel'; continue; }
    const r = st.battle(o.owner, o.from, to, o.n, o.sea); o.battle = r; ev.battles.push(r);
    const A = st.countries[o.owner], D = st.countries[tOwner];
    if (r.won) {
      A.battlesWon++; D.battlesLost++; A.gained++; D.lost++;
      st.owner[to] = o.owner; st.troops[to] = r.survivors; st.fort[to] = Math.max(0, st.fort[to] - 1); o.result = 'won';
      const C = st.C; const v = st.dev[to] + (to === D.capital ? 5 : 0); st.warScore[o.owner * C + tOwner] += v; st.warScore[tOwner * C + o.owner] -= v;
      ev.captures.push({ p: to, from: tOwner, to: o.owner, capital: to === D.capital });
    } else {
      A.battlesLost++; D.battlesWon++; st.troops[to] = r.survD; if (st.owner[o.from] === o.owner) st.troops[o.from] += r.back; o.result = 'lost';
    }
  }
  st.recomputeLists();
  // başkenti düşen ülke yeni başkent seçer; yok olanlar
  for (const c of st.countries) {
    if (!c.alive) { if (aliveBefore[c.idx]) { ev.eliminated.push(c.idx); for (let b = 0; b < st.C; b++) { st.war[c.idx * st.C + b] = st.war[b * st.C + c.idx] = 0; st.ally[c.idx * st.C + b] = st.ally[b * st.C + c.idx] = 0; } st.pushNews('elim', `${c.name} tarih sahnesinden silindi`, [c.idx]); } continue; }
    if (st.owner[c.capital] !== c.idx) { const old = c.capital; c.capital = st.provsOf[c.idx].reduce((m, p) => (st.dev[p] > st.dev[m] ? p : m), st.provsOf[c.idx][0]); ev.capitals.push({ c: c.idx, old, now: c.capital }); if (c.idx === st.player) st.pushNews('capital', `Başkent düştü! Yeni başkent: ${st.provNames[c.capital]}`, [c.idx]); }
  }
  st.economy();
  aiDiplomacy(st, ev.popups);
  // rastgele olay (yalnız oyuncu için gösterilir)
  if (st.countries[st.player]?.alive && st.turn > 1 && st.rng() < 0.16) { const e = EVENTS[Math.floor(st.rng() * EVENTS.length)]; const res = e.apply(st, st.player); ev.popups.push({ type: 'event', title: e.title, text: e.text, result: res, id: e.id }); }
  st.advanceDate();
  // istatistik: güç geçmişi
  const s = st.stats || (st.stats = { provinces: [], troops: [] }); s.provinces.push(st.provsOf[st.player]?.length || 0); s.troops.push(st.totalTroops(st.player)); if (s.provinces.length > 240) { s.provinces.shift(); s.troops.shift(); }
  return ev;
}
