/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { parseTourState, transition, type TourEvent, type TourState } from "./tourMachine.ts";

const STEPS = 3;
const notStarted: TourState = { kind: "notStarted" };
const running: TourState = { kind: "running", step: 1 };
const waiting: TourState = { kind: "waiting", step: 1 };
const paused: TourState = { kind: "paused", step: 1, occurrence: "game-1" };
const finished: TourState = { kind: "finished" };
const skipped: TourState = { kind: "skipped" };
const STATES = { notStarted, running, waiting, paused, finished, skipped };

const EVENTS: Record<string, TourEvent> = {
  start: { type: "start" },
  next: { type: "next", from: 1 },
  staleNext: { type: "next", from: 0 },
  lose: { type: "lose" },
  find: { type: "find" },
  pause: { type: "pause", occurrence: "game-1" },
  resumeSame: { type: "resume", occurrence: "game-1" },
  resumeNext: { type: "resume", occurrence: "game-2" },
  skip: { type: "skip" },
};

// Every legal transition of the table in tourMachine.ts; every other pair must be refused.
const ALLOWED: Record<string, Record<string, TourState>> = {
  notStarted: { start: { kind: "running", step: 0 } },
  running: { next: { kind: "running", step: 2 }, lose: waiting, pause: paused, skip: skipped },
  waiting: { next: { kind: "running", step: 2 }, find: running, pause: paused, skip: skipped },
  paused: { resumeNext: running, skip: skipped },
  finished: {},
  skipped: {},
};

describe("transition", () => {
  for (const [stateName, state] of Object.entries(STATES)) {
    for (const [eventName, event] of Object.entries(EVENTS)) {
      const expected = ALLOWED[stateName]?.[eventName] ?? null;
      test(`${stateName} + ${eventName} -> ${expected === null ? "refused" : expected.kind}`, () => {
        expect(transition(state, event, STEPS)).toEqual(expected);
      });
    }
  }

  test("Show me around restarts the tour from any state, the ended ones included", () => {
    for (const state of Object.values(STATES)) expect(transition(state, { type: "replay" }, STEPS)).toEqual({ kind: "running", step: 0 });
  });

  test("Next on the last step finishes the tour", () => {
    expect(transition({ kind: "running", step: 2 }, { type: "next", from: 2 }, STEPS)).toEqual({ kind: "finished" });
    expect(transition({ kind: "waiting", step: 2 }, { type: "next", from: 2 }, STEPS)).toEqual({ kind: "finished" });
  });

  test("a paused tour resumes at the step where it stopped, in the next occurrence of its phase only", () => {
    const stopped = transition({ kind: "running", step: 2 }, { type: "pause", occurrence: "lobby:game-3" }, STEPS);
    expect(stopped).toEqual({ kind: "paused", step: 2, occurrence: "lobby:game-3" });
    expect(transition(stopped as TourState, { type: "resume", occurrence: "lobby:game-3" }, STEPS)).toBeNull();
    expect(transition(stopped as TourState, { type: "resume", occurrence: "lobby:game-4" }, STEPS)).toEqual({ kind: "running", step: 2 });
  });
});

describe("parseTourState", () => {
  test("reads back what was stored, and a waiting tour as running", () => {
    expect(parseTourState({ kind: "paused", step: 2, occurrence: "x" }, STEPS)).toEqual({ kind: "paused", step: 2, occurrence: "x" });
    expect(parseTourState({ kind: "waiting", step: 1 }, STEPS)).toEqual({ kind: "running", step: 1 });
    expect(parseTourState({ kind: "finished" }, STEPS)).toEqual(finished);
  });

  test("anything broken or out of range is not started", () => {
    expect(parseTourState(null, STEPS)).toEqual(notStarted);
    expect(parseTourState({ kind: "running", step: 3 }, STEPS)).toEqual(notStarted);
    expect(parseTourState({ kind: "running", step: 1.5 }, STEPS)).toEqual(notStarted);
    expect(parseTourState({ kind: "paused", step: 1 }, STEPS)).toEqual(notStarted);
    expect(parseTourState("finished", STEPS)).toEqual(notStarted);
  });
});
