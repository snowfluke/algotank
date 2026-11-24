import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import { PLAYOUT_DELAY_MS, PLAYOUT_MAX_QUEUED, type Arrival } from "./playout.ts";
import { startPlayout } from "./playoutRunner.ts";

const TICK_MS = 900;
const turn = (n: number): Arrival<number> => ({ kind: "turn", turn: n, item: n });

describe("the playout runner on the browser's timers", () => {
  beforeEach(() => jest.useFakeTimers({ now: 0 }));
  afterEach(() => jest.useRealTimers());

  test("shows each turn at its slot, and turns that arrive late together in one batch", () => {
    const shown: { at: number; items: number[] }[] = [];
    const runner = startPlayout<number>((due, now) => shown.push({ at: now, items: due.map(({ item }) => item) }));
    runner.receive(turn(0), TICK_MS);
    jest.advanceTimersByTime(TICK_MS);
    runner.receive(turn(1), TICK_MS);
    // Turns 2 to 4 are held back longer than the delay and come together, after all their slots.
    jest.advanceTimersByTime(6 * TICK_MS);
    for (const n of [2, 3, 4]) runner.receive(turn(n), TICK_MS);
    jest.advanceTimersByTime(TICK_MS);
    expect(shown.map(({ items }) => items)).toEqual([[0], [1], [2, 3, 4]]);
    expect(shown.slice(0, 2).map(({ at }) => at)).toEqual([PLAYOUT_DELAY_MS, TICK_MS + PLAYOUT_DELAY_MS]);
    runner.stop();
  });

  test("shows a long queue when a message arrives, without waiting for a timer a hidden tab would hold", () => {
    const shown: number[][] = [];
    const runner = startPlayout<number>((due) => shown.push(due.map(({ item }) => item)));
    runner.receive(turn(0), TICK_MS);
    jest.advanceTimersByTime(PLAYOUT_DELAY_MS);
    // A hidden tab: time passes and turns keep arriving, but no timer runs.
    jest.setSystemTime(100 * TICK_MS);
    for (let n = 1; n <= PLAYOUT_MAX_QUEUED + 1; n += 1) runner.receive(turn(n), TICK_MS);
    expect(shown).toEqual([[0], Array.from({ length: PLAYOUT_MAX_QUEUED + 1 }, (_, i) => i + 1)]);
    runner.stop();
  });

  test("shows nothing after it stops", () => {
    const shown: number[] = [];
    const runner = startPlayout<number>((due) => shown.push(due.length));
    runner.receive(turn(0), TICK_MS);
    runner.stop();
    jest.advanceTimersByTime(10 * TICK_MS);
    expect(shown).toEqual([]);
  });
});
