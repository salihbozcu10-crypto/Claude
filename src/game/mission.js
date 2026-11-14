// Görev akışı: hedefler, etkileşimler (C4, istihbarat, rehine), tahliye
import * as THREE from 'three';
import { rr } from '../core/utils.js';

const _v = new THREE.Vector3(), _f = new THREE.Vector3();

export class Mission {
  constructor(game) {
    this.g = game; this.objs = []; this.interacting = false; this.prompt = null; this.hold = 0; this.holdObj = null; this.charges = []; this.msgQ = []; this.t = 0; this.exfil = false; this.failed = false; this.done = false;
    this.signal = null; this.alarmSaid = false; this.c4Geo = new THREE.BoxGeometry(0.22, 0.07, 0.14); this.lightGeo = new THREE.SphereGeometry(0.014, 6, 4); this.lightMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 0.4, 0.2) });
    this.reinforced = false; this.combatClock = 0;
  }

  start() {
    const g = this.g, d = g.world.data.objectives;
    for (const c of this.charges) g.scene.remove(c.mesh); this.charges = [];
    this.objs = [
      { id: 'comms', title: 'Telsiz direğini sabote et', verb: 'C4 yerleştir', pos: d.comms, hold: 2.6, kind: 'c4', letter: 'A', done: false },
      { id: 'intel', title: 'Karargâhın üst katındaki istihbaratı al', verb: 'Verileri kopyala', pos: d.intel, hold: 2.2, kind: 'take', letter: 'B', done: false },
      { id: 'hostage', title: 'Hücre bloğundaki rehineyi kurtar', verb: 'Rehineyi çöz', pos: { x: d.hostage.x, y: d.hostage.y + 0.8, z: d.hostage.z }, hold: 2.4, kind: 'free', letter: 'C', done: false },
      { id: 'cache', title: 'Depodaki cephaneliği imha et (ikincil)', verb: 'C4 yerleştir', pos: d.cache, hold: 2.6, kind: 'c4', letter: 'D', done: false, optional: true },
      { id: 'exfil', title: 'Tahliye noktasına ulaş', verb: 'Helikoptere bin', pos: { x: g.world.data.lz.x, y: g.world.data.lz.y + 1, z: g.world.data.lz.z }, hold: 1.0, kind: 'exfil', letter: 'LZ', done: false, locked: true },
    ];
    this.t = 0; this.exfil = false; this.failed = false; this.done = false; this.interacting = false; this.hold = 0; this.msgQ = []; this.alarmSaid = false; this.reinforced = false; this.combatClock = 0;
    if (this.signal) this.signal.enabled = false;
    g.heli.reset();
    this.radio(4.5, 'YUVA', 'Kartal-1, hedef tesis görüş alanında. Üç ana hedef: telsiz direği, istihbarat ve rehine.');
    this.radio(11, 'YUVA', 'Sessiz ilerle. Susturucun devriyeleri uyandırmaz; ama bir ceset görürlerse alarm verirler.');
    this.radio(18, 'KARTAL-1', 'Anlaşıldı Yuva. Harekete geçiyorum.');
  }

  radio(delay, who, text) { this.msgQ.push({ at: this.t + delay, who, text }); }
  get primaryDone() { return this.objs.every((o) => o.optional || o.kind === 'exfil' || o.done); }
  obj(id) { return this.objs.find((o) => o.id === id); }

  complete(o) {
    const g = this.g; o.done = true; g.audio.play('objective', { vol: 0.8, ui: true }); g.hud.objectiveDone(o);
    if (o.kind === 'c4') {
      const m = new THREE.Mesh(this.c4Geo, g.M.dyn.olive); m.position.set(o.pos.x, o.pos.y - 0.25, o.pos.z); m.rotation.y = rr(0, 3); m.castShadow = true;
      const l = new THREE.Mesh(this.lightGeo, this.lightMat); l.position.set(0.07, 0.045, 0); m.add(l); g.scene.add(m); this.charges.push({ mesh: m, light: l, pos: new THREE.Vector3(o.pos.x, o.pos.y - 0.2, o.pos.z), id: o.id });
      g.audio.play('c4', { vol: 0.8 });
      this.radio(0.8, 'KARTAL-1', o.id === 'comms' ? 'Telsiz direğine patlayıcı yerleştirildi.' : 'Cephaneliğe patlayıcı yerleştirildi.');
    } else if (o.kind === 'take') { this.radio(0.6, 'KARTAL-1', 'İstihbarat elimde.'); this.radio(4, 'YUVA', 'Harika iş Kartal-1. Veriler bize ulaştı.'); }
    else if (o.kind === 'free') { g.ai.freeHostage(); g.audio.play('rope', { vol: 0.8 }); this.radio(0.6, 'KARTAL-1', 'Rehine güvende, benimle geliyor.'); }
    if (this.primaryDone && !this.exfil) this.beginExfil();
  }

  beginExfil() {
    const g = this.g, lz = g.world.data.lz; this.exfil = true; this.obj('exfil').locked = false;
    this.radio(5, 'YUVA', 'Ana hedefler tamam. Tahliye helikopteri yolda — batıdaki iniş bölgesine ilerle. Yeşil dumanı izle.');
    if (!this.signal) this.signal = g.fx.addEmitter({ type: 'signal', x: lz.x + 9, y: lz.y + 0.1, z: lz.z - 6, rate: 7, c: [0.16, 0.62, 0.22], range: 500 });
    this.signal.enabled = true;
    this.heliAt = this.t + 22;
  }

  fail(reason) { if (this.failed || this.done) return; this.failed = true; this.g.onMissionFailed(reason); }

  update(dt) {
    const g = this.g, pl = g.player, inp = g.input; this.t += dt;
    // telsiz kuyruğu
    while (this.msgQ.length && this.msgQ[0].at <= this.t) { const m = this.msgQ.shift(); g.hud.radio(m.who, m.text); g.audio.play('beep', { vol: 0.6, ui: true }); }
    this.msgQ.sort((a, b) => a.at - b.at);
    // C4 ışıkları
    for (const c of this.charges) c.light.visible = (g.time % 1.2) < 0.15;
    if (g.ai.hostage && !g.ai.hostage.alive) this.fail('Rehine hayatını kaybetti');
    // alarm
    if (g.ai.combat) this.combatClock += dt;
    if (g.ai.alarm && !this.alarmSaid && this.combatClock > 1.5) { this.alarmSaid = true; this.radio(0.2, 'YUVA', 'Tespit edildin Kartal-1! Tesis alarmda — dikkatli ol.'); }
    if (this.alarmSaid && !this.reinforced && this.combatClock > 45 && g.ai.aliveEnemies > 0) { this.reinforced = true; g.spawnReinforcements(); this.radio(0.5, 'YUVA', 'Güneyden takviye geliyor, ana kapıya dikkat!'); }
    if (this.exfil && this.heliAt && this.t >= this.heliAt) { this.heliAt = 0; g.heli.start(g.world.data.lz); this.radio(1, 'ŞAHİN-2', 'Şahin-2 vadiye giriyor, iki dakikaya iniş bölgesindeyim.'); }

    // --- etkileşim
    this.prompt = null; let near = null, nd = 1e9;
    g.camera.getWorldDirection(_f);
    for (const o of this.objs) {
      if (o.done || o.locked) continue;
      if (o.kind === 'exfil') { if (!g.heli.landed) continue; _v.copy(g.heli.pos).setY(g.heli.pos.y + 1.2); const d = _v.distanceTo(pl.pos); if (d < 6.5 && d < nd) { nd = d; near = o; } continue; }
      _v.set(o.pos.x, o.pos.y, o.pos.z); const d = _v.distanceTo(g.camera.position);
      if (d < 2.3) { _v.sub(g.camera.position).normalize(); if (_v.dot(_f) > 0.35 && d < nd) { nd = d; near = o; } }
    }
    let blocked = null;
    if (near && near.kind === 'exfil' && g.ai.hostage && g.ai.hostage.alive && this.obj('hostage').done && g.ai.hostage.pos.distanceTo(pl.pos) > 16) blocked = 'Rehineyi bekle';
    if (near && pl.alive) {
      const want = inp.is('interact') && !blocked;
      if (want) { if (this.holdObj !== near) { this.hold = 0; this.holdObj = near; g.audio.play('cloth', { vol: 0.5 }); } this.hold += dt; this.interacting = true; if (this.hold >= near.hold) { this.hold = 0; this.holdObj = null; this.interacting = false; inp.clearToggle('interact', g.touchRoot); if (near.kind === 'exfil') { near.done = true; this.done = true; g.startOutro(); } else this.complete(near); } }
      else { this.hold = Math.max(0, this.hold - dt * 2); this.interacting = false; if (this.hold === 0) this.holdObj = null; }
      this.prompt = { text: blocked || near.verb, key: !blocked, progress: this.holdObj === near ? this.hold / near.hold : 0 };
    } else { this.hold = 0; this.holdObj = null; this.interacting = false; }
  }

  // Final: yerleştirilen patlayıcıları sırayla patlat
  detonate() {
    const g = this.g; let delay = 0;
    for (const c of this.charges) {
      setTimeout(() => { if (g.state !== 'outro') return; g.scene.remove(c.mesh); g.ballistics.explode(c.pos, 2.6, 'player', 16); for (let i = 0; i < 3; i++) setTimeout(() => { if (g.state === 'outro') g.ballistics.explode(new THREE.Vector3(c.pos.x + rr(-6, 6), c.pos.y + rr(0, 3), c.pos.z + rr(-6, 6)), rr(1.2, 2), 'player', 10); }, 350 + i * 420 + Math.random() * 200); if (c.id === 'cache') g.fx.addEmitter({ type: 'smoke', x: c.pos.x, y: c.pos.y + 3, z: c.pos.z, rate: 5, range: 900, a: 0.7 }); else g.fx.addEmitter({ type: 'smoke', x: c.pos.x, y: c.pos.y + 1, z: c.pos.z, rate: 3, range: 900 }); }, delay);
      delay += 900;
    }
  }
}
