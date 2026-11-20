/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { ACTIONS, BUILD_BUDGET, CONDITIONS, DEFAULT_PRESET_ID, LIMITS, PRESETS, parseStrategy } from "@game/engine";
import type { Rule, StrategyInput } from "@game/engine";
import {
  addCondition,
  addMode,
  addRule,
  changeConditionKind,
  deleteMode,
  duplicateRule,
  moveModeToFirst,
  moveRule,
  modeDeletionImpact,
  moveRuleTo,
  newId,
  ruleIdAt,
  actionOf,
  removeCondition,
  renameMode,
  restoreRule,
  deleteRule,
  addStep,
  canAddStep,
  canRemoveStep,
  moveStep,
  removeStep,
  setStep,
  stepsOf,
  toOneAction,
  toSteps,
  switchDoKind,
  EMPTY_DO_STASH,
} from "./edit.ts";
import { canSetLevel, levelOf, pointsLeft, setBuildLevel } from "./build.ts";
import { matchingPreset, sameData } from "@game/engine";

const MODE_NAME = (n: number) => `Mode ${n}`;

function preset(id: string): StrategyInput {
  const found = PRESETS.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`no preset ${id}`);
  return found.strategy;
}

/** The first preset that meets a structural need. The tests follow the preset table and name no preset by id. */
function presetWhere(need: string, fits: (strategy: StrategyInput) => boolean): StrategyInput {
  const found = PRESETS.find((candidate) => fits(candidate.strategy));
  if (found === undefined) throw new Error(`no preset has ${need}`);
  return found.strategy;
}

const DEFAULT_STRATEGY = preset(DEFAULT_PRESET_ID);

/** One mode, so a test can add a second mode that is empty and delete down to the last one. */
const SINGLE_MODE = presetWhere("a single mode", (strategy) => strategy.modes.length === 1);

/** Two modes, where a rule in the first switches to the second. */
const TWO_MODES = presetWhere("two modes and a switch from the first to the second", (strategy) => {
  const [first, second] = strategy.modes;
  return strategy.modes.length === 2 && first !== undefined && second !== undefined && first.rules.some((rule) => rule.switchToMode === second.id);
});

/** Three rules in the first mode, so a rule can move up, move down and be copied from the middle. */
const MANY_RULES = presetWhere("3 rules in its first mode", (strategy) => (strategy.modes[0]?.rules.length ?? 0) >= 3);

function ruleIds(strategy: StrategyInput, modeIndex: number): string[] {
  return (strategy.modes[modeIndex]?.rules ?? []).map((rule) => rule.id);
}

function assertValid(strategy: StrategyInput): void {
  const result = parseStrategy(strategy);
  expect(result.ok ? [] : result.errors).toEqual([]);
}

describe("ids", () => {
  test("newId takes the smallest unused number", () => {
    expect(newId("rule", new Set(["rule-1", "rule-3"]))).toBe("rule-2");
  });
});

describe("rules", () => {
  test("a new rule is valid and has an id no rule uses", () => {
    const start = DEFAULT_STRATEGY;
    const next = addRule(start, start.modes[0]!.id);
    const added = next.modes[0]!.rules.at(-1)!;
    expect(ruleIds(start, 0)).not.toContain(added.id);
    assertValid(next);
  });

  test("addRule stops at the limit", () => {
    let strategy = preset("random-walker");
    const modeId = strategy.modes[0]!.id;
    for (let i = 0; i < LIMITS.maxRulesPerMode + 5; i += 1) strategy = addRule(strategy, modeId);
    expect(strategy.modes[0]!.rules.length).toBe(LIMITS.maxRulesPerMode);
    assertValid(strategy);
  });

  test("moveRule moves one place and ignores the ends", () => {
    const start = MANY_RULES;
    const modeId = start.modes[0]!.id;
    const [first, second] = ruleIds(start, 0);
    const down = moveRule(start, modeId, first!, 1);
    expect(ruleIds(down, 0).slice(0, 2)).toEqual([second!, first!]);
    expect(moveRule(start, modeId, first!, -1)).toEqual(start);
    expect(ruleIds(moveRule(down, modeId, first!, -1), 0)).toEqual(ruleIds(start, 0));
  });

  test("moveRuleTo puts the rule at the position and keeps the others in order", () => {
    const start = MANY_RULES;
    const modeId = start.modes[0]!.id;
    const ids = ruleIds(start, 0);
    const moved = moveRuleTo(start, modeId, ids[0]!, ids.length - 1);
    expect(ruleIds(moved, 0)).toEqual([...ids.slice(1), ids[0]!]);
  });

  test("duplicateRule inserts a copy with a new id after the original", () => {
    const start = MANY_RULES;
    const modeId = start.modes[0]!.id;
    const ids = ruleIds(start, 0);
    const next = duplicateRule(start, modeId, ids[1]!);
    const after = ruleIds(next, 0);
    expect(after.length).toBe(ids.length + 1);
    expect(after[1]).toBe(ids[1]!);
    expect(new Set(after).size).toBe(after.length);
    expect(next.modes[0]!.rules[2]!.action).toEqual(next.modes[0]!.rules[1]!.action);
    assertValid(next);
  });

  test("a rule id is new across modes, not only inside one mode", () => {
    const modeId = TWO_MODES.modes[1]!.id;
    const next = addRule(TWO_MODES, modeId);
    const allIds = next.modes.flatMap((mode) => mode.rules.map((rule) => rule.id));
    const added = next.modes[1]!.rules.at(-1)!.id;
    expect(allIds.filter((id) => id === added).length).toBe(1);
  });
});

