// Gösterge paneli: tuval üzerinde pusula, nişan artısı, tespit / hasar yayları, hedef işaretleri; DOM'da metin panelleri
import * as THREE from 'three';
import { clamp, wrapAngle, lerp } from '../core/utils.js';

const $ = (id) => document.getElementById(id);
const _v = new THREE.Vector3();
const CARD = [[0, 'K'], [45, 'KD'], [90, 'D'], [135, 'GD'], [180, 'G'], [225, 'GB'], [270, 'B'], [315, 'KB']];

export class HUD {
  constructor(game) {
    this.g = game; this.c = $('hudc'); this.ctx = this.c.getContext('2d'); this.root = $('hud');
    this.el = { hp: $('hp'), hpv: $('hpv'), stance: $('stance'), band: $('band'), nvg: $('nvgtag'), mag: $('mag'), res: $('res'), wname: $('wname'), mode: $('mode'), frag: $('frag'), flash: $('flash'), ammoBig: document.querySelector('#ammo .big'),
      prompt: $('prompt'), promptTxt: document.querySelector('#prompt .txt'), promptBar: document.querySelector('#prompt .bar i'), promptKey: document.querySelector('#prompt kbd'), toast: $('toast'), warn: $('warn'), radio: $('radio'), radioWho: document.querySelector('#radio .who'), radioTxt: document.querySelector('#radio .txt'), objs: $('objectives'), use: document.querySelector('.t-use') };
    this.last = {}; this.toastT = 0; this.warnT = 0; this.radioT = 0; this.objT = 0; this.hitT = 0; this.hitKill = false; this.hitHead = false; this.visible = false; this.spread = 0; this.objKey = '';
    this.resize();
  }
  resize() { const d = Math.min(devicePixelRatio || 1, 2); this.dpr = d; this.c.width = Math.round(innerWidth * d); this.c.height = Math.round(innerHeight * d); }
  show(v) { this.visible = v; this.root.hidden = !v; if (!v) this.ctx.clearRect(0, 0, this.c.width, this.c.height); }
  set(key, node, value, prop = 'textContent') { if (this.last[key] !== value) { this.last[key] = value; node[prop] = value; } }

  toast(text, t = 2.2) { this.el.toast.textContent = text; this.el.toast.hidden = false; this.toastT = t; }
  warn(text, t = 1.8) { if (this.warnT > 0.3 && this.el.warn.textContent === text) { this.warnT = Math.max(this.warnT, 0.6); return; } this.el.warn.textContent = text; this.el.warn.hidden = false; this.warnT = t; }
  radio(who, text) { this.el.radioWho.textContent = who; this.el.radioTxt.textContent = text; this.el.radio.hidden = false; this.radioT = 3.2 + text.length * 0.055; }
  hitmarker(kill, head) { this.hitT = kill ? 0.32 : 0.16; this.hitKill = kill; this.hitHead = head; }
  objectiveDone(o) { this.objT = 7; this.toast('Hedef tamamlandı: ' + o.title, 3.2); }
  showObjectives(t = 6) { this.objT = Math.max(this.objT, t); }

  objectivesHTML() {
    const m = this.g.mission; if (!m) return '';
    return '<h4>HEDEFLER</h4><ul>' + m.objs.map((o) => `<li class="${o.done ? 'done' : ''}${o.locked ? ' locked' : ''}"><b>${o.letter}</b><span>${o.title}</span></li>`).join('') + '</ul>';
  }

