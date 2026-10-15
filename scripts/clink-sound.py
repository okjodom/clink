#!/usr/bin/env python3
"""The Clink sound: two quick glassy strikes, low then high, ~0.7 s.

Each strike is a few inharmonic partials (struck glass, not a pure beep)
with a fast exponential decay and a 2 ms attack so it never clicks.
Writes assets/sounds/clink.wav (44.1 kHz, mono, 16-bit).

    python3 scripts/clink-sound.py
"""
import math
import struct
import wave
from pathlib import Path

RATE = 44100
LENGTH = 0.72
# (start s, fundamental Hz, gain)
STRIKES = [(0.0, 1568.0, 0.55), (0.11, 2349.0, 0.75)]  # G6, then D7: a rising fifth
# (ratio to fundamental, relative gain, decay per second)
PARTIALS = [(1.0, 1.0, 9.0), (2.32, 0.42, 14.0), (4.25, 0.22, 22.0), (6.63, 0.10, 30.0)]

out = Path(__file__).resolve().parent.parent / "assets/sounds/clink.wav"
n = int(RATE * LENGTH)
samples = [0.0] * n
for start, f0, gain in STRIKES:
    s0 = int(start * RATE)
    for i in range(n - s0):
        t = i / RATE
        attack = min(1.0, t / 0.002)
        v = sum(g * math.exp(-d * t) * math.sin(2 * math.pi * f0 * r * t) for r, g, d in PARTIALS)
        samples[s0 + i] += gain * attack * v

peak = max(abs(x) for x in samples)
fade = int(0.03 * RATE)
with wave.open(str(out), "wb") as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(RATE)
    frames = bytearray()
    for i, x in enumerate(samples):
        tail = min(1.0, (n - i) / fade)
        frames += struct.pack("<h", int(x / peak * 0.8 * tail * 32767))
    w.writeframes(bytes(frames))
print(f"  {out.relative_to(out.parents[2])}")
