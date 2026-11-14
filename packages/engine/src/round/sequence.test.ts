import { describe, expect, test } from "bun:test";
import { STANDARD_RULE_SET_ID } from "../combat/rule-sets.ts";
import { decide } from "../strategy/decide.ts";
import { PRESETS } from "../strategy/presets.ts";
import { continueSequence, type SequenceRule } from "../strategy/sequence.ts";
import { act, bot, contextFor, mode, rule, snapshotOf, strategyOf, stubRng, when } from "../strategy/test-helpers.ts";
import type { Decision, RoundConfig, Strategy, TickResult } from "../types.ts";
import { runRound } from "./round.ts";

// Docs: docs/specs/revamp/76-email-and-sequences.md, S3, and the state machine in strategy/sequence.ts.

/** Holds on every turn: a tank never has less than 0 water. */
const ALWAYS = when("myWater", { compare: "atLeast", n: 0 });
const FORWARD = act("stepForward");
const LEFT = act("turn", { way: "left" });
const RIGHT = act("turn", { way: "right" });
const SHOOT = act("throw");
const WAIT = act("wait");

const waiter: Strategy = strategyOf([mode("main", [], WAIT)]);

function play(strategy: Strategy, ticksTotal: number, seed = 7, extra: RoundConfig["players"] = []) {
  return runRound({
    seed,
    ticksTotal,
    survivorsAfterRound: null,
    ruleSetId: STANDARD_RULE_SET_ID,
    players: [{ id: "me", strategy }, { id: "other", strategy: waiter }, ...extra],
  });
}

function mine(ticks: readonly TickResult[]): Decision[] {
  return ticks.map((tick) => {
    const decision = tick.decisions.find((d) => d.botId === "me");
    if (decision === undefined) throw new Error("no decision");
    return decision;
  });
}

