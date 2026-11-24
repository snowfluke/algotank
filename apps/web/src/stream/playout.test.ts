import { describe, expect, test } from "bun:test";
import { EMPTY_PLAYOUT, PLAYOUT_DELAY_MS, receivePlayout, takeDuePlayout, type Arrival, type Playout } from "./playout.ts";
import { RECORDED_ARRIVALS } from "./playoutTrace.ts";

const TICK_MS = 900;
type Item = { readonly kind: "state" | "tick" | "closed"; readonly turn: number };
const turn = (n: number): Arrival<Item> => ({ kind: "turn", turn: n, item: { kind: "tick", turn: n } });
const message = (kind: "update" | "restart" | "flush", item: Item): Arrival<Item> => ({ kind, item });

/** Plays arrivals through the scheduler on a fake clock, waking at each arrival and at each `nextAt`. */
function replay(arrivals: readonly (readonly [number, "state" | "tick", number])[]): { readonly at: number; readonly items: readonly Item[] }[] {
  const batches: { at: number; items: Item[] }[] = [];
  let playout: Playout<Item> = EMPTY_PLAYOUT;
  let nextAt: number | null = null;
  const take = (now: number) => {
    const result = takeDuePlayout(playout, now);
    playout = result.playout;
    nextAt = result.nextAt;
    if (result.due.length > 0) batches.push({ at: now, items: result.due.map(({ item }) => item) });
  };
  for (const [index, [at, kind, n]] of arrivals.entries()) {
    while (nextAt !== null && nextAt <= at) take(nextAt);
    // The league's first state starts the clock; a later one belongs to the turn before it.
    const arrival = kind === "tick" ? turn(n) : message(index === 0 ? "restart" : "update", { kind, turn: n });
    playout = receivePlayout(playout, arrival, at, TICK_MS);
    take(at);
  }
  while (nextAt !== null) take(nextAt);
  return batches;
}

const shownTicks = (batches: ReturnType<typeof replay>) => batches.flatMap(({ at, items }) => items.filter((i) => i.kind === "tick").map((i) => ({ at, turn: i.turn })));

describe("the league board's playout of a jittery stream", () => {
  const batches = replay(RECORDED_ARRIVALS);
  const ticks = shownTicks(batches);
  const longGapTurn = 53_069;
  const before = ticks.filter(({ turn }) => turn < longGapTurn);
  const spacing = before.slice(1).map((t, i) => t.at - before[i]!.at);

  test("shows every message once, in the order it arrived", () => {
    expect(batches.flatMap(({ items }) => items)).toEqual(RECORDED_ARRIVALS.map(([, kind, turn]) => ({ kind, turn })));
  });

  test("hides the short gaps: turns before the long silence are shown about one turn apart, never in a rush", () => {
    // Apply-on-arrival shows 10 waits over 1.3 s and 9 turns under 0.5 s apart in this stretch.
    expect(spacing.filter((ms) => ms > 1_300)).toEqual([]);
    expect(spacing.slice(4).filter((ms) => ms < 500)).toEqual([]);
  });

  test("ends the 11-second silence with one jump, then plays at the steady pace again", () => {
    // Updates within one screen frame look like one change, so turns shown within 20 ms count as one.
    const changes: { at: number; turns: number[] }[] = [];
    for (const { at, turn } of ticks) {
      const last = changes.at(-1);
      if (last !== undefined && at - last.at <= 20) last.turns.push(turn);
      else changes.push({ at, turns: [turn] });
    }
    const jumps = changes.filter(({ turns }) => turns.length > 2);
    expect(jumps).toHaveLength(1);
    expect(jumps[0]!.turns[0]).toBe(longGapTurn);
    const after = ticks.filter(({ turn }) => turn > longGapTurn + 15);
    const afterSpacing = after.slice(1).map((t, i) => t.at - after[i]!.at);
    expect(afterSpacing.filter((ms) => ms > 1_300 || ms < 500)).toEqual([]);
  });

  test("does not fall further behind the stream after the silence", () => {
    const arrivedAt = new Map(RECORDED_ARRIVALS.filter(([, kind]) => kind === "tick").map(([at, , turn]) => [turn, at]));
    const lag = (part: typeof ticks) => part.map(({ at, turn }) => at - arrivedAt.get(turn)!).sort((a, b) => a - b)[Math.floor(part.length / 2)]!;
    expect(lag(ticks.slice(-40))).toBeLessThanOrEqual(lag(ticks.slice(20, 60)) + 100);
  });
});

describe("the playout's rules", () => {
  const show = (p: Playout<Item>, now: number) => takeDuePlayout(p, now);
  const state = (n: number): Item => ({ kind: "state", turn: n });

  test("a message that is not a turn shows right after the turns queued before it", () => {
    let p = receivePlayout(EMPTY_PLAYOUT, message("restart", state(10)), 0, TICK_MS);
    const first = show(p, 0);
    expect(first.due.map(({ item }) => item)).toEqual([state(10)]);
    p = receivePlayout(first.playout, turn(10), 100, TICK_MS);
    p = receivePlayout(p, message("update", state(11)), 150, TICK_MS);
    expect(show(p, 150).due).toEqual([]);
    const slot = show(p, 150).nextAt!;
    expect(show(p, slot).due.map(({ item }) => item)).toEqual([{ kind: "tick", turn: 10 }, state(11)]);
  });

  test("a turn that arrives after its time shows at once", () => {
    let p = receivePlayout(EMPTY_PLAYOUT, turn(0), 0, TICK_MS);
    p = show(p, 5 * TICK_MS).playout;
    p = receivePlayout(p, turn(1), 6 * TICK_MS, TICK_MS);
    expect(show(p, 6 * TICK_MS).due.map(({ item }) => item)).toEqual([{ kind: "tick", turn: 1 }]);
  });

  test("a restart starts the clock again, so a new round's turn 0 waits the delay, not a whole round", () => {
    let p = receivePlayout(EMPTY_PLAYOUT, turn(0), 0, TICK_MS);
    p = receivePlayout(p, turn(1), TICK_MS, TICK_MS);
    p = show(p, 10 * TICK_MS).playout;
    p = receivePlayout(p, message("restart", state(0)), 20_000, TICK_MS);
    p = receivePlayout(p, turn(0), 25_000, TICK_MS);
    const waiting = show(p, 20_000);
    expect(waiting.due.map(({ item }) => item)).toEqual([state(0)]);
    expect(waiting.nextAt).toBe(25_000 + PLAYOUT_DELAY_MS);
  });

  test("a flush shows at once, with every message still queued before it", () => {
    let p = receivePlayout(EMPTY_PLAYOUT, turn(0), 10, TICK_MS);
    p = receivePlayout(p, message("flush", { kind: "closed", turn: -1 }), 20, TICK_MS);
    expect(show(p, 20).due.map(({ item }) => item.kind)).toEqual(["tick", "closed"]);
  });
});
