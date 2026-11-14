"""AlgoTank's background music, track A (soft mallets), synthesised with numpy (docs/specs/revamp/80-background-music.md).

Run (Python 3.12 with numpy and soundfile, ffmpeg on PATH or at /opt/homebrew/bin/ffmpeg):
    python -I tools/music/render.py <repo root>

Why it is built this way:
- Seamless loop. Every note is added modulo the loop length, and the filters and the reverb are FFT
  multiplications over exactly one loop, so every tail wraps into the start by construction.
- Encoder delay. The MP3 holds the last PAD seconds of the loop, the loop, and its first PAD seconds.
  The player loops from PAD to PAD + length; a decoder that shifts the audio by a few milliseconds
  shifts both loop points equally, so the seam stays inside periodic audio.
- Level. The track is normalised to TARGET_LUFS, so the gain constant in the web player
  (sound/musicTracks.ts) gives about -30 LUFS.
- Keys agree with the game's effect sounds, which sit in C major (A5, E5, E6, and a C-E-G-C win tune).

Checks without ears, printed and written to tools/music/measurements.json, all on the decoded MP3:
integrated loudness, true peak, the share of energy above 6 kHz, and the loop seam.
"""

import json
import re
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

import numpy as np
import soundfile as sf

SR = 44100
PAD = 0.5
TARGET_LUFS = -20.0
TRUE_PEAK_LIMIT = -3.0
BITRATE = "96k"
FFMPEG = shutil.which("ffmpeg") or "/opt/homebrew/bin/ffmpeg"

NOTE_INDEX = {"C": 0, "C#": 1, "Db": 1, "D": 2, "Eb": 3, "E": 4, "F": 5, "F#": 6, "Gb": 6, "G": 7, "Ab": 8, "A": 9, "Bb": 10, "B": 11}
NOTE_NAME = re.compile(r"^([A-G][#b]?)(\d)$")


def hz(note: str) -> float:
    match = NOTE_NAME.match(note)
    if match is None:
        raise ValueError(f"not a note: {note}")
    return 440.0 * 2 ** ((NOTE_INDEX[match.group(1)] + 12 * (int(match.group(2)) + 1) - 69) / 12)


# --- The loop buffer -------------------------------------------------------------------------


class Loop:
    """A stereo buffer of exactly one loop. Everything added past the end wraps into the start."""

    def __init__(self, bpm: int, bars: int) -> None:
        samples_per_beat = SR * 60 / bpm
        if samples_per_beat != int(samples_per_beat):
            raise ValueError(f"{bpm} BPM gives a fractional beat at {SR} Hz; the loop would not be a whole number of samples")
        self.beat = 60 / bpm
        self.bar = 4 * self.beat
        self.bars = bars
        self.n = int(samples_per_beat) * 4 * bars
        self.seconds = self.n / SR
        self.buf = np.zeros((2, self.n))

    def add(self, at: float, sig: np.ndarray, gain: float, pan: float = 0.0) -> None:
        """Adds a mono signal at `at` seconds, panned (-1 left, +1 right) with constant power."""
        angle = (pan + 1) * np.pi / 4
        left, right = np.cos(angle) * gain, np.sin(angle) * gain
        i = int(round(at * SR)) % self.n
        pos = 0
        while pos < len(sig):
            k = min(len(sig) - pos, self.n - i)
            self.buf[0, i : i + k] += sig[pos : pos + k] * left
            self.buf[1, i : i + k] += sig[pos : pos + k] * right
            pos += k
            i = 0


# --- Envelopes and voices --------------------------------------------------------------------
# Every voice starts with an attack of 10 ms or more and ends with a release, so nothing clicks or snaps.

MIN_ATTACK = 0.010


def times(dur: float) -> np.ndarray:
    return np.arange(int(dur * SR)) / SR


def envelope(dur: float, attack: float, tau: float | None, release: float) -> np.ndarray:
    """Raised-cosine attack, exponential decay (None holds), and a raised-cosine release at the end."""
    if attack < MIN_ATTACK:
        raise ValueError("attack under 10 ms")
    t = times(dur)
    rise = np.where(t < attack, 0.5 - 0.5 * np.cos(np.pi * np.clip(t / attack, 0, 1)), 1.0)
    body = np.ones_like(t) if tau is None else np.exp(-np.maximum(t - attack, 0) / tau)
    fall = np.clip((dur - t) / release, 0, 1)
    return rise * body * (0.5 - 0.5 * np.cos(np.pi * fall))


