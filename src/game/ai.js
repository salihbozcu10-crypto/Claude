// Yapay zekâ: algı (görüş konisi, işitme), durumlar (devriye, şüphe, çatışma, arama), siper ve ateş
import * as THREE from 'three';
import { Soldier } from './soldier.js';
import { clamp, damp, lerp, rr, pick, wrapAngle, angleDelta, gauss } from '../core/utils.js';

const ST = { IDLE: 0, PATROL: 1, SUSPECT: 2, INVESTIGATE: 3, COMBAT: 4, SEARCH: 5, STUN: 6, DEAD: 7, HOSTAGE: 8, FOLLOW: 9 };
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();

class Brain {
  constructor(sys, s, o) {
    this.sys = sys; this.g = sys.g; this.s = s; s.ai = this; this.role = o.role || 'idle'; this.canMove = this.role !== 'static' && !o.elevated;
    this.home = { x: s.pos.x, z: s.pos.z, yaw: s.yaw }; this.route = o.route || null; this.routeIdx = 0; this.wait = rr(0, 3);
    this.state = this.role === 'patrol' ? ST.PATROL : ST.IDLE; this.det = 0; this.lastKnown = new THREE.Vector3(); this.hasKnown = false; this.lastSeenT = -99; this.seeing = false;
    this.visT = Math.random() * 0.2; this.react = 0; this.burst = 0; this.burstCool = rr(0.3, 1); this.shotCool = 0; this.firstBurst = true; this.shotCount = 0;
    this.path = null; this.pathIdx = 0; this.repathT = 0; this.cover = null; this.coverT = 0; this.peek = false; this.peekT = 0; this.stateT = 0; this.lookT = 0; this.lookTarget = 0;
    this.suppress = 0; this.alerted = false; this.targetYaw = s.yaw; this.stuckT = 0; this.lastPos = s.pos.clone(); this.elevated = !!o.elevated; this.investT = 0; this.strafeDir = 1; this.strafeT = 0;
    this.grenadeT = rr(8, 20);
  }

  set(state) { if (this.state === state) return; this.state = state; this.stateT = 0; if (state === ST.COMBAT || state === ST.SEARCH || state === ST.INVESTIGATE) this.alerted = true; if (state !== ST.COMBAT) { this.cover = null; this.peek = false; } }

  // --- algı
  perceive(dt) {
    const g = this.g, pl = g.player, s = this.s; this.visT -= dt; if (this.visT > 0) return; const step = 0.14; this.visT = step + Math.random() * 0.04;
    this.seeing = false; if (!pl.alive || s.stunT > 0) return;
    const head = s.wp.head; pl.getChestPos(_a); const dx = _a.x - head.x, dy = _a.y - head.y, dz = _a.z - head.z; const dist = Math.hypot(dx, dy, dz);
    const night = g.preset.nightFactor || 0; let range = 95 * g.diff.sight * (1 - 0.66 * night);
    if (night > 0.5 && this.sys.litAt(pl.pos)) range *= 2.2;
    const still = pl.speed < 0.5; const crouched = pl.crouching;
    range *= crouched ? (still ? 0.55 : 0.75) : 1; if (pl.sprinting) range *= 1.2;
    if (this.state === ST.COMBAT || this.state === ST.SEARCH) range *= 1.35;
    if (dist > range) return;
    const ang = Math.abs(angleDelta(s.yaw + s.look + s.aimYaw * s.aim, Math.atan2(dx, dz)));
    const fov = (this.state >= ST.SUSPECT && this.state <= ST.SEARCH ? 1.45 : 1.02);
    if (ang > fov && dist > 2.2) return;
    // görüş hattı: göğüs ya da baş
    let vis = !g.lineBlocked(head, _a); if (!vis) { pl.getHeadPos(_b); vis = !g.lineBlocked(head, _b); if (vis) _a.copy(_b); }
    if (!vis) return;
    this.seeing = true; this.lastKnown.copy(pl.pos); this.hasKnown = true; this.lastSeenT = g.time;
    const k = 1 - dist / range; let rate = (0.5 + 5.5 * k * k) * (crouched ? 0.6 : 1) * (pl.sprinting ? 1.6 : 1) * (this.alerted ? 2.2 : 1) * (ang > 0.7 ? 0.55 : 1) / g.diff.react;
    if (dist < 7) rate = 14;
    this.det = Math.min(1, this.det + rate * step);
  }

