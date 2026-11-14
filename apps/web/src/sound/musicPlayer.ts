// Carries out the music's state machine (musicMachine.ts, where the table is) with the Web
// Audio API. The browser parts come in as `MusicPlayerDeps`, so the tests drive it with a fake
// audio context, a fake download and a manual timer.
//
// The graph: source (looping between the track's loop points) -> fade -> duck -> level -> speakers.
// Each job has its own gain node, so a fade and a duck never overwrite each other's ramps. Fades
// are scheduled on the audio clock, because a hidden tab slows its timers down.

import { isAudible, transition, type MusicEvent, type MusicState } from "./musicMachine.ts";
import { DUCK_GAIN, DUCK_MS, FADE_SECONDS, MUSIC_GAIN, type MusicTrack } from "./musicTracks.ts";

/** The part of AudioContext the music uses. */
export type MusicContext = Pick<AudioContext, "currentTime" | "destination" | "state" | "resume" | "createGain" | "createBufferSource" | "decodeAudioData">;

export interface MusicPlayerDeps {
  readonly track: MusicTrack;
  /** The page's audio context, or null where the Web Audio API is missing. Called only after a gesture. */
  getContext(): MusicContext | null;
  /** The track's bytes. Rejects when the download fails. */
  fetchTrack(url: string): Promise<ArrayBuffer>;
  hasGesture(): boolean;
  isVisible(): boolean;
  /** Runs `run` after `ms` milliseconds and returns a function that cancels it. */
  later(run: () => void, ms: number): () => void;
  /** Reports a failed download or decode; the state says "failed" as well. */
  onError(error: unknown): void;
}

export interface MusicPlayer {
  getState(): MusicState;
  subscribe(onChange: () => void): () => void;
  /** Music on or off for this page: the person's switch, or the big screen's own switch. */
  setEnabled(on: boolean): void;
  /** A tap or a key press anywhere on the page. */
  gesture(): void;
  setVisible(visible: boolean): void;
  /** Lowers the music for DUCK_MS under one of the player's own effect sounds. */
  duck(): void;
}

interface Graph {
  readonly ctx: MusicContext;
  readonly duck: GainNode;
}

interface Voice {
  readonly source: AudioBufferSourceNode;
  readonly fade: GainNode;
  /** Audio-clock time at which the loop's position was 0. */
  readonly origin: number;
}

export function createMusicPlayer(deps: MusicPlayerDeps): MusicPlayer {
  const { track } = deps;
  const loopLength = track.loopEnd - track.loopStart;
  let state: MusicState = "off";
  let buffer: AudioBuffer | null = null;
  let downloading = false;
  let graph: Graph | null = null;
  let voice: Voice | null = null;
  /** Seconds into the loop where the music stopped, so turning it on again continues the tune. */
  let position = 0;
  let cancelDuck: (() => void) | null = null;
  const listeners = new Set<() => void>();

  function send(event: MusicEvent): void {
    const next = transition(state, event);
    if (next === null) return;
    const previous = state;
    state = next;
    if (next === "loading") load();
    if (isAudible(next) && !isAudible(previous)) startVoice();
    if (!isAudible(next) && isAudible(previous)) stopVoice();
    if (next === "ducked") duckDown();
    if (previous === "ducked" && next !== "ducked") duckUp();
    for (const listener of listeners) listener();
  }

  function load(): void {
    if (downloading) return; // a download from before a quick off and on is still running; its result arrives as "loaded"
    const ctx = deps.getContext();
    if (ctx === null) {
      deps.onError(new Error("This browser has no Web Audio API, so the music cannot play."));
      send({ type: "loadFailed" });
      return;
    }
    downloading = true;
    deps
      .fetchTrack(track.url)
      .then((bytes) => ctx.decodeAudioData(bytes))
      .then(
        (decoded) => {
          downloading = false;
          buffer = decoded;
          send({ type: "loaded", visible: deps.isVisible() });
        },
        (error: unknown) => {
          downloading = false;
          deps.onError(error);
          send({ type: "loadFailed" });
        },
      );
  }

  function ensureGraph(ctx: MusicContext): Graph {
    if (graph !== null && graph.ctx === ctx) return graph;
    const level = ctx.createGain();
    level.gain.value = MUSIC_GAIN;
    level.connect(ctx.destination);
    const duck = ctx.createGain();
    duck.connect(level);
    graph = { ctx, duck };
    return graph;
  }

  function startVoice(): void {
    const ctx = deps.getContext();
    if (ctx === null || buffer === null) return; // unreachable: "playing" follows a decode in this context
    if (ctx.state === "suspended") void ctx.resume();
    const { duck } = ensureGraph(ctx);
    const now = ctx.currentTime;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.loopStart = track.loopStart;
    source.loopEnd = track.loopEnd;
    const fade = ctx.createGain();
    fade.gain.setValueAtTime(0, now);
    fade.gain.linearRampToValueAtTime(1, now + FADE_SECONDS);
    source.connect(fade);
    fade.connect(duck);
    source.start(now, track.loopStart + position);
    voice = { source, fade, origin: now - position };
  }

  function stopVoice(): void {
    if (voice === null || graph === null) return;
    const now = graph.ctx.currentTime;
    const { source, fade, origin } = voice;
    fade.gain.cancelScheduledValues(now);
    fade.gain.setValueAtTime(fade.gain.value, now);
    fade.gain.linearRampToValueAtTime(0, now + FADE_SECONDS);
    source.stop(now + FADE_SECONDS + 0.05);
    position = (((now - origin) % loopLength) + loopLength) % loopLength;
    voice = null;
  }

  function duckDown(): void {
    cancelDuck?.();
    cancelDuck = deps.later(() => {
      cancelDuck = null;
      send({ type: "duckEnded" });
    }, DUCK_MS);
    if (graph === null) return;
    const now = graph.ctx.currentTime;
    graph.duck.gain.cancelScheduledValues(now);
    graph.duck.gain.setTargetAtTime(DUCK_GAIN, now, 0.03);
  }

  function duckUp(): void {
    cancelDuck?.();
    cancelDuck = null;
    if (graph === null) return;
    const now = graph.ctx.currentTime;
    graph.duck.gain.cancelScheduledValues(now);
    graph.duck.gain.setTargetAtTime(1, now, 0.15);
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setEnabled(on) {
      if (!on) {
        send({ type: "disable" });
        return;
      }
      send({ type: "enable", gestured: deps.hasGesture(), visible: deps.isVisible(), buffered: buffer !== null });
    },
    gesture() {
      if (state === "off") return;
      send({ type: "gesture", visible: deps.isVisible(), buffered: buffer !== null });
      if (state === "failed") return;
      // A context made before the gesture starts suspended, and iOS may need more than one gesture to resume it.
      const ctx = deps.getContext();
      if (ctx !== null && ctx.state === "suspended") void ctx.resume();
    },
    setVisible(visible) {
      send(visible ? { type: "show" } : { type: "hide" });
    },
    duck() {
      send({ type: "duck" });
    },
  };
}
