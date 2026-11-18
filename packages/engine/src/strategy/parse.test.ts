import { describe, expect, test } from "bun:test";
import { PRESETS } from "./presets.ts";
import { parseStrategy } from "./parse.ts";
import { LIMITS } from "./limits.ts";
import { STRATEGY_ISSUE_CODES } from "./parse.ts";
import type { IssuePath, StrategyIssue, StrategyIssueCode } from "./parse.ts";

const validRule = {
  id: "r1",
  match: "all",
  conditions: [{ condition: "enemyAhead", params: { n: 2 }, negate: false }],
  action: { action: "throw", params: {} },
  chance: 100,
  switchToMode: null,
};

function strategyWith(overrides: Record<string, unknown> = {}, modeOverrides: Record<string, unknown> = {}) {
  return {
    modes: [{ id: "m1", name: "Main", rules: [validRule], fallback: { action: "goForward", params: {} }, ...modeOverrides }],
    build: { reach: 1, aim: 1, dodge: 1 },
    ultimate: "dash",
    ...overrides,
  };
}

function errorsOf(input: unknown): readonly string[] {
  const result = parseStrategy(input);
  if (result.ok) throw new Error("expected the strategy to be rejected");
  return result.errors;
}

function ruleWith(overrides: Record<string, unknown>) {
  return strategyWith({}, { rules: [{ ...validRule, ...overrides }] });
}

