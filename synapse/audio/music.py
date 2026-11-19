#!/usr/bin/env python3
"""SYNAPSE — özgün müzik (prosedürel sentez). Dizinin 4 notalık motifi: Re–Fa–Mi–La.
Çıktı: audio/music/<id>.flac (48 kHz stereo)
"""
import os, sys
import numpy as np
from dsp import *

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'music')
MOTIF = [62, 65, 64, 57]  # D4 F4 E4 A3

def place(buf, x, at):
    if x.ndim == 1: x = np.stack([x, x])
    p = int(at * SR); n = min(x.shape[1], buf.shape[1] - p)
    if n > 0 and p >= 0: buf[:, p:p + n] += x[:, :n]

def pad(notes, dur, cutoff=1200, atk=1.5, rel=2.0, seed=0, bright=0.0, det=0.006):
    n = int(dur * SR); x = np.zeros(n); rng = RNG(seed)
    for m in notes:
        f = midi(m)
        for k in (-1, 0, 1):
            x += osc_saw(f * (1 + det * k), dur, rng.uniform()) * 0.18
        x += osc_sine(f / 2, dur) * 0.15
    x = lp(x, cutoff) * (1 - bright) + lp(x, cutoff * 3) * bright
    x *= env_adsr(n, atk, 0.5, 0.85, rel)
    return stereo(x, 0, 0.9, seed)

def piano(m, dur=3.0, vel=0.8, seed=0):
    f = midi(m); n = int(dur * SR); t = np.arange(n) / SR; x = np.zeros(n)
    for k in range(1, 9):
        fk = f * k * np.sqrt(1 + 0.0004 * k * k)
        x += np.sin(2 * np.pi * fk * t + k) * (1 / k ** 1.3) * np.exp(-t * (0.9 + 0.55 * k) * (1 + (m - 60) / 60))
    x += lp(RNG(seed).standard_normal(n), 3000) * np.exp(-t * 60) * 0.08
    x *= vel * np.clip(t / 0.004, 0, 1)
    return stereo(x * 0.5, (m - 62) / 30, 0.3)

def pluck(m, dur=0.5, vel=0.7, cutoff=2500, seed=0):
    f = midi(m); n = int(dur * SR); t = np.arange(n) / SR
    x = (osc_saw(f, dur) * 0.6 + osc_saw(f * 1.005, dur) * 0.4) * np.exp(-t * 7)
    x = lp(x, cutoff) * vel * np.clip(t / 0.003, 0, 1)
    return stereo(x * 0.6, 0, 0.4, seed)

def bass(m, dur=0.4, vel=0.8, cutoff=500):
    f = midi(m); n = int(dur * SR); t = np.arange(n) / SR
    x = (osc_saw(f, dur) * 0.5 + osc_sine(f, dur) * 0.7) * env_adsr(n, 0.005, 0.1, 0.6, 0.08)
    return stereo(lp(x, cutoff) * vel)

def kick(vel=1.0):
    d = 0.5; t = t_(d); f = 45 + 110 * np.exp(-t * 30)
    x = osc_sine(f, d) * np.exp(-t * 7) + lp(noise(d, 5), 2000) * np.exp(-t * 80) * 0.3
    return stereo(x * vel)

def tom(m=45, vel=0.8):
    d = 0.6; t = t_(d); f = midi(m) * (1 + 0.6 * np.exp(-t * 18))
    x = osc_sine(f, d) * np.exp(-t * 6) + lp(noise(d, 6), 1200) * np.exp(-t * 40) * 0.2
    return stereo(x * vel, 0.2)

def hat(vel=0.3, seed=0, open_=False):
    d = 0.25 if open_ else 0.06; x = hp(noise(d, seed), 7000) * np.exp(-t_(d) * (12 if open_ else 70))
    return stereo(x * vel, 0.3)

def snare(vel=0.6, seed=0):
    d = 0.35; t = t_(d); x = bp(noise(d, seed), 1500, 7000) * np.exp(-t * 14) + osc_sine(190, d) * np.exp(-t * 20) * 0.5
    return stereo(x * vel, -0.1)

def riser(dur, seed=0):
    t = t_(dur); k = t / dur
    x = (lp(noise(dur, seed), 300) * (1 - k) + hp(noise(dur, seed + 1), 2000) * k) * k ** 2
    x += osc_saw(110 * 2 ** (3 * k), dur) * 0.15 * k ** 3
    return stereo(x, 0, 0.8)

