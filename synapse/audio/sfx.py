#!/usr/bin/env python3
"""SYNAPSE — prosedürel ses efektleri kütüphanesi. Çıktı: audio/sfx/<id>.flac (48 kHz stereo)
  python3 audio/sfx.py            # hepsi
  python3 audio/sfx.py door_bang_1 crt_on
"""
import sys, os
import numpy as np
from dsp import *

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'sfx')

def amb_rain_muffled():
    d = 30; n = noise(d, 1)
    rain = lp(n, 900) * 0.6 + bp(noise(d, 2), 900, 3000) * 0.08
    # yavaş dalgalanma + tek tük daha yoğun damlacıklar
    mod = 0.8 + 0.2 * np.sin(2 * np.pi * t_(d) / 7.5)
    x = rain * mod
    rng = RNG(3)
    for _ in range(400):
        p = int(rng.uniform(0, d - 0.05) * SR); L = int(0.03 * SR)
        x[p:p + L] += lp(rng.standard_normal(L), 1500) * exp_env(L, 0.006) * rng.uniform(0.05, 0.2)
    s = np.stack([x, np.roll(x, 2400)])
    s = loop_xfade(s)
    return norm(s, -6)

def loop_xfade(s, xf=1.0):
    n = int(xf * SR); a = s[:, :n]; b = s[:, -n:]; w = np.linspace(0, 1, n)
    out = s[:, :-n].copy(); out[:, :n] = a * w + b * (1 - w)
    return out

def drip(seed, pitch=1.0):
    L = int(0.25 * SR); t = np.arange(L) / SR
    f = (1200 + 900 * np.exp(-t * 40)) * pitch
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * exp_env(L, 0.035)
    x += lp(RNG(seed).standard_normal(L), 3000) * exp_env(L, 0.004) * 0.3
    return x

def amb_drips():
    d = 30; x = np.zeros((2, int(d * SR))); rng = RNG(5)
    t = 0.3
    while t < d - 0.5:
        p = int(t * SR); dr = drip(int(t * 100), rng.uniform(0.7, 1.4)) * rng.uniform(0.2, 0.6)
        pan = rng.uniform(-0.8, 0.8); st = stereo(dr, pan)
        x[:, p:p + st.shape[1]] += st[:, :x.shape[1] - p]
        t += rng.uniform(0.35, 1.6)
    x = add_reverb(x, 0.55, 2.2, 0.02, 0.4, 2)[:, :int(d * SR)]
    return norm(loop_xfade(x), -6)

def amb_room_hum():
    d = 30; t = t_(d)
    x = 0.5 * np.sin(2 * np.pi * 50 * t) + 0.25 * np.sin(2 * np.pi * 100 * t) + 0.12 * np.sin(2 * np.pi * 150 * t + 1)
    x *= 0.8 + 0.2 * np.sin(2 * np.pi * 0.13 * t)
    x += lp(noise(d, 7), 300) * 0.4
    return norm(loop_xfade(stereo(x, 0, 0.6)), -12)

def crt_whine():
    d = 30; t = t_(d)
    x = 0.12 * np.sin(2 * np.pi * 15734 * t) + 0.4 * np.sin(2 * np.pi * 60 * t) + 0.2 * np.sin(2 * np.pi * 120 * t)
    x += bp(noise(d, 8), 2000, 6000) * 0.05 * (1 + np.sin(2 * np.pi * 9 * t))
    return norm(loop_xfade(stereo(x)), -10)

def crt_on():
    d = 2.2; t = t_(d); n = len(t)
    thunk = np.sin(2 * np.pi * (70 - 30 * t) * t) * exp_env(n, 0.25) * 0.9
    stat = hp(noise(d, 9), 800) * (np.exp(-t * 3) * 0.6 + 0.08)
    zap = osc_sine(15000 - 9000 * np.exp(-t * 8), d) * exp_env(n, 0.5) * 0.15
    x = thunk + stat + zap
    return norm(add_reverb(stereo(x, 0, 0.5), 0.35, 1.8, 0.01, 0.5, 3), -1)

def static_burst():
    d = 0.6; x = hp(noise(d, 10), 600) * env_adsr(int(d * SR), 0.005, 0.1, 0.5, 0.3)
    return norm(stereo(x, 0, 0.6), -3)