  onDamage(owner, dir) {
    if (!this.s.alive) return; this.suppress = Math.min(1, this.suppress + 0.6);
    if (owner === 'player') { const pl = this.g.player; this.lastKnown.copy(pl.pos); this.hasKnown = true; this.det = 1; if (this.state !== ST.COMBAT) { this.set(ST.COMBAT); this.react = 0.25; this.sys.shout(this, 30); } }
  }
  onDeath() { this.state = ST.DEAD; this.sys.onDeath(this); }
  onStun(sec) { if (this.state !== ST.DEAD && this.state !== ST.HOSTAGE && this.state !== ST.FOLLOW) { this.prevState = ST.SEARCH; this.set(ST.STUN); } }

  hear(pos, type, dist) {
    if (!this.s.alive || this.state === ST.HOSTAGE || this.state === ST.FOLLOW || this.state === ST.STUN) return;
    if (this.state === ST.COMBAT) { if (!this.seeing && type !== 'impact') { this.lastKnown.copy(pos); } return; }
    this.lastKnown.copy(pos); this.hasKnown = true;
    if (type === 'explosion' || type === 'gunfire') { this.set(ST.SEARCH); this.path = null; }
    else if (type === 'shot' || type === 'impact') { if (this.state !== ST.SEARCH) { this.set(ST.SUSPECT); this.wait = rr(0.5, 1.2); } }
    else if (type === 'step') { if (this.state === ST.IDLE || this.state === ST.PATROL) { this.set(ST.SUSPECT); this.wait = rr(0.9, 1.8); } }
    else if (type === 'shout') { this.set(ST.SEARCH); this.path = null; this.wait = rr(0.3, 1.0); }
  }

  // --- hareket
  goTo(x, z, force) {
    if (!this.canMove) return false;
    if (!force && this.path && this.goal && Math.hypot(this.goal.x - x, this.goal.z - z) < 1.2) return true;
    if (this.sys.pathBudget <= 0) return !!this.path; this.sys.pathBudget--;
    const p = this.g.world.nav.findPath(this.s.pos.x, this.s.pos.z, x, z, 7000);
    if (!p) { this.path = null; return false; }
    this.path = p; this.pathIdx = 0; this.goal = { x, z }; return true;
  }
  follow(dt, speed, faceMove = true) {
    const s = this.s; if (!this.path || this.pathIdx >= this.path.length) { s.speed = damp(s.speed, 0, 10, dt); return true; }
    const t = this.path[this.pathIdx]; const dx = t.x - s.pos.x, dz = t.z - s.pos.z; const d = Math.hypot(dx, dz);
    if (d < 0.35) { this.pathIdx++; if (this.pathIdx >= this.path.length) { this.path = null; s.speed = damp(s.speed, 0, 10, dt); return true; } return false; }
    const nx = dx / d, nz = dz / d; s.speed = damp(s.speed, speed, 6, dt);
    let mx = nx * s.speed * dt, mz = nz * s.speed * dt;
    // diğerlerinden uzak dur
    for (const o of this.sys.soldiers) { if (o === s || !o.alive) continue; const ox = s.pos.x - o.pos.x, oz = s.pos.z - o.pos.z; const od = ox * ox + oz * oz; if (od < 0.64 && od > 1e-4) { const k = (0.8 - Math.sqrt(od)) * 1.5 * dt / Math.sqrt(od); mx += ox * k; mz += oz * k; } }
    const nav = this.g.world.nav;
    if (nav.walkable(s.pos.x + mx, s.pos.z + mz)) { s.pos.x += mx; s.pos.z += mz; } else if (nav.walkable(s.pos.x + mx, s.pos.z)) s.pos.x += mx; else if (nav.walkable(s.pos.x, s.pos.z + mz)) s.pos.z += mz;
    if (!s.fixedY) s.pos.y = damp(s.pos.y, this.g.world.groundY(s.pos.x, s.pos.z), 14, dt);
    const moveYaw = Math.atan2(nx, nz);
    if (faceMove) { this.targetYaw = moveYaw; s.moveLocal.set(0, 1); } else { const rel = moveYaw - s.yaw; s.moveLocal.set(Math.sin(rel), Math.cos(rel)); }
    // takılma denetimi
    this.stuckT += dt; if (this.stuckT > 1.2) { if (this.lastPos.distanceToSquared(s.pos) < 0.09) { this.path = null; } this.lastPos.copy(s.pos); this.stuckT = 0; }
    return false;
  }
  turn(dt, rate = 4.2) { const s = this.s; const d = angleDelta(s.yaw, this.targetYaw); s.yaw += clamp(d, -rate * dt, rate * dt); }

