# -*- coding: utf-8 -*-
"""Audio bed: procedurally generated music + UI sound effects (+ optional TTS mix).

No external samples -> nothing to license.  If build/voice/<key>.wav exists
(see tts.py), those clips are placed on the timeline and the music ducks under
them.
"""
import argparse
import math
import os
import subprocess
import sys
import wave

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import render as R
import timeline as TL

SR = 48000
BUILD = os.path.abspath(os.path.join(HERE, "..", "build"))
VOICE_DIR = os.path.join(BUILD, "voice")
OUT = os.path.abspath(os.path.join(HERE, "..", "out"))

BEAT = 0.8  # 75 bpm
BAR = BEAT * 4

# C major / gentle, 4-bar loop: C - G - Am - F
CHORDS = [
    ([130.81, 261.63, 329.63, 392.00], 130.81),   # C
    ([98.00, 246.94, 293.66, 392.00], 98.00),     # G
    ([110.00, 261.63, 329.63, 440.00], 110.00),   # Am
    ([87.31, 261.63, 349.23, 440.00], 87.31),     # F
]
PENTA = [329.63, 392.00, 440.00, 523.25, 587.33, 659.26]


def _t(dur):
    return np.arange(int(dur * SR)) / SR


def _env(n, attack, decay, sr=SR):
    """attack then exponential decay, per-sample."""
    a = int(attack * sr)
    e = np.empty(n, dtype=np.float64)
    a = min(a, n)
    if a > 0:
        e[:a] = np.linspace(0.0, 1.0, a) ** 0.6
    e[a:] = np.exp(-(np.arange(n - a) / sr) / max(decay, 1e-4))
    return e


def tone(freq, dur, amp, attack=0.01, decay=0.4, harm=(1.0, 0.35, 0.12)):
    n = int(dur * SR)
    t = np.arange(n) / SR
    w = np.zeros(n)
    for k, h in enumerate(harm, start=1):
        w += h * np.sin(2 * np.pi * freq * k * t + k * 0.3)
    return amp * w * _env(n, attack, decay)


def pad_chord(freqs, dur, amp=0.045):
    n = int(dur * SR)
    t = np.arange(n) / SR
    w = np.zeros(n)
    for i, f in enumerate(freqs):
        vib = 1.0 + 0.0009 * np.sin(2 * np.pi * (0.18 + 0.05 * i) * t)
        w += np.sin(2 * np.pi * f * vib * t) + 0.25 * np.sin(2 * np.pi * 2 * f * t)
    n_f = n - int(0.9 * SR) if n > int(0.9 * SR) else n
    env = np.ones(n)
    a = int(0.9 * SR)
    if a > 0 and n > a:
        env[:a] = np.linspace(0, 1, a)
        rel = min(int(0.7 * SR), n)
        env[-rel:] *= np.linspace(1, 0, rel)
    return amp / len(freqs) * w * env


def _place(buf, sig, at, gain=1.0):
    i = int(at * SR)
    if i >= len(buf) or i < 0:
        return
    n = min(len(sig), len(buf) - i)
    if n > 0:
        buf[i:i + n] += sig[:n] * gain


def build_music(total, gain=1.0):
    n = int(total * SR) + SR
    mix = np.zeros(n)
    nbars = int(math.ceil(total / BAR)) + 1
    for b in range(nbars):
        t0 = b * BAR
        freqs, root = CHORDS[b % 4]
        _place(mix, pad_chord(freqs, BAR + 0.7), t0)
        _place(mix, tone(root / 2, BAR * 0.95, 0.075, 0.03, 1.1, (1.0, 0.22)), t0)
        # arpeggio: 8 plucks per bar, pentatonic, gentle pattern
        pattern = [0, 2, 1, 3, 2, 4, 3, 1]
        for k, pi in enumerate(pattern):
            f = PENTA[(pi + b) % len(PENTA)]
            at = t0 + k * (BAR / 8) + (0.012 if k % 2 else 0)
            _place(mix, tone(f, 0.9, 0.055, 0.004, 0.34), at)
        # shaker on the off beats
        for k in range(4):
            at = t0 + k * BEAT + BEAT / 2
            ns = int(0.05 * SR)
            noise = np.random.default_rng(b * 10 + k).normal(0, 1, ns)
            noise = np.diff(noise, prepend=0.0)
            noise *= np.exp(-np.arange(ns) / SR / 0.012)
            _place(mix, noise * 0.020, at)
    mix = mix[:int(total * SR)]
    # gentle overall fades
    fi = int(1.6 * SR)
    fo = int(3.0 * SR)
    mix[:fi] *= np.linspace(0, 1, fi)
    mix[-fo:] *= np.linspace(1, 0, fo)
    return mix * gain


def sfx_pop():
    d = 0.16
    n = int(d * SR)
    t = np.arange(n) / SR
    f = 300 + 420 * (t / d) ** 0.6
    s = np.sin(2 * np.pi * np.cumsum(f) / SR)
    s *= np.exp(-t / 0.045)
    s += 0.25 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t / 0.03)
    return s * 0.11


