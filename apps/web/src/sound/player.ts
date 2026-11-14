// Decides whether a sound plays: not when muted, not before the person has
// touched the page (browsers block audio until then), not without the Web Audio
// API, and not when the same effect played less than 60 ms ago, so a turn with
// eight hits makes one splash and not eight.

import { soundSettings } from "./setting.ts";
import { SYNTHS, type SoundName } from "./sounds.ts";

export const REPEAT_WINDOW_MS = 60;

export interface SoundPlayerDeps {
  /** The audio context, or null where the Web Audio API is missing. Called only when a sound will play. */
  getContext(): AudioContext | null;
  isMuted(): boolean;
  hasGesture(): boolean;
  /** Milliseconds, for the repeat window. */
  now(): number;
  synth(ctx: AudioContext, name: SoundName): void;
}

/** Returns `play`, which reports whether the sound was started. */
export function createSoundPlayer(deps: SoundPlayerDeps): (name: SoundName) => boolean {
  const lastPlayed = new Map<SoundName, number>();
  return (name) => {
    if (deps.isMuted() || !deps.hasGesture()) return false;
    const now = deps.now();
    const last = lastPlayed.get(name);
    if (last !== undefined && now - last < REPEAT_WINDOW_MS) return false;
    const ctx = deps.getContext();
    if (ctx === null) return false;
    lastPlayed.set(name, now);
    deps.synth(ctx, name);
    return true;
  };
}

type AudioContextConstructor = new () => AudioContext;

function audioContextConstructor(): AudioContextConstructor | null {
  if (typeof window === "undefined") return null;
  // Safari before 14.1 only has the prefixed name.
  const prefixed = (window as unknown as { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext;
  return window.AudioContext ?? prefixed ?? null;
}

let context: AudioContext | null = null;

/** The page's one audio context, shared by the effects and the music (sound/music.ts). */
export function browserContext(): AudioContext | null {
  if (context === null) {
    const Constructor = audioContextConstructor();
    if (Constructor === null) return null;
    try {
      context = new Constructor();
    } catch {
      // Some browsers refuse a context when too many exist; the game stays silent.
      return null;
    }
  }
  // A context made before a gesture starts suspended; resuming is safe to repeat.
  if (context.state === "suspended") void context.resume();
  return context;
}

let gestured = false;
if (typeof window !== "undefined") {
  const mark = () => {
    gestured = true;
  };
  for (const type of ["pointerdown", "keydown", "touchstart"] as const) {
    window.addEventListener(type, mark, { capture: true, once: true, passive: true });
  }
}

/** Whether the person has touched the page or pressed a key, so the browser lets sound start. */
export function browserHasGesture(): boolean {
  if (gestured) return true;
  return typeof navigator !== "undefined" && navigator.userActivation?.hasBeenActive === true;
}

/** Plays a sound effect. Safe to call anywhere: it does nothing when it should not play. */
export const playSound: (name: SoundName) => boolean = createSoundPlayer({
  getContext: browserContext,
  isMuted: () => !soundSettings.get().effects,
  hasGesture: browserHasGesture,
  now: () => performance.now(),
  synth: (ctx, name) => SYNTHS[name](ctx, ctx.currentTime),
});