def footsteps(d, seed, rate=1.7, wet=True, heavy=1.0):
    x = np.zeros((2, int(d * SR))); rng = RNG(seed); t = 0.05
    while t < d - 0.3:
        L = int(0.22 * SR); tt = np.arange(L) / SR
        thud = np.sin(2 * np.pi * (90 + rng.uniform(-10, 10)) * tt) * exp_env(L, 0.03) * heavy
        scuff = bp(rng.standard_normal(L), 300, 3000) * exp_env(L, 0.04) * 0.5
        splash = bp(rng.standard_normal(L), 1500, 7000) * exp_env(L, 0.07) * (0.35 if wet else 0)
        s = stereo((thud + scuff + splash) * rng.uniform(0.5, 1.0), rng.uniform(-0.3, 0.3))
        p = int(t * SR); x[:, p:p + L] += s[:, :x.shape[1] - p]
        t += 1 / rate * rng.uniform(0.85, 1.15)
    return x

def footsteps_wet(): return norm(add_reverb(footsteps(10, 11, 1.6, True), 0.4, 1.8, 0.02, 0.4, 4), -4)
def footsteps_fast(): return norm(add_reverb(footsteps(2.0, 12, 3.2, False, 1.2), 0.2, 0.8, 0.01, 0.5, 5), -3)
def footsteps_run(): return norm(add_reverb(footsteps(2.0, 13, 4.2, False, 1.4), 0.2, 0.8, 0.01, 0.5, 5), -3)

def flashlight_click():
    L = int(0.12 * SR); x = hp(noise(0.12, 14), 2000) * exp_env(L, 0.004) + np.sin(2 * np.pi * 3200 * t_(0.12)) * exp_env(L, 0.01) * 0.3
    return norm(stereo(x, 0.2), -6)

def pistol_charge():
    d = 1.6; t = t_(d); f = 300 + 2600 * (t / d) ** 1.5
    x = osc_saw(f, d) * 0.3 + osc_sine(f * 2.01, d) * 0.3
    x = bp(x, 400, 9000) * np.clip(t / d * 1.4, 0, 1)
    x += hp(noise(d, 15), 4000) * 0.15 * (t / d)
    return norm(stereo(x, 0.1, 0.4), -4)

def pistol_spark():
    d = 0.5; rng = RNG(16); x = np.zeros(int(d * SR))
    for _ in range(14):
        p = int(rng.uniform(0, d - 0.03) * SR); L = int(0.02 * SR)
        x[p:p + L] += hp(rng.standard_normal(L), 3000) * exp_env(L, 0.004)
    return norm(stereo(x, 0.1), -6)

def sting_reveal():
    d = 4.5; t = t_(d); n = len(t)
    # ters şişen gürültü + uyumsuz akor vuruşu
    swell = hp(noise(d, 17), 1500) * np.clip(t / 1.6, 0, 1) ** 3 * (t < 1.6)
    hit = np.zeros(n); h0 = int(1.6 * SR)
    for f, a in [(55, 1), (82.4, 0.6), (116.5, 0.5), (155.6, 0.35), (233, 0.25), (311, 0.2)]:
        hit[h0:] += a * np.sin(2 * np.pi * f * t[: n - h0]) * exp_env(n - h0, 1.4)
    hit[h0:] += lp(noise(d - 1.6, 18), 500) * exp_env(n - h0, 0.3) * 0.8
    x = swell * 0.7 + hit * 0.6
    return norm(add_reverb(stereo(x, 0, 0.8), 0.5, 3.0, 0.02, 0.5, 6), -1)

def whoosh_turn():
    d = 0.7; t = t_(d); e = np.sin(np.pi * np.clip(t / d, 0, 1)) ** 2
    x = bp(noise(d, 19), 300, 2500) * e
    return norm(stereo(x, 0, 0.5) * np.stack([np.linspace(1.2, 0.6, len(t)), np.linspace(0.6, 1.2, len(t))]), -3)