  // --- siper seçimi
  findCover() {
    const g = this.g, s = this.s, nav = g.world.nav, pl = g.player; const eye = pl.getHeadPos(_c); let best = null, bs = -1e9;
    const threat = this.lastKnown;
    for (let i = 0; i < 12; i++) {
      const c = i === 0 ? { x: s.pos.x, z: s.pos.z } : nav.randomNear(s.pos.x, s.pos.z, 1.5, 13); if (!c) continue;
      const gy = g.world.groundY(c.x, c.z); const dT = Math.hypot(c.x - threat.x, c.z - threat.z); if (dT < 6) continue;
      _a.set(c.x, gy + 0.95, c.z); const hidden = g.lineBlocked(eye, _a); if (!hidden) continue;
      _b.set(c.x, gy + 1.62, c.z); const pop = !g.lineBlocked(eye, _b);
      let peek = null;
      if (!pop) { // köşe siperi: görüş hattı olan komşu hücre
        const px = -(threat.z - c.z) / (dT || 1), pz = (threat.x - c.x) / (dT || 1);
        for (const sgn of [1, -1]) { const qx = c.x + px * 1.1 * sgn, qz = c.z + pz * 1.1 * sgn; if (!nav.walkable(qx, qz)) continue; _b.set(qx, g.world.groundY(qx, qz) + 1.55, qz); if (!g.lineBlocked(eye, _b)) { peek = { x: qx, z: qz }; break; } }
      }
      const dS = Math.hypot(c.x - s.pos.x, c.z - s.pos.z);
      const score = (pop ? 3 : peek ? 2.4 : 0.6) - dS * 0.16 - Math.abs(dT - 28) * 0.03 + Math.random() * 0.5;
      if (score > bs) { bs = score; best = { x: c.x, z: c.z, pop, peek }; }
    }
    this.cover = best; this.coverT = rr(7, 14); this.peek = false; this.peekT = rr(0.3, 1.2);
    return best;
  }

  // --- ateş
  shootAt(dt) {
    const g = this.g, s = this.s, pl = g.player; this.shotCool -= dt;
    if (this.burst <= 0) { this.burstCool -= dt; if (this.burstCool <= 0) { if (this.sys.shooters >= (g.diff.shooters || 3)) { this.burstCool = rr(0.15, 0.5); return; } this.sys.shooters++; this.burst = (2 + Math.random() * 4) | 0; this.shotCool = 0; } return; }
    if (this.shotCool > 0) return;
    this.shotCool = 0.1; this.burst--; if (this.burst <= 0) { this.burstCool = rr(0.45, 1.5) * g.diff.react; this.firstBurst = false; }
    const target = pl.getChestPos(_a); const from = _b.copy(s.muzzle);
    const dist = from.distanceTo(target);
    target.x += pl.hv.x * dist / 715; target.z += pl.hv.z * dist / 715;
    const dir = _c.copy(target).sub(from).normalize();
    // nişan hatası: mesafe, hedef hızı, ilk salvo, baskı altında olma
    let sigma = 0.0115 * g.diff.aim * (1 + dist / 70) * (1 + pl.speed * 0.2) * (this.firstBurst ? 2.6 : 1) * (1 + this.suppress * 1.4) * (pl.crouching ? 1.12 : 1) * (s.speed > 0.5 ? 1.6 : 1);
    if (this.elevated) sigma *= 1.15;
    dir.x += gauss() * sigma; dir.y += gauss() * sigma * 0.8; dir.z += gauss() * sigma; dir.normalize();
    this.shotCount++;
    g.ballistics.fire({ from, dir, speed: 715, dmg: 30, owner: 'enemy', kind: 'ak', tracer: this.shotCount % 3 === 0 ? [7, 3.2, 1.0] : null, shooter: s });
    g.fx.muzzle(from, dir, false, 1); s.kick = 1;
    g.audio.playAt('rifleAK', from, { vol: 1.5, ref: 12, max: 700, reverb: 0.55, prio: 1, absorb: 0.012, pitch: rr(0.94, 1.06) });
    this.sys.gunfire(s);
  }

