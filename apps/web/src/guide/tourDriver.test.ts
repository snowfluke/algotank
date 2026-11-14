/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { GuideStore } from "./guideStore.ts";
import { advanceEvents, driveEvent, type DriveInput } from "./tourDriver.ts";
import { tourSteps } from "./tours.ts";

const lobbyA = "lobby:game-1";
const lobbyB = "lobby:game-2";
const base: DriveInput = {
  state: { kind: "notStarted" },
  phaseOn: true,
  eligible: true,
  occurrence: lobbyA,
  clock: { kind: "timed", secondsLeft: 30 },
  stepSeconds: 11,
  entering: true,
};

describe("driveEvent", () => {
  test("starts in its phase on an eligible device only", () => {
    expect(driveEvent(base)).toEqual({ type: "start" });
    expect(driveEvent({ ...base, eligible: false })).toBeNull();
    expect(driveEvent({ ...base, phaseOn: false })).toBeNull();
  });

  test("pauses at its step when the phase ends", () => {
    expect(driveEvent({ ...base, state: { kind: "running", step: 1 }, phaseOn: false })).toEqual({ type: "pause", occurrence: lobbyA });
    expect(driveEvent({ ...base, state: { kind: "waiting", step: 1 }, phaseOn: false })).toEqual({ type: "pause", occurrence: lobbyA });
  });

  test("does not start a step that would not end 5 s before the phase does, as after I'm ready", () => {
    const running = { ...base, state: { kind: "running", step: 0 } } as const;
    expect(driveEvent({ ...running, clock: { kind: "timed", secondsLeft: 3 } })).toEqual({ type: "pause", occurrence: lobbyA });
    expect(driveEvent({ ...running, clock: { kind: "timed", secondsLeft: 16 } })).toBeNull();
    // A step already on the screen runs to its end, even while the clock runs down.
    expect(driveEvent({ ...running, entering: false, clock: { kind: "timed", secondsLeft: 6 } })).toBeNull();
  });

  test("an untimed place never pauses for time", () => {
    expect(driveEvent({ ...base, state: { kind: "running", step: 3 }, clock: { kind: "untimed" } })).toBeNull();
  });

  test("resumes in the next occurrence of its phase, not in the one it paused in", () => {
    const paused = { ...base, state: { kind: "paused", step: 2, occurrence: lobbyA } } as const;
    expect(driveEvent(paused)).toBeNull();
    expect(driveEvent({ ...paused, occurrence: lobbyB })).toEqual({ type: "resume", occurrence: lobbyB });
    expect(driveEvent({ ...paused, occurrence: lobbyB, clock: { kind: "timed", secondsLeft: 8 } })).toBeNull();
  });

  test("resumes after the first result made the device a returning one: the flag only guards the start", () => {
    const paused = { ...base, state: { kind: "paused", step: 2, occurrence: lobbyA }, occurrence: lobbyB, eligible: false } as const;
    expect(driveEvent(paused)).toEqual({ type: "resume", occurrence: lobbyB });
  });

  test("waits for the clock before it decides", () => {
    expect(driveEvent({ ...base, state: { kind: "paused", step: 0, occurrence: lobbyA }, occurrence: lobbyB, clock: { kind: "timed", secondsLeft: null } })).toBeNull();
  });
});

describe("advanceEvents", () => {
  const lobby = tourSteps("lobby", { lobbyStart: "public" });

  test("a timed lobby stops after step 2 until the next lobby", () => {
    expect(advanceEvents({ kind: "running", step: 1 }, lobby, { kind: "timed", secondsLeft: 14 }, lobbyA)).toEqual([
      { type: "next", from: 1 },
      { type: "pause", occurrence: lobbyA },
    ]);
    expect(advanceEvents({ kind: "running", step: 0 }, lobby, { kind: "timed", secondsLeft: 20 }, lobbyA)).toEqual([{ type: "next", from: 0 }]);
  });

  test("an untimed lobby goes straight on to step 3", () => {
    expect(advanceEvents({ kind: "running", step: 1 }, lobby, { kind: "untimed" }, lobbyA)).toEqual([{ type: "next", from: 1 }]);
  });

  test("a whole public lobby tour across two lobbies, through the store", () => {
    const store = new GuideStore(null);
    const apply = (events: ReturnType<typeof advanceEvents>) => events.forEach((event) => store.dispatch("lobby", event));
    const clock = { kind: "timed", secondsLeft: 28 } as const;
    store.dispatch("lobby", { type: "start" });
    apply(advanceEvents(store.stateOf("lobby"), lobby, clock, lobbyA));
    apply(advanceEvents(store.stateOf("lobby"), lobby, clock, lobbyA));
    expect(store.stateOf("lobby")).toEqual({ kind: "paused", step: 2, occurrence: lobbyA });
    store.dispatch("lobby", { type: "resume", occurrence: lobbyB });
    apply(advanceEvents(store.stateOf("lobby"), lobby, clock, lobbyB));
    apply(advanceEvents(store.stateOf("lobby"), lobby, clock, lobbyB));
    expect(store.stateOf("lobby")).toEqual({ kind: "finished" });
  });
});
