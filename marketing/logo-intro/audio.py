#!/usr/bin/env python3
"""Synthesizes the 5 s instrumental bed, locked to the timeline in scene.html.

usage: audio.py <out.wav>
"""
import sys
import wave

import numpy as np

SR = 48000
DUR = 5.0
N = int(SR * DUR)
STEP = 0.125  # 16th note at 120 BPM
rng = np.random.default_rng(28)

# Scene markers (keep in step with T in scene.html).
LAUNCH, GRAPH_IN, CHIME = 1.75, 2.25, 4.0

C4, D4, E4, F4, G4, A4, B4 = 261.63, 293.66, 329.63, 349.23, 392.0, 440.0, 493.88
CHORDS = [  # (from, root, tones)
    (0.0, 65.41, [C4, E4, G4, B4]),         # Cmaj7
    (1.25, 87.31, [F4, A4, 2 * C4, 2 * E4]),  # Fmaj7
    (2.25, 98.0, [G4, B4, 2 * D4, 2 * G4]),   # G
    (3.0, 110.0, [A4, 2 * C4, 2 * E4, 2 * G4]),  # Am7
    (3.5, 98.0, [G4, 2 * C4, 2 * D4, 2 * G4]),   # Gsus
    (4.0, 65.41, [C4, E4, G4, 2 * D4]),     # Cadd9
]


def chord_at(t):
    return [c for c in CHORDS if c[0] <= t + 1e-6][-1]


def add(bus, start, sig, pan=0.0, gain=1.0):
    """Mixes a mono signal into a stereo bus at an equal-power pan position (-1..1)."""
    i = int(start * SR)
    if i >= N:
        return
    sig = sig[: N - i]
    angle = (pan + 1) * np.pi / 4
    bus[0, i : i + len(sig)] += sig * np.cos(angle) * gain
    bus[1, i : i + len(sig)] += sig * np.sin(angle) * gain


def tone(freq, dur, bright, detune=0.0):
    """Band-limited saw: `bright` sets the harmonic roll-off, which behaves like a filter cutoff."""
    t = np.arange(int(dur * SR)) / SR
    out = np.zeros_like(t)
    for k in range(1, 28):
        f = freq * k
        if f > SR * 0.42:
            break
        amp = (1 / k) * np.exp(-(k - 1) / bright)
        out += amp * np.sin(2 * np.pi * f * (1 + detune) * t + k * 0.7)
    return out


def adsr(n, a, d):
    t = np.arange(n) / SR
    return np.minimum(t / a, 1.0) * np.exp(-t / d)


def svf_bandpass(x, cutoff, q=1.2):
    """State-variable band-pass with a per-sample cutoff."""
    low = band = 0.0
    out = np.zeros_like(x)
    g = 2 * np.sin(np.pi * np.minimum(cutoff, SR * 0.2) / SR)
    for i in range(len(x)):
        low += g[i] * band
        high = x[i] - low - band / q
        band += g[i] * high
        out[i] = band
    return out


def reverb(bus, length, tone_decay):
    """Convolution with decaying noise, decorrelated per channel."""
    n_ir = int(length * SR)
    t = np.arange(n_ir) / SR
    out = np.zeros_like(bus)
    for ch in range(2):
        ir = rng.standard_normal(n_ir) * np.exp(-t / (length / 5))
        # Darken the tail: repeated smoothing, progressively over time.
        spec = np.fft.rfft(ir)
        spec *= np.exp(-np.linspace(0, tone_decay, len(spec)))
        ir = np.fft.irfft(spec, n_ir)
        ir /= np.sqrt(np.sum(ir ** 2))
        size = N + n_ir
        wet = np.fft.irfft(np.fft.rfft(bus[ch], size) * np.fft.rfft(ir, size), size)
        out[ch] = wet[:N]
    return out


# Sidechain-style pump on every quarter note, gives the pulse its lift.
time = np.arange(N) / SR
beat_phase = (time % 0.5) / 0.5
pump = 0.62 + 0.38 * np.minimum(beat_phase / 0.42, 1.0) ** 1.4

pad = np.zeros((2, N))
arp = np.zeros((2, N))
bass = np.zeros((2, N))
drums = np.zeros((2, N))
fx = np.zeros((2, N))
chime = np.zeros((2, N))