def beep_count():
    d = 0.18; t = t_(d); x = np.sin(2 * np.pi * 1760 * t) * env_adsr(len(t), 0.002, 0.02, 0.6, 0.08) * 0.6
    return norm(add_reverb(stereo(x), 0.2, 0.6, 0.0, 0.5, 7), -8)

def countdown_accel():
    d = 6.0; x = np.zeros(int(d * SR)); tt = 0.0; k = 0
    while tt < d - 0.2:
        b = np.sin(2 * np.pi * (1760 + k * 12) * t_(0.07)) * env_adsr(int(0.07 * SR), 0.002, 0.01, 0.6, 0.03)
        p = int(tt * SR); x[p:p + len(b)] += b[: len(x) - p]
        tt += max(0.045, 0.45 * 0.82 ** k); k += 1
    return norm(stereo(x), -6)

def glitch(seed):
    d = 0.5 + 0.3 * (seed % 3); rng = RNG(seed); x = np.zeros(int(d * SR)); p = 0
    while p < len(x):
        L = int(rng.uniform(0.01, 0.06) * SR); kind = rng.integers(0, 3)
        seg = (np.sign(np.sin(2 * np.pi * rng.uniform(80, 2000) * np.arange(L) / SR)) * 0.5 if kind == 0 else rng.standard_normal(L) * 0.4 if kind == 1 else np.zeros(L))
        x[p:p + L] = seg[: len(x) - p]; p += L
    x = np.round(x * 8) / 8
    return norm(stereo(x, 0, 0.7), -4)

def text_reveal_red():
    d = 4.0; t = t_(d); n = len(t)
    x = (np.sin(2 * np.pi * 36.7 * t) + 0.5 * np.sin(2 * np.pi * 73.4 * t + 0.3) + 0.3 * osc_saw(36.9, d)) * np.exp(-t * 0.6)
    x = lp(x, 400) + hp(noise(d, 20), 3000) * 0.05 * np.exp(-t * 2)
    return norm(add_reverb(stereo(x, 0, 0.6), 0.4, 3.0, 0.02, 0.6, 8), -1)

def sting_low():
    d = 3.0; t = t_(d); x = np.sin(2 * np.pi * (42 - 8 * t / d) * t) * np.exp(-t * 1.0) + lp(noise(d, 21), 200) * np.exp(-t * 2) * 0.4
    return norm(add_reverb(stereo(x), 0.4, 2.5, 0.01, 0.6, 9), -2)

def sub_drop():
    d = 2.5; t = t_(d); f = 90 * np.exp(-t * 1.6) + 28
    x = osc_sine(f, d) * np.exp(-t * 1.3)
    return norm(stereo(x), -2)

def heartbeat():
    d = 16; x = np.zeros(int(d * SR)); tt = 0.2
    while tt < d - 0.6:
        for off, a in [(0, 1.0), (0.17, 0.65)]:
            L = int(0.18 * SR); b = np.sin(2 * np.pi * 52 * np.arange(L) / SR) * exp_env(L, 0.05) * a
            p = int((tt + off) * SR); x[p:p + L] += b[: len(x) - p]
        tt += 0.82
    return norm(stereo(lp(x, 200)), -4)

def table_slam():
    d = 2.0; t = t_(d); n = len(t)
    wood = (np.sin(2 * np.pi * 110 * t) * 0.8 + np.sin(2 * np.pi * 240 * t) * 0.4) * exp_env(n, 0.12)
    crack = bp(noise(d, 22), 500, 5000) * exp_env(n, 0.03)
    x = wood + crack
    rng = RNG(23)
    for _ in range(9):  # kutular zıplıyor
        p = int(rng.uniform(0.05, 0.6) * SR); L = int(0.08 * SR)
        x[p:p + L] += (np.sin(2 * np.pi * rng.uniform(1800, 3500) * np.arange(L) / SR) * exp_env(L, 0.02) + hp(rng.standard_normal(L), 3000) * exp_env(L, 0.01)) * rng.uniform(0.1, 0.3)
    return norm(add_reverb(stereo(x, 0, 0.4), 0.3, 1.2, 0.005, 0.5, 10), -1)

