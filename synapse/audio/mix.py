#!/usr/bin/env python3
"""SYNAPSE — final ses miksi.
  python3 audio/mix.py --cues out/cues.json --dur 200.7 --out out/mix.wav
cues: [{type:'line'|'sfx'|'amb'|'music', id, t, gain_db?, dur?, pan?}]
Diyalog otobüsü (hafif sıkıştırma + mekân yankısı), müzik/ambiyans diyalog altında kısılır (sidechain),
son aşamada ffmpeg loudnorm ile -14 LUFS / -1.5 dBTP (YouTube).
"""
import argparse, json, os, subprocess, wave
import numpy as np
from dsp import SR, read_audio, add_reverb, lp, hp, fade

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A = os.path.join(ROOT, 'audio')
LOOPS = {'amb_rain_muffled', 'amb_drips', 'amb_room_hum', 'crt_whine', 'drone_buzz', 'alarm_klaxon', 'amb_base_tone', 'amb_after', 'heartbeat', 'footsteps_wet', 'neural_hum', 'typing_fast', 'footsteps_fast', 'footsteps_run'}
_cache = {}

def load(kind, id_):
    key = (kind, id_)
    if key in _cache: return _cache[key]
    if kind == 'line': p = os.path.join(ROOT, 'assets', 'voices', id_ + '.wav')
    elif kind == 'music': p = os.path.join(A, 'music', id_ + '.flac')
    else: p = os.path.join(A, 'sfx', id_ + '.flac')
    x = read_audio(p); _cache[key] = x; return x

def looped(x, dur):
    n = int(dur * SR); out = np.zeros((2, n)); p = 0
    while p < n:
        k = min(x.shape[1], n - p); out[:, p:p + k] = x[:, :k]; p += k
    return out

def place(bus, x, t, gain_db=0.0, pan=0.0):
    g = 10 ** (gain_db / 20)
    if pan: x = x * np.array([[np.sqrt(1 - pan)], [np.sqrt(1 + pan)]])
    p = int(t * SR); n = min(x.shape[1], bus.shape[1] - p)
    if n > 0 and p >= 0: bus[:, p:p + n] += x[:, :n] * g
    elif p < 0 and x.shape[1] + p > 0: bus[:, :x.shape[1] + p] += x[:, -p:] * g

def compress(x, thr_db=-20, ratio=3.0, att=0.005, rel=0.12, makeup_db=4):
    m = np.max(np.abs(x), axis=0)
    # zarf (blok tabanlı hızlı yaklaşım)
    hop = 64; nb = len(m) // hop + 1
    blk = np.array([m[i * hop:(i + 1) * hop].max() if i * hop < len(m) else 0 for i in range(nb)])
    env = np.zeros(nb); e = 0; aa = np.exp(-hop / SR / att); rr = np.exp(-hop / SR / rel)
    for i, v in enumerate(blk): e = aa * e + (1 - aa) * v if v > e else rr * e + (1 - rr) * v; env[i] = e
    lvl = 20 * np.log10(np.maximum(env, 1e-6))
    gr = np.where(lvl > thr_db, (thr_db - lvl) * (1 - 1 / ratio), 0) + makeup_db
    g = 10 ** (np.repeat(gr, hop)[: x.shape[1]] / 20)
    return x * g

def sidechain_env(x, att=0.05, rel=0.45):
    m = np.sqrt(np.mean(x ** 2, axis=0)); hop = 240; nb = len(m) // hop + 1
    blk = np.array([np.sqrt(np.mean(m[i * hop:(i + 1) * hop] ** 2)) if i * hop < len(m) else 0 for i in range(nb)])
    env = np.zeros(nb); e = 0; aa = np.exp(-hop / SR / att); rr = np.exp(-hop / SR / rel)
    for i, v in enumerate(blk): e = aa * e + (1 - aa) * v if v > e else rr * e + (1 - rr) * v; env[i] = e
    env = np.clip(env / (np.percentile(env[env > 1e-4], 80) if np.any(env > 1e-4) else 1), 0, 1)
    return np.repeat(env, hop)[: x.shape[1]]

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--cues', required=True); ap.add_argument('--dur', type=float, required=True); ap.add_argument('--out', required=True)
    a = ap.parse_args()
    cues = json.load(open(a.cues)); N = int(a.dur * SR) + SR
    dlg, sfx, amb, mus = (np.zeros((2, N)) for _ in range(4))
    for c in cues:
        t, kind, id_ = c['t'], c['type'], c['id']; g = c.get('gain_db', 0)
        try: x = load(kind, id_)
        except Exception as e: print('EKSİK', kind, id_, e); continue
        if kind == 'line':
            room = 'serverRoom' if t < 53 else 'base'
            y = x.copy()
            if id_ not in ('L04', 'L16'):
                y = hp(y, 90)
                y = add_reverb(y, 0.16 if room == 'serverRoom' else 0.08, 1.7 if room == 'serverRoom' else 0.7, 0.012, 0.5, 3 if room == 'serverRoom' else 4)
            place(dlg, y, t, g)
        elif kind == 'music':
            place(mus, x, t, g)
        elif kind == 'amb':
            y = fade(looped(x, c.get('dur', 10)), 1.2, 1.5); place(amb, y, t, g, c.get('pan', 0))
        else:
            y = x
            if c.get('dur') and id_ in LOOPS: y = fade(looped(x, c['dur']), 0.05, 0.3)
            place(sfx, y, t, g, c.get('pan', 0))
    dlg = compress(dlg, -22, 3.0, 0.004, 0.15, 5)
    sc = sidechain_env(dlg)
    duck_m = 10 ** (-8.0 * sc / 20); duck_a = 10 ** (-5.0 * sc / 20)
    mix = dlg * 1.0 + sfx * 0.85 + amb * 0.7 * duck_a + mus * 0.62 * duck_m
    mix = mix[:, : int(a.dur * SR)]
    mix = fade(mix, 0.02, 0.6)
    pk = np.max(np.abs(mix)); mix = mix / pk * 0.89
    tmp = a.out + '.pre.wav'
    with wave.open(tmp, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((np.clip(mix, -1, 1).T * 32767).astype(np.int16).tobytes())
    # iki geçişli loudnorm
    r = subprocess.run(['ffmpeg', '-hide_banner', '-i', tmp, '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-'], capture_output=True, text=True).stderr
    js = json.loads(r[r.rindex('{'):r.rindex('}') + 1])
    af = f"loudnorm=I=-14:TP=-1.5:LRA=11:measured_I={js['input_i']}:measured_TP={js['input_tp']}:measured_LRA={js['input_lra']}:measured_thresh={js['input_thresh']}:offset={js['target_offset']}:linear=true"
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', tmp, '-af', af, '-ar', str(SR), '-c:a', 'pcm_s24le', a.out], check=True)
    os.remove(tmp)
    r2 = subprocess.run(['ffmpeg', '-hide_banner', '-i', a.out, '-af', 'loudnorm=I=-14:TP=-1.5:print_format=json', '-f', 'null', '-'], capture_output=True, text=True).stderr
    j2 = json.loads(r2[r2.rindex('{'):r2.rindex('}') + 1])
    print('miks:', a.out, 'süre', round(mix.shape[1] / SR, 2), 's  ölçülen', j2['input_i'], 'LUFS', j2['input_tp'], 'dBTP')

if __name__ == '__main__':
    main()