  aimAt(dt, target) {
    const s = this.s; const from = s.wp.chest; const dx = target.x - from.x, dy = target.y - (from.y + 0.15), dz = target.z - from.z; const dh = Math.hypot(dx, dz);
    this.targetYaw = Math.atan2(dx, dz); const rel = angleDelta(s.yaw, this.targetYaw);
    s.aimYaw = damp(s.aimYaw, clamp(rel, -0.8, 0.8), 10, dt); s.aimPitch = damp(s.aimPitch, clamp(Math.atan2(dy, dh), -0.9, 0.9), 10, dt);
    return Math.abs(rel) < 0.45;
  }

  update(dt) {
    const g = this.g, s = this.s, pl = g.player; if (!s.alive) return;
    this.stateT += dt; this.suppress = Math.max(0, this.suppress - dt * 0.35);
    if (this.state === ST.HOSTAGE) { s.kneel = 1; s.speed = 0; return; }
    if (this.state === ST.FOLLOW) { this.updateFollow(dt); return; }
    this.perceive(dt);
    if (!this.seeing) this.det = Math.max(0, this.det - dt * (this.alerted ? 0.08 : 0.22));
    if (this.state === ST.STUN) { s.aim = 0; s.speed = damp(s.speed, 0, 8, dt); s.crouch = 0.4; if (s.stunT <= 0) { this.set(ST.SEARCH); this.lastKnown.copy(pl.pos); } this.turn(dt, 0.5); return; }
    // tespit eşiği
    if (this.det >= 1 && this.state !== ST.COMBAT) { this.set(ST.COMBAT); this.react = rr(0.55, 1.1) * g.diff.react; this.firstBurst = true; this.sys.shout(this, 32); }
    else if (this.det > 0.4 && (this.state === ST.IDLE || this.state === ST.PATROL)) { this.set(ST.SUSPECT); this.wait = rr(1.0, 2.0); }
    // adım sesleri
    if (pl.noise > 0 && (this.state === ST.IDLE || this.state === ST.PATROL)) { const d = s.pos.distanceTo(pl.pos); if (d < pl.noise * (g.preset.nightFactor ? 1.15 : 1) && Math.abs(s.pos.y - pl.pos.y) < 3) this.hear(pl.pos, 'step', d); }

    switch (this.state) {
      case ST.IDLE: {
        s.aim = 0; s.crouch = 0; s.speed = damp(s.speed, 0, 8, dt);
        this.lookT -= dt; if (this.lookT <= 0) { this.lookT = rr(2, 6); this.lookTarget = rr(-0.9, 0.9); if (this.role === 'guard' && Math.random() < 0.3) this.targetYaw = this.home.yaw + rr(-0.8, 0.8); }
        s.look = damp(s.look, this.lookTarget, 1.5, dt); this.turn(dt, 1.2);
        if (this.canMove && Math.hypot(s.pos.x - this.home.x, s.pos.z - this.home.z) > 1.5) { if (this.goTo(this.home.x, this.home.z)) { if (this.follow(dt, 1.5)) this.targetYaw = this.home.yaw; } }
        break; }
      case ST.PATROL: {
        s.aim = 0; s.crouch = 0; s.look = damp(s.look, Math.sin(g.time * 0.5 + this.home.x) * 0.5, 2, dt);
        if (this.wait > 0) { this.wait -= dt; s.speed = damp(s.speed, 0, 8, dt); this.turn(dt, 1.5); break; }
        const wp = this.route[this.routeIdx]; if (!this.path) this.goTo(wp[0], wp[1], true);
        if (this.follow(dt, 1.35) && Math.hypot(s.pos.x - wp[0], s.pos.z - wp[1]) < 1.5) { this.routeIdx = (this.routeIdx + 1) % this.route.length; this.wait = Math.random() < 0.4 ? rr(2, 6) : 0; this.path = null; }
        else if (!this.path) { this.routeIdx = (this.routeIdx + 1) % this.route.length; }
        this.turn(dt, 3);
        break; }
      case ST.SUSPECT: {
        s.speed = damp(s.speed, 0, 9, dt); s.aim = damp(s.aim, 0.5, 4, dt) > 0.4 ? 0.5 : s.aim; s.look = damp(s.look, 0, 5, dt);
        this.targetYaw = Math.atan2(this.lastKnown.x - s.pos.x, this.lastKnown.z - s.pos.z); this.turn(dt, 3.2); s.aimYaw = damp(s.aimYaw, 0, 5, dt); s.aimPitch = damp(s.aimPitch, 0, 5, dt);
        this.wait -= dt; if (this.wait <= 0) { if (this.canMove) { this.set(ST.INVESTIGATE); this.path = null; this.investT = rr(5, 8); } else if (this.stateT > 6 && this.det < 0.2) this.set(ST.IDLE); }
        break; }
      case ST.INVESTIGATE: {
        s.aim = 0.6; s.crouch = 0; s.look = Math.sin(g.time * 1.3 + this.home.z) * 0.6;
        const d = Math.hypot(s.pos.x - this.lastKnown.x, s.pos.z - this.lastKnown.z);
        if (d > 2.5 && this.stateT < 25) { if (!this.path) { if (!this.goTo(this.lastKnown.x, this.lastKnown.z, true)) this.investT -= dt * 3; } this.follow(dt, 2.1); this.turn(dt, 3.5); }
        else { s.speed = damp(s.speed, 0, 8, dt); this.investT -= dt; this.lookT -= dt; if (this.lookT <= 0) { this.lookT = rr(1, 2.2); this.targetYaw = s.yaw + rr(-2, 2); } this.turn(dt, 2); }
        if (this.investT <= 0) { this.set(this.route ? ST.PATROL : ST.IDLE); this.path = null; this.det = 0; }
        break; }
      case ST.COMBAT: this.updateCombat(dt); break;
      case ST.SEARCH: {
        s.aim = 1; s.crouch = damp(s.crouch, 0.25, 4, dt); s.look = 0;
        if (this.wait > 0) { this.wait -= dt; s.speed = damp(s.speed, 0, 8, dt); }
        const d = Math.hypot(s.pos.x - this.lastKnown.x, s.pos.z - this.lastKnown.z);
        if (this.canMove && d > 4 && this.stateT < 40 && this.wait <= 0) { if (!this.path) { const p = g.world.nav.randomNear(this.lastKnown.x, this.lastKnown.z, 0, 5) || this.lastKnown; if (!this.goTo(p.x, p.z, true)) this.stateT += 4; } this.follow(dt, 3.0); this.turn(dt, 4); s.aimYaw = damp(s.aimYaw, 0, 6, dt); s.aimPitch = damp(s.aimPitch, 0, 6, dt); }
        else { s.speed = damp(s.speed, 0, 8, dt); this.lookT -= dt; if (this.lookT <= 0) { this.lookT = rr(0.8, 1.8); this.targetYaw = s.yaw + rr(-2.2, 2.2); } this.turn(dt, 2.6); s.aimYaw = damp(s.aimYaw, 0, 6, dt); }
        if (this.stateT > (this.canMove ? 34 : 22)) { this.set(this.route ? ST.PATROL : ST.IDLE); this.path = null; this.det = 0.2; }
        break; }
    }
  }