describe("conditions", () => {
  const rule: Rule = DEFAULT_STRATEGY.modes[0]!.rules[0]!;

  test("addCondition and removeCondition respect the limits", () => {
    let grown = rule;
    for (let i = 0; i < 10; i += 1) grown = addCondition(grown);
    expect(grown.conditions.length).toBe(LIMITS.maxConditionsPerRule);
    let shrunk = grown;
    for (let i = 0; i < 10; i += 1) shrunk = removeCondition(shrunk, 0);
    expect(shrunk.conditions.length).toBe(LIMITS.minConditionsPerRule);
  });

  test("changing the kind keeps the is-not switch and drops parameters that no longer fit", () => {
    const negated: Rule = { ...rule, conditions: [{ ...rule.conditions[0]!, negate: true }] };
    const changed = changeConditionKind(negated, 0, "nearestEnemyAtMost");
    expect(changed.conditions[0]!.negate).toBe(true);
    expect(changed.conditions[0]!.condition).toBe("nearestEnemyAtMost");
    expect(Object.keys(changed.conditions[0]!.params)).toEqual(["n"]);
  });

  test("changing the kind keeps a parameter with the same key when its value still fits", () => {
    const withN: Rule = { ...rule, conditions: [{ condition: "enemyAhead", params: { n: 7 }, negate: false }] };
    const changed = changeConditionKind(withN, 0, "nearestEnemyAtMost");
    expect(changed.conditions[0]!.params).toEqual({ n: 7 });
  });
});

describe("carried parameters", () => {
  const rule: Rule = DEFAULT_STRATEGY.modes[0]!.rules[0]!;

  test("a value does not carry when the same key means another unit", () => {
    const cells: Rule = { ...rule, conditions: [{ condition: "nearestEnemyAtMost", params: { n: 8 }, negate: false }] };
    // "n" is a number of cells in the first condition and a number of ticks in the second.
    const ticks = changeConditionKind(cells, 0, "modeTime").conditions[0]!;
    expect(ticks.params["n"]).toBe(CONDITIONS["modeTime"]!.params.find((spec) => spec.key === "n")!.default);
    expect(ticks.params["n"]).not.toBe(8);
  });

  test("a target carries between conditions that both have one", () => {
    const withTarget: Rule = {
      ...rule,
      conditions: [{ condition: "targetAimed", params: { target: "highestScore" }, negate: false }],
    };
    const changed = changeConditionKind(withTarget, 0, "targetFacingAway").conditions[0]!;
    expect(changed.params["target"]).toBe("highestScore");
  });

  test("an action keeps a parameter only when its meaning is the same", () => {
    const attack = actionOf("attack", { action: "moveToward", params: { target: "highestScore" } });
    expect(attack.params["target"]).toBe("highestScore");
    const turn = actionOf("turn", { action: "goToPlace", params: { place: "corner" } });
    expect(turn.params["way"]).toBe(ACTIONS["turn"]!.params[0]!.default);
  });
});

