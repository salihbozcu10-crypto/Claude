// Yapay zekâ: ekonomi, ordu hareketleri ve diplomasi
import { DIFF } from './state.js';

// Her yapay zekâ ülkesi için emirler (inşa ve asker toplama anında uygulanır)
export function planAI(st) {
  const W = st.world, orders = [];
  for (const c of st.countries) {
    if (!c.alive || c.idx === st.player) continue;
    const a = c.idx, ps = st.provsOf[a]; if (!ps.length) continue;
    const enemies = st.enemiesOf(a); const atWar = enemies.length > 0;
    const inc = st.income(a);
    // cephe: düşman eyaletine komşu olanlar; sınır: herhangi bir yabancıya komşu olanlar
    const front = [], border = [];
    for (const p of ps) { let f = false, b = false; for (const e of W.provinces[p].nb) { const o = st.owner[e.p]; if (o === a) continue; if (st.atWar(a, o)) f = true; if (!e.long) b = true; } if (f) front.push(p); else if (b) border.push(p); }
    // inşa
    if (c.gold > 170 && st.rng() < 0.22) {
      if (atWar && front.length && !st.fort[c.capital] && front.includes(c.capital)) st.build(c.capital, 'fort');
      else { let best = 0, bv = 0; for (const p of ps) if (!st.market[p] && st.core[p] === a && st.dev[p] > bv) { bv = st.dev[p]; best = p; } if (best) st.build(best, 'market'); }
    }
    // asker toplama
    const reserve = Math.max(15, inc.gross * (atWar ? 0.8 : 2.2));
    const targets = front.length ? front : border.length ? border : ps;
    let budget = c.gold - reserve; let guard = 0;
    while (budget > 9 && c.manpower > 400 && guard++ < 6) {
      const p = targets[Math.floor(st.rng() * targets.length)]; const n = Math.min(st.maxRecruit(p), Math.floor(budget / st.recruitCost(1000) * 1000), c.manpower) * (atWar ? 1 : 0.35);
      const got = st.recruit(p, n); if (!got) break; budget -= st.recruitCost(got);
    }
    if (!atWar) continue;
    // cepheye uzaklık (kendi eyaletleri üzerinden BFS)
    const dist = new Map(); const q = [...front]; for (const p of front) dist.set(p, 0);
    for (let h = 0; h < q.length; h++) { const p = q[h]; const d = dist.get(p); for (const e of W.provinces[p].nb) if (st.owner[e.p] === a && !dist.has(e.p)) { dist.set(e.p, d + 1); q.push(e.p); } }
    const disc = st.discipline(a);
    for (const p of ps) {
      const T = st.troops[p]; if (T < 300) continue; const d = dist.get(p);
      if (d === 0) {
        let best = null, bs = 0;
        for (const e of W.provinces[p].nb) {
          const o = st.owner[e.p]; if (!st.atWar(a, o)) continue;
          const def = st.troops[e.p] * st.defenseMod(e.p) * st.discipline(o) * (e.sea ? 1.3 : 1);
          const atk = T * 0.85 * disc;
          if (atk > def * (1.15 + (o === st.player ? 0.1 : 0))) { const val = st.dev[e.p] + (e.p === st.countries[o].capital ? 6 : 0) + Math.min(3, atk / Math.max(def, 200)); if (val > bs) { bs = val; best = e; } }
        }
        if (best) orders.push({ from: p, to: best.p, n: Math.floor(T * 0.85 / 100) * 100, owner: a, sea: !!best.sea });
      } else if (d !== undefined) {
        const keep = Math.min(T, st.dev[p] * 120); const n = Math.floor((T - keep) / 100) * 100; if (n < 300) continue;
        let step = null; for (const e of W.provinces[p].nb) if (st.owner[e.p] === a && dist.get(e.p) === d - 1) { step = e; break; }
        if (step) orders.push({ from: p, to: step.p, n, owner: a, sea: !!step.sea });
      }
    }
  }
  return orders;
}

// Diplomasi: savaş ilanları, barışlar, ittifaklar. Oyuncuyu ilgilendirenler 'out' listesine eklenir.
export function aiDiplomacy(st, out) {
  const C = st.C, aggrK = DIFF[st.diff].aiAggr;
  for (const c of st.countries) {
    if (!c.alive || c.idx === st.player) continue; const a = c.idx;
    // barış
    for (const b of st.enemiesOf(a)) {
      if (b === st.player) {
        const last = c.lastPeaceOffer ?? -99;
        if (st.turn - last >= 6 && st.acceptsPeace(a, b) && st.score(a, b) < 0 && st.rng() < 0.35) { c.lastPeaceOffer = st.turn; out.push({ type: 'peaceOffer', from: a }); }
        continue;
      }
      if (a < b && st.acceptsPeace(a, b) && st.acceptsPeace(b, a) && st.rng() < 0.22) st.makePeace(a, b);
    }
    // savaş ilanı (ilk turlar sakin)
    if (st.turn >= 3 && st.enemiesOf(a).length < 2 && st.rng() < 0.03 * c.aggr * aggrK) {
      const myStr = st.totalTroops(a) * st.discipline(a); let best = -1, bs = 0;
      for (const b of st.neighborsOf(a)) {
        if (st.allied(a, b) || st.atWar(a, b) || st.truce[a * C + b] > 0) continue;
        let str = st.totalTroops(b) * st.discipline(b); for (const al of st.alliesOf(b)) str += st.totalTroops(al) * 0.4;
        const ratio = str / Math.max(1, myStr); if (ratio > 0.62) continue;
        const sc = (0.62 - ratio) * 2 - st.relation(a, b) / 100 + st.devSum(b) / 120 + (b === st.player ? 0.05 : 0); if (sc > bs) { bs = sc; best = b; }
      }
      if (best >= 0) { const joined = st.declareWar(a, best); if (best === st.player || joined.some(([x]) => x === st.player) || st.allied(best, st.player)) out.push({ type: 'war', from: a, to: best }); }
    }
    // ittifak
    if (st.rng() < 0.015) {
      for (const b of st.neighborsOf(a)) {
        if (st.allied(a, b) || st.atWar(a, b) || st.relation(a, b) < 40) continue;
        const common = st.enemiesOf(a).some((e) => st.atWar(b, e));
        if (!common && st.rng() > 0.25) continue;
        if (b === st.player) { if (!(c.lastAllyOffer > st.turn - 10)) { c.lastAllyOffer = st.turn; out.push({ type: 'allyOffer', from: a }); } }
        else if (st.acceptsAlliance(b, a)) st.makeAlliance(a, b);
        break;
      }
    }
    // ilişkiler zamanla nötre döner
    for (let b = 0; b < C; b++) { const i = a * C + b; if (b !== a && !st.war[i]) st.rel[i] *= 0.995; }
  }
}