def drone(m, dur, seed=0):
    f = midi(m); t = t_(dur)
    x = osc_sine(f, dur) * 0.6 + osc_saw(f * 1.002, dur) * 0.15 + osc_saw(f * 2.003, dur) * 0.08
    x = lp(x, 400) * (0.8 + 0.2 * np.sin(2 * np.pi * 0.07 * t + seed))
    return stereo(x, 0, 0.6, seed)

def finish(buf, wet=0.35, t60=3.0, peak=-1.0, fi=0.5, fo=1.5):
    out = add_reverb(buf, wet, t60, 0.02, 0.5, 9)[:, :buf.shape[1]]
    return norm(fade(out, fi, fo), peak)

# ---------------- parçalar ----------------
def mus_s1_dark(D=53.0):
    b = np.zeros((2, int(D * SR)))
    place(b, drone(26, D, 1) * 0.9, 0)  # D1
    chords = [[50, 57, 62], [46, 53, 58], [43, 50, 55], [45, 52, 57]]  # Dm Bb Gm A
    for i, t0 in enumerate(np.arange(0, D, 8.0)):
        place(b, pad(chords[i % 4], 9.5, cutoff=500 + 40 * i, atk=3, rel=3, seed=i) * 0.55, t0)
    # CRT açıldıktan sonra uzak darbe (16.5 s'den itibaren)
    for t0 in np.arange(17.0, 49.0, 1.6): place(b, tom(38, 0.55), t0)
    # yansıma anı: yükselen gerilim (33–37) ve kırmızı mesaj (42–49)
    place(b, riser(4.0, 3) * 0.4, 33.4)
    place(b, pad([62, 63, 68], 12, cutoff=2500, atk=4, rel=2, seed=8, bright=0.4) * 0.35, 40)
    for k, m in enumerate(MOTIF): place(b, piano(m + 12, 3.0, 0.35, k), 24.5 + k * 0.9)  # uzak motif
    return finish(b, 0.45, 4.0, -2, 1.5, 1.2)

def mus_title(D=5.0):
    b = np.zeros((2, int(D * SR)))
    place(b, kick(1.2), 0.35); place(b, pad([38, 50, 57, 62, 65], 4.6, cutoff=3500, atk=0.02, rel=2.5, seed=3, bright=0.6) * 0.7, 0.35)
    for k, m in enumerate(MOTIF): place(b, pluck(m + 12, 1.2, 0.8, 5000, k), 1.0 + k * 0.42)
    return finish(b, 0.5, 3.0, -1, 0.01, 1.2)

def mus_s2_tension(D=56.0):
    b = np.zeros((2, int(D * SR))); bpm = 92; e = 60 / bpm / 2
    dip = 35.8
    place(b, drone(38, D, 2) * 0.5, 0)
    seq = [38, 38, 50, 38, 38, 45, 38, 41]
    t0 = 0.0; i = 0
    while t0 < dip - 0.2:
        build = min(1, t0 / 30)
        place(b, bass(seq[i % 8], e * 0.9, 0.5 + 0.4 * build, 400 + 900 * build), t0)
        if i % 4 == 2 and t0 > 8: place(b, hat(0.15 + 0.15 * build, i), t0)
        if i % 8 == 0 and t0 > 16: place(b, tom(40, 0.5 * build + 0.2), t0)
        t0 += e; i += 1
    chords = [[50, 53, 57], [46, 50, 53], [48, 52, 55], [45, 49, 52]]
    for k, tt in enumerate(np.arange(0, dip, 8.7)): place(b, pad(chords[k % 4], 9.5, cutoff=900 + 120 * k, atk=2, rel=2, seed=k) * 0.4, tt)
    # anıların silineceği an: yalnız piyano + yumuşak pad
    place(b, pad([50, 53, 57, 62], 17, cutoff=700, atk=3, rel=4, seed=20) * 0.45, dip)
    for k, m in enumerate(MOTIF + [62, 60, 58, 57]): place(b, piano(m, 4.0, 0.55, k), dip + 0.8 + k * 1.9)
    b[:, int(53.0 * SR):] *= np.linspace(1, 0, b.shape[1] - int(53.0 * SR))
    return finish(b, 0.35, 3.0, -2, 0.4, 0.8)

