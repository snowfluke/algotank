import { describe, expect, test } from "bun:test";
import * as engine from "./index.ts";

describe("public interface", () => {
  test("exports the rule set table and its helpers", () => {
    expect(Object.keys(engine.RULE_SETS)).toEqual([...engine.RULE_SET_IDS]);
    expect(engine.STANDARD_RULE_SET_ID).toBe("standard");
    expect(engine.ruleSet("standard")).toBe(engine.RULE_SETS.standard);
    expect(typeof engine.isRuleSetId).toBe("function");
    expect(engine.MAX_WATER_CAPACITY).toBeGreaterThanOrEqual(engine.RULE_SETS.standard.waterCapacity);
    expect(engine.MAX_THROW_RANGE).toBeGreaterThanOrEqual(engine.RULE_SETS.standard.baseRange);
  });

  test("exports the id of every vocabulary entry and preset, in table order", () => {
    expect<readonly string[]>([...engine.CONDITION_IDS]).toEqual(Object.keys(engine.CONDITIONS));
    expect<readonly string[]>([...engine.ACTION_IDS]).toEqual(Object.keys(engine.ACTIONS));
    expect<readonly string[]>([...engine.TARGET_IDS]).toEqual(Object.keys(engine.TARGET_SELECTORS));
    expect<readonly string[]>([...engine.PRESET_IDS]).toEqual(engine.PRESETS.map((preset) => preset.id));
  });

  test("does not export a water number that is the same for every round", () => {
    for (const name of ["WATER_CAPACITY", "WATER_PER_THROW", "WATER_REFILL_PER_TICK"]) {
      expect(name in engine, name).toBe(false);
    }
    expect("gridFillRatio" in engine.RULES).toBe(false);
  });

  test("a round needs a rule set id", () => {
    const strategy = engine.PRESETS[0]?.strategy;
    if (strategy === undefined) throw new Error("test setup");
    const players = [
      { id: "a", strategy },
      { id: "b", strategy },
    ];
    const config = { seed: 1, ticksTotal: 3, survivorsAfterRound: null, players } as unknown as engine.RoundConfig;
    expect(() => engine.createRound(config)).toThrow(/unknown rule set/);
  });
});
