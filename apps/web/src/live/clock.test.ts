/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import type { Snapshot } from "@game/engine";
import { formatClock, timeLeftMs } from "./clock.ts";

const snapshot = (tick: number, ticksTotal: number): Snapshot => ({
  width: 5,
  height: 5,
  tick,
  ticksTotal,
  survivorsAfterRound: null,
  ruleSetId: "standard",
  bots: [],
});

describe("clock", () => {
  test("time left is ticks left times tick length", () => {
    expect(timeLeftMs(snapshot(40, 100), 500)).toBe(30_000);
    expect(timeLeftMs(snapshot(100, 100), 500)).toBe(0);
    expect(timeLeftMs(snapshot(120, 100), 500)).toBe(0);
  });

  test("formats minutes and seconds, rounding up", () => {
    expect(formatClock(30_000)).toBe("0:30");
    expect(formatClock(61_000)).toBe("1:01");
    expect(formatClock(100)).toBe("0:01");
    expect(formatClock(0)).toBe("0:00");
  });
});