def sfx_ding():
    d = 1.4
    n = int(d * SR)
    t = np.arange(n) / SR
    s = (np.sin(2 * np.pi * 1046.5 * t) * np.exp(-t / 0.42)
         + 0.45 * np.sin(2 * np.pi * 1568.0 * t) * np.exp(-t / 0.30)
         + 0.2 * np.sin(2 * np.pi * 2093.0 * t) * np.exp(-t / 0.18))
    a = int(0.004 * SR)
    s[:a] *= np.linspace(0, 1, a)
    return s * 0.085


def _stereo(x):
    return np.stack([x, x], axis=1)


def read_wav(path):
    with wave.open(path, "rb") as w:
        ch = w.getnchannels()
        sw = w.getsampwidth()
        fr = w.getframerate()
        n = w.getnframes()
        raw = w.readframes(n)
    if sw != 2:
        raise ValueError(f"expect 16-bit wav: {path}")
    a = np.frombuffer(raw, dtype=np.int16).astype(np.float64) / 32768.0
    if ch > 1:
        a = a.reshape(-1, ch).mean(axis=1)
    if fr != SR:
        idx = np.linspace(0, len(a) - 1, int(len(a) * SR / fr))
        a = np.interp(idx, np.arange(len(a)), a)
    return a


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--wav", default=os.path.join(OUT, "ep01_audio.wav"))
    ap.add_argument("--mux", default=None, help="silent video to mux with the audio")
    ap.add_argument("--final", default=os.path.join(OUT, "ep01_qing.mp4"))
    ap.add_argument("--music-gain", type=float, default=1.0)
    args = ap.parse_args()

    tl = R.get_timeline()
    total = tl["total"]
    os.makedirs(OUT, exist_ok=True)

    voice_files = {}
    if os.path.isdir(VOICE_DIR):
        for fn in os.listdir(VOICE_DIR):
            if fn.endswith(".wav"):
                voice_files[fn[:-4]] = os.path.join(VOICE_DIR, fn)
    has_voice = bool(voice_files)
    print(f"voice clips: {len(voice_files)}")

    music = build_music(total, gain=args.music_gain * (0.62 if has_voice else 1.0))

    # narration, with a ducking envelope for the music
    duck = np.ones(len(music))
    if has_voice:
        voice = np.zeros(len(music))
        placed = 0
        for at, key in tl["audio_events"]:
            p = voice_files.get(key.replace(":", "__"))
            if not p:
                continue
            s = read_wav(p)
            _place(voice, s, at, gain=0.95)
            i = int(at * SR)
            j = min(len(duck), i + len(s) + int(0.25 * SR))
            duck[i:j] = np.minimum(duck[i:j], 0.42)
            placed += 1
        # smooth the duck envelope
        k = int(0.25 * SR)
        kern = np.hanning(k)
        kern /= kern.sum()
        duck = np.convolve(duck, kern, mode="same")
        print(f"placed {placed}/{len(tl['audio_events'])} voice clips")
    else:
        voice = np.zeros(len(music))

    mix = music * duck + voice

    # sound effects
    pop = sfx_pop()
    ding = sfx_ding()
    for at in tl["pop_events"]:
        _place(mix, pop, at)
    for sc in tl["scenes"]:
        if sc["kind"] in ("pattern",):
            _place(mix, ding, sc["start"] + 0.15)
        if sc["kind"] == "quiz":
            for bi in (2, 5):
                if bi < len(sc["wins"]):
                    _place(mix, ding, sc["start"] + sc["wins"][bi][0] + 0.05)

    # normalise: aim for a sane music bed level (~-18 LUFS) with a peak ceiling
    peak = float(np.max(np.abs(mix))) or 1.0
    rms = float(np.sqrt(np.mean(mix ** 2))) or 1e-6
    target_rms = 0.115 if has_voice else 0.095
    g = min(target_rms / rms, 0.72 / peak)
    mix = mix * g
    peak = float(np.max(np.abs(mix)))
    pcm = np.clip(mix, -1.0, 1.0)
    pcm16 = (_stereo(pcm) * 32767.0).astype("<i2")

    with wave.open(args.wav, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm16.tobytes())
    print(f"wrote {args.wav} {total:.2f}s  gain {g:.2f}x  peak {peak:.3f}  rms {rms:.4f}")

    if args.mux:
        cmd = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
               "-i", args.mux, "-i", args.wav,
               "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
               "-af", "afade=t=out:st=%.2f:d=1.6" % max(0.0, total - 1.7),
               "-shortest", "-movflags", "+faststart", args.final]
        r = subprocess.run(cmd, capture_output=True, text=True)
        print("mux rc=", r.returncode, r.stderr.strip()[:800])
        print("->", args.final)


if __name__ == "__main__":
    main()