describe("parseStrategy accepts", () => {
  test("every preset, after a JSON round trip as a browser would send it", () => {
    expect(PRESETS.length).toBeGreaterThanOrEqual(6);
    for (const preset of PRESETS) {
      const result = parseStrategy(JSON.parse(JSON.stringify(preset.strategy)));
      expect(result.ok).toBe(true);
    }
  });

  test("a minimal strategy, and returns a copy without unknown fields", () => {
    const input = strategyWith(
      { extra: 1 },
      { secret: "x", rules: [{ ...validRule, note: "hi", conditions: [{ ...validRule.conditions[0], junk: 1, params: { n: 2, other: 5 } }] }] },
    );
    const result = parseStrategy(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(JSON.stringify(result.strategy)).not.toMatch(/extra|secret|note|junk|other/);
    expect(result.strategy).not.toBe(input);
    expect(result.strategy.ultimate).toBe("dash");
    expect(result.strategy.modes[0]?.rules[0]?.conditions[0]?.params).toEqual({ n: 2 });
  });

  test("a rule that switches to a mode listed later", () => {
    const input = {
      modes: [
        { id: "a", name: "A", rules: [{ ...validRule, switchToMode: "b" }], fallback: { action: "throw", params: {} } },
        { id: "b", name: "B", rules: [], fallback: { action: "throw", params: {} } },
      ],
      build: { reach: 0, aim: 0, dodge: 0 },
      ultimate: "dash",
    };
    expect(parseStrategy(input).ok).toBe(true);
  });

  test("a name with spaces around it, stored trimmed", () => {
    const result = parseStrategy(strategyWith({}, { name: "  Main  " }));
    expect(result.ok && result.strategy.modes[0]?.name).toBe("Main");
  });
});

describe("parseStrategy rejects, with a message", () => {
  test.each([[null], [undefined], [5], ["text"], [[]], [true]])("an input that is not an object: %p", (input) => {
    const errors = errorsOf(input);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("must be an object");
  });

  test("a missing ultimate is the only issue in an otherwise valid strategy", () => {
    const { ultimate: _ultimate, ...legacy } = strategyWith();
    expect(issuesOf(legacy)).toEqual([{ path: ["ultimate"], code: "unknownUltimate", params: {} }]);
  });

  test("an unknown condition id", () => {
    const errors = errorsOf(ruleWith({ conditions: [{ condition: "nope", params: {}, negate: false }] }));
    expect(errors.join("\n")).toContain('the condition "nope" does not exist');
    expect(errors.join("\n")).toContain('Mode 1 ("Main"), rule 1, condition 1');
  });

  test("an id that exists on Object.prototype", () => {
    const errors = errorsOf(ruleWith({ conditions: [{ condition: "constructor", params: {}, negate: false }] }));
    expect(errors.join("\n")).toContain("does not exist");
    expect(errorsOf(ruleWith({ action: { action: "__proto__", params: {} } })).join("\n")).toContain("does not exist");
  });

  test("an unknown action id", () => {
    expect(errorsOf(ruleWith({ action: { action: "fly", params: {} } })).join("\n")).toContain('the action "fly" does not exist');
  });

  test.each([0, 6, 2.5, "3"])("a parameter out of range or of the wrong type: %p", (value) => {
    const errors = errorsOf(ruleWith({ conditions: [{ condition: "enemyAhead", params: { n: value }, negate: false }] }));
    expect(errors.join("\n")).toContain("must be a whole number from 1 to 5");
  });

  test("a missing parameter, a bad choice and a bad target", () => {
    const missing = errorsOf(ruleWith({ conditions: [{ condition: "enemyAhead", params: {}, negate: false }] }));
    expect(missing.join("\n")).toContain("is missing");
    const badChoice = errorsOf(ruleWith({ conditions: [{ condition: "modeTime", params: { compare: "X", n: 5 }, negate: false }] }));
    expect(badChoice.join("\n")).toContain("must be one of: at least, fewer than");
    const badTarget = errorsOf(ruleWith({ action: { action: "moveToward", params: { target: "everyone" } } }));
    expect(badTarget.join("\n")).toContain("must be one of: the nearest bot");
  });

  test("a build over budget", () => {
    const errors = errorsOf(strategyWith({ build: { reach: 2, aim: 3, dodge: 1 } }));
    expect(errors.join("\n")).toContain("the build costs 8 points and the budget is 6");
  });

  test("a build with a missing attribute, an extra attribute or a level out of range", () => {
    expect(errorsOf(strategyWith({ build: { reach: 1, aim: 1 } })).join("\n")).toContain("Dodge must be a whole number from 0 to 3");
    expect(errorsOf(strategyWith({ build: { reach: 1, aim: 1, dodge: 1, speed: 1 } })).join("\n")).toContain('"speed" is not an attribute');
    expect(errorsOf(strategyWith({ build: { reach: 1, aim: 1, dodge: 1, power: 1 } })).join("\n")).toContain('"power" is not an attribute');
    expect(errorsOf(strategyWith({ build: { reach: 3, aim: 0, dodge: 0 } })).join("\n")).toContain("Reach must be a whole number from 0 to 2");
    expect(errorsOf(strategyWith({ build: { reach: 1.5, aim: 0, dodge: 0 } })).join("\n")).toContain("Reach must be a whole number");
    expect(errorsOf(strategyWith({ build: null })).join("\n")).toContain("the build must give a level");
  });

  test("a switchToMode to a missing mode", () => {
    const errors = errorsOf(ruleWith({ switchToMode: "ghost" }));
    expect(errors.join("\n")).toContain("the mode to switch to does not exist");
    expect(errorsOf(ruleWith({ switchToMode: undefined })).join("\n")).toContain("the mode to switch to does not exist");
  });

  test("a chance that is not a whole number from 1 to 100", () => {
    for (const chance of [0, 101, 50.5, "50"]) {
      expect(errorsOf(ruleWith({ chance })).join("\n")).toContain("the chance must be a whole number from 1 to 100");
    }
    expect(parseStrategy(ruleWith({ chance: 1 })).ok).toBe(true);
  });

  test("a match other than all or any, and a negate that is not a boolean", () => {
    expect(errorsOf(ruleWith({ match: "some" })).join("\n")).toContain('must match "all" or "any"');
    const bad = [{ condition: "enemyInRange", params: {}, negate: "yes" }];
    expect(errorsOf(ruleWith({ conditions: bad })).join("\n")).toContain("switch must be on or off");
  });

  test("the wrong number of modes", () => {
    expect(errorsOf(strategyWith({ modes: [] })).join("\n")).toContain("needs 1 to 6 modes");
    const seven = Array.from({ length: LIMITS.maxModes + 1 }, (_, i) => ({
      id: `m${i}`,
      name: `Mode ${i}`,
      rules: [],
      fallback: { action: "throw", params: {} },
    }));
    expect(errorsOf(strategyWith({ modes: seven })).join("\n")).toContain("this one has 7");
    expect(errorsOf(strategyWith({ modes: "none" })).join("\n")).toContain("needs 1 to 6 modes");
  });

  test("duplicate mode ids and duplicate rule ids", () => {
    const mode = { id: "same", name: "A", rules: [], fallback: { action: "throw", params: {} } };
    expect(errorsOf(strategyWith({ modes: [mode, mode] })).join("\n")).toContain('another mode already uses the id "same"');
    expect(errorsOf(strategyWith({}, { rules: [validRule, validRule] })).join("\n")).toContain('another rule in this mode already uses the id "r1"');
  });

  test("an empty, blank or too long mode name", () => {
    for (const name of ["", "   ", "x".repeat(LIMITS.maxNameLength + 1), 5]) {
      expect(errorsOf(strategyWith({}, { name })).join("\n")).toContain("the name must have 1 to 30 characters");
    }
    expect(parseStrategy(strategyWith({}, { name: "x".repeat(LIMITS.maxNameLength) })).ok).toBe(true);
  });

  test("too many rules, too few conditions and too many conditions", () => {
    const rules = Array.from({ length: LIMITS.maxRulesPerMode + 1 }, (_, i) => ({ ...validRule, id: `r${i}` }));
    expect(errorsOf(strategyWith({}, { rules })).join("\n")).toContain("at most 20 rules");
    expect(errorsOf(ruleWith({ conditions: [] })).join("\n")).toContain("needs 1 to 4 conditions, and this one has 0");
    const five = Array.from({ length: 5 }, () => validRule.conditions[0]);
    expect(errorsOf(ruleWith({ conditions: five })).join("\n")).toContain("this one has 5");
  });

  test("a missing fallback action", () => {
    expect(errorsOf(strategyWith({}, { fallback: undefined })).join("\n")).toContain("fallback action: the action must be an object");
  });

  test("an id that is empty or too long", () => {
    expect(errorsOf(ruleWith({ id: "" })).join("\n")).toContain("rule id must be text");
    expect(errorsOf(strategyWith({}, { id: "x".repeat(LIMITS.maxIdLength + 1) })).join("\n")).toContain("mode id must be text");
  });

  test("reports every problem in one pass", () => {
    const errors = errorsOf({
      modes: [{ id: "m", name: "", rules: [{ ...validRule, chance: 0, switchToMode: "ghost" }], fallback: null }],
      build: { reach: 9, aim: 0, dodge: 0 },
      ultimate: "dash",
    });
    expect(errors.length).toBeGreaterThanOrEqual(5);
  });
});

// ---------------------------------------------------------------------------
// Structured issues: an interface reads these instead of the sentences.
// ---------------------------------------------------------------------------

function issuesOf(input: unknown): readonly StrategyIssue[] {
  const result = parseStrategy(input);
  if (result.ok) throw new Error("expected the strategy to be rejected");
  expect(result.issues).toHaveLength(result.errors.length);
  return result.issues;
}

function issueWith(input: unknown, code: StrategyIssueCode): StrategyIssue {
  const found = issuesOf(input).find((issue) => issue.code === code);
  if (found === undefined) throw new Error(`no issue with the code ${code}`);
  return found;
}

const RULE = ["modes", 0, "rules", 0] as const;
const CONDITION = [...RULE, "conditions", 0] as const;
const mode = (id: string) => ({ id, name: id, rules: [], fallback: { action: "throw", params: {} } });

/** One input per code, with the path and the params the issue must carry. */
const STEP = { action: "stepForward", params: {} };

const CASES: Record<StrategyIssueCode, { readonly input: unknown; readonly path: IssuePath; readonly params: unknown }> = {
  notAnObject: { input: ruleWith({ conditions: [5] }), path: CONDITION, params: { part: "condition" } },
  paramsMissing: {
    input: ruleWith({ conditions: [{ condition: "enemyAhead", negate: false }] }),
    path: [...CONDITION, "params"],
    params: {},
  },
  paramMissing: {
    input: ruleWith({ conditions: [{ condition: "enemyAhead", params: {}, negate: false }] }),
    path: [...CONDITION, "params", "n"],
    params: { key: "n" },
  },
  paramOutOfRange: {
    input: ruleWith({ conditions: [{ condition: "enemyAhead", params: { n: 0 }, negate: false }] }),
    path: [...CONDITION, "params", "n"],
    params: { key: "n", min: 1, max: 5 },
  },
  paramNotAnOption: {
    input: ruleWith({ action: { action: "moveToward", params: { target: "everyone" } } }),
    path: [...RULE, "action", "params", "target"],
    params: { key: "target" },
  },
  unknownCondition: {
    input: ruleWith({ conditions: [{ condition: "nope", params: {}, negate: false }] }),
    path: [...CONDITION, "condition"],
    params: {},
  },
  unknownUltimate: { input: strategyWith({ ultimate: "fly" }), path: ["ultimate"], params: {} },
  unknownAction: { input: ruleWith({ action: { action: "fly", params: {} } }), path: [...RULE, "action", "action"], params: {} },
  stepCount: { input: ruleWith({ action: { steps: Array(5).fill(STEP) } }), path: [...RULE, "action", "steps"], params: { min: 2, max: 4, actual: 5 } },
  notAStep: {
    input: ruleWith({ action: { steps: [STEP, { action: "moveToward", params: { target: "nearest" } }] } }),
    path: [...RULE, "action", "steps", 1, "action"],
    params: {},
  },
  negateNotSwitch: {
    input: ruleWith({ conditions: [{ condition: "enemyInRange", params: {}, negate: "yes" }] }),
    path: [...CONDITION, "negate"],
    params: {},
  },
  badId: { input: ruleWith({ id: "" }), path: [...RULE, "id"], params: { part: "rule", maxLength: LIMITS.maxIdLength } },
  conditionCount: { input: ruleWith({ conditions: [] }), path: [...RULE, "conditions"], params: { min: 1, max: 4, actual: 0 } },
  duplicateRuleId: { input: strategyWith({}, { rules: [validRule, validRule] }), path: ["modes", 0, "rules", 1, "id"], params: {} },
  matchInvalid: { input: ruleWith({ match: "some" }), path: [...RULE, "match"], params: {} },
  chanceOutOfRange: { input: ruleWith({ chance: 0 }), path: [...RULE, "chance"], params: { min: 1, max: 100 } },
  switchTargetMissing: { input: ruleWith({ switchToMode: "ghost" }), path: [...RULE, "switchToMode"], params: {} },
  nameLength: { input: strategyWith({}, { name: "  " }), path: ["modes", 0, "name"], params: { max: LIMITS.maxNameLength } },
  rulesNotList: { input: strategyWith({}, { rules: "none" }), path: ["modes", 0, "rules"], params: {} },
  tooManyRules: {
    input: strategyWith({}, { rules: Array.from({ length: 21 }, (_, i) => ({ ...validRule, id: `r${i}` })) }),
    path: ["modes", 0, "rules"],
    params: { max: 20, actual: 21 },
  },
  duplicateModeId: { input: strategyWith({ modes: [mode("same"), mode("same")] }), path: ["modes", 1, "id"], params: {} },
  modeCount: { input: strategyWith({ modes: [] }), path: ["modes"], params: { min: 1, max: 6, actual: 0 } },
  buildMissing: { input: strategyWith({ build: null }), path: ["build"], params: {} },
  unknownAttribute: { input: strategyWith({ build: { reach: 0, aim: 0, dodge: 0, speed: 1 } }), path: ["build", "speed"], params: { key: "speed" } },
  levelOutOfRange: { input: strategyWith({ build: { reach: 3, aim: 0, dodge: 0 } }), path: ["build", "reach"], params: { attribute: "reach", max: 2 } },
  overBudget: { input: strategyWith({ build: { reach: 2, aim: 3, dodge: 1 } }), path: ["build"], params: { cost: 8, budget: 6 } },
};

describe("parseStrategy and a sequence of steps", () => {
  const steps = [
    { action: "stepForward", params: {} },
    { action: "turn", params: { way: "left" } },
    { action: "throw", params: {} },
    { action: "wait", params: {} },
  ];

  test("accepts 2 to 4 atomic steps and keeps only the known fields", () => {
    const result = parseStrategy(ruleWith({ action: { steps: steps.map((s) => ({ ...s, extra: 1 })), note: "x" } }));
    if (!result.ok) throw new Error(result.errors.join(" "));
    expect(result.strategy.modes[0]?.rules[0]?.action).toEqual({ steps });
    expect(parseStrategy(ruleWith({ action: { steps: steps.slice(0, 2) } })).ok).toBe(true);
  });

  test("rejects a sequence that is too long, with a sentence that says the limit", () => {
    const errors = errorsOf(ruleWith({ action: { steps: [...steps, STEP] } }));
    expect(errors).toEqual(["Mode 1 (\"Main\"), rule 1, action: a sequence needs 2 to 4 steps, and this one has 5. Remove a step or use one action."]);
  });

  test("rejects a single step and a list that is not a list", () => {
    expect(issueWith(ruleWith({ action: { steps: [STEP] } }), "stepCount").params).toEqual({ min: 2, max: 4, actual: 1 });
    expect(issueWith(ruleWith({ action: { steps: "forward" } }), "stepCount").params).toEqual({ min: 2, max: 4, actual: null });
  });

  test("rejects a shortcut as a step and names the steps that exist", () => {
    const errors = errorsOf(ruleWith({ action: { steps: [STEP, { action: "moveToward", params: { target: "nearest" } }] } }));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("step 2");
    expect(errors[0]).toContain("cannot be a step");
  });

  test("checks a step's parameters as an action's", () => {
    expect(issueWith(ruleWith({ action: { steps: [STEP, { action: "turn", params: { way: "around" } }] } }), "paramNotAnOption").path).toEqual([
      ...RULE,
      "action",
      "steps",
      1,
      "params",
      "way",
    ]);
  });

  test("a fallback stays one action", () => {
    expect(parseStrategy(strategyWith({}, { fallback: { steps } })).ok).toBe(false);
  });
});

describe("parseStrategy issues", () => {
  test("the case table covers every issue code", () => {
    expect(Object.keys(CASES).sort()).toEqual([...STRATEGY_ISSUE_CODES].sort());
  });

  test.each(STRATEGY_ISSUE_CODES.map((code) => [code]))("%s carries its path and params", (code) => {
    const { input, path, params } = CASES[code];
    const issue = issueWith(input, code);
    expect(issue.path).toEqual(path);
    expect(issue.params).toEqual(params as never);
  });

  test("an input that is not an object gives one issue at the root", () => {
    expect(issuesOf(null)).toEqual([{ path: [], code: "notAnObject", params: { part: "strategy" } }]);
  });

  test("issues come in the same order as the sentences, one for each", () => {
    const result = parseStrategy({
      ultimate: "dash",
      modes: [{ id: "m", name: "", rules: [{ ...validRule, chance: 0, switchToMode: "ghost" }], fallback: null }],
      build: { reach: 9, aim: 0, dodge: 0 },
    });
    if (result.ok) throw new Error("expected the strategy to be rejected");
    expect(result.issues.map((issue) => issue.code)).toEqual([
      "nameLength",
      "chanceOutOfRange",
      "switchTargetMissing",
      "notAnObject",
      "levelOutOfRange",
    ]);
    expect(result.errors[0]).toContain("the name must have");
    expect(result.errors[4]).toContain("Reach must be");
  });

  test("a valid strategy has no issues field to read", () => {
    expect("issues" in parseStrategy(strategyWith())).toBe(false);
  });
});