# --- Pad: warm sustained chords ---
for i, (start, _, tones) in enumerate(CHORDS):
    end = CHORDS[i + 1][0] if i + 1 < len(CHORDS) else DUR
    dur = end - start + 0.12
    n = int(dur * SR)
    t = np.arange(n) / SR
    env = np.minimum(t / 0.05, 1.0) * np.minimum((dur - t) / 0.1, 1.0)
    for j, f in enumerate(tones):
        bright = 2.2 + 1.8 * (start / DUR)
        add(pad, start, tone(f, dur, bright, 0.0016) * env, pan=-0.45)
        add(pad, start, tone(f, dur, bright, -0.0016) * env, pan=0.45)

# --- Arp: the bright synth pulse, opening up as the film builds ---
ORDER = [0, 2, 1, 3, 2, 1, 3, 0]
for step in range(int(DUR / STEP)):
    t0 = step * STEP
    if t0 >= CHIME:  # resolves into the chime
        break
    _, _, tones = chord_at(t0)
    f = tones[ORDER[step % len(ORDER)]] * (2 if t0 >= GRAPH_IN else 1)
    bright = 2.6 + 6.0 * np.clip(t0 / LAUNCH, 0, 1) ** 1.5 + (3 if t0 >= GRAPH_IN else 0)
    sig = tone(f, 0.26, bright) * adsr(int(0.26 * SR), 0.003, 0.075)
    add(arp, t0, sig, pan=0.42 * (-1 if step % 2 else 1), gain=0.5 + 0.5 * np.clip(t0 / 1.25, 0, 1))

# --- Bass: enters at the settle, drops out for the separation ---
for step in range(int(DUR / (2 * STEP))):
    t0 = step * 2 * STEP
    if t0 < 1.25 or LAUNCH <= t0 < GRAPH_IN or t0 >= CHIME:
        continue
    _, root, _ = chord_at(t0)
    dur = 0.24
    tt = np.arange(int(dur * SR)) / SR
    sig = (np.sin(2 * np.pi * root * tt) + 0.28 * np.sin(4 * np.pi * root * tt)) * adsr(len(tt), 0.004, 0.16)
    add(bass, t0, sig)

# --- Light electronic percussion ---
def kick():
    tt = np.arange(int(0.22 * SR)) / SR
    phase = 2 * np.pi * (46 * tt + (70 / 26) * (1 - np.exp(-26 * tt)))
    return np.sin(phase) * np.exp(-tt / 0.075)


def hat(decay=0.022):
    n = int(0.09 * SR)
    noise = np.diff(np.diff(rng.standard_normal(n + 2)))
    return noise * adsr(n, 0.0008, decay)


def clap():
    n = int(0.16 * SR)
    noise = np.diff(rng.standard_normal(n + 1))
    return noise * adsr(n, 0.002, 0.045)


for step in range(int(DUR / STEP)):
    t0 = step * STEP
    if t0 >= CHIME:
        break
    in_gap = LAUNCH <= t0 < GRAPH_IN
    if step % 4 == 0 and not in_gap and t0 >= 0.5:
        add(drums, t0, kick(), gain=0.72)
    if step % 2 == 1 and not in_gap:
        add(drums, t0, hat(), pan=0.18, gain=0.085)
    elif t0 >= 1.25 and not in_gap:
        add(drums, t0, hat(0.012), pan=-0.18, gain=0.05)
    if step % 8 == 4 and t0 >= 1.0 and not in_gap:
        add(drums, t0, clap(), gain=0.09)

# --- Whoosh: two noise layers parting left and right with the cart and lines ---
w_start, w_end = LAUNCH - 0.22, GRAPH_IN + 0.08
n = int((w_end - w_start) * SR)
p = np.linspace(0, 1, n)
peak = (LAUNCH + 0.3 - w_start) / (w_end - w_start)
swell = np.where(p < peak, (p / peak) ** 2.6, ((1 - p) / (1 - peak)) ** 1.6)
for side in (-1, 1):
    noise = rng.standard_normal(n)
    cutoff = 350 + 5200 * np.where(p < peak, (p / peak) ** 1.8, 1 - 0.55 * (p - peak) / (1 - peak))
    sig = svf_bandpass(noise, cutoff) * swell
    # Pan each layer outward as it travels.
    pan = side * np.clip((p - peak * 0.6) / (1 - peak * 0.6), 0, 1) ** 0.8
    angle = (pan + 1) * np.pi / 4
    i = int(w_start * SR)
    fx[0, i : i + n] += sig * np.cos(angle) * 0.2
    fx[1, i : i + n] += sig * np.sin(angle) * 0.2

