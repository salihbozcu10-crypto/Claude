// Balistik: mermiler gerçek hız ve yer çekimiyle uçar; yüzeye göre delme / sekme; el bombaları
import * as THREE from 'three';
import { SURF, SURF_NAMES, SURF_PEN } from '../gfx/materials.js';
import { rr, distPointSegSq } from '../core/utils.js';

const _ray = new THREE.Ray(), _d = new THREE.Vector3(), _n = new THREE.Vector3(), _p = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _res = { t: 0 };
const UP = new THREE.Vector3(0, 1, 0);

export class Ballistics {
  constructor(game) {
    this.g = game; this.bullets = []; this.grenades = []; this.count = 0;
    const gg = new THREE.SphereGeometry(0.034, 8, 6); this.gMeshes = [];
    for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(gg, game.M.dyn.grenade); m.visible = false; m.castShadow = true; game.scene.add(m); this.gMeshes.push(m); }
  }
  clear() { this.bullets.length = 0; for (const g of this.grenades) g.mesh.visible = false; this.grenades.length = 0; }

  fire({ from, dir, speed, dmg, owner, kind, tracer, shooter }) {
    const b = { p: from.clone(), v: dir.clone().multiplyScalar(speed), dmg, owner, kind, shooter: shooter || null, life: 2.2, pen: 1, whiz: false, tr: null, origin: from.clone() };
    if (tracer) b.tr = this.g.fx.tracer(from, b.v, tracer);
    this.bullets.push(b); return b;
  }

  throwGrenade({ from, vel, kind, owner }) {
    const mesh = this.gMeshes.find((m) => !m.visible); if (!mesh) return;
    mesh.visible = true; mesh.position.copy(from);
    this.grenades.push({ p: from.clone(), v: vel.clone(), kind, owner, fuse: kind === 'frag' ? 3.4 : 1.7, mesh, rest: false });
  }

  raycast(origin, dir, far) { _ray.origin.copy(origin); _ray.direction.copy(dir); return this.g.world.collider.bvh.raycastFirst(_ray, THREE.DoubleSide, 0, far); }

  killTracer(b) { if (b.tr) { b.tr.life = b.tr.age; b.tr = null; } }

  update(dt) {
    const g = this.g, pl = g.player; const B = this.bullets; let w = 0;
    const soldiers = g.ai ? g.ai.soldiers : [];
    for (let i = 0; i < B.length; i++) {
      const b = B[i]; b.life -= dt; if (b.life <= 0) { this.killTracer(b); continue; }
      const sp = b.v.length(); let remain = sp * dt; let alive = true; _d.copy(b.v).multiplyScalar(1 / sp);
      for (let iter = 0; iter < 3 && alive && remain > 1e-4; iter++) {
        const hit = this.raycast(b.p, _d, remain); const wt = hit ? hit.distance : Infinity;
        // --- karakter isabeti
        let best = null, bt = Math.min(wt, remain);
        if (b.owner === 'player') {
          for (const s of soldiers) { if (!s.alive) continue; const r = s.hitTest(b.p, _d, bt); if (r && r.t < bt) { bt = r.t; best = { s, part: r.part }; } }
        } else if (pl.alive) {
          const r = this.hitPlayer(b.p, _d, bt); if (r) { bt = r.t; best = { player: true, part: r.part }; }
          // kıl payı geçen mermi: vınlama + baskı
          if (!best && !b.whiz) { _a.copy(b.p); _b.copy(b.p).addScaledVector(_d, bt); pl.getHeadPos(_p); const dsq = distPointSegSq(_p, _a, _b, _res); if (dsq < 2.2 * 2.2 && _res.t > 0.01 && _res.t < 0.99) { b.whiz = true; const pan = Math.sign(_right(g.camera).dot(_n.copy(_a).lerp(_b, _res.t).sub(_p))) * 0.7; g.audio.play(Math.random() < 0.6 ? 'crack' : 'whiz', { vol: 0.75 * (1 - Math.sqrt(dsq) / 2.6), pan, pitch: rr(0.9, 1.15) }); pl.suppress = Math.min(1, pl.suppress + 0.3); } }
          for (const s of soldiers) { if (!s.alive || s.team !== 'hostage') continue; const r2 = s.hitTest(b.p, _d, bt); if (r2 && r2.t < bt) { bt = r2.t; best = { s, part: r2.part }; } }
        }
        if (best) {
          _p.copy(b.p).addScaledVector(_d, bt);
          if (best.player) { const mult = best.part === 'head' ? 2.4 : best.part === 'legs' ? 0.6 : 1; pl.damage(b.dmg * mult * g.diff.dmg, b.origin); g.fx.impact(SURF.flesh, _p, _n.copy(_d).negate(), 0.6); }
          else {
            const s = best.s; const mult = best.part === 'head' ? 4.2 : best.part === 'legs' ? 0.55 : best.part === 'arms' ? 0.6 : 1;
            g.fx.impact(SURF.flesh, _p, _n.copy(_d).negate(), 0.8); g.audio.playAt('hitFlesh', _p, { vol: 0.9, ref: 5, max: 70 });
            const killed = s.damage(b.dmg * mult * b.pen, _d, best.part, b.owner);
            if (b.owner === 'player' && s.team === 'enemy') { g.weapons.hits++; if (best.part === 'head') g.weapons.headshots++; g.hud?.hitmarker(killed, best.part === 'head'); }
          }
          alive = false; break;
        }
        if (!hit) { b.p.addScaledVector(_d, remain); remain = 0; break; }
        // --- dünya isabeti
        const surf = g.world.collider.surf[hit.face.a] ?? 0; _n.copy(hit.face.normal); if (_n.dot(_d) > 0) _n.negate();
        _p.copy(hit.point);
        g.fx.impact(surf, _p, _n, b.kind === 'mg' ? 1.3 : 1); g.fx.decal(surf, _p, _n); g.audio.impact(SURF_NAMES[surf], _p);
        if (b.owner === 'player') g.ai?.hearNoise(_p, 10, 'impact');
        this.checkBarrels(_p);
        const cosI = -_n.dot(_d);
        // sekme: sert yüzeye çok yatık açıyla
        if ((surf === SURF.concrete || surf === SURF.metal || surf === SURF.rock) && cosI < 0.2 && Math.random() < 0.65) {
          _d.addScaledVector(_n, 2 * cosI).normalize(); _d.x += rr(-0.05, 0.05); _d.y += rr(0, 0.06); _d.normalize();
          b.p.copy(_p).addScaledVector(_n, 0.01); b.v.copy(_d).multiplyScalar(sp * 0.45); b.dmg *= 0.4; remain = (remain - hit.distance) * 0.45; this.killTracer(b); continue;
        }
        // delme: ince ahşap / sac / kumaş
        const maxPen = SURF_PEN[surf] * b.pen * (b.kind === 'pistol' ? 0.5 : 1);
        if (maxPen > 0) {
          _a.copy(_p).addScaledVector(_d, maxPen + 0.03); const back = this.raycast(_a, _b.copy(_d).negate(), maxPen + 0.025);
          if (back) { const thick = maxPen + 0.03 - back.distance; if (thick <= maxPen) {
            b.p.copy(back.point).addScaledVector(_d, 0.012); g.fx.impact(surf, b.p, _d, 0.7); g.fx.decal(surf, back.point, _b.copy(_d));
            b.pen *= 0.6; b.dmg *= 0.7; b.v.multiplyScalar(0.72); remain = Math.max(0, remain - hit.distance - thick) * 0.72; this.killTracer(b); continue; } }
        }
        alive = false;
      }
      if (!alive) { this.killTracer(b); continue; }
      b.v.y -= 9.81 * dt; b.v.multiplyScalar(1 - 0.22 * dt);
      B[w++] = b;
    }
    B.length = w;
    this.updateGrenades(dt);
  }

  hitPlayer(o, d, maxT) {
    const pl = this.g.player; const r = 0.25; const y0 = pl.pos.y + 0.2, y1 = pl.pos.y + pl.height - 0.1;
    // dikey silindire karşı ışın (xz düzleminde daire + yükseklik aralığı)
    const ox = o.x - pl.pos.x, oz = o.z - pl.pos.z; const a = d.x * d.x + d.z * d.z; if (a < 1e-9) return null;
    const bq = ox * d.x + oz * d.z, c = ox * ox + oz * oz - r * r; const disc = bq * bq - a * c; if (disc < 0) return null;
    const t = (-bq - Math.sqrt(disc)) / a; if (t < 0 || t > maxT) return null;
    const y = o.y + d.y * t; if (y < y0 || y > y1 + 0.12) return null;
    const rel = (y - pl.pos.y) / pl.height;
    return { t, part: rel > 0.84 ? 'head' : rel < 0.45 ? 'legs' : 'torso' };
  }

  checkBarrels(p) {
    const list = this.g.world.data.barrels; if (!list) return;
    for (const b of list) { if (b.dead) continue; const dx = p.x - b.x, dy = p.y - b.y, dz = p.z - b.z; if (dx * dx + dy * dy + dz * dz < 0.75 * 0.75) { b.dead = true; this.explode(new THREE.Vector3(b.x, b.y - 0.3, b.z), 1.35, 'player', 11); } }
  }

  // Patlama: hasar (görüş hattına göre), sarsıntı, sağırlık, ses, yanık izi
  explode(pos, scale = 1, owner = 'player', radius = 9) {
    const g = this.g, pl = g.player;
    g.fx.explosion(pos, scale); g.audio.playAt('explosion', pos, { vol: 1.6 * scale, ref: 14, max: 900, reverb: 0.8, prio: 2, absorb: 0.008 });
    const gy = g.world.groundY(pos.x, pos.z); if (Math.abs(gy - pos.y) < 1.2) g.fx.decal(99, _p.set(pos.x, gy, pos.z), UP, rr(3, 4.5) * scale);
    const src = _a.copy(pos); src.y += 0.5;
    const los = (target) => { _d.copy(target).sub(src); const dist = _d.length(); if (dist < 0.4) return true; _d.multiplyScalar(1 / dist); const h = this.raycast(src, _d, dist - 0.25); return !h; };
    for (const s of g.ai ? g.ai.soldiers : []) {
      if (!s.alive) continue; const c = s.getChest(_b); const dist = c.distanceTo(src); if (dist > radius) continue;
      const vis = los(c) ? 1 : 0.2; const dmg = 190 * Math.pow(1 - dist / radius, 1.25) * vis * scale; if (dmg > 3) s.damage(dmg, _n.copy(c).sub(src).normalize(), 'torso', owner, true);
    }
    const pc = pl.getChestPos(_b); const pd = pc.distanceTo(src);
    if (pd < radius * 1.1 && pl.alive) { const vis = los(pc) ? 1 : 0.25; const dmg = 150 * Math.pow(Math.max(0, 1 - pd / (radius * 1.1)), 1.3) * vis * scale; if (dmg > 1) pl.damage(dmg, pos, true); }
    if (pd < 45) { pl.shake(Math.min(2.4, 22 / (pd + 4)) * scale, 0.7); pl.deaf = Math.max(pl.deaf, Math.min(1, 9 / (pd + 2))); }
    g.ai?.hearNoise(pos, 160, 'explosion');
    this.checkBarrels(pos);
    for (const b of g.world.data.barrels || []) { if (!b.dead && Math.hypot(b.x - pos.x, b.z - pos.z) < radius * 0.6) { b.dead = true; setTimeout(() => this.explode(new THREE.Vector3(b.x, b.y - 0.3, b.z), 1.35, owner, 11), 180 + Math.random() * 250); } }
  }

  flashbang(pos) {
    const g = this.g, pl = g.player;
    g.fx.flashbang(pos); g.audio.playAt('flashbang', pos, { vol: 1.5, ref: 12, max: 500, reverb: 0.7, prio: 2 });
    const src = _a.copy(pos); src.y += 0.3;
    for (const s of g.ai ? g.ai.soldiers : []) { if (!s.alive) continue; const c = s.getHead(_b); const dist = c.distanceTo(src); if (dist > 13) continue; _d.copy(c).sub(src).normalize(); if (!this.raycast(src, _d, dist - 0.3)) s.stun(3.5 + (1 - dist / 13) * 3.5); }
    const hp = pl.getHeadPos(_b); const pd = hp.distanceTo(src);
    if (pd < 22) { _d.copy(hp).sub(src).normalize(); if (!this.raycast(src, _d, pd - 0.3)) { _n.set(0, 0, -1).applyQuaternion(g.camera.quaternion); const facing = Math.max(0, -_n.dot(_d)); const k = (1 - pd / 22) * (0.3 + 0.9 * facing); pl.flash = Math.max(pl.flash, k * 2.2); pl.deaf = Math.max(pl.deaf, k); } }
    g.ai?.hearNoise(pos, 90, 'explosion');
  }

  updateGrenades(dt) {
    const g = this.g; const G = this.grenades; let w = 0;
    for (let i = 0; i < G.length; i++) {
      const gr = G[i]; gr.fuse -= dt;
      if (gr.fuse <= 0) { gr.mesh.visible = false; if (gr.kind === 'frag') this.explode(gr.p, 1, gr.owner, 9.5); else this.flashbang(gr.p); continue; }
      if (!gr.rest) {
        gr.v.y -= 9.81 * dt; let remain = gr.v.length() * dt; let it = 0;
        while (remain > 1e-4 && it++ < 3) {
          const sp = gr.v.length(); if (sp < 1e-3) break; _d.copy(gr.v).multiplyScalar(1 / sp);
          const hit = this.raycast(gr.p, _d, remain + 0.05);
          if (!hit) { gr.p.addScaledVector(_d, remain); break; }
          _n.copy(hit.face.normal); if (_n.dot(_d) > 0) _n.negate();
          gr.p.copy(hit.point).addScaledVector(_n, 0.045); remain -= hit.distance;
          const vn = gr.v.dot(_n); gr.v.addScaledVector(_n, -vn); gr.v.multiplyScalar(0.7); gr.v.addScaledVector(_n, -vn * 0.36);
          if (Math.abs(vn) > 1.2) g.audio.playAt('bounce', gr.p, { vol: Math.min(1, Math.abs(vn) / 6), ref: 3, max: 40 });
          if (_n.y > 0.7 && gr.v.length() < 0.7) { gr.rest = true; gr.v.set(0, 0, 0); break; }
          remain *= 0.6;
        }
        gr.mesh.position.copy(gr.p); gr.mesh.rotation.x += dt * 9; gr.mesh.rotation.z += dt * 6;
      }
      G[w++] = gr;
    }
    G.length = w;
  }
}
const _rv = new THREE.Vector3();
function _right(cam) { return _rv.set(1, 0, 0).applyQuaternion(cam.quaternion); }
