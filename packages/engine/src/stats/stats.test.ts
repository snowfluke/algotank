import { describe, expect, test } from "bun:test";
import { STANDARD_RULE_SET_ID } from "../combat/rule-sets.ts";
import { createOpenRound, joinRound, runRound, stepRound } from "../round/round.ts";
import { PRESETS } from "../strategy/presets.ts";
import type { RoundConfig, Strategy } from "../types.ts";
import { addNumbers, addTurn, EMPTY_STATS, statsNumbers, statsOfRound, statsView, turnsOf } from "./stats.ts";

const preset = (id: string): Strategy => {
  const found = PRESETS.find((p) => p.id === id);
  if (found === undefined) throw new Error(`test setup: no preset ${id}`);
  return found.strategy;
};

// Seed 7, 12 turns, Ambusher "a" against Charger "b". The turns, written out once from the round:
// turn  a: mode/rule/move          b: mode/rule/move        throws                 after
//  0    rest/loaded/L45            charge/-/L45                                    a 1,1  b 1,0
//  1-3  strike/point-blank/T       charge/throw-ahead/T     b hits a, a hits b     a 1,1  b 1,0
//  4    strike/spent/L             charge/throw-ahead/T     b dry                  a 1,1  b 1,0
//  5    rest/dodge/F               charge/throw-ahead/T     b into nothing         a 0,1  b 1,0
//  6    rest/-/L                   charge/-/R45                                    a 0,1  b 1,0
//  7    rest/dodge/F               charge/throw-ahead/T     b hits a               a 0,2  b 1,0
//  8    rest/-/F                   charge/-/F                                      a 0,3  b 0,1
//  9    rest/-/F                   charge/-/L45                                    a 0,4  b 0,1
// 10    rest/loaded/L              charge/throw-ahead/T     b dry                  a 0,4  b 0,1
// 11    strike/-/L                 charge/throw-ahead/T     b hits a               a 0,4  b 0,1
const ROUND: RoundConfig = {
  seed: 7,
  ticksTotal: 12,
  survivorsAfterRound: null,
  ruleSetId: STANDARD_RULE_SET_ID,
  items: false,
  players: [
    { id: "a", strategy: preset("ambusher") },
    { id: "b", strategy: preset("charger") },
  ],
};

describe("tank statistics", () => {
  const { spawn, ticks } = runRound(ROUND);

  test("the numbers of a played round equal the hand count of the table above", () => {
    expect(statsNumbers(statsOfRound(spawn, ticks, "a"))).toEqual({ turns: 12, shots: 3, hits: 3, timesHit: 5, squaresMoved: 4, noRuleTurns: 4 });
    // A dry throw and a throw into nothing are not shots; the diagonal step on turn 8 is one square.
    expect(statsNumbers(statsOfRound(spawn, ticks, "b"))).toEqual({ turns: 12, shots: 5, hits: 5, timesHit: 3, squaresMoved: 1, noRuleTurns: 4 });
  });

  test("each rule's turns are counted in its own mode, in the strategy's order", () => {
    const view = statsView(statsOfRound(spawn, ticks, "a"), preset("ambusher"));
    // Ambusher: mode rest has rules loaded, dodge; mode strike has spent, point-blank.
    expect(view.modes.map((mode) => ({ rules: mode.rules, fallback: mode.fallback }))).toEqual([
      { rules: [2, 2], fallback: 3 },
      { rules: [1, 3], fallback: 1 },
    ]);
    expect(view.modes.map((mode) => mode.name)).toEqual(preset("ambusher").modes.map((mode) => mode.name));
  });

  test("a rule of another strategy is left out of the rows and still counts in the numbers", () => {
    const view = statsView(statsOfRound(spawn, ticks, "a"), preset("charger"));
    expect(view.modes.every((mode) => mode.rules.every((turns) => turns === 0) && mode.fallback === 0)).toBe(true);
    expect(view.turns).toBe(12);
  });

  test("the totals keep one entry per rule, however long the round", () => {
    const long = runRound({ ...ROUND, ticksTotal: 400 });
    const stats = statsOfRound(long.spawn, long.ticks, "a");
    expect(stats.turns).toBe(400);
    // Ambusher has 4 rules and 2 modes, so at most 6 entries.
    expect(stats.uses.length).toBeLessThanOrEqual(6);
  });

  test("a tank that joins an open round counts from its first turn", () => {
    const round = createOpenRound({ seed: 3, ticksTotal: 20, ruleSetId: STANDARD_RULE_SET_ID, boardFor: 8, items: false });
    joinRound(round, { id: "a", strategy: preset("picker") });
    joinRound(round, { id: "b", strategy: preset("charger") });
    let stats = EMPTY_STATS;
    for (let i = 0; i < 5; i++) {
      const before = round.snapshot;
      const turn = turnsOf(before, stepRound(round)).get("a");
      if (turn === undefined) throw new Error("no turn for a");
      stats = addTurn(stats, turn);
    }
    joinRound(round, { id: "c", strategy: preset("evader") });
    const before = round.snapshot;
    const turns = turnsOf(before, stepRound(round));
    expect(turns.get("c")?.squaresMoved).toBeLessThanOrEqual(1);
    expect(stats.turns).toBe(5);
  });

  test("a game's numbers are the sum of its rounds", () => {
    const a = statsNumbers(statsOfRound(spawn, ticks, "a"));
    const b = statsNumbers(statsOfRound(spawn, ticks, "b"));
    expect(addNumbers(a, b)).toEqual({ turns: 24, shots: 8, hits: 8, timesHit: 8, squaresMoved: 5, noRuleTurns: 8 });
  });
});

describe("a pinwheel's spin in the statistics", () => {
  test("a spin turn counts as a turn and as no rule's or fallback's use", () => {
    const spin = { botId: "a", modeId: "m", ruleId: null, actionId: "turn", move: "R" as const, nextModeId: "m", dizzy: true as const, spin: true as const };
    const after = addTurn(EMPTY_STATS, { decision: spin, shot: null, timesHit: 0, squaresMoved: 0 });
    expect(after.turns).toBe(1);
    expect(after.uses).toEqual([]);
  });
});
