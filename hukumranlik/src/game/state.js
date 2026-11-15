// Oyun durumu ve kuralları: ekonomi, ordu, savaş çözümü, diplomasi, kayıt
export const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
export const TERRAIN = {
  plains: { name: 'Ova', def: 1.0 }, hills: { name: 'Tepelik', def: 1.25 }, mountain: { name: 'Dağlık', def: 1.55 }, desert: { name: 'Çöl', def: 1.1 },
  forest: { name: 'Orman', def: 1.25 }, jungle: { name: 'Balta girmemiş orman', def: 1.35 }, tundra: { name: 'Tundra', def: 1.15 }, ice: { name: 'Buzul', def: 1.3 }, savanna: { name: 'Savan', def: 1.05 },
};
export const BUILD = {
  fort: { name: 'Kale', desc: 'Savunmaya +%30 (seviye başına)', cost: (lvl) => 60 + lvl * 70, max: 2 },
  market: { name: 'Pazar', desc: 'Eyalet gelirine +%50', cost: () => 55, max: 1 },
  barracks: { name: 'Kışla', desc: 'Asker kaynağına +%40, toplama sınırına +%50', cost: () => 45, max: 1 },
};
export const DIFF = { easy: { label: 'Kolay', playerIncome: 1.35, aiAggr: 0.6 }, normal: { label: 'Normal', playerIncome: 1.0, aiAggr: 1.0 }, hard: { label: 'Zor', playerIncome: 0.85, aiAggr: 1.45 } };
export const fmt = (n) => { n = Math.round(n); const a = Math.abs(n); return a >= 1e6 ? (n / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace('.', ',') + ' Mn' : a >= 1e4 ? Math.round(n / 1e3) + 'B' : a >= 1e3 ? (n / 1e3).toFixed(1).replace('.', ',') + 'B' : String(n); };

function rng(seed) { let s = seed >>> 0 || 1; const f = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; f.state = () => s; f.set = (v) => { s = v; }; return f; }

export class GameState {
  constructor(world) {
    this.world = world; const P = world.P; this.P = P;
    this.C = world.countries.length;
    this.countries = world.countries.map((c, i) => ({ idx: i, mapId: c.id, ne: c.ne, name: c.name, short: c.short, color: c.color, capital: c.capital, alive: true, gold: 0, manpower: 0, aggr: 0.6 + ((c.id * 37) % 10) / 12, lost: 0, gained: 0, battlesWon: 0, battlesLost: 0 }));
    const idxOf = new Map(world.countries.map((c, i) => [c.id, i]));
    this.owner = new Int16Array(P + 1); this.core = new Int16Array(P + 1); this.troops = new Int32Array(P + 1);
    this.dev = new Uint8Array(P + 1); this.fort = new Uint8Array(P + 1); this.market = new Uint8Array(P + 1); this.barracks = new Uint8Array(P + 1);
    for (let p = 1; p <= P; p++) { const pr = world.provinces[p]; const o = idxOf.get(pr.country); this.owner[p] = o; this.core[p] = o; this.dev[p] = pr.dev; }
    this.provNames = this.makeNames();
    const C = this.C; this.rel = new Float32Array(C * C); this.war = new Uint8Array(C * C); this.ally = new Uint8Array(C * C); this.truce = new Int16Array(C * C); this.warStart = new Int16Array(C * C); this.warScore = new Float32Array(C * C);
    this.turn = 0; this.year = 2026; this.month = 0; this.player = -1; this.diff = 'normal'; this.rng = rng(20260101); this.orders = []; this.news = [];
    this.recomputeLists();
  }

  // Eyalet adları: şehir adı ya da ülke içindeki konuma göre yön adı
  makeNames() {
    const w = this.world, names = new Array(this.P + 1).fill('');
    for (const c of w.countries) {
      let sx = 0, sy = 0, a = 0; for (const p of c.provinces) { const pr = w.provinces[p]; sx += pr.cx * pr.area; sy += pr.cy * pr.area; a += pr.area; } const cx = sx / a, cy = sy / a;
      const span = Math.sqrt(a) * 0.35; const used = new Map();
      for (const p of c.provinces) {
        const pr = w.provinces[p]; if (pr.city) { names[p] = pr.city; continue; }
        if (c.provinces.length === 1) { names[p] = c.name; continue; }
        const dx = pr.cx - cx, dy = pr.cy - cy; let dir;
        if (Math.hypot(dx, dy) < span * 0.5) dir = 'Orta'; else { const ang = Math.atan2(-dy, dx) * 180 / Math.PI; dir = ['Doğu', 'Kuzeydoğu', 'Kuzey', 'Kuzeybatı', 'Batı', 'Güneybatı', 'Güney', 'Güneydoğu'][Math.round(((ang + 360) % 360) / 45) % 8]; }
        const base = `${dir} ${c.short}`; const k = (used.get(base) || 0) + 1; used.set(base, k); names[p] = k > 1 ? `${base} ${['', '', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][k] || k}` : base;
      }
    }
    return names;
  }

  recomputeLists() {
    this.provsOf = Array.from({ length: this.C }, () => []);
    for (let p = 1; p <= this.P; p++) this.provsOf[this.owner[p]].push(p);
    for (const c of this.countries) { if (c.alive && !this.provsOf[c.idx].length) c.alive = false; }
  }

  // ---------------------------------------------------------------- başlangıç
  setup(playerIdx, diff) {
    this.player = playerIdx; this.diff = diff; const R = this.rng;
    for (const c of this.countries) {
      const ps = this.provsOf[c.idx]; let devSum = 0; for (const p of ps) devSum += this.dev[p];
      c.gold = 40 + devSum * 3; c.manpower = devSum * 900;
      for (const p of ps) this.troops[p] = Math.round((this.dev[p] * 520 + 300) * (p === c.capital ? 1.8 : 1) * (0.8 + R() * 0.4) / 10) * 10;
      if (this.world.provinces[c.capital]) this.fort[c.capital] = 1;
    }
    const C = this.C;
    for (let a = 0; a < C; a++) for (let b = a + 1; b < C; b++) { const v = (R() - 0.5) * 40; this.rel[a * C + b] = this.rel[b * C + a] = v; }
    // komşular arasında başlangıçta biraz gerginlik
    for (const [a, b] of this.countryEdges()) { this.rel[a * C + b] -= 8; this.rel[b * C + a] -= 8; }
  }

  // ---------------------------------------------------------------- sorgular
  atWar(a, b) { return a !== b && this.war[a * this.C + b] === 1; }
  allied(a, b) { return a !== b && this.ally[a * this.C + b] === 1; }
  relation(a, b) { return this.rel[a * this.C + b]; }
  enemiesOf(a) { const out = []; for (let b = 0; b < this.C; b++) if (this.war[a * this.C + b]) out.push(b); return out; }
  alliesOf(a) { const out = []; for (let b = 0; b < this.C; b++) if (this.ally[a * this.C + b]) out.push(b); return out; }
  countryEdges() { const set = new Set(), out = []; const C = this.C; for (let p = 1; p <= this.P; p++) for (const e of this.world.provinces[p].nb) { const a = this.owner[p], b = this.owner[e.p]; if (a < b && !e.long) { const k = a * C + b; if (!set.has(k)) { set.add(k); out.push([a, b]); } } } return out; }
  neighborsOf(a) { const set = new Set(); for (const p of this.provsOf[a]) for (const e of this.world.provinces[p].nb) { const b = this.owner[e.p]; if (b !== a && !e.long) set.add(b); } return [...set]; }
  totalTroops(a) { let t = 0; for (const p of this.provsOf[a]) t += this.troops[p]; return t; }
  devSum(a) { let t = 0; for (const p of this.provsOf[a]) t += this.dev[p]; return t; }
  discipline(a) { const n = this.provsOf[a].length || 1; return 0.88 + Math.min(0.24, this.devSum(a) / n * 0.035); }
  income(a) {
    let g = 0; for (const p of this.provsOf[a]) g += this.dev[p] * (this.market[p] ? 1.5 : 1) * (this.core[p] === a ? 1 : 0.55);
    if (a === this.player) g *= DIFF[this.diff].playerIncome;
    const upkeep = this.totalTroops(a) / 1000 * 0.62;
    return { gross: g, upkeep, net: g - upkeep };
  }
  manpowerGain(a) { let m = 0; for (const p of this.provsOf[a]) m += this.dev[p] * 55 * (this.barracks[p] ? 1.4 : 1) * (this.core[p] === a ? 1 : 0.4); return m; }
  manpowerCap(a) { return this.devSum(a) * 2600; }
  maxRecruit(p) { return Math.round(this.dev[p] * 900 * (this.barracks[p] ? 1.5 : 1)); }
  recruitCost(n) { return n / 1000 * 9; }
  defenseMod(p) { const pr = this.world.provinces[p]; return (TERRAIN[pr.terrain]?.def || 1) * (1 + this.fort[p] * 0.3) * (p === this.countries[this.owner[p]].capital ? 1.2 : 1); }
  canMove(from, to, who) {
    if (this.owner[from] !== who) return false; const e = this.world.provinces[from].nb.find((x) => x.p === to); if (!e) return false;
    const o = this.owner[to]; return o === who || this.atWar(who, o);
  }
  edge(from, to) { return this.world.provinces[from].nb.find((x) => x.p === to); }
  committed(p) { let n = 0; for (const o of this.orders) if (o.from === p) n += o.n; return n; }

  // ---------------------------------------------------------------- eylemler
  recruit(p, n) {
    const a = this.owner[p], c = this.countries[a]; n = Math.max(0, Math.min(n, this.maxRecruit(p) - (this.recruitedThisTurn?.[p] || 0), c.manpower, Math.floor(c.gold / this.recruitCost(1000) * 1000))); n = Math.floor(n / 100) * 100; if (n <= 0) return 0;
    c.gold -= this.recruitCost(n); c.manpower -= n; this.troops[p] += n; (this.recruitedThisTurn ||= {})[p] = (this.recruitedThisTurn[p] || 0) + n; return n;
  }
  build(p, kind) {
    const a = this.owner[p], c = this.countries[a]; const B = BUILD[kind]; const lvl = this[kind][p]; if (lvl >= B.max) return false; const cost = B.cost(lvl); if (c.gold < cost) return false;
    c.gold -= cost; this[kind][p] = lvl + 1; return true;
  }
  declareWar(a, b, news = true) {
    if (a === b || this.atWar(a, b)) return [];
    const C = this.C; const joined = [];
    const set = (x, y) => { this.war[x * C + y] = this.war[y * C + x] = 1; this.warStart[x * C + y] = this.warStart[y * C + x] = this.turn; this.warScore[x * C + y] = this.warScore[y * C + x] = 0; this.ally[x * C + y] = this.ally[y * C + x] = 0; this.rel[x * C + y] = this.rel[y * C + x] = Math.min(this.rel[x * C + y], -60); };
    set(a, b);
    // savunanın müttefikleri savaşa katılır, saldıranın müttefikleri ise ilişkiye göre
    for (const al of this.alliesOf(b)) { if (al === a || this.allied(al, a)) continue; if (!this.atWar(al, a)) { set(al, a); joined.push([al, b]); } }
    for (const al of this.alliesOf(a)) { if (al === b || this.allied(al, b) || al === this.player) continue; if (this.relation(al, a) > 30 && this.rng() < 0.55 && !this.atWar(al, b)) { set(al, b); joined.push([al, a]); } }
    if (news) this.pushNews('war', `${this.countries[a].name}, ${this.countries[b].name} ülkesine savaş ilan etti`, [a, b]);
    for (const [x, side] of joined) this.pushNews('join', `${this.countries[x].name}, müttefiki ${this.countries[side].name} için savaşa girdi`, [x, side]);
    return joined;
  }
  makePeace(a, b) {
    const C = this.C; if (!this.atWar(a, b)) return;
    this.war[a * C + b] = this.war[b * C + a] = 0; this.truce[a * C + b] = this.truce[b * C + a] = 12; this.rel[a * C + b] = this.rel[b * C + a] = Math.max(this.rel[a * C + b], -15);
    this.pushNews('peace', `${this.countries[a].name} ile ${this.countries[b].name} barış imzaladı`, [a, b]);
  }
  makeAlliance(a, b) { const C = this.C; this.ally[a * C + b] = this.ally[b * C + a] = 1; this.rel[a * C + b] = this.rel[b * C + a] = Math.max(this.rel[a * C + b], 60); this.pushNews('ally', `${this.countries[a].name} ile ${this.countries[b].name} ittifak kurdu`, [a, b]); }
  breakAlliance(a, b) { const C = this.C; this.ally[a * C + b] = this.ally[b * C + a] = 0; this.rel[a * C + b] = this.rel[b * C + a] = this.rel[a * C + b] - 30; }
  improveRelations(a, b) { const c = this.countries[a]; if (c.gold < 25) return false; c.gold -= 25; const C = this.C; this.rel[a * C + b] = this.rel[b * C + a] = Math.min(100, this.rel[a * C + b] + 15); return true; }
  // savaş skoru: a'nın b'ye karşı durumu (alınan eyaletlerin değeri)
  score(a, b) { return this.warScore[a * this.C + b]; }
  // yapay zekâ barış teklifini kabul eder mi?
  acceptsPeace(ai, other) {
    const sc = this.score(ai, other); const len = this.turn - this.warStart[ai * this.C + other];
    const ratio = this.totalTroops(other) / Math.max(1, this.totalTroops(ai));
    return sc <= 1 || (len > 14 && sc < 6) || ratio > 1.8 || this.provsOf[ai].length <= 2;
  }
  acceptsAlliance(ai, other) { return !this.atWar(ai, other) && this.relation(ai, other) >= 45 && !this.enemiesOf(other).some((e) => this.allied(ai, e)); }

  pushNews(kind, text, who = []) { this.news.push({ kind, text, who, turn: this.turn }); if (this.news.length > 80) this.news.shift(); }

  // ---------------------------------------------------------------- savaş çözümü
  battle(att, from, to, n, sea) {
    const R = this.rng; const def = this.owner[to]; const D = this.troops[to];
    const ap = n * this.discipline(att) * (0.85 + R() * 0.3) * (sea ? 0.78 : 1);
    const dp = D * this.discipline(def) * this.defenseMod(to) * (0.85 + R() * 0.3);
    const res = { att, def, from, to, n, D, won: false, attLoss: 0, defLoss: 0, captured: false, sea };
    if (D <= 0 || ap > dp) {
      const surv = D <= 0 ? n : Math.max(Math.round(n * 0.06), Math.round(n * Math.sqrt(1 - (dp / ap) ** 2)));
      res.won = true; res.attLoss = n - surv; res.defLoss = D; res.captured = true; res.survivors = surv;
    } else {
      const survD = Math.max(1, Math.round(D * Math.sqrt(1 - (ap / dp) ** 2))); const back = Math.round(n * 0.25 * (1 - ap / dp));
      res.attLoss = n - back; res.defLoss = D - survD; res.back = back; res.survD = survD;
    }
    return res;
  }

  // ---------------------------------------------------------------- ekonomi (tur sonu)
  economy() {
    for (const c of this.countries) {
      if (!c.alive) continue; const inc = this.income(c.idx); c.gold += inc.net; c.lastIncome = inc.net;
      c.manpower = Math.min(this.manpowerCap(c.idx), c.manpower + this.manpowerGain(c.idx));
      if (c.gold < 0) { // borç: askerler dağılır
        for (const p of this.provsOf[c.idx]) this.troops[p] = Math.floor(this.troops[p] * 0.94);
        if (c.idx === this.player && !this.debtWarned) { this.pushNews('debt', 'Hazine borçta: ordunun bir kısmı dağıldı', [c.idx]); this.debtWarned = true; }
      } else if (c.idx === this.player) this.debtWarned = false;
    }
    const C = this.C; for (let i = 0; i < C * C; i++) if (this.truce[i] > 0) this.truce[i]--;
    this.recruitedThisTurn = {};
  }
  advanceDate() { this.turn++; this.month++; if (this.month >= 12) { this.month = 0; this.year++; } }
  get dateText() { return `${MONTHS[this.month]} ${this.year}`; }

  // ---------------------------------------------------------------- kayıt
  serialize() {
    const enc = (ta) => Array.from(ta);
    return JSON.stringify({ v: 1, map: this.world.version, turn: this.turn, year: this.year, month: this.month, player: this.player, diff: this.diff, rng: this.rng.state(),
      owner: enc(this.owner), core: enc(this.core), troops: enc(this.troops), dev: enc(this.dev), fort: enc(this.fort), market: enc(this.market), barracks: enc(this.barracks),
      rel: enc(this.rel.map((v) => Math.round(v))), war: enc(this.war), ally: enc(this.ally), truce: enc(this.truce), warStart: enc(this.warStart), warScore: enc(this.warScore.map((v) => Math.round(v * 10) / 10)),
      countries: this.countries.map((c) => ({ g: Math.round(c.gold), m: Math.round(c.manpower), a: c.alive, c: c.capital, l: c.lost, w: c.gained, bw: c.battlesWon, bl: c.battlesLost })), news: this.news.slice(-30), stats: this.stats || null, vs: !!this.victoryShown });
  }
  load(json) {
    const d = typeof json === 'string' ? JSON.parse(json) : json; if (d.v !== 1 || d.map !== this.world.version || d.owner.length !== this.P + 1) return false;
    const set = (ta, arr) => { for (let i = 0; i < arr.length; i++) ta[i] = arr[i]; };
    set(this.owner, d.owner); set(this.core, d.core); set(this.troops, d.troops); set(this.dev, d.dev); set(this.fort, d.fort); set(this.market, d.market); set(this.barracks, d.barracks);
    set(this.rel, d.rel); set(this.war, d.war); set(this.ally, d.ally); set(this.truce, d.truce); set(this.warStart, d.warStart); set(this.warScore, d.warScore);
    d.countries.forEach((s, i) => { const c = this.countries[i]; c.gold = s.g; c.manpower = s.m; c.alive = s.a; if (s.c) c.capital = s.c; c.lost = s.l || 0; c.gained = s.w || 0; c.battlesWon = s.bw || 0; c.battlesLost = s.bl || 0; });
    this.turn = d.turn; this.year = d.year; this.month = d.month; this.player = d.player; this.diff = d.diff; this.rng.set(d.rng); this.news = d.news || []; this.stats = d.stats || null; this.victoryShown = !!d.vs; this.orders = [];
    this.recomputeLists(); return true;
  }
}