  update(dt) {
    if (!this.visible) return; const g = this.g, pl = g.player, w = g.weapons, e = this.el;
    // sağlık / duruş
    const hp = Math.round(pl.health); this.set('hp', e.hpv, String(hp));
    if (this.last.hpw !== hp) { this.last.hpw = hp; e.hp.style.width = hp + '%'; e.hp.classList.toggle('low', hp < 40); }
    this.set('stance', e.stance, pl.crouching ? 'ÇÖMELMİŞ' : pl.sprinting ? 'KOŞUYOR' : 'AYAKTA'); this.set('band', e.band, String(pl.bandages));
    this.set('nvg', e.nvg, g.nvg ? 'GGC AÇIK' : 'GGC KAPALI');
    // mühimmat
    const st = w.cur; this.set('mag', e.mag, String(st.mag)); this.set('res', e.res, String(w.totalReserve())); this.set('wname', e.wname, st.def.name); this.set('mode', e.mode, st.def.modes[st.mode]);
    this.set('frag', e.frag, String(w.frags)); this.set('flash', e.flash, String(w.flashes));
    const low = st.mag <= Math.ceil(st.def.magSize * 0.2); if (this.last.low !== low) { this.last.low = low; e.ammoBig.classList.toggle('low', low); }
    // etkileşim istemi
    const p = g.mission.prompt;
    if (p) { e.prompt.hidden = false; this.set('ptxt', e.promptTxt, p.text); e.promptBar.style.width = (p.progress * 100).toFixed(1) + '%'; e.promptKey.hidden = !p.key || g.input.touch; if (e.use) e.use.hidden = !(g.input.touch && p.key); }
    else { if (!e.prompt.hidden) e.prompt.hidden = true; if (e.use && !e.use.hidden) e.use.hidden = true; }
    // geçici iletiler
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) e.toast.hidden = true; }
    if (this.warnT > 0) { this.warnT -= dt; if (this.warnT <= 0) e.warn.hidden = true; }
    if (this.radioT > 0) { this.radioT -= dt; if (this.radioT <= 0) e.radio.hidden = true; }
    // hedef listesi
    const key = g.mission.objs.map((o) => (o.done ? 1 : 0) + (o.locked ? 'l' : '')).join('');
    if (key !== this.objKey) { this.objKey = key; e.objs.innerHTML = this.objectivesHTML(); this.objT = Math.max(this.objT, 6); }
    if (g.input.hitAny('objectives')) this.objT = 6;
    this.objT -= dt; const dim = this.objT <= 0; if (this.last.dim !== dim) { this.last.dim = dim; e.objs.classList.toggle('dim', dim); }
    if (this.hitT > 0) this.hitT -= dt;
    this.draw(dt);
  }

  draw(dt) {
    const g = this.g, c = this.ctx, d = this.dpr, W = this.c.width, H = this.c.height, pl = g.player, cam = g.camera; c.clearRect(0, 0, W, H);
    c.save(); c.scale(d, d); const w = W / d, h = H / d, cx = w / 2, cy = h / 2;
    const bearing = ((-pl.yaw * 180 / Math.PI) % 360 + 360) % 360;
    // --- pusula şeridi
    const cw = Math.min(380, w * 0.5), top = (g.input.touch ? 46 : 14) + (parseFloat(getComputedStyle(document.documentElement).paddingTop) || 0), ppd = cw / 110;
    c.font = '600 12px "Saira Condensed", "Arial Narrow", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'top';
    c.fillStyle = 'rgba(13,17,14,0.5)'; c.fillRect(cx - cw / 2, top, cw, 26);
    c.save(); c.beginPath(); c.rect(cx - cw / 2, top, cw, 44); c.clip();
    for (let a = 0; a < 360; a += 5) {
      const off = wrapDeg(a - bearing); if (Math.abs(off) > 58) continue; const x = cx + off * ppd; const major = a % 15 === 0;
      c.fillStyle = major ? 'rgba(233,228,212,0.85)' : 'rgba(233,228,212,0.4)'; c.fillRect(x - 0.5, top + (major ? 2 : 6), 1, major ? 8 : 4);
    }
    for (const [a, t] of CARD) { const off = wrapDeg(a - bearing); if (Math.abs(off) > 55) continue; c.fillStyle = t.length === 1 ? '#e9e4d4' : 'rgba(179,169,136,0.9)'; c.fillText(t, cx + off * ppd, top + 11); }
    // hedef işaretleri (pusulada)
    for (const o of g.mission.objs) { if (o.done || o.locked) continue; const b = Math.atan2(o.pos.x - pl.pos.x, -(o.pos.z - pl.pos.z)) * 180 / Math.PI; const off = clamp(wrapDeg(b - bearing), -54, 54); const x = cx + off * ppd; c.fillStyle = '#e0a23a'; c.beginPath(); c.moveTo(x, top + 27); c.lineTo(x - 5, top + 34); c.lineTo(x + 5, top + 34); c.closePath(); c.fill(); c.fillText(o.letter, x, top + 35); }
    c.restore();
    c.fillStyle = '#e0a23a'; c.fillRect(cx - 0.75, top - 3, 1.5, 9);
    c.font = '500 11px "IBM Plex Mono", monospace'; c.fillStyle = 'rgba(233,228,212,0.9)'; c.textAlign = 'left'; c.fillText(String(Math.round(bearing) % 360).padStart(3, '0') + '°', cx + cw / 2 + 8, top + 7); c.textAlign = 'center';
    // --- dünya üzerindeki hedef işaretleri
    c.font = '600 12px "Saira Condensed", "Arial Narrow", sans-serif'; c.textBaseline = 'middle';
    for (const o of g.mission.objs) {
      if (o.done || o.locked) continue; _v.set(o.pos.x, o.pos.y + 0.5, o.pos.z); const dist = _v.distanceTo(cam.position); if (dist > 75 && o.kind !== 'exfil') continue; _v.project(cam);
      if (_v.z > 1 || Math.abs(_v.x) > 0.96 || Math.abs(_v.y) > 0.92) continue; const x = (_v.x * 0.5 + 0.5) * w, y = (-_v.y * 0.5 + 0.5) * h;
      const a = dist < 3 ? 0.25 : 0.8; c.globalAlpha = a; c.strokeStyle = '#e0a23a'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x, y - 9); c.lineTo(x + 9, y); c.lineTo(x, y + 9); c.lineTo(x - 9, y); c.closePath(); c.stroke();
      c.fillStyle = '#e0a23a'; c.fillText(o.letter, x, y + 0.5); c.fillStyle = 'rgba(233,228,212,0.9)'; c.fillText(Math.round(dist) + ' m', x, y + 20); c.globalAlpha = 1;
    }
    // --- nişan artısı
    const ws = g.weapons; const hide = ws.adsT > 0.4 || ws.lowerT > 0.4 || ws.sprintT > 0.5 || !pl.alive || g.state !== 'play';
    const target = (ws.cur.def.spreadHip * 420) * (1 + pl.speed * 0.4 + ws.burstHeat * 1.2) * (pl.crouching ? 0.75 : 1) + 5; this.spread = lerp(this.spread, target, 1 - Math.exp(-14 * dt));
    if (!hide && g.settings.crosshair) { const s = this.spread; c.strokeStyle = 'rgba(233,228,212,0.82)'; c.lineWidth = 1.5; c.shadowColor = 'rgba(0,0,0,0.7)'; c.shadowBlur = 2; c.beginPath(); c.moveTo(cx - s - 7, cy); c.lineTo(cx - s, cy); c.moveTo(cx + s, cy); c.lineTo(cx + s + 7, cy); c.moveTo(cx, cy - s - 7); c.lineTo(cx, cy - s); c.moveTo(cx, cy + s); c.lineTo(cx, cy + s + 7); c.stroke(); c.shadowBlur = 0; }
    // --- isabet işareti
    if (this.hitT > 0) { const k = this.hitT / (this.hitKill ? 0.32 : 0.16); c.strokeStyle = this.hitKill ? `rgba(214,69,47,${k})` : `rgba(233,228,212,${k})`; c.lineWidth = this.hitHead ? 2.5 : 1.6; const r0 = 6, r1 = 13; c.beginPath(); for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { c.moveTo(cx + sx * r0, cy + sy * r0); c.lineTo(cx + sx * r1, cy + sy * r1); } c.stroke(); }
    // --- tespit yayları (düşman seni fark etmek üzere)
    const view = -pl.yaw; // dünya yönü -> ekran açısı
    for (const dtc of g.ai.detecting) {
      const rel = wrapAngle(Math.atan2(Math.sin(dtc.a), -Math.cos(dtc.a)) - view); const ang = rel - Math.PI / 2; const r = 96; const span = 0.16 + dtc.level * 0.3;
      c.strokeStyle = 'rgba(233,228,212,0.28)'; c.lineWidth = 5; c.beginPath(); c.arc(cx, cy, r, ang - 0.46, ang + 0.46); c.stroke();
      c.strokeStyle = dtc.alert ? '#e0a23a' : '#e9e4d4'; c.beginPath(); c.arc(cx, cy, r, ang - span, ang + span); c.stroke();
    }
    // --- hasar yönü
    for (const hd of pl.hitDir) { const rel = wrapAngle(Math.atan2(Math.sin(hd.a), -Math.cos(hd.a)) - view); const ang = rel - Math.PI / 2; c.strokeStyle = `rgba(214,69,47,${Math.min(1, hd.t) * 0.85})`; c.lineWidth = 7; c.beginPath(); c.arc(cx, cy, 128, ang - 0.3, ang + 0.3); c.stroke(); }
    // --- sargı / tutma ilerlemesi
    if (pl.healing > 0) { c.strokeStyle = 'rgba(233,228,212,0.25)'; c.lineWidth = 4; c.beginPath(); c.arc(cx, cy, 30, 0, 6.2832); c.stroke(); c.strokeStyle = '#e0a23a'; c.beginPath(); c.arc(cx, cy, 30, -Math.PI / 2, -Math.PI / 2 + (pl.healing / 3.2) * 6.2832); c.stroke(); }
    if (g.ai.combat) { c.font = '600 11px "Saira Condensed", sans-serif'; c.textBaseline = 'top'; c.fillStyle = '#d6452f'; c.fillText('ÇATIŞMA', cx, top + 62); }
    c.restore();
  }
}
function wrapDeg(a) { a = ((a + 180) % 360 + 360) % 360 - 180; return a; }