describe("modes", () => {
  test("addMode makes a valid empty mode with a new id and name, up to the limit", () => {
    let strategy = DEFAULT_STRATEGY;
    for (let i = 0; i < 10; i += 1) strategy = addMode(strategy, MODE_NAME);
    expect(strategy.modes.length).toBe(LIMITS.maxModes);
    expect(new Set(strategy.modes.map((mode) => mode.id)).size).toBe(LIMITS.maxModes);
    expect(new Set(strategy.modes.map((mode) => mode.name)).size).toBe(LIMITS.maxModes);
    assertValid(strategy);
  });

  test("deleteMode clears every switch to the deleted mode", () => {
    const deleted = TWO_MODES.modes[1]!.id;
    const next = deleteMode(TWO_MODES, deleted);
    expect(next.modes.length).toBe(1);
    const switches = next.modes.flatMap((mode) => mode.rules.map((rule) => rule.switchToMode));
    expect(switches).not.toContain(deleted);
    assertValid(next);
  });

  test("modeDeletionImpact counts the rules that go and the switches that are cleared", () => {
    const target = TWO_MODES.modes[1]!;
    const impact = modeDeletionImpact(TWO_MODES, target.id);
    const switches = TWO_MODES.modes[0]!.rules.filter((rule) => rule.switchToMode === target.id).length;
    expect(impact).toEqual({ rules: target.rules.length, switches });
    expect(switches).toBeGreaterThan(0);
    const emptied = addMode(SINGLE_MODE, MODE_NAME);
    expect(modeDeletionImpact(emptied, emptied.modes[1]!.id)).toEqual({ rules: 0, switches: 0 });
  });

  test("ruleIdAt finds the rule an edit just made", () => {
    const start = MANY_RULES;
    const modeId = start.modes[0]!.id;
    const count = start.modes[0]!.rules.length;
    expect(ruleIdAt(start, modeId, count)).toBeUndefined();
    const next = addRule(start, modeId);
    expect(ruleIdAt(next, modeId, count)).toBe(next.modes[0]!.rules[count]!.id);
  });

  test("deleteMode keeps the last mode", () => {
    const start = SINGLE_MODE;
    expect(deleteMode(start, start.modes[0]!.id)).toBe(start);
  });

  test("moveModeToFirst makes the start mode", () => {
    const second = TWO_MODES.modes[1]!.id;
    const next = moveModeToFirst(TWO_MODES, second);
    expect(next.modes[0]!.id).toBe(second);
    expect(next.modes.length).toBe(2);
  });

  test("renameMode cuts the name at the limit", () => {
    const start = DEFAULT_STRATEGY;
    const next = renameMode(start, start.modes[0]!.id, "x".repeat(LIMITS.maxNameLength + 10));
    expect(next.modes[0]!.name.length).toBe(LIMITS.maxNameLength);
  });
});

describe("build", () => {
  test("a level that passes the budget is refused", () => {
    const start = DEFAULT_STRATEGY;
    expect(pointsLeft(start.build)).toBe(1);
    const reach = levelOf(start.build, "reach");
    expect(canSetLevel(start.build, "reach", reach + 1)).toBe(false);
    expect(setBuildLevel(start, "reach", reach + 1)).toBe(start);
  });

  test("lowering a level frees points for another", () => {
    const start = DEFAULT_STRATEGY;
    const reach = levelOf(start.build, "reach");
    expect(canSetLevel(start.build, "reach", reach + 1)).toBe(false);
    const lowered = setBuildLevel(start, "dodge", 0);
    expect(pointsLeft(lowered.build)).toBeGreaterThan(0);
    expect(canSetLevel(lowered.build, "reach", reach + 1)).toBe(true);
    assertValid(setBuildLevel(lowered, "reach", reach + 1));
  });

  test("a level outside the table is refused", () => {
    const start = preset("random-walker");
    expect(canSetLevel(start.build, "reach", 99)).toBe(false);
    expect(canSetLevel(start.build, "nope", 1)).toBe(false);
  });

  test("a build over budget can still go down, and a missing level counts as 0", () => {
    const over = { ...DEFAULT_STRATEGY, build: { reach: 2, aim: 3, dodge: 3 } };
    expect(pointsLeft(over.build)).toBeLessThan(0);
    expect(canSetLevel(over.build, "dodge", 2)).toBe(true);
    expect(canSetLevel(over.build, "dodge", 3)).toBe(true);
    expect(pointsLeft({})).toBe(BUILD_BUDGET);
  });
});

describe("presets", () => {
  test("sameData ignores key order", () => {
    expect(sameData({ a: 1, b: { c: [1, 2] } }, { b: { c: [1, 2] }, a: 1 })).toBe(true);
    expect(sameData({ a: 1 }, { a: 2 })).toBe(false);
    expect(sameData([1], { 0: 1 })).toBe(false);
  });

  test("a preset does not differ from itself, and an edited preset does", () => {
    const start = DEFAULT_STRATEGY;
    expect(matchingPreset(start)).not.toBeNull();
    expect(matchingPreset(addRule(start, start.modes[0]!.id))).toBeNull();
  });

  test("every edit on every preset keeps the strategy valid", () => {
    for (const { strategy } of PRESETS) {
      const modeId = strategy.modes[0]!.id;
      const firstRule = strategy.modes[0]!.rules[0]?.id;
      let next = addMode(addRule(strategy, modeId), MODE_NAME);
      if (firstRule !== undefined) next = moveRule(duplicateRule(next, modeId, firstRule), modeId, firstRule, 1);
      assertValid(next);
    }
  });
});