def kalimba(f: float, dur: float = 2.2) -> np.ndarray:
    """A soft tine: the fundamental, a quiet octave and a faint high partial that dies in 60 ms."""
    t = times(dur)
    s = np.sin(2 * np.pi * f * t) + 0.18 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t / 0.25) + 0.05 * np.sin(2 * np.pi * 5.9 * f * t) * np.exp(-t / 0.06)
    return s * envelope(dur, 0.012, 0.55, 0.3)


def marimba(f: float, dur: float = 1.6) -> np.ndarray:
    """A wooden bar, darker than the kalimba: fundamental and a quiet fourth partial."""
    t = times(dur)
    s = np.sin(2 * np.pi * f * t) + 0.12 * np.sin(2 * np.pi * 4 * f * t) * np.exp(-t / 0.05)
    return s * envelope(dur, 0.014, 0.32, 0.25)


def bass(f: float, dur: float) -> np.ndarray:
    """A soft bass with its 2nd and 3rd harmonics, so a phone speaker that cannot play the fundamental still plays the note."""
    t = times(dur)
    s = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * 2 * f * t) + 0.12 * np.sin(2 * np.pi * 3 * f * t)
    return s * envelope(dur, 0.03, 1.6, 0.35)


def pad_voice(f: float, dur: float, rng: np.random.Generator, attack: float = 1.2, release: float = 1.6, harmonics: int = 5) -> np.ndarray:
    """A warm pad voice: two copies 5 cents apart, each a soft saw cut at a few harmonics, with a slow swell."""
    t = times(dur)
    s = np.zeros_like(t)
    for detune in (-0.0029, 0.0029):
        for k in range(1, harmonics + 1):
            s += np.sin(2 * np.pi * f * (1 + detune) * k * t + rng.uniform(0, 2 * np.pi)) / k**1.6
    return s * envelope(dur, attack, None, release) / 2


# --- Whole-loop processing -------------------------------------------------------------------


def butterworth(f: np.ndarray, cutoff: float, order: int, high: bool) -> np.ndarray:
    ratio = (cutoff / np.maximum(f, 1e-6)) if high else (f / cutoff)
    return 1 / np.sqrt(1 + ratio ** (2 * order))


def finish(loop: Loop, lowpass_hz: float, reverb_seconds: float, wet: float, seed: int) -> np.ndarray:
    """Reverb, low-pass and a gentle high-pass as circular FFT filters over one loop, so the tails wrap."""
    n = loop.n
    f = np.fft.rfftfreq(n, 1 / SR)
    spectrum = np.fft.rfft(loop.buf, axis=1)

    # The reverb: decaying noise with a 20 ms pre-delay, different per side for width, darker than the dry sound.
    rng = np.random.default_rng(seed)
    length = int(reverb_seconds * SR)
    t = np.arange(length) / SR
    tau = reverb_seconds / 6.9  # the time for -60 dB is the reverb length
    ir = np.zeros((2, n))
    pre = int(0.02 * SR)
    for side in range(2):
        tail = rng.standard_normal(length) * np.exp(-t / tau) * np.clip(t / 0.03, 0, 1)
        ir[side, pre : pre + length] = tail
    ir_spectrum = np.fft.rfft(ir, axis=1) * butterworth(f, 2500, 2, high=False) * butterworth(f, 200, 1, high=True)
    ir_spectrum /= np.sqrt(np.mean(np.abs(ir_spectrum) ** 2, axis=1, keepdims=True))
    # The dry signal is the same in both reverb inputs (mid), so the wet sides differ only by the decorrelated tails.
    mid = spectrum.mean(axis=0, keepdims=True)
    wet_spectrum = mid * ir_spectrum * wet

    tone = butterworth(f, lowpass_hz, 2, high=False) * butterworth(f, 55, 2, high=True)
    return np.fft.irfft((spectrum + wet_spectrum) * tone, n, axis=1)


# --- Track A: soft mallets with a warm pad (F major, 75 BPM, 32 bars) -------------------------