# --- Soft transition: the point blooming into the graph ---
tt = np.arange(int(0.75 * SR)) / SR
glide = 380 + 1080 * (1 - np.exp(-tt / 0.2))
sig = np.sin(2 * np.pi * np.cumsum(glide) / SR) * np.minimum(tt / 0.035, 1) * np.exp(-tt / 0.22)
add(fx, 2.2, sig, gain=0.13)
tt = np.arange(int(0.42 * SR)) / SR
thump = np.sin(2 * np.pi * (42 * tt + (48 / 16) * (1 - np.exp(-16 * tt)))) * np.exp(-tt / 0.13)
add(fx, GRAPH_IN + 0.09, thump, gain=0.42)

# --- Chime: polished bell partials, staggered as the logo lands ---
BELL = [(1.0, 1.0, 0.95), (2.0, 0.42, 0.62), (2.756, 0.2, 0.4), (4.07, 0.12, 0.26), (5.42, 0.05, 0.16)]
for k, (f, offset, pan) in enumerate([(1046.5, 0.0, -0.22), (1318.5, 0.05, 0.2), (1568.0, 0.1, -0.1), (2093.0, 0.15, 0.14)]):
    dur = DUR - CHIME - offset
    tt = np.arange(int(dur * SR)) / SR
    sig = np.zeros_like(tt)
    for ratio, amp, decay in BELL:
        sig += amp * np.sin(2 * np.pi * f * ratio * tt) * np.exp(-tt / decay)
    sig *= np.minimum(tt / 0.0015, 1)
    add(chime, CHIME + offset, sig, pan=pan, gain=0.17 * (1 - 0.13 * k))

# --- Mix ---
duck = np.where(time < CHIME, pump, 1.0)
# The pad swells under the whole film and sits down once the logo has landed.
pad_level = (0.018 + 0.012 * np.clip(time / LAUNCH, 0, 1)) * np.where(time < CHIME, 1.0, 1.25)
music = pad * pad_level * duck + arp * 0.1 * duck + bass * 0.24
send = music * 0.55 + chime * 0.9 + fx * 0.35 + drums * 0.08
wet = reverb(send, 1.3, 7.0)
mix = music + drums * 0.62 + fx + chime + wet * 0.34

# Fade only the tail so the chime rings through the hold and ends without a click.
fade = np.clip((DUR - time) / 0.42, 0, 1) ** 1.4
mix = mix * fade
mix[:, :48] *= np.linspace(0, 1, 48)

mix = np.tanh(mix * 1.15)
mix *= 10 ** (-1.5 / 20) / np.max(np.abs(mix))

pcm = (mix.T * 32767).astype(np.int16)
with wave.open(sys.argv[1], 'wb') as f:
    f.setnchannels(2)
    f.setsampwidth(2)
    f.setframerate(SR)
    f.writeframes(pcm.tobytes())

# Level report by scene, so balance can be checked without ears.
for name, a, b in [('cart', 0, 1.25), ('settle', 1.25, 1.75), ('split', 1.75, 2.25), ('graph', 2.25, 3.42), ('logo', 3.42, 4.0), ('chime', 4.0, 4.6), ('hold', 4.6, 5.0)]:
    s = mix[:, int(a * SR) : int(b * SR)]
    print(f'{name:7s} rms {20 * np.log10(np.sqrt(np.mean(s ** 2)) + 1e-9):6.1f} dBFS   peak {20 * np.log10(np.max(np.abs(s)) + 1e-9):6.1f} dBFS   L/R {20 * np.log10(np.sqrt(np.mean(s[0] ** 2) / np.mean(s[1] ** 2))):+.1f} dB')