describe("restoreRule", () => {
  test("puts a deleted rule back where it was", () => {
    const modeId = DEFAULT_STRATEGY.modes[0]!.id;
    const rule = DEFAULT_STRATEGY.modes[0]!.rules[0]!;
    const deleted = deleteRule(DEFAULT_STRATEGY, modeId, rule.id);
    expect(restoreRule(deleted, modeId, 0, rule)).toEqual(DEFAULT_STRATEGY);
  });

  test("gives the rule a new id when its id was taken in the meantime", () => {
    const modeId = DEFAULT_STRATEGY.modes[0]!.id;
    const rule = { ...DEFAULT_STRATEGY.modes[0]!.rules[0]!, id: "rule-1" };
    const withNew = addRule(DEFAULT_STRATEGY, modeId);
    const restored = restoreRule(withNew, modeId, 0, rule);
    const ids = restored.modes[0]!.rules.map((candidate) => candidate.id);
    expect(new Set(ids).size).toBe(ids.length);
    assertValid(restored);
  });
});

describe("steps in order", () => {
  const base: Rule = {
    id: "r",
    match: "all",
    conditions: [{ condition: "enemyInRange", params: {}, negate: false }],
    action: { action: "throw", params: {} },
    chance: 100,
    switchToMode: null,
  };
  const valid = (rule: Rule) => assertValid({ ultimate: "dash", modes: [{ id: "m", name: "Main", rules: [rule], fallback: { action: "throw", params: {} } }], build: { reach: 0, aim: 0, dodge: 0 } });

  test("switching to steps keeps a step action as step 1 and gives the fewest steps a sequence has", () => {
    const steps = toSteps(base);
    expect(stepsOf(steps)).toEqual([{ action: "throw", params: {} }, { action: "turn", params: { way: "left" } }]);
    expect(stepsOf(steps)).toHaveLength(LIMITS.minStepsPerSequence);
    valid(steps);
    // A shortcut cannot be a step, so step 1 becomes a step forward.
    expect(stepsOf(toSteps({ ...base, action: { action: "moveToward", params: { target: "nearest" } } }))?.[0]).toEqual({ action: "stepForward", params: {} });
  });

  test("switching back keeps step 1 as the one action", () => {
    const steps = setStep(toSteps(base), 0, { action: "wait", params: {} });
    expect(toOneAction(steps).action).toEqual({ action: "wait", params: {} });
  });

  test("adds up to the limit, removes down to the minimum, and every result is valid", () => {
    let rule = toSteps(base);
    while (canAddStep(rule)) rule = addStep(rule);
    expect(stepsOf(rule)).toHaveLength(LIMITS.maxStepsPerSequence);
    expect(addStep(rule)).toBe(rule);
    valid(rule);
    while (canRemoveStep(rule)) rule = removeStep(rule, 0);
    expect(stepsOf(rule)).toHaveLength(LIMITS.minStepsPerSequence);
    expect(removeStep(rule, 0)).toBe(rule);
    valid(rule);
  });

  test("moves a step one place and leaves a step at the end where it is", () => {
    const rule = addStep(toSteps(base));
    const moved = moveStep(rule, 0, 1);
    expect(stepsOf(moved)?.map((s) => s.action)).toEqual(["turn", "throw", "stepForward"]);
    expect(stepsOf(moveStep(rule, 2, 1))).toEqual(stepsOf(rule));
  });
});

describe("switching a rule's Do between one action and steps (switchDoKind)", () => {
  const rule: Rule = { ...DEFAULT_STRATEGY.modes[0]!.rules[0]!, action: actionOf("throw") };

  test("a look at steps and back gives the one action back, and a second look gives the edited steps back", () => {
    const toStepsOnce = switchDoKind(rule, "steps", EMPTY_DO_STASH);
    expect(stepsOf(toStepsOnce.rule)).not.toBeNull();
    const edited = addStep(toStepsOnce.rule);
    const back = switchDoKind(edited, "one", toStepsOnce.stash);
    expect(back.rule.action).toEqual(rule.action);
    const again = switchDoKind(back.rule, "steps", back.stash);
    expect(again.rule.action).toEqual(edited.action);
  });

  test("the kind the rule has already changes nothing", () => {
    expect(switchDoKind(rule, "one", EMPTY_DO_STASH)).toEqual({ rule, stash: EMPTY_DO_STASH });
  });
});
