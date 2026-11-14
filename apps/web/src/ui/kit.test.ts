/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { stepValue } from "./Stepper.tsx";
import { nextTabIndex } from "./Tabs.tsx";
import { startPausableTimer, type Clock } from "./timer.ts";

describe("stepValue", () => {
  test("adds the step and stops at the limits", () => {
    expect(stepValue(2, 1, 0, 5)).toBe(3);
    expect(stepValue(5, 1, 0, 5)).toBe(5);
    expect(stepValue(0, -1, 0, 5)).toBe(0);
  });
});

describe("nextTabIndex", () => {
  test("arrows wrap around, Home and End jump, other keys do nothing", () => {
    expect(nextTabIndex(0, "ArrowRight", 3)).toBe(1);
    expect(nextTabIndex(2, "ArrowRight", 3)).toBe(0);
    expect(nextTabIndex(0, "ArrowLeft", 3)).toBe(2);
    expect(nextTabIndex(1, "Home", 3)).toBe(0);
    expect(nextTabIndex(1, "End", 3)).toBe(2);
    expect(nextTabIndex(1, "Enter", 3)).toBeNull();
    expect(nextTabIndex(0, "ArrowRight", 0)).toBeNull();
  });
});

function fakeClock() {
  let time = 0;
  let pending: { at: number; run: () => void; id: number } | null = null;
  let ids = 0;
  const clock: Clock = {
    now: () => time,
    setTimeout: (run, ms) => {
      pending = { at: time + ms, run, id: ++ids };
      return ids;
    },
    clearTimeout: (handle) => {
      if (pending?.id === handle) pending = null;
    },
  };
  return {
    clock,
    advance(ms: number) {
      time += ms;
      const due = pending;
      if (due !== null && due.at <= time) {
        pending = null;
        due.run();
      }
    },
  };
}

describe("startPausableTimer", () => {
  test("fires after the time when nothing pauses it", () => {
    const c = fakeClock();
    let done = false;
    startPausableTimer(() => (done = true), 6000, c.clock);
    c.advance(5999);
    expect(done).toBe(false);
    c.advance(1);
    expect(done).toBe(true);
  });

  test("a pause holds the remaining time until resume", () => {
    const c = fakeClock();
    let done = false;
    const timer = startPausableTimer(() => (done = true), 6000, c.clock);
    c.advance(4000);
    timer.pause();
    c.advance(60000);
    expect(done).toBe(false);
    timer.resume();
    c.advance(1999);
    expect(done).toBe(false);
    c.advance(1);
    expect(done).toBe(true);
  });

  test("cancel stops it for good", () => {
    const c = fakeClock();
    let done = false;
    const timer = startPausableTimer(() => (done = true), 100, c.clock);
    timer.cancel();
    c.advance(1000);
    expect(done).toBe(false);
  });
});
