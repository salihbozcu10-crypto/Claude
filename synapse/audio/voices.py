#!/usr/bin/env python3
"""SYNAPSE — diyalog seslendirme.

Piper (Türkçe nöral TTS, CC0 sesler: fahrettin, fettah) + WORLD vokoder (pyworld) ile
karakter sesleri üretir; dudak senkronu verisini çıkarır.

  python3 audio/voices.py            # tüm satırlar
  python3 audio/voices.py L03 L09    # yalnızca seçilenler

Çıktı: assets/voices/<ID>.wav (48 kHz mono), manifest.json, lipsync.json
"""
import json, sys, os, subprocess, tempfile, wave
import numpy as np
import pyworld as pw
from piper import PiperVoice, SynthesisConfig

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VOX = os.path.join(ROOT, '.cache', 'voices')
OUT = os.path.join(ROOT, 'assets', 'voices')
SR = 48000

MODELS = {
    'fahrettin': os.path.join(VOX, 'vits-piper-tr_TR-fahrettin-medium', 'tr_TR-fahrettin-medium.onnx'),
    'fettah': os.path.join(VOX, 'vits-piper-tr_TR-fettah-medium', 'tr_TR-fettah-medium.onnx'),
}

# karakter ses ayarları
#   base: kaynak model, f0: perde çarpanı, fmt: formant (zarf) çarpanı, ls: konuşma hızı (length_scale),
#   breath: nefeslilik (aperiodiklik artışı), whisper: fısıltı karışımı
VOICES = {
    'atlas': dict(base='fahrettin', f0=1.0, fmt=1.0, ls=1.06, ns=0.62, nw=0.8, breath=0.0, world=False),
    'asya': dict(base='fettah', f0=1.13, fmt=1.10, ls=0.94, ns=0.7, nw=0.85, breath=0.04, world=True),
    'defne': dict(base='fettah', f0=1.27, fmt=1.15, ls=1.08, ns=0.6, nw=0.75, breath=0.16, world=True),
    'defneVO': dict(base='fettah', f0=1.27, fmt=1.15, ls=1.1, ns=0.55, nw=0.7, breath=0.3, world=True, whisper=0.75),
    'system': dict(base='fahrettin', f0=0.78, fmt=0.9, ls=1.18, ns=0.4, nw=0.5, breath=0.0, world=True, fx='system'),
}

# satır başına oyunculuk ince ayarı (hız / perde çarpanı / parçalar arası es)
ACT = {
    'L01': dict(ls=1.12, f0=0.98, pause=0.55, gain=0.85),
    'L02': dict(ls=0.96, f0=1.02),
    'L03': dict(ls=0.98, pause=0.45, frag_ls=[0.9, 1.12, 1.18]),
    'L04': dict(pause=0.5),
    'L05': dict(ls=0.9, f0=1.06, pause=0.3, gain=1.1),
    'L06': dict(ls=1.12, f0=0.97, pause=0.5),
    'L07': dict(ls=1.12, f0=1.0, pause=0.6, gain=0.85),
    'L08': dict(ls=1.0),
    'L09': dict(ls=1.12, pause=0.55, gain=0.85),
    'L10': dict(ls=0.88, f0=1.08, gain=1.1),
    'L11': dict(ls=0.9, f0=1.08, gain=1.05),
    'L12': dict(ls=0.9, f0=1.1, gain=1.15),
    'L13': dict(ls=1.08, pause=0.55, frag_ls=[1.12, 1.1, 0.95, 0.95]),
    'L14': dict(ls=1.1, f0=0.98, pause=0.45, gain=0.8),
    'L15': dict(ls=1.22, f0=0.95, pause=0.6, gain=0.75),
    'L16': dict(ls=1.12, pause=0.45),
}

_cache = {}
def voice(name):
    if name not in _cache: _cache[name] = PiperVoice.load(MODELS[name])
    return _cache[name]

def tts(base, text, ls, ns, nw):
    v = voice(base)
    a = np.concatenate([c.audio_float_array for c in v.synthesize(text, SynthesisConfig(length_scale=ls, noise_scale=ns, noise_w_scale=nw))])
    return a.astype(np.float64), v.config.sample_rate

def trim(a, sr, thr=0.01):
    e = np.abs(a); idx = np.where(e > thr)[0]
    if len(idx) == 0: return a
    s = max(0, idx[0] - int(0.02 * sr)); t = min(len(a), idx[-1] + int(0.06 * sr))
    return a[s:t]

def warp_env(sp, alpha):
    """Spektral zarfı frekans ekseninde alpha kadar ölçekle (formant kaydırma)."""
    n = sp.shape[1]; k = np.arange(n)
    src = np.clip(k / alpha, 0, n - 1)
    out = np.empty_like(sp)
    for i in range(sp.shape[0]): out[i] = np.interp(src, k, sp[i])
    return out