def typing_fast():
    d = 3.2; x = np.zeros(int(d * SR)); rng = RNG(24); tt = 0.02
    while tt < d - 0.05:
        L = int(0.03 * SR); k = hp(rng.standard_normal(L), 2500) * exp_env(L, 0.004) * rng.uniform(0.3, 0.8) + np.sin(2 * np.pi * rng.uniform(900, 1400) * np.arange(L) / SR) * exp_env(L, 0.006) * 0.2
        p = int(tt * SR); x[p:p + L] += k[: len(x) - p]; tt += rng.uniform(0.045, 0.11)
    return norm(add_reverb(stereo(x, -0.2, 0.3), 0.15, 0.6, 0.0, 0.5, 11), -6)

def door_bang(seed):
    d = 3.0; t = t_(d); n = len(t); rng = RNG(seed)
    body = sum(a * np.sin(2 * np.pi * f * t + rng.uniform(0, 6)) * exp_env(n, tau) for f, a, tau in [(48, 1.0, 0.5), (96, 0.6, 0.35), (143, 0.5, 0.6), (387, 0.25, 0.9), (612, 0.18, 1.1), (1104, 0.1, 0.8)])
    hitn = lp(rng.standard_normal(n), 1800) * exp_env(n, 0.04) * 1.2
    rattle = bp(rng.standard_normal(n), 2000, 7000) * exp_env(n, 0.25) * 0.15 * (1 + np.sin(2 * np.pi * 31 * t))
    x = body + hitn + rattle
    return norm(add_reverb(stereo(x, 0.5, 0.6), 0.45, 1.6, 0.01, 0.5, seed), -0.5)

def drone_buzz():
    d = 30; t = t_(d)
    f = 118 + 3 * np.sin(2 * np.pi * 0.4 * t)
    x = osc_saw(f, d) * 0.3 + osc_saw(f * 1.5 + 2, d) * 0.15 + osc_saw(f * 2.02, d) * 0.1
    x = bp(x, 150, 3000) * (0.7 + 0.3 * np.sin(2 * np.pi * 0.21 * t))
    x += bp(noise(d, 25), 200, 1200) * 0.1
    return norm(loop_xfade(stereo(lp(x, 1200), 0.4, 0.5)), -8)

def alarm_klaxon():
    d = 8.0; t = t_(d)
    cyc = (t % 1.0) < 0.6
    f = np.where(cyc, 620 + 140 * np.sin(2 * np.pi * 1.6 * t), 0)
    x = np.sign(np.sin(2 * np.pi * np.cumsum(f) / SR)) * 0.4 * cyc
    x = bp(x, 300, 3500)
    x = add_reverb(stereo(x, 0, 0.3), 0.5, 1.8, 0.02, 0.5, 26)[:, :int(d * SR)]
    return norm(loop_xfade(x, 0.3), -6)

def cable_rip():
    d = 1.0; t = t_(d); n = len(t)
    x = bp(noise(d, 27), 400, 6000) * env_adsr(n, 0.005, 0.15, 0.2, 0.3) + np.sin(2 * np.pi * 180 * t) * exp_env(n, 0.05) * 0.7
    x += hp(noise(d, 28), 3000) * exp_env(n, 0.02) * 0.6
    return norm(stereo(x, -0.1, 0.3), -1)

def plug_in():
    d = 2.5; t = t_(d); n = len(t)
    clunk = (np.sin(2 * np.pi * 140 * t) + 0.5 * np.sin(2 * np.pi * 420 * t)) * exp_env(n, 0.06)
    surge = osc_saw(80 + 900 * np.clip((t - 0.05) / 1.5, 0, 1) ** 2, d) * np.clip((t - 0.05) / 0.2, 0, 1) * np.exp(-np.clip(t - 1.6, 0, None) * 4) * 0.5
    zap = hp(noise(d, 29), 2500) * (np.abs(np.sin(2 * np.pi * 23 * t)) ** 6) * np.exp(-t * 1.5) * 0.6
    x = clunk + bp(surge, 100, 6000) + zap
    return norm(add_reverb(stereo(x, 0, 0.5), 0.3, 1.2, 0.0, 0.5, 30), -0.5)

