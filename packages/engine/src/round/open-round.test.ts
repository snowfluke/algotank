import { describe, expect, test } from "bun:test";
import { STANDARD_RULE_SET_ID, ruleSet } from "../combat/rule-sets.ts";
import { PRESETS } from "../strategy/presets.ts";
import { act, mode, rule, strategyOf, when } from "../strategy/test-helpers.ts";
import type { RoundState, Strategy } from "../types.ts";
import { arenaSize } from "./grid.ts";
import { createOpenRound, joinRound, leaveRound, roundHoldings, standings, stepRound } from "./round.ts";

const strategyAt = (i: number): Strategy => (PRESETS[i % PRESETS.length] as (typeof PRESETS)[number]).strategy;
const open = (seed = 7, ticksTotal = 500): RoundState => createOpenRound({ seed, ticksTotal, ruleSetId: STANDARD_RULE_SET_ID, boardFor: 16 });

describe("an open round", () => {
  test("starts with no tank on a board sized for 16 that keeps its size", () => {
    const round = open();
    const size = arenaSize(16, ruleSet(STANDARD_RULE_SET_ID));
    expect(round.snapshot.bots).toEqual([]);
    expect({ width: round.snapshot.width, height: round.snapshot.height }).toEqual(size);
    joinRound(round, { id: "a", strategy: strategyAt(0) });
    joinRound(round, { id: "b", strategy: strategyAt(1) });
    stepRound(round);
    leaveRound(round, "a");
    expect({ width: round.snapshot.width, height: round.snapshot.height }).toEqual(size);
  });

  test("a tank that joins between turns spawns on a free square with full water and plays from the next turn", () => {
    const round = open();
    joinRound(round, { id: "a", strategy: strategyAt(0) });
    joinRound(round, { id: "b", strategy: strategyAt(1) });
    for (let i = 0; i < 10; i++) stepRound(round);
    const placed = joinRound(round, { id: "c", strategy: strategyAt(2) });
    const cells = new Set(round.snapshot.bots.map((b) => `${b.x},${b.y}`));
    expect(cells.size).toBe(3);
    expect(placed.water).toBe(ruleSet(STANDARD_RULE_SET_ID).waterCapacity);
    expect(placed.score).toBe(0);
    const result = stepRound(round);
    expect(result.decisions.map((d) => d.botId)).toEqual(["a", "b", "c"]);
    expect(result.tick).toBe(10);
  });

  test("a tank that resumes its day joins with its points", () => {
    const round = open();
    expect(joinRound(round, { id: "a", strategy: strategyAt(0) }, 12).score).toBe(12);
    expect(() => joinRound(round, { id: "b", strategy: strategyAt(0) }, 1.5)).toThrow();
  });

  test("a tank that leaves is gone from the next turn, its sequence and tie-break included", () => {
    // Holds on every turn: a tank never has less than 0 water.
    const always = when("myWater", { compare: "atLeast", n: 0 });
    const waiter = strategyOf([mode("main", [rule("go", [always], { steps: [act("wait"), act("wait"), act("wait")] })], act("wait"))]);
    const round = open();
    joinRound(round, { id: "a", strategy: waiter });
    joinRound(round, { id: "b", strategy: strategyAt(1) });
    stepRound(round);
    expect(roundHoldings(round).sequences).toBe(1);
    leaveRound(round, "a");
    expect(roundHoldings(round)).toEqual({ tanks: 1, strategies: 1, tieBreaks: 1, sequences: 0 });
    joinRound(round, { id: "c", strategy: strategyAt(2) });
    const result = stepRound(round);
    expect(result.decisions.map((d) => d.botId)).toEqual(["b", "c"]);
    expect(standings(round).map((s) => s.botId).sort()).toEqual(["b", "c"]);
  });

  test("refuses a second tank with the same id and a leave of a tank that is not there", () => {
    const round = open();
    joinRound(round, { id: "a", strategy: strategyAt(0) });
    expect(() => joinRound(round, { id: "a", strategy: strategyAt(0) })).toThrow(/already/);
    expect(() => leaveRound(round, "x")).toThrow(/not in the round/);
  });

  test("the same seed with the same joins and leaves plays the same turns", () => {
    const play = () => {
      const round = open(42);
      joinRound(round, { id: "a", strategy: strategyAt(0) });
      joinRound(round, { id: "b", strategy: strategyAt(3) });
      const log: string[] = [];
      for (let i = 0; i < 60; i++) {
        if (i === 20) joinRound(round, { id: "c", strategy: strategyAt(4) });
        if (i === 40) leaveRound(round, "b");
        log.push(JSON.stringify(stepRound(round)));
      }
      return log;
    };
    expect(play()).toEqual(play());
  });

  test("nothing it holds grows with the turns", () => {
    const round = open(3, 20_000);
    for (let i = 0; i < 16; i++) joinRound(round, { id: `t${i}`, strategy: strategyAt(i) });
    for (let i = 0; i < 500; i++) stepRound(round);
    const early = roundHoldings(round);
    for (let i = 0; i < 5_000; i++) {
      // A quit and a new tank now and then, as in a day of the league.
      if (i % 1000 === 0) {
        leaveRound(round, "t0");
        joinRound(round, { id: "t0", strategy: strategyAt(0) });
      }
      stepRound(round);
    }
    const late = roundHoldings(round);
    expect(late.tanks).toBe(early.tanks);
    expect(late.strategies).toBe(early.strategies);
    expect(late.tieBreaks).toBe(early.tieBreaks);
    expect(late.sequences).toBeLessThanOrEqual(16);
  });
});