def track_a() -> Loop:
    loop = Loop(bpm=75, bars=32)
    rng = np.random.default_rng(11)
    beat, bar = loop.beat, loop.bar
    # Eight bars, one chord a bar. Pad voicings move by a step at most, so the harmony glides.
    chords = [
        ("F2", ["F3", "A3", "C4", "E4"], ["A4", "C5", "E5"]),  # Fmaj7
        ("A2", ["G3", "A3", "C4", "E4"], ["A4", "C5", "E5"]),  # Am7
        ("Bb2", ["F3", "A3", "Bb3", "D4"], ["F4", "A4", "D5"]),  # Bbmaj7
        ("C3", ["E3", "G3", "A3", "D4"], ["G4", "C5", "D5"]),  # C6/9
        ("F2", ["F3", "A3", "C4", "E4"], ["A4", "C5", "E5"]),  # Fmaj7
        ("D2", ["F3", "A3", "C4", "E4"], ["F4", "A4", "D5"]),  # Dm9
        ("G2", ["F3", "A3", "Bb3", "D4"], ["G4", "Bb4", "D5"]),  # Gm9
        ("C3", ["F3", "G3", "Bb3", "D4"], ["G4", "C5", "F5"]),  # C7sus4, back to F
    ]
    # The motif: eight bars of (beat, note), three notes a bar at most, mostly the F pentatonic.
    statement = [
        [(0, "A4"), (1, "C5"), (2, "E5")],
        [(0.5, "D5"), (2, "C5")],
        [(0, "F4"), (1, "A4"), (2, "D5")],
        [(0.5, "C5"), (2, "G4")],
        [(0, "A4"), (1, "C5"), (2, "E5")],
        [(0.5, "D5"), (2, "F5")],
        [(0, "D5"), (1, "A4"), (2.5, "G4")],
        [(1, "F4")],
    ]
    # Variation: each bar's first note on the beat, the rest half a beat later, and the phrase ends up an octave.
    variation = [[(b if i == 0 else b + 0.5, n) for i, (b, n) in enumerate(notes)] for notes in statement]
    variation[7] = [(0.5, "G4"), (2, "C5")]
    fragment = [notes[:1] for notes in statement]  # only the first note of each bar

    # Sections of 8 bars: which layers play. The last section thins out so the loop flows into the first.
    sections = [
        {"pad": 0.55, "arp": 2, "bass": 0.0, "motif": None},
        {"pad": 0.5, "arp": 2, "bass": 0.5, "motif": statement},
        {"pad": 0.45, "arp": 3, "bass": 0.0, "motif": fragment},
        {"pad": 0.5, "arp": 2, "bass": 0.45, "motif": variation},
    ]
    for b in range(loop.bars):
        section = sections[b // 8]
        root, voicing, tones = chords[b % 8]
        t0 = b * bar
        # Each pad chord lasts its bar plus a 1.6 s release that overlaps the next chord.
        for i, note in enumerate(voicing):
            loop.add(t0, pad_voice(hz(note), bar + 1.6, rng), section["pad"] * 0.16, pan=(-0.35, 0.35, -0.15, 0.15)[i])
        if section["bass"] > 0:
            loop.add(t0, bass(hz(root), bar * 0.95), section["bass"] * 0.35)
        arp_beats = [0.0, 2.5] if section["arp"] == 2 else [0.0, 1.5, 2.5]
        for j, at in enumerate(arp_beats):
            note = tones[(b + j) % len(tones)]
            loop.add(t0 + at * beat, marimba(hz(note)), 0.09 * (1.0 if j == 0 else 0.75), pan=(-0.4 if j % 2 == 0 else 0.4))
        if section["motif"] is not None:
            octave_lower = section["motif"] is fragment
            for at, note in section["motif"][b % 8]:
                f = hz(note) / (2 if octave_lower else 1)
                loop.add(t0 + at * beat, kalimba(f), 0.13 if not octave_lower else 0.15, pan=0.1)
    return loop


# --- Rendering, encoding and measuring ------------------------------------------------------


@dataclass(frozen=True)
class Track:
    letter: str
    file: str
    title: str
    key: str
    bpm: int
    build: Callable[[], Loop]
    lowpass_hz: float
    reverb_seconds: float
    wet: float


# The letter stays "a": it seeds the reverb and names the file, so a re-render gives the same audio.
TRACK = Track("a", "a-mallets-v1.mp3", "Soft mallets with a warm pad", "F major", 75, track_a, 4200, 2.4, 0.32)


def ffmpeg(*args: str) -> str:
    return subprocess.run([FFMPEG, "-hide_banner", "-nostats", *args], capture_output=True, text=True, check=True).stderr


def ebur128(path: Path) -> tuple[float, float]:
    """Integrated loudness (LUFS) and true peak (dBTP), from ffmpeg's EBU R128 meter."""
    log = ffmpeg("-i", str(path), "-af", "ebur128=peak=true", "-f", "null", "-")
    summary = log[log.rfind("Summary:") :]
    integrated = re.search(r"I:\s+(-?[\d.]+) LUFS", summary)
    peak = re.search(r"Peak:\s+(-?[\d.inf]+) dBFS", summary)
    if integrated is None or peak is None:
        raise RuntimeError(f"ebur128 printed no summary for {path}")
    return float(integrated.group(1)), float(peak.group(1))


def seam(decoded: np.ndarray, n: int) -> dict:
    """How the loop point sounds: the player jumps from PAD + n back to PAD.

    In a periodic file the audio around the loop end equals the audio around the loop start, so the
    jump sounds like continuous play when x[PAD + k] matches x[PAD + n + k]: compared over +-0.4 s (so a
    decoder offset of tens of milliseconds still lands in periodic audio), by value and slope at k = 0,
    and by the RMS of the 50 ms on each side of both points. A chord that starts on bar 1 is music, not
    a seam fault, so the RMS is compared point against point and not end against start.
    """
    mono = decoded.mean(axis=1)
    s0 = int(PAD * SR)
    k = np.arange(-int(0.4 * SR), int(0.4 * SR))
    a, b = mono[s0 + k], mono[s0 + n + k]
    rms = np.sqrt(np.mean(mono[s0 : s0 + n] ** 2))
    w = int(0.05 * SR)

    def level(i: int, j: int) -> float:
        return float(20 * np.log10(np.sqrt(np.mean(mono[i:j] ** 2))))

    return {
        "max_difference_db_re_rms_over_0.8s": round(float(20 * np.log10(np.max(np.abs(a - b)) / rms)), 1),
        "value_at_start": round(float(mono[s0]), 5),
        "value_after_end": round(float(mono[s0 + n]), 5),
        "slope_at_start": round(float(mono[s0 + 1] - mono[s0]), 6),
        "slope_after_end": round(float(mono[s0 + n + 1] - mono[s0 + n]), 6),
        "rms_db_50ms_before_start_vs_end": [round(level(s0 - w, s0), 2), round(level(s0 + n - w, s0 + n), 2)],
        "rms_db_50ms_after_start_vs_end": [round(level(s0, s0 + w), 2), round(level(s0 + n, s0 + n + w), 2)],
    }


def share_above(decoded: np.ndarray, hz_limit: float) -> float:
    mono = decoded.mean(axis=1)
    power = np.abs(np.fft.rfft(mono)) ** 2
    f = np.fft.rfftfreq(len(mono), 1 / SR)
    return float(power[f > hz_limit].sum() / power.sum())


def render(track: Track, out_dir: Path, work: Path) -> dict:
    loop = track.build()
    audio = finish(loop, track.lowpass_hz, track.reverb_seconds, track.wet, seed=ord(track.letter))
    raw = work / f"{track.letter}-raw.wav"
    sf.write(raw, audio.T / np.max(np.abs(audio)) * 0.5, SR, subtype="FLOAT")
    measured, _ = ebur128(raw)
    audio = audio / np.max(np.abs(audio)) * 0.5 * 10 ** ((TARGET_LUFS - measured) / 20)
    if np.max(np.abs(audio)) > 10 ** (TRUE_PEAK_LIMIT / 20):
        raise RuntimeError(f"track {track.letter}: sample peak over {TRUE_PEAK_LIMIT} dBFS at {TARGET_LUFS} LUFS; lower the target")
    pad = int(PAD * SR)
    padded = np.concatenate([audio[:, -pad:], audio, audio[:, :pad]], axis=1)
    wav = work / f"{track.letter}.wav"
    sf.write(wav, padded.T, SR, subtype="PCM_24")
    mp3 = out_dir / track.file
    ffmpeg("-y", "-i", str(wav), "-c:a", "libmp3lame", "-b:a", BITRATE, "-ar", str(SR), str(mp3))
    decoded_path = work / f"{track.letter}-decoded.wav"
    ffmpeg("-y", "-i", str(mp3), "-c:a", "pcm_f32le", str(decoded_path))
    decoded, _ = sf.read(decoded_path, always_2d=True)
    s0 = pad
    loop_only = work / f"{track.letter}-loop.wav"
    sf.write(loop_only, decoded[s0 : s0 + loop.n], SR, subtype="FLOAT")
    integrated, true_peak = ebur128(loop_only)
    return {
        "file": f"apps/web/public/music/{track.file}",
        "title": track.title,
        "key": track.key,
        "bpm": track.bpm,
        "bars": loop.bars,
        "loop_seconds": loop.seconds,
        "loop_start": PAD,
        "loop_end": PAD + loop.seconds,
        "file_seconds": round(padded.shape[1] / SR, 3),
        "bytes": mp3.stat().st_size,
        "integrated_lufs": integrated,
        "true_peak_dbtp": true_peak,
        "share_above_6khz_percent": round(100 * share_above(decoded[s0 : s0 + loop.n], 6000), 5),
        "seam": seam(decoded, loop.n),
    }


def main() -> None:
    root = Path(sys.argv[1]).resolve()
    out_dir = root / "apps/web/public/music"
    out_dir.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        report = {TRACK.letter: render(TRACK, out_dir, Path(tmp))}
    print(json.dumps(report, indent=2))
    (root / "tools/music/measurements.json").write_text(json.dumps(report, indent=2) + "\n")


if __name__ == "__main__":
    main()
