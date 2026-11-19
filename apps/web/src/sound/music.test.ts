/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { MUSIC_STATES, transition, type MusicEvent, type MusicState } from "./musicMachine.ts";
import { createMusicPlayer, type MusicContext } from "./musicPlayer.ts";
import { DUCK_GAIN, DUCK_MS, FADE_SECONDS, type MusicTrack } from "./musicTracks.ts";
import { musicLine } from "./SoundControl.tsx";

const TRACK: MusicTrack = { url: "/music/test.mp3", loopStart: 0.5, loopEnd: 100.5 };
const RAIN: MusicTrack = { url: "/music/rain.mp3", loopStart: 0.25, loopEnd: 40.25 };
const DRY: MusicTrack = { url: "/music/dry.mp3", loopStart: 0.5, loopEnd: 60.5 };

/** An AudioParam that keeps the value it was last sent towards, enough to read a fade's target. */
class FakeParam {
  value = 1;
  target = 1;
  rampEndsAt: number | null = null;
  setValueAtTime(value: number) {
    this.value = value;
    this.target = value;
    return this;
  }
  linearRampToValueAtTime(value: number, when: number) {
    this.target = value;
    this.rampEndsAt = when;
    return this;
  }
  setTargetAtTime(value: number) {
    this.target = value;
    return this;
  }
  cancelScheduledValues() {
    return this;
  }
}

interface FakeSource {
  buffer: unknown;
  loop: boolean;
  loopStart: number;
  loopEnd: number;
  started: { when: number; offset: number } | null;
  stoppedAt: number | null;
  fade: FakeParam | null;
}

function fakeAudio() {
  const sources: FakeSource[] = [];
  const gains: FakeParam[] = [];
  const decoded = { duration: 101 };
  const decodes: ArrayBuffer[] = [];
  const ctx = {
    currentTime: 10,
    destination: {},
    state: "running",
    resume: async () => {},
    createGain() {
      const gain = new FakeParam();
      gains.push(gain);
      return { gain, connect: (node: unknown) => node };
    },
    createBufferSource() {
      const source: FakeSource & { connect(node: { gain: FakeParam }): void; start(when: number, offset: number): void; stop(when: number): void } = {
        buffer: null,
        loop: false,
        loopStart: 0,
        loopEnd: 0,
        started: null,
        stoppedAt: null,
        fade: null,
        connect(node) {
          this.fade = node.gain;
        },
        start(when, offset) {
          this.started = { when, offset };
        },
        stop(when) {
          this.stoppedAt = when;
        },
      };
      sources.push(source);
      return source;
    },
    async decodeAudioData(bytes: ArrayBuffer) {
      decodes.push(bytes);
      return decoded;
    },
  };
  return { ctx: ctx as unknown as MusicContext, clock: ctx, sources, gains, decoded, decodes };
}

function harness(options: { gestured?: boolean; visible?: boolean; context?: boolean } = {}) {
  const audio = fakeAudio();
  let gestured = options.gestured ?? false;
  let visible = options.visible ?? true;
  const downloads: { url: string; resolve(bytes: ArrayBuffer): void; reject(error: Error): void }[] = [];
  const timers: (() => void)[] = [];
  const errors: unknown[] = [];
  const player = createMusicPlayer({
    track: TRACK,
    getContext: () => (options.context === false ? null : audio.ctx),
    fetchTrack: (url) => new Promise((resolve, reject) => downloads.push({ url, resolve, reject })),
    hasGesture: () => gestured,
    isVisible: () => visible,
    later: (run) => {
      timers.push(run);
      return () => timers.splice(timers.indexOf(run), 1);
    },
    onError: (error) => errors.push(error),
  });
  return {
    player,
    audio,
    downloads,
    timers,
    errors,
    tap() {
      gestured = true;
      player.gesture();
    },
    setVisible(next: boolean) {
      visible = next;
      player.setVisible(next);
    },
  };
}