  updateCombat(dt) {
    const g = this.g, s = this.s, pl = g.player; s.look = 0; s.aim = 1;
    if (!pl.alive) { s.speed = damp(s.speed, 0, 8, dt); s.crouch = 0; s.aim = 0.5; return; }
    const sinceSeen = g.time - this.lastSeenT;
    const target = this.seeing ? pl.getChestPos(_d) : _d.copy(this.lastKnown).setY(this.lastKnown.y + 1.2);
    const facing = this.aimAt(dt, target);
    this.react -= dt;
    // el bombası: oyuncu uzun süre siperde kaldıysa
    this.grenadeT -= dt;
    if (this.grenadeT <= 0 && !this.seeing && sinceSeen > 3 && sinceSeen < 9 && this.canMove) { const d = s.pos.distanceTo(this.lastKnown); if (d > 9 && d < 30 && Math.random() < 0.5) { const from = _a.copy(s.wp.head); const to = _b.copy(this.lastKnown); to.y += 0.5; const v = to.sub(from); const t = clamp(d / 13, 0.9, 2.2); v.multiplyScalar(1 / t); v.y += 4.9 * t; g.ballistics.throwGrenade({ from: from.clone(), vel: v.clone(), kind: 'frag', owner: 'enemy' }); g.hud?.warn('EL BOMBASI!'); } this.grenadeT = rr(14, 26); }
    if (this.seeing && facing && this.react <= 0 && (!this.cover || this.peek || !this.canMove || this.atCover === false)) this.shootAt(dt); else if (!this.seeing) { this.burst = 0; }
    if (!this.canMove) { // sabit nöbetçi: salvo aralarında çömel
      s.speed = 0; this.turn(dt, 4.5); this.peekT -= dt; if (this.peekT <= 0) { this.peek = !this.peek; this.peekT = this.peek ? rr(1.6, 3.2) : rr(0.8, 2.0); }
      s.crouch = this.peek || !this.elevated ? (this.elevated ? 0 : 0.35) : 1; if (!this.peek && this.elevated) this.burst = 0;
      if (sinceSeen > 14) { this.set(ST.SEARCH); }
      return;
    }
    // siper yönetimi
    this.coverT -= dt;
    if (!this.cover || this.coverT <= 0 || (this.cover && this.stateT > 2 && this.seeing && !this.peek && this.atCover && this.exposedT > 1.2)) { this.findCover(); this.path = null; this.atCover = false; this.exposedT = 0; }
    if (this.cover) {
      const c = this.cover; const tx = this.peek && c.peek ? c.peek.x : c.x, tz = this.peek && c.peek ? c.peek.z : c.z; const d = Math.hypot(s.pos.x - tx, s.pos.z - tz);
      if (d > 0.5) { if (!this.path) this.goTo(tx, tz, true); const arrived = this.follow(dt, d > 3 ? 4.6 : 2.4, false); this.atCover = arrived && d < 1; s.crouch = damp(s.crouch, 0.2, 5, dt); if (!this.path && d > 1.2 && this.stateT > 1) { this.cover = null; } }
      else {
        this.atCover = true; s.speed = damp(s.speed, 0, 10, dt); this.path = null;
        this.peekT -= dt; if (this.peekT <= 0) { this.peek = !this.peek; this.peekT = this.peek ? rr(1.5, 3.4) : rr(0.7, 2.2) * (1 + this.suppress * 1.5); if (!this.peek) this.burst = 0; }
        s.crouch = c.pop ? (this.peek ? 0 : 1) : 0.25;
        if (this.seeing && !this.peek) this.exposedT = (this.exposedT || 0) + dt; else this.exposedT = 0;
      }
    } else { // açık alanda: yan adımlarla savaş
      this.atCover = false; s.crouch = damp(s.crouch, this.suppress > 0.3 ? 0.9 : 0.3, 4, dt);
      this.strafeT -= dt; if (this.strafeT <= 0) { this.strafeT = rr(1.2, 3); this.strafeDir = -this.strafeDir; const a = this.targetYaw + Math.PI / 2 * this.strafeDir; const qx = s.pos.x + Math.sin(a) * rr(2, 4), qz = s.pos.z + Math.cos(a) * rr(2, 4); if (g.world.nav.walkable(qx, qz)) this.goTo(qx, qz, true); }
      this.follow(dt, 2.6, false);
    }
    this.turn(dt, 5);
    // hedef uzun süredir görünmüyorsa aramaya geç (ya da kanattan sıkıştır)
    if (sinceSeen > rr(7, 9)) { this.set(ST.SEARCH); this.path = null; this.wait = rr(0, 1.5); }
  }

