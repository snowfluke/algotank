// Carries out the music's state machine (musicMachine.ts, where the table is) with the Web
// Audio API. The browser parts come in as `MusicPlayerDeps`, so the tests drive it with a fake
// audio context, a fake download and a manual timer.
//
// Each looping source has its own fade, and all sources feed one duck -> level -> speakers.
// A fade and a duck never overwrite each other's ramps. Fades use the audio clock because a
// hidden tab slows its timers down.

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
  /** Reports a failed track load, even when another track can still play. */
  onError(error: unknown, track: MusicTrack): void;
}

export interface MusicPlayer {
  getState(): MusicState;
  subscribe(onChange: () => void): () => void;
  /** Music on or off for this page: the person's switch, or the big screen's own switch. */
  setEnabled(on: boolean): void;
  /** The track wanted by the current arena condition. */
  setTrack(track: MusicTrack): void;
  /** A tap or a key press anywhere on the page. */
  gesture(): void;
  setVisible(visible: boolean): void;
  /** Lowers the music for DUCK_MS under one of the player's own effect sounds. */
  duck(): void;
  /** The person's level, 0 to 1, on top of MUSIC_GAIN. */
  setVolume(volume: number): void;
}

interface Graph {
  readonly ctx: MusicContext;
  readonly level: GainNode;
  readonly duck: GainNode;
}

interface Voice {
  readonly source: AudioBufferSourceNode;
  readonly fade: GainNode;
  readonly startedAt: number;
}

export function createMusicPlayer(deps: MusicPlayerDeps): MusicPlayer {
  let state: MusicState = "off";
  let wanted = deps.track;
  let current = deps.track;
  const buffers = new Map<string, AudioBuffer>();
  const downloads = new Map<string, Promise<AudioBuffer | undefined>>();
  let startRequest = 0;
  let volume = 1;
  let graph: Graph | null = null;
  let voice: Voice | null = null;
  /** Seconds into the loop where the music stopped, so turning it on again continues the tune. */
  let position = 0;
  let cancelDuck: (() => void) | null = null;
  const listeners = new Set<() => void>();

  function send(event: MusicEvent, track: MusicTrack = wanted): void {
    const next = transition(state, event);
    if (next === null) return;
    const previous = state;
    state = next;
    if (next === "loading") void loadForStart();
    if (isAudible(next) && !isAudible(previous)) startVoice(track);
    if (!isAudible(next) && isAudible(previous)) stopVoice();
    if (next === "ducked") duckDown();
    if (previous === "ducked" && next !== "ducked") duckUp();
    for (const listener of listeners) listener();
  }

  function loadBuffer(ctx: MusicContext, track: MusicTrack): Promise<AudioBuffer | undefined> {
    const { url } = track;
    const buffered = buffers.get(url);
    if (buffered !== undefined) return Promise.resolve(buffered);
    const pending = downloads.get(url);
    if (pending !== undefined) return pending;
    const download = deps.fetchTrack(url)
      .then((bytes) => ctx.decodeAudioData(bytes))
      .then((decoded) => {
        buffers.set(url, decoded);
        return decoded;
      })
      .catch((error: unknown) => {
        deps.onError(error, track);
        return undefined;
      })
      .finally(() => downloads.delete(url));
    downloads.set(url, download);
    return download;
  }

  async function loadForStart(): Promise<void> {
    const request = ++startRequest;
    const ctx = deps.getContext();
    if (ctx === null) {
      deps.onError(new Error("This browser has no Web Audio API, so the music cannot play."), wanted);
      send({ type: "loadFailed" });
      return;
    }
    // A condition can change while a file is loading. Cache that result and start only the
    // latest condition's track, or resume the previous track (standard on the first start).
    const stillLoading = () => state === "loading" && request === startRequest;
    while (stillLoading()) {
      const requested = wanted;
      let track = requested;
      let decoded = await loadBuffer(ctx, track);
      if (!stillLoading()) return;
      if (wanted !== requested) continue;
      if (decoded === undefined && track !== current) {
        track = current;
        decoded = await loadBuffer(ctx, track);
        if (!stillLoading()) return;
        if (wanted !== requested) continue;
      }
      send(decoded === undefined ? { type: "loadFailed" } : { type: "loaded", visible: deps.isVisible() }, track);
      return;
    }
  }

  async function crossfade(track: MusicTrack): Promise<void> {
    if (graph === null || track === current) return;
    const decoded = await loadBuffer(graph.ctx, track);
    if (decoded !== undefined && wanted === track && current !== track && isAudible(state)) startVoice(track);
  }

  function ensureGraph(ctx: MusicContext): Graph {
    if (graph !== null && graph.ctx === ctx) return graph;
    const level = ctx.createGain();
    level.gain.value = MUSIC_GAIN * volume;
    level.connect(ctx.destination);
    const duck = ctx.createGain();
    duck.connect(level);
    graph = { ctx, level, duck };
    return graph;
  }

  function startVoice(track: MusicTrack): void {
    const buffer = buffers.get(track.url);
    const ctx = deps.getContext();
    if (ctx === null || buffer === undefined) return; // "playing" follows a decode in this context
    const now = ctx.currentTime;
    stopVoice(now);
    if (track !== current) {
      current = track;
      position = 0;
    }
    if (ctx.state === "suspended") void ctx.resume();
    const { duck } = ensureGraph(ctx);
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
    source.onended = () => {
      source.disconnect();
      fade.disconnect();
    };
    source.start(now, track.loopStart + position);
    voice = { source, fade, startedAt: now };
  }

  function stopVoice(now = graph?.ctx.currentTime): void {
    if (voice === null || now === undefined) return;
    const { source, fade, startedAt } = voice;
    const elapsed = now - startedAt;
    const end = now + FADE_SECONDS;
    // A second switch can arrive mid-fade. Start from the gain on the audio clock
    // so the retiring sources and the new source together stay at or below full gain.
    fade.gain.cancelScheduledValues(now);
    fade.gain.setValueAtTime(Math.min(1, elapsed / FADE_SECONDS), now);
    fade.gain.linearRampToValueAtTime(0, end);
    source.stop(end + 0.05);
    position = (position + elapsed) % (current.loopEnd - current.loopStart);
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
      send({ type: "enable", gestured: deps.hasGesture(), visible: deps.isVisible(), buffered: buffers.has(wanted.url) });
    },
    setTrack(track) {
      if (wanted === track) return;
      wanted = track;
      if (isAudible(state)) void crossfade(track);
    },
    gesture() {
      if (state === "off") return;
      send({ type: "gesture", visible: deps.isVisible(), buffered: buffers.has(wanted.url) });
      if (state === "failed") return;
      // A context made before the gesture starts suspended, and iOS may need more than one gesture to resume it.
      const ctx = deps.getContext();
      if (ctx !== null && ctx.state === "suspended") void ctx.resume();
    },
    setVisible(visible) {
      send(visible ? { type: "show", buffered: buffers.has(wanted.url) } : { type: "hide" });
    },
    duck() {
      send({ type: "duck" });
    },
    setVolume(next) {
      volume = next;
      if (graph === null) return;
      // A short glide, so dragging the slider does not click.
      graph.level.gain.setTargetAtTime(MUSIC_GAIN * volume, graph.ctx.currentTime, 0.03);
    },
  };
}
