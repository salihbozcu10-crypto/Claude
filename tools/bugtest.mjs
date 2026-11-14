// Hata avı testi (geliştirme aracı):
//  1) çizim yükü: kare başına çizim çağrısı ve üçgen sayısı
//  2) işlemci yükü: alt sistem başına kare süresi (çatışma sırasında)
//  3) yürüyüş: oyuncuyu gerçek girdiyle yol noktalarında yürütür, takıldığı yerleri raporlar
//  4) dayanıklılık: uzun rastgele oynanışta hata / NaN arar
import { createRequire } from 'module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const only = process.argv[2] || 'all';
const hash = process.argv[3] || 'q-low-test';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--disable-gpu-watchdog', '--disable-hang-monitor'] });
const page = await (await browser.newContext({ viewport: { width: 844, height: 390 } })).newPage();
const errs = [];
page.on('console', (m) => { const t = m.text(); if ((m.type() === 'error' || m.type() === 'warning') && !/GPU stall|GL Driver|fonts.g|ERR_|Failed to load resource/.test(t)) errs.push(`[${m.type()}] ${t.slice(0, 500)}`); });
page.on('pageerror', (e) => errs.push('[pageerror] ' + (e.stack || e.message).slice(0, 800)));
await page.goto('file://' + resolve(root, 'index.html') + '#' + hash);
await page.waitForFunction(() => window.__ready, null, { timeout: 240000 });
const run = async (label, fn, arg) => { const t0 = Date.now(); try { const r = await page.evaluate(fn, arg); console.log(`== ${label} (${Date.now() - t0} ms)\n${typeof r === 'string' ? r : JSON.stringify(r, null, 0)}`); } catch (e) { console.log(`== ${label}: HATA ${e.message.split('\n').slice(0, 4).join(' | ')}`); } };

await page.evaluate(() => {
  const g = __sv; g.startMission(); g.testPause(true); g.sim(270);
  window.__drive = (targets, opt = {}) => {
    const pl = g.player, out = []; let ti = 0, frames = 0, lastP = pl.pos.clone(), lastT = 0, jumps = 0;
    const maxF = opt.maxFrames || 20000;
    while (ti < targets.length && frames < maxF) {
      const t = targets[ti]; const dx = t[0] - pl.pos.x, dz = t[1] - pl.pos.z; const d = Math.hypot(dx, dz);
      if (d < (opt.tol || 0.55)) { ti++; jumps = 0; continue; }
      pl.yaw = Math.atan2(-dx, -dz); g.input.down.add('fwd'); if (opt.sprint) g.input.down.add('sprint');
      g.sim(1); frames++;
      if (frames - lastT >= 75) {
        const moved = Math.hypot(pl.pos.x - lastP.x, pl.pos.z - lastP.z);
        if (moved < 0.35) {
          if (jumps < 1) { g.input.pressed.add('jump'); jumps++; }
          else { out.push({ at: [+pl.pos.x.toFixed(2), +pl.pos.y.toFixed(2), +pl.pos.z.toFixed(2)], to: t, crouch: pl.crouching, h: +pl.height.toFixed(2), ground: pl.onGround }); pl.pos.set(t[0], g.world.groundY(t[0], t[1]) + (t[2] || 0) + 0.05, t[1]); pl.vy = 0; ti++; jumps = 0; }
        }
        lastP.copy(pl.pos); lastT = frames;
      }
      if (!Number.isFinite(pl.pos.x + pl.pos.y + pl.pos.z)) { out.push({ nan: true, to: t }); break; }
    }
    g.input.down.delete('fwd'); g.input.down.delete('sprint'); g.sim(2);
    return { stuck: out, frames, reached: ti, of: targets.length, end: [+pl.pos.x.toFixed(1), +pl.pos.y.toFixed(2), +pl.pos.z.toFixed(1)] };
  };
  window.__navTargets = (fx, fz, tx, tz) => { const p = g.world.nav.findPath(fx, fz, tx, tz, 60000); return p ? p.map((q) => [q.x, q.z]) : null; };
});

if (only === 'all' || only === 'perf') {
  await run('çizim yükü (menü ve görev başı)', () => {
    const g = __sv, r = g.renderer; r.info.autoReset = false; const res = {};
    const measure = (label) => { r.info.reset(); g.renderOnce(1); res[label] = { calls: r.info.render.calls, tris: r.info.render.triangles }; };
    g.player.pos.set(6, g.world.groundY(6, 172) + 0.05, 172); g.player.yaw = 0; g.sim(5); measure('başlangıç tepesi');
    g.player.pos.set(0, 0.1, 30); g.player.yaw = 0; g.sim(5); measure('avlu');
    g.player.pos.set(0.5, 0.2, -30); g.player.yaw = 0.6; g.sim(5); measure('karargâh içi');
    r.info.autoReset = true; return res;
  });
  await run('işlemci yükü (çatışma, kare başına ms)', () => {
    const g = __sv; const T = {}; const wrap = (obj, name, key) => { const f = obj[name].bind(obj); obj[name] = (...a) => { const t0 = performance.now(); const r = f(...a); T[key] = (T[key] || 0) + performance.now() - t0; return r; }; };
    wrap(g.ai, 'update', 'ai'); wrap(g.player, 'update', 'oyuncu'); wrap(g.weapons, 'update', 'silah'); wrap(g.ballistics, 'update', 'balistik'); wrap(g.fx, 'update', 'efekt'); wrap(g.mission, 'update', 'görev'); wrap(g.world.nav, 'findPath', 'yol bulma');
    g.player.godMode = true; g.player.pos.set(0, 0.1, 30); g.sim(60);
    for (const k in T) T[k] = 0; const N = 600; const t0 = performance.now(); g.sim(N); const total = performance.now() - t0;
    const out = { toplam: +(total / N).toFixed(3) }; for (const k in T) out[k] = +(T[k] / N).toFixed(3);
    let combat = 0; for (const b of g.ai.brains) if (b.state === 4) combat++; out.çatışmada = combat; return out;
  });
}

