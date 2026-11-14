import { describe, expect, test } from "bun:test";
import { decide } from "./decide.ts";
import { act, bot, contextFor, mode, rule, snapshotOf, strategyOf, stubRng, when } from "./test-helpers.ts";

// "me" at (4,3) facing east. "foe" three cells ahead, so enemyAhead(3) is true and enemyAhead(2) is false.
const snapshot = snapshotOf([bot("me", 4, 3, "E", { modeId: "a" }), bot("foe", 7, 3, "W")]);
const ctx = contextFor(snapshot, "me");

const LEFT = act("turn", { way: "left" });
const RIGHT = act("turn", { way: "right" });

const hasEnemy = when("enemyAhead", { n: 3 });
const noEnemy = when("enemyAhead", { n: 2 });

describe("decide", () => {
  test("runs the first rule whose conditions hold", () => {
    const strategy = strategyOf([
      mode("a", [rule("miss", [noEnemy], LEFT), rule("first", [hasEnemy], act("throw")), rule("second", [hasEnemy], RIGHT)], act("goForward")),
    ]);
    const rng = stubRng();
    expect(decide(ctx, strategy, rng)).toEqual({
      botId: "me",
      modeId: "a",
      ruleId: "first",
      actionId: "throw",
      move: "T",
      nextModeId: "a",
    });
  });

  test("a rule with chance 100 draws no random number", () => {
    const strategy = strategyOf([mode("a", [rule("r", [hasEnemy], act("throw"))], act("goForward"))]);
    const rng = stubRng();
    decide(ctx, strategy, rng);
    expect(rng.calls).toEqual([]);
  });

  test("a rule whose chance roll fails is skipped, and the next rule runs", () => {
    const strategy = strategyOf([
      mode("a", [rule("risky", [hasEnemy], LEFT, { chance: 40 }), rule("sure", [hasEnemy], act("throw"))], act("goForward")),
    ]);
    const rng = stubRng({ chance: [false] });
    const decision = decide(ctx, strategy, rng);
    expect(decision.ruleId).toBe("sure");
    expect(rng.calls).toEqual(["chance:40"]);
  });

  test("a rule whose chance roll succeeds runs", () => {
    const strategy = strategyOf([mode("a", [rule("risky", [hasEnemy], LEFT, { chance: 40 })], act("throw"))]);
    const decision = decide(ctx, strategy, stubRng({ chance: [true] }));
    expect(decision).toMatchObject({ ruleId: "risky", move: "L" });
  });

  test("a rule whose conditions fail does not roll", () => {
    const strategy = strategyOf([mode("a", [rule("risky", [noEnemy], LEFT, { chance: 40 })], act("throw"))]);
    const rng = stubRng();
    decide(ctx, strategy, rng);
    expect(rng.calls).toEqual([]);
  });

  test("draws the chance roll before the draw inside the action", () => {
    const strategy = strategyOf([mode("a", [rule("w", [hasEnemy], act("wander"), { chance: 50 })], act("throw"))]);
    const rng = stubRng({ chance: [true], int: [7] });
    expect(decide(ctx, strategy, rng)).toMatchObject({ ruleId: "w", move: "R45" });
    expect(rng.calls).toEqual(["chance:50", "int:8"]);
  });

  test("negate turns a true condition false and a false one true", () => {
    const negated = strategyOf([mode("a", [rule("r", [{ ...hasEnemy, negate: true }], LEFT)], act("throw"))]);
    expect(decide(ctx, negated, stubRng())).toMatchObject({ ruleId: null, move: "T" });
    const negatedFalse = strategyOf([mode("a", [rule("r", [{ ...noEnemy, negate: true }], LEFT)], act("throw"))]);
    expect(decide(ctx, negatedFalse, stubRng())).toMatchObject({ ruleId: "r", move: "L" });
  });

  test('"all" needs every condition and "any" needs one', () => {
    const conditions = [hasEnemy, noEnemy];
    const all = strategyOf([mode("a", [rule("r", conditions, LEFT)], act("throw"))]);
    expect(decide(ctx, all, stubRng()).ruleId).toBeNull();
    const any = strategyOf([mode("a", [rule("r", conditions, LEFT, { match: "any" })], act("throw"))]);
    expect(decide(ctx, any, stubRng()).ruleId).toBe("r");
    const noneTrue = strategyOf([mode("a", [rule("r", [noEnemy, when("hitWithin", { n: 1 })], LEFT, { match: "any" })], act("throw"))]);
    expect(decide(ctx, noneTrue, stubRng()).ruleId).toBeNull();
  });

  test("runs the fallback with a null rule id when no rule runs", () => {
    const strategy = strategyOf([mode("a", [rule("r", [noEnemy], LEFT)], RIGHT)]);
    expect(decide(ctx, strategy, stubRng())).toEqual({
      botId: "me",
      modeId: "a",
      ruleId: null,
      actionId: "turn",
      move: "R",
      nextModeId: "a",
    });
  });

  test("reports the rule's switchToMode as nextModeId, and keeps the mode otherwise", () => {
    const strategy = strategyOf([
      mode("a", [rule("go", [hasEnemy], act("throw"), { switchToMode: "b" }), rule("stay", [noEnemy], act("throw"))], LEFT),
      mode("b", [], RIGHT),
    ]);
    expect(decide(ctx, strategy, stubRng()).nextModeId).toBe("b");
    // The action of the rule that switches still gives this tick's move.
    expect(decide(ctx, strategy, stubRng()).move).toBe("T");
  });

  test("a failed roll on a switching rule does not switch", () => {
    const strategy = strategyOf([
      mode("a", [rule("go", [hasEnemy], act("throw"), { switchToMode: "b", chance: 10 })], LEFT),
      mode("b", [], RIGHT),
    ]);
    expect(decide(ctx, strategy, stubRng({ chance: [false] }))).toMatchObject({ ruleId: null, nextModeId: "a" });
  });

  test("uses the mode named by the bot's modeId", () => {
    const strategy = strategyOf([mode("a", [], LEFT), mode("b", [], RIGHT)]);
    const inB = contextFor(snapshotOf([bot("me", 4, 3, "E", { modeId: "b" }), bot("foe", 7, 3, "W")]), "me");
    expect(decide(inB, strategy, stubRng())).toMatchObject({ modeId: "b", move: "R" });
  });

  // lastHitMe finds nobody here: "me" was never hit, so "Attack the bot that hit me" cannot act.
  const attackWhoHitMe = act("attack", { target: "lastHitMe" });

  test("a rule whose action cannot act is skipped, and the next rule runs", () => {
    const strategy = strategyOf([mode("a", [rule("stuck", [hasEnemy], attackWhoHitMe), rule("next", [hasEnemy], act("throw"))], LEFT)]);
    expect(decide(ctx, strategy, stubRng())).toMatchObject({ ruleId: "next", actionId: "throw", move: "T" });
  });

  test("a skipped rule does not switch the mode and is not the rule of the decision", () => {
    const strategy = strategyOf([
      mode("a", [rule("stuck", [hasEnemy], attackWhoHitMe, { switchToMode: "b" })], LEFT),
      mode("b", [], RIGHT),
    ]);
    expect(decide(ctx, strategy, stubRng())).toEqual({
      botId: "me",
      modeId: "a",
      ruleId: null,
      actionId: "turn",
      move: "L",
      nextModeId: "a",
    });
  });

  test("a rule that cannot act has still used its chance roll, before the action was asked", () => {
    const strategy = strategyOf([mode("a", [rule("stuck", [hasEnemy], attackWhoHitMe, { chance: 40 }), rule("next", [hasEnemy], act("throw"), { chance: 50 })], LEFT)]);
    const rng = stubRng({ chance: [true, true] });
    expect(decide(ctx, strategy, rng).ruleId).toBe("next");
    expect(rng.calls).toEqual(["chance:40", "chance:50"]);
  });

  test("a rule whose selector finds nobody is skipped, also when it is the only rule", () => {
    const strategy = strategyOf([mode("a", [rule("stuck", [hasEnemy], act("moveToward", { target: "nearestWithMorePoints" }))], LEFT)]);
    expect(decide(ctx, strategy, stubRng())).toMatchObject({ ruleId: null, move: "L" });
  });

  test("a fallback that cannot act throws ahead and keeps the fallback's action id", () => {
    const strategy = strategyOf([mode("a", [], attackWhoHitMe)]);
    expect(decide(ctx, strategy, stubRng())).toEqual({
      botId: "me",
      modeId: "a",
      ruleId: null,
      actionId: "attack",
      move: "T",
      nextModeId: "a",
    });
  });

  test("throws when the bot's mode is not in the strategy", () => {
    const strategy = strategyOf([mode("other", [], LEFT)]);
    expect(() => decide(ctx, strategy, stubRng())).toThrow('mode "a"');
  });
});