def world_convert(a, sr, f0k, fmt, breath=0.0, whisper=0.0):
    f0, t = pw.harvest(a, sr, f0_floor=60, f0_ceil=600, frame_period=5.0)
    f0 = pw.stonemask(a, f0, t, sr)
    sp = pw.cheaptrick(a, f0, t, sr)
    ap = pw.d4c(a, f0, t, sr)
    f0n = f0 * f0k
    spn = warp_env(sp, fmt)
    apn = warp_env(ap, fmt)
    if breath > 0: apn = np.clip(apn + breath * (1 - apn) * np.linspace(0.3, 1, apn.shape[1])[None, :], 0, 1)
    y = pw.synthesize(f0n, spn, apn, sr, 5.0)
    if whisper > 0:
        yw = pw.synthesize(np.zeros_like(f0n), spn, np.ones_like(apn), sr, 5.0)
        yw *= np.sqrt(np.mean(y ** 2) / max(1e-9, np.mean(yw ** 2))) * 0.9
        y = y * (1 - whisper) + yw * whisper
    return y

def resample(a, sr_in, sr_out=SR):
    with tempfile.TemporaryDirectory() as d:
        i, o = os.path.join(d, 'i.wav'), os.path.join(d, 'o.wav')
        write_wav(i, a, sr_in)
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', i, '-af', f'aresample={sr_out}:resampler=soxr:precision=28' , '-ar', str(sr_out), o], check=False)
        if not os.path.exists(o):
            subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', i, '-ar', str(sr_out), o], check=True)
        return read_wav(o)[0]

