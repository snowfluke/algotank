// The sound effects, synthesised with the Web Audio API so the game ships no
// audio files. Each effect stays under 400 ms except `win` (about 1.2 s). Levels
// are low: these play on phones in a room full of other phones.

export const SOUND_NAMES = [
  "shot", "splash", "miss", "dry", "countdown", "roundStart", "roundEnd", "win", "tap", "ram", "mud", "wind",
  // The viewer's own tank lands a hit, or is hit (owner, 2026-11-19: "getting a hit should have sfx").
  "score", "hurt",
  // One per ultimate: the activation and the skill in one sound (owner, 2026-11-19).
  "dash", "smoke", "splashRing", "fullTank", "mudBomb", "whirlwind", "bigUmbrella", "magnet",
  // One per item when the viewer's own tank picks it up, and one when the item does its job (owner, 2026-11-19).
  "pickBucket", "pickUmbrella", "pickPinwheel", "pickMudBall",
  "useBucket", "useUmbrella", "usePinwheel", "useMudBall",
] as const;
export type SoundName = (typeof SOUND_NAMES)[number];

/**
 * Each sound's level, a factor on its synth's own gains (owner, 2026-11-19: "lower the regular shoot sfx ... increase
 * the volume of ulti skills, item picking, item firing"). A shot plays every turn, so it sits low; an ultimate or an
 * item is rare and tells the player something happened, so it stands out.
 */
const LOUD = 1.7;
export const SOUND_LEVELS: Readonly<Record<SoundName, number>> = {
  shot: 0.55, splash: 1, miss: 0.8, dry: 1, countdown: 1, roundStart: 1, roundEnd: 1, win: 1, tap: 1,
  score: 1.15, hurt: 1.15,
  ram: LOUD, mud: LOUD, wind: LOUD,
  dash: LOUD, smoke: LOUD, splashRing: LOUD, fullTank: LOUD, mudBomb: LOUD, whirlwind: LOUD, bigUmbrella: LOUD, magnet: LOUD,
  pickBucket: LOUD, pickUmbrella: LOUD, pickPinwheel: LOUD, pickMudBall: LOUD,
  useBucket: LOUD, useUmbrella: LOUD, usePinwheel: LOUD, useMudBall: LOUD,
};

interface ToneOptions {
  readonly type: OscillatorType;
  readonly from: number;
  readonly to?: number;
  readonly start: number;
  readonly duration: number;
  readonly gain: number;
  /** Seconds to full level; 10 ms when left out. A longer attack blends a voice into the one before it. */
  readonly attack?: number;
}

/** One oscillator with a quick attack and an exponential fade, so it never clicks. */
function tone(out: AudioNode, { type, from, to, start, duration, gain, attack = 0.01 }: ToneOptions): void {
  const ctx = out.context;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, start);
  if (to !== undefined) osc.frequency.exponentialRampToValueAtTime(to, start + duration);
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(gain, start + attack);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(amp).connect(out);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();

/** Half a second of white noise, made once per context and reused by every water sound. */
function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const cached = noiseBuffers.get(ctx);
  if (cached !== undefined) return cached;
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  noiseBuffers.set(ctx, buffer);
  return buffer;
}

interface NoiseOptions {
  readonly filter: BiquadFilterType;
  readonly from: number;
  readonly to: number;
  readonly start: number;
  readonly duration: number;
  readonly gain: number;
  /** Seconds to full level; 12 ms when left out. */
  readonly attack?: number;
}

/** Filtered noise with a sweeping cut-off: water hisses, splashes and puffs. */
function noise(out: AudioNode, { filter, from, to, start, duration, gain, attack = 0.012 }: NoiseOptions): void {
  const ctx = out.context;
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer(ctx);
  const biquad = ctx.createBiquadFilter();
  biquad.type = filter;
  biquad.Q.value = 1.2;
  biquad.frequency.setValueAtTime(from, start);
  biquad.frequency.exponentialRampToValueAtTime(to, start + duration);
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(gain, start + attack);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.connect(biquad).connect(amp).connect(out);
  source.start(start);
  source.stop(start + duration + 0.02);
}

