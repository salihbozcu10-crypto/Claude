// Dünyayı N tur kendi kendine oynatır: denge, hız ve hata denetimi
import { build } from 'esbuild';
const r = await build({ stdin: { contents: `export { generateWorld } from './src/map/generate.js'; export { assignColors } from './src/game/colors.js'; export { GameState } from './src/game/state.js'; export { resolveTurn } from './src/game/turn.js';`, resolveDir: process.cwd() }, bundle: true, platform: 'node', format: 'esm', write: false, loader: { '.json': 'json' } });
const m = await import('data:text/javascript;base64,' + Buffer.from(r.outputFiles[0].text).toString('base64'));
const world = await m.generateWorld(); m.assignColors(world);
const st = new m.GameState(world); const tr = st.countries.findIndex((c) => c.ne === 'Turkey'); st.setup(tr, process.argv[3] || 'normal');
const T = +(process.argv[2] || 150); let t0 = Date.now(), wars = 0, peaces = 0, caps = 0, battles = 0, popups = {}; const turnMs = [];
for (let i = 0; i < T; i++) {
  const s0 = Date.now(); const ev = m.resolveTurn(st); turnMs.push(Date.now() - s0);
  battles += ev.battles.length; caps += ev.captures.length; for (const p of ev.popups) popups[p.type] = (popups[p.type] || 0) + 1;
  if (i % 30 === 29) {
    let w = 0; for (let k = 0; k < st.C * st.C; k++) w += st.war[k]; w /= 2;
    const alive = st.countries.filter((c) => c.alive).length; const top = [...st.countries].filter((c) => c.alive).sort((a, b) => st.provsOf[b.idx].length - st.provsOf[a.idx].length).slice(0, 6).map((c) => `${c.short}:${st.provsOf[c.idx].length}`).join(' ');
    console.log(`tur ${st.turn} (${st.dateText}): savaş ${w}, yaşayan ${alive}, fetih ${caps}, çarpışma ${battles} | ${top} | TR: ${st.provsOf[tr].length} eyalet, ${Math.round(st.totalTroops(tr) / 1000)}B asker, ${Math.round(st.countries[tr].gold)} altın`);
  }
}
turnMs.sort((a, b) => a - b);
console.log('tur süresi ms: ort', (turnMs.reduce((a, b) => a + b, 0) / T).toFixed(1), 'medyan', turnMs[T >> 1], 'en kötü', turnMs[T - 1]);
console.log('oyuncuya gelenler', JSON.stringify(popups));
const save = st.serialize(); console.log('kayıt boyutu', (save.length / 1024).toFixed(0), 'KB');
const st2 = new m.GameState(world); console.log('kayıt yükleme', st2.load(save), st2.dateText, st2.provsOf[tr].length);
