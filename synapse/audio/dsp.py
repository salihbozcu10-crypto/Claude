"""SYNAPSE ses DSP yardımcıları (numpy + scipy). Tüm çıktılar 48 kHz, float, deterministik."""
import numpy as np
from scipy import signal
import wave, os, subprocess

SR = 48000
RNG = np.random.default_rng

def t_(dur): return np.arange(int(dur * SR)) / SR

def noise(dur, seed=0): return RNG(seed).standard_normal(int(dur * SR))

def lp(x, fc, order=2):
    sos = signal.butter(order, min(fc, SR * 0.45), 'low', fs=SR, output='sos'); return signal.sosfilt(sos, x, axis=-1)
def hp(x, fc, order=2):
    sos = signal.butter(order, max(fc, 10), 'high', fs=SR, output='sos'); return signal.sosfilt(sos, x, axis=-1)
def bp(x, lo, hi, order=2):
    sos = signal.butter(order, [max(lo, 10), min(hi, SR * 0.45)], 'band', fs=SR, output='sos'); return signal.sosfilt(sos, x, axis=-1)

def env_adsr(n, a=0.01, d=0.1, s=0.7, r=0.2, total=None):
    total = total or n / SR
    t = np.arange(n) / SR
    e = np.where(t < a, t / max(a, 1e-6), np.where(t < a + d, 1 - (1 - s) * (t - a) / max(d, 1e-6), s))
    rel_start = total - r
    e = np.where(t > rel_start, e * np.clip(1 - (t - rel_start) / max(r, 1e-6), 0, 1), e)
    return e

def exp_env(n, tau): return np.exp(-np.arange(n) / SR / tau)

def fade(x, fi=0.01, fo=0.05):
    x = x.copy(); ni, no = int(fi * SR), int(fo * SR)
    if ni > 0: x[..., :ni] *= np.linspace(0, 1, ni)
    if no > 0: x[..., -no:] *= np.linspace(1, 0, no)
    return x

def stereo(x, pan=0.0, width=0.0, seed=0):
    """mono → stereo (pan -1..1), width: dekorelasyon için kısa gecikme"""
    l = x * np.sqrt((1 - pan) / 2) * np.sqrt(2); r = x * np.sqrt((1 + pan) / 2) * np.sqrt(2)
    if width > 0:
        d = int(SR * 0.011 * width); r = np.concatenate([np.zeros(d), r[:-d]]) if d > 0 else r
    return np.stack([l, r])

def reverb_ir(t60=1.5, pre=0.01, damp=0.5, seed=1, stereo_=True):
    rng = RNG(seed); n = int(SR * t60 * 1.3)
    t = np.arange(n) / SR
    chans = []
    for c in range(2 if stereo_ else 1):
        ir = rng.standard_normal(n) * np.exp(-6.9 * t / t60)
        # zamanla koyulaşan ton: iki bandın karışımı
        lo = lp(ir, 2500 * (1 - damp) + 600); hi = ir - lo
        mix = np.exp(-t * (2 + 6 * damp))
        ir = lo + hi * mix
        ir = np.concatenate([np.zeros(int(pre * SR)), ir]); ir /= np.sqrt(np.sum(ir ** 2))
        chans.append(ir)
    return np.stack(chans) if stereo_ else chans[0]

def convolve(x, ir):
    """x: (2,n) ya da (n,), ir: (2,m) ya da (m,) → FFT konvolüsyon"""
    if x.ndim == 1 and ir.ndim == 2: x = np.stack([x, x])
    if x.ndim == 2 and ir.ndim == 1: ir = np.stack([ir, ir])
    if x.ndim == 1: return signal.fftconvolve(x, ir)
    return np.stack([signal.fftconvolve(x[i], ir[i]) for i in range(2)])

def add_reverb(x, wet=0.3, t60=1.5, pre=0.01, damp=0.5, seed=1):
    if x.ndim == 1: x = np.stack([x, x])
    w = convolve(x, reverb_ir(t60, pre, damp, seed))
    out = np.zeros_like(w); out[:, :x.shape[1]] = x * (1 - wet * 0.3)
    return out + w * wet

def norm(x, peak_db=-1.0):
    m = np.max(np.abs(x)) or 1.0
    return x / m * 10 ** (peak_db / 20)

def write_flac(path, x):
    if x.ndim == 1: x = np.stack([x, x])
    x = np.clip(x, -1, 1)
    tmp = path + '.tmp.wav'
    with wave.open(tmp, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((x.T * 32767).astype(np.int16).tobytes())
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', tmp, '-c:a', 'flac', path], check=True)
    os.remove(tmp)

def read_audio(path):
    """herhangi bir ses dosyası → (2, n) float, 48 kHz"""
    out = subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', path, '-f', 's16le', '-ac', '2', '-ar', str(SR), '-'], capture_output=True, check=True).stdout
    a = np.frombuffer(out, np.int16).astype(np.float64) / 32768
    return a.reshape(-1, 2).T.copy()

def osc_saw(freq, dur, phase=0.0):
    t = t_(dur); f = np.full_like(t, freq) if np.isscalar(freq) else freq
    ph = np.cumsum(f) / SR + phase
    return 2 * (ph % 1) - 1

def osc_sine(freq, dur, phase=0.0):
    t = t_(dur); f = np.full_like(t, freq) if np.isscalar(freq) else freq
    return np.sin(2 * np.pi * (np.cumsum(f) / SR + phase))

def midi(n): return 440.0 * 2 ** ((n - 69) / 12)