  updateFollow(dt) {
    const g = this.g, s = this.s, pl = g.player; s.kneel = damp(s.kneel, 0, 4, dt); s.aim = 0; s.crouch = damp(s.crouch, g.ai.combat ? 0.5 : 0.15, 4, dt);
    const d = s.pos.distanceTo(pl.pos);
    this.farT = d > 28 ? (this.farT || 0) + dt : 0;
    if (this.farT > 8) { const bx = pl.pos.x + Math.sin(pl.yaw) * 4, bz = pl.pos.z + Math.cos(pl.yaw) * 4; const p = g.world.nav.nearestWalkable(bx, bz, 10); if (p) { s.pos.set(p.x, g.world.groundY(p.x, p.z), p.z); this.path = null; } this.farT = 0; }
    this.repathT -= dt;
    if (d > 3.2) { if (!this.path || this.repathT <= 0) { this.repathT = 0.7; const bx = pl.pos.x + Math.sin(pl.yaw) * 1.6, bz = pl.pos.z + Math.cos(pl.yaw) * 1.6; this.goTo(bx, bz, true); } this.follow(dt, d > 9 ? 5.2 : 3.2); }
    else { s.speed = damp(s.speed, 0, 8, dt); this.path = null; this.targetYaw = Math.atan2(pl.pos.x - s.pos.x, pl.pos.z - s.pos.z); }
    this.turn(dt, 5);
    // harita dışı arazide yürüme ızgarası yoksa doğrudan izle
    if (!this.path && d > 3.2) { const nx = (pl.pos.x - s.pos.x) / d, nz = (pl.pos.z - s.pos.z) / d; s.speed = damp(s.speed, d > 9 ? 5.2 : 3.2, 6, dt); s.pos.x += nx * s.speed * dt; s.pos.z += nz * s.speed * dt; s.pos.y = damp(s.pos.y, g.world.groundY(s.pos.x, s.pos.z), 12, dt); this.targetYaw = Math.atan2(nx, nz); s.moveLocal.set(0, 1); }
  }
}