def neural_hum():
    d = 11; t = t_(d)
    f = 55 * (1 + 0.5 * t / d)
    x = osc_saw(f, d) * 0.3 + osc_saw(f * 1.01, d) * 0.3 + osc_sine(f * 4, d) * 0.1 * (t / d)
    k = t / d; x = (lp(x, 400) * (1 - k) + lp(x, 2800) * k) * np.clip(t / 1.0, 0, 1)
    x += hp(noise(d, 31), 5000) * 0.03 * (t / d) * (1 + np.sin(2 * np.pi * 13 * t))
    return norm(stereo(x, 0, 0.7), -6)

def neural_surge():
    d = 5.0; t = t_(d); n = len(t); rng = RNG(32)
    x = np.zeros(n)
    for k in range(9):
        f0 = rng.uniform(200, 1200); x += osc_saw(f0 * (1 + 3 * (t / d) ** 2), d) * 0.08
    x = bp(x, 200, 9000)
    noiseb = hp(noise(d, 34), 1500) * (np.abs(np.sin(2 * np.pi * 7 * t)) ** 3) * 0.5
    sub = osc_sine(40 + 20 * t, d) * 0.8
    x = (x + noiseb + sub) * np.clip(t / 0.3, 0, 1) * np.where(t > 4.5, np.clip((5 - t) / 0.5, 0, 1), 1)
    return norm(add_reverb(stereo(x, 0, 0.8), 0.35, 1.5, 0.0, 0.5, 34), -0.5)

def system_freeze():
    d = 2.5; t = t_(d); n = len(t)
    f = 800 * np.exp(-t * 3) + 30
    x = osc_saw(f, d) * np.exp(-t * 1.5) * 0.6 + lp(noise(d, 35), 400) * np.exp(-t * 4) * 0.5
    x[int(1.2 * SR):] *= np.linspace(1, 0, n - int(1.2 * SR)) ** 4
    return norm(stereo(x, 0, 0.6), -0.5)

def breaker_clunk():
    d = 3.5; t = t_(d); n = len(t)
    clunk = (np.sin(2 * np.pi * 70 * t) + 0.7 * np.sin(2 * np.pi * 210 * t) + 0.3 * np.sin(2 * np.pi * 530 * t)) * exp_env(n, 0.09) + lp(noise(d, 36), 2500) * exp_env(n, 0.03)
    whine = osc_sine(1200 * np.exp(-t * 1.2) + 40, d) * np.exp(-t * 0.8) * 0.25
    hum = osc_sine(60 * np.exp(-t * 0.7), d) * np.exp(-t * 1.0) * 0.5
    x = clunk + whine + hum
    return norm(add_reverb(stereo(x, 0, 0.5), 0.5, 2.0, 0.01, 0.5, 37), -0.5)

def tinnitus_ring():
    d = 4.0; t = t_(d); x = np.sin(2 * np.pi * 6800 * t) * np.exp(-t * 0.7) * np.clip(t / 0.05, 0, 1) * 0.3
    return norm(stereo(x), -12)

def body_fall():
    d = 1.5; t = t_(d); n = len(t)
    x = np.sin(2 * np.pi * 65 * t) * exp_env(n, 0.12) + lp(noise(d, 38), 800) * exp_env(n, 0.06) * 0.7
    x[int(0.25 * SR):] += (np.sin(2 * np.pi * 85 * t[: n - int(0.25 * SR)]) * exp_env(n - int(0.25 * SR), 0.08) * 0.5)
    return norm(add_reverb(stereo(x), 0.3, 1.2, 0.01, 0.5, 39), -1)

def paper_rustle():
    d = 1.8; t = t_(d); rng = RNG(40)
    x = bp(noise(d, 40), 1500, 9000) * (np.abs(np.sin(2 * np.pi * 3.3 * t)) ** 2) * (0.6 + 0.4 * rng.standard_normal(len(t)) * 0.2)
    return norm(stereo(x, 0.1, 0.3), -6)

def final_sting():
    d = 7.0; t = t_(d); n = len(t)
    rev = hp(noise(2.0, 41), 2000) * np.linspace(0, 1, int(2 * SR)) ** 4
    x = np.zeros(n); x[: len(rev)] += rev * 0.6
    h0 = int(2.0 * SR); tt = t[: n - h0]
    for f, a in [(36.7, 1), (55, 0.7), (77.8, 0.5), (110, 0.35), (155.6, 0.3), (207.7, 0.2)]:
        x[h0:] += a * np.sin(2 * np.pi * f * tt) * exp_env(n - h0, 2.2)
    x[h0:] += lp(noise(d - 2.0, 42), 300) * exp_env(n - h0, 0.5)
    return norm(add_reverb(stereo(x, 0, 0.8), 0.55, 4.0, 0.03, 0.5, 42), -0.5)

