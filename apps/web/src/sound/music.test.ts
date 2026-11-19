/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { MUSIC_STATES, transition, type MusicEvent, type MusicState } from "./musicMachine.ts";
import { createMusicPlayer, type MusicContext } from "./musicPlayer.ts";
import { DUCK_GAIN, DUCK_MS, FADE_SECONDS, type MusicTrack } from "./musicTracks.ts";
import { musicLine } from "./SoundControl.tsx";

const TRACK: MusicTrack = { url: "/music/test.mp3", loopStart: 0.5, loopEnd: 100.5 };

/** An AudioParam that keeps the value it was last sent towards, enough to read a fade's target. */
class FakeParam {
  value = 1;
  target = 1;
  setValueAtTime(value: number) {
    this.value = value;
    this.target = value;
    return this;
  }
  linearRampToValueAtTime(value: number) {
    this.target = value;
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
}

function fakeAudio() {
  const sources: FakeSource[] = [];
  const gains: FakeParam[] = [];
  const decoded = { duration: 101 };
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
      const source: FakeSource & { connect(node: unknown): unknown; start(when: number, offset: number): void; stop(when: number): void } = {
        buffer: null,
        loop: false,
        loopStart: 0,
        loopEnd: 0,
        started: null,
        stoppedAt: null,
        connect: (node) => node,
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
    decodeAudioData: async () => decoded,
  };
  return { ctx: ctx as unknown as MusicContext, clock: ctx, sources, gains, decoded };
}

function harness(options: { gestured?: boolean; visible?: boolean; context?: boolean } = {}) {
  const audio = fakeAudio();
  let gestured = options.gestured ?? false;
  let visible = options.visible ?? true;
  const downloads: { resolve(bytes: ArrayBuffer): void; reject(error: Error): void }[] = [];
  const timers: (() => void)[] = [];
  const errors: unknown[] = [];
  const player = createMusicPlayer({
    track: TRACK,
    getContext: () => (options.context === false ? null : audio.ctx),
    fetchTrack: () => new Promise((resolve, reject) => downloads.push({ resolve, reject })),
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
      loading: ["loaded", "loadFailed", "disable"],
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
      { type: "show" },
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
    expect(transition("loading", { type: "loaded", visible: false })).toBe("hidden");
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
});