def write_wav(path, a, sr):
    a = np.clip(a, -1, 1)
    with wave.open(path, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes((a * 32767).astype(np.int16).tobytes())

def read_wav(path):
    with wave.open(path, 'rb') as w:
        sr = w.getframerate(); n = w.getnframes(); ch = w.getnchannels()
        x = np.frombuffer(w.readframes(n), np.int16).astype(np.float64) / 32768
        if ch > 1: x = x.reshape(-1, ch).mean(1)
        return x, sr

def reverb_ir(sr, t60=1.2, pre=0.01, bright=0.5, seed=1):
    rng = np.random.default_rng(seed)
    n = int(sr * t60 * 1.2)
    t = np.arange(n) / sr
    ir = rng.standard_normal(n) * np.exp(-6.9 * t / t60)
    # yüksek frekans sönümü: basit tek kutuplu alçak geçiren (zamanla artan)
    out = np.zeros(n); y = 0.0
    for i in range(n):
        k = bright * np.exp(-t[i] * 3)  # zamanla koyulaşır
        y += (0.15 + 0.8 * k) * (ir[i] - y)
        out[i] = y
    out = np.concatenate([np.zeros(int(pre * sr)), out])
    return out / np.sqrt(np.sum(out ** 2))

def convolve(a, ir):
    n = len(a) + len(ir) - 1; N = 1 << (n - 1).bit_length()
    return np.fft.irfft(np.fft.rfft(a, N) * np.fft.rfft(ir, N), N)[:n]

def fx_system(a, sr):
    t = np.arange(len(a)) / sr
    ring = a * np.sin(2 * np.pi * 38 * t)
    y = 0.6 * a + 0.45 * ring
    # bit indirgeme + örnek tutma
    q = 2 ** 6; y = np.round(y * q) / q
    hold = 3; y = np.repeat(y[::hold], hold)[:len(a)]
    # metalik tarak filtresi
    d = int(sr * 0.0047); yc = y.copy(); yc[d:] += 0.55 * y[:-d]
    ir = reverb_ir(sr, t60=2.6, pre=0.02, bright=0.3, seed=7)
    wet = convolve(yc, ir)[:len(yc) + int(sr * 1.5)]
    dry = np.concatenate([yc, np.zeros(len(wet) - len(yc))])
    return dry * 0.75 + wet * 0.55

def fx_vo(a, sr):
    ir = reverb_ir(sr, t60=0.9, pre=0.008, bright=0.6, seed=3)
    wet = convolve(a, ir)[:len(a) + int(sr * 0.6)]
    dry = np.concatenate([a, np.zeros(len(wet) - len(a))])
    return dry * 0.85 + wet * 0.35

def fades(a, sr, fi=0.012, fo=0.04):
    a = a.copy(); ni, no = int(fi * sr), int(fo * sr)
    a[:ni] *= np.linspace(0, 1, ni); a[-no:] *= np.linspace(1, 0, no)
    return a

def lipsync(a, sr, rate=60):
    hop = sr / rate; win = int(0.024 * sr)
    pre = np.append(a[0], a[1:] - 0.85 * a[:-1])
    n = int(len(a) / hop) + 1
    env = np.zeros(n); cen = np.zeros(n)
    freqs = np.fft.rfftfreq(win, 1 / sr)
    w = np.hanning(win)
    for i in range(n):
        s = int(i * hop - win / 2); seg = np.zeros(win)
        lo, hi = max(0, s), min(len(a), s + win)
        if hi > lo: seg[lo - s:hi - s] = pre[lo:hi]
        env[i] = np.sqrt(np.mean((seg * w) ** 2))
        S = np.abs(np.fft.rfft(seg * w)); band = (freqs > 200) & (freqs < 6000)
        cen[i] = (S[band] * freqs[band]).sum() / max(1e-9, S[band].sum())
    ref = np.percentile(env[env > 1e-4], 92) if np.any(env > 1e-4) else 1
    e = np.clip(env / max(ref, 1e-6), 0, 1.2)
    e = np.where(e < 0.12, 0, (e - 0.12) / 0.88)
    # atak / bırakma yumuşatma
    out = np.zeros_like(e); y = 0
    for i, x in enumerate(e):
        k = 0.6 if x > y else 0.25
        y += (x - y) * k; out[i] = y
    out = np.clip(out ** 0.8, 0, 1)
    sh = np.clip((cen - 1700) / 1300, -1, 1)
    shs = np.convolve(sh, np.ones(5) / 5, mode='same')
    return [round(float(x), 3) for x in out], [round(float(x), 3) for x in shs]

def stats(a, sr):
    f0, t = pw.harvest(a.astype(np.float64), sr, f0_floor=60, f0_ceil=600, frame_period=10)
    v = f0[f0 > 0]
    return float(np.median(v)) if len(v) else 0.0

def render_line(L):
    who = L['who']; cfg = VOICES[who]; act = ACT.get(L['id'], {})
    frags = [f.strip() for f in L['text'].split('...') if f.strip()]
    parts = []; sr0 = None
    for i, fr in enumerate(frags):
        ls = cfg['ls'] * act.get('ls', 1.0)
        if 'frag_ls' in act and i < len(act['frag_ls']): ls = cfg['ls'] * act['frag_ls'][i]
        text = fr if i == len(frags) - 1 else fr + ('...' if fr[-1] not in '.!?' else '')
        a, sr0 = tts(cfg['base'], text, ls, cfg['ns'], cfg['nw'])
        a = trim(a, sr0)
        if cfg.get('world'):
            a = world_convert(a, sr0, cfg['f0'] * act.get('f0', 1.0), cfg['fmt'], cfg.get('breath', 0), cfg.get('whisper', 0))
        elif act.get('f0', 1.0) != 1.0:
            a = world_convert(a, sr0, act['f0'], 1.0, 0)
        parts.append(a)
        if i < len(frags) - 1: parts.append(np.zeros(int(sr0 * act.get('pause', 0.4))))
    a = np.concatenate(parts)
    a = resample(a, sr0)
    if cfg.get('fx') == 'system': a = fx_system(a, SR)
    if who == 'defneVO': a = fx_vo(a, SR)
    a = a - np.mean(a)
    a = a / max(1e-6, np.max(np.abs(a))) * (10 ** (-3 / 20)) * min(1.0, act.get('gain', 1.0))
    a = fades(a, SR)
    return a

def main():
    os.makedirs(OUT, exist_ok=True)
    D = json.load(open(os.path.join(ROOT, 'assets', 'dialogue.json')))
    only = set(sys.argv[1:])
    mpath, lpath = os.path.join(OUT, 'manifest.json'), os.path.join(OUT, 'lipsync.json')
    manifest = json.load(open(mpath)) if os.path.exists(mpath) else {}
    lip = json.load(open(lpath)) if os.path.exists(lpath) else {}
    for L in D['lines']:
        if only and L['id'] not in only: continue
        a = render_line(L)
        write_wav(os.path.join(OUT, L['id'] + '.wav'), a, SR)
        env, shape = lipsync(a, SR)
        manifest[L['id']] = {'who': L['who'], 'file': L['id'] + '.wav', 'dur': round(len(a) / SR, 3)}
        lip[L['id']] = {'rate': 60, 'env': env, 'shape': shape}
        print(f"{L['id']} {L['who']:8s} {len(a)/SR:6.2f}s  F0 med {stats(a, SR):6.1f} Hz")
    json.dump(manifest, open(mpath, 'w'), ensure_ascii=False, indent=1)
    json.dump(lip, open(lpath, 'w'), separators=(',', ':'))

if __name__ == '__main__':
    main()