export class AISystem {
  constructor(game) { this.g = game; this.soldiers = []; this.brains = []; this.combat = false; this.combatT = 0; this.alarm = false; this.pathBudget = 2; this.kills = 0; this.detecting = []; this.hostage = null; this.lamps = []; this.corpseT = 0; this.everSpotted = false; }

  spawn(list, hostagePos) {
    this.clear();
    list.forEach((o, i) => { const s = new Soldier(this.g, { ...o, variant: i % 4, team: 'enemy' }); this.soldiers.push(s); this.brains.push(new Brain(this, s, o)); });
    if (hostagePos) { const s = new Soldier(this.g, { x: hostagePos.x, z: hostagePos.z, y: hostagePos.y, yaw: hostagePos.yaw, team: 'hostage' }); s.fixedY = false; this.soldiers.push(s); const b = new Brain(this, s, { role: 'hostage' }); b.state = ST.HOSTAGE; this.brains.push(b); this.hostage = s; }
  }
  clear() { for (const s of this.soldiers) s.dispose(); this.soldiers = []; this.brains = []; this.combat = false; this.alarm = false; this.kills = 0; this.hostage = null; this.everSpotted = false; this.combatT = 0; }
  reinforce(list, target) { list.forEach((o, i) => { const s = new Soldier(this.g, { ...o, variant: (i + 1) % 4, team: 'enemy' }); this.soldiers.push(s); const b = new Brain(this, s, o); b.lastKnown.copy(target); b.hasKnown = true; b.set(ST.SEARCH); b.alerted = true; this.brains.push(b); }); }
  freeHostage() { const b = this.brains.find((x) => x.s === this.hostage); if (b) { b.state = ST.FOLLOW; b.canMove = true; } }
  get aliveEnemies() { let n = 0; for (const s of this.soldiers) if (s.alive && s.team === 'enemy') n++; return n; }

