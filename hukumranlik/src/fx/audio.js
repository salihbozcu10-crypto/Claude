// Ses: tüm efektler ve müzik WebAudio ile sentezlenir
export class Sound {
  constructor(settings) { this.ctx = null; this.s = settings; this.musicOn = false; this.voices = 0; }
  init() {
    if (this.ctx) { this.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; try { this.ctx = new AC(); } catch { return; }
    const c = this.ctx; this.master = c.createGain(); this.comp = c.createDynamicsCompressor(); this.comp.threshold.value = -14; this.comp.ratio.value = 5;
    this.sfx = c.createGain(); this.mus = c.createGain(); this.sfx.connect(this.master); this.mus.connect(this.master); this.master.connect(this.comp); this.comp.connect(c.destination);
    this.rev = c.createConvolver(); const len = Math.floor(c.sampleRate * 2.4), ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) { const t = i / c.sampleRate; d[i] = (Math.random() * 2 - 1) * Math.exp(-t / 0.6) * (t < 0.01 ? t / 0.01 : 1); } }
    this.rev.buffer = ir; this.revG = c.createGain(); this.revG.gain.value = 0.32; this.rev.connect(this.revG); this.revG.connect(this.master);
    this.noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate); const nd = this.noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.apply(); this.resume();
  }
  apply() { if (!this.ctx) return; this.master.gain.value = this.s.volume; this.sfx.gain.value = this.s.sfx; this.mus.gain.value = this.s.music * 0.55; if (this.s.music > 0 && !this.musicOn) this.startMusic(); }
  resume() { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume().catch(() => {}); }
  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {}); }

  env(g, t, a, d, peak) { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0008, t + a + d); }
  osc(type, f, t, a, d, peak, dest = this.sfx, f2) { const c = this.ctx, o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + a + d); this.env(g, t, a, d, peak); o.connect(g); g.connect(dest); o.start(t); o.stop(t + a + d + 0.05); return g; }
  noise(t, a, d, peak, type = 'lowpass', freq = 1200, q = 0.8, dest = this.sfx, f2) { const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(); s.buffer = this.noiseBuf; f.type = type; f.frequency.setValueAtTime(freq, t); if (f2) f.frequency.exponentialRampToValueAtTime(f2, t + a + d); f.Q.value = q; this.env(g, t, a, d, peak); s.connect(f); f.connect(g); g.connect(dest); s.start(t, Math.random() * 0.5); s.stop(t + a + d + 0.05); return g; }
  wet(g, amt = 0.6) { const w = this.ctx.createGain(); w.gain.value = amt; g.connect(w); w.connect(this.rev); }

  play(name, o = {}) {
    if (!this.ctx || this.ctx.state !== 'running' || this.voices > 40) return; const t = this.ctx.currentTime + (o.delay || 0); this.voices++; setTimeout(() => this.voices--, 1500);
    const v = o.vol ?? 1;
    switch (name) {
      case 'click': this.osc('sine', 1400, t, 0.002, 0.04, 0.12 * v, this.sfx, 900); break;
      case 'open': this.noise(t, 0.04, 0.22, 0.12 * v, 'bandpass', 600, 1.2, this.sfx, 2400); break;
      case 'coin': this.osc('triangle', 1568, t, 0.002, 0.12, 0.16 * v); this.osc('triangle', 2093, t + 0.07, 0.002, 0.25, 0.14 * v); break;
      case 'build': for (let i = 0; i < 3; i++) { this.noise(t + i * 0.13, 0.002, 0.07, 0.3 * v, 'lowpass', 900); this.osc('sine', 180, t + i * 0.13, 0.002, 0.08, 0.2 * v, this.sfx, 90); } break;
      case 'select': this.osc('sine', 660, t, 0.004, 0.08, 0.08 * v); this.osc('sine', 990, t + 0.04, 0.004, 0.1, 0.06 * v); break;
      case 'order': this.noise(t, 0.01, 0.12, 0.12 * v, 'bandpass', 1800, 2); this.osc('triangle', 520, t, 0.005, 0.14, 0.09 * v, this.sfx, 780); break;
      case 'march': for (let i = 0; i < 6; i++) { const g = this.osc('sine', 110, t + i * 0.18, 0.003, 0.16, (i % 2 ? 0.16 : 0.26) * v, this.sfx, 60); this.noise(t + i * 0.18, 0.002, 0.05, 0.08 * v, 'lowpass', 2000); if (i === 0) this.wet(g, 0.3); } break;
      case 'clash': { const g = this.noise(t, 0.002, 0.18, 0.35 * v, 'highpass', 1800); for (const f of [2480, 3710, 5130, 6840]) this.osc('sine', f * (0.97 + Math.random() * 0.06), t, 0.001, 0.25 + Math.random() * 0.2, 0.05 * v); this.wet(g, 0.5); if (o.big) { const b = this.osc('sine', 70, t, 0.005, 0.7, 0.5 * v, this.sfx, 32); this.noise(t, 0.005, 0.9, 0.35 * v, 'lowpass', 400, 0.7, this.sfx, 80); this.wet(b, 0.7); } break; }
      case 'capture': { for (const [f, dt] of [[392, 0], [523.3, 0.16], [659.3, 0.32]]) { const g = this.brass(f, t + dt, 0.5, 0.11 * v); this.wet(g, 0.6); } break; }
      case 'war': { for (let i = 0; i < 4; i++) { const g = this.osc('sine', 72, t + i * 0.32, 0.004, 0.45, 0.45 * v, this.sfx, 38); this.noise(t + i * 0.32, 0.002, 0.12, 0.2 * v, 'lowpass', 600); this.wet(g, 0.6); } const h = this.brass(146.8, t + 0.15, 1.6, 0.13 * v, 0.6); this.wet(h, 0.9); break; }
      case 'peace': for (const [f, d, a] of [[523.3, 2.6, 0.12], [1318, 1.6, 0.04], [2090, 1.0, 0.025], [784, 2.2, 0.06]]) { const g = this.osc('sine', f, t, 0.004, d, a * v); this.wet(g, 0.8); } break;
      case 'ally': for (const [f, dt] of [[659.3, 0], [880, 0.14], [1318.5, 0.28]]) { const g = this.osc('triangle', f, t + dt, 0.004, 0.7, 0.09 * v); this.wet(g, 0.7); } break;
      case 'turn': this.noise(t, 0.08, 0.5, 0.1 * v, 'bandpass', 300, 0.9, this.sfx, 1600); this.osc('sine', 98, t + 0.05, 0.01, 0.6, 0.2 * v, this.sfx, 60); break;
      case 'event': for (const [f, dt] of [[880, 0], [1174.7, 0.1]]) { const g = this.osc('sine', f, t + dt, 0.003, 0.5, 0.08 * v); this.wet(g, 0.7); } break;
      case 'victory': { const seq = [[523.3, 0], [659.3, 0.18], [784, 0.36], [1046.5, 0.6], [784, 0.95], [1046.5, 1.15]]; for (const [f, dt] of seq) { const g = this.brass(f, t + dt, dt > 1 ? 1.4 : 0.32, 0.12 * v); this.wet(g, 0.7); } break; }
      case 'defeat': for (const [f, dt] of [[392, 0], [349.2, 0.5], [311.1, 1.0], [261.6, 1.5]]) { const g = this.brass(f, t + dt, 0.9, 0.1 * v, 0.4); this.wet(g, 0.8); } break;
      case 'volley': { for (let i = 0; i < 7; i++) { const d = Math.random() * 0.45; const g = this.noise(t + d, 0.001, 0.06 + Math.random() * 0.05, (0.16 + Math.random() * 0.12) * v, 'bandpass', 1600 + Math.random() * 1400, 0.9); if (i < 2) this.wet(g, 0.5); } break; }
      case 'cannon': { const g = this.osc('sine', 62, t, 0.003, 0.9, 0.42 * v, this.sfx, 30); this.noise(t, 0.002, 0.5, 0.3 * v, 'lowpass', 900, 0.7, this.sfx, 120); this.wet(g, 0.8); break; }
      case 'whoosh': { const g = this.noise(t, 0.15, 0.6, 0.09 * v, 'bandpass', 400, 1.4, this.sfx, 2600); this.wet(g, 0.5); break; }
      case 'eliminate': { const g = this.osc('sine', 55, t, 0.01, 1.4, 0.4 * v, this.sfx, 30); this.wet(g, 0.8); this.noise(t, 0.05, 1.2, 0.15 * v, 'lowpass', 300, 0.7); break; }
    }
  }
  brass(f, t, d, peak, vib = 0) {
    const c = this.ctx, o = c.createOscillator(), o2 = c.createOscillator(), fl = c.createBiquadFilter(), g = c.createGain();
    o.type = 'sawtooth'; o2.type = 'sawtooth'; o.frequency.value = f; o2.frequency.value = f * 1.004; if (vib) { const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = 5; lg.gain.value = f * 0.006 * vib; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + d + 0.1); }
    fl.type = 'lowpass'; fl.frequency.setValueAtTime(400, t); fl.frequency.linearRampToValueAtTime(2200, t + 0.06); fl.frequency.exponentialRampToValueAtTime(900, t + d);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + 0.04); g.gain.setValueAtTime(peak * 0.8, t + d * 0.7); g.gain.exponentialRampToValueAtTime(0.0008, t + d);
    o.connect(fl); o2.connect(fl); fl.connect(g); g.connect(this.sfx); o.start(t); o2.start(t); o.stop(t + d + 0.05); o2.stop(t + d + 0.05); return g;
  }

  // Kendiliğinden üretilen fon müziği: D dorian akorları üzerinde yavaş bir ezgi
  startMusic() {
    if (!this.ctx || this.musicOn) return; this.musicOn = true;
    const chords = [[146.8, 220, 293.7, 349.2], [130.8, 196, 261.6, 329.6], [116.5, 174.6, 233.1, 293.7], [130.8, 196, 261.6, 392]];
    const scale = [293.7, 329.6, 349.2, 392, 440, 493.9, 523.3, 587.3, 659.3];
    let next = this.ctx.currentTime + 0.5, ci = 0, beat = 0;
    const tick = () => {
      if (!this.musicOn || !this.ctx) return;
      while (next < this.ctx.currentTime + 1.5) {
        if (beat % 8 === 0) { // akor (pad)
          const ch = chords[ci % chords.length]; ci++;
          for (const f of ch) { const o = this.ctx.createOscillator(), o2 = this.ctx.createOscillator(), fl = this.ctx.createBiquadFilter(), g = this.ctx.createGain(); o.type = 'sawtooth'; o2.type = 'sawtooth'; o.frequency.value = f; o2.frequency.value = f * 1.006; fl.type = 'lowpass'; fl.frequency.value = 650; g.gain.setValueAtTime(0, next); g.gain.linearRampToValueAtTime(0.022, next + 2.2); g.gain.setValueAtTime(0.022, next + 6.5); g.gain.linearRampToValueAtTime(0, next + 8.8); o.connect(fl); o2.connect(fl); fl.connect(g); g.connect(this.mus); const w = this.ctx.createGain(); w.gain.value = 0.5; g.connect(w); w.connect(this.rev); o.start(next); o2.start(next); o.stop(next + 9); o2.stop(next + 9); }
          const b = this.ctx.createOscillator(), bg = this.ctx.createGain(); b.type = 'sine'; b.frequency.value = ch[0] / 2; bg.gain.setValueAtTime(0, next); bg.gain.linearRampToValueAtTime(0.06, next + 1); bg.gain.linearRampToValueAtTime(0, next + 8.5); b.connect(bg); bg.connect(this.mus); b.start(next); b.stop(next + 9);
        }
        if (Math.random() < 0.42 && beat % 2 === 0) { // ezgi notası
          const f = scale[Math.floor(Math.random() * scale.length)]; const o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.type = 'triangle'; o.frequency.value = f; const d = 1.4 + Math.random() * 1.4;
          g.gain.setValueAtTime(0, next); g.gain.linearRampToValueAtTime(0.035, next + 0.05); g.gain.exponentialRampToValueAtTime(0.0005, next + d); o.connect(g); g.connect(this.mus); const w = this.ctx.createGain(); w.gain.value = 0.9; g.connect(w); w.connect(this.rev); o.start(next); o.stop(next + d + 0.1);
        }
        if (beat % 4 === 0) { const o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.frequency.setValueAtTime(90, next); o.frequency.exponentialRampToValueAtTime(48, next + 0.3); g.gain.setValueAtTime(0.0, next); g.gain.linearRampToValueAtTime(beat % 16 === 0 ? 0.07 : 0.035, next + 0.005); g.gain.exponentialRampToValueAtTime(0.0005, next + 0.4); o.connect(g); g.connect(this.mus); o.start(next); o.stop(next + 0.5); }
        next += 1.1; beat++;
      }
      this.musicTimer = setTimeout(tick, 400);
    };
    tick();
  }
  stopMusic() { this.musicOn = false; clearTimeout(this.musicTimer); }
}