def title_hit():
    d = 4.0; t = t_(d); n = len(t)
    w = bp(noise(0.6, 43), 300, 6000) * np.linspace(0, 1, int(0.6 * SR)) ** 3
    x = np.zeros(n); x[: len(w)] += w * 0.6
    h0 = int(0.6 * SR); tt = t[: n - h0]
    x[h0:] += (np.sin(2 * np.pi * (60 * np.exp(-tt * 2) + 35) * tt) * exp_env(n - h0, 0.8) + bp(noise(d - 0.6, 44), 1000, 8000) * exp_env(n - h0, 0.15) * 0.5)
    return norm(add_reverb(stereo(x, 0, 0.8), 0.45, 2.5, 0.01, 0.4, 44), -0.5)

def amb_base_tone():
    d = 30; t = t_(d)
    x = 0.3 * np.sin(2 * np.pi * 60 * t) + 0.15 * np.sin(2 * np.pi * 180 * t) + lp(noise(d, 45), 500) * 0.25
    # bilgisayar fanları
    x += bp(noise(d, 46), 600, 2500) * 0.08 * (1 + 0.2 * np.sin(2 * np.pi * 0.5 * t))
    return norm(loop_xfade(stereo(x, 0, 0.7)), -10)

def amb_after():
    d = 30; t = t_(d)
    x = lp(noise(d, 47), 250) * 0.4 + 0.05 * np.sin(2 * np.pi * 50 * t)
    return norm(loop_xfade(stereo(x, 0, 0.8)), -14)

ALL = {
    'amb_rain_muffled': amb_rain_muffled, 'amb_drips': amb_drips, 'amb_room_hum': amb_room_hum, 'crt_whine': crt_whine,
    'crt_on': crt_on, 'static_burst': static_burst, 'footsteps_wet': footsteps_wet, 'footsteps_fast': footsteps_fast, 'footsteps_run': footsteps_run,
    'flashlight_click': flashlight_click, 'pistol_charge': pistol_charge, 'pistol_spark': pistol_spark, 'sting_reveal': sting_reveal,
    'whoosh_turn': whoosh_turn, 'beep_count': beep_count, 'countdown_accel': countdown_accel,
    'glitch_1': lambda: glitch(1), 'glitch_2': lambda: glitch(2), 'glitch_3': lambda: glitch(3),
    'text_reveal_red': text_reveal_red, 'sting_low': sting_low, 'sub_drop': sub_drop, 'heartbeat': heartbeat, 'table_slam': table_slam,
    'typing_fast': typing_fast, 'door_bang_1': lambda: door_bang(61), 'door_bang_2': lambda: door_bang(62), 'door_bang_3': lambda: door_bang(63),
    'drone_buzz': drone_buzz, 'alarm_klaxon': alarm_klaxon, 'cable_rip': cable_rip, 'plug_in': plug_in, 'neural_hum': neural_hum,
    'neural_surge': neural_surge, 'system_freeze': system_freeze, 'breaker_clunk': breaker_clunk, 'tinnitus_ring': tinnitus_ring,
    'body_fall': body_fall, 'paper_rustle': paper_rustle, 'final_sting': final_sting, 'title_hit': title_hit,
    'amb_base_tone': amb_base_tone, 'amb_after': amb_after,
}
LOOPS = {'amb_rain_muffled', 'amb_drips', 'amb_room_hum', 'crt_whine', 'drone_buzz', 'alarm_klaxon', 'amb_base_tone', 'amb_after', 'heartbeat', 'footsteps_wet'}

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    names = sys.argv[1:] or list(ALL)
    for k in names:
        x = ALL[k]()
        write_flac(os.path.join(OUT, k + '.flac'), x)
        print(f'{k:18s} {x.shape[1] / SR:6.2f}s')
