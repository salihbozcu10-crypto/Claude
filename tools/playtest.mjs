// Otomatik oynanış testi: görev akışını çizim yapmadan benzetir (geliştirme aracı).
import { createRequire } from 'module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--disable-gpu-watchdog', '--disable-hang-monitor'] });
const page = await (await browser.newContext({ viewport: { width: 640, height: 360 } })).newPage();
const errs = [];
page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' || /warn/i.test(m.type())) { if (!/GPU stall|GL Driver|fonts.g|ERR_|Failed to load resource/.test(t)) errs.push(`[${m.type()}] ${t.slice(0, 400)}`); } });
page.on('pageerror', (e) => errs.push('[pageerror] ' + (e.stack || e.message).slice(0, 700)));
await page.goto('file://' + resolve(root, 'index.html') + '#q-low-test');
await page.waitForFunction(() => window.__ready, null, { timeout: 240000 });
const step = async (label, fn, arg) => { const t0 = Date.now(); try { const r = await page.evaluate(fn, arg); console.log(`${label}: ${typeof r === 'string' ? r : JSON.stringify(r)}  (${Date.now() - t0} ms)`); return r; } catch (e) { console.log(`${label}: HATA ${e.message.split('\n').slice(0, 3).join(' | ')}`); return null; } };
await step('init', () => ({ state: __sv.state, q: __sv.qualityName, tris: __sv.world.collider.geometry.attributes.position.count / 3 | 0, lights: __sv.world.lights.length }));
await step('start', () => { __sv.startMission(); __sv.testPause(true); __sv.sim(280, 16.7); return { state: __sv.state, enemies: __sv.ai.aliveEnemies, y: +__sv.player.pos.y.toFixed(2) }; });
await step('move', () => { const p0 = __sv.player.pos.clone(); __sv.input.down.add('fwd'); __sv.sim(120); __sv.input.down.delete('fwd'); __sv.sim(20); return { moved: +p0.distanceTo(__sv.player.pos).toFixed(2), dz: +(__sv.player.pos.z - p0.z).toFixed(2), ground: __sv.player.onGround }; });
await step('sprint+jump', () => { const p0 = __sv.player.pos.clone(); __sv.input.down.add('fwd'); __sv.input.down.add('sprint'); __sv.sim(90); __sv.input.pressed.add('jump'); __sv.sim(30); __sv.input.down.delete('fwd'); __sv.input.down.delete('sprint'); __sv.sim(30); return { moved: +p0.distanceTo(__sv.player.pos).toFixed(2), stamina: +__sv.player.stamina.toFixed(2) }; });
await step('shoot', () => {
  const g = __sv, pl = g.player; const THREE_V = pl.pos.constructor; let e = null, spot = null; const eye = new THREE_V(), chest = new THREE_V();
  for (const s of g.ai.soldiers) { if (s.team !== 'enemy' || s.fixedY || s.ai.elevated) continue; for (let k = 0; k < 16 && !spot; k++) { const a = s.yaw + Math.PI + (k - 8) * 0.12; const x = s.pos.x + Math.sin(a) * 13, z = s.pos.z + Math.cos(a) * 13; if (!g.world.nav.walkable(x, z)) continue; const y = g.world.groundY(x, z); eye.set(x, y + 1.6, z); chest.copy(s.wp.chest); if (!g.lineBlocked(eye, chest)) { spot = [x, y, z]; e = s; } } if (spot) break; }
  if (!spot) return 'uygun hedef yok';
  pl.pos.set(spot[0], spot[1] + 0.05, spot[2]); pl.vy = 0; pl.hv.set(0, 0, 0);
  const aim = () => { const t = e.wp.chest; const dx = t.x - pl.eye.x, dy = t.y - pl.eye.y, dz = t.z - pl.eye.z; pl.yaw = Math.atan2(-dx, -dz); pl.pitch = Math.atan2(dy, Math.hypot(dx, dz)) - pl.kickPitch; };
  g.sim(2); aim(); g.input.down.add('ads'); for (let i = 0; i < 30; i++) { aim(); g.sim(1); }
  const h0 = e.health; g.input.down.add('fire'); let n = 0; for (; n < 60 && e.alive; n++) { aim(); g.sim(1); } g.input.down.delete('fire'); g.input.down.delete('ads'); g.sim(90);
  return { role: e.ai.role, h0, health: Math.round(e.health), alive: e.alive, frames: n, shots: g.weapons.shots, hits: g.weapons.hits, head: g.weapons.headshots, kills: g.ai.kills, deathT: +e.deathT.toFixed(2), pelvisY: +(e.wp.pelvis.y - e.pos.y).toFixed(2) };
});
await step('reload', () => { __sv.input.pressed.add('reload'); __sv.sim(200); return { mag: __sv.weapons.cur.mag, res: __sv.weapons.totalReserve(), reloading: __sv.weapons.reloading }; });
await step('enemy fire', () => {
  const g = __sv, pl = g.player; pl.pos.set(0, 0.1, 20); pl.health = 100; const h0 = pl.health; let t = 0; while (pl.alive && t < 900 && pl.health > 40) { g.sim(1); t++; }
  const st = {}; for (const b of g.ai.brains) st[b.state] = (st[b.state] || 0) + 1;
  return { health: Math.round(pl.health), frames: t, combat: g.ai.combat, states: st, bullets: g.ballistics.bullets.length };
});
await step('god + objectives', () => {
  const g = __sv, pl = g.player; pl.godMode = true; pl.health = 100; const out = {};
  const face = (o) => { const dx = o.pos.x - pl.eye.x, dy = o.pos.y - pl.eye.y, dz = o.pos.z - pl.eye.z; pl.yaw = Math.atan2(-dx, -dz); pl.pitch = Math.atan2(dy, Math.hypot(dx, dz)); };
  const spots = { comms: [-22.2, 0.2, -39.2], intel: [-7.2, 3.5, -37.9], hostage: [46.6, 0.2, 24.2], cache: [45.2, 0.15, -32.9] };
  for (const id of ['comms', 'intel', 'hostage', 'cache']) {
    const o = g.mission.obj(id); const s = spots[id]; pl.pos.set(s[0], s[1], s[2]); pl.vy = 0; pl.hv.set(0, 0, 0); g.sim(3); face(o); g.sim(2);
    g.input.down.add('interact'); let n = 0; while (!o.done && n < 320) { face(o); g.sim(1); n++; } g.input.down.delete('interact'); g.sim(5);
    out[id] = o.done ? n : 'FAIL d=' + Math.hypot(o.pos.x - g.camera.position.x, o.pos.y - g.camera.position.y, o.pos.z - g.camera.position.z).toFixed(2) + ' y=' + pl.pos.y.toFixed(2) + ' prompt=' + JSON.stringify(g.mission.prompt);
  }
  out.exfil = g.mission.exfil; out.hostageState = g.ai.brains.find((b) => b.s === g.ai.hostage).state;
  return out;
});
await step('heli', () => {
  const g = __sv; let n = 0; while (!g.heli.landed && n < 6000) { g.sim(1, 33); n++; }
  return { landed: g.heli.landed, frames: n, heli: g.heli.pos.toArray().map((v) => +v.toFixed(1)), lz: [g.world.data.lz.x, +g.world.data.lz.y.toFixed(1), g.world.data.lz.z], hostage: g.ai.hostage.pos.toArray().map((v) => +v.toFixed(1)), hostageAlive: g.ai.hostage.alive };
});
await step('board', () => {
  const g = __sv, pl = g.player, h = g.heli.pos; pl.pos.set(h.x + 3.5, g.world.groundY(h.x + 3.5, h.z + 1) + 0.1, h.z + 1); pl.vy = 0; g.ai.hostage.pos.set(h.x + 5, pl.pos.y, h.z + 3); g.sim(5);
  g.input.down.add('interact'); let n = 0; while (g.state === 'play' && n < 200) { g.sim(1); n++; } g.input.down.delete('interact');
  const s1 = g.state; let m = 0; while (g.state === 'outro' && m < 1200) { g.sim(1); m++; }
  return { afterBoard: s1, frames: n, outroFrames: m, final: g.state, menu: g.menu.current, debrief: g.debrief, prompt: g.mission.prompt };
});
await step('death', () => {
  const g = __sv; g.startMission(); g.testPause(true); g.sim(280); g.player.godMode = false; g.player.damage(500, null); g.sim(200);
  return { state: g.state, menu: g.menu.current };
});
await step('night', () => { const g = __sv; g.settings.time = 'night'; g.startMission(); g.testPause(true); g.sim(280); g.input.pressed.add('nvg'); g.sim(5); const r = { state: g.state, time: g.timeName, nvg: g.nvg, lamps: g.ai.lamps.length }; g.settings.time = 'dawn'; return r; });
await step('pause', () => { const g = __sv; g.pause(); const a = g.state; g.resume(); return { paused: a, resumed: g.state }; });
console.log(errs.length ? 'HATALAR:\n' + errs.slice(0, 25).join('\n') : 'konsol hatası yok');
await browser.close();