  litAt(pos) { for (const l of this.lamps) { const dx = l.x - pos.x, dz = l.z - pos.z; if (dx * dx + dz * dz < l.r * l.r) return true; } return false; }

  hearNoise(pos, radius, type) {
    for (const b of this.brains) { if (!b.s.alive || b.s.team !== 'enemy') continue; const d = b.s.pos.distanceTo(pos); if (d < radius) b.hear(pos, type, d); }
  }
  // Bir düşman oyuncuyu gördüğünde yakındakilere haber verir
  shout(from, radius) {
    this.everSpotted = true;
    for (const b of this.brains) { if (b === from || !b.s.alive || b.s.team !== 'enemy' || b.state === ST.COMBAT) continue; if (b.s.pos.distanceTo(from.s.pos) < radius) { b.lastKnown.copy(from.lastKnown); b.hasKnown = true; b.hear(from.lastKnown, 'shout', 0); } }
  }
  // Susturucusuz düşman ateşi herkesi ayağa kaldırır
  gunfire(s) {
    if (this.g.time - (this._gfT || -9) < 0.6) return; this._gfT = this.g.time; const me = s.ai;
    for (const b of this.brains) { if (b.s === s || !b.s.alive || b.s.team !== 'enemy' || b.state === ST.COMBAT) continue; if (b.s.pos.distanceTo(s.pos) < 85) { b.lastKnown.copy(me.lastKnown); b.hasKnown = true; b.hear(me.lastKnown, 'gunfire', 0); } }
  }
  onDeath(b) { if (b.s.team === 'enemy') this.kills++; }

  update(dt) {
    const g = this.g, pl = g.player; this.pathBudget = 2; let anyCombat = false; this.detecting.length = 0;
    let sh = 0; for (const b of this.brains) if (b.burst > 0 && b.s.alive) sh++; this.shooters = sh;
    for (const b of this.brains) {
      b.update(dt); b.s.update(dt);
      if (!b.s.alive || b.s.team !== 'enemy') continue;
      if (b.state === ST.COMBAT) anyCombat = true;
      else if (b.det > 0.06) { const a = Math.atan2(b.s.pos.x - pl.pos.x, b.s.pos.z - pl.pos.z); this.detecting.push({ a, level: b.det, alert: b.state >= ST.SUSPECT }); }
    }
    if (anyCombat) { this.combatT = 5; this.alarm = true; } else this.combatT = Math.max(0, this.combatT - dt);
    this.combat = this.combatT > 0;
    // ceset fark etme
    this.corpseT -= dt;
    if (this.corpseT <= 0) { this.corpseT = 0.7; const dead = this.soldiers.filter((s) => !s.alive && s.team === 'enemy' && !s.seenDead); if (dead.length) for (const b of this.brains) { if (!b.s.alive || b.s.team !== 'enemy' || b.state >= ST.COMBAT) continue; for (const c of dead) { const d = b.s.pos.distanceTo(c.pos); if (d < 24 && d > 0.5) { const a = Math.abs(angleDelta(b.s.yaw + b.s.look, Math.atan2(c.pos.x - b.s.pos.x, c.pos.z - b.s.pos.z))); if (a < 1.0 && !g.lineBlocked(b.s.wp.head, _a.copy(c.pos).setY(c.pos.y + 0.4))) { c.seenDead = true; b.lastKnown.copy(c.pos); b.hasKnown = true; b.set(ST.SEARCH); b.wait = rr(0.6, 1.4); this.shout(b, 22); break; } } } } }
  }
}
export { ST };
