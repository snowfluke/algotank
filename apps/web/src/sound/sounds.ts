// The sound effects, synthesised with the Web Audio API so the game ships no
// audio files. Each effect stays under 400 ms except `win` (about 1.2 s). Levels
// are low: these play on phones in a room full of other phones.

export const SOUND_NAMES = [
  "shot", "splash", "miss", "dry", "countdown", "roundStart", "roundEnd", "win", "tap",
  // One per item when the viewer's own tank picks it up, and one when the item does its job (owner, 2026-11-19).
  "pickBucket", "pickUmbrella", "pickPinwheel", "pickMudBall",
  "useBucket", "useUmbrella", "usePinwheel", "useMudBall",
] as const;
export type SoundName = (typeof SOUND_NAMES)[number];

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
function tone(ctx: AudioContext, { type, from, to, start, duration, gain, attack = 0.01 }: ToneOptions): void {
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, start);
  if (to !== undefined) osc.frequency.exponentialRampToValueAtTime(to, start + duration);
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(gain, start + attack);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(amp).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

const noiseBuffers = new WeakMap<AudioContext, AudioBuffer>();

/** Half a second of white noise, made once per context and reused by every water sound. */
function noiseBuffer(ctx: AudioContext): AudioBuffer {
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
function noise(ctx: AudioContext, { filter, from, to, start, duration, gain, attack = 0.012 }: NoiseOptions): void {
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
  source.connect(biquad).connect(amp).connect(ctx.destination);
  source.start(start);
  source.stop(start + duration + 0.02);
}

type Synth = (ctx: AudioContext, at: number) => void;

export const SYNTHS: Record<SoundName, Synth> = {
  // A short "pssht": band-passed noise sweeping down.
  shot: (ctx, at) => noise(ctx, { filter: "bandpass", from: 3200, to: 900, start: at, duration: 0.18, gain: 0.22 }),
  // A wet hit: a low drop and a burst of noise. Stronger than a miss, because a hit moves a point.
  splash: (ctx, at) => {
    tone(ctx, { type: "sine", from: 420, to: 140, start: at, duration: 0.16, gain: 0.25 });
    noise(ctx, { filter: "lowpass", from: 2600, to: 400, start: at + 0.02, duration: 0.26, gain: 0.28 });
  },
  // A soft puff on the floor.
  miss: (ctx, at) => noise(ctx, { filter: "highpass", from: 1800, to: 3000, start: at, duration: 0.12, gain: 0.08 }),
  // Two dry clicks: the nozzle sputters because the water gauge is too low.
  dry: (ctx, at) => {
    tone(ctx, { type: "square", from: 180, to: 120, start: at, duration: 0.05, gain: 0.05 });
    tone(ctx, { type: "square", from: 160, to: 100, start: at + 0.09, duration: 0.05, gain: 0.04 });
  },
  countdown: (ctx, at) => tone(ctx, { type: "sine", from: 880, start: at, duration: 0.12, gain: 0.16 }),
  roundStart: (ctx, at) => {
    tone(ctx, { type: "triangle", from: 660, start: at, duration: 0.12, gain: 0.18 });
    tone(ctx, { type: "triangle", from: 1320, start: at + 0.12, duration: 0.22, gain: 0.18 });
  },
  roundEnd: (ctx, at) => {
    tone(ctx, { type: "triangle", from: 990, start: at, duration: 0.14, gain: 0.16 });
    tone(ctx, { type: "triangle", from: 660, start: at + 0.15, duration: 0.22, gain: 0.16 });
  },
  // A rising arpeggio and a held top note: C5 E5 G5 C6.
  win: (ctx, at) => {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((frequency, i) => {
      const last = i === notes.length - 1;
      tone(ctx, { type: "triangle", from: frequency, start: at + i * 0.13, duration: last ? 0.7 : 0.16, gain: 0.18 });
    });
  },
  tap: (ctx, at) => tone(ctx, { type: "sine", from: 1250, start: at, duration: 0.03, gain: 0.03 }),
  // --- Picking up an item: short and light, in the effects' C major. ---
  // A small metal clank with a slosh of water inside.
  pickBucket: (ctx, at) => {
    tone(ctx, { type: "triangle", from: 659.25, start: at, duration: 0.09, gain: 0.12 });
    tone(ctx, { type: "triangle", from: 987.77, start: at + 0.05, duration: 0.14, gain: 0.1, attack: 0.02 });
    noise(ctx, { filter: "lowpass", from: 1600, to: 400, start: at + 0.04, duration: 0.16, gain: 0.07, attack: 0.03 });
  },
  // The umbrella clicks open.
  pickUmbrella: (ctx, at) => {
    noise(ctx, { filter: "highpass", from: 1500, to: 4200, start: at, duration: 0.07, gain: 0.09 });
    tone(ctx, { type: "triangle", from: 783.99, start: at + 0.03, duration: 0.16, gain: 0.11, attack: 0.02 });
  },
  // A sparkle that climbs: the pinwheel starts to turn.
  pickPinwheel: (ctx, at) => {
    [880, 1174.66, 1567.98].forEach((frequency, i) => tone(ctx, { type: "triangle", from: frequency, start: at + i * 0.05, duration: 0.09, gain: 0.09, attack: 0.015 }));
  },
  // A soft squish in the hand.
  pickMudBall: (ctx, at) => {
    noise(ctx, { filter: "lowpass", from: 800, to: 200, start: at, duration: 0.16, gain: 0.16, attack: 0.02 });
    tone(ctx, { type: "sine", from: 240, to: 110, start: at, duration: 0.14, gain: 0.12, attack: 0.02 });
  },
  // --- An item doing its job. Each takes the place of the splash (a hit) or the miss (a block), so a turn stays one sound. ---
  // A bucket hit: a heavier splash, with the bucket's clank under it.
  useBucket: (ctx, at) => {
    tone(ctx, { type: "sine", from: 360, to: 100, start: at, duration: 0.24, gain: 0.26 });
    noise(ctx, { filter: "lowpass", from: 2400, to: 250, start: at + 0.02, duration: 0.38, gain: 0.3 });
    tone(ctx, { type: "triangle", from: 523.25, start: at + 0.04, duration: 0.16, gain: 0.07, attack: 0.02 });
  },
  // The own umbrella stops a shot: a soft "fwump" and a falling note, never a splash.
  useUmbrella: (ctx, at) => {
    noise(ctx, { filter: "lowpass", from: 1500, to: 400, start: at, duration: 0.14, gain: 0.14 });
    tone(ctx, { type: "triangle", from: 659.25, to: 523.25, start: at + 0.02, duration: 0.18, gain: 0.11, attack: 0.02 });
  },
  // A pinwheel hit: the splash with a whirl that spins off.
  usePinwheel: (ctx, at) => {
    tone(ctx, { type: "sine", from: 420, to: 140, start: at, duration: 0.16, gain: 0.22 });
    noise(ctx, { filter: "lowpass", from: 2600, to: 400, start: at + 0.02, duration: 0.24, gain: 0.22 });
    noise(ctx, { filter: "bandpass", from: 700, to: 2600, start: at + 0.12, duration: 0.22, gain: 0.1, attack: 0.04 });
    tone(ctx, { type: "triangle", from: 1046.5, to: 1318.5, start: at + 0.14, duration: 0.2, gain: 0.06, attack: 0.04 });
  },
  // A mud ball hit: a wet, low glop.
  useMudBall: (ctx, at) => {
    noise(ctx, { filter: "lowpass", from: 1000, to: 120, start: at, duration: 0.28, gain: 0.3 });
    tone(ctx, { type: "sine", from: 210, to: 65, start: at + 0.02, duration: 0.22, gain: 0.22 });
  },
};