/** Lets the download's and the decode's promises settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("music state machine", () => {
  test("rejects every event that no row of the table allows", () => {
    const allowed: Record<MusicState, readonly MusicEvent["type"][]> = {
      off: ["enable"],
      waitingForGesture: ["gesture", "disable"],
      loading: ["loaded", "loadFailed", "hide", "disable"],
      playing: ["duck", "hide", "disable"],
      ducked: ["duck", "duckEnded", "hide", "disable"],
      hidden: ["show", "disable"],
      failed: ["disable"],
    };
    const events: MusicEvent[] = [
      { type: "enable", gestured: true, visible: true, buffered: false },
      { type: "gesture", visible: true, buffered: false },
      { type: "loaded", visible: true },
      { type: "loadFailed" },
      { type: "duck" },
      { type: "duckEnded" },
      { type: "hide" },
      { type: "show", buffered: true },
      { type: "disable" },
    ];
    for (const state of MUSIC_STATES) {
      for (const event of events) {
        const next = transition(state, event);
        expect({ state, event: event.type, allowed: next !== null }).toEqual({ state, event: event.type, allowed: allowed[state].includes(event.type) });
      }
    }
  });

  test("turning music on goes where the facts lead", () => {
    expect(transition("off", { type: "enable", gestured: false, visible: true, buffered: true })).toBe("waitingForGesture");
    expect(transition("off", { type: "enable", gestured: true, visible: true, buffered: false })).toBe("loading");
    expect(transition("off", { type: "enable", gestured: true, visible: true, buffered: true })).toBe("playing");
    expect(transition("off", { type: "enable", gestured: true, visible: false, buffered: true })).toBe("hidden");
    expect(transition("off", { type: "enable", gestured: true, visible: false, buffered: false })).toBe("hidden");
    expect(transition("loading", { type: "loaded", visible: false })).toBe("hidden");
    expect(transition("hidden", { type: "show", buffered: false })).toBe("loading");
  });
});

describe("music player", () => {
  test("waits for the first tap, then downloads, and loops the track between its loop points with a fade in", async () => {
    const h = harness();
    h.player.setEnabled(true);
    expect(h.player.getState()).toBe("waitingForGesture");
    expect(h.downloads).toHaveLength(0);
    h.tap();
    expect(h.player.getState()).toBe("loading");
    h.downloads[0]?.resolve(new ArrayBuffer(8));
    await settle();
    expect(h.player.getState()).toBe("playing");
    const source = h.audio.sources[0];
    expect(source).toMatchObject({ buffer: h.audio.decoded, loop: true, loopStart: 0.5, loopEnd: 100.5, started: { when: 10, offset: 0.5 } });
    expect(h.audio.gains.some((gain) => gain.value === 0 && gain.target === 1)).toBe(true);
  });

  test("a failed download leaves the game silent, says so, and retries after off and on", async () => {
    const h = harness({ gestured: true });
    h.player.setEnabled(true);
    h.downloads[0]?.reject(new Error("404"));
    await settle();
    expect(h.player.getState()).toBe("failed");
    expect(h.errors).toHaveLength(1);
    expect(h.audio.sources).toHaveLength(0);
    expect(musicLine(true, "failed")).toBe("musicFailed");
    expect(musicLine(true, "playing")).toBeUndefined();
    h.player.setEnabled(false);
    h.player.setEnabled(true);
    expect(h.player.getState()).toBe("loading");
    expect(h.downloads).toHaveLength(2);
  });

  test("fails without the Web Audio API", () => {
    const h = harness({ gestured: true, context: false });
    h.player.setEnabled(true);
    expect(h.player.getState()).toBe("failed");
    expect(h.errors).toHaveLength(1);
  });

  test("fades out and stops when the tab is hidden, and continues from there when it shows", async () => {
    const h = harness({ gestured: true });
    h.player.setEnabled(true);
    h.downloads[0]?.resolve(new ArrayBuffer(8));
    await settle();
    h.audio.clock.currentTime = 40;
    h.setVisible(false);
    expect(h.player.getState()).toBe("hidden");
    expect(h.audio.sources[0]?.stoppedAt).toBeCloseTo(40 + FADE_SECONDS + 0.05);
    h.audio.clock.currentTime = 300;
    h.setVisible(true);
    expect(h.player.getState()).toBe("playing");
    // 30 s of music had played, so the new source starts 30 s into the loop.
    expect(h.audio.sources[1]?.started).toEqual({ when: 300, offset: 30.5 });
  });

  test("dips by 6 dB under an own effect for one second, and a second effect restarts the second", async () => {
    const h = harness({ gestured: true });
    h.player.setEnabled(true);
    h.downloads[0]?.resolve(new ArrayBuffer(8));
    await settle();
    h.player.duck();
    expect(h.player.getState()).toBe("ducked");
    expect(h.audio.gains.some((gain) => gain.target === DUCK_GAIN)).toBe(true);
    h.player.duck();
    expect(h.timers).toHaveLength(1);
    h.timers[0]?.();
    expect(h.player.getState()).toBe("playing");
    expect(DUCK_MS).toBe(1000);
  });

  test("a duck while the music is off changes nothing", () => {
    const h = harness();
    h.player.duck();
    expect(h.player.getState()).toBe("off");
    expect(h.timers).toHaveLength(0);
  });

  test("keeps a track that finished loading after music was turned off, so on again plays without a second download", async () => {
    const h = harness({ gestured: true });
    h.player.setEnabled(true);
    h.player.setEnabled(false);
    h.downloads[0]?.resolve(new ArrayBuffer(8));
    await settle();
    expect(h.player.getState()).toBe("off");
    expect(h.audio.sources).toHaveLength(0);
    h.player.setEnabled(true);
    expect(h.player.getState()).toBe("playing");
    expect(h.downloads).toHaveLength(1);
  });

  test("crossfades from the old track to the new loop start and decodes each file once", async () => {
    const h = harness({ gestured: true });
    h.player.setEnabled(true);
    h.downloads[0]?.resolve(new ArrayBuffer(8));
    await settle();
    const old = h.audio.sources[0];
    h.audio.clock.currentTime = 20;
    h.player.setTrack(RAIN);
    expect(old?.fade?.target).toBe(1);
    const rainBytes = new ArrayBuffer(16);
    expect(h.downloads[1]?.url).toBe(RAIN.url);
    h.downloads[1]?.resolve(rainBytes);
    await settle();
    expect(old?.fade).toMatchObject({ value: 1, target: 0, rampEndsAt: 20 + FADE_SECONDS });
    expect(old?.stoppedAt).toBeCloseTo(20 + FADE_SECONDS + 0.05);
    const next = h.audio.sources[1];
    expect(next).toMatchObject({
      loopStart: RAIN.loopStart,
      loopEnd: RAIN.loopEnd,
      started: { when: 20, offset: RAIN.loopStart },
      fade: { value: 0, target: 1, rampEndsAt: 20 + FADE_SECONDS },
    });

    h.audio.clock.currentTime += FADE_SECONDS / 2;
    h.player.duck();
    h.player.setTrack(TRACK);
    await settle();
    expect(next?.fade).toMatchObject({ value: 0.5, target: 0 });
    expect(h.player.getState()).toBe("ducked");
    expect(h.audio.sources[2]?.started?.offset).toBe(TRACK.loopStart);
    h.player.setTrack(RAIN);
    await settle();
    expect(h.audio.sources[3]?.started?.offset).toBe(RAIN.loopStart);
    expect(h.downloads.map(({ url }) => url)).toEqual([TRACK.url, RAIN.url]);
    expect(h.audio.decodes).toHaveLength(2);
  });

  test("a change while off waits for music to turn on", async () => {
    const h = harness({ gestured: true });
    h.player.setTrack(RAIN);
    expect(h.downloads).toHaveLength(0);
    h.player.setEnabled(true);
    expect(h.downloads.map(({ url }) => url)).toEqual([RAIN.url]);
    h.downloads[0]?.resolve(new ArrayBuffer(8));
    await settle();
    expect(h.audio.sources[0]?.started?.offset).toBe(RAIN.loopStart);
  });

  test("a change while hidden waits until the tab shows", async () => {
    const h = harness({ gestured: true });
    h.player.setEnabled(true);
    h.downloads[0]?.resolve(new ArrayBuffer(8));
    await settle();
    h.setVisible(false);
    h.player.setTrack(RAIN);
    expect(h.downloads).toHaveLength(1);
    h.setVisible(true);
    expect(h.player.getState()).toBe("loading");
    h.downloads[1]?.resolve(new ArrayBuffer(8));
    await settle();
    expect(h.audio.sources[1]?.started?.offset).toBe(RAIN.loopStart);
  });

  test("a change during startup selects the latest condition after the pending load", async () => {
    const h = harness({ gestured: true });
    h.player.setEnabled(true);
    h.player.setTrack(DRY);
    h.player.setTrack(RAIN);
    expect(h.downloads.map(({ url }) => url)).toEqual([TRACK.url]);
    h.downloads[0]?.resolve(new ArrayBuffer(8));
    await settle();
    expect(h.audio.sources).toHaveLength(0);
    expect(h.downloads.map(({ url }) => url)).toEqual([TRACK.url, RAIN.url]);
    h.downloads[1]?.resolve(new ArrayBuffer(8));
    await settle();
    expect(h.audio.sources[0]?.started?.offset).toBe(RAIN.loopStart);
  });

  test("an earlier switch settling late cannot replace the desired track", async () => {
    const h = harness({ gestured: true });
    h.player.setEnabled(true);
    h.downloads[0]?.resolve(new ArrayBuffer(8));
    await settle();
    h.player.setTrack(DRY);
    h.player.setTrack(RAIN);
    h.downloads[2]?.resolve(new ArrayBuffer(8));
    await settle();
    h.downloads[1]?.resolve(new ArrayBuffer(8));
    await settle();
    expect(h.audio.sources).toHaveLength(2);
    expect(h.audio.sources[1]?.started?.offset).toBe(RAIN.loopStart);
  });

  test("a failed change reports the error and keeps the current source playing", async () => {
    const h = harness({ gestured: true });
    h.player.setEnabled(true);
    h.downloads[0]?.resolve(new ArrayBuffer(8));
    await settle();
    h.player.setTrack(RAIN);
    const failure = new Error("404");
    h.downloads[1]?.reject(failure);
    await settle();
    expect(h.errors).toEqual([failure]);
    expect(h.player.getState()).toBe("playing");
    expect(h.audio.sources).toHaveLength(1);
    expect(h.audio.sources[0]?.stoppedAt).toBeNull();
    expect(h.audio.sources[0]?.fade?.target).toBe(1);
  });

  test("a failed condition on first start falls back to the default", async () => {
    const h = harness({ gestured: true });
    h.player.setTrack(RAIN);
    h.player.setEnabled(true);
    h.downloads[0]?.reject(new Error("404"));
    await settle();
    expect(h.downloads.map(({ url }) => url)).toEqual([RAIN.url, TRACK.url]);
    h.downloads[1]?.resolve(new ArrayBuffer(8));
    await settle();
    expect(h.errors).toHaveLength(1);
    expect(h.player.getState()).toBe("playing");
    expect(h.audio.sources[0]?.started?.offset).toBe(TRACK.loopStart);
  });
});