describe("a rule with a sequence of steps", () => {
  test("does its steps in order on the turns after it fires, then reads its rules again", () => {
    const strategy = strategyOf([mode("main", [rule("go", [ALWAYS], { steps: [FORWARD, LEFT, FORWARD] })], WAIT)]);
    const decisions = mine(play(strategy, 6).ticks);
    expect(decisions.map((d) => [d.ruleId, d.actionId, d.move, d.step])).toEqual([
      ["go", "stepForward", "F", { index: 1, count: 3 }],
      ["go", "turn", "L", { index: 2, count: 3 }],
      ["go", "stepForward", "F", { index: 3, count: 3 }],
      ["go", "stepForward", "F", { index: 1, count: 3 }],
      ["go", "turn", "L", { index: 2, count: 3 }],
      ["go", "stepForward", "F", { index: 3, count: 3 }],
    ]);
  });

  test("does not read the rules during the sequence, even when an earlier rule now fits", () => {
    // From turn 2 on, less than 95% of the round is left, so "early" fits; the sequence still finishes first.
    const early = rule("early", [when("timeLeft", { compare: "fewerThan", n: 95 })], WAIT);
    const strategy = strategyOf([mode("main", [early, rule("go", [ALWAYS], { steps: [RIGHT, RIGHT, RIGHT, RIGHT] })], WAIT)]);
    const decisions = mine(play(strategy, 20).ticks);
    expect(decisions.slice(0, 5).map((d) => [d.ruleId, d.step?.index ?? null])).toEqual([
      ["go", 1],
      ["go", 2],
      ["go", 3],
      ["go", 4],
      ["early", null],
    ]);
  });

  test("a running step draws no random number; the firing turn draws only the rule's chance", () => {
    const go = rule("go", [ALWAYS], { steps: [SHOOT, WAIT] }, { chance: 50 });
    const strategy = strategyOf([mode("main", [go], WAIT)]);
    const ctx = contextFor(snapshotOf([bot("me", 4, 3, "E")]), "me");
    const firing = stubRng({ chance: [true] });
    expect(decide(ctx, strategy, firing)).toMatchObject({ ruleId: "go", move: "T", step: { index: 1, count: 2 } });
    expect(firing.calls).toEqual(["chance:50"]);
    const running = stubRng();
    const sequenceRule = strategy.modes[0]?.rules[0] as SequenceRule;
    expect(continueSequence(ctx, { modeId: "main", rule: sequenceRule, next: 1 }, running)).toMatchObject({ actionId: "wait", move: "W", step: { index: 2, count: 2 } });
    expect(running.calls).toEqual([]);
  });

  test("skips a step that cannot happen and goes on with the next one on the next turn", () => {
    // Four steps forward, over and over: the tank reaches a wall, its blocked steps keep it in place, and the count never stops.
    const strategy = strategyOf([mode("main", [rule("go", [ALWAYS], { steps: [FORWARD, FORWARD, FORWARD, FORWARD] })], WAIT)]);
    const { spawn, ticks } = play(strategy, 40);
    const decisions = mine(ticks);
    expect(decisions.map((d) => d.step?.index)).toEqual(decisions.map((_, t) => (t % 4) + 1));
    let blocked = 0;
    let before = spawn.bots.find((b) => b.id === "me");
    for (const tick of ticks) {
      const after = tick.snapshot.bots.find((b) => b.id === "me");
      if (before !== undefined && after !== undefined && before.x === after.x && before.y === after.y) blocked += 1;
      before = after;
    }
    expect(blocked).toBeGreaterThan(0);
  });

  test("a wait step keeps the tank in place, keeps its facing and throws nothing", () => {
    const strategy = strategyOf([mode("main", [rule("go", [ALWAYS], { steps: [WAIT, WAIT] })], WAIT)]);
    const { spawn, ticks } = play(strategy, 5);
    const start = spawn.bots.find((b) => b.id === "me");
    for (const tick of ticks) {
      expect(tick.throws).toEqual([]);
      expect(tick.snapshot.bots.find((b) => b.id === "me")).toMatchObject({ x: start?.x, y: start?.y, direction: start?.direction, lastMove: "W" });
    }
  });

  test("ends early when the round ends", () => {
    const strategy = strategyOf([mode("main", [rule("go", [ALWAYS], { steps: [LEFT, LEFT, LEFT] })], WAIT)]);
    const { ticks, standings } = play(strategy, 4);
    expect(mine(ticks).map((d) => d.step?.index)).toEqual([1, 2, 3, 1]);
    expect(standings).toHaveLength(2);
    // A new round starts by reading the rules, not in the middle of the old sequence.
    expect(mine(play(strategy, 4).ticks)[0]?.step).toEqual({ index: 1, count: 3 });
  });

  test("switches mode after the last step, not when the rule fires", () => {
    const strategy = strategyOf([
      mode("a", [rule("go", [ALWAYS], { steps: [LEFT, LEFT, RIGHT] }, { switchToMode: "b" })], WAIT),
      mode("b", [], WAIT),
    ]);
    const { ticks } = play(strategy, 4);
    expect(mine(ticks).map((d) => [d.modeId, d.ruleId, d.step?.index ?? null, d.nextModeId])).toEqual([
      ["a", "go", 1, "a"],
      ["a", "go", 2, "a"],
      ["a", "go", 3, "b"],
      ["b", null, null, "b"],
    ]);
    expect(ticks[2]?.snapshot.bots.find((b) => b.id === "me")?.modeId).toBe("b");
  });

  test("a replay of the same config is identical", () => {
    const strategy = strategyOf([
      mode("a", [rule("hit", [when("enemyInRange")], SHOOT), rule("go", [ALWAYS], { steps: [FORWARD, RIGHT, FORWARD, SHOOT] }, { chance: 40 })], act("wander")),
    ]);
    const others = PRESETS.map((preset) => ({ id: preset.id, strategy: preset.strategy }));
    const first = play(strategy, 60, 99, others);
    expect(play(strategy, 60, 99, others)).toEqual(first);
    expect(mine(first.ticks).some((d) => d.step !== undefined && d.step.index > 1)).toBe(true);
  });

  test("a decision without a sequence has no step key at all", () => {
    const decisions = mine(play(waiter, 3).ticks);
    for (const decision of decisions) expect("step" in decision).toBe(false);
  });
});