/** The soft start of every ultimate: a swell that glides up to `to`, with a faint shimmer over it. */
function rise(out: AudioNode, at: number, to: number, type: OscillatorType = "triangle"): void {
  tone(out, { type, from: 392, to, start: at, duration: 0.2, gain: 0.07, attack: 0.05 });
  noise(out, { filter: "highpass", from: 5000, to: 7000, start: at + 0.02, duration: 0.2, gain: 0.025, attack: 0.06 });
}

/** One sound, written to `out`: that sound's own level (SOUND_LEVELS) on its way to the speakers. */
type Synth = (out: AudioNode, at: number) => void;

export const SYNTHS: Record<SoundName, Synth> = {
  // A short "pssht": band-passed noise sweeping down.
  shot: (out, at) => noise(out, { filter: "bandpass", from: 3200, to: 900, start: at, duration: 0.18, gain: 0.22 }),
  // A wet hit: a low drop and a burst of noise. Stronger than a miss, because a hit moves a point.
  splash: (out, at) => {
    tone(out, { type: "sine", from: 420, to: 140, start: at, duration: 0.16, gain: 0.25 });
    noise(out, { filter: "lowpass", from: 2600, to: 400, start: at + 0.02, duration: 0.26, gain: 0.28 });
  },
  // Your shot lands: the splash, then two bright notes going up, like a coin for the point.
  score: (out, at) => {
    SYNTHS.splash(out, at);
    tone(out, { type: "triangle", from: 1046, start: at + 0.08, duration: 0.09, gain: 0.13 });
    tone(out, { type: "triangle", from: 1568, start: at + 0.16, duration: 0.18, gain: 0.13 });
  },
  // Your tank is hit: a heavy wet thud and a note that drops, so it reads as losing a point.
  hurt: (out, at) => {
    tone(out, { type: "sine", from: 200, to: 70, start: at, duration: 0.22, gain: 0.3 });
    noise(out, { filter: "lowpass", from: 1400, to: 250, start: at, duration: 0.3, gain: 0.3 });
    tone(out, { type: "square", from: 330, to: 196, start: at + 0.1, duration: 0.18, gain: 0.05 });
  },
  // A soft puff on the floor.
  miss: (out, at) => noise(out, { filter: "highpass", from: 1800, to: 3000, start: at, duration: 0.12, gain: 0.08 }),
  // Two dry clicks: the nozzle sputters because the water gauge is too low.
  dry: (out, at) => {
    tone(out, { type: "square", from: 180, to: 120, start: at, duration: 0.05, gain: 0.05 });
    tone(out, { type: "square", from: 160, to: 100, start: at + 0.09, duration: 0.05, gain: 0.04 });
  },
  countdown: (out, at) => tone(out, { type: "sine", from: 880, start: at, duration: 0.12, gain: 0.16 }),
  roundStart: (out, at) => {
    tone(out, { type: "triangle", from: 660, start: at, duration: 0.12, gain: 0.18 });
    tone(out, { type: "triangle", from: 1320, start: at + 0.12, duration: 0.22, gain: 0.18 });
  },
  roundEnd: (out, at) => {
    tone(out, { type: "triangle", from: 990, start: at, duration: 0.14, gain: 0.16 });
    tone(out, { type: "triangle", from: 660, start: at + 0.15, duration: 0.22, gain: 0.16 });
  },
  // A rising arpeggio and a held top note: C5 E5 G5 C6.
  win: (out, at) => {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((frequency, i) => {
      const last = i === notes.length - 1;
      tone(out, { type: "triangle", from: frequency, start: at + i * 0.13, duration: last ? 0.7 : 0.16, gain: 0.18 });
    });
  },
  tap: (out, at) => tone(out, { type: "sine", from: 1250, start: at, duration: 0.03, gain: 0.03 }),
  // Another tank's Dash rams the viewer's tank: a low thump.
  ram: (out, at) => {
    tone(out, { type: "sine", from: 170, to: 55, start: at, duration: 0.22, gain: 0.32 });
    noise(out, { filter: "lowpass", from: 900, to: 150, start: at, duration: 0.14, gain: 0.18 });
  },
  // A mud bomb sticks the viewer's tank: a wet, low squelch.
  mud: (out, at) => {
    noise(out, { filter: "lowpass", from: 1100, to: 180, start: at, duration: 0.24, gain: 0.26 });
    tone(out, { type: "sine", from: 260, to: 80, start: at + 0.03, duration: 0.18, gain: 0.18 });
  },
  // --- Ultimates. One sound each (owner, 2026-11-19: the cue and the skill sound were "too jitter ... very
  // contrast"): a soft rise in the effects' C major glides straight into the skill, with slow attacks that overlap,
  // so the activation and the skill play as one gesture. ---
  dash: (out, at) => {
    rise(out, at, 523.25);
    noise(out, { filter: "bandpass", from: 400, to: 2800, start: at + 0.1, duration: 0.24, gain: 0.16, attack: 0.06 });
    tone(out, { type: "sine", from: 150, to: 55, start: at + 0.32, duration: 0.18, gain: 0.26, attack: 0.015 });
  },
  smoke: (out, at) => {
    rise(out, at, 440, "sine");
    tone(out, { type: "sine", from: 220, to: 110, start: at + 0.12, duration: 0.26, gain: 0.12, attack: 0.05 });
    noise(out, { filter: "lowpass", from: 1400, to: 250, start: at + 0.1, duration: 0.5, gain: 0.13, attack: 0.08 });
  },
  splashRing: (out, at) => {
    rise(out, at, 659.25);
    tone(out, { type: "sine", from: 520, to: 130, start: at + 0.12, duration: 0.22, gain: 0.2, attack: 0.02 });
    noise(out, { filter: "lowpass", from: 3600, to: 300, start: at + 0.12, duration: 0.36, gain: 0.26, attack: 0.025 });
    [1568, 1318.5, 1760].forEach((frequency, i) => tone(out, { type: "sine", from: frequency, to: frequency * 0.7, start: at + 0.26 + i * 0.05, duration: 0.06, gain: 0.05, attack: 0.012 }));
  },
  fullTank: (out, at) => {
    rise(out, at, 392, "sine");
    [300, 360, 430].forEach((frequency, i) => tone(out, { type: "sine", from: frequency, to: frequency * 2, start: at + 0.1 + i * 0.08, duration: 0.08, gain: 0.15, attack: 0.02 }));
    tone(out, { type: "triangle", from: 1046.5, start: at + 0.36, duration: 0.24, gain: 0.08, attack: 0.02 });
  },
  // Mud bomb: the rise is the bomb's own whistle up in the air, then the splat.
  mudBomb: (out, at) => {
    tone(out, { type: "sine", from: 660, to: 1320, start: at, duration: 0.28, gain: 0.08, attack: 0.05 });
    noise(out, { filter: "lowpass", from: 1000, to: 140, start: at + 0.27, duration: 0.22, gain: 0.28, attack: 0.02 });
    tone(out, { type: "sine", from: 190, to: 60, start: at + 0.27, duration: 0.18, gain: 0.2, attack: 0.02 });
  },
  whirlwind: (out, at) => {
    rise(out, at, 587.33);
    noise(out, { filter: "bandpass", from: 400, to: 2400, start: at + 0.1, duration: 0.2, gain: 0.14, attack: 0.05 });
    noise(out, { filter: "bandpass", from: 2400, to: 500, start: at + 0.22, duration: 0.2, gain: 0.12, attack: 0.05 });
    noise(out, { filter: "bandpass", from: 500, to: 1800, start: at + 0.34, duration: 0.18, gain: 0.09, attack: 0.05 });
  },
  bigUmbrella: (out, at) => {
    rise(out, at, 523.25);
    noise(out, { filter: "highpass", from: 1200, to: 4000, start: at + 0.12, duration: 0.1, gain: 0.1, attack: 0.02 });
    tone(out, { type: "triangle", from: 523.25, start: at + 0.14, duration: 0.14, gain: 0.13, attack: 0.02 });
    tone(out, { type: "triangle", from: 783.99, start: at + 0.2, duration: 0.24, gain: 0.12, attack: 0.02 });
  },
  // Magnet: the rise is the magnet's buzz, then the click of the items arriving.
  magnet: (out, at) => {
    tone(out, { type: "square", from: 110, to: 220, start: at, duration: 0.32, gain: 0.045, attack: 0.06 });
    tone(out, { type: "sine", from: 440, to: 880, start: at, duration: 0.32, gain: 0.07, attack: 0.06 });
    tone(out, { type: "triangle", from: 1760, start: at + 0.32, duration: 0.06, gain: 0.09, attack: 0.012 });
  },
  // --- Picking up an item: short and light, in the effects' C major. ---
  // A small metal clank with a slosh of water inside.
  pickBucket: (out, at) => {
    tone(out, { type: "triangle", from: 659.25, start: at, duration: 0.09, gain: 0.12 });
    tone(out, { type: "triangle", from: 987.77, start: at + 0.05, duration: 0.14, gain: 0.1, attack: 0.02 });
    noise(out, { filter: "lowpass", from: 1600, to: 400, start: at + 0.04, duration: 0.16, gain: 0.07, attack: 0.03 });
  },
  // The umbrella clicks open.
  pickUmbrella: (out, at) => {
    noise(out, { filter: "highpass", from: 1500, to: 4200, start: at, duration: 0.07, gain: 0.09 });
    tone(out, { type: "triangle", from: 783.99, start: at + 0.03, duration: 0.16, gain: 0.11, attack: 0.02 });
  },
  // A sparkle that climbs: the pinwheel starts to turn.
  pickPinwheel: (out, at) => {
    [880, 1174.66, 1567.98].forEach((frequency, i) => tone(out, { type: "triangle", from: frequency, start: at + i * 0.05, duration: 0.09, gain: 0.09, attack: 0.015 }));
  },
  // A soft squish in the hand.
  pickMudBall: (out, at) => {
    noise(out, { filter: "lowpass", from: 800, to: 200, start: at, duration: 0.16, gain: 0.16, attack: 0.02 });
    tone(out, { type: "sine", from: 240, to: 110, start: at, duration: 0.14, gain: 0.12, attack: 0.02 });
  },
  // --- An item doing its job. Each takes the place of the splash (a hit) or the miss (a block), so a turn stays one sound. ---
  // A bucket hit: a heavier splash, with the bucket's clank under it.
  useBucket: (out, at) => {
    tone(out, { type: "sine", from: 360, to: 100, start: at, duration: 0.24, gain: 0.26 });
    noise(out, { filter: "lowpass", from: 2400, to: 250, start: at + 0.02, duration: 0.38, gain: 0.3 });
    tone(out, { type: "triangle", from: 523.25, start: at + 0.04, duration: 0.16, gain: 0.07, attack: 0.02 });
  },
  // The own umbrella stops a shot: a soft "fwump" and a falling note, never a splash.
  useUmbrella: (out, at) => {
    noise(out, { filter: "lowpass", from: 1500, to: 400, start: at, duration: 0.14, gain: 0.14 });
    tone(out, { type: "triangle", from: 659.25, to: 523.25, start: at + 0.02, duration: 0.18, gain: 0.11, attack: 0.02 });
  },
  // A pinwheel hit: the splash with a whirl that spins off.
  usePinwheel: (out, at) => {
    tone(out, { type: "sine", from: 420, to: 140, start: at, duration: 0.16, gain: 0.22 });
    noise(out, { filter: "lowpass", from: 2600, to: 400, start: at + 0.02, duration: 0.24, gain: 0.22 });
    noise(out, { filter: "bandpass", from: 700, to: 2600, start: at + 0.12, duration: 0.22, gain: 0.1, attack: 0.04 });
    tone(out, { type: "triangle", from: 1046.5, to: 1318.5, start: at + 0.14, duration: 0.2, gain: 0.06, attack: 0.04 });
  },
  // A mud ball hit: a wet, low glop.
  useMudBall: (out, at) => {
    noise(out, { filter: "lowpass", from: 1000, to: 120, start: at, duration: 0.28, gain: 0.3 });
    tone(out, { type: "sine", from: 210, to: 65, start: at + 0.02, duration: 0.22, gain: 0.22 });
  },
  // A whirlwind catches the viewer's tank: a whoosh that rises and falls.
  wind: (out, at) => {
    noise(out, { filter: "bandpass", from: 500, to: 2200, start: at, duration: 0.2, gain: 0.16 });
    noise(out, { filter: "bandpass", from: 2200, to: 600, start: at + 0.17, duration: 0.2, gain: 0.12 });
  },
};