def mus_s3_climax(D=45.8):
    b = np.zeros((2, int(D * SR))); bpm = 128; q = 60 / bpm; s16 = q / 4
    plug = 21.5; freeze = 43.6
    place(b, drone(26, D, 3) * 0.6, 0)
    t0 = 0.0; i = 0; seq = [38, 38, 41, 38, 43, 38, 41, 45]
    while t0 < freeze:
        inten = 0.5 + 0.5 * min(1, t0 / plug) + (0.3 if t0 > plug else 0)
        if i % 4 == 0: place(b, kick(0.9 * min(1.2, inten)), t0)
        if i % 8 == 4 and t0 > 4: place(b, snare(0.45 * inten, i), t0)
        place(b, hat(0.08 + 0.1 * inten, i, open_=(i % 8 == 6)), t0)
        if i % 2 == 0: place(b, bass(seq[(i // 2) % 8], s16 * 1.8, 0.55 * inten, 500 + 800 * min(1, t0 / D)), t0)
        if i % 16 == 0 and t0 > plug: place(b, tom(43, 0.7), t0 + s16 * 6)
        t0 += s16; i += 1
    chords = [[50, 53, 57], [48, 51, 55], [46, 50, 53], [45, 49, 52]]
    for k, tt in enumerate(np.arange(0, freeze, 5.6)): place(b, pad([c + 12 for c in chords[k % 4]], 6.2, cutoff=1200 + 200 * k, atk=0.3, rel=1.0, seed=k, bright=0.3) * 0.32, tt)
    place(b, riser(plug - 15, 4) * 0.5, 15)
    place(b, kick(1.4), plug); place(b, pad([38, 50, 57, 62, 69], 5, cutoff=4000, atk=0.01, rel=3, seed=30, bright=0.7) * 0.6, plug)
    for k, m in enumerate(MOTIF): place(b, pluck(m + 12, 0.6, 0.6, 6000, k), plug + 8 + k * 0.47)
    place(b, riser(freeze - 36, 5) * 0.6, 36)
    # donma: her şey kesilir
    cut = int(freeze * SR); b[:, cut:] *= np.linspace(1, 0, b.shape[1] - cut) ** 6
    out = add_reverb(b, 0.25, 2.0, 0.01, 0.5, 7)[:, :b.shape[1]]
    out[:, cut + int(0.25 * SR):] = 0
    return norm(fade(out, 0.3, 0.05), -1.5)

def mus_s4_relief(D=14.0):
    b = np.zeros((2, int(D * SR)))
    place(b, pad([50, 57, 62, 65], D, cutoff=900, atk=2.5, rel=4, seed=40) * 0.4, 0)
    notes = [62, 65, 64, 57, 62, 65, 69, 67]
    for k, m in enumerate(notes): place(b, piano(m, 4.0, 0.5, k), 0.6 + k * 1.45)
    return finish(b, 0.45, 3.5, -3, 1.5, 2.5)

def mus_s4_ominous(D=16.5):
    b = np.zeros((2, int(D * SR)))
    place(b, drone(25, D, 4) * 0.9, 0)  # C#1 — rahatsız edici yarım ton
    place(b, pad([75, 76, 81], D, cutoff=3000, atk=4, rel=3, seed=50, bright=0.5) * 0.18, 1.0)
    for k, m in enumerate(reversed(MOTIF)): place(b, piano(m - 12, 5.0, 0.45, k), 2.0 + k * 2.4)
    for t0 in np.arange(1.0, D - 2, 2.2): place(b, tom(33, 0.35), t0)
    return finish(b, 0.5, 5.0, -2, 1.0, 2.5)

def mus_end(D=4.5):
    b = np.zeros((2, int(D * SR)))
    for k, m in enumerate(MOTIF): place(b, piano(m + 24, 3.0, 0.4, k), 0.4 + k * 0.6)
    place(b, drone(38, D, 5) * 0.5, 0)
    return finish(b, 0.55, 4.0, -3, 0.5, 1.2)

ALL = {'mus_s1_dark': mus_s1_dark, 'mus_title': mus_title, 'mus_s2_tension': mus_s2_tension, 'mus_s3_climax': mus_s3_climax,
       'mus_s4_relief': mus_s4_relief, 'mus_s4_ominous': mus_s4_ominous, 'mus_end': mus_end}

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for k in (sys.argv[1:] or list(ALL)):
        x = ALL[k](); write_flac(os.path.join(OUT, k + '.flac'), x); print(f'{k:16s} {x.shape[1] / SR:6.2f}s')