if (only === 'all' || only === 'walk') {
  await run('yürüyüş: başlangıç → ana kapı → avlu → karargâh girişi', () => {
    const g = __sv; for (const b of g.ai.brains) b.update = () => {}; g.player.godMode = true;
    const st = g.world.data.playerStart; g.player.pos.set(st.x, g.world.groundY(st.x, st.z) + 0.05, st.z);
    const path = [...__navTargets(st.x, st.z, 0, 47), [0, 44], [0.2, 36], [0.3, -24.5], [0.3, -27.4], [0.3, -29.5], [0.3, -31.5]];
    return __drive(path, { sprint: true });
  });
  await run('yürüyüş: karargâh içi → merdiven → üst kat → istihbarat', () => {
    return __drive([[3.8, -33.5], [3.8, -38.8], [2.7, -39.8], [2.7, -41.05], [8.8, -41.05], [9.0, -37.5], [4, -36], [-1.2, -33.7], [-2.8, -33.7], [-6, -38]]);
  });
  await run('yürüyüş: üst kat → merdivenden in → doğu kapısı → depo → cephanelik', () => {
    const g = __sv; const r = __drive([[-2.8, -33.7], [-1.2, -33.7], [4, -36], [9.0, -37.5], [9.0, -41.05], [2.7, -41.05], [2.7, -39.8], [3.8, -38.8], [3.8, -33.5], [8.4, -32.0], [11.5, -32], [16, -30], [27, -29], [31, -29], [40, -31], [44.6, -33.2]]);
    r.y = +g.player.pos.y.toFixed(2); return r;
  });
  await run('yürüyüş: depo → hücre bloğu → rehine hücresi', () => {
    const g = __sv; const p0 = g.player.pos; const a = __navTargets(p0.x, p0.z, 36.6, 18.9) || []; return __drive([...a, [37.2, 18.9], [39.5, 18.9], [42, 20.5], [45.9, 21.3], [45.9, 23], [47, 24.6]]);
  });
  await run('yürüyüş: hücre → telsiz direği → batı gediği → iniş bölgesi', () => {
    const g = __sv; return __drive([[45.9, 23], [45.9, 21.2], [42, 19.5], [39.5, 18.9], [36.8, 18.9], ...(__navTargets(36.8, 18.9, -22.6, -38.4) || []), ...(__navTargets(-22.6, -38.4, -60, 10) || []), [-66, 10], ...(__navTargets(-67, 10, -150, 34) || [])], { sprint: true });
  });
  await run('yürüyüş: kışla ve rastgele hedefler', () => {
    const g = __sv; const nav = g.world.nav; const pts = [[-49.7, -20.5], [-49.7, -23.5], [-45, -27], [-41, -27.4], [-38, -27.4], [-37.1, -23.5], [-37.1, -20]];
    let r = __drive(pts); const all = { kışla: r.stuck, rastgele: [] };
    let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 40; i++) { const x = -62 + rnd() * 124, z = -50 + rnd() * 100; if (!nav.walkable(x, z)) continue; const p = g.player.pos; const path = __navTargets(p.x, p.z, x, z); if (!path) continue; r = __drive(path, { maxFrames: 4000 }); all.rastgele.push(...r.stuck); }
    return all;
  });
}

if (only === 'all' || only === 'stress') {
  await run('dayanıklılık: 6000 kare rastgele çatışma', () => {
    const g = __sv; g.startMission(); g.testPause(true); g.sim(270); const pl = g.player; pl.godMode = true; let seed = 11; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const spots = [[0, 30], [-20, 10], [20, -5], [-30, -15], [35, 5], [0, -20], [-45, 30], [50, 30]]; const acts = ['fire', 'ads', 'crouch', 'jump', 'reload', 'grenade', 'flash', 'swap', 'leanL', 'leanR', 'sprint', 'heal', 'nvg', 'firemode'];
    let nan = 0;
    for (let f = 0; f < 6000; f++) {
      if (f % 600 === 0) { const s = spots[(f / 600) % spots.length]; pl.pos.set(s[0], g.world.groundY(s[0], s[1]) + 0.1, s[1]); pl.vy = 0; }
      if (f % 20 === 0) { g.input.down.clear(); const a = acts[(rnd() * acts.length) | 0]; if (['fire', 'ads', 'sprint', 'leanL', 'leanR', 'heal'].includes(a)) g.input.down.add(a); else g.input.pressed.add(a); g.input.down.add(rnd() < 0.5 ? 'fwd' : 'left'); pl.yaw += (rnd() - 0.5) * 2; }
      g.sim(1);
      if (!Number.isFinite(pl.pos.x + pl.pos.y + pl.pos.z + g.camera.position.x)) { nan++; break; }
      for (const s of g.ai.soldiers) if (!Number.isFinite(s.pos.x + s.pos.y + s.pos.z)) { nan++; break; }
    }
    g.input.down.clear();
    return { state: g.state, nan, kills: g.ai.kills, alive: g.ai.aliveEnemies, shots: g.weapons.shots, bullets: g.ballistics.bullets.length };
  });
}
console.log(errs.length ? 'HATALAR:\n' + [...new Set(errs)].slice(0, 20).join('\n') : 'konsol hatası yok');
await browser.close();
